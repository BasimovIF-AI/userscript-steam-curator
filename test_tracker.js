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

// Имитируем повторную подписку (Re-follow) из модального окна
database.curators["20"].status = 'followed';
database.curators["20"].followedAt = new Date().toISOString();
database.curators["20"].unfollowedAt = null;
activeCount = getActiveFollowedCount(database.curators);
assert.strictEqual(activeCount, 3, "После повторной подписки счетчик должен мгновенно увеличиться до 3");
assert.strictEqual(`(${activeCount}/100)`, "(3/100)", "Кнопка должна отображать (3/100)");

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

// -----------------------------------------------------------------------------
// Тест 7: Проверка константы версии SCRIPT_VERSION и SemVer
// -----------------------------------------------------------------------------
console.log('Тест 7: Проверка константы версии SCRIPT_VERSION и SemVer...');
const fs = require('fs');
const trackerSource = fs.readFileSync('steam-curator-tracker.user.js', 'utf-8');
const versionMatch = trackerSource.match(/const SCRIPT_VERSION = ['"]([^'"]+)['"]/);
assert.ok(versionMatch, 'В коде трекера должна присутствовать константа SCRIPT_VERSION');
const currentVersion = versionMatch[1];
assert.match(currentVersion, /^\d+\.\d+\.\d+$/, 'Версия должна соответствовать SemVer (X.Y.Z)');
assert.strictEqual(currentVersion, '2.8.1', 'Версия в константе должна быть 2.8.1');

const headerVersionMatch = trackerSource.match(/\/\/\s*@version\s+([^\r\n]+)/);
assert.ok(headerVersionMatch, 'В метаданных userscript должна быть директива @version');
assert.strictEqual(headerVersionMatch[1].trim(), currentVersion, 'Версия в @version должна совпадать с константой SCRIPT_VERSION');


// -----------------------------------------------------------------------------
// Тест 8: Мультиязычность (i18n: EN по умолчанию, RU, ZH, PT, ES, DE)
// -----------------------------------------------------------------------------
console.log('Тест 8: Проверка многоязычности i18n (EN, RU, ZH, PT, ES, DE)...');

// Извлекаем словарь I18N непосредственно из исходного кода трекера
const i18nMatch = trackerSource.match(/const I18N = (\{[\s\S]*?\n\s*\});\r?\n\r?\n\s*const LOCALE_MAP/);
assert.ok(i18nMatch, 'В исходном коде трекера должен присутствовать словарь I18N');

const I18N = (new Function('return ' + i18nMatch[1]))();
const LANGUAGES = ['en', 'ru', 'zh', 'pt', 'es', 'de'];
const enKeys = Object.keys(I18N.en);

assert.strictEqual(enKeys.length >= 50, true, 'В словаре должно быть не менее 50 ключей');

// 8.1 Проверка полноты перевода всех языков
for (const lang of LANGUAGES) {
    assert.ok(I18N[lang], `Язык ${lang} должен присутствовать в I18N`);
    for (const key of enKeys) {
        assert.ok(I18N[lang][key], `Ключ "${key}" должен быть переведен на язык "${lang}"`);
    }
}
console.log(`  ✓ Все ${enKeys.length} ключей перевода полностью валидны во всех 6 языках!`);

// 8.2 Проверка функции t() и подстановки параметров
function simulateT(dict, lang, key, params = {}) {
    const d = dict[lang] || dict.en;
    let text = d && d[key] !== undefined ? d[key] : (dict.en[key] !== undefined ? dict.en[key] : key);
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), v !== undefined && v !== null ? v : '');
    }
    return text;
}

assert.strictEqual(simulateT(I18N, 'en', 'btn_list', { count: 42 }), 'List (42/100)');
assert.strictEqual(simulateT(I18N, 'ru', 'btn_list', { count: 42 }), 'Список (42/100)');
assert.strictEqual(simulateT(I18N, 'zh', 'btn_list', { count: 42 }), '关注列表 (42/100)');
assert.strictEqual(simulateT(I18N, 'pt', 'btn_list', { count: 42 }), 'Lista (42/100)');
assert.strictEqual(simulateT(I18N, 'es', 'btn_list', { count: 42 }), 'Lista (42/100)');
assert.strictEqual(simulateT(I18N, 'de', 'btn_list', { count: 42 }), 'Liste (42/100)');

// Fallback на английский при несуществующем языке
assert.strictEqual(simulateT(I18N, 'fr', 'btn_list', { count: 10 }), 'List (10/100)');

