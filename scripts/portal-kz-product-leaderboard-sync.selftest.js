#!/usr/bin/env node

const assert = require('assert');
const crypto = require('crypto');
const {
  fetchWorkbookWithServiceAccount,
  selectLatestWeekSheet,
  spreadsheetIdFromUrl
} = require('./portal-kz-product-leaderboard-sync');

async function main() {
  assert.strictEqual(
    spreadsheetIdFromUrl('https://docs.google.com/spreadsheets/d/sheet-id/edit?gid=1'),
    'sheet-id'
  );
  assert.strictEqual(selectLatestWeekSheet({
    SheetNames: [
      '06.07.2026 - 12.07.2026',
      '20.07.2026 - 26.07.2026',
      '13.07.2026 - 19.07.2026'
    ]
  }), '20.07.2026 - 26.07.2026');

  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccount = {
    client_email: 'portal-test@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' })
  };
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        json: async () => ({ access_token: 'test-access-token' })
      };
    }
    return {
      ok: true,
      arrayBuffer: async () => Uint8Array.from(Buffer.from('PK-test-workbook')).buffer
    };
  };

  try {
    const bytes = await fetchWorkbookWithServiceAccount({
      sourceUrl: 'https://docs.google.com/spreadsheets/d/private-sheet-id/edit'
    }, serviceAccount);
    assert.strictEqual(bytes.slice(0, 2).toString('utf8'), 'PK');
    assert.strictEqual(calls.length, 2);
    assert.match(calls[1].url, /drive\/v3\/files\/private-sheet-id\/export/);
    assert.strictEqual(calls[1].options.headers.Authorization, 'Bearer test-access-token');
  } finally {
    global.fetch = originalFetch;
  }

  console.log('portal-kz-product-leaderboard-sync selftest ok');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
