# DSH-Mobile

在手机上「流转」 DeepSeek Harness 官方 Web 界面的移动配套 App——配对一次，之后随时在手机上查看/控制电脑上的 DSH 会话。

## 特性

- **扫码 / 手动配对**：扫描 `dsh web → 设置 → 插件 → 手机访问` 的二维码，或手动输入地址
- **历史记录（免重复扫码）**：配对以 **AndroidKeyStore AES-GCM 加密**存储，重开 App 即达
- **PIN 自动化**：dsh-pocket 的访问密码（局域网/公网）首次输入后自动原生登录，之后免输
- **整页承载官方 UI**：远程页以 top-level 导航加载（非 iframe），会话 cookie / WebSocket 完整工作；移动端窄屏适配由服务端 dsh-web-mobile 插件完成
- **原生 App 交互**：沉浸式无浏览器导航栏，Android 返回键回配对列表
- **zh/en 双语切换**：跟随系统语言，可在 App 内随时切换
- **深色模式跟随**：与 DSH 的 `data-ds-dark-theme` 同步
- **局域网 + 公网**：同 WiFi 直连；公网走 cloudflared 快速隧道（URL 每次重启轮换）
- **更新提示**：校验 GitHub Releases，有新版本时提示
- **常驻状态通知（同步原生进度）**：通知栏持续显示电脑 DSH 输入框上方的原生状态文本（如 `Deep diving...1分45秒`），逐秒同步；任务结束/停止自动转为「已完成 · 本次用时」——不用打开 App 就能看进度
- **HITL 提醒**：需要审批 / agent 提问时，瞬态弹窗提示（不会频繁打扰）
- **配对状态徽标**：配对列表实时显示在线 / 离线 / 受密码保护（`.` 绿/红/锁）
- **通知权限**：Android 13+ 首次使用拉起系统授权弹窗，之后常驻状态条可选清除

## 架构

```
┌──────────────┐  扫码/手动配对          ┌────────────────────────────┐
│ DSH-Mobile   │ ─────────────────────→  │ 电脑端 dsh web (:3080)     │
│ Capacitor    │  URL (LAN :3081 或      │  ├ 官方 DSH Web UI          │
│ Android 壳   │  公网 trycloudflare)    │  ├ .Md3f7G_turnStatus 原生  │
│  ├ SecureStore (Keystore 加密)         │  │  状态文本（输入框上方）   │
│  ├ AuthBridge (原生 PIN 登录/导航)     │  └ dsh-pocket 代理(PIN 门)  │
│  ├ QrScanner (CameraX+ZXing, 无 GMS)   └────────────────────────────┘
│  ├ MainActivity 状态轮询 → 常驻通知 │
│  └ DsEventWatcher (WS) → HITL 弹窗 │
└──────────────┘
```

- `AuthBridgePlugin.check()` 用无 cookie 探测判断远程是否受 PIN 保护
  （避免已种 cookie 造成误判）；`login()` 原生 POST `/pocket-login` 拿会话
  token；`open()` 整页导航使远程成为 top-level（同站 cookie 天然生效）。
- 断线/HTTP 错误由 `MainActivity` 原生监听并弹 Toast 提示。
- **状态通知**：`MainActivity` 每 2s 向 DSH 页面注入脚本读取 `.Md3f7G_turnStatus`
  的原生文本（`Deep diving...` / 计时），镜像为常驻通知（id=100）；连续
  4 次读到相同文本判定任务结束 → 转「已完成 · 本次用时」。**不自计时，
  与 DSH 界面显示完全一致**。
- **HITL 提醒**：`DsEventWatcher`（手写最小 WebSocket 客户端）订阅
  `/api/events.mux`（会话 cookie 由 `AuthBridgePlugin.open()` 从 CookieManager
  读取后传入，**不硬编码**），当出现 `approval/asked` / `approval/requested` /
  ask-question 类事件时弹瞬态通知（审批/提问才打扰）。

## 需要安装什么

分三端：**电脑端**（运行 DSH + 两个插件）、**构建端**（编译 APK）、**手机端**（安装 App）。

### 电脑端（被控端，必须）

| 内容 | 说明 |
|---|---|
| Node.js 20+ | DSH 运行环境 |
| `dsh`（`@deepseek-ai/dsh`） | DeepSeek Harness 本体，`dsh web` 启动 Web UI（127.0.0.1:3080） |
| `dsh-pocket` 插件 | 反向代理 + PIN 门（本仓库 `plugins/dsh-pocket`，GPL-2.0） |
| `dsh-web-mobile` 插件 | 移动端页面适配（本仓库 `plugins/dsh-web-mobile`，MIT） |

> 公网隧道用的 `cloudflared` 由 dsh-pocket 在首次开启公网访问时自动下载，无需手动安装。

### 构建端（编译 App，仅开发者需要）

| 内容 | 说明 |
|---|---|
| JDK 21 | Capacitor 8 / AGP 8.13 要求（如 `~/.jdks/openjdk-21.0.1`） |
| Android SDK | compileSdk 36（含 platform-tools / adb） |
| Node.js + npm | `app/` 前端依赖与 `cap` 工具链 |

### 手机端

