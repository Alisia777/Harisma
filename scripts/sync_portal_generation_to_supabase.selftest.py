#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from urllib import parse

import sync_portal_generation_to_supabase as publisher
from sync_portal_generation_to_supabase import build_rows, expected_base_keys, stale_part_keys


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


with tempfile.TemporaryDirectory(prefix="portal-generation-publish-") as tmp:
    repo = Path(tmp)
    write_json(repo / "data" / "dashboard.json", {"generatedAt": "2026-06-20T07:00:00Z", "cards": [{"id": "fact"}]})
    write_json(repo / "data" / "platform_trends.json", {"generatedAt": "2026-06-20T07:00:00Z", "latestMarketplaceDate": "2026-06-20"})
    write_json(
        repo / "data" / "active_snapshot.json",
        {
            "schema": "portal-active-snapshot-manifest-v1",
            "runId": "portal-selftest",
            "fingerprint": "selftest-fingerprint",
            "generatedAt": "2026-06-20T07:00:00Z",
            "artifacts": [
                {"path": "data/dashboard.json", "sha256": "x", "bytes": 1},
                {"path": "data/platform_trends.json", "sha256": "y", "bytes": 1},
            ],
        },
    )
    manifest, rows, hashes = build_rows(
        repo,
        repo / "data" / "active_snapshot.json",
        brand="Алтея",
        source="selftest",
    )
    assert manifest["runId"] == "portal-selftest"
    keys = {row["snapshot_key"] for row in rows}
    assert {"dashboard", "platform_trends", "active_snapshot", "active_snapshot_manifest"} <= keys
    protected_key = "iu" + "_drr_summary"
    assert protected_key not in keys
    assert len(hashes) == len(keys)
    assert "dashboard" in expected_base_keys(hashes)
    assert stale_part_keys(hashes, ["dashboard__part__0001", "dashboard__part__0002"]) == [
        "dashboard__part__0001",
        "dashboard__part__0002",
    ]
    chunked_hashes = {
        "logistics": "root",
        "logistics__part__0001": "part-1",
        "logistics__part__0002": "part-2",
    }
    assert expected_base_keys(chunked_hashes) == ["logistics"]
    assert stale_part_keys(chunked_hashes, ["logistics__part__0001", "logistics__part__0002", "logistics__part__0003"]) == [
        "logistics__part__0003",
    ]

calls = []


def fake_rest_request(method, url, api_key, payload=None, extra_headers=None, attempts=3):
    calls.append(
        {
            "method": method,
            "url": url,
            "api_key": api_key,
            "payload": payload,
            "extra_headers": extra_headers,
            "attempts": attempts,
        }
    )
    if method == "GET":
        return [
            {"snapshot_key": "logistics__part__0001"},
            {"snapshot_key": "logistics__part__0003"},
            {"snapshot_key": "logistics_backup__part__0001"},
        ]
    return None


original_rest_request = publisher.rest_request
publisher.rest_request = fake_rest_request
try:
    existing = publisher.fetch_existing_part_keys("https://example.supabase.co", "secret", "snapshots", "Алтея", ["logistics"])
    assert existing == ["logistics__part__0001", "logistics__part__0003"]
    deleted = publisher.delete_snapshot_keys("https://example.supabase.co", "secret", "snapshots", "Алтея", ["logistics__part__0003"])
    assert deleted == 1
    delete_calls = [call for call in calls if call["method"] == "DELETE"]
    assert len(delete_calls) == 1
    parsed = parse.urlparse(delete_calls[0]["url"])
    query = parse.parse_qs(parsed.query)
    assert query["brand"] == ["eq.Алтея"]
    assert query["snapshot_key"] == ["in.(logistics__part__0003)"]
    assert delete_calls[0]["extra_headers"] == {"Prefer": "return=minimal"}
finally:
    publisher.rest_request = original_rest_request

print("[sync_portal_generation_to_supabase.selftest] OK")
