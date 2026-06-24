// LUMNA Focus — background service worker.
//
// Polls the user's Focus block list from lumna.co (using the token they pasted
// in the popup) and, while blocking is on, blocks those sites with
// declarativeNetRequest block rules. Block rules need no host permission, so the
// extension only needs access to lumna.co (its own API), not to every site.

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

// One block rule per host. `||host^` matches the domain and its subdomains;
// main_frame only, so we block page loads, not sub-resources.
function buildRules(sites) {
  return sites.map((host, i) => ({
    id: i + 1,
    priority: 1,
    action: { type: 'block' },
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

  const allSites = feed.sites || []; // the user's list, regardless of on/off
  const blocking = !!feed.blocking;
  const activeSites = blocking ? allSites : [];

  const addRules = buildRules(activeSites);
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules,
  });

  // Block rules only fire on navigation, so a tab already open on a blocked site
  // wouldn't change on its own. On the on<->off transition, reload tabs whose
  // host is on the list: turning on reloads them into the block, turning off
  // reloads them back to the now-reachable site. Only on the transition (not
  // every poll), so we never reload a tab you're actively using.
  const { lastStatus } = await chrome.storage.local.get(['lastStatus']);
  const prevBlocking = lastStatus ? !!lastStatus.blocking : false;
  if (blocking !== prevBlocking) {
    await reloadMatchingTabs(allSites);
  }

  await chrome.storage.local.set({
    lastStatus: { blocking, count: activeSites.length, at: Date.now() },
  });
}

// Reload every open tab whose host is on `sites`. Reads tab URLs via the `tabs`
// permission, so no host access to those sites is needed.
async function reloadMatchingTabs(sites) {
  if (!sites.length) return;
  let tabs;
  try {
    tabs = await chrome.tabs.query({});
  } catch (e) {
    return;
  }
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    let host;
    try {
      host = new URL(tab.url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
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
// Re-sync immediately when the user saves a new token.
chrome.storage.onChanged.addListener((changes) => {
  if (changes.token) sync();
});
// Instant sync: the lumna.co content script relays a "sync" the moment the user
// toggles blocking on the Focus page, so off/on take effect without the poll.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'sync') sync();
});
