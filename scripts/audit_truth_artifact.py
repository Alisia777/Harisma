#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ABS_PATH = re.compile(r'(?i)(?:[A-Z]:[\\/](?:Users|Documents|Downloads|OneDrive)|/home/runner/work/)')
EPOCH = '1970-01-01T00:00:00.000Z'


def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--artifact-dir', required=True)
    ns = parser.parse_args()
    root = Path(ns.artifact_dir)
    errors: list[str] = []
    warnings: list[str] = []
    docs = {path.name: load(path) for path in root.glob('*.json')}

    for name, payload in docs.items():
        if payload.get('generatedAt') == EPOCH:
            errors.append(f'{name}: executed report uses epoch generatedAt')
        if ABS_PATH.search(json.dumps(payload, ensure_ascii=False)):
            errors.append(f'{name}: exposes absolute local/runner path')

    for name in (
        'portal_upload_apply_e2e.json',
        'portal_minmax_upload_reconciliation.json',
        'portal_cost_upload_reconciliation.json',
    ):
        payload = docs.get(name, {})
        summary = payload.get('summary', {})
        rows = summary.get('uploads', summary.get('rows', 0)) or 0
        accepted = summary.get('accepted', 0) or 0
        rejected = summary.get('rejected', 0) or 0
        persisted = summary.get('persisted', 0) or 0
        if payload.get('status') == 'ok' and rows == accepted == rejected == persisted == 0:
            errors.append(f'{name}: vacuous zero-row test reports status=ok')
        if name == 'portal_upload_apply_e2e.json' and payload.get('fixture') is True:
            if accepted < 1 or rejected < 1 or persisted != accepted:
                errors.append(f'{name}: fixture must have accepted>=1, rejected>=1, persisted=accepted')

    repricing = docs.get('portal_repricing_reconciliation.json', {})
    wiring = docs.get('portal_runtime_wiring_reconciliation.json', {})
    feature_blocked = repricing.get('feature_publish_allowed') is False or repricing.get('feature_status') == 'blocked'
    canonical = next((item for item in wiring.get('artifacts', []) if item.get('id') == 'canonical_repricer'), {})
    if feature_blocked and canonical.get('promoted'):
        errors.append('canonical repricer was promoted although feature activation is blocked')

    readiness = docs.get('portal_feature_readiness.json', {})
    repricer_feature = readiness.get('features', {}).get('repricer', {})
    if readiness.get('publish_allowed') is True and repricer_feature.get('publish_allowed') is False:
        warnings.append('global publish_allowed=true while repricer feature_publish_allowed=false; split diagnostic and activation flags')

    result = {
        'status': 'blocked' if errors else ('warning' if warnings else 'ok'),
        'errors': errors,
        'warnings': warnings,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 2 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
