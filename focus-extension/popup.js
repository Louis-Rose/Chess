const API_BASE = 'https://lumna.co';

const setupEl = document.getElementById('setup');
const connectedEl = document.getElementById('connected');
const tokenEl = document.getElementById('token');
const saveBtn = document.getElementById('save');
const setupStatusEl = document.getElementById('setupStatus');
const toggleBtn = document.getElementById('blockToggle');
const blockLabelEl = document.getElementById('blockLabel');
const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const addForm = document.getElementById('addForm');
const addInput = document.getElementById('addInput');
const statusEl = document.getElementById('status');
const changeBtn = document.getElementById('change');

const state = { token: '', blocking: false, items: [] };

// All popup requests carry the token; the backend maps it to the same list the
// extension enforces (account list for logged-in users, anon list otherwise).
async function api(path, opts = {}) {
  const headers = { 'X-Focus-Token': state.token, ...(opts.headers || {}) };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

// Nudge the background to re-pull the list and update rules/tabs right away.
function notifySync() {
  try {
    chrome.runtime.sendMessage({ type: 'sync' });
  } catch (e) {
    // background may be asleep; the next poll will catch up
  }
}

function render() {
  toggleBtn.setAttribute('aria-checked', String(state.blocking));
  blockLabelEl.textContent = state.blocking ? 'Blocking On' : 'Blocking Off';
  listEl.innerHTML = '';
  for (const item of state.items) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = item.value;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `Remove ${item.value}`);
    x.addEventListener('click', () => removeSite(item.id));
    chip.append(label, x);
    listEl.append(chip);
  }
  emptyEl.hidden = state.items.length > 0;
}

function showSetup(msg) {
  connectedEl.hidden = true;
  setupEl.hidden = false;
  tokenEl.value = state.token || '';
  setupStatusEl.innerHTML = msg ? `<span class="err">${msg}</span>` : '';
}

function showConnected() {
  setupEl.hidden = true;
  connectedEl.hidden = false;
  statusEl.innerHTML = '';
  render();
}

async function tryConnect() {
  try {
    const data = await api('/api/workblock');
    state.blocking = !!data.blocking;
    state.items = data.items || [];
    showConnected();
  } catch (e) {
    showSetup("Couldn't connect. Check the token.");
  }
}

async function setBlocking(next) {
  state.blocking = next;
  render(); // optimistic
  try {
    await api('/api/workblock', { method: 'POST', body: JSON.stringify({ blocking: next }) });
    notifySync();
  } catch (e) {
    state.blocking = !next;
    render(); // revert
  }
}

async function addSite(value) {
  const v = value.trim();
  if (!v) return;
  try {
    const item = await api('/api/workblock/items', {
      method: 'POST',
      body: JSON.stringify({ value: v }),
    });
    if (!state.items.some((i) => i.id === item.id)) state.items.push(item);
    render();
    notifySync();
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Couldn't add that.</span>`;
  }
}

async function removeSite(id) {
  const prev = state.items;
  state.items = state.items.filter((i) => i.id !== id);
  render(); // optimistic
  try {
    await api(`/api/workblock/items/${id}`, { method: 'DELETE' });
    notifySync();
  } catch (e) {
    state.items = prev;
    render(); // revert
  }
}

toggleBtn.addEventListener('click', () => setBlocking(!state.blocking));

addForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = addInput.value;
  addInput.value = '';
  await addSite(v);
});

saveBtn.addEventListener('click', async () => {
  const t = tokenEl.value.trim();
  if (!t) {
    setupStatusEl.innerHTML = `<span class="err">Paste your token first.</span>`;
    return;
  }
  state.token = t;
  await chrome.storage.local.set({ token: t });
  setupStatusEl.textContent = 'Connecting…';
  notifySync();
  await tryConnect();
});

changeBtn.addEventListener('click', () => showSetup());

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
const toggleTokenEl = document.getElementById('toggleToken');
toggleTokenEl.innerHTML = EYE;
toggleTokenEl.addEventListener('click', () => {
  const show = tokenEl.type === 'password';
  tokenEl.type = show ? 'text' : 'password';
  toggleTokenEl.innerHTML = show ? EYE_OFF : EYE;
  toggleTokenEl.setAttribute('aria-label', show ? 'Hide token' : 'Show token');
});

async function init() {
  const { token } = await chrome.storage.local.get(['token']);
  state.token = token || '';
  if (state.token) await tryConnect();
  else showSetup();
}

init();
