const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PLATFORM_TRENDS_PATH = path.join(DATA_DIR, 'platform_trends.json');
const OUT_PATH = path.join(DATA_DIR, 'iu_plan.json');
const OZON_IU_ADS_RATE = 0.24877996681564674;
const OZON_IU_SMART_SHARE = 0.4;
const IU_START_MONTH = 3;
const LEGACY_PLAN_MONTHS = [5, 6, 7, 8, 9, 10, 11, 12];
const LEGACY_PLAN_COLS = ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];
const SMART_SALE_OZON_GMV_2026 = {
  '2026-03': 93156616.50550051,
  '2026-04': 104504530.805005,
  '2026-05': 103407637.51260701,
  '2026-06': 102003858.797003,
  '2026-07': 105625550.474901,
  '2026-08': 112322218.777206,
  '2026-09': 131926900.70140499,
  '2026-10': 129719435.371205,
  '2026-11': 126917638.188604,
  '2026-12': 143447038.351102
};
const WB_IU_SMART_SHARE = 1;
const DOWNLOADS_ROOT = path.resolve(process.env.USERPROFILE || process.cwd(), 'Downloads');

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!String(token || '').startsWith('--')) {
      args._.push(token);
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

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickNewest(files) {
  return files
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(ROOT, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.name || null;
}

function findNewestFileInDirs(dirs, predicate) {
  const matches = [];
  for (const dir of dirs) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !predicate(entry.name)) continue;
        const filePath = path.join(dir, entry.name);
        matches.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
      }
    } catch (_error) {
      // Optional source folders may not exist.
    }
  }
  return matches.sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath || '';
}

function detectWbIuPlanWorkbook() {
  if (process.env.ALTEA_WB_IU_PLAN_FILE && fs.existsSync(process.env.ALTEA_WB_IU_PLAN_FILE)) {
    return process.env.ALTEA_WB_IU_PLAN_FILE;
  }
  return findNewestFileInDirs(
    [path.join(DOWNLOADS_ROOT, 'Telegram Desktop'), DOWNLOADS_ROOT],
    (name) => /\.xlsx$/i.test(name) && /2026[_\s-]*h[_\s-]*1/i.test(String(name || '').toLowerCase())
  );
}

function detectPlanWorkbook(candidateArg) {
  if (candidateArg) {
    const direct = path.resolve(ROOT, candidateArg);
    if (fs.existsSync(direct)) return direct;
  }

  const allFiles = fs.readdirSync(ROOT);
  const xlsx = allFiles.filter((name) => /\.xlsx$/i.test(name) && !name.startsWith('.'));
  if (!xlsx.length) throw new Error('Workbook .xlsx not found in project root');

  const exact = xlsx.find((name) => /^план\s*ф/i.test(String(name || '')));
  if (exact) return path.join(ROOT, exact);

  const planLike = xlsx.filter((name) => {
    const normalized = String(name || '').toLowerCase();
    return normalized.includes('план') || normalized.includes('plan');
  });
  if (planLike.length) return path.join(ROOT, pickNewest(planLike));

  return path.join(ROOT, pickNewest(xlsx));
}

function detectPlanYear() {
  try {
    const raw = fs.readFileSync(PLATFORM_TRENDS_PATH, 'utf8');
    const payload = JSON.parse(raw);
    const latest = String(payload?.latestMarketplaceDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(latest)) return Number(latest.slice(0, 4));
  } catch (_) {
    // no-op
  }
  return new Date().getFullYear();
}

function cell(sheet, ref) {
  return sheet[ref] ? sheet[ref].v : null;
}

function isoDate(value) {
  if (!value && value !== 0) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dotted) {
    const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
    return `${year}-${String(dotted[2]).padStart(2, '0')}-${String(dotted[1]).padStart(2, '0')}`;
  }
  return '';
}

function money(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  const parsed = Number(String(value).replace(/\s+/g, '').replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value) {
  return Math.round(num(value) * 100) / 100;
}

function roundRate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000000) / 1000000 : null;
}

function monthLabel(header, year) {
  const text = String(header || '').trim();
  return text ? `${text} ${year}` : `${year}`;
}

function selectPlanSheet(sheetNames) {
  const names = Array.isArray(sheetNames) ? sheetNames : [];
  if (!names.length) return '';

  const exact = names.find((name) => /^01[_\s-]/.test(String(name || '')));
  if (exact) return exact;

  const numeric = names.find((name) => /^\d{2}[_\s-]/.test(String(name || '')));
  if (numeric) return numeric;

  return names[0];
}

