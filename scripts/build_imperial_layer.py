#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from datetime import datetime
import numpy as np
import pandas as pd


def clean(value):
    if pd.isna(value):
        return None
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        if math.isfinite(float(value)):
            return round(float(value), 4)
        return None
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "isoformat") and not isinstance(value, str):
        try:
            return value.isoformat()
        except Exception:
            pass
    return value


def recs(df, columns):
    return [{k: clean(v) for k, v in row.items()} for row in df[columns].to_dict(orient="records")]


def extract_day_offset(col: str) -> int:
    match = re.search(r"(\d+)\s*дн\.\s*назад", str(col))
    return int(match.group(1)) if match else 0


def price_for_platform(sku: dict, platform: str) -> float:
    if platform == "wb":
        value = sku.get("wb", {}).get("currentPrice")
        if value is not None:
            return float(value)
    if platform == "ozon":
        value = sku.get("ozon", {}).get("currentPrice")
        if value is not None:
            return float(value)
    values = []
    for key in ("wb", "ozon"):
        value = sku.get(key, {}).get("currentPrice")
        if value is not None:
            values.append(float(value))
    revenue = sku.get("planFact", {}).get("factFeb26Revenue")
    units = sku.get("planFact", {}).get("factFeb26Units")
    if revenue and units:
        values.append(float(revenue) / float(units))
    return float(np.mean(values)) if values else 0.0


def margin_pct_for_platform(sku: dict, platform: str) -> float:
    if platform == "wb":
        value = sku.get("wb", {}).get("marginPct")
        if value is not None:
            return float(value)
    if platform == "ozon":
        value = sku.get("ozon", {}).get("marginPct")
        if value is not None:
            return float(value)
    value = sku.get("planFact", {}).get("factFeb26MarginPct")
    if value is not None:
        return float(value)
    values = []
    for key in ("wb", "ozon"):
        value = sku.get(key, {}).get("marginPct")
        if value is not None:
            values.append(float(value))
    return float(np.mean(values)) if values else 0.0


