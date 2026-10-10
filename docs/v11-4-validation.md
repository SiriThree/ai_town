# V11.4 真实模型与世界行为一致性验收

2026-10-10；基线 `7a8139f`，开始时 Git 干净。**本地验收完成；随后用户明确授权8次Qwen，已全部执行，HTTP均成功，但事实一致性未全面通过。** 逐句结果见文末“授权后实测”。后续提示词补强只有本地回归，没有第9次调用。不将替身台词算作模型能力证明。

## 调用链与本轮发现

签名匿名 Cookie → 服务端 visitorId → 世界/NPC/访客三元组读取私人聊天和 player_memory → buildMessages 的 playerAcquaintance、本人 privateAppointments、最近4轮对话及权威世界事实 → 模型仅生成文字。首遇/明确自报称呼/近8次互动各有来源；普通聊天不增长 trust/affection。邀请的白名单意图先经过 confirmInvitation 短事务确认，不等 LLM，也不以“好啊”代替执行。

已确认的公共约定只带脱敏状态；私人请求/原文保存在 town_invitations。advanceWorld → appointmentDecision → 原持续行动/道路/入口 → 实际到达或失败 → updateWorld 同事务同步私人约定。AI 等待不持有世界事务锁；同NPC回复锁只防止交错写聊天，不停止世界。

**真实缺陷：混合快照。** 原 chat 在请求开始读世界，在额度校验后才查约定。测试锁住该测试世界的 request 额度行，让聊天等待，同时正常推进至咖啡馆：模型收到世界 v1 / town，却收到 arrived 约定，实际世界已为 v6 / cafe_interior。

修复仅涉及 `chat-service.ts` 和 `invitation-store.ts`：通过 privateConversationState 的一条 SELECT、相关私有子查询取得同一 MVCC 快照；台词来源版本也取该快照。状态查询直接复用这一份约定，不重复读取。没有数据库迁移、地图修改或行动系统重构。

- [修复前事实](../web/evidence/v11-4/snapshot-before/result.json)：consistent=false，v1/town 与 arrived 混合。
- [修复后事实](../web/evidence/v11-4/snapshot-after/result.json)：consistent=true，v6/cafe_interior 与 arrived 一致。
- 这保证送入模型的事实自洽，**不保证模型绝不幻觉**。模型等待期间世界仍会前进，回复有其 worldRevision/minute 依据；未引入停世界等回复或第二个AI审查者。

## 故事时间线（真实数据库与本地替身）

主故事随机世界 `v11-4-story-c360ab6c-bad8-4e66-b1b3-08f12d35471f`，仅使用 127.0.0.1:55488 / ai_town_mvp_test；创建自己的测试状态，不重置主世界。

| 时间/分支 | 后台实际证据 | 台词与判定 |
| --- | --- | --- |
| 第1天08:00，首次 | meetings=0，无name、无私人约定 | 替身回答不认识，不猜称呼 |
| 同访客再次 | 首轮真实turnId进入playerAcquaintance | 替身说第1天聊过；没有自报名就不编名字 |
| 另一访客 | 独立历史，模型上下文meetings=0、appointments=[] | 不认识，不可读取A的记录 |
| 08:00邀请 | accepted持久化，暂停；同requestId重放返回同一轮且仅一个约定 | 后台确定性回复“恢复小镇时间后，我去咖啡馆”，0模型调用 |
| 08:02 | travelling + 持续行动ID、真实路径/坐标 | 替身回答正前往、尚未到；没有仅凭台词判到达 |
| 08:10 | 实际cafe_interior、arrived、到达事件，私有记录同事务更新 | 普通“为什么来这里”走模型适配，读取真实邀请与到达证据 |
| 独立取消分支08:02–08:04 | cancelled，已开始的ongoing.id不变 | 取消确认与后续模型说明一致；合法移动可安全结束 |
| 第2天08:10 | 原规则720次真实事务推进，早期聊天被21轮无模型闲聊挤出20轮窗口；首遇与约定仍在 | 替身能收到第1天来源，不重复执行已履行约定 |
| 独立工作分支 | 老林真实workTask.phase=active，确认deferred，不修改原工作世界 | “忙完请再邀请”，后续替身说明工作冲突；没有虚假立即出发 |
| 紧急需求分支 | 接受后测试夹具把精力设12；原规则waiting→恢复需求→travelling→arrived | 不是固定进出脚本；约定未被普通决策悄悄删除 |
| 503 / 超时 / 无密钥 | 分别service_error、timeout、not_configured | 可读的真实认识记录降级回复，锁释放，无付费网络 |

