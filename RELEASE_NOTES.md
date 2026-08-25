# DSH-Mobile v1.0.3

> 把 DeepSeek Harness 装进口袋 · Pair once by QR code — then watch and control your desktop DeepSeek Harness from your phone, anywhere.

## 本版修改 · What's new

### 🛠️ 修复 · Fixed

- **扫码配对稳定可用**（本版核心）
  - 修复「第一次扫码正常、第二次无法扫描且无法退出」：扫描状态重置 + 退出流程幂等化，连续进出扫码不再卡住。
  - Fixed QR scan reliability: the second scan now decodes again and exit
    (✕) always works — state reset + idempotent teardown.
- **配对去重**：同一 URL 重复扫码只更新已有配对，不再产生重复条目。
  - Pairings are de-duplicated by URL — re-scanning updates instead of
    duplicating.
- **防重入**：双击配对项 / 连点扫码不再触发重复导航或重叠相机会话。
  - Guarded against double-tap / overlapping scans.
- **存储与并发健壮性**：修复事件监听线程泄漏、登录竞态、加密存储键哈希
  碰撞（含旧数据自动迁移）。
  - Watcher thread leak, login race and storage key collisions fixed
    (legacy data migrates automatically).
- **扫码关闭按钮**：加大到 44dp、避开系统状态栏，并美化为 DSH 风格的
  深色玻璃圆钮（细白描边 + 白色 ✕）。
  - The QR close button is bigger (44dp), clear of the status bar, and
    restyled to a flat DSH-style glass circle.

### 🎨 外观 · Visual

- README 与落地页的手机截图改为两张独立图片（带图注），不再是一张容易
  误认的合并图。
  - Phone screenshots shown as two separate images with captions.

## 📦 下载 · Download

- **APK**: `DSH-Mobile.apk`（当前附件）
- **落地页**: https://daetz-coder.github.io/DSH-Mobile/
- **Obtainium 自动更新**: 添加 `https://github.com/daetz-coder/DSH-Mobile` 为应用源

## 🧩 配套插件 · Companion plugins

- **dsh-pocket** v1.13.4 · **dsh-web-mobile** v2.1.1（已实测，无需其他扩展）