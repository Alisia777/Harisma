#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


REPORT_NAME = "portal_d1_close_report.json"

AUDIT_SOURCE_KEYS = {
    "wb_orders": "wb_supplier_goods",
    "wb_sales_finance": "wb_supplier_goods",
    "wb_ads": "wb_ads",
    "ozon_orders": "ozon_orders",
    "ozon_finance": "ozon_finance",
    "ozon_stock": "ozon_products",
    "yandex_fact": "yandex_fact",
    "company_plan": "company_plan",
}

RUNTIME_SOURCE_KEYS = {
    "wb_orders": [
        {"file": "order_procurement_wb.json", "date_paths": ["window.to", "asOfDate", "generatedAt"]},
        {"file": "order_procurement.json", "date_paths": ["window.to", "asOfDate", "generatedAt"]},
    ],
    "wb_sales_finance": [
        {"file": "platform_trends.json", "date_paths": ["latestMarketplaceDate", "asOfDate", "generatedAt"]},
        {"file": "wb_sales_funnel_report.json", "date_paths": ["period.to", "generatedAt"]},
    ],
    "wb_ads": [
        {"file": "ads_summary.json", "date_paths": ["window.to", "asOfDate", "generatedAt"]},
    ],
    "ozon_orders": [
        {"file": "order_procurement_ozon.json", "date_paths": ["window.to", "asOfDate", "generatedAt"]},
        {"file": "order_procurement.json", "date_paths": ["window.to", "asOfDate", "generatedAt"]},
    ],
    "ozon_finance": [
        {"file": "platform_trends.json", "date_paths": ["latestMarketplaceDate", "asOfDate", "generatedAt"]},
    ],
    "ozon_stock": [
        {"file": "warehouse_stock_overlay.json", "date_paths": ["asOfDate", "generatedAt"]},
    ],
    "yandex_fact": [
        {"file": "order_procurement_ym.json", "date_paths": ["window.to", "asOfDate", "generatedAt"]},
        {"file": "platform_trends.json", "date_paths": ["latestMarketplaceDate", "asOfDate", "generatedAt"]},
    ],
    "company_plan": [
        {"file": "company_plan.json", "date_paths": ["activeMonthKey", "generatedAt"]},
    ],
}


