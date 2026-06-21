# Portal Daily Close Runbook

This runbook is the operational contract for the non-IU portal data truth close.
It documents the current production blocker and the exact evidence required before
the portal can be considered self-updating from GitHub.

IU/DRR is intentionally outside this flow.

## Current Status

The data truth code is on `main`, the GitHub workflows are active, and the portal
publish path is fail-closed.

Current external blocker: required GitHub Actions secrets are not configured.

Latest verified blocker evidence:

- workflow: `Portal daily close`
- run: `27912749012`
- branch: `main`
- head SHA: `20dc3f05193ed9b359d9afa8aea820e36a1047be`
- artifact: `portal-daily-close-27912749012`
- artifact digest: `sha256:3b320c08983ce35b70223fd05193020151fb0c2d4cd21f298b48b33724af6efe`
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
ALTEA_YM_CAMPAIGN_ID
ALTEA_YM_BUSINESS_ID
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Optional source-specific secrets can be added later, but these nine are the
minimum production set enforced by preflight.

## Workflow Order

`Portal data truth` runs on PRs, pushes to `main`, schedule, and manual dispatch.
It verifies the guard, self-tests, protected non-IU scope, snapshot activation,
and publish gate artifacts.

`Portal daily close` runs by schedule, manual dispatch, and automatically after a
successful `Portal data truth` run on `main`.

The daily close job order is:

1. Resolve cutoff date and 30-day revision window.
2. Run `scripts/portal-daily-close-preflight.js`.
3. Refresh WB/Ozon/Yandex marketplace facts.
4. Refresh ads and stock.
5. Build canonical non-IU layers.
6. Run D-1 and numeric gates.
7. Package active generation.
8. Publish to Supabase and verify readback hashes.
9. Upload artifacts.

If preflight fails, steps 3-8 are skipped and no data is published.

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
- `presentSecretCount`: count only, never secret values
- `missingSecrets`: missing secret names only

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
- `sync_portal_generation_to_supabase.py` reports readback with no missing or mismatched hashes.
- The uploaded artifact contains both `portal_daily_guard.json` and `portal_metric_reconciliation.json`.
- The active snapshot manifest verifies successfully.

Warnings are allowed only when they are visible in the reports and non-blocking.

## Local Verification Commands

Use these commands before changing daily close workflow behavior:

```powershell
node scripts/portal-daily-close-preflight.selftest.js
node scripts/portal-daily-close-workflow.selftest.js
node scripts/portal-daily-layer-guard.selftest.js
node scripts/portal-api-max-sync.selftest.js
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

## Fail-Closed Rules

Do not weaken these rules for a green run:

- Do not add `--no-fail` to production daily close gates.
- Do not publish if any required source is missing.
- Do not publish if WB/Ozon/Yandex are not on the same cutoff.
- Do not publish if Supabase readback hashes are missing or mismatched.
- Do not edit generated JSON manually as the permanent fix.
- Do not change IU/DRR files, formulas, or UI as part of non-IU daily close.

The correct response to a blocked close is to fix the source, builder, sync
configuration, or repository secrets, then rerun the workflow.
