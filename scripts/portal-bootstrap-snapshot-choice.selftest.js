#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app-core-10.js'), 'utf8');
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

console.log('portal-bootstrap-snapshot-choice selftest ok');
