"""Joins the task outputs of debate-workflow.js into the two files benchmark/scripts/plan-agents/assemble.py reads.
   python3 collect.py <out prefix> <number of pairs in the set> <task output file> [<task output file> ...]
   Writes <prefix>-judge.json and <prefix>-notes.json, and prints every pair number missing from the claimant,
   the skeptic or the referee, so those can be re-run before anything is scored. Later files win over earlier ones."""
import json, sys
prefix, total, paths = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
blocks = []
for p in paths:
    d = json.load(open(p)); blocks += d['result'] if isinstance(d, dict) else d
judge = [{'batch': i, 'file': b['file'], 'judgments': b['judgments']} for i, b in enumerate(blocks)]
notes = []
for b in blocks:
    notes.append({'file': b['file'], 'side': 'for', 'arguments': b['claimant']})
    notes.append({'file': b['file'], 'side': 'against', 'arguments': b['skeptic']})
json.dump(judge, open(prefix + '-judge.json', 'w'), ensure_ascii=False)
json.dump(notes, open(prefix + '-notes.json', 'w'), ensure_ascii=False)
want = set(range(total))
for name, got in (('claimant', {a['n'] for b in blocks for a in b['claimant']}), ('skeptic', {a['n'] for b in blocks for a in b['skeptic']}), ('referee', {j['n'] for b in blocks for j in b['judgments']})):
    print(f'{name}: {len(got & want)} of {total}; missing {sorted(want - got)}')
st = {}
for b in blocks:
    for side in ('claimant', 'skeptic'):
        for a in b[side]: st[(side, a['strength'])] = st.get((side, a['strength']), 0) + 1
print('strengths:', {f'{k[0]} {k[1]}': v for k, v in sorted(st.items())})
