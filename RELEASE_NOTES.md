# DSH-Mobile v1.0.2

> 把 DeepSeek Harness 装进口袋 · Pair once by QR code — then watch and control your desktop DeepSeek Harness from your phone, anywhere.

## 本版修改 · What's new

### 🛠️ 修复 · Fixed

- **修复对话滑动卡顿 / 无法滚动**（OPPO 等部分机型）
  - 之前 overscroll 保护每 2 秒重建样式规则，造成全页样式反复重算，导致滚动时好时坏、甚至卡死。
  - 改为**只标记真实滚动容器**（`data-dsh-osc` + `overscroll-behavior: contain`）一次性生效，滚动恢复顺滑，overscroll 保护依旧保留。
  - Fixed conversation scrolling jank / freeze (OPPO and similar): the overscroll guard no longer rebuilds CSS rules on every poll — it marks only the real scroll container once, so scrolling stays smooth while the header protection is kept.

### 🛠️ 修复 · Fixed (from v1.0.1)

- **顶栏不再被拖进状态栏**（edge-to-edge 机型）：消息列表滑到边界后继续拉动，固定头部（对话列表 / 后台任务按钮）不再跑到电量/Wi-Fi/信号区域、不可点击。
- **移除多余权限申请**：不再请求 `RECEIVE_BOOT_COMPLETED` / `WAKE_LOCK` / `SCHEDULE_EXACT_ALARM`，现在只申请必需的 `INTERNET` / `CAMERA` / `POST_NOTIFICATIONS`。
- **稳定 Release 签名**：改用固定 keystore 签名，之后所有版本都可平滑覆盖升级，不再出现签名冲突。

## 📦 下载 · Download

- **APK**: `DSH-Mobile.apk`（当前附件）
- **落地页**: https://daetz-coder.github.io/DSH-Mobile/
- **Obtainium 自动更新**: 添加 `https://github.com/daetz-coder/DSH-Mobile` 为应用源

## 🧩 配套插件 · Companion plugins

- **dsh-pocket** v1.13.4 · **dsh-web-mobile** v2.1.1（已实测，无需其他扩展）