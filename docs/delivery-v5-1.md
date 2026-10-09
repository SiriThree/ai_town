# V5.1 交付验收（2026-10-09）

本轮结论：本地功能闭环与必要安全修复通过；可进入部署确认，**尚未公开发布，不能称全部交付物完成**。公开 HTTPS 地址、云端持久化/备份恢复和 3–5 分钟本人讲解视频留待 V5.2。Windows standalone独立入口已通过，Docker 镜像验证有网络阻塞，见下文。

## 作业逐项对应

依据根目录《AI 小镇 Web 游戏.docx》原文。公开地址在“要求”中写“最好”，但在“交付物”中明确列出，因此仍作为待交付项。

| 原文要求/评估项 | 实际实现位置（相对 web/） | 可操作验收 | 本轮证据与结论 |
|---|---|---|---|
| 可本地启动的 Web 游戏 | package.json；src/app；README | 初始化专用 PostgreSQL，build/start，打开3100 | 生产构建及世界浏览器8组通过 |
| ≥2地点、≥2不同NPC | src/lib/world.ts：createWorld；chat-context.ts：PERSONAS | 查看住宅/咖啡馆/广场，选择阿晴与阿宁 | 实际为3地点、2居民；world/unit、v42截图通过 |
| 观察、档案与对话 | Town.tsx、ChatDialog.tsx、TownScene.tsx | 点居民→档案→输入→气泡→展开历史 | scene7组、chat9组通过；真实模型2次另列 |
| 状态与性格自主决策，非脚本轮播 | world.ts：decide/execute/advanceWorld | 同条件改饥饿；对比外向社交与安静阅读 | 58项单元测试及数据库控制变量通过 |
| 玩家影响世界 | world.ts：giveFood；store.ts：feedWorld；interventions API | 送食物→真实需求减少→推进 | 同种子59→24，下一步从去咖啡馆变为广场社交，database/db-result.json |
| 前后台API、保存/恢复 | app/api/world/*；store.ts：updateWorld/readWorld | 推进/干预后刷新；结束服务再启动 | world8组、v3 8组；原3100版本52重启完全一致 |
| 至少一次真实AI调用 | chat-model.ts：modelReply；chat-service.ts：chat | 在咖啡馆聊后移动广场再问当前状态 | real/result.json：2次真实AI成功，非Mock；世界未被聊天改变 |
| 无密钥与故障可体验 | chat-context.ts：fallbackReply | 无密钥；本机替身返回503/断连/超时 | chat9组通过；来源标签真实；预算耗尽仍可降级 |
| README/技术方案/取舍 | web/README.md；docs/spec.md；本文件 | 按启动命令复现，讲解调用链 | 材料已补齐；候选人现场解释/改代码需本人完成 |
| 配置管理、错误处理、自动测试 | .env.example；http.ts；chat-limits.ts；tests | 非法输入/跨站/超额/内部错误 | 类型、lint、58单元通过；安全检查4组、客户端密钥扫描另见证据 |
| 源码、初始化、配置示例 | web/src、scripts/init-db.ts、seed-world.ts、.env.example | 交付时按白名单排除本机.env/构建/测试数据 | 源文件齐备；目录当前无Git，未声称存在提交历史 |
| 本人关键决策和AI修改案例 | 下文案例及spec | 对照真实V2.1截图和变更记录讲述 | 用户本轮确认产品审查与方案调整；不冒称人工手写代码 |
| 公开线上地址 | deploy/compose.yaml、Dockerfile、Caddyfile | V5.2确认后HTTPS访问、重启/恢复 | **未部署、未验收**；没有创建收费资源 |
| 3–5分钟录制讲解 | docs/demo-outline.md | 本人按提纲录屏讲解 | **仅提纲完成**；已有22秒无讲解技术录屏不能替代 |

## 本轮修复

1. 旧聊天和当前事实容易混淆。`buildMessages`把最近4轮历史改为带世界版本/时间的资料，再以系统消息明确本次地点、行动及过去/当前/计划的区别。模型仍生成回答，不改成模板；后台继续只读世界快照。
2. 气泡过去仅有不醒目的时间。现在世界版本不同时明确显示“历史发言 · 世界已更新”；气泡从310×188缩为290×164、三行改两行预览。完整文本仍在最近20轮历史；超800字的本机替身回复也实测完整保存。适配器不再静默截断800字，异常超过4000字符的响应作为无效响应降级；模型生成上限仍400 tokens。
3. 无公开调用预算。新增`town_chat_limits`小表，通过数据库时间与原子UPSERT控制共享世界每分钟请求量和每日模型尝试数。默认30次/分钟、60次模型尝试/UTC日，可调低，硬上限120/200；0关闭相应额度。失败请求也占模型尝试额度，重启不清零。预算不足返回明确Fallback；分钟额度不足429且不调用模型。并发20次预留3次额度，只有3次成功。
4. 输入长度检查原先在整段读取后进行。修改类API共用4096字节的有界读取；500字符消息规则保留。公开部署禁用HTTP初始化；维护命令显式准备表和世界，`ON CONFLICT DO NOTHING`不会覆盖已有存档。添加基础浏览器安全头、共享存档/聊天隐私提示。

真实回复证据：第1次世界版本1、咖啡馆，回答“我现在在麦香咖啡馆里”；第2次版本3、广场，回答“刚才我在麦香咖啡馆…现在…来到树荫广场”。仍出现后台未提供的“梧桐/微风”等环境修辞；本轮验证证明这两次地点区分正确，**不承诺生成文本的每个细节都绝对准确**。模型没有修改状态的工具；权威事实始终是档案与已保存事件。世界在请求期间继续推进时，回答使用请求快照，并按历史发言显示。

## 实际验证与证据

全部在`web/`执行；常规检查使用`ai_town_mvp_test`、独立端口3101–3107、UUID世界；不删除旧测试数据。真实调用仅2次，使用本项目已授权配置，写入独立测试世界；不做负载测试。未输出密钥。

| 命令 | 实际结果/证据，均在 web/evidence/v5-1/ |
|---|---|
| npm run typecheck；npm run lint；npm test；npm run build | 通过，58项单元；final-checks.log/final-build.log |
| npm run db:init:test；npm run db:init | 为两个本项目专用库新增配额表，未重置/删除/自动播种 |
| EVIDENCE_DIR=.../database npm run test:db；npm run test:v3:db | 5项+6组通过，db.log/v3-db.log |
| EVIDENCE_DIR=.../world npm run test:e2e | 8组通过，world/browser-check.json |
| CHAT_REQUESTS_PER_MINUTE=120 EVIDENCE_DIR=.../chat npm run test:chat | 9组通过，chat/result.json；仅本机替身，超时879ms |
| EVIDENCE_DIR=.../scene npm run test:scene-chat | 7组通过，scene/result.json |
| EVIDENCE_DIR=.../v3 npm run test:v3 | 8组通过，双标签/干预/重启；2条主动替身聊天，自动推进0次模型调用 |
| EVIDENCE_DIR=.../v42 npm run test:v42 | 6组通过，10张截图和实际动画录屏；1366×768、1440×900 |
| npm run test:v51 | 安全4组（最新security-final-verified）：数据库并发预算、HTTP拒绝、长文保存、重启额度、429；本机替身2次 |
| ALLOW_REAL_AI=1 node --env-file=.env.local --env-file=.env.test.local --import tsx scripts/v51-check.mjs --real | 真实2次成功；real/result.json。此命令显式付费验收，不并入常规测试 |
| NEXT_STANDALONE=true npm run build；node --env-file=.env.test.local --import tsx scripts/standalone-check.mjs | Windows独立入口3组通过，standalone-final/result.json：静态资源/Pixi/API、公开初始化拒绝、推进聊天及重启恢复；不是Docker运行证明 |
| node scripts/delivery-scan.mjs | 69个交付候选源文件、31个客户端构建文件无本项目真实AI密钥；客户端无数据库连接串，secret-scan.json |
| docker compose --env-file deploy/.env.example -f deploy/compose.yaml config --no-env-resolution --quiet | 模板语法通过；仅占位配置，无资源创建 |
| npm audit --omit=dev --json | 当次登记0已知生产依赖漏洞，audit-production.json；不是绝对安全保证 |
| docker build -t ai-town-v51-local --target runner . | **环境阻塞**：auth.docker.io/token连接被远端关闭；docker-build.log。未完成Linux镜像构建/容器启动 |

原用户运行环境：Node24.14.1、npm11.11、Next16.4.0、Pixi8.22.0、PostgreSQL17.11；原3100世界52→52，完整状态相等，`live-restart-result.json`。

截图：

- [真实AI当前广场](../web/evidence/v5-1/real/02-ai-current-square.png)、[此前咖啡馆](../web/evidence/v5-1/real/01-ai-cafe.png)
- [两行长文预览（替身）](../web/evidence/v5-1/security/01-short-bubble-full-original.png)、[展开全文](../web/evidence/v5-1/security/02-full-history.png)
- [无密钥降级](../web/evidence/v5-1/chat/02-fallback-no-key.png)、[服务错误降级](../web/evidence/v5-1/chat/04-fallback-service-error.png)、[预算降级](../web/evidence/v5-1/real/03-budget-fallback-after-restart.png)
- [送食物前](../web/evidence/v5-1/v3/01-before-food.png)、[送食物后](../web/evidence/v5-1/v3/02-after-food.png)、[自动运行](../web/evidence/v5-1/v3/03-auto-running.png)、[暂停](../web/evidence/v5-1/v3/04-paused.png)
- [街区](../web/evidence/v5-1/v42/01-neighborhood.png)、[行走中](../web/evidence/v5-1/v42/06-walk-middle.png)、[居民档案](../web/evidence/v5-1/v42/03-profile.png)

## 技术方案与本人决策

沿用spec，不另建架构：Next.js/TypeScript提供同仓React页面和Node HTTP API；PixiJS只做绘制与真实路径动画；PostgreSQL作为唯一世界/聊天持久存储。规则而非模型决定行动，便于控制变量测试与现场解释；AI仅负责对话，使付费与非确定性不影响世界可运行性。两名不同性格居民、三个地点、一个食物干预，保持可说明的范围。

世界链路：`Town`→GET world / POST tick或wake→`store.updateWorld`行锁→检查版本/数据库时钟→`advanceOnClock`→需求更新/合法规则决策/动作效果→同一事务存世界和事件→前端接受已提交版本→`TownScene`以lastPath播放。前端最多3秒表现已完成的位置变更，不是第二套模拟。浏览器1秒唤醒，后台5秒到期门槛；多标签不能加速自动时钟，不补算无限离线步骤。无人打开页面时没有常驻模拟进程。

干预链路：选居民→POST interventions(feed,expectedRevision)→同一行锁/版本校验→饥饿−35并夹紧0..100/事件→提交→档案与下次规则读取。手动推进、自动推进、干预使用同一事务，不会用旧世界覆盖新世界。

聊天链路：选居民→SceneChat→POST npc/chat→验证消息和NPC→请求时世界快照→每NPC数据库会话锁→读本人历史→分钟额度→事实/历史分层→模型尝试预算→OpenAI-compatible服务端请求→AI或状态驱动Fallback→原子保存历史→气泡两行预览/历史原文。不会更新世界。超时≤10秒，无自动重试。保存最多20轮，上下文最近4轮；无RAG/向量库/长期记忆。

### 真实 AI 辅助开发案例：V2 → V2.1

用户在本轮明确确认：本人审查过界面和截图、提出修改方案，**没有手工编辑相关源码**。

- 问题 / AI初始产物：V2用大型居中Modal和暗色背景遮罩，聊天闭环可用，但像普通AI Chat产品。
- 人工判断：用户实际查看效果并对照本地my_ai_town，认为偏离小镇游戏目标，要求交流时仍能观察场景。
- 人工方案与边界：点击NPC后底部轻量输入、角色头顶气泡、跟随居民/镜头；保留API、PostgreSQL、模型与Fallback，避免为前端改造重写后台。
- AI修改：Codex按上述方案实现V2.1；气泡映射镜头、边界夹紧、离屏隐藏、历史展开和原链路回归。实现工作归于AI，不虚构人工写动画或测试。
- 验证：历史证据`web/evidence/scene-chat/result.json`7组通过，`01-default.png / 02-selected.png / 03-reply.png / 04-camera.png`；本轮scene回归再次7组通过。

可表述为“AI生成→本人审查→方案调整→AI修改→运行验收”。当前目录无Git历史，案例依据用户本轮确认、原始任务要求和既有运行记录，不编造commit或人工代码diff。

## 公开演示边界及未完成项

这是**单个共享世界、共享NPC会话**。所有访客会影响同一存档，也能读到最近20轮聊天，不适合输入个人隐私或用于私人助理。访客能暂停、送食物及手动推进；锁保证一致性，不保证防捣乱或公平配额。分钟/日额度也是共享的，某访客可能耗尽额度；模型预算耗尽后仍可本地对话。当前没有账号、IP信任、限流服务或DDoS防护。正式公开时需要平台基础流量保护和供应商账户费用上限；应用请求计数不等同货币精确预算。

没有HTTP重置/删除接口。生产HTTP初始化403；部署前维护者手动跑setup。PG必须连接本项目专用数据库，直连或会话池（每NPC使用会话级advisory lock，不能用事务池）。数据卷与备份独立于应用容器；重建应用不播种/覆盖。TLS终止在Caddy，应用/数据库仅内部网络，密钥仅运行时注入。

部署方案和待提供信息见[deployment.md](deployment.md)。尚未验证：云端HTTPS/重启/磁盘故障恢复、Docker最终镜像、域名和服务区域可达性。本人讲解能力、现场改代码和完整讲解视频必须本人完成。参考项目未被复制或改动，素材仍沿用V4.1/V4.2原创生成资产及其ASSETS说明；本轮无新素材。


standalone首次烟测使用10秒就绪上限，启动超时（未定位到确定的代码故障），`standalone.log`保留。直接入口启动成功后将测试就绪上限放宽到30秒，完整3组复测通过；未修改Next生成代码。最终原3100仍正常运行，`final-live-restart.json`再次确认52→52；[最终共享提示与历史气泡](../web/evidence/v5-1/live-current.png)。

本轮完整修改文件（不含新测试证据和构建产物）见`web/evidence/v5-1/changes.json`：聊天上下文/预算/模型文本上限、HTTP有界读取与4个写API、公开init保护、4个前端展示文件、初始化脚本及维护播种、新测试/扫描/standalone烟测、Docker/Compose/Caddy/.env示例、Next安全头/可选standalone、package脚本与AGENTS/spec/README/三份交付文档。`src/lib/world.ts`、`store.ts`、路径动画和素材不变；参考仓库及旧评估证据未编辑。
