## 视觉 V10.2：全图分区重构

2800×1600和12建筑锚点不变，新增全图台地/院落/林缘组织、曲折宽窄河谷与双桥铺装；房屋、玩家和NPC仍是独立Pixi对象。道路、碰撞、门户、存档、模型和行为层未改。`town-landscape.ts`管理构图，`scene-ground.ts`缓存程序像素地面，原图集复用；来源见`public/art/v10-2/ASSETS.md`。

规划与验收见`../docs/v10-2-plan.md`、`../docs/v10-2-validation.md`。这是视觉阶段，与历史自然生活V10.2区别记录。启动/数据库配置仍沿下文，不需要迁移或重新初始化。

# 晨露村 · Web AI 小镇 MVP

## 当前：自然生活 V10.1–V10.3（本地，未发布）

保留已完成的地图视觉样板。现在自动运行每现实秒结算2模拟分钟，固定1x，不补算离线时间；手动一步也是1秒行动量。NPC以80世界单位/秒沿后台合法路线分段行走，远路耗时更长。未完成行动的ID、路径和进度保存在PostgreSQL；到达后才进门/工作，工作与进食8秒、休息12秒。暂停保存当前位置，刷新/重启恢复，原存档不重置。schema2仅增加可选字段，无DDL。

- **鼠标点击居民**：查看档案、真实需求、工作与经历。
- **WASD/方向键**：走近居民；看到高亮目标后按 **E** 开始交谈；同键开门或阅读咖啡馆旁现有黑板的真实日志。距离与朝向选择一个目标，不同时执行多个操作。
- **Esc**：结束会话/关闭面板并继续移动。输入焦点隔离移动与开门；模型等待不锁住整个世界。忙碌居民给提示，不中断任务。NPC离开范围后不能继续发送新消息，已发送回复仍保存。
- 自主交流每段两句、每句5秒，持久会话ID与轮次；普通台词最多30个可见字符。模型异常长输出一次降级，不重试。普通寒暄不加信任，合作仍有事实来源。
- 玩家模型提示与常见Fallback均改短句；异常长的模型回复只在气泡显示预览，原文仍在私人历史。访客隔离、配额和服务端密钥方式不变。

近距离是本地玩家体验规则，**不是后台不可伪造的距离权限校验**，也不是多人玩家同步。私人聊天不会在后台抢占NPC；对方继续生活并离开时，前端提示范围变化。本轮没有真实供应商调用。倍速UI未实现，不能宣称高倍速实测。

本地启动仍为 `npm run build` 后 `npm start`（127.0.0.1:3100）；开发可 `npm run dev`。保留原DATABASE_URL及环境文件，不重新db:init/播种。新存档含途中坐标，回退旧代码必须配套已备份的旧快照，不能直接让旧模拟写入新存档。

[分阶段验收/全部脚本/截图/录像](../docs/v10-validation.md) · [Git检查点与进度](../docs/v10-progress.md)。以下历史材料保留，行动时序与交互以本节为准。

## V10.1 视觉样板

已在中央广场—商业街—北桥河岸加入庭院边界、店前铺装/陈列、簇状植被和岩石河岸。原12门、6居民、NPC规则/工作/记忆、碰撞与存档保持不变；主地图其他区域未整体重做。全景看布局，“复位”回到可观察居民的游玩视角。没有外部模型调用或新依赖。

[前后实际截图与验收](../docs/v10-1-validation.md) · [本轮资源说明](public/art/v10-1/ASSETS.md)。正常启动命令及数据库配置沿下文；不需要迁移、清库或重新播种。


## V9.4 已完成能力（历史记录）

当前实际规模：**12 栋可进入建筑、13 个场景、6 名居民、2 类职业工作**。从老广场可步行经公共街与双桥到东岸住宅；所有门有独立室内及家具碰撞。点击居民查看真实状态、经历和当前任务，输入聊天后气泡跟随角色；底部居民名单仅在同场景可选择。自动运行仍每5秒一步，关闭网页不常驻模拟。

小雨在咖啡馆备餐，老林在杂货铺理货，任务需要到场并连续执行两次工作；疲劳/饥饿会暂停并保留进度，完成才累计餐点/货架结果。小满在同场景、需求允许时可以实际协助。档案展示进度与产出，公开日志可核对结果。餐点计数是最小工作结果，尚无库存消费、买卖或金币。

公开自主交流与玩家私聊分开。居民必须同场景近距离、空闲且需求允许才交流；每段两句、每人120游戏分钟冷却、全局30分钟间隔、每游戏日最多8段。`NPC_AI_ENABLED=false`（默认）使用本地真实状态对白；设为true后才请求配置的模型，仍受`AI_ENABLED`、`AI_CALLS_PER_DAY`和两个全局并发槽限制。每句最多等待2秒，失败保留可读本地回复；世界事务不等待模型。当前新自主模型链仅Mock/故障/超时实测，**本轮没有新的外部付费模型调用**。早期真实玩家聊天证据是历史验证，不代表本轮自主社交已实测供应商服务。

旧存档不会在读取时被改写。已有本机两居民世界需先备份，再显式运行（只支持本项目本机55487/55488及对应库名）：
```powershell
node --env-file=.env.local --import tsx scripts/migrate-residents.ts --apply
```
它保留原居民全部属性、世界时间、日志与私聊，只追加缺少居民/地点并保存版本。重复调用幂等；备份使用独占文件写入，已有同版本备份时应先核实而非覆盖。新初始化默认为6居民；`WORLD_ROSTER=legacy`仅供原两居民回归夹具。回退到旧两居民代码必须使用匹配旧快照，不能让旧代码写新世界。

本地仍在 `web/` 执行 `npm run dev`，生产预览 `npm run build` 后 `npm start`，地址 http://127.0.0.1:3100。保持现有 PostgreSQL 配置，不删库、不重种。新增内容无需DDL、依赖或Worker；部署准备保留但本轮未执行。

