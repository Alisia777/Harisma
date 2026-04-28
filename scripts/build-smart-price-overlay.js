const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function normalizeArticleKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseSmartNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  let raw = String(value).trim();
  if (!raw) return null;
  raw = raw.replace(/\s+/g, '');
  raw = raw.replace(/[^\d,.\-]/g, '');
  if (!raw) return null;

  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;

  if (commaCount && dotCount) {
    if (raw.lastIndexOf('.') > raw.lastIndexOf(',')) {
      raw = raw.replace(/,/g, '');
    } else {
      raw = raw.replace(/\./g, '').replace(',', '.');
    }
  } else if (commaCount && !dotCount) {
    const parts = raw.split(',');
    const last = parts[parts.length - 1] || '';
    const thousandsLike = parts.length > 1 && /^\d{3}$/.test(last);
    raw = thousandsLike ? parts.join('') : raw.replace(',', '.');
  } else if (dotCount > 1) {
    const parts = raw.split('.');
    const last = parts.pop() || '';
    raw = `${parts.join('')}.${last}`;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePercentFraction(value) {
  const parsed = parseSmartNumber(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function ensurePlatformBucket(payload, platform) {
  if (!payload.platforms[platform]) payload.platforms[platform] = { rows: [] };
  return payload.platforms[platform];
}

function upsertRow(bucket, nextRow, replaceExisting = true) {
  if (!nextRow?.articleKey) return;
  const index = bucket.rows.findIndex((row) => row.articleKey === nextRow.articleKey);
  if (index === -1) {
    bucket.rows.push(nextRow);
    return;
  }
  bucket.rows[index] = replaceExisting
    ? { ...bucket.rows[index], ...nextRow }
    : { ...nextRow, ...bucket.rows[index] };
}

function computeClientDiscount(currentFillPrice, currentClientPrice, currentSppPct) {
  if (Number.isFinite(currentSppPct)) return currentSppPct;
  if (Number.isFinite(currentFillPrice) && currentFillPrice > 0 && Number.isFinite(currentClientPrice)) {
    return 1 - (currentClientPrice / currentFillPrice);
  }
  return null;
}

function finiteDivide(total, quantity) {
  if (!Number.isFinite(total) || !Number.isFinite(quantity) || quantity <= 0) return null;
  return total / quantity;
}

function buildRowBase(articleKey, brand, status, valueDate) {
  return {
    articleKey,
    article: articleKey,
    brand: String(brand || '').trim(),
    status: String(status || '').trim(),
    valueDate,
    historyFreshnessDate: valueDate
  };
}

function normalizePortalMarketplace(value = '') {
  const raw = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '');
  if (raw === 'wb' || raw === 'wildberries') return 'wb';
  if (raw === 'oz' || raw === 'ozon') return 'ozon';
  if (raw === 'ya' || raw === 'ym' || raw === 'yandexmarket' || raw === 'yandex') return 'ya';
  return '';
}

function parseMainPortalDimSku(workbook) {
  const sheet = workbook.Sheets.dim_sku;
  const map = new Map();
  if (!sheet) return map;
  const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  rows.forEach((row) => {
    const articleKey = normalizeArticleKey(row.sku || row.item_code || row.article);
    if (!articleKey) return;
    map.set(articleKey, {
      brand: String(row.brend_1 || row.brend || '').trim(),
      status: String(row.status || '').trim(),
      ownerWb: String(row.owner_wb || '').trim(),
      ownerOzon: String(row.owner_oz || '').trim(),
      ownerYm: String(row.owner_ym || '').trim()
    });
  });
  return map;
}

function chooseLatestFactRow(currentRow, nextRow) {
  if (!currentRow) return nextRow;
  const currentDate = String(currentRow.date || '');
  const nextDate = String(nextRow.date || '');
  if (nextDate > currentDate) return nextRow;
  if (nextDate < currentDate) return currentRow;

  const currentScore = [
    currentRow.revenue,
    currentRow.wb_finished_price,
    currentRow.wb_price_with_disc,
    currentRow.oz_seller_price
  ].filter((value) => Number.isFinite(parseSmartNumber(value))).length;
  const nextScore = [
    nextRow.revenue,
    nextRow.wb_finished_price,
    nextRow.wb_price_with_disc,
    nextRow.oz_seller_price
  ].filter((value) => Number.isFinite(parseSmartNumber(value))).length;
  return nextScore >= currentScore ? nextRow : currentRow;
}

function buildFactTimelinePoint(platform, row) {
  const date = String(row?.date || '').trim().slice(0, 10);
  if (!date) return null;

  const soldQty = parseSmartNumber(row?.sales_qty);
  const revenue = parseSmartNumber(row?.revenue);
  const revenuePerUnit = finiteDivide(revenue, soldQty);
  const point = { date };

  if (platform === 'wb') {
    const wbQty = parseSmartNumber(row?.wb_quantity_sold);
    const finishedTotal = parseSmartNumber(row?.wb_finished_price);
    const clientPrice = finiteDivide(finishedTotal, wbQty);
    const sppPct = computeClientDiscount(revenuePerUnit, clientPrice, null);
    if (!Number.isFinite(revenuePerUnit) && !Number.isFinite(clientPrice)) return null;
    if (Number.isFinite(revenuePerUnit)) point.price = revenuePerUnit;
    if (Number.isFinite(clientPrice)) point.clientPrice = clientPrice;
    if (Number.isFinite(sppPct)) point.sppPct = sppPct;
  } else if (platform === 'ozon') {
    const ozQty = parseSmartNumber(row?.oz_quantity_sold);
    const ozSellerPrice = parseSmartNumber(row?.oz_seller_price);
    const fillPrice = finiteDivide(ozSellerPrice, ozQty) || revenuePerUnit;
    const sppPct = computeClientDiscount(fillPrice, revenuePerUnit, null);
    if (!Number.isFinite(fillPrice) && !Number.isFinite(revenuePerUnit)) return null;
    if (Number.isFinite(fillPrice)) point.price = fillPrice;
    if (Number.isFinite(revenuePerUnit)) point.clientPrice = revenuePerUnit;
    if (Number.isFinite(sppPct)) point.sppPct = sppPct;
  } else {
    if (!Number.isFinite(revenuePerUnit)) return null;
    point.price = revenuePerUnit;
    point.clientPrice = revenuePerUnit;
    point.sppPct = 0;
  }

  if (Number.isFinite(soldQty)) point.ordersUnits = soldQty;
  if (Number.isFinite(revenue)) point.revenue = revenue;
  return point;
}

function collectFactTimeline(seriesBySkuPlatform, key, platform, row) {
  const point = buildFactTimelinePoint(platform, row);
  if (!point) return;
  let byDate = seriesBySkuPlatform.get(key);
  if (!byDate) {
    byDate = new Map();
    seriesBySkuPlatform.set(key, byDate);
  }
  const current = byDate.get(point.date) || { date: point.date };
  byDate.set(point.date, { ...current, ...point });
}

function parseMainPortalFacts(workbook, payload) {
  const factSheet = workbook.Sheets.fact_marketplace_daily_sku;
  if (!factSheet) return false;

  const dimSkuMap = parseMainPortalDimSku(workbook);
  const rows = XLSX.utils.sheet_to_json(factSheet, { raw: false, defval: '' });
  const latestBySkuPlatform = new Map();
  const seriesBySkuPlatform = new Map();

  rows.forEach((row) => {
    const articleKey = normalizeArticleKey(row.item_code || row.sku || row.article);
    const platform = normalizePortalMarketplace(row.marketplace);
    if (!articleKey || !platform) return;
    const key = `${platform}::${articleKey}`;
    latestBySkuPlatform.set(key, chooseLatestFactRow(latestBySkuPlatform.get(key), row));
    collectFactTimeline(seriesBySkuPlatform, key, platform, row);
  });

  latestBySkuPlatform.forEach((row, key) => {
    const [platform, articleKey] = key.split('::');
    const bucket = ensurePlatformBucket(payload, platform);
    const dimSku = dimSkuMap.get(articleKey) || {};
    const valueDate = String(row.date || payload.asOfDate || '').trim();
    const soldQty = parseSmartNumber(row.sales_qty);
    const revenue = parseSmartNumber(row.revenue);
    const revenuePerUnit = finiteDivide(revenue, soldQty);
    const baseRow = {
      ...buildRowBase(articleKey, dimSku.brand, dimSku.status, valueDate),
      owner: platform === 'wb'
        ? (dimSku.ownerWb || '')
        : platform === 'ozon'
          ? (dimSku.ownerOzon || '')
          : (dimSku.ownerYm || ''),
      sourceSheet: 'fact_marketplace_daily_sku'
    };
    const factSeries = Array.from((seriesBySkuPlatform.get(key) || new Map()).values())
      .sort((left, right) => String(left?.date || '').localeCompare(String(right?.date || '')));

    if (platform === 'wb') {
      const wbQty = parseSmartNumber(row.wb_quantity_sold);
      const finishedTotal = parseSmartNumber(row.wb_finished_price);
      const currentClientPrice = finiteDivide(finishedTotal, wbQty);
      const currentFillPrice = revenuePerUnit;
      const currentSppPct = computeClientDiscount(currentFillPrice, currentClientPrice, null);
      if (!Number.isFinite(currentFillPrice) && !Number.isFinite(currentClientPrice)) return;
      upsertRow(bucket, {
        ...baseRow,
        currentFillPrice,
        currentPrice: currentFillPrice,
        currentClientPrice,
        currentSppPct,
        sourceMode: 'wb-market-facts',
        daily: factSeries
      });
      return;
    }

    if (platform === 'ozon') {
      const ozQty = parseSmartNumber(row.oz_quantity_sold);
      const ozSellerPrice = parseSmartNumber(row.oz_seller_price);
      const currentFillPrice = finiteDivide(ozSellerPrice, ozQty) || revenuePerUnit;
      const currentClientPrice = revenuePerUnit;
      if (!Number.isFinite(currentFillPrice) && !Number.isFinite(currentClientPrice)) return;
      upsertRow(bucket, {
        ...baseRow,
        currentFillPrice,
        currentPrice: currentFillPrice,
        currentClientPrice,
        currentSppPct: computeClientDiscount(currentFillPrice, currentClientPrice, null),
        sourceMode: 'ozon-market-facts',
        daily: factSeries
      });
      return;
    }

    if (!Number.isFinite(revenuePerUnit)) return;
    upsertRow(bucket, {
      ...baseRow,
      currentFillPrice: revenuePerUnit,
      currentPrice: revenuePerUnit,
      currentClientPrice: revenuePerUnit,
      currentSppPct: 0,
      sourceMode: 'market-facts',
      daily: factSeries
    });
  });

  return latestBySkuPlatform.size > 0;
}

function parseBazaSheet(workbook, payload, valueDate) {
  const sheet = workbook.Sheets['База'];
  if (!sheet) return;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  const wbBucket = ensurePlatformBucket(payload, 'wb');

  rows.slice(2).forEach((row) => {
    const articleKey = normalizeArticleKey(row[3]);
    if (!articleKey) return;

    const currentFillPrice = parseSmartNumber(row[8]);
    const currentClientPrice = parseSmartNumber(row[12]);
    const currentSppPct = computeClientDiscount(
      currentFillPrice,
      currentClientPrice,
      parsePercentFraction(row[10])
    );
    const currentTurnoverDays = parseSmartNumber(row[7]);
    const stockWb = parseSmartNumber(row[5]);
    const stockSeller = parseSmartNumber(row[6]);
    const stockTotal = [stockWb, stockSeller].filter(Number.isFinite).reduce((sum, value) => sum + value, 0);

    if (
      !Number.isFinite(currentFillPrice)
      && !Number.isFinite(currentClientPrice)
      && !Number.isFinite(currentTurnoverDays)
      && !Number.isFinite(stockWb)
    ) {
      return;
    }

    upsertRow(wbBucket, {
      ...buildRowBase(articleKey, row[0], '', valueDate),
      currentFillPrice,
      currentPrice: currentFillPrice,
      currentClientPrice,
      currentSppPct,
      currentTurnoverDays,
      stockWb,
      stockSeller,
      stockTotal: Number.isFinite(stockTotal) && stockTotal > 0 ? stockTotal : null,
      sourceSheet: 'База'
    });
  });
}

function parseSvodnayaSheet(workbook, payload, valueDate) {
  const sheet = workbook.Sheets['Сводная'];
  if (!sheet) return;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  const wbBucket = ensurePlatformBucket(payload, 'wb');
  const ozonBucket = ensurePlatformBucket(payload, 'ozon');

  rows.slice(8).forEach((row) => {
    const articleKey = normalizeArticleKey(row[4]);
    if (!articleKey) return;

    const brand = row[5];
    const status = row[9];
    const stockWb = parseSmartNumber(row[12]);
    const stockOzon = parseSmartNumber(row[13]);
    const stockTotal = parseSmartNumber(row[14]);

    const wbCurrentFillPrice = parseSmartNumber(row[52]);
    const wbCurrentClientPrice = parseSmartNumber(row[56]);
    const wbCurrentSppPct = computeClientDiscount(
      wbCurrentFillPrice,
      wbCurrentClientPrice,
      parsePercentFraction(row[53])
    );

    if (Number.isFinite(wbCurrentFillPrice) || Number.isFinite(wbCurrentClientPrice)) {
      upsertRow(wbBucket, {
        ...buildRowBase(articleKey, brand, status, valueDate),
        currentFillPrice: wbCurrentFillPrice,
        currentPrice: wbCurrentFillPrice,
        currentClientPrice: wbCurrentClientPrice,
        currentSppPct: wbCurrentSppPct,
        stockWb,
        stockTotal,
        sourceSheet: 'Сводная'
      }, false);
    }

    const ozonCurrentFillPrice = parseSmartNumber(row[57]);
    const ozonCurrentClientPrice = parseSmartNumber(row[60]);
    const ozonCurrentSppPct = computeClientDiscount(
      ozonCurrentFillPrice,
      ozonCurrentClientPrice,
      parsePercentFraction(row[64])
    );

    if (Number.isFinite(ozonCurrentFillPrice) || Number.isFinite(ozonCurrentClientPrice)) {
      upsertRow(ozonBucket, {
        ...buildRowBase(articleKey, brand, status, valueDate),
        currentFillPrice: ozonCurrentFillPrice,
        currentPrice: ozonCurrentFillPrice,
        currentClientPrice: ozonCurrentClientPrice,
        currentSppPct: ozonCurrentSppPct,
        stockOzon,
        stockTotal,
        sourceSheet: 'Сводная'
      });
    }
  });
}

function buildSmartPriceOverlay(inputPath, outputPath = path.join('data', 'smart_price_overlay.json')) {
  const resolvedInputPath = path.resolve(process.cwd(), inputPath || 'tmp-smart-prices-20260423.xlsx');
  const resolvedOutputPath = path.resolve(process.cwd(), outputPath);
  const workbook = XLSX.readFile(resolvedInputPath);
  const stat = fs.statSync(resolvedInputPath);
  const generatedAt = stat.mtime.toISOString();
  const valueDate = generatedAt.slice(0, 10);

  const payload = {
    generatedAt,
    asOfDate: valueDate,
    sourceFile: path.basename(resolvedInputPath),
    platforms: {}
  };

  const parsedMainPortalFacts = parseMainPortalFacts(workbook, payload);
  if (!parsedMainPortalFacts) {
    parseBazaSheet(workbook, payload, valueDate);
    parseSvodnayaSheet(workbook, payload, valueDate);
  }

  const overlayDates = [];
  Object.values(payload.platforms).forEach((bucket) => {
    (bucket.rows || []).forEach((row) => {
      if (row && row.valueDate) overlayDates.push(String(row.valueDate));
    });
    bucket.rows.sort((left, right) => String(left.articleKey || '').localeCompare(String(right.articleKey || ''), 'ru'));
  });
  if (overlayDates.length) {
    overlayDates.sort();
    payload.asOfDate = overlayDates[overlayDates.length - 1];
  }

  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, JSON.stringify(payload, null, 2));

  const counts = Object.fromEntries(
    Object.entries(payload.platforms).map(([platform, bucket]) => [platform, Array.isArray(bucket.rows) ? bucket.rows.length : 0])
  );
  return {
    payload,
    summary: {
      input: resolvedInputPath,
      output: resolvedOutputPath,
      generatedAt,
      counts
    }
  };
}

function main() {
  const result = buildSmartPriceOverlay(process.argv[2], process.argv[3]);
  console.log(JSON.stringify(result.summary, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSmartPriceOverlay,
  normalizeArticleKey,
  parseSmartNumber,
  parsePercentFraction
};
