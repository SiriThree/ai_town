# V11.6 姓名事实与定时咖啡馆约定

2026-10-10。本轮只修改私人身份事实、咖啡馆约定及对应交互；没有改地图、模型配置、NPC 数量、性格权重或数据库初始化。开始时基线为 `7a8139f`，已有 V11.4/V11.5 未提交修改全部保留。没有提交、推送、部署或外部模型调用。

## 1. 真实根因与复现

修复前脚本 `web/scripts/v11-6-repro.ts` 在专用 PostgreSQL 55488 中新建随机世界，使用同一 visitorId 对小满交谈、推进 720 次。原始证据：[before/result.json](../web/evidence/v11-6/before/result.json)。这是修复前失败证据，脚本断言的是当时的缺陷，不能作为新版通过测试重跑。

| 问题 | 实际原因 | 本轮处理 |
|---|---|---|
| “我叫 three，你记住了吗？”没有留下姓名 | 原 `introducedName` 仅匹配整句简短介绍，不接受空格及后半句。相同 visitorId 的私人记录中没有 name；场景切换不是已证明的丢失原因 | 明确介绍语法、持久 nameFact、来源及更正；不从模型台词推断 |
| “待会…邀请…”、“那我们现在就…”、“你什么时候过来呢？”不能执行 | 三句原 `invitationIntent` 均返回 null；旧约定没有提议/确认时间、出发时间和真实会面阶段 | 最小扩展原约定，区分提议、确认、路线到达、等待、会面和未会面 |
| 首次访客存在额外身份风险 | 前端初次打开聊天并发两次 GET，都可能创建 Cookie | 第二次刷新等待初次加载完成；浏览器最终实测只签发一次 Cookie。这是发现的竞争风险，不冒称已证明它导致用户原来的姓名丢失 |

没有读取或传播主世界私聊原文。主世界初始只读检查为 revision 1144、minute 7912、6 居民；本轮没有重置、迁移或写入主世界。

## 2. 姓名存储和上下文

`POST /api/npcs/{npcId}/chat` → 签名访客 Cookie → 原 `chat` NPC 请求锁 → 读取 `(world_id,npc_id,visitor_id)` 私人历史和 `player_memory` → `introducedName`/`rememberPlayer` → `chat-context` → 模型或 Fallback → 原私人记录写事务。

复用 `PlayerMemory.version=1`，新增可选 `nameFact`：`name、turnId、message、minute、revision`。`name/nameSource` 保持兼容。当前明确自我介绍会先以实际预分配的 turnId 构造本次上下文，成功回复后才一起持久化。最新姓名事实独立于短期 20 条聊天和 8 条近期认识记录，不会被普通闲聊挤出。

- 支持实际输入 `我叫 three，你记住了吗？`，以及 `以后请叫我 four`、`更正一下，我叫four` 等明确更正。
- 不接受 `我叫three吗？`、引述他人、自问姓名或夹带额外指令作为姓名事实。
- “我叫什么名字？”优先使用当前访客事实；人物姓名与玩家姓名分开，不把小满的名字当成玩家名字。
- 普通有效模型回复继续使用；在明确介绍/询问玩家姓名时，模型遗漏、否认或冲突才安全回退，并保留原文、来源和 `fact_conflict` 诊断。没有把全部聊天改为模板。
- 认识次数与熟悉程度可增长；本次测试 trust/affection 始终为 0。
- 旧记录只从仍然保留的**玩家明确介绍**补齐，已有新姓名事实优先。早已被历史截断且从未保存的名字无法恢复，需要玩家再次介绍。

跨一天实测小满真实经过 town、stone_interior、cafe_interior，历史滚动后依然保留 three；更正为 four 后，PostgreSQL 重启和新 Node 进程中仍读取 four。来源消息 `f5a31f16-4cb4-4137-a433-94d04a8493dc`、minute 1920、revision 720 保持不变。

## 3. 定时约定与真实执行

复用 `town_invitations.payload/response` 和 NPC 的 `appointment`，没有增加任务表或迁移 SQL。

新增可选字段：`scheduledMinute、departMinute、travelMinutes、waitUntilMinute、confirmedMinute、metMinute`；新增状态 `proposed、met、missed`。原 accepted/waiting/travelling/arrived/failed/cancelled/refused/deferred 保留。

