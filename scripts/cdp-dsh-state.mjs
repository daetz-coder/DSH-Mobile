// CDP: inspect DSH UI connection state inside the iframe.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.startsWith('http://localhost'));
if (!page) { console.error('no local page'); process.exit(1); }

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

const tree = await send('Page.getFrameTree');
let rid = null;
(function walk(n) {
  if (n.frame.url && !n.frame.url.startsWith('http://localhost')) rid = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);

const ev = await send('Page.createIsolatedWorld', { frameId: rid, worldName: 'dsh-x', grantUniveralAccess: true });
const expr = `JSON.stringify((() => {
  const res = performance.getEntriesByType('resource');
  return {
    url: location.href,
    wsResources: res.filter(e => /ws|socket|events/i.test(e.name)).map(e => e.name.slice(0, 100)),
    apiResources: res.filter(e => /api|rpc/i.test(e.name)).map(e => e.name.slice(0, 100)).slice(0, 5),
    bodyHtml: (document.body ? document.body.innerHTML : '').slice(0, 600),
  };
})())`;
const r = await send('Runtime.evaluate', { expression: expr, contextId: ev.executionContextId, returnByValue: true });
console.log('R ' + JSON.stringify(r.result && r.result.value));
ws.close();
process.exit(0);