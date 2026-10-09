# V8.1–V9.4 连续本地验收

日期：2026-10-10（Asia/Shanghai）。本轮按附件连续授权完成本地实现与验证，未推送、未部署、未购买云资源。项目仍为 Next.js 16.4.0 / TypeScript 6 / PixiJS 8.22 / PostgreSQL 17.11，Node 24.14.1、Windows。不是生产并发或公网验收。

## 最终规模与阶段

室外2800×1600，正式开放建筑 **12/12**，独立室内 **12**（加town共13场景），正式居民 **6**，工作类型 **2**。六居民为阿晴、阿宁、小雨、老林、沐溪、小满；25人仅存在隔离压力世界。

| 阶段 | 实际结果 | 独立证据（web/evidence/v8-v9/下） | 本地检查点 |
|---|---|---|---|
| V8.1 | 榴木街、杂货铺/青篱居可进出，旧坐标保留 | 上级v8-1/browser-release；docs/v8-1-validation.md，91单测 | 6922a90 |
| V8.2 | 12外观、公共街、河流/双桥、连续道路 | v82-verified：真实长路、8截图、视频；93单测 | 11ca542 |
| V8.3 | 12独立室内、配对门户、出生点/家具碰撞 | v83：5类房间反复进出、13截图；96单测 | ede542e |
| V8.4 | 全景/铺装、资源生命周期修复与性能测量 | v84-fixed；聊天/住宅/咖啡馆/私聊/并发回归，96单测 | a5d1844 |
| V9.1 | 显式追加4居民、原两人和历史不变 | v91：真实迁移、50HTTP推进、恢复、5截图；99单测 | d65d23d |
| V9.2 | 有来源的事实、个人记忆、关系 | v92-verified：知情隔离、档案/对话、重启；103单测 | 11060fd |
| V9.3 | 有限公共交流、预算/并发/失败降级 | v93-layout-final：正常替身/报错/超时、6截图；108单测 | 3736e56 |
| V9.4 | 两种真实工作、任务恢复、合作影响记忆/对话 | v94-final；最终全12建筑和回归；112单测 | 本报告所在最终提交 |

每阶段均运行类型检查、lint、单元与生产构建；阶段历史详见progress-v8-v9.md，不用最终结果冒充早期未执行项目。

建筑清单：暖灯小屋、麦香咖啡馆、石榴杂货铺、青篱小居、晨光会馆、河风诊所、青叶书屋、杉木工坊、蔷薇居、苔色小院、芦苇屋、石溪居。最终 `final-twelve-tour` 真实键盘逐个步行到门、E进出、室内移动，每栋额外往返两次检查对象数，26截图/完整录屏，页面异常0，前后世界JSON不变。没有未开放假门，也没有交易假按钮。

## 真实调用链及可核查行为

- **移动**：地图/碰撞内容 → `navigation.findScenePath` → `world.decide/canExecute/execute` → `lastPath/sceneId/position` → `store.updateWorld`行锁保存 → HTTP → Pixi按sceneId增删居民，按保存路径播放。门户单独逻辑步，无跨坐标系插值。原阿晴/阿宁保留旧路线，新增居民使用同碰撞的网格路线。
- **工作**：`prepareWork`建立任务 → 状态选择职业地点 → 室外门口/入口/室内工作点 → 两次真实work → `settleWork`唯一task ID确认 → 产出/事实/经历一起提交。疲劳先回家，同ID进度不丢；已完成不会重复发放。任务完成180游戏分钟后才允许下一份。动作包括移动、进入/退出、室内走路、吃饭、休息、阅读、社交、等候、制作/理货、走向协助点与核对。
- **合作**：小雨在咖啡馆工作点，小满实际在旁协助核对 → 后台工作事实记录双方 → 熟悉度/信任增加并引用事件 → 双方亲历 → 后续玩家问“记得什么合作经历”时本地回复引用该结果。截图03展示真实API回复。远处沐溪不获得该记忆。模型不能发放产出。
- **社会交流**：满足同场景/距离/空闲/性格或关系条件才产生两句有限段落；每人120分钟冷却、全局30分钟间隔、每游戏日8段上限。工作/协助中不同时发起闲聊。公开气泡有来源，完整日志保留；私聊气泡优先。
- **模型**：NPC_AI_ENABLED默认false；启用时在事务外生成台词，两个全局进程槽、共用UTC每日模型尝试配额，失败也占预算。每句最多2秒，自主交流至多两次尝试；无配置、故障、超时或满额用本地事实回复。领取后进程中断保留本地台词，不无限重试。
- **玩家**：WASD/点击地面真实移动 → 足部碰撞/门口E → 场景切换；只有本地玩家位置存在sessionStorage。世界、NPC、任务、关系、记忆、私聊均在PostgreSQL。多个访客共享世界、私人消息按签名匿名会话隔离。

