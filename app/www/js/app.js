/**
 * DSH-Mobile main app logic.
 *
 * Three views: pairing list (home), scanner (native overlay via plugin
 * bridge), and remote (iframe embedding the DSH web UI served by dsh-pocket).
 */

import * as store from './store.js';
import * as qr from './qr.js';

const $ = (id) => document.getElementById(id);

const views = {
  home: $('view-home'),
  scan: $('view-scan'),
  remote: $('view-remote'),
};

let activePairingId = null;

/* ---------------- view switching ---------------- */

function showView(name) {
  for (const key of Object.keys(views)) {
    views[key].classList.toggle('active', key === name);
  }
}

/* ---------------- toast ---------------- */

let toastTimer = null;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------------- pairing list ---------------- */

async function renderList() {
  const items = await store.loadAll();
  const list = $('pairing-list');
  const empty = $('empty-list');

  list.textContent = '';
  empty.classList.toggle('hidden', items.length > 0);

  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'pair-item';

    const main = document.createElement('div');
    main.className = 'pair-main';

    const name = document.createElement('div');
    name.className = 'pair-name';
    name.textContent = item.name;

    const url = document.createElement('div');
    url.className = 'pair-url';
    url.textContent = item.url;
    url.title = item.url;

    const meta = document.createElement('div');
    meta.className = 'pair-meta';
    meta.textContent = 'Last used ' + (item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : '—');

    main.append(name, url, meta);

    const del = document.createElement('button');
    del.className = 'pair-del';
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Remove pairing');
    del.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await store.removePairing(item.id);
      if (activePairingId === item.id) activePairingId = null;
      renderList();
      toast('Pairing removed');
    });

    li.append(main, del);
    li.addEventListener('click', () => {
      if (item.pin) {
        openRemote(item.id, item.url);
      } else {
        openRemoteWithPinPrompt(item.id, item.url);
      }
    });
    list.append(li);
  }
}

/* ---------------- manual add ---------------- */

function setDlgError(msg) {
  const el = $('dlg-error');
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

function openManualDialog() {
  const dlg = $('dlg-manual');
  $('input-name').value = '';
  $('input-url').value = '';
  setDlgError(null);
  dlg.showModal();
  setTimeout(() => $('input-url').focus(), 50);
}

$('btn-manual').addEventListener('click', openManualDialog);
$('btn-dlg-cancel').addEventListener('click', () => $('dlg-manual').close());

$('input-url').addEventListener('input', () => setDlgError(null));

$('form-manual').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const name = $('input-name').value.trim();
  const rawUrl = $('input-url').value.trim();
  console.log('[dsh-mobile] submit rawUrl:', JSON.stringify(rawUrl));
  const url = store.normalizeUrl(rawUrl);
  if (!url) {
    setDlgError('Invalid URL — expected http(s)://...');
    return;
  }
  try {
    const entry = await store.addPairing(name || url, url);
    console.log('[dsh-mobile] pairing saved:', entry.id, entry.url);
    $('dlg-manual').close();
    renderList();
    openRemote(entry.id, entry.url);
  } catch (err) {
    console.error('[dsh-mobile] add failed', err);
    setDlgError('Failed to save pairing: ' + (err && err.message ? err.message : err));
  }
});

/* ---------------- scan ---------------- */

$('btn-scan').addEventListener('click', async () => {
  showView('scan');
  try {
    const payload = await qr.scan();
    if (!payload) {
      // Cancelled or failed — go home.
      renderList();
      showView('home');
      return;
    }
    const url = store.normalizeUrl(payload);
    if (!url) {
      $('scanned-url').textContent = payload;
      toast('Scanned value is not a valid URL', true);
      renderList();
      showView('home');
      return;
    }
    // Auto-add + connect (still show confirm row so a stray scan doesn't connect silently).
    $('scanned-url').textContent = url;
    $('scan-confirm').classList.remove('hidden');

    const entry = await store.addPairing(url, url);
    $('btn-use-url').dataset.id = entry.id;
    $('btn-use-url').dataset.url = url;
  } catch (err) {
    console.error('[scan] failed', err);
    toast('Scanner error: ' + (err && err.message ? err.message : err), true);
    renderList();
    showView('home');
  }
});

