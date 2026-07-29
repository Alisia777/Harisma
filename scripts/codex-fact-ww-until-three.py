#!/usr/bin/env python3

import json
import os
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone

TOKEN = os.environ.get("WB_FINANCE_TOKEN", "").strip()
OUTPUT_JSON = os.environ.get("OUTPUT_JSON", "/tmp/fact_ww_three.json")
DATE_FROM = os.environ.get("DATE_FROM", "2026-07-25")
DATE_TO = os.environ.get("DATE_TO", "2026-07-29")
MIN_WW = int(os.environ.get("MIN_WW", "3"))
MAX_REPORTS = int(os.environ.get("MAX_REPORTS", "3"))
BASE = "https://finance-api.wildberries.ru"
LIST_URL = f"{BASE}/api/finance/v1/sales-reports/list"
DETAIL_URL = f"{BASE}/api/finance/v1/sales-reports/detailed"
MIN_INTERVAL = 62.0

if not TOKEN:
    raise RuntimeError("WB finance token is empty")

last_request = 0.0


def wait_window():
    global last_request
    elapsed = time.monotonic() - last_request
    if last_request and elapsed < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - elapsed)
    last_request = time.monotonic()


def post(url, body):
    global last_request
    payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    for attempt in range(1, 7):
        wait_window()
        req = urllib.request.Request(url, data=payload, method="POST", headers={
            "Authorization": TOKEN,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Harisma-FACT-WW-three/1.0",
        })
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                if response.status == 204:
                    return []
                text = response.read().decode("utf-8")
                data = json.loads(text) if text else []
                if not isinstance(data, list):
                    raise RuntimeError(f"Expected array, got {type(data).__name__}")
                return data
        except urllib.error.HTTPError as error:
            text = error.read().decode("utf-8", errors="replace")
            if error.code == 429 and attempt < 6:
                retry = error.headers.get("retry-after") or error.headers.get("x-ratelimit-retry") or "62"
                try:
                    delay = max(62.0, float(retry) + 1.0)
                except ValueError:
                    delay = 62.0
                print(f"rate-limited attempt={attempt}; sleeping={delay}", flush=True)
                time.sleep(delay)
                last_request = time.monotonic()
                continue
            raise RuntimeError(f"WB Finance HTTP {error.code}: {text[:1500]}")
    raise RuntimeError("WB Finance retries exhausted")


def num(value):
    try:
        return float(str(value or 0).replace(" ", "").replace(",", "."))
    except ValueError:
        return 0.0


def ww(value):
    raw = str(value or "").strip().upper()
    if not raw or raw == "0":
        return ""
    return raw if raw.startswith("WW") else f"WW{raw}"


def returned(row):
    text = f"{row.get('docTypeName', '')} {row.get('sellerOperName', '')}".lower()
    return "возврат" in text or "return" in text


