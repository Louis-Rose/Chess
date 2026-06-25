#!/usr/bin/env python3
"""LUMNA clothing agent — worker.

Runs on your own machine (residential IP + real Chrome) and does the browsing
the VM can't: it claims search jobs enqueued by the /clothing page, drives a
real Chrome window to search each store, scrapes the products, and posts the
results back. Bot-protected stores like Octobre work because this is a genuine
browser on your home connection — not a datacenter request.

Usage:
    pip install -r requirements.txt
    playwright install chrome      # one-time
    cp .env.example .env           # then fill it in
    python worker.py

It opens a visible Chrome window. If a store ever shows a bot check, solve it
once in that window; the cookie is kept in ./chrome-profile so later runs sail
through. Leave the worker running whenever you want the /clothing search to work.
"""

import os
import re
import sys
import time

import requests
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get('LUMNA_BASE_URL', 'https://lumna.co').rstrip('/')
SECRET = os.environ.get('CLOTHING_WORKER_SECRET', '')
POLL_SECONDS = float(os.environ.get('CLOTHING_POLL_SECONDS', '3'))
ITEMS_PER_SOURCE = int(os.environ.get('CLOTHING_ITEMS_PER_SOURCE', '8'))
PROFILE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'chrome-profile')

HEADERS = {'X-Worker-Secret': SECRET}


# --- Per-card extraction, run inside the page (returns plain dicts) ----------

# Octobre renders search hits as .c-card tiles: an <a.c-card__link> to the
# product, an <h3> name, a "NN €" price and a product image.
OCTOBRE_EXTRACT_JS = r"""
() => {
  const origin = location.origin;
  const abs = (u) => { try { return new URL(u, origin).href; } catch { return null; } };
  const out = [], seen = new Set();
  for (const card of document.querySelectorAll('.c-card')) {
    const link = card.querySelector('a.c-card__link[href*="/product/"]')
              || card.querySelector('a[href*="/product/"]');
    if (!link) continue;
    const href = abs(link.getAttribute('href'));
    const slug = href && href.includes('/product/') ? href.split('/product/')[1].split(/[/#?]/)[0] : null;
    if (slug && seen.has(slug)) continue;
    if (slug) seen.add(slug);
    const txt = card.textContent.replace(/\s+/g, ' ');
    const priceM = txt.match(/\d[\d .,]*\s*€/);
    const titleEl = card.querySelector('h3, h2, .c-card__title');
    const img = card.querySelector('img');
    out.push({
      name: titleEl ? titleEl.textContent.trim() : txt.split(/\d[\d .,]*\s*€/)[0].trim().slice(0, 80),
      price: priceM ? priceM[0].replace(/\s+/g, ' ').trim() : null,
      url: href,
      image: img ? (img.currentSrc || img.src || null) : null,
      source: location.host,
    });
  }
  return out;
}
"""

# Best-effort generic scrape for stores without a tailored recipe: any link that
# wraps an image and sits near a price.
GENERIC_EXTRACT_JS = r"""
() => {
  const origin = location.origin;
  const abs = (u) => { try { return new URL(u, origin).href; } catch { return null; } };
  const out = [], seen = new Set();
  const priceRe = /\d[\d .,]*\s*(€|\$|£|EUR)/;
  for (const a of document.querySelectorAll('a')) {
    const href = a.getAttribute('href') || '';
    if (!/product|produit|\/p\//i.test(href)) continue;
    const img = a.querySelector('img') || (a.closest('*') && a.closest('article, li, div')?.querySelector('img'));
    if (!img) continue;
    const box = a.closest('article, li, div') || a;
    const txt = box.textContent.replace(/\s+/g, ' ');
    const priceM = txt.match(priceRe);
    const url = abs(href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const name = (a.getAttribute('title') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!name) continue;
    out.push({
      name,
      price: priceM ? priceM[0].replace(/\s+/g, ' ').trim() : null,
      url,
      image: img.currentSrc || img.src || null,
      source: location.host,
    });
    if (out.length >= 30) break;
  }
  return out;
}
"""


def to_query(prompt: str) -> str:
    """Turn a natural-language request into store-search keywords."""
    q = prompt.strip()
    q = re.sub(r'\b(under|less than|below|moins de|max|sous|-)\s*\d+\s*[€$£]?', ' ', q, flags=re.I)
    q = re.sub(r'\d+\s*[€$£]', ' ', q)
    q = re.sub(r'^\s*(a|an|the|un|une|des|du|de la|some)\b', ' ', q, flags=re.I)
    q = re.sub(r'[,.;]+', ' ', q)
    q = re.sub(r'\s+', ' ', q).strip()
    return q or prompt.strip()


class BotWall(Exception):
    """Raised when a store is showing a bot/captcha challenge we can't get past."""


def _maybe_bot_wall(page) -> bool:
    """True if a DataDome/captcha challenge is on screen."""
    html = (page.content() or '').lower()
    return 'captcha-delivery.com' in html or 'datadome' in html or 'enable js' in html


