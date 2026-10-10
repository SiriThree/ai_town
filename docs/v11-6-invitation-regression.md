# V11.6 多轮咖啡馆邀约回归

## 追加回归：礼貌邀请与“怎么样”

用户随后提供“我现在可以邀请你一起去咖啡馆喝杯咖啡吗”及“我们约下午一点怎么样”。再次检查确认3100仍为旧进程28136，且上一版源码的句式识别也确实遗漏这两句；新增用例先失败（第一句被解析为 null），因此不能将问题只归因于刷新或缓存。

本次在 `invitationIntent` 中补充有边界的礼貌邀请表达和时间问句后缀“怎么样/如何/行吗/行不行”。“现在可以邀请”表示此刻提出邀请，不擅自解释为立即出发；仍需补全时间。否定、转述及复合指令维持不执行。没有修改模型提示、地图、执行系统或真实数据库记录。

隔离世界第6天12:12，以用户两句原话完成数据库回归：先 `proposed`，再将同一 ID `db498953-1aab-472c-94ba-f2c2bbc1cb0b` 确认为 `accepted`、`target=cafe`、`scheduledMinute=7980`（第6天13:00）。追问和重复请求维持同一约定，另一访客不能继承；后续推进实际到达咖啡馆。证据为 `web/evidence/invitation-regression/negotiation-db4c9c84-1cb8-44d5-8595-cf2ad51efb08/result.json`。

本次类型检查、lint、31文件174项单元测试、10个隔离数据库场景及生产构建通过；外部模型调用0次。下文173项/9世界是前一次回归结果，保留历史。

浏览器追加命令：`node --env-file=.env.test.local --import tsx scripts/invitation-negotiation-browser.mjs --polite`。完整流程通过：两句原话→13:00确认→自动真实赴约→暂停并重启隔离应用→刷新→玩家进入咖啡馆近距离会面→查询真实经历；另一浏览器私聊为空，页面错误0。实际[确认截图](../web/evidence/invitation-regression/negotiation-browser-6ac87f95-4dfe-432d-bb04-34b775e81827/02-confirmed-cafe-time.png)和[连续录屏](../web/evidence/invitation-regression/negotiation-browser-6ac87f95-4dfe-432d-bb04-34b775e81827/journey.webm)已保存。本次未绕过上轮自动审批的3100进程重启拒绝，当前主页面仍需用户正常重启应用才能使用此构建。

2026-10-10。只修复现有协商、确认与事实读取；未改地图、决策权重、模型配置或数据库表结构。本轮外部模型调用 **0 次**。下文的 AI 来源测试均为本地 HTTP 替身，不是 Qwen 实测。

## 真实根因

1. `appointments.ts::invitationIntent` 原先按完整句子白名单匹配，漏掉“我们能一起去咖啡馆喝杯咖啡吗”及具体钟点表达。“下午两点可以吗”也不读取私人待定提议。这些输入进入普通模型回答，没有执行 `confirmInvitation`。
2. `chat-service.ts::chat` 原来只在 `status && !recalling` 时读取权威约定；“你还记得我们的约定吗”同时被认作回忆，绕过了当前约定状态回答。
3. 只读检查主库中阿晴对应输入的历史：错误的“下午两点，树荫广场见”“先在广场聊聊”均为 `source=ai`、没有降级原因。源码不存在后一固定台词。不是数据库把咖啡馆改为广场，而是未命中执行链时，模型自行承诺了当前广场地点。
4. 既有提议只覆盖有限的“待会儿”话术；确认回执只保留最后一次确认，不能可靠处理多轮补充后的旧请求重试。

修复前隔离重现记录：`web/evidence/invitation-regression/invitation-repro-f5d4faef-2b05-4216-8772-1d3ae1bf2a90/result.json`。六轮均没有创建约定，本地替身产生错误承诺；保存了逐轮私人历史、实际模型 messages、意图、约定前后状态及执行任务。原始主库私聊仅用于定向定位，不拷贝到公共事件或报告。

## 最小修复及确认边界

