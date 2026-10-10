# V10.4 三项体验修复

2026-10-10。基线 `502f429`，开始时已有未提交的黑屏修复（`render-recovery.md`、`TownScene.tsx`、`scene-ground.ts`、`town-landscape.ts` 和分区测试），全部保留。本轮不增加居民、建筑、玩法或模型功能，没有推送、部署或外部模型请求。

## 复现与根因

| 问题 | 实际复现与原因 | 本轮处理 |
|---|---|---|
| 聊天后似乎不再行动 | **未复现私人聊天冻结 NPC。** 修复前录屏及逐秒 API 记录中，阿晴在窗口打开时继续行动并进入咖啡馆。已确认的问题是 `Town.talk` 写死“正在与…交谈”，回复结束或居民跨场景后仍不清除。另外阿晴/阿宁会按原规则连续选择原地社交/阅读，位置不变不能等同于行动未推进。 | `chat-feedback.ts`、`Town.tsx`、`ChatDialog.tsx` 区分打开未发送、等待、本轮完成、错误、离开范围/场景；展示真实行动及秒进度。选择居民时清除旧交互提示。没有改变正常决策权重，也没有为了修复提示新增 NPC 占用锁。 |
| 工坊门前大矩形石板 | `TOWN_PLAZAS` 的 `{x:1590,y:980,w:160,h:116}` 被 `drawGround` 全部绘为石砖，形成独立矩形地板。 | 保留门前约 88×38 的石台（裁剪到合法地面），以约 36 单位宽断缝石路连接原道路，其余改碎土、磨损路肩和草土边缘。没有删除可通行面、改桥坐标或堆道具遮盖。 |
| 石溪居侧面到不了门口 | 真实键盘从 `(2410,1162)` 向南走被挡在 `y=1192.95`。主路到门前小径之间没有 walkable 地面；原寻路只能大幅绕行东侧。不是 E 强制朝向，也不是门口坐标错误。 | 增加西侧窄路和南门连接段 `STONE_APPROACH`：`(2390,1160,40,142)`、`(2390,1230,180,72)`。不改墙体、门户半径和出生点。局部避让会遮住这条路的前景树冠。 |

## 交谈生命周期与真实调用链

选择档案只改变 React UI；靠近 E 打开输入区并通过 GET 读取本访客历史；实际发送才执行 `POST /api/npcs/{id}/chat → chat-service.chat → modelReply → town_private_chats`。

私人聊天从不写 `town_worlds`，不会暂停或重置 NPC 的 `ongoing`。世界照旧 `wake → 短行锁事务 → advanceWorld/progressAction → 保存 → Pixi 同步`。所谓“交谈占用”的最长时间在此设计中为 **0 秒**：不等待玩家关闭、发心跳或回到场景才能恢复；闲置窗口、刷新、离线不产生 NPC 租约。模型等待时也不持有世界事务锁。

同 NPC 回复的 PostgreSQL advisory lock 只防止并发覆盖私聊，并不参与世界决策。现有适配器模型超时配置上限 10 秒；finally 解锁，连接/进程退出由 PostgreSQL 释放。实测 2500ms 超时、503、冲突访客 409、浏览器关闭、等待期间后台重启后再次聊天均可用。原公共自主对话的有限轮次、关系、记忆机制保留；忙碌工作仍由原 `busyReason` 提示，不抢占任务。

以下为最终真实浏览器运行的部分逐秒时间线（控制种子阿晴饥饿64，原规则达到阈值后去吃饭，不是固定路线脚本）：

| 世界时刻 | 操作阶段 | 后台阿晴状态 |
|---|---|---|
| 08:02 | 仅开档案并自动运行 | `action:3:aqing`，社交进度1000ms |
| 08:10 | 输入区打开、不发送 | 同一行动进度5000ms |
| 08:12 | 输入区空闲 | 社交完成，下一步重新决策 |
| 08:38 | 回复后仍开着窗口 | `action:25:aqing`，走向咖啡馆，位置(512,358) |
| 08:46 | 窗口仍打开 | 到达门前(754,324) |
| 08:48 | 窗口仍打开 | 合法进入 `cafe_interior`，(460,486) |
| 08:50 | 窗口仍打开 | `action:31:aqing`，进食1000ms |
| 08:54 | 关闭聊天 | 同一进食行动3000ms |
| 09:08 | 另一居民模型超时期间 | 已离开咖啡馆，沿合法路径走回广场 |

完整6居民位置、行动ID、进度、需求、世界版本与采样时间在 `web/evidence/v10-4/final/result.json`；动作前后没有重复结算或因私聊重建行为。

## 坐标与兼容

- 12 个室外入口、12 个室内、所有墙体/障碍、NPC身份和存档字段不变。石溪居正门仍 `(2530,1230)`，返回脚点仍 `(2530,1234)`。
- 玩家 `movePlayer` 与 NPC `findScenePath` 共用 `SCENES/canStand`；9单位足底半径保留，西墙依然阻挡横向穿墙。新增地面只扩大合法集合，不使旧位置和已保存路线失效。
- 原几何哈希测试仍核对**剔除两段新增通路后的全部旧几何**，不是把旧哈希换成新的值掩盖变化。单元测试另验西/东/前方路径、门口选择、安全返回和树冠避让。
- 主世界只读备份版本757；应用重启后 API 完整 JSON 一致。原快照通过 `restoreWorld`，副本300步合法；未写主库或重置存档。
- 本轮只用原图集与原创代码绘制，没有下载/复制参考资源，无新素材授权问题。

