# V5.2 Linux 自托管部署准备（未发布）

更新：目标已明确为朋友管理的新加坡Ubuntu、2核4GB、有公网IP；具体Ubuntu版本/架构和端口仍待实际预检。由朋友部署，采用DuckDNS子域名。**当前执行入口改为根目录[deploy/README-UBUNTU.md](../deploy/README-UBUNTU.md)**，对应`deploy/ops/`；以下保留上一轮通用准备依据，不混用两套安装路径。Ubuntu包为Node独立安装选择`/opt/ai-town/node/bin/node`，不覆盖系统Node。用户提供的GitHub已关联，本轮未推送或发布。

本轮只做准备和本地隔离验证。**未获得目标服务器地址/SSH连接方式，未连接、安装、改服务或发布生产环境。** 已知目标为2核CPU、4GB内存、无GPU；发行版、CPU架构、可用内存/Swap、磁盘、现有服务/防火墙尚未确认。以下是systemd Linux通用模板，不冒称已经适配某个未知发行版。V5.1 Docker Compose配置保留为历史备选，当前主方案改为原生Node + PostgreSQL + systemd + Caddy。

## 1. 先做只读预检

脚本：[preflight.sh](../web/deploy/linux/preflight.sh)。获取授权连接方式后，可由维护者执行：

```powershell
# Windows本地，替换已确认的SSH别名。首次主机指纹由本人核对，不能绕过校验。
Get-Content -Raw web/deploy/linux/preflight.sh | ssh YOUR_CONFIRMED_HOST 'bash -s'
```

脚本读取发行版、架构、CPU/内存/Swap/磁盘、Node/npm/psql/Caddy/systemd版本、全部监听端口、运行服务、防火墙和PG监听配置。sudo仅用`-n`，无权限就记录缺项；不升级、停服务、改Swap/防火墙。不要把`systemctl show -p Environment`、环境文件或`/proc/PID/environ`贴进报告。必须检查80/443/3100/5432以及IPv6；端口已被使用时停止安装方案并确定共存方式，不能抢占。

项目锁定Next16.4.0、Pixi8.22.0、pg8.23.1；本地验证Node24.14.1/npm11.11、PG17.11。目标建议Node24、PostgreSQL17.x、Caddy2及支持模板指令的systemd。Next生产无需GPU，Pixi由访客浏览器绘制；Qwen-plus通过外部HTTPS API访问，不安装本地模型。最终安装包源、Node路径、PG unit名及配置文件路径须按实际发行版确定，当前不提供盲目执行的apt/yum覆盖命令。

## 2. 公开安全条件

V5.1共享聊天是上线阻断项，本轮已修改为共享世界 + 匿名私聊：

- `visitor-session.ts`使用32字节随机ID及HMAC-SHA256签名，30天有效。生产Cookie为`__Host-town_session`，`Secure; HttpOnly; SameSite=Strict; Path=/`，不设Domain。生产签名密钥缺失/过短/示例占位符时503失败关闭。
- 首次GET聊天建立Cookie；POST必须已有有效会话，否则401。归属只来自验证后的Cookie，URL/body中的visitorId不能指定别人。查询和模型历史均按世界、访客、NPC筛选；响应no-store，GET带Vary: Cookie。
- 新表`town_private_chats`保存每访客/NPC最近20轮，上下文只读4轮。旧`town_chats`保留，不归属给任何匿名人、不由新接口读取；生产运行角色也无权SELECT旧表。公开世界事件只含规则/干预生成文本，不写入聊天内容、访客ID或模型上下文。
- Cookie清除/到期、换浏览器或签名密钥更换后，旧私聊不能自动找回。同一浏览器配置下的标签共享会话；真正独立访客用不同浏览器配置/隐身上下文验证。这是访问隔离，不是端到端加密，数据库维护者和备份仍能读取；请勿发送敏感信息。
- 原每NPC会话锁继续限制同时最多一条回复（两NPC至多两条模型请求）；全世界30次聊天/分钟、60次模型尝试/UTC日，失败计数，额度耗尽Fallback。更换匿名Cookie不能刷新共享额度。不宣称有账号公平性或DDoS防护。
- PUBLIC_DEMO=true禁止HTTP初始化；无重置/删除API。世界更新使用既有行锁、版本校验和时钟，不因私聊改成独立世界。浏览器Origin保护、输入500字符/请求4096字节、API脱敏错误继续生效。

Cookie规则参考[MDN安全Cookie说明](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)。未配置生产Cookie密钥或未验证访客隔离前，不得开放站点。旧V5.1可执行版本会读共享历史，因此**禁止回滚到隐私协议升级前的版本**。

## 3. 目录、权限和服务

