#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import error, parse, request


SNAPSHOT_KEYS = {
    "dashboard": "dashboard.json",
    "skus": "skus.json",
    "platform_trends": "platform_trends.json",
    "logistics": "logistics.json",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_hash(payload: Any) -> str:
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


def infer_generated_at(snapshot_key: str, payload: Any) -> str:
    if isinstance(payload, dict):
        for candidate in (
            payload.get("generatedAt"),
            payload.get("dataFreshness", {}).get("asOfDate"),
            payload.get("window", {}).get("to"),
        ):
            if candidate:
                return str(candidate)
    return utc_now_iso()


def parse_config_js(config_path: Path) -> dict[str, str]:
    text = config_path.read_text(encoding="utf-8")

    def extract(field: str) -> str | None:
        match = re.search(rf"{field}\s*:\s*['\"]([^'\"]+)['\"]", text)
        return match.group(1).strip() if match else None

    return {
        "brand": extract("brand") or "",
        "url": extract("url") or "",
        "anon_key": extract("anonKey") or "",
    }


def rest_request(method: str, url: str, api_key: str, payload: Any | None = None, extra_headers: dict[str, str] | None = None) -> Any:
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if extra_headers:
        headers.update(extra_headers)

    data = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = request.Request(url, data=data, headers=headers, method=method.upper())
    try:
        with request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8")
            if not body.strip():
                return None
            return json.loads(body)
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method.upper()} {url} failed: {exc.code} {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"{method.upper()} {url} failed: {exc.reason}") from exc


def fetch_remote_hashes(base_url: str, api_key: str, table: str, brand: str) -> dict[str, str]:
    params = parse.urlencode({
        "select": "snapshot_key,payload_hash",
        "brand": f"eq.{brand}",
    })
    rows = rest_request("GET", f"{base_url}/rest/v1/{table}?{params}", api_key) or []
    return {
        str(row.get("snapshot_key")): str(row.get("payload_hash") or "")
        for row in rows
        if row.get("snapshot_key")
    }


def build_rows(data_dir: Path, brand: str, source: str) -> list[dict[str, Any]]:
    rows = []
    for snapshot_key, filename in SNAPSHOT_KEYS.items():
        payload = load_json(data_dir / filename)
        rows.append(
            {
                "brand": brand,
                "snapshot_key": snapshot_key,
                "payload": payload,
                "payload_hash": payload_hash(payload),
                "source": source,
                "generated_at": infer_generated_at(snapshot_key, payload),
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync portal data/*.json snapshots to Supabase")
    parser.add_argument("--repo-dir", required=True, help="Portal repo directory containing data/*.json and config.js")
    parser.add_argument("--config-js", help="Path to config.js with Supabase URL and anonKey")
    parser.add_argument("--supabase-url", help="Supabase project URL")
    parser.add_argument("--supabase-key", help="Supabase anon/publishable key with table access")
    parser.add_argument("--brand", help="Portal brand override")
    parser.add_argument("--table", default="portal_data_snapshots", help="Target PostgREST table")
    parser.add_argument("--source", default="google-sheets-bridge", help="Snapshot source label")
    parser.add_argument("--dry-run", action="store_true", help="Print the rows that would be pushed without writing")
    args = parser.parse_args()

    repo_dir = Path(args.repo_dir)
    data_dir = repo_dir / "data"
    config_path = Path(args.config_js) if args.config_js else repo_dir / "config.js"
    cfg = parse_config_js(config_path) if config_path.exists() else {"brand": "", "url": "", "anon_key": ""}

    brand = args.brand or cfg["brand"]
    supabase_url = (args.supabase_url or cfg["url"]).rstrip("/")
    supabase_key = args.supabase_key or cfg["anon_key"]

    if not brand:
        raise SystemExit("Brand is required: pass --brand or provide brand in config.js")
    if not supabase_url or not supabase_key:
        raise SystemExit("Supabase config is required: pass --supabase-url/--supabase-key or provide them in config.js")

    rows = build_rows(data_dir, brand=brand, source=args.source)

    if args.dry_run:
        print("Dry run: snapshots prepared for Supabase")
        for row in rows:
            print(f"  {row['snapshot_key']}: hash={row['payload_hash'][:12]} generated_at={row['generated_at']}")
        return

    try:
        remote_hashes = fetch_remote_hashes(supabase_url, supabase_key, args.table, brand)
    except RuntimeError as exc:
        message = str(exc)
        if "PGRST205" in message or "Could not find the table" in message:
            raise SystemExit(
                f"Supabase table '{args.table}' is missing. "
                f"Apply backend SQL first, for example 2/backend/supabase_schema_v87_snapshots.sql. "
                f"Original error: {message}"
            ) from exc
        raise
    changed_rows = [row for row in rows if remote_hashes.get(row["snapshot_key"]) != row["payload_hash"]]

    if not changed_rows:
        print("Supabase snapshots are already up to date.")
        return

    rest_request(
        "POST",
        f"{supabase_url}/rest/v1/{args.table}?on_conflict=brand,snapshot_key",
        supabase_key,
        payload=changed_rows,
        extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )

    print("Supabase snapshot sync complete:")
    for row in changed_rows:
        print(f"  {row['snapshot_key']}: {row['payload_hash'][:12]}")


if __name__ == "__main__":
    main()
