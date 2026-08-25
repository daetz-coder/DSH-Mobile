# Changelog · 更新记录

All notable changes to DSH-Mobile are documented here.
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [SemVer](https://semver.org/lang/zh-CN/)。

---

## [1.0.3] — 2026-08-25

### Fixed · 修复

- **扫码配对稳定可用**：第二次扫码无法解码、偶现无法退出的问题——扫描状态
  重置 + teardown 幂等化；扫码与打开远程均防重入。
  - QR scanning is reliable across repeated scans; exit always works.
- **配对去重**：同一 URL 重复扫码更新已有条目，不再新增重复行；存储写入
  串行化，连续快操作不丢更新。
  - Pairings de-duplicated by URL; store writes serialized.
- **健壮性**：事件监听线程泄漏、登录竞态、SecureStore 键碰撞（SHA-256 +
  旧数据迁移）、扫码关闭按钮加大且避开状态栏（edge-to-edge）。
  - Watcher/thread leaks, login races and storage key collisions fixed.
- **扫码按钮美化为 DSH 扁平玻璃风格**。
  - QR close button restyled to a flat DSH glass circle.

### Changed · 变更

- 版本号升至 1.0.3（versionCode 4）；README / 落地页截图改为两张独立图片。
  - Version bumped to 1.0.3 (versionCode 4).

---

## [1.0.2] — 2026-08-25

### Fixed · 修复

- **修复对话滑动卡顿 / 无法滚动**（OPPO 等部分机型）
  - overscroll 保护改为一次性标记真实滚动容器（`data-dsh-osc` +
    `overscroll-behavior: contain`），不再每 2 秒重建样式规则，滚动恢复顺滑，
    顶栏保护依旧保留。
  - Fixed conversation scrolling jank / freeze on OPPO-like devices — the
    guard now marks only the real scroll container once instead of rebuilding
    CSS every poll.

### Changed · 变更

- 版本号升至 1.0.2（versionCode 3）。
  - Version bumped to 1.0.2 (versionCode 3).

---

## [1.0.1] — 2026-08-25

### Fixed · 修复

- **Overscroll 不再把顶部按钮顶进状态栏**（OPPO/ColorOS 等 edge-to-edge 设备）
  - 对话界面里把消息列表滑到最底/最顶后继续拉动时，原来整个页面视图会被
    Chromium 的 overscroll 平移，把 `position: fixed` 的头部（对话列表、
    后台任务按钮）拖到电量/Wi-Fi/信号等系统状态栏区域，按钮不可点击。
  - 现在通过通配符注入 `overscroll-behavior: contain` 覆盖 DSH 页面**内部
    滚动容器**（类名混淆，无法预先指定），滚动链在任何容器处都被截断，
    页面视图不再位移，顶部按钮始终停留原处可点。
  - 配套：WebView `OVER_SCROLL_NEVER` + 禁用嵌套滚动链。
  - Fixed headers are no longer pushed under the status bar on overscroll
    (OPPO/ColorOS edge-to-edge devices).

- **移除多余权限申请**（安装时不再索取无关权限）
  - `@capacitor/local-notifications` 合并进 manifest 的
    `RECEIVE_BOOT_COMPLETED`、`WAKE_LOCK`、`SCHEDULE_EXACT_ALARM` 已用
    `tools:node="remove"` 剔除——通知由原生 `MainActivity`/`DsEventWatcher`
    实现，从不调度闹钟/开机恢复/唤醒锁。
  - 现在 APK 实际请求权限仅 3 项：`INTERNET`、`CAMERA`（扫码）、
    `POST_NOTIFICATIONS`（状态通知），均为必需。
  - Dropped unneeded permissions merged from local-notifications; the app
    now requests only INTERNET, CAMERA and POST_NOTIFICATIONS.

### Changed · 变更

- 版本号升至 1.0.1（versionCode 2）。
  - Version bumped to 1.0.1 (versionCode 2).

---

## [1.0.0] — 2026-08-25

### Added · 新增

- **扫码配对**：扫 `dsh web → 设置 → 插件 → 手机访问` 二维码一键配对，支持手动输入 URL。
  - Scan-to-pair with the desktop dsh web; manual URL entry supported.
- **PIN 自动登录**：首次输入 8 位访问密码后 AndroidKeyStore 加密保存，重开即达。
  - First-time PIN entry stored encrypted (AndroidKeyStore); auto-login after.
- **整页官方界面**：以 top-level 导航加载 DSH 官方 UI（非 iframe），cookie/WS 完整工作。
  - Official DSH UI loaded full-page (not iframe); cookies/WebSockets intact.
- **常驻状态通知**：通知栏逐秒同步桌面原生进度文本（如 `Deep diving...1分45秒`），任务结束自动转「已完成 · 本次用时」。
  - Persistent notification mirrors the desktop's native progress text; auto-
    switches to "finished · duration" when the run ends.
- **局域网 + 公网**：同一 WiFi 直连，外出走 cloudflared 快速隧道（URL 每次重启轮换）。
  - LAN direct on the same Wi-Fi; public cloudflared quick tunnel when away.
- **深色模式 + 双语**：跟随 DSH 主题，App 内 zh/en 随时切换。
  - Dark mode follows DSH; zh/EN switching in-app.
- **配对状态徽标**：配对列表实时显示在线/离线/受密码保护。
  - Live online / offline / PIN-protected status dots in the pairing list.
- **GitHub Pages 落地页 + Obtainium 自动更新源**。
  - GitHub Pages landing page and Obtainium auto-update source.

[1.0.3]: https://github.com/daetz-coder/DSH-Mobile/releases/tag/v1.0.3
[1.0.2]: https://github.com/daetz-coder/DSH-Mobile/releases/tag/v1.0.2
[1.0.1]: https://github.com/daetz-coder/DSH-Mobile/releases/tag/v1.0.1
[1.0.0]: https://github.com/daetz-coder/DSH-Mobile/releases/tag/v1.0.0