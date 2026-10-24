// ==UserScript==
// @name         Steam Curator Follow Tracker
// @namespace    https://github.com/BasimovIF-AI/userscript-steam-curator
// @version      2.7.1
// @description  Нативный UI трекера кураторов Steam (без эмодзи, точный лимит X/100, автообновление дат, поддержка /developer/ и /publisher/, мгновенная отписка и подписка в модалке)
// @author       Senior Software Engineer
// @match        *://store.steampowered.com/curator/*
// @match        *://store.steampowered.com/curators/mycurators*
// @match        *://store.steampowered.com/developer/*
// @match        *://store.steampowered.com/publisher/*
// @match        *://store.steampowered.com/franchise/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_VERSION = '2.7.1';
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

    function isCuratorOrCreatorPage() {
        const p = window.location.pathname;
        return p.startsWith('/curator/') ||
               p.startsWith('/developer/') ||
               p.startsWith('/publisher/') ||
               p.startsWith('/franchise/');
    }

    function getCuratorInfo() {
        const followBtn = document.querySelector('[id^="CuratorFollowBtn_"]');
        const unfollowBtn = document.querySelector('[id^="CuratorUnFollowBtn_"]');
        const clanId = followBtn?.id?.replace('CuratorFollowBtn_', '') ||
                       unfollowBtn?.id?.replace('CuratorUnFollowBtn_', '') ||
                       document.querySelector('[data-clanid]')?.getAttribute('data-clanid') ||
                       (typeof unsafeWindow !== 'undefined' && (unsafeWindow.g_clanAccountID || unsafeWindow.g_rgCurator?.clanid)) ||
                       window.location.pathname.match(/\/curator\/(\d+)/)?.[1] ||
                       null;

        const nameEl = document.querySelector('.curator_name a') ||
                       document.querySelector('.pageheader.curator_name') ||
                       document.querySelector('.curator_name') ||
                       document.querySelector('.creator_name') ||
                       document.querySelector('.page_title_area .page_title') ||
                       document.querySelector('.creator_home_header .creator_name');
        
        let name = nameEl?.textContent?.trim();
        if (!name) {
            const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
            if (ogTitle) {
                name = ogTitle.replace(/\s*на Steam.*$/i, '').replace(/\s*on Steam.*$/i, '').trim();
            }
        }
        if (!name) {
            name = document.title ? document.title.replace(/\s*на Steam.*$/i, '').replace(/\s*on Steam.*$/i, '').trim() : 'Unknown Creator';
        }

        const cleanCurrentUrl = window.location.origin + window.location.pathname;
        const link = (isCuratorOrCreatorPage() && !window.location.pathname.startsWith('/curator/'))
            ? cleanCurrentUrl
            : (clanId ? `https://store.steampowered.com/curator/${clanId}/` : cleanCurrentUrl);

        return { clanId: clanId ? String(clanId) : null, name, link };
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
            name: curatorInfo?.name || `Curator ${clanId}`,
            link: curatorInfo?.link || `https://store.steampowered.com/curator/${clanId}/`,
            status: 'unknown',
            followedAt: null,
            unfollowedAt: null,
            isInitial: false
        };

        const now = new Date().toISOString();
        if (isFollow) {
            existing.status = 'followed';
            existing.followedAt = existing.followedAt || now;
            existing.unfollowedAt = null;
            existing.isInitial = false;
            existing.isAutoUpdated = false;
            delete existing._prevFollowedAt;
        } else {
            existing.status = 'unfollowed';
            existing.unfollowedAt = now;
            existing.isAutoUpdated = false;
        }
        if (curatorInfo?.name) existing.name = curatorInfo.name;
        if (curatorInfo?.link) existing.link = curatorInfo.link;

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
            /* Бесшовный контейнер виджета в строке кнопок Steam (100% сопряжение с .follow_controls) */
            #${WIDGET_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin: 6px 0 0 10px;
                height: 34px;
                vertical-align: top;
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                font-weight: 300;
                box-sizing: border-box;
                background: transparent;
                border: none;
                box-shadow: none;
                padding: 0;
            }

            /* Нативная капсула статуса и даты подписки (стилизована под капсулу Steam) */
            .sct-status-capsule {
                display: inline-flex;
                align-items: center;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 4px;
                height: 34px;
                padding: 0 10px;
                box-sizing: border-box;
                font-family: "Motiva Sans", sans-serif;
                font-size: 12px;
                font-weight: 300;
                color: #c6d4df;
                white-space: nowrap;
                vertical-align: top;
                text-shadow: 1px 1px 0px rgba(0, 0, 0, 0.3);
            }
            .sct-status-capsule .sct-ico-check {
                width: 14px;
                height: 14px;
                margin-right: 6px;
                vertical-align: middle;
                display: inline-block;
            }
            .sct-status-capsule .sct-date-highlight {
                color: #a4d007;
                font-weight: 500;
                margin-left: 3px;
            }
            .sct-status-capsule.sct-unfollowed {
                color: #8f98a0;
            }
            .sct-status-capsule.sct-unfollowed .sct-date-highlight {
                color: #ff6b6b;
            }
            .sct-status-capsule.sct-new-curator {
                color: #f39c12;
            }

            /* Нативные кнопки Steam (btnv6_blue_hoverfade и btnv6_white_transparent) */
            .btnv6_blue_hoverfade.btn_medium,
            .btnv6_white_transparent.btn_medium {
                display: inline-block;
                border-radius: 2px;
                padding: 1px;
                height: 34px;
                cursor: pointer;
                text-decoration: none !important;
                box-sizing: border-box;
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                vertical-align: top;
                user-select: none;
            }
            .btnv6_blue_hoverfade.btn_medium > span,
            .btnv6_white_transparent.btn_medium > span {
                padding: 0 12px;
                font-size: 12px;
                font-weight: 300;
                line-height: 32px;
                height: 32px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 2px;
                box-sizing: border-box;
                text-shadow: 1px 1px 0px rgba(0, 0, 0, 0.3);
                transition: all 0.15s ease;
                white-space: nowrap;
            }
            /* Синяя кнопка (hoverfade) */
            .btnv6_blue_hoverfade {
                background: rgba(103, 193, 245, 0.2);
            }
            .btnv6_blue_hoverfade:hover {
                background: rgba(103, 193, 245, 0.4);
            }
            .btnv6_blue_hoverfade > span {
                color: #67c1f5;
                background: rgba(0, 0, 0, 0.25);
            }
            .btnv6_blue_hoverfade:hover > span {
                color: #ffffff;
                background: rgba(103, 193, 245, 0.25);
            }
            /* Прозрачная/серая кнопка */
            .btnv6_white_transparent {
                background: rgba(255, 255, 255, 0.1);
            }
            .btnv6_white_transparent:hover {
                background: rgba(255, 255, 255, 0.2);
            }
            .btnv6_white_transparent > span {
                color: #c6d4df;
                background: rgba(0, 0, 0, 0.3);
            }
            .btnv6_white_transparent:hover > span {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.1);
            }
            /* Кнопка шестеренки */
            .sct-btn-gear > span {
                padding: 0 8px !important;
            }
            .sct-svg-icon {
                width: 14px;
                height: 14px;
                fill: currentColor;
                display: inline-block;
                vertical-align: middle;
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
            .sct-menu-footer {
                padding: 6px 14px 4px 14px;
                font-size: 10px;
                color: #55677d;
                text-align: right;
                letter-spacing: 0.3px;
                user-select: none;
            }
            .sct-version-tag {
                font-size: 10px;
                color: #55677d;
                font-weight: 300;
                margin-left: 6px;
                user-select: none;
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
            #${MODAL_VIEWER_ID} .sct-col-action {
                text-align: right;
                white-space: nowrap;
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
            <button class="sct-menu-item" id="sct-portal-export">Экспорт базы (JSON)</button>
            <button class="sct-menu-item" id="sct-portal-import">Импорт базы (JSON)</button>
            <div class="sct-menu-divider"></div>
            <button class="sct-menu-item" id="sct-portal-rescan">Перейти к кураторам (/mycurators)</button>
            <div class="sct-menu-divider"></div>
            <div class="sct-menu-footer">Steam Curator Tracker v${SCRIPT_VERSION}</div>
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
                    <h3 id="sct-modal-title">Ревизия кураторов: ${escapeHtml(db.user)} <span class="sct-version-tag">v${SCRIPT_VERSION}</span></h3>
                    <button class="sct-close-btn" id="sct-viewer-close" title="Закрыть">&times;</button>
                </div>
                <div class="sct-modal-toolbar">
                    <div class="sct-toolbar-left">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px;">
                            <input type="checkbox" id="sct-toggle-active-only" checked style="accent-color:#66c0f4;">
                            <span>Только активные подписки</span>
                        </label>
                        <select class="sct-select-sort" id="sct-select-sort">
                            <option value="oldest">Сначала старые (для отписки)</option>
                            <option value="newest">Сначала новые</option>
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

        function renderActionCell(c) {
            if (c.status === 'followed') {
                return `<span class="btnv6_white_transparent btn_medium sct-btn-unfollow" data-clanid="${c.clanId}" role="button"><span>Отписаться</span></span>`;
            } else {
                const unfollowDate = c.unfollowedAt ? formatDate(c.unfollowedAt, true) : '';
                const dateLabel = unfollowDate ? `Отписан ${unfollowDate}` : 'Отписан';
                return `
                    <div style="display:inline-flex; align-items:center; gap:8px;">
                        <span style="color:#8f98a0; font-size:11px;">${dateLabel}</span>
                        <span class="btnv6_blue_hoverfade btn_medium sct-btn-refollow" data-clanid="${c.clanId}" role="button"><span>Подписаться</span></span>
                    </div>
                `;
            }
        }

        function updateList() {
            const currentDb = loadDatabase(userInfo.steamId, userInfo.userName);
            const activeCount = getActiveFollowedCount(currentDb.curators);
            titleEl.innerHTML = `Ревизия кураторов: ${escapeHtml(currentDb.user)} (${activeCount}/100) <span class="sct-version-tag">v${SCRIPT_VERSION}</span>`;

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
                        <td class="sct-col-action">
                            ${renderActionCell(c)}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function handleUnfollow(clanId, rowEl) {
            // Вызываем нативную функцию Steam без блокирующего confirm
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

            // Обновляем ячейку действия в текущей строке (строка НЕ удаляется, доступна обратная кнопка)
            const actionCell = rowEl?.querySelector('.sct-col-action');
            if (actionCell && currentDb.curators[clanId]) {
                actionCell.innerHTML = renderActionCell(currentDb.curators[clanId]);
            }

            // Мгновенно обновляем счетчики
            const activeCount = getActiveFollowedCount(currentDb.curators);
            titleEl.innerHTML = `Ревизия кураторов: ${escapeHtml(currentDb.user)} (${activeCount}/100) <span class="sct-version-tag">v${SCRIPT_VERSION}</span>`;
            const displayedRows = tbody.querySelectorAll('tr').length;
            counterEl.innerText = `Показано: ${displayedRows} из ${Object.keys(currentDb.curators).length} (активных: ${activeCount}/100)`;

            // Синхронизируем виджет на заднем плане (включая счетчик X/100)
            updateCuratorPageUI();
        }

        function handleRefollow(clanId, rowEl) {
            // Вызываем нативную функцию Steam для повторной подписки
            if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.FollowCurator === 'function') {
                try {
                    unsafeWindow.FollowCurator(clanId, true);
                } catch (e) {
                    console.warn('[CuratorTracker] Ошибка вызова FollowCurator:', e);
                }
            }

            // Фиксируем повторную подписку в локальной базе
            const currentDb = loadDatabase(userInfo.steamId, userInfo.userName);
            if (currentDb.curators[clanId]) {
                currentDb.curators[clanId].status = 'followed';
                currentDb.curators[clanId].followedAt = new Date().toISOString();
                currentDb.curators[clanId].unfollowedAt = null;
                currentDb.curators[clanId].isAutoUpdated = false;
                saveDatabase(currentDb);
            }

            // Обновляем ячейку действия в текущей строке обратно на кнопку "Отписаться"
            const actionCell = rowEl?.querySelector('.sct-col-action');
            if (actionCell && currentDb.curators[clanId]) {
                actionCell.innerHTML = renderActionCell(currentDb.curators[clanId]);
            }

            // Обновляем дату в первой колонке строки
            const dateCell = rowEl?.cells?.[0];
            if (dateCell && currentDb.curators[clanId]?.followedAt) {
                dateCell.innerHTML = formatDate(currentDb.curators[clanId].followedAt, true);
            }

            // Мгновенно обновляем счетчики
            const activeCount = getActiveFollowedCount(currentDb.curators);
            titleEl.innerHTML = `Ревизия кураторов: ${escapeHtml(currentDb.user)} (${activeCount}/100) <span class="sct-version-tag">v${SCRIPT_VERSION}</span>`;
            const displayedRows = tbody.querySelectorAll('tr').length;
            counterEl.innerText = `Показано: ${displayedRows} из ${Object.keys(currentDb.curators).length} (активных: ${activeCount}/100)`;

            // Синхронизируем виджет на заднем плане (включая счетчик X/100)
            updateCuratorPageUI();
        }

        // Делегированная обработка кликов в таблице
        tbody.onclick = (e) => {
            const unfollowBtn = e.target.closest('.sct-btn-unfollow');
            if (unfollowBtn) {
                const clanId = unfollowBtn.dataset.clanid;
                const row = document.getElementById(`sct-row-${clanId}`);
                handleUnfollow(clanId, row);
                return;
            }
            const refollowBtn = e.target.closest('.sct-btn-refollow');
            if (refollowBtn) {
                const clanId = refollowBtn.dataset.clanid;
                const row = document.getElementById(`sct-row-${clanId}`);
                handleRefollow(clanId, row);
                return;
            }
        };

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
        if (!isCuratorOrCreatorPage()) return;

        const curatorInfo = getCuratorInfo();
        if (!curatorInfo.clanId) return;

        const userInfo = getUserInfo();
        const userHasDb = hasDatabase(userInfo.steamId);
        const settings = loadSettings(userInfo.steamId);
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        let record = db.curators[curatorInfo.clanId];
        const domFollowed = isFollowedInDOM(curatorInfo.clanId);

        // Двусторонняя реактивная синхронизация состояния подписки с DOM Steam
        if (domFollowed) {
            if (!record) {
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
            } else if (record.status !== 'followed') {
                record.status = 'followed';
                record.followedAt = record.followedAt || new Date().toISOString();
                record.unfollowedAt = null;
                record.name = curatorInfo.name || record.name;
                record.link = curatorInfo.link || record.link;
                db.curators[curatorInfo.clanId] = record;
                saveDatabase(db);
            }
        } else if (record && record.status === 'followed') {
            const followBtn = document.getElementById(`CuratorFollowBtn_${curatorInfo.clanId}`);
            if (followBtn) {
                const style = window.getComputedStyle(followBtn);
                if (style.display !== 'none' && followBtn.offsetParent !== null) {
                    record.status = 'unfollowed';
                    record.unfollowedAt = record.unfollowedAt || new Date().toISOString();
                    db.curators[curatorInfo.clanId] = record;
                    saveDatabase(db);
                }
            }
        }

        const currentlyFollowed = record ? (record.status === 'followed') : domFollowed;

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
                const autoTag = record.isAutoUpdated ? ' <small style="opacity:0.85; color:#67c1f5;">(обновлено)</small>' : '';
                badgeHtml = `
                    <div class="sct-status-capsule">
                        <img src="https://store.fastly.steamstatic.com/public/images/v6/ico/ico_selected_green.png" class="sct-ico-check" alt="checked">
                        <span>Подписан: <b class="sct-date-highlight">${dateText}</b>${tag}${autoTag}</span>
                    </div>
                `;

                if (record.isAutoUpdated && record._prevFollowedAt) {
                    const prevDateText = formatDate(record._prevFollowedAt);
                    undoBtnHtml = `
                        <span class="btnv6_white_transparent btn_medium sct-btn-undo" id="sct-btn-undo-date" role="button" title="Вернуть прежнюю дату: ${prevDateText}">
                            <span>Отменить</span>
                        </span>
                    `;
                }
            } else {
                badgeHtml = `
                    <div class="sct-status-capsule">
                        <img src="https://store.fastly.steamstatic.com/public/images/v6/ico/ico_selected_green.png" class="sct-ico-check" alt="checked">
                        <span>Подписан: <b class="sct-date-highlight">Дата неизвестна</b></span>
                    </div>
                `;
            }
        } else {
            if (record?.unfollowedAt) {
                const dateText = formatDate(record.unfollowedAt);
                badgeHtml = `
                    <div class="sct-status-capsule sct-unfollowed">
                        <span>Отписан: <b class="sct-date-highlight">${dateText}</b></span>
                    </div>
                `;
            } else {
                badgeHtml = `
                    <div class="sct-status-capsule sct-new-curator">
                        <span>Новый куратор</span>
                    </div>
                `;
            }
        }

        let widget = document.getElementById(WIDGET_ID);
        if (!widget) {
            const followControls = document.querySelector('.follow_controls');
            const target = followControls ||
                           document.querySelector('#header_curator_details') ||
                           document.querySelector('.creator_home_header') ||
                           document.querySelector('.page_content .header_area') ||
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
                <a href="https://store.steampowered.com/curators/mycurators/?sct_init=1" class="btnv6_blue_hoverfade btn_medium" title="База не создана. Нажмите для первичного обхода подписок">
                    <span>Создать базу</span>
                </a>
            `;
        }

        const activeCount = getActiveFollowedCount(db.curators);

        widget.innerHTML = `
            ${newUserButton}
            ${badgeHtml}
            ${undoBtnHtml}
            <span class="btnv6_blue_hoverfade btn_medium" id="sct-btn-view-list" role="button" title="Просмотр и отписка от кураторов">
                <span>Список (${activeCount}/100)</span>
            </span>
            <span class="btnv6_blue_hoverfade btn_medium sct-btn-gear" id="sct-btn-gear" role="button" title="Настройки, экспорт и импорт базы">
                <span><svg class="sct-svg-icon" viewBox="0 0 16 16"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.5.5v1.2l2.5.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.5h1.2l.5-2.5.7-.3 2 1.3.8-.8-1.3-2 .3-.7 2.4-.5V8.6l-2.4-.5-.3-.7 1.3-2-.8-.8-2 1.3-.7-.3zM8 10.5c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z"/></svg></span>
            </span>
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
                    Пользователь: <b>${escapeHtml(db.user)}</b><br>
                    Подписок: <b style="color:#67c1f5;">${activeCount} / 100</b> (всего в базе: ${total})<br>
                    Дата создания БД: <b>${formatDate(db.createdAt)}</b>
                </div>
            `;
        } else {
            statusText = `
                <div style="font-size:11px; color:#f39c12; line-height:1.4; margin-bottom:12px;">
                    <b>Новый пользователь.</b> База кураторов еще не заведена.<br>
                    Нажмите кнопку ниже для автоматического сбора подписок.
                </div>
                <span class="btnv6_blue_hoverfade btn_medium" id="sct-btn-init-scan" role="button" style="width:100%; margin-bottom:8px;">
                    <span style="justify-content:center;">Начать первичный обход кураторки</span>
                </span>
            `;
        }

        panel.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                <h4 style="margin:0; font-size:14px; color:#66c0f4;">Трекер кураторов Steam <span class="sct-version-tag">v${SCRIPT_VERSION}</span></h4>
                <span class="btnv6_blue_hoverfade btn_medium sct-btn-gear" id="sct-panel-gear" role="button" title="Настройки и база">
                    <span><svg class="sct-svg-icon" viewBox="0 0 16 16"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.5.5v1.2l2.5.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.5h1.2l.5-2.5.7-.3 2 1.3.8-.8-1.3-2 .3-.7 2.4-.5V8.6l-2.4-.5-.3-.7 1.3-2-.8-.8-2 1.3-.7-.3zM8 10.5c-1.4 0-2.5-1.1-2.5-2.5s1.1-2.5 2.5-2.5 2.5 1.1 2.5 2.5-1.1 2.5-2.5 2.5z"/></svg></span>
                </span>
            </div>
            ${statusText}
            <div style="display:flex; gap:6px;">
                <span class="btnv6_blue_hoverfade btn_medium" id="sct-btn-panel-view" role="button" style="flex:1;">
                    <span style="justify-content:center;">Список (${activeCount}/100)</span>
                </span>
                <span class="btnv6_white_transparent btn_medium" id="sct-btn-go-back" role="button" title="Назад">
                    <span>Назад</span>
                </span>
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

                recordFollowAction(clanId, isFollow, curatorInfo, userInfo);
                setTimeout(() => {
                    updateCuratorPageUI();
                }, 350);
            }
        }, true);

        // 2. Хук на нативную функцию Steam FollowCurator
        if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.FollowCurator === 'function') {
            const originalFollowCurator = unsafeWindow.FollowCurator;
            unsafeWindow.FollowCurator = function(clanid, bFollow) {
                try {
                    const curatorInfo = getCuratorInfo();
                    const userInfo = getUserInfo();
                    recordFollowAction(String(clanid), Boolean(bFollow), curatorInfo, userInfo);
                    setTimeout(() => {
                        updateCuratorPageUI();
                    }, 350);
                } catch (err) {
                    console.error('[CuratorTracker] Ошибка хука FollowCurator:', err);
                }
                return originalFollowCurator.apply(this, arguments);
            };
        }

        // 3. Периодический мониторинг изменений DOM и первичная отрисовка
        setInterval(() => {
            if (isCuratorOrCreatorPage()) {
                updateCuratorPageUI();
            } else if (window.location.pathname.startsWith('/curators/mycurators')) {
                renderMyCuratorsPanel();
            }
        }, 1000);
    }

    initTracker();
})();
