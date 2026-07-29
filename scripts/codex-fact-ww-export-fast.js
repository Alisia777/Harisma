#!/usr/bin/env node

const fs = require('fs');
const token = String(process.env.WB_FINANCE_TOKEN || '').trim();
if (!token) throw new Error('WB finance token is empty');

const endpoint = 'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed';
const outputPath = process.env.OUTPUT_JSON || '/tmp/fact_ww_export.json';
const now = new Date();
const cutoff = new Date(now.getTime() - 72 * 60 * 60 * 1000);
const queryStart = new Date(now.getTime() - 78 * 60 * 60 * 1000);

const num = (value) => {
  const result = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(result) ? result : 0;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dateKeyMsk = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const normalizeWW = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '0') return '';
  return raw.toUpperCase().startsWith('WW') ? raw.toUpperCase() : `WW${raw}`;
};
const parseDate = (value) => {
  const timestamp = Date.parse(String(value ?? '').trim());
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
};
const activityAt = (row) => [row.rrDate, row.saleDt, row.orderDt, row.createDate]
  .map(parseDate).filter(Boolean).sort((a, b) => b - a)[0] || null;

async function fetchPage(body) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (response.status === 204) return [];
    const text = await response.text();
    if (response.ok) {
      const payload = text ? JSON.parse(text) : [];
      if (!Array.isArray(payload)) throw new Error(`Expected array, got ${typeof payload}`);
      return payload;
    }
    if (response.status === 429 && attempt < 5) {
      const seconds = Number(response.headers.get('retry-after') || response.headers.get('x-ratelimit-retry') || 61);
      await sleep((Number.isFinite(seconds) ? seconds + 1 : 62) * 1000);
      continue;
    }
    throw new Error(`WB Finance HTTP ${response.status}: ${text.slice(0, 1200)}`);
  }
  throw new Error('WB Finance retries exhausted');
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const ww = row.articleSubstitutionNormalized;
    if (!groups.has(ww)) groups.set(ww, {
      articleSubstitution: ww, nmIds: new Set(), vendorCodes: new Set(), titles: new Set(),
      rowCount: 0, sales: 0, returns: 0, retailSales: 0, retailReturns: 0,
      forPaySales: 0, forPayReturns: 0, srids: new Set(), orderUids: new Set(),
      discounts: [], firstActivityAt: '', lastActivityAt: ''
    });
    const group = groups.get(ww);
    group.rowCount += 1;
    if (row.nmId) group.nmIds.add(String(row.nmId));
    if (row.vendorCode) group.vendorCodes.add(String(row.vendorCode));
    if (row.title) group.titles.add(String(row.title));
    if (row.srid) group.srids.add(String(row.srid));
    if (row.orderUid) group.orderUids.add(String(row.orderUid));
    if (row.discountPrc) group.discounts.push(row.discountPrc);
    const quantity = num(row.quantity) || 1;
    const isReturn = /возврат|return/i.test(String(row.docTypeName || row.sellerOperName || ''));
    if (isReturn) {
      group.returns += quantity;
      group.retailReturns += num(row.retailAmount);
      group.forPayReturns += num(row.forPay);
    } else {
      group.sales += quantity;
      group.retailSales += num(row.retailAmount);
      group.forPaySales += num(row.forPay);
    }
    const when = row.activityAt || '';
    if (when) {
      if (!group.firstActivityAt || when < group.firstActivityAt) group.firstActivityAt = when;
      if (!group.lastActivityAt || when > group.lastActivityAt) group.lastActivityAt = when;
    }
  }
  return Array.from(groups.values()).map((group) => ({
    articleSubstitution: group.articleSubstitution,
    nmIds: Array.from(group.nmIds), vendorCodes: Array.from(group.vendorCodes), titles: Array.from(group.titles),
    rowCount: group.rowCount, sales: group.sales, returns: group.returns, netBuyouts: group.sales - group.returns,
    retailSales: group.retailSales, retailReturns: group.retailReturns,
    netRetailAmount: group.retailSales - group.retailReturns,
    forPaySales: group.forPaySales, forPayReturns: group.forPayReturns,
    netForPay: group.forPaySales - group.forPayReturns,
    distinctSrids: group.srids.size, distinctOrderUids: group.orderUids.size,
    averageDiscountPrc: group.discounts.length ? group.discounts.reduce((a, b) => a + b, 0) / group.discounts.length : 0,
    firstActivityAt: group.firstActivityAt, lastActivityAt: group.lastActivityAt
  })).sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)) || b.rowCount - a.rowCount);
}

(async () => {
  const fields = [
    'reportId','rrdId','rrDate','createDate','nmId','vendorCode','title','docTypeName','sellerOperName',
    'quantity','retailAmount','retailPriceWithDisc','forPay','orderDt','saleDt','srid','orderUid',
    'articleSubstitution','salePriceAffiliatedDiscountPrc'
  ];
  const dateFrom = `${dateKeyMsk(queryStart)}T00:00:00`;
  const dateTo = `${dateKeyMsk(now)}T23:59:59`;
  const limit = 100000;
  let rrdId = 0;
  let pageCount = 0;
  let fetchedRows = 0;
  const nonZeroRows = [];

  for (;;) {
    const page = await fetchPage({ dateFrom, dateTo, period: 'daily', limit, rrdId, fields });
    if (!page.length) break;
    pageCount += 1;
    fetchedRows += page.length;
    console.log(`page=${pageCount} rows=${page.length} total=${fetchedRows}`);
    for (const row of page) {
      const ww = normalizeWW(row.articleSubstitution);
      const discountPrc = num(row.salePriceAffiliatedDiscountPrc);
      if (!ww && !discountPrc) continue;
      const activity = activityAt(row);
      nonZeroRows.push({
        ...row, articleSubstitutionNormalized: ww, discountPrc,
        activityAt: activity ? activity.toISOString() : '',
        within72h: Boolean(activity && activity >= cutoff)
      });
    }
    const next = page.reduce((max, row) => Math.max(max, Math.trunc(num(row.rrdId))), rrdId);
    if (!(next > rrdId) || page.length < limit) break;
    rrdId = next;
    await sleep(61_000);
  }

  const rowsWithin72h = nonZeroRows.filter((row) => row.within72h);
  const result = {
    generatedAt: now.toISOString(), cutoff72h: cutoff.toISOString(),
    query: { dateFrom, dateTo, period: 'daily', fields, limit },
    diagnostics: {
      pageCount, fetchedRows, nonZeroRows: nonZeroRows.length, within72hRows: rowsWithin72h.length,
      uniqueNonZeroSubstitutions: new Set(nonZeroRows.map((row) => row.articleSubstitutionNormalized).filter(Boolean)).size,
      uniqueWithin72hSubstitutions: new Set(rowsWithin72h.map((row) => row.articleSubstitutionNormalized).filter(Boolean)).size
    },
    summaryWithin72h: groupRows(rowsWithin72h),
    summaryAllQueried: groupRows(nonZeroRows),
    rowsWithin72h, rowsAllQueried: nonZeroRows
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.diagnostics));
})().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
