# Steam Curator Follow Tracker (Userscript)

Кроссплатформенный (Chrome + Firefox под Tampermonkey / Violentmonkey) пользовательский скрипт для отслеживания подписок и отписок на кураторов прямо на страницах сообщества и магазина Steam.

---

## Возможности

1. **Автоматическое отслеживание в реальном времени:**
   - Фиксирует действия подписки и отписки на страницах кураторов (`/curator/*`).
   - Ведет локальную базу данных пользователя с привязкой к `steam_id` и имени аккаунта.
   - Записывает дату подписки (`followedAt`) и дату отписки (`unfollowedAt`).
2. **Информационный статус в шапке куратора:**
   - Если **подписан**:
     - 🟢 *Подписан: [Дата и время]* (для подписок, зафиксированных скриптом).
     - 🟢 *Подписан: Дата неизвестна (до начала ведения базы)* (для подписок, оформленных до установки скрипта).
   - Если **не подписан**:
     - 🔴 *Отписан: [Дата и время]* (если ранее была оформлена отписка).
     - ⚪ *Новый куратор (ранее не отслеживался)* (если куратор никогда не был в базе).
3. **Выгрузка базы, отсортированной по дате подписки:**
   - Кнопка **«📥 Скачать список кураторов (JSON)»** прямо в шапке куратора.
   - Экспортирует JSON со всеми кураторами, отсортированными строго по дате подписки:
     1. Сначала кураторы с известной датой подписки (от самых свежих к старым);
     2. Затем кураторы с неизвестной датой (оформленные до начала ведения базы);
     3. Затем отписанные кураторы (по дате отписки).
4. **Кроссплатформенность:**
   - Одинаково стабильно работает в Google Chrome, Mozilla Firefox, Brave, Microsoft Edge.
   - Не имеет внешних зависимостей (`@grant GM_setValue`, `GM_getValue`, zero CDN).

---

## Установка и запуск

1. Установите расширение менеджера скриптов:
   - [Tampermonkey](https://www.tampermonkey.net/) или [Violentmonkey](https://violentmonkey.github.io/).
2. Создайте новый скрипт и вставьте в него код [`steam-curator-tracker.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curator-tracker.user.js).
3. Откройте любую страницу куратора в Steam, например:
   `https://store.steampowered.com/curator/6856593-PC-Gamer/`
4. В шапке куратора отобразится аккуратный блок со статусом и кнопкой выгрузки.

---

## Формат экспорта (JSON)

```json
{
  "version": 1,
  "user": "SteamUsername",
  "steamId": "76561198000000000",
  "exportedAt": "2026-10-19T21:10:00.000Z",
  "totalCurators": 15,
  "curators": [
    {
      "clanId": "6856593",
      "name": "PC Gamer",
      "link": "https://store.steampowered.com/curator/6856593/",
      "status": "followed",
      "followedAt": "2026-10-19T21:05:00.000Z",
      "unfollowedAt": null
    }
  ]
}
```

---

## Состав репозитория

- [`steam-curator-tracker.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curator-tracker.user.js) — основной трекер кураторов (v2.0.0).
- [`steam-curators-sync.user.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/steam-curators-sync.user.js) — архивный скрипт экспорта и компаратора кураторов со страницы `/mycurators` (v1.0.0).
- [`test_tracker.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/test_tracker.js) — автоматические тесты трекера.
- [`test_comparator.js`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/test_comparator.js) — тесты компаратора.
- [`build.ps1`](file:///e:/%D0%98%D0%BB%D1%8C%D0%B3%D0%B8%D0%B7/Documents/VibeCoding/TM_Scripts/userscript-steam-curator/build.ps1) — скрипт сборки и упаковки дистрибутивов.
