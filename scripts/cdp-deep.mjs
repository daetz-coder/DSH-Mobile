// CDP: deep-inspect the DSH UI iframe — DOM size, JS errors, connection state.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.startsWith('http://localhost'));
if (!page) { console.error('no local page'); process.exit(1); }

let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const consoleLogs = [];
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
  } else if (msg.method === 'Runtime.consoleAPICalled' || msg.method === 'Runtime.exceptionThrown') {
    consoleLogs.push(msg);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Runtime.enable');
await send('Page.enable');

// Re-raise any exceptions so they surface in consoleLogs
const ex = await send('Runtime.enable');
consoleLogs.push({ method: 'enabled' });

const tree = await send('Page.getFrameTree');
let remoteId = null;
(function walk(n) {
  if (n.frame.url && !n.frame.url.startsWith('http://localhost')) remoteId = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
console.log('REMOTE_FRAME ' + (remoteId || 'NONE'));

if (remoteId) {
  const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-deep', grantUniveralAccess: true });
  const ctxId = ev.executionContextId;
  const expr = `(() => {
    const doc = document;
    return JSON.stringify({
      url: location.href,
      readyState: doc.readyState,
      bodyChildren: doc.body ? doc.body.children.length : -1,
      bodyText: (doc.body ? doc.body.innerText : '').slice(0, 400),
      hasRoot: !!doc.querySelector('#root, [data-dsh], main, .app'),
      scriptTags: doc.querySelectorAll('script').length,
      styleTags: doc.querySelectorAll('style, link[rel=stylesheet]').length,
      errors: (window.__dshErrors || []).slice(0, 5),
    });
  })()`;
  const res = await send('Runtime.evaluate', { expression: expr, contextId: ctxId, returnByValue: true, awaitPromise: true });
  console.log('FRAME_STATE ' + JSON.stringify(res.result && res.result.value));
}

// Capture console/exceptions for 3s (SPA may log during boot)
await new Promise((res) => setTimeout(res, 3000));
const logs = consoleLogs.filter((l) => l.method === 'Runtime.exceptionThrown' || l.method === 'Runtime.consoleAPICalled')
  .map((l) => {
    if (l.method === 'Runtime.exceptionThrown') {
      return { type: 'exception', text: (l.params.exceptionDetails && l.params.exceptionDetails.text) || '', exc: (l.params.exceptionDetails && l.params.exceptionDetails.exception && l.params.exceptionDetails.exception.description || '').slice(0, 200) };
    }
    const a = l.params.args || [];
    return { type: 'console', level: l.params.type, text: a.map((x) => x.value !== undefined ? x.value : x.description).join(' ').slice(0, 200) };
  });
console.log('LOGS ' + JSON.stringify(logs));
ws.close();
process.exit(0);