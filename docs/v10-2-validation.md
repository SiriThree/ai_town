# 视觉 V10.2 · 全图空间重构验收

本轮基线 `1f6ef28`，开始工作区干净。与已经完成的“自然生活V10.2”分别记录，本轮不改行为层。规划先于渲染修改：[全图方案](v10-2-plan.md)。不扩2800×1600地图、不增12栋建筑/6居民、不部署推送、不调用外部模型。

## 实际问题与全图改动

已打开本轮运行页面并拍摄before，读取视觉V10.1报告，对照本地`references/my-ai-town-local/my_ai_town-main/assets/readme/town-overview.jpg`。用户本条第2/3张都是当前全景，因此目标使用此前提供且与本地一致的密集小镇参考。问题不是人物尺寸：全景25%时人物自然缩小，默认近景已清楚，未改人物大小。

| 确认的问题 | 本轮整图处理 |
|---|---|
| 平地摆房，缺少地形骨架 | 7个连续地块轮廓：旧广场、商业街、公共台地、青篱桥头、东岸北里/南里、工坊庭院；护坡、台阶、不同草地和铺装组成台地前后关系 |
| 房屋平均分散，功能区不成片 | 西部公共核心与南部公共服务节点，北商业院落；东岸四住宅以北/南两组共同边界和林地缓冲连接，而非各自一块空草坪 |
| 等宽规整道路 | 主街保留完整暖砂路面；次级路缩窄磨损中心并保留合法碎石路肩；广场石铺、商业砖铺、桥头石铺、庭院通路明确分层。几何主轴仍直，不伪称完成曲线道路重建 |
| 直蓝带和孤立木桥 | 水面在不可通行范围内宽窄曲折，原双桥固定；两岸护坡、沿新岸线摆放的不等距岸石、芦苇、桥头铺装连接庭院 |
| 树是装饰，底部排队 | 移除旧底部/右边树列的绘制，13个林地包络以确定性非等距林簇组成边缘，留草甸空隙；树林用于分隔住区、遮挡世界边缘和衬托公共区，不增假NPC |
| 密度和节奏单一 | 公共台地前沿留空展示花坛、长椅和阶梯；商业货物、住宅院落与外围密林形成疏密对比。不是只在左上继续加装饰 |

## 坐标、碰撞与旧存档

**12栋建筑坐标、入口、室内协议、道路可通行几何、碰撞、NPC路线与世界数据结构全部不变。** 无SQL迁移、无NPC住宅重分配、无主库重置。渲染隐藏的旧树列足部原本就在不可通行地块内，其原障碍数据仍保留，不影响可行走集合。

原几何+门户序列SHA256继续为`05d093822d2451f9021dc6f43fb151a97c8dacea8a9065d692e4c6cfceb33e16`，原living-slice回归保持；新增测试扫描拓宽水域、桥面、树脚与围栏均不覆盖合法站位。铺装按原地面掩码裁剪；地形为2D台地表现，没有新的物理Z轴。后台仍依照原路径，既有在途坐标无需迁移。

前后对比使用主世界revision661的只读副本，独立随机测试world ID。暂停下API世界与原快照规范化结果相等；自动运行阶段另记录真实增量，不将其误报为美术修改。

## 真实浏览器前后图

全部来自当前生产构建的实际Pixi页面，同一1440×900视窗、同一旧存档副本；五局部镜头矩阵程序断言前后相同。

| 视角 | 改造前 | 改造后 |
|---|---|---|
| 全景 | [旧全图](../web/evidence/v10-2/before/overview.png) | [新全图](../web/evidence/v10-2/release-final/overview.png) |
| 广场核心 | [前](../web/evidence/v10-2/before/plaza.png) | [后](../web/evidence/v10-2/release-final/plaza.png) |
| 商业区 | [前](../web/evidence/v10-2/before/commercial.png) | [后](../web/evidence/v10-2/release-final/commercial.png) |
| 住宅组团 | [前](../web/evidence/v10-2/before/housing.png) | [后](../web/evidence/v10-2/release-final/housing.png) |
| 河岸双桥 | [前](../web/evidence/v10-2/before/riverside.png) | [后](../web/evidence/v10-2/release-final/riverside.png) |
| 公共服务台地 | [前](../web/evidence/v10-2/before/civic.png) | [后](../web/evidence/v10-2/release-final/civic.png) |

