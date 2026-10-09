# SKYCity 底座复用评估

评估日期：2026-10-09。**建议：本次小规模面试 MVP 只将 SKYCity 作为参考，不直接选择整仓二次开发。** 它的页面、API、世界推进和 SQLite 恢复可以运行；但玩家聊天缺失，Fake 仍包含主要脚本路径，模型失败只转入等待，精简种子后经济与反思系统仍运行。补齐作业功能有明确入口，但把它收缩为容易讲清楚的小镇，还需要同时处理数据依赖、调度和模型工具边界，不能按“改几份配置即可交付”估算。

这不是对项目质量的否定，也不是因为 Docker 环境失败。若接受保留原有完整世界及经济规则，整仓开发在技术上可行；这与我们此前的小规模实施边界不同。本轮不改写原 spec，不实施任何产品改造。

## 版本与隔离环境

- 来源：[TianyaSKY/SKYCity](https://github.com/TianyaSKY/SKYCity)。独立目录：`D:\腾讯面试\candidates\SKYCity`。
- 完整 commit：`476ad54df807efd1c1a11455ac0041598a8f769c`；应用版本 `0.2.0`，数据库迁移 `0001`，地图 `1.2.0`。候选仓库的已跟踪文件未修改；[版本与文件哈希记录](../candidates/SKYCity-assessment/evidence/provenance.json)。
- 保留 Vue 3 / Vite / Pinia / PixiJS、FastAPI / SQLAlchemy / Alembic、SQLite、原世界引擎；没有迁移 Next.js 或替换数据库。
- Windows，PowerShell；Python 3.12.6、uv 0.12.1；系统 Node 24.14.1 / npm 11.11.0，另使用已有兼容 Node 24.19.0 执行浏览器验证。依赖按上游锁文件安装。
- Docker Desktop 4.82.0 / Engine 29.6.1 / Compose 5.3.0。独立项目名 `skycity-assess-20261009-1555`，绑定 `127.0.0.1:18087`，预定卷 `skycity-assess-20261009-1555_skycity-data`；镜像构建受阻，未建成该运行栈。
- 原生启动替代验证仍使用原 FastAPI 托管前端产物，数据库单独位于 `candidates/SKYCity-assessment/evidence/native-run/world.db`；源码探针和两人种子探针各用独立 SQLite 文件，pytest 使用上游的每进程临时库。
- 强制 `LLM_PROVIDER=fake`，清空模型密钥与地址，关闭 SDK trace；候选目录没有 `.env`，未读取其他项目的密钥。故障测试注入本地对象，不访问模型服务。**真实模型端到端调用明确未验证。**

## 已有验证与本轮执行

上游 [delivery-validation.md](../candidates/SKYCity/docs/delivery-validation.md) 记载 2026-10-02 Docker 后端 373 通过 / 4 跳过、前端 116 通过、构建 / E2E / 容器恢复通过、当时 npm 审计为零。这些是上游记录，不直接作为本轮结果。

执行前检查了 README、Dockerfile、Compose、CI、测试入口和交付脚本：pytest 的删表 / 清表仅作用于其新建临时库；E2E 可能初始化世界；`verify_delivery.py` 会新建暂停世界并重启指定 Compose 项目；README 的 `down -v` 会删卷，**本轮未执行**。地图生成器会改地图，本轮未运行。

| 检查 | 本轮状态与证据 |
| --- | --- |
| 后端全量 `pytest tests/ -q` | **失败**：371 通过、2 失败、4 跳过，耗时 2578.87s（42:58），退出码 1；两项失败均为 `UNIQUE constraint failed: world_events.world_id, world_events.sequence`；[日志](../candidates/SKYCity-assessment/evidence/backend-tests.log)、[JUnit](../candidates/SKYCity-assessment/evidence/backend-results.xml)。4 项跳过是需要真实密钥的模型测试 |
| 发布元数据检查 | **通过**：`SKYCity 0.2.0: release metadata OK`；[日志](../candidates/SKYCity-assessment/evidence/release.log) |
| 前端 Vitest / 类型检查 / 构建 | **通过**：116 项测试；`vue-tsc -b && vite build` 成功；[测试](../candidates/SKYCity-assessment/evidence/frontend-tests.log)、[构建](../candidates/SKYCity-assessment/evidence/frontend-build.log) |
| 上游浏览器冒烟 | **通过**：1 项，页面、canvas、API 和 WebSocket；[日志](../candidates/SKYCity-assessment/evidence/upstream-e2e.log) |
| npm audit | **失败**：当前锁文件报告 3 high（Vue、其 server-renderer、source-map-js）；[原始 JSON](../candidates/SKYCity-assessment/evidence/npm-audit.json)。未自动升级依赖；这不等于已证明运行中的静态前端可被利用 |
| Docker 构建 | **环境阻塞**：拉取 `docker/dockerfile:1` 时 Docker Hub OAuth 连接被远端关闭；[日志](../candidates/SKYCity-assessment/evidence/compose-up.log) |
| 上游交付脚本 | **环境阻塞**：对隔离原生服务完成前置 HTTP 检查并创建暂停世界，到 Compose restart 时提示 `dockerDesktopLinuxEngine` 管道不存在；不能算容器恢复通过；[日志](../candidates/SKYCity-assessment/evidence/delivery.log) |
| 首次 Windows 依赖安装 | **环境阻塞，重试后解除**：esbuild `spawnSync ... EBUSY`、清理 `EPERM`；系统 Node 不满足 jsdom 的版本声明；[首次](../candidates/SKYCity-assessment/evidence/npm-ci-initial.log)、[重试](../candidates/SKYCity-assessment/evidence/npm-ci.log)。没有改锁文件 |

失败项 `tests/test_memory_relationships.py::test_apply_reject_hire_shift_resign_records_memories` 和 `tests/test_transfers.py::test_llm_script_transfer` 分别用 `python -m pytest <用例> -vv --tb=short` 在新临时库复跑，均为 1 passed（24.75s / 7.58s）；[记忆复跑](../candidates/SKYCity-assessment/evidence/backend-retest.log)、[转账复跑](../candidates/SKYCity-assessment/evidence/transfer-retest.log)。全量分别在 sequence 111 和 28 插入事件失败；根因尚未定位，不能认定只是测试隔离问题，也不能用单次复跑覆盖全量失败。此项与 Docker 环境阻塞分开归类。

测试退出时另有 `TemporaryDirectory` 清理 `world.db` 的 WinError 32，单项复跑退出码仍为 0；这是 Windows 文件占用清理警告，不等同于用例断言失败。全量耗时较长，`uv tool run --from py-spy py-spy dump --pid 28384` 的只读[进程栈](../candidates/SKYCity-assessment/evidence/backend-stack.txt)定位到跨日计数测试的世界推进 / SQLite 写入，未更改测试或数据库以加速。

### 实际命令

以下相对路径从候选仓库根目录开始；完整参数和退出码见上述日志。[执行包装脚本](../candidates/SKYCity-assessment/run-check.ps1) 固定 Fake、端口和项目名，安装及启动仅作用于本候选；当前脚本显式使用 Node 24.19.0。初次 npm 尝试使用系统 24.14.1，保留了当时日志。

```powershell
# 最初在 D:\腾讯面试执行
git clone -- https://github.com/TianyaSKY/SKYCity.git candidates/SKYCity
# 随后在 candidates/SKYCity 执行
git rev-parse HEAD
git status --short
& ../SKYCity-assessment/run-check.ps1 up
& ../SKYCity-assessment/run-check.ps1 backend
& ../SKYCity-assessment/run-check.ps1 frontend
& ../SKYCity-assessment/run-check.ps1 e2e
& ../SKYCity-assessment/run-check.ps1 delivery
```

包装脚本实际调用 `docker compose -p skycity-assess-20261009-1555 up --build -d --wait --wait-timeout 120`；`uv sync --frozen --python 3.12`、`uv run --no-sync python ../tools/check_release.py`、`uv run --no-sync pytest tests/ -q --junitxml=…/backend-results.xml`；`npm ci`、`npm run test`、`npm run build`；`playwright install chromium`、`npm run test:e2e`；`python -X utf8 tools/verify_delivery.py --url http://127.0.0.1:18087 --project skycity-assess-20261009-1555`。另外执行 `npm audit --json`、`python -m pytest --collect-only -q`（377 项）及上述单项复跑；Python 均使用候选 `.venv`，只有无需项目依赖的交付 / 元数据辅助操作使用系统 Python。

额外探针均在候选仓库外：从 `backend` 用 `.venv/Scripts/python.exe ../../SKYCity-assessment/source_probes.py`、同目录下的 `small_world_probe.py`、`live_session.py` 运行；浏览器用 Node 24.19.0 执行 `../SKYCity-assessment/browser_probe.mjs`。原生启动的准确命令和数据库路径见 [launch.json](../candidates/SKYCity-assessment/evidence/native-run/launch.json)，HTTP 路由枚举见 [http-routes.txt](../candidates/SKYCity-assessment/evidence/http-routes.txt)。

## 六项重点验收

| 验收项 | 判断 | 源码与实际证据 |
| --- | --- | --- |
| 1 无密钥打开页面、查看 NPC、持续推进 | **通过** | `get_provider()` 明确选择 Fake；浏览器实际查看“顾长山”总览、对话历史并发放 50 金币，继续 / 暂停令显示时间 09:55→09:56，页面无 JS 异常；[浏览器结果](../candidates/SKYCity-assessment/evidence/native-run/browser-result.json)、[截图](../candidates/SKYCity-assessment/evidence/native-run/npc-overview.png)。原生世界连续五次采样递增，见 [samples.json](../candidates/SKYCity-assessment/evidence/native-run/samples.json) |
| 2 状态改变影响下一步 | **通过：存在真实状态分支；失败：不能把整个 Fake 宣称为无脚本自主策略** | `FakeDecisionProvider.decide()` 与 `DecisionService._run_cycle()`；同一张明、相同初始地点和可决策状态，饱食 80→10：去广场→去商店；饥饿时金币 600→0：去商店→去农场；精力 90→10：强制等待。每组新 provider、同样脚本起点、无未读消息或附近社交干扰；[输入观察与结果](../candidates/SKYCity-assessment/evidence/source-probes-70f939e7/result.json) |
| 3 玩家直接与 NPC 对话 | **失败：缺少该功能** | `AgentPanel.vue` 的对话 tab 只有历史；`getConversations()` 是 GET；后端 `ConversationService.talk()` 要求发送者和接收者都存在于 Agent 表。运行页面对话 tab 的输入框数量为 0；API 无玩家消息入口。NPC 的 `POST .../agents/:id/actions` 是代 NPC 执行动作，不等于玩家聊天；见上述浏览器结果和路由枚举 |
| 4 模型错误 / 超时后的可体验降级 | **通过：时钟和干预可用；失败：没有可继续决策 / 聊天的实质替代策略** | `_call_decision()`、`_degrade()`；本地替身抛 RuntimeError 时调用 1 次，真正异步超时（测试阈值 20ms）时调用 2 次，均执行“LLM 故障降级等待”；决策标志释放，时间 480→485，金币干预成功。没有切换 Fake；[faults 结果](../candidates/SKYCity-assessment/evidence/source-probes-70f939e7/result.json)。生产默认每次超时 60s，瞬时错误重试一次，之后按游戏分钟退避；真实供应商错误链路未验证 |
| 5 修改后保存并重启后台恢复 | **通过：本地 SQLite 原生进程；未验证：线上持久卷部署** | `save()`、`load_existing()`；世界 480→595，张明金币 600→637，保存 `save_8b2751fe8c70`，结束后台进程后重新启动，world 与全部 19 个 agents 字段逐项相等；另从保存记录创建新世界，金币仍为 637。不是只刷新页面或比较种子；[结果](../candidates/SKYCity-assessment/evidence/native-run/result.json)、[重启前](../candidates/SKYCity-assessment/evidence/native-run/before-restart.json)、[重启后](../candidates/SKYCity-assessment/evidence/native-run/after-restart.json) |
| 6 配置形成小规模演示世界 | **通过：两名 NPC 能播种运行；失败：仅删种子不能形成独立的两人三地点系统** | `_load_world_cached()`、`create_world()`、`ensure_seeded()`；仅复制林夏 / 张明身份卡的完整应用启动后仍有 22 地点、6 合作社、5 个不存在的经理引用，仍安排 `agent_decide / daily_reflection / move_completed`；[两人实测](../candidates/SKYCity-assessment/evidence/small-world-992d80a6/result.json)。三地点临时地图被固定必需地点校验拒绝；[错误](../candidates/SKYCity-assessment/evidence/source-probes-70f939e7/result.json) |

Fake 的准确边界：未读消息触发固定回复 / 告别；饥饿结合库存、金钱和所在地点触发吃、买、移动或工作；邻近空闲对象触发问候，附近等待对象触发同步等待。其余走 `DEFAULT_SCRIPTS`，包含故意访问 `ghost_town` 的演示失败；脚本走完并不重新规划，而是例行等待或失败恢复移动。通用话术来自 `TALK_POOL`，不按人设生成。低精力休息在 **DecisionService**，不是 Fake 自身。Fake 的脚本游标 / 话术游标只在内存；数据库快照恢复通过，不代表重启后脚本继续位置也被保存。

浏览器操作也暴露了演示摩擦：张明的动态名字牌与地点标签重叠，直接点中心未选中；补测按实际露出的名字牌区域选择其他 NPC 后成功。原始失败日志保留，未修改样式或绕过 DOM 直接设置选中状态。

## 三条关键调用链

**世界推进与决策**：[`main.py::lifespan`](../candidates/SKYCity/backend/app/main.py) 装配服务 → [`WorldEngine._tick_loop / _tick_runtime`](../candidates/SKYCity/backend/app/world_engine/engine.py) 推进 `WorldClock`、持久化时钟 → [`Scheduler.load_due / dispatch`](../candidates/SKYCity/backend/app/world_engine/scheduler.py) → [`DecisionService.handle_agent_decide / decide / _run_cycle`](../candidates/SKYCity/backend/app/services/agent_decision_service.py)（暂停、autonomous、忙碌状态、原子决策占用检查）→ [`build_observation`](../candidates/SKYCity/backend/app/agents/observation_service.py) → [`FakeDecisionProvider.decide`](../candidates/SKYCity/backend/app/agents/providers/fake_provider.py) → `_execute_tool` → [`ActionExecutionService.execute_move / execute_wait` 等](../candidates/SKYCity/backend/app/services/action_execution_service.py)校验、写状态、安排完成动作 → [`EventBus.publish`](../candidates/SKYCity/backend/app/world_engine/event_bus.py) 写事件 → 引擎刷新 WebSocket → [`worldStore`](../candidates/SKYCity/frontend/src/stores/worldStore.ts) 与 [`WorldView`](../candidates/SKYCity/frontend/src/views/WorldView.vue) 展示。模型模式的 [`OpenAIProvider.decide`](../candidates/SKYCity/backend/app/agents/providers/openai_provider.py) 走 SDK `Runner.run`，工具可能已执行，不能再次盲目执行；本轮仅查源码。

**玩家对话**：完整链路不存在。现有链路是 [`AgentPanel.vue`](../candidates/SKYCity/frontend/src/components/AgentPanel.vue) 选择 NPC → `worldStore.selectAgent / fetchConversations` → [`api/client.ts::getConversations`](../candidates/SKYCity/frontend/src/api/client.ts) → [`worlds.py::list_conversations`](../candidates/SKYCity/backend/app/api/worlds.py) → [`ConversationService.history`](../candidates/SKYCity/backend/app/services/conversation_service.py) → 历史展示。NPC 相互聊天则由 `talk` 工具进入 `ConversationService.talk`，经 `agent_talked` 事件更新页面。**没有“玩家输入 → 后台处理 → NPC 回复”这段。**

**状态保存与恢复**：动作服务 / 引擎 tick 直接事务提交 SQLite；显式 `POST /api/worlds/{id}/save` → [`SaveService.save / _serialize`](../candidates/SKYCity/backend/app/services/save_service.py) → `saves.payload_json`。进程启动 → `lifespan` → [`initialize_database`](../candidates/SKYCity/backend/app/database/session.py) 执行 Alembic → `WorldEngine.load_existing / _ensure_runtime` 恢复数据库世界、时钟、调度并清掉失效的 `is_deciding` → snapshot / WS。显式 `/api/worlds/restore` 另经 `SaveService.restore / _reinsert` **创建新世界**，不是覆盖原世界。线上仍须给原 SQLite 文件和日志配持久卷并保持单实例；本轮没有证明云重部署恢复。

## 需求缺口与最小改动范围

以下仅为后续范围估计，不是本轮改造承诺；不替换原世界引擎或数据库。

| 缺口 | 最小涉及范围及验收 |
| --- | --- |
| 玩家聊天 | `AgentPanel.vue` 增输入 / 发送 / 回复与错误模式，`api/client.ts` / types 加请求；后端加玩家聊天路由、会话服务和持久消息表 / Alembic 迁移，复用身份卡与状态观察。单独表示玩家身份，不把玩家伪装成已有 NPC，不走 NPC 距离 / 忙碌限制；无 Key 和超时都有可显示回复，刷新能恢复消息 |
| 可解释的规则决策与人设差异 | 在 `fake_provider.py` 内把演示脚本路径改为小量状态 / 性格规则，保留 `DecisionResult` 与执行器；联动 `gameplay.py` 和针对性测试。相同外部条件下验证状态、性格分别影响选择；保留确定性，不建设新 Agent 框架 |
| 失败降级只有等待 | `agent_decision_service.py::_call_decision / _degrade` 增规则 fallback 和模式记录；新增聊天服务也采用超时 / 异常回复。不得重复执行模型已经提交的工具；测试模型在工具执行前后报错的差别，页面展示真实模式 |
| 事件序号一致性未通过全量检查 | 先检查 `event_bus.py::init_sequence / publish`、`engine.py` 的 runtime / 后台任务生命周期及 `tests/conftest.py` 的进程内隔离；两处实际唯一约束冲突都在 `world_time_changed` 写入时发生。最小修复位置需根因定位后才能确定；本轮不承诺“只改测试即可”，短时页面与恢复验证通过也不能排除此问题 |
| 真正缩小世界 | `WORLD_DATA_DIR` 可选独立种子目录，但必须同时协调 identities、地图 / interactables、jobs / stores / companies、Fake 硬编码目的地和 `world_config_loader.py` 的必需地点集。两人三地点是我们的选择，不是原文硬指标；保留原地图可避免地图裁剪，却仍需修复失效人物引用 |
| 不需要的系统仍影响体验 | `main.py::lifespan` 仍装配全部服务；`WorldEngine._maybe_hourly_tick` 仍处理需求、强制进食、补货、采购，跨日仍有补贴、维护费、财政与合作社结算；`MemoryService.handle_daily_reflection / _run_daily_reflection` 仍为每个 NPC 安排反思，真实 provider 会调用模型；`OpenAIProvider.__init__` 仍暴露经济 / 雇佣 / 建造 / 种植工具。若要停用，需要明确演示配置控制服务注册、tick 分支和工具集合，不能只隐藏前端面板 |
| 交付与可讲解性 | 补充自己的启动说明、选择理由、改动与 AI 修改案例、真实调用证据、线上地址及视频；保留上游归属。上线须验证单实例持久卷、限流和世界创建 / 删除边界；修正当前审计依赖后重跑相关检查。以上尚未执行 |

缩减范围的源码定位：[`world_config_loader.py::_load_world_cached / _EXPECTED_LOCATION_IDS`](../candidates/SKYCity/backend/app/services/world_config_loader.py)、[`company_employment_service.py::ensure_seeded`](../candidates/SKYCity/backend/app/services/company_employment_service.py)、[`memory_service.py::handle_daily_reflection / _run_daily_reflection`](../candidates/SKYCity/backend/app/services/memory_service.py)；周期状态计算位于前述 `engine.py::_maybe_hourly_tick`，并非前端开关。

可讲解的主线是“时钟 / 调度 → 观察 / provider → 世界规则执行 → SQLite / 事件 → 页面”。但现有动作会联动钱、库存、雇佣、关系和反思；只会解释新增聊天接口，还不足以解释运行中的整体行为。这是本次建议只参考的主要依据。更适合借鉴的是 provider / 执行器分离、事件日志、恢复和测试方法。

## 本轮变更与许可

- 新增本报告；独立 clone 候选；新增 `candidates/SKYCity-assessment/` 下的 `run-check.ps1`、`source_probes.py`、`small_world_probe.py`、`live_session.py`、`browser_probe.mjs` 与日志 / 数据库 / 截图 / 测试种子副本。这些只用于启动和验证。
- 验证脚本适配：显式指定兼容 Node、先设置 Playwright 浏览器目录再导入、处理动态名字牌遮挡；均未修改候选业务源码。没有上游兼容补丁、重构、删功能、改名或配色。
- 候选内部仅产生被忽略的 `.venv`、`node_modules`、`dist`、pytest / E2E 缓存等；未修改上游锁文件。原有 `docs/spec.md`、`AGENTS.md` 和作业原文保留。测试服务已停止，隔离数据库和证据保留，不删除既有项目数据。
- 代码许可：[`LICENSE`](../candidates/SKYCity/LICENSE)，MIT，署名 `Copyright (c) 2026 TianyaSKY`，复用时保留许可证与版权声明。
- 像素素材许可：[`kenney_tiny-farm/License.txt`](../candidates/SKYCity/kenney_tiny-farm/License.txt)，CC0；[`world_data/asset-manifest.json`](../candidates/SKYCity/world_data/asset-manifest.json) 标记 Kenney 图块为 CC0、生成 marker 为项目 MIT。依赖按各自许可，根代码许可不替代第三方许可。

**停止点：仅完成评估，不继续搜索其他项目，也不自动进入改造阶段。**
