// CDP: trigger the notification permission request and a test notification.
const pages = await (await fetch('http://127.0.0.1:9223/json')).json();
const page = pages.find((p) => p.url === 'http://localhost/');
if (!page) { console.error('no shell page'); process.exit(1); }
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

// 1) request permission
const r1 = await send('Runtime.evaluate', {
  expression: `(async () => { const m = await import('./js/notify.js'); const ok = await m.ensurePermission(); return 'perm:' + ok; })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log('STEP1 ' + JSON.stringify(r1.result && r1.result.value));
await new Promise((r) => setTimeout(r, 1500));

// 2) fire test notification
const r2 = await send('Runtime.evaluate', {
  expression: `(async () => { const m = await import('./js/notify.js'); await m.testNotification(); return 'fired'; })()`,
  awaitPromise: true,
  returnByValue: true,
});
console.log('STEP2 ' + JSON.stringify(r2.result && r2.result.value));
ws.close();
process.exit(0);