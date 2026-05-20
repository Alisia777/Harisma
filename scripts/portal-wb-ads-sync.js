#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const WB_API_BASE_URL = 'https://advert-api.wildberries.ru';
const WB_PROMOTION_DOCS_URL = 'https://dev.wildberries.ru/en/docs/openapi/promotion';
const DEFAULT_FIXTURE_XLSX = 'C:\\Users\\artiu\\Downloads\\Telegram Desktop\\ДРР ВБ (3).xlsx';
const DEFAULT_EXTERNAL_ADS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1_WNHliH2-7E17H8J6BvYTSBWVD7cuDDBpn0GJ5Crxdg/edit?gid=349075746#gid=349075746';
const DEFAULT_EXTERNAL_ADS_BRAND = 'АЛТЕЯ';
const ACTIVE_CAMPAIGN_STATUSES = new Set([7, 9, 11]);
const CHANNELS = {
  promotion: 'ВБ Продвижение',
  media: 'ВБ Медиа',
  pvz: 'Реклама в ПВЗ',
  brandzone: 'Брендзона',
  reviews: 'Отзывы за баллы',
  overviews: 'Обзоры',
  external: 'Внешка',
  influencer: 'ВБ Инфлюенс'
};

function parseArgs(argv) {
  const args = { command: 'sync' };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--') && index === 2) {
      args.command = token;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--mirror-local-fallback') {
      args.mirrorLocalFallback = true;
      continue;
    }
    if (token === '--no-fixture-fallback') {
      args.fixtureFallback = false;
      continue;
    }
    if (token === '--no-external-ads') {
      args.externalAds = false;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    if (!rawKey.startsWith('--')) continue;
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function readJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function deepClone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return value;
  }
}

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberFromSheet(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let raw = String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!raw) return 0;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    raw = lastComma > lastDot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = raw.length - lastComma - 1;
    raw = decimals > 0 && decimals <= 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function isoDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).trim();
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const ru = raw.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
  if (ru) {
    const year = ru[3] ? Number(ru[3].length === 2 ? `20${ru[3]}` : ru[3]) : new Date().getFullYear();
    return `${year}-${String(Number(ru[2])).padStart(2, '0')}-${String(Number(ru[1])).padStart(2, '0')}`;
  }
  const stamp = Date.parse(raw);
  return Number.isFinite(stamp) ? new Date(stamp).toISOString().slice(0, 10) : '';
}

function monthStart(dateKey) {
  return `${String(dateKey || new Date().toISOString().slice(0, 10)).slice(0, 7)}-01`;
}

