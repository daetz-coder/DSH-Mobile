// CDP: watch for tool/call frames whose view.card indicates a permission /
// approval request (the HITL signal), plus capture their full shape.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const hits = [];
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
    if (d.includes('"view"') && /permission|approval|request/i.test(d)) hits.push(d.slice(0, 500));
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
console.log('WATCHING 20s for permission-view frames...');
await new Promise((res) => setTimeout(res, 20000));
console.log('HITS ' + JSON.stringify(hits.slice(-6), null, 1));
ws.close();
process.exit(0);