[完整记录](../web/evidence/v11-4/mock-story-c360ab6c-bad8-4e66-b1b3-08f12d35471f/result.json) 包含每次模型输入、生成台词、后台确认、实际NPC状态、路径、事件、私人记忆和调用序号。所有内容为隔离测试合成数据；不记录密钥/Authorization/Cookie签名。Mock usage数字只是测试数据，不是供应商计费凭证。

## 恢复与隐私

- 实际重启已核验端口55488及专用volume的测试PG容器：2世界、3私聊记忆、2约定逐字段一致，未完成行动同ID续进1000ms。[证据](../web/evidence/v11-4/recovery/result.json)。未重启主PG。
- 重启后启动新Node验证进程：第2天1930分钟，first仍指向第1天480分钟真实轮次（已不在当前20轮中），降级回答“第1天我们聊过”；name仍不存在，trust/affection均0；已到达约定与私聊归属保留。[证据](../web/evidence/v11-4/recall-after-restart/result.json)。这是恢复证明，不冒称恢复后的真实Qwen调用。
- 两个独立浏览器Cookie验证本人历史/约定隔离，伪造visitor字段无效；生产Secure/HttpOnly/SameSite=Strict、无/篡改Cookie401、跨站403、公开初始化403及模型额度重启后不清零另行回归。[安全结果](../web/evidence/v11-4/security/result.json)。
- 主应用只读时为v1002、第6天07:12、6居民、暂停，与历史V10.4快照已经不同；没有回退或重置。[只读记录](../web/evidence/v11-4/main-preserved/result.json)。主应用进程重启被自动审批策略拒绝，返回仅“blocked by policy”；保留原进程，新代码在独立3126生产测试进程验证。主端口3100需稍后正常重启才加载修复。

## 浏览器实测

真实Chromium，Next生产构建，独立测试端口3126，合成访客。广场起点为明确的玩家夹具；之后真实键盘走到咖啡馆、按E进入，不将夹具当成已经走过的路程。

- E交流→初识/自报小舟/重复认识→刷新和后台进程重启→保留身份。
- 后台确认邀请→再次重启→点击自动运行→真实道路和门户到达→玩家步行进馆→查询已到达→模型替身解释到达原因。
- 默认没有AI/Fallback/版本标签；气泡≤265px宽/105px高，底部输入≤700px宽；诊断开关保留来源，完整历史可查看。两种桌面尺寸与输入键盘隔离、真实送食物均通过。
- 超时等待时可以告别并键盘移动；世界490→492分钟，玩家x→528.29，回复最终timeout且保存。NPC没有因聊天被占用。[等待时间线](../web/evidence/v11-4/browser-final/wait-timeline.json)。

截图及录像（均来自本轮实际运行页面，**对白模型为本地替身**）：

- [相认气泡](../web/evidence/v11-4/browser-final/02-recognition.png)
- [后台接受邀请](../web/evidence/v11-4/browser-final/05-invitation.png)
- [进馆与真实到达反馈](../web/evidence/v11-4/browser-final/06-meeting.png)
- [完整历史](../web/evidence/v11-4/browser-final/07-game-history.png) / [显式诊断](../web/evidence/v11-4/browser-final/08-diagnostics.png)
- [等待中自动运行](../web/evidence/v11-4/browser-final/11-waiting-auto.png) / [关闭后继续观察和移动](../web/evidence/v11-4/browser-final/12-exit-during-wait.png)
- [完整录屏](../web/evidence/v11-4/browser-final/journey.webm) / [浏览器结果](../web/evidence/v11-4/browser-final/result.json)

