# 晨露村 · Web AI 小镇

一个可以观察居民生活、与居民交谈并影响公共世界的像素小镇。居民根据需求、性格、工作和已确认约定选择行动，前端展示后台保存的真实路径；大模型负责对白，不直接改写世界。

当前交付基线为 **V12**：6 名居民、12 栋可进入建筑、1 张室外地图及 12 个独立室内，支持持续行动、工作休息、私人姓名记忆、咖啡馆定时约定和公共聚会。**不配置模型也能运行主流程。**

本文是当前版本的启动与技术说明；阶段报告保留当时的结果，其中早期“两名居民”“共享聊天”“每五秒一步”等描述不是当前行为。

## 1. 交付状态

| 交付物 | 位置与实际状态 |
|---|---|
| 前端、后台、初始化数据、配置示例 | [web/](web/)、[初始化 SQL](web/scripts/schema.sql)、[种子入口](web/src/lib/world.ts)、[.env.example](web/.env.example) |
| 技术方案与关键决策 | 本 README 第 5–9 节；[需求及阶段记录](docs/spec.md) |
| 源码仓库 | Git 关联到 [SiriThree/ai_town](https://github.com/SiriThree/ai_town)；本地最新检查点是否推送需交付时核对 |
| 公开体验地址 | **尚未部署，没有可核实的公开体验 URL。** 本地地址不是线上交付地址；上线后补充 HTTPS 地址、开放期限与失效后的替代方式 |
| 3–5 分钟本人录屏讲解 | [讲解提纲](docs/demo-outline.md)已准备；**正式带讲解视频尚未完成** |
| 替代运行证据 | [V12 浏览器故事、截图与连续录屏](docs/v12-validation.md)、[姓名与定时会面录屏](docs/v11-6-validation.md)。这些是实际本地验证，不等于公开部署或本人讲解视频 |

验证媒体位于被 Git 忽略的 `web/evidence/`；仅克隆仓库不一定包含它们。交付时需单独导出脱敏截图/录像，不打包数据库、私人聊天或环境密钥。

## 2. 本地启动

### 环境

- 已验证开发环境：Windows、Node.js **24.14.1**、npm **11.11.0**、PostgreSQL **17.11**。依赖以 `web/package-lock.json` 为准，使用 Node 24 运行下列命令。
- 本地可用 Docker Compose 启动项目专用 PostgreSQL 17；没有 Docker 时，准备同名的独立 PostgreSQL 数据库并修改 `DATABASE_URL`。数据库不能省略，不能用浏览器存储代替。
- 浏览器需要 WebGL；应用默认监听 `127.0.0.1:3100`。先确认端口未被旧应用占用。

### 全新安装（PowerShell，从仓库根目录开始）

```powershell
cd web
node --version
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }

# 只启动此项目开发数据库，使用独立命名卷；不删除已有卷。
docker compose up -d db --wait

# 明确采用免费、可体验的本地降级模式；现有密钥文件不覆盖。
$env:AI_ENABLED='false'
$env:NPC_AI_ENABLED='false'
npm run db:init
npm run db:seed
npm run dev
```

打开 **http://127.0.0.1:3100**。页面应显示地图、六名居民与世界时间；`GET /api/world` 应返回已保存世界。首次建表与播种是显式维护步骤；普通读取、刷新、进出室内不会重新初始化。

模板连接的是 `127.0.0.1:55487/ai_town_mvp`，Compose 使用公开的本地开发账号 `town_local / town_local_only`，**不得沿用为生产密码**。如果使用自行安装的 PostgreSQL，先创建本项目专用用户和 `ai_town_mvp`，在 `.env.local` 设置正确连接串，再执行初始化命令。脚本拒绝其他数据库名。

生产模式本地预览：正常停止自己启动的开发进程，再执行：

```powershell
npm run build
npm start
```

不要同时用两个进程占用 3100。`npm start` 使用生产构建，不能在未构建时启动。

### 已有存档升级

保留 `.env.local`、`WORLD_ID` 和原数据库，先做数据库备份，不删卷、不清库。V11.6 → V12 只需要追加公告归属和现场会面两张表：

```powershell
cd web
npm ci
node --env-file=.env.local --import tsx scripts/migrate-v12.ts --apply
npm run build
# 正常停止原应用后运行，保留原数据库。
npm start
```

此迁移仅允许本项目本机 55487/55488 对应库；不会重置世界。更早的两居民存档先按 [应用历史说明](web/README.md)中的 `migrate-residents.ts` 升级，不能靠重新播种替代兼容处理。V12 验收只迁移了隔离测试库，原 3100 主进程和主库未由该轮更新；看到旧界面时先核对运行版本。

### 常见启动问题

| 现象 | 排查 |
|---|---|
| API 503 / 数据库连接失败 | `docker compose ps`；核对连接端口、库名及专用账号；新库是否已执行 `db:init` |
| 世界不存在 | 全新安装执行 `db:seed`；已有环境先核对 `WORLD_ID`，不要重置原库 |
| 3100 已占用 / 仍显示旧版 | 检查原应用进程与工作目录，正常停止后重建、启动；不要结束来源不明的进程 |
| 地图黑屏但页面可见 | 检查浏览器 WebGL/硬件加速及控制台资源请求；数据 API 成功不代表渲染成功 |
| 会话失效 | 重新打开对话；清除 Cookie、换浏览器或签名密钥变化会失去原匿名身份，不能自动认领旧私聊 |
| 模型关闭后仍有真实调用 | 检查实际启动进程的环境；修改环境变量需重启，浏览器刷新不替换服务端配置 |

## 3. 跑通主流程

1. 打开小镇，点击居民查看需求、行动与性格。开始自动运行，观察居民走路、进食、工作或回家；暂停后仍可移动和观察。
2. 点击地图取得焦点，用 **WASD / 方向键**移动。靠近房门按 **E** 进入，再从室内出口返回。拖动地图平移，使用缩放及全景控制。
3. 靠近居民按 **E** 交流，例如“你现在在做什么？”；回复显示在角色头顶，完整原文按需查看。输入框聚焦时不触发移动，**Esc** 结束交互。
4. 在居民详情送食物，比较真实饥饿值前后变化。普通需求满足后，居民会重新选择行动；不要把每次送食物都说成一定立即改变已有持续行动。
5. 对同一居民说“我叫 three，你记住了吗？”，之后离开再问“我叫什么名字？”。姓名绑定该浏览器访客和该居民，不是所有居民共享的全知记忆。
6. 邀请“待会你有空吗？我想邀请你去咖啡馆喝杯咖啡。”；收到具体时间提议后确认。开启世界运行，观察赴约。玩家自行前往，靠近居民按 E 才确认会面；到达不等于已经见到玩家。
7. 靠近咖啡馆旁既有公告板按 E，发布树荫广场聚会，选择**世界日期与时刻**。开始时间需在未来 30 分钟至两天内。居民可参加、拒绝或推迟；活动结束查看真实结果。
8. 暂停，记录世界时间与居民状态，刷新页面，再正常重启本项目 Web 服务，核对存档恢复。不要在正常演示中重启或重置共享数据库。

邀请可能因工作、紧急需求而推迟；聚会也不保证全员参加。可控测试用于证明规则，不通过篡改正式世界保证演示答案。

## 4. AI 如何接入

只有服务端 [chat-model.ts](web/src/lib/chat-model.ts)读取模型配置。应用向 `AI_BASE_URL` 后追加 `/chat/completions`，发送 OpenAI-compatible 消息，当前项目使用过外部 Qwen-plus，**本机不运行大模型，也不需要 GPU**。

| 环境变量 | 用途 / 默认 |
|---|---|
| `DATABASE_URL` / `WORLD_ID` | 本项目 PostgreSQL / 世界标识，默认 `morning-town` |
| `AI_ENABLED` | 默认 `false`；显式启用才调用模型 |
| `AI_API_KEY` | 服务端真实密钥；模板留空 |
| `AI_BASE_URL` | 服务商提供的兼容 API 前缀（需要时包含 `/v1`），不是完整聊天端点 |
| `AI_MODEL` | 服务商模型 ID，例如账户支持的 `qwen-plus` |
| `AI_TIMEOUT_MS` | 默认 8000ms，代码限制最高 10000ms |
| `NPC_AI_ENABLED` | 默认 `true`；NPC 自主交流模型开关，设为 `false` 关闭；共享模型额度，仍需 AI_ENABLED 与有效服务配置 |
| `CHAT_REQUESTS_PER_MINUTE` | 世界共享请求额度默认 30，硬上限 120 |
| `AI_CALLS_PER_DAY` | UTC 日模型尝试额度默认 60，硬上限 200；失败也消耗额度，0 禁止模型调用 |
| `PUBLIC_DEMO` | 公网必须 `true`：关闭 HTTP 初始化，启用安全 Cookie |
| `COOKIE_SIGNING_SECRET` | 公网至少 32 随机字节，受保护环境注入，不使用示例值 |

接入真实服务时，在被忽略的 `.env.local` 填写配置，设 `AI_ENABLED=true`。若此前按本 README 在 PowerShell 设置了关闭开关，需在该终端显式设 `$env:AI_ENABLED='true'`，再重启服务；只准备配置不算真实调用成功。服务商地址与区域由账户实际配置决定，不在代码中硬编码。

三种模式明确区分：

- **真实 AI**：已启用且配置齐备，经配额许可后请求外部服务，记录 `source: 'ai'`。
- **Fallback**：未配置、关闭、超时、网络/服务异常、预算耗尽或部分事实冲突时，以人格与当前真实状态生成有限本地回答，记录 `source: 'fallback'`。不自动无限重试，世界继续运行。
- **Mock**：自动化脚本启动可控本地 HTTP 替身，模拟正常回复、错误或超时；不是 Qwen。`AI_TEST_MODE=true` 限制适配层只能访问回环地址，本身不会启动替身。

邀请确认、时间查询等受控结果也可能直接由后端返回 `source: 'fallback' / reason: 'controlled_action'`；这表示有事实依据的本地回执，不代表模型服务故障。

正常游戏隐藏技术来源标签，帮助中的开发诊断保留来源与事实；模型文本作为纯文本显示，不执行 HTML 或工具。单进程最多两个模型请求并发，模型等待发生在世界事务之外。

**真实效果边界：**V11.4 已授权的 8 次 Qwen 调用全部 API 成功，但重要回忆和工作进度表述出现过事实缺口。之后的修复、姓名/定时约定和公共活动已通过 Mock/Fallback 验收，尚未追加真实模型复测；详见 [V11.4](docs/v11-4-validation.md)、[V11.5](docs/v11-5-validation.md)。不能用 API 成功代替事实一致性通过。

## 5. 技术栈、架构与取舍

| 选择 | 原因与代价 |
|---|---|
| Next.js 16.4 + React 19.3 + TypeScript 6.0 | 同仓开发页面与明确 HTTP API，降低小项目部署成本；服务端仍需 Node，不能当纯静态网页发布 |
| PixiJS 8.22 | 地图、角色、遮挡与真实路径动画；React/HTML 管理纸质面板和输入，避免在 Canvas 重做文本表单 |
| PostgreSQL 17 + `pg` 8.23 | 世界、历史、约定与配额持久化；同一世界短事务行锁保证一致性。JSONB 快照容易解释，但不适合无限增长或大量并行世界写入 |
| 明确规则 + 有限状态持续行动 | 可控制变量测试、可解释、无模型也可生活；自主不等于通用智能，规则覆盖范围有限 |
| LLM 负责表达，受控意图负责执行 | 自然对白与权威事实分开；邀请语法范围有限，但不会把模型说“好啊”当作数据库执行成功 |
| 浏览器唤醒 + 后端到期判断 | 单实例无需队列或常驻 Worker；无人访问时不模拟，不无限补算离线时间 |
| 轻量 TypeScript 地图与门户配置 | 玩家/NPC共用入口和通行定义，室内是真场景；内容维护仍需人工校验，不是通用地图编辑器 |

```mermaid
flowchart LR
  UI[React界面与Pixi场景] --> API[Next HTTP API]
  API --> Rules[规则、持续行动、门户与执行校验]
  Rules --> DB[(PostgreSQL事务存档)]
  DB --> UI
  API --> Context[真实状态和当前访客记忆]
  Context --> Model[服务端模型适配或Fallback]
  Model --> Chat[(私人对话记录)]
  Chat --> UI
```

**世界链路：**页面 → `tick / wake / interventions` → `store.updateWorld` 锁定世界行 → 检查版本/到期时间 → `advanceWorld` 继续未完成行动或选择合法新行动 → 同事务保存世界与事件 → 前端读取已提交版本 → Pixi 表现真实路径。重复版本请求返回冲突，多标签唤醒不会重复结算同一自动时隙。

当前固定速度为每现实秒推进 2 游戏分钟；手动一步也是一秒行动量。路径长度决定行走时长，未完成行动有持久 ID 和进度。场景切换经门户，不在不同场景坐标系之间插值。玩家本地化身位置与后台 NPC 状态分开。

**聊天链路：**近距离 E → 私聊 API → 验证签名访客与输入 → 读取同一快照下的 NPC/约定、本人历史与姓名事实 → 处理受控邀请并保存确认结果 → 构造当前事实、重要经历、近期聊天分层上下文 → 模型或 Fallback → 保存回复 → 角色气泡/完整历史。模型本身没有数据库修改工具。

**公共活动链路：**公告板 → 后台校验世界时间、发布频率与归属 → 保存公共公告 → 各居民按状态回应 → 原行动系统安排合法路径 → 实际到场并停留后记参加 → 结束事实进入本人经历。只有真实互动影响关系，不因同在广场机械加好感。

## 6. NPC、地图与数据结构

| 居民 | 可辨识设定与行为 |
|---|---|
| 阿晴 | 外向热心，基本需求满足时倾向与广场邻居交流，口语主动 |
| 阿宁 | 安静内敛，倾向阅读和观察，表达简洁温和；与阿晴同条件下可选择不同动作 |
| 小雨 | 外向、服务偏好，咖啡馆备餐；任务到场后才计算工作进度 |
| 老林 | 安静稳重，杂货铺理货，优先安排手边事务 |
| 沐溪 | 喜欢花草与居家阅读，更重视休息，疲劳阈值与普通居民不同 |
| 小满 | 外向、喜欢串门与公共活动，条件合适时可实际协助工作 |

例如 `decide` 中饥饿达到 65 会考虑进食；精力不足先考虑回家，居家偏好、职业与普通居民有不同休息阈值。已经开始的动作先按进度完成，紧急需求、工作和约定有明确衔接。`canExecute` 校验前置条件，`execute` 才产生状态效果，需求值保持 0–100。这不是固定动作轮播，也不是前端随机动画。

地图为 2800×1600 连通室外，包含老街广场、商业街、公共服务区、住宅和双桥河岸。`town-map.ts` 管建筑/道路；`scene-data.ts` 管场景、家具碰撞、活动点和双向门户；`navigation.ts` 查找合法路线；`TownScene.tsx` 与 `scene-motion.ts` 同步场景和持续移动。建筑业务地点、实际场景、当前位置分别存储，门前不等于室内。

| 数据 | 核心内容与边界 |
|---|---|
| `World` / `town_worlds` | `schemaVersion:2`、revision、世界 minute、运行状态、NPC、事件、工作结果、经历、交流、聚会；JSONB 快照与 revision 同事务保存 |
| `Npc` | 身份、人设、需求、业务 location、sceneId、position、lastPath、ongoing、workTask、appointment；同一居民只在一个场景 |
| `town_private_chats` | `(world_id,npc_id,visitor_id)` 隔离；最近 20 轮及独立 player_memory；姓名事实带来源消息/时间，不靠最近四轮上下文维持 |
| `town_invitations` | 访客所属邀请、请求 UUID、具体世界时间、真实状态和结果；提议、确认、赶路、到达、会面、取消/失败分开 |
| `World.gatherings` + 公告辅助表 | 公共内容/时间/各居民响应与结果；发布者凭据、幂等键在 `town_notice_owners`，私人现场会面归属在 `town_gathering_visits`，不放进公开世界 |
| 经历与关系 | 公共事实 ID、参与者、世界时间，与个人记忆/主观看法分开；重要邀请按当前访客和日期检索，普通寒暄不自动增加信任 |

旧 `town_chats` 共享历史表保留兼容，新私聊 API 不读取它，也不会将其自动归给某一访客。日志、对话和记忆有长度上限，不承诺无限历史。

## 7. HTTP 接口设计

所有接口位于 [web/src/app/api](web/src/app/api)，JSON 响应禁止缓存。以下为主要契约摘要，完整字段以路由类型与校验函数为准。

| 方法 / 路径 | 请求或作用 |
|---|---|
| `GET /api/world` | 读权威共享世界，不重新播种 |
| `POST /api/world/init` | 本地首次初始化；公网模式拒绝，生产用维护脚本 |
| `POST /api/world/tick` | `{expectedRevision}`，手动推进 |
| `POST /api/world/run` | `{expectedRevision,running}`，开始/暂停 |
| `POST /api/world/wake` | 浏览器唤醒，由后台决定本时隙是否推进 |
| `POST /api/world/interventions` | `{expectedRevision,action:"feed",npcId}`，送食物 |
| `GET /api/npcs/{npcId}/chat` | 建立/读取签名访客会话，仅返回本人该 NPC 历史和约定 |
| `POST /api/npcs/{npcId}/chat` | `{message,requestId}`，消息与邀请；`interaction:"meet"` 分支验证上报位置，确认真实会面 |
| `GET /api/world/notices` | 公共公告及本访客可管理的公告归属信息 |
| `POST /api/world/notices` | publish/cancel/presence；发布包含请求 UUID、正文、square、startMinute；取消校验作者 |
| `GET /api/health` | 部署健康检查 |

写请求校验来源和有界 JSON（4096 字节），聊天最长 500 字符。非法输入 400、无效会话 401、越权 403、不存在 404、版本冲突 409、请求超额 429；内部失败返回脱敏 503，不把连接串或堆栈发给浏览器。模型预算不足使用降级，数据库失败不会伪装保存成功。

## 8. 关键决策与 AI 辅助开发分工

本项目使用 AI 辅助实现。本人承担需求取舍、实际体验审查、交互方案与验收判断；技术设计、源码修改和自动化验证由 Codex 辅助完成。不能把 AI 执行的代码修改描述为本人手工编码，也不能用 README 代替本人现场解释能力。

关键选择包括：不直接整仓二次开发 SKYCity；保留 Web 技术路线；`my_ai_town` 仅作视觉/交互参考；用后台事实而非模型台词判定行动；先保证持久化和失败可玩，再扩展地图及公共活动。技术方案的取舍见第 5 节，参考底座评估见 [reuse-assessment.md](docs/reuse-assessment.md)。

**真实案例：把普通聊天窗口改为场景内交流（V2 → V2.1）。**

1. AI 初始产物是大型居中 Modal，背景变暗，功能可用，但遮住小镇。
2. 本人查看实际页面和参考截图，判断它像普通 AI Chat 产品，偏离生活游戏目标。
3. 本人提出底部轻量输入区、居民头顶气泡、随角色与镜头移动的方案，并要求保留 API、PostgreSQL、模型与 Fallback，不为 UI 重写后台。
4. Codex 执行代码修改，验证缩放/平移、离屏隐藏和原对话回归；本人依据运行效果继续验收。本人没有手工编辑相关前端源码。

证据与当时测试记录见 [V5.1 中的真实案例](docs/delivery-v5-1.md)的“真实 AI 辅助开发案例：V2 → V2.1”一节；其中早期系统规模和隐私描述仅是历史，不作为当前规格。

现场讲解可从 `world.ts → store.ts → TownScene.tsx` 说明“决定、执行、保存、表现”，再从 `chat-service.ts → chat-context.ts → chat-model.ts` 说明事实与语言边界。一个适合现场的小修改是调整 `FOOD_AMOUNT`，同步修改控制变量测试，并运行 `npx vitest run tests/world.test.ts tests/world-controls.test.ts`；不要仅改 UI 数字或在正式库造数据证明成功。

## 9. 自动化验证与验收对应

常规检查（`web/`）：

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

数据库与完整浏览器故事使用**独立测试库**，不读取开发密钥。首次新建 `.env.test.local` 可用以下最小内容（已有文件保留并人工核对）：

```dotenv
DATABASE_URL=postgresql://town_local:town_local_only@127.0.0.1:55488/ai_town_mvp_test
WORLD_ID=browser-test
AI_ENABLED=false
NPC_AI_ENABLED=false
PUBLIC_DEMO=false
```

```powershell
docker compose up -d test-db --wait
npm run db:init:test
node --env-file=.env.test.local --import tsx scripts/v11-6-check.ts
node --env-file=.env.test.local --import tsx scripts/v12-board-check.ts
node --env-file=.env.test.local --import tsx scripts/v12-story-check.ts

# 首次安装测试浏览器；实际故事自行创建隔离世界和3138服务。
$env:PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"
npx playwright install chromium
npm run build
node --env-file=.env.test.local --import tsx scripts/v12-browser.mjs
```

这些阶段脚本检查本机 55488 测试连接、禁止外部模型，使用随机世界并保留证据。请串行运行，不占用 3138。数据库实际重启验证会影响该测试库所有连接，不列入默认快速命令；按 [V12 报告](docs/v12-validation.md)中的恢复步骤单独执行，不能改成主库。

| 评估项 | 实现与可核实证据 |
|---|---|
| 按 README 跑通 | 全新初始化、生产预览及第 3 节操作；V12 真实浏览器主流程记录 |
| 真正自主决策 | `world.test.ts`、`continuous-actions.test.ts`、`gatherings.test.ts`：控制需求、人设、工作和约定，检查合法决策与完成时结算 |
| 人设差异 | `residents.test.ts`、`chat.test.ts`；同条件外向与安静居民选择差异，职业/休息偏好不同 |
| 无密钥与故障降级 | `chat.test.ts` 及本地模型替身脚本；超时、服务错误、额度、事实冲突均有真实来源标识 |
| 状态与存档可信 | V12 并发 tick/wake、Web 重启、测试 PostgreSQL 实际重启、途中行动继续记录 |
| 私聊与真实记忆 | `session.test.ts`、`player-memory.test.ts`、`timed-meeting.test.ts`，双浏览器私聊隔离与姓名/会面回归 |
| 配置与错误处理 | `.env.example`、`.gitignore`、`http.ts`、`visitor-session.ts`、`chat-limits.ts`；密钥不在客户端变量中 |
| 本人解释与现场修改 | 第 8 节模块路线与小修改练习；最终仍需本人现场完成，不能由测试代替 |

最近完整执行记录为 **2026-10-10 V12：类型检查、lint（0 警告）、30 个文件 169 项单元测试、生产构建通过**；隔离 PostgreSQL 回归、双浏览器完整故事和恢复验证通过。详见 [V12](docs/v12-validation.md) 与 [V11.6](docs/v11-6-validation.md)。本 README 整理不冒称又执行了一轮全部测试。

## 10. 安全、资源与已知限制

- **一个共享世界，私人聊天隔离。** 所有访客会影响同一运行/暂停/干预状态。签名 Cookie 是 30 天匿名身份，生产使用 HttpOnly、Secure、SameSite=Strict；不是账号体系，不能跨设备找回。维护者仍能访问数据库，勿输入敏感信息。
- 公开公告正文是玩家主动公开的信息；私聊、姓名与访客凭据不会自动附带。公告限长、限频、最多两个有效不重叠活动，作者才能取消。
- 配额存 PostgreSQL，失败也计尝试；共享额度可能被其他访客用完，并非货币精确预算或完整防滥用系统。公开前另设供应商费用上限与基础网络保护。
- 世界用后台存档；玩家位置仍是本地化身及客户端上报，后台有场景/距离/合法站位检查，**不是多人移动防作弊**。咖啡馆是约定会合，不是 NPC 跟随玩家。
- 姓名与邀请识别支持有限明确表达；记忆检索有界，不是无限长期记忆。真实模型可能幻觉，轻量冲突保护不是通用语义验证器。
- 场景素材包含项目原创代码绘制和为本项目生成的图集，说明在 [各版本美术目录](web/public/art/)的 `ASSETS.md`。未复制许可不明的参考素材。生成资产遵循服务适用条款，不声称 CC0 或独占版权；源码许可证见 [LICENSE](LICENSE)，依赖遵守各自许可。
- 不提供交易经济、通用自由文本改世界或离线常驻模拟。浏览器渲染性能和生成素材细节仍有限，不承诺达到参考游戏完整美术品质。

## 11. 部署与最终交付清单

预备方案为 Ubuntu 单实例：Linux 构建的 Next Standalone + 本机 PostgreSQL + systemd + Caddy HTTPS + 外部 Qwen API。Node 仅监听本机，5432 不公网开放；不能上传 Windows 的 `node_modules/.next` 当 Linux 包。

操作手册：[deploy/README-UBUNTU.md](deploy/README-UBUNTU.md)，技术准备：[docs/deployment.md](docs/deployment.md)。这些是部署准备记录，**尚无 Ubuntu 正式上线成功证明**，其中早期迁移范围需按当前 `schema.sql` 和 V12 新表复核。发布前必须重新验证 Linux 产物、静态资源、独立生产库权限、最新迁移、HTTPS、备份恢复与回滚。

交付只需当前源码、锁文件、初始化/维护脚本、配置模板、文档、许可和应用资源；排除 `.env.local`、`.env.test.local`、数据库备份、私人证据、`node_modules`、构建缓存、参考仓库及旧压缩包。已有压缩包不自动代表最新代码。

尚需补齐：实际 DuckDNS 域名与 DNS、服务器预检和发布授权、受保护的生产密钥/数据库密码/Cookie 签名密钥、可访问的 HTTPS 地址与开放期限，以及按提纲录制的 3–5 分钟本人讲解视频。未上线期间可按本文本地运行并提供脱敏实录作为替代演示，但不将其标记为线上交付已完成。
