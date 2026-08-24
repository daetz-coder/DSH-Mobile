# App 壳架构（M1）

> 本文记录 `app/`（Capacitor Android 壳）的设计决策，供二开与维护参考。

## 总体架构

```
┌────────────────────────────── 手机（DSH-Mobile App） ─────────────────────────────┐
│                                                                                   │
│  Capacitor WebView（androidScheme: http → 本地壳 origin http://localhost）        │
│  ┌──────────────────────────────────────────────────────────────────────────────┐ │
│  │  视图 1：配对列表（Home）     视图 2：扫码确认    视图 3：远程 DSH UI          │ │
│  │  - 历史配对（SecureStore 加密） - ZXing 解码回显    - iframe 内嵌远程 UI        │ │
│  │  - 扫码 / 手动添加             - 确认/重扫          - 顶部原生工具栏            │ │
│  └───────────────┬──────────────────────────────┬──────────────────────────────┘ │
│                  │ 原生桥（window.__DSH_MOBILE_*）│ iframe src=http(s)://<PC>/<隧道>│
│  ┌───────────────▼────────────────┐  ┌───────────▼─────────────────────────────┐  │
│  │ SecureStorePlugin (Java)       │  │ http://<PC-IP>:3081（局域网直连）        │  │
│  │ AndroidKeyStore AES-256-GCM    │  │   或 https://xxx.trycloudflare.com（公网）│  │
│  │ 密文存 SharedPreferences       │  └─────────────────────────────────────────  │
│  └───────────────┬────────────────┘  (由电脑端 dsh-pocket 代理 + 移动端适配)      │
│  ┌───────────────▼────────────────┐                                              │
│  │ QrScannerPlugin (Java)         │                                              │
│  │ CameraX + ZXing（无 GMS）       │                                              │
│  └────────────────────────────────┘                                              │
└───────────────────────────────────────────────────────────────────────────────────┘
```

## 关键设计决策

### 1. 为什么本地壳用 `androidScheme: http`
- DSH 局域网地址是纯 `http://192.168.x.x:3081`。
- Android WebView 的 mixed-content 策略：`https` 页面内嵌 `http` iframe 会被拦截。
- 本地壳设为 `http://localhost` → 内嵌局域网 `http` 地址不再触发 mixed-content；
  公网 `https://xxx.trycloudflare.com` iframe 亦兼容。
- 代价：本地壳处于非安全上下文（SecureStore/QrScanner 全部走原生插件，规避了
  Web Crypto / getUserMedia 的安全上下文限制——这是设计使然）。

### 2. 为什么用 iframe 而不是整页 WebView 跳转
- iframe 让"原生工具栏 + 配对切换"常驻：返回配对列表、重载、断开都不离开 App 壳；
- 服务端 dsh-pocket 代理不发送 `X-Frame-Options`/`frame-ancestors`（已核查源码），
  DSH Web UI 可安全内嵌；
- 移动端窄屏适配由**服务端 dsh-web-mobile 插件**完成，App 壳零侵入——天然"对齐原生"。

### 3. 为什么自写两个原生插件（不引入第三方）
| 插件 | 选型理由 |
|---|---|
| SecureStorePlugin | 配对历史含 URL/令牌，需静态加密。AndroidKeyStore 的 AES-GCM 是平台标准做法，避免第三方存储库的版本耦合 |
| QrScannerPlugin | `@capacitor-community/barcode-scanner` v4 仅兼容 Capacitor 5；自写 CameraX + ZXing **无 Google Play Services 依赖**（GMS 缺失设备可用） |

### 4. 配对历史（免扫码）
- 每次扫码成功 → 自动存入历史（名称默认取 URL，可后续改名）
- 历史条目含 `{id, name, url, createdAt, lastUsedAt}`
- 存储：JSON 文档 → SecureStorePlugin（AES-GCM 密文 → SharedPreferences）
- 前端 `store.js` 桥接：原生可用走原生，否则回落 `localStorage`（浏览器调试）

## 文件清单

| 文件 | 职责 |
|---|---|
| `www/index.html` + `css/app.css` | 三视图 SPA 骨架与深色主题 |
| `www/js/store.js` | 配对历史模型 + 原生/本地存储抽象 + URL 规范化 |
| `www/js/qr.js` | QR 扫描桥（桥到 QrScanner 插件） |
| `www/js/bridge.js` | 把两个原生插件映射到 `window.__DSH_MOBILE_*` |
| `www/js/app.js` | 视图切换、配对 CRUD、iframe 远程控制 |
| `android/.../SecureStorePlugin.java` | AndroidKeyStore AES-GCM 加密存储 |
| `android/.../QrScannerPlugin.java` | CameraX 预览 + ZXing 解码 + Capacitor 权限流 |
| `android/.../MainActivity.java` | 注册以上两个插件 |

## 已知限制（后续 M2 处理）

1. **配对名不可编辑**：扫码或手动添加后，名称固定为 URL（M2 加编辑入口）。
2. **无断线检测**：现在靠 iframe 自身加载错误表现；M2 加 WebView/网络探测 + 重连提示。
3. **安全硬化**：发布版建议改 `cleartext: false` + 仅允许用户显式添加的地址
   （见 `capacitor.config.ts` 注释）。
4. **WebView 内嵌的 DSH 审批/授权弹窗**依赖服务端渲染，已验证可行但需真机回归。

## 构建与部署

```sh
cd app
npm install
npx cap sync              # 同步 www → android assets
cd android
$env:JAVA_HOME="<JDK17>"  # 如 ~/.jdks/corretto-17.0.9
.\gradlew.bat :app:assembleDebug
# APK 输出：android/app/build/outputs/apk/debug/app-debug.apk
# 真机安装：
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```