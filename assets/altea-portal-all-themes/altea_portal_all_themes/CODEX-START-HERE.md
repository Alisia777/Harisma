# ALTEA PREMIUM PORTAL — START HERE

Цель: заменить визуальную перегрузку текущего Harisma единой премиальной системой, не меняя расчёты, API, Supabase-контракты и route ids.

## Что открыть
1. `altea-premium-portal-all-themes-standalone.html` — автономный живой референс 15 вкладок × 7 тем.
2. `themes/<theme>/overview.png` — обзор каждой темы.
3. `themes/<theme>/routes/*.jpg` — 105 desktop-референсов.
4. `mobile/*.jpg` — мобильные референсы dashboard и repricer во всех темах.
5. `platform-guides/*.jpg` — правила цветовых вкраплений площадок в каждой теме.
6. `motion/altea-theme-route-motion.mp4` — плавность смены темы, вкладки и площадки.

## Совместимость с Harisma
- темы: `dark`, `light`, `gray`, `emerald`, `hellforge`, `terminal`, `redalert`;
- маршруты: те же `data-view` и `#view-*`;
- CSS подключать после текущих theme-файлов как override-слой;
- на первом PR не менять данные и бизнес-логику.

## Порядок внедрения
1. Общая оболочка: tokens, sidebar, topbar, controls, cards, tables.
2. Контраст и light theme.
3. Marketplace micro-accents.
4. Motion runtime и route loaders.
5. Вкладки по одной: dashboard → executive → control → data-health → commerce → product → analytics.

## Не делать
- не заливать большие поверхности фирменными цветами маркетплейсов;
- не возвращать цветную «шахматку» в таблицы;
- не показывать больше 5 KPI до первого действия;
- не анимировать каждую цифру бесконечно;
- не изменять route ids и API-контракты ради дизайна.
