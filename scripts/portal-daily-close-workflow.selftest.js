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
[
  'data/portal_daily_intake.json',
  'data/company_plan.json',
  'data/seed_comments.json',
  'data/launches.json',
  'data/meetings.json',
  'data/documents.json',
  'data/iu_plan.json',
  'data/loyalty_system.json'
].forEach((requiredPath) => {
  if (!paths.includes(requiredPath)) {
    fail(`runtime snapshot inventory must include unified view source: ${requiredPath}`);
  }
});

if (!workflow.includes("workflows: ['Portal data truth']") || !workflow.includes('types: [completed]')) {
  fail('daily close must auto-run after the Portal data truth workflow completes');
}
if (!workflow.includes('branches: [main]')) {
  fail('daily close workflow_run trigger must not instantiate production close runs for feature branches');
}
if (!workflow.includes("github.event.workflow_run.conclusion == 'success'")) {
  fail('daily close workflow_run trigger must only publish after successful Portal data truth runs on main');
}
if (!workflow.includes("github.event.workflow_run.head_branch == 'main'")) {
  fail('daily close workflow_run trigger must only publish after successful Portal data truth runs on main');
}
if (!workflow.includes("github.event.workflow_run.event != 'schedule'")) {
  fail('scheduled pre-settlement truth audits must not enqueue an early daily close');
}
if (!workflow.includes("cron: '30 7 * * *'")) {
  fail('the protected D-1 close must remain scheduled for 07:30 UTC (10:30 MSK)');
}
if (!workflow.includes('ref: ${{ github.event.workflow_run.head_sha || github.sha }}')) {
  fail('daily close must check out the exact revision that passed the Portal data truth gate');
}
if (!workflow.includes("|| 'portal-daily-close'")) {
  fail('all production daily closes must share one concurrency group');
}
if (
  !workflow.includes("github.event.workflow_run.conclusion != 'success'")
  || !workflow.includes("github.event.workflow_run.event == 'schedule'")
  || !workflow.includes("format('portal-daily-close-ignored-{0}', github.run_id)")
) {
  fail('ineligible workflow_run events must not cancel an active production close before the job-level guard skips them');
}
if (!workflow.includes('cancel-in-progress: true')) {
  fail('a close for a newer truth-gated main SHA must supersede an obsolete close');
}
if (!dataTruthWorkflow.includes('group: portal-data-truth-${{ github.event_name }}-${{ github.ref }}')) {
  fail('truth runs must be grouped by event and ref so newer main pushes supersede only older main pushes');
}
if (!dataTruthWorkflow.includes('cancel-in-progress: true')) {
  fail('superseded truth runs must be cancelled before they can enqueue obsolete daily closes');
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
if (!workflow.includes('--allow-stale-platforms goldapple,letu,megamarket')) {
  fail('daily close must keep the explicit optional retail-network stale-source exceptions visible and scoped');
}
if (!workflow.includes('Refresh WB substitution traffic')) {
  fail('daily close must attempt to refresh WB substitution traffic on every production close');
}
if (!workflow.includes('node scripts/import-wb-substitution-traffic.js')) {
  fail('daily close must invoke the guarded WB substitution workbook importer');
}
if (!workflow.includes('--status-file .portal-truth-output/wb_substitution_refresh.json')) {
  fail('daily close must retain a structured WB substitution refresh status in truth artifacts');
}
if (!workflow.includes('--min-rows 100') || !workflow.includes('--min-mapped-articles 40') || !workflow.includes('--min-mapped-ratio 0.95')) {
  fail('daily close must reject empty, partial or poorly mapped WB substitution workbook replacements');
}
if (!workflow.includes('--optional')) {
  fail('a missing optional WB substitution source must preserve the last verified snapshot without blocking core D-1 facts');
}
if (workflow.indexOf('Refresh WB substitution traffic') > workflow.indexOf('Refresh advertising and stock')) {
  fail('WB substitution traffic must refresh before advertising layers consume it');
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
  'ALTEA_RETAIL_NETWORK_SALES_XLSX',
  'ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_URL',
  'ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_B64',
  'ALTEA_WB_SUBSTITUTION_TRAFFIC_XLSX_GZIP_B64'
].forEach((sourceName) => {
  if (!workflow.includes(sourceName)) {
    fail(`daily close must pass extra marketplace source env ${sourceName}`);
  }
});
const retailNetworkFallback = "secrets.ALTEA_RETAIL_NETWORK_SALES_XLSX || vars.ALTEA_RETAIL_NETWORK_SALES_XLSX || 'data/external_sources/retail_network_sales.xlsx'";
if (workflow.split(retailNetworkFallback).length - 1 !== 3) {
  fail('daily close must use the committed retail network workbook in preflight, marketplace refresh, and retail daily refresh');
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
if (!dataTruthWorkflow.includes('node scripts/import-wb-substitution-traffic.selftest.js')) {
  fail('data truth workflow must guard the WB substitution refresh and preservation contract');
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
if (!dataTruthWorkflow.includes('git log --format=%B "$BASE_REF..HEAD" | grep -Fq \'[portal-full-update]\'')) {
  fail('data truth workflow must allow guarded full-portal PRs and merge pushes with the explicit commit marker');
}
if (!dataTruthWorkflow.includes('"${{ github.event_name }}" == "pull_request" || "${{ github.event_name }}" == "push"')) {
  fail('data truth workflow must inspect the full commit range for both PR and push events');
}
if (dataTruthWorkflow.includes('github.event.head_commit.message')) {
  fail('data truth workflow must not lose the full-update marker when GitHub creates a merge commit');
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
  'node scripts/portal-smart-price-overlay-sync.js sync',
  'node scripts/portal-wb-feedback-sync.js sync --input-dir data --base-data-dir data --output-dir data'
].forEach((command) => {
  if (!workflow.includes(command)) {
    fail(`daily close must run required source builder/sync via: ${command}`);
  }
  if (workflow.indexOf(command) > workflow.indexOf('node scripts/portal-daily-layer-guard.js')) {
    fail(`${command} must run before daily layer guard`);
  }
});
[
  "--output-dir .portal-truth-output/price-sync",
  "--expected-date '${{ steps.cutoff.outputs.value }}'",
  '--max-source-lag-days 3',
  '--max-platform-gap-days 3',
  '--min-latest-coverage-ratio 0.55'
].forEach((argument) => {
  if (!workflow.includes(argument)) {
    fail(`daily price sync must include guarded argument: ${argument}`);
  }
});

const iuBuildCommand = 'node scripts/build-iu-drr-summary.js --input-dir data --base-data-dir data --output-dir data';
const qualityBuildCommand = 'node scripts/build-portal-data-quality-report.js --input-dir data --base-data-dir data --output-dir data';
const skuMatrixBuildCommand = 'node scripts/build-sku-matrix-layer.js --input-dir data --base-data-dir data --output-dir data';
const dashboardBuildCommand = 'node scripts/build-portal-dashboard.js --input-dir data --output-dir data';
const fullHealthCommand = 'node scripts/portal-sync-health.js --input-dir data --base-data-dir data --output-dir data --expected-date';
const unifiedIntakeCommand = 'node scripts/portal-unified-daily-intake.js';
const snapshotFinalizeCommand = 'node scripts/portal-atomic-snapshot-finalize.js';
if (workflow.indexOf(iuBuildCommand) < workflow.indexOf('node scripts/portal-wb-ads-sync.js sync')) {
  fail('daily close must rebuild IU/DRR after fresh advertising facts are loaded');
}
if (workflow.indexOf(fullHealthCommand) < workflow.indexOf(iuBuildCommand)) {
  fail('daily close must calculate full sync health after rebuilding IU/DRR');
}
if (workflow.lastIndexOf(qualityBuildCommand) < workflow.indexOf(iuBuildCommand)
  || workflow.lastIndexOf(qualityBuildCommand) < workflow.indexOf(dashboardBuildCommand)) {
  fail('daily close must rebuild data quality after the final derived ads and dashboard snapshots');
}
if (workflow.lastIndexOf(skuMatrixBuildCommand) < workflow.lastIndexOf(qualityBuildCommand)) {
  fail('daily close must realign the SKU matrix after the final data-quality report');
}
if (workflow.indexOf(fullHealthCommand) < workflow.lastIndexOf(qualityBuildCommand)
  || workflow.indexOf(fullHealthCommand) < workflow.lastIndexOf(skuMatrixBuildCommand)) {
  fail('daily close must calculate full sync health after the final quality and SKU-matrix rebuild');
}
if (workflow.indexOf(fullHealthCommand) > workflow.indexOf(snapshotFinalizeCommand)) {
  fail('daily close must calculate full sync health before snapshot finalization');
}
if (!workflow.includes(unifiedIntakeCommand)) {
  fail('daily close must run the unified intake guard for every registered portal view');
}
if (workflow.indexOf(unifiedIntakeCommand) < workflow.indexOf('node scripts/build-control-auto-task-sources.js')) {
  fail('unified intake must run after all daily view sources are rebuilt');
}
if (workflow.indexOf(unifiedIntakeCommand) > workflow.lastIndexOf(fullHealthCommand)) {
  fail('final sync health must consume the unified intake receipt');
}
if (workflow.indexOf(unifiedIntakeCommand) > workflow.indexOf('node scripts/portal-daily-layer-guard.js')) {
  fail('unified intake must block before the numeric publish gate');
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
