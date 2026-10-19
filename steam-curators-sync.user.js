// ==UserScript==
// @name         Steam Curators Sync & Compare
// @namespace    https://github.com/BasimovIF-AI/userscript-steam-curator
// @version      1.0.0
// @description  Экспорт списка кураторов Steam в JSON, сохранение локальной базы и сравнение со сторонней базой
// @author       Senior Software Engineer
// @match        *://store.steampowered.com/curators/mycurators*
// @match        *://store.steampowered.com/curators/*
// @match        *://store.steampowered.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'steam_curators_local_db_v1';
    const WIDGET_ID = 'steam-curators-sync-widget';
    const MODAL_ID = 'steam-curators-compare-modal';

    // -------------------------------------------------------------
    // Хранилище (Storage Engine: GM_* с fallback на localStorage)
    // -------------------------------------------------------------
    const storage = {
        get(key, def = null) {
            try {
                if (typeof GM_getValue !== 'undefined') return GM_getValue(key, def);
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : def;
            } catch (e) {
                console.error('[CuratorSync] Ошибка чтения хранилища:', e);
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
                console.error('[CuratorSync] Ошибка записи в хранилище:', e);
            }
        }
    };

    // -------------------------------------------------------------
    // Утилиты
    // -------------------------------------------------------------
    function isCuratorsPage() {
        return window.location.pathname.startsWith('/curators/mycurators');
    }

    function getCurrentUserName() {
        const nameEl = document.querySelector('#account_pulldown') ||
                       document.querySelector('#global_action_menu .user_avatar') ||
                       document.querySelector('.persona');
        return nameEl?.textContent?.trim() || nameEl?.title?.trim() || 'SteamUser';
    }

    function extractCuratorId(link) {
        if (!link) return `curator_${Math.random().toString(36).substr(2, 9)}`;
        const match = link.match(/\/curator\/(\d+)/);
        return match ? match[1] : link.replace(/https?:\/\/[^/]+\/curator\//, '').replace(/\/$/, '');
    }

    function formatDate(isoStr) {
        if (!isoStr) return 'Неизвестно';
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

    function downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function selectJSONFile(callback, errCallback) {
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
                    callback(parsed);
                } catch (err) {
                    errCallback?.(err.message || 'Ошибка чтения JSON');
                }
            };
            reader.readAsText(file);
        };
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
    }

    // -------------------------------------------------------------
    // Core Engine: Сбор кураторов с автоскроллом
    // -------------------------------------------------------------
    async function autoScroll(progressCb) {
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

    function parseCurators() {
        const curatorsMap = new Map();
        const cards = document.querySelectorAll('.curator_page.followed');

        cards.forEach(card => {
            try {
                const nameEl = card.querySelector('.profile .info .name') || card.querySelector('.curator_name a');
                const subsEl = card.querySelector('.followers span') || card.querySelector('.num_followers');
                const linkEl = card.querySelector('a.profile_avatar') || card.querySelector('.profile .info .name a');

                const rawName = nameEl?.textContent || 'Unknown';
                const name = rawName.replace(/^Недавние обзоры от\s*/i, '').trim();
                const subs = parseInt(subsEl?.textContent.replace(/\D/g, '') || '0', 10);
                const link = linkEl?.href || '';
                const id = extractCuratorId(link);

                if (id && !curatorsMap.has(id)) {
                    curatorsMap.set(id, { id, name, subs, link });
                }
            } catch (e) {
                console.warn('[CuratorSync] Ошибка парсинга карточки:', e);
            }
        });

        return Array.from(curatorsMap.values());
    }

    async function scanAndSave(btnEl) {
        const originalText = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = '⏳ <span>Скроллинг...</span>';

        try {
            await autoScroll((text) => {
                btnEl.innerHTML = `⏳ <span>${text}</span>`;
            });

            btnEl.innerHTML = '⚙️ <span>Сохранение...</span>';
            const curators = parseCurators();
            const user = getCurrentUserName();
            const payload = {
                version: 1,
                user,
                updatedAt: new Date().toISOString(),
                total: curators.length,
                curators
            };

            storage.set(STORAGE_KEY, payload);
            updateWidgetStatus();
            alert(`✅ База успешно обновлена!\nПользователь: ${user}\nКураторов сохранено: ${curators.length}`);
        } catch (err) {
            console.error('[CuratorSync] Ошибка сканирования:', err);
            alert(`❌ Ошибка сканирования: ${err.message}`);
        } finally {
            btnEl.disabled = false;
            btnEl.innerHTML = originalText;
        }
    }

    // -------------------------------------------------------------
    // Comparator Engine: Сравнение баз
    // -------------------------------------------------------------
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

    // -------------------------------------------------------------
    // Стили интерфейса (Steam Native Dark Theme)
    // -------------------------------------------------------------
    function injectStyles() {
        if (document.getElementById('steam-curators-sync-styles')) return;

        const css = `
            #${WIDGET_ID} {
                position: fixed;
                top: 110px;
                right: 20px;
                z-index: 999999;
                background: linear-gradient(135deg, #171d25 0%, #1e2837 100%);
                border: 1px solid #2a475e;
                border-radius: 8px;
                padding: 14px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #c6d4df;
                font-size: 13px;
                width: 250px;
                backdrop-filter: blur(8px);
                transition: transform 0.2s ease, opacity 0.2s ease;
            }
            #${WIDGET_ID} .widget-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                font-weight: bold;
                color: #66c0f4;
                margin-bottom: 10px;
                font-size: 14px;
            }
            #${WIDGET_ID} .status-box {
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid #233344;
                border-radius: 6px;
                padding: 8px;
                margin-bottom: 12px;
                font-size: 11px;
                line-height: 1.4;
            }
            #${WIDGET_ID} .status-box b {
                color: #fff;
            }
            #${WIDGET_ID} .btn-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            #${WIDGET_ID} button, .cs-btn {
                background: #2a3f5a;
                color: #e1e7ee;
                border: 1px solid #3d5a80;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: background 0.15s, border-color 0.15s, transform 0.1s;
            }
            #${WIDGET_ID} button:hover, .cs-btn:hover {
                background: #3b587d;
                border-color: #66c0f4;
            }
            #${WIDGET_ID} button:active, .cs-btn:active {
                transform: scale(0.98);
            }
            #${WIDGET_ID} button:disabled, .cs-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            #${WIDGET_ID} .btn-primary {
                background: linear-gradient(90deg, #1976d2 0%, #1565c0 100%);
                border-color: #42a5f5;
                color: #fff;
            }
            #${WIDGET_ID} .btn-primary:hover {
                background: linear-gradient(90deg, #2196f3 0%, #1976d2 100%);
            }

            /* Модальное окно сравнения */
            #${MODAL_ID} {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(4px);
                z-index: 1000000;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: "Motiva Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #c6d4df;
            }
            #${MODAL_ID} .modal-card {
                background: #171d25;
                border: 1px solid #2a475e;
                border-radius: 10px;
                width: 900px;
                max-width: 95vw;
                height: 85vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8);
                overflow: hidden;
            }
            #${MODAL_ID} .modal-header {
                padding: 16px 20px;
                background: #1b2838;
                border-bottom: 1px solid #2a475e;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            #${MODAL_ID} .modal-header h3 {
                margin: 0;
                font-size: 17px;
                color: #66c0f4;
            }
            #${MODAL_ID} .close-btn {
                background: transparent;
                border: none;
                color: #899bb0;
                font-size: 22px;
                cursor: pointer;
                line-height: 1;
                padding: 4px 8px;
            }
            #${MODAL_ID} .close-btn:hover {
                color: #fff;
            }
            #${MODAL_ID} .compare-info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                padding: 14px 20px;
                background: #121820;
                border-bottom: 1px solid #233344;
            }
            #${MODAL_ID} .user-card {
                background: #1b2634;
                border: 1px solid #2a4258;
                border-radius: 6px;
                padding: 10px 14px;
                font-size: 12px;
            }
            #${MODAL_ID} .user-card b {
                color: #66c0f4;
                font-size: 13px;
            }
            #${MODAL_ID} .filter-toolbar {
                padding: 10px 20px;
                background: #16202c;
                border-bottom: 1px solid #233344;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 12px;
            }
            #${MODAL_ID} .toggle-container {
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                user-select: none;
                font-size: 13px;
                font-weight: 500;
                color: #e1e7ee;
            }
            #${MODAL_ID} .toggle-container input {
                cursor: pointer;
                width: 16px;
                height: 16px;
                accent-color: #66c0f4;
            }
            #${MODAL_ID} .search-input {
                background: #0d1217;
                border: 1px solid #2a475e;
                border-radius: 4px;
                color: #fff;
                padding: 6px 12px;
                font-size: 12px;
                outline: none;
                width: 200px;
            }
            #${MODAL_ID} .search-input:focus {
                border-color: #66c0f4;
            }
            #${MODAL_ID} .stats-badges {
                display: flex;
                gap: 8px;
                font-size: 11px;
            }
            #${MODAL_ID} .stat-badge {
                padding: 4px 8px;
                border-radius: 4px;
                font-weight: bold;
            }
            .badge-common {
                background: rgba(46, 204, 113, 0.15);
                color: #2ecc71;
                border: 1px solid rgba(46, 204, 113, 0.3);
            }
            .badge-only-me {
                background: rgba(102, 192, 244, 0.15);
                color: #66c0f4;
                border: 1px solid rgba(102, 192, 244, 0.3);
            }
            .badge-only-other {
                background: rgba(230, 126, 34, 0.15);
                color: #e67e22;
                border: 1px solid rgba(230, 126, 34, 0.3);
            }
            #${MODAL_ID} .modal-table-container {
                flex: 1;
                overflow-y: auto;
                padding: 10px 20px;
            }
            #${MODAL_ID} table {
                width: 100%;
                border-collapse: collapse;
                font-size: 12px;
            }
            #${MODAL_ID} th {
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
            #${MODAL_ID} td {
                padding: 8px;
                border-bottom: 1px solid #212c3b;
            }
            #${MODAL_ID} tr:hover td {
                background: rgba(255, 255, 255, 0.03);
            }
            #${MODAL_ID} .curator-link {
                color: #66c0f4;
                text-decoration: none;
                font-weight: 500;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            #${MODAL_ID} .curator-link:hover {
                text-decoration: underline;
                color: #a4d007;
            }
        `;

        const style = document.createElement('style');
        style.id = 'steam-curators-sync-styles';
        style.textContent = css;
        document.head.appendChild(style);
    }

    // -------------------------------------------------------------
    // UI: Панель управления (Widget)
    // -------------------------------------------------------------
    function updateWidgetStatus() {
        const widget = document.getElementById(WIDGET_ID);
        if (!widget) return;
        const statusBox = widget.querySelector('.status-box');
        if (!statusBox) return;

        const db = storage.get(STORAGE_KEY);
        if (!db) {
            statusBox.innerHTML = '⚠️ Локальная база не сохранена.<br>Нажмите <b>«Собрать и сохранить»</b>.';
            return;
        }

        statusBox.innerHTML = `
            👤 Пользователь: <b>${db.user}</b><br>
            📦 Кураторов: <b>${db.total || db.curators?.length || 0}</b><br>
            📅 Обновлено: <b>${formatDate(db.updatedAt)}</b>
        `;
    }

    function renderWidget() {
        if (!isCuratorsPage()) {
            const old = document.getElementById(WIDGET_ID);
            if (old) old.remove();
            return;
        }

        if (document.getElementById(WIDGET_ID)) return;

        injectStyles();

        const widget = document.createElement('div');
        widget.id = WIDGET_ID;
        widget.innerHTML = `
            <div class="widget-header">
                <span>🛡️ Steam Curators Sync</span>
            </div>
            <div class="status-box">Загрузка данных...</div>
            <div class="btn-group">
                <button class="btn-primary" id="cs-btn-scan">🔄 Собрать и сохранить базу</button>
                <button id="cs-btn-export">💾 Экспорт в JSON</button>
                <button id="cs-btn-compare">⚖️ Сравнить с базой JSON</button>
            </div>
        `;

        document.body.appendChild(widget);

        widget.querySelector('#cs-btn-scan').onclick = function() {
            scanAndSave(this);
        };

        widget.querySelector('#cs-btn-export').onclick = () => {
            const db = storage.get(STORAGE_KEY);
            if (!db || !db.curators?.length) {
                alert('База пуста! Сначала соберите список кураторов нажав «Собрать и сохранить базу».');
                return;
            }
            const dateStr = new Date().toISOString().slice(0, 10);
            const filename = `steam_curators_${db.user || 'me'}_${dateStr}.json`;
            downloadJSON(db, filename);
        };

        widget.querySelector('#cs-btn-compare').onclick = () => {
            const localBase = storage.get(STORAGE_KEY);
            if (!localBase || !localBase.curators?.length) {
                alert('У вас нет сохраненной локальной базы. Пожалуйста, сначала выполните «Собрать и сохранить базу».');
                return;
            }

            selectJSONFile(
                (remoteBase) => {
                    renderCompareModal(localBase, remoteBase);
                },
                (errMsg) => {
                    alert(`Ошибка при загрузке JSON файла: ${errMsg}`);
                }
            );
        };

        updateWidgetStatus();
    }

    // -------------------------------------------------------------
    // UI: Модальное окно сравнения (Compare Modal)
    // -------------------------------------------------------------
    function renderCompareModal(baseA, baseB) {
        const oldModal = document.getElementById(MODAL_ID);
        if (oldModal) oldModal.remove();

        const diffRows = compareBases(baseA, baseB);

        const countOnlyMe = diffRows.filter(r => r.status === 'only_me').length;
        const countOnlyOther = diffRows.filter(r => r.status === 'only_other').length;
        const countCommon = diffRows.filter(r => r.status === 'common').length;

        const modal = document.createElement('div');
        modal.id = MODAL_ID;

        modal.innerHTML = `
            <div class="modal-card">
                <div class="modal-header">
                    <h3>⚖️ Сравнение баз кураторов Steam</h3>
                    <button class="close-btn" id="cs-modal-close" title="Закрыть">&times;</button>
                </div>

                <div class="compare-info-grid">
                    <div class="user-card">
                        <b>👤 Вы: ${baseA.user || 'Мой аккаунт'}</b><br>
                        📦 Кураторов: <b>${baseA.curators?.length || 0}</b> | 📅 Обновлено: ${formatDate(baseA.updatedAt)}
                    </div>
                    <div class="user-card">
                        <b>👤 Сравнение с: ${baseB.user || 'Внешняя база'}</b><br>
                        📦 Кураторов: <b>${baseB.curators?.length || 0}</b> | 📅 Обновлено: ${formatDate(baseB.updatedAt)}
                    </div>
                </div>

                <div class="filter-toolbar">
                    <label class="toggle-container">
                        <input type="checkbox" id="cs-toggle-diff-only">
                        <span>Показать только отличающиеся (${countOnlyMe + countOnlyOther})</span>
                    </label>

                    <div class="stats-badges">
                        <span class="stat-badge badge-only-me">Только у вас: ${countOnlyMe}</span>
                        <span class="stat-badge badge-only-other">Только у собеседника: ${countOnlyOther}</span>
                        <span class="stat-badge badge-common">Общие: ${countCommon}</span>
                    </div>

                    <input type="text" class="search-input" id="cs-search-input" placeholder="Поиск по имени...">
                </div>

                <div class="modal-table-container">
                    <table id="cs-compare-table">
                        <thead>
                            <tr>
                                <th style="width: 170px;">Статус</th>
                                <th>Куратор (Ссылка на профиль)</th>
                                <th style="width: 120px; text-align: right;">Подписчики</th>
                            </tr>
                        </thead>
                        <tbody id="cs-compare-tbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const tbody = modal.querySelector('#cs-compare-tbody');
        const diffOnlyCheckbox = modal.querySelector('#cs-toggle-diff-only');
        const searchInput = modal.querySelector('#cs-search-input');

        function updateRows() {
            const diffOnly = diffOnlyCheckbox.checked;
            const query = searchInput.value.toLowerCase().trim();

            const filtered = diffRows.filter(row => {
                if (diffOnly && !row.isDiff) return false;
                if (query && !row.name.toLowerCase().includes(query)) return false;
                return true;
            });

            if (!filtered.length) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding: 40px; color: #899bb0;">Ничего не найдено по заданным фильтрам.</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(row => {
                let badgeClass = 'badge-common';
                let statusLabel = '🟢 Общий';

                if (row.status === 'only_me') {
                    badgeClass = 'badge-only-me';
                    statusLabel = `🔵 Только у вас`;
                } else if (row.status === 'only_other') {
                    badgeClass = 'badge-only-other';
                    statusLabel = `🟠 Только у ${baseB.user || 'собеседника'}`;
                }

                return `
                    <tr>
                        <td><span class="stat-badge ${badgeClass}">${statusLabel}</span></td>
                        <td>
                            <a href="${row.link}" target="_blank" rel="noopener noreferrer" class="curator-link">
                                ${escapeHtml(row.name)} ↗
                            </a>
                        </td>
                        <td style="text-align: right; color: #899bb0; font-variant-numeric: tabular-nums;">
                            ${row.subs.toLocaleString('ru-RU')}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        diffOnlyCheckbox.onchange = updateRows;
        searchInput.oninput = updateRows;

        const closeModal = () => modal.remove();
        modal.querySelector('#cs-modal-close').onclick = closeModal;
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

        updateRows();
    }

    function escapeHtml(str) {
        return (str || '').replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
        })[m]);
    }

    // Инициализация / отслеживание SPA переходов
    setInterval(renderWidget, 1000);
})();
