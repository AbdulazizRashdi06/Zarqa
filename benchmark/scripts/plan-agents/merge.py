"""Merges Workflow task outputs into one JSON list.  python3 merge.py <out.json> <task output file> [...]"""
import json, sys
out = []
for path in sys.argv[2:]:
    d = json.load(open(path))
    r = d['result'] if isinstance(d, dict) else d
    if isinstance(r, str): r = json.loads(r)
    out += r
json.dump(out, open(sys.argv[1], 'w'))
key = 'arguments' if out and 'arguments' in out[0] else 'judgments'
print(len(out), 'batches,', sum(len(x[key]) for x in out), key)
