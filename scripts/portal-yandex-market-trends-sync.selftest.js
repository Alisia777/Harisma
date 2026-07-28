#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { unzipArchive, yandexRequest } = require('./portal-yandex-market-trends-sync.js');

function crc32(buffer) {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }

  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime() {
  const year = 2026;
  const month = 1;
  const day = 1;
  return {
    time: 0,
    date: ((year - 1980) << 9) | (month << 5) | day
  };
}

function writeStoredZip(zipPath, entryName, content) {
  const name = Buffer.from(entryName, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const checksum = crc32(data);
  const stamp = dosDateTime();

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034B50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(stamp.time, 10);
  local.writeUInt16LE(stamp.date, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014B50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(stamp.time, 12);
  central.writeUInt16LE(stamp.date, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);

  const centralOffset = local.length + name.length + data.length;
  const centralSize = central.length + name.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054B50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([local, name, data, central, name, eocd]));
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'altea-ym-unzip-selftest-'));
try {
  const zipPath = path.join(tmpDir, 'report.zip');
  const outputDir = path.join(tmpDir, 'out');
  writeStoredZip(zipPath, 'nested/report.json', '{"ok":true}\n');

  unzipArchive(zipPath, outputDir);

  assert.strictEqual(fs.readFileSync(path.join(outputDir, 'nested', 'report.json'), 'utf8'), '{"ok":true}\n');
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

async function assertTransportRetry() {
  const originalFetch = global.fetch;
  let calls = 0;
  try {
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return {
        ok: true,
        status: 200,
        text: async () => '{"campaigns":[]}'
      };
    };
    const payload = await yandexRequest({
      apiBaseUrl: 'https://api.partner.market.yandex.ru',
      apiKey: 'test',
      rateLimitAttempts: 3,
      requestRetryDelayMs: 0
    }, '/v2/campaigns');
    assert.deepStrictEqual(payload, { campaigns: [] });
    assert.strictEqual(calls, 2, 'transport failure must be retried');
  } finally {
    global.fetch = originalFetch;
  }
}

assertTransportRetry()
  .then(() => console.log('portal-yandex-market-trends-sync selftest ok'))
  .catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
