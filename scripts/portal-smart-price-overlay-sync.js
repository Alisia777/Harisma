#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const XLSX = require('xlsx');
const { buildSmartPriceOverlay } = require('./build-smart-price-overlay');
const { buildLegacyPricesLayer } = require('./build-legacy-prices-layer');
const { buildLegacyRepricerLayer } = require('./build-legacy-repricer-layer');
const {
  atomicWriteJson,
  mergeOverlayWithPrevious,
  priceFactMetrics,
  promoteJsonGeneration,
  stampPriceGeneration,
  validatePriceGeneration
} = require('./price-update-transaction');

const DEFAULT_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1isYJavBkZWId5WZsu1zTo1dLNhs6Kf4FfB7Isx2eaWA/edit?gid=2003059667#gid=2003059667';
const MAX_LOCAL_FALLBACK_AGE_HOURS = 48;
const DEFAULT_PROFILE_EXPORT_TIMEOUT_MS = 180000;
const GOOGLE_DRIVE_EXPORT_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

const CHROME_CANDIDATES = [
  process.env.ALTEA_CHROME_PATH || '',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
].filter(Boolean);

function parseArgs(argv) {
  const args = {
    command: 'sync',
    dryRun: false,
    initAuth: false
  };
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
    if (token === '--init-auth') {
      args.initAuth = true;
      continue;
    }
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function cwdJoin(...parts) {
  return path.join(process.cwd(), ...parts);
}

function findChromeExecutable() {
  return CHROME_CANDIDATES.find((candidate) => {
    try {
      return candidate && fs.existsSync(candidate);
    } catch (_error) {
      return false;
    }
  }) || '';
}

function resolveOptions(args) {
  const sourceUrl = args['source-url'] || process.env.ALTEA_SMART_PRICE_SHEET_URL || DEFAULT_SOURCE_URL;
  return {
    sourceUrl,
    sheetUrl: sourceUrl,
    exportUrl: args['export-url'] || process.env.ALTEA_SMART_PRICE_EXPORT_URL || sourceUrl.replace(/\/edit.*$/, '/export?format=xlsx'),
    profileDir: path.resolve(args['profile-dir'] || process.env.ALTEA_GOOGLE_SHEET_PROFILE_DIR || cwdJoin('.altea-google-sheets-profile')),
    outputDir: path.resolve(args['output-dir'] || cwdJoin('.altea-google-sheet-sync-output')),
    inputXlsx: args['input-xlsx'] || process.env.ALTEA_SMART_PRICE_INPUT_XLSX
      ? path.resolve(args['input-xlsx'] || process.env.ALTEA_SMART_PRICE_INPUT_XLSX)
      : '',
    sourceXlsxUrl: args['xlsx-url'] || process.env.ALTEA_SMART_PRICE_XLSX_URL || '',
    sourceXlsxBase64: process.env.ALTEA_SMART_PRICE_XLSX_B64 || '',
    sourceXlsxGzipBase64: process.env.ALTEA_SMART_PRICE_XLSX_GZIP_B64 || '',
    sourceMtime: args['source-mtime'] || process.env.ALTEA_SMART_PRICE_SOURCE_MTIME || process.env.ALTEA_SMART_PRICE_XLSX_MTIME || '',
    httpAuthBearer: process.env.ALTEA_SMART_PRICE_HTTP_AUTH_BEARER || '',
    httpAuthHeader: process.env.ALTEA_SMART_PRICE_HTTP_AUTH_HEADER || '',
    googleServiceAccountJson: process.env.ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || '',
    googleServiceAccountPath: process.env.ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    googleFileId: args['google-file-id'] || process.env.ALTEA_SMART_PRICE_GOOGLE_FILE_ID || extractGoogleFileId(sourceUrl),
    workbenchPath: path.resolve(args['workbench-file'] || process.env.ALTEA_WORKBENCH_JSON_PATH || cwdJoin('data', 'smart_price_workbench.json')),
    livePath: path.resolve(args['live-file'] || process.env.ALTEA_WORKBENCH_LIVE_JSON_PATH || cwdJoin('tmp-smart_price_workbench-live.json')),
    liveRepricerPath: path.resolve(args['live-repricer-file'] || process.env.ALTEA_LIVE_REPRICER_JSON_PATH || cwdJoin('tmp-live-repricer.json')),
    liveRepricerMaxAgeDays: Number(args['live-repricer-max-age-days'] || process.env.ALTEA_LIVE_REPRICER_MAX_AGE_DAYS || 7),
    supportPath: path.resolve(args['support-file'] || process.env.ALTEA_PRICE_SUPPORT_JSON_PATH || cwdJoin('data', 'price_workbench_support.json')),
    apiPricePath: args['api-price-file'] || process.env.ALTEA_PRICE_API_OVERLAY_PATH
      ? path.resolve(args['api-price-file'] || process.env.ALTEA_PRICE_API_OVERLAY_PATH)
      : '',
    overlayOutputPath: path.resolve(args['overlay-output-file'] || process.env.ALTEA_OVERLAY_JSON_PATH || cwdJoin('data', 'smart_price_overlay.json')),
    pricesOutputPath: path.resolve(args['prices-output-file'] || process.env.ALTEA_PRICES_JSON_PATH || cwdJoin('data', 'prices.json')),
    repricerOutputPath: path.resolve(args['repricer-output-file'] || process.env.ALTEA_REPRICER_JSON_PATH || cwdJoin('data', 'repricer.json')),
    auditOutputPath: path.resolve(args['audit-output-file'] || process.env.ALTEA_PRICE_UPDATE_AUDIT_PATH || cwdJoin('data', 'price_update_audit.json')),
    expectedDate: String(args['expected-date'] || process.env.ALTEA_PRICE_EXPECTED_DATE || '').slice(0, 10),
    maxSourceLagDays: Number(args['max-source-lag-days'] || process.env.ALTEA_PRICE_MAX_SOURCE_LAG_DAYS || 3),
    maxPlatformGapDays: Number(args['max-platform-gap-days'] || process.env.ALTEA_PRICE_MAX_PLATFORM_GAP_DAYS || 3),
    minLatestCoverageRatio: Number(args['min-latest-coverage-ratio'] || process.env.ALTEA_PRICE_MIN_LATEST_COVERAGE_RATIO || 0.55),
    profileExportTimeoutMs: Number(args['profile-export-timeout-ms'] || process.env.ALTEA_SMART_PRICE_PROFILE_EXPORT_TIMEOUT_MS || DEFAULT_PROFILE_EXPORT_TIMEOUT_MS),
    dryRun: Boolean(args.dryRun)
  };
}

function compactRemoteError(error) {
  const firstLine = String(error && error.message ? error.message : error || 'unknown error')
    .split(/\r?\n/)[0]
    .replace(/\s+/g, ' ')
    .trim();
  return firstLine.slice(0, 300) || 'unknown error';
}

function redactUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.search) url.search = '?redacted=1';
    if (url.hash) url.hash = '';
    return url.toString();
  } catch (_error) {
    return raw.includes('?') ? `${raw.split('?')[0]}?redacted=1` : raw;
  }
}

