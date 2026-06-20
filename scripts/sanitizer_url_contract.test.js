#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { sanitizeString } = require('./portal-atomic-snapshot-finalize');

const opts = { root: process.cwd() };
[
  'https://docs.google.com/spreadsheets/d/x/edit?gid=1',
  'http://127.0.0.1:4187/index.html',
  'https://example.supabase.co/rest/v1/x',
  'mailto:ops@example.com',
  'data:application/json;base64,e30=',
  'blob:https://example.com/id'
].forEach((value) => assert.strictEqual(sanitizeString(value, opts), value));

const local = sanitizeString('C:\\Users\\user\\Downloads\\plan.xlsx', opts);
assert.ok(!/^[A-Z]:[\\/]/i.test(local));
assert.ok(local.endsWith('plan.xlsx'));
assert.ok(!sanitizeString('https://docs.google.com/x/edit', opts).includes('httpedit'));

console.log('OK: sanitizer URL/path contract');
