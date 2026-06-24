// Content script injected into lumna.co. Bridges the Focus page and the
// extension background so toggles take effect instantly instead of waiting for
// the ~60s poll, and lets the page detect that the extension is installed.
//
// The page and this script share the page's window for postMessage. We tag
// messages so neither side reacts to its own (page -> 'lumna-focus',
// extension -> 'lumna-focus-ext').
const PAGE_SOURCE = 'lumna-focus';
const EXT_SOURCE = 'lumna-focus-ext';

function announce() {
  window.postMessage({ source: EXT_SOURCE, type: 'present' }, window.location.origin);
}

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.source !== PAGE_SOURCE) return;
  if (d.type === 'sync') {
    // Wake the background and have it re-pull the list now. Fire-and-forget.
    chrome.runtime.sendMessage({ type: 'sync' });
  } else if (d.type === 'ping') {
    announce();
  }
});

// Announce on load too, in case the page is already listening.
announce();
