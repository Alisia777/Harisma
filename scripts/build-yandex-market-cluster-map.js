#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findDefaultInput() {
  const explicit = normalizeText(process.env.ALTEA_YM_CLUSTER_MAP_XLSX);
  if (explicit) return explicit;

  const folder = path.join(os.homedir(), 'Downloads', 'Telegram Desktop');
  try {
    const candidates = fs.readdirSync(folder)
      .filter((name) => /\.xlsx$/i.test(name) && /Excel\s*\(9\)/i.test(name))
      .map((name) => path.join(folder, name))
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    return candidates[0] || '';
  } catch {
    return '';
  }
}

function cellText(sheet, rowIndex, columnIndex) {
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  return normalizeText(sheet[address]?.v);
}

function readClusterMap(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) throw new Error(`No readable sheet in ${filePath}`);

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const clusters = [];
  const warehouseAliases = [];

  for (let col = range.s.c + 1; col <= range.e.c; col += 1) {
    const cluster = cellText(sheet, range.s.r, col);
    if (!cluster) continue;
    const warehouses = [];
    const seen = new Set();

    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
      const name = cellText(sheet, row, col);
      if (!name) continue;
      const key = normalizeKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const item = {
        warehouseId: null,
        name,
        normalizedName: key
      };
      warehouses.push(item);
      warehouseAliases.push({
        cluster,
        warehouseId: null,
        name,
        normalizedName: key
      });
    }

    clusters.push({ cluster, warehouses });
  }

  const firstColumnHeader = cellText(sheet, range.s.r, range.s.c);
  return {
    schema: 'portal-yandex-market-cluster-map-v1',
    generatedAt: new Date().toISOString(),
    source: {
      filePath,
      sheetName,
      firstColumnHeader,
      columns: range.e.c - range.s.c + 1,
      rows: range.e.r - range.s.r + 1
    },
    clusters,
    warehouseAliases,
    diagnostics: {
      clusterCount: clusters.length,
      warehouseAliasCount: warehouseAliases.length,
      unresolvedWarehouseIds: warehouseAliases.length
    }
  };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const rootDir = path.resolve(__dirname, '..');
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input || findDefaultInput());
  const outputPath = path.resolve(args.output || path.join(rootDir, 'data', 'yandex_market_cluster_map.json'));

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error('Yandex Market cluster map XLSX not found. Pass --input or set ALTEA_YM_CLUSTER_MAP_XLSX.');
  }

  const payload = readClusterMap(inputPath);
  writeJson(outputPath, payload);
  console.log(JSON.stringify({
    outputPath,
    clusters: payload.diagnostics.clusterCount,
    warehouseAliases: payload.diagnostics.warehouseAliasCount,
    source: inputPath
  }, null, 2));
}

main();
