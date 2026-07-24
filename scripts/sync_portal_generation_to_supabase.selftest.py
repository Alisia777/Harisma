#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from urllib import parse

import sync_portal_generation_to_supabase as publisher
from sync_portal_generation_to_supabase import (
    build_rows,
    cleanup_stale_parts,
    expected_base_keys,
    row_batches,
    stale_part_keys,
)


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
    sized_batches = row_batches(
        [
            {"snapshot_key": "a", "payload": "x" * 40},
            {"snapshot_key": "b", "payload": "x" * 40},
            {"snapshot_key": "c", "payload": "x" * 40},
        ],
        batch_size=10,
        max_batch_bytes=120,
    )
    assert [len(batch) for batch in sized_batches] == [1, 1, 1]
    counted_batches = row_batches(
        [
            {"snapshot_key": "a", "payload": "x"},
            {"snapshot_key": "b", "payload": "x"},
            {"snapshot_key": "c", "payload": "x"},
        ],
        batch_size=2,
        max_batch_bytes=100000,
    )
    assert [len(batch) for batch in counted_batches] == [2, 1]

calls = []


def fake_rest_request(method, url, api_key, payload=None, extra_headers=None, attempts=3, timeout_seconds=60):
    calls.append(
        {
            "method": method,
            "url": url,
            "api_key": api_key,
            "payload": payload,
            "extra_headers": extra_headers,
            "attempts": attempts,
            "timeout_seconds": timeout_seconds,
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
    existing = publisher.fetch_existing_part_keys("https://example.supabase.co", "secret", "snapshots", "Алтея", ["logistics"], 90)
    assert existing == ["logistics__part__0001", "logistics__part__0003"]
    get_calls = [call for call in calls if call["method"] == "GET"]
    assert len(get_calls) == 1
    get_query = parse.parse_qs(parse.urlparse(get_calls[0]["url"]).query)
    assert get_query["brand"] == ["eq.Алтея"]
    assert get_query["order"] == ["snapshot_key.asc"]
    assert get_query["limit"] == ["1000"]
    assert "snapshot_key" not in get_query
    assert get_calls[0]["attempts"] == 2
    assert get_calls[0]["timeout_seconds"] == 10
    deleted = publisher.delete_snapshot_keys("https://example.supabase.co", "secret", "snapshots", "Алтея", ["logistics__part__0003"], 90)
    assert deleted == 1
    delete_calls = [call for call in calls if call["method"] == "DELETE"]
    assert len(delete_calls) == 1
    parsed = parse.urlparse(delete_calls[0]["url"])
    query = parse.parse_qs(parsed.query)
    assert query["brand"] == ["eq.Алтея"]
    assert query["snapshot_key"] == ["in.(logistics__part__0003)"]
    assert delete_calls[0]["extra_headers"] == {"Prefer": "return=minimal"}
    assert delete_calls[0]["attempts"] == 5
    assert delete_calls[0]["timeout_seconds"] == 90
finally:
    publisher.rest_request = original_rest_request


def failing_cleanup_request(*_args, **_kwargs):
    raise TimeoutError("cleanup lookup timed out")


publisher.rest_request = failing_cleanup_request
try:
    cleanup = cleanup_stale_parts(
        "https://example.supabase.co",
        "secret",
        "snapshots",
        "Алтея",
        {"logistics": "root", "logistics__part__0001": "part-1"},
        90,
    )
    assert cleanup["status"] == "warning"
    assert cleanup["stalePartRowsDeleted"] == 0
    assert "cleanup lookup timed out" in cleanup["deferredReason"]
finally:
    publisher.rest_request = original_rest_request

print("[sync_portal_generation_to_supabase.selftest] OK")
