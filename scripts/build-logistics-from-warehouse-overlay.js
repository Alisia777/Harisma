#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const equal = token.indexOf('=');
    const key = token.slice(2, equal >= 0 ? equal : undefined);
    if (equal >= 0) {
      args[key] = token.slice(equal + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  return {
    inputDir: path.resolve(args['input-dir'] || path.join(root, 'data')),
    outputDir: path.resolve(args['output-dir'] || path.join(root, 'data')),
    runDate: dateKey(args['run-date'] || ''),
    generatedAt: String(args['generated-at'] || '').trim()
  };
}

function dateKey(value) {
  const text = String(value || '');
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function generatedAtFor(options) {
  if (options.generatedAt) return options.generatedAt;
  if (options.runDate) return `${options.runDate}T00:00:00+03:00`;
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function latestDateFromRows(rows = []) {
  return rows
    .map((row) => dateKey(row?.date || row?.asOfDate || row?.updatedAt))
    .filter(Boolean)
    .sort()
    .pop() || '';
}

function maxDateKey(values = []) {
  return values
    .map(dateKey)
    .filter(Boolean)
    .sort()
    .pop() || '';
}

function shiftDate(date, offsetDays) {
  const key = dateKey(date);
  if (!key) return '';
  const parsed = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
  return parsed.toISOString().slice(0, 10);
}

function buildLogistics(options = resolveOptions({})) {
  const logisticsPath = path.join(options.inputDir, 'logistics.json');
  const overlay = readJson(path.join(options.inputDir, 'warehouse_stock_overlay.json'), {});
  const logistics = readJson(logisticsPath, {});
  if (!logistics || typeof logistics !== 'object' || Array.isArray(logistics)) {
    throw new Error('logistics.json must be an object.');
  }
  const generatedAt = generatedAtFor(options);
  const overlayRows = rowsOf(overlay);
  const summary = overlay.summary || {};
  const stockWarehouse = numberOrZero(summary.stockWarehouse)
    || overlayRows.reduce((sum, row) => sum + numberOrZero(row.stockWarehouse), 0);
  const accepted = numberOrZero(summary.accepted)
    || overlayRows.reduce((sum, row) => sum + numberOrZero(row.accepted), 0);
  const shippedOzon = numberOrZero(summary.shippedOzon)
    || overlayRows.reduce((sum, row) => sum + numberOrZero(row.shippedOzon), 0);
  const shippedWB = numberOrZero(summary.shippedWB)
    || overlayRows.reduce((sum, row) => sum + numberOrZero(row.shippedWB), 0);
  const existingWindow = logistics.window && typeof logistics.window === 'object' ? logistics.window : {};
  const windowDays = Number.isFinite(Number(existingWindow.days)) && Number(existingWindow.days) > 0
    ? Number(existingWindow.days)
    : 28;
  let latestLogisticsDate = maxDateKey([
    logistics.latest_logistics_date,
    logistics.latestLogisticsDate,
    existingWindow.to,
    overlay.asOfDate,
    latestDateFromRows(overlayRows),
    options.runDate,
    generatedAt
  ]);
  if (options.runDate && latestLogisticsDate > options.runDate) {
    latestLogisticsDate = options.runDate;
  }
  const windowTo = latestLogisticsDate || dateKey(existingWindow.to);
  const windowFrom = windowTo
    ? shiftDate(windowTo, -(windowDays - 1))
    : dateKey(existingWindow.from);

  return {
    ...logistics,
    generatedAt,
    window: {
      ...existingWindow,
      from: windowFrom || dateKey(existingWindow.from),
      to: windowTo || dateKey(existingWindow.to),
      days: windowDays
    },
    latest_logistics_date: latestLogisticsDate,
    latestLogisticsDate: latestLogisticsDate,
    centralWarehouse: {
      ...(logistics.centralWarehouse || {}),
      source: 'warehouse_stock_overlay',
      sourceWorkbook: overlay.sourceWorkbook || '',
      sourceSheet: overlay.sourceSheet || '',
      generatedAt: overlay.generatedAt || generatedAt,
      stock: Math.round(stockWarehouse),
      accepted: Math.round(accepted),
      shippedOzon: Math.round(shippedOzon),
      shippedWB: Math.round(shippedWB),
      skuCount: numberOrZero(summary.matchedSkuCount || summary.matchedRows || overlayRows.length)
    },
    warehouseOverlay: {
      generatedAt: overlay.generatedAt || '',
      asOfDate: overlay.asOfDate || '',
      rows: overlayRows.length,
      matchedRowCount: numberOrZero(overlay.matchedRowCount || overlay.matchedSkuCount)
    }
  };
}

function main() {
  const options = resolveOptions(parseArgs(process.argv));
  const payload = buildLogistics(options);
  const outputPath = path.join(options.outputDir, 'logistics.json');
  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    outputPath,
    generatedAt: payload.generatedAt,
    latestLogisticsDate: payload.latestLogisticsDate || payload.latest_logistics_date,
    centralWarehouse: payload.centralWarehouse
  }, null, 2));
}

if (require.main === module) main();

module.exports = {
  buildLogistics,
  resolveOptions,
  parseArgs
};
