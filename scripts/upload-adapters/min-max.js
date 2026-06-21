'use strict';

const { issue, text, number, bool, platform, date, sortByKey } = require('./common');

const dataset = 'min_max';
const headerAliases = {
  platform: ['marketplace', 'площадка', 'мп'],
  articleKey: ['article', 'sku', 'sku_code', 'артикул', 'номенклатура'],
  effectiveFrom: ['effective_from', 'date', 'дата', 'действует с'],
  minPrice: ['min', 'min_price', 'мин', 'минимум', 'рабочий min', 'min rub'],
  maxPrice: ['max', 'max_price', 'макс', 'максимум', 'рабочий max', 'max rub'],
  clientMinPrice: ['client_min', 'client min', 'мин клиента', 'buyer_min'],
  clientMaxPrice: ['client_max', 'client max', 'макс клиента', 'buyer_max'],
  approved: ['approved', 'approval', 'согласовано', 'approve_large_change'],
  sourceAsOf: ['source_as_of', 'sourceAsOf', 'дата источника']
};
const requiredFields = ['platform', 'articleKey', 'effectiveFrom', 'minPrice', 'maxPrice'];

function score(headers) {
  return requiredFields.filter((field) => headers.includes(field)).length;
}

function normalizeRow(row, context) {
  const record = {
    dataset,
    sourceFile: context.sourceFile,
    sheet: row.__sheet,
    rowNumber: row.__rowNumber,
    cells: row.__cells || {},
    raw: row.__rawByField || {},
    platform: platform(row.platform),
    articleKey: text(row.articleKey),
    effectiveFrom: date(row.effectiveFrom) || context.sourceAsOf,
    minPrice: number(row.minPrice),
    maxPrice: number(row.maxPrice),
    clientMinPrice: number(row.clientMinPrice),
    clientMaxPrice: number(row.clientMaxPrice),
    approved: bool(row.approved),
    sourceAsOf: date(row.sourceAsOf) || context.sourceAsOf,
    createdAt: context.createdAt
  };
  record.canonicalKey = [record.platform, record.articleKey, record.effectiveFrom].filter(Boolean).join('|');
  return record;
}

function validate(records, context) {
  const issues = [];
  const seen = new Set();
  const existing = new Map((context.existing?.rows || []).map((row) => [[row.platform, row.articleKey, row.effectiveFrom].join('|'), row]));
  records.forEach((record) => {
    if (!record.platform || !['wb', 'ozon', 'ym'].includes(record.platform)) issues.push(issue(dataset, record, 'platform_resolved', 'platform', 'Platform is missing or not supported.', 'Use WB, Ozon or Yandex Market.'));
    if (!record.articleKey) issues.push(issue(dataset, record, 'sku_resolved', 'articleKey', 'Article/SKU key is missing.', 'Fill a canonical articleKey from SKU registry.'));
    if (!record.effectiveFrom) issues.push(issue(dataset, record, 'valid_effective_from', 'effectiveFrom', 'Effective date is missing or invalid.', 'Use YYYY-MM-DD.'));
    if (!(record.minPrice > 0)) issues.push(issue(dataset, record, 'min_positive', 'minPrice', 'MIN price must be greater than zero.', 'Fill a positive MIN; blank is unknown, not zero.'));
    if (!(record.maxPrice >= record.minPrice && record.maxPrice > 0)) issues.push(issue(dataset, record, 'max_not_below_min', 'maxPrice', 'MAX price must be greater than or equal to MIN.', 'Correct MAX or quarantine this row.'));
    if (record.clientMinPrice !== null && record.clientMaxPrice !== null && record.clientMinPrice > record.clientMaxPrice) issues.push(issue(dataset, record, 'client_min_not_above_max', 'clientMinPrice', 'Client MIN is greater than client MAX.', 'Correct the client corridor.'));
    if (seen.has(record.canonicalKey)) issues.push(issue(dataset, record, 'unique_active_key', 'articleKey', `Duplicate active min/max key ${record.canonicalKey}.`, 'Leave only one active row per platform/article/effectiveFrom.'));
    seen.add(record.canonicalKey);
    const old = existing.get(record.canonicalKey);
    if (old && old.minPrice > 0 && record.minPrice > 0) {
      const delta = Math.abs(record.minPrice - old.minPrice) / Math.max(old.minPrice, 1);
      if (delta > 0.5 && !record.approved) issues.push(issue(dataset, record, 'large_change_requires_approval', 'minPrice', 'MIN price changes by more than 50%.', 'Mark the row as approved after commercial review.'));
    }
  });
  return issues;
}

function buildProduction(records, context) {
  const rows = sortByKey(records.map((record) => ({
    platform: record.platform,
    articleKey: record.articleKey,
    effectiveFrom: record.effectiveFrom,
    minPrice: record.minPrice,
    maxPrice: record.maxPrice,
    clientMinPrice: record.clientMinPrice,
    clientMaxPrice: record.clientMaxPrice,
    sourceAsOf: record.sourceAsOf,
    batchId: context.batchId,
    status: 'verified'
  })), ['platform', 'articleKey', 'effectiveFrom']);
  return {
    files: {
      'min_max_registry.json': { schema: 'portal-min-max-registry-v1', sourceAsOf: context.sourceAsOf, batchId: context.batchId, rowCount: rows.length, rows },
      'min_max_upload_audit.json': { schema: 'portal-min-max-upload-audit-v1', sourceAsOf: context.sourceAsOf, batchId: context.batchId, acceptedRows: rows.length, rejectedRows: 0, issues: [] }
    },
    reports: {
      'portal_min_max_reconciliation.json': { schema: 'portal-min-max-reconciliation-v1', status: 'ok', batchId: context.batchId, sourceAsOf: context.sourceAsOf, acceptedRows: rows.length, rejectedRows: 0, blockingIssues: 0 }
    }
  };
}

module.exports = { dataset, headerAliases, requiredFields, score, normalizeRow, validate, buildProduction };