验证与材料：[连续验收](../docs/v8-v9-validation.md)、[阶段过程](../docs/progress-v8-v9.md)、[地图蓝图](../docs/town-map-plan.md)、[技术说明增量](../docs/delivery-v5-1.md#v8v9-技术增量)。本轮原创资产说明位于 `public/art/v8-2/ASSETS.md`、`public/art/v9-1/ASSETS.md`；没有复制参考仓库素材。

复测命令（均在web目录，先build，仅专用.env.test.local；evidence目录不要复用覆盖）：
```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:EVIDENCE_DIR='evidence/v8-v9/my-work-check'
node --env-file=.env.test.local --import tsx scripts/v94-work-check.mjs
# 全12建筑真实步行，使用独立3116端口
$env:EVIDENCE_DIR='evidence/v8-v9/my-tour'
node --env-file=.env.test.local --import tsx scripts/v9-final-tour.mjs
```
V8.2/3/4、V9.1/2/3 分别有 `v82-map-check`、`v83-interiors-check`、`v84-stability-check`、`v91-residents-check`、`v92-experiences-check`、`v93-social-check` 脚本（.mjs，同样使用tsx）。原数据库/聊天/私聊回归命令在下文。专门的 `v9-postgres-restore.ts --restart-test-postgres` 会真实重启已经校验的55488测试容器，固定核对本轮v94-final快照；不得与其他测试同时运行。截图/录屏及快照位于被Git忽略的 `evidence/v8-v9/`，含私人数据的数据库备份不能公开。

以下各旧章节保留当时范围，当前功能数量、NPC位置和隐私规则以本节及V5.2说明为准。

已实现：两名居民、三个地点、规则决策、手动推进、像素街角、档案、日志、PostgreSQL 恢复，以及第二阶段的玩家对话、可配置模型调用与本地降级。**真实外部模型已启用并完成一次浏览器端到端验证**（2026-10-09）；配置位于忽略提交的 `.env.local`，当前 `AI_ENABLED=true`。服务失败时仍按原规则降级。V3 已加入每 5 秒自动推进与送食物；尚未部署线上。需求与后续里程碑沿用 [spec](../docs/spec.md)。

## 当前游玩：V6.1 玩家与咖啡馆

**V7.1增量**：现有居民现在能自主进出咖啡馆。饥饿触发沿室外道路到门口，下一个逻辑步仍需要进食才进入；室内复用原进食效果，需求变化后经出口返回门前，再走向住宅或广场。点击室内真实居民也可查看档案、对话和送食物。NPC目前在入口侧安全站位停留，不做室内巡游、坐椅或职业动作；下文“NPC仍在室外”是V6.1历史范围，现以本段为准。

世界快照现为`schemaVersion:2`，NPC新增`sceneId`，业务`location`与当前场景`position`分开。既有v1存档首次读取统一补为`town`，保留咖啡馆旧门前坐标及其他数据；读取不写库，下一次原事务写入时持久化v2。无需DDL或重新初始化，切勿删库重种。旧程序不能读取已写入的v2快照，回退程序需要配套的旧版备份。旧浏览器页面应刷新以加载新的场景筛选逻辑。

`lastPath`只描述当前场景的一次已提交路径，门户切换时为空。前端按后台归属增删表现对象：离开场景便移除，进入场景按保存坐标出现。快速手动推进时，未播完的旧场景动画会取消，不在室外和室内坐标之间插值。`npcPlace`为对话补充“室内/室外门口”事实，原AI适配器、失败降级、访客隔离与费用限制未变。

V7.1验证入口：`npm run test:v71:db`、`npm run test:v71`（先`npm run build`，仅使用隔离的`.env.test.local`）；运行证据与修改文件见 [V7.1验收记录](../docs/v7-1-validation.md)。本轮无新素材、依赖、环境变量或后台Worker，没有新的外部模型调用。

已在现有街区增加绿色外套玩家。点击地图取得键盘焦点，用 **WASD / 方向键** 行走；从初始位置向右、向上走到咖啡馆门前，出现提示后按 **E** 进入。室内可走动，桌椅/柜台/墙有碰撞；回到下方门口再按 **E** 返回原室外门口。NPC仍在室外；没有假店员或室内聊天。地图拖动/缩放和原NPC聊天、干预继续可用，输入框及档案/历史打开时不触发玩家移动。

玩家是当前浏览器的本地化身，不是新增NPC。`use-player.ts`维护当前位置和按键，`player-scene.ts`定义两个场景、可行走区域、障碍、入口与安全出生点。每次切换真实重建当前Pixi场景对象，复用渲染器和缓存纹理；室内外各自保存镜头。世界仍来自原HTTP API和PostgreSQL，切换不初始化世界、不改NPC位置；后台NPC移动仍只依据真实lastPath。

仅玩家场景/位置/朝向保存在当前标签页 `sessionStorage`，刷新及服务重启可恢复；非法/被家具占据的位置回退到安全点。新会话或浏览器存储不可用时从室外 `(620,370)` 开始。不承诺跨设备或关掉标签页后的玩家进度；它不替代任何后台世界/聊天存档。室外暂只开放道路、广场和门前通道，没有自由穿越草地、房屋或围栏。

继续使用既有 `.env.local` 和数据库，`npm run dev`（开发）或 `npm run build` 后 `npm run start`（生产预览），地址 `http://127.0.0.1:3100`。本轮无迁移、新环境变量或依赖。素材来源及西向镜像限制见 [V6.1资产说明](public/art/v6-1/ASSETS.md)；当前验证、改动清单与截图/录屏见 [V6.1验收记录](../docs/v6-1-validation.md)。复测入口为 `npm run test:v61`，须先构建并配置隔离的 `.env.test.local`；测试不会调用外部模型。

## 当前部署准备（V5.2，未发布）

Ubuntu朋友代部署的最新交付入口：[README-UBUNTU.md](../deploy/README-UBUNTU.md)。目标已确认Ubuntu/新加坡/2核4GB，具体版本、架构和端口待朋友预检；DuckDNS域名待用户填写。根目录`deploy/ops/`为本次原生部署配置，旧模板不再作为执行入口。GitHub已关联`SiriThree/ai_town`，本轮未推送。

目标为2核/4GB Linux单实例：Next standalone、PostgreSQL17、systemd、Caddy HTTPS，Qwen-plus外部API；无需GPU。目标SSH/发行版/架构/域名尚未提供，未连接或修改生产服务器。操作顺序和配置在[deployment.md](../docs/deployment.md)，本轮实测见[部署验证记录](../docs/deployment-v5-2-checks.md)。V5.1及以下章节保留历史口径，当前隐私规则以本节为准。

**世界共享、私聊隔离**：首次打开NPC聊天建立签名匿名Cookie，后台只读取该访客/NPC的最近20轮。旧共享`town_chats`原样保留但新API不再读取，不能自动认领过去的共享对话。Cookie清除/30天到期/换浏览器/密钥轮换后无法自动找回；维护者仍可访问数据库/备份，不输入敏感信息。公开事件不含私聊内容。

升级现有本机环境需显式执行`npm run db:init`，增加`town_private_chats`，不修改原世界/旧聊天。DDL统一位于`scripts/schema.sql`。公网生产必须设置`PUBLIC_DEMO=true`和至少32随机字节`COOKIE_SIGNING_SECRET`；缺配置失败关闭。仅本机回环开发允许固定开发签名值，绝不能用于公网。私聊GET建会话、POST需要Cookie；直接脚本调用也必须保存Cookie，匿名ID不由请求参数指定。

`npm run test:v52`验证独立访客、篡改Cookie、历史/上下文隔离、预算、重启和双访客时钟；`npm run test:v52:permissions`仅在测试库创建受限角色验证权限，结束禁用该测试登录。测试均无付费调用。Linux构建脚本`deploy/linux/build-release.sh`拒绝Windows Node，只从白名单复制源代码，输出带静态资源、维护SQL、平台清单和哈希的tar.gz；保持压缩包完整传输，不能在Windows解压重拷贝，否则可能丢失Next的依赖符号链接。

本轮没有安装目标服务、改防火墙/Swap或公开发布。生产密钥、Cookie签名密钥与数据库密码由本人在受保护环境配置；实际systemd异常自恢复、Caddy HTTPS和目标主机回滚仍需上线前演练。

## 历史交付记录（V5.1）

已完成V1–V4.2：两个居民/三个地点、规则决策、手动/自动推进、食物干预、真实AI与Fallback、共享PostgreSQL存档、Pixi四方向行走与场景气泡。本轮补齐当前事实/历史区分、两行气泡预览、共享调用预算、公开初始化保护和部署配置。

交付入口：[逐项验收与技术方案](../docs/delivery-v5-1.md)、[生产部署准备](../docs/deployment.md)、[3–5分钟讲解提纲](../docs/demo-outline.md)。**没有公开部署，正式讲解视频尚未录制，Docker构建受Docker Hub网络阻塞。** 本地生产构建、Windows standalone入口3组烟测与端到端回归通过。

这是单个共享世界，所有访客能推进、暂停和送食物，也共享每个NPC最近20轮聊天；请勿输入隐私。无人打开网页时没有常驻模拟进程。应用请求/模型预算不等于供应商货币额度，公开前另设小额费用上限。

新增环境变量：`CHAT_REQUESTS_PER_MINUTE=30`（最高120）、`AI_CALLS_PER_DAY=60`（最高200，UTC日）；失败模型尝试也计数，预算耗尽使用Fallback。`PUBLIC_DEMO=true`禁用HTTP初始化，由维护者先`npm run db:init`、`npm run db:seed`。本地默认false保留首次访问播种。密钥只放服务端`.env.local`或部署秘密配置，`.env.example`只有占位符。

真实模型V5.1仅做2次授权调用，验证咖啡馆旧对话之后回答当前广场；证据在`evidence/v5-1/real/`。常规`npm run test:v51`仅访问本机替身，不使用付费模型。完整测试命令、真实/Mock边界、截图与已知限制见验收表。本节和后续阶段章节为历史记录，当前部署及隐私行为以顶部V5.2说明为准。

## 启动

应用独立位于 `D:\腾讯面试\web`。本轮实际环境：Windows、Node **24.14.1** / npm **11.11.0**、Docker Engine **29.6.1**、PostgreSQL **17.11**。依赖由 `package-lock.json` 锁定；建议 Node 24。所有下列命令在 `web/` 执行。

```powershell
npm ci
# 仅首次创建；已有配置请保留，不覆盖。
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
docker compose up -d db --wait
npm run db:init
npm run dev
```

打开 [http://127.0.0.1:3100](http://127.0.0.1:3100)。生产模式为 `npm run build` 后 `npm start`，端口相同，不要同时启动开发与生产服务。

`db:init` 只创建本项目的 `town_worlds`、`town_chats` 和 `town_chat_limits` 表，不删表、不重置、不插入种子。已有首轮应用升级后也需执行一次 `npm run db:init` 补齐对话/配额表。页面先 `GET /api/world`；仅在 404 时请求独立的 `POST /api/world/init`。初始化使用 `ON CONFLICT DO NOTHING`，再次访问保留存档。不要把“重新启动”当成重置方式。

## 数据库与隔离

| 用途 | 地址 / 库名 | Compose 卷 |
| --- | --- | --- |
| 本地演示 | `127.0.0.1:55487/ai_town_mvp` | `ai-town-selfbuilt_town_dev` |
| 自动验证 | `127.0.0.1:55488/ai_town_mvp_test` | `ai-town-selfbuilt_town_test` |

Compose 项目名 `ai-town-selfbuilt`；均为本轮新建容器/卷，仅绑定本机。`.env.example` 中 `town_local / town_local_only` 是此本机开发栈的公开测试凭据，不可当线上凭据。实际 `.env.local` 和 `.env.test.local` 被忽略，未使用其他项目的连接或密钥。测试脚本拒绝非 `ai_town_mvp_test` 库；每次生成新世界 ID，保留验证数据，不清理 SKYCity 或其他项目的数据。

`DATABASE_URL` 必须是本项目明确提供的 PostgreSQL；`WORLD_ID` 决定本地单世界存档，默认 `morning-town`。停库可用 `docker compose stop`；需要关闭容器可用 `docker compose down`（保留卷）。**不要使用 `down -v`，它会删除本项目存档。**

本轮排查时 Docker daemon 起初未运行，启动已安装的 Docker Desktop 后可用，直接使用缓存 `postgres:17`。没有换成 SQLite、localStorage 或内存存档。线上仍采用 PostgreSQL 持久库、同一表与 JSON 快照；供应商、TLS、备份、访客隔离和线上恢复尚未验证。当前是本机共享单世界，无认证，不作为公开生产服务。

## 可解释的主线

`Town.tsx` 发送 HTTP → `src/app/api/world/{init,tick}/route.ts` → `store.ts::tickWorld` 开事务并锁行 → `world.ts::advanceWorld` → `decide` → `canExecute / execute` → PostgreSQL 原子保存 JSON 世界及事件 → `COMMIT` 后返回 → React 档案/日志与 PixiJS 居民位置更新。

- `GET /api/world` 只读，未初始化 404；`POST /api/world/init` 只补首次种子。
- `POST /api/world/tick` 接受 `{ "expectedRevision": 0 }`。事务内校验版本，相同旧版本并发只有一次成功，其余 409；前端禁用按钮并设同步请求锁。网络中断先重读，不自动重放推进。
- 每步 10 游戏分钟；先饥饿 +8、精力 -6、心情 -2，再依稳定顺序各行动一次。精力 ≤25 或饥饿 ≥65 优先解决需求，两者同时紧急时比较紧迫程度；其余按性格与伙伴条件选择广场活动。心情目前是活动效果与可见状态，不独立改变偏好。
- 阿晴外向，在广场有伙伴时偏社交；阿宁安静，偏阅读。目标地点不同时先移动；之后一步才进食/休息。没有固定动作轮播、随机巡逻、模型决策、Planner 或记忆框架。
- 进食：饥饿 -50、精力 +6；休息：精力 +40、心情 +4；社交：心情 +14、精力 -6；阅读：心情 +9、精力 -2；移动：精力 -3；等待：精力 +3。数值裁剪至 0–100。
- `world.ts` 定义地点、每名居民合法站位和沿道路的折线路径。场景直接显示本步已到达的位置，**暂不插值播放行走动画**；`lastPath` 是真实合法路线。住宅休息和咖啡馆进食在门廊站位表达，没有伪造室内场景。
- 世界状态从后台读，选中居民仅存 URL 的 `?npc=aning`。点击、推进、刷新均保留选择；关闭档案保留选中标记。PixiJS 仅渲染，在状态改变时绘制，不用帧循环驱动业务。
- 快照包含 schemaVersion、revision、时钟、两名居民和最多 100 条事件。版本或位置不合法明确报错，不重新播种。日志窗口展示全部保留事件，不声称无限历史。

## 本地视觉参考与素材

本地依据是用户的 `my_ai_town-main.zip`，实查根目录 `my_ai_town-main/`，SHA256：`d90ad5b61058136ed5b0eac783df333d6dba2c3153b51db474a3b16fe8d3fa70`。ZIP 不含可验证 Git commit，本轮未拉取新版或运行 Godot。仅解压 README、五张说明图和六份定向源码到 `../references/my-ai-town-local/`；`ResidentCharacterBody.gd` 的少量片段直接从 ZIP 阅读。

| 本地参考 | 对本轮的影响 |
| --- | --- |
| `README.md`、`assets/readme/town-overview.jpg` | 斜俯视屋顶/立面/入口、低噪声连续道路、建筑比人物高约数倍；缩为一个街角，两名居民在默认镜头清楚可见 |
| `resident-conversation.jpg`、`world-log.jpg` | 浅纸、棕边、暖色强调；窗口按需展开。参考对白的视觉语言，未制作假聊天 |
| `game/ui/resident_action_menu/ResidentActionMenu.gd`、`resident_detail/ResidentDetailScreen.gd`、`town_log/TownLogTheme.gd` | 居民选择再查看档案、纸面状态条、事件记录。没有移植菜单体系或代码 |
| `ResidentCharacterPresentation.gd`、`ResidentCharacterBody.gd` | 居民独立于地图，位置来自世界状态，点击区域和选择标记对齐脚点 |
| `MapRuntimeLayerLoader.gd`、`MapRuntimeOcclusionLayer.gd` | 区分底图、独立角色与前景遮挡。本轮道路不穿遮挡物，静态场景层与人物层分离，无需搬入复杂遮挡系统 |

参考 README 明确自有代码/素材统一许可证尚未发布；检索到脚步音效的 Kenney CC0 许可，但本轮也未使用音效。**应用没有复制两个参考仓库的代码、截图、图块、角色、字体或音效。** `src/components/scene-art.ts` 是本轮从几何形状自行绘制的临时像素资源；窗口为原创 CSS，字体使用系统字体。没有外部素材授权阻塞。第三方软件许可见安装包：Next/React/PixiJS 为 MIT，pg 为 MIT；依赖各自许可证仍适用。

当前已做真实页面的基本布局与交互目视检查；参考作品的细节密度、精细纹理、角色动画与头像还未达到，**不宣称最终视觉验收完成**。晨露村概念图不作为覆盖本地参考的依据。

API 用法核对：[Next 16 Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)、[PixiJS 8 Application](https://pixijs.com/8.x/guides/components/application)、[Graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics)、[node-postgres 事务](https://node-postgres.com/features/transactions)。实际锁定 Next 16.4.0、React 19.3.0、PixiJS 8.22.0、pg 8.23.1；未依赖旧版同步 `Application` 构造方式。

## 第一阶段验证与证据（历史）

测试配置首次创建 `.env.test.local`，只写本项目测试地址：

```dotenv
DATABASE_URL=postgresql://town_local:town_local_only@127.0.0.1:55488/ai_town_mvp_test
WORLD_ID=browser-test
```

```powershell
docker compose up -d test-db --wait
npm run db:init:test
npm run typecheck
npm run lint
npm test
npm run test:db
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH=(Join-Path (Get-Location) '.browsers')
npx playwright install chromium
npm run test:e2e
```

浏览器脚本使用独立 `3101` 端口，自动启动生产服务、测试并重启该进程，结束时关闭测试服务。不要在此端口运行别的服务。测试不修改开发世界；不导入或扫描参考仓库。重新运行会覆盖同名截图/结果文件，数据库中原验证世界仍保留。

2026-10-09 本项目实际结果（不包含 SKYCity 测试）：

| 检查 | 结果 / 证据 |
| --- | --- |
| 类型检查、ESLint、生产构建 | 通过；`evidence/typecheck.log`、`lint.log`、`build.log` |
| 规则单元测试 | 9 项：状态/性格、合法性、动作效果、界限、道路、长期推进与坏存档；`evidence/unit-tests.log` |
| 真实 PostgreSQL | 5 项通过；`evidence/db-check.json`：只读不播种、并发控制、初始化保留、居民/事件保存、坏存档拒绝覆盖 |
| Chromium 页面/API/重启 | 8 组通过；`evidence/browser-check.json` 记录进程 PID、世界 ID、HTTP 读取和页面错误（0） |
| 后台进程重启恢复 | `before-restart.json` 与 `after-restart.json` 逐字段相等，版本 2、两人状态与 4 条事件；不是只验证种子或刷新 |
| 生产依赖审计 | 0 漏洞；`evidence/audit-production.json` |
| 密钥与参考素材检查 | `evidence/provenance.json`：自建源码未检出密钥模式、参考项目导入或 localStorage 世界存储；素材由绘图函数生成。SKYCity 已跟踪文件仍干净 |
| 全部依赖审计 | 5 high，位于开发用 ESLint → fast-glob → micromatch → braces 链；`evidence/audit-all.json`。上游建议强制降级 ESLint 配置，本轮未做不兼容降级；这是未消除的开发依赖风险 |
| 真实 AI、线上数据库恢复、公开部署 | 未实现 / 未验证，本轮未调用任何模型 |

真实运行截图：[默认场景](evidence/01-scene.png)、[选中阿宁的档案](evidence/02-profile.png)、[推进后位置与事件](evidence/03-advanced.png)。

首次依赖安装的开发依赖请求出现 `ECONNRESET`，重试同一安装命令成功；首次浏览器测试误拒绝本机请求，原失败日志保留在 `evidence/browser-first-failure.log`。原因是 Next 内部 request.url 主机名与浏览器 `127.0.0.1` 不同；改为比较 Origin 与 HTTP Host 后，正常请求及跨站拒绝均复测通过。这是本轮真实的 AI 生成实现→验证发现问题→修改案例，**不是对候选人本人决策的代写证明**。

人工演示：打开页面 → 分别点击两人 → 点一步，阿晴因饥饿去咖啡馆、阿宁读书 → 再点一步，阿晴进食 → 打开日志 → 刷新 → 停止 Next 并用同一配置启动，核对时间、状态与事件。行为由当前存档决定；已有存档不保证仍从清晨开始，不要为演示删除数据。

## 第一阶段变更（历史）

改动：新增独立 `web/` 应用、项目 Compose/环境示例、测试与证据；增量更新 `../docs/spec.md`、`../AGENTS.md`；在独立参考目录解压指定阅读材料。原作业、两个 ZIP、SKYCity 源码及既有评估证据未修改。工作区根目录没有 Git 仓库，未初始化覆盖式根项目。

该轮停止于手动最小世界闭环。第二阶段的实现与剩余验收如下；首轮证据保留，不以新结果覆盖旧记录。

## 第二阶段：NPC 对话与降级（历史；当前交互见 V2.1）

入口：选中地图居民 → 档案底部“与阿晴/阿宁对话” → 输入并发送。可连续聊天，Enter 发送、Shift+Enter 换行；原生模态窗口阻止键鼠穿透地图。关闭后保留场景与选中对象。逐条显示 `AI 回复` 或 `降级回复 + 简短原因`，没有全局“AI 已连接”的虚假提示。

**调用链：**`ChatDialog.tsx` → `POST /api/npcs/[npcId]/chat` → `chat-service.ts::chat` 读取真实世界和当前 NPC → `chat-context.ts::buildMessages` → `chat-model.ts::modelReply` / `fallbackReply` → 单条 SQL 保存 `town_chats` → 返回已保存消息 → React 文本气泡。`GET` 同一路径读取该 NPC 的保留历史。

请求：`{ "message": "你现在在干什么？" }`，文本长度 1–500 字符（按 JavaScript 字符串计数）。返回示例字段：`id, message, reply, source: "ai" | "fallback", reason?, worldRevision, minute, createdAt`。空白、非文本、超长或坏 JSON 返回 400，不存在居民返回 404；同世界同 NPC 正在回复时返回 409，避免多窗口覆盖历史。数据库不可用返回 503，不冒充已保存对话。

### 模型配置

在本项目 `.env.local` 中自行填写以下配置，不把真实密钥写入 README、Git 或聊天消息。重启 Next 后生效：

```dotenv
AI_ENABLED=false
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
AI_TIMEOUT_MS=8000
```

- `AI_API_KEY`：供应商密钥，只在服务端使用。
- `AI_BASE_URL`：供应商 API 前缀，例如供应商要求的 `https://<供应商主机>/v1`，程序追加 `/chat/completions`。没有硬编码默认供应商。远程地址要求 HTTPS，不接受含账号密码、查询串或重定向的地址；本机测试允许 HTTP loopback。
- `AI_MODEL`：该供应商实际支持的模型标识。
- `AI_ENABLED`：只有确认允许调用与费用后设置 `true`。缺任一必要配置仍直接降级；V2.1 已将用户提供的配置移入 `.env.local`，未启用调用。
- `AI_TIMEOUT_MS`：默认 8000，限制 100–10000 毫秒，覆盖响应体读取，不自动重试。客户端整体请求超时 25 秒。

采用服务端原生 `fetch`，没有新增依赖。请求含 `messages / model / stream:false / max_completion_tokens:400`，正文只接受非空文本并最多显示 800 字符；不传工具、不解析动作。兼容协议依据 [OpenAI Chat Completions 官方文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。各兼容供应商对参数支持不完全一致，若不支持会标为服务错误并降级，仍需用所选服务真实验收。

### 降级与世界边界

缺配置、未启用、无效配置、网络断连、超时、HTTP 401/429/5xx、坏 JSON、空回复或工具调用结果均使用本地回复。回复按问候、当前行动/地点、饥饿、精力、心情、爱好与有限历史等主题组织：阿晴热情好社交，阿宁温和偏阅读。未知问题明确不知道；“加满精力/传送”等要求不会被描述为已执行。有限规则不是通用聊天模型。

模型只接收当前 NPC 的必要事实、本人最近 3 条世界事件、最近 4 轮对话与本条消息。`town_chats` 使用 `(world_id, npc_id)` 主键，每人保留 20 轮问答。没有跨 NPC 记忆、RAG 或向量检索。这里仍是本地单世界，与首轮一致，未加入多玩家账号隔离。

模型等待期间不打开长事务，只对该世界的该 NPC 持有 PostgreSQL 会话锁；其他居民与世界推进可继续。对话保存绝不写 `town_worlds`；每条回复注明发送时的游戏时间和世界版本。模型的未来计划不会执行，提示约束也不能保证模型每句话事实正确；生成内容按纯文本展示。

只记录 `source / reason / elapsedMs / status`，不记录密钥、供应商错误正文、请求 URL、聊天正文或完整堆栈。网络返回丢失时界面重读记录，不自动重发可能已保存的消息；历史读取失败需先重读后再发送。

### 第二阶段验证

```powershell
npm run db:init
npm run db:init:test
npm run typecheck
npm run lint
npm test
npm run build
npm run test:chat
```

`test:chat` 使用原独立测试库 `55488/ai_town_mvp_test`、新随机世界 ID、临时 Next 端口 `3102` 及本机随机端口 HTTP 模型替身。测试显式覆盖 AI 环境变量，不使用 `.env.local` 的模型配置，不访问付费服务。替身设置仅供测试的 `AI_TEST_MODE=true`（仅允许 loopback），页面会额外显示“本地测试替身”。无需设置到日常 `.env.local`。

本轮结果记录于 [evidence/chat-stage](evidence/chat-stage/)：类型检查、lint、构建通过；33 项单元测试通过（24 项对话相关＋原有 9 项规则）；数据库/API/浏览器覆盖无密钥回复、不同人设、当前状态、输入校验、NPC 上下文隔离、并发保护、历史上限、请求故障、后台重启恢复与世界不变。精确组数、超时耗时和进程 PID 见 [result.json](evidence/chat-stage/result.json)。模型 HTTP 超时阈值为测试用 500 毫秒，界面约一秒内结束等待；默认 8 秒不是此次耗时。

最终 8 组集成验证通过，超时 UI 实测 857 毫秒。新增的历史故障探针首次误点被档案窗口遮挡的地图人物，随后改为使用已经打开的档案对话入口并通过复测；保留 `history-probe-first-failure.log` 和 `failure.png`，不是模型或存储故障。实际文件哈希对比、客户端产物密钥检查及世界不变检查见 [changes-and-safety.json](evidence/chat-stage/changes-and-safety.json)。首轮已有的开发用 ESLint 依赖风险未在本轮升级处理；没有安装新依赖。

真实页面截图：[对话窗口](evidence/chat-stage/01-chat-window.png)、[无密钥正常降级回复](evidence/chat-stage/02-fallback-no-key.png)、[模型适配器成功分支（本地替身）](evidence/chat-stage/03-adapter-success-local-stub.png)、[模型服务异常降级](evidence/chat-stage/04-fallback-service-error.png)。这些截图来自实际运行页面，成功分支截图**不代表真实模型调用已验证**。

### 本轮修改与停止点

- 新增：`src/lib/chat-types.ts`、`chat-context.ts`、`chat-model.ts`、`chat-service.ts`；`src/app/api/npcs/[npcId]/chat/route.ts`；`src/components/ChatDialog.tsx`；`tests/chat.test.ts`；`scripts/chat-check.mjs`；`evidence/chat-stage/`。
- 修改：`src/components/Town.tsx` 加档案对话入口；`src/app/globals.css` 加窗口样式；`scripts/init-db.ts` 只追加建表；`package.json` 加测试命令；`.env.example`、本 README、根 `AGENTS.md`、`docs/spec.md` 更新本轮约定。
- 世界引擎、种子、`store.ts` 与绘图素材未改；未改参考仓库和既有评估证据。对话窗口继续使用自有 CSS、系统字体及现有文字头像，没有复制参考素材，也没有安装新依赖。

**尚未完成的验收：真实模型端到端调用。**需要本项目的 `AI_API_KEY / AI_BASE_URL / AI_MODEL`，并明确允许一次实际调用后再执行。数据库与浏览器没有环境阻塞。后续玩家干预、自动运行、完整美术、部署与交付材料均未自动开始。


## V2.1：场景内对话（阶段记录，V3 保留）

打开页面 → 点击阿晴或阿宁 → 场景下沿直接输入。Enter 发送、Shift+Enter 换行；等待中禁止重复发送。后端已保存的回复显示在对应角色头顶，不再打开居中聊天 Modal，也没有聊天遮罩。回复持续到下一条、切换对象或关闭；重开从 GET 历史恢复。可点“居民档案”或“查看历史”，两者均按需显示；日志仍沿用原窗口。

- 角色复用 `scene-art.ts::drawResident` 的自有像素图形，放大 1.2 倍；脚点仍是后台 `npc.position`，没有虚构移动。
- 坐标链：`npc.position` → `scene-view.ts::sceneTransform`（画布适配 × 镜头缩放＋平移）→ 同一 `world-plane` 上的 Pixi 地图/角色与 HTML 点击区；`bubblePlacement` 用同一变换计算头顶位置，在独立屏幕层显示固定字号的气泡。ResizeObserver 响应窗口尺寸；边缘横向夹紧但尾巴仍指向角色，顶部空间不足缩短可滚动区域。角色离屏或头部附近不足以安全显示时隐藏气泡，可复位或查看历史，无漂浮残影。
- 100%–200% 缩放，拖动空白处平移，“复位”回到全景。镜头仅影响呈现，不推进世界。长回复预览限三行，“展开全文与历史”打开小型滚动面板；不删改原文本。每次只展示当前居民的一条回复。
- 消息链：`Town` 选中居民 → `ChatDialog.tsx` 中的 `SceneChat` 输入区 → 原 `POST /api/npcs/[npcId]/chat` → 原决策外的对话服务/模型适配与降级/数据库保存 → 返回 `ChatTurn` → `Town` 按 NPC ID 绑定 → `TownScene` 头顶气泡。文件名为保留旧链接暂未改名。GET/POST 协议、20 轮历史结构、后端和世界推进均未修改。
- 本地参考仍是原 ZIP 版本。定向查看 `assets/readme/resident-conversation.jpg`，以及 `TownConversationBubblePlayback.gd::visible_items` 和 `TownFarResidentActivityLayer.gd::_provider_head_anchor / _head_screen_anchor`：只显示确认的发言、绑定角色头部、离开可视区域隐藏；没有复制实现或字体。新界面仍为自行编写的 CSS 与系统字体，没有新增依赖/素材。

本轮用户告知真实密钥在 `.env.example`。已将 AI 配置移入忽略提交的 `.env.local`，示例恢复为空占位符；保留 `AI_ENABLED=false`。未在日志、截图或报告中打印密钥。**真实外部模型仍未验证**；下述测试显式清空模型配置或仅用本机 HTTP 替身。

实际执行（`web/`）：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:chat
npm run test:scene-chat
npm start
```

本轮证据独立存放于 [evidence/scene-chat](evidence/scene-chat/)；测试仍使用 `ai_town_mvp_test` 与随机新世界，不删除旧数据。世界回归端口 3101，对话回归 3102，场景专项 3103；演示端口 3100。`test:e2e / test:chat` 默认已改用该目录下独立子目录，也可用 `EVIDENCE_DIR` 指定新证据位置，避免覆盖前两阶段的历史证据。

| 检查 | 实际结果 |
| --- | --- |
| 类型检查 / lint / 构建 | 通过；对应 `.log` 文件 |
| 单元测试 | 37 项通过：原有 33 项＋4 项坐标/边界测试 |
| 世界 HTTP / 页面 / 后台重启 | 原有 8 组通过，见 `world-regression/browser-check.json` |
| 对话 API / 浏览器 / 故障与重启 | 9 组通过，原有 8 组＋长回复全文验证；本地超时替身实测 871 ms，见 `chat-regression/result.json` |
| 场景交互 | 7 组通过：直接输入、来源与真实回复、镜头对齐、边界/离屏、历史/切换/重开、推进/刷新、迟到回复隔离及窄屏；见 `result.json` |
| 后端边界与密钥 | 文件哈希对比及静态产物检查见 `changes-and-safety.json`；后端/世界/数据库结构未改 |

验证中发现两处测试同步问题并修正：世界脚本的通用 status 选择器与缩放读数冲突，改为限定世界状态；窄屏检查曾早于 ResizeObserver 更新，改为等待实际镜头尺寸映射。对应初次失败日志保留。目视检查后将窄屏镜头按钮移至左下角，避免气泡遮住操作。

实际运行截图：[默认场景](evidence/scene-chat/01-default.png)、[选中及输入区](evidence/scene-chat/02-selected.png)、[头顶后台 Fallback 回复](evidence/scene-chat/03-reply.png)、[125% 缩放及平移](evidence/scene-chat/04-camera.png)、[窄屏](evidence/scene-chat/05-mobile.png)。这些是浏览器页面截图，不是设计图；对话回归中的 AI 成功分支是明确标注的本地替身。

改动范围：`Town.tsx`、`TownScene.tsx`、`ChatDialog.tsx`、`scene-art.ts`、`globals.css`；新增 `scene-view.ts` 与坐标测试、场景浏览器脚本；适配两份已有浏览器回归脚本、添加 npm 测试入口；增量更新 README/spec/AGENTS 和环境示例。完整逐文件清单见 `changes-and-safety.json`。未修改参考项目、原评估和旧证据。

停止于场景内玩家对话。仍没有 NPC-NPC 对话、自动运行、玩家干预、通用记忆或完整美术重做；边缘避让采用当前单气泡方案，不提供多气泡碰撞引擎。窄屏可以缩放查看人物，当前资源仍为临时自绘美术，未宣称最终视觉验收。


## 真实模型启用验收（2026-10-09，V2.1 之后）

用户明确授权“真实模型调用打开”后，将本项目 `.env.local` 的 `AI_ENABLED` 改为 `true` 并重启服务。首次调用因模型标识 `openai:qwen-plus` 收到 HTTP 404 并正确降级；参照供应商文档将配置修正为 `qwen-plus`，没有修改适配器或后台业务代码，也没有输出密钥。

随后在真实浏览器中向阿宁发送一条消息，经过现有 POST API 与外部服务返回 `source=ai`、`testMode=false`，页面显示“AI 回复”；整次浏览器操作实测约 1.16 秒。已核对对话持久化成功、调用前后世界状态一致。[脱敏结果](evidence/real-ai/enabled-result.json)、[运行截图](evidence/real-ai/enabled-browser.png)。这项结果更新此前“未验证”的状态，不改写历史轮次证据；只证明此次所配置服务成功，不表示所有模型或故障场景均已重新验证。

启动仍为 `npm start`（或开发用 `npm run dev`）；若需关闭真实调用，将本项目 `.env.local` 中 `AI_ENABLED=false` 后重启。环境示例保持空密钥；未新增依赖或业务代码，未因配置切换重复构建或执行全套单测。


## V3：自动运行与送食物（当前版本）

启动仍在 `web/` 使用 `npm run dev`，或 `npm run build` 后 `npm start`，打开 http://127.0.0.1:3100 。本轮未新增依赖、环境变量、数据表或数据库迁移；已有快照继续使用，缺少 `run` 字段视为暂停，**不重置演示世界**。真实模型配置继续保留，自动运行与食物操作不调用模型。

操作：选择阿晴/阿宁 → 操作条显示当前地点与真实饥饿 → “送食物”降低饥饿最多 35 → 查看前后数值、事件或档案 → 手动推进观察下一步。已完全饱足时拒绝送食物；不增加金币、背包、邀请或经济规则。顶部“开始自动运行”后固定每 5 秒推进 10 游戏分钟，可随时暂停，也可手动推进。打开的草稿、历史、选中和气泡保留，气泡仍注明回复时的状态。

### API 与事务链路

| 接口 | 输入及行为 |
| --- | --- |
| `POST /api/world/interventions` | `{action:"feed", npcId:"aqing", expectedRevision:当前版本}`；校验居民、动作、版本和饥饿；饥饿减35并裁剪至0，版本+1、追加事件，游戏时间不变 |
| `POST /api/world/run` | `{running:true或false, expectedRevision:当前版本}`；开始使用版本校验，设置到期时间为数据库当前时间+5000ms；暂停始终作用于最新锁定世界并递增版本，即使其他标签刚推进也能暂停；延迟旧启动因版本过期被拒绝 |
| `POST /api/world/wake` | 浏览器唤醒；暂停或未到期直接返回已有世界，到期最多调用一次原推进函数；重排到期时间为当前数据库时间+5000ms |
| `POST /api/world/tick` | 原手动推进；仍校验版本，运行中手动推进也重排下一次自动到期，避免紧接着自动再走一步 |

所有修改都进入 `store.ts::updateWorld`：`BEGIN` → `SELECT ... FOR UPDATE` 锁同一世界行 → 锁后读取 `clock_timestamp()` → 校验并计算 → 校验快照 → 同次 `UPDATE` 保存版本、NPC、运行时钟及事件 → `COMMIT` → 返回前端。自动与手动都使用 `world.ts::advanceWorld` 的原决策/执行规则；没有第二套模拟、常驻 interval、队列或模型决策。原 `decide / execute` 未改变。

玩家干预链：`Town.tsx::feed` → interventions API → `feedWorld` → 同一事务中的 `giveFood` → 保存并返回世界 → 当前饥饿、档案和日志更新。版本冲突返回409并重读；未知居民404、非法请求400、存储失败503、跨站修改403。客户端锁与禁用按钮处理正常重复点击；消息丢失时仅重读存档，不自动重发可能已保存的食物操作。事件显示真实前后数值；食物不立即修改当前地点或行动。

前端自动循环每次请求完成后等待1秒，运行时 POST wake，暂停时 GET world 同步其他标签的开关和状态。它不使用渲染帧、不直接更新需求。前端按单调版本接受快照，防止晚到的旧读取覆盖已保存结果。**版本号现在包含干预/开关操作，不等于世界推进次数；时钟只随推进增加。**

### 运行限制

- 这是网页打开期间的自动演示模式。全部页面关闭时无后台进程持续模拟，运行开关仍保存在数据库。刷新/重启后按保存的开关继续；过期再久，一次唤醒也最多推进一步，随后从当前时刻重新计时。
- 浏览器后台节流、网络延迟可能让实际间隔超过5秒；多标签不会缩短后台最小间隔。成功暂停的事务提交后，旧唤醒只能读取暂停状态；暂停请求失败会明确显示错误及最后确认的状态。
- 当前是原有单世界，无账号隔离；任一页面的开始/暂停影响这个世界。不是公开多人生产服务。
- 可以连续主动送食物直到饥饿为0；不做消耗品或冷却。基本需求或精力不同，送食物后的行动可能仍以休息为先，不能保证每次都会社交。

### 验证与截图

所有测试使用本项目 `55488/ai_town_mvp_test` 和随机世界ID，保留旧数据与证据。V3 浏览器端口3104，模型只配置本机随机端口替身与假密钥；测试不会加载本地真实模型配置。首次初始化方法不变，已有数据库无需本轮迁移。

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:v3:db
npm run test:v3
$env:EVIDENCE_DIR='evidence/v3/db-regression'
npm run test:db
$env:EVIDENCE_DIR='evidence/v3/world-regression'
npm run test:e2e
$env:EVIDENCE_DIR='evidence/v3/chat-regression'
npm run test:chat
$env:EVIDENCE_DIR='evidence/v3/scene-regression-final'
npm run test:scene-chat
```

实际结果（2026-10-09）：类型、lint、构建通过；44 项单元测试通过；新增 PostgreSQL 6 组、V3 浏览器/API/重启 8 组通过。原数据库5项、世界8组、对话9组、场景7组回归通过。新证据全部在 [evidence/v3](evidence/v3/)；完整命令输出保留在对应日志。

控制变量证据：同样的阿晴初始饥饿59、精力78、广场有同伴；对照下一步饥饿67去咖啡馆，送食物后饥饿24，下一步饥饿32并留在广场社交。单元测试及真实数据库都验证了这个差异，见 [db-result.json](evidence/v3/db-result.json)。并发8次到期唤醒只推进一次；送食物与推进结果符合串行执行，没有覆盖；手动与自动竞态不会在同一到期连续推进两次。

[browser-result.json](evidence/v3/browser-result.json) 记录双标签实际运行、另一标签暂停后等待超过一周期、运行中干预、草稿与历史保留、断网/提交丢响应、聊天来源与降级、刷新及后台重启。`before-restart.json / after-restart.json` 的运行中世界完全一致，随后重新打开仅补一步。计数证明自动运行与干预共0次模型调用；只有2条主动测试聊天访问本地替身，0次外部调用。本轮没有重复付费模型验收，上一轮真实成功记录仍保留。

实际页面截图：[送食物前](evidence/v3/01-before-food.png)、[送食物后](evidence/v3/02-after-food.png)、[自动运行与保留的草稿/历史](evidence/v3/03-auto-running.png)、[暂停超过一周期](evidence/v3/04-paused.png)。首次检查发现历史面板挡住送食物按钮，通过共同定位操作区修正；初次失败见 `browser-check.log / failure.png`，修复后的结果见 `browser-check-final.log`。

改动：`world.ts` 增加食物/运行时钟辅助函数，`store.ts` 共用事务；新增 interventions/run/wake 三个 API；`Town.tsx / globals.css` 加开关、轮询与干预条；新增 `world-controls.test.ts`、`v3-db-check.ts`、`v3-browser-check.mjs`；更新 npm 脚本，给原数据库和场景回归增加证据目录参数；增量更新 AGENTS/spec/README。完整哈希变更清单见 [changes-and-safety.json](evidence/v3/changes-and-safety.json)。未改模型适配、降级、聊天服务与消息结构，未增加依赖/素材、修改参考仓库或旧评估证据。

本轮到此停止：没有 NPC-NPC 模型对话、其他玩家干预、地图重构、室内或经济系统，也没有部署。

### V4.1 街区场景升级（2026-10-09）

运行入口仍为本目录 `npm run dev` 或 `npm run build` 后 `npm start`，http://127.0.0.1:3100。数据库与 AI 配置方式不变，未新增依赖或迁移。当前在原 PixiJS 8.22 上升级，React/HTML 继续负责可访问的点击入口、纸张窗口与聊天 UI。

画面现在使用三张本项目 imagegen 生成的透明 PNG 图集：住宅/咖啡馆/树木、两名居民前后朝向、喷泉/长椅/花坛/路灯；程序自绘草地、道路、石板与围栏。素材及许可边界、精确提示词见 [ASSETS.md](public/art/v4-1/ASSETS.md)，没有复制 my_ai_town 的未获授权资源。参考影响：可读屋顶和立面、草地围合的公共广场、前景植物、独立居民、头顶气泡及棕边纸张窗口。没有重新制作后台或引入其他引擎。

渲染链路：已提交 `World.npcs[].position` → 持久 Pixi 居民容器的脚点及 `zIndex` → 同一镜头矩阵映射 canvas、HTML 点击目标与气泡。`scale = min(视口宽/960, 视口高/430) × zoom`，镜头默认聚焦街区 y=275；角色高66世界单位，气泡锚点高72。对象按地面接触点排序，住宅/咖啡馆在门前站位后方。移动后的朝向取真实 `lastPath` 最后一个路段；直接呈现后台保存的到达位置，没有随机巡游、插值或伪造寻路。100%指当前视口的基础适配比例。

地图只在挂载时构建。每次 HTTP 轮询保留场景对象，仅位置/朝向/选中变化才重绘，状态更新不会重置镜头或聊天组件。紧凑的顶部控制和底部输入区让场景在1366×768与1440×900都保持可见；小屏档案内部可滚动。消息仍由原 API 保存后显示，本轮未改模型/降级规则。

本轮检查（证据在 [evidence/v4-1](evidence/v4-1/)）：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:EVIDENCE_DIR='evidence/v4-1/db-regression'; npm run test:db
$env:EVIDENCE_DIR='evidence/v4-1/v3-db-regression'; npm run test:v3:db
$env:EVIDENCE_DIR='evidence/v4-1/world-regression'; npm run test:e2e
$env:EVIDENCE_DIR='evidence/v4-1/chat-regression'; npm run test:chat
$env:EVIDENCE_DIR='evidence/v4-1/scene-regression'; npm run test:scene-chat
$env:EVIDENCE_DIR='evidence/v4-1/v3-regression'; npm run test:v3
$env:EVIDENCE_DIR='evidence/v4-1/scene-final'; npm run test:v4
```

实际通过：44项单元测试；原数据库5项、V3数据库6组；世界8组、聊天9组、原场景7组、V3浏览器/API/重启8组；新场景4组含10张真实页面截图。新检查覆盖暂停轮询不重绘、两个居民点击/档案、HTTP Fallback、镜头与气泡、食物59→24、两个自动周期、草稿保留、刷新恢复及两种分辨率。V3回归继续验证多标签不加速、干预/推进无覆盖和重启恢复。聊天回归验证本机替身成功、模型错误和超时降级；本轮0次外部付费模型调用，没有把替身当作真实服务成功。既有真实调用证据仍保留在 `evidence/real-ai/`，当前服务配置未改。

最初新场景测试错误地把 Pixi 本机 `blob:` URL 记作外部网络；调整为只检查 HTTP(S) origin 后通过。初次截图也发现低高度窗口裁屋顶，增加镜头高度适配后重新验证。最初日志/截图与最终 `scene-final` 分开保存。

实际截图：[默认1440](evidence/v4-1/scene-final/01-default-1440.png)、[选中与档案](evidence/v4-1/scene-final/02-profile-1440.png)、[场景气泡](evidence/v4-1/scene-final/04-bubble-1440.png)、[缩放平移](evidence/v4-1/scene-final/05-camera-1440.png)、[自动运行](evidence/v4-1/scene-final/06-auto-1440.png)、[两名居民行动](evidence/v4-1/scene-final/07-two-residents-1440.png)、[1366气泡](evidence/v4-1/scene-final/08-bubble-1366.png)、[1366档案](evidence/v4-1/scene-final/09-profile-1366.png)、[默认1366](evidence/v4-1/scene-final/10-default-1366.png)。截图来自隔离测试世界的真实生产构建，非设计图。

修改文件：`src/components/scene-art.ts`、`TownScene.tsx`、`src/lib/scene-view.ts`、`src/app/globals.css`、`tests/scene-view.test.ts`；新增 `public/art/v4-1/*`、`scripts/v4-scene-check.mjs`；两个V3脚本仅增加独立证据目录配置；新增 npm `test:v4`；AGENTS/spec/本说明增量更新。哈希比对见 `evidence/v4-1/changes-and-safety.json`，世界规则、存储、聊天 API/适配器与会话组件未修改。

距离参考的完整小镇仍有差距：当前仅一个对称街区，地表和围栏仍偏简化，生成图集的逻辑像素颗粒尚非严格统一；没有四向行走动画、连续寻路播放或完整地图。继续扩图需要正式统一地块/边缘素材、更多建筑变体、逐地点审查可行走范围/入口/遮挡，再做镜头与长时间运行验证。本轮已停止，不进入V4.2，不增加功能。

原3100服务已在最终构建后重启；`live-restart-result.json` 验证原存档版本41在重启前后完全一致，仍为暂停状态。测试期间没有重置原世界；原AI配置保留，最终服务没有发起新的模型请求。

### V4.2 像素统一与真实路径行走（2026-10-09）

本轮先打开原3100页面，观察真实存档和已有气泡，再对照本地 my_ai_town 的 Town Overview / resident-conversation。最明显的三个问题是：地表和围栏精细度与建筑不一致；素材缩放后的像素颗粒与阴影不统一；居民换地点直接跳到终点。改动集中解决这些问题，没有修改后台、增大地图或增加玩法。

目前使用480×300逻辑画布展示原960×600世界，基础像素为2世界单位；住宅高216、居民高64，位置/尺寸对齐2单位网格。贴图nearest、关闭抗锯齿，桌面镜头按整数屏幕像素倍率缩放并显示实际百分比，Canvas直接设置屏幕宽高以避免父级合成插值。小于600px的视口保留适配例外。地面改为低对比草簇、连续砂土路、碎边石板与草路交界；围栏增加木梁/帽檐，建筑和人物补齐朝右下方的接地阴影。仍使用原PixiJS，并按脚点排序遮挡。API使用核对了安装版本和 [Pixi纹理文档](https://pixijs.com/8.x/guides/components/textures)。

两张新增图集来自内置imagegen，以本项目V4.1角色为身份参考；每人4方向×3姿态。没有使用my_ai_town素材。尺寸、帧坐标、提示词与使用边界见 [V4.2 ASSETS](public/art/v4-2/ASSETS.md) 和 `src/components/resident-frames.json`。旧图集保留原样。输出栅格统一并不代表源图已逐像素重绘：采样会舍弃细节，生成帧之间仍有细微形变，南北步态变化较小；与参考相比，仍缺少精心手修的角色动画和更自然的地表块面。

行走链路：原HTTP世界更新 → `Town`接受已保存版本 → `TownScene.sync` → `scene-motion.acceptPosition`核对真实`lastPath`起终点及道路走向 → `poseAt`按时间采样 → 同一个表现位置驱动Pixi角色/阴影/深度、HTML命中与气泡。换帧为0→1→0→2，每140ms一帧；只有移动期间有rAF，待机不持续重绘。原世界对象、需求值、决策和存档均不被动画修改；档案地点是已提交的目的地，角色最多用3秒展示这次到达过程。

边界处理：

- 首次加载/刷新直接站在存档终点，不重放旧路径；后台标签休眠按经过时间结束，不卡着补播。
- 相同终点的轮询、干预、暂停和选择不会重启行走；暂停停止未来世界推进，已提交动作正常收尾。
- 新移动提前到达时，只衔接剩余旧路段与新提交路段，重新限制为最多3秒；超过16路径点或缺失/不连续路径直接同步最新终点，没有无界队列或假寻路。
- 镜头和角色播放互不重置；气泡上沿避让镜头工具。空白处拖动阻止原生文字选择，气泡文本仍可选择复制。

实际验证（隔离测试库、独立端口、唯一测试世界，不清理旧数据）：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
$env:EVIDENCE_DIR='evidence/v4-2/checks'; npm run test:db; npm run test:v3:db
$env:EVIDENCE_DIR='evidence/v4-2/world-regression'; npm run test:e2e
$env:EVIDENCE_DIR='evidence/v4-2/final-chat'; npm run test:chat
$env:EVIDENCE_DIR='evidence/v4-2/accepted-scene-regression'; npm run test:scene-chat
$env:EVIDENCE_DIR='evidence/v4-2/verified-v41'; npm run test:v4
$env:EVIDENCE_DIR='evidence/v4-2/final-v3'; npm run test:v3
$env:EVIDENCE_DIR='evidence/v4-2/accepted'; npm run test:v42
```

类型、lint、生产构建通过；53项单元测试（原44+路径7+镜头2）；数据库5项、V3数据库6组；世界8组、聊天9组、场景7组、V4.1场景4组、V3浏览器/并发/重启8组；新增V4.2浏览器6组通过。新的实际轨迹、截图列表见 [accepted/result.json](evidence/v4-2/accepted/result.json)。新增验证真实自动路径、转向/步态/终点、移动中缩放/平移、暂停收尾、连续手动更新、移动中刷新、送食物与聊天历史、两种桌面分辨率。测试对话均禁用外部服务或用本机替身；本轮没有新增真实模型调用，历史真实调用证据及原配置保留。

修复过程也保留：首轮动画通过；桌面整数倍率调整后发现气泡遮挡“复位”，增加上沿保留区；Canvas独立布局后发现拖动选中文字，阻止地图默认选择并重测。连续推进测试最初把第6步误认为回家，按实际规则读到第7步才触发，修正测试预期，未修改规则。相关失败日志位于 `motion-final.log / motion-pixel-final.log / verified-motion.log / verified-scene-regression.log`，最终通过目录为 `accepted` 与 `accepted-scene-regression`。

实际截图：[完整街区](evidence/v4-2/accepted/01-neighborhood.png)、[两名居民](evidence/v4-2/accepted/02-residents.png)、[居民详情](evidence/v4-2/accepted/03-profile.png)、[气泡](evidence/v4-2/accepted/04-speech.png)、[行走开始](evidence/v4-2/accepted/05-walk-start.png)、[途中](evidence/v4-2/accepted/06-walk-middle.png)、[到达/转向与缩放](evidence/v4-2/accepted/07-walk-end-camera.png)、[1366气泡](evidence/v4-2/accepted/08-speech-1366.png)、[1366档案](evidence/v4-2/accepted/09-profile-1366.png)、[1366街区](evidence/v4-2/accepted/10-neighborhood-1366.png)。

[22.52秒实际录屏](evidence/v4-2/accepted/automatic-walking.webm)：1440×900、25fps，包含真实HTTP Fallback、自动推进、行走、暂停、镜头与连续手动推进。视频来自隔离世界的真实运行，不是概念图或预制动画。

改动：`TownScene.tsx`、`scene-art.ts`、`scene-view.ts`、`globals.css`；新增 `scene-motion.ts`、`scene-ground.ts`、`resident-frames.json`、`scene-motion.test.ts`、`v42-motion-check.mjs`、`public/art/v4-2/*`；补充 `scene-view.test.ts`、npm `test:v42`，增量更新AGENTS/spec/本说明。完整哈希清单见 `evidence/v4-2/changes-and-safety.json`。原3100服务已重启并保留配置，世界版本44前后完全一致且暂停，证据在 `live-restart-result.json`。没有后台/存档协议变更、新依赖、模型功能、扩图、部署或下一阶段工作；本轮停止。


## V7.2：暖灯小屋与共享门户（2026-10-09）

在原项目运行：`cd web` → `npm run dev`；已有生产构建可用 `npm run start`（127.0.0.1:3100）。数据库和环境变量不变，不执行初始化或重置已有世界。

玩家点击地面聚焦，用 WASD/方向键走到左侧暖灯小屋门口，看到提示后按 E 进入；室内下方门口按 E 返回。右侧咖啡馆原有入口仍可用。住宅有两张床、书桌、衣柜、壁炉、墙窗与碰撞，NPC和玩家均不能穿家具；玩家位置仍只保存在当前标签页 sessionStorage。

两名居民共用既有住宅，各有床边站位。低精力仍触发回家需求：走到室外门口 → 下一步进入 → 沿保存的室内路径走到床边 → 再下一步休息（精力+40，世界自然消耗仍是每步−6）。床边精力不足65且饥饿低于85时继续恢复，随后重新按需求/性格决策，先走到出口再返回室外。没有固定进出时间表，没有躺床动画；以真实休息行动和面向床的待机表达。

`src/lib/scene-data.ts` 是不依赖 Pixi/DOM 的共享定义：`PORTALS` 描述来源、目标、反向门户、交互半径、玩家/NPC出生点，`BUILDINGS` 将业务地点与建筑实际场景关联，`HOME_REST/homePath` 只描述两条合法床边路线。`world.ts` 复用进入/离开校验与执行；`player-scene.ts` 复用同一门户；`scene-motion.ts` 仅表现后台保存的同场景路径，跨场景直接在合法出生点显示，不在不同坐标系间插值。

仍使用 schemaVersion 2 JSON，不改表、不迁移聊天数据。读取v1时仅补town；旧v2住宅门廊坐标原样保留室外，下次需要回家先补走到新门口。新增可选 `facing` 和 `home_interior`，旧代码不能读取新住宅室内存档，回退代码时必须使用匹配的备份，不能直接将新存档交给V7.1读取。恢复基线提交：`2a0d7a98804efa3624b5d0fa098a5a33204775e0`。

验证：`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`；新 `npm run test:v72` 使用3114端口和55488专用测试库/随机世界ID，明确禁用AI；`npm run test:v72:db` 做真实库兼容/并发验证。仅在无人运行其他测试时，可用 `npm run test:v72:db -- --restart-test-postgres`，它先验证固定测试容器、55488映射与town_test卷，再重启该测试PostgreSQL；不重启55487开发库、不删卷。脚本不适用于生产库。

本轮85单元测试、生产构建及浏览器回归通过；实际数据库重启、后端重启、两种桌面分辨率、私聊隔离和模型替身故障回归见 [V7.2 验证记录](../docs/v7-2-validation.md)。真实外部模型本轮未调用。家具为本轮原创生成图集，帧与使用限制见 [资产说明](public/art/v7-2/ASSETS.md)。未复制本地参考项目资源。

新增第三栋建筑需要补对应场景/美术/碰撞、成对门户及安全出生点，再将目的地与已有或新授权的需求动作关联，增加室内活动点/路线和存档校验测试。玩家进出、NPC进入/离开、事务和角色渲染循环可直接复用；当前没有任意家具自动寻路或通用场景插件系统。


## V8.1：榴木街与可扩展室外地图（2026-10-10）

原街角坐标全部保留，室外画布扩展为1760×800。沿咖啡馆前道路向东可到**石榴杂货铺**；在东侧路口向南，再沿横路向东可到**青篱小居**。WASD/方向键移动，门前按E进出；两栋建筑各自拥有独立室内，不是同一房间换名。店铺仅探索，没有购买按钮。

启动仍为 `cd web` → `npm run dev`，或 `npm run build` 后 `npm run start`。已打开旧生产页面在服务更新后需要刷新一次；玩家标签页位置与后台世界存档保持。大地图默认看旧街角，实际移动接近屏幕边缘才自动跟随；可拖动、缩放、查看全景，复位回到玩家附近。进入室内恢复独立镜头，室内不自动跟随。新街区刷新也会让镜头显示恢复后的玩家。

地图内容在 `src/lib/town-map.ts`：尺寸、道路、石板地、庭院、建筑、树/围栏/花坛/路灯和占地；程序纹理与碰撞使用同一份地表数据。`scene-data.ts` 继续管理成对门户、每场景尺寸、家具布局/碰撞；`INTERIORS` 让相同绘制组件读取不同房间配置。`scene-art/scene-ground` 保持Pixi渲染，`scene-view` 负责扩展后的镜头。没有Tiled依赖、ECS或分块加载系统。

NPC仍只有原home/cafe/square业务地点，原住宅、位置、路径、自动推进、聊天、事务均未改；新房屋尚不加入NPC决策。世界JSON无需迁移。原本机378版本重启前后完全一致。

验证：`npm run typecheck`、`npm run lint`、`npm test`（91项）、`npm run build`；`npm run test:v81` 使用3115端口、55488隔离测试库和随机世界，明确禁用模型。住宅/咖啡馆/私聊/聊天故障/并发回归与实际性能口径见 [V8.1验收](../docs/v8-1-validation.md)。地图总体规划见 [地图蓝图](../docs/town-map-plan.md)，新外观来源见 [素材说明](public/art/v8-1/ASSETS.md)。

下一街区主要增加地图地表/装饰/占地、成对门户、独立室内布局和图集帧；仍须验证入口可达性及新旧路线。当前新房屋没有NPC工作、店主、交易或职业，不生成假居民。河流、桥梁、公共建筑和更大树林仍只是蓝图，未部署或自动扩展。


### V8 连续地图扩展
V8.2室外2800×1600，保留老街与原存档坐标，新增公共街、河岸住宅、两座可通行木桥和石阶。共12栋不同外观建筑。V8.3全部建筑各有独立室内与返回原门口的出口，WASD/方向键走动、门前E交互；新场所目前只探索，不提供虚假购买/医疗按钮。

`town-map.ts`集中地图内容；`scene-data.ts`共享碰撞和成对门户，`INTERIORS`配置家具/材质；`navigation.ts`按同一碰撞数据查找有安全余量的路线。角色仍由后台提供真实场景，玩家在当前标签页即时移动。

阶段记录：[持续进度](../docs/progress-v8-v9.md)。模型常规检查关闭外部调用；付费配置不因地图扩展改变。

V11.1：运行 db:init 显式添加私聊 player_memory 列（不清库）；匿名访客认识与称呼仅在本人私聊中使用。Cookie有效30天，清除或过期无法恢复匿名身份。验证见 docs/v11-validation.md。
