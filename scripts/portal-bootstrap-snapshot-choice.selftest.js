#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app-core-10.js'), 'utf8');
const coreSource = fs.readFileSync(path.join(root, 'app-core-01.js'), 'utf8');
const hotfixSource = fs.readFileSync(path.join(root, 'portal-snapshot-refresh-hotfix.js'), 'utf8');
const start = source.indexOf('const loadBootJsonOrFallback = async');
const end = source.indexOf('\n    };', start);
if (start < 0 || end < 0) throw new Error('Missing bootstrap JSON loader.');

const loader = source.slice(start, end);
const snapshotAware = loader.indexOf("typeof loadJsonOrFallback === 'function'");
const staticOnly = loader.indexOf("typeof loadJson === 'function'");
if (snapshotAware < 0 || staticOnly < 0 || snapshotAware > staticOnly) {
  throw new Error('Bootstrap must prefer the snapshot-aware loader before static JSON.');
}
if (!loader.includes('return cloneBootFallback(fallback)')) {
  throw new Error('Bootstrap loader must preserve its offline fallback.');
}
if (!coreSource.includes('const PORTAL_SNAPSHOT_REQUEST_TIMEOUT_MS = 30000;')) {
  throw new Error('Core snapshot requests need enough time for the published generation.');
}
if (!hotfixSource.includes('var SNAPSHOT_REQUEST_TIMEOUT_MS = 45000;')) {
  throw new Error('Snapshot refresh needs enough time for large chart payloads.');
}

console.log('portal-bootstrap-snapshot-choice selftest ok');
