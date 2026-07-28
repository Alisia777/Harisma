const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const coreStateSource = fs.readFileSync(path.join(ROOT, 'app-core-01.js'), 'utf8');
const coreSyncSource = fs.readFileSync(path.join(ROOT, 'app-core-03.js'), 'utf8');
const coreRuntimeSource = fs.readFileSync(path.join(ROOT, 'app-core-10.js'), 'utf8');

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

async function main() {
  assert.match(
    coreSyncSource,
    /upsertRemote\(TEAM_TABLES\.comments,\s*\(state\.storage\.comments\s*\|\|\s*\[\]\)\.map\(remoteCommentRow\),\s*'id'\)/,
    'full team sync must retry every locally queued comment'
  );

  const runtimeFunctions = [
    sourceBetween(coreStateSource, 'function normalizeComment', 'const EMPTY_OWNER_NAMES'),
    sourceBetween(coreSyncSource, 'function remoteCommentRow', 'function remoteDecisionRow'),
    sourceBetween(coreSyncSource, 'async function upsertRemote', 'async function upsertTaskAttachmentsSafe'),
    sourceBetween(coreSyncSource, 'async function persistComment', 'async function createComment'),
    sourceBetween(coreRuntimeSource, 'async function createComment(payload)', 'async function createTaskHistoryEntry')
  ].join('\n');

  const harness = {
    remoteEnabled: true,
    failRemote: false,
    idCounter: 0,
    order: [],
    remoteRows: [],
    upserts: [],
    errors: [],
    syncBadges: 0
  };
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const url = new URL(request.url, 'http://127.0.0.1');
      const rows = body ? JSON.parse(body) : [];
      harness.order.push('remote-upsert');
      harness.upserts.push({
        method: request.method,
        table: url.pathname.split('/').pop(),
        onConflict: url.searchParams.get('on_conflict'),
        prefer: request.headers.prefer,
        authorization: request.headers.authorization,
        rows
      });
      if (harness.failRemote) {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'temporary network failure' }));
        return;
      }
      rows.forEach((row) => {
        const index = harness.remoteRows.findIndex((item) => item.id === row.id);
        if (index >= 0) harness.remoteRows[index] = structuredClone(row);
        else harness.remoteRows.push(structuredClone(row));
      });
      response.writeHead(201, { 'Content-Type': 'application/json' });
      response.end('[]');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  const state = {
    storage: { comments: [] },
    team: {
      member: { name: 'Анна Пирогова' },
      mode: 'offline',
      note: '',
      lastSyncAt: ''
    }
  };
  const context = vm.createContext({
    Date,
    URL,
    fetch,
    TEAM_TABLES: { comments: 'portal_comments' },
    state,
    stableId: (prefix) => `${prefix}-stable`,
    uid: (prefix) => `${prefix}-${++harness.idCounter}`,
    currentBrand: () => 'ALTEYA',
    teamMemberLabel: () => 'Маркетплейсы',
    hasRemoteStore: () => harness.remoteEnabled,
    teamRestConfig: () => ({
      accessToken: 'test-access-token',
      anonKey: 'test-anon-key',
      baseUrl: `http://127.0.0.1:${serverPort}`
    }),
    withTimeout: (promise) => promise,
    retryTransientSupabase: (operation) => operation(),
    readSupabaseJson: async (response) => {
      const text = await response.text();
      if (!response.ok) {
        const payload = text ? JSON.parse(text) : {};
        throw new Error(payload.message || `HTTP ${response.status}`);
      }
      return text ? JSON.parse(text) : null;
    },
    saveLocalStorage: () => {
      harness.order.push('local-save');
    },
    updateSyncBadge: () => {
      harness.syncBadges += 1;
    },
    fmt: { date: () => '27.07.2026, 12:00' },
    console: {
      error: (error) => {
        harness.errors.push(error?.message || String(error));
      }
    }
  });
  try {
    vm.runInContext(runtimeFunctions, context);

  const workflowText = [
    '[[rating-workflow:v1]]',
    '[[platform:wb]]',
    '[[status:progress]]',
    '[[entry:feedback]]',
    '[[owner:%D0%90%D0%BD%D0%BD%D0%B0%20%D0%9F%D0%B8%D1%80%D0%BE%D0%B3%D0%BE%D0%B2%D0%B0]]',
    '[[due:2026-08-01]]',
    'Проверить карточку и ответить команде.'
  ].join('');

  const saved = await context.createComment({
    articleKey: 'WB-ARTICLE-1',
    author: 'Анна Пирогова',
    team: 'Маркетплейсы',
    type: 'rating_workflow',
    text: workflowText
  });

  assert.equal(state.storage.comments.length, 1, 'comment must be saved locally first');
  assert.equal(state.storage.comments[0].id, saved.id);
  assert.deepEqual(harness.order, ['local-save', 'remote-upsert'], 'local save must precede remote send');
  assert.equal(harness.upserts.length, 1);
  assert.equal(harness.upserts[0].table, 'portal_comments');
  assert.equal(harness.upserts[0].method, 'POST');
  assert.equal(harness.upserts[0].onConflict, 'id');
  assert.equal(harness.upserts[0].prefer, 'resolution=merge-duplicates,return=minimal');
  assert.equal(harness.upserts[0].authorization, 'Bearer test-access-token');
  assert.equal(harness.remoteRows.length, 1, 'comment must reach the remote comments table');
  assert.deepEqual(
    {
      brand: harness.remoteRows[0].brand,
      articleKey: harness.remoteRows[0].article_key,
      author: harness.remoteRows[0].author,
      team: harness.remoteRows[0].team,
      type: harness.remoteRows[0].type,
      text: harness.remoteRows[0].text
    },
    {
      brand: 'ALTEYA',
      articleKey: 'WB-ARTICLE-1',
      author: 'Анна Пирогова',
      team: 'Маркетплейсы',
      type: 'rating_workflow',
      text: workflowText
    }
  );
  assert.equal(state.team.mode, 'ready');
  assert.match(state.team.note, /Комментарий синхронизирован/);
  assert.ok(state.team.lastSyncAt, 'successful remote save must update the sync timestamp');
  assert.equal(harness.syncBadges, 1);

  const restoredForCoworker = context.fromRemoteComment(harness.remoteRows[0]);
  assert.deepEqual(
    {
      id: restoredForCoworker.id,
      articleKey: restoredForCoworker.articleKey,
      type: restoredForCoworker.type,
      text: restoredForCoworker.text
    },
    {
      id: saved.id,
      articleKey: 'WB-ARTICLE-1',
      type: 'rating_workflow',
      text: workflowText
    },
    'another employee must receive the same workflow comment after sync'
  );

  harness.failRemote = true;
  harness.order.length = 0;
  const queued = await context.createComment({
    articleKey: 'OZON-ARTICLE-2',
    author: 'Екатерина Доможирова',
    team: 'Маркетплейсы',
    type: 'rating_workflow',
    text: '[[rating-workflow:v1]][[platform:ozon]][[status:new]][[entry:comment]][[owner:]][[due:]]Проверить источник данных.'
  });
  assert.equal(state.storage.comments.length, 2, 'a temporary remote failure must not lose the local comment');
  assert.equal(state.storage.comments[0].id, queued.id);
  assert.deepEqual(harness.order, ['local-save', 'remote-upsert']);
  assert.equal(harness.remoteRows.length, 1, 'failed remote save must not create a partial row');
  assert.deepEqual(harness.errors, ['temporary network failure']);

  harness.failRemote = false;
  await context.persistComment(queued);
  assert.equal(harness.remoteRows.length, 2, 'queued comment must be persistable after connection recovery');
  const restoredQueued = context.fromRemoteComment(
    harness.remoteRows.find((row) => row.id === queued.id)
  );
  assert.equal(restoredQueued.articleKey, 'OZON-ARTICLE-2');
  assert.match(restoredQueued.text, /Проверить источник данных/);

    console.log('portal rating workflow persistence selftest: ok');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