| 路径/组件 | 建议配置 |
|---|---|
| `/srv/ai-town/releases/<版本>/` | Linux产物，root持有、目录755/文件不可被group/other写；不含真实.env |
| `/srv/ai-town/current`、`previous` | root维护的版本软链接，原子切换；不手工覆盖正在运行的目录 |
| `/srv/ai-town/cache` | 仅此缓存目录由`ai-town`写；不存世界数据 |
| `/srv/ai-town/ops` | 本仓`deploy/linux/`脚本，root所有，不给运行用户写权限 |
| `/etc/ai-town/runtime.env` | root:root 0600；systemd读取后注入进程，不放入产物/日志 |
| `/var/backups/ai-town` | postgres持有0700，备份0600，另做加密异机副本 |
| OS用户`ai-town` | 独立系统用户、nologin、非root、无sudo权限 |
| Node | 一个standalone进程，仅127.0.0.1:3100 |
| PG | 本机专用库`ai_town_mvp`，不公开5432；与本地Windows两个库无关联 |
| Caddy | 仅必要80/443；保留已有SSH管理能力，不覆盖其他站点 |

模板：[ai-town.service](../web/deploy/linux/ai-town.service)、[Caddy站点片段](../web/deploy/linux/Caddyfile.example)、[生产环境模板](../web/deploy/linux/runtime.env.example)。systemd通过`env`启动参数固定production/PUBLIC_DEMO/loopback端口；重启策略on-failure，5秒间隔，120秒最多5次。内存High1GiB、Max1.5GiB、Node堆768MiB、TasksMax64，是本应用的保守初始约束，不限制其他服务；实际应观察RSS/OOM/延迟再调整。缓存可写，其他文件系统保护为只读。`/usr/bin/node`和`postgresql.service`须按预检结果核对，不能猜测安装路径。

连接池沿用上限5、连接/语句超时3/5秒；模型IO不持有事务，但保留每NPC会话锁，因此PG直连，不使用事务池。没有Worker/Redis/Kubernetes。浏览器唤醒推进，无人访问不持续运行，不无限补算。

## 4. Linux构建与安装（待授权执行）

**Windows的.next/node_modules不能上传当Linux包。** [build-release.sh](../web/deploy/linux/build-release.sh)检查Linux Node24，仅复制源码白名单到新目录，执行npm ci、类型/lint/测试、standalone构建。Next限制2个构建worker，Node构建堆上限2GiB；不会分配Swap或限制其他服务。若服务器余量不足，使用同架构Linux CI构建。总4GB不等于4GB都能给构建使用；不能承诺具体并发人数。

```sh
# 普通构建用户；两个路径是已核对的源码目录、独立可写构建父目录。
bash web/deploy/linux/build-release.sh /absolute/source/web /absolute/build-parent
```

脚本输出新的`town-build.XXXXXX/release`，保留源码构建目录，产物包含：`server.js`、追踪到的Linux运行依赖、`public/`、`.next/static/`、`.next/server`等Next文件、`maintenance/schema.sql`与从原createWorld生成的`seed.sql`、`release.json`（平台/架构/隐私协议2）、SHA256SUMS。不存在.env文件；不需要运行时npm install。完整性检查不代替来源信任，部署只接受本人构建产物。官方[standalone输出说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)说明public和static需要单独复制，本脚本已处理。

安装前核对CPU架构（x64/arm64）和Linux运行兼容性；不能把x64包装上ARM。Linux构建输出tar.gz及SHA256；保持压缩包原样SCP/SFTP传输，到Linux后解包，不在Windows解压重拷贝（实际验证发现这会丢失Next的pg别名符号链接）。源码或包在维护者确认后上传并核验SHA256，不上传两个参考仓库、本机.env、node_modules或测试私聊数据。新版本安装到新目录，示例：

```sh
# 仅确认新目录、用户和权限后由维护者执行；不存在才创建，已有内容先检查。
sudo install -d -o root -g root -m 0755 /srv/ai-town/releases /srv/ai-town/ops
sudo install -d -o ai-town -g ai-town -m 0750 /srv/ai-town/cache
sudo install -d -o root -g root -m 0700 /etc/ai-town
sudo install -d -o postgres -g postgres -m 0700 /var/backups/ai-town
# 从已确认可信的上传目录，先验证完整tar包。示例x64，必须匹配目标架构。
sha256sum -c ai-town-linux-x64.tar.gz.sha256
# VERSION替换为本次唯一版本号；mkdir遇到已有目录必须中止，不要加-p。
sudo mkdir -m 0755 /srv/ai-town/releases/VERSION
sudo tar --no-same-owner --no-same-permissions -xzf ai-town-linux-x64.tar.gz -C /srv/ai-town/releases/VERSION
sudo sh -c 'cd /srv/ai-town/releases/VERSION && sha256sum --check --quiet SHA256SUMS'
# 确认root所有、目录可遍历、文件不能group/other写；不更改其他项目目录。
# 复制本仓deploy/linux到ops；sudoedit填写runtime.env，再chmod 0600。
```

