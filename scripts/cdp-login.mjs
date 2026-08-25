// CDP single-session flow: focus PIN input -> set value -> submit form ->
// poll a few seconds -> report final page state + cookies.
const WS_URL = process.argv[2];
const PIN = process.argv[3] || '';

const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.startsWith('http://localhost'));
if (!page) { console.error('no local page'); process.exit(1); }

let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
};
await new Promise((res) => (ws.onopen = res));

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');

const tree = await send('Page.getFrameTree');
let remoteId = null;
(function walk(n) {
  if (n.frame.url && !n.frame.url.startsWith('http://localhost')) remoteId = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
if (!remoteId) { console.error('no remote frame'); process.exit(1); }

const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-flow', grantUniveralAccess: true });
const ctxId = ev.executionContextId;

async function evalIn(ctxId, expr) {
  const r = await send('Runtime.evaluate', { expression: expr, contextId: ctxId, returnByValue: true, awaitPromise: true });
  return r.result;
}

// 1) Fill
let r = await evalIn(ctxId, `(() => {
  const inp = document.querySelector('input[name="token"]');
  if (!inp) return 'NO_INPUT';
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(inp, ${JSON.stringify(PIN)});
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  return 'FILLED:' + inp.value;
})()`);
console.log('FILL ' + JSON.stringify(r && r.value));

// 2) Submit via form.requestSubmit() (fires submit event + navigation)
r = await evalIn(ctxId, `(() => {
  const form = document.querySelector('form');
  if (!form) return 'NO_FORM';
  const ok = form.requestSubmit();
  return 'SUBMIT_CALLED:' + (ok === undefined ? 'void' : String(ok));
})()`);
console.log('SUBMIT ' + JSON.stringify(r && r.value));

// 3) Poll page state for up to 8s
for (let i = 0; i < 8; i++) {
  await new Promise((res) => setTimeout(res, 1000));
  const st = await evalIn(ctxId, `({ url: location.href, title: document.title })`);
  const state = st && st.value;
  console.log(`POLL${i + 1} ` + JSON.stringify(state));
  if (state && state.url && !state.url.includes('pocket-login')) {
    const cookies = await send('Network.getAllCookies');
    console.log('COOKIES ' + JSON.stringify((cookies.cookies || []).map(c => c.name)));
  }
}

// 4) Final body text (first 200 chars)
const body = await evalIn(ctxId, `(document.body ? document.body.innerText : '').slice(0, 250)`);
console.log('BODY ' + JSON.stringify(body && body.value));
ws.close();
process.exit(0);