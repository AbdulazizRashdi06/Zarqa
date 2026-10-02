#!/usr/bin/env bash
# Live smoke test of the deployed app, without sending email:
# inserts a sign-in code for a throwaway address straight into the DB, signs in,
# posts a report with a photo, fetches the photo, then deletes everything it made.
# Run from the repo root in Git Bash:  bash deploy/smoke.sh
set -euo pipefail

URL="https://tryzarqa.com"
SSH=(ssh -i ~/.ssh/zarqa_vps -o BatchMode=yes deploy@173.249.40.122)
PSQL="cd /opt/zarqa && docker compose -f deploy/docker-compose.yml --env-file deploy/.env exec -T postgres psql -U zarqa -d zarqa -qAt"
EMAIL="smoke.test.$(date +%s)@gutech.edu.om"
CODE="$(printf '%06d' $((RANDOM % 1000000)))"
JAR="$(mktemp)"; IMG="$(mktemp --suffix=.jpg)"
trap 'rm -f "$JAR" "$IMG"' EXIT

# Same format as LoginCodes.Hash: base64(salt).base64(sha256(salt + "email\ncode")).
HASH="$(python - "$EMAIL" "$CODE" <<'PY'
import base64, hashlib, os, sys
salt = os.urandom(16)
print(base64.b64encode(salt).decode() + "." + base64.b64encode(hashlib.sha256(salt + f"{sys.argv[1]}\n{sys.argv[2]}".encode()).digest()).decode())
PY
)"
"${SSH[@]}" "$PSQL -c \"insert into login_codes (id, email, code_hash, expires_at, attempts, created_at) values (gen_random_uuid(), '$EMAIL', '$HASH', now() + interval '5 minutes', 0, now())\""

json() { curl -s -b "$JAR" -c "$JAR" -H 'Content-Type: application/json' "$@"; }
echo "verify:  $(json -d "{\"email\":\"$EMAIL\",\"code\":\"$CODE\"}" "$URL/api/auth/verify")"
echo "name:    $(json -X PATCH -d '{"firstName":"Smoke"}' "$URL/api/me" | head -c 60)…"

# Windows Python needs a Windows path (Git Bash temp paths look like /tmp/...).
IMG_PY="$(command -v cygpath >/dev/null && cygpath -w "$IMG" || echo "$IMG")"
python - "$IMG_PY" <<'PY'
import sys, struct, zlib
# A tiny valid PNG saved with a .jpg name is fine: the server decodes by content.
w, h = 64, 48
raw = b''.join(b'\x00' + bytes([200, 120, 60]) * w for _ in range(h))
def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
PY
REPORT="$(curl -s -b "$JAR" -w '
%{http_code}' -F kind=found -F 'title=Smoke test umbrella' -F category=Other -F 'locationName=GU1 Library' -F "photos=@$IMG_PY;type=image/jpeg" "$URL/api/reports")"
STATUS="${REPORT##*$'
'}"; REPORT="${REPORT%$'
'*}"
[ "$STATUS" = 200 ] || { echo "report post failed: HTTP $STATUS $REPORT"; exit 1; }
ID="$(printf '%s' "$REPORT" | python -c 'import json,sys; print(json.load(sys.stdin)["id"])')"
PHOTO="$(printf '%s' "$REPORT" | python -c 'import json,sys; print(json.load(sys.stdin)["photoIds"][0])')"
echo "report:  $(printf '%s' "$REPORT" | python -c 'import json,sys; r=json.load(sys.stdin); print(r["kind"], "|", r["title"], "|", r["locationText"], "|", r["pill"], "|", len(r["photoIds"]), "photo")')"
echo "photo:   $(curl -s -b "$JAR" -o /dev/null -w '%{http_code} %{content_type} %{size_download} bytes' "$URL/api/photos/$PHOTO")"
echo "home:    $(json "$URL/api/home")"

echo "delete:  $(curl -s -b "$JAR" -X DELETE -o /dev/null -w '%{http_code}' "$URL/api/reports/$ID")"
"${SSH[@]}" "$PSQL -c \"delete from match_jobs where report_id = '$ID'; delete from login_codes where email = '$EMAIL'; delete from users where email = '$EMAIL';\""
echo "cleaned up $EMAIL"
