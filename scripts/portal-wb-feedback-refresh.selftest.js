const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
  dedupeCurrentRows,
  reconcileCurrentUnanswered
} = require(path.join(ROOT, 'scripts/portal-wb-feedback-sync.js'));

function source(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function main() {
  const diagnostics = { warnings: [] };
  const deduped = dedupeCurrentRows([
    { id: 'feedback-1', answered: false, text: 'old state' },
    { id: 'feedback-1', answered: true, text: 'current state' },
    { id: 'feedback-2', answered: false }
  ], 'feedbacks', diagnostics);
  assert.equal(deduped.length, 2, 'the same WB entity must not appear twice after a status transition');
  assert.equal(deduped.find((row) => row.id === 'feedback-1').answered, true);
  assert.equal(diagnostics.feedbacksDuplicateRows, 1);

  const reconciled = reconcileCurrentUnanswered(
    deduped,
    [{ id: 'question-1', answered: false }],
    {
      feedbacksUnansweredNow: 0,
      questionsUnansweredWindow: 0
    },
    diagnostics
  );
  assert.equal(reconciled.feedbacks.filter((row) => !row.answered).length, 0);
  assert.equal(reconciled.questions.filter((row) => !row.answered).length, 0);
  assert.equal(reconciled.details.feedbacksResetToZero, true);
  assert.equal(reconciled.details.questionsResetToZero, true);

  const workflow = source('.github/workflows/portal-wb-feedbacks.yml');
  assert.match(workflow, /cron:\s*'12,42 \* \* \* \*'/, 'WB feedbacks must refresh automatically twice per hour');
  assert.match(workflow, /portal-wb-feedback-sync\.js sync/, 'workflow must collect current WB feedback data');
  assert.match(workflow, /--snapshot wb_feedbacks_summary/, 'workflow must publish only the WB feedback snapshot');
  assert.match(workflow, /ALTEA_WB_FEEDBACKS_TOKEN/, 'workflow must use the protected WB feedback token');

  const edge = source('supabase/functions/wb-feedback-sync/index.ts');
  assert.match(edge, /authenticatedUser\(request\)/, 'manual refresh must require an authenticated portal user');
  assert.match(edge, /GITHUB_WORKFLOW_TOKEN/, 'manual refresh must dispatch through the protected workflow token');
  assert.match(edge, /portal-wb-feedbacks\.yml/, 'edge function must target the dedicated workflow');

  const config = source('config.js');
  assert.match(config, /wbFeedbackSyncEndpoint:[\s\S]*wb-feedback-sync/);
  assert.match(source('supabase/config.toml'), /\[functions\.wb-feedback-sync\][\s\S]*verify_jwt\s*=\s*true/);

  console.log('portal-wb-feedback-refresh selftest: ok');
}

main();
