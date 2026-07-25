#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function isoDate(value) {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function platformRows(payload, platform) {
  const keys = platform === 'ym' ? ['ym', 'ya'] : [platform];
  return keys.flatMap((key) => {
    const rows = payload?.platforms?.[key]?.rows;
    return Array.isArray(rows) ? rows : [];
  });
}

function normalizedKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function currentSnapshotRows(payload, platform, asOfDate) {
  return platformRows(payload, platform).filter((row) => (
    String(row?.sourceMode || '') === `${platform}-cabinet-current-snapshot`
    && isoDate(row?.currentPriceDate || row?.valueDate || row?.historyFreshnessDate) === asOfDate
  ));
}

function latestPriceDate(rows) {
  const dates = [];
  (rows || []).forEach((row) => {
    if (positive(row?.currentFillPrice) || positive(row?.currentPrice) || positive(row?.currentClientPrice)) {
      const rowDate = isoDate(row?.currentPriceDate || row?.valueDate || row?.historyFreshnessDate);
      if (rowDate) dates.push(rowDate);
    }
    ['daily', 'timeline', 'monthly'].forEach((field) => {
      (Array.isArray(row?.[field]) ? row[field] : []).forEach((point) => {
        if (!positive(point?.price) && !positive(point?.clientPrice)) return;
        const pointDate = isoDate(point?.date);
        if (pointDate) dates.push(pointDate);
      });
    });
  });
  return dates.sort().slice(-1)[0] || '';
}

function dateLagDays(later, earlier) {
  const laterMs = Date.parse(`${later}T00:00:00Z`);
  const earlierMs = Date.parse(`${earlier}T00:00:00Z`);
  if (!Number.isFinite(laterMs) || !Number.isFinite(earlierMs)) return null;
  return Math.round((laterMs - earlierMs) / 86400000);
}

const overlay = readJson('data/smart_price_overlay.json');
const prices = readJson('data/prices.json');
const repricer = readJson('data/repricer.json');
const updateAudit = readJson('data/price_update_audit.json');
const asOfDate = isoDate(overlay.asOfDate);
const imported = overlay?.priceHistoryImport?.rowsByPlatform || {};
const currentSnapshot = overlay?.priceCurrentSnapshot || {};
const currentSnapshotDate = isoDate(currentSnapshot.asOfDate);
const currentSnapshotCounts = currentSnapshot?.rowsByPlatform || {};

assert.ok(asOfDate, 'У ценового overlay должна быть asOfDate');
assert.ok(isoDate(overlay?.priceHistoryImport?.asOfDate), 'Импорт истории цен должен фиксировать дату источника');
assert.ok(Number(imported.wb) > 0, 'Свежий импорт должен содержать строки WB');
assert.ok(Number(imported.ozon) > 0, 'Свежий импорт должен содержать строки Ozon');
assert.ok(Number(imported.ym) > 0, 'Свежий импорт должен содержать строки Яндекс Маркета');
assert.strictEqual(currentSnapshotDate, asOfDate, 'Текущий кабинетный срез должен задавать общую дату цены');
assert.ok(Number(currentSnapshotCounts.wb) >= 90, 'Текущий кабинетный срез WB не должен быть точечным');
assert.ok(Number(currentSnapshotCounts.ozon) >= 90, 'Текущий кабинетный срез Ozon не должен быть точечным');

['wb', 'ozon'].forEach((platform) => {
  const sourceRows = currentSnapshotRows(overlay, platform, currentSnapshotDate);
  const derivedRows = new Map(
    platformRows(prices, platform).map((row) => [normalizedKey(row?.articleKey || row?.article), row])
  );
  assert.strictEqual(
    sourceRows.length,
    Number(currentSnapshotCounts[platform]),
    `${platform}: число строк кабинетного среза должно совпадать с метаданными импорта`
  );
  sourceRows.forEach((sourceRow) => {
    const key = normalizedKey(sourceRow?.articleKey || sourceRow?.article);
    const derivedRow = derivedRows.get(key);
    assert.ok(derivedRow, `${platform}: SKU ${key} из кабинетного среза должен попасть в prices.json`);
    assert.strictEqual(
      Number(derivedRow.currentPrice),
      Number(sourceRow.currentFillPrice),
      `${platform}: текущая загруженная цена ${key} должна совпадать с кабинетным срезом`
    );
    assert.strictEqual(
      isoDate(derivedRow.currentPriceDate),
      currentSnapshotDate,
      `${platform}: дата текущей цены ${key} должна совпадать с кабинетным срезом`
    );
    if (sourceRow.clearCurrentClientPrice) {
      assert.ok(!positive(derivedRow.currentClientPrice), `${platform}: отсутствующая цена клиента ${key} не должна наследоваться`);
      assert.strictEqual(derivedRow.currentSppPct, null, `${platform}: неизвестный СПП ${key} не должен превращаться в 0%`);
    } else if (positive(sourceRow.currentClientPrice)) {
      assert.strictEqual(
        Number(derivedRow.currentClientPrice),
        Number(sourceRow.currentClientPrice),
        `${platform}: цена клиента ${key} должна совпадать с кабинетным срезом`
      );
    }
  });
});

const latestByPlatform = Object.fromEntries(
  ['wb', 'ozon', 'ym'].map((platform) => [platform, latestPriceDate(platformRows(prices, platform))])
);

assert.strictEqual(latestByPlatform.wb, asOfDate, 'WB должен доходить до даты актуального ценового среза');
assert.strictEqual(latestByPlatform.ozon, asOfDate, 'Ozon должен доходить до даты актуального ценового среза');
assert.ok(latestByPlatform.ym, 'У Яндекс Маркета должен быть фактический ценовой срез');
const maxPlatformGapDays = Number(updateAudit?.thresholds?.maxPlatformGapDays || 3);
assert.ok(
  dateLagDays(asOfDate, latestByPlatform.ym) <= maxPlatformGapDays,
  `Яндекс Маркет не должен отставать от общего среза больше чем на ${maxPlatformGapDays} дня: ${latestByPlatform.ym} vs ${asOfDate}`
);
const generationIds = [
  overlay?.priceGeneration?.id,
  prices?.priceGeneration?.id,
  repricer?.priceGeneration?.id,
  updateAudit?.generationId
];
assert.ok(generationIds.every(Boolean), 'Все ценовые артефакты должны содержать идентификатор поколения');
assert.strictEqual(new Set(generationIds).size, 1, 'Overlay, prices, repricer и аудит должны быть одним поколением');
assert.strictEqual(updateAudit.publishAllowed, true, 'Активное ценовое поколение должно пройти аудит');

process.stdout.write(
  `portal-price-source-freshness selftest: ok (${generationIds[0]}, WB ${latestByPlatform.wb}, Ozon ${latestByPlatform.ozon}, Я.Маркет ${latestByPlatform.ym})\n`
);
