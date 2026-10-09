# V7.2 第二栋室内建筑验收

2026-10-09，Windows 本机，Next 16.4.0 / TypeScript 6 / Pixi 8.22 / PostgreSQL 17。基线提交 `2a0d7a98804efa3624b5d0fa098a5a33204775e0` 保存了实施前V7.1源码、资产及文档，没有推送；已有私密配置、数据库卷和旧验证证据保持原位、未加入提交。参考目录只读，没有全仓迁移或复制未知许可资源。

本轮仅新增 `home_interior`。现有暖灯小屋是两名居民共用住宅，阿晴和阿宁分别分配左、右床边活动点；没有新增建筑、地点ID、NPC或产权系统。咖啡馆内仍只复用原有进食站位。

## 真实调用链与边界

- 玩家：`use-player.ts` E键 → `player-scene.ts nearbyPortal/enterPortal` → 共享 `PORTALS` 校验距离/目标出生点 → 当前标签页玩家状态 → Pixi切换场景树。未知/错误门ID不切换；刷新按保存的sceneId恢复，非法站位回到该场景配置的安全入口。
- NPC：原tick/wake API → 原 `store.ts updateWorld` 行锁事务 → `advanceWorld → decide → canExecute → execute` → 保存sceneId、position、lastPath、action及事件 → HTTP读取 → `TownScene`按sceneId增删同身份表现对象。
- 回家：需求不足 → `roadPath` 沿室外道路到住宅门口 → 下一逻辑步 `enter` → 下一步 `walk-inside(activity)` 写入真实室内路线 → 床边才允许 `rest` → 需求恢复后 `walk-inside(exit)` → `exit` 返回对应室外门口 → 原室外移动。
- `BUILDINGS` 和成对门户让进入/离开不再复制咖啡馆分支；门位置、半径、反向关系、目标安全点共用。`HOME_REST/homePath` 是本轮最小活动点/可通行走廊，不是进出行为脚本。NPC在逻辑步骤结束时提交终点，前端最多3秒表现已提交路径；同场景快速推进拼接剩余合法段，跨场景取消旧动画。暂停不会撤销已经提交的行走。
- 精力≤25时按原需求优先级选择回家。到床边精力<65且饥饿<85时继续恢复；急饿可以打断休息。每次休息+40精力，但每步原自然消耗−6保持不变。状态阈值控制停留，未加入固定“进两步出两步”脚本。没有躺床动画，真实待机朝向面向床。
- 住宅家具单独精灵、脚部占地碰撞、y深度遮挡；NPC床边坐标阿晴(370,300)、阿宁(588,300)，均不在床铺障碍中心。镜头、阴影、点击区域、头顶气泡跟随同一角色表现位置。
- 聊天仍是原访客隔离API，仅补home_interior事实说明；没有更改模型适配/降级规则/费用限制/数据库事务。对话历史原文保留，世界更新后旧气泡标注历史发言。

## 已执行检查

命令工作目录均为 `web/`，不运行参考项目。所有自动化集成测试使用本项目55488测试库、新随机世界ID，不删除以前的测试世界；V7.2浏览器使用3114，原日常项目仍在3100。

