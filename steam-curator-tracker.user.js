// ==UserScript==
// @name         Steam Curator Follow Tracker
// @namespace    https://github.com/BasimovIF-AI/userscript-steam-curator
// @version      2.4.0
// @description  Отслеживание подписок/отписок Steam, точный лимит (X/100), бесшовный нативный UI, автообновление даты подписки при переходе с кнопкой отмены, менеджер ревизии и портал настроек
// @author       Senior Software Engineer
// @match        *://store.steampowered.com/curator/*
// @match        *://store.steampowered.com/curators/mycurators*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const WIDGET_ID = 'steam-curator-tracker-panel';
    const MYCURATORS_PANEL_ID = 'steam-curator-tracker-mycurators-panel';
    const MODAL_VIEWER_ID = 'steam-curator-viewer-modal';
    const STYLES_ID = 'steam-curator-tracker-styles';
    const GLOBAL_GEAR_MENU_ID = 'sct-global-gear-menu';

    // -------------------------------------------------------------------------
    // Хранилище (Кроссплатформенный GM_* с fallback на localStorage)
    // -------------------------------------------------------------------------
    const storage = {
        get(key, def = null) {
            try {
                if (typeof GM_getValue !== 'undefined') return GM_getValue(key, def);
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : def;
            } catch (e) {
                console.error('[CuratorTracker] Ошибка чтения:', e);
                return def;
            }
        },
        set(key, val) {
            try {
                if (typeof GM_setValue !== 'undefined') {
                    GM_setValue(key, val);
                } else {
                    localStorage.setItem(key, JSON.stringify(val));
                }
            } catch (e) {
                console.error('[CuratorTracker] Ошибка записи:', e);
            }
        }
    };

    // -------------------------------------------------------------------------
    // Флаг перехода из собственной таблицы (для исключения автообновления даты)
    // -------------------------------------------------------------------------
    function checkAndHandleListReferrer() {
        if (window.location.hash.includes('sct_ref=list')) {
            try {
                const cleanUrl = window.location.pathname + window.location.search;
                window.history.replaceState(null, document.title, cleanUrl);
            } catch (_) {}
            return true;
        }
        return false;
    }
    const isNavigatedFromOurList = checkAndHandleListReferrer();

    // Сессионный кэш кураторов, у которых уже проверялось автообновление за сессию
    const sessionAutoUpdatedCurators = new Set();

    // -------------------------------------------------------------------------
    // Утилиты идентификации куратора и пользователя
    // -------------------------------------------------------------------------
    function getUserInfo() {
        let steamId = null;
        let userName = null;

        if (typeof unsafeWindow !== 'undefined') {
            if (unsafeWindow.g_AccountID && unsafeWindow.g_AccountID !== 0) {
                steamId = String(unsafeWindow.g_AccountID);
            }
            if (unsafeWindow.g_steamID) {
                steamId = steamId || String(unsafeWindow.g_steamID);
            }
        }

        if (!steamId) {
            const mini = document.querySelector('[data-miniprofile]')?.getAttribute('data-miniprofile');
            if (mini) steamId = mini;
        }

        const nameEl = document.querySelector('#account_pulldown') ||
                       document.querySelector('#global_action_menu .user_avatar') ||
                       document.querySelector('.persona');
        userName = nameEl?.textContent?.trim() || nameEl?.title?.trim() || (steamId ? `User_${steamId}` : 'SteamUser');

        return {
            steamId: steamId || 'anonymous',
            userName
        };
    }

    function getCuratorInfo() {
        const followBtn = document.querySelector('[id^="CuratorFollowBtn_"]');
        const unfollowBtn = document.querySelector('[id^="CuratorUnFollowBtn_"]');
        const clanId = followBtn?.id?.replace('CuratorFollowBtn_', '') ||
                       unfollowBtn?.id?.replace('CuratorUnFollowBtn_', '') ||
                       window.location.pathname.match(/\/curator\/(\d+)/)?.[1] ||
                       null;

        const nameEl = document.querySelector('.curator_name a') ||
                       document.querySelector('.pageheader.curator_name') ||
                       document.querySelector('.curator_name');
        const name = nameEl?.textContent?.trim() || 'Unknown Curator';
        const link = clanId ? `https://store.steampowered.com/curator/${clanId}/` : window.location.href.split('?')[0];

        return { clanId, name, link };
    }

    function isFollowedInDOM(clanId) {
        if (!clanId) return false;
        const unfollowBtn = document.getElementById(`CuratorUnFollowBtn_${clanId}`);
        if (!unfollowBtn) return false;
        const style = window.getComputedStyle(unfollowBtn);
        return style.display !== 'none' && unfollowBtn.offsetParent !== null;
    }

    function formatDate(isoStr, onlyDate = false) {
        if (!isoStr) return null;
        try {
            const d = new Date(isoStr);
            if (isNaN(d.getTime())) return isoStr;
            const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
            if (!onlyDate) {
                options.hour = '2-digit';
                options.minute = '2-digit';
            }
            return d.toLocaleString('ru-RU', options);
        } catch (_) {
            return isoStr;
        }
    }

    function getStorageKey(steamId) {
        return `steam_curators_tracker_db_${steamId || 'default'}`;
    }

    function getSettingsKey(steamId) {
        return `steam_curators_tracker_settings_${steamId || 'default'}`;
    }

    function loadSettings(steamId) {
        const def = { autoUpdateOnVisit: true };
        const raw = storage.get(getSettingsKey(steamId), null);
        return Object.assign({}, def, raw || {});
    }

    function saveSettings(steamId, settings) {
        storage.set(getSettingsKey(steamId), settings);
    }

    function hasDatabase(steamId) {
        if (!steamId || steamId === 'anonymous') return false;
        const db = storage.get(getStorageKey(steamId), null);
        return Boolean(db && db.curators && Object.keys(db.curators).length > 0);
    }

    function loadDatabase(steamId, userName) {
        const key = getStorageKey(steamId);
        const db = storage.get(key, null);
        if (db && typeof db === 'object') {
            if (userName && db.user !== userName) db.user = userName;
            return db;
        }
        const now = new Date().toISOString();
        return {
            version: 1,
            user: userName || 'SteamUser',
            steamId: steamId || 'anonymous',
            createdAt: now,
            updatedAt: now,
            curators: {}
        };
    }

    function saveDatabase(db) {
        db.updatedAt = new Date().toISOString();
        storage.set(getStorageKey(db.steamId), db);
    }

    function getActiveFollowedCount(curatorsMap = {}) {
        return Object.values(curatorsMap).filter(c => c && c.status === 'followed').length;
    }

    // -------------------------------------------------------------------------
    // Core Engine: Логика обновления состояний, сортировки и автообновления
    // -------------------------------------------------------------------------
    function recordFollowAction(clanId, isFollow, curatorInfo, userInfo) {
        if (!clanId) return;
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const existing = db.curators[clanId] || {
            clanId,
            name: curatorInfo.name,
            link: curatorInfo.link,
            status: 'unknown',
            followedAt: null,
            unfollowedAt: null,
            isInitial: false
        };

        const now = new Date().toISOString();
        if (isFollow) {
            existing.status = 'followed';
            existing.followedAt = now;
            existing.unfollowedAt = null;
            existing.isInitial = false;
            existing.isAutoUpdated = false;
            delete existing._prevFollowedAt;
        } else {
            existing.status = 'unfollowed';
            existing.unfollowedAt = now;
            existing.isAutoUpdated = false;
        }
        existing.name = curatorInfo.name || existing.name;
        existing.link = curatorInfo.link || existing.link;

        db.curators[clanId] = existing;
        saveDatabase(db);
        updateCuratorPageUI();
    }

    function handleAutoUpdateVisit(clanId, record, userInfo, settings) {
        if (!settings.autoUpdateOnVisit) return false;
        if (isNavigatedFromOurList) return false;
        if (!record || record.status !== 'followed') return false;
        if (sessionAutoUpdatedCurators.has(clanId)) return false;

        sessionAutoUpdatedCurators.add(clanId);

        const now = new Date();
        if (record.followedAt) {
            const prevTime = new Date(record.followedAt).getTime();
            // Если дата подписки была менее 5 минут назад, не обновляем
            if (!isNaN(prevTime) && (now.getTime() - prevTime < 5 * 60 * 1000)) {
                return false;
            }
        }

        record._prevFollowedAt = record.followedAt || null;
        record.followedAt = now.toISOString();
        record.isAutoUpdated = true;

        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        db.curators[clanId] = record;
        saveDatabase(db);
        return true;
    }

    function undoAutoUpdateDate(clanId, userInfo) {
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const record = db.curators[clanId];
        if (!record || !record._prevFollowedAt) return;

        record.followedAt = record._prevFollowedAt;
        delete record._prevFollowedAt;
        record.isAutoUpdated = false;

        db.curators[clanId] = record;
        saveDatabase(db);
        updateCuratorPageUI();
    }

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

    function exportCuratorsJSON(userInfo) {
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const sortedList = getSortedCurators(db.curators, 'newest');
        const activeCount = getActiveFollowedCount(db.curators);

        const exportPayload = {
            version: 1,
            user: db.user,
            steamId: db.steamId,
            createdAt: db.createdAt || db.updatedAt,
            exportedAt: new Date().toISOString(),
            activeCurators: activeCount,
            totalTracked: sortedList.length,
            curators: sortedList
        };

        const dateStr = new Date().toISOString().slice(0, 10);
        const safeName = (db.user || 'user').replace(/[^a-zA-Z0-9_\u0400-\u04FF-]/g, '_');
        const filename = `steam_curators_sorted_${safeName}_${dateStr}.json`;

        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importCuratorsJSON(userInfo, onSuccess) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        input.onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (!parsed || !Array.isArray(parsed.curators)) {
                        throw new Error('Файл не содержит массив curators');
                    }
                    const steamId = parsed.steamId || userInfo.steamId;
                    const db = {
                        version: parsed.version || 1,
                        user: parsed.user || userInfo.userName,
                        steamId: steamId,
                        createdAt: parsed.createdAt || new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        curators: {}
                    };
                    parsed.curators.forEach(c => {
                        if (c.clanId) {
                            db.curators[c.clanId] = c;
                        }
                    });
                    saveDatabase(db);
                    const activeCount = getActiveFollowedCount(db.curators);
                    alert(`✅ База успешно импортирована!\nПользователь: ${db.user}\nАктивных подписок: ${activeCount}/100\nВсего в базе: ${Object.keys(db.curators).length}\nДата создания базы: ${formatDate(db.createdAt)}`);
                    onSuccess?.(db);
                } catch (err) {
                    alert(`❌ Ошибка импорта JSON: ${err.message}`);
                }
            };
            reader.readAsText(file);
        };
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }

    // -------------------------------------------------------------------------
    // Стили (Steam Native Dark Theme — Бесшовная интеграция)
    // -------------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById(STYLES_ID)) return;
        const css = `
            /* Бесшовный контейнер виджета в строке кнопок Steam */
            #${WIDGET_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-left: 10px;
                vertical-align: middle;
                height: 31px;
                background: transparent;
                border: none;
                box-shadow: none;
                padding: 0;
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }

            .sct-badge-steam {
                height: 30px;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 0 10px;
                border-radius: 2px;
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
                font-family: "Motiva Sans", sans-serif;
            }
            .sct-badge-followed {
                background: rgba(46, 204, 113, 0.12);
                color: #a4d007;
                border: 1px solid rgba(164, 208, 7, 0.35);
            }
            .sct-badge-legacy {
                background: rgba(102, 192, 244, 0.12);
                color: #66c0f4;
                border: 1px solid rgba(102, 192, 244, 0.35);
            }
            .sct-badge-unfollowed {
                background: rgba(231, 76, 60, 0.12);
                color: #ff6b6b;
                border: 1px solid rgba(231, 76, 60, 0.35);
            }
            .sct-badge-new {
                background: rgba(243, 156, 18, 0.12);
                color: #f39c12;
                border: 1px solid rgba(243, 156, 18, 0.35);
            }

            /* Нативная синяя кнопка Steam (Список кураторов) */
            .sct-btn-steam-blue {
                height: 30px;
                line-height: 28px;
                padding: 0 12px;
                border-radius: 2px;
                font-size: 12px;
                font-weight: 600;
                font-family: "Motiva Sans", sans-serif;
                background: linear-gradient(to bottom, #2d5a88 5%, #1b3858 95%);
                border: 1px solid #3d6c8d;
                color: #67c1f5;
                cursor: pointer;
                text-decoration: none;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: all 0.15s ease;
            }
            .sct-btn-steam-blue:hover {
                background: linear-gradient(to bottom, #3b74ae 5%, #22476f 95%);
                border-color: #67c1f5;
                color: #ffffff;
            }

            /* Нативная серая кнопка Steam (Шестеренка) */
            .sct-btn-steam-grey {
                height: 30px;
                width: 30px;
                min-width: 30px;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 2px;
                background: linear-gradient(to bottom, #3a4453 5%, #232a34 95%);
                border: 1px solid #455569;
                color: #a4b4c4;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.15s ease;
            }
            .sct-btn-steam-grey:hover {
                background: linear-gradient(to bottom, #4a5669 5%, #2d3642 95%);
                border-color: #67c1f5;
                color: #ffffff;
            }

            /* Кнопка отмены автообновления даты */
            .sct-btn-undo {
                height: 30px;
                line-height: 28px;
                padding: 0 8px;
                border-radius: 2px;
                background: rgba(231, 76, 60, 0.15);
                border: 1px solid rgba(231, 76, 60, 0.4);
                color: #ff8888;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                transition: all 0.15s ease;
            }
            .sct-btn-undo:hover {
                background: rgba(231, 76, 60, 0.35);
                color: #ffffff;
                border-color: #ff6b6b;
            }

            /* Выпадающее меню-портал (поверх всех слоев Steam) */
            #${GLOBAL_GEAR_MENU_ID} {
                background: #171d25;
                border: 1px solid #2a475e;
                border-radius: 4px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.85);
                padding: 6px 0;
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                min-width: 250px;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
            }
            .sct-menu-header {
                padding: 6px 14px 4px 14px;
                font-size: 11px;
                font-weight: 600;
                color: #66c0f4;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .sct-menu-item {
                padding: 8px 14px;
                background: transparent;
                border: none;
                color: #c6d4df;
                font-size: 12px;
                text-align: left;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                width: 100%;
                box-sizing: border-box;
                transition: background 0.1s;
            }
            .sct-menu-item:hover {
                background: #212f45;
                color: #ffffff;
            }
            .sct-menu-checkbox-item {
                padding: 8px 14px;
                color: #c6d4df;
                font-size: 12px;
                display: flex;
                align-items: flex-start;
                gap: 8px;
                cursor: pointer;
                user-select: none;
                transition: background 0.1s;
            }
            .sct-menu-checkbox-item:hover {
                background: #212f45;
                color: #ffffff;
            }
            .sct-menu-checkbox-item input {
                margin-top: 2px;
                cursor: pointer;
                accent-color: #66c0f4;
            }
            .sct-menu-divider {
                height: 1px;
                background: #233344;
                margin: 4px 0;
            }

            /* Панель на странице /curators/mycurators */
            #${MYCURATORS_PANEL_ID} {
                position: fixed;
                top: 100px;
                right: 20px;
                z-index: 999999;
                background: linear-gradient(135deg, #171d25 0%, #1e2837 100%);
                border: 1px solid #2a475e;
                border-radius: 6px;
                padding: 16px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #c6d4df;
                font-size: 13px;
                width: 320px;
                backdrop-filter: blur(8px);
            }
            #${MYCURATORS_PANEL_ID} h4 {
                margin: 0 0 10px 0;
                font-size: 14px;
                color: #66c0f4;
            }

            /* Модальное окно просмотра и отписки */
            #${MODAL_VIEWER_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.82);
                backdrop-filter: blur(4px);
                z-index: 1000000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #c6d4df;
            }
            #${MODAL_VIEWER_ID} .sct-modal-card {
                background: #171d25;
                border: 1px solid #2a475e;
                border-radius: 8px;
                width: 880px;
                max-width: 95vw;
                height: 85vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
                overflow: hidden;
            }
            #${MODAL_VIEWER_ID} .sct-modal-header {
                padding: 14px 20px;
                background: #1b2838;
                border-bottom: 1px solid #2a475e;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            #${MODAL_VIEWER_ID} .sct-modal-header h3 {
                margin: 0;
                font-size: 16px;
                color: #66c0f4;
            }
            #${MODAL_VIEWER_ID} .sct-close-btn {
                background: transparent;
                border: none;
                color: #899bb0;
                font-size: 22px;
                cursor: pointer;
                line-height: 1;
            }
            #${MODAL_VIEWER_ID} .sct-close-btn:hover {
                color: #fff;
            }
            #${MODAL_VIEWER_ID} .sct-modal-toolbar {
                padding: 10px 20px;
                background: #121820;
                border-bottom: 1px solid #233344;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 12px;
            }
            #${MODAL_VIEWER_ID} .sct-toolbar-left {
                display: flex;
                align-items: center;
                gap: 14px;
            }
            #${MODAL_VIEWER_ID} .sct-select-sort {
                background: #1b2634;
                border: 1px solid #2a475e;
                color: #e1e7ee;
                border-radius: 4px;
                padding: 5px 10px;
                font-size: 12px;
                outline: none;
                cursor: pointer;
            }
            #${MODAL_VIEWER_ID} .sct-search-input {
                background: #0d1217;
                border: 1px solid #2a475e;
                border-radius: 4px;
                color: #fff;
                padding: 6px 12px;
                font-size: 12px;
                outline: none;
                width: 200px;
            }
            #${MODAL_VIEWER_ID} .sct-search-input:focus {
                border-color: #66c0f4;
            }
            #${MODAL_VIEWER_ID} .sct-modal-body {
                flex: 1;
                overflow-y: auto;
                padding: 10px 20px;
            }
            #${MODAL_VIEWER_ID} table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            #${MODAL_VIEWER_ID} th {
                position: sticky;
                top: 0;
                background: #171d25;
                padding: 10px 8px;
                text-align: left;
                border-bottom: 2px solid #2a475e;
                color: #899bb0;
                font-weight: 600;
                z-index: 2;
            }
            #${MODAL_VIEWER_ID} td {
                padding: 9px 8px;
                border-bottom: 1px solid #212c3b;
            }
            #${MODAL_VIEWER_ID} tr:hover td {
                background: rgba(255, 255, 255, 0.03);
            }
            .sct-link {
                color: #66c0f4;
                text-decoration: none;
                font-weight: 500;
            }
            .sct-link:hover {
                text-decoration: underline;
                color: #a4d007;
            }
            .sct-btn-unfollow {
                background: rgba(231, 76, 60, 0.2);
                color: #ff6b6b;
                border: 1px solid rgba(231, 76, 60, 0.4);
                padding: 4px 10px;
                border-radius: 2px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                transition: background 0.15s, border-color 0.15s;
            }
            .sct-btn-unfollow:hover {
                background: #e74c3c;
                color: #fff;
            }
        `;
        const style = document.createElement('style');
        style.id = STYLES_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // Портал выпадающего меню шестеренки (Защита от overflow:hidden)
    // -------------------------------------------------------------------------
    function openPortalGearMenu(anchorBtn, { userInfo, onSettingsChange, onImportSuccess }) {
        const existing = document.getElementById(GLOBAL_GEAR_MENU_ID);
        if (existing) {
            existing.remove();
            return;
        }

        injectStyles();
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const settings = loadSettings(userInfo.steamId);

        const menu = document.createElement('div');
        menu.id = GLOBAL_GEAR_MENU_ID;

        const rect = anchorBtn.getBoundingClientRect();
        const menuWidth = 260;
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 4}px`;
        const left = Math.min(window.innerWidth - menuWidth - 10, Math.max(10, rect.right - menuWidth));
        menu.style.left = `${left}px`;
        menu.style.zIndex = '99999999';

        const autoUpdateChecked = settings.autoUpdateOnVisit ? 'checked' : '';

        menu.innerHTML = `
            <div class="sct-menu-header">Настройки и база (${escapeHtml(db.user || 'User')})</div>
            <label class="sct-menu-checkbox-item" title="При обычном переходе на страницу подписанного куратора обновлять дату подписки на текущую">
                <input type="checkbox" id="sct-setting-autoupdate" ${autoUpdateChecked}>
                <span>Автообновление даты при переходе</span>
            </label>
            <div class="sct-menu-divider"></div>
            <button class="sct-menu-item" id="sct-portal-export">💾 Экспорт базы (JSON)</button>
            <button class="sct-menu-item" id="sct-portal-import">📥 Импорт базы (JSON)</button>
            <div class="sct-menu-divider"></div>
            <button class="sct-menu-item" id="sct-portal-rescan">🚀 Перейти к кураторам (/mycurators)</button>
        `;

        document.body.appendChild(menu);

        const chk = menu.querySelector('#sct-setting-autoupdate');
        chk.onchange = () => {
            settings.autoUpdateOnVisit = chk.checked;
            saveSettings(userInfo.steamId, settings);
            onSettingsChange?.(settings);
        };

        menu.querySelector('#sct-portal-export').onclick = () => {
            menu.remove();
            exportCuratorsJSON(userInfo);
        };

        menu.querySelector('#sct-portal-import').onclick = () => {
            menu.remove();
            importCuratorsJSON(userInfo, () => {
                onImportSuccess?.();
            });
        };

        menu.querySelector('#sct-portal-rescan').onclick = () => {
            menu.remove();
            window.location.href = 'https://store.steampowered.com/curators/mycurators/';
        };

        const closeHandler = (e) => {
            if (!menu.contains(e.target) && !anchorBtn.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        setTimeout(() => {
            document.addEventListener('click', closeHandler);
        }, 0);
    }

    // -------------------------------------------------------------------------
    // Модуль 1: Интерактивный просмотр кураторов (Ревизия и отписка)
    // -------------------------------------------------------------------------
    function renderCuratorsViewerModal(userInfo) {
        const old = document.getElementById(MODAL_VIEWER_ID);
        if (old) old.remove();

        injectStyles();

        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const modal = document.createElement('div');
        modal.id = MODAL_VIEWER_ID;

        modal.innerHTML = `
            <div class="sct-modal-card">
                <div class="sct-modal-header">
                    <h3 id="sct-modal-title">📋 Ревизия кураторов: ${escapeHtml(db.user)}</h3>
                    <button class="sct-close-btn" id="sct-viewer-close" title="Закрыть">&times;</button>
                </div>
                <div class="sct-modal-toolbar">
                    <div class="sct-toolbar-left">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                            <input type="checkbox" id="sct-toggle-active-only" checked style="accent-color:#66c0f4;">
                            <span>Только активные подписки</span>
                        </label>
                        <select class="sct-select-sort" id="sct-select-sort">
                            <option value="oldest">⏳ Сначала старые (для отписки)</option>
                            <option value="newest">⏱️ Сначала новые</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <input type="text" class="sct-search-input" id="sct-viewer-search" placeholder="Поиск по названию...">
                        <span id="sct-viewer-counter" style="font-size:11px; color:#899bb0;"></span>
                    </div>
                </div>
                <div class="sct-modal-body">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 140px;">Дата подписки</th>
                                <th>Куратор</th>
                                <th style="width: 130px; text-align: right;">Действие</th>
                            </tr>
                        </thead>
                        <tbody id="sct-viewer-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const titleEl = modal.querySelector('#sct-modal-title');
        const tbody = modal.querySelector('#sct-viewer-tbody');
        const activeOnlyToggle = modal.querySelector('#sct-toggle-active-only');
        const sortSelect = modal.querySelector('#sct-select-sort');
        const searchInput = modal.querySelector('#sct-viewer-search');
        const counterEl = modal.querySelector('#sct-viewer-counter');

        function updateList() {
            const currentDb = loadDatabase(userInfo.steamId, userInfo.userName);
            const activeCount = getActiveFollowedCount(currentDb.curators);
            titleEl.innerText = `📋 Ревизия кураторов: ${currentDb.user} (${activeCount}/100)`;

            const order = sortSelect.value;
            const onlyActive = activeOnlyToggle.checked;
            const query = searchInput.value.toLowerCase().trim();

            const sorted = getSortedCurators(currentDb.curators, order);
            const filtered = sorted.filter(c => {
                if (onlyActive && c.status !== 'followed') return false;
                if (query && !(c.name || '').toLowerCase().includes(query)) return false;
                return true;
            });

            counterEl.innerText = `Показано: ${filtered.length} из ${Object.keys(currentDb.curators).length} (активных: ${activeCount}/100)`;

            if (!filtered.length) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:40px; color:#899bb0;">Кураторы не найдены.</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(c => {
                const dateText = c.followedAt ? formatDate(c.followedAt, true) : 'Неизвестно';
                const isFollowed = c.status === 'followed';

                let actionHtml = '';
                if (isFollowed) {
                    actionHtml = `<button class="sct-btn-unfollow" data-clanid="${c.clanId}">❌ Отписаться</button>`;
                } else {
                    const unfollowDate = c.unfollowedAt ? formatDate(c.unfollowedAt, true) : '';
                    actionHtml = `<span class="sct-badge-steam sct-badge-unfollowed">🔴 Отписан ${unfollowDate}</span>`;
                }

                // Добавляем маркер ссылки #sct_ref=list, чтобы при переходе не обновлялась дата подписки
                const safeLink = c.link ? `${c.link.split('#')[0]}#sct_ref=list` : '#';

                return `
                    <tr id="sct-row-${c.clanId}">
                        <td style="color:#899bb0; font-variant-numeric:tabular-nums;">
                            ${dateText}
                            ${c.isInitial ? '<br><small style="color:#66c0f4;">(создание БД)</small>' : ''}
                        </td>
                        <td>
                            <a href="${safeLink}" target="_blank" rel="noopener noreferrer" class="sct-link">
                                ${escapeHtml(c.name)} ↗
                            </a>
                        </td>
                        <td style="text-align: right;" class="sct-col-action">
                            ${actionHtml}
                        </td>
                    </tr>
                `;
            }).join('');

            // Привязка обработчиков отписки
            tbody.querySelectorAll('.sct-btn-unfollow').forEach(btn => {
                btn.onclick = function() {
                    const clanId = this.dataset.clanid;
                    const row = document.getElementById(`sct-row-${clanId}`);
                    handleUnfollow(clanId, row);
                };
            });
        }

        function handleUnfollow(clanId, rowEl) {
            if (!confirm('Отписаться от этого куратора в Steam?')) return;

            // Вызываем нативную функцию Steam
            if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.FollowCurator === 'function') {
                try {
                    unsafeWindow.FollowCurator(clanId, false);
                } catch (e) {
                    console.warn('[CuratorTracker] Ошибка вызова FollowCurator:', e);
                }
            }

            // Фиксируем отписку в локальной базе
            const currentDb = loadDatabase(userInfo.steamId, userInfo.userName);
            if (currentDb.curators[clanId]) {
                currentDb.curators[clanId].status = 'unfollowed';
                currentDb.curators[clanId].unfollowedAt = new Date().toISOString();
                currentDb.curators[clanId].isAutoUpdated = false;
                saveDatabase(currentDb);
            }

            const actionCell = rowEl?.querySelector('.sct-col-action');
            if (actionCell) {
                actionCell.innerHTML = '<span class="sct-badge-steam sct-badge-unfollowed">🔴 Отписан</span>';
            }

            if (activeOnlyToggle.checked && rowEl) {
                rowEl.style.transition = 'opacity 0.3s, transform 0.3s';
                rowEl.style.opacity = '0';
                rowEl.style.transform = 'translateX(20px)';
                setTimeout(() => {
                    rowEl.remove();
                    updateList();
                }, 300);
            } else {
                updateList();
            }

            // Синхронизируем виджет на заднем плане (включая счетчик X/100)
            updateCuratorPageUI();
        }

        activeOnlyToggle.onchange = updateList;
        sortSelect.onchange = updateList;
        searchInput.oninput = updateList;

        const closeModal = () => modal.remove();
        modal.querySelector('#sct-viewer-close').onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);

        updateList();
    }

    // -------------------------------------------------------------------------
    // Модуль 2: Страница отдельного куратора (/curator/*)
    // -------------------------------------------------------------------------
    function updateCuratorPageUI() {
        if (!window.location.pathname.startsWith('/curator/')) return;

        const curatorInfo = getCuratorInfo();
        if (!curatorInfo.clanId) return;

        const userInfo = getUserInfo();
        const userHasDb = hasDatabase(userInfo.steamId);
        const settings = loadSettings(userInfo.steamId);
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        let record = db.curators[curatorInfo.clanId];
        const currentlyFollowed = isFollowedInDOM(curatorInfo.clanId);

        // Синхронизация при первом заходе, если в Steam подписан, но записи еще не было
        if (currentlyFollowed && !record) {
            record = {
                clanId: curatorInfo.clanId,
                name: curatorInfo.name,
                link: curatorInfo.link,
                status: 'followed',
                followedAt: db.createdAt || new Date().toISOString(),
                unfollowedAt: null,
                isInitial: Boolean(db.createdAt),
                isAutoUpdated: false
            };
            db.curators[curatorInfo.clanId] = record;
            saveDatabase(db);
        }

        // Логика автообновления даты подписки при переходе (если разрешено настройкой и не из нашей таблицы)
        if (currentlyFollowed && record) {
            const wasUpdated = handleAutoUpdateVisit(curatorInfo.clanId, record, userInfo, settings);
            if (wasUpdated) {
                // Перечитываем актуальную запись
                record = db.curators[curatorInfo.clanId];
            }
        }

        let badgeHtml = '';
        let undoBtnHtml = '';

        if (currentlyFollowed) {
            if (record?.followedAt) {
                const dateText = formatDate(record.followedAt);
                const tag = record.isInitial ? ' <small style="opacity:0.85;">(создание БД)</small>' : '';
                const autoTag = record.isAutoUpdated ? ' <small style="opacity:0.85; color:#66c0f4;">(обновлено)</small>' : '';
                badgeHtml = `<span class="sct-badge-steam sct-badge-followed">🟢 Подписан: <b>${dateText}</b>${tag}${autoTag}</span>`;

                if (record.isAutoUpdated && record._prevFollowedAt) {
                    const prevDateText = formatDate(record._prevFollowedAt);
                    undoBtnHtml = `<button class="sct-btn-undo" id="sct-btn-undo-date" title="Вернуть прежнюю дату: ${prevDateText}">↩️ Отменить</button>`;
                }
            } else {
                badgeHtml = `<span class="sct-badge-steam sct-badge-legacy">🟢 Подписан: <b>Дата неизвестна</b></span>`;
            }
        } else {
            if (record?.unfollowedAt) {
                const dateText = formatDate(record.unfollowedAt);
                badgeHtml = `<span class="sct-badge-steam sct-badge-unfollowed">🔴 Отписан: <b>${dateText}</b></span>`;
            } else {
                badgeHtml = `<span class="sct-badge-steam sct-badge-new">⚪ Новый куратор</span>`;
            }
        }

        let widget = document.getElementById(WIDGET_ID);
        if (!widget) {
            const followControls = document.querySelector('.follow_controls');
            const target = followControls ||
                           document.querySelector('#header_curator_details') ||
                           document.querySelector('.header_area');
            if (!target) return;

            injectStyles();
            widget = document.createElement('div');
            widget.id = WIDGET_ID;

            if (followControls) {
                followControls.parentNode.insertBefore(widget, followControls.nextSibling);
            } else {
                target.appendChild(widget);
            }
        }

        let newUserButton = '';
        if (!userHasDb && userInfo.steamId !== 'anonymous') {
            newUserButton = `
                <a href="https://store.steampowered.com/curators/mycurators/?sct_init=1" class="sct-btn-steam-blue" style="border-color:#f39c12; color:#f39c12;" title="База не создана. Нажмите для первичного обхода подписок">
                    ⚠️ Создать базу
                </a>
            `;
        }

        const activeCount = getActiveFollowedCount(db.curators);

        widget.innerHTML = `
            ${newUserButton}
            ${badgeHtml}
            ${undoBtnHtml}
            <button class="sct-btn-steam-blue" id="sct-btn-view-list" title="Просмотр и отписка от кураторов">
                📋 Список (${activeCount}/100)
            </button>
            <button class="sct-btn-steam-grey" id="sct-btn-gear" title="Настройки, экспорт и импорт базы">⚙️</button>
        `;

        // Обработчик кнопки списка
        widget.querySelector('#sct-btn-view-list').onclick = () => renderCuratorsViewerModal(userInfo);

        // Обработчик кнопки отмены даты
        const undoBtn = widget.querySelector('#sct-btn-undo-date');
        if (undoBtn) {
            undoBtn.onclick = () => undoAutoUpdateDate(curatorInfo.clanId, userInfo);
        }

        // Обработчик кнопки шестеренки (портал)
        const gearBtn = widget.querySelector('#sct-btn-gear');
        gearBtn.onclick = (e) => {
            e.stopPropagation();
            openPortalGearMenu(gearBtn, {
                userInfo,
                onSettingsChange: () => updateCuratorPageUI(),
                onImportSuccess: () => updateCuratorPageUI()
            });
        };
    }

    // -------------------------------------------------------------------------
    // Модуль 3: Страница всех подписок (/curators/mycurators)
    // -------------------------------------------------------------------------
    async function autoScrollCurators(progressCb) {
        let lastHeight = document.body.scrollHeight;
        let checks = 0;
        while (true) {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            await new Promise(r => setTimeout(r, 1200));
            const currentHeight = document.body.scrollHeight;
            const count = document.querySelectorAll('.curator_page.followed').length;
            progressCb?.(`Найдено: ${count}`);

            if (currentHeight === lastHeight) {
                if (++checks >= 2) break;
            } else {
                checks = 0;
                lastHeight = currentHeight;
            }
        }
    }

    function scrapeMyCurators() {
        const list = [];
        document.querySelectorAll('.curator_page.followed').forEach(card => {
            try {
                const nameEl = card.querySelector('.profile .info .name') || card.querySelector('.curator_name a');
                const linkEl = card.querySelector('a.profile_avatar') || card.querySelector('.profile .info .name a');
                const rawName = nameEl?.textContent || 'Unknown';
                const name = rawName.replace(/^Недавние обзоры от\s*/i, '').trim();
                const link = linkEl?.href || '';
                const clanId = link.match(/\/curator\/(\d+)/)?.[1] || card.getAttribute('data-clanid');

                if (clanId) {
                    list.push({ clanId, name, link });
                }
            } catch (e) {
                console.warn('[CuratorTracker] Ошибка разбора карточки куратора:', e);
            }
        });
        return list;
    }

    async function executeInitialScan(btnEl) {
        const userInfo = getUserInfo();
        const originalText = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '⏳ <span>Скроллинг страницы...</span>';

        try {
            await autoScrollCurators((text) => {
                btnEl.innerHTML = `⏳ <span>${text}</span>`;
            });

            btnEl.innerHTML = '⚙️ <span>Заведение базы...</span>';
            const scraped = scrapeMyCurators();

            const existingDb = storage.get(getStorageKey(userInfo.steamId), null);
            const createdAt = existingDb?.createdAt || new Date().toISOString();

            const db = {
                version: 1,
                user: userInfo.userName,
                steamId: userInfo.steamId,
                createdAt: createdAt,
                updatedAt: new Date().toISOString(),
                curators: existingDb?.curators || {}
            };

            let addedCount = 0;
            for (const item of scraped) {
                if (!db.curators[item.clanId]) {
                    db.curators[item.clanId] = {
                        clanId: item.clanId,
                        name: item.name,
                        link: item.link,
                        status: 'followed',
                        followedAt: createdAt,
                        unfollowedAt: null,
                        isInitial: true,
                        isAutoUpdated: false
                    };
                    addedCount++;
                } else if (db.curators[item.clanId].status === 'unfollowed') {
                    db.curators[item.clanId].status = 'followed';
                }
            }

            saveDatabase(db);
            const activeCount = getActiveFollowedCount(db.curators);
            alert(`✅ База кураторов успешно сохранена!\nПользователь: ${userInfo.userName}\nАктивных подписок: ${activeCount}/100\nВсего в базе: ${Object.keys(db.curators).length} (новых добавлено: ${addedCount})\nДата создания базы: ${formatDate(createdAt)}`);
            renderMyCuratorsPanel();
        } catch (err) {
            console.error('[CuratorTracker] Ошибка сканирования:', err);
            alert(`❌ Ошибка инициализации: ${err.message}`);
        } finally {
            btnEl.disabled = false;
            btnEl.innerHTML = originalText;
        }
    }

    function renderMyCuratorsPanel() {
        if (!window.location.pathname.startsWith('/curators/mycurators')) return;

        injectStyles();
        let panel = document.getElementById(MYCURATORS_PANEL_ID);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = MYCURATORS_PANEL_ID;
            document.body.appendChild(panel);
        }

        const userInfo = getUserInfo();
        const userHasDb = hasDatabase(userInfo.steamId);
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const activeCount = getActiveFollowedCount(db.curators);
        const total = Object.keys(db.curators || {}).length;

        let statusText = '';
        if (userHasDb) {
            statusText = `
                <div style="font-size:11px; color:#899bb0; line-height:1.4; margin-bottom:12px;">
                    👤 Пользователь: <b>${escapeHtml(db.user)}</b><br>
                    ⭐ Подписок: <b style="color:#67c1f5;">${activeCount} / 100</b> (всего в базе: ${total})<br>
                    📅 Дата создания БД: <b>${formatDate(db.createdAt)}</b>
                </div>
            `;
        } else {
            statusText = `
                <div style="font-size:11px; color:#f39c12; line-height:1.4; margin-bottom:12px;">
                    ⚠️ <b>Новый пользователь!</b> База кураторов еще не заведена.<br>
                    Нажмите кнопку ниже, чтобы автоматически собрать подписки и завести базу.
                </div>
                <button class="sct-btn-steam-blue" id="sct-btn-init-scan" style="width:100%; justify-content:center; margin-bottom:8px;">
                    🚀 Начать первичный обход кураторки
                </button>
            `;
        }

        panel.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                <h4 style="margin:0; font-size:14px; color:#66c0f4;">🛡️ Трекер кураторов Steam</h4>
                <button class="sct-btn-steam-grey" id="sct-panel-gear" title="Настройки и база">⚙️</button>
            </div>
            ${statusText}
            <div style="display:flex; gap:6px;">
                <button class="sct-btn-steam-blue" id="sct-btn-panel-view" style="flex:1; justify-content:center;">
                    📋 Список (${activeCount}/100)
                </button>
                <button class="sct-btn-steam-grey" id="sct-btn-go-back" title="Назад" style="width:auto; padding:0 10px;">
                    🔙
                </button>
            </div>
        `;

        panel.querySelector('#sct-btn-panel-view').onclick = () => renderCuratorsViewerModal(userInfo);

        const gearBtn = panel.querySelector('#sct-panel-gear');
        gearBtn.onclick = (e) => {
            e.stopPropagation();
            openPortalGearMenu(gearBtn, {
                userInfo,
                onSettingsChange: () => renderMyCuratorsPanel(),
                onImportSuccess: () => renderMyCuratorsPanel()
            });
        };

        panel.querySelector('#sct-btn-go-back').onclick = () => {
            if (window.history.length > 1) window.history.back();
            else window.location.href = 'https://store.steampowered.com/';
        };

        const initBtn = panel.querySelector('#sct-btn-init-scan');
        if (initBtn) {
            initBtn.onclick = function() {
                executeInitialScan(this);
            };
        }

        // Автоматический запуск первичного обхода, если пришли с параметром ?sct_init=1
        if (window.location.search.includes('sct_init=1') && !userHasDb) {
            const url = new URL(window.location.href);
            url.searchParams.delete('sct_init');
            window.history.replaceState({}, '', url.toString());

            setTimeout(() => {
                const btn = panel.querySelector('#sct-btn-init-scan');
                if (btn) btn.click();
            }, 500);
        }
    }

    function escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[m]);
    }

    // -------------------------------------------------------------------------
    // Перехват кликов и событий подписки / отписки
    // -------------------------------------------------------------------------
    function initTracker() {
        // 1. Делегированный перехват кликов
        document.addEventListener('click', (e) => {
            const followBtn = e.target.closest('[id^="CuratorFollowBtn_"]');
            const unfollowBtn = e.target.closest('[id^="CuratorUnFollowBtn_"]');

            if (followBtn || unfollowBtn) {
                const isFollow = Boolean(followBtn);
                const btn = followBtn || unfollowBtn;
                const clanId = btn.id.replace(isFollow ? 'CuratorFollowBtn_' : 'CuratorUnFollowBtn_', '');
                const curatorInfo = getCuratorInfo();
                const userInfo = getUserInfo();

                setTimeout(() => {
                    recordFollowAction(clanId, isFollow, curatorInfo, userInfo);
                }, 300);
            }
        }, true);

        // 2. Хук на нативную функцию Steam FollowCurator
        if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.FollowCurator === 'function') {
            const originalFollowCurator = unsafeWindow.FollowCurator;
            unsafeWindow.FollowCurator = function(clanid, bFollow) {
                try {
                    const curatorInfo = getCuratorInfo();
                    const userInfo = getUserInfo();
                    setTimeout(() => {
                        recordFollowAction(String(clanid), Boolean(bFollow), curatorInfo, userInfo);
                    }, 300);
                } catch (err) {
                    console.error('[CuratorTracker] Ошибка хука FollowCurator:', err);
                }
                return originalFollowCurator.apply(this, arguments);
            };
        }

        // 3. Периодический мониторинг изменений DOM и первичная отрисовка
        setInterval(() => {
            if (window.location.pathname.startsWith('/curator/')) {
                updateCuratorPageUI();
            } else if (window.location.pathname.startsWith('/curators/mycurators')) {
                renderMyCuratorsPanel();
            }
        }, 1000);
    }

    initTracker();
})();
