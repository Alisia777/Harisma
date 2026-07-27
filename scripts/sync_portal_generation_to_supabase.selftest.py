#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from io import BytesIO
from pathlib import Path
from urllib import error, parse

import sync_portal_generation_to_supabase as publisher
from sync_portal_generation_to_supabase import (
    ACTIVATION_SNAPSHOT_KEYS,
    build_rows,
    cleanup_stale_parts,
    confirm_current_main,
    expected_base_keys,
    retry_delay_seconds,
    retryable_http_status,
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
    staging_rows = [row for row in rows if row["snapshot_key"] not in ACTIVATION_SNAPSHOT_KEYS]
    activation_rows = [row for row in rows if row["snapshot_key"] in ACTIVATION_SNAPSHOT_KEYS]
    assert {row["snapshot_key"] for row in activation_rows} == ACTIVATION_SNAPSHOT_KEYS
    assert all(row["snapshot_key"] not in ACTIVATION_SNAPSHOT_KEYS for row in staging_rows)
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

assert retryable_http_status(520)
assert retryable_http_status(429)
assert not retryable_http_status(400)
assert retry_delay_seconds({"Retry-After": "7"}, "", 0.8) == 7
assert retry_delay_seconds({}, '{"retry_after":60}', 0.8) == 60
assert retry_delay_seconds(
    {
        "Date": "Fri, 24 Jul 2026 19:50:23 GMT",
        "Retry-After": "Fri, 24 Jul 2026 19:51:23 GMT",
    },
    "",
    0.8,
) == 60


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return b'{"ok":true}'


retry_calls = []
retry_sleeps = []


def retrying_urlopen(_request, timeout):
    retry_calls.append(timeout)
    if len(retry_calls) == 1:
        raise error.HTTPError(
            "https://example.supabase.co/rest/v1/snapshots",
            520,
            "Cloudflare origin error",
            {},
            BytesIO(b'{"status":520,"retryable":true,"retry_after":60}'),
        )
    return FakeResponse()


original_urlopen = publisher.request.urlopen
original_sleep = publisher.sleep
publisher.request.urlopen = retrying_urlopen
publisher.sleep = retry_sleeps.append
try:
    response = publisher.rest_request(
        "POST",
        "https://example.supabase.co/rest/v1/snapshots",
        "secret",
        payload=[{"snapshot_key": "dashboard"}],
        attempts=2,
        timeout_seconds=90,
    )
    assert response == {"ok": True}
    assert retry_calls == [90, 90]
    assert retry_sleeps == [60]
finally:
    publisher.request.urlopen = original_urlopen
    publisher.sleep = original_sleep


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


git_commands = []


def fake_git_run(command, **kwargs):
    git_commands.append((command, kwargs))


def fake_git_check_output(command, **_kwargs):
    if command[-1] == "FETCH_HEAD":
        return "abc123\n"
    return "abc123\n"


original_subprocess_run = publisher.subprocess.run
original_check_output = publisher.subprocess.check_output
publisher.subprocess.run = fake_git_run
publisher.subprocess.check_output = fake_git_check_output
try:
    guard = confirm_current_main(Path("/tmp/selftest-repo"))
    assert guard == {"status": "passed", "closeSha": "abc123", "currentMainSha": "abc123"}
    assert git_commands[0][0] == ["git", "fetch", "--no-tags", "--depth=1", "origin", "main", "--quiet"]
    assert git_commands[0][1]["check"] is True
finally:
    publisher.subprocess.run = original_subprocess_run
    publisher.subprocess.check_output = original_check_output


publisher.subprocess.run = fake_git_run
publisher.subprocess.check_output = lambda command, **_kwargs: "new-main\n" if command[-1] == "FETCH_HEAD" else "old-close\n"
try:
    try:
        confirm_current_main(Path("/tmp/selftest-repo"))
        raise AssertionError("obsolete close must be rejected")
    except RuntimeError as exc:
        assert "refusing to activate" in str(exc)
finally:
    publisher.subprocess.run = original_subprocess_run
    publisher.subprocess.check_output = original_check_output

print("[sync_portal_generation_to_supabase.selftest] OK")
