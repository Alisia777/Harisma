#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'portal-protected-snapshot-refresh.yml'), 'utf8');
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'data', 'runtime_snapshot_inventory.json'), 'utf8'));

function requireText(text, message) {
  if (!workflow.includes(text)) throw new Error(message);
}

if (inventory.protectedScopeExcluded !== false || !inventory.paths.includes('data/iu_drr_summary.json')) {
  throw new Error('Full runtime inventory must include the guarded IU/DRR summary.');
}
requireText('workflow_dispatch:', 'Protected refresh must be an explicit manual workflow.');
requireText('portal-snapshot-pull.js --output-dir data --inventory data/runtime_snapshot_inventory.json --strict', 'Protected refresh must hydrate the complete published generation.');
requireText('build-iu-drr-summary.js --input-dir data --base-data-dir data --output-dir data', 'Protected refresh must rebuild IU/DRR.');
requireText('npm run portal:iu-drr-logic-guard', 'Protected refresh must enforce the IU/DRR logic guard.');
requireText('portal-atomic-snapshot-finalize.js --data-dir data', 'Protected refresh must package an atomic generation.');
requireText('verify_snapshot_manifest.py --repo . --manifest data/active_snapshot.json --inventory data/runtime_snapshot_inventory.json', 'Protected refresh must verify the full manifest.');
requireText('--verify-readback', 'Protected refresh must verify Supabase readback hashes.');

console.log('portal-protected-snapshot-refresh-workflow selftest ok');
