const assert = require('assert');

// Воспроизводим функцию сравнения из скрипта
function compareBases(baseA, baseB) {
    const mapA = new Map((baseA.curators || []).map(c => [c.id, c]));
    const mapB = new Map((baseB.curators || []).map(c => [c.id, c]));

    const allIds = new Set([...mapA.keys(), ...mapB.keys()]);
    const rows = [];

    for (const id of allIds) {
        const inA = mapA.get(id);
        const inB = mapB.get(id);
        const curator = inA || inB;

        let status = 'common';
        if (inA && !inB) status = 'only_me';
        else if (!inA && inB) status = 'only_other';

        rows.push({
            id,
            name: curator.name || 'Unknown',
            subs: curator.subs || 0,
            link: curator.link || (id ? `https://store.steampowered.com/curator/${id}/` : '#'),
            status,
            isDiff: status !== 'common'
        });
    }

    // Сортировка: сначала отличия, затем по убыванию подписчиков
    rows.sort((a, b) => {
        if (a.isDiff !== b.isDiff) return a.isDiff ? -1 : 1;
        return b.subs - a.subs || a.name.localeCompare(b.name);
    });

    return rows;
}

// Тестовые данные
const baseA = {
    version: 1,
    user: "Alice",
    updatedAt: "2026-10-19T10:00:00.000Z",
    total: 3,
    curators: [
        { id: "101", name: "RPG Watch", subs: 50000, link: "https://store.steampowered.com/curator/101/" },
        { id: "102", name: "Indie Games", subs: 120000, link: "https://store.steampowered.com/curator/102/" },
        { id: "103", name: "Strategy Master", subs: 30000, link: "https://store.steampowered.com/curator/103/" }
    ]
};

const baseB = {
    version: 1,
    user: "Bob",
    updatedAt: "2026-10-18T12:00:00.000Z",
    total: 3,
    curators: [
        { id: "102", name: "Indie Games", subs: 120000, link: "https://store.steampowered.com/curator/102/" },
        { id: "104", name: "VR Spotlight", subs: 45000, link: "https://store.steampowered.com/curator/104/" },
        { id: "105", name: "Simulations Hub", subs: 15000, link: "https://store.steampowered.com/curator/105/" }
    ]
};

const results = compareBases(baseA, baseB);
console.log("Total compared entries:", results.length);
assert.strictEqual(results.length, 5, "Всего должно быть 5 уникальных кураторов");

const onlyMe = results.filter(r => r.status === 'only_me');
assert.strictEqual(onlyMe.length, 2, "Только у Alice должно быть 2 (101, 103)");
assert.deepStrictEqual(onlyMe.map(r => r.id).sort(), ["101", "103"]);

const onlyOther = results.filter(r => r.status === 'only_other');
assert.strictEqual(onlyOther.length, 2, "Только у Bob должно быть 2 (104, 105)");
assert.deepStrictEqual(onlyOther.map(r => r.id).sort(), ["104", "105"]);

const common = results.filter(r => r.status === 'common');
assert.strictEqual(common.length, 1, "Общий должен быть 1 (102)");
assert.strictEqual(common[0].id, "102");

// Проверка сортировки: сначала diff=true, потом diff=false
assert.strictEqual(results[0].isDiff, true);
assert.strictEqual(results[results.length - 1].isDiff, false);

console.log("✅ Все проверки компаратора успешно пройдены!");
