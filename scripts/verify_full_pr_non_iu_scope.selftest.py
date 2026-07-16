#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
from pathlib import Path


SCRIPT_PATH = Path(__file__).with_name('verify_full_pr_non_iu_scope.py')
SPEC = importlib.util.spec_from_file_location('verify_full_pr_non_iu_scope', SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f'Cannot load {SCRIPT_PATH}')
SCOPE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SCOPE)


def patch(path: str, *lines: str) -> str:
    payload = '\n'.join(f'+{line}' for line in lines)
    return f'diff --git a/{path} b/{path}\n+++ b/{path}\n@@ -0,0 +1 @@\n{payload}\n'


def violations(files: set[str], patch_text: str, allow: bool = False) -> list[str]:
    return SCOPE.collect_violations(files, patch_text, allow_generated_iu_data=allow)


def main() -> int:
    assert not violations({'data/dashboard.json'}, patch('data/dashboard.json', '"asOf": "2026-07-15"'))

    summary_patch = patch('data/iu_drr_summary.json', '"iuDrrRuleVersion": "v3"')
    assert violations({'data/iu_drr_summary.json'}, summary_patch)
    assert not violations({'data/iu_drr_summary.json'}, summary_patch, allow=True)

    report_patch = patch('data/portal_sync_health.json', '"message": "IU/DRR rows are current"')
    assert violations({'data/portal_sync_health.json'}, report_patch)
    assert not violations({'data/portal_sync_health.json'}, report_patch, allow=True)

    plan_patch = patch('data/iu_plan.json', '"iu_drr": 0.12')
    assert violations({'data/iu_plan.json'}, plan_patch, allow=True)

    last_good_patch = patch('data/last_good/iu_drr_summary.json', '"iuDrrRuleVersion": "v3"')
    assert violations({'data/last_good/iu_drr_summary.json'}, last_good_patch, allow=True)

    code_patch = patch('app-core-10.js', 'const route = "iu-drr";')
    assert violations({'app-core-10.js'}, code_patch, allow=True)

    control_patch = patch(
        '.github/workflows/portal-data-truth.yml',
        'run: npm run portal:iu-drr-logic-guard',
    )
    assert not violations({'.github/workflows/portal-data-truth.yml'}, control_patch, allow=True)

    print('OK: protected scope permits generated IU data only in guarded full-portal mode')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
