# DSH-Mobile

在手机上「流转」 DeepSeek Harness 官方 Web 界面的移动配套项目。

- 电脑端：以 npm 插件形态分发，扫码配对（局域网直连 + cloudflared 公网隧道）
- 手机端：Capacitor（Android 先行）WebView 壳，加载远程 DSH Web UI，扫码配对 + 本地加密保存配对历史（免重复扫码）
- 移动端适配：基于 dsh-web-mobile（MIT）将官方 UI 变为窄屏友好
- 对齐原生 DSH：复用官方 `dsh web`（127.0.0.1:3080，`window.__DSH_BOOT__`）界面，不做 UI 重写

## 仓库结构

```
docs/                    市场调研与方案分析
plugins/dsh-pocket       DSH 扫码配对插件（GPL-2.0，二开基底）
plugins/dsh-web-mobile   DSH Web 移动端适配插件（MIT）
app/                     Capacitor Android/iOS 壳（规划中）
UPSTREAM.md              上游源码版本记录（便于与上游 diff）
```

## 上游来源

| 目录 | 上游 | 许可 | 版本 |
|---|---|---|---|
| `plugins/dsh-pocket` | [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) | GPL-2.0 | v1.13.4 |
| `plugins/dsh-web-mobile` | [mexiaosqwq/dsh-web-mobile](https://github.com/mexiaosqwq/dsh-web-mobile) | MIT | v2.1.1 |

详见 [UPSTREAM.md](UPSTREAM.md)。

## 快速开始（电脑端插件）

```sh
# 方式 A：从本仓库本地源码安装（开发/二开）
dsh plugin --profile web add link:D:\2026AppDev\DSH-Mobile\plugins\dsh-pocket
dsh plugin --profile web add link:D:\2026AppDev\DSH-Mobile\plugins\dsh-web-mobile

# 方式 B：从 npm 安装（普通用户）
dsh plugin --profile web add dsh-pocket -w
dsh plugin --profile web add github:mexiaosqwq/dsh-web-mobile

# 装完必须重启 dsh web 才会生效
npx @deepseek-ai/dsh web
```

安装后：设置 → 插件 → 「手机访问」→ 手机扫局域网二维码；点「开启公网访问」出公网二维码。