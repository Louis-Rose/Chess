const tokenEl = document.getElementById('token');
const apiEl = document.getElementById('apiBase');
const statusEl = document.getElementById('status');

const DEFAULT_API_BASE = 'https://lumna.co';

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
  statusEl.innerHTML = s.blocking
    ? `<span class="on">Blocking on</span> · ${s.count} site${s.count === 1 ? '' : 's'} · ${when}`
    : `<span class="off">Blocking off</span> · ${when}`;
}

async function load() {
  const { token, apiBase, lastStatus } = await chrome.storage.local.get([
    'token',
    'apiBase',
    'lastStatus',
  ]);
  tokenEl.value = token || '';
  apiEl.value = apiBase || DEFAULT_API_BASE;
  renderStatus(lastStatus);
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    token: tokenEl.value.trim(),
    apiBase: (apiEl.value.trim() || DEFAULT_API_BASE).replace(/\/+$/, ''),
  });
  statusEl.textContent = 'Saved. Syncing…';
  // The background worker re-syncs on storage change; reflect the result shortly.
  setTimeout(async () => {
    const { lastStatus } = await chrome.storage.local.get(['lastStatus']);
    renderStatus(lastStatus);
  }, 1200);
});

load();
