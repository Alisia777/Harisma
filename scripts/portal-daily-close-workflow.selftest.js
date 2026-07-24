#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'portal-daily-close.yml');
const dataTruthWorkflowPath = path.join(root, '.github', 'workflows', 'portal-data-truth.yml');
const inventoryPath = path.join(root, 'data', 'runtime_snapshot_inventory.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const workflow = fs.readFileSync(workflowPath, 'utf8');
const dataTruthWorkflow = fs.readFileSync(dataTruthWorkflowPath, 'utf8');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
const paths = Array.isArray(inventory.paths) ? inventory.paths : [];

if (inventory.protectedScopeExcluded !== false || !paths.includes('data/iu_drr_summary.json')) {
  fail('runtime snapshot inventory must publish the guarded IU/DRR summary after a full daily rebuild');
}

if (!workflow.includes("workflows: ['Portal data truth']") || !workflow.includes('types: [completed]')) {
  fail('daily close must auto-run after the Portal data truth workflow completes');
}
if (
  !workflow.includes(
    "github.event_name != 'workflow_run' || (github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main')"
  )
) {
  fail('daily close workflow_run trigger must only publish after successful Portal data truth runs on main');
}

const scriptRefs = new Set();
for (const match of workflow.matchAll(/\b(?:node|python)\s+(scripts\/[^\s\\]+?)(?=\s|$)/g)) {
  scriptRefs.add(match[1]);
}
for (const scriptRef of scriptRefs) {
  if (!fs.existsSync(path.join(root, scriptRef))) {
    fail(`daily close references missing script: ${scriptRef}`);
  }
}

if (workflow.includes('--no-fail')) {
  fail('daily close must not weaken publish or D-1 gates with --no-fail');
}
if (workflow.includes('--relax-platform-facts') || workflow.includes('--relax-missing-platform-facts')) {
  fail('daily close must keep post-sync marketplace fact gates strict');
}
if (!workflow.includes('--strict --skip-protected-scope --skip-health --skip-data-guard')) {
  fail('daily close API sync must run in strict non-IU mode');
}
if (!workflow.includes('--skip-magnit-csv')) {
  fail('daily close must not run the dedicated Magnit CSV normalizer when the retail workbook merge is the configured Magnit source');
}
if (!workflow.includes('node scripts/portal-retail-network-daily-sync.js sync')) {
  fail('daily close must refresh retail-network daily facts from the raw Google Sheet tabs');
}
if (!workflow.includes('--status-file data/retail_network_source_status.json')) {
  fail('daily close must publish retail-network source freshness diagnostics');
}
if (!workflow.includes('--allow-stale-platforms letu')) {
  fail('daily close must keep the explicit Letual stale-source exception visible and scoped');
}
if (workflow.indexOf('node scripts/portal-retail-network-daily-sync.js sync') < workflow.indexOf('node scripts/portal-api-max-sync.js sync')) {
  fail('retail-network daily facts must override the monthly API-workbook fallback');
}
if (!workflow.includes('--platforms wb,ozon,ya,samokat,magnit')) {
  fail('daily API max must leave Goldapple, Letu and Megamarket sales to the finalized retail-network daily source');
}
if (workflow.includes('--platforms wb,ozon,ya,goldapple,letu,megamarket,samokat,magnit')) {
  fail('daily API max must not overwrite finalized Goldapple, Letu or Megamarket facts before an optional Sheet refresh');
}
if (!workflow.includes('--verify-readback')) {
  fail('daily close Supabase publish must verify readback hashes');
}
if (!workflow.includes('--no-fixture-fallback --no-external-ads')) {
  fail('daily close WB ads refresh must not use fixture or external fallback data');
}
if (!workflow.includes('Preflight production secrets')) {
  fail('daily close must preflight production secrets before API refresh');
}
if (!workflow.includes('node scripts/portal-daily-close-preflight.js')) {
  fail('daily close must write a structured preflight report before API refresh');
}
if (!workflow.includes('Summarize preflight blockers')) {
  fail('daily close must publish a readable preflight summary in GitHub Actions');
}
if (!workflow.includes('node scripts/portal-daily-close-preflight-summary.js --report .portal-truth-output/portal_daily_close_preflight.json')) {
  fail('daily close must render the structured preflight report into the GitHub step summary');
}
if (workflow.indexOf('Summarize preflight blockers') < workflow.indexOf('Preflight production secrets')) {
  fail('daily close preflight summary must run after the structured preflight report is written');
}
if (workflow.indexOf('Summarize preflight blockers') > workflow.indexOf('Refresh marketplace facts and rolling revisions')) {
  fail('daily close preflight summary must be visible before marketplace refresh starts');
}
if (!workflow.includes('if: always()')) {
  fail('daily close preflight summary must run even when preflight blocks the job');
}
if (!workflow.includes('--output-dir .portal-truth-output')) {
  fail('daily close preflight report must be uploaded with the truth artifacts');
}
if (!workflow.includes("--cutoff-date '${{ steps.cutoff.outputs.value }}'")) {
  fail('daily close preflight must record the resolved cutoff date');
}
if (!workflow.includes("--revision-from '${{ steps.cutoff.outputs.revision_from }}'")) {
  fail('daily close preflight must record the resolved revision window');
}
if (workflow.indexOf('Preflight production secrets') > workflow.indexOf('Refresh marketplace facts and rolling revisions')) {
  fail('daily close secret preflight must run before marketplace refresh');
}
[
  'ALTEA_WB_API_TOKEN',
  'ALTEA_WB_PROMOTION_TOKEN',
  'ALTEA_OZON_CLIENT_ID',
  'ALTEA_OZON_API_KEY',
  'ALTEA_YM_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY'
].forEach((secretName) => {
  if (!workflow.includes(secretName)) {
    fail(`daily close secret preflight is missing ${secretName}`);
  }
});
[
  'ALTEA_ZYA_API_TOKEN',
  'ALTEA_LETUAL_API_TOKEN',
  'ALTEA_MEGAMARKET_API_TOKEN',
  'ALTEA_SAMOKAT_API_TOKEN',
  'ALTEA_MAGNIT_API_TOKEN',
  'ALTEA_RETAIL_NETWORK_SALES_XLSX'
].forEach((sourceName) => {
  if (!workflow.includes(sourceName)) {
    fail(`daily close must pass extra marketplace source env ${sourceName}`);
  }
});
const retailNetworkFallback = "secrets.ALTEA_RETAIL_NETWORK_SALES_XLSX || vars.ALTEA_RETAIL_NETWORK_SALES_XLSX || 'data/external_sources/retail_network_sales.xlsx'";
if (workflow.split(retailNetworkFallback).length - 1 !== 2) {
  fail('daily close must use the committed retail network workbook in both preflight and marketplace refresh');
}
['ALTEA_YM_CAMPAIGN_ID', 'ALTEA_YM_BUSINESS_ID'].forEach((optionalName) => {
  if (!workflow.includes(optionalName)) {
    fail(`daily close must pass optional Yandex identity hint ${optionalName} when configured`);
  }
});
if (!workflow.includes("vars.SUPABASE_URL || 'https://iyckwryrucqrxwlowxow.supabase.co'")) {
  fail('daily close must provide a stable Supabase URL fallback; the URL is config, not a service-role secret');
}
if (!workflow.includes('secrets.ALTEA_SUPABASE_SERVICE_ROLE_KEY')) {
  fail('daily close must accept the ALTEA_SUPABASE_SERVICE_ROLE_KEY alias');
}
if (!workflow.includes('secrets.ALTEA_SMART_PRICE_HTTP_AUTH_BEARER || github.token')) {
  fail('daily close must let the smart price source fetch private GitHub release assets with github.token');
}
if (!workflow.includes('SMART_PRICE_CURL_ARGS=(--fail --location --retry 5 --retry-delay 2 --retry-all-errors')) {
  fail('daily close must predownload GitHub release asset workbooks with curl retries before the Node builder');
}
if (!workflow.includes('https://github.com/*/releases/download/*')) {
  fail('daily close must predownload public GitHub release workbook assets before the Node builder');
}
if (!workflow.includes('SMART_PRICE_INPUT_ARGS=(--input-xlsx .portal-truth-output/price-sync/smart-price-workbook.xlsx)')) {
  fail('daily close must pass the predownloaded smart price workbook to the builder as an input XLSX');
}
[
  'ALTEA_SMART_PRICE_SHEET_URL',
  'ALTEA_SMART_PRICE_XLSX_URL',
  'ALTEA_SMART_PRICE_EXPORT_URL',
  'ALTEA_SMART_PRICE_XLSX_GZIP_B64',
  'ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON',
  'ALTEA_SMART_PRICE_GOOGLE_FILE_ID'
].forEach((name) => {
  if (!workflow.includes(name)) {
    fail(`daily close must pass smart price CI source env ${name}`);
  }
});
if (!dataTruthWorkflow.includes('node scripts/build-sku-registry-meta.js --input-dir data --output-dir data --run-date "$RUN_DATE"')) {
  fail('data truth workflow must build sku_registry_meta.json before the current snapshot guard');
}
if (dataTruthWorkflow.indexOf('node scripts/build-sku-registry-meta.js') > dataTruthWorkflow.indexOf('node scripts/portal-daily-layer-guard.js')) {
  fail('data truth workflow must build sku_registry_meta.json before portal-daily-layer-guard');
}
if (!dataTruthWorkflow.includes('--relax-missing-platform-facts')) {
  fail('data truth workflow must downgrade missing pre-sync marketplace raw facts to warnings');
}
if (!dataTruthWorkflow.includes('--relax-platform-facts')) {
  fail('data truth workflow must downgrade pre-sync marketplace freshness drift to warnings');
}

if (paths.includes('data/portal_dashboard_metrics.json')) {
  const command = 'node scripts/build-portal-dashboard-metrics.js --input-dir data --output-dir data';
  if (!workflow.includes(command)) {
    fail('daily close must build portal_dashboard_metrics.json into data before snapshot finalization');
  }
}
[
  'node scripts/build-canonical-repricer.js --input-dir data --output-dir data',
  'node scripts/portal-upload-apply-runtime.js --input-dir data --output-dir data'
].forEach((command) => {
  if (!workflow.includes(command)) {
    fail(`daily close must build required phase3 publish report via: ${command}`);
  }
  if (workflow.indexOf(command) > workflow.indexOf('node scripts/portal-daily-layer-guard.js')) {
    fail(`${command} must run before daily layer guard`);
  }
});

if (!workflow.includes('REVISION_FROM=$(TZ=Europe/Moscow date -d "$VALUE -29 days" +%F)')) {
  fail('daily close must expose the 30-day revision window start from the resolved cutoff');
}
if (!workflow.includes('echo "revision_from=$REVISION_FROM" >> "$GITHUB_OUTPUT"')) {
  fail('daily close must publish revision_from through GITHUB_OUTPUT');
}
if (!workflow.includes('RUN_DATE=$(TZ=Europe/Moscow date +%F)')) {
  fail('daily close must freeze the run date before long-running refresh steps');
}
if (!workflow.includes('echo "run_date=$RUN_DATE" >> "$GITHUB_OUTPUT"')) {
  fail('daily close must publish run_date through GITHUB_OUTPUT');
}
if (!workflow.includes("--expected-run-date '${{ steps.cutoff.outputs.run_date }}'")) {
  fail('daily close guard must use the frozen run_date, not wall-clock time after midnight');
}

[
  'node scripts/portal-wb-ads-sync.js sync',
  'node scripts/portal-ozon-ads-finance-sync.js sync'
].forEach((command) => {
  const start = workflow.indexOf(command);
  if (start < 0) fail(`daily close is missing ${command}`);
  const snippet = workflow.slice(start, start + 260);
  if (!snippet.includes("--from '${{ steps.cutoff.outputs.revision_from }}'")) {
    fail(`${command} must refresh from the resolved revision window`);
  }
  if (!snippet.includes("--to '${{ steps.cutoff.outputs.value }}'")) {
    fail(`${command} must refresh through the resolved cutoff date`);
  }
});

[
  'node scripts/build-sku-registry-meta.js --input-dir data --output-dir data',
  'node scripts/build-logistics-from-warehouse-overlay.js --input-dir data --output-dir data',
  'node scripts/build-wb-owner-audit-from-skus.js --input-dir data --base-data-dir data --output-dir data',
  'node scripts/build-portal-data-quality-report.js --input-dir data --base-data-dir data --output-dir data',
  'node scripts/portal-sync-health.js --input-dir data --base-data-dir data --output-dir data --quarantine-only',
  'node scripts/build-wb-fixed-rate-report.js --output data/wb_fixed_rate_reports.json --optional',
  'node scripts/build-wb-iu-logic-rules.js --report data/wb_fixed_rate_reports.json --output data/wb_iu_logic_rules.json',
  'node scripts/build-iu-drr-summary.js --input-dir data --base-data-dir data --output-dir data',
  'node scripts/portal-sync-health.js --input-dir data --base-data-dir data --output-dir data --expected-date',
  'node scripts/build-portal-dashboard.js --input-dir data --output-dir data',
  'node scripts/build-control-auto-task-sources.js --input-dir data --output-dir data',
  'node scripts/build-wb-sales-funnel-from-platform-trends.js --platform-trends data/platform_trends.json --skus data/skus.json --wb-feedbacks data/wb_feedbacks_summary.json --output-file data/wb_sales_funnel_report.json',
  'node scripts/portal-smart-price-overlay-sync.js sync --output-dir .portal-truth-output/price-sync',
  'node scripts/portal-wb-feedback-sync.js sync --input-dir data --base-data-dir data --output-dir data'
].forEach((command) => {
  if (!workflow.includes(command)) {
    fail(`daily close must run required source builder/sync via: ${command}`);
  }
  if (workflow.indexOf(command) > workflow.indexOf('node scripts/portal-daily-layer-guard.js')) {
    fail(`${command} must run before daily layer guard`);
  }
});

const iuBuildCommand = 'node scripts/build-iu-drr-summary.js --input-dir data --base-data-dir data --output-dir data';
const fullHealthCommand = 'node scripts/portal-sync-health.js --input-dir data --base-data-dir data --output-dir data --expected-date';
const snapshotFinalizeCommand = 'node scripts/portal-atomic-snapshot-finalize.js';
if (workflow.indexOf(iuBuildCommand) < workflow.indexOf('node scripts/portal-wb-ads-sync.js sync')) {
  fail('daily close must rebuild IU/DRR after fresh advertising facts are loaded');
}
if (workflow.indexOf(fullHealthCommand) < workflow.indexOf(iuBuildCommand)) {
  fail('daily close must calculate full sync health after rebuilding IU/DRR');
}
if (workflow.indexOf(fullHealthCommand) > workflow.indexOf(snapshotFinalizeCommand)) {
  fail('daily close must calculate full sync health before snapshot finalization');
}

const yandexStockCommand = 'node scripts/portal-yandex-market-stock-sync.js sync';
if (!workflow.includes(yandexStockCommand)) {
  fail('daily close must refresh Yandex Market stock before rebuilding order/OOS layers');
}
if (workflow.indexOf(yandexStockCommand) > workflow.indexOf('node scripts/build-order-procurement-layer.js')) {
  fail('Yandex Market stock refresh must run before order procurement build');
}
if (workflow.indexOf(yandexStockCommand) < workflow.indexOf('Refresh advertising and stock')) {
  fail('Yandex Market stock refresh must be part of the production stock refresh step');
}

[
  'data/portal_dashboard_metrics.json',
  'data/portal_dashboard_reconciliation.json',
  'data/portal_plan_reconciliation.json',
  'data/portal_indicator_audit.json',
  'data/portal_repricing_reconciliation.json',
  'data/portal_upload_apply_e2e.json',
  'data/portal_minmax_upload_reconciliation.json',
  'data/portal_cost_upload_reconciliation.json'
].forEach((artifactPath) => {
  if (!workflow.includes(artifactPath)) {
    fail(`daily close artifact upload is missing ${artifactPath}`);
  }
});

console.log('portal-daily-close-workflow selftest ok');
