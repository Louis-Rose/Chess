// LUMNA Focus — background service worker.
//
// Polls the user's Focus block list from lumna.co (using the token they pasted
// in the popup) and, while blocking is on, redirects those sites to the
// extension's "stay focused" page via declarativeNetRequest dynamic rules.

const ALARM = 'lumna-focus-poll';
const POLL_MINUTES = 1;
const API_BASE = 'https://lumna.co';

async function fetchFeed() {
  const { token } = await chrome.storage.local.get(['token']);
  if (!token) return { blocking: false, sites: [] };
  const res = await fetch(`${API_BASE}/api/workblock/feed?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`feed responded ${res.status}`);
  return res.json();
}

// One redirect rule per blocked host. `||host^` matches the domain and its
// subdomains; main_frame only, so we redirect page loads, not sub-resources.
function buildRules(sites) {
  return sites.map((host, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: `/blocked.html?host=${encodeURIComponent(host)}` },
    },
    condition: {
      urlFilter: `||${host}^`,
      resourceTypes: ['main_frame'],
    },
  }));
}

async function sync() {
  let feed;
  try {
    feed = await fetchFeed();
  } catch (e) {
    console.warn('[LUMNA Focus] sync failed:', e);
    await chrome.storage.local.set({ lastStatus: { error: String(e), at: Date.now() } });
    return;
  }

  const sites = (feed.blocking ? feed.sites : []) || [];
  const addRules = buildRules(sites);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });

  // Redirect rules only fire on navigation, so tabs don't move on their own.
  // Turning blocking on: reload tabs already sitting on a blocked site so they
  // get evicted to the "stay focused" page. Turning it off: send any "stay
  // focused" tabs back to the site they came from.
  if (feed.blocking) {
    await evictBlockedTabs(sites);
  } else {
    await reviveBlockedTabs();
  }

  await chrome.storage.local.set({
    lastStatus: { blocking: !!feed.blocking, count: sites.length, at: Date.now() },
  });
}

async function reviveBlockedTabs() {
  const base = chrome.runtime.getURL('blocked.html');
  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch (e) {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tab.url.startsWith(base)) continue;
    let host;
    try {
      host = new URL(tab.url).searchParams.get('host');
    } catch {
      continue;
    }
    // We only captured the host at block time, so revive to the site homepage.
    if (host) chrome.tabs.update(tab.id, { url: `https://${host}` });
  }
}

async function evictBlockedTabs(sites) {
  if (!sites.length) return;
  let tabs;
  try {
    tabs = await chrome.tabs.query({ url: ['*://*/*'] });
  } catch (e) {
    return; // permission/query issue — the next navigation will be caught anyway
  }
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    let host;
    try {
      host = new URL(tab.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    // Match the same way the rules do: the host itself or any subdomain of it.
    if (sites.some((s) => host === s || host.endsWith('.' + s))) {
      chrome.tabs.reload(tab.id);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: POLL_MINUTES });
  sync();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: POLL_MINUTES });
  sync();
});
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) sync();
});
// Re-sync immediately when the user saves a new token / API base.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.token) sync();
});
// Instant sync: the lumna.co content script relays a "sync" the moment the user
// toggles blocking on the Focus page, so off/on take effect without the poll.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'sync') sync();
});
