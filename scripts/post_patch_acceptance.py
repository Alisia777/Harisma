#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
import math
import re
import sys
from pathlib import Path

MOJIBAKE = re.compile(r'(Р[\x80-\xBFА-Яа-я]|С[\x80-\xBF]|���|�)')
WIN_PATH = re.compile(r'(?i)[A-Z]:\\(?:Users|Documents|Downloads|OneDrive|Рабочий)\\')

def load(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding='utf-8-sig'))
    except FileNotFoundError:
        return default

def fail(errors, message):
    errors.append(message)

def platform_month_total(payload, key, month, metric='revenue'):
    platform = next((p for p in payload.get('platforms', []) if str(p.get('key','')).lower() == key), None)
    if not platform:
        return 0.0
    total = 0.0
    for point in platform.get('series', []):
        date = str(point.get('date') or point.get('label') or '')[:10]
        if date.startswith(month):
            value = point.get(metric)
            try:
                if value is not None and math.isfinite(float(value)):
                    total += float(value)
            except (TypeError, ValueError):
                pass
    return total

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', default='.')
    ns = ap.parse_args()
    repo = Path(ns.repo).resolve()
    data = repo / 'data'
    errors, warnings = [], []

    dashboard = load(data/'dashboard.json', {})
    health = load(data/'portal_sync_health.json', {})
    aliases = load(data/'sku_aliases.json', {})
    last_aliases = load(data/'last_good'/'sku_aliases.json', {})
    oos = load(data/'oos_control.json', {})
    leaderboard = load(data/'product_leaderboard.json', {})
    repricer = load(data/'repricer.json', {})
    trends = load(data/'platform_trends.json', {})

    public = [dashboard, health, aliases, oos, leaderboard, repricer, trends]
    run_ids = {str(x.get('runId','')).strip() for x in public if isinstance(x, dict) and x}
    if '' in run_ids or len(run_ids) != 1:
        fail(errors, f'public snapshots must share one non-empty runId, got {sorted(run_ids)}')

    cards = dashboard.get('cards', []) if isinstance(dashboard, dict) else []
    ids = [str(c.get('metricId') or c.get('id') or '').strip() for c in cards]
    if cards and (not all(ids) or len(ids) != len(set(ids))):
        fail(errors, 'dashboard cards must have unique metricId/id')
    if len(cards) > 30:
        fail(errors, f'dashboard cards unexpectedly high: {len(cards)}')
    for c in cards:
        text = f"{c.get('label','')} {c.get('hint','')}"
        if MOJIBAKE.search(text):
            fail(errors, f'mojibake in dashboard card: {text[:120]}')

    active = dashboard.get('companyPlan', {}).get('activeMonth', {}) if isinstance(dashboard, dict) else {}
    month = str(active.get('monthKey') or dashboard.get('dataFreshness',{}).get('googleSheetsMonth') or '')
    if month and trends:
        scoped = sum(platform_month_total(trends, p, month) for p in ('wb','ozon','ya'))
        fact = active.get('factRevenueToDate')
        if fact is not None and abs(float(fact)-scoped) > max(1.0, scoped*1e-6):
            fail(errors, f'payroll fact must equal WB+Ozon+Ya: dashboard={fact}, scoped={scoped}')

    current_aliases = aliases.get('aliases', []) if isinstance(aliases, dict) else aliases or []
    previous_aliases = last_aliases.get('aliases', []) if isinstance(last_aliases, dict) else last_aliases or []
    authoritative_empty = bool(isinstance(aliases, dict) and aliases.get('authoritativeEmpty'))
    if len(previous_aliases) > 0 and len(current_aliases) == 0 and not authoritative_empty:
        fail(errors, f'alias regression remains: {len(previous_aliases)} -> 0')

    rows = oos.get('rows', []) if isinstance(oos, dict) else []
    summary = oos.get('summary', {}) if isinstance(oos, dict) else {}
    expected_oos = sum(1 for r in rows if r.get('status') == 'oos')
    expected_critical = sum(1 for r in rows if r.get('severity') == 'critical')
    if rows and summary.get('oosCount') != expected_oos:
        fail(errors, f'oosCount mismatch: {summary.get("oosCount")} != {expected_oos}')
    if rows and summary.get('criticalCount') != expected_critical:
        fail(errors, f'criticalCount mismatch: {summary.get("criticalCount")} != {expected_critical}')

    items = leaderboard.get('items', []) if isinstance(leaderboard, dict) else []
    unmatched = leaderboard.get('unmatchedItems', []) if isinstance(leaderboard, dict) else []
    totals = leaderboard.get('totals', {}) if isinstance(leaderboard, dict) else {}
    lsum = leaderboard.get('summary', {}) if isinstance(leaderboard, dict) else {}
    if leaderboard:
        if totals.get('brandRows') != len(items)+len(unmatched):
            fail(errors, 'leaderboard brandRows must equal matched+unmatched')
        if totals.get('matchedRows') != len(items):
            fail(errors, 'leaderboard matchedRows must equal len(items)')
        if lsum.get('skuCount') != len(items):
            fail(errors, 'leaderboard summary.skuCount must equal len(items)')
        for item in items:
            for field in ('revenue','income'):
                if item.get(field) is not None and not item.get(f'{field}Provenance') and not item.get('provenance',{}).get(field):
                    warnings.append(f'leaderboard {item.get("articleKey")}: missing {field} provenance')

    for row in repricer.get('rows', []) if isinstance(repricer, dict) else []:
        for platform in ('wb','ozon'):
            side = row.get(platform) or {}
            unknown_stock = side.get('stockState') == 'unknown' or side.get('procurementSnapshotAvailable') is False
            unknown_cost = side.get('costState') == 'unknown' or row.get('cost') is None
            changed = abs(float(side.get('recPrice') or 0)-float(side.get('currentPrice') or 0)) >= 1
            if (unknown_stock or unknown_cost) and changed and str(side.get('action') or side.get('strategy') or '').upper() not in ('BLOCK_DATA','BLOCK'):
                fail(errors, f'repricer changes price on unknown data: {row.get("articleKey")} {platform}')

    for path in data.glob('*.json'):
        text = path.read_text(encoding='utf-8-sig', errors='replace')
        if WIN_PATH.search(text):
            fail(errors, f'absolute Windows path in public snapshot: {path.name}')

    index = (repo/'index.html').read_text(encoding='utf-8', errors='replace') if (repo/'index.html').exists() else ''
    if 'Response.prototype.json' in index or '__ALTEA_RESPONSE_JSON_GUARD__' in index:
        fail(errors, 'production index still monkey-patches Response.prototype.json')
    if MOJIBAKE.search(index):
        fail(errors, 'mojibake remains in index.html')

    if warnings:
        print('WARNINGS:')
        for w in warnings[:50]: print(f'- {w}')
    if errors:
        print('ACCEPTANCE FAILED:', file=sys.stderr)
        for e in errors: print(f'- {e}', file=sys.stderr)
        return 2
    print('OK: post-patch numeric/runtime acceptance passed')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