[默认游玩](../web/evidence/v10-2/release-final/default.png) · [1366×768](../web/evidence/v10-2/release-final/default-1366.png) · [自动运行全景](../web/evidence/v10-2/release-final/auto-overview.png) · [自动运行近景](../web/evidence/v10-2/release-final/auto-local.png)。世界从6960分钟推进到6970分钟，多居民真实在途、镜头矩阵不跳；暂停后连续读取不再推进。

第一稿公共台地前被树冠盖住，第二稿让出前沿、加深护坡；进一步修正拓宽水面上的旧树/院落篱笆和游离岸石。中间截图保留draft/final/release目录，不以它们代替release-final最终证据。

## 功能回归与实际命令

命令均在`web/`，集成脚本只用`.env.test.local`（127.0.0.1:55488/ai_town_mvp_test），独立world ID和`EVIDENCE_DIR=evidence/v10-2/...`；主库55487不重启、不清理。

| 项目 | 本轮实际执行与证据 |
|---|---|
| 类型/lint/单元/构建 | `npm run typecheck`、`npm run lint`、`npm test -- --reporter=dot`、`npm run build`通过；133测试/22文件，日志tests-final.txt |
| 全景与五片区、自动/暂停 | `node --env-file=.env.test.local --import tsx scripts/v102-visual-check.mjs`，V102_ACTIVITY=true，release-final；10截图、镜头保持、世界真实推进/暂停、两个桌面分辨率无横向溢出 |
| NPC长途、出入、工作、休息 | `scripts/v10-motion-check.mjs`，motion：真实路径穿过街区/桥梁进入芦苇屋、慢CPU、暂停/刷新/后端重启、公共短对白、无密钥E私聊；同一次浏览器运行的最终持久化快照记录cafe=1/store=1，持续动作和休息结算另由未删减单元测试覆盖 |
| 近距离聊天/模型等待 | `scripts/v10-interaction-check.mjs`，interaction-final通过：室内外E、真实HTTP模型替身/超时Fallback、输入隔离、世界干预并行、忙碌工作、双访客历史隔离；3次本机模型调用，外部0 |
| 并发/干预 | `WORLD_ROSTER=legacy`运行`scripts/v10-db-check.ts`，concurrency：6组通过，重复wake/CAS/干预影响后续决策不回退 |
| 12栋实际步行/碰撞/室内 | `scripts/v9-final-tour.mjs`，twelve-doors-pass通过：12栋全部实际键盘走到门口、室内移动/退出，每栋进入3次、对象数稳定，最后绕行北桥返回杂货店；26截图/约4分钟连续录像，页面异常0 |
| PostgreSQL重启与存档 | `scripts/v10-recovery-check.ts --restart-test-postgres`，recovery通过：只重启已核对55488端口与test卷的容器；在途世界逐字恢复、2份私人会话历史不变，同一action ID继续推进1000ms，主库未重启 |

以上脚本均用`node --env-file=.env.test.local --import tsx`。Windows环境变量使用`$env:EVIDENCE_DIR='evidence/v10-2/独立目录'`。

真实录像：[12建筑步行/进出/跨桥返程](../web/evidence/v10-2/twelve-doors-pass/interior-walk.webm)、[跨街区NPC长途及无密钥交谈](../web/evidence/v10-2/motion/long-walk.webm)、[玩家近距离与室内交流](../web/evidence/v10-2/interaction-final/nearby-interaction.webm)。[NPC途中](../web/evidence/v10-2/motion/03-slow-cpu-walk.png)、[进入住宅后的后台与画面](../web/evidence/v10-2/motion/04-entered.png)、[实际聊天](../web/evidence/v10-2/interaction-final/05-indoor-chat.png)。全部非付费模型。

