#!/usr/bin/env bash
# Runs ON THE SERVER: reads a value from stdin and stores it as NAME in deploy/.env,
# then restarts the API. Called by deploy/set-secret.sh and deploy/set-secret.ps1.
set -euo pipefail

NAME="${1:?usage: set-env-remote.sh NAME < value}"
[[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "bad NAME"; exit 1; }

cd /opt/zarqa
# Printable characters only: drops newlines, CRs and anything a Windows pipe adds.
VALUE="$(cat | tr -cd '[:print:]')"
[ -n "$VALUE" ] || { echo "Nothing received; nothing changed."; exit 1; }

touch deploy/.env && chmod 600 deploy/.env
grep -v "^$NAME=" deploy/.env > deploy/.env.new || true
printf '%s=%s\n' "$NAME" "$VALUE" >> deploy/.env.new
mv deploy/.env.new deploy/.env && chmod 600 deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d api >/dev/null 2>&1
echo "$NAME saved on the server (${#VALUE} characters); API restarted."
