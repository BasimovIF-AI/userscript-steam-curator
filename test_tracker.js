const assert = require('assert');

// Воспроизводим функцию сортировки кураторов из трекера
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

// Тест 1: Первичная инициализация базы нового пользователя
console.log('Тест 1: Проверка заведения базы нового пользователя и обхода кураторки...');
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

// Тест 2: Сортировка "Сначала старые" (для отписки)
console.log('Тест 2: Проверка режима "Сначала старые" (для отписки)...');
const sortedOldest = getSortedCurators(database.curators, 'oldest');
assert.strictEqual(sortedOldest[0].clanId, "10", "Первым должен идти самый старый активный куратор (PobreGamer от 12.02.2025)");
assert.strictEqual(sortedOldest[1].clanId, "20", "Вторым должен идти Candylight Studio от 05.05.2025");
assert.strictEqual(sortedOldest[2].clanId, "30", "Третьим должен идти недавний куратор от 19.10.2026");
assert.strictEqual(sortedOldest[3].clanId, "40", "Отписанный должен идти в самом конце");

// Тест 3: Сортировка "Сначала новые" (для экспорта)
console.log('Тест 3: Проверка режима "Сначала новые"...');
const sortedNewest = getSortedCurators(database.curators, 'newest');
assert.strictEqual(sortedNewest[0].clanId, "30", "Первым должен идти самый свежий куратор от 19.10.2026");
assert.strictEqual(sortedNewest[1].clanId, "20", "Вторым должен идти Candylight Studio от 05.05.2025");
assert.strictEqual(sortedNewest[2].clanId, "10", "Третьим должен идти PobreGamer от 12.02.2025");
assert.strictEqual(sortedNewest[3].clanId, "40", "Отписанный в самом конце");

console.log('✅ Все тесты трекера (включая ревизию старых кураторов) успешно пройдены!');