- Android 8+（minSdk 24）
- 与电脑同一局域网（或电脑开启公网隧道）

## 快速开始

### 使用介绍（用户视角）

1. **电脑端**：装好 `dsh` + 两个插件（见下），`dsh web` 保持运行
2. **配对**：打开手机 App → 「扫码配对」扫电脑 DSH 设置里的二维码；局域网内可直接扫，人在外面就先用电脑端「开启公网访问」再扫公网二维码
3. **首次输入 PIN**：App 自动登录 dsh-pocket 的访问密码（8 位数字），并用 AndroidKeyStore 加密保存，之后免输
4. **日常使用**：打开 App 即进入电脑 DSH 的官方界面——看会话、发消息、控制 agent；关掉 App 也能通过常驻通知看到电脑上的进度，需要你审批/回答时才弹提醒

### 电脑端插件

```sh
# 方式 A：从本仓库本地源码安装（开发/二开）
dsh plugin --profile web add link:/path/to/DSH-Mobile/plugins/dsh-pocket
dsh plugin --profile web add link:/path/to/DSH-Mobile/plugins/dsh-web-mobile

# 方式 B：从 npm 安装（普通用户）
dsh plugin --profile web add dsh-pocket -w
dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile

# 重启 dsh web 生效
npx @deepseek-ai/dsh web
```

安装后：设置 → 插件 → 「手机访问」→ 手机扫局域网二维码；点「开启公网访问」出公网二维码。

> 局域网访问密码（`lanAuthEnabled`）默认开启——安全默认。App 首次连接会引导输入
> 8 位 PIN 并加密保存；也可在插件设置里关闭（仅建议个人自用网络）。

### 构建 App（Android）

```sh
cd app
npm install
npx cap sync android
cd android
# JDK 21 环境变量示例（按实际路径）
$env:JAVA_HOME="$env:USERPROFILE\.jdks\openjdk-21.0.1"
.\gradlew.bat :app:assembleDebug
# 真机安装
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

### Release 签名（分发 APK 前）

```sh
powershell -File scripts/init-release-signing.ps1   # 生成 keystore（仅一次）
cd app/android
.\gradlew.bat :app:assembleRelease                  # 输出 app-release.apk
```

无 keystore 时 release 构建自动退回 debug 签名（CI/本地验证可用）。

## 仓库结构

```
docs                    市场调研 / 方案分析 / 本地验证记录 / App 架构
plugins/dsh-pocket      dsh-pocket 上游源码（GPL-2.0，链接安装）
plugins/dsh-web-mobile  dsh-web-mobile 上游源码（MIT，链接安装）
app                      Capacitor Android 工程（www 前端 + 原生插件）
scripts                  构建辅助、CDP 调试、事件流观察、图标生成、签名引导
scripts/lib/pocket-auth.cjs  运行时获取 dsh-pocket 会话 cookie（脚本共用，不硬编码密钥）
UPSTREAM.md              上游源码版本记录
```

> `scripts/` 下的事件流观察脚本（`listen-*.cjs`、`scan-bundle*.mjs`）会自动通过
> `lib/pocket-auth.cjs` 读取电脑本地 `~/.dsh/dsh-pocket/token-lan` 里的 PIN 现场登录，
> 或读取 `DSH_POCKET_COOKIE` 环境变量——**不要把任何 cookie / PIN 硬编码进脚本或提交到仓库**。
```

## 上游与许可

| 组件 | 上游 | 许可 | 版本 |
|---|---|---|---|
| `plugins/dsh-pocket` | [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) | GPL-2.0 | v1.13.4 |
| `plugins/dsh-web-mobile` | [mexiaosqwq/dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) | MIT | v2.1.1 |
| Capacitor | [capacitorjs](https://capacitorjs.com) | MIT | 8.x |
| AndroidX / CameraX / ZXing | Android | Apache-2.0 | — |

**注意**：`dsh-pocket` 二开 / 分发需遵循 GPL-2.0（修改后须开源同许可并保留版权声明）。
本仓库对本项目的修改欢迎以 GPL-2.0 开源贡献。App 壳（Capacitor + 自研插件）为 MIT 可随用。

## 安全提示

- DSH 能执行电脑上的代码：配对 URL / PIN / 会话 cookie 就是钥匙，**不要分享给别人**
- `dsh_pocket_token` cookie 是会话凭证（30 天有效）：拿到它 + 隧道 URL 就能
  完全控制你的 DSH 会话——**不要写进代码、提交到仓库、或发到任何地方**
- 公网 URL 每次重启轮换；局域网 PIN 建议保持开启
- 配对数据在设备端以 AndroidKeyStore 加密存储

## 相关文档

- [`docs/01-市场调研与方案分析.md`](docs/01-市场调研与方案分析.md) — 生态调研与两条路线决策
- [`docs/02-本地验证记录.md`](docs/02-本地验证记录.md) — 真机联调踩坑与结论
- [`docs/03-App壳架构.md`](docs/03-App壳架构.md) — App 壳设计决策
- [`docs/04-状态通知与HITL提醒.md`](docs/04-状态通知与HITL提醒.md) — 状态条 / HITL 弹窗实现