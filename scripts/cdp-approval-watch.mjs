// CDP: watch BOTH DSH event channels (events.mux + events.host) for any
// frame containing approval/permission/question/ask signals over 30s,
// while the agent is prompted to do something requiring approval.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const signals = [];
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
    const data = msg.params.response.payloadData || '';
    if (/approval|permission|question|ask|confirm|prompt|waiting|intervention/i.test(data)) {
      signals.push(data.slice(0, 400));
    }
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
console.log('WATCHING 30s for approval signals...');
await new Promise((res) => setTimeout(res, 30000));
console.log('SIGNALS ' + JSON.stringify(signals.slice(0, 10), null, 1));
ws.close();
process.exit(0);