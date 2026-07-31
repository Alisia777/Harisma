# Codex prompt — Portal-native интерактивное обучение перед входом

Дата: 2026-07-09  
Статус: уточнение к PR #31  
Ключевая правка: обучение должно быть **отрисовано поверх реального портала**, а не как отдельная абстрактная страница.

---

## 0. Что было не так в общей концепции

Не нужно делать отдельную красивую «учебную презентацию», которую Codex нарисует сам по себе.

Нужно сделать **интерактивное обучение на основе живого интерфейса портала**:

```text
Пользователь вошёл → портал загрузился → рабочая зона временно заблокирована → система подсвечивает реальные вкладки, реальные кнопки и реальные секции → объясняет, что это и как работать → даёт мини-тест → сохраняет прогресс → открывает доступ к нормальной работе.
```

Codex должен опираться на фактическую DOM-структуру портала:

- боковое меню: `.nav-btn[data-view]`;
- вкладки: `#view-dashboard`, `#view-repricer`, `#view-prices` и т.д.;
- topbar: `.topbar`, `#syncStatusBadge`, `#pullRemoteBtn`, `#pushRemoteBtn`;
- текущая система доступа: `window.__ALTEA_PORTAL_ACCESS__`, `window.alteaPortalAccess`, событие `altea:accesschange`;
- текущая auth-логика: production-скрипты подключаются после входа через `type="application/x-altea-auth-delayed"`.

---

## 1. Правильная формулировка задачи для Codex

Реализуй в портале Harisma/Qharisma **portal-native Academy Tour**: интерактивное обучение перед первым полноценным входом в рабочий портал.

Это не отдельный курс и не статичный mockup.

Это слой поверх реального портала, который:

1. запускается после успешной авторизации и загрузки portal shell;
2. временно блокирует рабочие действия;
3. подсвечивает реальные элементы интерфейса через `getBoundingClientRect()`;
4. по очереди открывает реальные вкладки через `setView(viewId)` / fallback;
5. показывает понятные обучающие карточки по каждой вкладке;
6. добавляет кнопку `? Как пользоваться разделом` на каждую вкладку;
7. даёт мини-тесты;
8. сохраняет прогресс в `localStorage`;
9. не ломает бизнес-логику существующих вкладок.

---

## 2. Почему обучение «перед входом», но не до авторизации

До авторизации реальный DOM рабочих вкладок ещё не загружен, потому что основные скрипты портала идут через `application/x-altea-auth-delayed`.

Поэтому делаем так:

### 2.1. До авторизации

На auth-screen можно добавить только лёгкий teaser:

```text
После входа портал покажет короткое обучение по вкладкам.
```

Опционально можно добавить кнопку:

```text
Как устроен портал?
```

Но это не основной интерактивный тур, потому что реальные вкладки ещё недоступны.

### 2.2. После успешной авторизации, но до начала работы

Это основной сценарий:

```text
Авторизация успешна → delayed scripts загрузились → портал открылся → Academy Tour overlay появляется поверх живого интерфейса → пользователь проходит обучение → после завершения портал разблокируется.
```

С точки зрения пользователя это и есть «перед входом в работу».

---

## 3. Файлы, которые нужно создать / изменить

### 3.1. Создать

```text
portal-academy-onboarding.css
portal-academy-onboarding.js
```

### 3.2. Изменить `index.html`

Добавить CSS рядом с остальными стилями:

```html
<link rel="stylesheet" href="portal-academy-onboarding.css?v=20260709academy-native1">
```

Добавить кнопку в sidebar после Дашборда или после Календаря:

```html
<button class="nav-btn" data-view="academy">
  <span>Академия</span>
  <small>обучение · тесты · подсказки</small>
</button>
```

Добавить секцию:

```html
<section class="view" id="view-academy"></section>
```

Подключить JS через auth-delayed:

```html
<script type="application/x-altea-auth-delayed" data-auth-src="portal-academy-onboarding.js?v=20260709academy-native1"></script>
```

Важно: этот скрипт должен запускаться после авторизации, когда рабочий DOM уже доступен.

---

## 4. Главный UX: живой spotlight tour