def read_wb_supplier(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, header=1)
    df.columns = [str(c).strip() for c in df.columns]
    rename = {
        df.columns[0]: "brand",
        "Предмет": "category",
        "Наименование": "name",
        "Артикул продавца": "article",
        "Артикул WB": "wbArticle",
        "Склад": "warehouse",
        "шт.": "ordersUnits",
        "Сумма заказов минус комиссия WB, руб.": "orderRevenueNet",
        "Выкупили, шт.": "buyoutsUnits",
        "К перечислению за товар, руб.": "payout",
        "Текущий остаток, шт.": "stock",
    }
    df = df.rename(columns=rename)
    df["article_norm"] = df["article"].astype(str).str.strip().str.lower()
    df["brand"] = df["brand"].astype(str).str.strip()
    for col in ["ordersUnits", "orderRevenueNet", "buyoutsUnits", "payout", "stock"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    return df


def build(args: argparse.Namespace) -> None:
    repo = Path(args.repo_dir)
    data_dir = repo / "data"

    with open(data_dir / "skus.json", encoding="utf-8") as f:
        skus = json.load(f)
    with open(data_dir / "seed_comments.json", encoding="utf-8") as f:
        seed = json.load(f)

    for sku in skus:
        if sku.get("owner", {}).get("name") == "Кирилл":
            sku["owner"]["name"] = "Олеся"
            sku["owner"]["source"] = ((sku["owner"].get("source") or "").strip() + " · override 2026-04").strip(" ·")
        if sku.get("article") == "retinol_boost_krem_dlya_vek_30ml":
            sku.setdefault("owner", {})
            sku["owner"]["name"] = "Олеся"
            sku["owner"]["source"] = "manual override 2026-04"
            sku.setdefault("flags", {})
            sku["flags"]["assigned"] = True

    for task in seed.get("tasks", []):
        if task.get("owner") == "Кирилл":
            task["owner"] = "Олеся"

    sku_map = {sku["article"]: sku for sku in skus}
    article_set = {sku["article"] for sku in skus}
    owner_map = {sku["article"]: (sku.get("owner") or {}).get("name") for sku in skus}
    name_map = {sku["article"]: sku.get("name") for sku in skus}

    # platform trends
    d37 = pd.read_excel(args.data37, sheet_name="Export")
    d37.columns = [str(c).strip() for c in d37.columns]
    altea37 = d37[d37["Бренд"].astype(str).str.strip().str.lower().eq(args.brand.lower())].copy()
    altea37["article_norm"] = altea37["Артикул"].astype(str).str.strip().str.lower()

    platform_patterns = {
        "wb": lambda c: c.startswith("Заказы, шт. ") and "дн. назад (wb)" in c,
        "ozon": lambda c: c.startswith("Заказы, шт. ") and "дн. назад (oz)" in c,
        "ya": lambda c: c.startswith("Заказы, шт. ") and "дн. назад (ya)" in c,
        "all": lambda c: c.startswith("Заказы, шт. ") and "дн. назад" in c and "(wb)" not in c and "(oz)" not in c and "(ya)" not in c,
    }

    trend_series = {}
    for platform, predicate in platform_patterns.items():
        cols = sorted([c for c in altea37.columns if predicate(c)], key=extract_day_offset, reverse=True)
        series = []
        for col in cols:
            day = extract_day_offset(col)
            units = pd.to_numeric(altea37[col], errors="coerce").fillna(0)
            revenue = 0.0
            margin = 0.0
            for idx, row in altea37.iterrows():
                qty = float(units.loc[idx]) if not pd.isna(units.loc[idx]) else 0.0
                if qty == 0:
                    continue
                sku = sku_map.get(row["article_norm"])
                if sku is None:
                    continue
                price = price_for_platform(sku, platform if platform in {"wb", "ozon", "ya"} else "ya")
                margin_pct = margin_pct_for_platform(sku, platform if platform in {"wb", "ozon", "ya"} else "ya")
                revenue += qty * price
                margin += qty * price * margin_pct
            series.append({
                "dayOffset": day,
                "label": f"D-{day}",
                "units": round(float(units.sum()), 2),
                "revenue": round(revenue, 2),
                "estimatedMargin": round(margin, 2),
            })
        trend_series[platform] = series

    trend_summary = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "note": "Операционная оценка по дням: берём дневные заказы из рабочего файла data (37).xlsx и умножаем на текущие цены/маржу SKU. Для Я.Маркета используем blended fallback из доступных цен и fact margin.",
        "platforms": [
            {"key": "wb", "label": "WB", "series": trend_series["wb"]},
            {"key": "ozon", "label": "Ozon", "series": trend_series["ozon"]},
            {"key": "ya", "label": "Я.Маркет", "series": trend_series["ya"]},
            {"key": "all", "label": "Все площадки", "series": trend_series["all"]},
        ],
    }

    # Ozon orders
    orders = pd.read_csv(args.orders, sep=";", encoding="utf-8-sig", engine="python")
    orders.columns = [str(c).strip() for c in orders.columns]
    orders["article_norm"] = orders["Артикул"].astype(str).str.strip().str.lower()
    orders = orders[orders["article_norm"].isin(article_set)].copy()
    orders["processed_at"] = pd.to_datetime(orders["Принят в обработку"], errors="coerce")
    orders["processed_date"] = orders["processed_at"].dt.date
    orders["qty"] = pd.to_numeric(orders["Количество"], errors="coerce").fillna(0)
    orders["ship_value"] = pd.to_numeric(orders["Сумма отправления"], errors="coerce").fillna(0)
    orders["local_flag"] = (
        orders["Кластер отгрузки"].fillna("").astype(str).str.strip().str.lower()
        == orders["Кластер доставки"].fillna("").astype(str).str.strip().str.lower()
    ) & orders["Кластер доставки"].notna()

    max_date = pd.to_datetime(orders["processed_date"]).max()
    window_start = max_date - pd.Timedelta(days=args.window_days - 1)
    orders_window = orders[(pd.to_datetime(orders["processed_date"]) >= window_start) & (pd.to_datetime(orders["processed_date"]) <= max_date)].copy()

    status_map = {
        "Ожидает сборки": "waitingAssembly",
        "Ожидает отгрузки": "waitingShip",
        "Доставляется": "delivering",
        "Доставлен": "delivered",
        "Получен": "delivered",
        "Отменён": "cancelled",
        "Отменен": "cancelled",
    }
    orders_window["statusGroup"] = orders_window["Статус"].map(status_map).fillna("other")
    status_counts = orders_window.groupby("statusGroup").agg(orders=("Номер заказа", "count"), units=("qty", "sum")).reset_index()

    status_label_map = {
        "waitingAssembly": "Ожидает сборки",
        "waitingShip": "Ожидает отгрузки",
        "delivering": "Доставляется",
        "delivered": "Доставлен/получен",
        "cancelled": "Отменён",
    }
    status_cards = []
    for key in ["waitingAssembly", "waitingShip", "delivering", "delivered", "cancelled"]:
        row = status_counts[status_counts["statusGroup"] == key]
        status_cards.append({
            "key": key,
            "label": status_label_map[key],
            "orders": int(row["orders"].iloc[0]) if not row.empty else 0,
            "units": int(row["units"].iloc[0]) if not row.empty else 0,
        })

    overall_local_share = float((orders_window.loc[orders_window["local_flag"], "qty"].sum()) / max(orders_window["qty"].sum(), 1))

    # Ozon stocks
    stocks_raw = pd.read_excel(args.stocks, sheet_name="Товар-склад", header=None)
    header1 = stocks_raw.iloc[0].tolist()
    header2 = stocks_raw.iloc[1].tolist()
    stock_cols = []
    for a, b in zip(header1, header2):
        a = str(a).strip() if pd.notna(a) else ""
        b = str(b).strip() if pd.notna(b) else ""
        stock_cols.append(f"{a}|{b}" if b else a)
    stocks = stocks_raw.iloc[4:].copy()
    stocks.columns = stock_cols
    stocks = stocks.dropna(how="all")
    stocks["article_norm"] = stocks["Артикул"].astype(str).str.strip().str.lower()
    stocks = stocks[stocks["article_norm"].isin(article_set)].copy()
    numeric_stock_cols = [
        "Остатки на\xa0складах Ozon|Доступно к\xa0продаже",
        "В\xa0пути на\xa0склад Ozon|В\xa0заявках на\xa0поставку",
        "|В\xa0поставках в\xa0пути",
        "|Проходят проверку",
        "Возвращаются от\xa0покупателей",
    ]
    for col in numeric_stock_cols:
        stocks[col] = pd.to_numeric(stocks[col], errors="coerce").fillna(0)

    oz_cluster_article_sales = orders_window.groupby(["Кластер доставки", "article_norm"], dropna=False).agg(
        orders=("Номер заказа", "count"),
        units=("qty", "sum"),
        value=("ship_value", "sum"),
        local_units=("local_flag", lambda s: orders_window.loc[s.index, "qty"][orders_window.loc[s.index, "local_flag"]].sum()),
    ).reset_index()
    oz_cluster_article_sales["avgDailyUnits28"] = oz_cluster_article_sales["units"] / float(args.window_days)
    oz_cluster_article_sales["localShare"] = np.where(
        oz_cluster_article_sales["units"] > 0,
        oz_cluster_article_sales["local_units"] / oz_cluster_article_sales["units"],
        np.nan,
    )

    oz_cluster_article_stock = stocks.groupby(["Кластер", "article_norm"], dropna=False).agg(
        available=("Остатки на\xa0складах Ozon|Доступно к\xa0продаже", "sum"),
        inRequest=("В\xa0пути на\xa0склад Ozon|В\xa0заявках на\xa0поставку", "sum"),
        inTransit=("|В\xa0поставках в\xa0пути", "sum"),
        checking=("|Проходят проверку", "sum"),
        returns=("Возвращаются от\xa0покупателей", "sum"),
        skuCount=("SKU", "nunique"),
    ).reset_index()

    oz_cluster_article = oz_cluster_article_sales.merge(
        oz_cluster_article_stock,
        left_on=["Кластер доставки", "article_norm"],
        right_on=["Кластер", "article_norm"],
        how="outer",
    )
    oz_cluster_article["cluster"] = oz_cluster_article["Кластер доставки"].fillna(oz_cluster_article["Кластер"])
    for col in ["orders", "units", "value", "local_units", "avgDailyUnits28", "available", "inRequest", "inTransit", "checking", "returns"]:
        oz_cluster_article[col] = pd.to_numeric(oz_cluster_article[col], errors="coerce").fillna(0)
    oz_cluster_article["coverageDays"] = np.where(
        oz_cluster_article["avgDailyUnits28"] > 0,
        oz_cluster_article["available"] / oz_cluster_article["avgDailyUnits28"],
        np.nan,
    )
    for days in [7, 14, 28]:
        oz_cluster_article[f"targetNeed{days}"] = np.maximum(
            np.ceil(days * oz_cluster_article["avgDailyUnits28"] - (oz_cluster_article["available"] + oz_cluster_article["inTransit"] + oz_cluster_article["inRequest"])),
            0,
        )
    oz_cluster_article["localShare"] = oz_cluster_article["localShare"].fillna(0)
    oz_cluster_article["article"] = oz_cluster_article["article_norm"]
    oz_cluster_article["name"] = oz_cluster_article["article_norm"].map(name_map)
    oz_cluster_article["owner"] = oz_cluster_article["article_norm"].map(owner_map)

    oz_cluster_summary = oz_cluster_article.groupby("cluster", dropna=False).agg(
        units=("units", "sum"),
        value=("value", "sum"),
        available=("available", "sum"),
        inRequest=("inRequest", "sum"),
        inTransit=("inTransit", "sum"),
        checking=("checking", "sum"),
        skuCount=("article_norm", "nunique"),
        avgDailyUnits28=("avgDailyUnits28", "sum"),
        localUnits=("local_units", "sum"),
    ).reset_index()
    oz_cluster_summary["coverageDays"] = np.where(oz_cluster_summary["avgDailyUnits28"] > 0, oz_cluster_summary["available"] / oz_cluster_summary["avgDailyUnits28"], np.nan)
    oz_cluster_summary["localShare"] = np.where(oz_cluster_summary["units"] > 0, oz_cluster_summary["localUnits"] / oz_cluster_summary["units"], np.nan)
    for days in [7, 14, 28]:
        oz_cluster_summary[f"targetNeed{days}"] = np.maximum(
            np.ceil(days * oz_cluster_summary["avgDailyUnits28"] - (oz_cluster_summary["available"] + oz_cluster_summary["inTransit"] + oz_cluster_summary["inRequest"])),
            0,
        )

    oz_wh_stock = stocks.groupby(["Склад", "Кластер"], dropna=False).agg(
        available=("Остатки на\xa0складах Ozon|Доступно к\xa0продаже", "sum"),
        inRequest=("В\xa0пути на\xa0склад Ozon|В\xa0заявках на\xa0поставку", "sum"),
        inTransit=("|В\xa0поставках в\xa0пути", "sum"),
        checking=("|Проходят проверку", "sum"),
        returns=("Возвращаются от\xa0покупателей", "sum"),
        skuCount=("article_norm", "nunique"),
    ).reset_index()
    oz_wh_sales = orders_window.groupby("Склад отгрузки", dropna=False).agg(
        units=("qty", "sum"),
        value=("ship_value", "sum"),
        orders=("Номер заказа", "count"),
        localUnits=("local_flag", lambda s: orders_window.loc[s.index, "qty"][orders_window.loc[s.index, "local_flag"]].sum()),
    ).reset_index()
    oz_wh = oz_wh_stock.merge(oz_wh_sales, left_on="Склад", right_on="Склад отгрузки", how="left")
    for col in ["units", "value", "orders", "localUnits"]:
        oz_wh[col] = pd.to_numeric(oz_wh[col], errors="coerce").fillna(0)
    oz_wh["avgDailyUnits28"] = oz_wh["units"] / float(args.window_days)
    oz_wh["coverageDays"] = np.where(oz_wh["avgDailyUnits28"] > 0, oz_wh["available"] / oz_wh["avgDailyUnits28"], np.nan)
    oz_wh["localShare"] = np.where(oz_wh["units"] > 0, oz_wh["localUnits"] / oz_wh["units"], np.nan)
    for days in [7, 14, 28]:
        oz_wh[f"targetNeed{days}"] = np.maximum(
            np.ceil(days * oz_wh["avgDailyUnits28"] - (oz_wh["available"] + oz_wh["inTransit"] + oz_wh["inRequest"])),
            0,
        )

    # WB warehouses
    wb_mar = read_wb_supplier(args.wb_supplier)
    wb_mar = wb_mar[wb_mar["brand"].str.lower().eq(args.brand.lower()) & wb_mar["article_norm"].isin(article_set)].copy()
    days_wb = float(args.wb_window_days)
    wb_wh = wb_mar.groupby("warehouse").agg(
        ordersUnits=("ordersUnits", "sum"),
        buyoutsUnits=("buyoutsUnits", "sum"),
        payout=("payout", "sum"),
        stock=("stock", "sum"),
        skuCount=("article_norm", "nunique"),
    ).reset_index()
    wb_wh["avgDailyUnits"] = wb_wh["ordersUnits"] / days_wb
    wb_wh["coverageDays"] = np.where(wb_wh["avgDailyUnits"] > 0, wb_wh["stock"] / wb_wh["avgDailyUnits"], np.nan)
    for days in [7, 14, 28]:
        wb_wh[f"targetNeed{days}"] = np.maximum(np.ceil(days * wb_wh["avgDailyUnits"] - wb_wh["stock"]), 0)

    wb_article_wh = wb_mar.groupby(["warehouse", "article_norm"]).agg(
        name=("name", "first"),
        ordersUnits=("ordersUnits", "sum"),
        buyoutsUnits=("buyoutsUnits", "sum"),
        payout=("payout", "sum"),
        stock=("stock", "sum"),
        wbArticle=("wbArticle", "first"),
    ).reset_index()
    wb_article_wh["avgDailyUnits"] = wb_article_wh["ordersUnits"] / days_wb
    wb_article_wh["coverageDays"] = np.where(wb_article_wh["avgDailyUnits"] > 0, wb_article_wh["stock"] / wb_article_wh["avgDailyUnits"], np.nan)
    for days in [7, 14, 28]:
        wb_article_wh[f"targetNeed{days}"] = np.maximum(np.ceil(days * wb_article_wh["avgDailyUnits"] - wb_article_wh["stock"]), 0)
    wb_article_wh["owner"] = wb_article_wh["article_norm"].map(owner_map)

    # central warehouse
    bal = pd.read_excel(args.balashikha, sheet_name="Остатки")
    bal.columns = [str(c).strip() for c in bal.columns]
    bal["article_norm"] = bal["Наименование"].astype(str).str.strip().str.lower()
    bal = bal[bal["article_norm"].isin(article_set)].copy()
    for col in ["Принято", "Отгружено Озон", "Отгружено ВБ", "Остатки"]:
        bal[col] = pd.to_numeric(bal[col], errors="coerce").fillna(0)
    central_stats = {
        "accepted": int(bal["Принято"].sum()),
        "shippedOzon": int(bal["Отгружено Озон"].sum()),
        "shippedWB": int(bal["Отгружено ВБ"].sum()),
        "stock": int(bal["Остатки"].sum()),
        "skuCount": int(bal["article_norm"].nunique()),
    }

    backlog_clusters = orders_window[orders_window["statusGroup"].isin(["waitingAssembly", "waitingShip"])].groupby("Кластер отгрузки").agg(
        waitingAssembly=("statusGroup", lambda s: int((s == "waitingAssembly").sum())),
        waitingShip=("statusGroup", lambda s: int((s == "waitingShip").sum())),
        units=("qty", "sum"),
        orders=("Номер заказа", "count"),
    ).reset_index().sort_values(["orders", "units"], ascending=False)

    oz_risk = oz_cluster_article[(oz_cluster_article["avgDailyUnits28"] > 0) & (oz_cluster_article["coverageDays"].fillna(0) < 28)].copy()
    oz_risk["riskScore"] = (
        (28 - oz_risk["coverageDays"].fillna(0)).clip(lower=0)
        + oz_risk["avgDailyUnits28"] * 2
        + (1 - oz_risk["localShare"].fillna(0)) * 5
    )
    oz_risk = oz_risk.sort_values(["riskScore", "units"], ascending=[False, False])

    wb_risk = wb_article_wh[(wb_article_wh["avgDailyUnits"] > 0) & (wb_article_wh["coverageDays"].fillna(0) < 28)].copy()
    wb_risk["riskScore"] = (28 - wb_risk["coverageDays"].fillna(0)).clip(lower=0) + wb_risk["avgDailyUnits"] * 2
    wb_risk = wb_risk.sort_values(["riskScore", "ordersUnits"], ascending=[False, False])

    logistics = {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "window": {"from": window_start.date().isoformat(), "to": max_date.date().isoformat(), "days": args.window_days},
        "targetOptions": [7, 14, 28],
        "notes": [
            "Ozon локальность считается по совпадению кластера отгрузки и кластера доставки.",
            "Покрытие = доступный остаток / среднесуточные продажи за окно.",
            "Рекомендация к пополнению учитывает доступный остаток + заявки + товар в пути.",
            "WB слой сейчас строится по складам и артикулу из supplier-goods отчёта.",
        ],
        "summaryCards": [
            {"label": "Локальные заказы Ozon", "valuePct": round(overall_local_share, 4), "value": int(orders_window.loc[orders_window["local_flag"], "qty"].sum()), "hint": "Доля локальных отгрузок за окно"},
            {"label": "Нелокальные заказы Ozon", "valuePct": round(1 - overall_local_share, 4), "value": int(orders_window.loc[~orders_window["local_flag"], "qty"].sum()), "hint": "Часть спроса идёт через не-локальный кластер"},
            {"label": "Ожидает сборки", "value": next((card["orders"] for card in status_cards if card["key"] == "waitingAssembly"), 0), "hint": "Нужно собрать на складе"},
            {"label": "Ожидает отгрузки", "value": next((card["orders"] for card in status_cards if card["key"] == "waitingShip"), 0), "hint": "Собрано, но ещё не отгружено"},
            {"label": "Центральный склад, шт.", "value": int(central_stats["stock"]), "hint": "Остаток в Балашихе"},
            {"label": "Кластеры Ozon < 14 дней", "value": int((oz_cluster_summary["coverageDays"].fillna(0) < 14).sum()), "hint": "Кластеры в зоне риска по оборачиваемости"},
            {"label": "Склады WB < 14 дней", "value": int((wb_wh["coverageDays"].fillna(0) < 14).sum()), "hint": "Склады WB в зоне риска по покрытию"},
        ],
        "statusCards": status_cards,
        "centralWarehouse": central_stats,
        "backlogByCluster": recs(backlog_clusters.head(12).rename(columns={"Кластер отгрузки": "cluster"}), ["cluster", "waitingAssembly", "waitingShip", "units", "orders"]),
        "ozonClusters": recs(oz_cluster_summary.sort_values(["units", "value"], ascending=False).head(40).rename(columns={"cluster": "name"}), ["name", "units", "value", "available", "inRequest", "inTransit", "checking", "avgDailyUnits28", "coverageDays", "localShare", "targetNeed7", "targetNeed14", "targetNeed28", "skuCount"]),
        "ozonWarehouses": recs(oz_wh.sort_values(["units", "available"], ascending=False).rename(columns={"Склад": "warehouse", "Кластер": "cluster"}).head(50), ["warehouse", "cluster", "units", "value", "available", "inRequest", "inTransit", "checking", "avgDailyUnits28", "coverageDays", "localShare", "targetNeed7", "targetNeed14", "targetNeed28", "skuCount"]),
        "wbWarehouses": recs(wb_wh.sort_values(["ordersUnits", "stock"], ascending=False).rename(columns={"warehouse": "name"}).head(50), ["name", "ordersUnits", "buyoutsUnits", "payout", "stock", "avgDailyUnits", "coverageDays", "targetNeed7", "targetNeed14", "targetNeed28", "skuCount"]),
        "riskRows": recs(pd.concat([
            oz_risk.assign(
                platform="Ozon",
                place=oz_risk["cluster"],
                article=oz_risk["article_norm"],
                inStock=oz_risk["available"],
                avgDaily=oz_risk["avgDailyUnits28"],
                turnoverDays=oz_risk["coverageDays"],
                sourceValue=oz_risk["value"],
            )[["platform", "place", "article", "name", "owner", "inStock", "inTransit", "inRequest", "avgDaily", "turnoverDays", "targetNeed14", "targetNeed28", "localShare", "sourceValue"]].head(120),
            wb_risk.assign(
                platform="WB",
                place=wb_risk["warehouse"],
                article=wb_risk["article_norm"],
                inStock=wb_risk["stock"],
                inTransit=0,
                inRequest=0,
                avgDaily=wb_risk["avgDailyUnits"],
                turnoverDays=wb_risk["coverageDays"],
                localShare=np.nan,
                sourceValue=wb_risk["payout"],
            )[["platform", "place", "article", "name", "owner", "inStock", "inTransit", "inRequest", "avgDaily", "turnoverDays", "targetNeed14", "targetNeed28", "localShare", "sourceValue"]].head(120),
        ], ignore_index=True).sort_values(["turnoverDays", "avgDaily"], ascending=[True, False]), ["platform", "place", "article", "name", "owner", "inStock", "inTransit", "inRequest", "avgDaily", "turnoverDays", "targetNeed14", "targetNeed28", "localShare", "sourceValue"]),
    }

    with open(data_dir / "skus.json", "w", encoding="utf-8") as f:
        json.dump(skus, f, ensure_ascii=False, indent=2)
    with open(data_dir / "seed_comments.json", "w", encoding="utf-8") as f:
        json.dump(seed, f, ensure_ascii=False, indent=2)
    with open(data_dir / "platform_trends.json", "w", encoding="utf-8") as f:
        json.dump(trend_summary, f, ensure_ascii=False, indent=2)
    with open(data_dir / "logistics.json", "w", encoding="utf-8") as f:
        json.dump(logistics, f, ensure_ascii=False, indent=2)

    print("Imperial layer generated:")
    print(f"  skus patched: {len(skus)}")
    print(f"  platform trends: {len(trend_summary['platforms'])} series")
    print(f"  logistics risk rows: {len(logistics['riskRows'])}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Imperial v7 layer for Altea Portal")
    parser.add_argument("--repo-dir", required=True, help="Path to portal repo")
    parser.add_argument("--brand", default="Алтея", help="Brand to keep")
    parser.add_argument("--data37", default="/mnt/data/data (37).xlsx")
    parser.add_argument("--orders", default="/mnt/data/orders (40).csv")
    parser.add_argument("--stocks", default="/mnt/data/stocks_report (6).xlsx")
    parser.add_argument("--wb-supplier", default="/mnt/data/supplier-goods-109831-2026-03-01-2026-03-27-orbeabvuc.XLSX")
    parser.add_argument("--balashikha", default="/mnt/data/Склад Балашиха.xlsx")
    parser.add_argument("--window-days", type=int, default=28)
    parser.add_argument("--wb-window-days", type=int, default=27)
    build(parser.parse_args())