function addDays(dateKey, delta) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function enumerateDates(from, to) {
  const result = [];
  let cursor = isoDate(from);
  const end = isoDate(to);
  while (cursor && end && cursor <= end) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

function chunk(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function findLatestFile(dir, pattern) {
  try {
    if (!fs.existsSync(dir)) return '';
    return fs.readdirSync(dir)
      .filter((name) => pattern.test(name))
      .map((name) => path.join(dir, name))
      .filter((filePath) => fs.statSync(filePath).isFile())
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0] || '';
  } catch (_error) {
    return '';
  }
}

function resolveFixturePath(args) {
  const candidates = [
    args['fixture-xlsx'],
    process.env.ALTEA_WB_ADS_FIXTURE_XLSX,
    path.join(process.cwd(), 'ДРР ВБ (3).xlsx'),
    DEFAULT_FIXTURE_XLSX
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveSupplierGoodsPath(args) {
  const candidates = [
    args['supplier-goods-xlsx'],
    process.env.ALTEA_WB_SUPPLIER_GOODS_XLSX,
    findLatestFile(process.cwd(), /^supplier-goods-.*\.xlsx$/i),
    findLatestFile(process.cwd(), /^.*постав.*\.xlsx$/i)
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function resolveExternalAdsXlsx(args) {
  const candidates = [
    args['external-ads-xlsx'],
    process.env.ALTEA_EXTERNAL_ADS_XLSX
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || '';
}

function buildSkuLookups(skus) {
  const byArticle = new Map();
  const byArticleKey = new Map();
  for (const sku of Array.isArray(skus) ? skus : []) {
    const article = normalizeKey(sku?.article);
    const articleKey = normalizeKey(sku?.articleKey);
    if (article) byArticle.set(article, sku);
    if (articleKey) byArticleKey.set(articleKey, sku);
  }
  return { byArticle, byArticleKey };
}

function readSupplierNmMap(filePath, skus) {
  const diagnostics = {
    supplierGoodsPath: filePath || '',
    mappedNmIds: 0,
    sellerArticles: 0,
    unmatchedSellerArticles: 0,
    errors: []
  };
  const nmMap = new Map();
  if (!filePath || !fs.existsSync(filePath)) return { nmMap, diagnostics };
  try {
    const workbook = XLSX.readFile(filePath);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' });
    const headerIndex = rows.findIndex((row) => {
      const values = row.map((cell) => normalizeText(cell));
      return values.includes('Артикул продавца') && values.includes('Артикул WB');
    });
    if (headerIndex < 0) {
      diagnostics.errors.push('supplier-goods header row was not found');
      return { nmMap, diagnostics };
    }
    const header = rows[headerIndex].map((cell) => normalizeText(cell));
    const sellerIndex = header.indexOf('Артикул продавца');
    const nmIndex = header.indexOf('Артикул WB');
    const nameIndex = header.indexOf('Наименование');
    const { byArticle, byArticleKey } = buildSkuLookups(skus);
    const seenSellerArticles = new Set();
    const unmatchedSellerArticles = new Set();
    for (const row of rows.slice(headerIndex + 1)) {
      const sellerArticleRaw = normalizeText(row[sellerIndex]);
      const nmIdRaw = normalizeText(row[nmIndex]);
      if (!sellerArticleRaw || !nmIdRaw) continue;
      seenSellerArticles.add(sellerArticleRaw);
      const nmId = String(Math.trunc(numberOrZero(nmIdRaw)));
      if (!nmId || nmId === '0') continue;
      const sellerKey = normalizeKey(sellerArticleRaw);
      const sku = byArticle.get(sellerKey) || byArticleKey.get(sellerKey) || null;
      if (!sku) {
        unmatchedSellerArticles.add(sellerArticleRaw);
        continue;
      }
      nmMap.set(nmId, {
        nmId,
        sellerArticle: sellerArticleRaw,
        articleKey: sku.articleKey || sellerArticleRaw,
        article: sku.article || sku.articleKey || sellerArticleRaw,
        name: sku.name || normalizeText(row[nameIndex]) || sellerArticleRaw,
        owner: sku.owner?.name || sku.ownersByPlatform?.wb || ''
      });
    }
    diagnostics.sellerArticles = seenSellerArticles.size;
    diagnostics.unmatchedSellerArticles = unmatchedSellerArticles.size;
    diagnostics.mappedNmIds = nmMap.size;
  } catch (error) {
    diagnostics.errors.push(error.message);
  }
  return { nmMap, diagnostics };
}

function platformLatestDate(platformTrends) {
  const candidates = [platformTrends?.latestMarketplaceDate];
  for (const platform of platformTrends?.platforms || []) {
    for (const point of platform?.series || []) candidates.push(point?.date || point?.label);
  }
  return candidates.map(isoDate).filter(Boolean).sort().pop() || '';
}

function resolveOptions(args) {
  const inputDir = path.resolve(args['input-dir'] || args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(process.cwd(), 'data'));
  const outputDir = args['output-dir'] ? path.resolve(args['output-dir']) : '';
  const mirrorDataDir = path.resolve(args['mirror-data-dir'] || process.env.ALTEA_PORTAL_FALLBACK_DIR || baseDataDir);
  const platformTrends = readJson(path.join(inputDir, 'platform_trends.json'), readJson(path.join(baseDataDir, 'platform_trends.json'), {}));
  const latest = platformLatestDate(platformTrends) || addDays(new Date().toISOString().slice(0, 10), -1);
  const to = isoDate(args.to || args['date-to'] || latest);
  const from = isoDate(args.from || args['date-from'] || monthStart(to));
  return {
    command: args.command || 'sync',
    dryRun: Boolean(args.dryRun),
    token: args.token || process.env.ALTEA_WB_PROMOTION_TOKEN || process.env.ALTEA_WB_API_TOKEN || '',
    apiBaseUrl: String(args['api-base-url'] || process.env.ALTEA_WB_PROMOTION_API_BASE_URL || WB_API_BASE_URL).replace(/\/+$/, ''),
    inputDir,
    baseDataDir,
    outputDir,
    mirrorDataDir,
    mirrorLocalFallback: asBool(args['mirror-local-fallback'], Boolean(args.mirrorLocalFallback)),
    fixtureFallback: args.fixtureFallback !== false,
    fixturePath: resolveFixturePath(args),
    externalAdsEnabled: args.externalAds !== false,
    externalAdsUrl: args['external-ads-url'] || process.env.ALTEA_EXTERNAL_ADS_SHEET_URL || DEFAULT_EXTERNAL_ADS_SHEET_URL,
    externalAdsXlsx: resolveExternalAdsXlsx(args),
    externalAdsBrand: args['external-ads-brand'] || process.env.ALTEA_EXTERNAL_ADS_BRAND || DEFAULT_EXTERNAL_ADS_BRAND,
    supplierGoodsPath: resolveSupplierGoodsPath(args),
    from,
    to,
    fullstatsDelayMs: Number.isFinite(Number(args['fullstats-delay-ms'])) ? Number(args['fullstats-delay-ms']) : 21000,
    updDelayMs: Number.isFinite(Number(args['upd-delay-ms'])) ? Number(args['upd-delay-ms']) : 500,
    requestTimeoutMs: Number.isFinite(Number(args['request-timeout-ms'])) ? Number(args['request-timeout-ms']) : 60000,
    skipUpd: asBool(args['skip-upd'], false),
    docsUrl: WB_PROMOTION_DOCS_URL
  };
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function wbRequest(options, apiPath, requestOptions = {}, attempt = 0) {
  const url = new URL(`${options.apiBaseUrl}${apiPath}`);
  Object.entries(requestOptions.query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const method = requestOptions.method || 'GET';
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, numberOrZero(options.requestTimeoutMs) || 60000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: options.token,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
      signal: controller.signal
    });
  } catch (error) {
    if ((error?.name === 'AbortError' || error?.code === 'ABORT_ERR') && attempt < 2) {
      await sleep(5000);
      return wbRequest(options, apiPath, requestOptions, attempt + 1);
    }
    throw new Error(`WB API ${method} ${apiPath} failed: ${error?.message || String(error)}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (!response.ok) {
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 65000;
      await sleep(delayMs);
      return wbRequest(options, apiPath, requestOptions, attempt + 1);
    }
    throw new Error(`WB API ${method} ${apiPath} failed: HTTP ${response.status} ${text.slice(0, 500)}`);
  }
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function campaignIdsFromCount(payload) {
  const result = [];
  const groups = Array.isArray(payload?.adverts) ? payload.adverts : [];
  for (const group of groups) {
    const status = numberOrZero(group?.status);
    if (!ACTIVE_CAMPAIGN_STATUSES.has(status)) continue;
    const list = Array.isArray(group?.advert_list) ? group.advert_list : Array.isArray(group?.advertList) ? group.advertList : [];
    for (const item of list) {
      const advertId = String(Math.trunc(numberOrZero(item?.advertId || item?.advert_id || item?.id)));
      if (advertId && advertId !== '0') result.push(advertId);
    }
  }
  return [...new Set(result)];
}

async function fetchCampaignDetails(options, campaignIds, diagnostics) {
  const details = new Map(campaignIds.map((id) => [String(id), { advertId: String(id) }]));
  for (const batch of chunk(campaignIds, 50)) {
    try {
      const payload = await wbRequest(options, '/api/advert/v2/adverts', { method: 'GET', query: { ids: batch.join(',') } });
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.adverts) ? payload.adverts : [];
      for (const row of rows) {
        const id = String(Math.trunc(numberOrZero(row?.advertId || row?.advert_id || row?.id)));
        if (id && id !== '0') details.set(id, row);
      }
    } catch (error) {
      diagnostics.warnings.push(`campaign details were not loaded: ${error.message}`);
    }
  }
  return details;
}

async function fetchFullStats(options, campaignIds, campaignDetails, diagnostics) {
  const rows = [];
  const batches = chunk(campaignIds, 50);
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    process.stderr.write(`[wb-ads-sync] fullstats ${index + 1}/${batches.length}\n`);
    const payload = await wbRequest(options, '/adv/v3/fullstats', {
      method: 'GET',
      query: {
        ids: batch.join(','),
        beginDate: options.from,
        endDate: options.to
      }
    });
    rows.push(...normalizeFullStatsPayload(payload, campaignDetails));
    if (index < batches.length - 1) await sleep(options.fullstatsDelayMs);
  }
  diagnostics.fullstatsRequests = batches.length;
  return rows;
}

async function fetchUpdRows(options, diagnostics) {
  if (options.skipUpd) return [];
  const result = [];
  const dates = enumerateDates(options.from, options.to);
  diagnostics.updRequests = 0;
  for (let index = 0; index < dates.length; index += 1) {
    const date = dates[index];
    try {
      const payload = await wbRequest(options, '/adv/v1/upd', {
        method: 'GET',
        query: { from: date, to: date }
      });
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
      diagnostics.updRequests += 1;
      for (const row of rows) result.push({ ...row, reportDate: date });
      process.stderr.write(`[wb-ads-sync] upd ${date}: ${rows.length} rows\n`);
    } catch (error) {
      diagnostics.warnings.push(`financial expenses reconciliation was not loaded for ${date}: ${error.message}`);
    }
    if (index < dates.length - 1) await sleep(options.updDelayMs);
  }
  diagnostics.updRows = result.length;
  return result;
}

function campaignChannel(campaign = {}) {
  const text = `${campaign?.type || ''} ${campaign?.advertType || ''} ${campaign?.name || ''} ${campaign?.campName || ''}`.toLowerCase();
  if (/media|медиа/.test(text)) return CHANNELS.media;
  if (/брендзон|brand/.test(text)) return CHANNELS.brandzone;
  if (/пвз|pvz/.test(text)) return CHANNELS.pvz;
  if (/отзыв/.test(text)) return CHANNELS.reviews;
  if (/обзор/.test(text)) return CHANNELS.overviews;
  if (/инфлю|influ/.test(text)) return CHANNELS.influencer;
  if (/внеш|external/.test(text)) return CHANNELS.external;
  return CHANNELS.promotion;
}

function pickMetrics(source = {}) {
  return {
    views: numberOrZero(source.views),
    clicks: numberOrZero(source.clicks),
    spend: numberOrZero(source.sum || source.spend || source.cost || source.updSum),
    orders: numberOrZero(source.orders || source.shks || source.atbs),
    revenue: numberOrZero(source.sum_price || source.sumPrice || source.revenue)
  };
}

function collectNmStats(source) {
  const rows = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value.nmId || value.nm_id || value.nm) rows.push(value);
    ['nm', 'nms', 'nmStats', 'products', 'items'].forEach((key) => {
      if (Array.isArray(value[key])) value[key].forEach(visit);
    });
    if (Array.isArray(value.apps)) value.apps.forEach(visit);
  };
  visit(source);
  return rows.filter((row) => row && typeof row === 'object' && (row.nmId || row.nm_id || Number.isFinite(Number(row.nm))));
}

function normalizeFullStatsPayload(payload, campaignDetails) {
  const campaigns = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  const rows = [];
  for (const campaign of campaigns) {
    const campaignId = String(Math.trunc(numberOrZero(campaign?.advertId || campaign?.advert_id || campaign?.id)));
    const detail = campaignDetails.get(campaignId) || campaign || {};
    const days = Array.isArray(campaign?.days) ? campaign.days : Array.isArray(campaign?.stats) ? campaign.stats : [];
    for (const day of days) {
      const date = isoDate(day?.date || day?.day || day?.dt);
      if (!date) continue;
      const dayMetrics = pickMetrics(day);
      const nmStats = collectNmStats(day);
      if (!nmStats.length) {
        rows.push({
          date,
          campaignId,
          campaignName: normalizeText(detail.name || detail.campName || campaign.name || campaignId),
          channel: campaignChannel(detail),
          ...dayMetrics
        });
        continue;
      }
      const prepared = nmStats.map((nmRow) => ({
        nmId: String(Math.trunc(numberOrZero(nmRow.nmId || nmRow.nm_id || nmRow.nm))),
        name: normalizeText(nmRow.name),
        ...pickMetrics(nmRow)
      })).filter((row) => row.nmId && row.nmId !== '0');
      const totalSpend = prepared.reduce((sum, row) => sum + row.spend, 0);
      const totalRevenue = prepared.reduce((sum, row) => sum + row.revenue, 0);
      const weight = (row) => row.views || row.clicks || row.orders || row.revenue || 1;
      const totalWeight = prepared.reduce((sum, row) => sum + weight(row), 0) || prepared.length || 1;
      for (const row of prepared) {
        const share = weight(row) / totalWeight;
        rows.push({
          date,
          campaignId,
          campaignName: normalizeText(detail.name || detail.campName || campaign.name || campaignId),
          channel: campaignChannel(detail),
          nmId: row.nmId,
          name: row.name,
          views: row.views,
          clicks: row.clicks,
          spend: totalSpend > 0 ? row.spend : dayMetrics.spend * share,
          orders: row.orders,
          revenue: totalRevenue > 0 ? row.revenue : dayMetrics.revenue * share
        });
      }
    }
  }
  return rows;
}

function normalizeUpdRows(updRows) {
  return (Array.isArray(updRows) ? updRows : []).map((row) => ({
    date: isoDate(row.reportDate || row.date || row.day || row.updTime),
    campaignId: String(Math.trunc(numberOrZero(row.advertId || row.advert_id || row.id))),
    campaignName: normalizeText(row.campName || row.name || row.advertName),
    channel: campaignChannel(row),
    spend: numberOrZero(row.updSum || row.sum || row.spend || row.cost)
  })).filter((row) => row.date && row.spend > 0);
}

function rowKey(row) {
  return [
    row.date,
    row.campaignId || '',
    row.channel || CHANNELS.promotion,
    row.nmId || row.articleKey || 'wb-unmapped'
  ].join('|');
}

function attachSkuMeta(rows, nmMap, skus, diagnostics) {
  const fallbackSku = new Map((Array.isArray(skus) ? skus : []).map((sku) => [normalizeKey(sku?.articleKey || sku?.article), sku]));
  const unmatched = new Map();
  const result = [];
  for (const row of rows) {
    const mapped = row.nmId ? nmMap.get(String(row.nmId)) : null;
    if (row.nmId && !mapped) {
      const item = unmatched.get(String(row.nmId)) || { nmId: String(row.nmId), spend: 0, revenue: 0, rows: 0 };
      item.spend += numberOrZero(row.spend);
      item.revenue += numberOrZero(row.revenue);
      item.rows += 1;
      unmatched.set(String(row.nmId), item);
    }
    const articleKey = mapped?.articleKey || row.articleKey || (row.nmId ? `wb-nm-${row.nmId}` : 'wb-unmapped');
    const sku = fallbackSku.get(normalizeKey(articleKey)) || null;
    result.push({
      date: row.date,
      platformKey: 'wb',
      articleKey,
      article: mapped?.article || sku?.article || articleKey,
      name: mapped?.name || sku?.name || row.name || row.campaignName || articleKey,
      owner: mapped?.owner || sku?.owner?.name || sku?.ownersByPlatform?.wb || '',
      views: numberOrZero(row.views),
      clicks: numberOrZero(row.clicks),
      spend: Math.round(numberOrZero(row.spend) * 100) / 100,
      orders: numberOrZero(row.orders),
      revenue: Math.round(numberOrZero(row.revenue) * 100) / 100,
      campaignId: row.campaignId || '',
      campaignName: row.campaignName || '',
      channel: row.channel || CHANNELS.promotion,
      nmId: row.nmId || ''
    });
  }
  diagnostics.unmatchedNmIds = [...unmatched.values()]
    .sort((left, right) => right.spend - left.spend)
    .slice(0, 50);
  diagnostics.unmatchedNmIdCount = unmatched.size;
  return result;
}

function reconcileWithUpd(fullstatRows, updRows, diagnostics) {
  const rows = [...fullstatRows];
  const fullByDate = new Map();
  for (const row of fullstatRows) fullByDate.set(row.date, (fullByDate.get(row.date) || 0) + numberOrZero(row.spend));
  const updDaily = new Map();
  for (const row of normalizeUpdRows(updRows)) {
    const key = `${row.date}|${row.channel}`;
    const current = updDaily.get(key) || { ...row, spend: 0 };
    current.spend += row.spend;
    updDaily.set(key, current);
  }
  const adjustments = [];
  for (const item of updDaily.values()) {
    const fullSpend = fullByDate.get(item.date) || 0;
    if (item.spend <= fullSpend + 1) continue;
    const gap = item.spend - fullSpend;
    adjustments.push({
      date: item.date,
      campaignId: item.campaignId || 'upd-reconcile',
      campaignName: item.campaignName || 'WB financial expenses',
      channel: item.channel || CHANNELS.promotion,
      spend: gap,
      views: 0,
      clicks: 0,
      orders: 0,
      revenue: 0,
      articleKey: 'wb-unmapped'
    });
  }
  rows.push(...adjustments);
  diagnostics.financialAdjustments = adjustments.length;
  diagnostics.financialAdjustmentSpend = Math.round(adjustments.reduce((sum, row) => sum + row.spend, 0) * 100) / 100;
  diagnostics.financialDaily = [...updDaily.values()].map((row) => ({
    date: row.date,
    channel: row.channel,
    spend: Math.round(row.spend * 100) / 100
  }));
  return rows;
}

function aggregateRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    const key = rowKey(row);
    const current = byKey.get(key) || {
      ...row,
      views: 0,
      clicks: 0,
      spend: 0,
      orders: 0,
      revenue: 0
    };
    current.views += numberOrZero(row.views);
    current.clicks += numberOrZero(row.clicks);
    current.spend += numberOrZero(row.spend);
    current.orders += numberOrZero(row.orders);
    current.revenue += numberOrZero(row.revenue);
    byKey.set(key, current);
  }
  return [...byKey.values()].map((row) => ({
    ...row,
    spend: Math.round(row.spend * 100) / 100,
    revenue: Math.round(row.revenue * 100) / 100
  })).sort((left, right) => left.date.localeCompare(right.date) || right.spend - left.spend);
}

function buildPlatformSeries(itemSeries, from, to) {
  const daily = new Map();
  for (const date of enumerateDates(from, to)) {
    daily.set(date, { date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
  }
  for (const row of itemSeries) {
    const current = daily.get(row.date) || { date: row.date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
    current.views += numberOrZero(row.views);
    current.clicks += numberOrZero(row.clicks);
    current.spend += numberOrZero(row.spend);
    current.orders += numberOrZero(row.orders);
    current.revenue += numberOrZero(row.revenue);
    daily.set(row.date, current);
  }
  return [...daily.values()]
    .filter((row) => row.views || row.clicks || row.spend || row.orders || row.revenue)
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row, index, arr) => ({
      dayOffset: arr.length - index - 1,
      label: row.date,
      date: row.date,
      views: Math.round(row.views),
      clicks: Math.round(row.clicks),
      spend: Math.round(row.spend * 100) / 100,
      orders: Math.round(row.orders),
      revenue: Math.round(row.revenue * 100) / 100
    }));
}

function buildAdsSummary(itemSeries, options, diagnostics, sourceMode, note = '') {
  const scopedItemSeries = itemSeries.filter((row) => row.date >= options.from && row.date <= options.to);
  const series = buildPlatformSeries(scopedItemSeries, options.from, options.to);
  const totals = series.reduce((acc, row) => {
    acc.views += row.views;
    acc.clicks += row.clicks;
    acc.spend += row.spend;
    acc.orders += row.orders;
    acc.revenue += row.revenue;
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });
  const asOfDate = series.map((row) => row.date || row.label).filter(Boolean).sort().pop() || options.to;
  const platform = {
    key: 'wb',
    platformKey: 'wb',
    label: 'WB',
    ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value * 100) / 100])),
    series
  };
  return {
    generatedAt: new Date().toISOString(),
    asOfDate,
    source: sourceMode === 'wb-api' ? 'wb-promotion-api' : sourceMode,
    sourceUrl: WB_PROMOTION_DOCS_URL,
    sourceMode,
    window: { from: options.from, to: options.to, days: enumerateDates(options.from, options.to).length },
    note,
    diagnostics,
    platforms: [
      platform,
      { ...platform, key: 'all', platformKey: 'all', label: 'Все площадки' }
    ],
    itemSeries: scopedItemSeries
  };
}

function buildAdsAllSeries(platformSeriesMap) {
  const byDate = new Map();
  for (const series of platformSeriesMap.values()) {
    for (const point of Array.isArray(series) ? series : []) {
      const date = isoDate(point?.date || point?.label);
      if (!date) continue;
      const current = byDate.get(date) || { date, label: date, views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 };
      current.views += numberOrZero(point.views);
      current.clicks += numberOrZero(point.clicks);
      current.spend += numberOrZero(point.spend);
      current.orders += numberOrZero(point.orders);
      current.revenue += numberOrZero(point.revenue);
      byDate.set(date, current);
    }
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function latestSeriesDateFromPlatformList(platforms) {
  let latest = '';
  for (const platform of Array.isArray(platforms) ? platforms : []) {
    for (const point of Array.isArray(platform?.series) ? platform.series : []) {
      const date = isoDate(point?.date || point?.label);
      if (date && date > latest) latest = date;
    }
  }
  return latest;
}

function mergeAdsSummaryWithExisting(freshPayload, existingPayload) {
  const merged = deepClone(freshPayload || {});
  const freshPlatforms = Array.isArray(freshPayload?.platforms) ? freshPayload.platforms : [];
  const existingPlatforms = Array.isArray(existingPayload?.platforms) ? existingPayload.platforms : [];
  const platformMap = new Map();

  const normalizePlatform = (platform) => {
    const key = normalizeKey(platform?.key || platform?.platformKey || platform?.label);
    if (!key || key === 'all') return null;
    const series = Array.isArray(platform?.series)
      ? platform.series
          .map((point) => ({
            ...point,
            date: isoDate(point?.date || point?.label),
            label: isoDate(point?.date || point?.label)
          }))
          .filter((point) => Boolean(point.date))
      : [];
    return {
      ...deepClone(platform || {}),
      key,
      platformKey: key,
      label: platform?.label || platform?.platformLabel || normalizeText(platform?.label || platform?.platformLabel || ''),
      series
    };
  };

  for (const platform of existingPlatforms) {
    const normalized = normalizePlatform(platform);
    if (normalized) platformMap.set(normalized.key, normalized);
  }
  for (const platform of freshPlatforms) {
    const normalized = normalizePlatform(platform);
    if (normalized) platformMap.set(normalized.key, normalized);
  }

  const totalsFromSeries = (series) => series.reduce((acc, row) => {
    acc.views += numberOrZero(row.views);
    acc.clicks += numberOrZero(row.clicks);
    acc.spend += numberOrZero(row.spend);
    acc.orders += numberOrZero(row.orders);
    acc.revenue += numberOrZero(row.revenue);
    return acc;
  }, { views: 0, clicks: 0, spend: 0, orders: 0, revenue: 0 });

  const mergedSeriesMap = new Map();
  for (const [key, platform] of platformMap.entries()) {
    mergedSeriesMap.set(key, platform.series || []);
  }
  const allSeries = buildAdsAllSeries(mergedSeriesMap);
  const allTemplate = normalizePlatform(
    freshPlatforms.find((platform) => normalizeKey(platform?.key || platform?.platformKey) === 'all')
    || existingPlatforms.find((platform) => normalizeKey(platform?.key || platform?.platformKey) === 'all')
    || { key: 'all', platformKey: 'all', label: 'Все площадки' }
  ) || { key: 'all', platformKey: 'all', label: 'Все площадки', series: [] };
  const allPlatform = {
    ...allTemplate,
    key: 'all',
    platformKey: 'all',
    label: allTemplate.label || 'Все площадки',
    ...totalsFromSeries(allSeries),
    series: allSeries
  };

  const mergedPlatforms = [...platformMap.values(), allPlatform];
  merged.generatedAt = freshPayload?.generatedAt || new Date().toISOString();
  merged.asOfDate = latestSeriesDateFromPlatformList(mergedPlatforms) || freshPayload?.asOfDate || existingPayload?.asOfDate || '';
  merged.source = freshPayload?.source || existingPayload?.source || 'wb-promotion-api';
  merged.sourceMode = freshPayload?.sourceMode || existingPayload?.sourceMode || 'wb-api+marketplace-workbook';
  merged.sourceUrl = freshPayload?.sourceUrl || existingPayload?.sourceUrl || WB_PROMOTION_DOCS_URL;
  merged.note = [freshPayload?.note, existingPayload?.extraMarketplace ? 'Marketplace extras preserved from existing ads_summary.json.' : '', existingPayload?.note]
    .filter(Boolean)
    .join(' ')
    .trim();
  merged.platforms = mergedPlatforms;
  if (existingPayload?.extraMarketplace || freshPayload?.extraMarketplace) {
    merged.extraMarketplace = deepClone(existingPayload?.extraMarketplace || freshPayload?.extraMarketplace);
  }
  return merged;
}

function parseExternalSheetPeriod(sheetName) {
  const match = String(sheetName || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  const from = `${match[3]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
  const to = `${match[6]}-${String(Number(match[5])).padStart(2, '0')}-${String(Number(match[4])).padStart(2, '0')}`;
  return { from, to };
}

function exportUrlForSheet(sheetUrl) {
  return String(sheetUrl || '').replace(/\/edit.*$/, '/export?format=xlsx');
}

async function loadExternalAdsWorkbook(options, diagnostics) {
  if (!options.externalAdsEnabled) return null;
  if (options.externalAdsXlsx) {
    diagnostics.externalAds.source = 'xlsx-file';
    diagnostics.externalAds.xlsxPath = options.externalAdsXlsx;
    return XLSX.readFile(options.externalAdsXlsx);
  }
  if (!options.externalAdsUrl) return null;
  const exportUrl = exportUrlForSheet(options.externalAdsUrl);
  diagnostics.externalAds.source = 'google-sheet';
  diagnostics.externalAds.sourceUrl = options.externalAdsUrl;
  const timeoutMs = Math.max(1000, numberOrZero(options.requestTimeoutMs) || 60000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(exportUrl, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`external ads Google export failed with HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    diagnostics.externalAds.downloadedBytes = buffer.length;
    return XLSX.read(buffer, { type: 'buffer' });
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
      throw new Error(`external ads Google export timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function buildExternalAdsRows(options, diagnostics) {
  diagnostics.externalAds = {
    enabled: Boolean(options.externalAdsEnabled),
    brand: options.externalAdsBrand || '',
    sourceUrl: options.externalAdsUrl || '',
    sheets: 0,
    rows: 0,
    matchedRows: 0,
    spend: 0,
    warnings: []
  };
  if (!options.externalAdsEnabled) return [];
  try {
    const workbook = await loadExternalAdsWorkbook(options, diagnostics);
    if (!workbook) return [];
    const targetBrand = normalizeKey(options.externalAdsBrand);
    const rows = [];
    for (const sheetName of workbook.SheetNames || []) {
      const period = parseExternalSheetPeriod(sheetName);
      if (!period) continue;
      diagnostics.externalAds.sheets += 1;
      const weekDates = enumerateDates(period.from, period.to);
      const reportDates = weekDates.filter((date) => date >= options.from && date <= options.to);
      if (!reportDates.length || !weekDates.length) continue;
      const sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
      diagnostics.externalAds.rows += sheetRows.length;
      for (const row of sheetRows) {
        const brand = normalizeText(row['Бренд']);
        if (targetBrand && !normalizeKey(brand).includes(targetBrand)) continue;
        const spend = numberFromSheet(row['Стоимость контента']);
        if (spend <= 0) continue;
        diagnostics.externalAds.matchedRows += 1;
        diagnostics.externalAds.spend += spend * (reportDates.length / weekDates.length);
        const articleKey = normalizeText(row['Буквенный артикул']) || `wb-nm-${String(Math.trunc(numberFromSheet(row['Артикул'])) || 'external')}`;
        const nmId = String(Math.trunc(numberFromSheet(row['Артикул']))) || '';
        for (const date of reportDates) {
          rows.push({
            date,
            campaignId: `external-sheet:${sheetName}`,
            campaignName: 'Google Sheets внешка',
            channel: CHANNELS.external,
            nmId,
            articleKey,
            article: articleKey,
            name: normalizeText(row['Продукт']) || articleKey,
            views: numberFromSheet(row['Охват']) / weekDates.length,
            clicks: numberFromSheet(row['Клики']) / weekDates.length,
            spend: spend / weekDates.length,
            orders: numberFromSheet(row['Заказы']) / weekDates.length,
            revenue: numberFromSheet(row['Выручка']) / weekDates.length
          });
        }
      }
    }
    diagnostics.externalAds.spend = Math.round(diagnostics.externalAds.spend * 100) / 100;
    diagnostics.externalAds.itemRows = rows.length;
    diagnostics.externalAds.allocation = 'weekly rows allocated evenly by calendar day';
    return rows;
  } catch (error) {
    diagnostics.warnings.push(`external ads were not loaded: ${error.message}`);
    diagnostics.externalAds.warnings.push(error.message);
    return [];
  }
}

function parseFixtureDate(value, year) {
  const raw = normalizeText(value);
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/);
  if (!match) return isoDate(raw);
  const resolvedYear = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : year;
  return `${resolvedYear}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[1])).padStart(2, '0')}`;
}

function buildFromFixture(options, diagnostics) {
  const workbook = XLSX.readFile(options.fixturePath);
  const sheetName = workbook.SheetNames.includes('Детальная информация') ? 'Детальная информация' : workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  const fixtureYear = Number(options.from.slice(0, 4)) || new Date().getFullYear();
  const itemSeries = [];
  for (const row of rows) {
    const date = parseFixtureDate(row['Период'], fixtureYear);
    if (!date || date < options.from || date > options.to) continue;
    const spend = numberOrZero(row['Реклама. Фактические затраты']);
    const revenue = numberOrZero(row['Продажи. Фактический оборот']);
    if (!spend && !revenue) continue;
    itemSeries.push({
      date,
      platformKey: 'wb',
      articleKey: 'wb-total-fixture',
      article: 'WB total',
      name: 'WB total fixture',
      owner: '',
      views: 0,
      clicks: 0,
      spend,
      orders: 0,
      revenue,
      campaignId: 'excel-fixture',
      campaignName: path.basename(options.fixturePath),
      channel: CHANNELS.promotion,
      nmId: ''
    });
  }
  diagnostics.fixturePath = options.fixturePath;
  diagnostics.fixtureRows = itemSeries.length;
  return aggregateRows(itemSeries);
}

function existingAdsSummaryUsable(payload) {
  return payload && typeof payload === 'object'
    && Array.isArray(payload.platforms)
    && payload.platforms.some((platform) => Array.isArray(platform?.series) && platform.series.some((row) => numberOrZero(row.spend) > 0));
}

async function buildPayload(options) {
  const skus = readJson(path.join(options.baseDataDir, 'skus.json'), []);
  const { nmMap, diagnostics: supplierDiagnostics } = readSupplierNmMap(options.supplierGoodsPath, skus);
  const diagnostics = {
    generatedAt: new Date().toISOString(),
    docsUrl: WB_PROMOTION_DOCS_URL,
    sourceWindow: { from: options.from, to: options.to },
    supplierGoods: supplierDiagnostics,
    warnings: []
  };
  const externalRows = await buildExternalAdsRows(options, diagnostics);

  if (!options.token) {
    diagnostics.warnings.push('ALTEA_WB_PROMOTION_TOKEN is not set; WB API request was skipped.');
    if (options.fixtureFallback && options.fixturePath) {
      const itemSeries = aggregateRows([...buildFromFixture(options, diagnostics), ...externalRows]);
      return buildAdsSummary(
        itemSeries,
        options,
        diagnostics,
        externalRows.length ? 'excel-fixture-fallback+external-sheet' : 'excel-fixture-fallback',
        'WB Promotion token is missing; spend was seeded from the ДРР ВБ Excel fixture.'
      );
    }
    const existing = readJson(path.join(options.baseDataDir, 'ads_summary.json'), null);
    if (existingAdsSummaryUsable(existing)) {
      diagnostics.warnings.push('Using existing local ads_summary.json as fallback.');
      return { ...existing, diagnostics: { ...(existing.diagnostics || {}), fallbackDiagnostics: diagnostics } };
    }
    return buildAdsSummary([], options, diagnostics, 'empty', 'WB Promotion token is missing and no usable fallback was found.');
  }

  const countPayload = await wbRequest(options, '/adv/v1/promotion/count');
  const campaignIds = campaignIdsFromCount(countPayload);
  diagnostics.campaigns = {
    sourceGroups: Array.isArray(countPayload?.adverts) ? countPayload.adverts.length : 0,
    activeIds: campaignIds.length
  };

  if (!campaignIds.length) {
    diagnostics.warnings.push('No active WB promotion campaigns were returned by /adv/v1/promotion/count.');
    const itemSeries = aggregateRows(attachSkuMeta(externalRows, nmMap, skus, diagnostics));
    return buildAdsSummary(
      itemSeries,
      options,
      diagnostics,
      externalRows.length ? 'wb-api+external-sheet' : 'wb-api',
      externalRows.length
        ? 'WB API returned no active campaigns; external ads were loaded from Google Sheets.'
        : 'WB API returned no active campaigns for the selected window.'
    );
  }

  const campaignDetails = await fetchCampaignDetails(options, campaignIds, diagnostics);
  const fullstatRows = await fetchFullStats(options, campaignIds, campaignDetails, diagnostics);
  const updRows = await fetchUpdRows(options, diagnostics);
  const reconciledRows = reconcileWithUpd(fullstatRows, updRows, diagnostics);
  const itemSeries = aggregateRows(attachSkuMeta([...reconciledRows, ...externalRows], nmMap, skus, diagnostics));
  diagnostics.itemRows = itemSeries.length;
  diagnostics.spend = Math.round(itemSeries.reduce((sum, row) => sum + row.spend, 0) * 100) / 100;
  return buildAdsSummary(
    itemSeries,
    options,
    diagnostics,
    externalRows.length ? 'wb-api+external-sheet' : 'wb-api',
    externalRows.length ? 'WB Promotion API daily facts plus external ads Google Sheet.' : 'WB Promotion API daily facts.'
  );
}

function writeOutputs(payload, options) {
  const files = [];
  if (options.outputDir) {
    const outputPath = path.join(options.outputDir, 'ads_summary.json');
    writeJson(outputPath, payload);
    files.push(outputPath);
  }
  if (options.mirrorLocalFallback && options.mirrorDataDir) {
    const mirrorPath = path.join(options.mirrorDataDir, 'ads_summary.json');
    const outputPath = options.outputDir ? path.resolve(options.outputDir, 'ads_summary.json') : '';
    if (path.resolve(mirrorPath) !== outputPath) {
      writeJson(mirrorPath, payload);
      files.push(mirrorPath);
    }
  }
  return files;
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv));
  if (options.command !== 'sync') throw new Error(`Unsupported command: ${options.command}`);
  const payload = await buildPayload(options);
  const existingAdsSummary = readJson(path.join(options.baseDataDir, 'ads_summary.json'), null);
  const mergedPayload = mergeAdsSummaryWithExisting(payload, existingAdsSummary);
  const writtenFiles = writeOutputs(mergedPayload, options);
  const spend = (mergedPayload.platforms || []).find((platform) => platform.key === 'wb')?.spend || 0;
  const summary = {
    dryRun: options.dryRun,
    sourceMode: mergedPayload.sourceMode,
    window: mergedPayload.window,
    asOfDate: mergedPayload.asOfDate,
    spend,
    itemRows: Array.isArray(mergedPayload.itemSeries) ? mergedPayload.itemSeries.length : 0,
    writtenFiles,
    diagnostics: mergedPayload.diagnostics
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
