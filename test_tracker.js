const assert = require('assert');

// Воспроизводим функцию сортировки кураторов из трекера
function getSortedCurators(curatorsMap = {}) {
    return Object.values(curatorsMap).sort((a, b) => {
        const aFollowed = a.status === 'followed';
        const bFollowed = b.status === 'followed';

        // 1. Сначала все активные подписки, затем отписанные
        if (aFollowed !== bFollowed) {
            return aFollowed ? -1 : 1;
        }

        if (aFollowed) {
            // Для активных подписок: сначала с известной датой (от новых к старым)
            if (a.followedAt && b.followedAt) {
                return new Date(b.followedAt) - new Date(a.followedAt);
            }
            if (a.followedAt && !b.followedAt) return -1;
            if (!a.followedAt && b.followedAt) return 1;
        } else {
            // Для отписанных: сначала недавно отписанные
            if (a.unfollowedAt && b.unfollowedAt) {
                return new Date(b.unfollowedAt) - new Date(a.unfollowedAt);
            }
            if (a.unfollowedAt && !b.unfollowedAt) return -1;
            if (!a.unfollowedAt && b.unfollowedAt) return 1;
        }

        return (a.name || '').localeCompare(b.name || '');
    });
}

// Тест 1: Первичная инициализация базы нового пользователя
console.log('Тест 1: Проверка заведения базы нового пользователя и обхода кураторки...');
const dbCreatedAt = "2026-10-01T12:00:00.000Z";
const initialCurators = [
    { clanId: "10", name: "Classic RPG", link: "https://store.steampowered.com/curator/10/" },
    { clanId: "20", name: "Strategy Legends", link: "https://store.steampowered.com/curator/20/" }
];

const database = {
    version: 1,
    user: "NewPlayer",
    steamId: "12345678",
    createdAt: dbCreatedAt,
    updatedAt: dbCreatedAt,
    curators: {}
};

// Заполняем кураторов из первичного обхода (followedAt = createdAt)
initialCurators.forEach(item => {
    database.curators[item.clanId] = {
        clanId: item.clanId,
        name: item.name,
        link: item.link,
        status: 'followed',
        followedAt: dbCreatedAt,
        unfollowedAt: null,
        isInitial: true
    };
});

assert.strictEqual(database.curators["10"].followedAt, dbCreatedAt, "Куратор 10 должен иметь дату создания БД");
assert.strictEqual(database.curators["20"].followedAt, dbCreatedAt, "Куратор 20 должен иметь дату создания БД");

// Тест 2: Последующая подписка вручную на странице куратора
console.log('Тест 2: Проверка последующей ручной подписки...');
const laterFollowDate = "2026-10-19T21:30:00.000Z";
database.curators["30"] = {
    clanId: "30",
    name: "Brand New Curator",
    link: "https://store.steampowered.com/curator/30/",
    status: 'followed',
    followedAt: laterFollowDate,
    unfollowedAt: null,
    isInitial: false
};

// Тест 3: Проверка корректности сортировки
console.log('Тест 3: Проверка сортировки экспорта (ручная подписка выше начальной базы)...');
const sorted = getSortedCurators(database.curators);
assert.strictEqual(sorted.length, 3, "Всего должно быть 3 куратора");
assert.strictEqual(sorted[0].clanId, "30", "Первым должен идти куратор с самой поздней датой подписки (19 октября)");
assert.strictEqual(sorted[0].followedAt, laterFollowDate);
// Кураторы из начальной базы идут следом
assert.ok(sorted[1].clanId === "10" || sorted[1].clanId === "20");
assert.ok(sorted[2].clanId === "10" || sorted[2].clanId === "20");

// Тест 4: Отписка
console.log('Тест 4: Проверка отписки...');
database.curators["10"].status = 'unfollowed';
database.curators["10"].unfollowedAt = "2026-10-20T08:00:00.000Z";

const sortedAfterUnfollow = getSortedCurators(database.curators);
assert.strictEqual(sortedAfterUnfollow[sortedAfterUnfollow.length - 1].clanId, "10", "Отписанный куратор должен идти в конце списка");
assert.strictEqual(sortedAfterUnfollow[0].clanId, "30", "Активный подписчик 30 должен идти первым");
assert.strictEqual(sortedAfterUnfollow[1].clanId, "20", "Активный подписчик 20 должен идти вторым");

console.log('✅ Все тесты трекера (включая первичный обход кураторки) успешно пройдены!');
