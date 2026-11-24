"""Builds a results folder from Haiku's judgments so the usual scripts can score it.
   python3 assemble.py <base run> <new run name> <judge outputs.json> [<advocate outputs.json>]
   The base run supplies which pairs search and the screen kept; the scores come from Haiku."""
import json, os, sys
base, name, judged = sys.argv[1:4]
adv = sys.argv[4] if len(sys.argv) > 4 else None
R = 'results/'  # run from benchmark/
J = {j['n']: j for b in json.load(open(judged)) for j in b['judgments']}
A = {'for': {}, 'against': {}}
if adv:
    for b in json.load(open(adv)):
        for a in b['arguments']: A[b['side']][a['n']] = a
rows = [json.loads(l) for l in open(R + 'edge-' + base + '/pairs.jsonl')]
KEYS = ['clearly_different', 'probably_different', 'unclear', 'probably_same', 'almost_certainly_same']
os.makedirs(R + 'edge-' + name, exist_ok=True)
missing = 0
with open(R + 'edge-' + name + '/pairs.jsonl', 'w') as f:
    for n, r in enumerate(rows):
        j = J.get(n)
        if not j:
            missing += 1
            f.write(json.dumps(dict(r, error='no judgment', finalScore=None), ensure_ascii=False) + '\n'); continue
        p = [max(0, min(1, j['overall_probabilities'].get(k, 0))) for k in KEYS]; tot = sum(p)
        overall = sum(v * i for i, v in enumerate(p)) / tot / 4 if tot > 0 else 0
        same = max(0, min(1, j['same_item_probability'])); final = round(0.5 * same + 0.5 * overall, 3)
        r2 = dict(r, baseScore=r.get('finalScore'), finalScore=final, sameItem=same, overall=round(overall, 3), stronger=j['stronger_case'], scores=[final])
        if n in A['for'] and n in A['against']:
            r2['debate'] = f"For ({A['for'][n]['strength']}): {A['for'][n]['argument']}\nAgainst ({A['against'][n]['strength']}): {A['against'][n]['argument']}"
        r2['modelMatch'] = final >= 0.55; r2['shown'] = bool(r['retrieved'] and r['shortlisted'] and final >= 0.55)
        f.write(json.dumps(r2, ensure_ascii=False) + '\n')
s = json.load(open(R + 'edge-' + base + '/summary.json'))
s['settings']['models'] = 'claude-haiku-5-5 through helper agents (batches), search and screen from ' + base
json.dump(s, open(R + 'edge-' + name + '/summary.json', 'w'), indent=1)
print(f'{len(rows) - missing} pairs scored, {missing} missing -> results/edge-{name}')