1. 明确的“待会儿”提议：读取世界时间、合法路线估时、未完成工作，给出向上取整至 10 分钟的具体时间。仅保存私人 proposed，不改变世界 NPC 行动。
2. 点击“确认这个时间”或回复“好的”：只在存在本人待确认提议时确认；重新检查时间、可达性及冲突，短事务锁世界行，更新同一约定 ID。普通“好的”不创建约定。
3. “现在就去”：自主检查工作、疲劳、关系和可达性；接受才写立即出发意图，忙碌则明确推迟。世界暂停时明确提示暂停。
4. 原持续行动系统继续运行。`cafeTravelMinutes` 在本地克隆上使用同一 `actionDuration`、室内路径、道路和门户估算，不提前执行真实状态。动作边界重新估时，按路程提前出发；已开始动作不瞬移或重复结算。
5. NPC 到达 cafe_interior 后才 arrived。尚未结束的重要咖啡馆工作先继续，不能因已在室内就被误判为可等待的赴约者。
6. 已到达居民等待至约定时间后 60 个游戏分钟。提前到达也按同一 waitUntil 排他，不允许另一访客覆盖。期间世界暂停则等待时间不增长；原浏览器唤醒机制不补算离线时间。
7. 玩家在咖啡馆靠近该 NPC 按 E，前端提交本地玩家位置。后台校验签名访客归属、合法场景/站位、NPC 权威位置、距离/视线和有效 arrived 状态，再短事务写 met 与 meetingEvidence。到达本身绝不等于会面。
8. 没有会面确认则 missed；不可达、紧急离店、超期或取消有原因。取消不截断正在播放/执行的真实路线。恢复后不会重复生成完成事件。

完整链路：`ChatDialog → chat POST → invitationIntent → confirmInvitation → town_invitations + world事务 → advanceWorld/refreshAppointment/appointmentDecision → 原持续行动/门户 → arrived → E交流 POST interaction=meet → recordMeeting → met → retrievePlayerFacts → 后续回忆`。

模型不负责批准约定。提议、确认及状态查询使用后台事实短回执；其余对话继续原模型适配及人物上下文。外部模型等待不持有世界事务锁。

### 实际数据库时间线

[确定性数据库记录](../web/evidence/v11-6/v11-6-2653b31f-f6b9-4a21-abab-977fe8747759/result.json)：约定 `f9591285-fe91-4297-b5bc-98c9c22e7c15`。

| 世界分钟 / 时间 | 数据和行为 |
|---|---|
| 480 / 第1天08:00 | proposed；尚未写入 NPC 约定；玩家确认后同 ID accepted |
| 520 / 08:40 | 双方确认的 scheduledMinute；原合法路程估计10分钟，参考 departMinute508 |
| 510 / 08:30 | 实际动作边界出发，travelling；每条路径通过 validScenePath |
| 518 / 08:38 | 实际到达，arrived；metMinute 仍不存在 |
| 518 / 08:38 | 所属玩家近距离交流校验通过，met；重复确认不改世界版本、不重复事件 |
| 580 / 09:40 | 另一个相同计划的隔离分支没有玩家到来，missed，记录未能会面原因 |

另测途中取消保留 ongoing.id、老林工作进度0时立即邀请 deferred、暂停 wake 不前进、跨午夜定时路径/期限、未知/不同访客及异场景/远距离不能完成会面。

私人姓名、原文、confirmation 来源和 meetingEvidence 仅按 world/NPC/visitor 查询；公共事件只说居民完成会面，不写玩家姓名或私聊原文。会面回忆分别保留提议、确认、到达和会面时间及来源 ID，不把过去 arrived 解释为见过玩家。

## 4. 浏览器实测与连续录屏

最终生产构建运行在独立 3136 端口、随机测试世界，1440×900 Chromium，AI 和 NPC_AI 均关闭。使用真实 HTTP、PostgreSQL、键盘、碰撞、门户和自动推进，没有前端伪造NPC路径。

[完整记录](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/result.json) · [连续实际录屏 journey.webm](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/journey.webm)

录屏顺序：介绍 three → 键盘走进咖啡馆再返回 → 小满认出姓名 → 提议08:40 → 回复“好的”确认 → 查询时间 → 自动运行真实出发 → 途中暂停、重启测试应用并刷新 → 恢复、到达 → 玩家走进咖啡馆靠近按E → met → 查询姓名和约定回忆 → 查看历史 → 刷新后再次识别。

为可重复性，只在开始创建健康需求的六居民隔离夹具，并设置玩家初始位置在小满旁边；这不是玩家从主存档自然走到此处的证据。随后所有玩家位移均实际键盘操作。录屏中小满“我们后来确实见面了”发生在 met 之后。没有调用真实 Qwen。

| 画面 | 文件 |
|---|---|
| 明确介绍 | [01-name](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/01-name.png) |
| 离开并换场景 | [02-left-scene](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/02-left-scene.png) |
| 再次识别姓名 | [03-remember-name](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/03-remember-name.png) |
| 具体时间提议 | [04-time-proposal](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/04-time-proposal.png) |
| 确认与时间查询 | [05-confirmed-time](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/05-confirmed-time.png) |
| 真实移动 / 暂停 | [06-moving](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/06-moving.png)、[07-paused](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/07-paused.png) |
| 实际会面与回忆 | [08-real-meeting](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/08-real-meeting.png)、[09-history](../web/evidence/v11-6/v11-6-browser-8a1de56b-6a26-4dc8-89a4-f42cf03f3d28/09-history.png) |

