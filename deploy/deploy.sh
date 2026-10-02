#!/usr/bin/env bash
# Deploy the working tree to the VPS: upload source, rebuild, restart.
# Run from the repo root in Git Bash:  bash deploy/deploy.sh
# Needs the SSH key ~/.ssh/zarqa_vps (see decisions.md, Hosting).
set -euo pipefail

HOST="deploy@173.249.40.122"
# Temporary public name until there's a real domain (also set as ZARQA_DOMAIN in the server's deploy/.env).
URL="https://173-249-40-122.sslip.io"
SSH=(ssh -i ~/.ssh/zarqa_vps -o BatchMode=yes "$HOST")

cd "$(dirname "$0")/.."

echo "Uploading source..."
tar -czf - \
  --exclude='node_modules' --exclude='dist' --exclude='dev-dist' \
  --exclude='bin' --exclude='obj' --exclude='.env' \
  server web deploy | "${SSH[@]}" 'cd /opt/zarqa && tar -xzf -'

echo "Building and restarting..."
"${SSH[@]}" 'cd /opt/zarqa && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build --remove-orphans && docker image prune -f >/dev/null'

echo "Health:"
sleep 5
curl -fsS "$URL/api/health" && echo || echo "health check failed: see logs with: ${SSH[*]} 'cd /opt/zarqa && docker compose -f deploy/docker-compose.yml logs --tail 50 api'"
