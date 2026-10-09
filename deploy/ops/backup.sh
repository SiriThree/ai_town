#!/usr/bin/env bash
# Run as OS postgres. Does not read application environment or delete old backups.
set -euo pipefail
umask 077
[[ $(id -un) == postgres ]] || { echo 'Run via sudo -u postgres'; exit 1; }
target=/var/backups/ai-town
[[ -d "$target" && -w "$target" ]] || exit 1
file=$(mktemp "$target/town-$(date -u +%Y%m%dT%H%M%SZ).XXXXXX.dump")
pg_dump --no-password --dbname=ai_town_mvp --format=custom --no-owner --no-acl --file="$file"
pg_restore --list "$file" >/dev/null
sha256sum "$file" > "$file.sha256"
echo "Backup created: $file"
