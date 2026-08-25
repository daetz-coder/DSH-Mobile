// CDP: capture ALL Network requests + WS frames mentioning approval/permission
// while triggering a fresh approval. Print request URLs for /api calls.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const apis = [];
const wsFrames = [];
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
  } else if (msg.method === 'Network.requestWillBeSent') {
    const u = msg.params.request.url || '';
    if (u.includes('/api/') && !u.includes('.js') && !u.includes('.css')) {
      apis.push({ m: msg.params.request.method, u: u.slice(0, 100) });
    }
  } else if (msg.method === 'Network.webSocketFrameReceived') {
    const d = msg.params.response.payloadData || '';
    if (/approval|permission|question|ask|inbox|queue/i.test(d)) {
      wsFrames.push(d.slice(0, 250));
    }
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
console.log('LISTENING 25s...');
await new Promise((res) => setTimeout(res, 25000));
console.log('APIS ' + JSON.stringify([...new Set(apis.map(a => a.m + ' ' + a.u))], null, 1));
console.log('WS_HITL ' + JSON.stringify(wsFrames.slice(-6), null, 1));
ws.close();
process.exit(0);