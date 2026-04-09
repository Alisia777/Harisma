import json
import datetime
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_20 = Path('/mnt/data/Репрайсер шаблон от 20.03.xlsx')
RAW_27 = Path('/mnt/data/Репрайсер шаблон от 27.03.xlsx')
SKUS_JSON = ROOT / 'data' / 'skus.json'
REPRICER_JSON = ROOT / 'data' / 'repricer.json'
OUT_JSON = ROOT / 'data' / 'prices.json'

MONTH_START = datetime.date(2026, 3, 1)
MONTH_END = datetime.date(2026, 3, 31)
POINT_START = datetime.date(2026, 3, 20)
POINT_END = datetime.date(2026, 3, 27)
PLATFORMS = {
    'wb': {
        'price_col': 'Цена со скидкой продавца WB, ₽',
        'spp_col': 'СПП WB, %',
        'turn_col': 'Оборачиваемость общая 7д, дн.',
        'margin_col': 'Маржа Total WB, %',
        'settings_key': 'wb',
    },
    'ozon': {
        'price_col': 'Цена со скидкой продавца Ozon, ₽',
        'spp_col': 'СПП Ozon, %',
        'turn_col': 'Оборачиваемость общая 7д, дн.',
        'margin_col': 'Маржа Total Ozon, %',
        'settings_key': 'ozon',
    },
}


def num(value):
    if value is None or value == '' or pd.isna(value):
        return None
    try:
        return float(value)
    except Exception:
        return None


def load_input(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, sheet_name='Входные_данные', header=None)
    headers = raw.iloc[3].tolist()
    frame = raw.iloc[4:].copy()
    frame.columns = headers
    frame = frame[~frame['Артикул'].isna()].copy()
    frame = frame[frame['Бренд'].astype(str).str.contains('Алтея', na=False)].copy()
    frame['Артикул'] = frame['Артикул'].astype(str).str.strip()
    return frame


def load_settings(path: Path) -> pd.DataFrame:
    raw = pd.read_excel(path, sheet_name='Настройки_цен', header=None)
    headers = raw.iloc[3].tolist()
    frame = raw.iloc[4:].copy()
    frame.columns = headers
    frame = frame[~frame['Артикул'].isna()].copy()
    frame['Артикул'] = frame['Артикул'].astype(str).str.strip()
    return frame


def interp(day: datetime.date, start_value, end_value):
    if start_value is None and end_value is None:
        return None
    if start_value is None:
        return end_value
    if end_value is None:
        return start_value
    if day <= POINT_START:
        return start_value
    if day >= POINT_END:
        return end_value
    span = (POINT_END - POINT_START).days
    ratio = (day - POINT_START).days / span
    return start_value + (end_value - start_value) * ratio


