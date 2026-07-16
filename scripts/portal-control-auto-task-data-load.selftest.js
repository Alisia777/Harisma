#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'app-core-01.js'), 'utf8');
const kanban = fs.readFileSync(path.join(root, 'portal-task-kanban-v1.js'), 'utf8');
const snapshotRefresh = fs.readFileSync(path.join(root, 'portal-snapshot-refresh-hotfix.js'), 'utf8');
const supabaseSnapshot = fs.readFileSync(path.join(root, 'portal-supabase-snapshot-hotfix.js'), 'utf8');

const controlStart = core.indexOf('controlCenter: async () => {');
const controlEnd = core.indexOf('\n  adsFunnel: async () => {', controlStart);
assert(controlStart >= 0 && controlEnd > controlStart, 'controlCenter lazy loader must exist');
const controlLoader = core.slice(controlStart, controlEnd);

[
  'data/product_leaderboard.json',
  'data/oos_control.json',
  'data/predictive_risk_snapshot.json',
  'data/auto_task_signals.json',
  'data/predictive_risk_outcome_audit.json',
  'data/control_auto_task_sources.json',
  'data/last_good/skus.json'
].forEach((fileName) => {
  const escaped = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert(
    new RegExp(`loadJsonOrFallback\\(\\s*['"]${escaped}['"]`).test(controlLoader),
    `controlCenter must load ${fileName}`
  );
});

[
  'data/smart_price_overlay.json',
  'data/ads_summary.json'
].forEach((fileName) => {
  assert(
    !controlLoader.includes(fileName),
    `controlCenter must use the compact auto-task source instead of ${fileName}`
  );
});

[
  'Promise.resolve(state.oosControl',
  'Promise.resolve(state.smartPriceOverlay'
].forEach((stalePattern) => {
  assert(!controlLoader.includes(stalePattern), `controlCenter must not reuse an empty layer: ${stalePattern}`);
});

[
  'state?.oosControl?.generatedAt',
  'state?.smartPriceOverlay?.generatedAt',
  'state?.adsSummary?.generatedAt',
  'state?.autoSignalBaselines?.generatedAt'
].forEach((stamp) => {
  assert(kanban.includes(stamp), `task cache signature must include ${stamp}`);
});

assert(
  core.includes("'data/control_auto_task_sources.json': 'control_auto_task_sources'"),
  'compact auto-task source must participate in runtime snapshots'
);
assert(
  snapshotRefresh.includes('"data/control_auto_task_sources.json": "control_auto_task_sources"'),
  'snapshot refresh must know the compact auto-task source'
);
assert(
  snapshotRefresh.includes('if (view === "control")'),
  'task refresh must use its scoped data set even with portal-refresh'
);
assert(
  snapshotRefresh.includes('location.hash') && snapshotRefresh.includes('if (route) return route;'),
  'snapshot refresh must prioritize the hash route over stale stored view state'
);
assert(
  snapshotRefresh.includes('"control_auto_task_sources"'),
  'task refresh scope must include the compact source'
);
assert(
  supabaseSnapshot.includes("'control_auto_task_sources'"),
  'Supabase snapshot refresh must publish and load the compact task source'
);
assert(
  supabaseSnapshot.includes("if (view === 'control')"),
  'Supabase task refresh must stay scoped on direct task entry'
);
assert(
  supabaseSnapshot.includes("location?.hash") && supabaseSnapshot.includes('if (route) return route;'),
  'Supabase refresh must prioritize the hash route over stale stored view state'
);

console.log('portal-control-auto-task-data-load selftest: ok');
