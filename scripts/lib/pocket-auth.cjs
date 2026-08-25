// pocket-auth.cjs — 运行时获取 dsh-pocket 会话 cookie（不硬编码任何密钥）。
//
// 为什么需要它：DSH 的 /api/events.mux 事件流走 dsh-pocket 代理（3081），
// 即使是 loopback 连接也要求 dsh_pocket_token cookie（实测无 cookie 返回 401）。
// 该 cookie 是会话凭证：绑定 dsh web 进程的 sessionKey，30 天有效，等价于
// 「能操作电脑上 DSH 会话」的钥匙（DSH 能执行代码）。因此绝不能写死在
// 源码/仓库里——本 helper 在运行时刻获取：
//   1) 环境变量 DSH_POCKET_COOKIE（显式注入，最高优先）
//   2) 否则读取 $DSH_HOME/dsh-pocket/token-lan（或 token）中的 8 位 PIN，
//      向 /pocket-login 提交登录，从 302 响应的 Set-Cookie 取回 cookie。
//
// 用法（CJS）：
//   const { obtainCookie } = require('./lib/pocket-auth.cjs');
//   const cookie = await obtainCookie(); // 例：'dsh_pocket_token=<hex>'
//
// 用法（ESM）：
//   import { createRequire } from 'module';
//   const { obtainCookie } = createRequire(import.meta.url)('./lib/pocket-auth.cjs');

const http = require('http');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');
const os = require('os');

const COOKIE_NAME = 'dsh_pocket_token';
const PIN_RE = /^\d{8}$/;

/** DSH 数据目录：优先 $DSH_HOME，否则 ~/.dsh */
function dshHome() {
  return process.env.DSH_HOME || join(os.homedir(), '.dsh');
}

/** 用 PIN 向 /pocket-login 登录，返回 302 响应里的 Set-Cookie 头（原始串）。 */
function postLogin(base, pin) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(base); } catch { reject(new Error(`bad base URL: ${base}`)); return; }
    const body = `token=${encodeURIComponent(pin)}`;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port || 80,
        path: '/pocket-login',
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume(); // 丢弃响应体，避免挂起
        const sc = res.headers['set-cookie'];
        resolve({ status: res.statusCode, setCookie: Array.isArray(sc) ? sc.join(', ') : (sc || '') });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/**
 * 获取 dsh_pocket_token cookie（完整 "name=value" 串）。
 * @param {{base?: string}} [opts] base 为代理地址，默认 http://127.0.0.1:3081
 * @returns {Promise<string>} 形如 'dsh_pocket_token=<hex>'；失败抛错。
 */
async function obtainCookie({ base = 'http://127.0.0.1:3081' } = {}) {
  if (process.env.DSH_POCKET_COOKIE) {
    return /^dsh_pocket_token=/.test(process.env.DSH_POCKET_COOKIE)
      ? process.env.DSH_POCKET_COOKIE
      : `${COOKIE_NAME}=${process.env.DSH_POCKET_COOKIE}`;
  }
  const dir = join(dshHome(), 'dsh-pocket');
  const lastErr = [];
  for (const name of ['token-lan', 'token']) {
    const f = join(dir, name);
    if (!existsSync(f)) { lastErr.push(`${f} 不存在`); continue; }
    const pin = readFileSync(f, 'utf8').trim();
    if (!PIN_RE.test(pin)) { lastErr.push(`${f} 不是 8 位数字 PIN`); continue; }
    const { status, setCookie } = await postLogin(base, pin);
    const m = String(setCookie).match(/(?:^|,\s*)dsh_pocket_token=([^;]+)/);
    if (status === 302 && m) return `${COOKIE_NAME}=${m[1]}`;
    lastErr.push(`${name}: 登录失败 (HTTP ${status})`);
  }
  throw new Error(
    `无法获取 dsh-pocket 会话 cookie。${lastErr.join('；')}。` +
    '请确认 dsh web 与 dsh-pocket 插件正在运行；或设置环境变量 DSH_POCKET_COOKIE=<cookie值>。',
  );
}

module.exports = { obtainCookie, dshHome, COOKIE_NAME };