## 实际命令与结果

全部在web目录执行；数据库脚本使用 `.env.test.local`，模型显式覆写为本机替身/禁用，保留原证据及失败测试数据。

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck`、`npm run lint` | 通过；新脚本初次有类型推窄/prefer-const问题，修复后重跑通过 |
| `npm test -- --reporter=dot` | 25文件147测试通过；本轮新增混合快照回归是实际PG脚本 |
| `npm run build` | 生产构建通过，无新依赖 |
| `node --env-file=.env.test.local --import tsx scripts/v11-4-snapshot-check.ts` | 修复前复现混合事实；修复后设置EVIDENCE_DIR=snapshot-after并加`--expect-consistent`通过 |
| `node --env-file=.env.test.local --import tsx scripts/v11-4-story-check.ts` | 最终10次本地HTTP替身（8正常+503+超时），0外部调用；故事/跨天/中断通过 |
| `V11_STAGE=game-ui V11_EXTENDED=true EVIDENCE_DIR=evidence/v11-4/browser-final` + `node --env-file=.env.test.local --import tsx scripts/v11-browser-check.mjs` | 上述真实浏览器故事及等待期间操作通过，9次本机替身，0外部 |
| `EVIDENCE_DIR=evidence/v11-4/recovery STORY_RESULT=…/mock-story-c360…/result.json` + `node --env-file=.env.test.local --import tsx scripts/v11-recovery-check.ts --restart-test-postgres` | 实际测试PG重启恢复通过 |
| 相同STORY_RESULT + `node --env-file=.env.test.local --import tsx scripts/v11-4-recall-check.ts` | 新进程跨天首遇及完成约定恢复通过，0模型 |
| `EVIDENCE_DIR=evidence/v11-4/security` + `node --env-file=.env.test.local --import tsx scripts/v11-security-check.mjs` | 见安全结果；只使用本机模型 |

环境变量示例按PowerShell需逐项 `$env:NAME='value'` 设置。脚本初轮故事把含“记得…约定”的问题送进已有确定性状态分支，导致预期10次实为9次；改为真正走模型的记忆问题后重跑，未改变业务路由凑结果。初次并发脚本的pg_stat_activity匹配漏掉SQL首部空白，修正检测后才获得有效复现。失败证据未清理。

## 授权前列出的真实Qwen验收计划（保留原记录）

本轮已授权部分做到这里，下一步需用户明确允许付费调用（用户请求第二节要求）。已只读核验：`AI_MODEL=qwen-plus`、`AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`、密钥存在、8秒超时。密钥不输出也不提交。

预计 **8次、整次硬上限8次外部尝试，失败也占次数，不重试**：

1. A首次见面，没有自报名。
2. A再次询问是否认识。
3. B独立访客询问是否认识。
4. A邀约成功、NPC途中时说明方向与原因。
5. 实际到达后说明为何来此、之前交谈。
6. 独立取消分支询问是否仍需会合。
7. 真正跨一天且早期聊天移出窗口后回忆经历。
8. 老林工作冲突已确认推迟后说明原因。

接受/拒绝/取消/状态查询由现有后台确认，**不额外调用模型**。超时/503/批量额度只用Mock，不用真实供应商故障或负载测试。`NPC_AI_ENABLED=false`；并发1；`AI_CALLS_PER_DAY=8`；额外整次出站计数8，不因切换测试世界或跨日而放宽；每条消息上下文≤24000字符，输出每次≤400token，总输出上限3200token。此为调用/长度上限，不冒称精确人民币上限。

准备的 `v11-4-story-check.ts --real-approved` 仅在额外授权后运行，默认无flag永远Mock。真实模式要求HTTPS、qwen-plus、testMode=false与独立测试库，记录逐次生成原文/usage、后台约定、世界执行和事件记忆；不记录请求头或秘密。供应商计费以实际usage和账单为准，无法从Mock token推出真实费用。

**授权前真实模型调用0、外部模型费用0；授权后结果见下文。** 最终有效本地套件为故事10+浏览器9+快照前后2+安全3，共24次本机模拟HTTP；另有脚本调试/初版运行，不是付费模型。验收不是看到HTTP200即判成功。

## 改动与限制

- 业务修改：`web/src/lib/chat-service.ts`、`web/src/lib/invitation-store.ts`，仅一致事实读取。
- 新回归：`v11-4-snapshot-check.ts`、`v11-4-story-check.ts`、`v11-4-recall-check.ts`；复用浏览器/恢复脚本增加独立证据目录和扩展分支。
- 文档：本记录、AGENTS、spec、web/README。无迁移、无模型配置修改、无地图/职业/记忆结构重构。
- 模型仍可能不遵守提示，真实语言验收未通过前不称V11.4全部完成；普通回复是请求快照，NPC可能在等待期间继续走动。Cookie清除/过期/换设备不互认；推迟需再邀请；玩家位置仍前端本地，不声称后台证明玩家也到了。
- 本轮不部署、不推送、不扩展功能。主应用进程重启受阻另行注明，不影响隔离端口完成本地验证。

## 授权后实测：8/8已执行，不全部判通过

用户明确回复“是，授权执行这8次真实模型验收”。执行命令：

```powershell
node --env-file=.env.local --env-file=.env.test.local --import tsx scripts/v11-4-story-check.ts --real-approved
```

执行前只输出脱敏配置确认：测试DB 127.0.0.1:55488/ai_town_mvp_test；qwen-plus；dashscope.aliyuncs.com/compatible-mode/v1；keyPresent=true；8秒超时。先加载本项目模型配置，再由测试配置覆盖数据库。NPC_AI_ENABLED=false，8次串行、不重试。真实世界ID `v11-4-story-8c70e71e-ca06-43a6-bd79-cfa3e1d4dba3`，另有独立取消/工作分支。

每次出站之前和结束后写脱敏 `call-ledger.json`；所有8次HTTP200、source=ai，响应时间约0.49–0.77秒。没有Fallback替代真实成功，也没有在失败后悄悄补测。

| 次数 | 真实Qwen原话 | 与后台对照的结论 |
| --- | --- | --- |
| 1 初识 | 你好，还不认识呢。 | 通过。meetings=0，不编造名字/经历 |
| 2 重逢 | 刚认识呢，只聊过一次。 | 通过。恰有一轮同访客记录 |
| 3 另一访客 | 抱歉，我们还没见过呢。 | 通过。独立visitor，无A历史/约定 |
| 4 赴约途中 | 去麦香咖啡馆，约好了。 | 通过。真实travelling与室外路径，不虚称到达 |
| 5 到达原因 | 来咖啡馆赴约。刚才只简单打过招呼。 | **部分通过**。确实490分钟通过入口到达；但“只打招呼”遗漏已经确认的邀请，与所给4轮历史概括不符 |
| 6 取消后 | 我们的咖啡馆约定已取消了。 | 通过。私人/公开约定均cancelled，已开始路径继续安全完成 |
| 7 跨天经历 | 记得，我们刚才在咖啡馆门口聊过。 | **证据不足**。最近确实有闲聊，当前NPC确在咖啡馆门口；但回答没有利用第1天首遇/赴约的重要事实，不能证明跨天重要记忆被采用，且后台未保存玩家历史站位，不应推断双方共同地点 |
| 8 工作推迟 | 货架整理才做到一半，得先收个尾。 | **失败**。老林还在室外赶去杂货铺，workTask.progress=0、ongoing=move；“一半”“收尾”没有依据。推迟约定本身和不改原工作状态正确 |

8句均为9–17可见字符，语气简短，没有假到达、假接受、把取消说成有效或访客泄漏。样本有限，不构成稳定无幻觉的保证。后台的到达、取消、重复请求幂等和720步跨天全部仍通过，与语言审读结果分别记录。

- [原始脱敏调用与世界证据](../web/evidence/v11-4/real-story-8c70e71e-ca06-43a6-bd79-cfa3e1d4dba3/result.json)
- [逐调用账本](../web/evidence/v11-4/real-story-8c70e71e-ca06-43a6-bd79-cfa3e1d4dba3/call-ledger.json)
- [人工判定与usage汇总](../web/evidence/v11-4/real-story-8c70e71e-ca06-43a6-bd79-cfa3e1d4dba3/review.json)

### 仅修复实际暴露的上下文缺口

`chat-context.ts`此前没有独立workTask事实，模型虽然可见移动描述和decision.reason中的0/2，仍把“active工作”说成“做一半”。现在传入真实workTask与performingWork；提示明确active是已有任务，途中不等于正在做货架，0进度不能说半成/收尾。

首遇和已履行邀约本来存在于上下文，但埋在近期泛泛记录中。本轮只增加从已有私有事实派生的playerRecall（首遇日、已履行约定），提示回忆重要经历时优先采用，并禁止把当前地点反推成过去双方站位、把已有邀约概括为“只打招呼”。不改记忆数据库、不替换模型回答为模板、不建立审查Agent。

新增 `tests/v11-real-context.test.ts`：使用真实规则产生的途中工作状态验证progress=0/performingWork=false；验证跨天重要来源、不同访客空认识记录。**这是模型输入回归，不是模型输出修复成功证明。8次额度耗尽后没有再次调用真实模型。**

### 成本与用量

供应商返回：输入8912 token（其中缓存命中768），输出75 token，总计8987 token。按[阿里云官方Qwen-plus价格](https://help.aliyun.com/zh/model-studio/qwen-plus)北京≤128K非思考档，非缓存输入0.8元/百万、缓存0.16元/百万、输出2元/百万估算：

`((8912−768)×0.8 + 768×0.16 + 75×2) / 1,000,000 = 0.00678808 元`，约 **0.0068元**。

这不是实际账单：未登录账单控制台核对，免费额度/优惠及账户实际结算未验证。使用当前已配置的国内接口，没有改模型地域或套餐。真实次数为8；后续所有恢复/浏览器检查关闭模型，新增真实次数为0。

### 真实回复保存恢复与浏览器展示

对这次真实世界再次执行专用PG容器重启：世界、私聊记忆、已完成约定和进行中动作逐字段恢复。[恢复结果](../web/evidence/v11-4/real-recovery/result.json)。新启动独立生产Next进程3127，AI_ENABLED=false、AI_API_KEY为空，使用合成访客A的测试签名Cookie经真实GET API读回原Qwen回复。另一新Cookie历史/约定为空。

浏览器真实显示数据库中的第7条Qwen台词（保留原问题，不伪造修复后的台词）；诊断标记“AI回复”，正常界面无技术标签。没有聊天POST、没有新模型请求，世界未变。玩家起点为明确测试夹具，不冒称这次走完全部赴约过程；完整移动故事录像在前面的Mock浏览器部分。真实8次请求由生产chat服务/模型适配/PG执行，不声称这8条都经浏览器输入。

- [实际页面保存的Qwen回复](../web/evidence/v11-4/real-history-browser/01-real-saved-reply.png)
- [实际历史](../web/evidence/v11-4/real-history-browser/02-real-history.png) / [诊断来源](../web/evidence/v11-4/real-history-browser/03-real-source.png)
- [查看历史录屏](../web/evidence/v11-4/real-history-browser/history.webm) / [浏览器只读结果](../web/evidence/v11-4/real-history-browser/result.json)

本次增量文件：`chat-context.ts`、`v11-real-context.test.ts`、故事脚本的逐次账本、`v11-4-real-history-browser.mjs`及本记录/README/spec/AGENTS。类型检查、lint、26文件149单测、生产构建均通过。真实数据库恢复及真实历史页面验证通过。未改主世界、地图、决策、模型配置或存储结构。

**停止状态：8次授权已用尽，本次验收执行完成，但V11.4的事实一致性不判全通过。** 重要记忆引用及工作描述补强后的真实效果尚待另行获准的复验。本轮不追加模型调用、不部署、不推送、不扩玩法。
