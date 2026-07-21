#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'portal-dashboard-ceo-motion-v1.js'), 'utf8');
const helperStart = source.indexOf('function loadSourcePayload(path)');
const loaderStart = source.indexOf('function loadSources(options = {})');
if (helperStart < 0 || loaderStart < 0 || helperStart > loaderStart) {
  throw new Error('Dashboard must define its snapshot source helper before loading chart data.');
}

const helper = source.slice(helperStart, loaderStart);
if (!helper.includes("typeof window.__alteaLoadPortalSnapshot === 'function'")) {
  throw new Error('Dashboard chart sources must use the published snapshot loader.');
}
if (!helper.includes('snapshotLoader(path, { force: true })')) {
  throw new Error('Dashboard chart sources must request the current published generation.');
}
if (!helper.includes("fetch(`${path}?v=${VERSION}`, { cache: 'no-store' })")) {
  throw new Error('Dashboard chart sources must retain static JSON as an offline fallback.');
}

const loader = source.slice(loaderStart, source.indexOf('function ensureStyle()', loaderStart));
if (!loader.includes('return loadSourcePayload(path)')) {
  throw new Error('Dashboard loadSources must route every chart source through the snapshot helper.');
}

console.log('portal-dashboard-snapshot-source selftest ok');