function readJson(filePath, fallback = null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function preserveExtraMarketplace(stagedOverlayPath, liveOverlayPath, previousOverlay) {
  const extraMarketplace = previousOverlay?.extraMarketplace;
  if (!extraMarketplace || typeof extraMarketplace !== 'object') return false;

  const overlay = readJson(stagedOverlayPath, null);
  if (!overlay || typeof overlay !== 'object') return false;

  overlay.extraMarketplace = extraMarketplace;
  writeJson(stagedOverlayPath, overlay);
  return true;
}

function mergeApiPriceOverlay(workbookOverlay, apiPriceOverlay) {
  if (!apiPriceOverlay?.platforms) return workbookOverlay;
  return {
    ...mergeOverlayWithPrevious({
      generatedAt: apiPriceOverlay.generatedAt || workbookOverlay?.generatedAt,
      platforms: apiPriceOverlay.platforms
    }, workbookOverlay || {}),
    priceApiSnapshot: apiPriceOverlay.priceApiSnapshot || {
      source: apiPriceOverlay.source || '',
      generatedAt: apiPriceOverlay.generatedAt || '',
      asOfDate: apiPriceOverlay.asOfDate || ''
    }
  };
}

function normalizePathList(value) {
  return String(value || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);
}

function workbookLooksLikeSmartPrices(filePath) {
  try {
    const workbook = XLSX.readFile(filePath, { bookSheets: true });
    const names = new Set((workbook.SheetNames || []).map((name) => String(name || '').trim()));
    return names.has('База')
      || names.has('Сводная')
      || names.has('Исходные данные')
      || (names.has('WB — текущие') && names.has('Ozon — текущие'))
      || (names.has('dim_sku') && names.has('fact_marketplace_daily_sku'));
  } catch (_error) {
    return false;
  }
}

function workbookSheetNamesLookLikeSmartPrices(sheetNames = []) {
  const names = new Set((sheetNames || []).map((name) => String(name || '').trim()));
  return names.has('\u0411\u0430\u0437\u0430')
    || names.has('\u0421\u0432\u043e\u0434\u043d\u0430\u044f')
    || names.has('\u0418\u0441\u0445\u043e\u0434\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435')
    || (names.has('WB — текущие') && names.has('Ozon — текущие'))
    || names.has('Р‘Р°Р·Р°')
    || names.has('РЎРІРѕРґРЅР°СЏ')
    || (names.has('dim_sku') && names.has('fact_marketplace_daily_sku'));
}

function workbookBufferLooksLikeSmartPrices(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', bookSheets: true });
    return workbookSheetNamesLookLikeSmartPrices(workbook.SheetNames || []);
  } catch (_error) {
    return false;
  }
}

