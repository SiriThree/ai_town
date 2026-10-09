# V7.1 NPC室内外自主移动验收

2026-10-09，Windows本机，沿用Next.js/TypeScript/PixiJS/PostgreSQL。未扩图、新增居民、职业、记忆或部署。修改前的Git状态为应用、文档尚未提交；本轮哈希基线在`web/evidence/v7-1/baseline.json`，不能把所有未跟踪文件算作本轮新增。

## 数据及真正的行为链路

NPC新增必需字段`sceneId: 'town' | 'cafe_interior'`，世界JSON为`schemaVersion:2`。

| 字段 | 含义 |
| --- | --- |
| `location` | 业务地点：home/cafe/square。咖啡馆门前与室内都可以属于cafe |
| `sceneId` | 此刻实际所在的唯一场景，不由前端或地点名推断 |
| `position` | 该场景坐标系中的已提交脚点 |
| `lastPath` | 当前场景内、最近一次已执行移动的道路路径；进出门户时清空，不能混入另一场景坐标 |

调用链保持：页面手动推进/自动唤醒 → 原HTTP API → `store.updateWorld`原世界行锁事务 → `advanceOnClock`/`advanceWorld`需求变化 → `decide` → `canExecute`/`execute` → 保存整个世界与真实事件 → 前端读取 → 场景成员与路径表现同步。自动时钟、版本校验、食物干预事务不另起实现。

规则的饥饿/精力/性格优先级不变，只衔接空间条件：

1. 需求目标为咖啡馆，在室外先按原道路折线路径抵达阿晴`(754,324)`、阿宁`(770,324)`，业务地点变cafe，仍属town。此步不进食、不进入室内。
2. 下一逻辑步重新决策：仍要进食且位于合法入口半径内，才执行enter，保存cafe_interior。两名居民分别出现在`(460,486)`、`(500,486)`，共享V6.1门口/地板/家具碰撞定义，出生点不在家具中。
3. 室内复用原eat（饥饿−50、精力+6），也承受原逐步需求变化。没有进入后固定计数两步的脚本。
4. 需求转向广场或住宅时，当前站位符合出口范围才执行exit，回到对应室外门前、清空路径、生成离开事件；下一步重新决策，再沿室外道路行动。

种子阿晴的真实轨迹为：饥饿59 → 第一步67到门前 → 第二步75进入 → 第三步33进食后 → 第四步41离开 → 第五步49到广场。控制其他条件，门口送食物会取消进入；同一个室内NPC饥饿高选eat，饱足选exit。低精力仍可优先休息。300步单元测试两名居民均进入过室内，身份始终只有两份。

本轮室内仅使用入口侧的安全站位进行已有进食/停留，没有室内随机漫游、坐椅或工作动画。玩家不阻塞NPC门户，不存在多人角色物理碰撞；玩家与NPC位置仍是两条独立状态链。

## PostgreSQL兼容与恢复

不增加表、不执行破坏性DDL、不重种。`store.decode`调用`restoreWorld`：v1读取时复制数据、仅补`sceneId=town`并将内存版本置2，原时间、业务地点、位置、需求、行动、路径和事件均保留；原始SQL行在读后仍为v1。后续一次正常世界写事务保存v2。v2校验场景、地点、坐标和路径，未知版本拒绝而非初始化。

旧咖啡馆坐标`(746,306)/(778,306)`保留为室外；这些点在新入口半径外，下次要进食时先补走到新门口，不能从旧地点标签直接出现在室内。私聊表、访客Cookie、模型费用表不变。

隔离真实PostgreSQL测试已覆盖：旧v1咖啡馆记录读后SQL原样、首次写v2、旧私人聊天原文保留；8个并发到期唤醒各只产生一次进入/离开，场景/坐标/事件同时提交。浏览器测试在NPC室内暂停时结束并重启Next进程，完整世界JSON与私聊恢复一致。回退旧程序前需要配套旧版备份，旧程序不理解已写入的v2快照；不应将其误认为可直接无迁移回滚。

原3100开发服务已恢复：读取前的真实存档为版本57/schema1；重启后API结果与`restoreWorld(原快照)`完全一致，直接查询PostgreSQL原始JSON仍与重启前完全一致，没有自动修改或丢失数据。证据为`web/evidence/v7-1/local-restart.json`。已知模型密钥与数据库连接串扫描在源码及客户端构建中均无泄露命中，记录在同目录`secret-scan.json`。

## Pixi与聊天同步

