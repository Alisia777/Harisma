#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'portal-daily-close.yml');
const inventoryPath = path.join(root, 'data', 'runtime_snapshot_inventory.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const paths = Array.isArray(inventory.paths) ? inventory.paths : [];

if (paths.includes('data/portal_dashboard_metrics.json')) {
  const command = 'node scripts/build-portal-dashboard-metrics.js --input-dir data --output-dir data';
  if (!workflow.includes(command)) {
    fail('daily close must build portal_dashboard_metrics.json into data before snapshot finalization');
  }
}

if (!workflow.includes('REVISION_FROM=$(TZ=Europe/Moscow date -d "$VALUE -29 days" +%F)')) {
  fail('daily close must expose the 30-day revision window start from the resolved cutoff');
}
if (!workflow.includes('echo "revision_from=$REVISION_FROM" >> "$GITHUB_OUTPUT"')) {
  fail('daily close must publish revision_from through GITHUB_OUTPUT');
}

[
  'node scripts/portal-wb-ads-sync.js sync',
  'node scripts/portal-ozon-ads-finance-sync.js sync'
].forEach((command) => {
  const start = workflow.indexOf(command);
  if (start < 0) fail(`daily close is missing ${command}`);
  const snippet = workflow.slice(start, start + 260);
  if (!snippet.includes("--from '${{ steps.cutoff.outputs.revision_from }}'")) {
    fail(`${command} must refresh from the resolved revision window`);
  }
  if (!snippet.includes("--to '${{ steps.cutoff.outputs.value }}'")) {
    fail(`${command} must refresh through the resolved cutoff date`);
  }
});

[
  'data/portal_dashboard_metrics.json',
  'data/portal_dashboard_reconciliation.json',
  'data/portal_plan_reconciliation.json',
  'data/portal_indicator_audit.json'
].forEach((artifactPath) => {
  if (!workflow.includes(artifactPath)) {
    fail(`daily close artifact upload is missing ${artifactPath}`);
  }
});

console.log('portal-daily-close-workflow selftest ok');
