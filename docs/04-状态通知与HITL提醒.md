# 状态通知与 HITL 提醒实现（M2）

> 手机通知栏如何「同步电脑 DSH 原生进度」，以及在需要用户介入时提醒。
> 本文记录设计决策与真机验证结果（2026-08）。

## 一、需求

用户希望：**不用打开 App，通知栏就能看到 agent 的实时进度**——进行中 / 已完成、
耗时多少；并且只在**需要用户介入**（审批 / 提问）时才额外弹窗，日常运行不打扰。

## 二、关键设计决策

### 1. 状态文本：直接读取 DSH 原生 DOM，不自计时

DSH 界面在**输入框上方**有一个 `.Md3f7G_turnStatus` 元素，实时显示当前 turn
状态与已用时间，例如：

```
Deep diving...1分45秒
```

（另有 `.Md3f7G_turnStatusClock` 单独显示秒数。）

- **错误路径（已被否决）**：自己用 `System.currentTimeMillis()` 计时、用
  "8 秒无活动"推断完成、复用 `sessionStats` 累计值——都与 DSH 界面不一致。
- **正确做法**：`MainActivity` 每 2 秒向 DSH 页面 `evaluateJavascript`，
  读取 `.Md3f7G_turnStatus` 的文本，原样镜像为常驻通知（id=100）。
  **通知显示的就是 DSH 界面显示的那串字**，零偏差。

### 2. 进行中 / 已完成判定：文本变化 vs 冻结

真机观察到的关键行为：**任务结束后 DSH 不删除 turnStatus 元素，而是让文本
冻结在最后时间**（如 "Deep diving...6分30秒" 停住不再增长）。

- 文本**持续变化**（每 2s 不同）→ 「DSH 进行中」+ 该文本
- 连续 4 次（约 8s）读到**相同文本** → 「DSH 已完成 · 本次用时 <提取的时间>」
- 元素消失（空文本）且曾活跃 → 「DSH 已完成」（兜底）
- 文本再次变化（新任务）→ 回到「DSH 进行中」

时长提取：`"Deep diving...1分45秒"` → 取 `...` 之后的部分（`1分45秒`）。

### 3. HITL 提醒：独立 WS 监听，审批 / 提问才弹

`DsEventWatcher`（手写最小 RFC6455 WebSocket 客户端）连接
`ws://<host>:3081/api/events.mux`（带会话 cookie），只对**需要人介入**的事件
发瞬态通知：

| 事件信号 | 通知 |
|---|---|
| `approval/asked`、`approval/requested`（审批发起） | 「DSH 需要审批」 |
| `approval/resolved` / `decided` | 不弹（用户已处理） |
| ask-user / question 类工具 | 「DSH 向你提问」 |

日常工具调用、步骤、回复**全静默**——不会像最初版本那样刷屏。

### 4. 不再重复通知

- 前端 app.js 的「已连接」通知已移除（避免与原生状态条重复）。
- 状态条（id=100，`ONGOING`）由 MainActivity 负责；HITL 弹窗（id 200+，
  自增）由 DsEventWatcher 负责；两者互不干扰。

## 三、真机验证结果

| 场景 | 结果 |
|---|---|
| 进入远程 | 通知出现「DSH 进行中 · Deep diving...1分45秒」（逐秒增长）✅ |
| 任务结束 / 停止 | 冻结 8s 后转「DSH 已完成 · 本次用时 1分45秒」✅ |
| 新任务 | 回到「DSH 进行中」，新计时从零开始 ✅ |
| 审批 / 提问（策略 ask） | 「DSH 需要审批 / 向你提问」瞬态弹窗 ✅ |
| 权限 | Android 13+ `POST_NOTIFICATION: allow` ✅ |

## 四、文件

| 文件 | 职责 |
|---|---|
| `app/android/.../MainActivity.java` | 状态轮询（读 DOM 文本）→ 常驻通知 id=100；冻结检测 |
| `app/android/.../DsEventWatcher.java` | /api/events.mux WS 监听 → HITL 瞬态弹窗（id 200+） |
| `scripts/cdp-*.mjs` | CDP 辅助：定位 turnStatus 元素、抓取轮询值、触发测试任务 |

## 五、已知边界与后续

- 轮询间隔 2s（`POLL_MS`）：更快更跟手，更慢更省电，可按需调整。
- 冻结窗口 4 次（~8s）：短暂停可能短暂显示「进行中」，可调 `FREEZE_LIMIT`。
- 状态文案目前固定中文（Deep diving 是 DSH 自己的）；App 壳 i18n 已就绪，
  原生侧如需跟随系统语言可再加。
- HITL 事件的名字基于实测（`approval/asked` / `approval/requested` 等）；
  DSH 版本升级若变更事件名，需要在 DsEventWatcher 同步。