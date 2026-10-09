#!/usr/bin/env bash
# Restore only into a brand-new isolated DB, never drop/overwrite production.
set -euo pipefail
[[ $(id -un) == postgres ]] || exit 1
file=$(realpath -e "${1:?trusted backup archive}")
[[ "$file" == /var/backups/ai-town/* && -f "$file.sha256" ]] || exit 1
sha256sum --check --quiet "$file.sha256"
db="ai_town_restore_$(date -u +%Y%m%d%H%M%S)_$$"
createdb --no-password --template=template0 "$db"
# Exclude PUBLIC access even during the rehearsal. Failure leaves the isolated DB for inspection.
psql -X -v ON_ERROR_STOP=1 -d postgres -c "REVOKE ALL ON DATABASE $db FROM PUBLIC;"
pg_restore --no-password --exit-on-error --single-transaction --no-owner --no-acl --dbname="$db" "$file"
psql -X -v ON_ERROR_STOP=1 -d "$db" -c "SELECT id,revision,payload->>'minute' AS minute FROM town_worlds; SELECT count(*) AS private_conversations FROM town_private_chats; SELECT count(*) AS quota_rows FROM town_chat_limits;"
echo "Restored into isolated $db; production unchanged. Verify record contents privately; cleanup is a separate approved action."
