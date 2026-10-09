# 自然生活 V10.1–V10.3 验收

本任务基线55e44fa，与上一任务视觉样板V10.1重名但不覆盖其报告。无外部付费模型，无部署/推送。

## V10.1 持续行动

根因：advanceWorld每5秒完整execute，位置直接到终点；scene-motion又将整段动画封顶3秒。现改为每1现实秒结算2模拟分钟，固定1x，手动一步同量；wake缺席不补算。NPC ongoing保存独立行动ID、决策、同场景路线、开始模拟分钟、elapsedMs/durationMs。80世界单位/秒（约1.67个48单位寻路格），距离越长耗时越长。location在移动完成前不改成目的地，门户另一步合法校验；工作/协助8秒、进食8秒、休息12秒、阅读6秒，只完成时结算。紧急需求中断静态工作保留WorkTask进度，普通检查不中断。需求每30模拟分钟+2饥饿/-1精力，避免长途途中原5秒急速代谢使居民永远疲惫。

持久化仍是原PostgreSQL JSON行锁事务，schema2新增可选ongoing；原存档没有字段就从已保存位置开始下一行动，不猜测旧动画进度。只读验证主存档revision661/6居民，内容读取不变，副本300步合法。前端只播放服务器已提交的短路径片段，无每帧数据库写入；暂停读到后停在后台已保存位置（最多一个同步片段的视觉校正），不会预测到目的地。后台重启和刷新可恢复途中动作。

验证：`npm run typecheck`、`npm run lint`、`npm test -- --reporter=dot`（120测试/19文件）、`npm run build`通过。旧单元测试改为等待动作完成，保留合法门口/碰撞/效果断言，新增持续行动时序测试。`node --env-file=.env.test.local --import tsx scripts/v10-motion-check.mjs`使用55488隔离世界/3118、禁用模型，真实长途跨到苇岸居、双标签竞争、途中暂停、刷新、后端重启逐字恢复、6倍CPU降速通过。

[长途截图](../web/evidence/v10-life/motion/01-long-walk.png) · [暂停](../web/evidence/v10-life/motion/02-paused.png) · [慢CPU](../web/evidence/v10-life/motion/03-slow-cpu-walk.png) · [录屏](../web/evidence/v10-life/motion/long-walk.webm)。慢CPU是浏览器CPU节流，不是宣称固定低FPS。当前没有倍速产品功能，只验证固定1x与不按帧数推进；未假称高倍速验收。

## V10.2 有限自然交流

实际原因：原系统只保存2句结果，无进行中的轮次；同时显示两泡且不占用居民行动。沿用原会话ID、触发、预算、关系记忆模块，新增timeline持久turnIndex/elapsedMs/completed；每句5秒，2句10秒，一次只显示当前说话人。双方在真实位置互相朝向，完成后继续决策；其他居民照常行动。阅读/短暂停留可以转为交谈，工作/休息/吃饭/走路不抢占，冷却120模拟分钟、每模拟日8次保持。已结束旧会话仅作历史。

公开Fallback每句10–30字；模型提示同要求，grapheme计数处理emoji组合字符。超长模型回复不重试，改用本地短句并标注降级；未采用原文单独保存在公开记录，历史可展开，不裁成互不相关片段。按自然标点平衡换行。普通寒暄仅记录接触熟悉度，不再无条件增加trust；真实工作合作仍增加有来源的信任。私人聊天从不作为公开模型上下文。

125测试/20文件、类型/lint/生产构建通过。`node --env-file=.env.test.local --import tsx scripts/v10-social-check.mjs`（EVIDENCE_DIR=evidence/v10-life/social-ordered）实际浏览器验证本机模型正常/503/超时，每种2次调用、正确第一/第二说话人、暂停时轮次不跳、角色停留、其他居民继续行动、历史与后端重启恢复。原测试曾假定阿晴先说，但实际会话首位是阿宁；已改为按会话turns读取身份，失败证据保留，非业务错误。

[第一句](../web/evidence/v10-life/social-ordered/turn-1-normal.png) · [第二句](../web/evidence/v10-life/social-ordered/turn-2-normal.png) · [超时降级](../web/evidence/v10-life/social-ordered/turn-1-timeout.png) · [实际录屏](../web/evidence/v10-life/social-ordered/normal.webm)。模型均为标记清楚的本地测试替身，不是外部供应商验收。

