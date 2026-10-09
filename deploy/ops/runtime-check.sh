#!/usr/bin/env bash
# Read-only, avoids systemctl Environment or /proc/PID/environ (secrets).
set -u
systemctl show ai-town.service -p ActiveState -p SubState -p MainPID -p NRestarts -p MemoryCurrent -p MemoryPeak -p CPUUsageNSec
pid=$(systemctl show ai-town.service -p MainPID --value)
[[ "$pid" =~ ^[1-9][0-9]*$ ]] && ps -p "$pid" -o pid,pcpu,pmem,rss,etime,comm
free -m
df -h /srv /var
du -sh /srv/ai-town/releases /srv/ai-town/cache /var/backups/ai-town 2>/dev/null
journalctl -u ai-town.service --since '15 min ago' --no-pager -n 80
sudo -n -u postgres psql -X -d ai_town_mvp -c "SELECT usename,state,count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY usename,state; SELECT pg_size_pretty(pg_database_size(current_database()));"
