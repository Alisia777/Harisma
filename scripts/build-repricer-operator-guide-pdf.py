#!/usr/bin/env python3
"""Build the Russian operator guide for the Harisma marketplace repricer."""

from __future__ import annotations

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "output" / "pdf" / "repricer-portal-operator-guide.pdf"

FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_ITALIC = "/System/Library/Fonts/Supplemental/Arial Italic.ttf"

PAGE_W, PAGE_H = A4
MARGIN_X = 17 * mm
MARGIN_TOP = 17 * mm
MARGIN_BOTTOM = 15 * mm

INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#5F6B7A")
PURPLE = colors.HexColor("#6941C6")
PURPLE_DARK = colors.HexColor("#4A2B8F")
PURPLE_LIGHT = colors.HexColor("#F3EEFF")
BLUE_LIGHT = colors.HexColor("#EEF6FF")
GREEN = colors.HexColor("#087A55")
GREEN_LIGHT = colors.HexColor("#EAF8F1")
AMBER = colors.HexColor("#A15C00")
AMBER_LIGHT = colors.HexColor("#FFF5DD")
RED = colors.HexColor("#B42318")
RED_LIGHT = colors.HexColor("#FFF0EE")
GRID = colors.HexColor("#D8DEE8")
PANEL = colors.HexColor("#F7F8FA")
WHITE = colors.white


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Arial", FONT_REGULAR))
    pdfmetrics.registerFont(TTFont("Arial-Bold", FONT_BOLD))
    pdfmetrics.registerFont(TTFont("Arial-Italic", FONT_ITALIC))


def pstyle(name: str, **kwargs) -> ParagraphStyle:
    defaults = {
        "fontName": "Arial",
        "fontSize": 9.2,
        "leading": 12.2,
        "textColor": INK,
        "spaceAfter": 2.5 * mm,
    }
    defaults.update(kwargs)
    return ParagraphStyle(name, **defaults)


STYLES = {}


def init_styles() -> None:
    global STYLES
    getSampleStyleSheet()
    STYLES = {
        "cover_kicker": pstyle(
            "cover_kicker",
            fontName="Arial-Bold",
            fontSize=9,
            leading=11,
            textColor=PURPLE,
            spaceAfter=4 * mm,
        ),
        "cover_title": pstyle(
            "cover_title",
            fontName="Arial-Bold",
            fontSize=27,
            leading=31,
            textColor=INK,
            spaceAfter=4 * mm,
        ),
        "cover_subtitle": pstyle(
            "cover_subtitle",
            fontSize=12,
            leading=17,
            textColor=MUTED,
            spaceAfter=7 * mm,
        ),
        "h1": pstyle(
            "h1",
            fontName="Arial-Bold",
            fontSize=19,
            leading=23,
            textColor=INK,
            spaceBefore=0,
            spaceAfter=5 * mm,
        ),
        "h2": pstyle(
            "h2",
            fontName="Arial-Bold",
            fontSize=12,
            leading=15,
            textColor=PURPLE_DARK,
            spaceBefore=3 * mm,
            spaceAfter=2.5 * mm,
        ),
        "body": pstyle("body"),
        "small": pstyle(
            "small",
            fontSize=7.8,
            leading=10.2,
            textColor=MUTED,
            spaceAfter=1.5 * mm,
        ),
        "bullet": pstyle(
            "bullet",
            leftIndent=5.5 * mm,
            firstLineIndent=-3.8 * mm,
            bulletIndent=0,
            spaceAfter=1.5 * mm,
        ),
        "step": pstyle(
            "step",
            leftIndent=9 * mm,
            firstLineIndent=-9 * mm,
            spaceAfter=2.3 * mm,
        ),
        "callout": pstyle(
            "callout",
            fontSize=9,
            leading=12.2,
            spaceAfter=0,
        ),
        "metric": pstyle(
            "metric",
            fontName="Arial-Bold",
            fontSize=18,
            leading=20,
            alignment=TA_CENTER,
            textColor=PURPLE_DARK,
            spaceAfter=1 * mm,
        ),
        "metric_label": pstyle(
            "metric_label",
            fontSize=7.4,
            leading=9.3,
            alignment=TA_CENTER,
            textColor=MUTED,
            spaceAfter=0,
        ),
        "table_head": pstyle(
            "table_head",
            fontName="Arial-Bold",
            fontSize=7.5,
            leading=9.2,
            textColor=WHITE,
            spaceAfter=0,
        ),
        "table_cell": pstyle(
            "table_cell",
            fontSize=7.4,
            leading=9.4,
            spaceAfter=0,
        ),
        "table_cell_small": pstyle(
            "table_cell_small",
            fontSize=6.8,
            leading=8.5,
            spaceAfter=0,
        ),
        "formula": pstyle(
            "formula",
            fontName="Arial-Bold",
            fontSize=10.2,
            leading=14,
            alignment=TA_CENTER,
            textColor=PURPLE_DARK,
            spaceAfter=0,
        ),
    }


