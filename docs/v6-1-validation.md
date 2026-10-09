# V6.1 玩家与咖啡馆：实际验收

2026-10-09，Windows本机，Next.js 16.4.0 / React 19.3 / PixiJS 8.22 / Node 24.14.1。未改部署准备，也未提交或推送Git。修改前已检查工作区，原自建应用/文档均尚未提交；哈希基线保存在 `web/evidence/v6-1/baseline.json`，用来区分本轮增量，不能把所有未跟踪文件都算作本轮新增。

## 实现与边界

- `player-scene.ts`：可读的两场景表，矩形可行走区域与家具障碍，入口半径、目标场景、安全出生点。角色足底半径9，速度132世界单位/秒；斜向归一，单帧最多50ms、每子步最多2单位，按轴碰撞滑动。室外通道沿原道路/入口，建筑、围栏和非开放草地不可穿越。碰撞是粗略足底体积，不是贴图像素级检测。
- `use-player.ts`：仅维护本地玩家和键盘。失焦/隐藏/输入框/面板时停步；E拒绝重复按住，核对当前场景合法入口和距离，才切换并设置安全站位。停止及定期写当前标签页sessionStorage；刷新校验恢复，家具内/未知版本数据回安全点。
- `TownScene.tsx`：同一个Pixi Application，切换时销毁旧场景对象、保留共享纹理，再挂载新地面、独立家具和玩家。室内9个、室外35个对象，多次往返计数不增长，页面只有一个canvas。`scene-ground.ts`复用静态室外纹理，避免每次进出新建地表纹理。
- 脚点→`playerPose`对齐2单位栅格→玩家精灵/阴影/脚点排序→`sceneTransform`映射到画布及HTML标记。地图缩放、拖动与按键移动独立；室内外镜头分别保存，回到室外恢复原镜头。玩家高64世界单位，与既有居民比例一致。
- 入口链路：`town (762,320)` 半径20→E→`cafe_interior (480,486)`朝北；出口 `(480,494)` 半径22→E→`town (762,324)`朝南。家具数据同时驱动绘制位置和碰撞体，不是Modal或场景截图遮罩。
- `Town`继续负责原世界HTTP轮询，室内也自动唤醒；聊天组件保留挂载，仅隐藏室外输入区，返回保留草稿和原回复。现有NPC全部经`residentScene`归属于town，没有新增假店员。室内不显示室外居民或其气泡。

没有修改世界/NPC数据结构、API、决策、数据库表/事务、AI适配器/Fallback、Cookie私聊归属或已保存的NPC路径。玩家是本地化身，不会进入后台决策、世界事件或其他访客画面。关闭标签页/换浏览器不保证找回玩家位置，世界与私聊仍由原PostgreSQL持久化。

## 实际执行

以下命令均在 `web/` 执行。数据库测试仅使用 `.env.test.local` 的 `ai_town_mvp_test`、独立端口及唯一世界ID，不删除旧证据或已有存档。

| 命令 | 结果与证据 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过 |
| `npm test` | 8文件、67项通过；新增6项玩家/碰撞/入口/恢复/镜头测试 |
| `npm run build` | 生产构建通过，原API路由保持 |
| `npm run test:v61` | 6组真实浏览器流程通过；端口3112，外部AI显式禁用，0页面异常；`web/evidence/v6-1/scene/result.json` |
| `$env:EVIDENCE_DIR='evidence/v6-1/chat-regression'; npm run test:chat` | 9组通过；成功调用仅本地替身，网络/服务/空响应/超时降级，超时实测886ms；无外部模型调用 |
| `$env:EVIDENCE_DIR='evidence/v6-1/db-regression'; npm run test:v3:db` | 6组真实PG通过；控制其他条件，未送食物下一步去咖啡馆，送后选择社交；重复/并发不覆盖 |
| `$env:EVIDENCE_DIR='evidence/v6-1/motion-regression'; npm run test:v42` | 6组通过；NPC真实路径/方向/中途更新、气泡跟随、镜头、暂停、干预与两分辨率 |
| `$env:EVIDENCE_DIR='evidence/v6-1/private-regression'; npm run test:v52` | 6组通过；访客隔离、篡改Cookie、模型预算、服务重启和双访客时钟；3次本地替身、0外部请求 |
| `$env:EVIDENCE_DIR='evidence/v6-1'; node scripts/delivery-scan.mjs` | 本项目已知密钥未出现在扫描源码/资源/文档或33个客户端构建文件，客户端无数据库连接串；不是第三方安全审计 |
| `npm run start` 后比较 `/api/world` | 原3100世界版本52、分钟940、暂停，重启前后JSON完全相同；`local-restart.json` |

