# IMPLEMENTATION CHECKLIST

- [ ] подключены theme tokens после текущих CSS
- [ ] `data-portal-theme` управляет всеми 7 темами
- [ ] light theme: нет белого текста на светлой поверхности
- [ ] muted text >= 4.5:1 на основных поверхностях
- [ ] focus-visible есть на button/input/link
- [ ] marketplace accent занимает <= 8% экрана
- [ ] route transition <= 900 ms
- [ ] loader не показывается при ожидании < 180 ms
- [ ] `prefers-reduced-motion` поддержан
- [ ] таблицы не имеют цветной шахматки
- [ ] route ids / API / Supabase не изменены
- [ ] desktop 1920×1080 и mobile 390×844 проверены