### 4.1. Overlay

Создать полноэкранный overlay:

```html
<div class="academy-entry-overlay" role="dialog" aria-modal="true">
  <div class="academy-spotlight-layer"></div>
  <div class="academy-coach-card"></div>
  <div class="academy-tour-footer"></div>
</div>
```

Overlay должен:

- затемнять интерфейс;
- оставлять подсвеченную область вокруг текущего элемента;
- показывать карточку объяснения рядом с реальным элементом;
- иметь progress: `Шаг 3 из 18`;
- иметь кнопки: `Назад`, `Далее`, `Пропустить`, `Пройти мини-тест`;
- не давать кликать по порталу, пока тур активен, кроме подсвеченных контролов, если шаг требует действия.

### 4.2. Подсветка реального элемента

Не использовать статичные координаты.

Использовать:

```js
const rect = targetElement.getBoundingClientRect();
```

Дальше рисовать подсветку вокруг `rect`:

- либо 4 overlay-панели вокруг rect;
- либо CSS spotlight ring absolutely positioned;
- либо `clip-path`, если безопасно.

Нужно пересчитывать позицию при:

- `resize`;
- `scroll`;
- смене вкладки;
- перерисовке view;
- MutationObserver.

---

## 5. Tour lifecycle

### 5.1. Storage keys

```js
const ACADEMY_STORAGE = {
  entryTourPassed: 'altea:academy:v1:entryTourPassed',
  entryTourSkipped: 'altea:academy:v1:entryTourSkipped',
  progress: 'altea:academy:v1:progress',
  role: 'altea:academy:v1:role',
  version: 'altea:academy:v1:version'
};
```

### 5.2. Когда показывать

Показывать Academy Tour, если:

- пользователь авторизован;
- `entryTourPassed !== true`;
- portal shell загружен;
- есть `.app-shell`, `.sidebar`, `.main`;
- есть хотя бы один `.nav-btn[data-view]`.

### 5.3. Как понять, что пользователь авторизован

Использовать один из безопасных сигналов:

```js
window.__ALTEA_PORTAL_ACCESS__
window.alteaPortalAccess?.get()
window.addEventListener('altea:accesschange', ...)
```

Также можно fallback через проверку:

```js
!document.body.classList.contains('portal-auth-locked')
```

### 5.4. Boot sequence

```js
function bootAcademyWhenReady() {
  waitForPortalShell().then(() => {
    renderAcademyTab();
    injectHelpButtons();
    maybeStartEntryTour();
  });
}

window.addEventListener('altea:accesschange', bootAcademyWhenReady);
document.addEventListener('DOMContentLoaded', bootAcademyWhenReady);
setTimeout(bootAcademyWhenReady, 800);
```

`waitForPortalShell()` должен ждать реальные элементы, но не зависать навсегда.

---

## 6. Реальные selectors портала

Codex должен использовать именно это как стартовую карту.

