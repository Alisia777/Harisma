#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoDir = path.resolve(__dirname, '..');
const truthWorkflow = fs.readFileSync(
  path.join(repoDir, '.github', 'workflows', 'portal-data-truth.yml'),
  'utf8'
);
const closeWorkflow = fs.readFileSync(
  path.join(repoDir, '.github', 'workflows', 'portal-daily-close.yml'),
  'utf8'
);

assert.match(
  truthWorkflow,
  /group:\s*portal-data-truth-\$\{\{\s*github\.event_name\s*\}\}-\$\{\{\s*github\.ref\s*\}\}/,
  'truth runs must be grouped by event and ref so a newer main push supersedes only an older main push'
);
assert.match(
  truthWorkflow,
  /cancel-in-progress:\s*true/,
  'a superseded truth run must be cancelled before it can enqueue an obsolete daily close'
);
assert.match(
  closeWorkflow,
  /github\.event\.workflow_run\.event\s*!=\s*'schedule'/,
  'the pre-settlement scheduled truth audit must not enqueue a daily close'
);
assert.match(
  closeWorkflow,
  /cron:\s*'30 7 \* \* \*'/,
  'the protected D-1 close must remain scheduled for 07:30 UTC (10:30 MSK)'
);
assert.match(
  closeWorkflow,
  /github\.event\.workflow_run\.head_branch\s*==\s*'main'/,
  'only successful truth runs for main may enqueue a change-driven close'
);

console.log('[portal-workflow-trigger-correctness] PASS: scheduled and superseded truth runs cannot enqueue obsolete daily closes');
