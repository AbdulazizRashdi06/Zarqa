# Running the paid steps

## Environment for a run

From `benchmark/`:

```bash
export EMBEDDING_PROVIDER=api EMBEDDING_BASE_URL=https://api.openai.com/v1 EMBEDDING_API_KEY=proxy-injected
export OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_API_KEY=proxy-injected
export NODE_USE_ENV_PROXY=1 NO_PROXY=127.0.0.1,localhost REQUEST_TIMEOUT_MS=180000
export SPEND_CAP_USD=19.5   # the owner's budget minus a margin; see benchmark/CLAUDE.md for the current figure
```

`proxy-injected` is a placeholder: the cloud environment adds the real key to requests to `api.openai.com`. Never print or ask for the key.

The app's pipeline on a set:

```bash
node scripts/edge.js --data data/<set> --normalize --vector-limit 100000 --triage 30 --triage-order model --parallel 16 --yes --name <run-name>
```

Switches go in front as environment variables: `JUDGE_PHOTOS=1` (the judge sees the photos), `SIMILARITY_RULE=v2|v3|…` (wording versions of the shared instruction). Runs go one at a time. Answers are cached, so re-running a finished run is free and two runs that share prompts share calls.

## The ChatGPT plan route (use it first)

Owner's instruction, 2026-11-16: use the ChatGPT subscription whenever it has allowance and the paid API only when it does not; the app is not launched, so production is not competing for it. Start the gateway and add the route to the environment above:

```bash
(cd .. && CODEX_MAX_RUNNING=24 nohup node deploy/codex/gateway.mjs > /tmp/gateway.log 2>&1 &)
export PLAN_BASE_URL=http://127.0.0.1:8090/v1 REQUEST_TIMEOUT_MS=600000
```

Each call goes to the plan first. When the plan reports its usage limit the run switches to the API (with the spending stop) and tries the plan again every 10 minutes (`PLAN_RETRY_MIN`). `benchmark/.cache/plan.json` counts how many calls each route answered. At most 8 calls are on the plan at once (`PLAN_MAX_PARALLEL`); a limit error is retried twice after a wait before the plan is given up for 10 minutes. This matters: on 2026-11-16 twenty calls at once drew a "limit" after 64 calls, which was read as a used-up allowance; single calls worked again three minutes later, and 32 calls run 8 at a time all went through (about 110 calls a minute). The gateway reports a burst limit and a used-up allowance with the same words, so do not conclude the allowance is gone from one error. Revisit this instruction once the app is live: after launch, test calls on the plan take allowance from real matching.

## What a loop costs (measured on the API, 2026-11-15)

| Item | About |
|---|---|
| One judge call (gpt-6.1-terra) | $0.0017, a little more when it sees photos |
| A full run on a set of about 300 pairs, new prompts | $0.60 to $0.85 |
| The same set with only the judge's prompt changed | $0.50 to $0.70 |
| Rendering and screening for a new set (once per set) | $0.10 |

A loop with one candidate, two seen sets and one outside set is about four full runs plus the base on the outside set: 4 to 6 dollars. A change to the shared instruction re-runs the advocates as well as the judge; a change to the judge only is cheaper.

Agents (analyst, drafter, critics, writer, raters) use the Claude allowance, not this budget. The raters are the large part: two per batch, each opening every photo.
