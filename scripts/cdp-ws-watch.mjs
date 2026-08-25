// CDP: watch DSH /api/events.mux frames for 30s, printing unique event types.
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

console.log('LISTENING 30s...');
await new Promise((res) => setTimeout(res, 30000));

// Summarize: unique payload types + a few samples
const types = new Map();
const samples = [];
for (const f of frames) {
  try {
    const j = JSON.parse(f);
    const t = j.payload && j.payload.type ? j.payload.type : (j.type + ':' + j.method);
    types.set(t, (types.get(t) || 0) + 1);
    if (samples.length < 20 && /assistant|turn|goal|status|approval|permission|session\/update/i.test(t)) {
      samples.push(f.slice(0, 300));
    }
  } catch { /* non-json */ }
}
console.log('TYPES ' + JSON.stringify([...types.entries()].slice(0, 30)));
console.log('SAMPLES ' + JSON.stringify(samples));
ws.close();
process.exit(0);