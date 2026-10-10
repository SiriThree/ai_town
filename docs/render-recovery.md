# V10.2 黑屏修复（2026-10-10）

基线 `502f429`，开始时工作区干净。本次仅修复用户截图中的场景启动失败，不继续扩图或行为开发。

## 实际原因

在 Codex 内置浏览器重新加载生产页，复现黑屏。补充启动异常记录后，独立诊断端口 3110 复现：`TypeError: Cannot read properties of undefined (reading 'tone')`，调用链为 `drawGround → drawTown → mountScene`。

旧地形代码先把区域 ID 写入 Canvas 红色通道，再通过 `getImageData` 读取并索引 `LANDMARKS[d-1]`。当前浏览器返回的区域值使此索引越界。这不是 WebGL 不可用；WebGL Canvas 已经创建。颜色读回为何发生差异尚未进一步定位，不能断言具体浏览器隐私设置所致。原通用错误提示掩盖了真正原因。

## 修改

- `web/src/lib/town-landscape.ts`：`districtMask` 按已定义多边形和像素中心直接生成区域编号，后定义区域覆盖先定义区域，编号只能为 0–7。
- `web/src/components/scene-ground.ts`：使用几何分区掩码，删除颜色编码及 `getImageData` 依赖。Canvas 仍用于生成原有地表纹理。
- `web/src/components/TownScene.tsx`：保留启动异常诊断，用户提示不再错误归因于 WebGL。
- `web/tests/town-landscape.test.ts`：增加真实地图分区边界、重叠、合法编号与几何一致性回归。

建筑、入口、碰撞、世界状态、AI 和数据库代码均未修改。

## 本轮执行

- `npm run typecheck`：通过（构建后再次通过）。
- `npm run lint`：通过。
- `npm test`：22 个测试文件、134 项测试通过。
- `npm run build`：生产构建通过。
- 停止本项目旧 3100 进程，构建后以 `npm start` 启动；诊断 3110 进程已停止。自动 NPC 模型调用保持禁用，未执行任何聊天/付费模型请求。
- 内置浏览器实际验证：生产页 `data-ready=true`，正常地图恢复；用键盘激活全景按钮，缩放变为 25%，完整地图显示；选择阿晴后真实档案打开；刷新后选择保留、场景恢复。浏览器工具的鼠标点击未稳定触发，本次交互证据以键盘激活为准。
- 后台重启前后 `/api/world` 完整 JSON 逐字一致，版本 661、世界分钟 6960。没有推进、重置或修改存档。

本地证据：`web/evidence/render-recovery/`（ignored）：`console.json`、`restored-play.png`、`restored-overview.png`、`resident.png`、`world-before.json`、`world-after.json`。控制台文件含修复前已捕获的诊断；不要把历史日志当作修复后再次报错。

本轮未重复执行全部建筑进出、聊天、数据库服务重启测试；它们不是这次纯地形渲染修复的新增验证结论。完整 V10.2 原验收记录保留。