## 最终实际命令与结果

命令均在 `D:\腾讯面试\web` 执行。脚本使用 `.env.test.local`、随机world ID与本机端口，外部模型关闭或明确本机替身；没有清理旧世界/证据。

| 命令/入口 | 本轮结果 |
|---|---|
| `npm run typecheck` / `npm run lint` | 通过；最终lint无警告 |
| `npm test -- --reporter=dot` | 17文件、112测试通过；包含1440步合法性与唯一产出测试 |
| `npm run build` | 生产构建通过，原API路由保留 |
| `node --env-file=.env.test.local --import tsx scripts/v94-work-check.mjs` | v94-final：6截图、work-cooperation.webm；咖啡/商店产出、合作回忆、两标签自动/暂停、刷新/后台重启一致 |
| `node --env-file=.env.test.local --import tsx scripts/v9-final-tour.mjs` | final-twelve-tour：12/12真实进出、两个桌面尺寸、对象数稳定、世界未改 |
| `node --env-file=.env.test.local --import tsx scripts/v3-db-check.ts` | final-concurrency：6组，干预改变后续决策、自动/手动/干预并发无丢更新 |
| `node --env-file=.env.test.local scripts/chat-check.mjs` | final-chat：9组，NPC隔离、真实状态上下文、错误/超时降级，超时871ms；仅替身 |
| `node --env-file=.env.test.local --import tsx scripts/v52-private-check.mjs` | final-private：6组，访客隔离、签名篡改、额度、双访客时钟、重启 |
| `node --env-file=.env.test.local --import tsx scripts/v72-db-check.ts` | final-legacy-db：2组，schema1/2旧坐标兼容和旧私聊保留 |
| `node --env-file=.env.test.local --import tsx scripts/v9-postgres-restore.ts --restart-test-postgres` | 真正重启55488测试PostgreSQL，启动时间改变，3世界全JSON和私聊一致；暂停1/2任务恢复后同ID完成，产出一次 |
| `node --env-file=.env.local --import tsx scripts/migrate-residents.ts --apply` | 主世界378→379，仅追加4居民/地点；原2人、时间4160、事件、暂停状态、2条旧共享会话不变 |

原两居民回归设置`WORLD_ROSTER=legacy`，避免把原种子断言当成新六居民世界。每个命令的EVIDENCE_DIR实际值即上述目录；旧默认证据目录没有用本轮结果覆盖。

## 长时与性能实测

- 六居民推进1440步（10游戏日），15,477.93ms；餐点59、货架53，合法位置/路径、事实来源、任务与唯一产出全部检查。最终快照JSON约135,211字符（不是压缩传输字节承诺）。
- 25测试居民推进300步，48次模型替身回复；单步平均68.64ms，P95 226.28ms，快照268,041字符。模型仅替身内存传输，无外部费用；正式世界仍6人。这是单机样本，不是用户并发容量或真实供应商延迟保证。
- V8.4 Chromium headless：初次就绪711ms；90帧间隔均值16.67ms、P95 16.7ms；24次切换均值18.67ms、最大33.84ms。48往返分两批强制GC后堆10,368,832→10,570,304字节，Nodes267/监听器383均稳定；这是有限样本，未声称长时间零泄漏。
- 纹理只加载一次并共享帧；场景对象按切换销毁，无新的分块加载或后台模拟Worker。默认镜头清晰看街角，全景用于导航；小尺寸全景允许非整数缩小采样。
- 真实模型：早期玩家聊天存在历史授权成功记录；**本轮新自主对话没有外部供应商端到端验证**，全部新调用证据明确为Mock/Fallback。不得据此声称真实模型自主社交质量已验收。服务费用还应由供应商账户限额控制。

