#!/usr/bin/env bash
# Run as deploy on the VPS. Never copy .env or print database contents.
set -euo pipefail
umask 077
cd /opt/zarqa
mkdir -p backups
chmod 700 backups
exec 9>backups/.backup.lock
flock -n 9 || exit 0
stamp=$(date -u +%Y%m%dT%H%M%SZ)
stage=$(mktemp -d /opt/zarqa/backups/.partial.XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
compose=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)
"${compose[@]}" exec -T postgres pg_dump -U zarqa zarqa | gzip >"$stage/database.sql.gz"
# The read-only mount prevents the backup helper changing uploaded photos.
docker run --rm -v zarqa_photos:/photos:ro alpine:3.21 tar -czf - -C /photos . >"$stage/photos.tar.gz"
gzip -t "$stage/database.sql.gz"
tar -tzf "$stage/photos.tar.gz" >/dev/null
(cd "$stage" && sha256sum database.sql.gz photos.tar.gz > SHA256SUMS)
mv "$stage" "backups/$stamp"
# Only complete timestamp-named backup directories in this fixed root.
find /opt/zarqa/backups -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' -mtime +13 -exec rm -rf -- {} +
printf 'Backup complete: %s\n' "$stamp"