`ai-town`用户创建命令取决于发行版，确认不存在同名用户后再创建；不要接管已有账户。安装service前确认`/etc/systemd/system/ai-town.service`不存在或确属本项目；`systemd-analyze verify`通过后才daemon-reload。初次不enable到开机，先完成健康/重启验收再enable。

## 5. PostgreSQL初始化与秘密配置

先确认PG只监听127.0.0.1/::1或Unix socket；如已有共享PG不能擅自修改全局配置。审核`pg_hba.conf`，仅本机`town_app → ai_town_mvp`用scram-sha-256；如果现有策略不符合要求，等待维护者决定。防火墙/安全组不开放5432/3100。不要全局调整max_connections、shared_buffers或重启其他业务PG。

[roles.sql](../web/deploy/linux/roles.sql)创建独立NOLOGIN所有者town_owner、无superuser/createdb/createrole的town_app及新数据库；同名对象已存在时中止，不接管。密码用`psql`的`\password town_app`交互设置，不写ALTER PASSWORD明文命令。首次初始化顺序：

```sh
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -f /srv/ai-town/ops/roles.sql
sudo -u postgres psql -X -d postgres
# 在psql内：\password town_app，随后退出。
sudo -u postgres bash /srv/ai-town/ops/prepare-db.sh /srv/ai-town/releases/VERSION public-demo
```

prepare-db检查数据库所有者、验证产物哈希，在一个事务中创建表、按固定WORLD_ID首次播种和执行[grants.sql](../web/deploy/linux/grants.sql)。种子仍来自原`createWorld`，ON CONFLICT DO NOTHING；**不导入/覆盖本地Windows存档、不在每次启动/部署时自动执行**。运行角色只获世界SELECT/UPDATE、私聊与额度表SELECT/INSERT/UPDATE，没有世界INSERT、旧共享聊天SELECT、DELETE或DDL。schema是增量新增，旧表不删除。

用户亲自配置的秘密：

- town_app数据库随机密码，并在DATABASE_URL中URL编码；本机地址固定127.0.0.1:5432、库名ai_town_mvp。
- 至少32随机字节的COOKIE_SIGNING_SECRET，保留稳定，不随版本改变；更换会使现有访客Cookie失效。
- 专用Qwen-plus API key及对应地域的OpenAI-compatible AI_BASE_URL。AI_MODEL=qwen-plus，AI_ENABLED=true才启用；供应商侧费用上限由本人设定。
- WORLD_ID固定public-demo；AI_CALLS_PER_DAY默认60、CHAT_REQUESTS_PER_MINUTE默认30，先用更低额度试运行也可以。

完整变量在runtime.env.example。systemd EnvironmentFile不是shell脚本，不使用export/命令替换；不要把同一文件直接source执行。密钥只能在受保护编辑器/平台秘密配置填写，不发送到对话或录像。本轮没有生成/配置任何生产密码、Cookie密钥或模型密钥。

## 6. 域名、上线、健康与回滚顺序

1. 用户确认目标服务器、SSH管理方式/权限、发行版预检、域名、发布授权与有效期。保留原有SSH规则。
2. 安装/确认Node24、PG17和Caddy2；已有服务必须保留。检查剩余资源和端口，再建立独立用户/目录。
3. Linux构建并安装新版本；配置保护后的runtime.env；显式建库/角色、初始化、授予最小权限。
4. 核对并安装本项目systemd unit，daemon-reload。运行`sudo bash /srv/ai-town/ops/activate-release.sh /srv/ai-town/releases/VERSION`。它先检查平台/架构/隐私协议、哈希和只读权限，原子切current，重启**仅ai-town.service**，最多30次loopback健康检查（每次curl最多3秒）。无模型请求。
5. 公网仍未开启时，验证API、PG权限、匿名Cookie、资源、重启和备份。健康接口`/api/health`读取世界/必需表/会话配置，只返回ok和非秘密版本标记，错误不返回连接信息。
6. 将域名A记录指向IPv4；只有服务器IPv6确实可用时配置AAAA。80/443被其他代理占用时先决定复用方式，不停原服务。把Caddy站点片段**合并**进现有配置，备份原配置，`caddy validate --config /etc/caddy/Caddyfile`通过后才reload（不是重启覆盖）。确认无冲突才开放所需HTTP/HTTPS端口。
7. Caddy依据真实域名签发证书；验证浏览器HTTPS与证书、所有上线清单。未通过私聊隔离不得公开分享链接。最后确认开机启动、磁盘/日志观察和服务有效期。

