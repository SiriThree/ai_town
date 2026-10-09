# Ubuntu交付包验证

本次只准备交付，未登录朋友的新加坡服务器、未安装软件、未改服务或公开发布。操作入口为README-UBUNTU.md。实际系统参数以朋友预检为准。

## 当前来源

项目已关联 https://github.com/SiriThree/ai_town.git ，本地main跟踪origin/main。只读检查时远端提交为 `9c733846900191a7a6494fd310ba92fa621d6fb4`，只有LICENSE。本轮不推送、不触发Actions；远端还不能用作应用下载源。交付请用本次zip及SHA256。

现有聊天隔离源码已检查：visitor-session.ts的HMAC签名Cookie，chat route从已验证Cookie取得访客ID，chat-service.ts按world/npc/visitor查询。NPC ID更换不会改变访客归属；公共事件不保存聊天，气泡只来自本人聊天接口，无广播他人私聊。生产cookie为Secure/HttpOnly/SameSite Strict；新访客不能认领旧共享记录。未重写这些业务代码。

## 本轮本地检查

2026-10-09实际执行：

| 检查 | 结果 |
|---|---|
| Windows `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` | 通过，7文件61项单元测试；Next生产构建通过 |
| `npm run test:v52`，独立测试库与两个浏览器context | 6组通过，历史/模型上下文/NPC归属、Cookie篡改、事件隐私、共享额度、双访客自动时钟、重启恢复；3次本机替身、0外部模型调用 |
| 源码zip在WSL Ubuntu26.04解压、SHA256核对、Linux Node24.14.1构建 | npm ci/类型/lint/61测试/standalone打包通过，生成完整Linux x64 tar及校验和；不是Windows依赖 |
| `bash deploy/validate-local.sh` | Bash/LF/Python语法、拒绝覆盖Caddy片段/非法域名、systemd unit语法、运维脚本非授权用户拒绝边界通过；不安装/启动服务 |
| 源包SHA256、文件权限与密钥扫描 | 文件哈希一致、ZIP内文件0644、无真实.env/依赖/参考库/历史证据；项目已配置AI密钥在交付包和Git候选文件中0命中，客户端连接串0命中 |
| Caddy官方CLI解析、HTTPS证书、云端安全组/UFW | 本地未装Caddy，未执行；由朋友现场验证，不能记通过 |
| CI Actions | 模板已准备但未推送/触发；仅workflow_dispatch，无部署步骤 |

Windows与本机WSL检查都不代表目标服务器已部署。WSL资源多于目标2核4GB；一次缓存Linux构建19.10秒，time报告最大进程RSS1,291,504KB、Swap0，这不是所有进程总峰值或生产容量。构建时npm提示现有ESLint9.39.5已不再支持；本轮依赖与锁文件保持不变，未来工具链升级单独处理，不宣称依赖永远无漏洞。

打包复核修正了ZIP默认0600文件权限：最终ZIP显式0644，Linux新产物目录755、文件允许运行用户读取且禁止group/other写；激活脚本也检查可读/可遍历，避免管理员安装后Node读不到素材。第二次包含此修复的Linux构建通过（19.21秒、最大进程RSS1,250,788KB、Swap0）。最终交付仅后续文档/扫描说明文字更新，不改变应用或构建流程。

完整原始日志与双访客截图位于开发工作区 `web/evidence/ubuntu-handoff/`，这些私有开发证据不随源码zip上传。上一轮Linux运行、权限及备份恢复证据仍保留，但不是本轮目标Ubuntu实机验收。打包采用明确目录白名单；生产配置由朋友新建。来源为本项目源码和自有资源，未复制参考仓库资源。

## 朋友现场必填（当前全部未执行）

| 项目 | 结果 / 时间 / 脱敏证据 |
|---|---|
| Ubuntu版本/架构、磁盘内存/Swap、SSH/救援、端口无冲突 | 待填写 |
| Node24、PG17本机监听/HBA、独立库和最小权限 | 待填写 |
| systemd非root、3100仅回环、无覆盖存档初始化 | 待填写 |
| DuckDNS A/AAAA、云安全组、UFW、SSH仍可登录 | 待填写 |
| Caddy可信证书及HTTP→HTTPS | 待填写 |
| 两独立访客聊天/气泡隔离、生产Cookie | 待填写 |
| 地图/动画、双访客不加速、暂停/手动/干预 | 待填写 |
| 无密钥Fallback、授权一次真实Qwen及费用记录 | 待填写 |
| 刷新/重启存档、systemd异常自动恢复 | 待填写 |
| 备份恢复隔离库、异机备份 | 待填写 |
| 失败发布自动恢复/手动回滚安全旧版 | 待填写 |

没有付费模型负载测试。匿名记录总量、备份保留需运维约定；日预算全体共享，不能承诺访客公平额度或特定并发人数。不得回滚到共享私聊的旧版本。
