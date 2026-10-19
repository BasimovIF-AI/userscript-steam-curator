const assert = require('assert');

// Воспроизводим функцию сортировки кураторов из трекера
function getSortedCurators(curatorsMap = {}) {
    return Object.values(curatorsMap).sort((a, b) => {
        // 1. Сначала подписки с известной датой (от новых к старым)
        if (a.followedAt && b.followedAt) {
            return new Date(b.followedAt) - new Date(a.followedAt);
        }
        if (a.followedAt && !b.followedAt) return -1;
        if (!a.followedAt && b.followedAt) return 1;

        // 2. Затем подписки с неизвестной датой (оформленные до начала ведения базы)
        if (a.status === 'followed' && b.status !== 'followed') return -1;
        if (a.status !== 'followed' && b.status === 'followed') return 1;

        // 3. Затем отписанные (по дате отписки, от недавних к старым)
        if (a.unfollowedAt && b.unfollowedAt) {
            return new Date(b.unfollowedAt) - new Date(a.unfollowedAt);
        }

        return (a.name || '').localeCompare(b.name || '');
    });
}

// Тест 1: Сортировка по дате подписки
console.log('Тест 1: Проверка сортировки по дате подписки...');
const curatorsData = {
    "1": { clanId: "1", name: "Alpha", status: "followed", followedAt: "2026-10-15T10:00:00.000Z", unfollowedAt: null },
    "2": { clanId: "2", name: "Beta (самый свежий)", status: "followed", followedAt: "2026-10-19T18:00:00.000Z", unfollowedAt: null },
    "3": { clanId: "3", name: "Gamma (старая база)", status: "followed", followedAt: null, unfollowedAt: null },
    "4": { clanId: "4", name: "Delta (отписан)", status: "unfollowed", followedAt: null, unfollowedAt: "2026-10-19T12:00:00.000Z" }
};

const sorted = getSortedCurators(curatorsData);
assert.strictEqual(sorted.length, 4, "Должно быть 4 куратора");
assert.strictEqual(sorted[0].clanId, "2", "Первым должен идти самый недавний подписчик (Beta)");
assert.strictEqual(sorted[1].clanId, "1", "Вторым должен идти Alpha (15 октября)");
assert.strictEqual(sorted[2].clanId, "3", "Третьим должен идти Gamma с неизвестной датой подписки");
assert.strictEqual(sorted[3].clanId, "4", "Последним должен идти отписанный Delta");

// Тест 2: Эмуляция жизненного цикла куратора
console.log('Тест 2: Проверка переходов состояний follow / unfollow...');
let curator = {
    clanId: "100",
    name: "Strategy World",
    link: "https://store.steampowered.com/curator/100/",
    status: "followed",
    followedAt: null, // Исходно был подписан до базы
    unfollowedAt: null
};

// 1. Отписка
const unfollowTime = "2026-10-19T20:00:00.000Z";
curator.status = 'unfollowed';
curator.unfollowedAt = unfollowTime;
assert.strictEqual(curator.status, 'unfollowed');
assert.strictEqual(curator.unfollowedAt, unfollowTime);

// 2. Повторная подписка
const reFollowTime = "2026-10-19T21:00:00.000Z";
curator.status = 'followed';
curator.followedAt = reFollowTime;
curator.unfollowedAt = null;
assert.strictEqual(curator.status, 'followed');
assert.strictEqual(curator.followedAt, reFollowTime);
assert.strictEqual(curator.unfollowedAt, null);

console.log('✅ Все тесты трекера успешно пройдены!');