- `invitationIntent/invitationTime` 区分无时间提议、时间补充、确认、取消、状态和澄清；解析数字/中文钟点、半点和今天/明天/后天。使用世界分钟，不用系统日期；已过去时间明确拒绝，不自动改为次日。
- 待定提议保存在原 `town_invitations`，按 `worldId + npcId + visitorId` 查询，`target=cafe`、`status=proposed`、时间可以尚未确定。模型历史中的地点不作为行动依据。
- `chat → privateConversationState → confirmInvitation`：只有明确地点，或当前访客自己的有效咖啡馆上下文，才能补充时间。另一个访客单说“两点可以吗”不会继承此提议。
- `confirmInvitation` 在原世界行锁事务中重新检查需求、工作、冲突和合法路线。合适则更新同一个约定 ID，保存确认时间和 NPC 可执行约定；来不及则提出具体较晚时间，等待玩家确认；疲劳等原因可以拒绝。**事务提交成功后才返回确认台词**，锁内无模型请求。
- 已确认后反复询问只读同一个约定；改期须取消再约。每个提议保存最多 32 条有请求 ID 的回执，同请求同消息复用，同请求不同消息返回冲突；达到上限仍允许取消。
- 当前约定追问及“？”走事实回复，不再自由编造地点。普通聊天仍使用原模型；对邀请相关的未支持表达，若模型生成明显未经确认的承诺，轻量检查回退到真实约定并保留原文和事实来源。
- `chat-facts.ts` 将协商及明确时间确认关联到原邀请 ID、来源消息与世界时间。未定时间时前端不显示“确认这个时间”按钮。

执行仍是原 `refreshAppointment → appointmentDecision → canExecute/持续行动 → 合法路径/门户 → PostgreSQL 保存`。到达为 `arrived`，不是 `met`；同一访客在咖啡馆合法近处发起交流后，`recordMeeting` 才记录会面。未到场、取消、等候超时均有真实结果。

## 实际固定故事

隔离世界第 1 天 12:12，阿晴状态可赴约，世界暂停；测试身份 A 与 B 使用不同会话。

| 输入/操作 | 实际结果 |
| --- | --- |
| 我们能一起去咖啡馆喝杯咖啡吗？ | 咖啡馆提议已保存，问几点；没有 NPC 执行任务 |
| 那我们约下午2点可以吗？ | 原 ID 确认为第1天14:00，提交后回复“说好啦” |
| 下午2点在咖啡馆见面可以吗？ | 同一约定，没有重复任务，没有广场替换 |
| 你还记得我们的约定吗？ / ？ | 读取已保存的14:00咖啡馆约定 |
| 自动运行，途中暂停并重启测试应用 | 沿真实路线继续，同一个约定、原存档恢复 |
| 第1天13:56进入咖啡馆 | 阿晴已到达等候，尚未记会面 |
| 玩家实际走进咖啡馆，靠近按 E | 后台确认 `met`；回答真实邀请及已经会面的经历 |
| 另一独立浏览器读阿晴私聊 | 历史和本人约定均为空 |

数据库另行验证疲劳拒绝、工作反建议与确认、过去时间、跨天时间、取消、迟到、重复请求冲突、路径逐步合法及来源记忆隔离。提出稍晚时间不会把工作进度清零或提前完成工作。

## 命令及结果

工作目录 `web/`，Node + 本地 PostgreSQL，数据库限制为 `127.0.0.1:55488/ai_town_mvp_test`；测试应用为3139。测试脚本强制关闭外部模型或覆盖为本地 HTTP 替身。

```powershell
npm run typecheck
npm run lint
npm test -- --reporter=dot
npm run build
node --env-file=.env.test.local --import tsx scripts/invitation-repro.ts
node --env-file=.env.test.local --import tsx scripts/invitation-negotiation-check.ts
node --env-file=.env.test.local --import tsx scripts/v11-6-check.ts
node --env-file=.env.test.local --import tsx scripts/v12-story-check.ts
node --env-file=.env.test.local --import tsx scripts/invitation-negotiation-browser.mjs
$env:STORY_RESULT='evidence/invitation-regression/negotiation-874da550-78e2-4113-8e3d-3122410549b4/result.json'
node --env-file=.env.test.local --import tsx scripts/invitation-recovery-check.ts --restart-test-postgres
```

