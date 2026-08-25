/**
 * DSH-Mobile main app logic.
 *
 * Two interactive views: pairing list (home) and scanner (native overlay via
 * plugin bridge). The remote Harness is opened via full-page navigation
 * (AuthBridgePlugin.open), so the shell page is replaced while remote and
 * restored by the Android back button (handled natively in MainActivity).
 */

import * as store from './store.js';
import * as qr from './qr.js';
import { t, initI18n } from './i18n.js';

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
    meta.textContent = t('lastUsed') + (item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : '—');

    main.append(name, url, meta);

    const del = document.createElement('button');
    del.className = 'pair-del';
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', t('removePairing'));
    del.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await store.removePairing(item.id);
      if (activePairingId === item.id) activePairingId = null;
      renderList();
      toast(t('pairingRemoved'));
    });

    li.append(main, del);
    li.addEventListener('click', () => openRemote(item.id, item.url));
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
    setDlgError(t('invalidUrl'));
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
    setDlgError(t('failedSave') + (err && err.message ? err.message : err));
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
      toast(t('invalidUrl'), true);
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
    toast(t('scannerError') + (err && err.message ? ': ' + err.message : ''), true);
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
      toast(t('invalidUrl'), true);
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
    toast(t('scannerError'), true);
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

/**
 * Resolve how to reach the pairing: probe whether the origin sits behind the
 * dsh-pocket PIN gate, and obtain a session token when it does.
 * Returns { targetUrl, authRequired, authFailed }.
 */
async function resolveTarget(url, pin) {
  const bridge = authBridge();
  if (!bridge) return { targetUrl: url, authRequired: false, authFailed: false };
  try {
    const probe = await bridge.check(url);
    console.log('[dsh-mobile] probe:', JSON.stringify(probe));
    if (!probe.protected) return { targetUrl: url, authRequired: false, authFailed: false };
    if (!pin) return { targetUrl: url, authRequired: true, authFailed: false };
    const res = await bridge.login(url, pin);
    console.log('[dsh-mobile] auth login:', JSON.stringify({ ok: res.ok, status: res.status, hasToken: !!res.token }));
    if (res.ok && res.token) {
      const targetUrl = url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(res.token);
      return { targetUrl, authRequired: true, authFailed: false };
    }
    return { targetUrl: url, authRequired: true, authFailed: true };
  } catch (err) {
    console.error('[dsh-mobile] auth probe failed', err);
    return { targetUrl: url, authRequired: false, authFailed: false };
  }
}

async function openRemote(id, url, opts = {}) {
  const items = await store.loadAll();
  const entry = items.find((e) => e.id === id);
  const pin = entry && entry.pin ? entry.pin : (opts.pin || null);

  const { targetUrl, authRequired, authFailed } = await resolveTarget(url, pin);
  if (authRequired && !pin) {
    // PIN is needed but we don't have it — prompt first.
    openRemoteWithPinPrompt(id, url);
    return;
  }

  // Full-page navigation (AuthBridgePlugin.open): the harness becomes the
  // top-level document so session cookies flow to every API/WS request.
  // The shell (pairing list) is restored via the Android back button,
  // handled natively in MainActivity.
  activePairingId = id;
  store.touchPairing(id);
  const bridge = authBridge();
  if (bridge) {
    try {
      const ok = await bridge.open(targetUrl);
      console.log('[dsh-mobile] open remote:', targetUrl, 'ok:', ok);
    } catch (err) {
      console.error('[dsh-mobile] open remote failed', err);
      toast(t('openRemoteFailed'), true);
      renderList();
    }
  } else {
    // Plain-browser preview: whole-window navigation.
    window.location.href = targetUrl;
  }
  if (authFailed) {
    toast(t('pinUnlockFailed'), true);
  }
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
    setPinError(t('pinError'));
    return;
  }
  await store.setPairingPin(id, pin);
  $('dlg-pin').close();
  openRemote(id, url, { pin });
});

$('btn-pin-cancel').addEventListener('click', () => $('dlg-pin').close());

/* ---------------- remote back handling ----------------
   Full-page remote navigation means the pairing shell page is replaced; the
   Android back button while remote is handled natively in MainActivity
   (returns to the shell). On the shell page, default Capacitor back
   behaviour applies (exit app). No JS listener needed here. */

/* ---------------- init ---------------- */

(async function init() {
  initI18n();
  window.addEventListener('dsh:langchange', () => renderList());
  const items = await store.loadAll();
  renderList();
  console.log('[dsh-mobile] ready, pairings:', items.length, 'lang:', t('scanQr'));
})();