## V10.3 近距离交互

新增轻量interaction.ts，复用scene-data门口、居民真实身份/场景和现有town-dressing咖啡馆旁黑板。76单位范围+同场景+短距离合法碰撞通路，按距离和朝向评分；相同条件确定性选择，门口优先平局。提示与高亮对应实际唯一E目标。usePlayer只把单次E交给当前目标，重复按键repeat忽略；没有通用事件总线或多人系统。

点击居民打开档案；靠近E立即显示交谈状态与轻量输入，玩家朝向目标。工作、进食、休息、走路或公共交谈忙碌时提示稍后，不修改后台任务或NPC位置。Esc关闭并归还场景焦点，输入焦点隔离WASD/E；模型等待期间可点击场景移动/镜头观察。NPC离开/变忙会禁用继续发送，已经提交的消息仍由原API保存。玩家聊天不会给后台NPC加私人占用锁或强制转身，这一限制明确保留。

修正实际浏览器发现的居民重叠点击问题：HTML命中层按脚下Y排序，与Pixi遮挡一致。原地图、门户和素材均未变。常见玩家Fallback也直接生成短句，场景气泡不再只显示长回复的寒暄前缀；旧历史不改，异常长AI原文仍保留。

`v10-interaction-check.mjs`真实浏览器验证室外/室内近距离E、鼠标仅档案、输入隔离、Esc、门/NPC唯一目标、公告读真实日志、忙碌工作不被抢占、刷新与访客隔离。2500ms本机模型超时期间WASD/镜头及送食物真实事务都可用；介入事务在超时返回前完成。私人适配器只3次本机请求。`v10-social-check.mjs`再次验证玩家靠近正在公共交谈的居民只收到忙碌提示，无重复会话。

[靠近提示](../web/evidence/v10-life/interaction-concurrent/01-nearby.png) · [室内交谈](../web/evidence/v10-life/interaction-concurrent/05-indoor-chat.png) · [超时仍可操作](../web/evidence/v10-life/interaction-concurrent/03-timeout-responsive.png) · [工作忙碌](../web/evidence/v10-life/interaction-concurrent/06-busy-work.png) · [交互录像](../web/evidence/v10-life/interaction-concurrent/nearby-interaction.webm) · [玩家靠近公共交谈](../web/evidence/v10-life/social-player/player-approaches-timeout.png)。

## 最终回归与复现

全部在web目录执行，.env.test.local仅本机55488/ai_town_mvp_test，脚本随机world ID，证据目录隔离。主库55487从不重置。

| 检查 | 实际命令与结果 |
|---|---|
| 类型/lint/测试/构建 | `npm run typecheck`、`npm run lint`、`npm test -- --reporter=dot`、`npm run build`通过；130测试/21文件 |
| 多居民长期运行 | 单元1440次结算，检查真实工作产出唯一、关系/记忆引用、合法路径、任务恢复、事件有界；不是24小时浏览器压力测试 |
| 并发/干预 | `WORLD_ROSTER=legacy`运行`node --env-file=.env.test.local --import tsx scripts/v10-db-check.ts`；6组通过，控制饥饿70→35使下一决策改变，8个wake只结算一次，干预/手动/自动竞态不覆盖 |
| 完整移动/无密钥 | `node --env-file=.env.test.local --import tsx scripts/v10-motion-check.mjs`；EVIDENCE_DIR=evidence/v10-life/final-tour；同一录制内长途、公共交谈、暂停/恢复/后端重启、6倍CPU节流、无密钥E对话、Esc继续探索 |
| 自主对白与插入交流 | `scripts/v10-social-check.mjs`，EVIDENCE_DIR=evidence/v10-life/social-player；正常/503/800ms超时各2次本机模型调用，身份/轮次正确，忙碌提示正确 |
| 近距离及模型等待 | `scripts/v10-interaction-check.mjs`，EVIDENCE_DIR=evidence/v10-life/interaction-concurrent；真实键鼠/API、双访客隔离、门口/室内/黑板、模型超时与世界干预并行 |
| 12栋建筑 | `scripts/v9-final-tour.mjs`，EVIDENCE_DIR=evidence/v10-life/twelve-doors；全部真实步行进入/室内移动/退出，每栋重复3次；26图、对象计数稳定、页面异常0 |
| 生产会话安全 | `scripts/v10-private-check.mjs`；6组浏览器/API检查：签名Secure/HttpOnly/Strict Cookie、伪造归属/篡改/跨站拒绝、生产初始化禁用、3次预算重启不清零、私聊不进入世界事件 |
| PostgreSQL真实重启 | `scripts/v10-recovery-check.ts --restart-test-postgres`；先验证容器仅绑定55488且test卷匹配，重启测试库；途中世界逐字相等、私人历史相等、同一action ID继续增加1000ms，主库未重启 |
| 旧数据 | 主存档revision661只读兼容，300次副本模拟通过；没有位置迁移、居民覆盖或DDL |

