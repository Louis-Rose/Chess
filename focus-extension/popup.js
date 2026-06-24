const tokenEl = document.getElementById('token');
const statusEl = document.getElementById('status');

function renderStatus(s) {
  if (!s) {
    statusEl.textContent = 'Not synced yet.';
    return;
  }
  if (s.error) {
    statusEl.innerHTML = `<span class="err">Couldn't reach the server.</span>`;
    return;
  }
  const when = s.at ? new Date(s.at).toLocaleTimeString() : '';
  const main = s.blocking
    ? `<span class="on">Blocking</span> <span class="on">${s.count} site${s.count === 1 ? '' : 's'}</span>`
    : `<span class="off">Blocking off</span>`;
  statusEl.innerHTML = `${main}<div class="time">${when}</div>`;
}

async function load() {
  const { token, lastStatus } = await chrome.storage.local.get(['token', 'lastStatus']);
  tokenEl.value = token || '';
  renderStatus(lastStatus);
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({ token: tokenEl.value.trim() });
  statusEl.textContent = 'Saved. Syncing…';
  // The background worker re-syncs on storage change; reflect the result shortly.
  setTimeout(async () => {
    const { lastStatus } = await chrome.storage.local.get(['lastStatus']);
    renderStatus(lastStatus);
  }, 1200);
});

// Reload the extension (re-reads code from disk for an unpacked build), so you
// don't have to open chrome://extensions after an update. The popup closes as
// the extension restarts.
document.getElementById('reload').addEventListener('click', () => {
  chrome.runtime.reload();
});

// Show/hide the connection token.
const EYE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
const toggleEl = document.getElementById('toggleToken');
toggleEl.innerHTML = EYE;
toggleEl.addEventListener('click', () => {
  const show = tokenEl.type === 'password';
  tokenEl.type = show ? 'text' : 'password';
  toggleEl.innerHTML = show ? EYE_OFF : EYE;
  toggleEl.setAttribute('aria-label', show ? 'Hide token' : 'Show token');
});

load();
