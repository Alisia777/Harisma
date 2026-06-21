#!/usr/bin/env python3
from __future__ import annotations

import argparse
import subprocess
import sys

PROTECTED_PATHS = {
    'data/iu_plan.json',
    'data/iu_drr_summary.json',
    'data/last_good/iu_drr_summary.json',
    'scripts/build-iu-drr-summary.js',
    'app-core-10.js',
}
PROTECTED_TOKENS = (
    'iuDrr',
    'iu_drr',
    'iu-drr',
    'IU/DRR',
    'data-view="iu-drr"',
    "data-view='iu-drr'",
    '#view-iu-drr',
)
SELF_PATHS = {
    'scripts/verify_non_iu_scope.py',
    'scripts/verify_full_pr_non_iu_scope.py',
}


def run(args: list[str]) -> str:
    proc = subprocess.run(
        args,
        text=True,
        encoding='utf-8',
        errors='replace',
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if proc.returncode:
        raise RuntimeError(f"{' '.join(args)}\n{proc.stderr}")
    return proc.stdout


def resolve_base(base_ref: str, head: str) -> str:
    return run(['git', 'merge-base', head, base_ref]).strip()


def changed_lines(patch: str):
    current = ''
    for line in patch.splitlines():
        if line.startswith('diff --git '):
            parts = line.split()
            current = parts[3][2:] if len(parts) >= 4 and parts[3].startswith('b/') else ''
            continue
        if line.startswith('+++ b/'):
            current = line[6:]
            continue
        if current in SELF_PATHS or line.startswith(('+++', '---', '@@', 'index ')):
            continue
        if line.startswith(('+', '-')):
            yield current, line[1:]


def main() -> int:
    parser = argparse.ArgumentParser(description='Verify the entire PR range does not change protected portal scope.')
    parser.add_argument('--base-ref', default='origin/main')
    parser.add_argument('--head', default='HEAD')
    parser.add_argument('--include-working-tree', '--working-tree', action='store_true')
    ns = parser.parse_args()

    base = resolve_base(ns.base_ref, ns.head)
    range_spec = f'{base}...{ns.head}'
    files = set(run(['git', 'diff', '--name-only', range_spec]).splitlines())
    patches = [run(['git', 'diff', '-U0', range_spec])]
    if ns.include_working_tree:
        files.update(run(['git', 'diff', '--name-only']).splitlines())
        files.update(run(['git', 'diff', '--cached', '--name-only']).splitlines())
        patches.extend([run(['git', 'diff', '-U0']), run(['git', 'diff', '--cached', '-U0'])])

    violations = [f'protected file changed: {item}' for item in sorted(files & PROTECTED_PATHS)]
    for file_path, line in changed_lines('\n'.join(patches)):
        for token in PROTECTED_TOKENS:
            if token in line:
                violations.append(f'protected token changed in {file_path}: {token!r}: {line[:180]!r}')
                break

    if violations:
        print(f'FULL-RANGE PROTECTED SCOPE VIOLATION (base={base}, head={ns.head})', file=sys.stderr)
        for violation in sorted(set(violations)):
            print(f'- {violation}', file=sys.stderr)
        return 2
    print(f'OK: full range {base}...{ns.head} has no protected scope changes')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