function smartSaleMonthKey(header) {
  const match = String(header || '').trim().match(/(?:fact|plan)\s*(\d{1,2})\/(\d{2,4})/i);
  if (!match) return '';
  const year = match[2].length === 2 ? `20${match[2]}` : match[2];
  return `${year}-${String(Number(match[1])).padStart(2, '0')}`;
}

function readSmartSaleOzonPlan(workbookPath, year) {
  if (!workbookPath || !fs.existsSync(workbookPath)) return null;
  try {
    const wb = XLSX.readFile(workbookPath);
    for (const sheetName of wb.SheetNames || []) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      const gmvRowIndex = rows.findIndex((row) => String(row?.[0] || '').trim().toLowerCase() === 'gmv dr');
      if (gmvRowIndex < 0) continue;
      const headerRow = rows
        .slice(Math.max(0, gmvRowIndex - 4), gmvRowIndex)
        .reverse()
        .find((row) => row.some((value) => smartSaleMonthKey(value)));
      const gmvRow = rows[gmvRowIndex] || [];
      const months = {};
      for (let col = 0; col < Math.max(headerRow?.length || 0, gmvRow.length); col += 1) {
        const key = smartSaleMonthKey(headerRow?.[col]);
        if (!key || !key.startsWith(`${year}-`)) continue;
        const monthNumber = Number(key.slice(5, 7));
        if (monthNumber < IU_START_MONTH) continue;
        const value = num(gmvRow[col]);
        if (value > 0) months[key] = value;
      }

      let arRate = 0;
      for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex += 1) {
        const row = rows[rowIndex] || [];
        const arCol = row.findIndex((value) => String(value || '').trim().toUpperCase() === 'AR');
        if (arCol >= 0) {
          const value = num(rows[rowIndex + 1]?.[arCol]);
          if (value > 0) arRate = value;
        }
      }

      if (Object.keys(months).length) {
        return {
          workbookPath,
          sourceWorkbook: path.basename(workbookPath),
          sourceSheet: sheetName,
          ozonIuAdsRate: arRate > 0 ? arRate : OZON_IU_ADS_RATE,
          months
        };
      }
    }
  } catch (_) {
    return null;
  }
  return null;
}

