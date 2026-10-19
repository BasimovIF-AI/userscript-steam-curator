// ==UserScript==
// @name         Steam Curator Follow Tracker
// @namespace    https://github.com/BasimovIF-AI/userscript-steam-curator
// @version      2.0.0
// @description  Отслеживание подписок/отписок на кураторов Steam, учет дат, локальная база по steam_id и экспорт с сортировкой по дате
// @author       Senior Software Engineer
// @match        *://store.steampowered.com/curator/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const WIDGET_ID = 'steam-curator-tracker-panel';
    const STYLES_ID = 'steam-curator-tracker-styles';

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

    function formatDate(isoStr) {
        if (!isoStr) return null;
        try {
            const d = new Date(isoStr);
            return isNaN(d.getTime()) ? isoStr : d.toLocaleString('ru-RU', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (_) {
            return isoStr;
        }
    }

    function getStorageKey(steamId) {
        return `steam_curators_tracker_db_${steamId || 'default'}`;
    }

    function loadDatabase(steamId, userName) {
        const key = getStorageKey(steamId);
        const db = storage.get(key, null);
        if (db && typeof db === 'object') {
            if (userName && db.user !== userName) db.user = userName;
            return db;
        }
        return {
            version: 1,
            user: userName || 'SteamUser',
            steamId: steamId || 'anonymous',
            updatedAt: new Date().toISOString(),
            curators: {}
        };
    }

    function saveDatabase(db) {
        db.updatedAt = new Date().toISOString();
        storage.set(getStorageKey(db.steamId), db);
    }

    // -------------------------------------------------------------------------
    // Core Engine: Логика обновления состояний и сортировки
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
            unfollowedAt: null
        };

        const now = new Date().toISOString();
        if (isFollow) {
            existing.status = 'followed';
            existing.followedAt = now;
            existing.unfollowedAt = null;
        } else {
            existing.status = 'unfollowed';
            existing.unfollowedAt = now;
        }
        existing.name = curatorInfo.name || existing.name;
        existing.link = curatorInfo.link || existing.link;

        db.curators[clanId] = existing;
        saveDatabase(db);
        updateUI();
    }

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

    function exportCuratorsJSON(userInfo) {
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const sortedList = getSortedCurators(db.curators);

        const exportPayload = {
            version: 1,
            user: db.user,
            steamId: db.steamId,
            exportedAt: new Date().toISOString(),
            totalCurators: sortedList.length,
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

    // -------------------------------------------------------------------------
    // Стили (Steam Native Dark Theme)
    // -------------------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById(STYLES_ID)) return;
        const css = `
            #${WIDGET_ID} {
                display: inline-flex;
                flex-direction: column;
                gap: 8px;
                background: linear-gradient(135deg, #171d25 0%, #1e2837 100%);
                border: 1px solid #2a475e;
                border-radius: 6px;
                padding: 10px 14px;
                margin-top: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 12px;
                color: #c6d4df;
                max-width: 480px;
                box-sizing: border-box;
            }
            #${WIDGET_ID} .sct-status-row {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            #${WIDGET_ID} .sct-badge {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 600;
            }
            .sct-badge-followed {
                background: rgba(46, 204, 113, 0.15);
                color: #2ecc71;
                border: 1px solid rgba(46, 204, 113, 0.4);
            }
            .sct-badge-legacy {
                background: rgba(102, 192, 244, 0.15);
                color: #66c0f4;
                border: 1px solid rgba(102, 192, 244, 0.4);
            }
            .sct-badge-unfollowed {
                background: rgba(231, 76, 60, 0.15);
                color: #e74c3c;
                border: 1px solid rgba(231, 76, 60, 0.4);
            }
            .sct-badge-new {
                background: rgba(243, 156, 18, 0.15);
                color: #f39c12;
                border: 1px solid rgba(243, 156, 18, 0.4);
            }
            #${WIDGET_ID} .sct-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                margin-top: 2px;
            }
            #${WIDGET_ID} .sct-btn-download {
                background: #2a3f5a;
                color: #e1e7ee;
                border: 1px solid #3d5a80;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                transition: background 0.15s, border-color 0.15s;
            }
            #${WIDGET_ID} .sct-btn-download:hover {
                background: #3b587d;
                border-color: #66c0f4;
                color: #fff;
            }
            #${WIDGET_ID} .sct-account-info {
                font-size: 11px;
                color: #899bb0;
            }
        `;
        const style = document.createElement('style');
        style.id = STYLES_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // UI: Отображение карточки инфы о кураторе
    // -------------------------------------------------------------------------
    function updateUI() {
        const curatorInfo = getCuratorInfo();
        if (!curatorInfo.clanId) return;

        const userInfo = getUserInfo();
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const record = db.curators[curatorInfo.clanId];
        const currentlyFollowed = isFollowedInDOM(curatorInfo.clanId);

        // Синхронизация при первом открытии: если в Steam пользователь подписан, а в базе записи нет
        if (currentlyFollowed && !record) {
            db.curators[curatorInfo.clanId] = {
                clanId: curatorInfo.clanId,
                name: curatorInfo.name,
                link: curatorInfo.link,
                status: 'followed',
                followedAt: null, // Дата неизвестна (подписка оформлена до начала ведения базы)
                unfollowedAt: null
            };
            saveDatabase(db);
        }

        const currentRecord = db.curators[curatorInfo.clanId];
        let badgeHtml = '';

        if (currentlyFollowed) {
            // 2.2. Если подписан:
            if (currentRecord?.followedAt) {
                const dateText = formatDate(currentRecord.followedAt);
                badgeHtml = `<span class="sct-badge sct-badge-followed">🟢 Подписан: <b>${dateText}</b></span>`;
            } else {
                badgeHtml = `<span class="sct-badge sct-badge-legacy">🟢 Подписан: <b>Дата неизвестна</b> (до начала ведения базы)</span>`;
            }
        } else {
            // 2.1. Если не подписан:
            if (currentRecord?.unfollowedAt) {
                const dateText = formatDate(currentRecord.unfollowedAt);
                badgeHtml = `<span class="sct-badge sct-badge-unfollowed">🔴 Отписан: <b>${dateText}</b></span>`;
            } else {
                badgeHtml = `<span class="sct-badge sct-badge-new">⚪ Новый куратор (ранее не отслеживался)</span>`;
            }
        }

        let widget = document.getElementById(WIDGET_ID);
        if (!widget) {
            const target = document.querySelector('#header_curator_details') ||
                           document.querySelector('.follow_controls') ||
                           document.querySelector('.header_area');
            if (!target) return;

            injectStyles();
            widget = document.createElement('div');
            widget.id = WIDGET_ID;

            if (target.classList.contains('follow_controls')) {
                target.parentNode.insertBefore(widget, target.nextSibling);
            } else {
                target.appendChild(widget);
            }
        }

        const totalTracked = Object.keys(db.curators || {}).length;
        widget.innerHTML = `
            <div class="sct-status-row">
                ${badgeHtml}
            </div>
            <div class="sct-actions">
                <button class="sct-btn-download" id="sct-btn-export">
                    📥 Скачать список кураторов (JSON)
                </button>
                <span class="sct-account-info">
                    База: <b>${escapeHtml(db.user)}</b> (${totalTracked})
                </span>
            </div>
        `;

        const exportBtn = widget.querySelector('#sct-btn-export');
        if (exportBtn) {
            exportBtn.onclick = () => exportCuratorsJSON(userInfo);
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

                // Небольшая задержка, чтобы дать Steam отправить запрос и сменить видимость кнопок
                setTimeout(() => {
                    recordFollowAction(clanId, isFollow, curatorInfo, userInfo);
                }, 300);
            }
        }, true);

        // 2. Хук на нативную функцию Steam FollowCurator (если доступна через unsafeWindow)
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
        setInterval(updateUI, 1000);
    }

    initTracker();
})();
