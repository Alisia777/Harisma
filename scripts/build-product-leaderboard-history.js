const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const CURRENT_PATH = path.join(DATA_DIR, 'product_leaderboard.json');
const OUTPUT_PATH = path.join(DATA_DIR, 'product_leaderboard_history.json');

function uniqueExistingPaths(paths) {
  const seen = new Set();
  return paths
    .map((item) => path.resolve(item))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return fs.existsSync(item);
    });
}

const HISTORY_ROOTS = uniqueExistingPaths([
  path.join(ROOT, '.altea-google-sheet-sync-output', 'history'),
  path.join(ROOT, '..', '.altea-google-sheet-sync-output', 'history')
]);

const HISTORY_FILES = uniqueExistingPaths([
  OUTPUT_PATH,
  path.join(DATA_DIR, 'last_good', 'product_leaderboard_history.json'),
  path.join(ROOT, '.altea-google-sheet-sync-output', 'product_leaderboard_history.json'),
  path.join(ROOT, '..', 'data', 'product_leaderboard_history.json'),
  path.join(ROOT, '..', 'data', 'last_good', 'product_leaderboard_history.json'),
  path.join(ROOT, '..', '.altea-google-sheet-sync-output', 'product_leaderboard_history.json')
]);

const CURRENT_FILES = uniqueExistingPaths([
  CURRENT_PATH,
  path.join(ROOT, '.altea-google-sheet-sync-output', 'product_leaderboard.json'),
  path.join(ROOT, '..', 'data', 'product_leaderboard.json'),
  path.join(ROOT, '..', '.altea-google-sheet-sync-output', 'product_leaderboard.json')
]);

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

function dateKey(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (ru) {
    return `${ru[3]}-${String(ru[2]).padStart(2, '0')}-${String(ru[1]).padStart(2, '0')}`;
  }
  const stamp = Date.parse(text);
  if (!Number.isFinite(stamp)) return '';
  return new Date(stamp).toISOString().slice(0, 10);
}

function weekRangeFromLabel(label = '') {
  const match = String(label || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  const from = dateKey(`${match[1]}.${match[2]}.${match[3]}`);
  const to = dateKey(`${match[4]}.${match[5]}.${match[6]}`);
  if (!from || !to) return null;
  return { from, to };
}

function snapshotWeekIdentity(payload = {}) {
  const from = dateKey(payload.sourceWeekFrom);
  const to = dateKey(payload.sourceWeekTo);
  const labelRange = weekRangeFromLabel(payload.weekLabel || payload.sourceSheetName || '');
  const range = from && to ? { from, to } : labelRange;
  if (range?.from && range?.to) {
    return {
      key: `${range.from}_${range.to}`,
      startStamp: Date.parse(`${range.from}T00:00:00Z`) || 0
    };
  }

  const fallback = String(payload.weekLabel || payload.sourceSheetName || payload.generatedAt || payload.__path || '').trim();
  return {
    key: fallback || `snapshot_${payload.__stamp || 0}`,
    startStamp: payload.__stamp || 0
  };
}

function collectSnapshots() {
  const snapshots = [];
  const addPayload = (payload, filePath) => {
    if (!payload || !Array.isArray(payload.items)) return;
    snapshots.push({
      ...payload,
      __path: filePath,
      __stamp: payloadStamp(payload, filePath)
    });
  };

  HISTORY_ROOTS.forEach((historyRoot) => {
    walk(historyRoot, (filePath) => {
      if (path.basename(filePath) !== 'product_leaderboard.json') return;
      addPayload(readJsonSafe(filePath), filePath);
    });
  });

  HISTORY_FILES.forEach((filePath) => {
    const payload = readJsonSafe(filePath);
    if (!Array.isArray(payload)) return;
    payload.forEach((snapshot) => {
      addPayload(snapshot, filePath);
    });
  });

  CURRENT_FILES.forEach((filePath) => {
    addPayload(readJsonSafe(filePath), filePath);
  });

  const deduped = new Map();
  snapshots.forEach((payload) => {
    const key = `${payload.generatedAt || ''}|${payload.weekLabel || ''}|${payload.items.length}`;
    const existing = deduped.get(key);
    if (!existing || payload.__stamp >= existing.__stamp) deduped.set(key, payload);
  });

  const byWeek = new Map();
  [...deduped.values()].forEach((payload) => {
    const identity = snapshotWeekIdentity(payload);
    const existing = byWeek.get(identity.key);
    const nextPayload = {
      ...payload,
      __weekKey: identity.key,
      __weekStart: identity.startStamp
    };
    if (!existing || nextPayload.__stamp >= existing.__stamp) {
      byWeek.set(identity.key, nextPayload);
    }
  });

  const weeklySnapshots = [...byWeek.values()]
    .sort((left, right) => {
      const leftStart = left.__weekStart || left.__stamp || 0;
      const rightStart = right.__weekStart || right.__stamp || 0;
      if (leftStart !== rightStart) return leftStart - rightStart;
      return (left.__stamp || 0) - (right.__stamp || 0);
    })
    .slice(-12);

  if (weeklySnapshots.length < 8) {
    console.warn(`leaderboard history warning: only ${weeklySnapshots.length} immutable weekly snapshots, need at least 8`);
  }

  return weeklySnapshots
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
