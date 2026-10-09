#!/usr/bin/env bash
# Linux build only. Source/env/node_modules are never copied wholesale.
set -euo pipefail
umask 022
[[ $(uname -s) == Linux ]] || { echo 'Build on Linux, not Windows'; exit 1; }
[[ $(node -p process.platform) == linux ]] || { echo 'Use a Linux Node binary'; exit 1; }
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || { echo 'Use Node 24'; exit 1; }
src=$(realpath "${1:?source web directory}")
work=$(realpath "${2:?existing writable build parent directory}")
[[ -f "$src/package-lock.json" && -d "$work" ]] || exit 1
build=$(mktemp -d "$work/town-build.XXXXXX")
for item in src public scripts tests package.json package-lock.json tsconfig.json next.config.ts next-env.d.ts eslint.config.mjs; do
  cp -R "$src/$item" "$build/"
done
cd "$build"
unset DATABASE_URL COOKIE_SIGNING_SECRET AI_API_KEY AI_BASE_URL AI_MODEL
export NEXT_TELEMETRY_DISABLED=1 NEXT_STANDALONE=true NODE_OPTIONS=--max-old-space-size=2048
npm ci
npm run typecheck
npm run lint
npm test
npm run build
artifact="$build/release"
mkdir "$artifact"
cp -R .next/standalone/. "$artifact/"
cp -R public "$artifact/public"
cp -R .next/static "$artifact/.next/static"
mkdir "$artifact/maintenance"
cp scripts/schema.sql "$artifact/maintenance/schema.sql"
node --import tsx scripts/export-seed.mjs "$artifact/maintenance/seed.sql"
[[ -s "$artifact/server.js" && -d "$artifact/public/art" && -d "$artifact/.next/static" ]]
if find "$artifact" -name '.env*' -print -quit | grep -q .; then echo 'Unexpected env file in artifact'; exit 1; fi
node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({platform:process.platform,arch:process.arch,node:process.version,date:new Date().toISOString(),privacyProtocol:2},null,2))' "$artifact/release.json"
(cd "$artifact"; find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS)
archive="$build/ai-town-linux-$(node -p process.arch).tar.gz"
# Preserve Linux symlinks (including Next's pg external alias); do not unzip/re-copy via Windows.
tar -czf "$archive" -C "$artifact" .
(cd "$build"; sha256sum "$(basename "$archive")" > "$(basename "$archive").sha256")
printf 'Source build retained: %s\nLinux artifact: %s\n' "$build" "$artifact"
printf 'Transfer this Linux archive intact: %s\n' "$archive"
