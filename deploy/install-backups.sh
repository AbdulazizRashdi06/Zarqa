#!/usr/bin/env bash
# Run as deploy on the VPS; preserves unrelated cron entries.
set -euo pipefail
umask 077
mkdir -p /opt/zarqa/backups
chmod 700 /opt/zarqa/backups
existing=$(crontab -l 2>/dev/null || true)
{
  printf '%s\n' "$existing" | sed '/# zarqa-nightly-backup$/d'
  printf '%s\n' '17 2 * * * /bin/bash /opt/zarqa/deploy/backup.sh >> /opt/zarqa/backups/cron.log 2>&1 # zarqa-nightly-backup'
} | crontab -
echo 'Nightly backup installed: 02:17 in the VPS timezone.'
