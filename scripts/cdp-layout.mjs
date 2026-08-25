// CDP: extract DSH layout details (sidebar, composer, rows, theme color).
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
let rid = null;
(function walk(n) {
  if (n.frame.url && n.frame.url.includes('192.168')) rid = n.frame.id;
  (n.childFrames || []).forEach(walk);
})(tree.frameTree);
const ev = await send('Page.createIsolatedWorld', { frameId: rid, worldName: 'dsh-layout', grantUniveralAccess: true });
const expr = `JSON.stringify((() => {
  const q = (sel) => document.querySelector(sel);
  const st = (el, props) => { if (!el) return null; const cs = getComputedStyle(el); const o = {}; for (const p of props) o[p] = cs[p]; return o; };
  const sidebar = q('[class*=sidebar]') || q('aside');
  const composer = q('[contenteditable=true], textarea, [class*=composer]');
  const sessionRow = q('[class*=session] [class*=item], [class*=session-item], [data-session]');
  const header = q('header, [class*=header]');
  return {
    sidebar: st(sidebar, ['backgroundColor','width','borderRight','boxShadow','padding','height']),
    composer: st(composer, ['backgroundColor','borderRadius','border','minHeight','padding','fontSize','color']),
    sessionRow: st(sessionRow, ['backgroundColor','borderRadius','padding','marginTop','color']),
    header: st(header, ['backgroundColor','padding','borderBottom']),
    themeColor: (document.querySelector('meta[name=theme-color]') || {}).content || null,
    bodyFontSize: getComputedStyle(document.body).fontSize,
  };
})())`;
const r = await send('Runtime.evaluate', { expression: expr, contextId: ev.executionContextId, returnByValue: true });
console.log('LAYOUT ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);