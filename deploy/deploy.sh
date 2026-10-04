#!/usr/bin/env bash
# Deploy the working tree to the VPS: upload source, rebuild, restart.
# Run from the repo root in Git Bash:  bash deploy/deploy.sh
# Needs the SSH key ~/.ssh/zarqa_vps (see decisions.md, Hosting).
set -euo pipefail

HOST="deploy@173.249.40.122"
# Public address (ZARQA_DOMAIN in the server's deploy/.env lists every host Caddy serves).
URL="https://tryzarqa.com"
SSH=(ssh -i ~/.ssh/zarqa_vps -o BatchMode=yes "$HOST")

cd "$(dirname "$0")/.."

# Caddy mounts the single file deploy/Caddyfile; replacing the file leaves the container on the old copy,
# so note its checksum and recreate Caddy when it changes.
before=$("${SSH[@]}" 'sha256sum /opt/zarqa/deploy/Caddyfile 2>/dev/null' || true)

echo "Uploading source..."
# Local photo uploads (Data/photos) never leave the dev machine.
tar -czf - \
  --exclude='node_modules' --exclude='dist' --exclude='dev-dist' \
  --exclude='bin' --exclude='obj' --exclude='.env' --exclude='server/Zarqa.Api/Data/photos' \
  server web deploy | "${SSH[@]}" 'cd /opt/zarqa && tar -xzf -'

echo "Building and restarting..."
"${SSH[@]}" 'cd /opt/zarqa && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build --remove-orphans && docker image prune -f >/dev/null'

after=$("${SSH[@]}" 'sha256sum /opt/zarqa/deploy/Caddyfile')
if [ "$before" != "$after" ]; then
  echo "Caddyfile changed: recreating Caddy..."
  "${SSH[@]}" 'cd /opt/zarqa && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --force-recreate caddy'
fi

echo "Health:"
sleep 5
curl -fsS "$URL/api/health" && echo || echo "health check failed: see logs with: ${SSH[*]} 'cd /opt/zarqa && docker compose -f deploy/docker-compose.yml logs --tail 50 api'"
