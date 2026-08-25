// CDP: capture ALL console/exceptions from the DSH iframe while forcing a reload.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url.startsWith('http://localhost'));
if (!page) { console.error('no local page'); process.exit(1); }

let ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = [];
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
  } else if (msg.method && (msg.method.startsWith('Runtime.') || msg.method.startsWith('Log.') || msg.method.startsWith('Network.loadingFailed'))) {
    events.push(msg);
  }
};
await new Promise((res) => (ws.onopen = res));
await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Log.enable');

const tree = await send('Page.getFrameTree');
let rid = null;
(function walk(n) {
  if (n.frame.url && !n.frame.url.startsWith('http://localhost')) rid = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
console.log('frame: ' + rid);

// Reload the iframe
await send('Runtime.evaluate', {
  expression: `(() => { const f = document.getElementById('remote-frame'); f.src = f.src; return 'reloading'; })()`,
  returnByValue: true,
});
await new Promise((res) => setTimeout(res, 8000));

const summary = events.map((e) => {
  if (e.method === 'Runtime.exceptionThrown') {
    const d = e.params.exceptionDetails || {};
    return { t: 'exception', text: d.text || '', desc: (d.exception && d.exception.description || '').slice(0, 200) };
  }
  if (e.method === 'Runtime.consoleAPICalled') {
    const a = (e.params.args || []).map((x) => (x.value !== undefined ? String(x.value) : x.description)).join(' ');
    return { t: 'console', level: e.params.type, text: a.slice(0, 250) };
  }
  if (e.method === 'Log.entryAdded') {
    return { t: 'log', level: e.params.entry.level, text: (e.params.entry.text || '').slice(0, 250) };
  }
  if (e.method === 'Network.loadingFailed') {
    return { t: 'netfail', err: e.params.errorText, url: (e.params.requestId || '') };
  }
  return { t: e.method };
});
console.log('EVENTS ' + JSON.stringify(summary.filter((e) => e.t !== 'Runtime.executionContextCreated' && e.t !== 'Runtime.consoleAPICalled' || e.t === 'netfail').slice(-25)));
ws.close();
process.exit(0);