## 检查与命令

在 `web/` 执行；所有自动化模型指向明确的本机替身或 Fallback，使用55488独立测试库和随机world ID，主库55487不参与故障注入。

| 检查 | 实际结果 |
|---|---|
| `npm run typecheck`、`npm run lint` | 通过 |
| `npm test` | 23文件、138测试通过；1200步长期回归此前约25秒触发20秒上限，仅改为60秒，不删步数/断言；失败日志保留在任务工具记录 |
| `npm run build` | 生产构建通过；3100 已使用本轮构建 |
| `node --env-file=.env.test.local --import tsx scripts/v10-4-check.mjs --before` | 真实修复前复现、录屏、模型错误/超时、工坊往返与石溪居西侧阻挡 |
| 同脚本（无 `--before`），`EVIDENCE_DIR=evidence/v10-4/final` | 正常回复/空闲/关闭继续推进；多访客冲突/关闭页面/等待时杀进程后释放；工坊桥头往返；石溪居西/东/前方进入退出。9次本地替身请求，外部调用0 |
| `scripts/v10-interaction-check.mjs` | 键鼠近距离E、输入隔离、等待期间移动/镜头/送食物、2500ms超时、室内聊天、忙碌工作反馈、刷新均通过；3次本地替身请求 |
| `WORLD_ROSTER=legacy` + `scripts/v10-db-check.ts` | 6组并发/干预检查通过，重复wake不加速、送食物影响真实决策 |
| `scripts/v10-private-check.mjs` | 6组访客隔离、安全Cookie、模型额度、生产初始化保护等通过 |
| `scripts/v10-recovery-check.ts --restart-test-postgres` | 校验测试容器端口/卷后真实重启PostgreSQL；世界与2份私聊一致、同一行动ID继续+1000ms；主库未重启 |
| `scripts/v9-final-tour.mjs` | 最终独立复测通过：12栋全部真实键盘到门、进入、室内移动、退出，各重复进出3次，对象计数稳定；额外长途返回杂货店及1366×768全景通过、页面异常0。初次全部12栋进出后额外返程曾等待超时；没有改这段路线/放宽移动断言，增加诊断后复测通过，未确定首次超时原因，不归为已修复碰撞问题。失败证据保留。 |

脚本前置环境变量用 PowerShell `$env:EVIDENCE_DIR='evidence/v10-4/相应目录'`；恢复检查另设 `$env:CHAT_EVIDENCE='evidence/v10-4/interaction/result.json'`。不要改成主库运行。

## 实际截图与录屏

工坊两张均1440×900、相同玩家起点(1670,1000)、100%镜头；角色种子相同，地图照片来自真实Pixi页面。

- [工坊改造前](../web/evidence/v10-4/before/06-workshop.png) / [工坊改造后](../web/evidence/v10-4/final/06-workshop.png)
- [石溪居侧面改造前](../web/evidence/v10-4/before/08-stone-west.png) / [侧路与树冠修复后](../web/evidence/v10-4/final/08-stone-west.png) / [真实室内](../web/evidence/v10-4/final/09-stone-interior.png)
- [旧的过期交谈提示](../web/evidence/v10-4/before/04-resumed.png) / [NPC跨场景后正确提示](../web/evidence/v10-4/final/04-resumed.png) / [正常测试替身回复](../web/evidence/v10-4/final/03-reply.png)
- [交谈与自动行动时间线录像](../web/evidence/v10-4/final/conversation-timeline.webm)
- [模型等待时关闭浏览器录像](../web/evidence/v10-4/final/close-during-reply.webm)
- [工坊—桥头往返录像](../web/evidence/v10-4/final/workshop-walk.webm)
- [石溪居多方向进出录像](../web/evidence/v10-4/final/stone-approaches.webm)
- [12栋连续步行与反复进出录像](../web/evidence/v10-4/twelve-doors-final/interior-walk.webm)，结果与26张截图见同目录 `result.json`。

录屏没有拼接不同世界；为各局部测试创建了独立浏览器玩家起点，之后路程均由实际键盘移动。未把测试起点放置冒称为从原广场走来。`before`、`after`（发现树冠遮路的中间版）、`final`、失败目录分别保留。

## 修改清单与边界

本轮业务/前端：`chat-feedback.ts`（新增）、`Town.tsx`、`ChatDialog.tsx`；地图：`town-map.ts`、`scene-ground.ts`、`town-landscape.ts`；验证：`v10-4.test.ts`、`v10-4-check.mjs`（新增）、`living-slice.test.ts`、`residents.test.ts`、`v10-interaction-check.mjs`、`v9-final-tour.mjs`（增加超时位置诊断）；文档：本文件、AGENTS、spec。

已有黑屏修复保持原样，`TownScene.tsx` 和分区测试的未提交变化属于上轮，未算成本轮新增功能。

限制：NPC不会因玩家打开输入框而转身或等候；共享世界中优先维持真实行动。原地阅读/社交可以连续被决策选择，本轮不改变人设和权重。未调用真实付费模型，不能把本机替身截图当真实供应商验证。完成这三项后停止。
