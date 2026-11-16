"""Turns the Haiku panel's member scores into runs the usual scripts can score.
   python3 panel-score.py <set key> <set dir> <base luna run> <base haiku run> <members.json>
   Writes results/edge-<key>-panel-c1..c4 (run from benchmark/). The four ways of combining were fixed before any
   score existed (state.json, 'panel'):
     c1 plain average of the six scores
     c2 plain average, hidden when the kind or the marks member says "differs"
     c3 the base Haiku debate score, hidden when the kind or the marks member says "differs"
     c4 logistic regression on the six scores, fitted on half the item kinds and scored on the other half
   Two more were added after the first results on independent2 and edge/round3, so they are after the fact there:
     c5 the base Haiku debate score, hidden when the marks member says "differs"
     c6 the base Haiku debate score, hidden when the judge sides against AND the kind or the marks member says "differs"
   With only some members run (the workflow's "members" argument), the missing scores count as 0.5; c3, c5 and c6
   need only the kind and marks members."""
import json, math, os, sys
key, setdir, luna, haiku, members = sys.argv[1:6]
R = 'results/'
M = ['kind', 'marks', 'brand', 'colour', 'place', 'time']
S = {m: {} for m in M}; V = {m: {} for m in M}
for b in json.load(open(members)):
    if not b['file'].startswith(key + '-'): continue
    for x in b['scores']:
        S[b['member']][x['n']] = max(0.0, min(1.0, float(x['score']))); V[b['member']][x['n']] = x['verdict']
rows = [json.loads(l) for l in open(R + 'edge-' + luna + '/pairs.jsonl')]
hrows = [json.loads(l) for l in open(R + 'edge-' + haiku + '/pairs.jsonl')]
pairs = {(p['lostId'], p['foundId']): p for p in json.load(open(setdir + '/pairs.json'))}
missing = [n for n in range(len(rows)) if any(n not in S[m] for m in M)]
print(key, 'pairs', len(rows), 'missing a member score:', missing)
X = [[S[m].get(n, 0.5) for m in M] for n in range(len(rows))]
def target(r):
    p = pairs.get((r['lostId'], r['foundId']), {}); q = p.get('quality')
    return (1 if (q['a'] + q.get('b', q['a'])) / 2 >= 5 else 0) if q else int(bool(r['isMatch']))
Y = [target(r) for r in rows]
kinds = sorted({r.get('itemKind') or r.get('kind') or '' for r in rows})
fold = [kinds.index(r.get('itemKind') or r.get('kind') or '') % 2 for r in rows]
def fit(idx, steps=4000, lr=0.5, l2=0.01):
    w = [0.0] * (len(M) + 1)
    for _ in range(steps):
        g = [0.0] * len(w)
        for i in idx:
            z = w[0] + sum(w[j + 1] * X[i][j] for j in range(len(M))); p = 1 / (1 + math.exp(-z)); e = p - Y[i]
            g[0] += e
            for j in range(len(M)): g[j + 1] += e * X[i][j]
        for j in range(len(w)): w[j] -= lr * (g[j] / len(idx) + (l2 * w[j] if j else 0))
    return w
W = {f: fit([i for i in range(len(rows)) if fold[i] != f]) for f in (0, 1)}
print('  weights fitted on the other half:', {f: [round(v, 2) for v in w] for f, w in W.items()})
def c4(i):
    w = W[fold[i]]; return 1 / (1 + math.exp(-(w[0] + sum(w[j + 1] * X[i][j] for j in range(len(M))))))
summ = json.load(open(R + 'edge-' + luna + '/summary.json'))
def write(name, score, hide):
    os.makedirs(R + f'edge-{key}-panel-{name}', exist_ok=True)
    with open(R + f'edge-{key}-panel-{name}/pairs.jsonl', 'w') as f:
        for n, r in enumerate(rows):
            sc = round(0.0 if hide(n) else score(n), 3)
            f.write(json.dumps(dict(r, finalScore=sc, scores=[sc], stronger=None, members={m: [S[m].get(n), V[m].get(n)] for m in M}, modelMatch=sc >= 0.5, debate=None), ensure_ascii=False) + '\n')
    s = dict(summ); s['settings'] = dict(summ['settings'], models=f'claude-haiku-5-5 panel of six members ({name}) through helper agents; search and screen from {luna}')
    json.dump(s, open(R + f'edge-{key}-panel-{name}/summary.json', 'w'), indent=1)
hard = lambda n: V['kind'].get(n) == 'differs' or V['marks'].get(n) == 'differs'
write('c1', lambda n: sum(X[n]) / len(M), lambda n: False)
write('c2', lambda n: sum(X[n]) / len(M), hard)
write('c3', lambda n: hrows[n]['finalScore'] or 0.0, hard)
write('c4', c4, lambda n: False)
write('c5', lambda n: hrows[n]['finalScore'] or 0.0, lambda n: V['marks'].get(n) == 'differs')
write('c6', lambda n: hrows[n]['finalScore'] or 0.0, lambda n: hrows[n].get('stronger') == 'against' and hard(n))
