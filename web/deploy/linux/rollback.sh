#!/usr/bin/env bash
set -euo pipefail
previous=$(readlink -f /srv/ai-town/previous)
[[ -n "$previous" ]] || { echo 'No prior release'; exit 1; }
exec bash "$(dirname "$0")/activate-release.sh" "$previous"
