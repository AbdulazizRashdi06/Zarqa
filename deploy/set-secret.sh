#!/usr/bin/env bash
# Set one value in the server's deploy/.env without it showing on screen or in any log,
# then restart the API so it takes effect.
# Run from the repo root in Git Bash:  bash deploy/set-secret.sh RESEND_API_KEY
set -euo pipefail

NAME="${1:?usage: bash deploy/set-secret.sh NAME}"
[[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "NAME must look like RESEND_API_KEY"; exit 1; }

read -r -s -p "Paste the value for $NAME (hidden), then press Enter: " VALUE
echo
[ -n "$VALUE" ] || { echo "Nothing entered; nothing changed."; exit 1; }

# The value travels over SSH stdin, never as a command-line argument.
printf '%s' "$VALUE" | ssh -i ~/.ssh/zarqa_vps -o BatchMode=yes deploy@173.249.40.122 "
  set -e
  cd /opt/zarqa
  VALUE=\$(cat)
  touch deploy/.env && chmod 600 deploy/.env
  grep -v '^$NAME=' deploy/.env > deploy/.env.new || true
  printf '%s=%s\n' '$NAME' \"\$VALUE\" >> deploy/.env.new
  mv deploy/.env.new deploy/.env && chmod 600 deploy/.env
  docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d api >/dev/null 2>&1
  echo '$NAME saved on the server; API restarted.'
"
