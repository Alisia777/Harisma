#!/usr/bin/env python3

import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone

TOKEN = os.environ.get("WB_FINANCE_TOKEN", "").strip()
OUTPUT_JSON = os.environ.get("OUTPUT_JSON", "/tmp/fact_ww_by_report.json")
DATE_FROM = os.environ.get("DATE_FROM", "2026-07-25")
DATE_TO = os.environ.get("DATE_TO", "2026-07-29")
BASE = "https://finance-api.wildberries.ru"
LIST_URL = f"{BASE}/api/finance/v1/sales-reports/list"
DETAIL_URL = f"{BASE}/api/finance/v1/sales-reports/detailed"
MIN_INTERVAL = 62.0

if not TOKEN:
    raise RuntimeError("WB finance token is empty")

_last_request_at = 0.0


def wait_window():
    global _last_request_at
    elapsed = time.monotonic() - _last_request_at
    if _last_request_at and elapsed < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - elapsed)
    _last_request_at = time.monotonic()


def post_json(url, body, attempts=6):
    global _last_request_at
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    last_error = None
    for attempt in range(1, attempts + 1):
        wait_window()
        request = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Authorization": TOKEN,
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Harisma-FACT-WW-export/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                if response.status == 204:
                    return []
                text = response.read().decode("utf-8")
                result = json.loads(text) if text else []
                if not isinstance(result, list):
                    raise RuntimeError(f"Expected array, got {type(result).__name__}")
                return result
        except urllib.error.HTTPError as error:
            text = error.read().decode("utf-8", errors="replace")
            last_error = RuntimeError(f"WB Finance HTTP {error.code}: {text[:1200]}")
            if error.code == 429 and attempt < attempts:
                retry_raw = error.headers.get("retry-after") or error.headers.get("x-ratelimit-retry") or "62"
                try:
                    retry_seconds = max(62.0, float(retry_raw) + 1.0)
                except ValueError:
                    retry_seconds = 62.0
                time.sleep(retry_seconds)
                _last_request_at = time.monotonic()
                continue
            raise last_error
        except Exception as error:
            last_error = error
            if attempt < attempts:
                time.sleep(10 * attempt)
                continue
            raise
    raise last_error or RuntimeError("WB Finance request failed")


