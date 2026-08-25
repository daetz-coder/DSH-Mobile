// CDP helper: focus the dsh-pocket PIN input inside the remote iframe,
// set its value directly, and optionally submit the form.
const WS_URL = process.argv[2];
const PIN = process.argv[3] || '';
const ACTION = process.argv[4] || 'fill'; // fill | submit

const pages = await (await fetch('http://127.0.0.1:9222/json')).json();
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
await send('Page.enable');

const tree = await send('Page.getFrameTree');
let remoteFrameId = null;
(function walk(n) {
  if (n.frame.url && !n.frame.url.startsWith('http://localhost') && !n.frame.url.startsWith('about:blank')) {
    remoteFrameId = n.frame.id;
  }
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);

if (!remoteFrameId) { console.error('no remote frame'); process.exit(1); }

const ev = await send('Page.createIsolatedWorld', {
  frameId: remoteFrameId,
  worldName: 'dsh-autofill',
  grantUniveralAccess: true,
});
const ctxId = ev.executionContextId;

const expr = `(() => {
  const inp = document.querySelector('input[name="token"], input[type="password"], input[inputmode="numeric"]');
  if (!inp) return 'NO_INPUT';
  inp.focus();
  // Set value via native setter so React/Vue two-way binding picks it up.
  const proto = inp.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(inp, ${JSON.stringify(PIN)});
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new Event('change', { bubbles: true }));
  ${ACTION === 'submit' ? `(inp.closest('form') || document.querySelector('form')).submit(); 'SUBMITTED'` : `'FILLED:' + inp.value`}
})()`;

const res = await send('Runtime.evaluate', {
  expression: expr,
  contextId: ctxId,
  returnByValue: true,
});
console.log('RESULT ' + JSON.stringify(res.result && res.result.value));
ws.close();
process.exit(0);