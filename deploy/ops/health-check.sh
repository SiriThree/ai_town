#!/usr/bin/env bash
set -euo pipefail
# A loopback check of application+world+schema+session config. No AI request.
for attempt in $(seq 1 30); do
  if curl --silent --show-error --fail --max-time 3 http://127.0.0.1:3100/api/health; then
    printf '\n'; exit 0
  fi
  sleep 1
done
echo 'Application is not ready' >&2
exit 1
