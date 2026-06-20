'use strict';

const { issue, text, date, sortByKey } = require('./common');

const dataset = 'sku_registry';
const headerAliases = {
  articleKey: ['article', 'sku', 'sku_code', 'артикул'],
  owner: ['owner', 'ответственный'],
  wbOwner: ['wb_owner', 'owner_wb', 'wb ответственный'],
  ozonOwner: ['ozon_owner', 'owner_ozon', 'ozon ответственный'],
  ymOwner: ['ym_owner', 'owner_ym', 'yandex_owner', 'yandex ответственный'],
  sourceAsOf: ['source_as_of', 'sourceAsOf', 'дата источника']
};
const requiredFields = ['articleKey'];

function score(headers) {
  return requiredFields.filter((field) => headers.includes(field)).length + (headers.includes('owner') ? 1 : 0);
}

function normalizeRow(row, context) {
  const record = {
    dataset,
    sourceFile: context.sourceFile,
    sheet: row.__sheet,
    rowNumber: row.__rowNumber,
    cells: row.__cells || {},
    raw: row.__rawByField || {},
    articleKey: text(row.articleKey),
    owner: text(row.owner),
    platformOwners: { wb: text(row.wbOwner), ozon: text(row.ozonOwner), ym: text(row.ymOwner) },
    sourceAsOf: date(row.sourceAsOf) || context.sourceAsOf,
    createdAt: context.createdAt
  };
  record.canonicalKey = record.articleKey || `row_${record.rowNumber}`;
  return record;
}

function validate(records) {
  const issues = [];
  const seen = new Set();
  records.forEach((record) => {
    if (!record.articleKey) issues.push(issue(dataset, record, 'sku_resolved', 'articleKey', 'Article/SKU key is missing.', 'Fill a canonical articleKey.'));
    if (seen.has(record.articleKey)) issues.push(issue(dataset, record, 'unique_article_key', 'articleKey', `Duplicate SKU ${record.articleKey}.`, 'Keep one canonical SKU row.'));
    seen.add(record.articleKey);
    if (!record.owner && !Object.values(record.platformOwners || {}).filter(Boolean).length) issues.push(issue(dataset, record, 'owner_required', 'owner', 'Owner is missing.', 'Fill canonical or platform owner before automatic actions.'));
  });
  return issues;
}

function buildProduction(records, context) {
  return {
    files: {},
    reports: {
      'portal_sku_registry_upload_preview.json': {
        schema: 'portal-sku-registry-upload-preview-v1',
        status: 'ok',
        batchId: context.batchId,
        rows: sortByKey(records, ['articleKey'])
      }
    }
  };
}

module.exports = { dataset, headerAliases, requiredFields, score, normalizeRow, validate, buildProduction };
