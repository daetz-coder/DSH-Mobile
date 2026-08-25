// CDP: capture full frames where the agent calls an ask/question tool.
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
    // full frames mentioning ask / question / user-question
    if (/ask|question/i.test(d) && d.length < 3000) frames.push(d);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Network.enable');
console.log('WATCHING 20s for ask/question frames...');
await new Promise((res) => setTimeout(res, 20000));
console.log('FRAMES ' + JSON.stringify(frames.slice(-8), null, 1));
ws.close();
process.exit(0);