// CDP: extract component-level design details from the live DSH UI
// (sidebar, buttons, inputs, pills, headers) — light and dark.
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
await send('Page.enable');

const tree = await send('Page.getFrameTree');
let remoteId = null;
(function walk(n) {
  if (n.frame.url && n.frame.url.includes('192.168')) remoteId = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
const ev = await send('Page.createIsolatedWorld', { frameId: remoteId, worldName: 'dsh-comp', grantUniveralAccess: true });
const expr = `JSON.stringify((() => {
  function style(sel, props) {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const o = {};
    for (const p of props) o[p] = cs[p];
    return o;
  }
  return {
    dark: document.documentElement.hasAttribute('data-ds-dark-theme'),
    sidebar: style('[data-dsh-sidebar], [class*="sidebar"], aside, nav', ['backgroundColor','borderRightColor','width','background']),
    body: style('body', ['backgroundColor','color','fontFamily','fontSize']),
    button: style('button', ['backgroundColor','color','borderRadius','fontSize','fontWeight','padding','border','borderColor']),
    pill: style('[class*="pill"], [class*="badge"], [class*="tag"]', ['backgroundColor','color','borderRadius','fontSize']),
    input: style('input, textarea', ['backgroundColor','color','borderRadius','borderColor','border','fontSize','padding']),
    primaryBtn: style('[class*="primary"], [data-variant="primary"], button[type="submit"]', ['backgroundColor','color']),
    header: style('header, [class*="header"]', ['backgroundColor','borderBottomColor','borderBottom']),
    allVars: (() => { const cs = getComputedStyle(document.documentElement); const v = {}; for (const p of cs) if (p.startsWith('--')) v[p] = cs.getPropertyValue(p).trim(); return v; })(),
  };
})())`;
const r = await send('Runtime.evaluate', { expression: expr, contextId: ev.executionContextId, returnByValue: true });
console.log('COMP ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);