const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PLATFORM_TRENDS_PATH = path.join(DATA_DIR, 'platform_trends.json');
const OUT_PATH = path.join(DATA_DIR, 'iu_plan.json');
const OZON_IU_ADS_RATE = 0.25;

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pickNewest(files) {
  return files
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(ROOT, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.name || null;
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

function monthLabel(header, year) {
  const text = String(header || '').trim();
  return text ? `${text} ${year}` : `${year}`;
}

function buildPayload(workbookPath) {
  const wb = XLSX.readFile(workbookPath);
  const sheetName = wb.SheetNames.find((name) => String(name).startsWith('01_')) || wb.SheetNames[0];
  if (!sheetName) throw new Error('Workbook has no sheets');
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`Sheet ${sheetName} not found`);

  const year = detectPlanYear();
  const monthNumbers = [5, 6, 7, 8, 9, 10, 11, 12];
  const monthCols = ['H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'];

  const months = {};
  monthCols.forEach((col, idx) => {
    const monthNum = monthNumbers[idx];
    const key = `${year}-${String(monthNum).padStart(2, '0')}`;
    const days = new Date(year, monthNum, 0).getDate();
    const wbRevenue = num(cell(ws, `${col}13`));
    const ozonRevenue = num(cell(ws, `${col}14`));
    const wbIuAds = num(cell(ws, `${col}26`));
    const ozonIuAds = ozonRevenue * OZON_IU_ADS_RATE;
    const totalRevenue = wbRevenue + ozonRevenue;
    const totalAds = wbIuAds + ozonIuAds;
    const header = cell(ws, `${col}11`);

    months[key] = {
      label: monthLabel(header, year),
      days,
      iuRevenueWb: wbRevenue,
      iuRevenueOzon: ozonRevenue,
      iuRevenueTotal: totalRevenue,
      iuAdsWb: wbIuAds,
      iuAdsOzon: ozonIuAds,
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
    note: 'IU WB+Ozon revenue plan from Plan workbook. Ozon IU ad plan is fixed at 25% of Ozon revenue.',
    assumptions: {
      ozonIuAdsRate: OZON_IU_ADS_RATE
    },
    months
  };
}

function main() {
  const workbookPath = detectPlanWorkbook(process.argv[2]);
  const payload = buildPayload(workbookPath);
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Saved ${OUT_PATH}`);
  console.log(`Workbook: ${workbookPath}`);
}

main();
