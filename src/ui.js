import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Storage } from './storage.js';

export const UI = {
    injectStyles: () => {
        const style = document.createElement('style');
        style.textContent = `
            .hege-checkbox-container {
                width: 36px; height: 36px; min-width: 36px;
                z-index: 1000;
                display: flex; align-items: center; justify-content: center;
                border-radius: 50%; cursor: pointer; transition: background-color 0.2s;
                box-sizing: border-box;
            }
            .hege-checkbox-container:hover { background-color: rgba(255, 255, 255, 0.1); }
            .hege-svg-icon { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; color: rgb(119, 119, 119); transition: all 0.2s; }
            @media (prefers-color-scheme: dark) { .hege-svg-icon { color: rgb(119, 119, 119); } }
            @media (prefers-color-scheme: light) { .hege-svg-icon { color: rgb(153, 153, 153); } .hege-checkbox-container:hover { background-color: rgba(0, 0, 0, 0.05); } }

            .hege-checkbox-container.checked .hege-svg-icon { color: #ff3b30; fill: #ff3b30; stroke: none; }
            .hege-checkmark { display: none; stroke: white; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
            .hege-checkbox-container.checked .hege-checkmark { display: block; }

            .hege-checkbox-container.finished { opacity: 0.6; }
            .hege-checkbox-container.finished .hege-svg-icon { color: #555; }
            .hege-checkbox-container:active { transform: scale(0.85); }
            
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

                <div class="hege-menu-item" id="hege-speed-item">
                    <span>速度模式</span>
                    <span class="status" id="hege-speed-status">🧠 智慧</span>
                </div>

                <div class="hege-menu-item danger" id="hege-retry-failed-item" style="display:none;">
                    <span>重試失敗清單</span>
                    <span class="status" id="hege-failed-count">0</span>
                </div>

                <div class="hege-menu-item" id="hege-settings-item">
                    <span style="display:flex; align-items:center; gap:6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        設定
                    </span>
                </div>

                <div class="hege-menu-item" id="hege-report-item">
                    <span style="display:flex; align-items:center; gap:6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"></path></svg>
                        回報問題
                    </span>
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
        bindClick('hege-retry-failed-item', callbacks.onRetryFailed);
        bindClick('hege-report-item', callbacks.onReport);
        bindClick('hege-stop-btn-item', callbacks.onStop);
        bindClick('hege-settings-item', callbacks.onSettings);

        // Speed mode toggle (in main panel)
        const speedModes = ['smart', 'stable', 'standard', 'turbo'];
        const speedLabels = { smart: '🧠 智慧', stable: '🛡️ 穩定', standard: '⚡ 標準', turbo: '🚀 加速' };
        const currentSpeed = Storage.get(CONFIG.KEYS.SPEED_MODE) || 'smart';
        const speedStatus = document.getElementById('hege-speed-status');
        if (speedStatus) speedStatus.textContent = speedLabels[currentSpeed] || speedLabels.smart;

        bindClick('hege-speed-item', () => {
            const cur = Storage.get(CONFIG.KEYS.SPEED_MODE) || 'smart';
            const idx = speedModes.indexOf(cur);
            const next = speedModes[(idx + 1) % speedModes.length];
            const profile = CONFIG.SPEED_PROFILES[next];

            const applySpeed = () => {
                Storage.set(CONFIG.KEYS.SPEED_MODE, next);
                const el = document.getElementById('hege-speed-status');
                if (el) el.textContent = speedLabels[next];
                UI.showToast(`速度模式：${profile.label}`);
            };

            if (profile.warnOnSelect && !Storage.get(CONFIG.KEYS.TURBO_WARNED)) {
                UI.showConfirm(
                    '⚠️ 加速模式會大幅縮短操作間隔\n\n可能導致 Meta 暫時限制您的帳號操作。\n建議僅在少量封鎖時使用。\n\n確定要切換嗎？',
                    () => {
                        Storage.set(CONFIG.KEYS.TURBO_WARNED, 'true');
                        applySpeed();
                    }
                );
            } else {
                applySpeed();
            }
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

    showConfirm: (message, onConfirm, onCancel) => {
        const existing = document.getElementById('hege-confirm-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'hege-confirm-overlay';
        overlay.className = 'hege-manager-overlay';

        const safeMsg = Utils.escapeHTML(message).replace(/\n/g, '<br>');
        overlay.innerHTML = `
            <div class="hege-manager-box" style="max-width:420px;">
                <div class="hege-manager-header">
                    <span class="hege-manager-title">⚠️ 確認</span>
                </div>
                <div style="padding:20px;font-size:14px;line-height:1.7;color:#ccc;">${safeMsg}</div>
                <div class="hege-manager-footer">
                    <div style="display:flex;gap:12px;width:100%;justify-content:flex-end;">
                        <button class="hege-manager-btn secondary" id="hege-confirm-cancel">取消</button>
                        <button class="hege-manager-btn primary" id="hege-confirm-ok">確認繼續</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#hege-confirm-cancel').onclick = () => {
            overlay.remove();
            if (onCancel) onCancel();
        };
        overlay.querySelector('#hege-confirm-ok').onclick = () => {
            overlay.remove();
            if (onConfirm) onConfirm();
        };
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

    showBugReportModal: (onSubmit) => {
        if (document.getElementById('hege-report-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'hege-report-overlay';
        overlay.className = 'hege-manager-overlay';

        overlay.innerHTML = `
            <div class="hege-manager-box">
                <div class="hege-manager-header">
                    <span class="hege-manager-title" style="display:flex; align-items:center; gap:6px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"></path></svg>
                        回報問題
                    </span>
                    <span class="hege-manager-close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </span>
                </div>
                <div style="padding: 20px;">
                    <p style="margin-bottom: 12px; color: #666; font-size: 12px;">版本 ${CONFIG.VERSION}</p>
                    <p style="margin-bottom: 8px; color: #ccc;">問題描述：</p>
                    <textarea id="hege-report-msg" rows="4" style="width: 100%; box-sizing: border-box; background: #222; border: 1px solid #444; color: #fff; padding: 10px; border-radius: 8px; font-family: inherit; resize: vertical;" placeholder="請描述您遇到的問題..."></textarea>
                    
                    <p style="margin-top: 16px; margin-bottom: 8px; color: #ccc;">問題類型：</p>
                    <select id="hege-report-level" style="width: 100%; background: #222; border: 1px solid #444; color: #fff; padding: 10px; border-radius: 8px; outline: none;">
                        <option value="PRAISE">🎉 我覺得很棒</option>
                        <option value="INFO">💡 功能建議</option>
                        <option value="WARNING">⚠️ 有點怪怪的</option>
                        <option value="ERROR" selected>❌ 功能壞了</option>
                        <option value="CRITICAL">💀 完全無法使用</option>
                    </select>
                </div>
                <div class="hege-manager-footer">
                    <span id="hege-report-status" style="font-size: 13px; color: #888;"></span>
                    <div style="display: flex; gap: 12px;">
                        <button class="hege-manager-btn secondary" id="hege-report-cancel">取消</button>
                        <button class="hege-manager-btn primary" id="hege-report-submit">送出回報</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('.hege-manager-close');
        const cancelBtn = overlay.querySelector('#hege-report-cancel');
        const submitBtn = overlay.querySelector('#hege-report-submit');
        const msgInput = overlay.querySelector('#hege-report-msg');
        const levelSelect = overlay.querySelector('#hege-report-level');
        const statusSpan = overlay.querySelector('#hege-report-status');

        const close = () => overlay.remove();
        closeBtn.onclick = close;
        cancelBtn.onclick = close;

        submitBtn.onclick = async () => {
            const msg = msgInput.value.trim();
            if (!msg) {
                statusSpan.textContent = '請輸入問題描述！';
                statusSpan.style.color = '#ff3b30';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '傳送中...';
            statusSpan.textContent = '';
            
            try {
                const result = await onSubmit(levelSelect.value, msg);
                if (result && result.code === 200) {
                    UI.showToast('感謝您的回報！已成功送出。');
                    close();
                } else {
                    statusSpan.textContent = `傳送失敗：${result.message || '未知錯誤'}`;
                    statusSpan.style.color = '#ff3b30';
                    submitBtn.disabled = false;
                    submitBtn.textContent = '重新傳送';
                }
            } catch (err) {
                statusSpan.textContent = `發生例外錯誤：${err.message || err.toString()}`;
                statusSpan.style.color = '#ff3b30';
                submitBtn.disabled = false;
                submitBtn.textContent = '重新傳送';
            }
        };
    },

    showSettingsModal: (callbacks) => {
        if (document.getElementById('hege-settings-overlay')) return;

        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);

        const overlay = document.createElement('div');
        overlay.id = 'hege-settings-overlay';
        overlay.className = 'hege-manager-overlay';

        overlay.innerHTML = `
            <div class="hege-manager-box" style="max-width: 360px;">
                <div class="hege-manager-header">
                    <span class="hege-manager-title" style="display:flex; align-items:center; gap:6px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        設定
                    </span>
                    <span class="hege-manager-close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </span>
                </div>
                <div style="padding: 16px; display: flex; flex-direction: column; gap: 8px;">
                    <div class="hege-menu-item" id="hege-s-manage">
                        <span>管理已封鎖</span>
                        <span class="status">${db.length}</span>
                    </div>
                    <div class="hege-menu-item" id="hege-s-cockroach">
                        <span>大蟑螂資料庫</span>
                        <span class="status">${(Array.isArray(Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, [])) ? Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []) : []).length}</span>
                    </div>
                    <div class="hege-menu-item" id="hege-s-import">
                        <span>匯入名單</span>
                    </div>
                    <div class="hege-menu-item" id="hege-s-export">
                        <span>匯出紀錄</span>
                    </div>
                    <div class="hege-menu-item danger" id="hege-s-clear-db" style="border-bottom: none;">
                        <span>清除所有歷史</span>
                    </div>

                    <div style="height: 1px; background: #333; margin: 4px 0;"></div>
                    
                    <div class="hege-menu-item" id="hege-s-sponsor" style="color: #ecc351; border-bottom: none;">
                        <span>求贊助~ ☕️</span>
                    </div>

                    <div style="height: 1px; background: #333; margin: 4px 0;"></div>

                    <div class="hege-menu-item" style="cursor:default; flex-direction: column; align-items: flex-start; gap: 8px; border-bottom: none;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; width:100%;">
                            <input type="checkbox" id="hege-s-delay-toggle" style="width:16px; height:16px;">
                            <span style="font-weight:600;">啟用延時封鎖 (100人/8小時)</span>
                        </label>
                        <span style="font-size: 11px; color: #888; line-height: 1.4;">為避免觸發 Meta 次數上限，將圈選名單存入水庫，自動分批排放執行。</span>
                        <button class="hege-manager-btn secondary" id="hege-s-clear-delay" style="font-size: 12px; padding: 6px 12px; margin-top: 4px; width: 100%;">清空延時水庫 (0 人)</button>
                    </div>

                    <div style="height: 1px; background: #333; margin: 4px 0;"></div>

                    <div class="hege-menu-item" style="cursor:default; flex-direction: column; align-items: flex-start; gap: 8px; border-bottom: none;">
                        <label style="display:flex; align-items:center; gap:8px; width:100%;">
                            <span style="font-weight:600; color:#4cd964;">💡 定點絕 + 8小時巡邏說明</span>
                        </label>
                        <span style="font-size: 11px; color: #888; line-height: 1.4;">
                            定點絕大掃除完畢後，系統會詢問是否將該篇加入「每 8 小時自動回鍋」。<br><br>
                            ⚠️ <b>執行限制提示</b>：瀏覽器禁止背景無故強制彈出視窗。在 8 小時後，您必須<b>至少保持開啟著一個 Threads 分頁</b>，系統才有辦法在畫面右下角跳出【授權啟動對話框】，等您親自點擊同意後，才會接續全自動封鎖。
                        </span>
                    </div>

                    <div class="hege-menu-item" style="cursor:default; flex-direction: column; align-items: flex-start; gap: 8px; border-bottom: none;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; width:100%;">
                            <input type="checkbox" id="hege-s-advance-scroll-toggle" style="width:16px; height:16px;">
                            <span style="font-weight:600;">啟用進階同列全封</span>
                        </label>
                        <span style="font-size: 11px; color: #888; line-height: 1.4;">按下同列全封時，機器人會自動向下捲動網頁，強制抓取未顯示的名單。</span>
                    </div>

                    <p style="margin-top: 8px; color: #555; font-size: 11px; text-align: center;">版本 ${CONFIG.VERSION} · <a href="https://skiseiju.com" target="_blank" style="color: #888; text-decoration: none;">海哥 skiseiju.com</a></p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.hege-manager-close').onclick = close;

        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el && fn) {
                el.onclick = () => {
                    close();
                    try { fn(); } catch(e) { alert('bind error [' + id + ']: ' + e.message + '\n' + e.stack); }
                };
            }
        };
        bind('hege-s-manage', callbacks.onManage);
        bind('hege-s-cockroach', callbacks.onCockroach);
        bind('hege-s-import', callbacks.onImport);
        bind('hege-s-export', callbacks.onExport);
        bind('hege-s-clear-db', callbacks.onClearDB);
        bind('hege-s-sponsor', () => {
            alert('目前還不急著收贊助，但歡迎來看看我還可以幫你解決什麼 → skiseiju.com');
            window.open('https://skiseiju.com?utm_source=extension&utm_medium=popup', '_blank');
        });

        // Task 1: 延時封鎖 UI 事件
        const delayToggle = overlay.querySelector('#hege-s-delay-toggle');
        const clearDelayBtn = overlay.querySelector('#hege-s-clear-delay');
        delayToggle.checked = Storage.get(CONFIG.KEYS.DELAYED_BLOCK_ENABLED) === 'true';
        delayToggle.onchange = (e) => Storage.set(CONFIG.KEYS.DELAYED_BLOCK_ENABLED, e.target.checked ? 'true' : 'false');
        
        const dq = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
        clearDelayBtn.textContent = `清空延時水庫 (${dq.length} 人)`;
        if (dq.length === 0) clearDelayBtn.style.opacity = '0.5';
        clearDelayBtn.onclick = () => {
            if (dq.length === 0) return;
            UI.showConfirm(`確定要清空水庫中排隊的 ${dq.length} 人嗎？\n這將會永遠放棄這些尚未封鎖的名單。`, () => {
                Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                clearDelayBtn.textContent = '清空延時水庫 (0 人)';
                clearDelayBtn.style.opacity = '0.5';
                UI.showToast('延時水庫已清空');
            });
        };

        // Task 3: 進階同列全封 UI 事件
        const advanceToggle = overlay.querySelector('#hege-s-advance-scroll-toggle');
        advanceToggle.checked = Storage.get(CONFIG.KEYS.ADVANCED_SCROLL_ENABLED) === 'true';
        advanceToggle.onchange = (e) => Storage.set(CONFIG.KEYS.ADVANCED_SCROLL_ENABLED, e.target.checked ? 'true' : 'false');
    },

    showCockroachManager: (cockroachDb, onRemove, onBack = null) => {
        if (document.querySelector('.hege-manager-overlay')) {
            document.querySelector('.hege-manager-overlay').remove();
        }

        const rawList = Array.isArray(cockroachDb) ? cockroachDb : [];
        const getUname = (c) => typeof c === 'string' ? c : (c && c.username ? c.username : '');
        const getTime  = (c) => (c && typeof c === 'object' && c.timestamp) ? c.timestamp : 0;

        let users = rawList.slice().reverse(); // newest first by default
        let selected = new Set();
        let lastSelectedIndex = -1;

        const overlay = document.createElement('div');
        overlay.className = 'hege-manager-overlay';

        const renderList = (filter = '') => {
            const filtered = users.filter(c => {
                const u = getUname(c);
                return u && u.toLowerCase().includes(filter.toLowerCase());
            });
            const listEl = overlay.querySelector('.hege-manager-list');
            if (!listEl) return;

            if (filtered.length === 0) {
                listEl.innerHTML = `<div style="padding: 40px; text-align: center; color: #555;">${rawList.length === 0 ? '尚無蟑螂記錄' : '無符合結果'}</div>`;
                return;
            }

            listEl.innerHTML = filtered.map(c => {
                const uname = getUname(c);
                const safeU = Utils.escapeHTML(uname);
                const timeStr = getTime(c) ? new Date(getTime(c)).toLocaleString() : '無記錄時間';
                const isSelected = selected.has(uname);
                return `
                    <div class="hege-manager-item" data-username="${safeU}">
                        <div style="margin-right: 16px;">
                            <div class="hege-checkbox-container ${isSelected ? 'checked' : ''}" style="position:static; transform:none; width:24px; height:24px;">
                                <svg viewBox="0 0 24 24" class="hege-svg-icon" style="width:18px; height:18px;">
                                    <rect x="2" y="2" width="20" height="20" rx="6" ry="6" stroke="currentColor" stroke-width="2.5" fill="none"></rect>
                                    <path class="hege-checkmark" d="M6 12 l4 4 l8 -8" fill="none" style="display: ${isSelected ? 'block' : 'none'}"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="user-info">
                            <a href="https://www.threads.net/@${safeU}" target="_blank" style="color: #4cd964; text-decoration: underline; font-weight: 600;" onclick="event.stopPropagation()">@${safeU}</a>
                            <span class="time">${timeStr}</span>
                        </div>
                    </div>
                `;
            }).join('');

            const items = listEl.querySelectorAll('.hege-manager-item');
            items.forEach((item, index) => {
                item.onclick = (e) => {
                    const u = item.dataset.username;
                    if (e.shiftKey && lastSelectedIndex !== -1) {
                        const start = Math.min(index, lastSelectedIndex);
                        const end = Math.max(index, lastSelectedIndex);
                        const shouldSelect = !selected.has(u);
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
            const btn = overlay.querySelector('#hege-cockroach-remove-confirm');
            const count = overlay.querySelector('#hege-selected-count');
            if (btn) btn.disabled = selected.size === 0;
            if (count) count.textContent = `已選取 ${selected.size} 筆`;
        };

        const backArrow = onBack
            ? `<span id="hege-cockroach-back" style="cursor:pointer; margin-right:8px; display:flex; align-items:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"></path></svg></span>`
            : '';

        overlay.innerHTML = `
            <div class="hege-manager-box">
                <div class="hege-manager-header">
                    <span class="hege-manager-title" style="display:flex; align-items:center;">
                        ${backArrow}大蟑螂資料庫 (Cockroach DB)
                    </span>
                    <span class="hege-manager-close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </span>
                </div>
                <div class="hege-manager-search" style="display: flex; gap: 10px; align-items: center;">
                    <input type="text" placeholder="搜尋使用者名稱..." id="hege-cockroach-search-input" style="flex: 1;">
                </div>
                <div class="hege-manager-list"></div>
                <div class="hege-manager-footer">
                    <span id="hege-selected-count" style="font-size: 13px; color: #888;">已選取 0 筆</span>
                    <div style="display: flex; gap: 12px;">
                        <button class="hege-manager-btn secondary" id="hege-cockroach-cancel">關閉</button>
                        <button class="hege-manager-btn primary" id="hege-cockroach-remove-confirm" disabled style="background-color:#ff3b30; color:white; border-color:#ff3b30;">移除標記</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        renderList();

        const searchInput = overlay.querySelector('#hege-cockroach-search-input');
        searchInput.oninput = (e) => renderList(e.target.value);

        if (onBack) {
            const backEl = overlay.querySelector('#hege-cockroach-back');
            if (backEl) backEl.onclick = () => { overlay.remove(); onBack(); };
        }

        overlay.querySelector('.hege-manager-close').onclick = () => overlay.remove();
        overlay.querySelector('#hege-cockroach-cancel').onclick = () => {
            overlay.remove();
            if (onBack) onBack();
        };

        overlay.querySelector('#hege-cockroach-remove-confirm').onclick = () => {
            const toRemove = Array.from(selected);
            UI.showConfirm(
                `確定要從大蟑螂名單移除這 ${toRemove.length} 個帳號嗎？\n移除後他們就不再受重點標記與回望提醒。`,
                () => {
                    overlay.remove();
                    onRemove(toRemove);
                }
            );
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
                const safeU = Utils.escapeHTML(u);
                const time = timestamps[u] ? new Date(timestamps[u]).toLocaleString() : '無記錄時間';
                const isSelected = selected.has(u);
                return `
                    <div class="hege-manager-item" data-username="${safeU}">
                        <div style="margin-right: 16px;">
                            <div class="hege-checkbox-container ${isSelected ? 'checked' : ''}" style="position:static; transform:none; width:24px; height:24px;">
                                <svg viewBox="0 0 24 24" class="hege-svg-icon" style="width:18px; height:18px;">
                                    <rect x="2" y="2" width="20" height="20" rx="6" ry="6" stroke="currentColor" stroke-width="2.5" fill="none"></rect>
                                    <path class="hege-checkmark" d="M6 12 l4 4 l8 -8" fill="none" style="display: ${isSelected ? 'block' : 'none'}"></path>
                                </svg>
                            </div>
                        </div>
                        <div class="user-info">
                            <span class="username">@${safeU}</span>
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
            UI.showConfirm(
                `確定要對這 ${toUnblock.length} 位使用者解除封鎖嗎？\n\n這將會開啟背景視窗模擬點擊解除封鎖。`,
                () => {
                    overlay.remove();
                    onUnblock(toUnblock);
                }
            );
        };
    }
};
