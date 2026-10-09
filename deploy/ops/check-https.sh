#!/usr/bin/env bash
# Read-only public checks, no model calls. A GET creates only a temporary anonymous cookie.
set -euo pipefail
domain=${1:?real lowercase DuckDNS hostname}
expected=${2:?confirmed public IPv4}
[[ "$domain" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.duckdns\.org$ ]] || exit 1
python3 -c 'import ipaddress,sys; assert ipaddress.ip_address(sys.argv[1]).version == 4' "$expected"
dig +short A "$domain" | grep -Fx -- "$expected" >/dev/null || { echo 'DNS A does not match confirmed public IPv4'; exit 1; }
if [[ -n $(dig +short AAAA "$domain") ]]; then
  echo 'AAAA present: separately verify IPv6 routing/firewall; do not leave a stale record'
fi
location=$(curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{redirect_url}' "http://$domain/")
[[ "$location" == "https://$domain/" ]] || { echo 'HTTP does not redirect to the expected HTTPS origin'; exit 1; }
curl --fail --silent --show-error --max-time 15 "https://$domain/api/health" |
  python3 -c 'import json,sys; assert json.load(sys.stdin).get("ok") is True; print("Trusted HTTPS and application health passed")'
umask 077
headers=$(mktemp)
trap 'rm -f -- "$headers"' EXIT
curl --fail --silent --show-error --max-time 15 --dump-header "$headers" --output /dev/null "https://$domain/api/npcs/aqing/chat"
python3 - "$headers" <<'PY'
import sys
from pathlib import Path
cookies=[s.lower() for s in Path(sys.argv[1]).read_text().splitlines() if s.lower().startswith('set-cookie: __host-town_session=')]
assert len(cookies)==1 and all(flag in cookies[0] for flag in ['; secure','; httponly','; samesite=strict','; path=/']), 'Production cookie flags missing'
assert 'domain=' not in cookies[0], 'Host-only cookie required'
print('Secure anonymous cookie passed; cookie value not printed')
PY
echo 'Still verify cloud security groups, UFW, external 3100/5432 denial, two visitors and browser gameplay manually'