## 存档、恢复与安全

- V7.2基线3f39896478ae38bf0901304fa579c1074456b34b保留；初始完整pg_dump与原世界在baseline。备份已恢复到独立测试库v8_backup_check_20261010002901并全JSON对比。备份含私人历史，不公开。
- 兼容继续schema2：home/job/preferences/work/experiences等为可选增量字段；旧普通读取不重置。生产SQL表结构本轮未改变。
- 真正PostgreSQL重启证据在v94-final/postgres-restart-with-pending.json：2026-10-09T17:27:05.951Z→17:27:50.776Z，暂停任务work:xiaoyu:1从1/2恢复到2/2，完成minute620；咖啡/货架各1。
- 主本地应用已经用当前生产构建重启，http://127.0.0.1:3100，原world minute4160保持暂停、revision379、6居民。没有为截图推进或重置主世界。main-migration-result.json和main-final/result.json可核对。
- 秘密扫描174个追踪/客户端文件：真实AI key、Cookie密钥未入追踪文件/客户端，数据库URL未入客户端。`.env.example`只有已说明的本项目本地开发连接示例；生产秘密仍不提交。新NPC外部模型开关在主本地进程显式false，既有玩家聊天配置保留。
- 回退：使用阶段Git检查点；旧两居民程序不能直接写六居民快照，应先备份新库，再把匹配旧备份恢复到独立库并验证后切换连接。未实际执行主库回退，不用删库/覆盖当前世界作为回滚。

## 问题与修复记录

1. 大地图贴障碍路线在真实键盘停止偏差下可能卡角：搜索节点增加4单位净空，端点仍按实际合法位置连接；失败v82/v82-final/v82-clearance与成功v82-verified保留。
2. 反复室内切换内存增长：实际测得两批增长后检查Pixi源码，自有GraphicsContext需要显式context:true释放；修复后两批GC样本稳定。共享纹理不销毁。
3. 新公共双气泡可能重叠：按角色屏幕左右位置分列，不按数组顺序；v93-layout-final正常/报错/超时截图可核查。
4. V9.4脚本先使用旧“暂停”按钮名，后又在暂停响应前读取快照导致比较失败；分别保留v94和v94-verified失败截图，修正为真实按钮名并等待HTTP响应，v94-final通过。不是掩盖业务状态差异。
5. 早期V8.1误复用了旧验证脚本的证据默认路径，涉及旧v7-2/database/result.json；已在V8.1报告披露恢复方式，非数据库数据丢失。本轮所有新检查使用独立证据目录。
6. 主页面只读截图脚本首次在导入Playwright后才设置浏览器路径，找不到可执行文件；修正导入顺序复用已安装浏览器，未重复下载安装。

## 实际画面与录屏

以下均来自运行中的页面，不是概念图；更多图片保存在各阶段目录。

- [当前主世界全景](../web/evidence/v8-v9/main-final/town-overview.png)、[默认六居民页面](../web/evidence/v8-v9/main-final/default-six.png)
- [12建筑逐间游览录像](../web/evidence/v8-v9/final-twelve-tour/interior-walk.webm)、[1366×768全景](../web/evidence/v8-v9/final-twelve-tour/02-full-town-1366.png)
- [书屋室内](../web/evidence/v8-v9/final-twelve-tour/inside-library.png)、[石溪居室内](../web/evidence/v8-v9/final-twelve-tour/inside-stone.png)
- [自主公共交流·模型替身](../web/evidence/v8-v9/v93-layout-final/public-normal.png)、[失败降级](../web/evidence/v8-v9/v93-layout-final/public-error.png)、[超时降级](../web/evidence/v8-v9/v93-layout-final/public-timeout.png)
- [咖啡工作完成档案](../web/evidence/v8-v9/v94-final/02-cafe-completed.png)、[合作记忆对话](../web/evidence/v8-v9/v94-final/03-work-memory-dialogue.png)、[理货结果](../web/evidence/v8-v9/v94-final/04-store-completed.png)、[暂停](../web/evidence/v8-v9/v94-final/06-paused-saved-work.png)
- [真实工作、交流、进出录像](../web/evidence/v8-v9/v94-final/work-cooperation.webm)

