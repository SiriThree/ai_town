#!/usr/bin/env bash
# Explicit approved maintenance only. Run as OS postgres, never from systemd startup.
set -euo pipefail
[[ $(id -un) == postgres ]] || exit 1
release=$(realpath -e "${1:?installed release directory}")
world=${2:?fixed production WORLD_ID}
[[ "$release" == /srv/ai-town/releases/* && "$world" =~ ^[a-zA-Z0-9_-]{1,80}$ ]] || exit 1
owner=$(psql -XAt -v ON_ERROR_STOP=1 -d postgres -c "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='ai_town_mvp'")
[[ "$owner" == town_owner ]] || { echo 'Expected new project DB owned by town_owner'; exit 1; }
(cd "$release"; sha256sum --check --quiet SHA256SUMS)
psql -X -v ON_ERROR_STOP=1 --single-transaction -v world_id="$world" -d ai_town_mvp \
  -f "$release/maintenance/schema.sql" -f "$release/maintenance/seed.sql" -f "$(dirname "$0")/grants.sql"
echo 'Schema ready; existing save retained. No reset performed.'
