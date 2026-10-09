# V10.1 生活街区视觉样板

2026-10-10；开始基线 `f637a89`，Git工作区干净。仅改中央广场—咖啡馆—杂货铺—青篱居门前—北桥河岸连续切片。12建筑、6居民、AI/工作/关系/记忆/数据库业务代码均未扩展。未调用图像生成或外部付费模型，未推送或部署；模型回归仅使用本机替身或Fallback。

## 实际画面判断

已实际打开3100页面，拍摄默认/全景；对照本地 `references/my-ai-town-local/my_ai_town-main/assets/readme/town-overview.jpg` 和用户提供图片。不是只看README。

1. **缺少中间层次**最突出：建筑和大树的细节已有，地面却是均匀草坪，房子之间缺少院落边界。这不是缩放问题。
2. **路面和水面过于几何化**：道路、商店门前与广场材质接近；河道是细直色带，桥头没有落地关系。受原坐标/碰撞约束，本轮不把水道重画成有假通路的弯河。
3. **视角问题与布局问题分开**：全景把2800×1600地图缩成约25%默认镜头，居民自然很小；默认游玩视角人物约96屏幕像素高，已经清楚。保留人物尺寸和镜头逻辑，明确全景只用于导航。南部树木排队、东岸大块空地属实，但不在本次样板范围，未趁机美化整图。

## 改动及工程边界

| 问题 | 本轮实际变化 | 边界 |
|---|---|---|
| 建筑漂在草地上 | 店前独立铺装、侧面/背面篱笆、花圃石边、树丛围合、门口黑板/货箱/桶/花盆 | 入口不动；陈列无假购买按钮 |
| 大片草地同质 | 多尺度色块、疏密草丛、花点、成片花园/林缘；样板边缘渐回旧材质 | 不替换全地图地表，不增加可行走捷径 |
| 道路像线框 | 原可通行面内分广场石铺/店前砖铺/砂土；碎边、磨损与草边区分 | 道路宽度/转角物理数据完全不变 |
| 河道单调 | 北段错落岸石、苔色边缘、芦苇、水纹及木桥板/桥头层次 | 水道与两桥坐标不变，未实施弯曲拓宽 |
| UI抢占场景 | 默认地点牌省去重复用途行、弱化边框；全景/游玩说明明确 | 原聊天、档案、气泡、名单、控制全保留，无大型Modal |

新增 `lib/town-dressing.ts` 只描述视觉内容；`scene-ground.ts`生成一张可缓存的程序地表纹理；`street-details.ts`绘制小物件；`scene-art.ts`复用原图集放置庭院/植被。场景仍是独立地表、可排序物件、真实角色及HTML交互层，不是全景图片覆盖游戏。

全部新立体装饰落在原本不可通行位置；新增测试逐点检查树根、花圃、石边、庭院篱笆、岸石和物件脚部。`town-map.ts`、`scene-data.ts`、`navigation.ts`、`world.ts`、`store.ts`和AI模块无改动。物理场景及门户序列SHA256仍是`05d093822d2451f9021dc6f43fb151a97c8dacea8a9065d692e4c6cfceb33e16`。没有存档迁移或初始化，也没有把旧NPC搬到新位置。

## 同位置前后对比

比较脚本从本轮开始时真实世界revision431读取副本，仅在独立测试world里把自动运行暂停，保持NPC/路径/需求/记忆等内容一致。相同1440×900窗口、相同三个镜头矩阵，程序断言一致；测试不会改主世界。主世界由用户原先开启自动运行，自然推进不被当作美术修改。

| 位置 | 改造前 | 最终样板 |
|---|---|---|
| 中央广场 | [before/plaza](../web/evidence/v10-1/comparison-before/plaza.png) | [final/plaza](../web/evidence/v10-1/comparison-final/plaza.png) |
| 商业街 | [before/commercial](../web/evidence/v10-1/comparison-before/commercial.png) | [final/commercial](../web/evidence/v10-1/comparison-final/commercial.png) |
| 北桥河岸 | [before/riverside](../web/evidence/v10-1/comparison-before/riverside.png) | [final/riverside](../web/evidence/v10-1/comparison-final/riverside.png) |
| 默认游玩 | [before/default](../web/evidence/v10-1/comparison-before/default.png) | [final/default](../web/evidence/v10-1/comparison-final/default.png) |
| 全景 | [before/overview](../web/evidence/v10-1/comparison-before/overview.png) | [final/overview](../web/evidence/v10-1/comparison-final/overview.png) |

[1366×768默认](../web/evidence/v10-1/comparison-final/default-1366.png)。两次视觉迭代保留在comparison-after-draft和comparison-after；第一版草丛规律、岸边太平，后续改错落草团/岸石/院落侧篱。最终仍不是参考图的全城密度和手工美术完成度，不能仅凭测试通过宣布效果完全达标。

## 实际验证

所有命令在 `web/` 执行；测试 `.env.test.local` 指向127.0.0.1:55488专用库，各脚本随机world ID。旧证据未覆盖。本轮没有真实模型调用。

