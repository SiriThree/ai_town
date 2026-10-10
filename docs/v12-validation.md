# V12 公共聚会验证记录

2026-10-10。V12.1–V12.4实现完成，最终检查及证据如下。仅隔离55488数据库/随机世界与Mock/Fallback；不部署、不调用付费模型、不改地图。V11.6证据已核对，其真实Qwen效果仍未复测。

## 检查点

- 前置基线 `b1a0d2e`：保留V11.4–V11.6已有修改和用户指定的三处UI删除。
- V12.1：原公告板E入口打开纸质面板；明确世界日期/时刻，公开正文1–120字，固定树荫广场/60分钟。服务端保存、同请求幂等、他人取消403、过期时间400、发布冷却429已在真实测试PostgreSQL通过。类型、lint、公告输入单测通过。证据 `web/evidence/v12/v12-board-819f01bd-26ac-446d-8207-b046920e2506/result.json`。浏览器E与外观留待最终完整故事验证，不提前标为通过。
- V12.1提交：`362002a`。
- V12.2：发布事务发出明确公共通知，六居民保存知悉时间和意向。需求、性格、合法路程、工作、已有私人约定参与判断；私人关系仅在服务端导出是否熟悉的布尔判断，不输出聊天、姓名或来源凭据。可控状态产生参加/拒绝/推迟，既有约定不覆盖；8项相关测试、类型及lint通过。含回应的数据库回归 `web/evidence/v12/v12-board-8a16e7fa-bb91-4daa-82dd-b0e36704308d/result.json`。尚未把意向当作参加。
- V12.2提交：`b8c8c99`。
- V12.3：复用原持续行动/门户/路程耗时，提前12游戏分钟余量出发；到场与活动开始后至少停留6分钟分开记录。重要任务/咖啡馆约定优先，不抢占未结束路径；活动结束未参加者明确missed。10项相关测试、类型/lint、真实数据库故事与并发推进/双唤醒/暂停回归通过。证据 `web/evidence/v12/v12-story-dc5186d0-ae18-4d31-b2ab-e7273615d7f8/result.json`。尚未用模型声明推断结果，浏览器最终验收仍待执行。
- V12.3提交：`deae5e7`。
- V12.4：真实参加生成本人知情的原经历事实；实际交流引用原会话事件；同场不自动增加关系。按活动日期取亲历与公开知识，未参加者不冒认。补充有限回应历史、经过校验的访客现场会面和离场后的事实保留。最后本地检查点见 Git 日志，未推送。

## 存储

共享世界JSON可选 `gatherings`，包含活动ID、worldId、公开正文、地点、created/start/end世界分钟、状态和居民回应。发布者visitorId、幂等请求和现实发布时间单独存于新表 `town_notice_owners`，不进入GET世界响应。添加式迁移 `web/scripts/v12-schema.sql` 仅创建表和索引；不初始化或重置世界。公开正文是玩家主动披露的信息；私聊原文与身份凭据不会被自动复制。

单世界行锁序列化发布、取消和原推进；每访客每现实60秒最多发布一次，同时最多两个有效活动，时间不重叠。请求失败保留同requestId供人工重试，不偷偷创建第二场活动。开始时间要求未来30分钟至2游戏天；正文中的时间不参与解析，表单明确选择为准。

## 调用链和行为边界

玩家沿原场景移动，靠近咖啡馆旁既有黑板（原“街角公告”）按E → `TownScene.onNotice` → `NoticeBoard` → `GET/POST /api/world/notices` → 原签名Cookie → `notice-store.changeNotice` → 世界行锁、公告归属行与世界JSON同事务保存 → 原世界HTTP轮询显示。

没有新建地图物件。该黑板原来仅打开日志，现为公共活动入口；日志仍有原独立入口。纸质面板只展示正文、世界日期、居民回应和结果；ID/JSON仅开发诊断展开。主动公开提示与私人聊天分开。

`notifyGathering`是明确的后台公共广播：六名居民在发布分钟获知相同内容，各自调用 `assessGathering`。能量/饥饿优先，已有咖啡馆会合优先；工作/进食/休息可推迟；安静且心情平稳、不熟悉发布者者可能拒绝。私人熟悉信号只用于这次判断，不写入公开回应。没有公告正文驱动模型执行或调用外部模型。

