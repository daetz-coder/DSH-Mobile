// CDP: collect every distinct session/event payload TAG and the raw event
// types seen, over 30s, to enumerate question/approval-shaped events.
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
    const d = msg.params.response.payloadData || '';
    if (d.startsWith('{')) frames.push(d);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
console.log('LISTENING 30s...');
await new Promise((res) => setTimeout(res, 30000));

// Count all distinct inner event types across frames
const innerTypes = new Map();
const topTypes = new Map();
for (const f of frames) {
  try {
    const j = JSON.parse(f);
    const pt = j.payload && j.payload.type;
    if (pt) topTypes.set(pt, (topTypes.get(pt) || 0) + 1);
    if (j.payload && j.payload.event && j.payload.event.type) {
      const et = j.payload.event.type;
      innerTypes.set(et, (innerTypes.get(et) || 0) + 1);
    }
  } catch (e) {}
}
console.log('TOP_TYPES ' + JSON.stringify([...topTypes.entries()]));
console.log('EVENT_TYPES ' + JSON.stringify([...innerTypes.entries()]));
ws.close();
process.exit(0);