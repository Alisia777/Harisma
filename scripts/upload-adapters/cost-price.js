'use strict';

const { issue, text, number, bool, date, sortByKey } = require('./common');

const dataset = 'cost_price';
const headerAliases = {
  legalEntity: ['legal_entity', 'юрлицо', 'ип', 'seller', 'entity'],
  articleKey: ['article', 'sku', 'sku_code', 'артикул', 'номенклатура'],
  effectiveFrom: ['effective_from', 'date', 'дата', 'действует с'],
  cost: ['cost', 'cost_rub', 'себестоимость', 'себес', 'закупка'],
  currency: ['currency', 'валюта'],
  unit: ['unit', 'единица', 'unit_name'],
  explicitMissing: ['explicit_missing', 'missing_cost', 'нет себестоимости', 'known_missing'],
  sourceAsOf: ['source_as_of', 'sourceAsOf', 'дата источника']
};
const requiredFields = ['legalEntity', 'articleKey', 'effectiveFrom'];

function score(headers) {
  return requiredFields.filter((field) => headers.includes(field)).length + (headers.includes('cost') ? 1 : 0);
}

function normalizeRow(row, context) {
  const record = {
    dataset,
    sourceFile: context.sourceFile,
    sheet: row.__sheet,
    rowNumber: row.__rowNumber,
    cells: row.__cells || {},
    raw: row.__rawByField || {},
    legalEntity: text(row.legalEntity),
    articleKey: text(row.articleKey),
    effectiveFrom: date(row.effectiveFrom) || context.sourceAsOf,
    cost: number(row.cost),
    currency: text(row.currency) || 'RUB',
    unit: text(row.unit) || 'piece',
    explicitMissing: bool(row.explicitMissing),
    sourceAsOf: date(row.sourceAsOf) || context.sourceAsOf,
    createdAt: context.createdAt
  };
  record.canonicalKey = [record.legalEntity, record.articleKey, record.effectiveFrom].filter(Boolean).join('|');
  return record;
}

function validate(records, context) {
  const issues = [];
  const byKey = new Map();
  const existing = new Map((context.existing?.rows || []).map((row) => [[row.legalEntity, row.articleKey, row.effectiveFrom].join('|'), row]));
  records.forEach((record) => {
    if (!record.legalEntity) issues.push(issue(dataset, record, 'legal_entity_required', 'legalEntity', 'Legal entity is missing.', 'Fill the canonical seller/legal entity.'));
    if (!record.articleKey) issues.push(issue(dataset, record, 'sku_resolved', 'articleKey', 'Article/SKU key is missing.', 'Fill a canonical articleKey from SKU registry.'));
    if (!record.effectiveFrom) issues.push(issue(dataset, record, 'valid_effective_from', 'effectiveFrom', 'Effective date is missing or invalid.', 'Use YYYY-MM-DD.'));
    if (!(record.cost > 0) && !record.explicitMissing) issues.push(issue(dataset, record, 'cost_positive_or_explicit_missing', 'cost', 'Cost must be positive or explicitly marked missing.', 'Blank is unknown and zero cannot overwrite verified cost.'));
    if (record.cost === 0) issues.push(issue(dataset, record, 'zero_cannot_overwrite_cost', 'cost', 'Zero cost is not a valid overwrite.', 'Use explicitMissing for a known missing cost or fill a positive cost.'));
    if (record.cost > 0 && !record.currency) issues.push(issue(dataset, record, 'currency_required', 'currency', 'Currency is required for cost.', 'Fill RUB or the actual currency.'));
    if (record.cost > 0 && !record.unit) issues.push(issue(dataset, record, 'unit_required', 'unit', 'Unit is required for cost.', 'Fill piece/unit pack basis.'));
    const existingRecord = byKey.get(record.canonicalKey);
    if (existingRecord && existingRecord.cost !== record.cost) issues.push(issue(dataset, record, 'conflicting_duplicate_cost', 'cost', `Conflicting duplicate cost for ${record.canonicalKey}.`, 'Resolve duplicates before promotion.'));
    byKey.set(record.canonicalKey, record);
    const old = existing.get(record.canonicalKey);
    if (old && old.cost > 0 && !(record.cost > 0)) issues.push(issue(dataset, record, 'blank_cannot_overwrite_verified_cost', 'cost', 'Blank/zero cannot overwrite a verified cost.', 'Fill a positive cost or leave the old batch active.'));
  });
  return issues;
}

function buildProduction(records, context) {
  const rows = sortByKey(records.map((record) => ({
    legalEntity: record.legalEntity,
    articleKey: record.articleKey,
    effectiveFrom: record.effectiveFrom,
    cost: record.cost,
    currency: record.currency,
    unit: record.unit,
    explicitMissing: record.explicitMissing,
    sourceAsOf: record.sourceAsOf,
    batchId: context.batchId,
    status: record.cost > 0 ? 'verified' : 'manual_review'
  })), ['legalEntity', 'articleKey', 'effectiveFrom']);
  return {
    files: {
      'cost_registry.json': { schema: 'portal-cost-registry-v1', sourceAsOf: context.sourceAsOf, batchId: context.batchId, rowCount: rows.length, rows },
      'cost_upload_audit.json': { schema: 'portal-cost-upload-audit-v1', sourceAsOf: context.sourceAsOf, batchId: context.batchId, acceptedRows: rows.length, rejectedRows: 0, issues: [] }
    },
    reports: {
      'portal_cost_reconciliation.json': { schema: 'portal-cost-reconciliation-v1', status: 'ok', batchId: context.batchId, sourceAsOf: context.sourceAsOf, acceptedRows: rows.length, rejectedRows: 0, blockingIssues: 0 }
    }
  };
}

module.exports = { dataset, headerAliases, requiredFields, score, normalizeRow, validate, buildProduction };