def main():
    sku_map = {row['articleKey']: row for row in json.loads(SKUS_JSON.read_text(encoding='utf-8'))}
    repricer_map = {row['articleKey']: row for row in json.loads(REPRICER_JSON.read_text(encoding='utf-8'))['rows']}

    input_20 = load_input(RAW_20)
    input_27 = load_input(RAW_27)
    settings = load_settings(RAW_27)

    settings_map = {}
    for _, row in settings.iterrows():
        article = str(row['Артикул']).strip()
        mp = str(row['Маркетплейс']).strip().lower()
        settings_map[(article, mp)] = {
            'allowedMarginPct': num(row['Мин. порог маржи без рекламы, %']),
            'baseMarginPct': num(row['Базовый порог маржи без рекламы, %']),
            'minPrice': num(row['Мин. цена, ₽']),
            'basePrice': num(row['Базовая цена, ₽']),
        }

    snap_20 = {str(row['Артикул']).strip(): row for _, row in input_20.iterrows()}
    snap_27 = {str(row['Артикул']).strip(): row for _, row in input_27.iterrows()}
    dates = [MONTH_START + datetime.timedelta(days=offset) for offset in range((MONTH_END - MONTH_START).days + 1)]

    rows_by_platform = {'wb': [], 'ozon': []}
    all_articles = sorted(set(snap_20) | set(snap_27))
    for article in all_articles:
        sku = sku_map.get(article, {})
        repricer_row = repricer_map.get(article, {})
        row_20 = snap_20.get(article)
        row_27 = snap_27.get(article)

        for platform, spec in PLATFORMS.items():
            setting = settings_map.get((article, spec['settings_key']), {})
            repricer_side = repricer_row.get(platform, {}) if repricer_row else {}
            current_margin = num(row_27[spec['margin_col']]) if row_27 is not None else None
            previous_margin = num(row_20[spec['margin_col']]) if row_20 is not None else None
            margin_values = [value for value in (current_margin, previous_margin) if value is not None]
            avg_margin = sum(margin_values) / len(margin_values) if margin_values else (num(repricer_side.get('marginNoAdsCurrentPct')) or num(repricer_side.get('marginPct')))

            current_turn = num(row_27[spec['turn_col']]) if row_27 is not None else None
            current_price = num(row_27[spec['price_col']]) if row_27 is not None else None
            if current_turn is None:
                current_turn = num(repricer_side.get('turnoverDays')) or num((sku.get(platform) or {}).get('turnoverDays'))
            if current_price is None:
                current_price = num(repricer_side.get('currentPrice')) or num((sku.get(platform) or {}).get('currentPrice'))

            start_turn = num(row_20[spec['turn_col']]) if row_20 is not None else current_turn
            start_price = num(row_20[spec['price_col']]) if row_20 is not None else current_price
            start_spp = num(row_20[spec['spp_col']]) if row_20 is not None else None
            end_turn = num(row_27[spec['turn_col']]) if row_27 is not None else current_turn
            end_price = num(row_27[spec['price_col']]) if row_27 is not None else current_price
            end_spp = num(row_27[spec['spp_col']]) if row_27 is not None else None

            if all(value is None for value in (current_turn, current_price, avg_margin, setting.get('allowedMarginPct'), start_price, end_price)):
                continue

            daily = []
            for day in dates:
                daily.append({
                    'date': day.isoformat(),
                    'turnoverDays': interp(day, start_turn, end_turn),
                    'price': interp(day, start_price, end_price),
                    'sppPct': interp(day, start_spp, end_spp),
                })

            owner = sku.get('owner') or {}
            owner_name = owner.get('name') if isinstance(owner, dict) else owner or '—'
            rows_by_platform[platform].append({
                'articleKey': article,
                'article': article,
                'name': sku.get('name') or repricer_row.get('name') or article,
                'owner': owner_name or '—',
                'allowedMarginPct': setting.get('allowedMarginPct'),
                'avgMargin7dPct': avg_margin,
                'currentTurnoverDays': current_turn,
                'currentPrice': current_price,
                'minPrice': setting.get('minPrice'),
                'basePrice': setting.get('basePrice'),
                'daily': daily,
            })

    def revenue_for(article_key: str) -> float:
        plan_fact = (sku_map.get(article_key, {}) or {}).get('planFact') or {}
        return plan_fact.get('factTotalRevenue') or 0.0

    for platform in rows_by_platform:
        rows_by_platform[platform].sort(key=lambda row: revenue_for(row['articleKey']), reverse=True)

    payload = {
        'generatedAt': datetime.datetime.now().isoformat(),
        'month': {'key': '2026-03', 'label': 'Март 2026'},
        'note': 'Операционный price matrix: допустимая маржа — из Настройки_цен, текущая цена/СПП/оборачиваемость — из repricer input March. Дневной ряд по марту заполнен по доступным срезам 20.03 и 27.03 с carry/interpolation; Я.Маркет оставлен под последующее подключение.',
        'dates': [{'date': day.isoformat(), 'label': f'{day.day:02d}.{day.month:02d}'} for day in dates],
        'platforms': {
            'wb': {'label': 'WB', 'rows': rows_by_platform['wb']},
            'ozon': {'label': 'Ozon', 'rows': rows_by_platform['ozon']},
            'ym': {'label': 'Я.Маркет', 'rows': [], 'emptyNote': 'Структура готова, live-данные Я.Маркета подключим следующим слоем.'},
        },
    }
    OUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'prices matrix exported: {OUT_JSON}')


if __name__ == '__main__':
    main()
