#!/usr/bin/env bash
# Non-secret settings only. Run ON THE VPS after Codex login and provider probes pass.
set -euo pipefail
cd /opt/zarqa
test -f deploy/.env
umask 077
sed '/^LUNA_BASE_URL=/d; /^MATCHING_ENABLED=/d' deploy/.env > deploy/.env.new
printf '%s\n' 'LUNA_BASE_URL=http://codex:8090/v1' 'MATCHING_ENABLED=true' >> deploy/.env.new
mv deploy/.env.new deploy/.env
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d api codex >/dev/null
echo 'Matching enabled: OpenAI embeddings, Codex Luna reviews and direct Jev.'
