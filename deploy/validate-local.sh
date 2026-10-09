#!/usr/bin/env bash
# No installation/service changes; all outputs stay in a new user-owned temporary directory.
set -euo pipefail
[[ $EUID != 0 ]] || { echo 'Run this local validation as a normal user'; exit 1; }
base=$(cd "$(dirname "$0")" && pwd)
for file in "$base"/ops/*.sh "$base"/*.sh; do bash -n "$file"; done
python3 - "$base" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
for p in root.joinpath('ops').iterdir():
    assert b'\r' not in p.read_bytes(), f'CRLF not allowed: {p}'
compile(root.joinpath('render-caddy.py').read_text(), 'render-caddy.py', 'exec')
service=root.joinpath('ops/ai-town.service').read_text()
assert 'User=ai-town' in service and 'PUBLIC_DEMO=true HOSTNAME=127.0.0.1 PORT=3100' in service
assert '/opt/ai-town/node/bin/node server.js' in service and 'Restart=on-failure' in service
print('Shell syntax, LF, Python syntax and runtime boundaries passed')
PY
work=$(mktemp -d)
python3 "$base/render-caddy.py" local-validation-only.duckdns.org "$work/Caddyfile"
if python3 "$base/render-caddy.py" local-validation-only.duckdns.org "$work/Caddyfile" 2>/dev/null; then echo 'Overwrite guard failed'; exit 1; fi
if python3 "$base/render-caddy.py" 'invalid;domain' "$work/invalid" 2>/dev/null; then echo 'Domain guard failed'; exit 1; fi
install -m 0644 "$base/ops/ai-town.service" "$work/ai-town.service"
systemd-analyze verify "$work/ai-town.service"
for file in activate-release.sh backup.sh restore-test.sh prepare-db.sh; do
  if bash "$base/ops/$file" > "$work/$file.log" 2>&1; then echo "Privilege guard failed: $file"; exit 1; fi
done
echo 'Operator privilege guards rejected unprivileged invocation before mutations'
# Optional: adaptation only. No validation provisioning, certificate request or listening socket.
if command -v caddy >/dev/null; then caddy adapt --config "$work/Caddyfile" --adapter caddyfile > "$work/caddy.json"; else echo 'Caddy not installed here: Caddy parser check pending'; fi
echo "Validation files retained at $work; no system configuration changed"
