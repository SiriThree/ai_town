# V5.2 部署准备与本地验证记录

日期：2026-10-09。**尚未连接或修改目标 Linux 服务器，未公开发布。** 本文只登记本轮实际运行结果，操作顺序见 [deployment.md](deployment.md)。Windows 工作区根目录和 `web/` 均不是 Git 仓库，无法提供 Git diff/commit；修改前文件哈希保存在 [baseline-hashes.json](../web/evidence/v5-2/baseline-hashes.json)，已有文件变化见 [changed-existing.json](../web/evidence/v5-2/changed-existing.json)。参考项目、素材、世界规则、存储事务、模型适配和旧验证记录未改动。

## 1. 环境与构建

| 环境 | 实测 / 待确认 |
|---|---|
| 目标服务器 | 仅用户提供2核/4GB/无GPU；发行版、架构、磁盘、Swap、Node/PG/Caddy、端口、现有服务、防火墙均待预检 |
| Windows 本地 | 当前项目生产构建与 PostgreSQL 独立测试库；3100 本地服务已恢复 |
| 本机 WSL | Ubuntu 26.04 LTS、Linux x64，约15.5GB内存/4GB Swap；不是目标2核4GB服务器 |
| Linux 构建 Node | 官方 Node 24.14.1 Linux x64包，核对官方SHASUMS；仅解包到隔离用户目录，无系统安装/Swap修改 |
| Linux 运行演练 | 新建临时 `postgres:17` 容器，使用本机缓存镜像，2CPU/2GB限制，PG目录tmpfs；仅127.0.0.1:3111映射，不暴露PG端口；结束后只移除本次容器 |

WSL实际运行 `bash web/deploy/linux/build-release.sh <web源码> <独立构建父目录>`：Linux `npm ci` → typecheck → lint → 61单元测试 → standalone生产构建，全部通过。构建脚本不复制Windows node_modules、.next、.env；产物包含server.js、public、.next/static、追踪依赖、数据库维护SQL、平台元数据与校验和。

最终构建见 [linux-build-final.log](../web/evidence/v5-2/linux-build-final.log)。`/usr/bin/time -v`本次缓存构建19.25秒，最大进程RSS 1,289,944KB（约1.23GiB），Swap计数0；首次构建92秒。这不是所有子进程总峰值，也不是目标机器性能或并发能力承诺。模板暂设两个构建worker、构建堆2GiB，运行堆768MiB、systemd内存上限1.5GiB、PG连接池5；目标其他服务占用尚未确定。

已保存实际通过Linux运行演练的 [Linux x64产物](../web/evidence/v5-2/ai-town-linux-x64.tar.gz) 与 [SHA256](../web/evidence/v5-2/ai-town-linux-x64.tar.gz.sha256)。只适用于核实架构及运行兼容性后的Linux环境。后续源码改变应重新构建，不把本地Windows包当生产包。

## 2. 实际验证

以下 npm 命令在 `web/` 执行；浏览器/数据库测试设置独立 `EVIDENCE_DIR=evidence/v5-2/<项目>`，只用 `ai_town_mvp_test` 和随机世界ID，不覆盖以前证据。模型替身只监听loopback，**本轮外部真实模型调用为0**。