```js
const ACADEMY_PORTAL_TARGETS = {
  shell: '.app-shell',
  sidebar: '.sidebar',
  main: '.main',
  topbar: '.topbar',
  syncStatus: '#syncStatusBadge',
  pullRemote: '#pullRemoteBtn',
  pushRemote: '#pushRemoteBtn',
  navButton: (view) => `.nav-btn[data-view="${view}"]`,
  viewSection: (view) => `#view-${view}`
};
```

### Важное правило

Codex не должен рисовать вкладки сам. Он должен находить уже существующие:

```js
document.querySelectorAll('.nav-btn[data-view]')
```

И добавлять обучение поверх них.

---

## 7. Карта вкладок для обучения

Каждый объект нужен и для Academy tab, и для tour, и для drawer.

```js
const ACADEMY_TAB_MODULES = [
  {
    view: 'dashboard',
    title: 'Дашборд',
    navLabel: 'Дашборд',
    target: '.nav-btn[data-view="dashboard"]',
    viewTarget: '#view-dashboard',
    accent: 'blue',
    tourTitle: 'Дашборд: общий сигнал по бизнесу',
    tourText: 'Здесь смотрим KPI, графики, динамику и первые отклонения. Это точка входа в анализ, а не место финальных выводов.',
    updateRule: 'Данные обновляются ежедневно в 11:00 по Москве. До этого времени часть показателей может быть неполной.',
    scenario: ['Проверить время обновления', 'Найти отклонение', 'Перейти в профильную вкладку', 'Создать задачу только после проверки причины'],
    dont: ['Не делать финальные выводы до 11:00 МСК', 'Не эскалировать без проверки источника'],
    quiz: []
  }
];
```

Полный список view:

```text
dashboard
data-health
control
documents
executive
sku-plan-fact
repricer
prices
order
oos-control
sku-contour
launches
launch-control
skus
iu-drr
wb-rating
product-leaderboard
meetings, если доступна
content-factory как логический модуль без обязательной nav-кнопки
```

Если `nav-btn` скрыт (`hidden`, `aria-hidden`, `.portal-access-hidden`), модуль всё равно может быть в Академии, но step tour должен пометить его как `Недоступно для вашей роли` и не пытаться открыть.

---

## 8. Что tour должен показывать по каждой вкладке

### 8.1. Общий шаблон coach-card

Каждый шаг:

```html
<article class="academy-coach-card academy-accent-blue">
  <div class="academy-step-kicker">Шаг 4 из 18 · Вкладка</div>
  <h3>Репрайсер</h3>
  <p>Здесь смотрим рекомендации по цене, риски и минимальную цену.</p>
  <div class="academy-step-rule">Данные обновляются ежедневно в 11:00 по Москве.</div>
  <ul>
    <li>Что смотреть: текущая цена, рекомендация, min price, риск.</li>
    <li>Что нельзя: загружать цену ниже минимума без согласования.</li>
  </ul>
  <div class="academy-actions">
    <button type="button" class="academy-btn academy-btn-ghost" data-academy-prev>Назад</button>
    <button type="button" class="academy-btn academy-btn-primary" data-academy-next>Далее</button>
  </div>
