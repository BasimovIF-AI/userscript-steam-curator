// ==UserScript==
// @name         Steam Curator Follow Tracker
// @namespace    https://github.com/BasimovIF-AI/userscript-steam-curator
// @version      2.2.0
// @description  Отслеживание подписок/отписок на кураторов Steam, учет дат, первичная инициализация, импорт и экспорт базы
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
            unfollowedAt: null,
            isInitial: false
        };

        const now = new Date().toISOString();
        if (isFollow) {
            existing.status = 'followed';
            existing.followedAt = now;
            existing.unfollowedAt = null;
            existing.isInitial = false; // оформлено вручную позже
        } else {
            existing.status = 'unfollowed';
            existing.unfollowedAt = now;
        }
        existing.name = curatorInfo.name || existing.name;
        existing.link = curatorInfo.link || existing.link;

        db.curators[clanId] = existing;
        saveDatabase(db);
        updateCuratorPageUI();
    }

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

    function exportCuratorsJSON(userInfo) {
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const sortedList = getSortedCurators(db.curators);

        const exportPayload = {
            version: 1,
            user: db.user,
            steamId: db.steamId,
            createdAt: db.createdAt || db.updatedAt,
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
                        throw new Error('Файл не содержит корректного массива "curators".');
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
                    alert(`✅ База успешно импортирована!\nПользователь: ${db.user}\nКураторов загружено: ${Object.keys(db.curators).length}\nДата создания базы: ${formatDate(db.createdAt)}`);
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
                max-width: 520px;
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
            .sct-btn {
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
                text-decoration: none;
                transition: background 0.15s, border-color 0.15s;
            }
            .sct-btn:hover {
                background: #3b587d;
                border-color: #66c0f4;
                color: #fff;
            }
            .sct-btn-primary {
                background: linear-gradient(90deg, #1976d2 0%, #1565c0 100%);
                border-color: #42a5f5;
                color: #fff;
            }
            .sct-btn-primary:hover {
                background: linear-gradient(90deg, #2196f3 0%, #1976d2 100%);
            }
            #${WIDGET_ID} .sct-new-user-banner {
                background: rgba(243, 156, 18, 0.12);
                border: 1px solid rgba(243, 156, 18, 0.35);
                border-radius: 6px;
                padding: 8px 12px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 4px;
            }
            #${WIDGET_ID} .sct-account-info {
                font-size: 11px;
                color: #899bb0;
            }

            /* Панель на странице /curators/mycurators */
            #${MYCURATORS_PANEL_ID} {
                position: fixed;
                top: 100px;
                right: 20px;
                z-index: 999999;
                background: linear-gradient(135deg, #171d25 0%, #1e2837 100%);
                border: 1px solid #2a475e;
                border-radius: 8px;
                padding: 16px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #c6d4df;
                font-size: 13px;
                width: 300px;
                backdrop-filter: blur(8px);
            }
            #${MYCURATORS_PANEL_ID} h4 {
                margin: 0 0 10px 0;
                font-size: 14px;
                color: #66c0f4;
            }
            #${MYCURATORS_PANEL_ID} .mycurators-desc {
                font-size: 11px;
                color: #899bb0;
                line-height: 1.4;
                margin-bottom: 12px;
            }
            #${MYCURATORS_PANEL_ID} .mycurators-desc b {
                color: #fff;
            }
        `;
        const style = document.createElement('style');
        style.id = STYLES_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------------------
    // Модуль 1: Страница отдельного куратора (/curator/*)
    // -------------------------------------------------------------------------
    function updateCuratorPageUI() {
        if (!window.location.pathname.startsWith('/curator/')) return;

        const curatorInfo = getCuratorInfo();
        if (!curatorInfo.clanId) return;

        const userInfo = getUserInfo();
        const userHasDb = hasDatabase(userInfo.steamId);
        const db = loadDatabase(userInfo.steamId, userInfo.userName);
        const record = db.curators[curatorInfo.clanId];
        const currentlyFollowed = isFollowedInDOM(curatorInfo.clanId);

        // Синхронизация при первом заходе, если в Steam подписан, но записи еще не было
        if (currentlyFollowed && !record) {
            db.curators[curatorInfo.clanId] = {
                clanId: curatorInfo.clanId,
                name: curatorInfo.name,
                link: curatorInfo.link,
                status: 'followed',
                followedAt: db.createdAt || null,
                unfollowedAt: null,
                isInitial: Boolean(db.createdAt)
            };
            saveDatabase(db);
        }

        const currentRecord = db.curators[curatorInfo.clanId];
        let badgeHtml = '';

        if (currentlyFollowed) {
            if (currentRecord?.followedAt) {
                const dateText = formatDate(currentRecord.followedAt);
                const tag = currentRecord.isInitial ? ' <small style="opacity:0.85;">(создание БД)</small>' : '';
                badgeHtml = `<span class="sct-badge sct-badge-followed">🟢 Подписан: <b>${dateText}</b>${tag}</span>`;
            } else {
                badgeHtml = `<span class="sct-badge sct-badge-legacy">🟢 Подписан: <b>Дата неизвестна</b> (до начала ведения базы)</span>`;
            }
        } else {
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

        let newUserBanner = '';
        if (!userHasDb && userInfo.steamId !== 'anonymous') {
            newUserBanner = `
                <div class="sct-new-user-banner">
                    <span>⚠️ Новый профиль: <b>${escapeHtml(userInfo.userName)}</b>.<br>База кураторов еще не создана.</span>
                    <a href="https://store.steampowered.com/curators/mycurators/?sct_init=1" class="sct-btn sct-btn-primary" style="justify-content:center;">
                        🚀 Создать базу (обход кураторки)
                    </a>
                </div>
            `;
        }

        const totalTracked = Object.keys(db.curators || {}).length;
        widget.innerHTML = `
            ${newUserBanner}
            <div class="sct-status-row">
                ${badgeHtml}
            </div>
            <div class="sct-actions">
                <button class="sct-btn" id="sct-btn-export" title="Скачать базу в JSON">
                    💾 Экспорт
                </button>
                <button class="sct-btn" id="sct-btn-import" title="Загрузить базу из JSON">
                    📥 Импорт
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

        const importBtn = widget.querySelector('#sct-btn-import');
        if (importBtn) {
            importBtn.onclick = () => importCuratorsJSON(userInfo, () => updateCuratorPageUI());
        }
    }

    // -------------------------------------------------------------------------
    // Модуль 2: Обход кураторки и заведение базы (/curators/mycurators)
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

            // Создаем или загружаем существующую базу
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

            // У кураторов из этого первого обхода дата подписки = дата создания БД
            let addedCount = 0;
            for (const item of scraped) {
                if (!db.curators[item.clanId]) {
                    db.curators[item.clanId] = {
                        clanId: item.clanId,
                        name: item.name,
                        link: item.link,
                        status: 'followed',
                        followedAt: createdAt, // Самая ранняя дата — дата создания базы!
                        unfollowedAt: null,
                        isInitial: true
                    };
                    addedCount++;
                } else if (db.curators[item.clanId].status === 'unfollowed') {
                    // Если пользователь снова подписан
                    db.curators[item.clanId].status = 'followed';
                }
            }

            saveDatabase(db);
            alert(`✅ База кураторов успешно создана!\nПользователь: ${userInfo.userName}\nВсего кураторов: ${Object.keys(db.curators).length} (новых добавлено: ${addedCount})\nДата создания базы: ${formatDate(createdAt)}`);
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
        const total = Object.keys(db.curators || {}).length;

        let statusText = '';
        if (userHasDb) {
            statusText = `
                <div class="mycurators-desc">
                    👤 Пользователь: <b>${escapeHtml(db.user)}</b><br>
                    📦 В базе: <b>${total}</b> кураторов<br>
                    📅 Дата создания БД: <b>${formatDate(db.createdAt)}</b>
                </div>
                <button class="sct-btn sct-btn-primary" id="sct-btn-rescan" style="width:100%; justify-content:center; margin-bottom:8px;">
                    🔄 Обновить базу кураторов
                </button>
            `;
        } else {
            statusText = `
                <div class="mycurators-desc">
                    ⚠️ <b>Новый пользователь!</b> База кураторов еще не заведена.<br>
                    Нажмите кнопку ниже, чтобы автоматически пройти по странице ваших подписок и завести базу данных с самой ранней датой.
                </div>
                <button class="sct-btn sct-btn-primary" id="sct-btn-init-scan" style="width:100%; justify-content:center; margin-bottom:8px;">
                    🚀 Начать первичный обход кураторки
                </button>
            `;
        }

        panel.innerHTML = `
            <h4>🛡️ Трекер кураторов Steam</h4>
            ${statusText}
            <div style="display:flex; gap:6px;">
                <button class="sct-btn" id="sct-btn-export-all" style="flex:1; justify-content:center;">
                    💾 Экспорт
                </button>
                <button class="sct-btn" id="sct-btn-import-all" style="flex:1; justify-content:center;">
                    📥 Импорт
                </button>
                <button class="sct-btn" id="sct-btn-go-back" style="flex:1; justify-content:center;">
                    🔙 Назад
                </button>
            </div>
        `;

        const initBtn = panel.querySelector('#sct-btn-init-scan') || panel.querySelector('#sct-btn-rescan');
        if (initBtn) {
            initBtn.onclick = function() {
                executeInitialScan(this);
            };
        }

        panel.querySelector('#sct-btn-export-all').onclick = () => exportCuratorsJSON(userInfo);
        panel.querySelector('#sct-btn-import-all').onclick = () => importCuratorsJSON(userInfo, () => renderMyCuratorsPanel());
        panel.querySelector('#sct-btn-go-back').onclick = () => {
            if (window.history.length > 1) window.history.back();
            else window.location.href = 'https://store.steampowered.com/';
        };

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

                // Небольшая задержка, чтобы дать Steam сменить видимость кнопок
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