| 命令 / 检查 | 实际结果 | 证据 |
|---|---|---|
| `npm run typecheck`、`npm run lint`、`npm test`、`npm run build` | 最终Windows检查通过；7文件61测试；Next生产构建通过 | [本轮构建日志](../web/evidence/v5-2/build.log)、Linux同样完整检查日志见上；最终终端检查21:24通过 |
| `npm run db:init:test` | 仅增量建表，未重置/播种测试世界 | `scripts/init-db.ts` + `schema.sql` |
| `npm run test:v52` | 最终6组通过：访客与NPC隔离、生产Cookie、篡改/跨站拒绝、额度跨访客/重启有效、双访客只推进一次、旧共享历史保留/不公开 | [最终结果](../web/evidence/v5-2/private-final/result.json) |
| `npm run test:v52:permissions` | 2组：允许运行所需读写；拒绝旧共享历史SELECT、DELETE、world INSERT和DDL；测试角色已禁止登录并清空测试密码 | [权限结果](../web/evidence/v5-2/permissions.json) |
| `npm run test:chat` | 9组通过；无密钥/503/断连/空回复/超时降级、上下文和持久化；超时859ms结束等待 | [聊天结果](../web/evidence/v5-2/chat/result.json) |
| `npm run test:scene-chat` | 7组通过；场景气泡、缩放/拖动/离屏、切换/历史、推进与迟到回复隔离 | [场景结果](../web/evidence/v5-2/scene/result.json) |
| `npm run test:v51` | 4组安全回归通过；适配签名Cookie，不取消旧检查 | [安全结果](../web/evidence/v5-2/v51/result.json) |
| `npm run test:v3` | 8组浏览器回归通过，自动/暂停/手动/送食物/聊天 | [V3结果](../web/evidence/v5-2/v3/browser-result.json) |
| `npm run test:v3:db` | 6组真实PG并发检查通过；控制条件下原种子去咖啡馆，送食物后下一步社交；8个同时到期唤醒只推进一次 | [数据库结果](../web/evidence/v5-2/v3-db/db-result.json) |
| `bash -n deploy/linux/*.sh`逐个执行、`systemd-analyze verify` | 所有脚本和unit语法通过；unit复制到Linux文件系统0644再验证，未安装/启动systemd服务 | [语法结果](../web/evidence/v5-2/linux-syntax.log) |
| `node scripts/linux-runtime-check.mjs` | 4组通过：真正Linux产物 + Linux Node + 新PG集群；生产建库/授权脚本；实际HTTP/Pixi/推进/Fallback；进程重启恢复；实际备份脚本恢复新隔离库并核对世界/私聊/额度哈希 | [Linux运行结果](../web/evidence/v5-2/linux-runtime-final/result.json) |
| `npm run db:init`、`npm run start` | 本项目开发库只增量增加表；3100恢复，原世界完整一致：revision52、minute940、暂停状态 | [恢复对比](../web/evidence/v5-2/local-restored.json) |
| `EVIDENCE_DIR=evidence/v5-2 node scripts/delivery-scan.mjs` | 项目已有真实AI密钥在源码/示例/部署文件/客户端产物中0命中，客户端数据库连接串0命中；不是全盘/历史扫描 | [扫描结果](../web/evidence/v5-2/secret-scan.json) |

Linux运行命令所用本地变量（均不含秘密）为 `LINUX_RELEASE_DIR`、`LINUX_RELEASE_ARCHIVE`、`LINUX_NODE_BINARY`、`EVIDENCE_DIR`，对应WSL隔离构建目录。脚本只创建自己命名的临时容器，不修改已有容器/数据库，使用测试密码和测试Cookie密钥；测试配置未进入部署包。单次运行结束采样166.4MiB/2GiB、CPU1.26%，仅为该隔离演练的瞬时数据，不代表负载测试、生产峰值或容量。

### 保留的失败记录

- 初次访客测试在点击暂停后立即采样，未等待响应；补充等待成功响应与暂停UI确认后重跑通过。没有据此修改世界推进实现。见 `private.log` 和 `private-final.log`。
- 首两次Linux运行采用Windows文件复制，丢失 `.next/node_modules/pg-…` 指向依赖的符号链接，报 `ERR_MODULE_NOT_FOUND`。Linux原始产物中链接存在；改为Linux tar打包、Linux内解包后，完整运行通过。`build-release.sh`已输出tar与校验和；其打包步骤也单独实际执行并用于最终运行。保留 `linux-runtime.log`、`linux-runtime-verified.log`、`linux-runtime-final.log`。
- WSL直接检查Windows挂载文件时提示unit可执行/可写；改为Linux临时目录内0644副本后语法通过。这不是目标服务器已安装或服务权限已验证的证据。

