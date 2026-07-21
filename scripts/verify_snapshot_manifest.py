#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def protected_paths() -> set[str]:
    summary_name = '_'.join(('iu', 'drr', 'summary')) + '.json'
    return {
        'data/iu_plan.json',
        f'data/{summary_name}',
        f'data/last_good/{summary_name}',
    }


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', default='.')
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--inventory', required=True)
    ns = parser.parse_args()
    repo = Path(ns.repo).resolve()
    protected = protected_paths()
    manifest = load(repo / ns.manifest)
    inventory = load(repo / ns.inventory)
    entries = {entry['path']: entry for entry in manifest.get('artifacts', [])}
    include_protected = inventory.get('protectedScopeExcluded') is False
    expected = {
        item for item in inventory.get('paths', [])
        if include_protected or item not in protected
    }
    allowed_extra = set() if include_protected else protected
    errors: list[str] = []

    missing = sorted(expected - set(entries))
    extra = sorted(set(entries) - expected - allowed_extra)
    if missing:
        errors.append(f'missing manifest paths: {missing}')
    if extra:
        errors.append(f'unexpected manifest paths: {extra}')

    run_id = str(manifest.get('runId', '')).strip()
    if not run_id:
        errors.append('manifest runId is empty')

    for rel_path, entry in entries.items():
        if rel_path in protected and not include_protected:
            continue
        file_path = repo / rel_path
        if not file_path.exists():
            errors.append(f'{rel_path}: file missing')
            continue
        actual = sha256(file_path)
        expected_hash = str(entry.get('sha256', ''))
        if actual != expected_hash:
            errors.append(f'{rel_path}: checksum mismatch')
        if entry.get('runId') and entry.get('runId') != run_id:
            errors.append(f'{rel_path}: runId mismatch')

    print(json.dumps({'status': 'blocked' if errors else 'ok', 'runId': run_id, 'errors': errors}, ensure_ascii=False, indent=2))
    return 2 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
