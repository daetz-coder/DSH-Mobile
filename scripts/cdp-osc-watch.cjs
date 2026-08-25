// Overscroll-translation watcher: while the user overscrolls the DSH page,
// record whether ANY element's getBoundingClientRect changes (i.e. the page
// view itself was translated) vs only inner scrollTop changing.
// Finds the DSH internal scroll container plus candidate top bars, then
// samples geometry on scroll/overscroll.
const NODE_PATH_GLOBAL = 'C:\\Users\\ASUS\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules';
process.env.NODE_PATH = NODE_PATH_GLOBAL;
require('module').Module._initPaths();
const WebSocket = require('ws');

(async () => {
  const list = await (await fetch('http://127.0.0.1:9223/json')).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) { console.error('no page target'); process.exit(1); }
  console.log('target:', page.title);

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
  const { executionContextId } = await send('Page.createIsolatedWorld', { worldName: 'osc-probe' });
  async function evalIn(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, contextId: executionContextId, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : null;
  }

  // Install a watcher in the page: captures geometric translation of the
  // scrolling element and of every fixed/sticky candidate, on scroll.
  await evalIn(`(function(){
    window.__oscLog = window.__oscLog || [];
    const rec = (kind) => {
      const de = document.scrollingElement || document.documentElement;
      const scrollers = [];
      document.querySelectorAll('*').forEach(el => {
        if (el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 50) {
          scrollers.push({ cls: (el.className||'').toString().slice(0,40), oy: el.scrollTop, ch: el.clientHeight });
        }
      });
      const fixed = [];
      document.querySelectorAll('*').forEach(el => {
        const p = getComputedStyle(el).position;
        if (p === 'fixed' || p === 'sticky') fixed.push({
          cls: (el.className||'').toString().slice(0,40), top: Math.round(el.getBoundingClientRect().top), pos: p
        });
      });
      window.__oscLog.push({ kind, t: Date.now(), de: { y: de.scrollTop, ch: de.clientHeight, sh: de.scrollHeight },
        sc: scrollers.slice(0,6), fx: fixed.slice(0,8) });
      if (window.__oscLog.length > 40) window.__oscLog.shift();
    };
    window.addEventListener('scroll', () => rec('scroll'), { passive: true, capture: true });
    window.addEventListener('touchmove', () => rec('touch'), { passive: true, capture: true });
    rec('init');
    return 'watcher installed';
  })()`);

  console.log('WATCHER INSTALLED — now overscroll on the phone (scroll message list to its end/start and keep pulling). I will sample for 20s.');
  // Poll the log until stable.
  await new Promise((r) => setTimeout(r, 20000));
  const log = await evalIn('JSON.stringify(window.__oscLog || [])');
  console.log('LOG ' + log);
  ws.close();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });