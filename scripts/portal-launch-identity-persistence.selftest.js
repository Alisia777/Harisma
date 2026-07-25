const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appCore = fs.readFileSync(path.join(root, 'app-core-07.js'), 'utf8');
const launchView = fs.readFileSync(path.join(root, 'portal-sku-launch-v1.js'), 'utf8');

assert.match(appCore, /function launchIdentityTokens\(item = \{\}\)/);
assert.match(appCore, /function findLaunchOverrideForItem\(item = \{\}, overrideMap = new Map\(\), identityMap = new Map\(\), usedOverrideIds = new Set\(\)\)/);
assert.match(appCore, /launchSharesIdentity\(entry, draft\)/);
assert.match(appCore, /const overrideIdentityMap = launchOverrideIdentityMap\(\[\.\.\.overrideMap\.values\(\)\]\)/);
assert.match(appCore, /findLaunchOverrideForItem\(item, overrideMap, overrideIdentityMap, usedOverrideIds\)/);
assert.match(appCore, /usedOverrideIds\.has\(launchId\)/);

assert.match(launchView, /const VERSION = '20260724sku-rop-approval-v1'/);
assert.match(launchView, /if \(!keys\.length\) return true;/);
assert.match(launchView, /draft\[key\] = value;/);

console.log('portal-launch-identity-persistence.selftest OK');