def para(text: str, style: str = "body") -> Paragraph:
    return Paragraph(text, STYLES[style])


def bullet(text: str) -> Paragraph:
    return Paragraph(f"<bullet>&bull;</bullet>{text}", STYLES["bullet"])


def step(number: int, title: str, text: str) -> Paragraph:
    return Paragraph(
        f'<font name="Arial-Bold" color="#6941C6">{number}.</font> '
        f'<font name="Arial-Bold">{title}</font><br/>{text}',
        STYLES["step"],
    )


def callout(title: str, text: str, tone: str = "purple") -> Table:
    palette = {
        "purple": (PURPLE_LIGHT, PURPLE),
        "green": (GREEN_LIGHT, GREEN),
        "amber": (AMBER_LIGHT, AMBER),
        "red": (RED_LIGHT, RED),
        "blue": (BLUE_LIGHT, colors.HexColor("#1769AA")),
    }
    bg, accent = palette[tone]
    content = para(
        f'<font name="Arial-Bold" color="{accent.hexval()}">{title}</font><br/>{text}',
        "callout",
    )
    table = Table([[content]], colWidths=[PAGE_W - 2 * MARGIN_X])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.6, accent),
                ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm),
            ]
        )
    )
    return table


def data_table(rows, widths, header=True, small=False) -> Table:
    cell_style = "table_cell_small" if small else "table_cell"
    converted = []
    for row_index, row in enumerate(rows):
        converted.append(
            [
                para(str(cell), "table_head" if header and row_index == 0 else cell_style)
                for cell in row
            ]
        )
    table = Table(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.45, GRID),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.3 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.3 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 2.2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.2 * mm),
    ]
    if header:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), PURPLE_DARK),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ]
        for idx in range(2, len(rows), 2):
            commands.append(("BACKGROUND", (0, idx), (-1, idx), PANEL))
    table.setStyle(TableStyle(commands))
    return table


def metric_grid(metrics) -> Table:
    cells = [
        [para(value, "metric"), para(label, "metric_label")]
        for value, label in metrics
    ]
    table = Table(
        [cells],
        colWidths=[(PAGE_W - 2 * MARGIN_X - 3 * 3 * mm) / 4] * 4,
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PURPLE_LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CFC3F3")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CFC3F3")),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5 * mm),
                ("LEFTPADDING", (0, 0), (-1, -1), 2 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return table


def page_chrome(canvas, doc) -> None:
    canvas.saveState()
    page_num = canvas.getPageNumber()
    canvas.setFillColor(PURPLE)
    canvas.rect(0, PAGE_H - 5 * mm, PAGE_W, 5 * mm, fill=1, stroke=0)
    if page_num > 1:
        canvas.setFont("Arial-Bold", 7.5)
        canvas.setFillColor(PURPLE_DARK)
        canvas.drawString(MARGIN_X, PAGE_H - 12 * mm, "HARISMA / РЕПРАЙСЕР")
    canvas.setStrokeColor(GRID)
    canvas.setLineWidth(0.45)
    canvas.line(MARGIN_X, 11.5 * mm, PAGE_W - MARGIN_X, 11.5 * mm)
    canvas.setFont("Arial", 7.3)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN_X, 7.5 * mm, "Операторская инструкция | версия 24.07.2026")
    canvas.drawRightString(PAGE_W - MARGIN_X, 7.5 * mm, f"Страница {page_num}")
    canvas.restoreState()


