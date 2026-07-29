#!/usr/bin/env node

const fs = require('fs');
const token = String(process.env.WB_FINANCE_TOKEN || '').trim();
const targetDate = String(process.env.TARGET_DATE || '').trim();
const outputPath = process.env.OUTPUT_JSON || '/tmp/fact_ww_one_day.json';
if (!token) throw new Error('WB finance token is empty');
if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error('TARGET_DATE must be YYYY-MM-DD');

const endpoint = 'https://finance-api.wildberries.ru/api/finance/v1/sales-reports/detailed';
const num = (v) => { const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const normalizeWW = (v) => { const s = String(v ?? '').trim(); return !s || s === '0' ? '' : (s.toUpperCase().startsWith('WW') ? s.toUpperCase() : `WW${s}`); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function page(body) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body)
    });
    if (response.status === 204) return [];
    const text = await response.text();
    if (response.ok) return text ? JSON.parse(text) : [];
    if (response.status === 429 && attempt < 6) {
      const seconds = Number(response.headers.get('retry-after') || response.headers.get('x-ratelimit-retry') || 61);
      await sleep((Number.isFinite(seconds) ? seconds + 1 : 62) * 1000);
      continue;
    }
    throw new Error(`WB Finance HTTP ${response.status}: ${text.slice(0, 1200)}`);
  }
  throw new Error('WB Finance retries exhausted');
}

(async () => {
  const fields = [
    'reportId','rrdId','rrDate','createDate','nmId','vendorCode','title','docTypeName','sellerOperName',
    'quantity','retailAmount','retailPriceWithDisc','forPay','orderDt','saleDt','srid','orderUid',
    'articleSubstitution','salePriceAffiliatedDiscountPrc'
  ];
  const limit = 100000;
  let rrdId = 0;
  let pageCount = 0;
  let fetchedRows = 0;
  const rows = [];
  for (;;) {
    const batch = await page({
      dateFrom: `${targetDate}T00:00:00`, dateTo: `${targetDate}T23:59:59`,
      period: 'daily', limit, rrdId, fields
    });
    if (!Array.isArray(batch) || !batch.length) break;
    pageCount += 1;
    fetchedRows += batch.length;
    for (const row of batch) {
      const ww = normalizeWW(row.articleSubstitution);
      const discountPrc = num(row.salePriceAffiliatedDiscountPrc);
      if (!ww && !discountPrc) continue;
      rows.push({ ...row, articleSubstitutionNormalized: ww, discountPrc });
    }
    const next = batch.reduce((max, row) => Math.max(max, Math.trunc(num(row.rrdId))), rrdId);
    if (!(next > rrdId) || batch.length < limit) break;
    rrdId = next;
    await sleep(61_000);
  }

  const groups = new Map();
  for (const row of rows) {
    const ww = row.articleSubstitutionNormalized || `DISCOUNT_WITHOUT_WW:${row.discountPrc}`;
    if (!groups.has(ww)) groups.set(ww, {
      articleSubstitution: ww, nmIds: new Set(), vendorCodes: new Set(), titles: new Set(),
      rowCount: 0, sales: 0, returns: 0, retailSales: 0, retailReturns: 0,
      forPaySales: 0, forPayReturns: 0, srids: new Set(), orderUids: new Set(), discounts: [],
      orderDates: new Set(), saleDates: new Set(), reportDates: new Set()
    });
    const g = groups.get(ww);
    g.rowCount += 1;
    if (row.nmId) g.nmIds.add(String(row.nmId));
    if (row.vendorCode) g.vendorCodes.add(String(row.vendorCode));
    if (row.title) g.titles.add(String(row.title));
    if (row.srid) g.srids.add(String(row.srid));
    if (row.orderUid) g.orderUids.add(String(row.orderUid));
    if (row.orderDt) g.orderDates.add(String(row.orderDt));
    if (row.saleDt) g.saleDates.add(String(row.saleDt));
    if (row.rrDate) g.reportDates.add(String(row.rrDate));
    if (row.discountPrc) g.discounts.push(row.discountPrc);
    const q = num(row.quantity) || 1;
    const ret = /возврат|return/i.test(String(row.docTypeName || row.sellerOperName || ''));
    if (ret) { g.returns += q; g.retailReturns += num(row.retailAmount); g.forPayReturns += num(row.forPay); }
    else { g.sales += q; g.retailSales += num(row.retailAmount); g.forPaySales += num(row.forPay); }
  }
  const summary = Array.from(groups.values()).map((g) => ({
    articleSubstitution: g.articleSubstitution,
    nmIds: Array.from(g.nmIds), vendorCodes: Array.from(g.vendorCodes), titles: Array.from(g.titles),
    rowCount: g.rowCount, sales: g.sales, returns: g.returns, netBuyouts: g.sales - g.returns,
    netRetailAmount: g.retailSales - g.retailReturns, netForPay: g.forPaySales - g.forPayReturns,
    distinctSrids: g.srids.size, distinctOrderUids: g.orderUids.size,
    averageDiscountPrc: g.discounts.length ? g.discounts.reduce((a,b)=>a+b,0)/g.discounts.length : 0,
    orderDates: Array.from(g.orderDates).sort(), saleDates: Array.from(g.saleDates).sort(), reportDates: Array.from(g.reportDates).sort()
  })).sort((a,b)=>b.rowCount-a.rowCount);

  const result = {
    generatedAt: new Date().toISOString(), targetDate,
    diagnostics: { pageCount, fetchedRows, nonZeroRows: rows.length, uniqueSubstitutions: summary.length },
    summary, rows
  };
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result.diagnostics));
})().catch((error) => { console.error(error?.stack || error); process.exit(1); });
