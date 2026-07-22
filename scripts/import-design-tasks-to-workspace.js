#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_SUPABASE_URL = 'https://iyckwryrucqrxwlowxow.supabase.co';
const DEFAULT_BRAND = 'Алтея';
const DEFAULT_INPUT = path.resolve(__dirname, '..', 'data', 'design_tasks_week_2026-07-20.json');

function text(value) {
  return String(value == null ? '' : value).replace(/\r/g, '').trim();
}

function normalizeKey(value) {
  return text(value).toLowerCase().replace(/ё/g, 'е').replace(/[“”«»"']/g, '').replace(/[^a-zа-я0-9]+/g, ' ').trim();
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function unique(values) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function firstUrl(values) {
  const joined = values.map(text).filter(Boolean).join('\n');
  const match = joined.match(/https?:\/\/[^\s]+/i);
  return match ? match[0].replace(/[),.;]+$/, '') : '';
}

function cleanTitle(value) {
  return text(value).replace(/^["“”«»]+/, '').trim();
}

function dateFromText(value) {
  const match = text(value).match(/(?:до\s+)?(\d{1,2})[./-](\d{1,2})[./-](\d{4})/i);
  if (!match) return '';
  return `${match[3]}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
}

function projectType(value) {
  const token = normalizeKey(value);
  if (token.includes('рич')) return 'rich';
  if (token.includes('фото') || token.includes('ретуш')) return 'photo';
  if (token.includes('бренд')) return 'brand';
  if (token.includes('презентац')) return 'presentation';
  return token ? 'card' : 'other';
}

function projectStatus(owner, notes) {
  const ownerKey = normalizeKey(owner);
  const noteKey = normalizeKey(notes);
  if (noteKey.includes('готово') || noteKey.includes('заверш')) return 'done';
  if (ownerKey === 'backlog' || noteKey.includes('backlog') || (noteKey.includes('перенесли') && noteKey.includes('след недел'))) return 'inbox';
  if (noteKey.includes('ревью') || noteKey.includes('провер')) return 'review';
  return 'production';
}

function projectPriority(values) {
  const key = normalizeKey(values.join(' '));
  if (key.includes('приоритет 1') || key.includes('1 приоритет') || key.includes('срочно') || key.includes('оперативно')) return 'high';
  if (key.includes('низкий приоритет')) return 'low';
  return 'normal';
}

function detailLine(label, value) {
  const normalized = text(value);
  return normalized ? `${label}: ${normalized}` : '';
}

function projectIdentity(project) {
  return [project.title, project.owner, project.tags.find((tag) => /^Бренд:/.test(tag)) || '', project.marketplace]
    .map(normalizeKey).join('|');
}

function projectFallbackIdentity(project) {
  return [project.title, project.owner].map(normalizeKey).join('|');
}

function finalizeProject(raw, capturedAt, sourceUrl) {
  const title = cleanTitle(raw.title);
  const owner = normalizeKey(raw.owner) === 'backlog' ? '' : text(raw.owner);
  const brand = text(raw.brand);
  const marketplace = text(raw.marketplace);
  const taskType = text(raw.taskType);
  const notes = unique(raw.notes || []);
  const sourceIdentity = [title, owner, brand, marketplace].map(normalizeKey).join('|');
  const sourceKey = `google-sheet:${shortHash(sourceIdentity)}`;
  const briefLines = unique([
    detailLine('Постановщик', raw.requester),
    detailLine('Бренд', brand),
    detailLine('Тип задачи', taskType),
    detailLine('Количество', raw.quantity),
    detailLine('ТЗ', raw.brief),
    notes.length ? `Комментарии: ${notes.join('\n')}` : '',
    detailLine('Источник', sourceUrl)
  ]);
  const combinedNotes = [raw.state, raw.brief].concat(notes).join(' ');
  return {
    id: `design-sheet-${shortHash(sourceKey)}`,
    title,
    type: projectType(taskType || title),
    status: projectStatus(raw.owner, combinedNotes),
    owner,
    dueDate: dateFromText([title, raw.brief].concat(notes).join(' ')),
    priority: projectPriority([title, taskType].concat(notes)),
    marketplace,
    brief: briefLines.join('\n'),
    url: firstUrl([raw.brief].concat(notes)),
    tags: unique([brand ? `Бренд: ${brand}` : '', taskType, raw.requester ? `Постановщик: ${text(raw.requester)}` : '']),
    archived: false,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    source: 'google-sheet-designers',
    sourceKey
  };
}

function mergeIncomingProject(primary, supplemental) {
  const merged = { ...primary };
  if (!merged.marketplace && supplemental.marketplace) merged.marketplace = supplemental.marketplace;
  if (!merged.owner && supplemental.owner) merged.owner = supplemental.owner;
  if (!merged.dueDate && supplemental.dueDate) merged.dueDate = supplemental.dueDate;
  if (!merged.url && supplemental.url) merged.url = supplemental.url;
  if (supplemental.status === 'done') merged.status = 'done';
  if (supplemental.status === 'inbox' && primary.status !== 'done') merged.status = 'inbox';
  if (supplemental.priority === 'high') merged.priority = 'high';
  merged.tags = unique([].concat(primary.tags || [], supplemental.tags || []));
  if (supplemental.brief && !primary.brief.includes(supplemental.brief)) merged.brief = unique([primary.brief, supplemental.brief]).join('\n');
  return merged;
}

function buildProjects(snapshot) {
  const sourceUrl = text(snapshot && snapshot.source && snapshot.source.spreadsheetUrl);
  const capturedAt = text(snapshot && snapshot.capturedAt) || new Date().toISOString();
  const marketplaceRows = snapshot && snapshot.sheets && snapshot.sheets.marketplaces && snapshot.sheets.marketplaces.values || [];
  const designerRows = snapshot && snapshot.sheets && snapshot.sheets.designers && snapshot.sheets.designers.values || [];
  const separateRows = snapshot && snapshot.sheets && snapshot.sheets.separate && snapshot.sheets.separate.values || [];
  const projects = [];

  marketplaceRows.slice(1).forEach((row) => {
    if (!cleanTitle(row[0])) return;
    projects.push(finalizeProject({
      title: row[0], marketplace: row[1], owner: row[2], requester: row[3], brand: row[5], brief: row[6],
      taskType: row[7], quantity: row[8], notes: row.slice(9), state: row[2]
    }, capturedAt, sourceUrl));
  });

  let currentOwner = '';
  designerRows.forEach((row) => {
    const title = cleanTitle(row[0]);
    if (!title) return;
    if (row.length === 1 && /^[А-ЯЁ][а-яё-]+\s+[А-ЯЁ]\.$/.test(title)) {
      currentOwner = title;
      return;
    }
    projects.push(finalizeProject({
      title, marketplace: row[1], owner: row[2] || currentOwner, requester: row[3], brand: row[4], brief: row[5],
      taskType: row[6], quantity: '', notes: row.slice(7), state: row[7]
    }, capturedAt, sourceUrl));
  });

  const separateOwners = (separateRows[0] || []).slice(0, 4).map(text);
  separateRows.slice(1).forEach((row) => {
    separateOwners.forEach((owner, column) => {
      const originalCell = cleanTitle(row[column]);
      const cellParts = originalCell.split(/\n\s*\n/).map(text).filter(Boolean);
      const originalTitle = cellParts.shift() || '';
      if (!owner || !originalTitle) return;
      const title = originalTitle
        .replace(/^\(перенесли[^)]*\)\s*/i, '')
        .replace(/^задача от Александра Летшова\s+/i, '');
      projects.push(finalizeProject({
        title, owner, notes: ['Персональный план дизайнера'].concat(title === originalTitle ? [] : [originalTitle], cellParts),
        state: originalCell
      }, capturedAt, sourceUrl));
    });
  });

  const deduplicated = [];
  const exact = new Map();
  const fallback = new Map();
  projects.forEach((project) => {
    const key = projectIdentity(project);
    const looseKey = projectFallbackIdentity(project);
    const looseCandidates = fallback.get(looseKey) || [];
    const previous = exact.get(key) || (looseCandidates.length === 1 ? looseCandidates[0] : null);
    if (previous) {
      const merged = mergeIncomingProject(previous, project);
      const index = deduplicated.indexOf(previous);
      exact.set(projectIdentity(merged), merged);
      const candidates = fallback.get(projectFallbackIdentity(merged)) || [];
      const candidateIndex = candidates.indexOf(previous);
      if (candidateIndex >= 0) candidates[candidateIndex] = merged;
      fallback.set(projectFallbackIdentity(merged), candidates);
      if (index >= 0) deduplicated[index] = merged;
      return;
    }
    deduplicated.push(project);
    exact.set(key, project);
    fallback.set(looseKey, looseCandidates.concat(project));
  });
  return deduplicated.sort((a, b) => a.owner.localeCompare(b.owner, 'ru') || a.title.localeCompare(b.title, 'ru'));
}

function comparableProject(project) {
  const copy = { ...project };
  delete copy.id;
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy;
}

function mergeIntoPayload(rawPayload, incoming, now) {
  const payload = rawPayload && typeof rawPayload === 'object' ? JSON.parse(JSON.stringify(rawPayload)) : {};
  payload.schema = 'altea-design-workspace-v1';
  payload.version = 1;
  payload.projects = Array.isArray(payload.projects) ? payload.projects : [];
  payload.tests = Array.isArray(payload.tests) ? payload.tests : [];
  payload.pages = Array.isArray(payload.pages) ? payload.pages : [];
  payload.activity = Array.isArray(payload.activity) ? payload.activity : [];
  payload.settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : { departmentName: 'Дизайн-отдел', defaultView: 'board' };
  const bySource = new Map(payload.projects.map((project) => [text(project.sourceKey), project]).filter(([key]) => key));
  const byFallback = new Map(payload.projects.map((project) => [projectFallbackIdentity(project), project]));
  const summary = { input: incoming.length, created: 0, updated: 0, unchanged: 0 };

  incoming.forEach((project) => {
    const existing = bySource.get(project.sourceKey) || byFallback.get(projectFallbackIdentity(project));
    if (!existing) {
      const created = { ...project, createdAt: now, updatedAt: now };
      payload.projects.push(created);
      bySource.set(created.sourceKey, created);
      byFallback.set(projectFallbackIdentity(created), created);
      summary.created += 1;
      return;
    }
    const next = { ...existing, ...project, id: existing.id || project.id, createdAt: existing.createdAt || now, archived: existing.archived === true, updatedAt: existing.updatedAt || now };
    if (JSON.stringify(comparableProject(existing)) === JSON.stringify(comparableProject(next))) {
      summary.unchanged += 1;
      return;
    }
    next.updatedAt = now;
    Object.assign(existing, next);
    summary.updated += 1;
  });

  if (summary.created || summary.updated) {
    payload.updatedAt = now;
    payload.activity.unshift({
      id: `design-event-google-sheet-${Date.now()}`,
      action: 'project.import.google_sheet',
      summary: `Импорт задач дизайнеров: создано ${summary.created}, обновлено ${summary.updated}, без изменений ${summary.unchanged}`,
      entityType: 'project', entityId: '', actor: 'Автоматический импорт Google Sheet', createdAt: now
    });
    payload.activity = payload.activity.slice(0, 500);
  }
  return { payload, summary };
}

function configFromEnv(env = process.env) {
  const supabaseUrl = text(env.SUPABASE_URL || env.ALTEA_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
  const serviceRoleKey = text(env.SUPABASE_SERVICE_ROLE_KEY || env.ALTEA_SUPABASE_SERVICE_ROLE_KEY);
  const brand = text(env.ALTEA_DESIGN_WORKSPACE_BRAND || DEFAULT_BRAND);
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required.');
  return { supabaseUrl, serviceRoleKey, brand };
}

function headers(config, prefer) {
  const result = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}`, 'Content-Type': 'application/json' };
  if (prefer) result.Prefer = prefer;
  return result;
}

async function requestJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  const body = await response.text();
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  return body ? JSON.parse(body) : null;
}

async function insertRow(fetchImpl, config, table, row, prefer) {
  const url = `${config.supabaseUrl}/rest/v1/${table}`;
  return requestJson(fetchImpl, url, { method: 'POST', headers: headers(config, prefer || 'return=minimal'), body: JSON.stringify(row) }, table);
}

async function syncWorkspace(options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  const config = options.config || configFromEnv(options.env || process.env);
  const snapshot = options.snapshot || JSON.parse(fs.readFileSync(options.input || DEFAULT_INPUT, 'utf8'));
  const now = options.now || new Date().toISOString();
  const incoming = buildProjects(snapshot);
  const query = new URLSearchParams({ select: 'brand,payload,payload_hash,revision,updated_at,updated_by', brand: `eq.${config.brand}`, limit: '1' });
  const rows = await requestJson(fetchImpl, `${config.supabaseUrl}/rest/v1/portal_design_workspaces?${query}`, { headers: headers(config) }, 'Workspace load');
  const current = Array.isArray(rows) && rows[0] ? rows[0] : null;
  const merged = mergeIntoPayload(current && current.payload, incoming, now);
  const summary = { ...merged.summary, revisionBefore: current ? Number(current.revision || 0) : 0, revisionAfter: current ? Number(current.revision || 0) : 0 };
  if (!summary.created && !summary.updated) return summary;
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(merged.payload)).digest('hex');
  const nextRevision = current ? Number(current.revision || 0) + 1 : 1;

  if (current) {
    await insertRow(fetchImpl, config, 'portal_design_workspace_history', {
      brand: config.brand, revision: Number(current.revision), payload: current.payload, payload_hash: text(current.payload_hash),
      change_summary: 'Версия перед импортом задач дизайнеров', changed_at: current.updated_at, changed_by: current.updated_by || null
    }, 'resolution=ignore-duplicates,return=minimal');
    const updateQuery = new URLSearchParams({ brand: `eq.${config.brand}`, revision: `eq.${Number(current.revision)}` });
    const updated = await requestJson(fetchImpl, `${config.supabaseUrl}/rest/v1/portal_design_workspaces?${updateQuery}`, {
      method: 'PATCH', headers: headers(config, 'return=representation'),
      body: JSON.stringify({ payload: merged.payload, payload_hash: payloadHash, revision: nextRevision, updated_at: now, updated_by: null })
    }, 'Workspace update');
    if (!Array.isArray(updated) || updated.length !== 1) throw new Error('Workspace revision conflict; retry the import from a fresh state.');
  } else {
    await insertRow(fetchImpl, config, 'portal_design_workspaces', {
      brand: config.brand, payload: merged.payload, payload_hash: payloadHash, revision: nextRevision, updated_at: now, updated_by: null
    }, 'return=minimal');
  }

  await insertRow(fetchImpl, config, 'portal_design_workspace_history', {
    brand: config.brand, revision: nextRevision, payload: merged.payload, payload_hash: payloadHash,
    change_summary: `Импорт Google Sheet: создано ${summary.created}, обновлено ${summary.updated}`, changed_at: now, changed_by: null
  }, 'resolution=merge-duplicates,return=minimal');
  await insertRow(fetchImpl, config, 'portal_design_workspace_audit', {
    brand: config.brand, revision: nextRevision, event_type: 'workspace.import.google_sheet',
    summary: `Импортировано задач: ${summary.input}; создано: ${summary.created}; обновлено: ${summary.updated}`,
    metadata: { source_spreadsheet_id: snapshot.source && snapshot.source.spreadsheetId, input: summary.input, created: summary.created, updated: summary.updated, unchanged: summary.unchanged },
    actor_id: null, actor_email: 'automation@harisma.local', created_at: now
  });
  summary.revisionAfter = nextRevision;
  return summary;
}

module.exports = { buildProjects, mergeIntoPayload, syncWorkspace };

if (require.main === module) {
  syncWorkspace().then((summary) => process.stdout.write(`${JSON.stringify(summary)}\n`)).catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}