上表mjs脚本均使用`node --env-file=.env.test.local --import tsx`，ts同样适用。Windows临时环境变量写法：`$env:EVIDENCE_DIR='evidence/你的独立目录'`。恢复脚本只允许已确认的本项目测试容器，禁止改指向正式库。

连续录像：[最终演示](../web/evidence/v10-life/final-tour/long-walk.webm)，包含重启时页面重载，仍是同一浏览器录制、同一隔离世界，没有拼接不同世界。同一录制结束的真实存档`final-tour/settled-world.json`记录cafe=1/store=1，证明两处工作完成结算。NPC工作/门口详细证据见单独交互录像及12门录像。截图与录像在ignored evidence目录，未替换历史证据。

## 已知限制与安全边界

- 固定1x：没有倍速按钮，因此没有高倍速产品验收；慢帧用6倍CPU降速+离散帧采样测试，不声称测量固定FPS。网页不在时不运行，无离线补算。网络慢或后台页节流会降低有效推进速度，不追赶整段离线时间。
- 浏览器显示的是最多一个已提交短片段的平滑回放，暂停后校正到保存点；刷新不重播旧整条路线，不预测未提交的终点。没有角色相互避让，邻居重叠可见，点击按遮挡排序处理。
- 公共对话仍是2句最小会话，范围/冷却/需求决定触发，不保证每次碰面都聊。模型增强可能在当前句显示期间替换其本地回复，但已经播过的轮次不会被迟到结果改写。私人聊天不会暂停共享NPC。
- 近距离只由本地玩家状态和真实NPC表现坐标判断；没有服务端多人位置权威。历史短语可能来自过去，UI继续标注历史时间/版本。
- 所有本轮AI验收均为Mock/Fallback；未重新调用真实Qwen-plus。没有外部模型、地图扩建、新居民/职业、部署或推送。
- 新代码可读旧schema2；旧二进制不认识新途中位置，不应直接让旧程序写新存档。安全回退应保留新快照并恢复与旧代码匹配的已备份旧快照（本轮未执行回退/还原主库）。

## 修改文件

核心：`action-time.ts`、`world.ts`、`work.ts`、`scene-motion.ts`、`social.ts`、`social-service.ts`、`experiences.ts`、`dialogue-text.ts`、`interaction.ts`、`chat-context.ts`。

前端：`Town.tsx`、`TownScene.tsx`、`use-player.ts`、`ChatDialog.tsx`、`globals.css`。素材、地图坐标、门户、数据库表与访客会话实现不变。

验证：新增`continuous-actions.test.ts`、`dialogue-rhythm.test.ts`、`interaction.test.ts`、`tests/helpers/advance.ts`；更新原聊天、住宅、咖啡馆、六居民、路径、工作、自动控制、世界测试为真实完成条件。新增`v10-motion-check.mjs`、`v10-social-check.mjs`、`v10-interaction-check.mjs`、`v10-db-check.ts`、`v10-private-check.mjs`、`v10-recovery-check.ts`。

文档：AGENTS、spec、README、本验收、v10-progress。检查点和本地运行版本见进度文件。三个阶段验收结束后停止。


## 本地运行交接

3100已启动本轮生产构建。先停止已核对路径的本项目旧Next进程，只读备份主库payload到`main-before-restart.json`，再启动；读取API与旧快照restoreWorld结果逐字相等：revision661、minute6960、6居民、仍暂停。没有重置数据库。`main-restart-result.json`记录结果。自动居民AI在该进程关闭；私人模型配置保留，真实请求仅在玩家主动发送时发生，本轮未调用。

最新无密钥短回复截图：[按E交谈](../web/evidence/v10-life/final-tour/05-no-key-nearby-chat.png)。回到页面刷新后可体验本轮交互。
