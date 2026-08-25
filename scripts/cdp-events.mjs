// CDP: capture a few session/event frames to learn their payload shape.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const frames = [];
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
  } else if (msg.method === 'Network.webSocketFrameReceived') {
    frames.push(msg.params.response.payloadData);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
console.log('LISTENING 20s...');
await new Promise((res) => setTimeout(res, 20000));

// collect distinct session/event payload.type values + 3 samples of each
const eventTypes = new Map();
const samples = [];
for (const f of frames) {
  try {
    const j = JSON.parse(f);
    if (j.payload && j.payload.type === 'session/event') {
      const inner = j.payload.event || {};
      const t = inner.type || '?';
      if (!eventTypes.has(t)) { eventTypes.set(t, 0); samples.push(f.slice(0, 500)); }
      eventTypes.set(t, eventTypes.get(t) + 1);
    }
  } catch { /* ignore */ }
}
console.log('EVENT_TYPES ' + JSON.stringify([...eventTypes.entries()]));
console.log('SAMPLES ' + JSON.stringify(samples.slice(0, 10)));
ws.close();
process.exit(0);