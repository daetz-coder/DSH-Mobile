// CDP probe 2: inspect the remote page state after PIN submission — error
// message, input value, cookies, and current URL.
const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
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

const tree = await send('Page.getFrameTree');
let remoteId = null;
(function walk(n) {
  if (n.frame.url && !n.frame.url.startsWith('http://localhost')) remoteId = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
if (!remoteId) { console.error('no remote frame'); process.exit(1); }

const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-probe2', grantUniveralAccess: true });
const ctxId = ev.executionContextId;

// Also read the network/cookie side via /json? Actually cookies need Network domain:
await send('Network.enable');
const cookies = await send('Network.getAllCookies');
console.log('COOKIES ' + JSON.stringify((cookies.cookies || []).map(c => `${c.name}=${c.value.slice(0, 24)}`)));

const expr = `(() => ({
  url: location.href,
  title: document.title,
  bodyText: (document.body ? document.body.innerText : '').slice(0, 300),
  inputValue: (document.querySelector('input[name="token"]') || {}).value ?? null,
}))()`;
const res = await send('Runtime.evaluate', { expression: expr, contextId: ctxId, returnByValue: true });
console.log('STATE ' + JSON.stringify(res.result && res.result.value));
ws.close();
process.exit(0);