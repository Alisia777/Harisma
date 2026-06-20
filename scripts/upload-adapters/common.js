'use strict';

const { normalizeKey, numberOrNull, sha256Text } = require('../portal-freshness-core');

function normalizeHeader(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[ё]/g, 'е')
    .replace(/[,.;:()"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasMap(fields) {
  const map = new Map();
  Object.entries(fields || {}).forEach(([field, aliases]) => {
    [field, ...(aliases || [])].forEach((alias) => map.set(normalizeHeader(alias), field));
  });
  return map;
}

function text(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function number(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return numberOrNull(value);
}

function bool(value) {
  if (value === true || value === false) return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return false;
  return ['1', 'true', 'yes', 'y', 'да', 'approved', 'ok', 'согласовано'].includes(raw);
}

function platform(value) {
  const raw = normalizeHeader(value);
  if (['wb', 'wildberries', 'вб', 'вайлдберриз'].includes(raw)) return 'wb';
  if (['ozon', 'озон'].includes(raw)) return 'ozon';
  if (['ym', 'ya', 'yandex', 'yandex market', 'яндекс', 'яндекс маркет', 'я маркет'].includes(raw)) return 'ym';
  return raw || null;
}

function date(value) {
  const raw = String(value ?? '').trim();
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function issue(dataset, record, rule, field, message, suggestion, severity = 'blocking') {
  const canonicalKey = record?.canonicalKey || record?.articleKey || `row_${record?.rowNumber || 'unknown'}`;
  return {
    issueId: sha256Text(`${dataset}|${rule}|${canonicalKey}|${field}`).slice(0, 24),
    dataset,
    file: record?.sourceFile || '',
    sheet: record?.sheet || '',
    row: record?.rowNumber || null,
    column: record?.cells?.[field]?.address || '',
    rawValue: record?.raw?.[field] ?? record?.[field] ?? null,
    rule,
    severity,
    canonicalKey,
    field,
    message,
    suggestion,
    status: 'open',
    createdAt: record?.createdAt || null,
    resolvedAt: null,
    resolvedByBatchId: null
  };
}

function sortByKey(rows, keys) {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const cmp = String(left?.[key] ?? '').localeCompare(String(right?.[key] ?? ''));
      if (cmp) return cmp;
    }
    return 0;
  });
}

module.exports = {
  normalizeHeader,
  aliasMap,
  text,
  number,
  bool,
  platform,
  date,
  issue,
  sortByKey,
  normalizeKey
};
