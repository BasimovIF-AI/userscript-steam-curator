# Steam Curator Follow Tracker (Userscript)

Кроссплатформенный (Chrome + Firefox под Tampermonkey / Violentmonkey) пользовательский скрипт для отслеживания подписок и отписок на кураторов в сообществе и магазине Steam.

---

## Возможности

1. **Детект нового пользователя и автоматическое заведение базы:**
   - Если скрипт открыт на странице куратора под новым аккаунтом (без базы), выводится предупреждение с кнопкой перехода: **«🚀 Создать базу (обход кураторки)»**.
   - На странице подписок (`/curators/mycurators`) скрипт автоматически прокручивает список, собирает всех текущих кураторов и заводит базу данных.
   - **У всех кураторов из начального обхода проставляется единая самая ранняя дата — дата создания БД (`createdAt`).**
2. **Импорт и экспорт базы в один клик:**
   - Кнопка **«📥 Импорт»** позволяет загрузить отредактированный или перенесенный JSON-файл базы с точными датами подписок прямо в хранилище скрипта.
   - Кнопка **«💾 Экспорт»** выгружает базу, отсортированную строго по дате подписки (от новых к старым).
3. **Автоматическое отслеживание в реальном времени:**
   - Фиксирует действия подписки и отписки на страницах кураторов (`/curator/*`).
   - Ведет локальную базу данных пользователя с привязкой к `steam_id` и имени аккаунта.
   - Записывает точную дату подписки (`followedAt`) и дату отписки (`unfollowedAt`).
4. **Информационный статус в шапке куратора:**
   - Если **подписан**:
     - 🟢 *Подписан: [Дата] (создание БД)* — если подписка зафиксирована в ходе первого обхода кураторки;
     - 🟢 *Подписан: [Дата и время]* — если подписка оформлена вручную позже;
     - 🟢 *Подписан: Дата неизвестна (до начала ведения базы)* — если куратор не имел даты.
   - Если **не подписан**:
     - 🔴 *Отписан: [Дата и время]* — если ранее была оформлена отписка;
     - ⚪ *Новый куратор (ранее не отслеживался)* — если куратор никогда не был в базе.
5. **Кроссплатформенность:**
   - Одинаково стабильно работает в Google Chrome, Mozilla Firefox, Brave, Microsoft Edge.
   - Не имеет внешних зависимостей (`@grant GM_setValue`, `GM_getValue`, zero CDN).

---

## Установка и запуск

1. Установите расширение менеджера скриптов:
   - [Tampermonkey](https://www.tampermonkey.net/) или [Violentmonkey](https://violentmonkey.github.io/).
2. Создайте новый скрипт и вставьте в него код [`steam-curator-tracker.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curator-tracker.user.js).
3. Перейдите на страницу куратора в Steam (например, `https://store.steampowered.com/curator/6856593-PC-Gamer/`) или на страницу своих кураторов:
   `https://store.steampowered.com/curators/mycurators/`
4. Для загрузки подготовленной базы нажмите **«📥 Импорт»** и выберите JSON-файл.

---

## Формат экспорта (JSON)

```json
{
  "version": 1,
  "user": "SteamUsername",
  "steamId": "76561198000000000",
  "createdAt": "2025-02-12T00:00:00.000Z",
  "exportedAt": "2026-10-19T21:10:00.000Z",
  "totalCurators": 100,
  "curators": [
    {
      "clanId": "6856593",
      "name": "PC Gamer",
      "link": "https://store.steampowered.com/curator/6856593/",
      "status": "followed",
      "followedAt": "2026-10-19T21:05:00.000Z",
      "unfollowedAt": null,
      "isInitial": false
    }
  ]
}
```

---

## Состав репозитория

- [`steam-curator-tracker.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curator-tracker.user.js) — основной трекер кураторов (**v2.2.0**).
- [`steam-curators-sync.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curators-sync.user.js) — архивный скрипт экспорта и компаратора кураторов со страницы `/mycurators` (v1.0.0).
- [`test_tracker.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/test_tracker.js) — автоматические тесты трекера.
- [`test_comparator.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/test_comparator.js) — тесты компаратора.
- [`build.ps1`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/build.ps1) — скрипт сборки и упаковки дистрибутивов.