function assertSmartPriceWorkbookBuffer(buffer, sourceLabel) {
  if (!workbookBufferLooksLikeSmartPrices(buffer)) {
    throw new Error(`Price workbook source does not match the smart-price workbook schema: ${sourceLabel}`);
  }
}

function sourceMtimeInfo(sourceMtime = '', fallbackMs = Date.now()) {
  const parsed = sourceMtime ? new Date(sourceMtime) : null;
  const mtimeMs = parsed && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : fallbackMs;
  return {
    sourceMtimeMs: mtimeMs,
    sourceMtimeIso: new Date(mtimeMs).toISOString()
  };
}

function parseHeaderLine(line = '') {
  const index = String(line).indexOf(':');
  if (index <= 0) return null;
  const name = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (!name || !value) return null;
  return [name, value];
}

function isGitHubReleaseAssetApiUrl(url = '') {
  return /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/releases\/assets\/\d+/i.test(String(url || '').trim());
}

function buildWorkbookRequestHeaders(options, url = '') {
  const headers = {
    'User-Agent': 'harisma-portal-smart-price-sync/1.0'
  };
  if (isGitHubReleaseAssetApiUrl(url)) {
    headers.Accept = 'application/octet-stream';
  }
  if (options.httpAuthBearer) {
    headers.Authorization = `Bearer ${options.httpAuthBearer}`;
  }
  const parsedHeader = parseHeaderLine(options.httpAuthHeader || '');
  if (parsedHeader) headers[parsedHeader[0]] = parsedHeader[1];
  return headers;
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetries(url, init, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleepMs(1000 * attempt);
    }
  }
  throw new Error(`request failed: ${lastError?.message || lastError || 'unknown error'}`);
}