- `scene-data.ts`仅提取已有静态场景、门户、家具、碰撞几何供双方共用。玩家`use-player.ts`、移动速度、键盘和碰撞算法未改。
- `TownScene.sync`按后台归属增删当前场景的NPC对象与Motion；离开便销毁对象/移除命中，进入按已保存位置创建。复用同一NPC id、纹理与聊天记录，无门口替身。
- `Motion`带场景，`acceptPosition`遇到切换直接结束旧表现路径。快速手动推进可能取消尚未播完的室外动画，以后台新场景为准，不在两个坐标系之间穿图。相同场景仍复用原路径拼接、朝向与步态。
- NPC脚点→Pixi精灵/阴影/深度、HTML命中→带场景的镜头映射→头顶气泡。室内外各自镜头保持。不存在于当前场景的居民不会有可点击精灵、输入区或漂浮气泡，名册会标明室外/咖啡馆内。
- 聊天和草稿保留挂载；居民离开时隐藏相关界面。已打开历史隐藏后不会继续阻止玩家移动，回来可继续查看。旧回复明确标“历史发言·世界已更新”，不篡改原文。
- `chat-context.ts`仅补当前`sceneId`、坐标和“室内/室外门口”事实，区分业务地点与实际场景；模型适配、Fallback的分类规则、私聊隔离和额度不变。本轮未发外部付费模型请求。

## 命令与实际结果

命令均从`web/`执行。浏览器基于生产构建；仅`.env.test.local`的独立测试库、唯一测试世界ID，不删除旧数据/证据。

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` | 通过；9测试文件、75项单元，新增8项多场景测试 |
| `npm run test:v71:db` | 2组真实PG兼容/并发通过，证据`evidence/v7-1/database/result.json` |
| `npm run test:v71` | 4组真实双浏览器/重启流程通过，7张截图和实际WebM；`evidence/v7-1/browser/result.json` |
| `$env:EVIDENCE_DIR='evidence/v7-1/player-regression'; npm run test:v61` | 6组玩家移动/碰撞/反复切换/刷新/聊天保留回归通过，旧证据未覆盖 |
| `$env:EVIDENCE_DIR='evidence/v7-1/motion'; npm run test:v42` | 6组原路径/帧/朝向/镜头/气泡/快速提交/移动中刷新回归通过 |
| `$env:EVIDENCE_DIR='evidence/v7-1/chat'; npm run test:chat` | 9组对话与模型成功替身/失败/超时降级通过，超时888ms，无外部模型请求 |
| `$env:EVIDENCE_DIR='evidence/v7-1/private'; npm run test:v52` | 6组访客隔离/签名/预算/重启/双访客时钟通过，3次本机替身调用 |
| `$env:EVIDENCE_DIR='evidence/v7-1/db-controls'; npm run test:v3:db` | 6组干预控制变量/并发/时钟回归通过 |
| `$env:EVIDENCE_DIR='evidence/v7-1/world-api'; npm run test:e2e` | 8组HTTP/选中/刷新/冲突/错误/后台重启回归通过 |

旧world测试的进食预期增加独立进入步，未知版本改为99，旧动画脚本从`746,306`更新为实际入口，进出步骤单独验证、等待真实HTTP提交再读取下一状态。一次并行浏览器运行在原4秒动画等待内未观察到idle，同版本独立重跑通过，未放宽超时或修改动画时长；不承诺高负载下的固定帧率。最终通过记录在各result.json，早先断言失败不计为通过。

## 真实截图与录屏

- [NPC沿路到门口](../web/evidence/v7-1/browser/01-npc-at-outdoor-door.png)
- [进入后室外已移除该居民](../web/evidence/v7-1/browser/02-outdoor-after-entry.png)
- [另一个访客在室内看到同一NPC](../web/evidence/v7-1/browser/03-indoor-observer.png)
- [玩家跟随进入，与NPC同处室内](../web/evidence/v7-1/browser/04-player-follows-npc.png)
- [室内真实API Fallback气泡](../web/evidence/v7-1/browser/05-indoor-speech.png)
- [离开后回到室外门前](../web/evidence/v7-1/browser/06-npc-exits-to-outdoor.png)
- [1366×768室外](../web/evidence/v7-1/browser/07-outdoor-1366.png)
- [实际自主进入、玩家跟随、进食离开录屏](../web/evidence/v7-1/browser/npc-cafe-roundtrip.webm)

截图不是设计图；测试由真实键盘移动玩家、UI推进和HTTP聊天驱动。当前资源全部沿用V4.1/V4.2/V6.1自有资源，没有新增或复制参考素材。

## 改动与停止点

新增：`web/src/lib/scene-data.ts`、`web/tests/npc-scenes.test.ts`、`web/scripts/v71-db-check.ts`、`v71-scene-check.mjs`、本记录。

修改：`web/src/lib/{world,store,player-scene,scene-motion,scene-view,chat-context}.ts`、`web/src/components/{Town,TownScene}.tsx`、`web/src/app/globals.css`、`web/tests/{world,scene-motion}.test.ts`、`web/scripts/{v42-motion-check,v61-scene-check}.mjs`、`web/package.json`、`web/README.md`、`AGENTS.md`、`docs/spec.md`。没有新依赖/素材或SQL表结构变更；HTTP端点及请求参数保持，返回的世界快照升级为v2并包含NPC场景归属。

扩展其他房屋时需要增加该场景的合法门户/站位/路线，并扩充服务端目的地解析与存档校验、碰撞/并发/恢复测试；如果要室内走到桌椅，还需要真实室内路径与合法行动前置条件。本轮没有实现室内寻路、坐椅、职业或更多居民，到咖啡馆闭环完成为止。
