(async function() {
    console.log('⏳ Поиск базы данных кураторов Steam...');

    let dbKey = null;
    let db = null;
    let isGM = false;

    // Сбор всех возможных вариантов ключей steamId
    function getCandidateKeys() {
        const keys = new Set();
        const ids = [];

        try {
            if (typeof unsafeWindow !== 'undefined') {
                if (unsafeWindow.g_AccountID) ids.push(String(unsafeWindow.g_AccountID));
                if (unsafeWindow.g_steamID) ids.push(String(unsafeWindow.g_steamID));
            }
        } catch (_) {}

        try {
            if (window.g_AccountID) ids.push(String(window.g_AccountID));
            if (window.g_steamID) ids.push(String(window.g_steamID));
        } catch (_) {}

        // Извлекаем все data-miniprofile из DOM
        try {
            document.querySelectorAll('[data-miniprofile]').forEach(el => {
                const val = el.getAttribute('data-miniprofile');
                if (val) ids.push(val);
            });
        } catch (_) {}

        // Извлекаем SteamID из ссылок на профиль в DOM
        try {
            document.querySelectorAll('a[href*="/profiles/"]').forEach(a => {
                const m = a.href.match(/\/profiles\/(\d+)/);
                if (m) ids.push(m[1]);
            });
        } catch (_) {}

        ids.push('101248791', '1004224715', 'anonymous', 'default', 'SteamUser');

        ids.forEach(id => {
            if (id) {
                keys.add('steam_curators_tracker_db_' + id);
            }
        });

        return Array.from(keys);
    }

    const candidates = getCandidateKeys();

    // 1. Проверка через GM_getValue (Tampermonkey / Violentmonkey)
    if (typeof GM_getValue !== 'undefined') {
        for (const testKey of candidates) {
            try {
                const gmData = GM_getValue(testKey, null);
                if (gmData && gmData.curators && Object.keys(gmData.curators).length > 0) {
                    dbKey = testKey;
                    db = gmData;
                    isGM = true;
                    break;
                }
            } catch (_) {}
        }
    }

    // 2. Проверка через localStorage
    if (!db) {
        for (const testKey of candidates) {
            try {
                const raw = localStorage.getItem(testKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && parsed.curators && Object.keys(parsed.curators).length > 0) {
                        dbKey = testKey;
                        db = parsed;
                        isGM = false;
                        break;
                    }
                }
            } catch (_) {}
        }
    }

    // 3. Глубокий перебор всех ключей в localStorage (если имя ключа нестандартное)
    if (!db) {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && (k.startsWith('steam_curators_tracker_db_') || k.includes('curator'))) {
                try {
                    const parsed = JSON.parse(localStorage.getItem(k));
                    if (parsed && typeof parsed === 'object' && parsed.curators && Object.keys(parsed.curators).length > 0) {
                        dbKey = k;
                        db = parsed;
                        isGM = false;
                        break;
                    }
                } catch (_) {}
            }
        }
    }

    if (!db) {
        console.error('❌ База кураторов не найдена! Проверенные ключи:', candidates);
        alert('❌ База кураторов не найдена!\n\nПроверено ключей: ' + candidates.length + '\nУбедитесь, что вы находитесь в контексте Tampermonkey.');
        return;
    }

    console.log('✅ Найдена база: "' + dbKey + '" (Пользователь: ' + (db.user || 'SteamUser') + ', кураторов в базе: ' + Object.keys(db.curators || {}).length + ')');

    const seedData = [
  {
    "dateStr": "12.02.2025",
    "isoDate": "2025-02-12T12:00:00.000Z",
    "name": "PobreGamer",
    "link": "https://store.steampowered.com/curator/45109057-PobreGamer/",
    "clanId": "45109057"
  },
  {
    "dateStr": "05.05.2025",
    "isoDate": "2025-05-05T12:00:00.000Z",
    "name": "Candylight Studio",
    "link": "https://store.steampowered.com/curator/45604051-Candylight-Studio/",
    "clanId": "45604051"
  },
  {
    "dateStr": "24.05.2025",
    "isoDate": "2025-05-24T12:00:00.000Z",
    "name": "Spicy Reviews",
    "link": "https://store.steampowered.com/curator/45617363-Spicy-Reviews/",
    "clanId": "45617363"
  },
  {
    "dateStr": "24.05.2025",
    "isoDate": "2025-05-24T12:00:00.000Z",
    "name": "BAA GAMES",
    "link": "https://store.steampowered.com/curator/45623027-BAA-GAMES/",
    "clanId": "45623027"
  },
  {
    "dateStr": "31.05.2025",
    "isoDate": "2025-05-31T12:00:00.000Z",
    "name": "Alpha Response",
    "link": "https://store.steampowered.com/curator/45622029-Alpha-Response/",
    "clanId": "45622029"
  },
  {
    "dateStr": "31.05.2025",
    "isoDate": "2025-05-31T12:00:00.000Z",
    "name": "STuNT Games",
    "link": "https://store.steampowered.com/curator/43942793-STuNT-Games/",
    "clanId": "43942793"
  },
  {
    "dateStr": "01.06.2025",
    "isoDate": "2025-06-01T12:00:00.000Z",
    "name": "Russpuppy Games",
    "link": "https://store.steampowered.com/developer/russpuppy/",
    "clanId": null
  },
  {
    "dateStr": "06.06.2025",
    "isoDate": "2025-06-06T12:00:00.000Z",
    "name": "Osiris Reviews",
    "link": "https://store.steampowered.com/curator/42602807-Osiris-Reviews/",
    "clanId": "42602807"
  },
  {
    "dateStr": "06.06.2025",
    "isoDate": "2025-06-06T12:00:00.000Z",
    "name": "IndieSight",
    "link": "https://store.steampowered.com/curator/45625424-IndieSight/",
    "clanId": "45625424"
  },
  {
    "dateStr": "06.06.2025",
    "isoDate": "2025-06-06T12:00:00.000Z",
    "name": "Neon Doctrine",
    "link": "https://store.steampowered.com/publisher/nd/",
    "clanId": null
  },
  {
    "dateStr": "29.06.2025",
    "isoDate": "2025-06-29T12:00:00.000Z",
    "name": "Lil Hentai Games",
    "link": "https://store.steampowered.com/publisher/LilHentaiGames/",
    "clanId": null
  },
  {
    "dateStr": "01.07.2025",
    "isoDate": "2025-07-01T12:00:00.000Z",
    "name": "The Enormous Room",
    "link": "https://store.steampowered.com/curator/42796408-The-Enormous-Room/",
    "clanId": "42796408"
  },
  {
    "dateStr": "01.07.2025",
    "isoDate": "2025-07-01T12:00:00.000Z",
    "name": "keyhub",
    "link": "https://store.steampowered.com/curator/36978066-keyhub/",
    "clanId": "36978066"
  },
  {
    "dateStr": "02.07.2025",
    "isoDate": "2025-07-02T12:00:00.000Z",
    "name": "Puzzle Lovers",
    "link": "https://store.steampowered.com/curator/25928931-Puzzle-Lovers/",
    "clanId": "25928931"
  },
  {
    "dateStr": "04.07.2025",
    "isoDate": "2025-07-04T12:00:00.000Z",
    "name": "pantaloon",
    "link": "https://store.steampowered.com/publisher/Pantaloon/",
    "clanId": null
  },
  {
    "dateStr": "28.07.2025",
    "isoDate": "2025-07-28T12:00:00.000Z",
    "name": "Good Game Collections",
    "link": "https://store.steampowered.com/curator/45434562-Good-Game-Collections/",
    "clanId": "45434562"
  },
  {
    "dateStr": "18.08.2025",
    "isoDate": "2025-08-18T12:00:00.000Z",
    "name": "黄金眼评鉴组",
    "link": "https://store.steampowered.com/curator/45673067-%25E9%25BB%2584%25E9%2587%2591%25E7%259C%25BC%25E8%25AF%2584%25E9%2589%25B4%25E7%25BB%2584/",
    "clanId": "45673067"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "Cats❣",
    "link": "https://store.steampowered.com/curator/45207093-Cats%25E2%259D%25A3/",
    "clanId": "45207093"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "鸿源鉴赏联盟",
    "link": "https://store.steampowered.com/curator/42276832-%25E9%25B8%25BF%25E6%25BA%2590%25E9%2589%25B4%25E8%25B5%258F%25E8%2581%2594%25E7%259B%259F/",
    "clanId": "42276832"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "Weird games - Странные игры",
    "link": "https://store.steampowered.com/curator/45022344-Weird-games-%25D0%25A1%25D1%2582%25D1%2580%25D0%25B0%25D0%25BD%25D0%25BD%25D1%258B%25D0%25B5-%25D0%25B8%25D0%25B3%25D1%2580%25D1%258B/",
    "clanId": "45022344"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "Adult Arcade",
    "link": "https://store.steampowered.com/curator/45703324-Adult-Arcade/",
    "clanId": "45703324"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "The Biggest Lake Giveaways",
    "link": "https://store.steampowered.com/curator/44855033-The-Biggest-Lake-Giveaways/",
    "clanId": "44855033"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "左邻右里",
    "link": "https://store.steampowered.com/curator/45145702-%25E5%25B7%25A6%25E9%2582%25BB%25E5%258F%25B3%25E9%2587%258C/",
    "clanId": "45145702"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "岛风",
    "link": "https://store.steampowered.com/curator/31916014-%25E5%25B2%259B%25E9%25A3%258E/",
    "clanId": "31916014"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "Absolute Banger",
    "link": "https://store.steampowered.com/curator/43574019-Absolute-Banger/",
    "clanId": "43574019"
  },
  {
    "dateStr": "27.09.2025",
    "isoDate": "2025-09-27T12:00:00.000Z",
    "name": "OFEN™",
    "link": "https://store.steampowered.com/curator/11578500-OFEN%25E2%2584%25A2/",
    "clanId": "11578500"
  },
  {
    "dateStr": "02.10.2025",
    "isoDate": "2025-10-02T12:00:00.000Z",
    "name": "GrabTheGames Publishing",
    "link": "https://store.steampowered.com/publisher/GrabTheGames/",
    "clanId": null
  },
  {
    "dateStr": "04.10.2025",
    "isoDate": "2025-10-04T12:00:00.000Z",
    "name": "~Universal Gamers~",
    "link": "https://store.steampowered.com/curator/40358253-%257EUniversal-Gamers%257E/",
    "clanId": "40358253"
  },
  {
    "dateStr": "07.10.2025",
    "isoDate": "2025-10-07T12:00:00.000Z",
    "name": "xkitte Gaming Community",
    "link": "https://store.steampowered.com/curator/44788758-xkitte-Gaming-Community/",
    "clanId": "44788758"
  },
  {
    "dateStr": "15.10.2025",
    "isoDate": "2025-10-15T12:00:00.000Z",
    "name": "Horror Anomaly",
    "link": "https://store.steampowered.com/developer/horror/",
    "clanId": null
  },
  {
    "dateStr": "23.10.2025",
    "isoDate": "2025-10-23T12:00:00.000Z",
    "name": "不羁猫探索队",
    "link": "https://store.steampowered.com/curator/45217105-%25E4%25B8%258D%25E7%25BE%2581%25E7%258C%25AB%25E6%258E%25A2%25E7%25B4%25A2%25E9%2598%259F/",
    "clanId": "45217105"
  },
  {
    "dateStr": "25.10.2025",
    "isoDate": "2025-10-25T12:00:00.000Z",
    "name": "Rogueside",
    "link": "https://store.steampowered.com/developer/Rogueside/",
    "clanId": null
  },
  {
    "dateStr": "29.10.2025",
    "isoDate": "2025-10-29T12:00:00.000Z",
    "name": "SirAlexander's Review Club",
    "link": "https://store.steampowered.com/curator/23741321-SirAlexander%2527s-Review-Club/",
    "clanId": "23741321"
  },
  {
    "dateStr": "29.10.2025",
    "isoDate": "2025-10-29T12:00:00.000Z",
    "name": "Original Curators Group",
    "link": "https://store.steampowered.com/curator/7871885-Original-Curators-Group/",
    "clanId": "7871885"
  },
  {
    "dateStr": "01.11.2025",
    "isoDate": "2025-11-01T12:00:00.000Z",
    "name": "深澜探索者",
    "link": "https://store.steampowered.com/curator/45540934-%25E6%25B7%25B1%25E6%25BE%259C%25E6%258E%25A2%25E7%25B4%25A2%25E8%2580%2585/",
    "clanId": "45540934"
  },
  {
    "dateStr": "01.11.2025",
    "isoDate": "2025-11-01T12:00:00.000Z",
    "name": "Hidden Object Games 2",
    "link": "https://store.steampowered.com/curator/45831849-Hidden-Object-Games-2/",
    "clanId": "45831849"
  },
  {
    "dateStr": "05.11.2025",
    "isoDate": "2025-11-05T12:00:00.000Z",
    "name": "游戏好声音",
    "link": "https://store.steampowered.com/curator/44791929-%25E6%25B8%25B8%25E6%2588%258F%25E5%25A5%25BD%25E5%25A3%25B0%25E9%259F%25B3/",
    "clanId": "44791929"
  },
  {
    "dateStr": "12.11.2025",
    "isoDate": "2025-11-12T12:00:00.000Z",
    "name": "Puzzle Patrol",
    "link": "https://store.steampowered.com/curator/45784061-Puzzle-Patrol/",
    "clanId": "45784061"
  },
  {
    "dateStr": "12.11.2025",
    "isoDate": "2025-11-12T12:00:00.000Z",
    "name": "Arcade Architects",
    "link": "https://store.steampowered.com/curator/44857897-Arcade-Architects/",
    "clanId": "44857897"
  },
  {
    "dateStr": "16.11.2025",
    "isoDate": "2025-11-16T12:00:00.000Z",
    "name": "Strategy & Management Duck",
    "link": "https://store.steampowered.com/curator/44903193-Strategy-Management-Duck/",
    "clanId": "44903193"
  },
  {
    "dateStr": "16.11.2025",
    "isoDate": "2025-11-16T12:00:00.000Z",
    "name": "Cat Curations",
    "link": "https://store.steampowered.com/curator/9312618-Cat-Curations/",
    "clanId": "9312618"
  },
  {
    "dateStr": "19.11.2025",
    "isoDate": "2025-11-19T12:00:00.000Z",
    "name": "Game Oracle",
    "link": "https://store.steampowered.com/curator/45451271-Game-Oracle/",
    "clanId": "45451271"
  },
  {
    "dateStr": "19.11.2025",
    "isoDate": "2025-11-19T12:00:00.000Z",
    "name": "ReviewRift",
    "link": "https://store.steampowered.com/curator/45452037-ReviewRift/",
    "clanId": "45452037"
  },
  {
    "dateStr": "19.11.2025",
    "isoDate": "2025-11-19T12:00:00.000Z",
    "name": "What’s the Score?",
    "link": "https://store.steampowered.com/curator/45452122-What%25E2%2580%2599s-the-Score/",
    "clanId": "45452122"
  },
  {
    "dateStr": "23.11.2025",
    "isoDate": "2025-11-23T12:00:00.000Z",
    "name": "Chubby Pixel games",
    "link": "https://store.steampowered.com/publisher/ChubbyPixel/",
    "clanId": null
  },
  {
    "dateStr": "24.11.2025",
    "isoDate": "2025-11-24T12:00:00.000Z",
    "name": "PowerUp Press",
    "link": "https://store.steampowered.com/curator/45452063-PowerUp-Press/",
    "clanId": "45452063"
  },
  {
    "dateStr": "27.11.2025",
    "isoDate": "2025-11-27T12:00:00.000Z",
    "name": "RetroStyle Games",
    "link": "https://store.steampowered.com/publisher/retrostylegames/",
    "clanId": null
  },
  {
    "dateStr": "25.08.2026",
    "isoDate": "2026-08-25T12:00:00.000Z",
    "name": "NipoBox",
    "link": "https://store.steampowered.com/publisher/NipoBox/",
    "clanId": null
  },
  {
    "dateStr": "04.12.2025",
    "isoDate": "2025-12-04T12:00:00.000Z",
    "name": "PawPlay Buddies",
    "link": "https://store.steampowered.com/curator/45796864-PawPlay-Buddies/",
    "clanId": "45796864"
  },
  {
    "dateStr": "06.12.2025",
    "isoDate": "2025-12-06T12:00:00.000Z",
    "name": "Gaming Professors",
    "link": "https://store.steampowered.com/curator/34526713-Gaming-Professors/",
    "clanId": "34526713"
  },
  {
    "dateStr": "08.12.2025",
    "isoDate": "2025-12-08T12:00:00.000Z",
    "name": "稻荷的小窝",
    "link": "https://store.steampowered.com/curator/37196866-%25E7%25A8%25BB%25E8%258D%25B7%25E7%259A%2584%25E5%25B0%258F%25E7%25AA%259D/",
    "clanId": "37196866"
  },
  {
    "dateStr": "08.12.2025",
    "isoDate": "2025-12-08T12:00:00.000Z",
    "name": "CGI LAB Games",
    "link": "https://store.steampowered.com/curator/45810225-CGI-LAB-Games/",
    "clanId": "45810225"
  },
  {
    "dateStr": "13.12.2025",
    "isoDate": "2025-12-13T12:00:00.000Z",
    "name": "ReviewRelic",
    "link": "https://store.steampowered.com/curator/45451203-ReviewRelic/",
    "clanId": "45451203"
  },
  {
    "dateStr": "03.01.2026",
    "isoDate": "2026-01-03T12:00:00.000Z",
    "name": "Kool2Play",
    "link": "https://store.steampowered.com/developer/Kool2Play/",
    "clanId": null
  },
  {
    "dateStr": "05.01.2026",
    "isoDate": "2026-01-05T12:00:00.000Z",
    "name": "Rayes Gaming",
    "link": "https://store.steampowered.com/curator/43870800-Rayes-Gaming/",
    "clanId": "43870800"
  },
  {
    "dateStr": "23.01.2026",
    "isoDate": "2026-01-23T12:00:00.000Z",
    "name": "Meme Slop",
    "link": "https://store.steampowered.com/publisher/MemeSlop/",
    "clanId": null
  },
  {
    "dateStr": "18.02.2026",
    "isoDate": "2026-02-18T12:00:00.000Z",
    "name": "The Bratans Inc.",
    "link": "https://store.steampowered.com/developer/TheBratansInc/",
    "clanId": null
  },
  {
    "dateStr": "18.02.2026",
    "isoDate": "2026-02-18T12:00:00.000Z",
    "name": "Mike Meow",
    "link": "https://store.steampowered.com/publisher/MikeMeow/",
    "clanId": null
  },
  {
    "dateStr": "20.09.2026",
    "isoDate": "2026-09-20T12:00:00.000Z",
    "name": "Keyjoker Games",
    "link": "https://store.steampowered.com/developer/keyjokergames/",
    "clanId": null
  },
  {
    "dateStr": "21.02.2026",
    "isoDate": "2026-02-21T12:00:00.000Z",
    "name": "Quick Takes on Games",
    "link": "https://store.steampowered.com/curator/45948913-Quick-Takes-on-Games/",
    "clanId": "45948913"
  },
  {
    "dateStr": "21.02.2026",
    "isoDate": "2026-02-21T12:00:00.000Z",
    "name": "Quick Adult Takes",
    "link": "https://store.steampowered.com/curator/45951179-Quick-Adult-Takes/",
    "clanId": "45951179"
  },
  {
    "dateStr": "23.02.2026",
    "isoDate": "2026-02-23T12:00:00.000Z",
    "name": "R18 Game Recommender",
    "link": "https://store.steampowered.com/curator/45851446-R18-Game-Recommender/",
    "clanId": "45851446"
  },
  {
    "dateStr": "06.03.2026",
    "isoDate": "2026-03-06T12:00:00.000Z",
    "name": "折扣是多少？",
    "link": "https://store.steampowered.com/curator/45675907-%25E6%258A%2598%25E6%2589%25A3%25E6%2598%25AF%25E5%25A4%259A%25E5%25B0%2591%25EF%25BC%259F/",
    "clanId": "45675907"
  },
  {
    "dateStr": "06.03.2026",
    "isoDate": "2026-03-06T12:00:00.000Z",
    "name": "Whale Rock Games",
    "link": "https://store.steampowered.com/curator/41592206-Whale-Rock-Games/",
    "clanId": "41592206"
  },
  {
    "dateStr": "09.03.2026",
    "isoDate": "2026-03-09T12:00:00.000Z",
    "name": "GameSpectrum",
    "link": "https://store.steampowered.com/curator/45451223-GameSpectrum/",
    "clanId": "45451223"
  },
  {
    "dateStr": "03.10.2026",
    "isoDate": "2026-10-03T12:00:00.000Z",
    "name": "gamesforfarm",
    "link": "https://store.steampowered.com/curator/33369575-gamesforfarm/",
    "clanId": "33369575"
  },
  {
    "dateStr": "08.06.2026",
    "isoDate": "2026-06-08T12:00:00.000Z",
    "name": "OPG EUPHORE",
    "link": "https://store.steampowered.com/curator/41861921-OPG-EUPHORE/",
    "clanId": "41861921"
  },
  {
    "dateStr": "12.06.2026",
    "isoDate": "2026-06-12T12:00:00.000Z",
    "name": "SKYWARD FRAME",
    "link": "https://store.steampowered.com/curator/46145181-SKYWARD-FRAME/",
    "clanId": "46145181"
  },
  {
    "dateStr": "15.06.2026",
    "isoDate": "2026-06-15T12:00:00.000Z",
    "name": "[mkabatsky] Консервативный Канал",
    "link": "https://store.steampowered.com/curator/31925504-%255Bmkabatsky%255D-%25D0%259A%25D0%25BE%25D0%25BD%25D1%2581%25D0%25B5%25D1%2580%25D0%25B2%25D0%25B0%25D1%2582%25D0%25B8%25D0%25B2%25D0%25BD%25D1%258B%25D0%25B9/",
    "clanId": "31925504"
  },
  {
    "dateStr": "15.06.2026",
    "isoDate": "2026-06-15T12:00:00.000Z",
    "name": "Flacher Gang Studio",
    "link": "https://store.steampowered.com/curator/46129460-Flacher-Gang-Studio/",
    "clanId": "46129460"
  },
  {
    "dateStr": "17.06.2026",
    "isoDate": "2026-06-17T12:00:00.000Z",
    "name": "CriticForge",
    "link": "https://store.steampowered.com/curator/45452013-CriticForge/",
    "clanId": "45452013"
  },
  {
    "dateStr": "17.06.2026",
    "isoDate": "2026-06-17T12:00:00.000Z",
    "name": "GamersPulse",
    "link": "https://store.steampowered.com/curator/45451249-GamersPulse/",
    "clanId": "45451249"
  },
  {
    "dateStr": "15.07.2026",
    "isoDate": "2026-07-15T12:00:00.000Z",
    "name": "OFF BOX Studios",
    "link": "https://store.steampowered.com/publisher/offbox/",
    "clanId": null
  },
  {
    "dateStr": "01.08.2026",
    "isoDate": "2026-08-01T12:00:00.000Z",
    "name": "ScreenScribe",
    "link": "https://store.steampowered.com/curator/45452082-ScreenScribe/",
    "clanId": "45452082"
  },
  {
    "dateStr": "01.08.2026",
    "isoDate": "2026-08-01T12:00:00.000Z",
    "name": "Hype Expert",
    "link": "https://store.steampowered.com/curator/45452114-Hype-Expert/",
    "clanId": "45452114"
  },
  {
    "dateStr": "21.09.2026",
    "isoDate": "2026-09-21T12:00:00.000Z",
    "name": "Gamersky Games",
    "link": "https://store.steampowered.com/publisher/GamerskyGames/",
    "clanId": null
  },
  {
    "dateStr": "05.09.2026",
    "isoDate": "2026-09-05T12:00:00.000Z",
    "name": "Offworld VHS Bureau",
    "link": "https://store.steampowered.com/curator/46255727-Offworld-VHS-Bureau/",
    "clanId": "46255727"
  },
  {
    "dateStr": "05.09.2026",
    "isoDate": "2026-09-05T12:00:00.000Z",
    "name": "Voight-Kampff Popcorn Club",
    "link": "https://store.steampowered.com/curator/46255744-Voight-Kampff-Popcorn-Club/",
    "clanId": "46255744"
  },
  {
    "dateStr": "05.09.2026",
    "isoDate": "2026-09-05T12:00:00.000Z",
    "name": "Monolith After Midnight",
    "link": "https://store.steampowered.com/curator/46255767-Monolith-After-Midnight/",
    "clanId": "46255767"
  },
  {
    "dateStr": "18.08.2026",
    "isoDate": "2026-08-18T12:00:00.000Z",
    "name": "Brightika, Inc.",
    "link": "https://store.steampowered.com/publisher/brightika/",
    "clanId": null
  },
  {
    "dateStr": "27.08.2026",
    "isoDate": "2026-08-27T12:00:00.000Z",
    "name": "Cryosleep Review Department",
    "link": "https://store.steampowered.com/curator/46269652-Cryosleep-Review-Department/",
    "clanId": "46269652"
  },
  {
    "dateStr": "27.08.2026",
    "isoDate": "2026-08-27T12:00:00.000Z",
    "name": "Nostromo Break Room Critics",
    "link": "https://store.steampowered.com/curator/46269663-Nostromo-Break-Room-Critics/",
    "clanId": "46269663"
  },
  {
    "dateStr": "21.08.2026",
    "isoDate": "2026-08-21T12:00:00.000Z",
    "name": "Replicant Patch Notes",
    "link": "https://store.steampowered.com/curator/46269700-Replicant-Patch-Notes/",
    "clanId": "46269700"
  },
  {
    "dateStr": "30.08.2026",
    "isoDate": "2026-08-30T12:00:00.000Z",
    "name": "Synthetic Sheep Reviewers",
    "link": "https://store.steampowered.com/curator/46282726-Synthetic-Sheep-Reviewers/",
    "clanId": "46282726"
  },
  {
    "dateStr": "30.08.2026",
    "isoDate": "2026-08-30T12:00:00.000Z",
    "name": "The Fifth Save Slot",
    "link": "https://store.steampowered.com/curator/46281708-The-Fifth-Save-Slot/",
    "clanId": "46281708"
  },
  {
    "dateStr": "30.08.2026",
    "isoDate": "2026-08-30T12:00:00.000Z",
    "name": "Sector Seven Screening Room",
    "link": "https://store.steampowered.com/curator/46281716-Sector-Seven-Screening-Room/",
    "clanId": "46281716"
  },
  {
    "dateStr": "20.09.2026",
    "isoDate": "2026-09-20T12:00:00.000Z",
    "name": "LV-426 Coffee Committee",
    "link": "https://store.steampowered.com/curator/46282868-LV-426-Coffee-Committee/",
    "clanId": "46282868"
  },
  {
    "dateStr": "08.09.2026",
    "isoDate": "2026-09-08T12:00:00.000Z",
    "name": "Passion Panda Publishing",
    "link": "https://store.steampowered.com/publisher/passionpandapublishing/",
    "clanId": null
  },
  {
    "dateStr": "03.10.2026",
    "isoDate": "2026-10-03T12:00:00.000Z",
    "name": "Dungeon Master Games",
    "link": "https://store.steampowered.com/curator/44797558-Dungeon-Master-Games/",
    "clanId": "44797558"
  },
  {
    "dateStr": "03.10.2026",
    "isoDate": "2026-10-03T12:00:00.000Z",
    "name": "Red Six Development",
    "link": "https://store.steampowered.com/curator/44797534-Red-Six-Development/",
    "clanId": "44797534"
  },
  {
    "dateStr": "21.09.2026",
    "isoDate": "2026-09-21T12:00:00.000Z",
    "name": "Game Department 40",
    "link": "https://store.steampowered.com/curator/46313535-Game-Department-40/",
    "clanId": "46313535"
  },
  {
    "dateStr": "23.09.2026",
    "isoDate": "2026-09-23T12:00:00.000Z",
    "name": "Game Signal",
    "link": "https://store.steampowered.com/curator/46316236-Game-Signal/",
    "clanId": "46316236"
  },
  {
    "dateStr": "08.10.2026",
    "isoDate": "2026-10-08T12:00:00.000Z",
    "name": "Null Lantern",
    "link": "https://store.steampowered.com/curator/46316467-Null-Lantern/",
    "clanId": "46316467"
  },
  {
    "dateStr": "18.10.2026",
    "isoDate": "2026-10-18T12:00:00.000Z",
    "name": "AFK in Real Life",
    "link": "https://store.steampowered.com/curator/46480992-AFK-in-Real-Life/",
    "clanId": "46480992"
  },
  {
    "dateStr": "18.10.2026",
    "isoDate": "2026-10-18T12:00:00.000Z",
    "name": "ReLU Games",
    "link": "https://store.steampowered.com/developer/relugames/",
    "clanId": null
  },
  {
    "dateStr": "18.10.2026",
    "isoDate": "2026-10-18T12:00:00.000Z",
    "name": "WOMBEX Games",
    "link": "https://store.steampowered.com/developer/wombex/",
    "clanId": null
  },
  {
    "dateStr": "19.10.2026",
    "isoDate": "2026-10-19T12:00:00.000Z",
    "name": "Oduvan Games",
    "link": "https://store.steampowered.com/developer/oduvangames/",
    "clanId": null
  },
  {
    "dateStr": "19.10.2026",
    "isoDate": "2026-10-19T12:00:00.000Z",
    "name": "CupOfTea",
    "link": "https://store.steampowered.com/curator/46535696-CupOfTea/",
    "clanId": "46535696"
  },
  {
    "dateStr": "19.10.2026",
    "isoDate": "2026-10-19T12:00:00.000Z",
    "name": "Gaming Soul",
    "link": "https://store.steampowered.com/curator/46532613-Gaming-Soul/",
    "clanId": "46532613"
  },
  {
    "dateStr": "19.10.2026",
    "isoDate": "2026-10-19T12:00:00.000Z",
    "name": "Beverlor Publishing",
    "link": "https://store.steampowered.com/publisher/Beverlorpublishing/",
    "clanId": null
  },
  {
    "dateStr": "19.10.2026",
    "isoDate": "2026-10-19T12:00:00.000Z",
    "name": "Indie Shop",
    "link": "https://store.steampowered.com/curator/46535543-Indie-Shop/",
    "clanId": "46535543"
  },
  {
    "dateStr": "19.10.2026",
    "isoDate": "2026-10-19T12:00:00.000Z",
    "name": "Saint Father loves INDIE GAMING",
    "link": "https://store.steampowered.com/curator/46535932-Saint-Father-loves-INDIE-GAMING/",
    "clanId": "46535932"
  },
  {
    "dateStr": "19.10.2026",
    "isoDate": "2026-10-19T12:00:00.000Z",
    "name": "The World's Best Reviewer",
    "link": "https://store.steampowered.com/curator/46535887-The-World%2527s-Best-Reviewer/",
    "clanId": "46535887"
  }
];

    function cleanUrl(url) {
        if (!url) return '';
        try {
            return decodeURIComponent(url).toLowerCase().split('?')[0].replace(/\/$/, '');
        } catch (_) {
            return url.toLowerCase().split('?')[0].replace(/\/$/, '');
        }
    }

    function cleanName(n) {
        return (n || '').toLowerCase().replace(/[^a-zA-Z0-9\u0400-\u04FF\u4E00-\u9FFF]/g, '').trim();
    }

    let updatedCount = 0;
    let skippedCount = 0;
    const updatedDetails = [];

    seedData.forEach(item => {
        let record = null;

        // Поиск по clanId
        if (item.clanId && db.curators[item.clanId]) {
            record = db.curators[item.clanId];
        }

        // Поиск по URL
        if (!record && item.link) {
            const targetUrl = cleanUrl(item.link);
            for (const id in db.curators) {
                if (cleanUrl(db.curators[id].link) === targetUrl) {
                    record = db.curators[id];
                    break;
                }
            }
        }

        // Поиск по имени
        if (!record && item.name) {
            const targetName = cleanName(item.name);
            for (const id in db.curators) {
                if (cleanName(db.curators[id].name) === targetName) {
                    record = db.curators[id];
                    break;
                }
            }
        }

        if (record) {
            const oldDate = record.followedAt;
            record.followedAt = item.isoDate;
            record.isInitial = false;
            record.status = 'followed';
            updatedCount++;
            updatedDetails.push({
                "Имя": record.name,
                "ID": record.clanId,
                "Новая дата": item.dateStr,
                "Было": oldDate ? oldDate.slice(0, 10) : 'нет'
            });
        } else {
            skippedCount++;
        }
    });

    db.updatedAt = new Date().toISOString();

    if (isGM && typeof GM_setValue !== 'undefined') {
        GM_setValue(dbKey, db);
        console.log('💾 Сохранено в Tampermonkey (GM_setValue).');
    }
    try {
        localStorage.setItem(dbKey, JSON.stringify(db));
        console.log('💾 Сохранено в localStorage.');
    } catch (e) {
        console.warn('Не удалось записать в localStorage:', e);
    }

    const reportText = '=== ОТЧЕТ ОБНОВЛЕНИЯ ДАТ КУРАТОРОВ ===\n' +
        'База: ' + dbKey + '\n' +
        'Всего в списке: ' + seedData.length + '\n' +
        'Обновлено в базе: ' + updatedCount + '\n' +
        'Пропущено (нет в базе): ' + skippedCount + '\n\n' +
        'Обновленные кураторы:\n' +
        updatedDetails.map(u => '• ' + u["Имя"] + ' -> ' + u["Новая дата"] + ' (ID: ' + u.ID + ')').join('\n');

    console.log(reportText);
    if (updatedDetails.length) {
        console.table(updatedDetails);
    }

    // Автоматическое копирование отчета в буфер обмена
    try {
        if (typeof copy === 'function') {
            copy(reportText);
            console.log('📋 Отчет скопирован в буфер обмена через copy()!');
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(reportText);
            console.log('📋 Отчет скопирован в буфер обмена через navigator.clipboard!');
        }
    } catch (_) {}

    alert('✅ Обновление дат завершено!\n\nУспешно обновлено: ' + updatedCount + ' из ' + seedData.length + ' кураторов.\nПропущено: ' + skippedCount + '.\n\nОтчет скопирован в буфер обмена!');
})();