</article>
```

### 8.2. Dashboard

Highlight:

```js
.nav-btn[data-view="dashboard"]
#view-dashboard
#syncStatusBadge
```

Текст:

```text
Дашборд — общий экран. Сначала проверяем статус обновления и дату данных. Если цифры странные до 11:00 МСК — не делаем финальные выводы.
```

### 8.3. Calendar / data-health

Highlight:

```js
.nav-btn[data-view="data-health"]
#view-data-health
```

Текст:

```text
Календарь показывает акции, события и SKU. Перед анализом роста/падения проверяем, не было ли акции, события или запуска.
```

### 8.4. Tasks / control

Highlight:

```js
.nav-btn[data-view="control"]
#view-control
```

Текст:

```text
Здесь живут рабочие задачи. У задачи должен быть owner, срок, результат, критерий завершения и комментарий при смене статуса.
```

### 8.5. Documents

Highlight:

```js
.nav-btn[data-view="documents"]
#view-documents
```

Текст:

```text
Хранилище — место для регламентов, файлов, ссылок и актуальных версий. Если инструкции нет — создаём задачу на её добавление.
```

### 8.6. Executive

Highlight:

```js
.nav-btn[data-view="executive"]
#view-executive
```

Текст:

```text
Вкладка руководителя помогает увидеть риски, решения и итоговую картину. Любой красный риск должен иметь owner и следующий шаг.
```

### 8.7. SKU plan fact

Highlight:

```js
.nav-btn[data-view="sku-plan-fact"]
#view-sku-plan-fact
```

Текст:

```text
План-факт SKU помогает понять отклонение от плана. Если факт ниже плана — проверяем цену, остаток, рекламу и воронку.
```

### 8.8. Repricer

Highlight:

```js
.nav-btn[data-view="repricer"]
#view-repricer
```

Текст:

```text
Репрайсер — инструмент работы с ценой. Смотрим текущую цену, рекомендацию, min price и риск. Нельзя загружать цену ниже минимальной без проверки.
```

### 8.9. Prices

Highlight:

```js
.nav-btn[data-view="prices"]
#view-prices
```

Текст:

```text
Цены — контроль цены, маржи, оборота и СПП. Если цена в портале и на маркетплейсе отличается, сначала проверяем время обновления, источник и промо.
```

### 8.10. Order

Highlight:

```js
.nav-btn[data-view="order"]
#view-order
```

Текст:

```text
Заказ товара показывает кластеры, склады, поставки и потребность. Нельзя смотреть только общий остаток без кластера.
```

### 8.11. OOS control

Highlight:

```js
.nav-btn[data-view="oos-control"]
#view-oos-control
```

Текст:

```text
OOS контроль показывает пустые полки, потери и меры. Главный приоритет — не количество проблемных SKU, а потерянная выручка и риск продаж.
```

### 8.12. SKU workspace

Highlight:

```js
.nav-btn[data-view="sku-contour"]
#view-sku-contour
```

Текст:

```text
SKU workspace связывает реестр, API-контур и owner. Если SKU без owner или API-пары — создаём задачу на исправление.
```

### 8.13. Products / launches

Highlight:

```js
.nav-btn[data-view="launches"]
#view-launches
```

Текст:

```text
Здесь заводим новинки: SKU, название, owner, маркетплейс, план запуска, статус, цена, контент, реклама, блокер и next step.
```

Обязательный сценарий:

```text
Открыть Продукты / Новинки → добавить/выбрать новинку → заполнить SKU, owner, MP, план запуска → статус «Подготовка» → создать чек-лист → назначить задачи по цене, карточке, контенту и рекламе.
```

### 8.14. Launch control

Если доступна секция:

```js
#view-launch-control
```

Текст:

```text
Запуск новинок — чек-листы, фазы, просрочки, блокеры и фактическая дата запуска. Закрывать запуск можно только после выполнения критериев.
```

### 8.15. IU DRR

Highlight:

```js
.nav-btn[data-view="iu-drr"]
#view-iu-drr
```

Текст:

```text
Показатели площадок показывают WB/Ozon/Я.Маркет, план-факт и ДРР. При высоком ДРР проверяем рекламу, цену, остатки и воронку.
```

### 8.16. WB rating

Highlight:

```js
.nav-btn[data-view="wb-rating"]
#view-wb-rating
```

Текст:

```text
Рейтинг карточек показывает отзывы, рейтинг и динамику. При падении рейтинга создаём задачу на карточку, контент или ответы.
```

### 8.17. Product leaderboard / funnel

Highlight:

```js
.nav-btn[data-view="product-leaderboard"]
#view-product-leaderboard
```

Текст:

```text
Лидерборд показывает КЗ, воронку и ROMI. Если заказы падают — ищем этап провала: показы, клики, корзина, заказ, выкуп.
```

### 8.18. Content factory

Если отдельной вкладки нет, показывать модуль в Академии и drawer на `documents`, `control`, `launches`.

Текст:

```text
Контент-завод — ТЗ, материалы, owner, дедлайн, статус, проверка результата и связь с карточкой/новинкой/рекламой. Нельзя принимать контент без ТЗ и критериев проверки.
```

---

## 9. Academy tab должна быть не главным обучением, а базой знаний

Вкладка `Академия` нужна как центр:

- посмотреть прогресс;
- открыть любой модуль;
- повторить тест;
- запустить тур заново;
- выбрать роль;
- посмотреть, какие вкладки доступны пользователю;
- увидеть, какие модули обязательны.

Но основной эффект обучения должен происходить **на реальных вкладках**, через tour + drawer.

---

## 10. Кнопка помощи на каждой вкладке

На каждую доступную вкладку добавить кнопку:

```html
<button class="academy-help-btn" type="button" data-academy-help-button="repricer">
  <span aria-hidden="true">?</span>
  Как пользоваться разделом
</button>
```

Где вставлять:

1. Внутрь `.section-title`, если она есть.
2. Если `.section-title` нет — в начало `#view-${view}`.
3. Если view пустая и перерендерится позже — добавить через MutationObserver.

Не дублировать кнопку:

```js
if (root.querySelector('[data-academy-help-button]')) return;
```

---

## 11. Drawer по вкладке

Drawer должен открываться справа и быть связан с текущим view.

