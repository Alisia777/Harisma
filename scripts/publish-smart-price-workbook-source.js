#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveOptions,
  resolveWorkbookBuffer,
  workbookBufferLooksLikeSmartPrices
} = require('./portal-smart-price-overlay-sync');

const DEFAULT_RELEASE_TAG = 'smart-price-workbook-source';
const DEFAULT_RELEASE_NAME = 'Smart price workbook source';
const DEFAULT_ASSET_NAME = 'smart-price-workbook.xlsx';
const DEFAULT_URL_VARIABLE = 'ALTEA_SMART_PRICE_XLSX_URL';
const DEFAULT_MTIME_VARIABLE = 'ALTEA_SMART_PRICE_SOURCE_MTIME';

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.replace(/^--/, '');
    const nextValue = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    args[key] = nextValue;
  }
  return args;
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    shell: false,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout || '').trim();
}

function resolveRepoSlug(args) {
  if (args.repo) return String(args.repo).trim();
  const remote = git(['config', '--get', 'remote.origin.url']);
  const match = remote.match(/github\.com[:/]([^/\s]+\/[^/\s.]+)(?:\.git)?$/i);
  if (!match) throw new Error(`Could not resolve GitHub repo from origin remote: ${remote}`);
  return match[1];
}

function githubToken() {
  const explicit = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (explicit) return explicit;
  const input = 'protocol=https\nhost=github.com\n\n';
  const result = spawnSync('git', ['credential', 'fill'], {
    input,
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) return '';
  const line = String(result.stdout || '')
    .split(/\r?\n/)
    .find((item) => item.startsWith('password='));
  return line ? line.slice('password='.length).trim() : '';
}

async function githubRequest({ method = 'GET', url, token, payload = null, headers = {} }) {
  const requestHeaders = {
    'User-Agent': 'harisma-smart-price-source-publisher/1.0',
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    ...headers
  };
  let body = null;
  if (payload !== null) {
    requestHeaders['Content-Type'] = 'application/json';
    body = JSON.stringify(payload);
  }
  const response = await fetch(url, { method, headers: requestHeaders, body, redirect: 'follow' });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return text.trim() ? JSON.parse(text) : null;
}

async function getOrCreateDraftRelease({ repo, token, tag }) {
  const base = `https://api.github.com/repos/${repo}`;
  const tagUrl = `${base}/releases/tags/${encodeURIComponent(tag)}`;
  try {
    return await githubRequest({ url: tagUrl, token });
  } catch (error) {
    if (!/HTTP 404/.test(String(error.message || error))) throw error;
  }
  return githubRequest({
    method: 'POST',
    url: `${base}/releases`,
    token,
    payload: {
      tag_name: tag,
      target_commitish: 'main',
      name: DEFAULT_RELEASE_NAME,
      body: 'Private CI source workbook for the Harisma portal daily close. Updated by scripts/publish-smart-price-workbook-source.js.',
      draft: true,
      prerelease: false
    }
  });
}

async function deleteExistingAsset({ release, token, assetName }) {
  const existing = (release.assets || []).find((asset) => asset.name === assetName);
  if (!existing) return false;
  await githubRequest({ method: 'DELETE', url: existing.url, token });
  return true;
}

async function uploadAsset({ release, token, assetName, buffer }) {
  const uploadUrl = String(release.upload_url || '').replace(/\{.*$/, '');
  const url = `${uploadUrl}?name=${encodeURIComponent(assetName)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'harisma-smart-price-source-publisher/1.0',
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Length': String(buffer.length)
    },
    body: buffer
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub release asset upload failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

async function upsertActionsVariable({ repo, token, name, value }) {
  const base = `https://api.github.com/repos/${repo}/actions/variables`;
  const variableUrl = `${base}/${encodeURIComponent(name)}`;
  try {
    await githubRequest({
      method: 'PATCH',
      url: variableUrl,
      token,
      payload: { name, value }
    });
    return 'updated';
  } catch (error) {
    if (!/HTTP 404/.test(String(error.message || error))) throw error;
  }
  await githubRequest({
    method: 'POST',
    url: base,
    token,
    payload: { name, value }
  });
  return 'created';
}

async function resolveWorkbook(args) {
  const inputXlsx = args['input-xlsx'] ? path.resolve(args['input-xlsx']) : '';
  if (inputXlsx) {
    const buffer = fs.readFileSync(inputXlsx);
    const stat = fs.statSync(inputXlsx);
    if (!workbookBufferLooksLikeSmartPrices(buffer)) {
      throw new Error(`Input workbook does not match smart-price schema: ${inputXlsx}`);
    }
    return {
      buffer,
      sourceKind: 'local',
      sourceMtimeIso: stat.mtime.toISOString(),
      sourceFileName: path.basename(inputXlsx)
    };
  }
  return resolveWorkbookBuffer(resolveOptions(args));
}

async function main() {
  const args = parseArgs(process.argv);
  const token = githubToken();
  if (!token) throw new Error('Set GITHUB_TOKEN/GH_TOKEN or login through git credential manager before publishing.');

  const repo = resolveRepoSlug(args);
  const tag = String(args.tag || DEFAULT_RELEASE_TAG).trim();
  const assetName = String(args['asset-name'] || DEFAULT_ASSET_NAME).trim();
  const urlVariable = String(args['url-variable'] || DEFAULT_URL_VARIABLE).trim();
  const mtimeVariable = String(args['mtime-variable'] || DEFAULT_MTIME_VARIABLE).trim();
  const workbook = await resolveWorkbook(args);
  if (!workbookBufferLooksLikeSmartPrices(workbook.buffer)) {
    throw new Error('Resolved workbook does not match smart-price schema.');
  }

  let release = await getOrCreateDraftRelease({ repo, token, tag });
  await deleteExistingAsset({ release, token, assetName });
  release = await githubRequest({ url: release.url, token });
  const asset = await uploadAsset({ release, token, assetName, buffer: workbook.buffer });
  const urlState = await upsertActionsVariable({ repo, token, name: urlVariable, value: asset.url });
  const mtimeState = await upsertActionsVariable({
    repo,
    token,
    name: mtimeVariable,
    value: workbook.sourceMtimeIso || new Date().toISOString()
  });

  console.log(JSON.stringify({
    repo,
    releaseTag: tag,
    releaseDraft: Boolean(release.draft),
    assetName,
    assetApiUrl: asset.url,
    assetBytes: asset.size || workbook.buffer.length,
    sourceKind: workbook.sourceKind,
    sourceMtime: workbook.sourceMtimeIso || '',
    variables: {
      [urlVariable]: urlState,
      [mtimeVariable]: mtimeState
    }
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
