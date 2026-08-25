// CDP: read cookies for the remote origin directly from the WebView, and
// force-reload the iframe to pick up the injected session cookie.
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
await send('Network.enable');

// Get cookies for the remote origin
const cookies = await send('Network.getAllCookies');
const relevant = (cookies.cookies || []).filter(c => c.domain.includes('192.168.95.115') || c.domain === 'localhost');
console.log('COOKIES ' + JSON.stringify(relevant.map(c => `${c.name}=${(c.value || '').slice(0, 20)} domain=${c.domain} path=${c.path}`)));

const tree = await send('Page.getFrameTree');
let remoteId = null;
(function walk(n) {
  if (n.frame.url && !n.frame.url.startsWith('http://localhost')) remoteId = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
if (!remoteId) { console.error('no remote frame'); process.exit(1); }

// Force reload the iframe via JS in the parent
const reload = await send('Runtime.evaluate', {
  expression: `(() => {
    const f = document.getElementById('remote-frame');
    const url = f.src;
    f.src = 'about:blank';
    return 'will reload ' + url;
  })()`,
  returnByValue: true,
});
console.log('RELOAD ' + JSON.stringify(reload.result && reload.result.value));
await new Promise((res) => setTimeout(res, 300));
await send('Runtime.evaluate', {
  expression: `(() => {
    const f = document.getElementById('remote-frame');
    f.src = ${JSON.stringify('http://192.168.95.115:3081/')};
    return 'frame set';
  })()`,
  returnByValue: true,
});

await new Promise((res) => setTimeout(res, 5000));
// Check frame state now
const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-check', grantUniveralAccess: true });
const st = await send('Runtime.evaluate', {
  contextId: ev.executionContextId,
  expression: `({ url: location.href, title: document.title, body: (document.body ? document.body.innerText : '').slice(0, 200) })`,
  returnByValue: true,
});
console.log('STATE ' + JSON.stringify(st.result && st.result.value));
ws.close();
process.exit(0);