浏览器 pageerror=0；首次签发访客 Cookie=1；第二个独立浏览器历史和约定均为空，提交伪造 visitorId 无法读出 three。中途测试后端重启前后暂停快照完全一致。

## 5. 自动化、数据库与兼容

已运行（在 web 目录）：

```powershell
npm run typecheck
npm run lint
npm test -- --reporter=dot
npm run build
node --env-file=.env.test.local --import tsx scripts/v11-6-check.ts
node --env-file=.env.test.local --import tsx scripts/v11-6-browser.mjs
$env:EVIDENCE_DIR='evidence/v11-6/recovery-final'
$env:STORY_RESULT='evidence/v11-6/v11-6-2653b31f-f6b9-4a21-abab-977fe8747759/result.json'
node --env-file=.env.test.local --import tsx scripts/v11-recovery-check.ts --restart-test-postgres
node --env-file=.env.test.local --import tsx scripts/v11-6-restored-check.ts
```

复测须更换证据目录，不覆盖已有记录；STORY_RESULT 应指向新一次数据库测试结果。上述重启命令仅核验并操作本项目 55488 测试容器及测试卷，不可对主库使用。

- 类型、lint、生产构建通过；28文件163项单元测试通过，含姓名/更正/跨天/兼容/排他等待、原持续行动/工作/社交/模型失败回归。
- 数据库脚本7次本地 HTTP 模型替身请求：检查实际发送的首轮姓名上下文、记录来源、错误姓名保护、真实路径与状态；外部调用0次。
- [真实 PostgreSQL 重启结果](../web/evidence/v11-6/recovery-final/result.json)：6个隔离世界、7份私人聊天记忆、6条约定精确恢复；同一未完行动继续，无重置。重启前后数据库启动时间实际变化。
- [重启后新进程验证](../web/evidence/v11-6/restored/result.json)：four及原nameFact一致，真实met经历可检索，不同owner为空；普通“好的”不增加约定；只聊天世界快照不变。
- 旧 schema2 快照和无定时字段的旧约定无需DDL即可读取，旧arrived不推断met；新可选nameFact可安全补齐。旧二进制不保证识别新增状态，不能无备份直接回滚写入新存档。
- 测试途中发现并修正确认请求SQL的uuid/text比较、真实会面回忆被“记得我”子串误分流、咖啡馆未完工作被提前到达打断、提前到达等候期限排他不一致。浏览器脚本另外修正刷新后档案阻挡E的测试操作，以及 Playwright Cookie 读取方法；失败记录保留，不计为通过。

## 6. 本轮修改文件

- 事实/执行：`web/src/lib/player-memory.ts`、`appointments.ts`、`invitation-store.ts`、`chat-service.ts`、`chat-context.ts`、`chat-facts.ts`、`world.ts`。
- 接口/交互：`web/src/app/api/npcs/[npcId]/chat/route.ts`、`web/src/components/ChatDialog.tsx`、`Town.tsx`、`TownScene.tsx`。
- 新测试：`web/tests/timed-meeting.test.ts`，`web/scripts/v11-6-{repro,check,restored-check}.ts`、`v11-6-browser.mjs`；原 `v11-recovery-check.ts` 增加本轮世界列表恢复比较。
- 文档：本文件、`AGENTS.md`、`docs/spec.md`、`web/README.md`。

`chat-facts.ts`等已有未提交 V11.5 工作是在原基础上增量修改；`chat-types.ts`、V11.4/V11.5脚本和报告等其他已有Git变更不算本轮新增。没有新依赖、美术或第二套Memory/调度系统。

## 7. 限制与停止点

- 姓名仅接受有限明确表达及1–12个中英文字母/汉字；不做自由语言身份推断。Cookie失效/清除/换浏览器视为另一匿名访客，不能冒认。
- 定时约定仅麦香咖啡馆、系统提出具体时间后确认；未实现任意日期/自由输入几点的解析或NPC跟随玩家。提前出发估计受离散步骤及紧急需求影响，不能承诺精准秒级到达；失败必须留原因。
- 玩家仍为本地化身。后台校验**客户端上报**的合法位置和权威NPC距离，并非服务端多人移动防作弊；构造合法坐标请求仍可能伪造到场。正常游玩录屏使用真实走路与E，没有坐标捷径。
- 长等候使用已有wait行动，未增加社交/娱乐玩法。世界暂停不增长约定时间，关网页没有离线补算。
- 本轮模型为Mock/Fallback，真实Qwen自然语言效果未复测；历史8次授权不复用。姓名冲突保护不是任意语义真伪检测。
- 主3100进程未重启；需按原本地启动方式正常重启应用加载新代码，保留现有数据库，不运行seed/init。此前尝试自动重启主进程被自动审批拦截，本轮通过独立3136完成运行验证。

完成姓名与定时会合闭环后停止，不进入地图、玩法或部署。
