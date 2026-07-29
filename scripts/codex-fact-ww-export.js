#!/usr/bin/env node

const fs = require('fs');

const token = String(process.env.WB_FINANCE_TOKEN || '').trim();
if (!token) throw new Error('ALTEA_WB_FINANCE_TOKEN and ALTEA_WB_API_TOKEN are empty');

const outputPath = process.env.OUTPUT_JSON || '/tmp/fact_ww_export.json';
const endpoint = 'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed';
const now = new Date();
const cutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000);
const queryStart = new Date(now.getTime() - 96 * 60 * 60 * 1000);

function moscowDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSubstitution(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0') return '';
  return raw.toUpperCase().startsWith('WW') ? raw.toUpperCase() : `WW${raw}`;
}

function parseTimestamp(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function latestActivity(row) {
  const candidates = [row.rrDate, row.saleDt, row.orderDt, row.createDate, row.dateTo, row.dateFrom]
    .map(parseTimestamp)
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());
  return candidates[0] || null;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function requestPage(body) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (response.status === 204) return { status: 204, rows: [] };
    const text = await response.text();
    if (response.ok) {
      const payload = text ? JSON.parse(text) : [];
      if (!Array.isArray(payload)) throw new Error(`Expected array, got ${typeof payload}`);
      return { status: response.status, rows: payload };
    }
    if (response.status === 429 && attempt < 6) {
      const retrySeconds = Number(response.headers.get('retry-after') || response.headers.get('x-ratelimit-retry') || 61);
      await sleep((Number.isFinite(retrySeconds) ? retrySeconds + 1 : 62) * 1000);
      continue;
    }
    throw new Error(`WB Finance HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }
  throw new Error('WB Finance request retries exhausted');
}

const fields = [
  'reportId', 'dateFrom', 'dateTo', 'createDate', 'rrdId', 'rrDate',
  'nmId', 'vendorCode', 'title', 'docTypeName', 'sellerOperName', 'quantity',
  'retailPrice', 'retailAmount', 'retailPriceWithDisc', 'forPay',
  'orderDt', 'saleDt', 'srid', 'orderUid',
  'articleSubstitution', 'salePriceAffiliatedDiscountPrc'
];

function summarize(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = row.articleSubstitutionNormalized || `DISCOUNT_WITHOUT_WW:${row.discountPrc}`;
    if (!grouped.has(key)) grouped.set(key, {
      articleSubstitution: key,
      nmIds: new Set(), vendorCodes: new Set(), titles: new Set(),
      rowCount: 0, quantitySales: 0, quantityReturns: 0,
      retailAmountSales: 0, retailAmountReturns: 0,
      forPaySales: 0, forPayReturns: 0,
      srids: new Set(), orderUids: new Set(), discounts: [],
      firstActivityAt: '', lastActivityAt: ''
    });
    const item = grouped.get(key);
    item.rowCount += 1;
    if (row.nmId) item.nmIds.add(String(row.nmId));
    if (row.vendorCode) item.vendorCodes.add(String(row.vendorCode));
    if (row.title) item.titles.add(String(row.title));
    if (row.srid) item.srids.add(String(row.srid));
    if (row.orderUid) item.orderUids.add(String(row.orderUid));
    if (row.discountPrc) item.discounts.push(row.discountPrc);
    const quantity = number(row.quantity) || 1;
    const retailAmount = number(row.retailAmount);
    const forPay = number(row.forPay);
    const doc = String(row.docTypeName || row.sellerOperName || '').toLowerCase();
    const isReturn = doc.includes('возврат') || doc.includes('return');
    if (isReturn) {
      item.quantityReturns += quantity;
      item.retailAmountReturns += retailAmount;
      item.forPayReturns += forPay;
    } else {
      item.quantitySales += quantity;
      item.retailAmountSales += retailAmount;
      item.forPaySales += forPay;
    }
    const activity = String(row.activityAt || '');
    if (activity) {
      if (!item.firstActivityAt || activity < item.firstActivityAt) item.firstActivityAt = activity;
      if (!item.lastActivityAt || activity > item.lastActivityAt) item.lastActivityAt = activity;
    }
  }
  return Array.from(grouped.values()).map((item) => ({
    articleSubstitution: item.articleSubstitution,
    nmIds: Array.from(item.nmIds),
    vendorCodes: Array.from(item.vendorCodes),
    titles: Array.from(item.titles),
    rowCount: item.rowCount,
    quantitySales: item.quantitySales,
    quantityReturns: item.quantityReturns,
    netQuantity: item.quantitySales - item.quantityReturns,
    retailAmountSales: item.retailAmountSales,
    retailAmountReturns: item.retailAmountReturns,
    netRetailAmount: item.retailAmountSales - item.retailAmountReturns,
    forPaySales: item.forPaySales,
    forPayReturns: item.forPayReturns,
    netForPay: item.forPaySales - item.forPayReturns,
    distinctSrids: item.srids.size,
    distinctOrderUids: item.orderUids.size,
    srids: Array.from(item.srids),
    orderUids: Array.from(item.orderUids),
    averageDiscountPrc: item.discounts.length ? item.discounts.reduce((a, b) => a + b, 0) / item.discounts.length : 0,
    firstActivityAt: item.firstActivityAt,
    lastActivityAt: item.lastActivityAt
  })).sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)) || b.rowCount - a.rowCount);
}

(async () => {
  const dateFrom = `${moscowDateKey(queryStart)}T00:00:00`;
  const dateTo = `${moscowDateKey(now)}T23:59:59`;
  const limit = 100000;
  let rrdId = 0;
  let pageCount = 0;
  let fetchedRows = 0;
  const nonZeroRows = [];

  for (;;) {
    const pageResult = await requestPage({ dateFrom, dateTo, limit, rrdId, fields });
    const page = pageResult.rows;
    if (!page.length) break;
    pageCount += 1;
    fetchedRows += page.length;
    for (const row of page) {
      const substitution = normalizeSubstitution(row.articleSubstitution);
      const discountPrc = number(row.salePriceAffiliatedDiscountPrc);
      if (!substitution && discountPrc === 0) continue;
      const activity = latestActivity(row);
      nonZeroRows.push({
        ...row,
        articleSubstitutionNormalized: substitution,
        discountPrc,
        activityAt: activity ? activity.toISOString() : '',
        within72h: Boolean(activity && activity.getTime() >= cutoff.getTime())
      });
    }
    const nextRrdId = page.reduce((max, row) => Math.max(max, Math.trunc(number(row.rrdId))), rrdId);
    if (!(nextRrdId > rrdId)) break;
    rrdId = nextRrdId;
    if (page.length < limit) break;
    await sleep(61_000);
  }

  const within72hRows = nonZeroRows.filter((row) => row.within72h);
  const result = {
    generatedAt: now.toISOString(),
    cutoff72h: cutoff.toISOString(),
    query: { dateFrom, dateTo, fields, limit },
    diagnostics: {
      pageCount, fetchedRows,
      nonZeroRows: nonZeroRows.length,
      within72hRows: within72hRows.length,
      uniqueNonZeroSubstitutions: new Set(nonZeroRows.map((row) => row.articleSubstitutionNormalized).filter(Boolean)).size,
      uniqueWithin72hSubstitutions: new Set(within72hRows.map((row) => row.articleSubstitutionNormalized).filter(Boolean)).size
    },
    summaryWithin72h: summarize(within72hRows),
    summaryAllQueried: summarize(nonZeroRows),
    rowsWithin72h: within72hRows,
    rowsAllQueried: nonZeroRows
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.diagnostics));
})().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
