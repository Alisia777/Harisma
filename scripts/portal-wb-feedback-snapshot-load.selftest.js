#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const {
  buildCardRatingDynamics,
  buildHistory
} = require('./portal-wb-feedback-sync');
const { snapshotChunkSize } = require('./portal-google-sheet-upload');

function isoDay(index) {
  const date = new Date('2026-04-30T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

const feedbacks = Array.from({ length: 90 }, (_, index) => ({
  id: `feedback-${index + 1}`,
  date: isoDay(index),
  nmId: 123456,
  articleKey: 'test-article',
  supplierArticle: 'test-article',
  valuation: 4 + ((index % 2) * 0.5),
  isLowRating: false,
  reviewPoints: 0
}));
const cards = [{
  nmId: 123456,
  articleKey: 'test-article',
  supplierArticle: 'test-article',
  productName: 'Тестовая карточка',
  brandName: 'Алтея'
}];
const options = {
  from: '2026-04-30',
  to: '2026-07-28',
  last7From: '2026-07-22'
};

const dynamics = buildCardRatingDynamics(feedbacks, cards, options);
assert.equal(dynamics.dates.length, 30, 'portal rating matrix must keep only the last 30 days');
assert.equal(dynamics.dates[0], '2026-06-29');
assert.equal(dynamics.dates.at(-1), options.to);
assert.equal(dynamics.matrix[0].history.length, 30, 'card history must match the compact 30-day matrix');

const previousHistory = Array.from({ length: 50 }, (_, index) => ({
  date: isoDay(index),
  cards: []
}));
const payload = {
  generatedAt: '2026-07-28T12:00:00.000Z',
  window: { from: options.from, to: options.to },
  summary: {
    feedbacks: { count: 90, unanswered: 2, lowRating: 0, reviewPoints: 0, reviewPointsFeedbacks: 0, avgRating: 4.5 },
    questions: { count: 0, unanswered: 0 }
  },
  cards: []
};
const history = buildHistory({ history: previousHistory }, payload, options);
assert.equal(history.length, 14, 'portal daily snapshots must stay bounded to 14 days');
assert.equal(history.at(-1).date, options.to);

assert.equal(snapshotChunkSize('wb_feedbacks_summary'), 96 * 1024, 'WB feedback payload must use browser-friendly large chunks');
assert.equal(snapshotChunkSize('dashboard'), 16000, 'unrelated snapshots must keep their existing chunk size');

console.log('portal-wb-feedback-snapshot-load selftest ok');
