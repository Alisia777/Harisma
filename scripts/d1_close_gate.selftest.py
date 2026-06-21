#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from d1_close_gate import build_report, parse_args


POLICY = {
    "schema": "portal-daily-source-policy-v1",
    "version": "selftest",
    "timezone": "Europe/Moscow",
    "business_cutoff": "D-1",
    "revision_window_days": 30,
    "protected_scope_excluded": ["protected_daily_scope"],
    "sources": {
        "wb_orders": {"required": True, "max_lag_days": 1, "metric_family": ["orders"], "reopen_days": 14},
        "ozon_orders": {"required": True, "max_lag_days": 1, "metric_family": ["orders"], "reopen_days": 30},
        "wb_ads": {"required": True, "max_lag_days": 1, "metric_family": ["ad_spend"], "reopen_days": 14},
    },
}


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_case(root: Path, expected_date: str = "2026-06-20"):
    return build_report(
        parse_args(
            [
                "--policy",
                str(root / "policy.json"),
                "--input-dir",
                str(root / "data"),
                "--base-data-dir",
                str(root / "data"),
                "--expected-date",
                expected_date,
                "--no-write",
                "--no-fail",
            ]
        )
    )


with tempfile.TemporaryDirectory(prefix="portal-d1-close-") as tmp:
    root = Path(tmp)
    data = root / "data"
    write_json(root / "policy.json", POLICY)
    write_json(data / "order_procurement_wb.json", {"window": {"to": "2026-06-20"}, "rows": [{"id": 1}]})
    write_json(data / "order_procurement_ozon.json", {"window": {"to": "2026-06-20"}, "rows": [{"id": 1}]})
    write_json(data / "ads_summary.json", {"window": {"to": "2026-06-19"}, "itemSeries": [{"date": "2026-06-19"}]})

    clean = run_case(root)
    assert clean["status"] == "ok", clean
    assert clean["publish_allowed"] is True

    write_json(data / "ads_summary.json", {"window": {"to": "2026-06-18"}, "itemSeries": [{"date": "2026-06-18"}]})
    stale = run_case(root)
    assert stale["status"] == "blocked", stale
    assert any("wb_ads" in reason for reason in stale["blockingReasons"])

    write_json(data / "ads_summary.json", {"window": {"to": "2026-06-19"}, "itemSeries": [{"date": "2026-06-19"}]})
    write_json(data / "order_procurement_ozon.json", {"window": {"to": "2026-06-19"}, "rows": [{"id": 1}]})
    mixed = run_case(root)
    assert mixed["status"] == "blocked", mixed
    assert any("mixed cutoff" in reason for reason in mixed["blockingReasons"])

print("[d1_close_gate.selftest] OK")