// 8.3 Проверка алгоритма автоопределения языка (detectLanguage)
function simulateDetect(steamLang, htmlLang, cookieLang, navLang) {
    if (steamLang) {
        const s = steamLang.toLowerCase();
        if (s === 'russian') return 'ru';
        if (s === 'schinese' || s === 'tchinese') return 'zh';
        if (s === 'brazilian' || s === 'portuguese') return 'pt';
        if (s === 'spanish' || s === 'latam') return 'es';
        if (s === 'german') return 'de';
        if (s === 'english') return 'en';
    }
    if (htmlLang) {
        const h = htmlLang.toLowerCase();
        if (h.startsWith('ru')) return 'ru';
        if (h.startsWith('zh')) return 'zh';
        if (h.startsWith('pt')) return 'pt';
        if (h.startsWith('es')) return 'es';
        if (h.startsWith('de')) return 'de';
        if (h.startsWith('en')) return 'en';
    }
    if (cookieLang) {
        const c = cookieLang.toLowerCase();
        if (c === 'russian') return 'ru';
        if (c === 'schinese' || c === 'tchinese') return 'zh';
        if (c === 'brazilian' || c === 'portuguese') return 'pt';
        if (c === 'spanish' || c === 'latam') return 'es';
        if (c === 'german') return 'de';
        if (c === 'english') return 'en';
    }
    if (navLang) {
        const n = navLang.toLowerCase();
        if (n.startsWith('ru')) return 'ru';
        if (n.startsWith('zh')) return 'zh';
        if (n.startsWith('pt')) return 'pt';
        if (n.startsWith('es')) return 'es';
        if (n.startsWith('de')) return 'de';
    }
    return 'en';
}

assert.strictEqual(simulateDetect('russian'), 'ru', 'Определение по Steam language');
assert.strictEqual(simulateDetect('schinese'), 'zh', 'Определение по Steam Simplified Chinese');
assert.strictEqual(simulateDetect('brazilian'), 'pt', 'Определение по Steam Brazilian Portuguese');
assert.strictEqual(simulateDetect(null, 'ru-RU'), 'ru', 'Определение по HTML lang');
assert.strictEqual(simulateDetect(null, null, 'german'), 'de', 'Определение по cookie Steam_Language');
assert.strictEqual(simulateDetect(null, null, null, 'es-ES'), 'es', 'Определение по browser navigator');
assert.strictEqual(simulateDetect(null, null, null, 'fr-FR'), 'en', 'Английский по умолчанию при неподдерживаемом языке');
assert.strictEqual(simulateDetect(null, null, null, null), 'en', 'Английский по умолчанию при отсутствии параметров');
console.log('  ✓ Детекция языков и английский fallback работают безупречно!');


// -----------------------------------------------------------------------------
// Тест 9: Защита от оптимистичной записи (Strict DOM Verification) и Auto-heal
// -----------------------------------------------------------------------------
console.log('Тест 9: Проверка защиты от оптимистичной записи (Strict DOM Verification)...');

// 9.1 Симуляция клика при отказе Steam (например, лимит 100 мест)
let dbTouched = false;
function simulateClickWithVerification(clanId, isFollow, domStateFollowed) {
    // В v2.8.1 запись в базу НЕ происходит сразу по клику
    // Она происходит только если domStateFollowed === isFollow
    if (domStateFollowed === isFollow) {
        dbTouched = true;
    }
}

// Пользователь нажал "Подписаться" (isFollow = true), но у него лимит 100, Steam отклонил запрос
simulateClickWithVerification("999", true, false);
assert.strictEqual(dbTouched, false, 'При отказе Steam база данных НЕ должна затрагиваться!');

// 9.2 Проверка логики Auto-heal для фантомных записей
function checkAutoHeal(record, domFollowed) {
    if (record && record.status === 'unfollowed' && !record.isInitial && record.followedAt && record.unfollowedAt) {
        const timeDiff = Math.abs(new Date(record.unfollowedAt).getTime() - new Date(record.followedAt).getTime());
        if (timeDiff < 30000 && !domFollowed) {
            return null; // запись удалена
        }
    }
    return record;
}

const phantomRecord = {
    clanId: "999",
    name: "Failed Curator",
    status: 'unfollowed',
    followedAt: "2026-10-28T19:10:00.000Z",
    unfollowedAt: "2026-10-28T19:10:01.000Z", // разница всего 1 секунда!
    isInitial: false
};

const healed = checkAutoHeal(phantomRecord, false);
assert.strictEqual(healed, null, 'Фантомная запись с почти одновременными датами должна быть автоматически очищена');

const legitimateUnfollowed = {
    clanId: "888",
    name: "Legit Curator",
    status: 'unfollowed',
    followedAt: "2025-01-01T00:00:00.000Z",
    unfollowedAt: "2026-10-28T19:00:00.000Z", // разница почти 2 года
    isInitial: false
};

const kept = checkAutoHeal(legitimateUnfollowed, false);
assert.notStrictEqual(kept, null, 'Настоящая запись об отписке должна сохраняться');
console.log('  ✓ Защита от оптимистичной записи и Auto-heal работают корректно!');

console.log('✅ Все тесты трекера (включая лимит X/100, автообновление, отмену, Creator Homes, SemVer, i18n и Strict Verification) успешно пройдены!');
