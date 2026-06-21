#!/usr/bin/env python3
from __future__ import annotations
import argparse
import subprocess
import sys

PROTECTED_PATHS = {
    'scripts/build-iu-drr-summary.js',
    'data/iu_drr_summary.json',
    'data/last_good/iu_drr_summary.json',
    'app-core-10.js',
}
PROTECTED_TOKENS = (
    'iuDrr', 'iu_drr', 'iu-drr', 'IU/DRR',
    'data-view="iu-drr"', "data-view='iu-drr'", '#view-iu-drr'
)

def run(args):
    proc = subprocess.run(args, text=True, encoding='utf-8', errors='replace', stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError(f"{' '.join(args)}\n{proc.stderr}")
    return proc.stdout

def changed_files(base, head, working_tree):
    files = set()
    if base and head and base != head:
        files.update(x for x in run(['git','diff','--name-only',f'{base}...{head}']).splitlines() if x)
    if working_tree:
        files.update(x for x in run(['git','diff','--name-only']).splitlines() if x)
        files.update(x for x in run(['git','diff','--cached','--name-only']).splitlines() if x)
    return files

def patch_text(base, head, working_tree):
    chunks = []
    if base and head and base != head:
        chunks.append(run(['git','diff','-U0',f'{base}...{head}']))
    if working_tree:
        chunks.append(run(['git','diff','-U0']))
        chunks.append(run(['git','diff','--cached','-U0']))
    return '\n'.join(chunks)

def changed_payload_lines(patch):
    current_file = ''
    for line in patch.splitlines():
        if line.startswith('diff --git '):
            parts = line.split()
            current_file = parts[3][2:] if len(parts) >= 4 and parts[3].startswith('b/') else ''
            continue
        if line.startswith('+++ b/'):
            current_file = line[6:]
            continue
        if line.startswith(('+++','---','@@','index ')):
            continue
        if current_file == 'scripts/verify_non_iu_scope.py':
            continue
        if line.startswith(('+','-')):
            yield line[1:]

def main():
    ap = argparse.ArgumentParser(description='Block any IU/DRR modifications for this audit task.')
    ap.add_argument('--base', default='HEAD')
    ap.add_argument('--head', default='HEAD')
    ap.add_argument('--working-tree', action='store_true')
    ns = ap.parse_args()

    files = changed_files(ns.base, ns.head, ns.working_tree)
    violations = []
    for path in sorted(files & PROTECTED_PATHS):
        violations.append(f'protected file changed: {path}')

    patch = patch_text(ns.base, ns.head, ns.working_tree)
    for line in changed_payload_lines(patch):
        for token in PROTECTED_TOKENS:
            if token in line:
                violations.append(f'protected IU token changed: {token!r} in {line[:180]!r}')
                break

    if violations:
        print('IU/DRR SCOPE VIOLATION', file=sys.stderr)
        for item in sorted(set(violations)):
            print(f'- {item}', file=sys.stderr)
        return 2
    print('OK: no IU/DRR changes detected')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
