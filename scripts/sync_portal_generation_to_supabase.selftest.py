#!/usr/bin/env python3
from __future__ import annotations

import json
import tempfile
from pathlib import Path

from sync_portal_generation_to_supabase import build_rows


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

print("[sync_portal_generation_to_supabase.selftest] OK")
