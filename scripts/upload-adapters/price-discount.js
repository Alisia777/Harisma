'use strict';

const { issue, text, number, platform, date, sortByKey } = require('./common');

const dataset = 'price_discount';
const headerAliases = {
  platform: ['marketplace', 'площадка'],
  articleKey: ['article', 'sku', 'sku_code', 'артикул'],
  effectiveFrom: ['effective_from', 'date', 'дата'],
  price: ['price', 'current_price', 'цена'],
  discountPct: ['discount', 'discount_pct', 'скидка'],
  sourceAsOf: ['source_as_of', 'sourceAsOf', 'дата источника']
};
const requiredFields = ['platform', 'articleKey', 'effectiveFrom'];

function score(headers) {
  return requiredFields.filter((field) => headers.includes(field)).length + (headers.includes('price') ? 1 : 0);
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
    price: number(row.price),
    discountPct: number(row.discountPct),
    sourceAsOf: date(row.sourceAsOf) || context.sourceAsOf,
    createdAt: context.createdAt
  };
  record.canonicalKey = [record.platform, record.articleKey, record.effectiveFrom].filter(Boolean).join('|');
  return record;
}

function validate(records) {
  const issues = [];
  records.forEach((record) => {
    if (!record.platform) issues.push(issue(dataset, record, 'platform_resolved', 'platform', 'Platform is missing.', 'Use WB, Ozon or Yandex Market.'));
    if (!record.articleKey) issues.push(issue(dataset, record, 'sku_resolved', 'articleKey', 'Article/SKU key is missing.', 'Fill a canonical articleKey.'));
    if (record.price !== null && !(record.price > 0)) issues.push(issue(dataset, record, 'price_positive', 'price', 'Price must be positive when present.', 'Blank means unknown; zero is not a price.'));
    if (record.discountPct !== null && (record.discountPct < 0 || record.discountPct > 1)) issues.push(issue(dataset, record, 'discount_range', 'discountPct', 'Discount must be between 0 and 1.', 'Use decimal fraction, e.g. 0.15.'));
  });
  return issues;
}

function buildProduction(records, context) {
  return {
    files: {},
    reports: {
      'portal_price_discount_upload_preview.json': {
        schema: 'portal-price-discount-upload-preview-v1',
        status: 'ok',
        batchId: context.batchId,
        rows: sortByKey(records, ['platform', 'articleKey', 'effectiveFrom'])
      }
    }
  };
}

module.exports = { dataset, headerAliases, requiredFields, score, normalizeRow, validate, buildProduction };
