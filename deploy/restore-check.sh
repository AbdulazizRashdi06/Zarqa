#!/usr/bin/env bash
# Validate the newest backup in an isolated DB and disposable photo volume.
set -euo pipefail
umask 077
cd /opt/zarqa
latest=$(find /opt/zarqa/backups -mindepth 1 -maxdepth 1 -type d -name '20??????T??????Z' | sort | tail -1)
test -n "$latest"
(cd "$latest" && sha256sum -c SHA256SUMS)
scratch="zarqa_restore_$(date +%s)_$$"
compose=(docker compose -f deploy/docker-compose.yml --env-file deploy/.env)
cleanup() {
  "${compose[@]}" exec -T postgres dropdb -U zarqa --if-exists "$scratch"
  docker volume rm "$scratch" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${compose[@]}" exec -T postgres createdb -U zarqa "$scratch"
gunzip -c "$latest/database.sql.gz" | "${compose[@]}" exec -T postgres psql -X -v ON_ERROR_STOP=1 -q -U zarqa -d "$scratch" >/dev/null
"${compose[@]}" exec -T postgres psql -X -v ON_ERROR_STOP=1 -qAt -U zarqa -d "$scratch" -c 'SELECT count(*) >= 0 FROM users; SELECT count(*) >= 0 FROM reports;'
docker volume create "$scratch" >/dev/null
docker run --rm -i -v "$scratch":/restore alpine:3.21 tar -xzf - -C /restore <"$latest/photos.tar.gz"
printf 'Restore verified in scratch database and photo volume. Cleaning up.\n'