```html
<aside class="academy-drawer" role="dialog" aria-modal="true" aria-labelledby="academyDrawerTitle">
  <button type="button" class="academy-drawer-close">×</button>
  <div class="academy-drawer-kicker">Как пользоваться разделом</div>
  <h2 id="academyDrawerTitle">Репрайсер</h2>
  <p>Управление ценами, рекомендациями и рисками.</p>
  <section>Что смотреть</section>
  <section>Что можно делать</section>
  <section>Что нельзя делать</section>
  <section>Сценарий работы</section>
  <button>Открыть полный урок</button>
  <button>Пройти мини-тест</button>
</aside>
```

Обязательная фраза в drawer для data-heavy вкладок:

```text
Данные обновляются ежедневно в 11:00 по Москве. До этого времени часть показателей может быть неполной.
```

---

## 12. Мини-тесты

У каждой вкладки минимум 3 вопроса.

Проходной балл: 80%.

Пример для Репрайсера:

```js
{
  question: 'Репрайсер предлагает цену ниже минимальной. Что делаем?',
  options: [
    'Загружаем новую цену сразу',
    'Не загружаем, проверяем правило и эскалируем ответственному',
    'Игнорируем риск',
    'Снижаем минимальную цену в правиле'
  ],
  answer: 1,
  explain: 'Цена ниже минимума — риск маржи и экономики. Нужно проверить правило и согласовать действие.'
}
```

Пример для Новинок:

```js
{
  question: 'Можно ли переводить новинку в готово к запуску, если нет контента или цены?',
  options: ['Да', 'Нет', 'Можно, если дедлайн горит', 'Можно только на WB'],
  answer: 1,
  explain: 'Готово к запуску означает, что карточка, цена, контент, реклама и чек-лист готовы.'
}
```

Пример для Воронки:

```js
{
  question: 'Показы есть, кликов нет. Где вероятнее проблема?',
  options: ['Остатки', 'Первый экран/креатив/карточка/цена', 'Поставка', 'Tracker'],
  answer: 1,
  explain: 'Если показы есть, а кликов нет, сначала проверяем привлекательность карточки, цену, креатив и позицию.'
}
```

---

## 13. Реальное динамическое поведение tour

### 13.1. При шаге вкладки

```js
async function showTabStep(view) {
  await openPortalView(view);
  await waitForElement(`.nav-btn[data-view="${view}"]`);
  await waitForElement(`#view-${view}`);
  const target = document.querySelector(`.nav-btn[data-view="${view}"]`) || document.querySelector(`#view-${view}`);
  positionSpotlight(target);
  renderCoachCard(moduleForView(view));
}
```

### 13.2. Если view недоступна

```text
Эта вкладка не доступна вашей роли. В Академии можно посмотреть краткое описание, но рабочий раздел скрыт правами доступа.
```

### 13.3. Если DOM секции пустой

Показывать fallback на nav button:

```text
Раздел загружается. Когда данные появятся, кнопка помощи будет добавлена автоматически.
```

---

## 14. CSS форма и визуал

Все классы только `academy-*`.

Основные элементы:

```css
.academy-entry-overlay
.academy-spotlight-layer
.academy-spotlight-ring
.academy-coach-card
.academy-coach-progress
.academy-help-btn
.academy-drawer
.academy-drawer-backdrop
.academy-module-card
.academy-quiz-card
.academy-role-card
.academy-update-rule
```

Визуально:

- dark glass как в портале;
- золото для primary action;
- синий для базовых подсказок;
- изумрудный для success/progress;
- coral/red для запретов и рисков;
- мягкие анимации;
- `prefers-reduced-motion`;
- mobile drawer fullscreen.

---

## 15. Не делать

Codex не должен:

- рисовать новый портал вместо текущего;
- использовать статичные координаты из SVG/картинки;
- делать обучение отдельной страницей без связи с DOM;
- скрывать реальные вкладки;
- менять расчёты цен, репрайсера, OOS, SKU, воронки;
- добавлять внешние зависимости;
- блокировать вход навсегда, если пользователь нажал «Пройти позже».

---

## 16. Acceptance criteria

Готово только если:

1. После первого успешного входа появляется Academy Tour поверх реального портала.
2. Tour подсвечивает реальные `.nav-btn[data-view]` и реальные `#view-*`.
3. Tour автоматически открывает вкладку перед объяснением через `setView()` / fallback.
4. На каждой доступной вкладке есть кнопка `? Как пользоваться разделом`.
5. Drawer открывается с контентом именно текущей вкладки.
6. Вкладка `Академия` есть в sidebar и показывает прогресс/модули.
7. Есть модуль по каждой активной вкладке портала.
8. Есть сценарии: новинка, статус, репрайсер, цены, воронка, контент-завод, Tracker, данные 11:00 МСК.
9. Мини-тесты работают, score считается, проходной балл 80%.
10. Прогресс сохраняется в `localStorage`.
11. Если пользователь нажал `Пройти позже`, портал открывается, но в topbar/sidebar остаётся заметный бейдж `Обучение не пройдено`.
12. Пользователь может запустить тур заново из Академии.
13. Mobile работает.
14. `prefers-reduced-motion` учтён.
15. Нет console errors при переключении вкладок.
16. `npm run portal:tabs-smoke` проходит.

