#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from time import sleep
from typing import Any
from urllib import error, parse, request


SNAPSHOT_TABLE = "portal_data_snapshots"
DEFAULT_BRAND = "Алтея"
INLINE_BODY_LIMIT = 18000
CHUNK_SIZE = 500000
REPORT_NAME = "portal_supabase_generation_publish.json"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8").lstrip("\ufeff"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def canonical_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_hash(payload: Any) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_config_js(config_path: Path) -> dict[str, str]:
    if not config_path.exists():
        return {}
    text = config_path.read_text(encoding="utf-8")

    def extract(field: str) -> str:
        match = re.search(rf"{field}\s*:\s*['\"]([^'\"]+)['\"]", text)
        return match.group(1).strip() if match else ""

    return {"brand": extract("brand"), "url": extract("url"), "anon_key": extract("anonKey")}


def generated_at(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        for candidate in (
            payload.get("generatedAt"),
            payload.get("activatedAt"),
            payload.get("dataFreshness", {}).get("asOfDate") if isinstance(payload.get("dataFreshness"), dict) else "",
            payload.get("window", {}).get("to") if isinstance(payload.get("window"), dict) else "",
        ):
            if candidate:
                return str(candidate)
    return fallback


def snapshot_key_for(path_value: str) -> str:
    normalized = path_value.replace("\\", "/")
    if normalized.startswith("data/"):
        normalized = normalized[len("data/") :]
    if normalized.endswith(".json"):
        normalized = normalized[:-5]
    return normalized.replace("/", "__")


def rest_request(
    method: str,
    url: str,
    api_key: str,
    payload: Any | None = None,
    extra_headers: dict[str, str] | None = None,
    attempts: int = 3,
) -> Any:
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json; charset=utf-8"
    if extra_headers:
        headers.update(extra_headers)
    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        req = request.Request(url, data=data, headers=headers, method=method.upper())
        try:
            with request.urlopen(req, timeout=30) as response:
                body = response.read().decode("utf-8")
                return json.loads(body) if body.strip() else None
        except error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            last_error = RuntimeError(f"{method.upper()} {url} failed: {exc.code} {body}")
        except error.URLError as exc:
            last_error = RuntimeError(f"{method.upper()} {url} failed: {exc.reason}")
        if attempt < attempts:
            sleep(0.8 * attempt)
    assert last_error is not None
    raise last_error


def upsert_rows(base_url: str, api_key: str, table: str, rows: list[dict[str, Any]], batch_size: int) -> None:
    url = f"{base_url}/rest/v1/{table}?on_conflict=brand,snapshot_key"
    for index in range(0, len(rows), batch_size):
        rest_request(
            "POST",
            url,
            api_key,
            payload=rows[index : index + batch_size],
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )


def fetch_hashes(base_url: str, api_key: str, table: str, brand: str, keys: list[str]) -> dict[str, str]:
    if not keys:
        return {}
    result: dict[str, str] = {}
    for index in range(0, len(keys), 80):
        chunk = keys[index : index + 80]
        params = parse.urlencode(
            {
                "select": "snapshot_key,payload_hash",
                "brand": f"eq.{brand}",
                "snapshot_key": f"in.({','.join(chunk)})",
            }
        )
        rows = rest_request("GET", f"{base_url}/rest/v1/{table}?{params}", api_key) or []
        for row in rows:
            result[str(row.get("snapshot_key"))] = str(row.get("payload_hash") or "")
    return result


def expected_base_keys(expected_hashes: dict[str, str]) -> list[str]:
    return sorted({key.split("__part__", 1)[0] for key in expected_hashes})


def stale_part_keys(expected_hashes: dict[str, str], existing_part_keys: list[str]) -> list[str]:
    expected = set(expected_hashes)
    return sorted({key for key in existing_part_keys if "__part__" in key and key not in expected})


def fetch_existing_part_keys(base_url: str, api_key: str, table: str, brand: str, base_keys: list[str]) -> list[str]:
    result: set[str] = set()
    for base_key in base_keys:
        prefix = f"{base_key}__part__"
        params = parse.urlencode(
            {
                "select": "snapshot_key",
                "brand": f"eq.{brand}",
                "snapshot_key": f"like.{prefix}*",
            }
        )
        rows = rest_request("GET", f"{base_url}/rest/v1/{table}?{params}", api_key) or []
        for row in rows:
            snapshot_key = str(row.get("snapshot_key") or "")
            if snapshot_key.startswith(prefix):
                result.add(snapshot_key)
    return sorted(result)


def delete_snapshot_keys(base_url: str, api_key: str, table: str, brand: str, keys: list[str]) -> int:
    deleted = 0
    for index in range(0, len(keys), 80):
        chunk = keys[index : index + 80]
        params = parse.urlencode(
            {
                "brand": f"eq.{brand}",
                "snapshot_key": f"in.({','.join(chunk)})",
            }
        )
        rest_request("DELETE", f"{base_url}/rest/v1/{table}?{params}", api_key, extra_headers={"Prefer": "return=minimal"})
        deleted += len(chunk)
    return deleted


def chunk_rows(row: dict[str, Any]) -> list[dict[str, Any]]:
    inline = json.dumps([row], ensure_ascii=False)
    if len(inline.encode("utf-8")) <= INLINE_BODY_LIMIT:
        return [row]

    payload_text = json.dumps(row["payload"], ensure_ascii=False)
    chunks = [payload_text[index : index + CHUNK_SIZE] for index in range(0, len(payload_text), CHUNK_SIZE)]
    root = {
        **row,
        "payload": {
            "chunked": True,
            "encoding": "utf8-json",
            "chunk_count": len(chunks),
            "generatedAt": row["generated_at"],
            "payload_hash": row["payload_hash"],
        },
    }
    parts = [
        {
            **row,
            "snapshot_key": f"{row['snapshot_key']}__part__{index + 1:04d}",
            "payload": {"data": chunk},
            "payload_hash": text_hash(chunk),
        }
        for index, chunk in enumerate(chunks)
    ]
    return [root, *parts]


def build_rows(repo_dir: Path, manifest_path: Path, brand: str, source: str) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, str]]:
    manifest = read_json(manifest_path)
    run_id = str(manifest.get("runId") or "").strip()
    fingerprint = str(manifest.get("fingerprint") or "").strip()
    if not run_id or not fingerprint:
        raise SystemExit(f"Active manifest must contain runId and fingerprint: {manifest_path}")

    rows: list[dict[str, Any]] = []
    expected_hashes: dict[str, str] = {}
    generated_fallback = str(manifest.get("activatedAt") or manifest.get("generatedAt") or utc_now_iso())
    artifacts = list(manifest.get("artifacts") or [])
    for artifact in artifacts:
        rel = str(artifact.get("path") or "").replace("\\", "/")
        if not rel or not rel.startswith("data/"):
            continue
        file_path = repo_dir / rel
        if not file_path.exists():
            raise SystemExit(f"Manifest artifact is missing: {rel}")
        payload = read_json(file_path)
        key = snapshot_key_for(rel)
        digest = payload_hash(payload)
        row = {
            "brand": brand,
            "snapshot_key": key,
            "payload": payload,
            "payload_hash": digest,
            "source": source,
            "generated_at": generated_at(payload, generated_fallback),
        }
        for upload_row in chunk_rows(row):
            rows.append(upload_row)
            expected_hashes[upload_row["snapshot_key"]] = upload_row["payload_hash"]

    for key, payload in {
        "active_snapshot": manifest,
        "active_snapshot_manifest": manifest,
    }.items():
        digest = payload_hash(payload)
        row = {
            "brand": brand,
            "snapshot_key": key,
            "payload": payload,
            "payload_hash": digest,
            "source": source,
            "generated_at": generated_fallback,
        }
        rows.append(row)
        expected_hashes[key] = digest

    return manifest, rows, expected_hashes