| 命令 | 本轮结果与证据 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm test` | 10文件85测试通过；包含原75项与新增10项住宅测试 |
| `npm run build` | Next生产构建通过，原API清单保留 |
| `npm run test:v72` | 4组真实浏览器验收、14截图、录屏；两独立访客，1440×900及1366×768；`web/evidence/v7-2/browser-final/result.json` |
| `npm run test:v72:db -- --restart-test-postgres` | 3组真实PostgreSQL检查通过；启动时间改变、床边状态和旧私聊重启恢复相同；`database/result.json` |
| `EVIDENCE_DIR=evidence/v7-2/cafe-regression npm run test:v71` | 咖啡馆原4组浏览器回归通过，7截图及录屏 |
| `EVIDENCE_DIR=evidence/v7-2/chat-regression npm run test:chat` | 9组聊天/API/浏览器检查通过；模型替身错误与超时降级，超时实测872ms；真实模型未测 |
| `EVIDENCE_DIR=evidence/v7-2/private-regression npm run test:v52` | 6组访客私聊隔离及请求保护检查通过，外部调用0 |
| `EVIDENCE_DIR=evidence/v7-2/concurrency npm run test:v3:db` | 6组真实库并发/自动推进/干预检查通过 |
| `EVIDENCE_DIR=evidence/v7-2 node scripts/delivery-scan.mjs` | 118源码文件、33客户端构建文件，已知真实AI密钥/客户端DB连接串命中均0；`.env.example`无真密钥 |

上表环境变量是紧凑记法；PowerShell实际设置方式为 `$env:EVIDENCE_DIR='…'` 后运行对应npm命令。没有运行付费模型验收。开发库真实AI配置保留，没有替换成测试配置。

## 验收对应

| 要求 | 实测与控制变量证据 |
|---|---|
| 玩家进出两栋建筑，门不混淆 | 浏览器先走到咖啡馆进出，再步行到住宅进出3次；场景树对象数量稳定。单测逐一验证4个门户及错误门ID |
| 室内自由移动、家具碰撞 | 实际按键走到床边并持续向床移动，脚部x停在353附近，不能穿床；两个NPC双向室内路线每2单位检查可通行 |
| 自主回家而非固定脚本 | 相同阿宁hunger=0：energy=8选择home，energy=80选择read。标准种子连续300步，两名居民均自主进入住宅并休息 |
| 室外到门、进入、床边、恢复、离开 | 每步读真实HTTP/DB快照并检查行动/路径；浏览器记录精力0→40→74，再走出口/离开，无前端造路 |
| 不同场景只显示自己的NPC | 双浏览器分别在门外与住宅；阿晴在咖啡馆时住宅不渲染她，阿宁进入后室外移除，离开后室内移除 |
| 真实身份档案/聊天/私聊隔离 | 室内阿宁可查看档案、说出“暖灯小屋·室内/在床边休息”；另一独立访客历史为空，原私聊回归通过 |
| 自动、手动、暂停、干预保留 | 自动5秒一步，两个访客不翻倍；暂停超过一周期不推进；送食物前后饥饿32→0；原控制变量干预决策/并发回归通过 |
| 镜头、动画、聊天草稿 | 室内路径动态行走截图，气泡跟随；放大后推进不重置镜头/草稿；打开历史时NPC离开不留下隐形输入锁；快速新推进路径最终收敛到后台位置 |
| 玩家切场景不重置世界 | 反复进出前后完整HTTP世界JSON相等；玩家sceneId与NPC完全独立 |
| 重启与原存档 | 实际后端重启恢复住宅床边及私聊；实际测试PostgreSQL进程重启后JSON相等；v1/v2旧门廊读不改库，首次写入正常演进、不搬进室内、不丢旧聊天 |

原3100世界在更新前实际版本257、自动运行中；重启新生产服务后，已打开浏览器继续唤醒到版本263。NPC和事件与从原快照按新规则正常推进6步的计算完全相等，运行标志保持，不重置或改成种子。详见 `web/evidence/v7-2/main-restart-result.json`。这是正常继续运行，不声称整个JSON在自动推进中不变。精确重启相等验证在暂停的隔离世界中完成。

## 实际页面证据

以下全部来自本轮运行的Next生产页面。第一次验证保留在 `browser/`，最终代码验证在 `browser-final/`。

- [室外暖灯小屋](../web/evidence/v7-2/browser-final/01-outdoor-home.png)
- [住宅完整室内与玩家](../web/evidence/v7-2/browser-final/02-home-interior.png)
- [玩家移动和床碰撞](../web/evidence/v7-2/browser-final/03-player-bed-collision.png)
- [NPC到达住宅门口](../web/evidence/v7-2/browser-final/04-npc-home-door.png)
- [NPC进入住宅](../web/evidence/v7-2/browser-final/05-npc-enters-home.png)
- [玩家与NPC同在住宅](../web/evidence/v7-2/browser-final/06-player-follows-home.png)
- [室内行走阶段](../web/evidence/v7-2/browser-final/07-indoor-walking.png)
- [床边休息](../web/evidence/v7-2/browser-final/08-npc-resting.png)
- [住宅真实API降级对话](../web/evidence/v7-2/browser-final/09-home-conversation.png)
- [NPC详情](../web/evidence/v7-2/browser-final/10-npc-profile.png)
- [移动中的气泡](../web/evidence/v7-2/browser-final/11-exit-walk-bubble.png)
- [休息后返回室外](../web/evidence/v7-2/browser-final/12-npc-outside-after-rest.png)
- [1366×768室外](../web/evidence/v7-2/browser-final/13-outdoor-1366.png)
- [实际进出及交流录屏](../web/evidence/v7-2/browser-final/npc-home-roundtrip.webm)

## 改动、素材与限制

改动：`AGENTS.md`、`docs/spec.md`、本记录、`web/README.md`、`web/package.json`；`web/src/lib/{scene-data,world,player-scene,scene-motion,chat-context}.ts`；`web/src/components/{Town,TownScene}.tsx`、`player-art.ts`、新增`home-frames.json`；`web/tests/world.test.ts`和新增`home-scenes.test.ts`；新增`scripts/v72-{scene,db}-check`，已有v71两个验证脚本仅加EVIDENCE_DIR选项，避免覆盖历史证据；新增`public/art/v7-2/{home-furniture.png,ASSETS.md}`。无需SQL表变更、依赖安装或玩家控制hook重写。

家具为本轮imagegen原创生成1254×1254透明图集，床/书桌/柜/壁炉四帧；代码绘制地板、墙窗及地毯，与咖啡馆共用房间绘制。见[来源、帧尺寸与使用限制](../web/public/art/v7-2/ASSETS.md)。没有复制my_ai_town素材，未宣称手工像素美术或达到参考项目整体丰富度。当前布局刻意保留中央通路，家具暂无交互/睡眠动画。

仍沿用单共享NPC世界、访客私聊隔离、玩家标签页本地状态。自动运行是网页唤醒演示，无无人值守Worker。室内路径为后端批准的静态走廊，不是任意障碍动态寻路；前端不生成随机路线。schemaVersion 2新增合法场景值，对旧存档向前兼容；回退旧代码前要配套旧备份，旧代码不能认识home_interior。新第三栋建筑需补场景资源/碰撞、成对门户及安全点、地点与动作的需求关系、活动点/真实路线、存档与浏览器回归；现有入口执行/事务/场景角色生命周期可复用，无需复制一套进出代码。

本轮停止于V7.2，没有部署、扩图、新NPC、职业、关系或记忆系统。


## 后续现场复核：旧标签页无法进入住宅

用户反馈后，直接检查其内置浏览器当前3100标签页：玩家脚部坐标(234.34,309.03)已在住宅门口，但DOM仅有咖啡馆门户(762,320)，标题仍为旧版“晨露村手记”。后台已返回V7.2住宅行动，前端却是更新前仍驻留内存的旧包。此前新浏览器回归通过，未覆盖用户一直未刷新的旧标签页。

对该标签页执行一次普通刷新后，玩家位置保留并立即出现“E · 进入暖灯小屋”。实际按E进入→按E退出→再次按E进入均成功；世界版本378、时间第3天21:20及暂停状态全程不变。没有修改业务代码、扩大入口范围或重置数据。当前页面停留住宅内部，证据为 `web/evidence/v7-2/stale-tab-fix/home-entered.png`。生产构建重启后，已经打开的旧标签页需刷新一次才会加载新前端；其他旧标签页同样适用。本次只做现场浏览器复核，未重复运行单元测试或构建。