def number(value):
    if value is None or value == "":
        return 0.0
    try:
        return float(str(value).replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def normalize_ww(value):
    raw = str(value or "").strip().upper()
    if not raw or raw == "0":
        return ""
    return raw if raw.startswith("WW") else f"WW{raw}"


def is_return(row):
    text = f"{row.get('docTypeName', '')} {row.get('sellerOperName', '')}".lower()
    return "возврат" in text or "return" in text


def as_iso(value):
    raw = str(value or "").strip()
    if not raw:
        return ""
    return raw


def summarize(rows):
    groups = defaultdict(lambda: {
        "nmIds": set(), "vendorCodes": set(), "titles": set(),
        "rowCount": 0, "sales": 0.0, "returns": 0.0,
        "retailSales": 0.0, "retailReturns": 0.0,
        "forPaySales": 0.0, "forPayReturns": 0.0,
        "srids": set(), "orderUids": set(), "discounts": [],
        "orderDates": set(), "saleDates": set(), "reportDates": set(),
        "reportIds": set(),
    })
    for row in rows:
        ww = row.get("articleSubstitutionNormalized") or f"DISCOUNT_WITHOUT_WW:{row.get('discountPrc', 0)}"
        group = groups[ww]
        group["rowCount"] += 1
        if row.get("nmId"):
            group["nmIds"].add(str(row["nmId"]))
        if row.get("vendorCode"):
            group["vendorCodes"].add(str(row["vendorCode"]))
        if row.get("title"):
            group["titles"].add(str(row["title"]))
        if row.get("srid"):
            group["srids"].add(str(row["srid"]))
        if row.get("orderUid"):
            group["orderUids"].add(str(row["orderUid"]))
        if row.get("reportId"):
            group["reportIds"].add(str(row["reportId"]))
        for source, target in (("orderDt", "orderDates"), ("saleDt", "saleDates"), ("rrDate", "reportDates")):
            if row.get(source):
                group[target].add(str(row[source]))
        discount = number(row.get("salePriceAffiliatedDiscountPrc"))
        if discount:
            group["discounts"].append(discount)
        quantity = number(row.get("quantity")) or 1.0
        retail = number(row.get("retailAmount"))
        for_pay = number(row.get("forPay"))
        if is_return(row):
            group["returns"] += quantity
            group["retailReturns"] += retail
            group["forPayReturns"] += for_pay
        else:
            group["sales"] += quantity
            group["retailSales"] += retail
            group["forPaySales"] += for_pay

    result = []
    for ww, group in groups.items():
        discounts = group["discounts"]
        result.append({
            "articleSubstitution": ww,
            "nmIds": sorted(group["nmIds"]),
            "vendorCodes": sorted(group["vendorCodes"]),
            "titles": sorted(group["titles"]),
            "reportIds": sorted(group["reportIds"]),
            "rowCount": group["rowCount"],
            "sales": group["sales"],
            "returns": group["returns"],
            "netBuyouts": group["sales"] - group["returns"],
            "netRetailAmount": group["retailSales"] - group["retailReturns"],
            "netForPay": group["forPaySales"] - group["forPayReturns"],
            "distinctSrids": len(group["srids"]),
            "distinctOrderUids": len(group["orderUids"]),
            "averageDiscountPrc": sum(discounts) / len(discounts) if discounts else 0,
            "orderDates": sorted(group["orderDates"]),
            "saleDates": sorted(group["saleDates"]),
            "reportDates": sorted(group["reportDates"]),
        })
    result.sort(key=lambda item: (max(item["reportDates"] or [""]), item["rowCount"]), reverse=True)
    return result


fields = [
    "reportId", "rrdId", "rrDate", "createDate", "dateFrom", "dateTo",
    "nmId", "vendorCode", "title", "docTypeName", "sellerOperName", "quantity",
    "retailPrice", "retailAmount", "retailPriceWithDisc", "forPay",
    "orderDt", "saleDt", "srid", "orderUid",
    "articleSubstitution", "salePriceAffiliatedDiscountPrc",
]

reports = post_json(LIST_URL, {
    "dateFrom": f"{DATE_FROM}T00:00:00",
    "dateTo": f"{DATE_TO}T23:59:59",
    "period": "daily",
    "limit": 1000,
    "offset": 0,
})

reports.sort(key=lambda row: (str(row.get("dateTo", "")), str(row.get("createDate", "")), int(row.get("reportId", 0))), reverse=True)
# The requested discount was applied less than 72 h ago. Four latest closed daily reports cover the boundary safely.
selected_reports = reports[:4]
print(json.dumps({
    "reportsFound": len(reports),
    "selectedReports": [
        {"reportId": str(row.get("reportId")), "dateFrom": row.get("dateFrom"), "dateTo": row.get("dateTo"), "createDate": row.get("createDate")}
        for row in selected_reports
    ],
}, ensure_ascii=False))

all_rows = []
diagnostics = []
for report in selected_reports:
    report_id = report.get("reportId")
    rrd_id = 0
    report_rows = 0
    nonzero_rows = 0
    page_count = 0
    while True:
        batch = post_json(f"{DETAIL_URL}/{report_id}", {
            "limit": 100000,
            "rrdId": rrd_id,
            "fields": fields,
        })
        if not batch:
            break
        page_count += 1
        report_rows += len(batch)
        for row in batch:
            ww = normalize_ww(row.get("articleSubstitution"))
            discount = number(row.get("salePriceAffiliatedDiscountPrc"))
            if not ww and discount == 0:
                continue
            nonzero_rows += 1
            row["articleSubstitutionNormalized"] = ww
            row["discountPrc"] = discount
            all_rows.append(row)
        next_rrd = max((int(row.get("rrdId", 0)) for row in batch), default=rrd_id)
        if next_rrd <= rrd_id or len(batch) < 100000:
            break
        rrd_id = next_rrd
    diagnostics.append({
        "reportId": str(report_id),
        "dateFrom": report.get("dateFrom"),
        "dateTo": report.get("dateTo"),
        "createDate": report.get("createDate"),
        "pageCount": page_count,
        "fetchedRows": report_rows,
        "nonZeroRows": nonzero_rows,
    })

result = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "query": {"dateFrom": DATE_FROM, "dateTo": DATE_TO, "period": "daily", "selectedReportCount": len(selected_reports)},
    "reports": diagnostics,
    "diagnostics": {
        "reportsFound": len(reports),
        "reportsFetched": len(selected_reports),
        "fetchedRows": sum(item["fetchedRows"] for item in diagnostics),
        "nonZeroRows": len(all_rows),
        "uniqueSubstitutions": len({row.get("articleSubstitutionNormalized") for row in all_rows if row.get("articleSubstitutionNormalized")}),
    },
    "summary": summarize(all_rows),
    "rows": all_rows,
}

with open(OUTPUT_JSON, "w", encoding="utf-8") as file:
    json.dump(result, file, ensure_ascii=False, indent=2)
print(json.dumps(result["diagnostics"], ensure_ascii=False))