---

## 17. Smoke test вручную

```text
1. Очистить localStorage altea:academy:v1:*.
2. Войти в портал.
3. Убедиться, что появляется overlay до начала работы.
4. Нажать Далее.
5. Убедиться, что подсвечивается реальная кнопка Дашборд.
6. Дойти до Репрайсера: портал должен открыть вкладку repricer и подсветить её nav button/section.
7. Нажать «Пройти позже» — overlay исчезает, но бейдж обучения остаётся.
8. Открыть Академию → запустить тур заново.
9. На вкладке Цены нажать `? Как пользоваться разделом` → drawer показывает модуль Цены.
10. Пройти мини-тест неправильно → увидеть объяснение.
11. Пройти правильно → progress сохраняется.
12. Перезагрузить страницу → progress сохранился.
13. Проверить mobile 390px.
14. Запустить npm run portal:tabs-smoke.
```

---

## 18. Прямой prompt для Codex

```text
Реализуй portal-native интерактивное обучение Qharisma Academy.

Важно: обучение должно быть не отдельной презентацией и не статичным макетом. Оно должно запускаться после успешного входа и до начала работы, поверх настоящего портала, подсвечивая реальные элементы DOM.

Используй файлы:
- docs/academy-onboarding-codex-brief.md
- docs/codex-prompt-academy-tab-by-tab.md
- docs/codex-prompt-portal-native-academy-tour.md
- docs/academy-portal-native-wireframe.svg

Создай:
- portal-academy-onboarding.css
- portal-academy-onboarding.js

Измени index.html:
- подключи CSS portal-academy-onboarding.css?v=20260709academy-native1;
- добавь nav-btn data-view="academy";
- добавь section id="view-academy";
- подключи JS через application/x-altea-auth-delayed: portal-academy-onboarding.js?v=20260709academy-native1.

Технически:
- используй `.nav-btn[data-view]` и `#view-*` как реальные target elements;
- spotlight строится через getBoundingClientRect(), без статичных координат;
- открывай вкладки через window.setView(view) или fallback;
- listen `altea:accesschange` и жди portal shell;
- inject help buttons через MutationObserver;
- drawer должен показывать помощь по текущей вкладке;
- первый tour должен блокировать рабочее взаимодействие до завершения или skip;
- progress хранить в `localStorage` с ключами `altea:academy:v1:*`;
- все CSS-классы только `academy-*`;
- без внешних зависимостей;
- не менять бизнес-логику существующих вкладок.

Обязательные вкладки:
- dashboard
- data-health
- control
- documents
- executive
- sku-plan-fact
- repricer
- prices
- order
- oos-control
- sku-contour
- launches
- launch-control, если есть
- skus, если есть
- iu-drr
- wb-rating
- product-leaderboard
- content-factory как логический модуль

Обязательная фраза:
«Данные обновляются ежедневно в 11:00 по Москве. До этого времени часть показателей может быть неполной.»

После реализации запусти:
npm run portal:tabs-smoke
```
