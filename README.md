# <img src="assets/app-icon.png" width="32" height="32" alt="DSH-Mobile icon"> DSH-Mobile — DeepSeek Harness, in your pocket

**English** | [中文](README.zh.md)

<p align="center">
  <img src="https://img.shields.io/badge/platform-Android-3ddc84" alt="platform: Android">
  <img src="https://img.shields.io/badge/Android-8%2B-3ddc84" alt="Android 8+">
  <img src="https://img.shields.io/badge/Capacitor-8-3880ff" alt="Capacitor 8">
  <img src="https://img.shields.io/badge/version-1.0-blue" alt="version 1.0">
  <img src="https://img.shields.io/badge/license-GPL--2.0%20%2F%20MIT-blue" alt="license">
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/dsh--plugin-community-brightgreen" alt="dsh-plugin"></a>
</p>

<p align="center">
  <img src="assets/promo-poster.png" alt="DSH-Mobile promo poster" width="80%">
</p>

> **Pair once by QR code — then watch and control your desktop DeepSeek Harness from your phone, anywhere.**
> 扫码配对一次，之后随时随地用手机查看/控制电脑上的 DeepSeek Harness。

**DSH-Mobile** is a native Android companion app for the official
[DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness)
Web UI. Pair it with your desktop `dsh web` once by QR code, and from then on
the official DSH interface is always in your pocket — browse sessions, send
messages and control agents, even when the app is closed: a persistent
notification mirrors the desktop's native progress text second-by-second.

## ✨ What it does

| Capability | Description |
|------------|-------------|
| 📷 **Scan-to-pair** | Scan the QR code from `dsh web → Settings → Plugins → Phone access`, or enter the URL manually |
| 🔐 **PIN auto-login** | The first 8-digit PIN entry is handled automatically and stored **encrypted**; pairing history survives app restarts |
| 🖥️ **Official UI, full-page** | The DSH interface loads as a top-level page — no iframe, everything works exactly like the desktop browser |
| 🔔 **Live status notification** | A persistent notification mirrors the desktop status line (`Deep diving...1分45秒`) second-by-second, and turns into `已完成 · 本次用时` when the run ends — no guessing, it always matches the desktop |
| 🌐 **LAN + public tunnel** | Direct connection on the same Wi-Fi; cloudflared quick tunnel when you're away (URL rotates per restart) |
| 🌙 **Dark mode + bilingual** | Follows DSH's theme; zh/EN switching inside the app |
| 📶 **Pairing status dots** | Online / offline / password-protected shown right in the pairing list |
| 🔔 **Notification permission** | Android 13+ permission prompt on first launch |

> Desktop DSH is the cockpit; DSH-Mobile is the copilot in your pocket.

## 📸 Screenshots

![DSH-Mobile screens: access view and conversation view](assets/screens.png)

## 🚀 Quick start

1. **Desktop** — install the two server-side plugins, then start `dsh web`:

   ```sh
   # Option A — from the dshmarket plugin market (recommended)
   dsh plugin --profile web add dshmarket
   # then install inside DSH: Settings → Plugins → Market →
   #   dsh-pocket  (shaobeichen/dsh-pocket)
   #   dsh-web-mobile  (mexiaosqwq/dsh-web-mobile)

   # Option B — direct install
   dsh plugin --profile web add dsh-pocket -w
   dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile

   npx @deepseek-ai/dsh web
   ```

   Plugin market: [dshmarket.com](https://dshmarket.com)
   ([dsh-pocket](https://dshmarket.com/p/shaobeichen/dsh-pocket/) ·
   [dsh-web-mobile](https://dshmarket.com/p/mexiaosqwq/dsh-web-mobile/)).
   Tested versions (recommended for DSH-Mobile v1.0.0): **dsh-pocket v1.13.4** ·
   **dsh-web-mobile v2.1.1** — no other extensions are required.

2. **Phone** — install DSH-Mobile (APK from [Releases](https://github.com/daetz-coder/DSH-Mobile/releases), or sideload).

3. **Pair** — open the app, scan the QR code from `dsh web → Settings → Plugins → Phone access`, enter the 8-digit PIN once — done 🎉.

> The LAN access PIN is **on by default** (the secure default). After the
> first encrypted PIN entry, later launches need no re-entry.

## Usage

1. Keep `dsh web` running on your desktop with both plugins installed.
2. Open the app and tap the pairing (or scan the QR code again) — the official
   DSH interface opens full-page.
3. Browse sessions, send messages and control agents as usual.
4. Close the app whenever you like — the status notification keeps you
   informed, and the pairing list shows online / offline / protected status.

## 🔐 Security

- **DSH can execute code on your PC** — the pairing URL, PIN and session
  cookie are the keys. Never share them, never commit them, never paste them
  into a public place.
- The PIN lives on your **desktop** (`~/.dsh/dsh-pocket/`); your phone only
  holds an encrypted pairing record, so extracting the APK reveals nothing.
- Public tunnel URLs rotate on every restart; keep the LAN PIN enabled.

## 📦 Distribution

| Channel | How |
|---------|-----|
| **GitHub Release** | APK attached to each tag (debug + release built by CI) |
| **Sideload** | `adb install -r app-debug.apk`, or open the APK on the phone |
| **Build from source** | see *For developers* below |

## For developers

- Build the APK: `cd app && npm install && npx cap sync android`, then
  `cd android && .\gradlew.bat :app:assembleDebug` (JDK 21 required)
- Vendored plugins: `dsh-pocket` v1.13.4 (GPL-2.0), `dsh-web-mobile` v2.1.1 (MIT)

## License

Dual-licensed by component:

- **App shell** (Capacitor project + native plugins in `app/`): **MIT**
- **`plugins/dsh-pocket`** ([shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket),
  vendored upstream, forked/derived): **GPL-2.0** — modifications/distribution
  must stay GPL-2.0 with the copyright notice
- **`plugins/dsh-web-mobile`** ([mexiaosqwq/dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile),
  vendored upstream): **MIT**

Build with [Capacitor](https://capacitorjs.com) (MIT) and the official
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

> **For users installing via [dshmarket.com](https://dshmarket.com):** the two
> plugins are governed by their own licenses — **dsh-pocket is GPL-2.0**
> (any modified distribution must stay GPL-2.0), **dsh-web-mobile is MIT**.
> This app (DSH-Mobile) is MIT-licensed independently; it does not impose any
> additional license on the plugins.