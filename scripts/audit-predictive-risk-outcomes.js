#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA = 'qharisma-predictive-risk-outcome-audit-v1';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function resolveOptions(args = {}) {
  const root = process.cwd();
  const inputDir = path.resolve(args['input-dir'] || path.join(root, 'data'));
  const baseDataDir = path.resolve(args['base-data-dir'] || path.join(root, 'data'));
  const outputDir = path.resolve(args['output-dir'] || inputDir);
  return {
    inputDir,
    baseDataDir,
    outputDir,
    windowDays: positiveInt(args['window-days'], 14),
    now: args.now ? new Date(args.now) : new Date(),
    mirrorLocalFallback: Boolean(args['mirror-local-fallback'])
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function readJsonFromDirs(options, fileName, fallback) {
  for (const dir of [options.inputDir, options.baseDataDir]) {
    const filePath = path.join(dir, fileName);
    try {
      if (fs.existsSync(filePath)) return readJson(filePath);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function dateKey(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function hoursBetween(left, right) {
  const a = new Date(left);
  const b = new Date(right);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.max(0, (b.getTime() - a.getTime()) / 3600000);
}

function stableId(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function normalizeStatus(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase();
}

function taskSignalKey(task = {}) {
  return [
    task.autoCode || task.auto_code || '',
    task.predictiveRiskId || task.predictive_risk_id || '',
    task.articleKey || task.article || '',
    task.type || '',
    task.platform || ''
  ].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean).join('|');
}

function signalKeys(signal = {}) {
  return new Set([
    String(signal.autoCode || '').trim().toLowerCase(),
    String(signal.predictiveRiskId || '').trim().toLowerCase(),
    taskSignalKey(signal)
  ].filter(Boolean));
}

function collectTasks(options) {
  const sources = [
    readJsonFromDirs(options, 'team_state.json', null),
    readJsonFromDirs(options, 'portal_team_state.json', null),
    readJsonFromDirs(options, 'seed_comments.json', null)
  ].filter(Boolean);
  return sources.flatMap((payload) => Array.isArray(payload?.tasks) ? payload.tasks : []);
}

function classifyTaskOutcome(task = {}) {
  const status = normalizeStatus(task.status);
  const text = normalizeText([
    task.outcome,
    task.result,
    task.closeReason,
    task.close_reason,
    task.comment,
    task.note,
    task.reason
  ].filter(Boolean).join(' '));
  const closed = ['done', 'closed', 'resolved', 'cancelled', 'canceled'].includes(status);
  const falsePositive = /false\s*positive|ложн|не подтверд|ошибоч/.test(text);
  const confirmedTruePositive = /true\s*positive|подтверд|причин[аы].*подтвержд|сработал/.test(text);
  const ignoredByOwner = /ignored|игнор|без реакции|не взял|не взяли/.test(text);
  return { closed, falsePositive, confirmedTruePositive, ignoredByOwner };
}

function buildOutcomeAudit(options) {
  const snapshot = readJsonFromDirs(options, 'predictive_risk_snapshot.json', { generatedAt: '', asOfDate: '', summary: {}, risks: [] });
  const signalsPayload = readJsonFromDirs(options, 'auto_task_signals.json', { generatedAt: '', asOfDate: '', summary: {}, signals: [] });
  const signals = Array.isArray(signalsPayload.signals) ? signalsPayload.signals : [];
  const risks = Array.isArray(snapshot.risks) ? snapshot.risks : [];
  const tasks = collectTasks(options);
  const signalKeyToSignal = new Map();
  signals.forEach((signal) => {
    signalKeys(signal).forEach((key) => signalKeyToSignal.set(key, signal));
  });

  const matchedOutcomes = [];
  tasks.forEach((task) => {
    const keys = signalKeys(task);
    const matched = [...keys].map((key) => signalKeyToSignal.get(key)).find(Boolean);
    if (!matched) return;
    const outcome = classifyTaskOutcome(task);
    const createdAt = task.createdAt || task.created_at || matched.generatedAt || signalsPayload.generatedAt || snapshot.generatedAt;
    const firstActionAt = task.startedAt || task.started_at || task.updatedAt || task.updated_at || task.closedAt || task.closed_at || '';
    matchedOutcomes.push({
      id: task.id || `outcome-${stableId(taskSignalKey(task))}`,
      autoCode: matched.autoCode || task.autoCode || '',
      predictiveRiskId: matched.predictiveRiskId || task.predictiveRiskId || '',
      articleKey: matched.articleKey || task.articleKey || '',
      status: task.status || '',
      closed: outcome.closed,
      confirmedTruePositive: outcome.confirmedTruePositive,
      falsePositive: outcome.falsePositive,
      ignoredByOwner: outcome.ignoredByOwner,
      createdAt,
      firstActionAt,
      timeToActionHours: firstActionAt ? hoursBetween(createdAt, firstActionAt) : null
    });
  });

  const actionHours = matchedOutcomes
    .map((item) => item.timeToActionHours)
    .filter((value) => Number.isFinite(value));
  const averageActionHours = actionHours.length
    ? Math.round((actionHours.reduce((sum, value) => sum + value, 0) / actionHours.length) * 10) / 10
    : null;

  const asOfDate = dateKey(signalsPayload.asOfDate)
    || dateKey(snapshot.asOfDate)
    || dateKey(signalsPayload.generatedAt)
    || dateKey(snapshot.generatedAt)
    || dateKey(options.now.toISOString());

  return {
    schema: SCHEMA,
    generatedAt: options.now.toISOString(),
    asOfDate,
    windowDays: options.windowDays,
    signalsCreated: signals.length,
    risksDetected: Number(snapshot.summary?.totalRisks || risks.length || 0),
    tasksClosed: matchedOutcomes.filter((item) => item.closed).length,
    confirmedTruePositive: matchedOutcomes.filter((item) => item.confirmedTruePositive).length,
    falsePositive: matchedOutcomes.filter((item) => item.falsePositive).length,
    ignoredByOwner: matchedOutcomes.filter((item) => item.ignoredByOwner).length,
    reopenedRisks: 0,
    avgTimeToActionHours: averageActionHours,
    summary: {
      criticalSignals: signals.filter((signal) => signal.priority === 'critical').length,
      highSignals: signals.filter((signal) => signal.priority === 'high').length,
      dataQualitySignals: signals.filter((signal) => signal.type === 'data_quality' || signal.ruleId === 'data_freshness_predictive_blocker').length,
      matchedOutcomeCount: matchedOutcomes.length,
      staleSourceCount: (snapshot.dataFreshness?.sources || []).filter((source) => source.status === 'stale' || source.status === 'missing').length
    },
    outcomes: matchedOutcomes.slice(0, 200)
  };
}

function mirrorOutput(options, outputPath) {
  if (!options.mirrorLocalFallback) return '';
  const targetPath = path.join(options.baseDataDir, path.basename(outputPath));
  if (path.resolve(targetPath) === path.resolve(outputPath)) return '';
  writeJson(targetPath, readJson(outputPath));
  return targetPath;
}

function runAudit(options) {
  const audit = buildOutcomeAudit(options);
  const outputPath = path.join(options.outputDir, 'predictive_risk_outcome_audit.json');
  writeJson(outputPath, audit);
  const mirrored = mirrorOutput(options, outputPath);
  return { audit, outputPath, mirrored };
}

if (require.main === module) {
  const result = runAudit(resolveOptions(parseArgs(process.argv)));
  console.log(JSON.stringify({
    outputPath: result.outputPath,
    mirrored: result.mirrored,
    signalsCreated: result.audit.signalsCreated,
    risksDetected: result.audit.risksDetected,
    tasksClosed: result.audit.tasksClosed,
    falsePositive: result.audit.falsePositive
  }, null, 2));
}

module.exports = {
  buildOutcomeAudit,
  runAudit,
  resolveOptions,
  parseArgs
};
