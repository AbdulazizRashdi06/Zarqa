#!/usr/bin/env bash
# Run the matching benchmark ON THE VPS, next to the private Codex gateway, so Luna and the
# Terra judge use the server's existing ChatGPT login (nobody signs in). Run from the repo
# root in Git Bash on the owner's PC (needs ~/.ssh/zarqa_vps, like deploy.sh):
#
#   bash deploy/bench-on-vps.sh            # upload the benchmark and start a run in the background
#   bash deploy/bench-on-vps.sh logs       # follow the run (Ctrl+C stops following, not the run)
#   bash deploy/bench-on-vps.sh result     # copy the latest results to benchmark/results/ and print the levels
#
# Options for a start: SIZES (default 100) and SYSTEMS (default luna-debate,luna-debate-terra).
#   SIZES=100,1000 bash deploy/bench-on-vps.sh
#
# What runs where:
# - Luna advocates and the Terra judge: http://codex:8090/v1 (the gateway). No key is sent to it.
# - Embeddings: OpenAI text-embedding-3-small with the server's OPENAI_API_KEY (passed as EMBEDDING_API_KEY only).
# - Jev: TypeSafe with the server's TYPESAFE_API_KEY.
# Keys are read from /opt/zarqa/deploy/.env on the server and never printed or copied off it.
# The gateway is shared with live matching: during a run, live reviews wait in the same queue.
set -euo pipefail

HOST="deploy@173.249.40.122"
SSH=(ssh -i ~/.ssh/zarqa_vps -o BatchMode=yes "$HOST")
REMOTE=/opt/zarqa/bench
SIZES="${SIZES:-100}"
SYSTEMS="${SYSTEMS:-luna-debate,luna-debate-terra}"

cd "$(dirname "$0")/.."

case "${1:-start}" in
logs)
  exec "${SSH[@]}" "tail -n 40 -f $REMOTE/benchmark/bench.log"
  ;;
result)
  latest=$("${SSH[@]}" "ls -1 $REMOTE/benchmark/results 2>/dev/null | grep -v offline | tail -n 1")
  [ -n "$latest" ] || { echo "No finished run on the server yet (bash deploy/bench-on-vps.sh logs)."; exit 1; }
  mkdir -p benchmark/results
  "${SSH[@]}" "cd $REMOTE/benchmark/results && tar -czf - '$latest'" | tar -xzf - -C benchmark/results
  echo "Copied benchmark/results/$latest"
  for s in $(node -e "const j=require('./benchmark/results/$latest/summary.json');const r=Object.values(j.results)[0];console.log(Object.keys(r.systems).join(' '))"); do
    (cd benchmark && node scripts/levels.js --run "results/$latest" --system "$s")
  done
  exit 0
  ;;
start) ;;
*) echo "Usage: bash deploy/bench-on-vps.sh [start|logs|result]"; exit 2 ;;
esac

# The campus photos are not in git. build-campus.js put them in benchmark/data/campus/photos on this PC.
node -e "
const fs=require('fs');const r=require('./benchmark/data/campus/reports.json');
const want=r.flatMap(x=>x.photos||[]);const miss=want.filter(p=>!fs.existsSync('benchmark/data/campus/'+p));
if(miss.length){console.error('Missing '+miss.length+' of '+want.length+' campus photos in benchmark/data/campus/photos. Without them the advocates would judge text only.');process.exit(1)}
console.log('Campus photos: '+want.length+' found')"

if "${SSH[@]}" "docker ps -q -f name=^zarqa-bench$" | grep -q .; then
  echo "A benchmark run is already going. Follow it with: bash deploy/bench-on-vps.sh logs"; exit 1
fi

echo "Uploading the benchmark..."
"${SSH[@]}" "mkdir -p $REMOTE"
# .cache stays on the server between runs (reruns replay it for free); local caches and keys are not sent.
tar -czf - --exclude='node_modules' --exclude='.env' --exclude='.cache' --exclude='results' benchmark \
  | "${SSH[@]}" "cd $REMOTE && tar -xzf -"

echo "Starting: systems $SYSTEMS, sizes $SIZES..."
"${SSH[@]}" bash -s -- "$REMOTE" "$SIZES" "$SYSTEMS" <<'REMOTE_SCRIPT'
set -euo pipefail
REMOTE=$1 SIZES=$2 SYSTEMS=$3
cd /opt/zarqa
# Read one value from deploy/.env without echoing it (strips CR and surrounding quotes).
val() { grep -m1 "^$1=" deploy/.env | cut -d= -f2- | tr -d '\r' | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
export EMBEDDING_API_KEY="$(val OPENAI_API_KEY)" TYPESAFE_API_KEY="$(val TYPESAFE_API_KEY)"
[ -n "$EMBEDDING_API_KEY" ] || { echo "OPENAI_API_KEY is not set in deploy/.env"; exit 1; }
case ",$SYSTEMS," in *",luna-debate,"*) [ -n "$TYPESAFE_API_KEY" ] || { echo "TYPESAFE_API_KEY is not set in deploy/.env (needed for the Jev judge)"; exit 1; } ;; esac

health=$(docker run --rm --network zarqa_default node:22-slim node -e "fetch('http://codex:8090/health').then(r=>r.text()).then(console.log).catch(()=>console.log('unreachable'))")
case "$health" in *'"signedIn":true'*) echo "Codex gateway: signed in" ;; *) echo "Codex gateway not ready ($health). Is the codex service up and logged in?"; exit 1 ;; esac

# Keys go in by name (-e NAME), so their values never appear in the process list.
# OPENAI_API_KEY is deliberately not passed: with OPENAI_BASE_URL set, Luna calls carry no key.
# 2 reports x 2 reviews x 2 advocates = at most 8 requests at the gateway, under its queue limit of 40.
docker run -d --rm --name zarqa-bench --network zarqa_default --user "$(id -u):$(id -g)" \
  -v "$REMOTE/benchmark:/b" -w /b \
  -e OPENAI_BASE_URL=http://codex:8090/v1 -e LUNA_PROVIDER=api \
  -e EMBEDDING_BASE_URL=https://api.openai.com/v1 -e EMBEDDING_API_KEY -e TYPESAFE_API_KEY \
  -e BENCH_TIMEOUT_MS=900000 -e SIZES="$SIZES" -e SYSTEMS="$SYSTEMS" \
  node:22-slim sh -c '
    { echo "started $(date -u +%FT%TZ)"
      node scripts/run.js --data data/campus --shape one --systems "$SYSTEMS" --sizes "$SIZES" --parallel 2 --review-concurrency 2 --yes &&
      latest=$(ls -1 results | grep -v offline | tail -n 1) &&
      for s in $(echo "$SYSTEMS" | tr "," " "); do node scripts/levels.js --run "results/$latest" --system "$s"; done
      echo "finished $(date -u +%FT%TZ) (exit $?)"
    } > bench.log 2>&1' >/dev/null
echo "Running in the background on the server; it keeps going if you close this window."
REMOTE_SCRIPT

echo "Follow it:        bash deploy/bench-on-vps.sh logs"
echo "When it finishes: bash deploy/bench-on-vps.sh result"
