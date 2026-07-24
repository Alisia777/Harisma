# Portal Daily Close Runbook

This runbook is the operational contract for the non-IU portal data truth close.
It documents the current production blocker and the exact evidence required before
the portal can be considered self-updating from GitHub.

The protected finance scope is intentionally outside this flow.

## Current Status

The data truth code is on `main`, the GitHub workflows are active, and the portal
publish path is fail-closed.

Current external blocker: required GitHub Actions secrets are not configured.

Latest verified blocker evidence:

- workflow: `Portal daily close`
- run: `28543260217`
- branch: `main`
- head SHA: `db830662436076f4c626ebbe43e8bc61e73848de`
- preceding `Portal data truth`: `success`
- summary step: `Summarize preflight blockers` succeeded
- artifact: `portal-daily-close-28543260217`
- artifact digest: `sha256:b9da7cadd205c5338b6323fc283629a32ddffa18ea2d2b8a83912e72d241325b`
- report inside artifact: `.portal-truth-output/portal_daily_close_preflight.json`
- report status: `blocked`
- `publish.allowed`: `false`

## Required GitHub Actions Secrets

Configure these repository secrets before expecting daily production data publish:

```text
ALTEA_WB_API_TOKEN
ALTEA_WB_PROMOTION_TOKEN
ALTEA_OZON_CLIENT_ID
ALTEA_OZON_API_KEY
ALTEA_YM_API_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The workflow also accepts `ALTEA_SUPABASE_SERVICE_ROLE_KEY` as an explicit
alias for the Supabase service-role key.

`SUPABASE_URL` is configuration, not a secret. The workflow uses the canonical
portal Supabase URL by default, and can be overridden with repository secret or
variable `SUPABASE_URL`/`ALTEA_SUPABASE_URL`.

`ALTEA_YM_CAMPAIGN_ID` and `ALTEA_YM_BUSINESS_ID` are optional identity hints.
When they are absent, the Yandex Market runtime discovers campaigns through
`ALTEA_YM_API_KEY` via the Partner API before refreshing Yandex facts and stock.

## Required CI Source Groups

Daily close also requires one configured source from each group below. These can
be repository secrets or variables where the workflow maps both forms.

Smart price workbook, one of:

```text
ALTEA_SMART_PRICE_SHEET_URL
ALTEA_SMART_PRICE_XLSX_URL
ALTEA_SMART_PRICE_EXPORT_URL
ALTEA_SMART_PRICE_INPUT_XLSX
ALTEA_SMART_PRICE_XLSX_B64
ALTEA_SMART_PRICE_XLSX_GZIP_B64
ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_APPLICATION_CREDENTIALS_JSON
GOOGLE_APPLICATION_CREDENTIALS
```

Extra marketplace daily sources:

```text
goldapple: ALTEA_ZYA_API_TOKEN or ALTEA_ZYA_API_KEY or ALTEA_GOLDAPPLE_API_TOKEN or ALTEA_GOLDAPPLE_API_KEY or ALTEA_ZYA_SALES_XLSX or ALTEA_ZYA_SALES_ZIP or ALTEA_RETAIL_NETWORK_SALES_XLSX
letu: ALTEA_LETUAL_API_TOKEN or ALTEA_LETUAL_LOCAL_EXPORT_XLSX or ALTEA_RETAIL_NETWORK_SALES_XLSX
megamarket: ALTEA_MEGAMARKET_API_TOKEN or ALTEA_MEGAMARKET_API_KEY or ALTEA_RETAIL_NETWORK_SALES_XLSX
samokat: ALTEA_SAMOKAT_API_TOKEN or ALTEA_SAMOKAT_API_KEY or ALTEA_RETAIL_NETWORK_SALES_XLSX
magnit: ALTEA_MAGNIT_API_TOKEN or ALTEA_MAGNIT_API_KEY or ALTEA_MAGNIT_MARKET_API_TOKEN or ALTEA_MAGNIT_MARKET_API_KEY or ALTEA_MAGNIT_SALES_XLSX or ALTEA_MAGNIT_SALES_XLS or ALTEA_MAGNIT_SALES_WORKBOOK or ALTEA_MAGNIT_SALES_CSV or ALTEA_RETAIL_NETWORK_SALES_XLSX
```

### Finalized retail-network daily facts

Goldapple, Letu and Megamarket sales facts are finalized from the private Google
workbook configured by `ALTEA_RETAIL_NETWORK_GOOGLE_SHEET_ID` (the repository
default points to the current workbook). GitHub Actions must have one of:

```text
ALTEA_GOOGLE_SERVICE_ACCOUNT_JSON
GOOGLE_APPLICATION_CREDENTIALS_JSON
```

Share the source workbook with the service account `client_email` as a viewer.
The daily importer reads the raw `База / ЗЯ`, `База / Лету` and `База / ММ`
tabs, keeps the newest revision for each business row, and publishes actual
calendar-day facts. It does not spread monthly totals across days.

When the private workbook cannot be exported, the workflow preserves the
committed finalized facts only if they already match the requested cutoff. The
strict close fails as soon as that preserved snapshot is older than the cutoff,
so stale retail facts cannot silently become a new active generation.

The Samokat token alone is not sufficient for ingestion. Configure the private
API endpoint and payload contract with `ALTEA_SAMOKAT_API_BASE_URL` and
`ALTEA_SAMOKAT_SALES_PATH` (plus method/body/query variables when required).
Until then the portal must render Samokat as `Нет данных`, never as a synthetic
zero.

Preflight prints all missing source groups in one failed step and writes the same
state to `portal_daily_close_preflight.json`. It prints names only, never secret
values.

## Workflow Order

`Portal data truth` runs on PRs, pushes to `main`, schedule, and manual dispatch.
It verifies the guard, self-tests, protected non-IU scope, snapshot activation,
and publish gate artifacts.

The truth gate also runs `portal-dashboard-money-kpi-realdata.selftest.js`.
This browser guard renders the dashboard against current repository data and
fails if `Заказы` or `Выкупы` render as units instead of rubles.

`Portal daily close` runs by schedule, manual dispatch, and automatically after a
successful `Portal data truth` run on `main`.

The daily close job order is:

1. Resolve cutoff date and 30-day revision window.
2. Run `scripts/portal-daily-close-preflight.js`.
3. Refresh WB/Ozon/Yandex API facts, then finalized Goldapple/Letu/Megamarket daily facts.
4. Refresh ads, Yandex Market stock, and warehouse stock.
5. Build the price generation in staging, reject date/coverage regressions, and
   activate `smart_price_overlay.json`, `prices.json`, `repricer.json`, and
   `price_update_audit.json` as one generation.
6. Build the remaining canonical non-IU layers and phase 3 publish-gate reconciliation reports.
7. Run `portal-unified-daily-intake.js`. It checks every real `view-*` tab
   against `portal-truth-manifest.json`, verifies source ownership, presence,
   freshness and inclusion in the atomic inventory, then writes one
   `portal_daily_intake.json` receipt.
8. Rebuild `portal_sync_health.json` from that receipt.
9. Run D-1 and numeric gates.
10. Package active generation.
11. Publish to Supabase and verify readback hashes.
12. Upload artifacts.

If preflight fails, steps 3-11 are skipped and no data is published.

### Unified daily intake

`scripts/portal-truth-manifest.json` is the only editable registry for portal
view dependencies. Every visible tab must be registered with one update mode:

- `daily-batch` — all required sources must pass the daily cutoff;
- `hybrid` — combines the atomic daily snapshot with operational user data;
- `operational` — user-managed data that must be included in the atomic
  generation but is not falsely required to have a D-1 marketplace date.

The intake fails closed when a new tab is not registered, a source has no
repair/update owner, a required file is missing or stale, or a view source is
not listed in `runtime_snapshot_inventory.json`. The receipt is itself part of
the active generation, so the portal's Data Health tab shows the same decision
that allowed or blocked publication.

### Price generation gate

Price files are never promoted one by one. The sync first builds all three data
layers in a temporary generation and writes `price_update_audit.json`. Promotion
is allowed only when:

- no marketplace or priced SKU disappears from the last accepted generation;
- the seller/marketplace price pool is counted from `currentFillPrice`,
  `currentPrice`, or list-price fields; a client price alone does not make the
  marketplace price complete;
- SKU keys keep meaningful `_` and `-` characters, including a trailing
  underscore, so distinct registry articles are not merged into one row;
- the latest fact date does not move backwards;
- the last daily slice is at least 55% of the seven-day median SKU coverage;
- WB, Ozon and Yandex Market differ from the common price date by no more than
  three days; a gap above one day remains visible as an audit warning;
- the common price date is no more than three days behind the daily close
  cutoff;
- derived `prices.json` reaches the same fact date as the overlay;
- `overlay`, `prices` and `repricer` carry the same `priceGeneration.id`.

If any check fails, the active price files remain unchanged and the rejected
audit stays in `.portal-truth-output/price-sync/price_update_audit.json`.

## Preflight Artifact

The preflight script writes:

```text
.portal-truth-output/portal_daily_close_preflight.json
```

Important fields:

- `status`: `ok` or `blocked`
- `publish.allowed`: boolean
- `publish.blockingReasons`: human-readable blocker list
- `cutoffDate`: business close date
- `revisionFrom`: start of the 30-day revision window
- `requiredSecrets`: full enforced secret list
- `requiredConfig`: enforced non-secret configuration
- `presentSecretCount`: count only, never secret values
- `missingSecrets`: missing secret names only
- `missingConfig`: missing configuration names only
- `optionalMissingSecrets`: optional hint names that were not configured

The report must never contain secret values.

## Acceptance Criteria After Secrets Are Added

After adding the required secrets, trigger `Portal daily close` manually or wait
for the next automatic run after `Portal data truth` on `main`.

The run is production-ready only when all of the following are true:

- `Portal data truth` on the same `main` head is `success`.
- `Portal daily close` reaches `Publish generation and verify readback`.
- `portal_daily_close_preflight.json` has `status=ok` and `publish.allowed=true`.
- `portal_daily_guard.json` has no blocking reasons and `publish.allowed=true`.
- `portal_metric_reconciliation.json` has zero blocking checks.
- The phase 3 publish reports exist and are not blocking:
  `portal_repricing_reconciliation.json`, `portal_dashboard_reconciliation.json`,
  `portal_plan_reconciliation.json`, `portal_indicator_audit.json`,
  `portal_upload_apply_e2e.json`, `portal_minmax_upload_reconciliation.json`,
  and `portal_cost_upload_reconciliation.json`.
- `sync_portal_generation_to_supabase.py` reports readback with no missing or mismatched hashes.
- The uploaded artifact contains both `portal_daily_guard.json` and `portal_metric_reconciliation.json`.
- The active snapshot manifest verifies successfully.

Warnings are allowed only when they are visible in the reports and non-blocking.

## Local Verification Commands

Use these commands before changing daily close workflow behavior:

```powershell
node scripts/portal-daily-close-preflight.selftest.js
node scripts/portal-daily-close-workflow.selftest.js
node scripts/portal-unified-daily-intake.selftest.js
node scripts/portal-unified-daily-intake.js --contract-only --no-write
node scripts/portal-daily-layer-guard.selftest.js
node scripts/portal-api-max-sync.selftest.js
node scripts/portal-dashboard-money-kpi-realdata.selftest.js
node scripts/price-update-transaction.selftest.js
node scripts/portal-price-source-freshness.selftest.js
python scripts/d1_close_gate.selftest.py
python scripts/sync_portal_generation_to_supabase.selftest.py
node scripts/portal-daily-layer-guard.js --input-dir .portal-truth-output --base-data-dir data --output-dir .portal-truth-output
python scripts/audit_truth_artifact.py --artifact-dir .portal-truth-output
python scripts/post_patch_acceptance.py --repo .
```

Protected scope check:

```powershell
python scripts/verify_full_pr_non_iu_scope.py --base-ref origin/main --head HEAD --include-working-tree
```

For an explicitly requested full-portal refresh that rebuilds the generated
IU/DRR summary, use commit marker `[portal-full-update]` or set
`allow_generated_iu_data=true` in a manual `Portal data truth` run. This mode
permits only `data/iu_drr_summary.json` and generated audit references, then
requires the finance logic guard:

```powershell
python scripts/verify_full_pr_non_iu_scope.py --base-ref origin/main --head HEAD --include-working-tree --allow-generated-iu-data
npm run portal:iu-drr-logic-guard
```

`data/iu_plan.json`, the IU/DRR builder, the client UI, and the last-good finance
snapshot remain protected in this mode.

## Fail-Closed Rules

Do not weaken these rules for a green run:

- Do not add `--no-fail` to production daily close gates.
- Do not publish if any required source is missing.
- Do not publish if `portal_daily_intake.json` is missing, blocked, or does not
  cover every visible portal tab.
- Do not publish if WB/Ozon/Yandex are not on the same cutoff.
- Do not publish if Supabase readback hashes are missing or mismatched.
- Do not publish if price artifacts have different `priceGeneration.id` values
  or `price_update_audit.json` is not `publishAllowed=true`.
- Do not edit generated JSON manually as the permanent fix.
- Do not change protected finance files, formulas, or UI as part of non-IU daily close.

The correct response to a blocked close is to fix the source, builder, sync
configuration, or repository secrets, then rerun the workflow.
