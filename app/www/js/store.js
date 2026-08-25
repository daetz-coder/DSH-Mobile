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

/**
 * Serialize reads-modify-writes so concurrent calls (e.g. two quick
 * addPairing) can't both read the old list and clobber each other's change.
 * Each mutation awaits the previous one, and functional updates re-read the
 * latest list inside the queue.
 */
let writeQueue = Promise.resolve();

function enqueueWrite(fn) {
  const run = writeQueue.then(fn);
  // Keep the chain alive even if a step rejects; surface the error to caller.
  writeQueue = run.catch(() => {});
  return run;
}

function normalizeEntry(e) {
  let name = String(e.name ?? '');
  if (!name.trim()) name = String(e.url ?? '');
  return {
    id: e.id || uid(),
    name,
    url: String(e.url ?? ''),
    pin: e.pin != null && String(e.pin).trim() !== ''
      ? String(e.pin).trim()
      : undefined,
    createdAt: e.createdAt || now(),
    lastUsedAt: e.lastUsedAt || now(),
  };
}

async function readItems() {
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

function now() {
  return new Date().toISOString();
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function loadAll() {
  return readItems();
}

async function saveAll(items) {
  const b = backend();
  await b.set(STORE_KEY, { items });
}

/** Canonical identity of a pairing: normalized URL (case/port tolerant). */
function canonicalOf(url) {
  try {
    const u = new URL(String(url).trim());
    return u.protocol + '//' + u.host.toLowerCase() + u.pathname.replace(/\/+$/, '');
  } catch {
    return String(url || '').trim().toLowerCase();
  }
}

export async function addPairing(name, url, id, pin) {
  const norm = normalizeUrl(url) || url;
  const canon = canonicalOf(norm);
  return enqueueWrite(async () => {
    const items = await readItems();
    // De-dupe: same canonical URL re-added updates the existing entry's name
    // / pin instead of inserting a duplicate row.
    const existing = items.find((e) => canonicalOf(e.url) === canon);
    if (existing) {
      const cleanName = String(name ?? '').trim() || existing.name || norm;
      existing.name = cleanName;
      if (pin != null && String(pin).trim() !== '') existing.pin = String(pin).trim();
      existing.lastUsedAt = now();
      await saveAll(items);
      return existing;
    }
    const entry = normalizeEntry({
      name: name || norm,
      url: norm,
      id,
      pin,
    });
    items.push(entry);
    await saveAll(items);
    return entry;
  });
}

export async function removePairing(id) {
  return enqueueWrite(async () => {
    const items = await readItems();
    await saveAll(items.filter((e) => e.id !== id));
  });
}

export async function renamePairing(id, name) {
  return enqueueWrite(async () => {
    const items = await readItems();
    const hit = items.find((e) => e.id === id);
    if (!hit) return null;
    const clean = String(name || '').trim();
    if (!clean) return hit;
    hit.name = clean;
    await saveAll(items);
    return hit;
  });
}

export async function setPairingPin(id, pin) {
  return enqueueWrite(async () => {
    const items = await readItems();
    const hit = items.find((e) => e.id === id);
    if (!hit) return null;
    hit.pin = pin != null && String(pin).trim() !== '' ? String(pin).trim() : undefined;
    await saveAll(items);
    return hit;
  });
}

export async function touchPairing(id) {
  return enqueueWrite(async () => {
    const items = await readItems();
    const hit = items.find((e) => e.id === id);
    if (!hit) return;
    hit.lastUsedAt = now();
    await saveAll(items);
  });
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