def read_json(path: Path, fallback: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8").lstrip("\ufeff"))
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def date_key(value: Any) -> str:
    text = str(value or "")
    match = re.search(r"\d{4}-\d{2}-\d{2}", text)
    if match:
        return match.group(0)
    month = re.fullmatch(r"\s*(\d{4}-\d{2})\s*", text)
    if month:
        return f"{month.group(1)}-01"
    return ""


def parse_day(value: Any) -> datetime.date | None:
    key = date_key(value)
    if not key:
        return None
    try:
        return datetime.strptime(key, "%Y-%m-%d").date()
    except ValueError:
        return None


def dotted_value(payload: Any, dotted_path: str) -> Any:
    current = payload
    for part in dotted_path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def first_date(payload: Any, paths: list[str]) -> tuple[str, str]:
    for dotted_path in paths:
        found = date_key(dotted_value(payload, dotted_path))
        if found:
            return found, dotted_path
    return "", ""


def expected_d1(policy: dict[str, Any], override: str = "") -> str:
    explicit = date_key(override)
    if explicit:
        return explicit
    timezone = ZoneInfo(str(policy.get("timezone") or "Europe/Moscow"))
    return (datetime.now(timezone).date() - timedelta(days=1)).isoformat()


def source_file(input_dir: Path, base_data_dir: Path, filename: str) -> Path:
    primary = input_dir / filename
    if primary.exists():
        return primary
    return base_data_dir / filename


def observed_from_audit(audit: dict[str, Any], source_key: str) -> dict[str, Any] | None:
    audit_key = AUDIT_SOURCE_KEYS.get(source_key, source_key)
    info = (audit.get("files") or {}).get(audit_key)
    if not isinstance(info, dict):
        return None
    observed = date_key(info.get("to") or info.get("as_of") or info.get("date") or info.get("period_to"))
    if not observed:
        return None
    return {
        "observed_date": observed,
        "origin": "uploaded-source-audit",
        "file": info.get("file") or audit_key,
        "date_path": "files[].to",
        "sha256": info.get("sha256") or "",
    }


def observed_from_runtime(input_dir: Path, base_data_dir: Path, source_key: str) -> dict[str, Any] | None:
    for candidate in RUNTIME_SOURCE_KEYS.get(source_key, []):
        filename = str(candidate["file"])
        path = source_file(input_dir, base_data_dir, filename)
        if not path.exists():
            continue
        payload = read_json(path)
        if payload is None:
            continue
        observed, date_path = first_date(payload, list(candidate.get("date_paths") or []))
        if observed:
            return {
                "observed_date": observed,
                "origin": "runtime-json",
                "file": filename,
                "date_path": date_path,
            }
    return None


def source_check(
    source_key: str,
    source_policy: dict[str, Any],
    expected_date: str,
    audit: dict[str, Any],
    input_dir: Path,
    base_data_dir: Path,
) -> dict[str, Any]:
    required = bool(source_policy.get("required"))
    observed = observed_from_audit(audit, source_key) or observed_from_runtime(input_dir, base_data_dir, source_key)
    check = {
        "source": source_key,
        "required": required,
        "metric_family": list(source_policy.get("metric_family") or []),
        "max_lag_days": int(source_policy.get("max_lag_days") or 0),
        "reopen_days": int(source_policy.get("reopen_days") or 0),
        "expected_date": expected_date,
        "status": "ok",
        "blockingReasons": [],
        "warnings": [],
    }
    if not observed:
        check["status"] = "blocked" if required else "missing"
        message = f"{source_key}: source absent"
        if required:
            check["blockingReasons"].append(message)
        else:
            check["warnings"].append(message)
        return check

    check.update(observed)
    expected_day = parse_day(expected_date)
    observed_day = parse_day(check["observed_date"])
    lag_days = 999 if not expected_day or not observed_day else (expected_day - observed_day).days
    check["lag_days"] = lag_days
    if lag_days < 0:
        check["warnings"].append(f"{source_key}: observed date {check['observed_date']} is after expected cutoff {expected_date}")
    elif lag_days > check["max_lag_days"]:
        check["blockingReasons"].append(
            f"{source_key}: observed date {check['observed_date']} lags expected {expected_date} by {lag_days} days"
        )
    check["status"] = "blocked" if check["blockingReasons"] else ("warning" if check["warnings"] else "ok")
    return check


def mixed_cutoff_checks(checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_family: dict[str, list[dict[str, Any]]] = {}
    for check in checks:
        if check.get("status") in {"blocked", "missing"}:
            continue
        for family in check.get("metric_family") or []:
            by_family.setdefault(str(family), []).append(check)

    results = []
    for family, family_checks in sorted(by_family.items()):
        dated = [item for item in family_checks if item.get("observed_date")]
        dates = sorted({str(item["observed_date"]) for item in dated})
        result = {
            "id": f"mixed-cutoff:{family}",
            "metric_family": family,
            "status": "ok",
            "dates": dates,
            "sources": [
                {"source": item["source"], "observed_date": item.get("observed_date", ""), "required": item.get("required", False)}
                for item in dated
            ],
            "blockingReasons": [],
            "warnings": [],
        }
        if len(dates) > 1:
            required_dates = sorted({str(item["observed_date"]) for item in dated if item.get("required")})
            if len(required_dates) > 1:
                result["status"] = "blocked"
                result["blockingReasons"].append(f"{family}: mixed cutoff dates {', '.join(dates)}")
            else:
                result["status"] = "warning"
                result["warnings"].append(f"{family}: optional source uses a different cutoff date ({', '.join(dates)})")
        results.append(result)
    return results


def build_report(options: argparse.Namespace) -> dict[str, Any]:
    policy = read_json(Path(options.policy), {})
    audit = read_json(Path(options.audit), {}) if options.audit else {}
    input_dir = Path(options.input_dir)
    base_data_dir = Path(options.base_data_dir)
    expected_date = expected_d1(policy, options.expected_date or "")

    source_checks = [
        source_check(key, cfg, expected_date, audit, input_dir, base_data_dir)
        for key, cfg in sorted((policy.get("sources") or {}).items())
    ]
    cutoff_checks = mixed_cutoff_checks(source_checks)
    all_checks = source_checks + cutoff_checks
    blocking_reasons = [
        reason
        for check in all_checks
        for reason in check.get("blockingReasons", [])
    ]
    warnings = [
        reason
        for check in all_checks
        for reason in check.get("warnings", [])
    ]
    status = "blocked" if blocking_reasons else ("warning" if warnings else "ok")
    return {
        "schema": "portal-d1-close-report-v1",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "policy": {
            "file": str(options.policy),
            "version": policy.get("version", ""),
            "timezone": policy.get("timezone", "Europe/Moscow"),
            "business_cutoff": policy.get("business_cutoff", "D-1"),
            "revision_window_days": policy.get("revision_window_days", 30),
            "protected_scope_excluded": policy.get("protected_scope_excluded", []),
        },
        "expected_date": expected_date,
        "status": status,
        "publish_allowed": status != "blocked",
        "summary": {
            "sourceChecks": len(source_checks),
            "cutoffChecks": len(cutoff_checks),
            "blockingChecks": sum(1 for item in all_checks if item["status"] == "blocked"),
            "warningChecks": sum(1 for item in all_checks if item["status"] == "warning"),
        },
        "blockingReasons": blocking_reasons,
        "warnings": warnings,
        "sources": source_checks,
        "cutoffChecks": cutoff_checks,
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate non-IU D-1 source freshness before portal publish")
    parser.add_argument("--policy", default="data/portal_daily_source_policy.json")
    parser.add_argument("--audit", default="")
    parser.add_argument("--input-dir", default="data")
    parser.add_argument("--base-data-dir", default="data")
    parser.add_argument("--expected-date", default="")
    parser.add_argument("--output-dir", default=".portal-truth-output")
    parser.add_argument("--output", default="")
    parser.add_argument("--skip-protected-scope", action="store_true", help="Accepted for workflow parity; protected scope is always excluded.")
    parser.add_argument("--no-fail", action="store_true")
    parser.add_argument("--no-write", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    options = parse_args(argv)
    report = build_report(options)
    output = Path(options.output) if options.output else Path(options.output_dir) / REPORT_NAME
    if not options.no_write:
        write_json(output, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"] == "blocked" and not options.no_fail:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
