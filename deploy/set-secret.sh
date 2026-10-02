#!/usr/bin/env bash
# Set one value in the server's deploy/.env without it showing on screen or in any log,
# then restart the API so it takes effect.
# Run from the repo root in Git Bash:  bash deploy/set-secret.sh RESEND_API_KEY
# (In PowerShell use .\deploy\set-secret.ps1 instead.)
set -euo pipefail

NAME="${1:?usage: bash deploy/set-secret.sh NAME}"
[[ "$NAME" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "NAME must look like RESEND_API_KEY"; exit 1; }

read -r -s -p "Paste the value for $NAME (hidden), then press Enter: " VALUE
echo
# Drop stray carriage returns and surrounding spaces from the paste.
VALUE="${VALUE//$'\r'/}"
VALUE="$(printf '%s' "$VALUE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
[ -n "$VALUE" ] || { echo "Nothing entered; nothing changed."; exit 1; }
if [ "$NAME" = RESEND_API_KEY ] && { [ "${VALUE#re_}" = "$VALUE" ] || [ ${#VALUE} -lt 20 ]; }; then
  echo "That doesn't look like a Resend key (they start with re_). Nothing changed."; exit 1
fi

# The value travels over SSH stdin; the server-side script (deploy/set-env-remote.sh) stores it.
printf '%s' "$VALUE" | ssh -i ~/.ssh/zarqa_vps -o BatchMode=yes deploy@173.249.40.122 bash /opt/zarqa/deploy/set-env-remote.sh "$NAME"