世界原 `advanceWorld` → `prepareWork` → `refreshGatherings` → 未完成行动继续 / `appointmentDecision ?? gatheringDecision ?? decide` → `execute`/持续进度 → 再核对到场 → 原 `beginSocial`。活动没有独立Worker、队列或另一套寻路：室内先合法走到出口、出门、沿室外道路前往square；每段路径和持续时间使用原引擎。时间未到可继续日常；临近时重新估算路程。工作和迫切需求可以使居民晚到或错过，接受不保证准点或全员到场。

到场要求后台sceneId=town、业务地点square、在广场110世界单位范围内且非经过中的移动；接受者在活动开始后实际停留至少6游戏分钟才 `participated`。有意向的路过者、拒绝者、仍在路上者不算参加。活动开始前最多提前30分钟进入等候。参加者后来离场仍保留其参加时间，另记离场原因；不会把真实经历擦成“未参加”。世界暂停/关网页时延续原时钟行为，不离线补算。

原持续行动安全结束，不在取消时瞬移。结束时根据持久参加时间生成结果，未参加者为missed/declined，保留原因。每人回应历史最多12项，保留最初回应及最近变化，便于在公告内展开核对。

## 事实、记忆、关系与隐私

- `experiences.recordExperience(..., "gathering", ...)` 仅对已验证的实际参加者写单人事实，eventId/场景/世界时间明确；opinions仍是标记为“我的感受”的人格规则表达，不是模型确认的公共事实。
- 参加本身不增加关系，也不因活动中共同站在广场触发原碰面关系增量；只有实际符合原距离、需求、冷却、轮次和每日额度条件的交流才调用原conversation经历。聚会提供共同话题动机，不能绕过工作/忙碌或冷却。
- 完成的交流会话ID保存在活动结果中；`gatheringKnowledge`将本人参加事实、实际完成的交流与公开公告分别送入聊天上下文。查询“昨天”按世界日筛选。未参加者只能说知道公告，没有参加事实；轻量冲突检查拦截其模型回复虚构“我参加了”。普通对话没有全部模板化。
- `town_gathering_visits` 单独保存公告/visitor/NPC/时间的私有归属。活动中玩家实际靠近参加者，前端每10秒按需报告本地位置，后台检查合法站位、范围和权威NPC距离；只记录“碰面”，不声称双方交谈、不增加好感。重复上报幂等，共享请求额度限制频率，不使用模型额度。
- 公共碰面事实不含玩家姓名、visitorId、私聊原文或私聊轮次。参加者也不能因此读取发布者私聊；来自不同访客的私聊仍按原复合键隔离。

## 完整故事实际结果

随机隔离世界的可控夹具：第1天13:00，六名原居民，沐溪较疲惫、老林已有未完成工作、安静居民更偏好独处。只有初始需求/工作夹具为测试设置；发布后没有强制NPC去哪里或修改其回应。玩家初始站在公告板旁，之后使用真实键盘移动。

| 时间 | 后台事实 |
|---|---|
| 第1天13:00 | 发布“今天下午四点，大家来广场聊聊天吧！”，表单明确16:00；阿晴/小雨/小满愿意，阿宁/沐溪拒绝，老林先忙工作 |
| 14:02 | 老林完成先前事务后的重新考虑仍偏好独处，改为拒绝；没有取消他的工作来保证出席 |
| 15:40左右 | 有参加意向的居民开始实际赶路，其他人照常活动 |
| 15:56 / 16:06 | 小雨到场 / 满足活动时间内停留，实际参加 |
| 16:22 / 16:28 | 阿晴因先处理事务较晚到场 / 实际参加 |
| 16:28 | 阿晴与小雨经原社交条件开始一段两轮交流，之后完整结束 |
| 17:00 | 聚会结束：阿晴、小雨参加，完成1段交流；小满未完成参加，明确missed，其他拒绝者没有亲历 |
| 第2天08:00 | 经原tick API推进到次日，重启隔离Web进程；玩家靠近阿晴按E，回复“记得，第1天我在广场参加过聚会。” |

这不是每次运行都固定的演出；因实际需求和工作可能晚到或错过是测试观察结果，不把“全部参加”当成功条件。

## 实际截图、连续录屏和数据

第一轮完整实际录屏及最终状态位于：

