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

## V10.3

待实施。
