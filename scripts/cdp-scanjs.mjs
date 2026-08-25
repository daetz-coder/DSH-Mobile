// CDP: scan the DSH page's loaded JS for event-type constants related to
// questions/approval, by checking resource contents in runtime.
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

// Fetch the main JS bundle and grep for relevant strings
const r = await send('Runtime.evaluate', {
  expression: `(async () => {
    const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
    let found = [];
    for (const src of scripts.slice(0, 6)) {
      try {
        const res = await fetch(src);
        const text = await res.text();
        const patterns = [/ask\\_user/, /user\\-question/, /question\\/request/, /approval\\/request/, /permission\\/request/, /"question"/, /"approval"/, /'question'/, /'approval'/];
        for (const p of patterns) {
          const m = text.match(p);
          if (m) found.push({ src: src.split('/').pop(), match: m[0], ctx: text.slice(Math.max(0, m.index - 40), m.index + 60) });
        }
      } catch (e) {}
    }
    return found;
  })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log('JS_SCAN ' + JSON.stringify(r.result && r.result.value, null, 1));
ws.close();
process.exit(0);