回应历史与离场事实补齐后的最终版本再次通过完整浏览器故事（同样0外部调用、0页面错误）：[最终连续录屏](../web/evidence/v12/v12-browser-724bc7b6-1fd2-467c-bd93-f8cdbe4e000e/journey.webm)、[最终结果公告板](../web/evidence/v12/v12-browser-724bc7b6-1fd2-467c-bd93-f8cdbe4e000e/07-result-board.png)、[最终次日回忆](../web/evidence/v12/v12-browser-724bc7b6-1fd2-467c-bd93-f8cdbe4e000e/08-next-day-memory.png)、[完整最终时间线](../web/evidence/v12/v12-browser-724bc7b6-1fd2-467c-bd93-f8cdbe4e000e/result.json)。含回应历史的最终存档也再次实际重启测试PostgreSQL验证：[最终恢复记录](../web/evidence/v12/v12-recovery-5d3a7d5b-a233-49fb-8004-9ac0e2abe12c/result.json)。以下第一次记录保留，不覆盖历史证据。

- [连续录屏](../web/evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/journey.webm)
- [公告板与不同回应](../web/evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/02-notice-responses.png)
- [实际行走](../web/evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/03-real-route.png)
- [居民实际参加并自然交谈](../web/evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/04-actual-participants.png)
- [活动结果](../web/evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/07-result-board.png)
- [次日亲历回忆](../web/evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/08-next-day-memory.png)
- [浏览器原始时间线](../web/evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/result.json)

录屏从13:00发布到17:00结束使用实际自动运行，每现实秒最多结算2游戏分钟；第二浏览器同时观察，后端时隙控制没有双倍加速。结束后到次日部分通过原手动推进HTTP API快速逐步推进（不是改时间字段或离线补算）；之后步行、E交谈仍在录屏中。1440×900主页面、1366×768第二浏览器；pageerror=0。

## 验证结果

| 验收 | 结果与证据 |
|---|---|
| 公告板E、发布与世界时间 | 浏览器实际E打开、POST200、世界13:00发布16:00；过去时间400 |
| 幂等/限额/权限 | 并发同requestId仅1公告；60秒冷却429；非本人取消403；正文/地点/时间单元校验 |
| 不同居民选择、原工作约定 | 控制状态产生三种意向；原咖啡馆约定拒绝冲突；重要工作优先，原V11.6数据库回归再次通过 |
| 真实路线和参加 | 原tick真实推进、逐段validScenePath；到场/停留/参加分离；取消和迟到有明确结果 |
| 世界并发 | 同revision并发tick仅1成功；同时间并发wake只推进2分钟；暂停wake不推进 |
| 记忆/关系 | 本人参加来源、未参加者无来源、共同在场不加关系；实际完成交流有独立事件；次日查询通过 |
| 模型上下文/冲突 | 2次本地HTTP模型替身请求，实际prompt包含本人事实；未参加者虚构参与触发fact_conflict；无第二模型评审 |
| 私聊隔离 | 两浏览器共享同一公告；第二浏览器不能取消/读取第一浏览器私聊；公开世界不含测试私名或visitorId |
| Web重启 | 次日存档与重启前完全一致，E交流读取来源记录 |
| PostgreSQL真实重启 | 3个世界、3份公告归属、3份现场会面、5份私聊精确恢复；未完成路线同ID再推进1000ms |
| 工程检查 | 类型检查、lint（0警告）、30文件169项单元测试、生产构建通过 |

数据库最终扩展故事：[result.json](../web/evidence/v12/v12-story-9b5d2861-3c79-4c37-a1ee-10dc1b499cf8/result.json)。模型替身：[result.json](../web/evidence/v12/v12-story-42a8b9d0-1aa6-4bd0-a5d8-1f0ef4327a94/model-check/result.json)。测试PostgreSQL实际重启：[result.json](../web/evidence/v12/v12-recovery-455e8781-ea1b-413e-b288-acf8c3a58187/result.json)。V11.6再回归：[result.json](../web/evidence/v11-6/v11-6-7c729997-6db8-4710-a4c1-6cf731a6ddee/result.json)。这些均为本地测试，不是外部Qwen成功证据。

实际执行命令（web目录；复测使用新证据目录，不能覆盖已有记录）：