def search_octobre(page, query):
    page.goto('https://www.octobre-editions.com/fr-fr/search',
              wait_until='domcontentloaded', timeout=45000)
    _wait_through_wall(page)
    if _maybe_bot_wall(page):
        raise BotWall('octobre-editions.com')
    page.wait_for_selector('input.search__input', timeout=20000)
    page.fill('input.search__input', query)
    page.keyboard.press('Enter')
    try:
        page.wait_for_selector('.c-card', timeout=20000)
    except Exception:
        return []  # no results for this query
    page.wait_for_timeout(1500)
    return page.evaluate(OCTOBRE_EXTRACT_JS)


def search_generic(page, domain, query):
    from urllib.parse import quote_plus
    for base in (f'https://www.{domain}', f'https://{domain}'):
        try:
            page.goto(f'{base}/search?q={quote_plus(query)}',
                      wait_until='domcontentloaded', timeout=45000)
            _wait_through_wall(page)
            if _maybe_bot_wall(page):
                raise BotWall(domain)
            page.wait_for_timeout(2500)
            items = page.evaluate(GENERIC_EXTRACT_JS)
            if items:
                return items
        except BotWall:
            raise
        except Exception as e:
            print(f'   generic fetch failed for {base}: {e}')
    return []


def _wait_through_wall(page, seconds=60):
    """If a bot check appears, ask the user to solve it once and wait."""
    if not _maybe_bot_wall(page):
        return
    print('   ⚠ a bot check appeared — solve it in the Chrome window (waiting up to 60s)…')
    for _ in range(seconds):
        time.sleep(1)
        if not _maybe_bot_wall(page):
            print('   ✓ cleared')
            return


RECIPES = {'octobre-editions.com': search_octobre}


def run_job(page, job):
    prompt = job['prompt']
    query = to_query(prompt)
    print(f'→ job {job["id"]}: "{prompt}"  (query: "{query}")')
    items = []
    walled = []
    total = len(job['sources'])
    for i, domain in enumerate(job['sources']):
        # Tell the UI which store we're starting so it can show live steps.
        post_progress(job['id'], current=domain, done=i, total=total)
        recipe = RECIPES.get(domain)
        try:
            found = recipe(page, query) if recipe else search_generic(page, domain, query)
        except BotWall:
            print(f'   {domain}: BLOCKED — bot check not cleared')
            walled.append(domain)
            found = []
        except Exception as e:
            print(f'   {domain}: error {e}')
            found = []
        found = [it for it in found if it.get('name')][:ITEMS_PER_SOURCE]
        for it in found:
            it.setdefault('source', domain)
        print(f'   {domain}: {len(found)} items')
        items.extend(found)
    post_progress(job['id'], current=None, done=total, total=total)

    # If we got nothing and at least one store was walled, say so plainly rather
    # than the misleading "no matches" — the user needs to solve it in the window.
    if not items and walled:
        return {'error': f'{", ".join(walled)} is showing a bot check. '
                         'Open the worker’s Chrome window and solve it once, then search again.'}

    n_sites = len(job['sources'])
    summary = (f'Found {len(items)} item(s) across {n_sites} '
               f'{"site" if n_sites == 1 else "sites"} for "{query}".'
               if items else f'No matches found for "{query}".')
    return {'summary': summary, 'items': items}


def post_progress(job_id, current, done, total):
    """Report which store we're on so the /clothing page can show live steps."""
    try:
        requests.post(f'{BASE_URL}/api/clothing/worker/{job_id}/progress',
                      json={'current': current, 'done': done, 'total': total},
                      headers=HEADERS, timeout=15)
    except Exception as e:
        print(f'   failed to post progress: {e}')


def post_result(job_id, payload):
    try:
        requests.post(f'{BASE_URL}/api/clothing/worker/{job_id}/result',
                      json=payload, headers=HEADERS, timeout=30)
    except Exception as e:
        print(f'   failed to post result: {e}')


def main():
    if not SECRET:
        sys.exit('CLOTHING_WORKER_SECRET is not set (see .env.example).')
    print(f'LUMNA clothing worker → {BASE_URL}\nPolling for jobs (Ctrl-C to stop)…')
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE_DIR, channel='chrome', headless=False,
            viewport={'width': 1280, 'height': 900},
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            while True:
                try:
                    r = requests.get(f'{BASE_URL}/api/clothing/worker/next',
                                     headers=HEADERS, timeout=30)
                    job = r.json().get('job') if r.ok else None
                except Exception as e:
                    print(f'poll error: {e}')
                    job = None

                if not job:
                    time.sleep(POLL_SECONDS)
                    continue

                try:
                    result = run_job(page, job)
                    post_result(job['id'], result)
                    if 'error' in result:
                        print(f'   ⚠ {result["error"]}')
                    else:
                        print(f'   ✓ delivered {len(result["items"])} items')
                except Exception as e:
                    print(f'   job failed: {e}')
                    post_result(job['id'], {'error': str(e)[:300]})
        except KeyboardInterrupt:
            print('\nStopping.')
        finally:
            ctx.close()


if __name__ == '__main__':
    main()
