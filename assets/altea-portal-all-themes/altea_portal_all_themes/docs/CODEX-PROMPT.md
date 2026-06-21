# PROMPT ДЛЯ CODEX

Работай в репозитории `Alisia777/Harisma`.

Задача: внедрить визуальную систему из этого пакета поверх текущего портала без изменения расчётов, данных, API, Supabase, route ids и контрактов синхронизации.

Обязательные источники:
- `src/altea-theme-tokens.css`
- `src/altea-marketplace-accents.css`
- `src/altea-motion-system.css`
- `src/altea-theme-integration.js`
- `docs/theme-tokens.json`
- `docs/marketplace-tokens.json`
- `docs/route-manifest.json`
- `docs/CONTRAST-QA.md`
- `docs/IMPLEMENTATION-CHECKLIST.md`

Требования:
1. Сохранить 7 существующих id тем: dark, light, gray, emerald, hellforge, terminal, redalert.
2. Сохранить 15 существующих route ids.
3. Для каждой темы использовать только семантические CSS-токены; не хардкодить белый текст на светлых поверхностях.
4. Цвета площадок применять только как micro-accent: dot, 2 px line, chip, активный filter или одна серия графика; покрытие одного цвета <= 8% viewport.
5. Route transition 760–860 ms; loader показывать только при ожидании > 180 ms; поддержать prefers-reduced-motion.
6. Первый PR: общая оболочка и dashboard во всех темах. Второй PR: executive/control/calendar. Далее — commerce, product, analytics.
7. После каждого PR прогонять screenshot matrix 7 themes × затронутые routes на 1920×1080 и mobile 390×844.
8. Не менять бизнес-логику ради визуала.
