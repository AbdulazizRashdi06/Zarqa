#!/usr/bin/env bash
# Non-secret settings only. Run ON THE VPS after signing Claude Code in:
#   cd /opt/zarqa && docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build claude
#   docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec claude claude auth login
# Turns on the one-model Opus review. Today's debate stays configured as the fallback.
# Undo: set MATCHING_OPUS_ALONE=false in deploy/.env and recreate the api service.
set -euo pipefail
cd /opt/zarqa
test -f deploy/.env
compose() { docker compose -f deploy/docker-compose.yml --env-file deploy/.env "$@"; }
compose up -d --build claude >/dev/null
compose exec -T claude node -e "fetch('http://127.0.0.1:8091/health').then(r=>r.json()).then(j=>{if(!j.signedIn){console.error('Claude Code is not signed in. Run: docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec claude claude auth login');process.exit(1)}})"
umask 077
# The ledger prices Opus calls at API rates even though the plan is not billed per call, and matching pauses for the
# day at MODEL_DAILY_CAP_USD. 25 is about 1,700 pair reviews a day; change it in deploy/.env if you want another stop.
sed '/^MATCHING_OPUS_ALONE=/d; /^OPUS_BASE_URL=/d; /^MODEL_DAILY_CAP_USD=/d' deploy/.env > deploy/.env.new
printf '%s\n' 'MATCHING_OPUS_ALONE=true' 'OPUS_BASE_URL=http://claude:8091/v1' 'MODEL_DAILY_CAP_USD=25' >> deploy/.env.new
mv deploy/.env.new deploy/.env
compose up -d api claude >/dev/null
echo 'One-model Opus review enabled. Press "Re-check open reports" on /admin to review open reports again.'
