#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def number(value):
    try:
        return float(str(value or "").replace("\u00a0", "").replace(" ", "").replace(",", "."))
    except Exception:
        return 0.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def target_path(value: str) -> str:
    normalized = value.replace("\\", "/")
    if normalized.startswith("/"):
        return normalized[1:]
    return normalized if normalized.startswith("xl/") else f"xl/{normalized}"


def workbook_sheets(path: Path):
    with zipfile.ZipFile(path) as archive:
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relations = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        by_id = {node.attrib["Id"]: target_path(node.attrib["Target"]) for node in relations}
        return [(sheet.attrib["name"], by_id[sheet.attrib[REL + "id"]]) for sheet in workbook.find(NS + "sheets")]


def xlsx_rows(path: Path, wanted_sheet: str | None = None):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(text.text or "" for text in item.iter(NS + "t")) for item in root.findall(NS + "si")]
        available = workbook_sheets(path)
        _, sheet_path = next((item for item in available if item[0] == wanted_sheet), available[0]) if wanted_sheet else available[0]
        root = ET.fromstring(archive.read(sheet_path))
        result = []
        for row in root.iter(NS + "row"):
            values = {}
            next_col = 1
            for cell in row.findall(NS + "c"):
                ref = cell.attrib.get("r", "")
                match = re.match(r"([A-Z]+)", ref)
                if match:
                    col = 0
                    for char in match.group(1):
                        col = col * 26 + ord(char) - 64
                else:
                    col = next_col
                next_col = col + 1
                value = ""
                cell_type = cell.attrib.get("t")
                node = cell.find(NS + "v")
                if cell_type == "inlineStr":
                    inline = cell.find(NS + "is")
                    value = "".join(text.text or "" for text in inline.iter(NS + "t")) if inline is not None else ""
                elif node is not None:
                    raw = node.text or ""
                    if cell_type == "s":
                        value = shared[int(raw)]
                    else:
                        try:
                            numeric = float(raw)
                            value = int(numeric) if numeric.is_integer() else numeric
                        except Exception:
                            value = raw
                values[col] = value
            if values:
                result.append([values.get(index, "") for index in range(1, max(values) + 1)])
        return result


def newest(input_dir: Path, pattern: str, preferred_name: str = "") -> Path | None:
    preferred = input_dir / preferred_name if preferred_name else None
    if preferred and preferred.exists():
        return preferred
    matches = sorted(input_dir.glob(pattern), key=lambda item: (item.stat().st_mtime_ns, item.name))
    return matches[-1] if matches else None


def audit_ozon_orders(report: dict, input_dir: Path) -> None:
    orders = newest(input_dir, "orders*.csv", "orders (3).csv")
    if not orders:
        return
    statuses = Counter()
    total = 0
    qty = 0.0
    shipment = 0.0
    paid = 0.0
    dates = []
    with orders.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            total += 1
            statuses[row.get("Статус", "")] += 1
            qty += number(row.get("Количество"))
            shipment += number(row.get("Сумма отправления"))
            paid += number(row.get("Оплачено покупателем"))
            if row.get("Принят в обработку"):
                dates.append(str(row["Принят в обработку"])[:10])
    report["files"]["ozon_orders"] = {
        "file": orders.name,
        "sha256": sha256(orders),
        "rows": total,
        "from": min(dates) if dates else "",
        "to": max(dates) if dates else "",
    }
    report["metrics"]["ozon_orders"] = {
        "units": qty,
        "shipment_amount_rub": round(shipment, 2),
        "paid_by_customer_rub": round(paid, 2),
        "statuses": dict(statuses),
    }


def audit_ozon_products(report: dict, input_dir: Path) -> None:
    products = newest(input_dir, "products*.csv", "products (1).csv")
    if not products:
        return
    count = 0
    articles = set()
    totals = Counter()
    statuses = Counter()
    with products.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle, delimiter=";"):
            count += 1
            articles.add(row.get("Артикул", "").lstrip("'"))
            statuses[row.get("Статус товара", "")] += 1
            for key in (
                "Доступно к продаже по схеме FBO, шт.",
                "Зарезервировано, шт",
                "Доступно к продаже по схеме FBS, шт.",
                "Зарезервировано на моих складах, шт",
            ):
                totals[key] += number(row.get(key))
    report["files"]["ozon_products"] = {"file": products.name, "sha256": sha256(products), "rows": count}
    report["metrics"]["ozon_products"] = {
        "unique_articles": len(articles),
        "stock": dict(totals),
        "statuses": dict(statuses),
    }


def audit_wb_supplier_goods(report: dict, input_dir: Path) -> None:
    supplier = (
        newest(input_dir, "supplier-goods-*-2026-06-*.XLSX", "supplier-goods-109831-2026-06-01-2026-06-20-toqhiibqa.XLSX")
        or newest(input_dir, "supplier-goods-*-2026-06-*.xlsx")
    )
    if not supplier:
        return
    rows = xlsx_rows(supplier)
    if len(rows) < 3:
        return
    header = rows[1]
    data = rows[2:]
    indexes = {value: index for index, value in enumerate(header)}
    names = [
        "шт.",
        "Сумма заказов минус комиссия WB, руб.",
        "Выкупили, шт.",
        "К перечислению за товар, руб.",
        "Текущий остаток, шт.",
    ]
    totals = {
        name: sum(number(row[indexes[name]]) for row in data if name in indexes and len(row) > indexes[name])
        for name in names
    }
    report["files"]["wb_supplier_goods"] = {"file": supplier.name, "sha256": sha256(supplier), "rows": len(data)}
    report["metrics"]["wb_supplier_goods"] = totals


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit uploaded marketplace source files before D-1 close")
    parser.add_argument("--input-dir", default=".")
    parser.add_argument("--output", default="source_audit.json")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    report = {"schema": "uploaded-source-audit-v1", "files": {}, "metrics": {}}
    audit_ozon_orders(report, input_dir)
    audit_ozon_products(report, input_dir)
    audit_wb_supplier_goods(report, input_dir)
    Path(args.output).write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
