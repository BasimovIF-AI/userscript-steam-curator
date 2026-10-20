const assert = require('assert');

// Воспроизводим ключевые функции движка из steam-curator-tracker.user.js
function getSortedCurators(curatorsMap = {}, order = 'newest') {
    return Object.values(curatorsMap).sort((a, b) => {
        const aFollowed = a.status === 'followed';
        const bFollowed = b.status === 'followed';

        if (aFollowed !== bFollowed) {
            return aFollowed ? -1 : 1;
        }

        if (aFollowed) {
            if (a.followedAt && b.followedAt) {
                const diff = new Date(b.followedAt) - new Date(a.followedAt);
                return order === 'oldest' ? -diff : diff;
            }
            if (a.followedAt && !b.followedAt) return -1;
            if (!a.followedAt && b.followedAt) return 1;
        } else {
            if (a.unfollowedAt && b.unfollowedAt) {
                const diff = new Date(b.unfollowedAt) - new Date(a.unfollowedAt);
                return order === 'oldest' ? -diff : diff;
            }
            if (a.unfollowedAt && !b.unfollowedAt) return -1;
            if (!a.unfollowedAt && b.unfollowedAt) return 1;
        }

        return (a.name || '').localeCompare(b.name || '');
    });
}

function getActiveFollowedCount(curatorsMap = {}) {
    return Object.values(curatorsMap).filter(c => c && c.status === 'followed').length;
}

function simulateAutoUpdateVisit(record, settings, isNavigatedFromOurList, sessionSet = new Set()) {
    if (!settings.autoUpdateOnVisit) return false;
    if (isNavigatedFromOurList) return false;
    if (!record || record.status !== 'followed') return false;
    if (sessionSet.has(record.clanId)) return false;

    sessionSet.add(record.clanId);

    const now = new Date();
    if (record.followedAt) {
        const prevTime = new Date(record.followedAt).getTime();
        if (!isNaN(prevTime) && (now.getTime() - prevTime < 5 * 60 * 1000)) {
            return false;
        }
    }

    record._prevFollowedAt = record.followedAt || null;
    record.followedAt = now.toISOString();
    record.isAutoUpdated = true;
    return true;
}

function simulateUndoAutoUpdate(record) {
    if (!record || !record._prevFollowedAt) return false;
    record.followedAt = record._prevFollowedAt;
    delete record._prevFollowedAt;
    record.isAutoUpdated = false;
    return true;
}

function isCuratorOrCreatorPage(pathname) {
    return pathname.startsWith('/curator/') ||
           pathname.startsWith('/developer/') ||
           pathname.startsWith('/publisher/') ||
           pathname.startsWith('/franchise/');
}

// -----------------------------------------------------------------------------
// Тест 1: Первичная база данных
// -----------------------------------------------------------------------------
console.log('Тест 1: Проверка заведения базы нового пользователя и структуры данных...');
const dbCreatedAt = "2025-02-12T00:00:00.000Z";
const database = {
    version: 1,
    user: "NewPlayer",
    steamId: "12345678",
    createdAt: dbCreatedAt,
    updatedAt: dbCreatedAt,
    curators: {
        "10": { clanId: "10", name: "PobreGamer", link: "https://store.steampowered.com/curator/10/", status: 'followed', followedAt: "2025-02-12T00:00:00.000Z", unfollowedAt: null, isInitial: true },
        "20": { clanId: "20", name: "Candylight Studio", link: "https://store.steampowered.com/curator/20/", status: 'followed', followedAt: "2025-05-05T00:00:00.000Z", unfollowedAt: null, isInitial: false },
        "30": { clanId: "30", name: "Recent Curator", link: "https://store.steampowered.com/curator/30/", status: 'followed', followedAt: "2026-10-19T20:00:00.000Z", unfollowedAt: null, isInitial: false },
        "40": { clanId: "40", name: "Old Unfollowed", link: "https://store.steampowered.com/curator/40/", status: 'unfollowed', followedAt: "2025-01-01T00:00:00.000Z", unfollowedAt: "2026-10-18T10:00:00.000Z", isInitial: false }
    }
};

// -----------------------------------------------------------------------------
// Тест 2: Сортировка "Сначала старые" (для отписки)
// -----------------------------------------------------------------------------
console.log('Тест 2: Проверка режима "Сначала старые" (для отписки)...');
const sortedOldest = getSortedCurators(database.curators, 'oldest');
assert.strictEqual(sortedOldest[0].clanId, "10", "Первым должен идти самый старый активный куратор (PobreGamer от 12.02.2025)");
assert.strictEqual(sortedOldest[1].clanId, "20", "Вторым должен идти Candylight Studio от 05.05.2025");
assert.strictEqual(sortedOldest[2].clanId, "30", "Третьим должен идти недавний куратор от 19.10.2026");
assert.strictEqual(sortedOldest[3].clanId, "40", "Отписанный должен идти в самом конце");

