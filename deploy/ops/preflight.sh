#!/usr/bin/env bash
# Read-only. Does not install, reload services, change firewall or allocate swap.
set -u
run() { printf '\n--- %s ---\n' "$*"; "$@" 2>&1 || true; }
run cat /etc/os-release
run uname -m
run dpkg --print-architecture
run getconf GNU_LIBC_VERSION
run systemctl is-system-running
run timedatectl status
run pg_lsclusters
run apt-cache policy nodejs postgresql-17 postgresql-client-17 caddy
run /opt/ai-town/node/bin/node --version
run sudo -n /usr/sbin/sshd -T
run nproc
run free -m
run swapon --show
run df -h / /var /srv
run node --version
run npm --version
run psql --version
run caddy version
run systemctl --version
run systemctl list-units --type=service --state=running --no-pager
run ss -lntp
printf '\nRequired ports: 80,443,3100,5432. Review ALL bindings above, including IPv6.\n'
# Noninteractive sudo only, never prompt/change access or print process environments.
if command -v sudo >/dev/null; then
  run sudo -n ufw status verbose
  run sudo -n firewall-cmd --list-all
  run sudo -n nft list ruleset
  run sudo -n -u postgres psql -XAt -d postgres -c "SHOW server_version; SHOW listen_addresses; SHOW port; SHOW max_connections;"
fi
printf '\nNo writes performed. Redact host/user/IP details before sharing output.\n'
