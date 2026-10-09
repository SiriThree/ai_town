#!/usr/bin/env bash
# Operator-approved local server operation. Does not migrate, seed, alter Caddy or delete releases.
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root after deployment approval'; exit 1; }
base=/srv/ai-town
release=$(realpath -e "${1:?absolute installed release directory}")
[[ "$release" == "$base/releases/"* && -f "$release/server.js" && -f "$release/SHA256SUMS" ]] || exit 1
[[ ! -L "$release" ]] || exit 1
[[ -z $(find "$release" -xdev \( -type f -o -type d \) \( ! -user root -o -perm /022 \) -print -quit) ]] || { echo 'Release must be root-owned and not group/world writable'; exit 1; }
(cd "$release"; sha256sum --check --quiet SHA256SUMS)
/usr/bin/node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync(process.argv[1]));if(r.platform!=="linux"||r.arch!==process.arch||r.privacyProtocol!==2)process.exit(1)' "$release/release.json"
old=""
if [[ -L "$base/current" ]]; then old=$(readlink -e "$base/current"); elif [[ -e "$base/current" ]]; then echo "current must be a symlink"; exit 1; fi
if [[ -n "$old" ]]; then
  [[ "$old" == "$base/releases/"* && -s "$old/server.js" ]] || exit 1
  /usr/bin/node -e 'const fs=require("fs");if(JSON.parse(fs.readFileSync(process.argv[1])).privacyProtocol!==2)process.exit(1)' "$old/release.json"
fi
# Code is root-owned/read-only to the runtime user; only the shared cache is writable.
if [[ ! -e "$release/.next/cache" ]]; then ln -s "$base/cache" "$release/.next/cache"; fi
[[ $(realpath "$release/.next/cache") == "$base/cache" ]] || { echo 'Unexpected cache path'; exit 1; }
link="$base/.switch-$$"
[[ ! -e "$link" && ! -L "$link" ]] || exit 1
trap '[[ ! -L "$link" ]] || unlink "$link"' EXIT
ln -s "$release" "$link"; mv -Tf "$link" "$base/current"
if systemctl restart ai-town.service && bash "$(dirname "$0")/health-check.sh"; then
  if [[ -n "$old" && "$old" != "$release" ]]; then ln -s "$old" "$link"; mv -Tf "$link" "$base/previous"; fi
  echo 'Release active; database and secrets unchanged'
else
  echo 'Activation failed; restoring previous safe release' >&2
  if [[ -n "$old" ]]; then
    ln -s "$old" "$link"; mv -Tf "$link" "$base/current"
    systemctl reset-failed ai-town.service
    systemctl restart ai-town.service
    bash "$(dirname "$0")/health-check.sh"
  else
    systemctl stop ai-town.service
    echo 'First release failed; left stopped. No previous release exists.' >&2
  fi
  exit 1
fi