def resolve_options() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Publish one active portal generation to Supabase and verify readback hashes")
    parser.add_argument("--repo-dir", default=".")
    parser.add_argument("--manifest", default="data/active_snapshot.json")
    parser.add_argument("--config-js", default="config.js")
    parser.add_argument("--supabase-url", default="")
    parser.add_argument("--supabase-key", default="")
    parser.add_argument("--brand", default="")
    parser.add_argument("--table", default=SNAPSHOT_TABLE)
    parser.add_argument("--source", default="portal-generation")
    parser.add_argument("--output-dir", default=".portal-truth-output")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verify-readback", action="store_true")
    parser.add_argument("--batch-size", type=int, default=20)
    parser.add_argument("--no-fail", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = resolve_options()
    repo_dir = Path(args.repo_dir).resolve()
    config = parse_config_js(repo_dir / args.config_js)
    brand = args.brand or os.getenv("ALTEA_PORTAL_BRAND") or config.get("brand") or DEFAULT_BRAND
    supabase_url = (args.supabase_url or os.getenv("SUPABASE_URL") or os.getenv("ALTEA_SUPABASE_URL") or config.get("url") or "").rstrip("/")
    supabase_key = (
        args.supabase_key
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("ALTEA_SUPABASE_SERVICE_ROLE_KEY")
        or os.getenv("ALTEA_SUPABASE_KEY")
        or ""
    )
    manifest_path = (repo_dir / args.manifest).resolve()
    source = args.source
    manifest, rows, expected_hashes = build_rows(repo_dir, manifest_path, brand, source)
    report = {
        "schema": "portal-supabase-generation-publish-v1",
        "generatedAt": utc_now_iso(),
        "status": "ok",
        "publish_allowed": True,
        "dry_run": bool(args.dry_run),
        "brand": brand,
        "table": args.table,
        "runId": manifest.get("runId"),
        "fingerprint": manifest.get("fingerprint"),
        "rowCount": len(rows),
        "snapshotKeys": sorted(expected_hashes),
        "blockingReasons": [],
        "warnings": [],
        "cleanup": {
            "stalePartRowsDeleted": 0,
            "stalePartRows": [],
        },
        "readback": {},
    }

    if args.dry_run:
        write_json(Path(args.output_dir) / REPORT_NAME, report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0

    if not supabase_url or not supabase_key:
        report["status"] = "blocked"
        report["publish_allowed"] = False
        report["blockingReasons"].append("Supabase URL and service-role key are required for generation publish")
    else:
        try:
            existing_part_rows = fetch_existing_part_keys(supabase_url, supabase_key, args.table, brand, expected_base_keys(expected_hashes))
            stale_parts = stale_part_keys(expected_hashes, existing_part_rows)
            if stale_parts:
                report["cleanup"]["stalePartRowsDeleted"] = delete_snapshot_keys(supabase_url, supabase_key, args.table, brand, stale_parts)
                report["cleanup"]["stalePartRows"] = stale_parts[:50]
            upsert_rows(supabase_url, supabase_key, args.table, rows, max(1, args.batch_size))
            if args.verify_readback:
                remote = fetch_hashes(supabase_url, supabase_key, args.table, brand, sorted(expected_hashes))
                missing = sorted(set(expected_hashes) - set(remote))
                mismatched = sorted(key for key, digest in expected_hashes.items() if remote.get(key) and remote.get(key) != digest)
                report["readback"] = {"missing": missing, "mismatched": mismatched, "checked": len(remote)}
                if missing or mismatched:
                    report["status"] = "blocked"
                    report["publish_allowed"] = False
                    report["blockingReasons"].append(
                        f"Supabase readback hash mismatch: missing={len(missing)}, mismatched={len(mismatched)}"
                    )
        except Exception as exc:  # noqa: BLE001
            report["status"] = "blocked"
            report["publish_allowed"] = False
            report["blockingReasons"].append(str(exc))

    write_json(Path(args.output_dir) / REPORT_NAME, report)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["status"] == "blocked" and not args.no_fail:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
