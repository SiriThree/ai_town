"""Render a reviewed single-site fragment; never installs or reloads Caddy."""
import os
import re
import sys
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit("Usage: python3 render-caddy.py REAL_NAME.duckdns.org NEW_OUTPUT_FILE")
domain, target = sys.argv[1:]
if not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.duckdns\.org", domain):
    raise SystemExit("Use the real lowercase DuckDNS hostname, without scheme/port/path")
if domain.split('.')[0] in {"your-subdomain", "example", "your-subdomain-here"}:
    raise SystemExit("Replace the placeholder with your owned domain")
template = (Path(__file__).parent / "ops/Caddyfile.example").read_text(encoding="utf-8")
fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
    output.write(template.replace("__DOMAIN__", domain))
print("Site fragment created; review and validate before installation")
