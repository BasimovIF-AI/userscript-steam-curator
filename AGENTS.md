# AGENTS.md — Машинно-читаемый контекст проекта

## 1. Миссия, KPI и границы проекта (Mission & Scope)
- **Цель проекта:**
  1. `steam-curator-tracker.user.js` (v2.0.0): В реальном времени отслеживать действия подписки/отписки на странице куратора Steam (`/curator/*`), фиксировать дату подписки (`followedAt`), дату отписки (`unfollowedAt`), имя и `steam_id` пользователя, инжектировать информационный виджет и предоставлять экспорт списка кураторов, отсортированного по дате подписки.
  2. `steam-curators-sync.user.js` (v1.0.0, архивирован/legacy): Экспорт списка кураторов Steam в JSON со страницы `/curators/mycurators` и сопоставление баз двух пользователей.
- **KPI:**
  - 0 внешних CDN-зависимостей (`@grant GM_setValue`, `GM_getValue`, без утечек CSP).
  - Реактивный отклик трекера подписок (< 50 ms) при кликах по нативным кнопкам Steam.
  - Корректная сортировка $O(N \log N)$ кураторов при экспорте с гарантированным порядком (недавние -> старые -> с неизвестной датой -> отписанные).
  - Кроссплатформенность: полная совместимость с Chrome и Firefox под Tampermonkey и Violentmonkey.
- **Границы проекта (Non-Goals):**
  - Поддержка устаревших форматов экспорта (Excel/XLS).
  - Автоматическая массовая подписка или отписка от кураторов без участия пользователя.

## 2. Сборка и верификация (Build & Verification)
- **Проверка синтаксиса:**
  ```powershell
  node --check steam-curator-tracker.user.js
  node --check steam-curators-sync.user.js
  ```
- **Запуск модульных тестов:**
  ```powershell
  node test_tracker.js
  node test_comparator.js
  ```
- **Сборка релиза и архивация исходников:**
  ```powershell
  .\build.ps1
  ```

## 3. Архитектурные правила и инварианты
- **Идентификация пользователя:** Использование `unsafeWindow.g_AccountID` / `unsafeWindow.g_steamID` с fallback на `#account_pulldown` и `[data-miniprofile]`. Ключ хранилища изолирован по аккаунтам (`steam_curators_tracker_db_<steamId>`).
- **Событийная модель трекера:** 
  1. Делегированный `click`-перехват элементов `[id^="CuratorFollowBtn_"]` и `[id^="CuratorUnFollowBtn_"]`.
  2. Проксирование вызова нативной функции `unsafeWindow.FollowCurator(clanid, bFollow)`.
  3. Периодический поллинг (1000ms) для синхронизации интерфейса и первичного обнаружения подписки при открытии страницы.
- **Инварианты дат:**
  - При первом заходе на страницу куратора, если пользователь уже подписан, но записи в базе не было: `followedAt = null` (отображается статус «Дата неизвестна (до начала ведения базы)»).
  - При ручной подписке: `status = 'followed'`, `followedAt = ISO_NOW`, `unfollowedAt = null`.
  - При отписке: `status = 'unfollowed'`, `unfollowedAt = ISO_NOW`.

## 4. Подводные камни и нетривиальные решения
- **Состояние кнопок Steam:** Steam переключает видимость кнопок `#CuratorFollowBtn_<clanid>` и `#CuratorUnFollowBtn_<clanid>` через inline-стиль `style="display: none"`. Проверка `isFollowedInDOM` анализирует `window.getComputedStyle(btn).display !== 'none' && btn.offsetParent !== null`.
- **Задержка ответа Steam:** Чтобы избежать гонки состояний при асинхронном запросе Steam на `/curators/ajaxfollow/`, запись в БД выполняется после тайм-аута (300ms) либо по факту подтверждения изменения в DOM.
