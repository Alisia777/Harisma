# MOTION SPECS

- micro interaction: 220–280 ms
- component reveal: 360–460 ms
- route transition: 760–860 ms
- chart draw: 1400–1600 ms
- ambient light: 10–14 s
- easing: `cubic-bezier(.22,.82,.22,1)`

## Правила
1. Переход не блокирует навигацию дольше 900 ms.
2. Loader показывается только если фактическое ожидание > 180 ms.
3. При `prefers-reduced-motion: reduce` остаётся только мгновенная смена opacity.
4. Цвет площадки участвует в motion только как точка или тонкая линия.
5. Никаких бесконечных прыгающих KPI.
