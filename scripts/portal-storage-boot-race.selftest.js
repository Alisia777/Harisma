#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const appCore10 = read('app-core-10.js');
const initStart = appCore10.indexOf('async function init()');
const promiseStart = appCore10.indexOf('await Promise.all([', initStart);
const promiseEnd = appCore10.indexOf(']);', promiseStart);
const localRead = appCore10.indexOf('const local = loadLocalStorage();', initStart);
const localSnapshot = appCore10.indexOf('const localStorageSnapshot = {', initStart);
const storageCommit = appCore10.indexOf('state.storage =', localSnapshot);

assert(initStart >= 0, 'Primary init must exist');
assert(promiseStart >= 0 && promiseEnd > promiseStart, 'Primary init must await boot payloads');
assert(localRead > promiseEnd, 'loadLocalStorage must run after boot Promise.all');
assert(localSnapshot > localRead, 'localStorageSnapshot must use the late local read');
assert(storageCommit > localSnapshot, 'state.storage must be committed after localStorageSnapshot');

const staleReadBeforeAwait = appCore10.slice(initStart, promiseStart).includes('const local = loadLocalStorage();');
assert.strictEqual(staleReadBeforeAwait, false, 'init must not capture local storage before the asynchronous boot wait');

console.log('portal-storage-boot-race.selftest: ok');
