#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path


root = Path(tempfile.mkdtemp(prefix='portal-manifest-protected-'))
data_dir = root / 'data'
data_dir.mkdir(parents=True)
summary_path = data_dir / 'iu_drr_summary.json'
summary_path.write_text('{"asOfDate":"2026-07-20"}\n', encoding='utf-8')
digest = hashlib.sha256(summary_path.read_bytes()).hexdigest()
inventory_path = data_dir / 'runtime_snapshot_inventory.json'
inventory_path.write_text(json.dumps({
    'protectedScopeExcluded': False,
    'paths': ['data/iu_drr_summary.json'],
}), encoding='utf-8')
manifest_path = data_dir / 'active_snapshot.json'
manifest_path.write_text(json.dumps({
    'runId': 'portal-protected-test',
    'artifacts': [{
        'path': 'data/iu_drr_summary.json',
        'sha256': digest,
        'runId': 'portal-protected-test',
    }],
}), encoding='utf-8')

verifier = Path(__file__).with_name('verify_snapshot_manifest.py')
command = [sys.executable, str(verifier), '--repo', str(root), '--manifest', 'data/active_snapshot.json', '--inventory', 'data/runtime_snapshot_inventory.json']
assert subprocess.run(command, capture_output=True, text=True, check=False).returncode == 0

manifest_path.write_text(json.dumps({'runId': 'portal-protected-test', 'artifacts': []}), encoding='utf-8')
assert subprocess.run(command, capture_output=True, text=True, check=False).returncode == 2

print('verify_snapshot_manifest protected selftest ok')
