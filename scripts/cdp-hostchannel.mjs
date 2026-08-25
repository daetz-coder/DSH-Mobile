// CDP: report all WebSocket URLs currently open on the DSH page, and watch
// the host channel (events.host) for approval/permission frames.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const created = [];
const hostFrames = [];
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
  } else if (msg.method === 'Network.webSocketCreated') {
    created.push(msg.params.url);
  } else if (msg.method === 'Network.webSocketFrameReceived') {
    const d = msg.params.response.payloadData || '';
    if (/approval|permission|host\/|question/i.test(d)) hostFrames.push(d.slice(0, 400));
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
console.log('LISTENING 20s on current sockets...');
await new Promise((res) => setTimeout(res, 20000));
console.log('SOCKETS ' + JSON.stringify(created));
console.log('HOST_FRAMES ' + JSON.stringify(hostFrames.slice(-8), null, 1));
ws.close();
process.exit(0);