失败与修正记录：新增视觉脚本把按钮名称写成“暂停”，实际为“暂停自动运行”，修正定位；原近距离脚本落点在6人初始重叠区，最近目标可能为沐溪，改为实际键盘走到阿晴西南侧后验证；12门原键盘脚本转角松键跨进程延迟导致超出寻路预留4单位，在青篱门前跨到草坪边缘，脚本加入提前减速与短键校正，不写玩家坐标、不改业务碰撞。第二轮12门均走完，额外返程的最短路线贴近杂货店灯柱，改用逐段合法性校验的主路绕行；候选直返线也先经校验发现石溪居/灯柱占地阻挡并弃用。最终返程经过北桥并绕开既有灯柱/长椅，不修改障碍让测试通过。失败和中止目录均保留。

## 性能和素材

同场景对象层175→408（包含当时实际在场居民/玩家），一次headless首次就绪860→1035ms；最终运行120个rAF样本去首帧后中位16.8ms、P95 33.4ms。这是当前Windows环境、同时存在其他验证进程时的小样本，不承诺特定FPS/并发容量或长时间内存稳定。

原图集由Pixi Assets缓存复用；地面1400×800纹理仅生成一次，2倍nearest；静态树和房屋独立排序，不每帧重建，没有分块/新引擎。本轮原创配置与程序地表，没有新外部美术或参考资源复制。[资源记录](../web/public/art/v10-2/ASSETS.md)。

## 与目标的距离及本轮判断

比V10.1接近目标的依据是全图可见的结构改变：原来空白的南部和东岸现在有台地轮廓、住宅组和林缘；河道有宽窄、水陆过渡与两个桥头节点；公共前场从草坪分离，商业门前与住宅通路材质不同。不是只把左上放大，也没有拿测试通过代替视觉判断。

**仍未达到参考图的成熟美术完成度。** 道路几何主轴保留直角；地理中心依旧偏西部，建筑没有重新挤成参考图的高密度街坊；台地是低护坡而非复杂山崖层级；程序水纹/石坡细节仍少于屋顶图集。草地并非全部可走，新的绿地仍是原非通行景观区。参考的自然S形河谷、更多手工微地形与不规则街坊需要后续专门调整碰撞/路网和正式地形图块，本轮不擅自继续。

## 文件清单

- 新增构图：`src/lib/town-landscape.ts`。
- 绘制：`src/components/scene-ground.ts`、`scene-art.ts`、`street-details.ts`。
- 新增验证：`tests/town-landscape.test.ts`、`scripts/v102-visual-check.mjs`；已有交互/遍历脚本修正键盘验收落点，恢复脚本增加证据路径参数避免覆盖旧记录。
- 文档：AGENTS、spec、town-map-plan、v10-2-plan、本报告、web/README、public/art/v10-2/ASSETS。
- **无业务层、存储、API、室内、门户、角色动画、模型配置修改。**

完成全图视觉验收后停止，不进入行为优化、部署或推送。

## 本地页面交接

本地3100已切换本轮生产构建，读取主世界与重启前只读备份规范化后逐字相等：revision661、minute6960、6居民、仍暂停。证据main-before-restart.json/main-restart-result.json，没有初始化或清理。自动居民模型保持关闭，私人模型配置未改，本轮没有外部调用。[本地实际全景](../web/evidence/v10-2/main-live.png)。

玩家在不同片区的实际游览截图：[住宅门口](../web/evidence/v10-2/twelve-doors-pass/door-rose.png)、[滨水工坊](../web/evidence/v10-2/twelve-doors-pass/door-workshop.png)、[公共会馆](../web/evidence/v10-2/twelve-doors-pass/door-hall.png)、[芦苇屋室内](../web/evidence/v10-2/twelve-doors-pass/inside-reed.png)。最终完整遍历记录twelve-doors-pass/result.json；先前失败/中止的目录不作为通过证据。

最终类型/lint通过，最终生产构建通过后运行全部上述页面；后续仅调整验收脚本的键盘精度、路线及报告。保存本地Git检查点，不推送。到此停止。