V6.1浏览器用真实WASD走到入口，室内走到桌椅及北墙验证阻挡，再返回。三次重复进出验证对象计数/镜头；室内刷新位置恢复，室内自动推进后返回显示最新NPC坐标；输入时按键不误移动，草稿/气泡/历史保留；送食物、手动推进、后台进程重启后恢复PG和私聊。最后单独注入家具内错误玩家数据，验证安全回退；主流程未用脚本直接摆放玩家。

迭代中修正：书柜初始落位超出镜头，已下移并同步碰撞；复用地表纹理。测试最初等待不足和亚像素碰撞余量导致严格相等断言失败，改为等待抵达边界并断言不穿透且余量≤2；错误存档测试改为新页面初始化前注入，避免被正常pagehide保存覆盖。没有为让测试通过而放宽实际碰撞。旧测试失败图和本轮最终结果分开，最终通过以`scene/result.json`为准。

恢复本机预览时，`Start-Process`后台启动命令被自动审批以“策略阻止”拒绝；随后通过工具管理的 `npm run start` 正常启动，未申请提权或改服务器配置。

## 实际运行证据

| 画面 | 文件 |
| --- | --- |
| 初始室外化身 | [01-outdoor-avatar.png](../web/evidence/v6-1/scene/01-outdoor-avatar.png) |
| 咖啡馆门前 | [02-cafe-door.png](../web/evidence/v6-1/scene/02-cafe-door.png) |
| 完整室内1440×900 | [03-interior-complete.png](../web/evidence/v6-1/scene/03-interior-complete.png) |
| 桌椅阻挡 | [04-furniture-collision.png](../web/evidence/v6-1/scene/04-furniture-collision.png) |
| 北墙阻挡 | [05-wall-collision.png](../web/evidence/v6-1/scene/05-wall-collision.png) |
| 返回同一门口 | [06-return-outdoor.png](../web/evidence/v6-1/scene/06-return-outdoor.png) |
| 原场景对话 | [07-preserved-chat.png](../web/evidence/v6-1/scene/07-preserved-chat.png) |
| 室内观察推进后世界 | [08-interior-world-running-state.png](../web/evidence/v6-1/scene/08-interior-world-running-state.png) |
| 室内1366×768 | [09-interior-1366.png](../web/evidence/v6-1/scene/09-interior-1366.png) |
| 室外1366×768 | [10-outdoor-1366.png](../web/evidence/v6-1/scene/10-outdoor-1366.png) |

[实际进入、走动、碰撞、退出录屏](../web/evidence/v6-1/scene/cafe-enter-walk-exit.webm)，来自Playwright启动的真实浏览器和生产构建；不是设计稿或预制角色视频。截图为隔离测试世界，原开发存档保留。

## 素材、文件及后续缺口

参考仅定向查看本地my_ai_town室内居民对话截图、地图运行层与角色呈现代码。采用木地板/后部瓷砖、柜台与独立桌椅、中央留通道的构图，没有复制其源码或素材。两张新生成PNG及精确帧框见 [资产说明](../web/public/art/v6-1/ASSETS.md)，地面/墙/门为自绘。生成帧仍有细节跳动，西向镜像东向，地板和生成家具细腻度存在差距，未声称达到完整参考美术水平。

改动既有：`AGENTS.md`、`docs/spec.md`、`web/README.md`、`web/package.json`、`web/src/app/globals.css`、`web/src/components/Town.tsx`、`TownScene.tsx`、`scene-ground.ts`、`web/src/lib/scene-view.ts`。

新增：本记录、`web/src/lib/player-scene.ts`、`web/src/components/use-player.ts`、`player-art.ts`、`player-frames.json`、`cafe-frames.json`、`web/tests/player-scene.test.ts`、`web/scripts/v61-scene-check.mjs`、`web/public/art/v6-1/{player-walk.png,cafe-furniture.png,ASSETS.md}`。本轮运行证据在忽略提交的`web/evidence/v6-1/`。无新依赖，package-lock不变。

下一阶段若实现NPC跨场景，需给后台NPC保存场景归属、定义合法门户转换及每个场景路径/动作，再扩充事务和恢复测试；前端`residentScene`接真实字段并按当前场景过滤。不能仅把室外NPC画进室内。本轮没有这项功能，也没有玩家跨设备存档、触屏控制、家具操作或多人化身同步；没有进行新的外部付费模型调用，之前真实AI验证记录仍保留。到此停止。
