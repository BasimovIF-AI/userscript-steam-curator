# Steam Curator Follow Tracker (Userscript)

Кроссплатформенный (Chrome + Firefox под Tampermonkey / Violentmonkey) пользовательский скрипт для отслеживания подписок и отписок на кураторов в сообществе и магазине Steam.

---

## Возможности

1. **Менеджер ревизии и отписок от старых кураторов (Новинка v2.3.0):**
   - Кнопка **«📋 Список кураторов»** открывает интерактивное модальное окно.
   - **Сортировка по дате подписки:**
     - ⏳ *Сначала старые (для отписки)* — мгновенно поднимает наверх самые ранние подписки для быстрой отписки от неактуальных кураторов;
     - ⏱️ *Сначала новые* — хронологический порядок от свежих подписок к старым.
   - **Кнопка быстрой инлайн-отписки «❌ Отписаться»:** позволяет отписаться от куратора прямо в таблице (вызывает нативный метод Steam `FollowCurator`) с мгновенной фиксацией даты отписки в локальной базе.
   - Фильтр **«Только активные подписки»** и живой поиск по названию.
2. **Мини-кнопка шестеренка ⚙️ (Все настройки под рукой):**
   - Все вспомогательные действия убраны в компактное выпадающее меню:
     - `💾 Экспорт базы (JSON)` — выгрузка отсортированного списка;
     - `📥 Импорт базы (JSON)` — загрузка файла с историческими датами;
     - `🔄 Пересканировать кураторов` / переход в кураторку.
3. **Автоматический учет дат и статусов в реальном времени:**
   - Фиксирует действия подписки и отписки на страницах кураторов (`/curator/*`).
   - Отображает точный статус в шапке:
     - 🟢 *Подписан: [Дата]* (или с пометкой о создании БД);
     - 🔴 *Отписан: [Дата]*;
     - ⚪ *Новый куратор (ранее не отслеживался)*.
4. **Первичный обход кураторки для новых пользователей:**
   - Автоматический переход и сбор всех подписок на `/curators/mycurators` с единой стартовой датой создания БД.
5. **Кроссплатформенность и zero-overhead:**
   - Работает в Google Chrome, Mozilla Firefox, Brave, Microsoft Edge.
   - Чистый код без внешних библиотек (`@grant GM_setValue`, `GM_getValue`).

---

## Установка и запуск

1. Установите расширение менеджера скриптов:
   - [Tampermonkey](https://www.tampermonkey.net/) или [Violentmonkey](https://violentmonkey.github.io/).
2. Создайте новый скрипт и вставьте в него код [`steam-curator-tracker.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curator-tracker.user.js).
3. Перейдите на страницу любого куратора или страницу подписок:
   `https://store.steampowered.com/curators/mycurators/`
4. Нажмите **«📋 Список кураторов»** для ревизии и отписок, или **⚙️** для экспорта/импорта базы.

---

## Состав репозитория

- [`steam-curator-tracker.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curator-tracker.user.js) — основной трекер кураторов (**v2.3.0**).
- [`steam-curators-sync.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curators-sync.user.js) — архивный скрипт экспорта и компаратора кураторов со страницы `/mycurators` (v1.0.0).
- [`test_tracker.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/test_tracker.js) — автоматические тесты трекера и режимов сортировки.
- [`test_comparator.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/test_comparator.js) — тесты компаратора.
- [`build.ps1`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/build.ps1) — скрипт автоматизации сборки и создания архивов.
