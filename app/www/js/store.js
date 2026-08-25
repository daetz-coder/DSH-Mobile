/**
 * DSH-Mobile pairing store.
 *
 * Abstraction over the native SecureStore plugin (AndroidKeyStore AES-GCM
 * encryption, see android/.../SecureStorePlugin.java). Falls back to
 * localStorage when running in a plain browser (dev preview).
 *
 * Storage layout: one JSON document under key "pairings.v1":
 *   { items: [{ id, name, url, createdAt, lastUsedAt }] }
 */

const STORE_KEY = 'pairings.v1';

function nativeAvailable() {
  return typeof window !== 'undefined' &&
    typeof window.__DSH_MOBILE_SECURE !== 'undefined';
}

function nativeBridge() {
  return window.__DSH_MOBILE_SECURE;
}

function webFallback() {
  return {
    async get() {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    async set(value) {
      localStorage.setItem(STORE_KEY, JSON.stringify(value));
    },
  };
}

let impl = null;

function backend() {
  if (impl) return impl;
  impl = nativeAvailable() ? nativeBridge() : webFallback();
  return impl;
}

function now() {
  return new Date().toISOString();
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function loadAll() {
  const b = backend();
  try {
    const doc = await b.get(STORE_KEY);
    if (!doc || !Array.isArray(doc.items)) return [];
    return doc.items;
  } catch (err) {
    console.error('[store] load failed', err);
    return [];
  }
}

async function saveAll(items) {
  const b = backend();
  await b.set(STORE_KEY, { items });
}

export async function addPairing(name, url, id, pin) {
  const items = await loadAll();
  const entry = {
    id: id || uid(),
    name: name || url,
    url,
    pin: pin != null && String(pin).trim() !== '' ? String(pin).trim() : undefined,
    createdAt: now(),
    lastUsedAt: now(),
  };
  items.push(entry);
  await saveAll(items);
  return entry;
}

export async function removePairing(id) {
  const items = await loadAll();
  await saveAll(items.filter((e) => e.id !== id));
}

export async function renamePairing(id, name) {
  const items = await loadAll();
  const hit = items.find((e) => e.id === id);
  if (!hit) return null;
  const clean = String(name || '').trim();
  if (!clean) return hit;
  hit.name = clean;
  await saveAll(items);
  return hit;
}

export async function setPairingPin(id, pin) {
  const items = await loadAll();
  const hit = items.find((e) => e.id === id);
  if (!hit) return null;
  hit.pin = pin != null && String(pin).trim() !== '' ? String(pin).trim() : undefined;
  await saveAll(items);
  return hit;
}

export async function touchPairing(id) {
  const items = await loadAll();
  const hit = items.find((e) => e.id === id);
  if (!hit) return;
  hit.lastUsedAt = now();
  await saveAll(items);
}

/**
 * Convert full-width characters (as produced by CJK IME composition, e.g.
 * "：" "。" "／" "http：//192。168。1。1") back to half-width so typed URLs
 * still validate. Thin normalization is safer than rejecting the input.
 */
function unwidth(s) {
  return String(s)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // full-width ASCII
    .replace(/\u3000/g, ' ') // ideographic space
    .replace(/[\uFF0D\u2013\u2014]/g, '-');
}

/** Sanitize / normalize a scanned or typed URL into a usable pairing URL. */
export function normalizeUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  s = unwidth(s);
  // Drop fragments that break iframe loading.
  s = s.split('#')[0];
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.toString();
}

export { STORE_KEY };