## 素材、主要差距和停止点

原创建筑/人物由内置imagegen制作，地表/桥梁/石阶沿原程序绘制；尺寸、帧布局、生成服务使用限制分别登记public/art/v8-2/ASSETS.md与v9-1/ASSETS.md，历史素材沿各版本说明。没有复制my_ai_town未知许可素材或Godot源码，不宣称生成资源为CC0或版权保证。

和参考相比，目前街区物件密度更低、地面更规则、家具复用较多，部分生成帧有细微造型差异；没有全套手工动画/天气/室内编辑。NPC工作只是两种可验真的进度与产出，不是完整经济系统；25居民实测不等于正式支持无限扩展。玩家本地位置不跨设备同步，无真正多人角色；匿名Cookie丢失不能找回私人会话。无人打开页面不常驻推进。

未来增加区域主要添加地图地表/道路/实体、独立室内布局和门户，再做通路/碰撞/真实步行与资源生命周期验收；增加工作类型需合法活动点、真实结果及暂停/恢复/去重测试。**本次到V9.4停止，不开始下一片区域、部署或完整经济系统。**


## 本次连续开发文件清单

相对V7.2安全基线（不含忽略的本地证据/备份/密钥）：

```text
AGENTS.md
docs/delivery-v5-1.md
docs/progress-v8-v9.md
docs/spec.md
docs/town-map-plan.md
docs/v8-1-validation.md
docs/v8-v9-validation.md
web/.env.example
web/README.md
web/package.json
web/public/art/v8-1/ASSETS.md
web/public/art/v8-1/east-buildings.png
web/public/art/v8-2/ASSETS.md
web/public/art/v8-2/buildings.png
web/public/art/v9-1/ASSETS.md
web/public/art/v9-1/residents.png
web/scripts/migrate-residents.ts
web/scripts/v72-db-check.ts
web/scripts/v81-map-check.mjs
web/scripts/v82-map-check.mjs
web/scripts/v83-interiors-check.mjs
web/scripts/v84-stability-check.mjs
web/scripts/v9-final-tour.mjs
web/scripts/v9-postgres-restore.ts
web/scripts/v91-residents-check.mjs
web/scripts/v92-experiences-check.mjs
web/scripts/v93-social-check.mjs
web/scripts/v94-work-check.mjs
web/src/app/api/world/tick/route.ts
web/src/app/api/world/wake/route.ts
web/src/app/globals.css
web/src/components/Town.tsx
web/src/components/TownScene.tsx
web/src/components/district-frames.json
web/src/components/new-resident-frames.json
web/src/components/player-art.ts
web/src/components/scene-art.ts
web/src/components/scene-ground.ts
web/src/lib/chat-context.ts
web/src/lib/chat-model.ts
web/src/lib/chat-types.ts
web/src/lib/experiences.ts
web/src/lib/navigation.ts
web/src/lib/residents.ts
web/src/lib/scene-data.ts
web/src/lib/scene-motion.ts
web/src/lib/scene-view.ts
web/src/lib/social-service.ts
web/src/lib/social.ts
web/src/lib/store.ts
web/src/lib/town-map.ts
web/src/lib/work.ts
web/src/lib/world.ts
web/tests/experiences.test.ts
web/tests/interior-catalog.test.ts
web/tests/large-map.test.ts
web/tests/residents.test.ts
web/tests/social.test.ts
web/tests/town-map.test.ts
web/tests/work.test.ts
```