[activate-release.sh](../web/deploy/linux/activate-release.sh)只切代码，不自动迁移/播种。健康失败则切回原current并重新健康检查；首次没有旧版本时停止新服务、明确报错。成功后previous记录旧版本。[rollback.sh](../web/deploy/linux/rollback.sh)由维护者显式切回previous，仍做同样检查。不会恢复旧数据库覆盖新数据，也不改变runtime.env。只允许privacyProtocol=2版本；不能回滚V5.1共享聊天版。后续有破坏性迁移时此简单回滚不够，必须另做迁移评审，本轮无此迁移。

手动回滚命令：`sudo bash /srv/ai-town/ops/rollback.sh`。随后执行`bash /srv/ai-town/ops/health-check.sh`、核对`readlink -e /srv/ai-town/current`及页面存档，不能把回滚代码误当成恢复旧数据库。

## 7. 备份、恢复和资源观察

```sh
sudo -u postgres bash /srv/ai-town/ops/backup.sh
sudo -u postgres bash /srv/ai-town/ops/restore-test.sh /var/backups/ai-town/ACTUAL_FILE.dump
bash /srv/ai-town/ops/runtime-check.sh
```

备份用pg_dump custom格式，记录SHA256并检查目录；不删除旧备份。恢复只创建新的`ai_town_restore_时间_PID`隔离库，撤销PUBLIC连接，再单事务pg_restore；绝不drop/覆盖生产库。恢复后对比世界/私聊/额度，记录结果，保留隔离库供检查，清理另行授权。备份包含私聊，必须0600并加密保存异机副本；恢复只接受可信的本项目备份。[PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html)、[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html)。本轮没有创建备份定时任务；发布前确定备份频率、保留期限和负责人。

runtime-check只读：应用内存/CPU/重启次数、进程RSS、可用内存、磁盘/备份/代码版本目录大小、近15分钟本应用日志、PG连接数与库大小。不输出进程环境。模型只记来源/耗时/错误类别，私聊不写应用日志。没有自动删除访客历史/旧备份策略，匿名访客不断增加会占磁盘，发布前约定保留政策与告警；Cookie到期不等于数据已删除。

## 8. 上线验收清单（目标服务器尚未执行）

| 操作 | 通过标准 |
|---|---|
| HTTPS打开小镇 | 可信证书，无混合内容，公开域名正确，3100/5432不能公网直连 |
| Pixi资源 | 地图/两居民/图集加载，无404；缩放、气泡、点击正常 |
| 自动/暂停/移动 | 每5秒一步真实规则动作；暂停确认后超过一周期不推进 |
| 送食物 | HTTP提交后真实饥饿下降，下一轮读取改变后的状态 |
| 真实AI/Fallback | 至多必要1条真实Qwen请求，额度计数；独立无密钥/故障演示，不对公众热改配置做负载测试 |
| 独立匿名访客 | 两浏览器context不同Cookie；A秘密标记不能被B历史/模型上下文读到；篡改Cookie401；旧共享记录不可见 |
| 双访客自动运行 | 一个逻辑时刻只推进一次，不双倍加速；跨访客可暂停（世界仍共享） |
| 重启/异常 | 暂停并记录revision，restart保留；确认维护窗口后向本项目主进程发异常信号，systemd恢复、NRestarts增加、存档一致 |
| 备份恢复 | 用新隔离库实际恢复，核对世界/私聊/用量，不覆盖生产 |
| 失败回滚 | 在未公开的演练环境用一份能通过哈希但不能启动的测试版本，确认自动恢复旧安全版本；再手动rollback，数据不回退 |

异常/失败注入只在明确确认的本项目维护窗口执行，不能操作其他服务。目标上的systemd自动恢复、Caddy证书/防火墙、云端磁盘/备份和回滚尚未通过，不能用本地测试替代。

## 9. 本轮证据和下一步所需信息

见[deployment-v5-2-checks.md](deployment-v5-2-checks.md)，区分Windows功能回归、WSL原生Linux构建、隔离Linux容器、未执行的目标服务器检查。所有常规模型测试使用本机替身或无密钥，本轮不增加真实模型付费调用。

需要用户提供/确认：服务器SSH别名或地址/端口/登录用户与授权方式（不要贴私钥）、只读预检结果/发行版/CPU架构、域名及DNS控制权、已有80/443代理如何共存、允许维护的本项目目录/用户/PG方案、受保护秘密配置、备份位置与保留期限、正式发布授权。未确认之前，本轮止于准备。
