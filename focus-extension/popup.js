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

load();
