# V8.1 大地图基础与榴木街验收

2026-10-10（北京时间）。本轮基线：`3f39896478ae38bf0901304fa579c1074456b34b`，保存完整V7.2源码/测试/资产，未推送。原参考项目、私密配置和数据库卷未移动；不部署、不引入新NPC或AI行为。

## 内容和实现

- 旧(0..960,0..600)街角位置原样保留；新室外1760×800，向东接石榴杂货铺(1158,320)，支路沿x1030向南，再沿y578抵达青篱小居(1510,520)。[整体蓝图](town-map-plan.md)描述未来广场/住宅/商业/公共区与河岸森林关系，不声称河流和桥梁已经建成。
- `town-map.ts` 是轻量纯数据文件，集中地表、道路、庭院、建筑、装饰与实体占地；`scene-ground.ts` 按同一数据生成一张缓存纹理。继续使用PixiJS，不迁移Godot，不新增Tiled依赖。屋顶/立面/门口是独立图集精灵，脚点y决定遮挡；地表纹理与道路/碰撞共用坐标。
- `scene-data.ts` 新增两对门户及两个真实场景：store_interior是货架/柜台布局，cottage_interior是单床/书桌/衣柜/壁炉布局。各自的sceneId、家具占地、安全出生点、出口归属独立；复用 `INTERIORS` / `drawInterior`，没有交易按钮。
- 玩家仍由 `use-player → movePlayer/enterPortal` 管理本地即时移动，只有合法门前E才切场景；没有临时传送或穿障路线。默认镜头沿用旧街角，新的室外边缘跟随只由玩家移动触发，世界轮询不改镜头；全景、拖动、缩放使用实际地图尺寸。刷新后恢复玩家并纳入镜头。室内保留原镜头方式。
- `world.ts`、`store.ts`、NPC业务地点/住宅、决策、路径、事务、模型适配和私聊协议本轮没有修改。NPC不被分配给新房屋，不生成前端随机居民。原schema1/2恢复仍有效，无SQL/世界快照迁移。

## 实际执行结果

Windows、Node24.14.1、Next16.4.0、Pixi8.22、PostgreSQL17；命令在web目录执行。集成测试使用55488专用库与新随机世界ID，模型明确关闭或只访问本机测试替身。

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过，无警告 |
| `npm test` | 11文件91项通过，新增6项地图测试，保留原85项 |
| `npm run build` | 生产构建通过，API路由保持 |
| `EVIDENCE_DIR=evidence/v8-1/browser-release npm run test:v81` | 2组综合实测、11截图、真实步行录屏、0页面异常；新旧建筑/移动/碰撞/镜头/存档/降级/干预 |
| `EVIDENCE_DIR=evidence/v8-1/home-regression-fixed npm run test:v72` | 4组原住宅/NPC自主回家回归、14截图、视频，通过 |
| `EVIDENCE_DIR=evidence/v8-1/cafe-regression npm run test:v71` | 4组原咖啡馆/NPC进食回归、7截图、视频，通过 |
| `EVIDENCE_DIR=evidence/v8-1/chat-regression npm run test:chat` | 9组聊天及错误/超时降级通过，超时859ms；真实模型未调用 |
| `EVIDENCE_DIR=evidence/v8-1/private-regression npm run test:v52` | 6组访客隔离/请求保护通过 |
| `npm run test:v72:db` | 2组旧v1/v2存档兼容及真实库并发通过，本轮未重启PostgreSQL进程；结果在legacy-database目录 |
| `EVIDENCE_DIR=evidence/v8-1/concurrency npm run test:v3:db` | 6组自动/手动推进与干预事务通过 |
| `node scripts/delivery-scan.mjs` | 源码及客户端已知AI密钥/数据库串零命中；secret-scan.json |
| `git diff --check` | 通过 |

环境变量表述为紧凑记法；实际PowerShell使用 `$env:EVIDENCE_DIR='…'` 后执行命令。所有本轮证据在 `web/evidence/v8-1`。真实付费对话调用0次，模型配置没有改变；新外观使用imagegen原创生成。

## 可操作验收对应

| 要求 | 证据 |
|---|---|
| 新旧街区连通、真实步行 | 从玩家默认(620,370)向东走到杂货铺，再按支路到住宅；未改sessionStorage位置或模拟客户端世界 |
| 障碍与门口可达 | 单测逐段按2单位采样道路；所有4个门及反向安全点均可站立，新增床铺真实按键碰撞停在x353附近；建筑/家具中心不可站立 |
| 两栋新屋不是同一室内 | sceneId、门户id和配置独立；商店货架布局、住宅单床布局，对象数不同，返回各自门前 |
| 反复切换无对象叠加 | 住宅4轮、商店3轮；每次室内与室外根对象数量一致，无重复按键触发，原世界JSON不变 |
| 原NPC行为与旧坐标 | 两组原浏览器闭环通过；单测所有旧地点两两道路仍合法，200步模拟NPC从不进入新屋，无重分配住宅或坐标迁移 |
| 干预、聊天与私聊 | 实际送食物后下一步选择社交；原降级、超时/错误、私聊隔离回归通过；NPC气泡缩放正常 |
| 自动/手动/暂停 | 原咖啡馆/住宅双访客自动唤醒回归通过，暂停后不推进；原事务并发测试通过 |
| 存档与重启 | 新测试世界进出后全JSON未变，后端重启/刷新后已推进世界相等；原3100世界378重启前后JSON完全一致 |
| 两种桌面尺寸 | 1440×900和1366×768实际截图，无横向溢出；镜头不因轮询重置，新街区刷新玩家可见 |

