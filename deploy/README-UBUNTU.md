# 晨露村：给服务器管理员的 Ubuntu 部署手册

本包用于朋友管理的新加坡 Ubuntu、2核/4GB服务器。**Ubuntu具体版本/架构、80/443、资源余量仍待实测；本包不代表已经上线。** 全程由朋友在服务器执行。本机开发者没有连接服务器。应用只使用一个 Node standalone实例、本机PG、systemd和Caddy；不安装Docker、Redis、Worker或本地模型。

当前程序已实现服务端匿名私聊隔离，保留共享小镇。部署前阅读本包的 `VALIDATION.md`。如果某一步失败，停止后续步骤，按本节排查；不要反复执行初始化。所有示例中的实际域名、IP和版本由管理员填写。

## 0. 交接内容与执行约定

交付zip解压后为 `deploy/`、`web/`、`SHA256SUMS`。`web/`是构建源码，无Windows node_modules、.next、真实.env、参考仓库、数据库或旧聊天记录。本包不含生产秘密。源码同架构Linux构建是首选；已有Linux产物作为另一条路径，见第4节。

源码、运维脚本分别维护；`deploy/ops`是本次Ubuntu部署唯一使用的配置，不混用项目旧 `web/deploy/linux` 或Docker历史配置。脚本不统一自动安装软件，每个副作用由下面独立步骤执行。

