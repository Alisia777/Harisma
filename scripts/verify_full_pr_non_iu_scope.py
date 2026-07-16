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
GENERATED_IU_DATA_PATHS = {
    'data/iu_drr_summary.json',
}
GENERATED_IU_REPORT_PATHS = {
    'data/portal_daily_guard.json',
    'data/portal_data_quality.json',
    'data/portal_indicator_audit.json',
    'data/portal_layer_freshness.json',
    'data/portal_metric_reconciliation.json',
    'data/portal_sync_health.json',
    'data/portal_sync_summary.txt',
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
SCOPE_CONTROL_PATHS = {
    '.github/workflows/portal-data-truth.yml',
    'docs/PORTAL_DAILY_CLOSE_RUNBOOK.md',
    'scripts/verify_non_iu_scope.py',
    'scripts/verify_full_pr_non_iu_scope.py',
    'scripts/verify_full_pr_non_iu_scope.selftest.py',
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
        if current in SCOPE_CONTROL_PATHS or line.startswith(('+++', '---', '@@', 'index ')):
            continue
        if line.startswith(('+', '-')):
            yield current, line[1:]


def collect_violations(files: set[str], patch: str, allow_generated_iu_data: bool = False) -> list[str]:
    violations = []
    for item in sorted(files & PROTECTED_PATHS):
        if allow_generated_iu_data and item in GENERATED_IU_DATA_PATHS:
            continue
        violations.append(f'protected file changed: {item}')

    allowed_token_paths = GENERATED_IU_DATA_PATHS | GENERATED_IU_REPORT_PATHS
    for file_path, line in changed_lines(patch):
        if allow_generated_iu_data and file_path in allowed_token_paths:
            continue
        for token in PROTECTED_TOKENS:
            if token in line:
                violations.append(f'protected token changed in {file_path}: {token!r}: {line[:180]!r}')
                break
    return sorted(set(violations))


def main() -> int:
    parser = argparse.ArgumentParser(description='Verify the entire PR range does not change protected portal scope.')
    parser.add_argument('--base-ref', default='origin/main')
    parser.add_argument('--head', default='HEAD')
    parser.add_argument('--include-working-tree', '--working-tree', action='store_true')
    parser.add_argument(
        '--allow-generated-iu-data',
        action='store_true',
        help='Allow only the generated IU/DRR summary and generated audit references; finance plan, builder, and UI stay protected.',
    )
    ns = parser.parse_args()

    base = resolve_base(ns.base_ref, ns.head)
    range_spec = f'{base}...{ns.head}'
    files = set(run(['git', 'diff', '--name-only', range_spec]).splitlines())
    patches = [run(['git', 'diff', '-U0', range_spec])]
    if ns.include_working_tree:
        files.update(run(['git', 'diff', '--name-only']).splitlines())
        files.update(run(['git', 'diff', '--cached', '--name-only']).splitlines())
        patches.extend([run(['git', 'diff', '-U0']), run(['git', 'diff', '--cached', '-U0'])])

    violations = collect_violations(
        files,
        '\n'.join(patches),
        allow_generated_iu_data=ns.allow_generated_iu_data,
    )

    if violations:
        print(f'FULL-RANGE PROTECTED SCOPE VIOLATION (base={base}, head={ns.head})', file=sys.stderr)
        for violation in violations:
            print(f'- {violation}', file=sys.stderr)
        return 2
    mode = 'guarded generated IU/DRR data allowed' if ns.allow_generated_iu_data else 'strict non-IU'
    print(f'OK: full range {base}...{ns.head} passed protected scope check ({mode})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