```powershell
npm run typecheck
npm run lint
npm test -- --reporter=dot
npm run build
node --env-file=.env.test.local --import tsx scripts/migrate-v12.ts --apply
node --env-file=.env.test.local --import tsx scripts/v12-board-check.ts
node --env-file=.env.test.local --import tsx scripts/v12-story-check.ts
$env:STORY_RESULT='evidence/v12/v12-story-42a8b9d0-1aa6-4bd0-a5d8-1f0ef4327a94/result.json'
node --env-file=.env.test.local --import tsx scripts/v12-memory-check.ts
node --env-file=.env.test.local --import tsx scripts/v12-browser.mjs
$env:BROWSER_RESULT='evidence/v12/v12-browser-11717878-f4c8-4af7-b9fb-1e10d7d5e0f6/result.json'
node --env-file=.env.test.local --import tsx scripts/v12-recovery-check.ts --restart-test-postgres
node --env-file=.env.test.local --import tsx scripts/v11-6-check.ts
```

所有新脚本校验127.0.0.1:55488/ai_town_mvp_test；浏览器仅自建3138进程，关闭时只结束自己的子进程。数据库重启先核验固定测试容器端口和命名卷，不接触主55487。没有新增付费调用。

## 运行与旧存档兼容

世界schema2增加可选gatherings，旧快照缺少该字段时正常读取且不会自动播种。现有V11.6邀请和姓名结构保持；其163项旧测试包含在全量169项中。新活动亲历使用原经历结构的gathering类型，旧世界的既有关系/工作/记忆不重置。

本轮仅在测试库执行迁移。主库采用新版前，在确认本项目 `.env.local` 后执行以下**仅追加两表/索引**的命令，再正常重启原应用；不执行seed或世界初始化：

```powershell
cd web
node --env-file=.env.local --import tsx scripts/migrate-v12.ts --apply
npm run build
npm start
```

已有3100服务须先按原启动方式停止/重启，不能并行占同端口；本轮没有接管或重启它。迁移脚本校验本项目本机55487/55488及对应数据库，SQL只含CREATE IF NOT EXISTS；不会清库、改NPC或聊天。新安装的 `schema.sql` 同时包含新表。回退代码前备份当前快照，旧程序不保证理解新增活动记忆类型；不要以旧代码写入新活动存档来测试兼容。

## 新增/修改文件

- 新增：`web/src/lib/gatherings.ts`、`notice-store.ts`、`web/src/app/api/world/notices/route.ts`、`web/src/components/NoticeBoard.tsx`。
- 集成：`world.ts`（原决策链）、`experiences.ts`（来源事实）、`social.ts`（共同活动动机）、`chat-context.ts/chat-service.ts`（公共知识/亲历与保护）、`Town.tsx/TownScene.tsx`、`globals.css`。
- 数据库：`web/scripts/v12-schema.sql`、`migrate-v12.ts`、`schema.sql`追加新表。
- 验证：`web/tests/notices.test.ts`、`gatherings.test.ts`；`web/scripts/v12-board-check.ts`、`v12-story-check.ts`、`v12-memory-check.ts`、`v12-recovery-check.ts`、`v12-browser.mjs`。
- 文档：`AGENTS.md`、`docs/spec.md`、`web/README.md`、本文件。没有新增依赖、美术、建筑或NPC。

## 已知限制与扩展边界

只支持树荫广场、固定60分钟活动；不理解正文里的自由时间表达，以明确表单为准。公告回应是状态规则的短句，不宣称由真实模型生成。聚会可错过或无人参加；不能保证居民为了活动放弃迫切需求。

公共世界保存最近约30场活动及有限回应变化；私人归属/幂等记录仍留在SQL，原经历使用既有有限保留策略。没有无限长期活动搜索或通用任务系统。已结束公告结果是公开信息；没有参加者亲历不能因知道结果而升级。

玩家仍是本地化身，上报位置有后台几何校验，但不是防伪造的服务端多人移动。现场碰面仅说明合法范围内相遇，不等于逐一交谈或关系变好。清Cookie无法认领旧公告，不能伪造发布者身份。首次浏览器故事使用可控需求夹具，不说明正式存档必有同样出席者。

真实Qwen对新增公共活动上下文的自然表达未验证；全部本轮模型为Mock/Fallback。没有云部署或性能并发人数承诺。

以后增加另一种公共活动，最小步骤是：明确定义地点/可通行活动点与时间规则、扩展公告白名单、复用当前参与判定/持续行动/来源事件、增加对应隔离测试与UI文案；无需复制调度服务或建立Agent框架。本轮不实施扩展。