function listXlsxFiles(dirPath) {
  try {
    if (!dirPath || !fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .filter((name) => /\.xlsx$/i.test(name) && !String(name || '').startsWith('~$'))
      .map((name) => path.join(dirPath, name));
  } catch (_) {
    return [];
  }
}

function detectSmartSaleOzonPlan(candidateArg, year) {
  const explicit = candidateArg || process.env.ALTEA_IU_SMART_SALE_XLSX || '';
  if (explicit) {
    const direct = path.resolve(ROOT, explicit);
    const payload = readSmartSaleOzonPlan(fs.existsSync(direct) ? direct : explicit, year);
    if (payload) return payload;
  }

  const localSmartSaleCandidates = listXlsxFiles(ROOT)
    .filter((filePath) => {
      const name = path.basename(filePath);
      const normalized = String(name || '').toLowerCase();
      return !normalized.startsWith('~$')
        && !normalized.startsWith('.')
        && (normalized.includes('иу') || normalized.includes('iu'))
        && (normalized.includes('смарт') || normalized.includes('smart'));
    })
    .sort((left, right) => {
      try {
        return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
      } catch (_) {
        return 0;
      }
    });
  for (const candidate of localSmartSaleCandidates) {
    const payload = readSmartSaleOzonPlan(candidate, year);
    if (payload) return payload;
  }

  const downloads = process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Downloads') : '';
  const candidates = [
    ...listXlsxFiles(ROOT),
    ...listXlsxFiles(downloads),
    ...listXlsxFiles(path.join(downloads, 'Telegram Desktop'))
  ].sort((left, right) => {
    try {
      return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
    } catch (_) {
      return 0;
    }
  });

  for (const candidate of candidates) {
    const payload = readSmartSaleOzonPlan(candidate, year);
    if (payload) return payload;
  }

  return {
    workbookPath: '',
    sourceWorkbook: 'embedded-smart-sale-ozon-plan',
    sourceSheet: 'GMV DR',
    ozonIuAdsRate: OZON_IU_ADS_RATE,
    months: Object.fromEntries(
      Object.entries(SMART_SALE_OZON_GMV_2026)
        .filter(([key]) => key.startsWith(`${year}-`))
    )
  };
}

function buildWbDailyPlan() {
  const workbookPath = detectWbIuPlanWorkbook();
  if (!workbookPath) {
    return {
      status: 'missing',
      sourceWorkbook: '',
      share: WB_IU_SMART_SHARE,
      rows: 0,
      from: '',
      to: '',
      daily: [],
      monthly: {}
    };
  }

  const workbook = XLSX.readFile(workbookPath, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const rows = sheetName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' }).slice(1)
    : [];
  const daily = [];
  const monthly = {};

  rows.forEach((row) => {
    const date = isoDate(row?.[0]);
    if (!date) return;
    const month = date.slice(0, 7);
    const revenueFactGross = money(row?.[2]);
    const gmvPlanGross = money(row?.[3]);
    const adsFactGross = money(row?.[5]);
    const adsPlanGross = money(row?.[6]);
    if (revenueFactGross <= 0 && gmvPlanGross <= 0 && adsFactGross <= 0 && adsPlanGross <= 0) return;
    const point = {
      date,
      monthKey: month,
      revenueFactGross: roundMoney(revenueFactGross),
      gmvPlanGross: roundMoney(gmvPlanGross),
      adsFactGross: roundMoney(adsFactGross),
      adsPlanGross: roundMoney(adsPlanGross),
      revenueFactOur: roundMoney(revenueFactGross * WB_IU_SMART_SHARE),
      gmvPlanOur: roundMoney(gmvPlanGross * WB_IU_SMART_SHARE),
      adsFactOur: roundMoney(adsFactGross * WB_IU_SMART_SHARE),
      adsPlanOur: roundMoney(adsPlanGross * WB_IU_SMART_SHARE),
      share: WB_IU_SMART_SHARE,
      gmvCompletion: gmvPlanGross > 0 ? roundRate(revenueFactGross / gmvPlanGross) : null,
      adsCompletion: adsPlanGross > 0 ? roundRate(adsFactGross / adsPlanGross) : null
    };
    daily.push(point);
    const bucket = monthly[month] || {
      monthKey: month,
      days: 0,
      from: date,
      to: date,
      revenueFactGross: 0,
      gmvPlanGross: 0,
      adsFactGross: 0,
      adsPlanGross: 0,
      revenueFactOur: 0,
      gmvPlanOur: 0,
      adsFactOur: 0,
      adsPlanOur: 0
    };
    bucket.days += 1;
    bucket.from = date < bucket.from ? date : bucket.from;
    bucket.to = date > bucket.to ? date : bucket.to;
    bucket.revenueFactGross += revenueFactGross;
    bucket.gmvPlanGross += gmvPlanGross;
    bucket.adsFactGross += adsFactGross;
    bucket.adsPlanGross += adsPlanGross;
    bucket.revenueFactOur += revenueFactGross * WB_IU_SMART_SHARE;
    bucket.gmvPlanOur += gmvPlanGross * WB_IU_SMART_SHARE;
    bucket.adsFactOur += adsFactGross * WB_IU_SMART_SHARE;
    bucket.adsPlanOur += adsPlanGross * WB_IU_SMART_SHARE;
    monthly[month] = bucket;
  });

  Object.keys(monthly).forEach((month) => {
    const bucket = monthly[month];
    bucket.revenueFactGross = roundMoney(bucket.revenueFactGross);
    bucket.gmvPlanGross = roundMoney(bucket.gmvPlanGross);
    bucket.adsFactGross = roundMoney(bucket.adsFactGross);
    bucket.adsPlanGross = roundMoney(bucket.adsPlanGross);
    bucket.revenueFactOur = roundMoney(bucket.revenueFactOur);
    bucket.gmvPlanOur = roundMoney(bucket.gmvPlanOur);
    bucket.adsFactOur = roundMoney(bucket.adsFactOur);
    bucket.adsPlanOur = roundMoney(bucket.adsPlanOur);
    bucket.adsPlanRate = bucket.gmvPlanOur > 0 ? bucket.adsPlanOur / bucket.gmvPlanOur : null;
    bucket.gmvCompletion = bucket.gmvPlanOur > 0 ? bucket.revenueFactOur / bucket.gmvPlanOur : null;
    bucket.adsCompletion = bucket.adsPlanOur > 0 ? bucket.adsFactOur / bucket.adsPlanOur : null;
  });

  daily.sort((left, right) => left.date.localeCompare(right.date));
  return {
    status: daily.length ? 'loaded' : 'empty',
    sourceWorkbook: path.basename(workbookPath),
    sourcePath: workbookPath,
    sourceSheet: sheetName || '',
    share: WB_IU_SMART_SHARE,
    rows: daily.length,
    from: daily[0]?.date || '',
    to: daily[daily.length - 1]?.date || '',
    daily,
    monthly
  };
}

function buildPayload(workbookPath, args = {}) {
  const wb = XLSX.readFile(workbookPath);
  const sheetName = selectPlanSheet(wb.SheetNames);
  if (!sheetName) throw new Error('Workbook has no sheets');
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet ${sheetName} not found`);

  const year = detectPlanYear();
  const smartSaleOzonPlan = detectSmartSaleOzonPlan(args['ozon-plan-xlsx'], year);
  const ozonIuAdsRate = smartSaleOzonPlan?.ozonIuAdsRate || OZON_IU_ADS_RATE;
  const legacyColsByMonth = new Map(LEGACY_PLAN_MONTHS.map((month, index) => [month, LEGACY_PLAN_COLS[index]]));
  const monthKeys = new Set([
    ...Object.keys(smartSaleOzonPlan?.months || {}),
    ...LEGACY_PLAN_MONTHS.map((month) => `${year}-${String(month).padStart(2, '0')}`)
  ]);
  const months = {};
  [...monthKeys].sort().forEach((key) => {
    const monthNum = Number(key.slice(5, 7));
    if (!key.startsWith(`${year}-`) || monthNum < IU_START_MONTH) return;
    const col = legacyColsByMonth.get(monthNum);
    const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
    const days = new Date(year, monthNum, 0).getDate();
    const wbRevenue = col ? num(cell(ws, `${col}13`)) : 0;
    const ozonRevenueGross = num(smartSaleOzonPlan?.months?.[monthKey]) || (col ? num(cell(ws, `${col}14`)) : 0);
    const ozonRevenue = ozonRevenueGross * OZON_IU_SMART_SHARE;
    const wbIuAds = col ? num(cell(ws, `${col}26`)) : 0;
    const ozonIuAdsGross = (col ? num(cell(ws, `${col}28`)) : 0) || ozonRevenueGross * ozonIuAdsRate;
    const ozonIuAds = ozonIuAdsGross * OZON_IU_SMART_SHARE;
    const totalRevenue = wbRevenue + ozonRevenue;
    const totalAds = wbIuAds + ozonIuAds;
    const header = col ? cell(ws, `${col}11`) : monthKey;

    months[monthKey] = {
      label: monthLabel(header, year),
      days,
      iuRevenueWb: wbRevenue,
      iuRevenueOzon: ozonRevenue,
      iuRevenueOzonGross: ozonRevenueGross,
      iuRevenueOzonShare: OZON_IU_SMART_SHARE,
      iuRevenueTotal: totalRevenue,
      iuAdsWb: wbIuAds,
      iuAdsOzon: ozonIuAds,
      iuAdsOzonGross: ozonIuAdsGross,
      iuAdsOzonShare: OZON_IU_SMART_SHARE,
      iuAdsTotal: totalAds,
      dailyIuRevenueWb: days > 0 ? wbRevenue / days : 0,
      dailyIuRevenueOzon: days > 0 ? ozonRevenue / days : 0,
      dailyIuRevenueTotal: days > 0 ? totalRevenue / days : 0,
      dailyIuAdsWb: days > 0 ? wbIuAds / days : 0,
      dailyIuAdsOzon: days > 0 ? ozonIuAds / days : 0,
      dailyIuAdsTotal: days > 0 ? totalAds / days : 0
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceWorkbook: path.basename(workbookPath),
    sourceSheet: sheetName,
    planYear: year,
    ozonSourceWorkbook: smartSaleOzonPlan?.sourceWorkbook || '',
    ozonSourceSheet: smartSaleOzonPlan?.sourceSheet || '',
    note: 'IU WB plan comes from the plan workbook. Ozon GMV DR and AR rate come from the two-cabinet Smart-Sale IU plan when available; the portal salary/KPI contour uses the Smart-Sale 40% share. WB daily plan is parsed from the IU WB daily workbook at the marketplace contour without the old 40% reduction.',
    assumptions: {
      ozonIuAdsRate,
      ozonIuSmartShare: OZON_IU_SMART_SHARE,
      wbIuOurShare: WB_IU_SMART_SHARE
    },
    wbDailyPlan: buildWbDailyPlan(),
    months
  };
}

function main() {
  const args = parseArgs(process.argv);
  const workbookPath = detectPlanWorkbook(args['plan-xlsx'] || args._[0]);
  const payload = buildPayload(workbookPath, args);
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Saved ${OUT_PATH}`);
  console.log(`Workbook: ${workbookPath}`);
}

main();
