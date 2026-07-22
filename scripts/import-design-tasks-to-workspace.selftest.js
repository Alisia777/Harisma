#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { buildProjects, mergeIntoPayload, syncWorkspace } = require('./import-design-tasks-to-workspace');

const snapshot = {
  schema: 'altea-design-task-sheet-v1',
  capturedAt: '2026-07-22T12:00:00.000Z',
  source: { spreadsheetId: 'sheet-test', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-test/edit' },
  sheets: {
    marketplaces: { values: [
      ['Задачи', 'Категория', 'Статус', 'Постановщик', '', 'Бренд', 'ТЗ', 'Тип', 'Количество'],
      ['Карточка до 22.07.2026', 'WB', 'Анастасия К.', 'Мария', '', 'Алтея', 'https://example.com/brief', 'АБ-тест', '4']
    ] },
    designers: { values: [
      ['Анастасия К.'],
      ['Карточка до 22.07.2026', 'WB', 'Анастасия К.', 'Мария', 'Алтея', 'ТЗ', 'АБ-тест', 'готово'],
      ['Отдельная задача']
    ] },
    separate: { values: [
      ['Анастасия К.', 'Дарья Н.'],
      ['Карточка до 22.07.2026', 'Новая задача из персонального плана']
    ] }
  }
};

async function run() {
  const projects = buildProjects(snapshot);
  assert.strictEqual(projects.length, 3, 'Duplicate rows must collapse while unique rows from the personal plan are preserved');
  const card = projects.find((project) => project.title === 'Карточка до 22.07.2026');
  const separate = projects.find((project) => project.title === 'Отдельная задача');
  const personalPlan = projects.find((project) => project.title === 'Новая задача из персонального плана');
  assert.ok(card && separate && personalPlan, 'Structured and both supplemental task sources must be imported');
  assert.strictEqual(card.status, 'done', 'Personal status must enrich the summary row');
  assert.strictEqual(card.dueDate, '2026-07-22');
  assert.strictEqual(card.owner, 'Анастасия К.');
  assert.strictEqual(card.marketplace, 'WB');
  assert.strictEqual(card.url, 'https://example.com/brief');
  assert.match(card.brief, /Постановщик: Мария/);
  assert.strictEqual(separate.owner, 'Анастасия К.');
  assert.strictEqual(personalPlan.owner, 'Дарья Н.');

  const firstMerge = mergeIntoPayload({ projects: [], tests: [], pages: [], activity: [], settings: {} }, projects, '2026-07-22T13:00:00.000Z');
  assert.deepStrictEqual(firstMerge.summary, { input: 3, created: 3, updated: 0, unchanged: 0 });
  const secondMerge = mergeIntoPayload(firstMerge.payload, projects, '2026-07-22T14:00:00.000Z');
  assert.deepStrictEqual(secondMerge.summary, { input: 3, created: 0, updated: 0, unchanged: 3 });

  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
    if (url.pathname.endsWith('/portal_design_workspaces') && !options.method) {
      return new Response(JSON.stringify([{ brand: 'Алтея', payload: { projects: [], tests: [], pages: [], activity: [], settings: {} }, payload_hash: 'old', revision: 3, updated_at: '2026-07-22T10:00:00.000Z', updated_by: null }]), { status: 200 });
    }
    if (url.pathname.endsWith('/portal_design_workspaces') && options.method === 'PATCH') {
      return new Response(JSON.stringify([{ revision: 4 }]), { status: 200 });
    }
    return new Response(null, { status: 204 });
  };
  const summary = await syncWorkspace({
    fetchImpl,
    config: { supabaseUrl: 'https://supabase.test', serviceRoleKey: 'secret', brand: 'Алтея' },
    snapshot,
    now: '2026-07-22T15:00:00.000Z'
  });
  assert.deepStrictEqual(summary, { input: 3, created: 3, updated: 0, unchanged: 0, revisionBefore: 3, revisionAfter: 4 });
  const patch = calls.find((call) => call.method === 'PATCH');
  assert.ok(patch && patch.body.payload.projects.length === 3, 'Workspace PATCH must preserve all imported projects');
  assert.ok(calls.some((call) => call.url.includes('portal_design_workspace_history')), 'Import must preserve server history');
  assert.ok(calls.some((call) => call.url.includes('portal_design_workspace_audit')), 'Import must write a durable audit row');
  console.log('import-design-tasks-to-workspace.selftest: ok');
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
