// Scan DSH bundle for slash-event strings and words like question/approval/ask/consent.
const res = await fetch('http://192.168.95.115:3081/assets/index-C-1AiF3k.js', {
  headers: { Cookie: 'dsh_pocket_token=741f9929ec7b13efe518dc8b81bc31d0aece274ae6ff1dbf9892274cb6e696e5' },
});
const t = await res.text();

// 1) all quoted "xxx/yyy" slash tokens (likely event names)
const slash = new Set();
let m;
const re1 = /["'`]([a-z][a-z0-9_-]*\/[a-z0-9._/-]*)[a-z0-9/_-]*["'`]/gi;
while ((m = re1.exec(t)) !== null) slash.add(m[1]);
console.log('SLASH_TOKENS: ' + JSON.stringify([...slash].filter(x => !x.includes('http') && !x.includes('://')).slice(0, 60)));

// 2) words containing ask/question/approval/permission/consent/intervention
const kw = new Set();
const re2 = /[A-Za-z_-]*(ask|question|approval|permission|consent|intervention|human|inbox)[A-Za-z_-]*/gi;
while ((m = re2.exec(t)) !== null) { if (m[0].length > 3) kw.add(m[0]); }
console.log('KEYWORDS: ' + JSON.stringify([...kw].slice(0, 40)));