| 检查 | 命令/证据 | 实际结果 |
|---|---|---|
| 类型/lint/单元/构建 | `npm run typecheck`、`npm run lint`、`npm test -- --reporter=dot`、`npm run build` | 114测试/18文件通过，类型/lint/生产构建通过 |
| 相同镜头视觉对比 | `node --env-file=.env.test.local --import tsx scripts/v101-visual-check.mjs`，EVIDENCE_DIR=comparison-final | 6截图；同种子/矩阵；世界不变，1366和1440无横向溢出 |
| 全12门实际步行 | `scripts/v9-final-tour.mjs`，EVIDENCE_DIR=evidence/v10-1/twelve-doors | 全12建筑进入/移动/退出，每栋3次加载对象数一致，26截图、interior-walk.webm，异常0 |
| 工作/休息/路径 | 全部unit含1440步状态模拟；`scripts/v101-experience-check.mjs` | 咖啡与商店真实产出、合作经历、室内移动/聊天、刷新/后端重启；6截图和录屏 |
| 自动运行与并发干预 | experience及`scripts/v3-db-check.ts`，EVIDENCE_DIR=evidence/v10-1/concurrency | 双标签不加速、暂停有效；6组数据库并发/送食物影响决策通过 |
| 玩家聊天/降级 | `scripts/chat-check.mjs`，EVIDENCE_DIR=evidence/v10-1/chat，WORLD_ROSTER=legacy | 9组通过，超时882ms；仅本机替身与无密钥 |
| 居民公开交流回归 | `scripts/v93-social-check.mjs`，EVIDENCE_DIR=evidence/v10-1/public-dialogue | 正常/报错/超时各2次本机替身请求，6张运行截图；未调用真实付费模型 |
| PostgreSQL真实重启 | `scripts/v101-postgres-check.ts --restart-test-postgres` | 仅校验后的55488容器重启；完整世界和私人聊天相等；55487主库未重启 |

最后补加庭院侧篱并完成最终构建后，再次执行`v101-experience-check.mjs`（EVIDENCE_DIR=evidence/v10-1/experience-final）通过，复核咖啡馆/杂货店实际步行进出、工作、聊天、自动推进与恢复。

样板静态对象层176个（含当时实际在场居民/玩家）；一次headless首次就绪860.74ms。没有本轮FPS/长时间堆测量，不沿用V8.4数值宣称本轮性能相同。纹理仍缓存复用，对象销毁沿原context:true策略；反复进出对象数检查通过。

实际行为图：[工作完成档案](../web/evidence/v10-1/experience/02-cafe-completed.png)、[室内合作回忆气泡](../web/evidence/v10-1/experience/03-work-memory-dialogue.png)、[理货](../web/evidence/v10-1/experience/04-store-completed.png)、[暂停](../web/evidence/v10-1/experience/06-paused-saved-work.png)、[录像](../web/evidence/v10-1/experience/work-cooperation.webm)。工作验收使用明确可控测试状态，不伪称主世界自然发生了同一时刻的合作。

两名居民在样板广场的实际运行画面：[双居民气泡](../web/evidence/v10-1/public-dialogue/public-normal.png)、[故障降级](../web/evidence/v10-1/public-dialogue/public-error.png)。回复明确标记AI测试替身，不能作为真实模型成功证据。

## 本地页面与文件清单

本地3100已重启为本轮生产构建，[实际主页面](../web/evidence/v10-1/main-final.png)。只重启本项目Next进程，未重启主数据库，未初始化/暂停主世界。重启前存档revision630、6居民、running=true；重启后读取revision634、6居民、running=true，已有浏览器继续唤醒推进，因此不能宣称主世界整份快照逐字相等。精确恢复由隔离世界后台重启与PostgreSQL重启验证证明。

修改文件：

- 渲染：`web/src/components/scene-ground.ts`、`scene-art.ts`、`TownScene.tsx`、`web/src/app/globals.css`。
- 新增视觉数据/绘制：`web/src/lib/town-dressing.ts`、`web/src/components/street-details.ts`。
- 新增测试/证据脚本：`web/tests/living-slice.test.ts`、`web/scripts/v101-visual-check.mjs`、`v101-experience-check.mjs`、`v101-postgres-check.ts`。
- 文档：`AGENTS.md`、`docs/spec.md`、`docs/town-map-plan.md`、本报告、`web/README.md`、`web/public/art/v10-1/ASSETS.md`。

运行截图/录像保存在忽略目录`web/evidence/v10-1/`，不覆盖旧阶段证据。

## 素材和差距

没有新位图、没有复制参考资源。树/花坛/房屋沿已登记的本项目图集；小物件与地表为原创代码绘制，2世界单位基础像素、nearest采样。完整来源/限制：[资源说明](../web/public/art/v10-1/ASSETS.md)。没有新增依赖。

改善是局部院落组织和地表层次。仍缺参考图那样的曲折河谷、高差台地、大量独立手工小物件、自然道路曲线及整城连续密度；程序木箱/岸石的细节密度低于建筑图集。河道仍直、街区主轴仍规整，这是保留旧几何的明确取舍。若后续改变道路/岸线，需要独立的碰撞与存档兼容任务，不能只改一张美术图。

## 扩展到全地图的后续计划（本轮不执行）

1. 先确认当前商业街样板的色彩、庭院密度和角色比例，再将同类dressing配置扩到公共街；逐区保留清晰通行口。
2. 东岸住宅各做不同的院落用途与绿地边缘，南部排队树改为大小林簇和开口；不按等距复制物件。
3. 河谷若需要曲线/高差，先冻结旧桥与门户锚点，版本化可通行几何，给已有玩家/NPC坐标制定兼容映射并验证全部保存路径，再替换视觉。
4. 单独补齐风格一致的正式小道具图集；继续记录许可与帧比例，不通过放大人物弥补全景缩放。
5. 每片完成都重复真实步行、全部门口/碰撞、NPC多场景、自动运行、气泡和存档测试；有实测瓶颈再考虑分块，当前不引入新引擎。

本轮到样板与验收停止，不自动扩大美化范围、增加玩法、修改AI系统或部署。
