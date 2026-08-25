// CDP probe: inspect the remote DSH page scroll architecture (CJS).
const NODE_PATH_GLOBAL = 'C:\\Users\\ASUS\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules';
process.env.NODE_PATH = NODE_PATH_GLOBAL;
require('module').Module._initPaths();
const WebSocket = require('ws');

const LIST_URL = 'http://127.0.0.1:9223/json';
(async () => {
  const list = await (await fetch(LIST_URL)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) { console.error('no page target'); process.exit(1); }
  console.log('target:', page.title, page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
  const pending = new Map();
  let seq = 0;
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  function send(method, params = {}) {
    return new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  }
  await new Promise((res) => ws.on('open', res));

  const { executionContextId } = await send('Page.createIsolatedWorld', { worldName: 'dsh-probe' });
  async function evalIn(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, contextId: executionContextId, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : null;
  }

  const probe = String.raw`(function(){
    const out = {};
    const de = document.documentElement, b = document.body;
    out.url = location.href;
    out.scr = { x: window.scrollX, y: window.scrollY };
    out.docH = { deH: de.scrollHeight, deCH: de.clientHeight, bH: b ? b.scrollHeight : 0, bCH: b ? b.clientHeight : 0 };
    out.scrollers = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      if (el.scrollHeight > el.clientHeight + 4) out.scrollers.push({
        tag: el.tagName, cls: (el.className||'').toString().slice(0,60),
        id: el.id, sh: el.scrollHeight, ch: el.clientHeight,
        oy: el.scrollTop, os: getComputedStyle(el).overflowY
      });
    }
    out.scrollers = out.scrollers.slice(0, 12);
    out.fixed = [];
    for (const el of all) {
      const p = getComputedStyle(el).position;
      if ((p === 'fixed' || p === 'sticky') && el.getBoundingClientRect().top < 250) out.fixed.push({
        tag: el.tagName, cls: (el.className||'').toString().slice(0,50), id: el.id, pos: p,
        top: Math.round(el.getBoundingClientRect().top), z: getComputedStyle(el).zIndex
      });
    }
    out.fixed = out.fixed.slice(0, 12);
    out.guard = !!document.getElementById('dsh-osc-guard');
    out.viewport = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, sbH: (b && b.getBoundingClientRect && b.getBoundingClientRect().top) };
    return out;
  })()`;

  console.log('RESULT ' + JSON.stringify(await evalIn(probe), null, 1));
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });