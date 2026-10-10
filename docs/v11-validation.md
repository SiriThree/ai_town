# V11 验证记录

## V11.1 玩家认识与真实记忆

根因：签名 Cookie 已能在30天内识别同一访客；主库只读计数确认阿宁有4轮、阿晴1轮，记录未丢失。模型仅读最近4轮；没有玩家关系记录；降级的“记得”分支错误读取NPC公共亲历。没有输出主库私聊原文。

修复：`town_private_chats.player_memory` 可空增量列；旧保留历史在下一次交谈时按真实轮次建立熟悉信息，首个来源与最近8次互动长期保留，称呼仅接受明确自报。认识、称呼、熟悉与信任/好感分开，后两者不因普通聊天增长。资料仅按签名访客+世界+NPC读取，进入模型playerAcquaintance；降级优先查询同一私有证据，公共事件完全不变。Cookie清除/30天过期/换设备/签名密钥轮换会失去身份；不声称跨身份认人。

实测：141项单元、typecheck、lint、生产build通过；`v11-memory-check.ts`真实隔离PostgreSQL验证首次/再次/称呼/跨天、访客隔离、聊天不改世界、关系值不增加。`v11-browser-check.mjs`真实Chromium验证E打开、两访客、刷新和后台进程重启、503及600ms超时降级。7次本机模型替身，外部调用0。截图录像与result.json在`web/evidence/v11/memory-browser/`。首次两次浏览器脚本在刷新后的档案初始化时过早按E，改为等待并点击已显示的档案对话入口，最终通过；无代码功能改动掩盖测试。

未验证：真实供应商对新上下文的遵循程度；当前证据为本机可控替身和真实降级。未进行付费调用。

## V11.2 咖啡馆会合约定

根因：旧聊天仅输出语言，既无意图执行入口也无持久约定；“好啊”不能代表执行。新增小范围中文邀请识别及独立私有`town_invitations`记录，以服务端Cookie确定发起者；明确请求UUID用于幂等，同号换内容409。后台在原世界行锁事务内确认结果、写私聊证据和世界约定；没有事务内模型调用。受控结果用本地简短台词，普通聊天继续真实模型适配。

公开NPC仅增加不含访客身份/原文的appointment：目标、状态、期限及原因。私人关联、请求、拒绝/推迟、历史结果独立保存。每居民最多一个进行中约定；体力低、陌生且心情低、工作冲突或路线不可达会拒绝/推迟，推迟未预约需再邀请。接受后完成当前行动；低精力/饥饿/重要工作优先但保留约定；最迟600世界分钟未到达则明确失败。到达仅指NPC真实进咖啡馆，等候60世界分钟后恢复生活，不宣称玩家已到或实现跟随。取消不撤销已提交的移动。

调用链：POST私聊→签名访客→NPC回复锁→识别/规则确认→短世界事务+私有记录→下一次原advanceWorld→现有持续行动/路径/门户→到达事件和私有结果同事务保存。普通决策权重、地图坐标、原存档未变。无新字段的旧世界原样恢复。

验证：146项单元、typecheck/lint/build通过；新增5项规则测试含需求中断后恢复、超期失败、有界等候、旧存档。真实PG7组含接受、重复/冲突请求、越权取消、暂停、路线/入口到达、结果回忆、并发推进/送食物、低精力拒绝。`evidence/v11/invitation-accepted-browser/`录屏实际完成：初识→记住称呼→邀请→重启后台保留→自动赴约→玩家从广场步行进咖啡馆→查询真实到达结果，7次本机替身，0外部模型调用。

浏览器发现并修复：邀请改变世界版本后立即开始运行可能409，现在回复后同步权威世界；另一居民站在门口会抢E目标，现在合法门口优先进入，门外再与居民交谈。失败证据保留在invitation-browser与invitation-final-browser。

生产兼容：schema.sql新增表，健康检查检查新列/表，原有最小权限grants只增新表SELECT/INSERT/UPDATE；未执行部署。真实供应商对新邀请记忆的语言表现仍未验证；确定性执行与结果回复不依赖模型。

## V11.3 游戏界面与最终回归

默认顶部只保留名称、时间、运行/暂停、手动推进及帮助；移除常驻wake解释、存档版本与六居民小字列表。档案保留真实属性，送食物只随档案出现。聊天为场景底部680px以内轻量输入，气泡260px宽、短句76px/两行100px高，仅台词与人物名；省略号打开完整原文历史。保留原30字标点分行逻辑，不裁掉数据库原文。聊天期间隐藏重复E提示，不遮住角色；地图/动画/坐标不改。

「帮助→开发诊断」明确勾选才展示AI/Fallback/替身来源、时间版本、轮次ID、坐标、决策原因和公共交流未采用原文。隐私、Cookie期限、共享世界、离线限制及邀请玩法集中在帮助。访客专属GET返回约定，简短会合反馈取其真实状态；其他访客看不到私人邀请。公开行动仍可观察，不承诺隐身行动。

回归时补充：重复新邀请遭拒绝后，查询优先显示本人仍在进行的约定；工作冲突明确推迟；发起者取消只释放约定、不打断已开始的合法路径；“阿宁，陪我去咖啡馆吧”等常用表达支持受控识别。不是任意自然语言执行器；复杂/含糊措辞可能需按示例重说。自报称呼的降级回复会确认称呼，但不会把“我叫你去咖啡馆”当名字。

### 实际执行