- 类型检查、lint、生产构建通过；31个文件、173项单元测试通过。
- 新数据库回归9个世界通过。最终证据目录 `negotiation-874da550-78e2-4113-8e3d-3122410549b4`。
- 原姓名/定时赴约回归通过：`web/evidence/v11-6/v11-6-c74780a2-9e0e-422f-8a8f-370e3857ec67/result.json`；原公共活动故事回归通过：`web/evidence/v12/v12-story-f48ab9de-c85b-4aa6-b949-7e8a373ae985/result.json`。
- 不一致模型替身通过：`invitation-repro-f7c09737-6a66-4119-9502-6d08e8158444`。原故事不再经过自由模型；额外1次本地错误承诺被事实检查拦截，原回复可追溯。
- 真实浏览器通过，页面异常0；连续视频包括协商、自动赴约、暂停、应用重启刷新、玩家进室内和真实会面。
- 实际重启**测试 PostgreSQL**，核验9世界、11约定、10私聊记录逐项完全一致；恢复后未完成路径继续原行动 ID。证据 `recovery-dbac2a7d-8ba2-4bd3-b5c4-cf7235ad75a8/result.json`。主数据库未重启或重置。

过程中保留失败记录：一次测试服务启动等待不足；一次脚本拼接残留旧流程；一次测试玩家站在室内出口范围导致 E 退出而非交谈。修正测试等待/流程/合法站位后完整重跑通过，未修改游戏碰撞来迎合测试。原 V11.6 回归还发现同样提议重发会重复生成回执，已恢复复用未变化提议的回复。

## 页面证据

以下均为实际隔离运行页面，Fallback，无付费调用：

- [确认14:00](../web/evidence/invitation-regression/negotiation-browser-9f7e8215-9556-4e85-9abe-450558032b45/02-confirmed-cafe-1400.png)
- [真实赴约路径](../web/evidence/invitation-regression/negotiation-browser-9f7e8215-9556-4e85-9abe-450558032b45/04-real-route.png)
- [重启后保持](../web/evidence/invitation-regression/negotiation-browser-9f7e8215-9556-4e85-9abe-450558032b45/05-restart-preserved.png)
- [实际会面与回忆](../web/evidence/invitation-regression/negotiation-browser-9f7e8215-9556-4e85-9abe-450558032b45/06-real-meeting.png)
- [连续录屏](../web/evidence/invitation-regression/negotiation-browser-9f7e8215-9556-4e85-9abe-450558032b45/journey.webm)

完整逐轮证据在相同目录 `result.json`。本地 evidence 为忽略目录，交付时须单独附上，不含真实密钥或 Cookie。

## 修改文件与兼容

业务文件：`web/src/lib/{appointments,invitation-store,chat-service,chat-facts}.ts`，`web/src/components/ChatDialog.tsx`。

验收文件：`web/tests/invitation-negotiation.test.ts`、`web/scripts/invitation-{repro,negotiation-check,recovery-check}.ts`、`web/scripts/invitation-negotiation-browser.mjs`。必要文档增量为本文件、spec、web/README、AGENTS。

复用原 JSON 存档和表；新增回执字段可缺省，旧预约/姓名记录回归通过，无迁移、无主世界初始化。原地图、API 路径、NPC身份、AI适配层和费用配置保持原样。已有 README 和演示提纲的无关改动保留。

## 当前页面与限制

生产构建已完成，但自动审批阻止了停止3100旧进程/启动新版的命令（`blocked by policy`）。该命令未执行，**本轮未把3100实际切换到修复版**。请先确认3100仍是本项目，再在运行服务的终端正常停止旧服务；在 `D:\腾讯面试\web` 执行 `npm run start`，浏览器刷新。不要初始化数据库；本轮无需迁移。

真实 Qwen 修复后效果未验证，本轮没有使用旧授权追加调用。有限中文意图与轻量承诺检查不是通用语义理解；不支持的复合句应进一步澄清，不能保证识别所有说法。已确认约定改期仍需先取消；只支持麦香咖啡馆。会面继续使用既有前端玩家位置上报及服务端场景/碰撞/距离校验，并非服务端多人玩家物理模拟。本轮到此停止。