async function fetchWorkbookFromUrl(url, options = {}) {
  const headers = buildWorkbookRequestHeaders(options, url);
  let response = await fetchWithRetries(url, {
    redirect: isGitHubReleaseAssetApiUrl(url) ? 'manual' : 'follow',
    headers
  });
  if (isGitHubReleaseAssetApiUrl(url) && response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error(`GitHub release asset redirect did not include Location header: HTTP ${response.status}`);
    response = await fetchWithRetries(location, {
      redirect: 'follow',
      headers: { 'User-Agent': headers['User-Agent'] || 'harisma-portal-smart-price-sync/1.0' }
    });
  }
  if (!response.ok) {
    throw new Error(`Workbook URL export failed with HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  assertSmartPriceWorkbookBuffer(buffer, 'url');
  const lastModified = response.headers.get('last-modified') || '';
  const parsedLastModified = lastModified ? new Date(lastModified) : null;
  const fallbackMs = parsedLastModified && !Number.isNaN(parsedLastModified.getTime())
    ? parsedLastModified.getTime()
    : Date.now();
  return {
    buffer,
    sourceFileName: 'smart-price-workbook.xlsx',
    sourceKind: 'url',
    ...sourceMtimeInfo(options.sourceMtime, fallbackMs)
  };
}

function decodeWorkbookFromEnvironment(options = {}) {
  const gzipPayload = String(options.sourceXlsxGzipBase64 || '').trim();
  if (gzipPayload) {
    const buffer = zlib.gunzipSync(Buffer.from(gzipPayload, 'base64'));
    assertSmartPriceWorkbookBuffer(buffer, 'gzip-base64');
    return {
      buffer,
      sourceFileName: 'smart-price-workbook.xlsx',
      sourceKind: 'env-gzip-base64',
      ...sourceMtimeInfo(options.sourceMtime)
    };
  }

  const base64Payload = String(options.sourceXlsxBase64 || '').trim();
  if (base64Payload) {
    const buffer = Buffer.from(base64Payload, 'base64');
    assertSmartPriceWorkbookBuffer(buffer, 'base64');
    return {
      buffer,
      sourceFileName: 'smart-price-workbook.xlsx',
      sourceKind: 'env-base64',
      ...sourceMtimeInfo(options.sourceMtime)
    };
  }

  return null;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function extractGoogleFileId(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/\/spreadsheets\/d\/([^/]+)/) || raw.match(/\/file\/d\/([^/]+)/) || raw.match(/[?&]id=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function readGoogleServiceAccount(options = {}) {
  const inlineJson = String(options.googleServiceAccountJson || '').trim();
  if (inlineJson) return JSON.parse(inlineJson);
  const filePath = String(options.googleServiceAccountPath || '').trim();
  if (filePath && fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  return null;
}

async function fetchGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const assertionHeader = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const assertionPayload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: GOOGLE_DRIVE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${assertionHeader}.${assertionPayload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  const assertion = `${unsigned}.${signature}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!response.ok) {
    throw new Error(`Google service account token request failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error('Google service account token response did not include access_token');
  }
  return payload.access_token;
}

async function fetchWorkbookViaGoogleServiceAccount(options) {
  if (!options.googleFileId) return null;
  const serviceAccount = readGoogleServiceAccount(options);
  if (!serviceAccount) return null;
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('Google service account JSON must include client_email and private_key');
  }
  const accessToken = await fetchGoogleAccessToken(serviceAccount);
  const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(options.googleFileId)}/export?mimeType=${encodeURIComponent(GOOGLE_DRIVE_EXPORT_MIME)}`;
  const response = await fetch(exportUrl, {
    redirect: 'follow',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'harisma-portal-smart-price-sync/1.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Google Drive export failed with HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  assertSmartPriceWorkbookBuffer(buffer, 'google-service-account');
  return {
    buffer,
    sourceFileName: 'smart-price-workbook.xlsx',
    sourceKind: 'google-service-account',
    ...sourceMtimeInfo(options.sourceMtime)
  };
}

function discoverFallbackWorkbook() {
  const candidates = [];
  const searchDirs = [
    process.cwd(),
    path.join(process.env.USERPROFILE || '', 'Downloads'),
    ...normalizePathList(process.env.ALTEA_SMART_PRICE_FALLBACK_DIRS || '')
  ].filter(Boolean);

  const seen = new Set();
  for (const dir of searchDirs) {
    if (seen.has(dir) || !fs.existsSync(dir)) continue;
    seen.add(dir);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.xlsx$/i.test(entry.name)) continue;
      if (!/(tmp-smart-prices-|tmp-main-portal-workbook|смарт.*работа с ценами|smart.*price|portal.*workbook)/i.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      if (!workbookLooksLikeSmartPrices(filePath)) continue;
      const stat = fs.statSync(filePath);
      candidates.push({
        filePath,
        mtimeMs: stat.mtimeMs,
        ageHours: (Date.now() - stat.mtimeMs) / 36e5
      });
    }
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0] || null;
}

async function fetchDirectWorkbook(exportUrl) {
  const response = await fetch(exportUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Direct export failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function initAuthSession(options) {
  fs.mkdirSync(options.profileDir, { recursive: true });
  const chromePath = findChromeExecutable();
  if (chromePath) {
    console.log('');
    console.log('Откроется Chrome с отдельным профилем для доступа к таблице цен.');
    console.log('Войдите в Google, откройте файл со сводной цен и после этого закройте окно браузера.');
    const chromeArgs = [
      `--user-data-dir=${options.profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-sync',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      options.sheetUrl
    ];
    await new Promise((resolve, reject) => {
      const child = spawn(chromePath, chromeArgs, {
        cwd: process.cwd(),
        stdio: 'ignore'
      });
      child.once('error', reject);
      child.once('exit', (code) => {
        if (code && code !== 0) {
          reject(new Error(`Chrome auth session exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
    return;
  }

  const browser = await chromium.launchPersistentContext(options.profileDir, {
    headless: false,
    channel: 'chrome'
  });
  const page = await browser.newPage();
  await page.goto(options.sheetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('');
  console.log('Открылся Chrome-профиль для авторизации таблицы цен.');
  console.log('Войдите в Google и после открытия таблицы просто закройте окно браузера.');
  await browser.waitForEvent('close');
}

async function fetchWorkbookViaBrowserAuth(options) {
  const browser = await chromium.launchPersistentContext(options.profileDir, {
    headless: true,
    channel: 'chrome'
  });
  const page = await browser.newPage();
  try {
    await page.goto(options.sheetUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForTimeout(2500);
    const currentUrl = page.url();
    const title = await page.title();
    if (/accounts\.google\.com/i.test(currentUrl) || /вход/i.test(String(title || '').toLowerCase())) {
      throw new Error('Google-авторизация для price-sync профиля не настроена. Один раз запустите script с --init-auth и войдите в Google.');
    }
    const response = await browser.request.get(options.exportUrl, {
      failOnStatusCode: false,
      timeout: Math.max(30000, Number(options.profileExportTimeoutMs) || DEFAULT_PROFILE_EXPORT_TIMEOUT_MS)
    });
    if (!response.ok()) {
      throw new Error(`Google export returned HTTP ${response.status()}`);
    }
    return Buffer.from(await response.body());
  } finally {
    await browser.close();
  }
}

async function resolveWorkbookBuffer(options) {
  if (options.inputXlsx) {
    const stat = fs.statSync(options.inputXlsx);
    if (!workbookLooksLikeSmartPrices(options.inputXlsx)) {
      throw new Error(`Price workbook source does not match the smart-price workbook schema: ${options.inputXlsx}`);
    }
    const mtime = sourceMtimeInfo(options.sourceMtime, stat.mtimeMs);
    return {
      buffer: fs.readFileSync(options.inputXlsx),
      sourceFileName: path.basename(options.inputXlsx),
      sourceKind: 'local',
      sourceMtimeMs: mtime.sourceMtimeMs,
      sourceMtimeIso: mtime.sourceMtimeIso
    };
  }

  const envWorkbook = decodeWorkbookFromEnvironment(options);
  if (envWorkbook) {
    console.log(`Smart price workbook loaded from ${envWorkbook.sourceKind}.`);
    return envWorkbook;
  }

  if (options.sourceXlsxUrl) {
    try {
      const workbook = await fetchWorkbookFromUrl(options.sourceXlsxUrl, options);
      console.log(`Smart price workbook downloaded via configured URL: ${redactUrl(options.sourceXlsxUrl)}`);
      return workbook;
    } catch (error) {
      throw new Error(`Configured smart price workbook URL failed (${compactRemoteError(error)})`);
    }
  }

  try {
    const workbook = await fetchWorkbookViaGoogleServiceAccount(options);
    if (workbook) {
      console.log('Smart price workbook downloaded via Google service account.');
      return workbook;
    }
  } catch (error) {
    throw new Error(`Google service account smart price export failed (${compactRemoteError(error)})`);
  }

  try {
    const buffer = await fetchDirectWorkbook(options.exportUrl);
    assertSmartPriceWorkbookBuffer(buffer, 'direct');
    console.log('Smart price workbook downloaded via direct Google export.');
    return {
      buffer,
      sourceFileName: 'smart-price-workbook.xlsx',
      sourceKind: 'direct',
      sourceMtimeMs: Date.now(),
      sourceMtimeIso: new Date().toISOString()
    };
  } catch (error) {
    console.log(`Smart price direct export unavailable: ${error.message}`);
    console.log('Trying authenticated Chrome profile. If you just opened the price sheet in Chrome, close that Chrome window first.');
    try {
      const buffer = await fetchWorkbookViaBrowserAuth(options);
      assertSmartPriceWorkbookBuffer(buffer, 'profile');
      console.log(`Smart price workbook downloaded via authenticated Chrome profile: ${options.profileDir}`);
      return {
        buffer,
        sourceFileName: 'smart-price-workbook.xlsx',
        sourceKind: 'profile',
        sourceMtimeMs: Date.now(),
        sourceMtimeIso: new Date().toISOString()
      };
    } catch (profileError) {
      const profileMessage = compactRemoteError(profileError);
      const fallback = discoverFallbackWorkbook();
      if (!fallback) throw new Error(`Price workbook remote access failed (${profileMessage})`);
      if (fallback.ageHours > MAX_LOCAL_FALLBACK_AGE_HOURS) {
        throw new Error(`Price workbook remote access failed (${profileMessage}), and the newest local fallback is too old: ${fallback.filePath}`);
      }
      console.log(`Smart price remote access failed (${profileMessage}). Using latest local workbook fallback: ${fallback.filePath}`);
      return {
        buffer: fs.readFileSync(fallback.filePath),
        sourceFileName: path.basename(fallback.filePath),
        sourceKind: 'fallback-local',
        fallbackPath: fallback.filePath,
        fallbackAgeHours: Number(fallback.ageHours.toFixed(1)),
        sourceMtimeMs: fallback.mtimeMs,
        sourceMtimeIso: new Date(fallback.mtimeMs).toISOString()
      };
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const options = resolveOptions(args);

  if (args.initAuth) {
    await initAuthSession(options);
    return;
  }

  const workbook = await resolveWorkbookBuffer(options);
  fs.mkdirSync(options.outputDir, { recursive: true });

  const workbookPath = options.inputXlsx || path.join(options.outputDir, workbook.sourceFileName);
  if (options.inputXlsx && Number.isFinite(workbook.sourceMtimeMs)) {
    const sourceDate = new Date(workbook.sourceMtimeMs);
    fs.utimesSync(workbookPath, sourceDate, sourceDate);
  }
  if (!options.inputXlsx) {
    fs.writeFileSync(workbookPath, workbook.buffer);
    if (Number.isFinite(workbook.sourceMtimeMs)) {
      const sourceDate = new Date(workbook.sourceMtimeMs);
      fs.utimesSync(workbookPath, sourceDate, sourceDate);
    }
  }

  const previousOverlay = readJson(options.overlayOutputPath, null);
  const previousPrices = readJson(options.pricesOutputPath, null);
  const previousRepricer = readJson(options.repricerOutputPath, null);
  const stageDir = fs.mkdtempSync(path.join(options.outputDir, '.price-generation-'));
  const stagedOverlayPath = path.join(stageDir, 'smart_price_overlay.json');
  const stagedPricesPath = path.join(stageDir, 'prices.json');
  const stagedRepricerPath = path.join(stageDir, 'repricer.json');
  const diagnosticAuditPath = path.join(options.outputDir, 'price_update_audit.json');

  try {
    const result = buildSmartPriceOverlay(workbookPath, stagedOverlayPath);
    const apiPriceOverlay = readJson(options.apiPricePath, null);
    const rawOverlay = mergeApiPriceOverlay(result.payload, apiPriceOverlay);
    const mergedOverlay = mergeOverlayWithPrevious(rawOverlay, previousOverlay || {});
    const extraMarketplacePreserved = Boolean(
      previousOverlay?.extraMarketplace && !rawOverlay?.extraMarketplace
    );
    atomicWriteJson(stagedOverlayPath, mergedOverlay);

    const pricesResult = buildLegacyPricesLayer({
      workbenchPath: options.workbenchPath,
      overlayPath: stagedOverlayPath,
      livePath: options.livePath,
      outputPath: stagedPricesPath
    });
    const repricerResult = buildLegacyRepricerLayer({
      workbenchPath: options.workbenchPath,
      overlayPath: stagedOverlayPath,
      liveWorkbenchPath: options.livePath,
      liveRepricerPath: options.liveRepricerPath,
      liveRepricerMaxAgeDays: options.liveRepricerMaxAgeDays,
      supportPath: options.supportPath,
      pricesPath: stagedPricesPath,
      outputPath: stagedRepricerPath
    });
    const stagedPrices = readJson(stagedPricesPath, {});
    const stagedRepricer = readJson(stagedRepricerPath, {});
    const audit = validatePriceGeneration({
      previousOverlay,
      previousPrices,
      previousRepricer,
      rawOverlay,
      overlay: mergedOverlay,
      prices: stagedPrices,
      repricer: stagedRepricer,
      expectedDate: options.expectedDate,
      maxSourceLagDays: options.maxSourceLagDays,
      maxPlatformGapDays: options.maxPlatformGapDays,
      minLatestCoverageRatio: options.minLatestCoverageRatio
    });
    const stamped = stampPriceGeneration({
      overlay: mergedOverlay,
      prices: stagedPrices,
      repricer: stagedRepricer
    }, {
      asOfDate: priceFactMetrics(mergedOverlay).latestFactDate,
      sourceKind: workbook.sourceKind,
      sourceMtime: workbook.sourceMtimeIso || ''
    });
    const finalAudit = {
      ...audit,
      generationId: stamped.id,
      source: {
        kind: workbook.sourceKind,
        mtime: workbook.sourceMtimeIso || '',
        file: path.basename(workbookPath)
      }
    };
    atomicWriteJson(diagnosticAuditPath, finalAudit);

    if (!audit.publishAllowed) {
      throw new Error(`Price generation rejected:\n- ${audit.blockingReasons.join('\n- ')}`);
    }

    if (!options.dryRun) {
      promoteJsonGeneration([
        { path: options.overlayOutputPath, payload: stamped.payloads.overlay },
        { path: options.pricesOutputPath, payload: stamped.payloads.prices },
        { path: options.repricerOutputPath, payload: stamped.payloads.repricer },
        { path: options.auditOutputPath, payload: finalAudit }
      ]);
    }

    const summary = {
      dryRun: options.dryRun,
      activated: !options.dryRun,
      generationId: stamped.id,
      sourceUrl: redactUrl(options.sourceUrl),
      workbookUrl: redactUrl(options.sourceXlsxUrl),
      workbook: workbookPath,
      sourceKind: workbook.sourceKind,
      sourceMtime: workbook.sourceMtimeIso || '',
      apiPriceFile: options.apiPricePath || '',
      apiPriceSnapshot: rawOverlay.priceApiSnapshot || null,
      fallbackPath: workbook.fallbackPath || '',
      fallbackAgeHours: workbook.fallbackAgeHours ?? null,
      overlay: {
        ...result.summary,
        mergedCounts: Object.fromEntries(
          Object.entries(mergedOverlay.platforms || {}).map(([platform, bucket]) => [
            platform,
            Array.isArray(bucket?.rows) ? bucket.rows.length : 0
          ])
        ),
        extraMarketplacePreserved,
        liveOutput: options.overlayOutputPath
      },
      prices: pricesResult.summary,
      repricer: repricerResult.summary,
      audit: {
        status: finalAudit.status,
        warnings: finalAudit.warnings,
        output: options.auditOutputPath,
        diagnosticOutput: diagnosticAuditPath
      }
    };
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

module.exports = {
  buildWorkbookRequestHeaders,
  decodeWorkbookFromEnvironment,
  extractGoogleFileId,
  fetchWorkbookFromUrl,
  mergeApiPriceOverlay,
  mergeOverlayWithPrevious,
  preserveExtraMarketplace,
  priceFactMetrics,
  readGoogleServiceAccount,
  redactUrl,
  resolveOptions,
  resolveWorkbookBuffer,
  workbookBufferLooksLikeSmartPrices,
  workbookSheetNamesLookLikeSmartPrices
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
