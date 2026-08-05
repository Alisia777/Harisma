#!/usr/bin/env node
'use strict';

const { main: assemble } = require('./build-secure-pages');
const { main: prune } = require('./prune-secure-pages');

function main() {
  assemble();
  prune();
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  }
}

module.exports = { main };
