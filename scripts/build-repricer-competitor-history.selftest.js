#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildCompetitorHistory } = require('./build-repricer-competitor-history');

function trustedRow(date, price, article = 'sku_1') {
  return {
    platform: 'wb',
    article_key: article,
    observed_at: `${date}T08:00:00Z`,
    source: 'test_provider',
    offers: [price - 10, price, price + 10].map((value, index) => ({
      competitor_id: `${article}-${index}`,
      seller: `seller-${index}`,
      comparable_unit_price: value,
      match_score: 0.94,
      in_stock: true,
      observed_at: `${date}T08:00:00Z`
    }))
  };
}

function snapshot(date, rows) {
  return {
    generatedAt: `${date}T08:05:00Z`,
    policy: { minimumOffers: 3 },
    rows
  };
}

function run() {
  let history = {};
  for (let day = 1; day <= 8; day += 1) {
    const date = `2026-07-${String(day).padStart(2, '0')}`;
    history = buildCompetitorHistory({
      previous: history,
      current: snapshot(date, [trustedRow(date, 1000 + day * 5)]),
      asOfDate: date,
      retentionDays: 180
    });
  }
  assert.strictEqual(history.summary.calendar_days, 8);
  assert.strictEqual(history.summary.trusted_observations, 8);
  assert.strictEqual(history.summary.trusted_series_7d, 1);
  assert.strictEqual(history.series[0].trusted_days, 8);
  assert.strictEqual(history.series[0].latest_benchmark_client_price, 1040);

  const replacement = buildCompetitorHistory({
    previous: history,
    current: snapshot('2026-07-08', [trustedRow('2026-07-08', 1200)]),
    asOfDate: '2026-07-08',
    retentionDays: 180
  });
  assert.strictEqual(replacement.observations.length, 8, 'same-day snapshot must replace, not duplicate');
  assert.strictEqual(replacement.series[0].latest_benchmark_client_price, 1200);

  const retainedPrevious = buildCompetitorHistory({
    previous: replacement,
    current: {
      generatedAt: '2026-07-09T08:00:00Z',
      policy: { minimumOffers: 3 },
      rows: [{ ...trustedRow('2026-07-08', 1250), retained_previous: true }]
    },
    asOfDate: '2026-07-09',
    retentionDays: 180
  });
  const latest = retainedPrevious.observations[retainedPrevious.observations.length - 1];
  assert.strictEqual(latest.trusted, true, 'retained old observation must not create a fake new day');
  assert.strictEqual(retainedPrevious.summary.calendar_days, 8);

  const aged = buildCompetitorHistory({
    previous: replacement,
    current: snapshot('2027-02-01', []),
    asOfDate: '2027-02-01',
    retentionDays: 180
  });
  assert.strictEqual(aged.summary.observations, 0, 'observations outside retention must be removed');
  assert.strictEqual(aged.retentionDays, 180, 'retention cannot be shortened below 180 days');
  process.stdout.write('build-repricer-competitor-history selftest: OK\n');
}

run();
