# <img src="assets/app-icon.png" width="32" height="32" alt="DSH-Mobile 图标"> DSH-Mobile —— 把 DeepSeek Harness 装进口袋

[English](README.md) | **中文**

<p align="center">
  <img src="https://img.shields.io/badge/platform-Android-3ddc84" alt="平台：Android">
  <img src="https://img.shields.io/badge/Android-8%2B-3ddc84" alt="Android 8+">
  <img src="https://img.shields.io/badge/Capacitor-8-3880ff" alt="Capacitor 8">
  <img src="https://img.shields.io/badge/version-1.0-blue" alt="版本 1.0">
  <img src="https://img.shields.io/badge/license-GPL--2.0%20%2F%20MIT-blue" alt="许可：GPL-2.0 / MIT">
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/dsh--plugin-community-brightgreen" alt="dsh-plugin"></a>
</p>

<p align="center">
  <img src="assets/promo-poster.png" alt="DSH-Mobile 宣传海报" width="80%">
</p>

> **扫码配对一次，之后随时随地用手机查看/控制电脑上的 DeepSeek Harness。**
> **Pair once by QR code — then watch and control your desktop DeepSeek Harness from your phone, anywhere.**

**DSH-Mobile** 是官方 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)
Web 界面的**安卓原生配套 App**。用二维码与电脑端 `dsh web` 配对一次，之后官方 DSH
界面就一直在你口袋里——看会话、发消息、控制 agent；即使关掉 App，通知栏也会
**逐秒同步**桌面上的原生进度文本。

## ✨ 它能做什么

| 能力 | 说明 |
|------|------|
| 📷 **扫码配对** | 扫 `dsh web → 设置 → 插件 → 手机访问` 的二维码，或手动输入地址 |
| 🔐 **PIN 自动登录** | 首次输入的 8 位访问密码自动**加密保存**；配对历史重开即达，免重复扫码 |
| 🖥️ **官方界面整页呈现** | DSH 界面以 top-level 页面加载（非 iframe），与桌面浏览器完全一致 |
| 🔔 **常驻状态通知** | 通知栏逐秒同步桌面状态文本（`Deep diving...1分45秒`），任务结束自动转「已完成 · 本次用时」——不自计时，与桌面显示永远一致 |
| 🌐 **局域网 + 公网** | 同一 WiFi 直连；外出走 cloudflared 快速隧道（URL 每次重启轮换） |
| 🌙 **深色模式 + 双语** | 跟随 DSH 的主题；App 内 zh/en 随时切换 |
| 📶 **配对状态徽标** | 配对列表实时显示在线 / 离线 / 受密码保护 |
| 🔔 **通知权限** | Android 13+ 首次使用拉起系统授权 |

> 桌面 DSH 是驾驶舱，DSH-Mobile 是口袋里的副驾。

## 📸 运行效果

![DSH-Mobile 运行截图：外部访问界面与对话显示界面](assets/screens.png)

## 🚀 快速开始

1. **电脑端** —— 安装两个服务端插件，然后启动 `dsh web`：

   ```sh
   dsh plugin --profile web add dsh-pocket -w
   dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile
   npx @deepseek-ai/dsh web
   ```

2. **手机端** —— 安装 DSH-Mobile（[Releases](https://github.com/daetz-coder/DSH-Mobile/releases)
   下载 APK，或直接侧载）。

3. **配对** —— 打开 App，扫 `dsh web → 设置 → 插件 → 手机访问` 的二维码，
   输入一次 8 位 PIN —— 完成 🎉。

> 局域网访问密码**默认开启**（安全默认）。首次加密输入后，之后免输。

## 使用

1. 电脑端保持 `dsh web` + 两个插件运行。
2. 打开 App 点击配对（或重新扫码）——官方 DSH 界面整页打开。
3. 正常看会话、发消息、控制 agent。
4. 随时关掉 App——常驻状态通知继续盯进度，配对列表显示在线 / 离线 / 受保护状态。

## 🔐 安全

- **DSH 能在你电脑上执行代码**——配对 URL / PIN / 会话 cookie 就是钥匙：
  不要分享、不要提交进仓库、不要贴到任何公开地方。
- PIN 存在电脑端（`~/.dsh/dsh-pocket/`）；手机只持有加密配对记录，
  拆开 APK 也拿不到敏感信息。
- 公网 URL 每次重启轮换；局域网 PIN 建议保持开启。

## 📦 分发

| 渠道 | 方式 |
|------|------|
| **GitHub Release** | 打 tag 后 CI 自动构建 debug + release APK |
| **侧载** | `adb install -r app-debug.apk`，或手机直接打开 APK |
| **源码构建** | 见下方「给开发者」 |

## 给开发者

- 源码结构、设计笔记与验证记录：[docs/](docs/)
- 构建 APK：`cd app && npm install && npx cap sync android`，
  再 `cd android && .\gradlew.bat :app:assembleDebug`（需 JDK 21）
- 二开上游及具体版本：[UPSTREAM.md](UPSTREAM.md)

## License

按组件双许可：

- **App 壳**（`app/` 的 Capacitor 工程 + 自研原生插件）：**MIT**
- **`plugins/dsh-pocket`**（[shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket)
  二开上游）：**GPL-2.0**——修改/分发必须保持 GPL-2.0 并保留版权声明
- **`plugins/dsh-web-mobile`**（[mexiaosqwq/dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile)
  二开上游）：**MIT**

基于 [Capacitor](https://capacitorjs.com)（MIT）与官方
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 构建。
具体二开版本见 [UPSTREAM.md](UPSTREAM.md)。