已关联[项目GitHub](https://github.com/SiriThree/ai_town)，但本次尚未推送应用代码；检查时远端只有LICENSE。朋友现在应使用交付zip，不能直接clone远端当作完整应用。CI模板仅保存在本包内，不会触发。源包可由开发者在Windows根目录运行`python deploy/pack-handoff.py`重新生成，每次输出新的zip，不覆盖前一批。

```sh
# 朋友先通过可信渠道收到zip及独立SHA256，核对后解压到自己的新目录。
sha256sum ai-town-ubuntu-实际批次.zip
mkdir "$HOME/ai-town-实际批次"    # 不用-p；已有目录时先检查
unzip ai-town-ubuntu-实际批次.zip -d "$HOME/ai-town-实际批次"
cd "$HOME/ai-town-实际批次"
sha256sum --check --quiet SHA256SUMS
bash                              # 后续使用Bash，避免不同shell解释差异
set -euo pipefail                  # 任一错误停止，不复制整本手册一次执行
export TOWN_BUNDLE="$PWD"         # 本批次解压根目录，非秘密
```

如果系统没有unzip，管理员先通过包管理器安装unzip（修改系统软件包），再解压；不要用root运行 npm。每段执行前先阅读内容。命令中密码不填进参数，不开启`set -x`，不贴环境文件/完整进程环境到群聊。

## 1. 只读预检：先确认，再决定安装

```sh
bash "$TOWN_BUNDLE/deploy/ops/preflight.sh" | tee "$HOME/ai-town-preflight.txt"
cat /etc/os-release
dpkg --print-architecture
uname -m
free -m
swapon --show
df -h / /var /srv
sudo ss -lntp
sudo /usr/sbin/sshd -T | grep -E '^(port|listenaddress) '
sudo ufw status verbose
```

预期：Ubuntu受支持版本、有systemd；确认实际SSH端口，80/443/3100/5432无冲突，磁盘和可用内存足够。预检含非交互sudo，权限不足会登记缺项，由管理员补查。还要在云控制台检查安全组，不能从UFW输出推断云端规则。

本文软件源步骤针对官方PG仓库当前支持的Ubuntu **22.04/jammy、24.04/noble、26.04/resolute**，x86_64/amd64或aarch64/arm64。其他版本/架构先停下核对官方支持矩阵，不改系统代号伪装兼容。新服务器也必须检查，不以“预计空闲”代替结果。若已有服务、项目账户或数据库，停止首次安装，协商共存，不能接管。

```sh
. /etc/os-release
test "$ID" = ubuntu
case "$VERSION_CODENAME" in jammy|noble|resolute) ;; *) echo '先核对官方软件源与OS支持，停止'; exit 1;; esac
case "$(dpkg --print-architecture)" in amd64|arm64) ;; *) echo '本包未验证该架构'; exit 1;; esac
```

失败排查：没有sudo请朋友使用管理员账号；端口冲突先识别进程和归属；剩余内存不足选择第4节Linux CI构建。不自动增加Swap或停其他服务。保存预检结果，分享前脱敏IP/用户名。

## 2. 安装必要软件（会修改APT源/包，某些包自动启动服务）

先确认这是可安装软件的新服务器。以下不执行系统全量升级、不改SSH。

```sh
sudo apt-get update
sudo apt-get --simulate install ca-certificates curl xz-utils gnupg python3 unzip dnsutils
sudo apt-get install ca-certificates curl xz-utils gnupg python3 unzip dnsutils
```

### 2.1 独立Node运行环境

使用Node24的已审查补丁版本；本地验证版本24.14.1，不宣称它永远是最新安全版本。朋友先核对[官方发布页](https://nodejs.org/en/download/archive/v24.14.1)及24系列更新，选定后填写版本。已有系统Node不覆盖，独立安装到 `/opt/ai-town/`；版本软链接是本应用专用。

```sh
read -r -p '已确认的Node24版本（如24.14.1，不带v）：' NODE_VERSION
[[ "$NODE_VERSION" =~ ^24\.[0-9]+\.[0-9]+$ ]]
case "$(uname -m)" in x86_64) NODE_ARCH=x64;; aarch64) NODE_ARCH=arm64;; *) exit 1;; esac
NODE_FILE="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
NODE_WORK=$(mktemp -d)
curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${NODE_VERSION}/$NODE_FILE" -o "$NODE_WORK/$NODE_FILE"
curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o "$NODE_WORK/SHASUMS256.txt"
(cd "$NODE_WORK"; awk -v name="$NODE_FILE" '$2==name {print}' SHASUMS256.txt > selected.sha256; test -s selected.sha256; sha256sum -c selected.sha256)
sudo test ! -e /opt/ai-town
sudo mkdir -m 0755 /opt/ai-town
sudo tar --no-same-owner --no-same-permissions -xJf "$NODE_WORK/$NODE_FILE" -C /opt/ai-town
sudo ln -s "/opt/ai-town/node-v${NODE_VERSION}-linux-${NODE_ARCH}" /opt/ai-town/node
export PATH="/opt/ai-town/node/bin:$PATH"
node --version
node -p 'process.platform + " " + process.arch'
npm --version
```

预期linux + 与机器一致的架构。校验失败不解压；GLIBC/架构不兼容先停止，不覆盖系统libc。安装中断保留已下载目录，检查后续做哪一步，不删除未知目录。回退Node只调整本项目软链接至已保留、已验证版本，并重启本项目服务；本轮不自动更新系统Node。

### 2.2 PostgreSQL17

先查 `pg_lsclusters`、`psql --version`、`apt-cache policy postgresql-17`。已有PG集群时不得套用“新库”步骤覆盖它。若发行版源已有17，可直接审查安装计划；否则配置[PostgreSQL官方APT源](https://www.postgresql.org/download/linux/ubuntu/)。以下只在没有同名源/密钥时执行：

```sh
ls /etc/apt/sources.list.d/
sudo test ! -e /etc/apt/sources.list.d/ai-town-pgdg.sources
sudo test ! -e /usr/share/keyrings/ai-town-pgdg.asc
curl --fail --location https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$HOME/ai-town-pgdg.asc"
gpg --show-keys --with-fingerprint "$HOME/ai-town-pgdg.asc"
# 与上述官方来源核对密钥来源后安装；不从未知镜像下载。
sudo install -m 0644 "$HOME/ai-town-pgdg.asc" /usr/share/keyrings/ai-town-pgdg.asc
printf 'Types: deb\nURIs: https://apt.postgresql.org/pub/repos/apt\nSuites: %s-pgdg\nArchitectures: %s\nComponents: main\nSigned-By: /usr/share/keyrings/ai-town-pgdg.asc\n' "$VERSION_CODENAME" "$(dpkg --print-architecture)" > "$HOME/ai-town-pgdg.sources"
sudo install -m 0644 "$HOME/ai-town-pgdg.sources" /etc/apt/sources.list.d/ai-town-pgdg.sources
sudo apt-get update
apt-cache policy postgresql-17 postgresql-client-17
sudo apt-get --simulate install postgresql-17 postgresql-client-17
sudo apt-get install postgresql-17 postgresql-client-17
pg_lsclusters
sudo -u postgres psql -X -d postgres -c 'SHOW server_version; SHOW listen_addresses; SHOW port; SHOW hba_file;'
sudo ss -lntp
```

影响：安装持久PG数据目录及服务，包可能自动创建/启动17/main。预期版本17、端口5432、只监听localhost。必须实际检查 `127.0.0.1/::1`，不能有 `0.0.0.0:5432` 或 `[::]:5432`。若未生成集群，只在 `pg_lsclusters`确认不存在后执行 `sudo pg_createcluster 17 main --start`。不要创建第二个同名集群或挪用另一个端口的旧库。

如果PG监听不合格，先通过 `SHOW config_file` 找实际文件，备份并用sudoedit调整 `listen_addresses='localhost'`；按实际集群名称重启，例如确认是17/main才用 `sudo pg_ctlcluster 17 main restart`。检查HBA仅本地应用连接使用scram-sha-256，不添加0.0.0.0/0规则，不用trust。PG没有其他业务是执行这些修改的前提。APT源失败停止，不随便换成不同PG主版本；回退软件不等于回退数据，禁止purge/drop集群。

### 2.3 Caddy2

先检查端口和已有包/配置。采用[官方Ubuntu稳定源](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)。**安装包会启动Caddy，可能监听80；执行前先确认没有其他服务且尚未公开分享站点。**

```sh
sudo ss -lntp
sudo apt-get install debian-keyring debian-archive-keyring apt-transport-https
sudo test ! -e /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo test ! -e /etc/apt/sources.list.d/caddy-stable.list
curl --fail --location https://dl.cloudsmith.io/public/caddy/stable/gpg.key -o "$HOME/ai-town-caddy.key"
gpg --show-keys --with-fingerprint "$HOME/ai-town-caddy.key"
gpg --dearmor --output "$HOME/ai-town-caddy.gpg" "$HOME/ai-town-caddy.key"
curl --fail --location https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o "$HOME/ai-town-caddy.list"
cat "$HOME/ai-town-caddy.list"    # 审查软件源和signed-by路径
sudo install -m 0644 "$HOME/ai-town-caddy.gpg" /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo install -m 0644 "$HOME/ai-town-caddy.list" /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update
apt-cache policy caddy
sudo apt-get --simulate install caddy
sudo apt-get install caddy
caddy version
systemctl status caddy --no-pager
```

已存在源/密钥或Caddy时先审查并复用，不覆盖；上面文件存在会阻止盲目覆盖。Caddy配置稍后单独修改，没有curl脚本直接管道到root shell。安装失败看APT输出，配置启动失败看 `journalctl -u caddy -n 60 --no-pager`，不要停不属于本项目的代理。

## 3. 独立运行用户与目录

只在 `getent passwd ai-town`、`getent group ai-town`、`ls -ld /srv/ai-town /etc/ai-town /var/backups/ai-town`确认不存在后执行。出现同名对象要停止确认归属。

```sh
if getent passwd ai-town || getent group ai-town; then echo '同名账户需人工检查'; exit 1; fi
sudo test ! -e /srv/ai-town
sudo test ! -e /etc/ai-town
sudo test ! -e /var/backups/ai-town
sudo useradd --system --user-group --no-create-home --home-dir /srv/ai-town --shell /usr/sbin/nologin ai-town
sudo install -d -o root -g root -m 0755 /srv/ai-town /srv/ai-town/releases /srv/ai-town/ops
sudo install -d -o ai-town -g ai-town -m 0750 /srv/ai-town/cache
sudo install -d -o root -g root -m 0700 /etc/ai-town
sudo install -d -o postgres -g postgres -m 0700 /var/backups/ai-town
sudo install -o root -g root -m 0644 "$TOWN_BUNDLE"/deploy/ops/* /srv/ai-town/ops/
```

所有运维脚本用 `bash 文件` 调用，不要求可执行位。运行用户只能写cache；世界/聊天在PG持久目录，版本目录root只读。只有管理员能改发布链接。若中途中断，检查已创建对象，不再盲跑首次创建代码。

## 4. Linux构建或上传产物

先读 `free -m`、`df -h`、`top`。2核/4GB不是可用4GB；构建最多两个Next worker、Node堆上限2GiB，并不保证总RSS小于2GiB。低内存或OOM时停构建，改用同架构Linux CI/另一台Linux构建；不要自动扩大Swap、限制其他服务或反复重试。

```sh
export PATH="/opt/ai-town/node/bin:$PATH"
mkdir "$HOME/ai-town-builds"       # 已有且归本项目时复用，不要删除
bash "$TOWN_BUNDLE/deploy/ops/build-release.sh" "$TOWN_BUNDLE/web" "$HOME/ai-town-builds"
```

构建白名单复制到新临时目录，npm ci → 类型检查 → lint → 61单元测试 → Next standalone构建。预期输出 `town-build.XXXXXX/ai-town-linux-x64.tar.gz` 或arm64及SHA256。无密钥、不联网调用模型。模型测试为本地替身，不配置生产.env也能构建。

产物包含server.js、追踪依赖、public素材、.next/static/server、maintenance/schema.sql/seed.sql、release.json、SHA256SUMS。[Next官方说明](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)要求额外复制public/static，脚本已处理。保持tar包完整传输，在Linux解压；不能Windows解压后重拷，否则可能丢失Next依赖符号链接。

**低内存备选：** `ci/build-linux.yml`提供手动触发的Linux CI模板；仅当代码托管仓库已由本人建立后才放到 `.github/workflows/` 并手动运行。默认ubuntu-24.04/x64，ARM需选择匹配的受支持Linux runner重新验证。CI无部署密钥、无服务器连接，不自动发布。也可在现有WSL/Linux机器执行上面同一构建脚本。下载产物时保持tar完整，并核对另行传递的SHA256。不要把未经核对的任意tar交给root解压。

```sh
read -r -p '本次可信Linux产物的完整绝对路径：' TOWN_ARCHIVE
test -f "$TOWN_ARCHIVE"
(cd "$(dirname "$TOWN_ARCHIVE")"; sha256sum --check "$(basename "$TOWN_ARCHIVE").sha256")
read -r -p '唯一版本标识（字母数字连字符，如v52-20261009-01）：' TOWN_RELEASE
[[ "$TOWN_RELEASE" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$ ]]
export TOWN_RELEASE
sudo mkdir -m 0755 "/srv/ai-town/releases/$TOWN_RELEASE"   # 已有则失败，绝不覆盖
sudo tar --no-same-owner --no-same-permissions -xzf "$TOWN_ARCHIVE" -C "/srv/ai-town/releases/$TOWN_RELEASE"
(cd "/srv/ai-town/releases/$TOWN_RELEASE"; sha256sum --check --quiet SHA256SUMS)
cat "/srv/ai-town/releases/$TOWN_RELEASE/release.json"
```

预期Linux、正确arch、privacyProtocol=2。安装前比对源文件与本批次审核记录；错误产物保留在独立版本目录供检查，不激活，也不改current。

## 5. 数据库：首次建库、增量迁移、最小权限

首次执行会创建 `town_owner`、`town_app` 和 `ai_town_mvp`，先确认都不存在。`roles.sql`在任何写入前检查同名对象冲突，不接管未知库。之后升级不要再运行roles.sql。

```sh
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d postgres -f /srv/ai-town/ops/roles.sql
sudo -u postgres psql -X -d postgres
```

在交互psql中执行 `\password town_app`，由管理员输入强随机密码，接着 `\q`；不使用命令参数明文密码，不拍摄终端输入。生产库独立于Windows本地存档。

```sh
sudo -u postgres bash /srv/ai-town/ops/prepare-db.sh "/srv/ai-town/releases/$TOWN_RELEASE" public-demo
# 仅检查连接和授权；-W交互输入密码，不把密码写命令历史。
psql -X -h 127.0.0.1 -p 5432 -U town_app -d ai_town_mvp -W -c 'SELECT id,revision FROM town_worlds;'
sudo -u postgres psql -X -d ai_town_mvp -c "SELECT has_table_privilege('town_app','town_chats','SELECT') AS legacy_read, has_table_privilege('town_app','town_worlds','DELETE') AS can_delete, has_table_privilege('town_app','town_worlds','INSERT') AS can_seed;"
```

预期public-demo世界且最后三个值均false。prepare-db在单事务里补表、首次种子、最小授权，已存在同ID世界ON CONFLICT DO NOTHING，不重置。运行账号没有DDL、DELETE、世界INSERT和旧共享聊天SELECT权限。持久目录由PG管理，不放 `/tmp` 或应用release内。

**增量迁移**：本版本只是新增私聊表，SQL可再次执行且不覆盖世界。以后仅在版本确实要求schema变更时，先备份再审查SQL，显式运行prepare-db；不是每次启动/部署自动迁移。失败事务回滚，但初次roles脚本不是一个跨数据库事务，若中途失败应检查已建对象，不DROP重来。

## 6. 受保护的生产配置

```sh
sudo test ! -e /etc/ai-town/runtime.env
sudo install -o root -g root -m 0600 /srv/ai-town/ops/runtime.env.example /etc/ai-town/runtime.env
sudoedit /etc/ai-town/runtime.env
sudo stat -c '%U:%G %a %n' /etc/ai-town/runtime.env
```

预期root:root 600。不运行cat、source或 `systemctl show -p Environment`。systemd环境文件不是shell；不写export/命令替换。

| 变量 | 配置人及含义 |
|---|---|
| DATABASE_URL | 朋友填写本地town_app密码；特殊字符URL编码；127.0.0.1:5432/ai_town_mvp |
| WORLD_ID | 固定public-demo，更新版本保持不变 |
| COOKIE_SIGNING_SECRET | 用户/朋友在密码管理器生成至少32随机字节并安全交接；稳定保留，不随更新更换 |
| AI_ENABLED | 首次验收false，先检验Fallback/隔离；最后用户授权再true |
| AI_API_KEY、AI_BASE_URL | 保留当前Qwen-plus供应商/地域配置，通过受保护渠道填写；不把Windows.env直接打包 |
| AI_MODEL | qwen-plus；不要因服务器在新加坡就擅自改变已有密钥所属地域 |
| AI_TIMEOUT_MS | 8000 |
| AI_CALLS_PER_DAY、CHAT_REQUESTS_PER_MINUTE | 默认60次模型尝试/UTC日、30次聊天/分钟；共享预算，失败计入模型额度；用户另设供应商货币上限 |

模板不含正式值。DuckDNS token只由用户管理DNS，不需要放进应用或Caddy。生产启动强制PUBLIC_DEMO=true/127.0.0.1:3100；Cookie密钥缺失则健康/聊天503，不能降成不安全会话。

## 7. 启动systemd（只操作ai-town.service）

```sh
/opt/ai-town/node/bin/node --version
sudo test ! -e /etc/systemd/system/ai-town.service
sudo install -o root -g root -m 0644 /srv/ai-town/ops/ai-town.service /etc/systemd/system/ai-town.service
sudo systemd-analyze verify /etc/systemd/system/ai-town.service
sudo systemctl daemon-reload
sudo bash /srv/ai-town/ops/activate-release.sh "/srv/ai-town/releases/$TOWN_RELEASE"
bash /srv/ai-town/ops/health-check.sh
systemctl status ai-town.service --no-pager
sudo ss -lntp
```

预期健康HTTP200/ok=true，Node仅127.0.0.1:3100。服务固定专用Node路径，非root ai-town；失败5秒重启，120秒最多5次；堆768MiB/MemoryMax1.5GiB/池5个，属于初始限制，不是容量保证。单实例且没有永久定时器；仅网页访问期间唤醒自动推进。

503排查：库/表/种子存在、密码HBA正确、WORLD_ID一致、签名密钥符合要求。`journalctl -u ai-town -n 60 --no-pager`查看错误类别，不发环境变量；检查OOM用 `systemctl show ai-town -p Result -p MemoryPeak`。不通过不要配置公开Caddy。activate失败自动恢复上一个安全版本；首次无上版则停止新服务。健康成功不代表所有业务已验收。

## 8. DuckDNS、网络与HTTPS

用户先申请自己的免费子域名，示例 `YOUR_SUBDOMAIN.duckdns.org` **只作提示，不能原样使用**。用户在DuckDNS控制台把A记录更新成朋友确认的公网IPv4；只有服务器IPv6、路由、防火墙都可用时保留AAAA。固定IP可手动维护；IP变更后由用户更新，不在本项目新增DDNS常驻任务。[DuckDNS官方说明](https://www.duckdns.org/spec.jsp)。

```sh
read -r -p '实际小写DuckDNS完整域名：' TOWN_DOMAIN
read -r -p '朋友确认的公网IPv4：' TOWN_IPV4
export TOWN_DOMAIN TOWN_IPV4
dig +short A "$TOWN_DOMAIN"
dig +short AAAA "$TOWN_DOMAIN"
```

预期A等于TOWN_IPV4，AAAA为空或准确可用。云安全组由朋友在控制台允许TCP80/443、保留现有SSH端口与管理来源；3100/5432不开放公网。Caddy证书申请还需要出站DNS/HTTPS、准确系统时间；安全组不是Ubuntu命令能自动确认的。

UFW仅在管理员确认规则后操作，**先允许实际SSH端口，另开一个SSH窗口确认登录，再考虑enable**。不能假设SSH必为22，不执行ufw reset。若已有nftables/iptables策略，先统一管理方式，不叠加冲突规则。

```sh
sudo ufw status verbose
sudo /usr/sbin/sshd -T | grep -E '^(port|listenaddress) '
read -r -p '已确认的实际SSH TCP端口：' TOWN_SSH_PORT
[[ "$TOWN_SSH_PORT" =~ ^[0-9]+$ ]] && (( TOWN_SSH_PORT >= 1 && TOWN_SSH_PORT <= 65535 ))
read -r -p '覆盖当前SSH连接的管理来源IP/CIDR：' TOWN_ADMIN_CIDR
python3 -c 'import ipaddress,sys; ipaddress.ip_network(sys.argv[1], strict=False)' "$TOWN_ADMIN_CIDR"
sudo ufw allow from "$TOWN_ADMIN_CIDR" to any port "$TOWN_SSH_PORT" proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --dry-run enable
# 只有确认已有默认入站策略为deny、SSH/控制台救援可用、第二个SSH窗口可登录后：
sudo ufw enable
sudo ufw status verbose
```

UFW未安装先由管理员 `apt-cache policy ufw`、审查安装；默认策略不满足时由管理员检查全部规则并决定调整，不通过脚本自动reset。规则里若已有放行3100/5432，识别其归属后单独删除对应规则，不直接清空防火墙。

已有可用的SSH来源限制规则应保留，不扩大成全网SSH。管理来源需包含当前实际连接（跳板机/NAT以服务器看到的来源为准）；不确定时不要enable。若IP会变化，朋友先安排稳定管理入口或控制台救援。

生成站点片段（没有硬编码实际域名，也不会自动覆盖配置）：

```sh
python3 "$TOWN_BUNDLE/deploy/render-caddy.py" "$TOWN_DOMAIN" "$HOME/ai-town-site.Caddyfile"
cat "$HOME/ai-town-site.Caddyfile"
sudo cat /etc/caddy/Caddyfile
sudo cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-ai-town-$(date -u +%Y%m%dT%H%M%SZ)"
sudoedit /etc/caddy/Caddyfile
# 朋友确认仅为新装默认欢迎页时，可将内容替换成上面的站点片段；
# 若出现任何其他站点，停止并合并，绝不覆盖它们。
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 60 --no-pager
bash /srv/ai-town/ops/check-https.sh "$TOWN_DOMAIN" "$TOWN_IPV4"
```

按[Caddy自动HTTPS条件](https://caddyserver.com/docs/automatic-https)，域名/DNS、可达80/443、持久可写证书目录满足后会签发可信证书并重定向HTTP。这里无需DuckDNS DNS插件/token，不用IP/localhost证书代替域名证书。保留Caddy默认数据目录，不能清理证书缓存反复申请。

check-https核对DNS A、HTTP重定向、可信TLS、健康和生产Cookie标志，不发送模型请求。预期全部通过。它不能替代云防火墙与异地浏览器测试。若失败：A/AAAA查错、云组/UFW、端口监听、ACME日志、Caddy持久目录和时间依次检查；不使用curl -k掩盖证书错误。配置失败恢复本次备份并validate后reload，不动其他配置/服务。

## 9. 公网前的功能与恢复验收

使用自己的电脑/手机网络访问域名，不仅从服务器curl。先AI_ENABLED=false：

1. 地图、两角色、public素材无404，缩放/平移/选中/气泡正常。
2. 开始自动、观察真实移动、暂停、手动一步。两个浏览器访客同时打开不双倍加速。
3. 送食物看到饥饿实际下降、事件保存；控制条件下下一步影响已有本地回归证据，勿伪造演示状态。
4. 两个独立浏览器配置（不能同一配置普通双标签）分别发送不同测试标记。A/B历史、气泡、模型上下文不串；切NPC也只读自己的历史。无密钥回复标Fallback。
5. 检查DevTools Cookie含Secure/HttpOnly/SameSite=Strict，公共世界事件无测试聊天文本。`POST /api/world/init`返回403，非法消息400，无有效会话POST401。不要把Cookie值贴到日志。
6. 暂停世界，私下记录revision/时间/两居民；刷新、`sudo systemctl restart ai-town`后比较状态和本人历史。
7. 用户授权后sudoedit仅改AI_ENABLED=true并填写既有Qwen配置，重启本项目；只发一条必要真实问题，看到AI来源且与当前状态一致。失败分类/Fallback保留；不要循环付费探测。供应商额度由用户核对。
8. 模型故障/超时本地替身已有回归；生产演练可先关闭AI验证Fallback。不改真实服务地址做反复故障调用，不使用付费API压力测试。
9. 在私有验收/维护窗口暂停世界后，`sudo systemctl kill --kill-whom=main --signal=SIGKILL ai-town`；等待后查看 `systemctl show ai-town -p ActiveState -p NRestarts` 和健康、存档。仅杀本项目主进程，不能pkill node。此步骤有短暂中断，应先通知测试者。

从外部确认3100/5432无法连接，只有80/443及受控SSH通道。完成后才 `sudo systemctl enable ai-town`，检查 `systemctl is-enabled ai-town caddy postgresql`；PG实际集群unit按预检核对。任何私聊隔离失败立即暂停公开，不能带问题分享链接。

## 10. 备份、隔离恢复、运行观察

```sh
sudo -u postgres bash /srv/ai-town/ops/backup.sh
# 将上一步输出的实际dump路径填入；同目录.sha256必须保留。
sudo -u postgres bash /srv/ai-town/ops/restore-test.sh /var/backups/ai-town/实际文件.dump
sudo bash /srv/ai-town/ops/runtime-check.sh
```

备份custom格式，600权限；恢复只建新的ai_town_restore_*测试库，不覆盖生产。核对世界revision/时间、私聊行数及必要内容，再安排清理；脚本不自动drop。数据库备份含私聊，应加密异机保存。双方约定每天/每次更新前备份、保留期、异机位置及负责人；本包不自动创建定时任务或删除旧备份。

备份恢复只提供安全演练，不自动切换生产数据库。真正灾难恢复要在维护窗口恢复到新库、复核权限和数据、再由管理员切换DATABASE_URL，保留原库；不要把dump直接覆盖线上。观察RSS/CPU/连接数/磁盘/重启，数据和备份会增长，无法承诺具体并发人数。数据库维护者能读聊天，这是会话隔离，不是端到端加密。

## 11. 更新和回滚

1. 接收新源码/可信Linux包与校验和；审查变更。**不能回退到V5.1共享聊天版本。**
2. 备份PG和受保护环境文件，记录current/previous和world revision。秘密副本仍保持600，不能进交付目录。
3. 按第4节安装到新的唯一release。schema有变化才显式备份后迁移；本版本无需每次重建库/播种。
4. 若ops脚本/unit也更新，先比较再备份为本次独立副本，人工安装改动；unit改变才daemon-reload。不能每次更新覆盖runtime.env/Caddyfile。
5. `sudo bash /srv/ai-town/ops/activate-release.sh /srv/ai-town/releases/新版本`。检查哈希/架构/隐私协议/权限、原子切链、仅重启本项目并健康检查；失败恢复前版。首次无前版则停止并报告。
6. 健康及浏览器功能通过后保留前版；需要回退时 `sudo bash /srv/ai-town/ops/rollback.sh`，再健康检查和核对current/存档。回滚代码不回滚数据库或秘密。不可逆schema改变不适用这种简单回滚，必须另审迁移方案。

上线前朋友在未公开的维护窗口演练一次：保留健康旧版，安装一份独立测试版本并令其启动失败（只修改测试release并重新记录哈希），激活后确认自动回到旧版；不要改正在运行的release。没有安全旧版时不能声称已验证回滚。验收失败保留日志、不删除任何已有库或版本。

## 12. 谁需要提供什么

朋友：Ubuntu版本/代号、CPU架构、剩余内存/Swap/磁盘、实际SSH端口与救援控制台、80/443/3100/5432检查、云安全组/UFW、PG集群路径/服务、sudo权限、备份负责人。

用户：实际DuckDNS域名及正确DNS、受保护的现有Qwen配置/费用上限、Cookie密钥交接约定、公开时间与发布授权。数据库密码由朋友生成并保护。不需要把DuckDNS token交给应用；不需要把SSH私钥或任何秘密发给AI。

所有安装/域名/证书/systemd异常恢复/目标机器回滚结果由朋友现场填写 `VALIDATION.md` 的待验证项。本地构建和测试通过不能写成Ubuntu服务器部署成功。