// -----------------------------------------------------------------------------
// Тест 3: Сортировка "Сначала новые" (для экспорта)
// -----------------------------------------------------------------------------
console.log('Тест 3: Проверка режима "Сначала новые"...');
const sortedNewest = getSortedCurators(database.curators, 'newest');
assert.strictEqual(sortedNewest[0].clanId, "30", "Первым должен идти самый свежий куратор от 19.10.2026");
assert.strictEqual(sortedNewest[1].clanId, "20", "Вторым должен идти Candylight Studio от 05.05.2025");
assert.strictEqual(sortedNewest[2].clanId, "10", "Третьим должен идти PobreGamer от 12.02.2025");
assert.strictEqual(sortedNewest[3].clanId, "40", "Отписанный в самом конце");

// -----------------------------------------------------------------------------
// Тест 4: Расчет активных подписок (лимит X/100) и декремент при отписке
// -----------------------------------------------------------------------------
console.log('Тест 4: Проверка счетчика активных подписок (X/100)...');
let activeCount = getActiveFollowedCount(database.curators);
assert.strictEqual(activeCount, 3, "Активных подписок должно быть ровно 3 (отписанный не учитывается)");
assert.strictEqual(`(${activeCount}/100)`, "(3/100)", "Формат кнопки должен быть (3/100)");

// Имитируем отписку от куратора "20"
database.curators["20"].status = 'unfollowed';
database.curators["20"].unfollowedAt = new Date().toISOString();
activeCount = getActiveFollowedCount(database.curators);
assert.strictEqual(activeCount, 2, "После отписки счетчик должен мгновенно уменьшиться до 2");
assert.strictEqual(`(${activeCount}/100)`, "(2/100)", "Кнопка должна отображать (2/100)");

// Возвращаем обратно для следующих тестов
database.curators["20"].status = 'followed';

// -----------------------------------------------------------------------------
// Тест 5: Автообновление даты подписки при переходе и отмена (Undo)
// -----------------------------------------------------------------------------
console.log('Тест 5: Проверка логики автообновления даты и ручной отмены (Undo)...');
const testCurator = {
    clanId: "99",
    name: "Test Curator",
    status: 'followed',
    followedAt: "2025-05-01T00:00:00.000Z",
    unfollowedAt: null
};

// 5.1 Обычный переход с включенной настройкой
const session = new Set();
const settings = { autoUpdateOnVisit: true };
const updated = simulateAutoUpdateVisit(testCurator, settings, false, session);
assert.strictEqual(updated, true, "Дата должна обновиться при обычном визите");
assert.strictEqual(testCurator._prevFollowedAt, "2025-05-01T00:00:00.000Z", "Предыдущая дата должна сохраниться в _prevFollowedAt");
assert.strictEqual(testCurator.isAutoUpdated, true, "Флаг isAutoUpdated должен быть true");
assert.notStrictEqual(testCurator.followedAt, "2025-05-01T00:00:00.000Z", "Текущая дата должна стать сегодняшней");

// 5.2 Ручная отмена (Undo)
const undone = simulateUndoAutoUpdate(testCurator);
assert.strictEqual(undone, true, "Отмена должна успешно восстановить дату");
assert.strictEqual(testCurator.followedAt, "2025-05-01T00:00:00.000Z", "Дата должна вернуться к исходной");
assert.strictEqual(testCurator._prevFollowedAt, undefined, "Поле _prevFollowedAt должно быть удалено");
assert.strictEqual(testCurator.isAutoUpdated, false, "Флаг isAutoUpdated должен быть сброшен в false");

// 5.3 Переход из нашей таблицы (isNavigatedFromOurList === true)
const session2 = new Set();
const bypassed = simulateAutoUpdateVisit(testCurator, settings, true, session2);
assert.strictEqual(bypassed, false, "При переходе из таблицы дата не должна обновляться!");
assert.strictEqual(testCurator.followedAt, "2025-05-01T00:00:00.000Z", "Дата должна остаться неизменной");

// 5.4 Отключенная настройка автообновления
const session3 = new Set();
const settingsDisabled = { autoUpdateOnVisit: false };
const disabledUpdate = simulateAutoUpdateVisit(testCurator, settingsDisabled, false, session3);
assert.strictEqual(disabledUpdate, false, "При отключенной настройке дата не должна обновляться");

// -----------------------------------------------------------------------------
// Тест 6: Поддержка маршрутов Steam Creator Homes (/developer/*, /publisher/*, /franchise/*)
// -----------------------------------------------------------------------------
console.log('Тест 6: Проверка поддержки маршрутов /developer/*, /publisher/*, /franchise/*...');
assert.strictEqual(isCuratorOrCreatorPage('/curator/45109057-PobreGamer/'), true, "/curator/ должен поддерживаться");
assert.strictEqual(isCuratorOrCreatorPage('/developer/russpuppy/'), true, "/developer/ должен поддерживаться");
assert.strictEqual(isCuratorOrCreatorPage('/publisher/nd/'), true, "/publisher/ должен поддерживаться");
assert.strictEqual(isCuratorOrCreatorPage('/franchise/tomb-raider/'), true, "/franchise/ должен поддерживаться");
assert.strictEqual(isCuratorOrCreatorPage('/app/1091500/'), false, "Страницы игр /app/ не должны триггерить трекер");
assert.strictEqual(isCuratorOrCreatorPage('/curators/mycurators'), false, "Страница /mycurators обрабатывается отдельной панелью");

console.log('✅ Все тесты трекера (включая лимит X/100, автообновление, отмену и маршруты Creator Homes) успешно пройдены!');