## 3. 公开安全边界

已通过本地检查：HMAC签名归属、随机匿名ID、Secure/HttpOnly/SameSite Strict Cookie、生产缺密钥失败关闭、私聊不进入世界事件、旧共享聊天不可由运行角色读取、共享模型日额度/请求频率及并发限制、生产初始化403、无重置API、最小DB权限、错误脱敏、世界并发一致性。

公开前仍必须现场通过：真实HTTPS域名下的Cookie与双访客隔离、Caddy/转发头配置、80/443/3100/5432与IPv6防火墙、生产密钥权限/供应商预算、PG本机监听/HBA、磁盘持久化与异机备份、systemd异常自动恢复、失败部署自动回滚及手动回滚。没有任何目标服务器实测结果可以填“通过”。不能回滚到V5.1共享私聊实现。

世界仍共享：其他访客可以推进、暂停和送食物；聊天/费用额度也共享，可能被某人抢先用完。无账号、抗DDoS或每人公平额度保证；浏览器Cookie清除/到期后不能恢复原私聊。每会话只保留20轮，但匿名会话和备份总量没有自动清理，应约定保留期与磁盘监控。无人打开页面时不持续模拟。生产预检缺少资源余量时先评估，不自动增加Swap/限制其他服务。

## 4. 修改清单

- 私聊归属与健康检查：新增 `web/src/lib/visitor-session.ts`、`web/src/app/api/health/route.ts`；修改 `web/src/lib/chat-service.ts`、`web/src/app/api/npcs/[npcId]/chat/route.ts`、`web/src/components/ChatDialog.tsx`。
- schema/种子：新增 `web/scripts/schema.sql`、`web/scripts/export-seed.mjs`；修改 `web/scripts/init-db.ts`。只增加私聊表；旧表/世界保存结构保留。
- 测试：新增 `web/tests/session.test.ts`、`web/scripts/v52-private-check.mjs`、`web/scripts/v52-permissions-check.mjs`、`web/scripts/linux-runtime-check.mjs`；修改 `chat-check.mjs`、`scene-chat-check.mjs`、`standalone-check.mjs`、`v51-check.mjs` 的Cookie/测试配置，以及 `delivery-scan.mjs` 的扫描范围/输出目录。
- Linux部署新增：`web/deploy/linux/preflight.sh`、`build-release.sh`、`ai-town.service`、`Caddyfile.example`、`runtime.env.example`、`roles.sql`、`grants.sql`、`prepare-db.sh`、`health-check.sh`、`activate-release.sh`、`rollback.sh`、`backup.sh`、`restore-test.sh`、`runtime-check.sh`。
- 配置：`web/next.config.ts`限制构建worker；`web/package.json`增加两条V5.2测试入口；两个 `.env.example`增加空签名密钥；新增 `web/.gitattributes`确保脚本LF；`.gitignore`/`.dockerignore`排除运行秘密和数据库备份。未改变依赖或锁文件。
- 文档：`AGENTS.md`、`docs/spec.md`、`docs/deployment.md`、本文、`web/README.md`；新增 `web/evidence/v5-2/` 日志、结果、截图、哈希、Linux包和本地验证辅助脚本。旧阶段证据保持原样。

## 5. 实际截图

Linux standalone、真实PostgreSQL、无密钥Fallback：

![Linux实际运行](../web/evidence/v5-2/linux-runtime-final/01-linux-standalone.png)

两个独立浏览器访客各自的已保存回复（**本地模型替身，不是真实Qwen**）：

![访客A](../web/evidence/v5-2/private-final/01-visitor-a.png)
![访客B](../web/evidence/v5-2/private-final/02-visitor-b.png)

下一次执行需要：确认SSH连接方式/只读结果、实际架构与服务、域名/DNS和80/443共存方式、部署维护授权；用户在保护环境配置数据库密码、Cookie签名密钥、Qwen地域地址和密钥、供应商费用上限，以及备份位置/保留期。本轮停在准备，不自动发布。