原3100已重启为当前生产构建；原暂停世界revision378、minute4160完全保留（`main-restart.json`）。已实际刷新用户原内置浏览器标签页，避免上一轮旧前端没有新增入口的问题，并在原存档中显示全景（`live/current-town.png`）。

## 性能口径

在本机Playwright Chromium headless生产页面实测（不是所有设备性能保证）：室外objects层57个直接子对象，其中3个为两名NPC和玩家，静态54；ground层25个直接子对象。不是总GPU draw call或完整递归对象计数。

初始加载与一次整页刷新共16次art资源响应、8个不同图集URL；多次室内外切换没有额外图集响应。Assets/source纹理缓存共用，地面纹理缓存复用；切场景销毁上一树的实例，重新挂载本场景，根对象计数稳定。没有测量GPU显存或跨小时内存泄漏。

静止与真实步行分别采90个requestAnimationFrame间隔：两者均值约16.67ms、P95约16.8ms；拖动镜头期间额外Pixi主动render计数0（CSS统一变换承担平移）。这是有限帧间隔样本，不等于GPU渲染耗时、持续FPS承诺或容量测试。此规模没有发现需要Chunk Streaming的明显瓶颈，本轮没有引入视口裁剪/分块服务。完整数值在 `browser-release/result.json`。

## 本轮发现并修复

1. 道路连通单测发现一盏路灯的占地挡住南侧路线，移到路边后通过。
2. 原广场标签使用百分比，扩大世界层后漂移；改为稳定世界坐标。
3. 新街区刷新后玩家在镜头外；初次恢复时将玩家纳入镜头，平时只跟随实际移动。
4. 全景拖动不应触发缩放跳变；最低缩放按实际基础比例计算。
5. 首次住宅回归发现室内边缘跟随把气泡挤出可视区；跟随限定室外，住宅复测4组通过。失败截图保留在home-regression，成功版本在home-regression-fixed。

验证记录事故：一次调用旧v72-db-check时，补丁因工作目录错误未应用，脚本仍写入其硬编码的v7-2结果文件，导致旧result.json被覆盖。已把本次结果单独保存在v8-1/legacy-database，并给脚本补EVIDENCE_DIR支持；旧验收摘要依照此前可核实的工具输出及仍保留的原测试世界恢复并标注recoveryNote，但entered/bed/rest中间快照未能逐字节恢复。没有覆盖或删除数据库世界、聊天、素材、参考目录或其他历史截图。不能将恢复摘要冒充原文件。

## 页面与录屏

- [新旧街区全景](../web/evidence/v8-1/browser-release/01-connected-overview.png)
- [旧街区保留](../web/evidence/v8-1/browser-release/02-old-district.png)
- [杂货铺门前细节](../web/evidence/v8-1/browser-release/03-store-street-detail.png)
- [杂货铺室内](../web/evidence/v8-1/browser-release/04-store-interior.png)
- [住宅庭院与玩家](../web/evidence/v8-1/browser-release/05-cottage-courtyard.png)
- [青篱小居室内](../web/evidence/v8-1/browser-release/06-cottage-interior.png)
- [床边碰撞](../web/evidence/v8-1/browser-release/07-cottage-player-collision.png)
- [新区域刷新恢复](../web/evidence/v8-1/browser-release/08-new-district-restore.png)
- [原居民、对话与状态](../web/evidence/v8-1/browser-release/09-old-npc-chat-and-running.png)
- [缩放后的气泡](../web/evidence/v8-1/browser-release/10-bubble-zoom.png)
- [1366×768全景](../web/evidence/v8-1/browser-release/11-overview-1366.png)
- [实际步行、进入、返回录屏](../web/evidence/v8-1/browser-release/east-district-walk.webm)

## 文件、许可和下一步边界

新增：docs/town-map-plan.md、本记录；web/src/lib/town-map.ts；components/district-frames.json；tests/town-map.test.ts；scripts/v81-map-check.mjs；public/art/v8-1/east-buildings.png和ASSETS.md。

修改：AGENTS.md、docs/spec.md、web/README.md、web/package.json；components/TownScene.tsx、player-art.ts、scene-art.ts、scene-ground.ts；lib/scene-data.ts、scene-view.ts；scripts/v72-db-check.ts（只增加证据输出目录配置）。具体sha256清单在evidence/v8-1/changes.json。无新依赖或后台业务改动。

[图集来源及帧说明](../web/public/art/v8-1/ASSETS.md)：1726×911原创生成透明图，店铺与住宅独立外观。房间复用已登记原创家具，以配置形成不同布局；没有复制my_ai_town资源或把参考截图贴进游戏。当前仍是细节有限的首片街区，不宣称完成参考全景；自然边界、河岸桥梁、专业统一tile集仍未实现。

下一片区域主要增加town-map地表/建筑/装饰/占地、独立sceneId与INTERIORS布局、成对门户、对应图集帧和可达性/旧存档回归。只有未来确需NPC新行为才另行设计对应业务动作。完成V8.1后停止，不自动扩图、增NPC、职业、经济、AI架构或部署。
