// CDP: watch network traffic while submitting the PIN form inside the iframe.
const WS_URL = process.argv[2];
const PIN = process.argv[3] || '';

const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.startsWith('http://localhost'));
if (!page) { console.error('no local page'); process.exit(1); }

let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
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
  } else if (msg.method) {
    events.push(msg);
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

const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-net', grantUniveralAccess: true });
const ctxId = ev.executionContextId;

// Fill + submit
await send('Runtime.evaluate', {
  contextId: ctxId,
  expression: `(() => {
    const inp = document.querySelector('input[name="token"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(inp, ${JSON.stringify(PIN)});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const form = document.querySelector('form');
    form.requestSubmit();
    return 'ok';
  })()`,
  returnByValue: true,
});

// Wait for network events
await new Promise((res) => setTimeout(res, 4000));

const net = events.filter((e) => e.method.startsWith('Network.'));
console.log('NETEVENTS ' + JSON.stringify(net.map((e) => {
  const p = e.params || {};
  const req = p.request || {};
  return {
    method: e.method,
    url: (req.url || '').slice(0, 80),
    status: p.response ? p.response.status : undefined,
    headers: p.response ? (p.response.headers || {}) : undefined,
  };
})));

ws.close();
process.exit(0);