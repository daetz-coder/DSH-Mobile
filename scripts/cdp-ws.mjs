// CDP: capture WebSocket connections and frames from the DSH page.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }

let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const frames = [];
const created = [];
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
    if (msg.method === 'Network.webSocketCreated') created.push(msg.params);
    if (msg.method === 'Network.webSocketFrameReceived') frames.push(msg.params.response.payloadData);
    if (msg.method === 'Network.webSocketClosed') frames.push('__CLOSED__');
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
await send('Page.enable');

// Reload the DSH page to capture fresh WS handshakes
await send('Page.reload', { ignoreCache: true });
await new Promise((res) => setTimeout(res, 9000));

console.log('CREATED ' + JSON.stringify(created.map((c) => ({ url: c.url }))));
const sample = frames.filter((f) => typeof f === 'string' && f.length < 600).slice(0, 12);
console.log('FRAMES ' + JSON.stringify(sample));
ws.close();
process.exit(0);