def build_story():
    story = []

    # Page 1
    story += [
        Spacer(1, 17 * mm),
        para("HARISMA / WB + OZON", "cover_kicker"),
        para("Репрайсер:<br/>безопасная работа с ценой", "cover_title"),
        para(
            "Инструкция для команды и РОПа. Маржа на уровне SKU имеет первый приоритет, "
            "затем применяются MIN, MAX, статус, остаток, свежесть данных и согласования.",
            "cover_subtitle",
        ),
        callout(
            "Главное правило",
            "Для товара со статусом «Актуальный», «Новинка» или «Перезапуск» цена не может "
            "опуститься ниже индивидуальной маржи. Если целевая маржа не задана, прямая "
            "автоматическая отправка запрещена.",
            "purple",
        ),
        Spacer(1, 6 * mm),
        metric_grid(
            [
                ("391", "сторона SKU<br/>в canonical"),
                ("334/334", "совпадение<br/>canonical / API"),
                ("115", "защищённых<br/>active / new"),
                ("18", "наборов тестов<br/>пройдено"),
            ]
        ),
        Spacer(1, 7 * mm),
        para("Состояние рабочего запуска", "h2"),
        bullet("Расчёт маржи, Excel-импорт/экспорт, MIN/MAX, статусы и задачи РОП проверены."),
        bullet("Живые цены WB/Ozon собраны и для 334 канонических строк совпадают с API."),
        bullet(
            "Прямой OOS-снимок пока не получен: текущие остатки имеют статус fallback. "
            "Поэтому среди 115 защищённых строк готовых к отправке сейчас 0."
        ),
        bullet(
            "Edge Functions и GitHub workflows ещё не опубликованы в продакшене. "
            "Реальные цены площадкам во время тестов не отправлялись."
        ),
        Spacer(1, 3 * mm),
        callout(
            "Текущий режим: безопасная подготовка",
            "Можно проверять цифры, заполнять маржу, готовить MIN/MAX и согласовывать задачи. "
            "Кнопка фактической отправки должна включаться только после прямых остатков, "
            "свежих цен, зелёного shadow-gate и серверного разрешения.",
            "amber",
        ),
    ]

    # Page 2
    story += [
        PageBreak(),
        para("Ежедневный маршрут оператора", "h1"),
        step(
            1,
            "Обновить фактические цены",
            "На вкладке «Репрайсер» нажмите «Обновить всё». Дождитесь нового "
            "времени снимка и проверьте количество строк WB/Ozon.",
        ),
        step(
            2,
            "Проверить источник остатков",
            "Карточка должна показать «OOS API WB/Ozon». Надпись «OOS fallback» означает "
            "только диагностический режим и запрещает отправку для active/new/relaunch.",
        ),
        step(
            3,
            "Проверить маржу и коридор",
            "Сначала смотрите индивидуальную маржу SKU и margin floor. Затем MIN и MAX. "
            "Если MAX ниже floor маржи, MAX нужно согласованно поднять.",
        ),
        step(
            4,
            "Разобрать блокировки",
            "Исправьте пропуски маржи/MIN/MAX, устаревшую цену, OOS, статус, "
            "недостижимую экономику и ожидающие задачи РОП.",
        ),
        step(
            5,
            "Согласовать изменения",
            "Резкая цена, новая политика маржи/MIN/MAX и смена статуса применяются только "
            "после решения РОПа. Сама SKU Workspace статус не меняет.",
        ),
        step(
            6,
            "Сформировать план",
            "Нажмите «Сформировать план загрузки». Проверьте количество строк, площадки, "
            "отклонения и стоп-причины. План фиксируется 64-символьным хешем.",
        ),
        step(
            7,
            "Отправить и проверить",
            "Кнопка отправки появляется только для плана ready. Успехом считается не ответ "
            "API, а статус verified после повторного чтения фактических цен.",
        ),
        Spacer(1, 4 * mm),
        callout(
            "Когда остановиться",
            "Не продолжайте загрузку, если цена или остаток старые, источник stock не direct, "
            "есть MARGIN_POLICY_REVIEW, задача РОП не APPROVED, shadow cutover закрыт или "
            "фактическая цена после отправки не совпала с планом.",
            "red",
        ),
        Spacer(1, 5 * mm),
        para("Приоритет принятия решения", "h2"),
        data_table(
            [
                ["Приоритет", "Проверка", "Что происходит при нарушении"],
                ["1", "MIN/MAX маржа SKU", "Цена держится между floor и cap маржи"],
                ["2", "MIN цены", "Действует внутри коридора маржи"],
                ["3", "MAX цены", "Действует внутри коридора маржи"],
                ["4", "Статус / OOS / свежесть", "Строка блокируется или уходит РОПу"],
                ["5", "Alignment / прочие правила", "Применяются только внутри безопасного коридора"],
            ],
            [20 * mm, 55 * mm, 87 * mm],
        ),
    ]

    # Page 3
    story += [
        PageBreak(),
        para("Excel: где поставить маржу", "h1"),
        callout(
            "Ответ коротко",
            "Во вкладке «Маржа_MIN_MAX» две первые колонки — «MIN маржа, %» и "
            "«MAX маржа, %». Для каждой SKU укажите оба порога; MAX должен быть строго выше MIN. "
            "Допустимы 25, 25% и 0,25: все три значения трактуются как 25%.",
            "blue",
        ),
        Spacer(1, 4 * mm),
        para("Порядок колонок рабочего файла", "h2"),
        data_table(
            [
                ["A", "B", "C", "D", "E"],
                ["MIN маржа, %", "MAX маржа, %", "articleKey", "platform", "minPrice"],
            ],
            [32 * mm, 48 * mm, 27 * mm, 28 * mm, 28 * mm],
        ),
        Spacer(1, 4 * mm),
        para("Как заполнить и загрузить", "h2"),
        step(1, "Скачать файл", "В репрайсере используйте командный файл или «Скачать маржу SKU»."),
        step(
            2,
            "Заполнить пороги",
            "Для active/new/relaunch заполните MIN и MAX. Оба значения должны быть больше 0% "
            "и меньше 100%, при этом MAX должен быть выше MIN. Историческую маржу не редактируйте.",
        ),
        step(
            3,
            "Проверить лист «Проверки»",
            "Все проверки, кроме временной свежести цены, должны быть OK. BLOCKED по цене "
            "исправляется новым API-снимком, а не ручной подстановкой.",
        ),
        step(
            4,
            "Передать РОПу",
            "Массовые изменения маржи и коридора остаются PENDING_ROP до согласования.",
        ),
        step(
            5,
            "Загрузить",
            "Загрузчик принимает XLSX, XLS, CSV и TSV. После импорта скачайте результат "
            "и убедитесь, что количество строк, маржа, MIN/MAX и статусы не исказились.",
        ),
        Spacer(1, 3 * mm),
        para("Что загрузчик проверяет", "h2"),
        bullet("обязательные заголовки и формат процента;"),
        bullet("articleKey и площадку;"),
        bullet("MIN округляется вверх, MAX округляется вниз;"),
        bullet("MAX не может опустить цену ниже margin floor;"),
        bullet("дубликаты и конфликтующие строки;"),
        bullet("размер изменения и необходимость задачи РОП;"),
        bullet("неизменённый файл проходит round-trip без действий и ошибок."),
        Spacer(1, 3 * mm),
        callout(
            "Не исправляйте статус в Excel репрайсера",
            "Статус берётся из утверждённого решения РОПа и реестра площадки. Импорт маржи "
            "не должен сам переводить товар в «Вывод» или обратно.",
            "amber",
        ),
    ]

    # Page 4
    story += [
        PageBreak(),
        para("Маржа: что входит и как считается", "h1"),
        callout(
            "Формула",
            "(Цена - Себестоимость - Комиссия - Внутренняя реклама - Логистика - "
            "Хранение - Возвраты - Прочие расходы - Налог) / Цена",
            "purple",
        ),
        Spacer(1, 5 * mm),
        data_table(
            [
                ["Площадка", "Комиссия ИУ", "Внутренняя реклама", "Фиксированные расходы"],
                ["WB", "32,03%", "8,77%", "90 ₽ / шт."],
                ["Ozon", "31,3499%", "24,878%", "83 ₽ / шт."],
            ],
            [31 * mm, 38 * mm, 48 * mm, 46 * mm],
        ),
        Spacer(1, 5 * mm),
        para("Правила состава затрат", "h2"),
        bullet("Себестоимость берётся по SKU и применяется одинаково к WB/Ozon одного товара."),
        bullet(
            "Комиссия и внутренняя реклама считаются процентом от цены продавца, полученной из API."
        ),
        bullet(
            "Фиксированные расходы включают логистику, хранение, возвраты и другие прямые "
            "издержки площадки на единицу."
        ),
        bullet(
            "Рублёвая реклама добавляется только как отдельная статья. Один и тот же рекламный "
            "расход нельзя одновременно учитывать процентом и рублями."
        ),
        bullet(
            "Для WB стандартная ставка 46,11% хранится как риск-сценарий и не складывается "
            "с активной фиксированной комиссией 32,03%."
        ),
        bullet(
            "Для Ozon ставка СПП 12,9312% не вычитается второй раз, пока не подтверждено, "
            "что это отдельный расход продавца."
        ),
        bullet(
            "Налог в текущей политике равен 0%. До рабочего запуска его нужно заменить "
            "реальной ставкой, если он не включён в себестоимость."
        ),
        Spacer(1, 4 * mm),
        callout(
            "Защита от нереальной цели",
            "Если после комиссии, рекламы, налога и целевой маржи остаётся менее 5 процентных "
            "пунктов на себестоимость и фиксированные расходы, цель считается экономически "
            "недостижимой. Вместо огромной цены создаётся MARGIN_POLICY_REVIEW.",
            "red",
        ),
        Spacer(1, 4 * mm),
        para("Проверенный результат", "h2"),
        metric_grid(
            [
                ("376", "марж пересчитано<br/>без расхождений"),
                ("63", "допустимых floor<br/>без расхождений"),
                ("24", "недостижимых<br/>цели заблокированы"),
                ("14", "командных строк<br/>REWORK policy"),
            ]
        ),
    ]

    # Page 5
    story += [
        PageBreak(),
        para("Актуальные цены, реклама и OOS", "h1"),
        para("Цена", "h2"),
        bullet("Кнопка читает seller price из WB/Ozon API, а не клиентскую цену после субсидий."),
        bullet("Цена должна быть не старше 2 календарных дней."),
        bullet("Портал сопоставляет vendorCode/nmID и offer_id/product_id с articleKey."),
        bullet("Если совпало меньше 90% строк, strict-gate останавливает обновление."),
        bullet("Текущая сверка: 334 из 334 canonical/API цен совпали."),
        para("Внутренняя реклама", "h2"),
        bullet(
            "В расчёт берётся большее из договорной ставки ИУ и фактического ДРР за согласованные "
            "7 дней. Рост ДРР сразу повышает защитный floor."
        ),
        bullet(
            "История ИУ разделяется по master_id. Данные другого кабинета не объединяются."
        ),
        para("Остатки и OOS", "h2"),
        data_table(
            [
                ["Состояние", "Действие репрайсера"],
                ["Direct stock, товар в наличии", "Разрешает дальнейшие проверки цены"],
                ["Полный OOS: доступно 0, не в пути", "Блокирует цену, создаёт/подхватывает поставку"],
                ["OOS watch/risk", "Запрещает автоматическое снижение до разбора"],
                ["Fallback stock", "Только диагностика; active/new/relaunch блокируются"],
                ["Снимок старше 2 дней", "Публикация цены запрещена"],
            ],
            [52 * mm, 111 * mm],
        ),
        Spacer(1, 5 * mm),
        callout(
            "Важно сейчас",
            "Снимок остатков от 23.07.2026 имеет тип fallback для WB и Ozon. Это нормальная "
            "защитная остановка: 115 защищённых строк не получают готовую цену до прямого "
            "остатка конкретной SKU.",
            "amber",
        ),
        Spacer(1, 4 * mm),
        para("Если карточки на площадке нет", "h2"),
        para(
            "Когда нет статуса площадки, API-идентификатора, карточки и текущей цены, сторона "
            "получает статус «Нет на площадке». Она не должна наследовать общий статус "
            "«Актуальный». Так закрыт ложный WB-пробел syvorotka_dlya_lica_30ml_v2."
        ),
    ]

    # Page 6
    story += [
        PageBreak(),
        para("Статусы, задачи и решение РОПа", "h1"),
        callout(
            "Источник истины",
            "Приоритет статуса: утверждённое решение РОПа -> реестр/статус площадки -> "
            "вспомогательные листы. SKU Workspace используется для анализа, но не является "
            "самостоятельным механизмом смены статуса.",
            "blue",
        ),
        Spacer(1, 5 * mm),
        data_table(
            [
                ["Событие", "Автозадача", "До решения РОПа"],
                ["Цена меняется на 10% и более", "PRICE_CHANGE_APPROVAL", "Цена не попадает в выгрузку"],
                ["Цена меняется на 100% и более", "MARGIN_POLICY_REVIEW", "Сначала маржа и MIN/MAX"],
                ["Меняется статус товара", "STATUS_CHANGE_APPROVAL", "Статус не применяется"],
                ["Массовая маржа / MIN/MAX", "POLICY_APPROVAL", "Строка остаётся PENDING_ROP"],
                ["Полный OOS", "SUPPLY / OOS task", "Автоцена блокируется"],
            ],
            [48 * mm, 54 * mm, 61 * mm],
            small=True,
        ),
        Spacer(1, 5 * mm),
        para("Работа человека", "h2"),
        step(
            1,
            "Посмотреть цифры",
            "Текущая цена, продажи, остаток, ДРР, маржа, margin floor, MIN/MAX и предлагаемое действие.",
        ),
        step(
            2,
            "Указать решение",
            "Сохранить рекомендацию: оставить статус, сменить статус, изменить маржу или коридор.",
        ),
        step(
            3,
            "Отправить РОПу",
            "Система создаёт одну дедуплицированную задачу с причиной, старым и новым значением.",
        ),
        step(
            4,
            "Применить только APPROVED",
            "Отклонённые и ожидающие решения не меняют статус и не попадают в цену площадки.",
        ),
        Spacer(1, 4 * mm),
        para("Статусы и защита цены", "h2"),
        bullet("Актуальный / Новинка / Перезапуск: обязательна индивидуальная маржа и direct stock."),
        bullet("Вывод: маржинальный floor может быть снят, но MIN, статус, OOS и РОП остаются."),
        bullet("Архив / Нет на площадке: автоматическая цена не формируется."),
        bullet("Конфликт статусов виден как ошибка данных, а не решается тихим приоритетом листа."),
        Spacer(1, 3 * mm),
        callout(
            "Текущий объём согласования",
            "Подготовлено 115 предложений по политике защищённых строк. Все остаются PENDING_ROP. "
            "14 экстремальных командных предложений и 24 недостижимые цели нельзя подтверждать "
            "как обычную цену.",
            "amber",
        ),
    ]

    # Page 7
    story += [
        PageBreak(),
        para("Безопасная отправка утверждённых цен", "h1"),
        para("Что делает кнопка", "h2"),
        step(
            1,
            "Собирает свежий серверный расчёт",
            "Live prices, direct stock, canonical, задачи РОП и shadow-gate пересчитываются заново.",
        ),
        step(
            2,
            "Строит неизменяемый план",
            "В плане видны действия WB/Ozon, отклонённые строки и стоп-причины. Бизнес-состав "
            "плана фиксируется SHA-256 хешем.",
        ),
        step(
            3,
            "Требует точное подтверждение",
            "Сервер принимает только хеш актуального плана и включённый флаг "
            "ALTEA_REPRICER_PRICE_APPLY_ENABLED=true.",
        ),
        step(
            4,
            "Отправляет цены площадкам",
            "WB получает базовую цену с сохранением действующей скидки. Ozon получает price, "
            "old_price и min_price, равный эффективному floor.",
        ),
        step(
            5,
            "Повторно читает цены",
            "Ответ API означает только принятую заявку. Завершение фиксируется лишь после "
            "точного совпадения фактической seller price с планом.",
        ),
        Spacer(1, 4 * mm),
        para("Предохранители отправки", "h2"),
        data_table(
            [
                ["Правило", "Лимит / условие"],
                ["Объём одной операции", "Не более 20 строк"],
                ["Максимальное изменение", "Не более 50%"],
                ["Ozon", "Изменение не меньше 5%"],
                ["WB", "Текущая скидка должна помещаться в утверждённый коридор"],
                ["Источник цены и stock", "Только direct API по каждой строке"],
                ["Финальный успех", "Только verification.status = verified"],
            ],
            [63 * mm, 100 * mm],
        ),
        Spacer(1, 5 * mm),
        callout(
            "Текущий тестовый план",
            "Статус blocked, действий 0. Причины: shadow cutover закрыт, direct stock WB/Ozon "
            "отсутствует, 27 готовых расчётных строк отклонены безопасными шлюзами. "
            "Это ожидаемый и правильный результат до рабочего развёртывания.",
            "red",
        ),
    ]

    # Page 8
    story += [
        PageBreak(),
        para("Контрольный лист перед запуском", "h1"),
        data_table(
            [
                ["Проверка", "Норма", "Сейчас"],
                ["Актуальные API-цены", "Не старше 2 дней, совпадают canonical/API", "334/334 OK"],
                ["Direct stock WB", "Есть и сопоставлен по SKU", "Нет, fallback"],
                ["Direct stock Ozon", "Есть и сопоставлен по SKU", "Нет, fallback"],
                ["Маржа active/new", "Задана по каждой SKU", "115 на согласовании"],
                ["MIN/MAX", "Не противоречат margin floor", "30 gaps открыто"],
                ["Недостижимая экономика", "0 необработанных строк", "24 требуют policy review"],
                ["Экстремальная цена", "0 обычных approvals", "14 требуют rework"],
                ["Статус", "Только после APPROVED РОПа", "Логика протестирована"],
                ["Shadow cutover", "allowed = true", "Сейчас false"],
                ["Серверные функции", "Опубликованы и защищены", "Ещё не опубликованы"],
                ["Пост-сверка", "Все строки verified", "Проверена на моках"],
            ],
            [62 * mm, 62 * mm, 39 * mm],
            small=True,
        ),
        Spacer(1, 6 * mm),
        para("Перед первым реальным применением", "h2"),
        bullet("Развернуть защищённые Edge Functions и GitHub workflows."),
        bullet("Хранить WB/Ozon ключи только в серверных secrets; не помещать их в браузер или Excel."),
        bullet("Получить direct stock/OOS по обеим площадкам и повторить strict-сбор."),
        bullet("Закрыть 30 пробелов маржа/MIN/MAX."),
        bullet("Согласовать РОПом 115 предложений и отдельно разобрать 14 + 24 policy-review строк."),
        bullet("Добиться shadow_cutover.allowed = true."),
        bullet("Сначала выполнить plan, затем apply на малой согласованной выборке."),
        bullet("Проверить verification и журналы площадок; только потом расширять объём."),
        Spacer(1, 5 * mm),
        callout(
            "Итог тестирования",
            "Прошли 18 наборов: API pagination и mapping, seller price, свежесть, реклама, "
            "direct/fallback OOS, себестоимость, маржа, MIN/MAX, XLSX/XLS/CSV/TSV, Excel "
            "round-trip, WB/Ozon выгрузки, задачи цены и статуса, план отправки, обе API-отправки "
            "на моках и обязательная пост-сверка.",
            "green",
        ),
        Spacer(1, 7 * mm),
        para(
            "Рабочий принцип: сначала доказать данные и экономику, затем получить решение РОПа, "
            "после этого отправить точный план и подтвердить результат обратным чтением API.",
            "cover_subtitle",
        ),
    ]
    return story


def build_pdf() -> None:
    register_fonts()
    init_styles()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frame = Frame(
        MARGIN_X,
        MARGIN_BOTTOM,
        PAGE_W - 2 * MARGIN_X,
        PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
        leftPadding=0,
        rightPadding=0,
        topPadding=4 * mm,
        bottomPadding=0,
    )
    doc = BaseDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=MARGIN_X,
        rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title="Репрайсер Harisma: операторская инструкция",
        author="Harisma",
        subject="Маржа, MIN/MAX, OOS, статусы, РОП и безопасная загрузка цен",
    )
    doc.addPageTemplates([PageTemplate(id="guide", frames=[frame], onPage=page_chrome)])
    doc.build(build_story())
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
