'use strict';

const { issue, text, number, platform, date, sortByKey } = require('./common');

const dataset = 'warehouse_stock';
const headerAliases = {
  platform: ['marketplace', 'площадка'],
  articleKey: ['article', 'sku', 'sku_code', 'артикул'],
  sourceAsOf: ['source_as_of', 'sourceAsOf', 'дата источника', 'date'],
  inStock: ['stock', 'in_stock', 'остаток', 'склад'],
  inTransit: ['in_transit', 'transit', 'в пути'],
  inRequest: ['in_request', 'request', 'заявка', 'в заявке']
};
const requiredFields = ['articleKey', 'sourceAsOf'];

function score(headers) {
  return requiredFields.filter((field) => headers.includes(field)).length + (headers.includes('inStock') ? 1 : 0);
}

function normalizeRow(row, context) {
  const record = {
    dataset,
    sourceFile: context.sourceFile,
    sheet: row.__sheet,
    rowNumber: row.__rowNumber,
    cells: row.__cells || {},
    raw: row.__rawByField || {},
    platform: platform(row.platform) || 'all',
    articleKey: text(row.articleKey),
    sourceAsOf: date(row.sourceAsOf) || context.sourceAsOf,
    inStock: number(row.inStock),
    inTransit: number(row.inTransit),
    inRequest: number(row.inRequest),
    createdAt: context.createdAt
  };
  record.canonicalKey = [record.platform, record.articleKey, record.sourceAsOf].filter(Boolean).join('|');
  return record;
}

function validate(records) {
  const issues = [];
  records.forEach((record) => {
    if (!record.articleKey) issues.push(issue(dataset, record, 'sku_resolved', 'articleKey', 'Article/SKU key is missing.', 'Fill a canonical articleKey.'));
    if (!record.sourceAsOf) issues.push(issue(dataset, record, 'source_as_of_required', 'sourceAsOf', 'Stock sourceAsOf is required.', 'Use the stock snapshot business date.'));
    for (const field of ['inStock', 'inTransit', 'inRequest']) {
      if (record[field] !== null && record[field] < 0) issues.push(issue(dataset, record, 'stock_non_negative', field, `${field} cannot be negative.`, 'Blank means unknown; use zero only for a confirmed zero.'));
    }
  });
  return issues;
}

function buildProduction(records, context) {
  return {
    files: {},
    reports: {
      'portal_warehouse_stock_upload_preview.json': {
        schema: 'portal-warehouse-stock-upload-preview-v1',
        status: 'ok',
        batchId: context.batchId,
        rows: sortByKey(records, ['platform', 'articleKey'])
      }
    }
  };
}

module.exports = { dataset, headerAliases, requiredFields, score, normalizeRow, validate, buildProduction };
