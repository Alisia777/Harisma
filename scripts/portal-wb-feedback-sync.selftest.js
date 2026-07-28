#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  normalizeFeedback,
  normalizeQuestion,
  reconcileCommunicationRows,
  resolveOptions,
  summarizeQuestions,
  summarizeRows
} = require('./portal-wb-feedback-sync');

const options = resolveOptions([
  'node',
  'portal-wb-feedback-sync.js',
  'sync',
  '--from',
  '2026-06-29',
  '--to',
  '2026-07-28'
].reduce((args, value, index, rows) => {
  if (index < 2) return args;
  if (index === 2) {
    args.command = value;
    return args;
  }
  if (!value.startsWith('--')) return args;
  args[value.slice(2)] = rows[index + 1];
  return args;
}, {}));

const open = [
  {
    id: 'race',
    createdDate: '2026-07-28T08:00:00Z',
    productValuation: 1,
    productDetails: { supplierArticle: 'sku_1' }
  },
  {
    id: 'still-open',
    createdDate: '2026-05-01T08:00:00Z',
    productValuation: 4,
    productDetails: { supplierArticle: 'sku_2' }
  }
];
const answered = [{
  ...open[0],
  answer: { text: 'done' }
}];
const reconciled = reconcileCommunicationRows(open, answered);
assert.strictEqual(reconciled.length, 2);
assert.strictEqual(reconciled.find((row) => row.id === 'race').__isAnsweredQuery, true);
assert.strictEqual(reconciled.find((row) => row.id === 'still-open').__isAnsweredQuery, false);

const lookups = { byArticle: new Map(), byArticleKey: new Map(), byNmId: new Map() };
const feedbacks = reconciled.map((row) => normalizeFeedback(row, lookups));
assert.strictEqual(feedbacks.find((row) => row.id === 'race').answered, true);
assert.strictEqual(feedbacks.find((row) => row.id === 'still-open').answered, false);

const windowRows = summarizeRows(
  feedbacks,
  (row) => row.date >= options.from && row.date <= options.to
);
assert.strictEqual(windowRows.count, 1, 'old current open row must not inflate the selected 30-day period');
assert.strictEqual(windowRows.unanswered, 0, 'answered state must win an API race');

const questionRows = reconcileCommunicationRows(
  [{ id: 'q-open', createdDate: '2026-07-28T08:00:00Z', productDetails: {} }],
  []
).map((row) => normalizeQuestion(row, lookups));
assert.strictEqual(summarizeQuestions(questionRows).unanswered, 1);
assert.strictEqual(options.from, '2026-06-29');
assert.strictEqual(options.to, '2026-07-28');

process.stdout.write('portal-wb-feedback-sync selftest: OK\n');
