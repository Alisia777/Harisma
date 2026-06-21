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
