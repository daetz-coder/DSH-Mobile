// CDP: report current WebSocket connections on the DSH page.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.includes('192.168'));
if (!page) { console.error('no dsh page'); process.exit(1); }
let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
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
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Runtime.enable');
// Check via performance + a global probe for WebSocket instances
const r = await send('Runtime.evaluate', {
  expression: `JSON.stringify((() => {
    const res = performance.getEntriesByType('resource').filter(e => e.name.includes('/api/events')).map(e => e.name);
    return { wsResources: res, url: location.href, readyState: document.readyState };
  })())`,
  returnByValue: true,
});
console.log('STATE ' + JSON.stringify(r.result && r.result.value));
ws.close();
process.exit(0);