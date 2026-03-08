import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Storage } from './storage.js';

export const UI = {
    injectStyles: () => {
        const style = document.createElement('style');
        style.textContent = `
            .hege-checkbox-container {
                position: absolute; right: -8px; top: 50%; transform: translateY(-50%);
                width: 36px; height: 36px; z-index: 1000;
                display: flex; align-items: center; justify-content: center;
                border-radius: 50%; cursor: pointer; transition: background-color 0.2s;
            }
            .hege-checkbox-container:hover { background-color: rgba(255, 255, 255, 0.1); }
            .hege-svg-icon { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; color: rgb(119, 119, 119); transition: all 0.2s; }
            @media (prefers-color-scheme: dark) { .hege-svg-icon { color: rgb(119, 119, 119); } }
            @media (prefers-color-scheme: light) { .hege-svg-icon { color: rgb(153, 153, 153); } .hege-checkbox-container:hover { background-color: rgba(0, 0, 0, 0.05); } }
            
            .hege-checkbox-container.checked .hege-svg-icon { color: #ff3b30; fill: #ff3b30; stroke: none; transform: scale(1.1); }
            .hege-checkmark { display: none; stroke: white; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
            .hege-checkbox-container.checked .hege-checkmark { display: block; }

            .hege-checkbox-container.finished { opacity: 0.6; }
            .hege-checkbox-container.finished .hege-svg-icon { color: #555; }
            .hege-checkbox-container:active { transform: translateY(-50%) scale(0.9); }
            
            .hege-block-all-btn {
                display: flex; align-items: center; justify-content: center;
                gap: 6px; padding: 6px 12px; margin-left: 12px;
                background-color: rgba(255, 59, 48, 0.1); color: #ff3b30;
                border: 1px solid rgba(255, 59, 48, 0.3); border-radius: 16px;
                font-size: 14px; font-weight: bold; cursor: pointer;
                transition: all 0.2s;
            }
            .hege-block-all-btn:hover { background-color: rgba(255, 59, 48, 0.2); }
            .hege-block-all-btn:active { transform: scale(0.95); }
            .hege-block-all-btn svg { width: 16px; height: 16px; }

            #hege-panel {
                position: fixed; z-index: 2147483647;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                user-select: none;
            }

            #hege-header {
                background: #101010; color: #fff;
                padding: 8px 12px;
                border-radius: 18px;
                border: 1px solid #333;
                font-weight: bold; font-size: 14px;
                cursor: pointer;
                display: flex; align-items: center; justify-content: space-between;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
            }
            #hege-toggle { font-size: 10px; opacity: 0.7; margin-left: 6px; }

            #hege-panel.minimized .hege-content { display: none; }
            
            #hege-panel:not(.minimized) .hege-content {
                 position: absolute; 
                 top: 100%; right: 0;
                 margin-top: 8px; /* Gap */
                 background: #181818; 
                 border: 1px solid #333;
                 border-radius: 16px;
                 width: 240px;
                 box-shadow: 0 4px 20px rgba(0,0,0,0.6);
                 overflow: hidden;
                 display: flex; flex-direction: column;
            }

            .hege-menu-item {
                padding: 14px 16px;
                color: #f5f5f5;
                font-size: 15px;
                font-weight: 500;
                cursor: pointer;
                border-bottom: 1px solid #2a2a2a;
                display: flex; justify-content: space-between; align-items: center;
                transition: background 0.1s;
            }
            .hege-menu-item:hover { background: #222; }
            .hege-menu-item:last-child { border-bottom: none; }
            
            .hege-menu-item.danger { color: #ff3b30; }
            .hege-menu-item .status { font-size: 12px; color: #888; }
            
            #hege-bg-status { padding: 4px 16px; font-size: 11px; color: #4cd964; background: #1a1a1a; display: none; }
            body.hege-ghost-mode div[role="menu"], body.hege-ghost-mode div[role="dialog"] { opacity: 0 !important; pointer-events: auto !important; }
            
            #hege-disclaimer-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 2147483647;
                display: flex; align-items: center; justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            #hege-disclaimer-box {
                background: #181818; border: 1px solid #333; border-radius: 16px;
                padding: 24px; max-width: 85%; width: 400px;
                color: #f5f5f5; text-align: center;
                box-shadow: 0 10px 40px rgba(0,0,0,0.8);
            }
            #hege-disclaimer-title { font-size: 18px; font-weight: bold; margin-bottom: 16px; color: #fff; }
            #hege-disclaimer-text { font-size: 14px; line-height: 1.5; color: #ccc; margin-bottom: 24px; text-align: left; background: #222; padding: 12px; border-radius: 8px; }
            #hege-disclaimer-btn {
                background: #fff; color: #000; border: none; padding: 10px 32px;
                border-radius: 30px; font-size: 15px; font-weight: 600; cursor: pointer;
                transition: transform 0.1s;
            }
            #hege-disclaimer-btn:active { transform: scale(0.95); }

            /* Block Manager Styles */
            .hege-manager-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.85); z-index: 2147483647;
                display: flex; align-items: center; justify-content: center;
                backdrop-filter: blur(8px);
            }
            .hege-manager-box {
                background: #181818; border: 1px solid #333; border-radius: 24px;
                padding: 0; width: 90%; max-width: 500px; max-height: 80vh;
                color: #f5f5f5; display: flex; flex-direction: column;
                box-shadow: 0 20px 60px rgba(0,0,0,0.8); overflow: hidden;
            }
            .hege-manager-header {
                padding: 20px 24px; border-bottom: 1px solid #333;
                display: flex; justify-content: space-between; align-items: center;
            }
            .hege-manager-title { font-size: 18px; font-weight: 700; color: #fff; }
            .hege-manager-close { cursor: pointer; opacity: 0.6; transition: 0.2s; }
            .hege-manager-close:hover { opacity: 1; }
            
            .hege-manager-search {
                padding: 12px 24px; border-bottom: 1px solid #222;
            }
            .hege-manager-search input {
                width: 100%; padding: 10px 16px; border-radius: 12px;
                background: #222; border: 1px solid #333; color: #fff;
                font-size: 14px; outline: none; box-sizing: border-box;
            }
            
            .hege-manager-list {
                flex: 1; overflow-y: auto; padding: 10px 0;
            }
            .hege-manager-item {
                display: flex; align-items: center; padding: 12px 24px;
                transition: background 0.1s; cursor: pointer;
            }
            .hege-manager-item:hover { background: rgba(255,255,255,0.05); }
            .hege-manager-item .user-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
            .hege-manager-item .username { font-weight: 600; font-size: 15px; color: #f5f5f5; }
            .hege-manager-item .time { font-size: 11px; color: #777; }
            
            .hege-manager-footer {
                padding: 16px 24px; border-top: 1px solid #333;
                display: flex; justify-content: space-between; align-items: center;
                background: #1c1c1c;
            }
            .hege-manager-btn {
                padding: 10px 20px; border-radius: 12px; font-weight: 600;
                font-size: 14px; cursor: pointer; transition: 0.2s; border: none;
            }
            .hege-manager-btn.primary { background: #ff3b30; color: #fff; }
            .hege-manager-btn.primary:hover { background: #ff453a; }
            .hege-manager-btn.primary:disabled { background: #555; cursor: not-allowed; opacity: 0.6; }
            .hege-manager-btn.secondary { background: #333; color: #ccc; }
            .hege-manager-btn.secondary:hover { background: #444; }

            .hege-sort-btn {
                display: flex; align-items: center; gap: 4px; padding: 6px 10px;
                background: #222; border: 1px solid #333; border-radius: 8px;
                color: #888; font-size: 12px; cursor: pointer; transition: 0.2s;
            }
            .hege-sort-btn:hover { background: #2a2a2a; color: #fff; }
            .hege-sort-btn.active { color: #ff3b30; border-color: rgba(255,59,48,0.3); }
        `;
        (document.head || document.documentElement).appendChild(style);
    },

    createPanel: (callbacks) => {
        const isMinimized = Storage.get(CONFIG.KEYS.STATE, 'true') === 'true';
        const isMobile = Utils.isMobile();

        const panel = document.createElement('div');
        panel.id = 'hege-panel';
        panel.className = isMinimized ? 'minimized' : '';

        const htmlContent = `
            <div id="hege-header">
                <div>留友封 <span id="hege-queue-badge" style="font-size:12px; color:#4cd964; margin-left:4px;"></span></div>
                <span id="hege-toggle">${isMinimized ? '▼' : '▲'}</span>
            </div>
            <div class="hege-content">
                <div id="hege-bg-status">執行狀態...</div>
                
                <div class="hege-menu-item" id="hege-main-btn-item">
                    <span>開始封鎖</span>
                    <span class="status" id="hege-sel-count">0 選取</span>
                </div>

                <div class="hege-menu-item" id="hege-clear-sel-item">
                    <span>清除選取</span>
                </div>
                
                <div class="hege-menu-item" id="hege-import-item">
                    <span>匯入名單</span>
                </div>

                <div class="hege-menu-item" id="hege-manage-item">
                    <span>管理已封鎖</span>
                    <span class="status" id="hege-history-count">0</span>
                </div>
                
                <div class="hege-menu-item" id="hege-export-item">
                    <span>匯出紀錄</span>
                </div>
                
                <div class="hege-menu-item" id="hege-post-fallback-item">
                    <span>進階封鎖</span>
                    <span class="status" id="hege-post-fallback-status">開</span>
                </div>
                
                <div class="hege-menu-item danger" id="hege-retry-failed-item" style="display:none;">
                    <span>重試失敗清單</span>
                    <span class="status" id="hege-failed-count">0</span>
                </div>
                
                <div class="hege-menu-item" id="hege-report-item" style="display:none;">
                    <span>🐛 回報問題</span>
                </div>

                <div class="hege-menu-item danger" id="hege-clear-db-item">
                    <span>清除所有歷史</span>
                </div>
                
                <div class="hege-menu-item danger" id="hege-stop-btn-item" style="border-top:1px solid #333; display:none;">
                    <span>停止執行</span>
                </div>
            </div>
        `;
        Utils.setHTML(panel, htmlContent);
        document.body.appendChild(panel);

        // Bind Events
        const bindClick = (id, handler) => {
            if (!handler) return;
            const el = document.getElementById(id);
            if (!el) return;
            // The UI panel uses standard click events securely because it floats at the body level
            // away from any <a> tags. Using touchend + preventDefault here breaks iOS window.open permissions.
            el.addEventListener('click', handler);
        };

        document.getElementById('hege-toggle').onclick = () => {
            const min = !panel.classList.contains('minimized');
            panel.classList.toggle('minimized', min);
            Storage.set(CONFIG.KEYS.STATE, min);
            document.getElementById('hege-toggle').textContent = min ? '▼' : '▲';
        };

        bindClick('hege-main-btn-item', callbacks.onMainClick);
        bindClick('hege-clear-sel-item', callbacks.onClearSel);
        bindClick('hege-clear-db-item', callbacks.onClearDB);
        bindClick('hege-import-item', callbacks.onImport);
        bindClick('hege-manage-item', callbacks.onManage);
        bindClick('hege-export-item', callbacks.onExport);
        bindClick('hege-retry-failed-item', callbacks.onRetryFailed);
        bindClick('hege-report-item', callbacks.onReport);
        bindClick('hege-stop-btn-item', callbacks.onStop);

        // Post Fallback toggle
        const pfStatus = document.getElementById('hege-post-fallback-status');
        if (pfStatus) pfStatus.textContent = Storage.get(CONFIG.KEYS.POST_FALLBACK) === 'false' ? '關' : '開';
        bindClick('hege-post-fallback-item', () => {
            const current = Storage.get(CONFIG.KEYS.POST_FALLBACK) !== 'false';
            Storage.set(CONFIG.KEYS.POST_FALLBACK, (!current).toString());
            const el = document.getElementById('hege-post-fallback-status');
            if (el) el.textContent = !current ? '開' : '關';
        });


        // Header click toggles too
        document.getElementById('hege-header').onclick = (e) => {
            if (e.target.id !== 'hege-toggle') document.getElementById('hege-toggle').click();
        };

        // Auto-collapse on outside click
        document.addEventListener('click', (e) => {
            const p = document.getElementById('hege-panel');
            if (p && !p.classList.contains('minimized') && !p.contains(e.target) && !e.target.closest('#hege-panel')) {
                p.classList.add('minimized');
                Storage.set(CONFIG.KEYS.STATE, 'true');
                const t = document.getElementById('hege-toggle');
                if (t) t.textContent = '▼';
            }
        });

        return panel;
    },

    showToast: (msg, duration = 2500) => {
        const exist = document.getElementById('hege-toast');
        if (exist) exist.remove();
        const toast = document.createElement('div');
        toast.id = 'hege-toast'; toast.textContent = msg;
        toast.style.cssText = `
            position: fixed; top: 10%; left: 50%; transform: translateX(-50%);
            background: rgba(0, 180, 0, 0.95); color: white; padding: 12px 24px;
            border-radius: 50px; font-size: 16px; font-weight: bold; z-index: 2147483647;
            box-shadow: 0 5px 20px rgba(0,0,0,0.5); pointer-events: none;
            transition: opacity 0.5s; font-family: system-ui; text-align: center;
        `;
        (document.body || document.documentElement).appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, duration);
    },

    anchorPanel: () => {
        const panel = document.getElementById('hege-panel');
        if (!panel) return;

        // Optimization: Try to find anchor in a more restricted scope first
        let anchor = null;
        const navSelectors = ['div[role="navigation"]', 'header', 'nav', 'div[style*="position: fixed"]'];

        for (const selector of navSelectors) {
            const container = document.querySelector(selector);
            if (!container) continue;

            const svgs = container.querySelectorAll('svg');
            for (let svg of svgs) {
                const label = (svg.getAttribute('aria-label') || '').trim();
                if (label === '功能表' || label === 'Menu' || label === 'Settings' || label === '設定' || label === '更多選項') {
                    anchor = svg.closest('div[role="button"]') || svg;
                    break;
                }
                const rects = svg.querySelectorAll('rect, line');
                if (rects.length === 2 && svg.getBoundingClientRect().top < 100) {
                    anchor = svg.closest('div[role="button"]') || svg;
                    break;
                }
            }
            if (anchor) break;
        }

        // Fallback to broader search only if needed and not recently checked
        if (!anchor) {
            const svgs = document.querySelectorAll('svg');
            for (let svg of svgs) {
                const label = (svg.getAttribute('aria-label') || '').trim();
                if (label === '功能表' || label === 'Menu' || label === 'Settings' || label === '設定' || label === '更多選項') {
                    anchor = svg.closest('div[role="button"]') || svg;
                    break;
                }
            }
        }

        if (anchor) {
            const rect = anchor.getBoundingClientRect();
            // Visibility Check: Ensure the anchor is actually visible
            if (rect.width > 0 && rect.height > 0 && rect.top >= 0) {
                panel.style.top = (rect.top) + 'px';
                let rightVal = window.innerWidth - rect.left + 5;
                rightVal = rightVal - 3;
                if (window.innerWidth < 450) {
                    if (rightVal < 0) rightVal = 0;
                    if (rightVal > window.innerWidth - 100) rightVal = 10;
                }
                panel.style.right = rightVal + 'px';
                panel.style.left = 'auto';
                if (CONFIG.DEBUG_MODE) console.log(`[留友封] Menu Anchored at ${rect.top}px`);
            }
        } else {
            // console.log('[留友封] No Anchor Found - Using Fallback Position');
            // Force visible on top
            if (!panel.style.top || parseInt(panel.style.top) > 200 || parseInt(panel.style.top) < 50) {
                panel.style.top = '85px';
                panel.style.right = '16px';
                panel.style.left = 'auto';
                panel.style.zIndex = '1000000';
                panel.style.display = 'block';

                // Visual Debugging: Force dimensions and color
                panel.style.minWidth = '50px';
                panel.style.minHeight = '20px';
                // panel.style.border = '2px solid red'; // Uncomment if needed, but 'Test' text below is better

                // Content Check
                if (panel.innerHTML.trim().length === 0) {
                    console.error('[留友封] Panel is empty! Re-injecting...');
                    panel.textContent = 'Err: Empty Panel';
                    panel.style.background = 'red';
                    panel.style.color = 'white';
                    panel.style.padding = '10px';
                }
            }
        }
    },

    showDisclaimer: (onConfirm) => {
        if (document.getElementById('hege-disclaimer-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'hege-disclaimer-overlay';
        overlay.innerHTML = `
            <div id="hege-disclaimer-box">
                <div id="hege-disclaimer-title">使用前說明</div>
                <div id="hege-disclaimer-text">
                    本擴充功能「留友封」僅供輔助過濾資訊，請依個人使用習慣斟酌，若因社群平台政策更動導致失效或異常，開發者不負相關責任。
                </div>
                <button id="hege-disclaimer-btn">我同意並繼續</button>
            </div>
        `;
        (document.body || document.documentElement).appendChild(overlay);

        document.getElementById('hege-disclaimer-btn').onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };
    },

    showBlockManager: (blockedList, timestamps, onUnblock) => {
        if (document.querySelector('.hege-manager-overlay')) return;

        const overlay = document.createElement('div');
        overlay.className = 'hege-manager-overlay';

        // Sort Modes: 0: Time Desc, 1: Time Asc, 2: Position Desc, 3: Position Asc
        let sortMode = 0;
        let users = [...blockedList];

        const sortUsers = () => {
            if (sortMode === 0) { // Time Desc
                users = [...blockedList].sort((a, b) => (timestamps[b] || 0) - (timestamps[a] || 0));
            } else if (sortMode === 1) { // Time Asc
                users = [...blockedList].sort((a, b) => (timestamps[a] || 0) - (timestamps[b] || 0));
            } else if (sortMode === 2) { // Position Desc (Newest at end of array)
                users = [...blockedList].reverse();
            } else if (sortMode === 3) { // Position Asc (Oldest at start of array)
                users = [...blockedList];
            }
        };

        sortUsers();
        let selected = new Set();
        let lastSelectedIndex = -1;

        const renderList = (filter = '') => {
            const filtered = users.filter(u => u.toLowerCase().includes(filter.toLowerCase()));
            const listEl = overlay.querySelector('.hege-manager-list');
            if (!listEl) return;

            if (filtered.length === 0) {
                listEl.innerHTML = '<div style="padding: 40px; text-align: center; color: #555;">無符合結果</div>';
                return;
            }

            listEl.innerHTML = filtered.map(u => {
                const time = timestamps[u] ? new Date(timestamps[u]).toLocaleString() : '無記錄時間';
                const isSelected = selected.has(u);
                return `
                    <div class="hege-manager-item" data-username="${u}">
                        <div style="margin-right: 16px;">
                            <div class="hege-checkbox-container ${isSelected ? 'checked' : ''}" style="position:static; transform:none; width:24px; height:24px;">
                                <svg viewBox="0 0 24 24" class="hege-svg-icon" style="width:18px; height:18px;">
                                    <rect x="2" y="2" width="20" height="20" rx="6" ry="6" stroke="currentColor" stroke-width="2.5" fill="none"></rect>
                                    <path class="hege-checkmark" d="M6 12 l4 4 l8 -8" fill="none" style="display: ${isSelected ? 'block' : 'none'}"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="user-info">
                            <span class="username">@${u}</span>
                            <span class="time">${time}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Bind item clicks
            const items = listEl.querySelectorAll('.hege-manager-item');
            items.forEach((item, index) => {
                item.onclick = (e) => {
                    const u = item.dataset.username;

                    if (e.shiftKey && lastSelectedIndex !== -1) {
                        const start = Math.min(index, lastSelectedIndex);
                        const end = Math.max(index, lastSelectedIndex);
                        const shouldSelect = !selected.has(u); // Based on the current item

                        for (let i = start; i <= end; i++) {
                            const targetU = items[i].dataset.username;
                            if (shouldSelect) selected.add(targetU);
                            else selected.delete(targetU);
                        }
                    } else {
                        if (selected.has(u)) selected.delete(u);
                        else selected.add(u);
                    }

                    lastSelectedIndex = index;

                    // Refresh UI states for all items in the current view
                    items.forEach(el => {
                        const username = el.dataset.username;
                        const cb = el.querySelector('.hege-checkbox-container');
                        const check = el.querySelector('.hege-checkmark');
                        const isSel = selected.has(username);
                        cb.classList.toggle('checked', isSel);
                        check.style.display = isSel ? 'block' : 'none';
                    });

                    updateFooter();
                };
            });
        };

        const updateFooter = () => {
            const btn = overlay.querySelector('#hege-unblock-confirm');
            const count = overlay.querySelector('#hege-selected-count');
            if (btn) btn.disabled = selected.size === 0;
            if (count) count.textContent = `已選取 ${selected.size} 筆`;
        };

        overlay.innerHTML = `
            <div class="hege-manager-box">
                <div class="hege-manager-header">
                    <span class="hege-manager-title">管理已封鎖名單</span>
                    <span class="hege-manager-close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </span>
                </div>
                <div class="hege-manager-search" style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" placeholder="搜尋使用者名稱..." id="hege-manager-search-input" style="flex: 1;">
                    <button class="hege-sort-btn active" id="hege-manager-sort">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M6 12h12m-9 6h6"></path></svg>
                        <span>新→舊</span>
                    </button>
                </div>
                <div class="hege-manager-list"></div>
                <div class="hege-manager-footer">
                    <span id="hege-selected-count" style="font-size: 13px; color: #888;">已選取 0 筆</span>
                    <div style="display: flex; gap: 12px;">
                        <button class="hege-manager-btn secondary" id="hege-manager-cancel">取消</button>
                        <button class="hege-manager-btn primary" id="hege-unblock-confirm" disabled>解除封鎖</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        renderList();

        const searchInput = overlay.querySelector('#hege-manager-search-input');
        searchInput.oninput = (e) => renderList(e.target.value);

        const sortBtn = overlay.querySelector('#hege-manager-sort');
        sortBtn.onclick = () => {
            sortMode = (sortMode + 1) % 4;
            const labels = ['時間 (新→舊)', '時間 (舊→新)', '序號 (新→舊)', '序號 (舊→新)'];
            sortBtn.querySelector('span').textContent = labels[sortMode];
            sortUsers();
            renderList(searchInput.value);
        };

        overlay.querySelector('.hege-manager-close').onclick = () => overlay.remove();
        overlay.querySelector('#hege-manager-cancel').onclick = () => overlay.remove();

        overlay.querySelector('#hege-unblock-confirm').onclick = () => {
            const toUnblock = Array.from(selected);
            if (confirm(`確定要對這 ${toUnblock.length} 位使用者解除封鎖嗎？\n\n這將會開啟背景視窗模擬點擊解除封鎖。`)) {
                overlay.remove();
                onUnblock(toUnblock);
            }
        };
    }
};
