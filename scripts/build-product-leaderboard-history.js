const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_ROOT = path.join(ROOT, '.altea-google-sheet-sync-output', 'history');
const CURRENT_PATH = path.join(DATA_DIR, 'product_leaderboard.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'product_leaderboard_history.json');

function walk(dir, visit) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, visit);
      return;
    }
    visit(full);
  });
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function payloadStamp(payload, fallbackPath = '') {
  const candidates = [
    payload?.generatedAt,
    payload?.updatedAt,
    payload?.updated_at
  ].filter(Boolean);

  for (const candidate of candidates) {
    const stamp = Date.parse(String(candidate));
    if (Number.isFinite(stamp)) return stamp;
  }

  const match = fallbackPath.replace(/\\/g, '/').match(/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return 0;
  return Date.parse(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`) || 0;
}

function collectSnapshots() {
  const snapshots = [];

  walk(HISTORY_ROOT, (filePath) => {
    if (path.basename(filePath) !== 'product_leaderboard.json') return;
    const payload = readJsonSafe(filePath);
    if (!payload || !Array.isArray(payload.items)) return;
    snapshots.push({
      ...payload,
      __path: filePath,
      __stamp: payloadStamp(payload, filePath)
    });
  });

  const current = readJsonSafe(CURRENT_PATH);
  if (current && Array.isArray(current.items)) {
    snapshots.push({
      ...current,
      __path: CURRENT_PATH,
      __stamp: payloadStamp(current, CURRENT_PATH)
    });
  }

  const deduped = new Map();
  snapshots.forEach((payload) => {
    const key = `${payload.generatedAt || ''}|${payload.weekLabel || ''}|${payload.items.length}`;
    const existing = deduped.get(key);
    if (!existing || payload.__stamp >= existing.__stamp) deduped.set(key, payload);
  });

  return [...deduped.values()]
    .sort((left, right) => left.__stamp - right.__stamp)
    .map((payload) => ({
      generatedAt: payload.generatedAt || '',
      weekLabel: payload.weekLabel || payload.sourceSheetName || '',
      sourceSheetName: payload.sourceSheetName || '',
      sourceGid: payload.sourceGid || '',
      sourceWeekFrom: payload.sourceWeekFrom || '',
      sourceWeekTo: payload.sourceWeekTo || '',
      sourceLagDays: payload.sourceLagDays ?? null,
      freshnessStatus: payload.freshnessStatus || '',
      freshnessNote: payload.freshnessNote || '',
      sourceFile: path.relative(ROOT, payload.__path).replace(/\\/g, '/'),
      alertCounts: payload.alertCounts || {},
      totals: payload.totals || {},
      summary: payload.summary || {},
      items: payload.items || [],
      unmatchedItems: payload.unmatchedItems || []
    }));
}

function main() {
  const history = collectSnapshots();
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
  console.log(`leaderboard history: ${history.length} snapshots -> ${path.relative(ROOT, OUTPUT_PATH)}`);
}

main();
