#!/usr/bin/env node
'use strict';

const BUCKET = 'portal-task-files';
const FILE_SIZE_LIMIT = 20 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-zip-compressed',
  'application/postscript',
  'image/vnd.adobe.photoshop',
  'application/octet-stream',
  'text/csv',
  'application/csv'
];

function configFromEnv(env = process.env) {
  const baseUrl = String(env.SUPABASE_URL || env.ALTEA_SUPABASE_URL || 'https://iyckwryrucqrxwlowxow.supabase.co').replace(/\/+$/, '');
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.ALTEA_SUPABASE_SERVICE_ROLE_KEY || '');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  return { baseUrl, serviceRoleKey };
}

function headers(config) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_) { return text; }
}

async function ensureDesignAttachmentStorage(fetchImpl, config) {
  const bucketUrl = `${config.baseUrl}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`;
  const existing = await fetchImpl(bucketUrl, { headers: headers(config) });
  const payload = {
    id: BUCKET,
    name: BUCKET,
    public: false,
    file_size_limit: FILE_SIZE_LIMIT,
    allowed_mime_types: ALLOWED_MIME_TYPES
  };
  const response = existing.status === 404
    ? await fetchImpl(`${config.baseUrl}/storage/v1/bucket`, { method: 'POST', headers: headers(config), body: JSON.stringify(payload) })
    : await fetchImpl(bucketUrl, { method: 'PUT', headers: headers(config), body: JSON.stringify(payload) });
  const body = await readBody(response);
  if (!response.ok) throw new Error(`Storage bucket setup failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return {
    bucket: BUCKET,
    created: existing.status === 404,
    public: false,
    fileSizeLimit: FILE_SIZE_LIMIT,
    allowedMimeTypes: ALLOWED_MIME_TYPES.slice()
  };
}

async function main() {
  const result = await ensureDesignAttachmentStorage(fetch, configFromEnv());
  console.log(`design attachment storage: ${result.created ? 'created' : 'updated'} ${result.bucket} (private), ${result.allowedMimeTypes.length} MIME types`);
}

module.exports = { ALLOWED_MIME_TYPES, BUCKET, FILE_SIZE_LIMIT, configFromEnv, ensureDesignAttachmentStorage };

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exit(1);
  });
}
