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
import * as notify from './notify.js';
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

    const status = document.createElement('span');
    status.className = 'pair-status pair-status-unknown';
    status.title = '';
    status.setAttribute('aria-hidden', 'true');

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

    const actions = document.createElement('div');
    actions.className = 'pair-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'pair-edit';
    editBtn.type = 'button';
    editBtn.textContent = '✎';
    editBtn.setAttribute('aria-label', t('renamePairingTitle'));
    editBtn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      openRenameDialog(item);
    });
    actions.append(editBtn);

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
    actions.append(del);

    li.append(status, main, actions);
    li.addEventListener('click', () => openRemote(item.id, item.url));
    list.append(li);

    // Best-effort live status probe; updates the dot without re-rendering.
    probePairingStatus(item, status);
  }
}

async function probePairingStatus(item, statusEl) {
  const bridge = authBridge();
  if (!bridge) {
    statusEl.className = 'pair-status pair-status-ok';
    return;
  }
  try {
    const probe = await bridge.check(item.url);
    if (probe.protected) {
      statusEl.className = 'pair-status pair-status-lock';
      statusEl.title = t('statusPin');
    } else if (probe.reachable) {
      statusEl.className = 'pair-status pair-status-ok';
      statusEl.title = t('statusOnline');
    } else {
      statusEl.className = 'pair-status pair-status-offline';
      statusEl.title = t('statusOffline');
    }
  } catch {
    statusEl.className = 'pair-status pair-status-offline';
    statusEl.title = t('statusOffline');
  }
}

/* ---------------- rename pairing ---------------- */

let renamingPairingId = null;

function openRenameDialog(item) {
  renamingPairingId = item.id;
  $('input-rename').value = item.name || item.url;
  setRenameError(null);
  $('dlg-rename').showModal();
  setTimeout(() => {
    $('input-rename').focus();
    $('input-rename').select();
  }, 50);
}

function setRenameError(msg) {
  const el = $('rename-error');
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

$('btn-rename-cancel').addEventListener('click', () => $('dlg-rename').close());

$('btn-rename-ok').addEventListener('click', async () => {
  const name = $('input-rename').value.trim();
  if (!name) {
    setRenameError(t('emptyName'));
    return;
  }
  await store.renamePairing(renamingPairingId, name);
  $('dlg-rename').close();
  renderList();
  toast(t('renamed'));
});

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

  // Optional reachability pre-check (native probe; best-effort — never blocks
  // saving, a laptop asleep now may be online later).
  const bridge = authBridge();
  if (bridge) {
    try {
      const probe = await bridge.check(url);
      console.log('[dsh-mobile] pre-check:', JSON.stringify(probe));
      if (probe.reachable && !probe.protected) {
        // Common case, save silently below.
      } else if (!probe.reachable) {
        setDlgError(t('unreachableHint'));
        return;
      }
      // protected: reachable but PIN-gated — save anyway; openRemote probes again.
    } catch (err) {
      console.error('[dsh-mobile] pre-check failed', err);
    }
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
      // Status is now surfaced natively (MainActivity polls the DSH page's
      // turn-status text); the shell no longer posts a duplicate "connected"
      // notification.
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

/** Show the app version in the footer (native metadata or package fallback). */
async function showVersion() {
  const el = $('app-version');
  if (!el) return;
  let version = '';
  try {
    const cap = typeof window !== 'undefined' ? (window.Capacitor || null) : null;
    if (cap && cap.Plugins && cap.Plugins.App) {
      const info = await cap.Plugins.App.getInfo();
      version = info && info.version ? info.version : '';
    }
  } catch { /* native not ready */ }
  if (!version) version = '0.1.0'; // package fallback for web preview
  el.textContent = 'v' + version;
}

/**
 * Optional update check against the GitHub Releases API. Fail-silent: no
 * network or no repo → skip. Only nudges the user when a newer tag exists.
 */
async function checkForUpdates() {
  const REPO = 'daetz-coder/DSH-Mobile';
  try {
    const ctrl = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(6000)
      : null;
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, ctrl ? { signal: ctrl } : null);
    if (!res.ok) return;
    const rel = await res.json();
    const latest = String(rel.tag_name || '').replace(/^v/i, '');
    const cur = String((await getAppVersion()) || '0.1.0').replace(/^v/i, '');
    if (latest && compareVersions(latest, cur) > 0) {
      toast('DSH Mobile v' + latest + ' ' + t('updateAvailable'));
    }
  } catch { /* offline / no release — ignore */ }
}

async function getAppVersion() {
  try {
    const cap = typeof window !== 'undefined' ? (window.Capacitor || null) : null;
    if (cap && cap.Plugins && cap.Plugins.App) {
      const info = await cap.Plugins.App.getInfo();
      return info && info.version ? info.version : '0.1.0';
    }
  } catch { /* ignore */ }
  return '0.1.0';
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da > db ? 1 : -1;
  }
  return 0;
}

(async function init() {
  initI18n();
  window.addEventListener('dsh:langchange', () => renderList());
  const items = await store.loadAll();
  renderList();
  console.log('[dsh-mobile] ready, pairings:', items.length, 'lang:', t('scanQr'));
  showVersion();
  checkForUpdates();

  // Dev/test hook: long-press the brand title to fire a demo notification
  // (also exercises the Android 13+ permission prompt on first use).
  const brand = document.querySelector('.brand');
  if (brand) {
    let timer = null;
    brand.addEventListener('pointerdown', () => {
      timer = setTimeout(() => notify.testNotification(), 600);
    });
    brand.addEventListener('pointerup', () => clearTimeout(timer));
    brand.addEventListener('pointerleave', () => clearTimeout(timer));
    brand.addEventListener('pointercancel', () => clearTimeout(timer));
  }
})();