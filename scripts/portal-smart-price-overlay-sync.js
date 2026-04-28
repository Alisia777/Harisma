#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const XLSX = require('xlsx');
const { buildSmartPriceOverlay } = require('./build-smart-price-overlay');
const { buildLegacyPricesLayer } = require('./build-legacy-prices-layer');

const DEFAULT_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/1isYJavBkZWId5WZsu1zTo1dLNhs6Kf4FfB7Isx2eaWA/edit?gid=2003059667#gid=2003059667';
const MAX_LOCAL_FALLBACK_AGE_HOURS = 48;

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
    exportUrl: sourceUrl.replace(/\/edit.*$/, '/export?format=xlsx'),
    profileDir: path.resolve(args['profile-dir'] || process.env.ALTEA_GOOGLE_SHEET_PROFILE_DIR || cwdJoin('.altea-google-sheets-profile')),
    outputDir: path.resolve(args['output-dir'] || cwdJoin('.altea-google-sheet-sync-output')),
    inputXlsx: args['input-xlsx'] ? path.resolve(args['input-xlsx']) : '',
    workbenchPath: path.resolve(args['workbench-file'] || process.env.ALTEA_WORKBENCH_JSON_PATH || cwdJoin('data', 'smart_price_workbench.json')),
    livePath: path.resolve(args['live-file'] || process.env.ALTEA_WORKBENCH_LIVE_JSON_PATH || cwdJoin('tmp-smart_price_workbench-live.json')),
    overlayOutputPath: path.resolve(args['overlay-output-file'] || process.env.ALTEA_OVERLAY_JSON_PATH || cwdJoin('data', 'smart_price_overlay.json')),
    pricesOutputPath: path.resolve(args['prices-output-file'] || process.env.ALTEA_PRICES_JSON_PATH || cwdJoin('data', 'prices.json')),
    dryRun: Boolean(args.dryRun)
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
      || (names.has('dim_sku') && names.has('fact_marketplace_daily_sku'));
  } catch (_error) {
    return false;
  }
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
      failOnStatusCode: false
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
    return {
      buffer: fs.readFileSync(options.inputXlsx),
      sourceFileName: path.basename(options.inputXlsx),
      sourceKind: 'local',
      sourceMtimeMs: stat.mtimeMs,
      sourceMtimeIso: stat.mtime.toISOString()
    };
  }

  try {
    const buffer = await fetchDirectWorkbook(options.exportUrl);
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
      console.log(`Smart price workbook downloaded via authenticated Chrome profile: ${options.profileDir}`);
      return {
        buffer,
        sourceFileName: 'smart-price-workbook.xlsx',
        sourceKind: 'profile',
        sourceMtimeMs: Date.now(),
        sourceMtimeIso: new Date().toISOString()
      };
    } catch (profileError) {
      const fallback = discoverFallbackWorkbook();
      if (!fallback) throw profileError;
      if (fallback.ageHours > MAX_LOCAL_FALLBACK_AGE_HOURS) {
        throw new Error(`Price workbook remote access failed (${profileError.message}), and the newest local fallback is too old: ${fallback.filePath}`);
      }
      console.log(`Smart price remote access failed (${profileError.message}). Using latest local workbook fallback: ${fallback.filePath}`);
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
  if (!options.inputXlsx) {
    fs.writeFileSync(workbookPath, workbook.buffer);
    if (Number.isFinite(workbook.sourceMtimeMs)) {
      const sourceDate = new Date(workbook.sourceMtimeMs);
      fs.utimesSync(workbookPath, sourceDate, sourceDate);
    }
  }

  const stagedOverlayPath = path.join(options.outputDir, 'smart_price_overlay.json');
  const result = buildSmartPriceOverlay(workbookPath, stagedOverlayPath);
  fs.mkdirSync(path.dirname(options.overlayOutputPath), { recursive: true });
  if (path.resolve(stagedOverlayPath) !== path.resolve(options.overlayOutputPath)) {
    fs.copyFileSync(stagedOverlayPath, options.overlayOutputPath);
  }
  const pricesResult = buildLegacyPricesLayer({
    workbenchPath: options.workbenchPath,
    overlayPath: options.overlayOutputPath,
    livePath: options.livePath,
    outputPath: options.pricesOutputPath
  });
  const summary = {
    dryRun: options.dryRun,
    sourceUrl: options.sourceUrl,
    workbook: workbookPath,
    sourceKind: workbook.sourceKind,
    sourceMtime: workbook.sourceMtimeIso || '',
    fallbackPath: workbook.fallbackPath || '',
    fallbackAgeHours: workbook.fallbackAgeHours ?? null,
    overlay: {
      ...result.summary,
      stagedOutput: stagedOverlayPath,
      liveOutput: options.overlayOutputPath
    },
    prices: pricesResult.summary
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
