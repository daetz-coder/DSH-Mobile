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
- **连接状态指示**：配对列表实时显示在线 / 离线 / 受密码保护
- **局域网 + 公网**：同 WiFi 直连；公网走 cloudflared 快速隧道（URL 每次重启轮换）
- **更新提示**：校验 GitHub Releases，有新版本时提示

## 架构

```
┌──────────────┐  扫码/手动配对          ┌────────────────────────────┐
│ DSH-Mobile   │ ─────────────────────→  │ 电脑端 dsh web (:3080)     │
│ Capacitor    │  URL (LAN :3081 或      │  ├ 官方 DSH Web UI          │
│ Android 壳   │  公网 trycloudflare)    │  └ dsh-pocket 代理(PIN 门)  │
│  ├ SecureStore (Keystore 加密)         └────────────────────────────┘
│  ├ AuthBridge (原生 PIN 登录/导航)
│  └ QrScanner (CameraX+ZXing, 无 GMS)
└──────────────┘
```

- `AuthBridgePlugin.check()` 用无 cookie 探测判断远程是否受 PIN 保护
  （避免已种 cookie 造成误判）；`login()` 原生 POST `/pocket-login` 拿会话
  token；`open()` 整页导航使远程成为 top-level（同站 cookie 天然生效）。
- 断线/HTTP 错误由 `MainActivity` 原生监听并弹 Toast 提示。

## 环境要求

- 电脑：Node 20+，已装 `dsh`（`@deepseek-ai/dsh`），`dsh web` 运行中
- 构建 App：JDK 21（Capacitor 8 / AGP 8.13 要求）、Android SDK（compileSdk 36）
- 手机：Android 8+（minSdk 24）

## 快速开始

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
scripts                  构建辅助、CDP 调试、图标生成、签名引导
UPSTREAM.md              上游源码版本记录
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

- DSH 能执行电脑上的代码：配对 URL / PIN 就是钥匙，**不要分享给别人**
- 公网 URL 每次重启轮换；局域网 PIN 建议保持开启
- 配对数据在设备端以 AndroidKeyStore 加密存储

## 相关文档

- [`docs/01-市场调研与方案分析.md`](docs/01-市场调研与方案分析.md) — 生态调研与两条路线决策
- [`docs/02-本地验证记录.md`](docs/02-本地验证记录.md) — 真机联调踩坑与结论
- [`docs/03-App壳架构.md`](docs/03-App壳架构.md) — App 壳设计决策