以下均在`web/`，数据库脚本使用本项目`.env.test.local`，先核对loopback:55488/ai_town_mvp_test，再创建随机世界；模型仅本机替身或禁用。

| 命令/验证 | 实际结果 |
| --- | --- |
| `npm run db:init:test` / `npm run db:init` | 增量添加列/表，无重置、无重播种；主世界757/7146分钟逐字段与既有快照相同 |
| `npm run typecheck` / `npm run lint` | 通过 |
| `npm test -- --reporter=dot` | 25文件147项通过，含原有门户、12建筑路径、持续行动、社交、工作、关系、模型及Cookie测试 |
| `npm run build` | Next生产构建通过 |
| `node --env-file=.env.test.local --import tsx scripts/v11-memory-check.ts` | 初识/重复/称呼/跨天与隔离通过；普通聊天不改世界/信任/好感 |
| `node --env-file=.env.test.local --import tsx scripts/v11-invitation-check.ts` | 真实路径赴约、幂等、冲突/取消权限、暂停、到达记录、并发推进/送食物、工作推迟、低精力拒绝通过 |
| `$env:V11_STAGE='game-ui'; node --env-file=.env.test.local --import tsx scripts/v11-browser-check.mjs` | Chromium真实E交互→认识→邀请→后台重启→自动赴约→玩家键盘从广场走进咖啡馆→回忆到达；两访客隔离、503/超时、输入焦点、送食物、1440×900及1366×768通过；最终运行7次本机替身，0外部调用 |
| `node --env-file=.env.test.local --import tsx scripts/v11-recovery-check.ts --restart-test-postgres` | 实际重启隔离PG容器，2世界、4私聊/记忆、5约定逐字段相同；未完成行动同ID续进1000ms；主库未重启 |
| `node --env-file=.env.test.local --import tsx scripts/v11-security-check.mjs` | 6组：生产Secure/HttpOnly/Strict签名Cookie、两访客上下文隔离/伪造归属无效、篡改401/跨站403/生产初始化403、故障降级与重启预算不清零、双访客共享时钟、缺签名秘密失败关闭；3次本机替身 |
| `$env:EVIDENCE_DIR='evidence/v11/permissions'; node --env-file=.env.test.local --import tsx scripts/v52-permissions-check.mjs` | 2组最小权限通过；测试角色随后NOLOGIN且移除口令，保留测试数据 |

浏览器测试使用有明确标记的本地玩家起点夹具（广场阿宁附近）；赴约之后所有路程由真实键盘操作与原碰撞完成，不将夹具摆放宣称为玩家已走过。场景数据源始终是实际HTTP/PostgreSQL。新的游戏UI脚本初次把本人8轮误计为9轮而失败，修正测试计数后通过，没有删记录凑验收。

### 截图、录像（运行页面）

- 同一1440×900、同一广场起点与100%缩放：[改造前对白与输入](../web/evidence/v11/invitation-accepted-browser/02-recognition.png) / [改造后](../web/evidence/v11/game-ui-browser/02-recognition.png)。新UI释放了场景高度，建筑/人物素材未变。
- [默认游戏界面](../web/evidence/v11/game-ui-browser/01-town.png)
- [接受邀请](../web/evidence/v11/game-ui-browser/05-invitation.png)
- [真实咖啡馆会合与结果回忆](../web/evidence/v11/game-ui-browser/06-meeting.png)
- [完整历史](../web/evidence/v11/game-ui-browser/07-game-history.png) / [明确开启诊断](../web/evidence/v11/game-ui-browser/08-diagnostics.png)
- [居民详情与食物状态变化](../web/evidence/v11/game-ui-browser/09-profile-food.png) / [1366×768](../web/evidence/v11/game-ui-browser/10-1366.png)
- [完整实际操作录像](../web/evidence/v11/game-ui-browser/journey.webm)
- 主世界只读复核：[原档案](../web/evidence/v11/before/main-profile.png) / [新档案](../web/evidence/v11/after/main-profile.png)；应用内浏览器一次fullPage截图接口失败，改用实际viewport截图。主要标准尺寸对比以上述Chromium截图为准。

### 代码与限制

V11.1：player-memory/chat-context/chat-service、schema.sql、记忆单测和数据库/浏览器脚本。
V11.2：appointments/invitation-store、world/store/social、chat路由/types/context/service、ChatDialog/Town、interaction及测试、health和新增表最小权限。
V11.3：Town/TownScene/ChatDialog/globals.css、验证脚本；补齐上阶段关系称呼/邀请边界回归。没有新素材、地图改动或NPC，全部沿用现有授权资源。

本地检查点：基线4aeed9a（保留已完成V10.4与渲染修复），V11.1为74aa7ef，V11.2为7d55707；V11.3为本记录所在提交。未推送、未部署。

限制：同一匿名身份30天内稳定，清除Cookie/换设备不互认；仅显式自报称呼，熟悉不等于信任与好感。私有经历保留首遇和最近8次互动，私聊全文仍按已有20轮上限，约定事实独立持久保存。邀请采用小范围中文规则，忙碌推迟需要稍后重邀；约定到达后有界等候，暂停世界时停止计时。玩家位置仍在前端，因此只证明NPC到场，不声称服务端确认双方同时在场。真实模型配置/适配保持，V11新增上下文尚未执行真实供应商验收；不能把本机替身算成真实AI成功。没有新增付费调用、地图美术、职业或长期记忆框架。三阶段完成后停止。