def summarize(rows):
    groups = defaultdict(lambda: {
        "nmIds": set(), "vendorCodes": set(), "titles": set(), "reportIds": set(),
        "rows": 0, "sales": 0.0, "returns": 0.0,
        "retailSales": 0.0, "retailReturns": 0.0,
        "forPaySales": 0.0, "forPayReturns": 0.0,
        "srids": set(), "orderUids": set(), "discounts": [],
        "orderDates": set(), "saleDates": set(), "reportDates": set(),
    })
    for row in rows:
        key = row.get("articleSubstitutionNormalized") or f"DISCOUNT_WITHOUT_WW:{row.get('discountPrc', 0)}"
        g = groups[key]
        g["rows"] += 1
        for field, target in (("nmId", "nmIds"), ("vendorCode", "vendorCodes"), ("title", "titles"), ("reportId", "reportIds"),
                              ("srid", "srids"), ("orderUid", "orderUids"), ("orderDt", "orderDates"),
                              ("saleDt", "saleDates"), ("rrDate", "reportDates")):
            if row.get(field) not in (None, ""):
                g[target].add(str(row[field]))
        discount = num(row.get("salePriceAffiliatedDiscountPrc"))
        if discount:
            g["discounts"].append(discount)
        quantity = num(row.get("quantity")) or 1
        retail = num(row.get("retailAmount"))
        for_pay = num(row.get("forPay"))
        if returned(row):
            g["returns"] += quantity
            g["retailReturns"] += retail
            g["forPayReturns"] += for_pay
        else:
            g["sales"] += quantity
            g["retailSales"] += retail
            g["forPaySales"] += for_pay
    result = []
    for key, g in groups.items():
        result.append({
            "articleSubstitution": key,
            "nmIds": sorted(g["nmIds"]),
            "vendorCodes": sorted(g["vendorCodes"]),
            "titles": sorted(g["titles"]),
            "reportIds": sorted(g["reportIds"]),
            "rowCount": g["rows"],
            "sales": g["sales"],
            "returns": g["returns"],
            "netBuyouts": g["sales"] - g["returns"],
            "netRetailAmount": g["retailSales"] - g["retailReturns"],
            "netForPay": g["forPaySales"] - g["forPayReturns"],
            "distinctSrids": len(g["srids"]),
            "distinctOrderUids": len(g["orderUids"]),
            "averageDiscountPrc": sum(g["discounts"]) / len(g["discounts"]) if g["discounts"] else 0,
            "orderDates": sorted(g["orderDates"]),
            "saleDates": sorted(g["saleDates"]),
            "reportDates": sorted(g["reportDates"]),
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

reports = post(LIST_URL, {
    "dateFrom": f"{DATE_FROM}T00:00:00",
    "dateTo": f"{DATE_TO}T23:59:59",
    "period": "daily",
    "limit": 1000,
    "offset": 0,
})
reports.sort(key=lambda row: (str(row.get("dateTo", "")), str(row.get("createDate", "")), int(row.get("reportId", 0))), reverse=True)
print(json.dumps({"reportsFound": len(reports), "latest": [
    {"reportId": str(r.get("reportId")), "dateFrom": r.get("dateFrom"), "dateTo": r.get("dateTo"), "createDate": r.get("createDate")}
    for r in reports[:MAX_REPORTS]
]}, ensure_ascii=False), flush=True)

rows = []
report_diagnostics = []
unique_ww = set()
for report in reports[:MAX_REPORTS]:
    report_id = report.get("reportId")
    rrd_id = 0
    pages = 0
    fetched = 0
    nonzero = 0
    while True:
        batch = post(f"{DETAIL_URL}/{report_id}", {"limit": 100000, "rrdId": rrd_id, "fields": fields})
        if not batch:
            break
        pages += 1
        fetched += len(batch)
        for item in batch:
            substitution = ww(item.get("articleSubstitution"))
            discount = num(item.get("salePriceAffiliatedDiscountPrc"))
            if not substitution and discount == 0:
                continue
            item["articleSubstitutionNormalized"] = substitution
            item["discountPrc"] = discount
            rows.append(item)
            nonzero += 1
            if substitution:
                unique_ww.add(substitution)
        next_rrd = max((int(item.get("rrdId", 0)) for item in batch), default=rrd_id)
        if next_rrd <= rrd_id or len(batch) < 100000:
            break
        rrd_id = next_rrd
    diag = {
        "reportId": str(report_id), "dateFrom": report.get("dateFrom"), "dateTo": report.get("dateTo"),
        "createDate": report.get("createDate"), "pageCount": pages, "fetchedRows": fetched,
        "nonZeroRows": nonzero, "uniqueSubstitutionsAfterReport": len(unique_ww),
    }
    report_diagnostics.append(diag)
    print(json.dumps(diag, ensure_ascii=False), flush=True)
    if len(unique_ww) >= MIN_WW:
        break

result = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "query": {"dateFrom": DATE_FROM, "dateTo": DATE_TO, "period": "daily", "minWW": MIN_WW, "maxReports": MAX_REPORTS},
    "reports": report_diagnostics,
    "diagnostics": {
        "reportsFound": len(reports), "reportsFetched": len(report_diagnostics),
        "fetchedRows": sum(item["fetchedRows"] for item in report_diagnostics),
        "nonZeroRows": len(rows), "uniqueSubstitutions": len(unique_ww),
    },
    "summary": summarize(rows),
    "rows": rows,
}
with open(OUTPUT_JSON, "w", encoding="utf-8") as file:
    json.dump(result, file, ensure_ascii=False, indent=2)
print(json.dumps(result["diagnostics"], ensure_ascii=False), flush=True)