$('btn-scan-again').addEventListener('click', async () => {
  $('scan-confirm').classList.add('hidden');
  try {
    const payload = await qr.scan();
    if (!payload) {
      renderList();
      showView('home');
      return;
    }
    const url = store.normalizeUrl(payload);
    if (!url) {
      toast('Scanned value is not a valid URL', true);
      renderList();
      showView('home');
      return;
    }
    $('scanned-url').textContent = url;
    $('scan-confirm').classList.remove('hidden');
    const entry = await store.addPairing(url, url);
    $('btn-use-url').dataset.id = entry.id;
    $('btn-use-url').dataset.url = url;
  } catch (err) {
    toast('Scanner error', true);
    renderList();
    showView('home');
  }
});

$('btn-use-url').addEventListener('click', () => {
  const id = $('btn-use-url').dataset.id;
  const url = $('btn-use-url').dataset.url;
  if (id && url) openRemote(id, url);
});

$('btn-cancel-scan').addEventListener('click', () => {
  renderList();
  showView('home');
});

/* ---------------- remote ---------------- */

function authBridge() {
  return typeof window !== 'undefined' ? (window.__DSH_MOBILE_AUTH || null) : null;
}

async function openRemote(id, url, opts = {}) {
  const items = await store.loadAll();
  const entry = items.find((e) => e.id === id);
  const pin = entry && entry.pin ? entry.pin : (opts.pin || null);

  let targetUrl = url;
  const bridge = authBridge();
  if (bridge && pin) {
    try {
      const res = await bridge.login(url, pin);
      console.log('[dsh-mobile] auth login:', JSON.stringify({ ok: res.ok, status: res.status, hasToken: !!res.token }));
      if (res.ok && res.token) {
        // URL-parameter auth form: dsh-pocket accepts
        // ?token=<sha256(PIN:sessionKey)> — sidesteps iframe cookie plumbing.
        targetUrl = url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(res.token);
      }
    } catch (err) {
      console.error('[dsh-mobile] auth login failed', err);
    }
  }

  activePairingId = id;
  $('remote-url').textContent = url;
  $('remote-url').title = url;
  const frame = $('remote-frame');
  frame.src = targetUrl;
  showView('remote');
  store.touchPairing(id);
}

/** Ask the user for this pairing's PIN, save it, then open remote. */
async function openRemoteWithPinPrompt(id, url) {
  const items = await store.loadAll();
  const entry = items.find((e) => e.id === id);
  const dlg = $('dlg-pin');
  $('pin-url-label').textContent = entry ? entry.name || entry.url : url;
  $('input-pin').value = entry && entry.pin ? entry.pin : '';
  setPinError(null);
  dlg.showModal();
  $('btn-pin-ok').dataset.id = id;
  $('btn-pin-ok').dataset.url = url;
  setTimeout(() => $('input-pin').focus(), 50);
}

function setPinError(msg) {
  const el = $('pin-error');
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

$('btn-pin-ok').addEventListener('click', async () => {
  const id = $('btn-pin-ok').dataset.id;
  const url = $('btn-pin-ok').dataset.url;
  const pin = $('input-pin').value.trim();
  if (!/^\d{4,16}$/.test(pin)) {
    setPinError('PIN should be 4–16 digits');
    return;
  }
  await store.setPairingPin(id, pin);
  $('dlg-pin').close();
  openRemote(id, url, { pin });
});

$('btn-pin-cancel').addEventListener('click', () => $('dlg-pin').close());

$('btn-back').addEventListener('click', () => {
  const frame = $('remote-frame');
  frame.src = 'about:blank';
  activePairingId = null;
  renderList();
  showView('home');
});

$('btn-reload').addEventListener('click', async () => {
  const frame = $('remote-frame');
  const url = frame.src;
  frame.src = 'about:blank';
  const items = await store.loadAll();
  const entry = items.find((e) => e.id === activePairingId);
  const bridge = authBridge();
  if (bridge && entry && entry.pin) {
    try {
      await bridge.login(entry.url, entry.pin);
    } catch (err) {
      console.error('[dsh-mobile] reload login failed', err);
    }
  }
  setTimeout(() => { frame.src = url; toast('Reloaded'); }, 60);
});

$('btn-disconnect').addEventListener('click', () => {
  $('remote-frame').src = 'about:blank';
  activePairingId = null;
  renderList();
  showView('home');
  toast('Disconnected');
});

/* ---------------- init ---------------- */

(async function init() {
  const items = await store.loadAll();
  // If we came back via bridge reload, restore last pairing? Keep simple: always list.
  renderList();
  console.log('[dsh-mobile] ready, pairings:', items.length);
})();