import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Storage } from './storage.js';
import { Reporter } from './reporter.js';

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

            .hege-clean-list-btn {
                display: flex; align-items: center; justify-content: center;
                gap: 6px; padding: 6px 12px; margin-left: 12px;
                background-color: rgba(48, 209, 88, 0.12); color: #30d158;
                border: 1px solid rgba(48, 209, 88, 0.35); border-radius: 16px;
                font-size: 14px; font-weight: bold; cursor: pointer;
                transition: all 0.2s;
            }
            .hege-clean-list-btn:hover { background-color: rgba(48, 209, 88, 0.22); }
            .hege-clean-list-btn:active { transform: scale(0.95); }
            .hege-clean-list-btn svg { width: 16px; height: 16px; }

            .hege-report-only-btn {
                display: flex; align-items: center; justify-content: center;
                gap: 6px; padding: 6px 12px; margin-left: 8px;
                background-color: rgba(255, 149, 0, 0.12); color: #ff9500;
                border: 1px solid rgba(255, 149, 0, 0.35); border-radius: 16px;
                font-size: 14px; font-weight: bold; cursor: pointer;
                transition: all 0.2s;
            }
            .hege-report-only-btn:hover { background-color: rgba(255, 149, 0, 0.22); }
            .hege-report-only-btn:active { transform: scale(0.95); }
            .hege-report-only-btn svg { width: 16px; height: 16px; }

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
            #hege-panel.opens-up:not(.minimized) .hege-content {
                 top: auto;
                 bottom: 100%;
                 margin-top: 0;
                 margin-bottom: 8px;
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
            
            #hege-bg-status { padding: 4px 16px; font-size: 11px; color: #4cd964; background: #1a1a1a; display: block; }
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
            .hege-settings-box {
                max-height: calc(100vh - 24px);
                max-height: calc(100dvh - 24px);
            }
            .hege-settings-content {
                flex: 1;
                min-height: 0;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
            }
            @media (max-height: 720px) {
                .hege-settings-box { max-height: calc(100vh - 12px); max-height: calc(100dvh - 12px); }
                .hege-settings-content { padding: 12px !important; gap: 10px !important; }
                .hege-settings-box .hege-menu-item { padding: 10px 12px; }
            }
            @media (max-width: 640px) {
                .hege-settings-content { grid-template-columns: 1fr !important; }
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

                <div class="hege-menu-item" id="hege-report-btn-item">
                    <span>🚨 開始檢舉</span>
                    <span class="status" id="hege-report-count">0 筆</span>
                </div>

                <div class="hege-menu-item" id="hege-clear-sel-item">
                    <span>清除選取</span>
                </div>

                <div class="hege-menu-item danger" id="hege-retry-failed-item" style="display:none;">
                    <span>重試失敗清單</span>
                    <span class="status" id="hege-failed-count">0</span>
                </div>

                <div class="hege-menu-item" id="hege-endless-queue-item">
                    <span>貼文水庫</span>
                    <span class="status" id="hege-endless-queue-count">0 篇</span>
                </div>

                <div class="hege-menu-item" id="hege-settings-item">
                    <span style="display:flex; align-items:center; gap:6px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        <span id="hege-settings-title-text">設定</span>
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
        bindClick('hege-report-btn-item', callbacks.onStartReport);
        bindClick('hege-clear-sel-item', callbacks.onClearSel);
        bindClick('hege-retry-failed-item', callbacks.onRetryFailed);
        bindClick('hege-endless-queue-item', callbacks.onEndlessQueue);
        bindClick('hege-stop-btn-item', callbacks.onStop);
        bindClick('hege-settings-item', callbacks.onSettings);

        // Header click toggles too
        document.getElementById('hege-header').onclick = (e) => {
            if (e.target.id !== 'hege-toggle') document.getElementById('hege-toggle').click();
        };

        // Auto-collapse on outside click（定點絕執行中不折疊，避免 simClick 誤觸發）
        document.addEventListener('click', (e) => {
            const isEndlessRunning = Utils.isSweepRunning();
            if (isEndlessRunning) return;
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
                const headerHeight = panel.querySelector('#hege-header')?.offsetHeight || 38;
                const contentHeight = panel.querySelector('.hege-content')?.scrollHeight || 360;
                const needsOpenUp = rect.top + headerHeight + contentHeight + 12 > window.innerHeight;
                panel.classList.toggle('opens-up', needsOpenUp);
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

    showConfirm: (message, onConfirm, onCancel, labels = {}) => {
        const existing = document.getElementById('hege-confirm-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'hege-confirm-overlay';
        overlay.className = 'hege-manager-overlay';

        const safeMsg = Utils.escapeHTML(message).replace(/\n/g, '<br>');
        const cancelLabel = Utils.escapeHTML(labels.cancel || '取消');
        const confirmLabel = Utils.escapeHTML(labels.confirm || '確認繼續');
        overlay.innerHTML = `
            <div class="hege-manager-box" style="max-width:420px;">
                <div class="hege-manager-header">
                    <span class="hege-manager-title">⚠️ 確認</span>
                </div>
                <div style="padding:20px;font-size:14px;line-height:1.7;color:#ccc;">${safeMsg}</div>
                <div class="hege-manager-footer">
                    <div style="display:flex;gap:12px;width:100%;justify-content:flex-end;">
                        <button class="hege-manager-btn secondary" id="hege-confirm-cancel">${cancelLabel}</button>
                        <button class="hege-manager-btn primary" id="hege-confirm-ok">${confirmLabel}</button>
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

    showReportPicker: (callback, options = {}) => {
        const existing = document.getElementById('hege-report-picker-overlay');
        if (existing) existing.remove();

        const confirmLabel = Utils.escapeHTML(options.confirmLabel || '確定執行');
        const defaultReportPath = ['這是垃圾訊息'];
        const normalizeReportPath = (path) => {
            const source = Array.isArray(path) && path.length > 0 ? path : defaultReportPath;
            const ageChoice = source.includes('是') ? '是' : '否';
            const out = [];
            let node = CONFIG.REPORT_MENU_TREE;

            while (node && typeof node === 'object') {
                if (node.ageQuestion === true) {
                    out.push(ageChoice);
                    break;
                }
                const options = Object.keys(node).filter(k => k !== 'ageQuestion');
                if (options.length === 0) break;
                const idx = out.length;
                const selected = options.includes(source[idx]) ? source[idx] : options[0];
                out.push(selected);
                node = node[selected];
            }

            return out;
        };

        let reportPath = normalizeReportPath(Storage.getJSON(CONFIG.KEYS.REPORT_PATH, defaultReportPath));
        const overlay = document.createElement('div');
        overlay.id = 'hege-report-picker-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:2147483647; display:flex; align-items:center; justify-content:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        overlay.innerHTML = `
            <div style="width:min(420px, calc(100vw - 32px)); background:#181818; color:#f5f5f5; border:1px solid #333; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.55); overflow:hidden;">
                <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #2a2a2a;">
                    <div style="font-size:15px; font-weight:700;">選擇檢舉項目</div>
                    <button id="hege-report-picker-close" style="background:transparent; border:0; color:#999; font-size:22px; line-height:1; cursor:pointer; padding:0 4px;">×</button>
                </div>
                <div id="hege-report-picker-controls" style="display:flex; flex-direction:column; gap:10px; padding:16px;"></div>
                <div style="display:flex; justify-content:flex-end; gap:10px; padding:12px 16px; border-top:1px solid #2a2a2a;">
                    <button class="hege-manager-btn secondary" id="hege-report-picker-cancel">取消</button>
                    <button class="hege-manager-btn primary" id="hege-report-picker-confirm">${confirmLabel}</button>
                </div>
            </div>
        `;

        const controls = overlay.querySelector('#hege-report-picker-controls');
        const close = () => overlay.remove();
        const render = () => {
            reportPath = normalizeReportPath(reportPath);
            controls.innerHTML = '';
            let node = CONFIG.REPORT_MENU_TREE;
            let depth = 0;

            while (node && typeof node === 'object') {
                const label = document.createElement('label');
                label.style.cssText = 'display:flex; flex-direction:column; gap:6px; font-size:12px; color:#aaa;';
                const text = document.createElement('span');
                const select = document.createElement('select');
                select.dataset.level = String(depth);
                select.style.cssText = 'width:100%; box-sizing:border-box; background:#111; border:1px solid #444; color:#f5f5f5; padding:9px 10px; border-radius:8px; font-size:13px; outline:none;';

                if (node.ageQuestion === true) {
                    text.textContent = '是否未滿 18 歲';
                    ['否', '是'].forEach(v => {
                        const option = document.createElement('option');
                        option.value = v;
                        option.textContent = v;
                        select.appendChild(option);
                    });
                    select.value = reportPath[depth] === '是' ? '是' : '否';
                    select.onchange = () => {
                        reportPath[depth] = select.value;
                        reportPath = normalizeReportPath(reportPath);
                    };
                    label.appendChild(text);
                    label.appendChild(select);
                    controls.appendChild(label);
                    break;
                }

                const options = Object.keys(node).filter(k => k !== 'ageQuestion');
                if (options.length === 0) break;

                text.textContent = depth === 0 ? '大類' : '子類';
                options.forEach(v => {
                    const option = document.createElement('option');
                    option.value = v;
                    option.textContent = v;
                    select.appendChild(option);
                });
                select.value = options.includes(reportPath[depth]) ? reportPath[depth] : options[0];
                select.onchange = () => {
                    const level = parseInt(select.dataset.level, 10);
                    reportPath = reportPath.slice(0, level);
                    reportPath[level] = select.value;
                    reportPath = normalizeReportPath(reportPath);
                    render();
                };
                label.appendChild(text);
                label.appendChild(select);
                controls.appendChild(label);

                node = node[select.value];
                depth++;
            }
        };

        overlay.querySelector('#hege-report-picker-close').onclick = close;
        overlay.querySelector('#hege-report-picker-cancel').onclick = close;
        overlay.querySelector('#hege-report-picker-confirm').onclick = () => {
            const path = normalizeReportPath(reportPath);
            close();
            if (typeof callback === 'function') callback(path);
        };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        document.body.appendChild(overlay);
        render();
    },

    showCleanListPicker: (callback) => {
        const existing = document.getElementById('hege-clean-list-picker-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'hege-clean-list-picker-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.72); z-index:2147483647; display:flex; align-items:center; justify-content:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
        overlay.innerHTML = `
            <div style="width:min(440px, calc(100vw - 32px)); background:#181818; color:#f5f5f5; border:1px solid #333; border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,0.55); overflow:hidden;">
                <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #2a2a2a;">
                    <div style="font-size:15px; font-weight:700;">清理名單</div>
                    <button id="hege-clean-list-picker-close" style="background:transparent; border:0; color:#999; font-size:22px; line-height:1; cursor:pointer; padding:0 4px;">×</button>
                </div>
                <div style="display:flex; flex-direction:column; gap:12px; padding:16px;">
                    <div style="font-size:11px;color:#777;font-weight:700;letter-spacing:1px;">整串互動名單</div>
                    <label style="display:flex; align-items:flex-start; gap:10px; padding:10px; border:1px solid #333; border-radius:8px; background:#111; cursor:pointer;">
                        <input type="checkbox" id="hege-clean-list-collect" style="width:16px;height:16px;margin-top:2px;">
                        <span style="display:flex; flex-direction:column; gap:3px;">
                            <span style="font-size:13px;font-weight:700;color:#fff;">收集整串名單做封鎖或檢舉</span>
                            <span style="font-size:11px;color:#888;line-height:1.35;">自動捲完整個互動 dialog，把整串帳號同時加入封鎖選取與檢舉清單。</span>
                        </span>
                    </label>
                    <div style="height:1px;background:#2a2a2a;"></div>
                    <div style="font-size:11px;color:#777;font-weight:700;letter-spacing:1px;">整篇貼文</div>
                    <label style="display:flex; align-items:flex-start; gap:10px; padding:10px; border:1px solid #333; border-radius:8px; background:#111; cursor:pointer;">
                        <input type="checkbox" id="hege-clean-list-endless" style="width:16px;height:16px;margin-top:2px;">
                        <span style="display:flex; flex-direction:column; gap:3px;">
                            <span style="font-size:13px;font-weight:700;color:#fff;">定點絕（定期封鎖）</span>
                            <span style="font-size:11px;color:#888;line-height:1.35;">把目前貼文加入定點絕排程。</span>
                        </span>
                    </label>
                    <label id="hege-clean-list-loop-row" style="display:none; align-items:flex-start; gap:10px; margin-top:-4px; margin-left:26px; padding:10px; border:1px solid #28445a; border-radius:8px; background:#0b1b25; cursor:pointer;">
                        <input type="checkbox" id="hege-clean-list-loop" style="width:16px;height:16px;margin-top:2px;">
                        <span style="display:flex; flex-direction:column; gap:3px;">
                            <span style="font-size:13px;font-weight:700;color:#d8f0ff;">要做深層清理嗎？</span>
                            <span style="font-size:11px;color:#8fb8d0;line-height:1.35;">每 8 小時回頭再清一次。</span>
                        </span>
                    </label>
                </div>
                <div style="display:flex; justify-content:flex-end; gap:10px; padding:12px 16px; border-top:1px solid #2a2a2a;">
                    <button class="hege-manager-btn secondary" id="hege-clean-list-picker-cancel">取消</button>
                    <button class="hege-manager-btn primary" id="hege-clean-list-picker-confirm">確定加入清單</button>
                </div>
            </div>
        `;

        const close = () => overlay.remove();
        overlay.querySelector('#hege-clean-list-picker-close').onclick = close;
        overlay.querySelector('#hege-clean-list-picker-cancel').onclick = close;
        const endlessInput = overlay.querySelector('#hege-clean-list-endless');
        const loopRow = overlay.querySelector('#hege-clean-list-loop-row');
        const loopInput = overlay.querySelector('#hege-clean-list-loop');
        const syncLoopRow = () => {
            const enabled = !!endlessInput?.checked;
            if (loopRow) loopRow.style.display = enabled ? 'flex' : 'none';
            if (!enabled && loopInput) loopInput.checked = false;
        };
        endlessInput?.addEventListener('change', syncLoopRow);
        syncLoopRow();
        overlay.querySelector('#hege-clean-list-picker-confirm').onclick = () => {
            const actions = {
                collect: !!overlay.querySelector('#hege-clean-list-collect')?.checked,
                endless: !!overlay.querySelector('#hege-clean-list-endless')?.checked,
                longTermLoop: !!overlay.querySelector('#hege-clean-list-loop')?.checked,
            };
            if (!actions.collect && !actions.endless) {
                UI.showToast('請至少選一個清理動作');
                return;
            }
            close();
            if (typeof callback === 'function') callback(actions);
        };
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        document.body.appendChild(overlay);
    },

    showSettingsModal: (callbacks) => {
        if (document.getElementById('hege-settings-overlay')) return;

        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);

        const overlay = document.createElement('div');
        overlay.id = 'hege-settings-overlay';
        overlay.className = 'hege-manager-overlay';

        overlay.innerHTML = `
            <div class="hege-manager-box hege-settings-box" style="max-width: 760px; width: 92vw;">
                <div class="hege-manager-header">
                    <span class="hege-manager-title" style="display:flex; align-items:center; gap:6px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                        設定
                    </span>
                    <span class="hege-manager-close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </span>
                </div>
                <div class="hege-settings-content" style="padding: 16px; display:block;">
                    <div data-hege-settings-view-panel="home" style="display:flex; flex-direction:column; gap:14px;">
                        <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px;">
                            <div class="hege-menu-item" data-hege-settings-open="data" style="border:1px solid #2d2d2d; border-radius:8px; min-height:112px; align-items:flex-start; flex-direction:column; gap:7px;">
                                <span style="font-size:14px;font-weight:700;">資料與工具</span>
                                <span style="font-size:11px;color:#888;line-height:1.4;">已封鎖、分析、匯入匯出、名單工具與貼文水庫</span>
                            </div>
                            <div class="hege-menu-item" data-hege-settings-open="block" style="border:1px solid #2d2d2d; border-radius:8px; min-height:112px; align-items:flex-start; flex-direction:column; gap:7px;">
                                <span style="font-size:14px;font-weight:700;">封鎖設定</span>
                                <span style="font-size:11px;color:#888;line-height:1.4;">完整收集、速度、每日上限、緊急模式、定點絕設定</span>
                            </div>
                            <div class="hege-menu-item" data-hege-settings-open="report" style="border:1px solid #2d2d2d; border-radius:8px; min-height:112px; align-items:flex-start; flex-direction:column; gap:7px;">
                                <span style="font-size:14px;font-weight:700;">檢舉設定</span>
                                <span style="font-size:11px;color:#888;line-height:1.4;">每日上限、預設路徑、流程可視化</span>
                            </div>
                        </div>

                        <div style="height:1px;background:#2a2a2a;"></div>
                        <div style="display:flex;gap:6px;">
                            <div class="hege-menu-item" id="hege-s-report" style="flex:1;border-bottom:none;">
                                <span style="display:flex;align-items:center;gap:4px;font-size:12px;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"></path></svg>
                                    回報問題
                                </span>
                            </div>
                            <a href="https://app.skiseiju.com" target="_blank" class="hege-menu-item" style="flex:1;border-bottom:none;text-decoration:none;color:#5ac8fa;">
                                <span style="font-size:12px;">📋 說明</span>
                            </a>
                            <div class="hege-menu-item" id="hege-s-sponsor" style="flex:1;color:#ecc351;border-bottom:none;">
                                <span style="font-size:12px;">☕️ 贊助</span>
                            </div>
                        </div>
                        <p style="color:#555;font-size:11px;text-align:right;margin:0;">v${CONFIG.VERSION}</p>
                    </div>

                    <div data-hege-settings-view-panel="data" style="display:none; flex-direction:column; gap:10px;">
                        <div class="hege-menu-item" data-hege-settings-back style="border-bottom:none;color:#aaa;">
                            <span>← 返回設定</span>
                        </div>
                        <div style="font-size:11px;color:#666;font-weight:600;padding:2px 8px;letter-spacing:1px;">資料與工具</div>
                        <div class="hege-menu-item" id="hege-s-manage">
                            <span>管理已封鎖</span>
                            <span class="status">${db.length}</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-analytics" style="color: #5ac8fa;">
                            <span style="display:flex; align-items:center; gap:6px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
                                封鎖分析
                            </span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-platform-upload" style="color:#30d158;">
                            <span style="display:flex; align-items:center; gap:6px;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 20h16"/></svg>
                                一般使用者上傳
                            </span>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            <div class="hege-menu-item" id="hege-s-import" style="border-bottom:none;">
                                <span>匯入名單</span>
                            </div>
                            <div class="hege-menu-item" id="hege-s-export" style="border-bottom:none;">
                                <span>匯出紀錄</span>
                            </div>
                        </div>
                        <div class="hege-menu-item" id="hege-s-cockroach">
                            <span>大蟑螂名單</span>
                            <span class="status">${(Array.isArray(Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, [])) ? Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []) : []).length}</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-reservoir">
                            <span>貼文水庫</span>
                            <span class="status">${Storage.postReservoir.getAll().length}</span>
                        </div>
                        <div class="hege-menu-item danger" id="hege-s-clear-db" style="border-bottom: none;">
                            <span>清除所有歷史</span>
                        </div>
                    </div>

                    <div data-hege-settings-view-panel="block" style="display:none; flex-direction:column; gap:10px;">
                        <div class="hege-menu-item" data-hege-settings-back style="border-bottom:none;color:#aaa;">
                            <span>← 返回設定</span>
                        </div>
                        <div style="font-size:11px;color:#666;font-weight:600;padding:2px 8px;letter-spacing:1px;">封鎖設定</div>
                        <div style="display: flex; flex-direction: column; gap: 6px; padding: 10px; background: #111; border-radius: 8px; border: 1px solid #2a2a2a;">
                            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                <input type="checkbox" id="hege-s-advance-scroll-toggle" checked disabled style="width:16px; height:16px; opacity:0.65;">
                                <span style="font-weight:600; font-size:13px;">完整互動名單收集</span>
                            </label>
                            <span style="font-size: 11px; color: #888; line-height: 1.4;">清理名單會固定捲完整個互動 dialog，抓完整串帳號。</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-speed">
                            <span>速度模式</span>
                            <span class="status" id="hege-s-speed-status">🧠 智慧</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-daily-limit" style="display:flex; flex-direction:column; align-items:stretch; gap:4px;">
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                                <span>Meta 每日安全上限</span>
                                <select id="hege-s-daily-limit-select" style="background:#1a1a1a; border:1px solid #444; color:#f5f5f5; padding:2px 6px; border-radius:4px; font-size:11px;">
                                    ${CONFIG.DAILY_LIMIT_OPTIONS.map(n => `<option value="${n}">${n}</option>`).join('')}
                                </select>
                            </div>
                            <span style="font-size:10px; color:#ff9f0a; line-height:1.3;">超過此數 worker 會自動進冷卻 1 小時，避免被 Meta 抓</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-emergency-mode" style="display:flex; flex-direction:column; align-items:stretch; gap:4px;">
                            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                                <span>緊急模式</span>
                                <input type="checkbox" id="hege-s-emergency-toggle" style="width:16px; height:16px;">
                            </label>
                            <span style="font-size:10px; color:#ff453a; line-height:1.3;">跳過上限保護，可能觸發 Meta 帳號限制，僅短時急用</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-auto-mark-leader-row" style="display:flex; flex-direction:column; align-items:stretch; gap:4px;">
                            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                                <span>定點絕時自動標頭目</span>
                                <input type="checkbox" id="hege-s-auto-mark-leader" style="width:16px; height:16px;">
                            </label>
                            <span style="font-size:10px; color:#888; line-height:1.3;">按下定點絕時自動把貼文作者加入大蟑螂名單，10 天後提醒回查</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-block-visual-debug-row" style="display:flex; flex-direction:column; align-items:stretch; gap:4px;">
                            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                                <span>封鎖流程可視化</span>
                                <input type="checkbox" id="hege-s-block-visual-debug-toggle" style="width:16px; height:16px;">
                            </label>
                        </div>
                    </div>

                    <div data-hege-settings-view-panel="report" style="display:none; flex-direction:column; gap:10px;">
                        <div class="hege-menu-item" data-hege-settings-back style="border-bottom:none;color:#aaa;">
                            <span>← 返回設定</span>
                        </div>
                        <div style="font-size:11px;color:#666;font-weight:600;padding:2px 8px;letter-spacing:1px;">檢舉設定</div>
                        <div class="hege-menu-item" id="hege-s-daily-report-limit" style="display:flex; flex-direction:column; align-items:stretch; gap:4px;">
                            <div style="display:flex; align-items:center; justify-content:space-between;">
                                <span>每日只檢舉上限</span>
                                <select id="hege-s-daily-report-limit-select" style="background:#1a1a1a; border:1px solid #444; color:#f5f5f5; padding:2px 6px; border-radius:4px; font-size:11px;">
                                    ${CONFIG.DAILY_REPORT_LIMIT_OPTIONS.map(n => `<option value="${n}">${n}</option>`).join('')}
                                </select>
                            </div>
                            <span style="font-size:10px; color:#ff9f0a; line-height:1.3;">REPORT_QUEUE 使用獨立上限，預設 300</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-report-path" style="display:flex; flex-direction:column; align-items:stretch; gap:6px;">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                                <span>檢舉預設路徑</span>
                            </div>
                            <div id="hege-s-report-path-controls" style="display:flex; flex-direction:column; gap:6px;"></div>
                            <span style="font-size:10px; color:#888; line-height:1.3;">與「開始檢舉」picker 使用同一套路徑</span>
                        </div>
                        <div class="hege-menu-item" id="hege-s-report-visual-debug-row" style="display:flex; flex-direction:column; align-items:stretch; gap:4px;">
                            <label style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                                <span>檢舉流程可視化</span>
                                <input type="checkbox" id="hege-s-report-visual-debug-toggle" style="width:16px; height:16px;">
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.hege-manager-close').onclick = close;

        const titleText = overlay.querySelector('#hege-settings-title-text');
        const settingViewLabels = { home: '設定', data: '資料與工具', block: '封鎖設定', report: '檢舉設定' };
        const showSettingsView = (view) => {
            overlay.querySelectorAll('[data-hege-settings-view-panel]').forEach(panel => {
                const isActive = panel.dataset.hegeSettingsViewPanel === view;
                panel.style.display = isActive ? 'flex' : 'none';
            });
            if (titleText) titleText.textContent = settingViewLabels[view] || '設定';
        };
        overlay.querySelectorAll('[data-hege-settings-open]').forEach(card => {
            card.onclick = (e) => {
                e.stopPropagation();
                showSettingsView(card.dataset.hegeSettingsOpen);
            };
        });
        overlay.querySelectorAll('[data-hege-settings-back]').forEach(back => {
            back.onclick = (e) => {
                e.stopPropagation();
                showSettingsView('home');
            };
        });

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
        bind('hege-s-reservoir', callbacks.onReservoir);
        bind('hege-s-import', callbacks.onImport);
        bind('hege-s-export', callbacks.onExport);
        bind('hege-s-clear-db', callbacks.onClearDB);
        bind('hege-s-report', callbacks.onReport);
        bind('hege-s-analytics', callbacks.onAnalytics);
        bind('hege-s-platform-upload', callbacks.onPlatformUpload);

        // 速度模式切換（設定 modal 中）
        const speedModes = ['smart', 'stable', 'standard', 'turbo'];
        const speedLabels = { smart: '🧠 智慧', stable: '🛡️ 穩定', standard: '⚡ 標準', turbo: '🚀 加速' };
        const speedStatusEl = overlay.querySelector('#hege-s-speed-status');
        if (speedStatusEl) speedStatusEl.textContent = speedLabels[Storage.get(CONFIG.KEYS.SPEED_MODE) || 'smart'];
        const speedItem = overlay.querySelector('#hege-s-speed');
        if (speedItem) {
            speedItem.onclick = (e) => {
                e.stopPropagation();
                const cur = Storage.get(CONFIG.KEYS.SPEED_MODE) || 'smart';
                const idx = speedModes.indexOf(cur);
                const next = speedModes[(idx + 1) % speedModes.length];
                const profile = CONFIG.SPEED_PROFILES[next];
                const applySpeed = () => {
                    Storage.set(CONFIG.KEYS.SPEED_MODE, next);
                    if (speedStatusEl) speedStatusEl.textContent = speedLabels[next];
                    UI.showToast(`速度模式：${profile.label}`);
                };
                if (profile.warnOnSelect && !Storage.get(CONFIG.KEYS.TURBO_WARNED)) {
                    UI.showConfirm(
                        '⚠️ 加速模式會大幅縮短操作間隔\n\n可能導致 Meta 暫時限制您的帳號操作。\n建議僅在少量封鎖時使用。\n\n確定要切換嗎？',
                        () => { Storage.set(CONFIG.KEYS.TURBO_WARNED, 'true'); applySpeed(); }
                    );
                } else { applySpeed(); }
            };
        }

        // Meta 每日安全上限
        const dailyLimitSelect = overlay.querySelector('#hege-s-daily-limit-select');
        if (dailyLimitSelect) {
            dailyLimitSelect.value = String(Storage.getDailyBlockLimit());
            dailyLimitSelect.onchange = (e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                    Storage.set(CONFIG.KEYS.DAILY_BLOCK_LIMIT, String(val));
                    UI.showToast(`Meta 每日安全上限已設為 ${val} 人`);
                }
            };
            const dailyLimitRow = overlay.querySelector('#hege-s-daily-limit');
            if (dailyLimitRow) dailyLimitRow.onclick = (e) => e.stopPropagation();
        }

        const dailyReportLimitSelect = overlay.querySelector('#hege-s-daily-report-limit-select');
        if (dailyReportLimitSelect) {
            dailyReportLimitSelect.value = String(Storage.getDailyReportLimit());
            dailyReportLimitSelect.onchange = (e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                    Storage.set(CONFIG.KEYS.DAILY_REPORT_LIMIT, String(val));
                    UI.showToast(`每日只檢舉上限已設為 ${val} 人`);
                }
            };
            const dailyReportLimitRow = overlay.querySelector('#hege-s-daily-report-limit');
            if (dailyReportLimitRow) dailyReportLimitRow.onclick = (e) => e.stopPropagation();
        }

        const reportPathRow = overlay.querySelector('#hege-s-report-path');
        const reportPathControls = overlay.querySelector('#hege-s-report-path-controls');
        const defaultReportPath = ['這是垃圾訊息'];
        const normalizeReportPath = (path) => {
            const source = Array.isArray(path) && path.length > 0 ? path : defaultReportPath;
            const ageChoice = source.includes('是') ? '是' : '否';
            const out = [];
            let node = CONFIG.REPORT_MENU_TREE;

            while (node && typeof node === 'object') {
                if (node.ageQuestion === true) {
                    out.push(ageChoice);
                    break;
                }
                const options = Object.keys(node).filter(k => k !== 'ageQuestion');
                if (options.length === 0) break;
                const idx = out.length;
                const selected = options.includes(source[idx]) ? source[idx] : options[0];
                out.push(selected);
                node = node[selected];
            }

            return out;
        };
        if (reportPathRow) reportPathRow.onclick = (e) => e.stopPropagation();
        if (reportPathControls) {
            let reportPath = normalizeReportPath(Storage.getJSON(CONFIG.KEYS.REPORT_PATH, defaultReportPath));
            const saveReportPath = () => {
                Storage.setJSON(CONFIG.KEYS.REPORT_PATH, reportPath);
                UI.showToast('檢舉預設路徑已更新', 1200);
            };
            const renderReportPathControls = () => {
                reportPath = normalizeReportPath(reportPath);
                reportPathControls.innerHTML = '';
                let node = CONFIG.REPORT_MENU_TREE;
                let depth = 0;

                while (node && typeof node === 'object') {
                    if (node.ageQuestion === true) {
                        const label = document.createElement('label');
                        label.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; color:#ccc;';
                        const text = document.createElement('span');
                        text.textContent = '未滿 18';
                        const select = document.createElement('select');
                        select.dataset.level = String(depth);
                        select.style.cssText = 'background:#1a1a1a; border:1px solid #444; color:#f5f5f5; padding:4px 6px; border-radius:4px; font-size:11px; max-width:150px;';
                        ['否', '是'].forEach(v => {
                            const option = document.createElement('option');
                            option.value = v;
                            option.textContent = v;
                            select.appendChild(option);
                        });
                        select.value = reportPath[depth] === '是' ? '是' : '否';
                        select.onchange = () => {
                            reportPath[depth] = select.value;
                            reportPath = normalizeReportPath(reportPath);
                            saveReportPath();
                        };
                        label.appendChild(text);
                        label.appendChild(select);
                        reportPathControls.appendChild(label);
                        break;
                    }

                    const options = Object.keys(node).filter(k => k !== 'ageQuestion');
                    if (options.length === 0) break;

                    const label = document.createElement('label');
                    label.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; color:#ccc;';
                    const text = document.createElement('span');
                    text.textContent = depth === 0 ? '大類' : `第 ${depth + 1} 層`;
                    const select = document.createElement('select');
                    select.dataset.level = String(depth);
                    select.style.cssText = 'background:#1a1a1a; border:1px solid #444; color:#f5f5f5; padding:4px 6px; border-radius:4px; font-size:11px; max-width:170px;';
                    options.forEach(v => {
                        const option = document.createElement('option');
                        option.value = v;
                        option.textContent = v;
                        select.appendChild(option);
                    });
                    select.value = options.includes(reportPath[depth]) ? reportPath[depth] : options[0];
                    select.onchange = () => {
                        const level = parseInt(select.dataset.level, 10);
                        reportPath = reportPath.slice(0, level);
                        reportPath[level] = select.value;
                        reportPath = normalizeReportPath(reportPath);
                        saveReportPath();
                        renderReportPathControls();
                    };
                    label.appendChild(text);
                    label.appendChild(select);
                    reportPathControls.appendChild(label);

                    node = node[select.value];
                    depth++;
                }

                Storage.setJSON(CONFIG.KEYS.REPORT_PATH, reportPath);
            };
            renderReportPathControls();
        }

        const reportVisualDebugToggle = overlay.querySelector('#hege-s-report-visual-debug-toggle');
        if (reportVisualDebugToggle) {
            reportVisualDebugToggle.checked = Storage.get(CONFIG.KEYS.REPORT_VISUAL_DEBUG) === 'true';
            reportVisualDebugToggle.onchange = (e) => {
                Storage.set(CONFIG.KEYS.REPORT_VISUAL_DEBUG, e.target.checked ? 'true' : 'false');
                UI.showToast(e.target.checked ? '檢舉可視化已開啟' : '檢舉可視化已關閉');
            };
            const reportVisualDebugRow = overlay.querySelector('#hege-s-report-visual-debug-row');
            if (reportVisualDebugRow) reportVisualDebugRow.onclick = (e) => e.stopPropagation();
        }

        const blockVisualDebugToggle = overlay.querySelector('#hege-s-block-visual-debug-toggle');
        if (blockVisualDebugToggle) {
            blockVisualDebugToggle.checked = Storage.get(CONFIG.KEYS.BLOCK_VISUAL_DEBUG) === 'true';
            blockVisualDebugToggle.onchange = (e) => {
                Storage.set(CONFIG.KEYS.BLOCK_VISUAL_DEBUG, e.target.checked ? 'true' : 'false');
                UI.showToast(e.target.checked ? '封鎖可視化已開啟' : '封鎖可視化已關閉');
            };
            const blockVisualDebugRow = overlay.querySelector('#hege-s-block-visual-debug-row');
            if (blockVisualDebugRow) blockVisualDebugRow.onclick = (e) => e.stopPropagation();
        }

        const emergencyToggle = overlay.querySelector('#hege-s-emergency-toggle');
        if (emergencyToggle) {
            emergencyToggle.checked = Storage.get(CONFIG.KEYS.EMERGENCY_MODE) === 'true';
            emergencyToggle.onchange = (e) => {
                Storage.set(CONFIG.KEYS.EMERGENCY_MODE, e.target.checked ? 'true' : 'false');
                UI.showToast(e.target.checked ? '緊急模式已開啟' : '緊急模式已關閉');
            };
            const emergencyRow = overlay.querySelector('#hege-s-emergency-mode');
            if (emergencyRow) emergencyRow.onclick = (e) => e.stopPropagation();
        }

        const autoMarkLeaderToggle = overlay.querySelector('#hege-s-auto-mark-leader');
        if (autoMarkLeaderToggle) {
            autoMarkLeaderToggle.checked = Storage.get(CONFIG.KEYS.AUTO_MARK_LEADER) !== 'false';
            autoMarkLeaderToggle.onchange = (e) => {
                Storage.set(CONFIG.KEYS.AUTO_MARK_LEADER, e.target.checked ? 'true' : 'false');
                UI.showToast(e.target.checked ? '定點絕自動標頭目已開啟' : '定點絕自動標頭目已關閉');
            };
            const autoMarkLeaderRow = overlay.querySelector('#hege-s-auto-mark-leader-row');
            if (autoMarkLeaderRow) autoMarkLeaderRow.onclick = (e) => e.stopPropagation();
        }

        bind('hege-s-sponsor', () => {
            alert('目前還不急著收贊助，但歡迎來看看我還可以幫你解決什麼 → skiseiju.com');
            window.open('https://skiseiju.com?utm_source=extension&utm_medium=popup', '_blank');
        });

        // 清理名單固定完整收集，保留唯讀狀態讓使用者知道目前行為。
        const advanceToggle = overlay.querySelector('#hege-s-advance-scroll-toggle');
        if (advanceToggle) {
            advanceToggle.checked = true;
            advanceToggle.disabled = true;
        }
    },

    showAnalyticsReport: (options = {}) => {
        if (document.getElementById('hege-analytics-overlay')) return;
        const analyticsShowAdvanced = Storage.get(CONFIG.KEYS.ANALYTICS_SHOW_ADVANCED, 'false') === 'true';
        const platformSyncEnabled = Storage.getPlatformSyncEnabled();
        const platformSyncLastAt = Storage.getPlatformSyncLastAt();

        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        const ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
        const cockroachDB = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
        const endlessHistory = Storage.getJSON(CONFIG.KEYS.ENDLESS_HISTORY, []);
        const endlessQueue = Storage.postReservoir.getAll().filter(p => p.advanceOnComplete);
        const reportHistory = Storage.getJSON(CONFIG.KEYS.REPORT_HISTORY, []);
        const evidenceIndexRaw = Storage.getJSON(CONFIG.KEYS.SOURCE_EVIDENCE_INDEX, {});
        const evidenceIndexMap = (evidenceIndexRaw && typeof evidenceIndexRaw === 'object' && !Array.isArray(evidenceIndexRaw))
            ? evidenceIndexRaw
            : {};
        const sourceEvidenceList = Object.entries(evidenceIndexMap)
            .map(([sourceUrl, item]) => ({ sourceUrl, ...(item || {}) }))
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const failedQueue = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        const cooldownQueue = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
        const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0', 10);

        // 向下相容 timestamp 取值
        const getTs = (u) => { const e = ts[u]; return typeof e === 'object' && e !== null ? (e.t || 0) : (e || 0); };
        const getEntry = (u) => { const e = ts[u]; return typeof e === 'object' && e !== null ? e : { t: e || 0 }; };

        // === 統計計算 ===
        const totalBlocked = db.length;
        const cockroachCount = Array.isArray(cockroachDB) ? cockroachDB.length : 0;
        const knownEntries = db.map(u => ({ username: u, ...getEntry(u) }));
        const structuredEntries = knownEntries.filter(e => e.t > 0 && (e.src || e.reason || e.batch || e.postOwner || e.postText));
        const legacyCount = Math.max(0, totalBlocked - structuredEntries.length);

        // 封鎖原因分布
        const reasonCounts = { likes: 0, quotes: 0, reposts: 0, manual: 0, unknown: 0 };
        db.forEach(u => {
            const entry = getEntry(u);
            if (entry.reason) reasonCounts[entry.reason] = (reasonCounts[entry.reason] || 0) + 1;
            else reasonCounts.unknown++;
        });

        // 時間範圍
        const now = Date.now();
        const blockTimes = db.map(u => getTs(u)).filter(t => t > 0).sort((a, b) => a - b);
        const reportTimes = reportHistory.map(entry => entry.t || 0).filter(t => t > 0).sort((a, b) => a - b);
        const actionTimes = [...blockTimes, ...reportTimes].sort((a, b) => a - b);
        const sourceEvidenceWithSnippetCount = sourceEvidenceList.filter(item => !!item.snippet).length;
        const sourceEvidenceRecent7dCount = sourceEvidenceList.filter(item => (item.updatedAt || 0) >= now - 7 * 24 * 3600 * 1000).length;
        const sourceEvidencePreview = sourceEvidenceList.slice(0, 8);
        const earliest = actionTimes.length > 0 ? new Date(actionTimes[0]).toLocaleDateString() : '-';
        const latest = actionTimes.length > 0 ? new Date(actionTimes[actionTimes.length - 1]).toLocaleDateString() : '-';
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const countSince = (ms) => actionTimes.filter(t => t >= ms).length;
        const todayCount = countSince(startOfToday.getTime());
        const sevenDayCount = countSince(now - 7 * 24 * 3600 * 1000);
        const thirtyDayCount = countSince(now - 30 * 24 * 3600 * 1000);

        // 來源貼文排行（哪篇貼文封最多人）
        const srcMap = {};
        db.forEach(u => {
            const entry = getEntry(u);
            if (entry.src) {
                if (!srcMap[entry.src]) srcMap[entry.src] = {
                    count: 0,
                    postText: entry.postText || '',
                    postOwner: entry.postOwner || '',
                    reasons: {}
                };
                srcMap[entry.src].count++;
                const reason = entry.reason || 'unknown';
                srcMap[entry.src].reasons[reason] = (srcMap[entry.src].reasons[reason] || 0) + 1;
            }
        });
        const topSources = Object.entries(srcMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
        const uniqueSources = Object.keys(srcMap).length;
        const sourceLinkedCount = Object.values(srcMap).reduce((sum, info) => sum + info.count, 0);
        const sourceCoveragePct = totalBlocked > 0 ? Math.round(sourceLinkedCount / totalBlocked * 100) : 0;
        const topSourceShare = totalBlocked > 0 && topSources.length > 0 ? Math.round(topSources[0][1].count / totalBlocked * 100) : 0;
        const reportSourceMap = {};
        reportHistory.forEach(entry => {
            const src = entry.sourceUrl || '';
            if (!src) return;
            if (!reportSourceMap[src]) reportSourceMap[src] = { count: 0, paths: {}, sources: {} };
            reportSourceMap[src].count++;
            const pathLabel = Array.isArray(entry.path) ? entry.path.join(' > ') : '';
            if (pathLabel) reportSourceMap[src].paths[pathLabel] = (reportSourceMap[src].paths[pathLabel] || 0) + 1;
            const sourceLabel = entry.source || 'unknown';
            reportSourceMap[src].sources[sourceLabel] = (reportSourceMap[src].sources[sourceLabel] || 0) + 1;
        });
        const reportSourceLinkedCount = Object.values(reportSourceMap).reduce((sum, info) => sum + info.count, 0);
        const reportSourceCoveragePct = reportHistory.length > 0 ? Math.round(reportSourceLinkedCount / reportHistory.length * 100) : 0;
        const provenanceMap = {};
        Object.entries(srcMap).forEach(([url, info]) => {
            if (!provenanceMap[url]) provenanceMap[url] = { blocked: 0, reported: 0, postText: info.postText || '', postOwner: info.postOwner || '', reportPaths: {} };
            provenanceMap[url].blocked += info.count;
        });
        Object.entries(reportSourceMap).forEach(([url, info]) => {
            if (!provenanceMap[url]) provenanceMap[url] = { blocked: 0, reported: 0, postText: '', postOwner: '', reportPaths: {} };
            provenanceMap[url].reported += info.count;
            Object.entries(info.paths).forEach(([path, count]) => {
                provenanceMap[url].reportPaths[path] = (provenanceMap[url].reportPaths[path] || 0) + count;
            });
        });
        const allProvenanceSources = Object.entries(provenanceMap)
            .sort((a, b) => (b[1].blocked + b[1].reported) - (a[1].blocked + a[1].reported));
        const topProvenanceSources = allProvenanceSources.slice(0, 12);
        const sourceEvidenceCoveragePct = allProvenanceSources.length > 0
            ? Math.min(100, Math.round(sourceEvidenceList.length / allProvenanceSources.length * 100))
            : 0;
        const sourceEvidenceSnippetCoveragePct = sourceEvidenceList.length > 0
            ? Math.round(sourceEvidenceWithSnippetCount / sourceEvidenceList.length * 100)
            : 0;

        // 每日封鎖量（最近 30 天，CSS 長條圖）
        const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;
        const dayKey = (t) => {
            const d = new Date(t);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const dayLabel = (t) => new Date(t).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
        const dailyCounts = {};
        db.forEach(u => {
            const t = getTs(u);
            if (t >= thirtyDaysAgo) {
                const day = dayKey(t);
                dailyCounts[day] = (dailyCounts[day] || 0) + 1;
            }
        });
        const dailyEntries = [];
        for (let i = 13; i >= 0; i--) {
            const d = new Date(now - i * 24 * 3600 * 1000);
            const key = dayKey(d.getTime());
            dailyEntries.push([dayLabel(d.getTime()), dailyCounts[key] || 0]);
        }
        const maxDaily = Math.max(...dailyEntries.map(d => d[1]), 1);
        const activeDays30 = Object.values(dailyCounts).filter(c => c > 0).length;
        const avgPerActiveDay = activeDays30 > 0 ? Math.round(thirtyDayCount / activeDays30 * 10) / 10 : 0;
        const peakDay = Object.entries(dailyCounts).sort((a, b) => b[1] - a[1])[0] || null;

        // 定點絕戰績
        const totalSweepPosts = endlessHistory.length + endlessQueue.filter(p => p.done).length;
        const totalSweepBlocked = endlessHistory.reduce((s, h) => s + (h.totalBlocked || 0), 0)
            + endlessQueue.filter(p => p.done).reduce((s, p) => s + (p.totalBlocked || 0), 0);
        const pendingSweepPosts = endlessQueue.filter(p => p.advanceOnComplete && p.status === 'pending').length;
        const loopSweepPosts = endlessQueue.filter(p => p.longTermLoop).length;
        const sourcedBlockCount = knownEntries.filter(e => !!e.src).length;
        const sourcedReportCount = reportHistory.filter(entry => !!entry.sourceUrl).length;

        // 批次與發文者分析
        const batchMap = {};
        const ownerMap = {};
        structuredEntries.forEach(e => {
            if (e.batch) batchMap[e.batch] = (batchMap[e.batch] || 0) + 1;
            if (e.postOwner) {
                if (!ownerMap[e.postOwner]) ownerMap[e.postOwner] = { count: 0, sources: new Set() };
                ownerMap[e.postOwner].count++;
                if (e.src) ownerMap[e.postOwner].sources.add(e.src);
            }
        });
        const batchCounts = Object.values(batchMap);
        const batchTotal = batchCounts.length;
        const avgBatchSize = batchTotal > 0 ? Math.round(batchCounts.reduce((s, c) => s + c, 0) / batchTotal * 10) / 10 : 0;
        const maxBatchSize = batchTotal > 0 ? Math.max(...batchCounts) : 0;
        const topOwners = Object.entries(ownerMap)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 8);

        // 最近封鎖（有 context 的前 20 筆）
        const recentWithContext = db
            .map(u => ({ username: u, ...getEntry(u) }))
            .filter(e => e.t > 0)
            .sort((a, b) => b.t - a.t)
            .slice(0, 40);

        // 原因 label
        const reasonLabel = { likes: '👍 按讚名單', quotes: '💬 引用', reposts: '🔄 轉發', manual: '✋ 手動', unknown: '❓ 舊資料' };
        const miniStat = (value, label, color = '#f5f5f5', sub = '') => `
            <div style="background:#111;border-radius:8px;padding:12px;text-align:center;border:1px solid #2a2a2a;">
                <div style="font-size:24px;font-weight:700;color:${color};">${value}</div>
                <div style="font-size:11px;color:#888;margin-top:2px;">${label}</div>
                ${sub ? `<div style="font-size:10px;color:#555;margin-top:3px;">${sub}</div>` : ''}
            </div>`;
        const queueStat = (value, label, color = '#f5f5f5') => `
            <div style="background:#151515;border-radius:7px;padding:9px 10px;border:1px solid #292929;">
                <div style="font-size:18px;font-weight:700;color:${color};">${value}</div>
                <div style="font-size:10px;color:#777;margin-top:1px;">${label}</div>
            </div>`;
        const reasonBar = (key, count) => {
            const pct = totalBlocked > 0 ? Math.round(count / totalBlocked * 100) : 0;
            return `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;">
                <span style="min-width:90px;font-size:12px;color:#aaa;">${reasonLabel[key]}</span>
                <div style="flex:1;height:14px;background:#1a1a1a;border-radius:4px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${key === 'likes' ? '#4cd964' : key === 'quotes' ? '#5ac8fa' : key === 'reposts' ? '#ff9f0a' : '#666'};border-radius:4px;"></div>
                </div>
                <span style="min-width:50px;text-align:right;font-size:12px;color:#888;">${count} (${pct}%)</span>
            </div>`;
        };
        const insightRows = [
            sourceCoveragePct < 60 ? `封鎖來源覆蓋率只有 ${sourceCoveragePct}%，有些封鎖帳號還追不到來源貼文。` : `封鎖來源覆蓋率 ${sourceCoveragePct}%，大多數封鎖帳號都能回推到來源貼文。`,
            reportHistory.length > 0
                ? (reportSourceCoveragePct < 60 ? `檢舉來源覆蓋率只有 ${reportSourceCoveragePct}%，檢舉路徑已記錄，但還有部分缺少來源貼文。` : `檢舉來源覆蓋率 ${reportSourceCoveragePct}%，檢舉帳號也能穩定回推到來源貼文。`)
                : '目前還沒有檢舉來源歷史；新版開始會持續累積。',
            sourceEvidenceList.length > 0
                ? `來源證據快照 ${sourceEvidenceList.length} 筆，含文字 snippet 比例 ${sourceEvidenceSnippetCoveragePct}%，最近 7 天更新 ${sourceEvidenceRecent7dCount} 筆。`
                : '來源證據快照目前為 0；後續封鎖/檢舉會自動累積。',
            legacyCount > 0 ? `有 ${legacyCount} 筆舊封鎖資料沒有完整來源欄位，分析時要和新版資料分開看。` : '目前封鎖資料都帶有可分析的來源欄位。',
            topSourceShare >= 35 ? `最大單一來源文章占 ${topSourceShare}%，代表封鎖很集中在少數貼文。` : `最大單一來源文章占 ${topSourceShare}%，來源分布目前算平均。`,
            allProvenanceSources.length > 0 ? `目前已整理出 ${allProvenanceSources.length} 篇來源文章，可直接拿去做平台交叉分析。` : '目前還沒有可交叉分析的來源文章。'
        ];
        const blockEvents = knownEntries.map((e, idx) => ({
            eventId: `blk_${e.username || 'unknown'}_${e.t || 0}_${idx}`,
            eventType: 'block',
            accountId: e.username || '',
            profileUrl: e.username ? `https://www.threads.com/@${e.username}` : '',
            eventAt: e.t || 0,
            sourceUrl: e.src || '',
            sourceOwner: e.postOwner || '',
            sourceText: e.postText || '',
            sourceChannel: 'unknown',
            blockReasonCode: e.reason || 'unknown',
            reportPath: [],
            reportPrimaryCategory: '',
            reportLeafCategory: '',
            reportTargetType: '',
            batchId: e.batch || '',
        }));
        const reportEvents = reportHistory.map((entry, idx) => {
            const path = Array.isArray(entry.path) ? entry.path : [];
            return {
                eventId: `rpt_${entry.username || 'unknown'}_${entry.t || 0}_${idx}`,
                eventType: 'report',
                accountId: entry.username || '',
                profileUrl: entry.username ? `https://www.threads.com/@${entry.username}` : '',
                eventAt: entry.t || 0,
                sourceUrl: entry.sourceUrl || '',
                sourceOwner: '',
                sourceText: '',
                sourceChannel: entry.source || 'unknown',
                blockReasonCode: '',
                reportPath: path,
                reportPrimaryCategory: path[0] || '',
                reportLeafCategory: path[path.length - 1] || '',
                reportTargetType: entry.targetType || '',
                batchId: '',
            };
        });
        const unifiedEvents = [...blockEvents, ...reportEvents].sort((a, b) => (b.eventAt || 0) - (a.eventAt || 0));

        const accountAgg = {};
        unifiedEvents.forEach((event) => {
            const accountId = (event.accountId || '').trim();
            if (!accountId) return;
            if (!accountAgg[accountId]) {
                accountAgg[accountId] = {
                    accountId,
                    profileUrl: `https://www.threads.com/@${accountId}`,
                    blockEventCount: 0,
                    reportEventCount: 0,
                    totalEventCount: 0,
                    firstSeenAt: 0,
                    lastSeenAt: 0,
                    sourceUrls: new Set(),
                    sourceOwners: new Set(),
                    blockReasons: new Set(),
                    reportPrimaryCategories: new Set(),
                    reportLeafCategories: new Set(),
                };
            }
            const agg = accountAgg[accountId];
            agg.totalEventCount++;
            if (event.eventType === 'block') agg.blockEventCount++;
            if (event.eventType === 'report') agg.reportEventCount++;
            if (event.sourceUrl) agg.sourceUrls.add(event.sourceUrl);
            if (event.sourceOwner) agg.sourceOwners.add(event.sourceOwner);
            if (event.blockReasonCode) agg.blockReasons.add(event.blockReasonCode);
            if (event.reportPrimaryCategory) agg.reportPrimaryCategories.add(event.reportPrimaryCategory);
            if (event.reportLeafCategory) agg.reportLeafCategories.add(event.reportLeafCategory);
            if (event.eventAt > 0) {
                if (!agg.firstSeenAt || event.eventAt < agg.firstSeenAt) agg.firstSeenAt = event.eventAt;
                if (!agg.lastSeenAt || event.eventAt > agg.lastSeenAt) agg.lastSeenAt = event.eventAt;
            }
        });

        const accounts = Object.values(accountAgg).map((acc) => {
            const suspicionScore = Math.min(100,
                acc.blockEventCount * 8 +
                acc.reportEventCount * 12 +
                acc.sourceUrls.size * 6 +
                acc.reportLeafCategories.size * 5 +
                (acc.blockEventCount > 0 && acc.reportEventCount > 0 ? 10 : 0)
            );
            const riskLevel = suspicionScore >= 65 ? 'high' : (suspicionScore >= 35 ? 'medium' : 'low');
            return {
                accountId: acc.accountId,
                profileUrl: acc.profileUrl,
                blockEventCount: acc.blockEventCount,
                reportEventCount: acc.reportEventCount,
                totalEventCount: acc.totalEventCount,
                firstSeenAt: acc.firstSeenAt || 0,
                lastSeenAt: acc.lastSeenAt || 0,
                sourceUrlCount: acc.sourceUrls.size,
                sourceUrls: Array.from(acc.sourceUrls),
                sourceOwners: Array.from(acc.sourceOwners),
                blockReasons: Array.from(acc.blockReasons),
                reportPrimaryCategories: Array.from(acc.reportPrimaryCategories),
                reportLeafCategories: Array.from(acc.reportLeafCategories),
                platformReview: {
                    isLikelyBot: null,
                    isLikelyFakeAccount: null,
                    botConfidence: null,
                    fakeConfidence: null,
                    suspicionScore,
                    riskLevel,
                    reviewNote: '',
                },
            };
        }).sort((a, b) => b.totalEventCount - a.totalEventCount);

        const extractHashtags = (text) => {
            const raw = String(text || '');
            const matches = raw.match(/#[^\s#.,，。!?！？:：;；、]+/g) || [];
            return matches.slice(0, 8).map(tag => tag.toLowerCase());
        };

        const sourceAgg = {};
        unifiedEvents.forEach((event) => {
            const url = event.sourceUrl || '';
            if (!url) return;
            if (!sourceAgg[url]) {
                sourceAgg[url] = {
                    sourceUrl: url,
                    sourceOwners: new Set(),
                    sourceTextSamples: new Set(),
                    blockEventCount: 0,
                    reportEventCount: 0,
                    totalEventCount: 0,
                    accountIds: new Set(),
                    reportPathCounts: {},
                    blockReasonCounts: {},
                    topicHintCounts: {},
                };
            }
            const src = sourceAgg[url];
            src.totalEventCount++;
            if (event.eventType === 'block') src.blockEventCount++;
            if (event.eventType === 'report') src.reportEventCount++;
            if (event.accountId) src.accountIds.add(event.accountId);
            if (event.sourceOwner) src.sourceOwners.add(event.sourceOwner);
            if (event.sourceText) src.sourceTextSamples.add(event.sourceText);
            if (event.reportPath.length > 0) {
                const key = event.reportPath.join(' > ');
                src.reportPathCounts[key] = (src.reportPathCounts[key] || 0) + 1;
            }
            if (event.reportPrimaryCategory) {
                const key = `report:${event.reportPrimaryCategory}`;
                src.topicHintCounts[key] = (src.topicHintCounts[key] || 0) + 1;
            }
            if (event.reportLeafCategory) {
                const key = `report_leaf:${event.reportLeafCategory}`;
                src.topicHintCounts[key] = (src.topicHintCounts[key] || 0) + 1;
            }
            if (event.blockReasonCode) {
                src.blockReasonCounts[event.blockReasonCode] = (src.blockReasonCounts[event.blockReasonCode] || 0) + 1;
            }
            extractHashtags(event.sourceText).forEach((tag) => {
                const key = `hashtag:${tag}`;
                src.topicHintCounts[key] = (src.topicHintCounts[key] || 0) + 1;
            });
        });
        sourceEvidenceList.forEach((ev) => {
            if (!ev.sourceUrl) return;
            if (!sourceAgg[ev.sourceUrl]) {
                sourceAgg[ev.sourceUrl] = {
                    sourceUrl: ev.sourceUrl,
                    sourceOwners: new Set(),
                    sourceTextSamples: new Set(),
                    blockEventCount: 0,
                    reportEventCount: 0,
                    totalEventCount: 0,
                    accountIds: new Set(),
                    reportPathCounts: {},
                    blockReasonCounts: {},
                    topicHintCounts: {},
                };
            }
            if (ev.sourceOwner) sourceAgg[ev.sourceUrl].sourceOwners.add(ev.sourceOwner);
            if (ev.snippet) sourceAgg[ev.sourceUrl].sourceTextSamples.add(ev.snippet);
        });
        const sources = Object.values(sourceAgg).map((src) => {
            const evidence = evidenceIndexMap[src.sourceUrl] || {};
            const reportPathVariety = Object.keys(src.reportPathCounts).length;
            const topicHintVariety = Object.keys(src.topicHintCounts).length;
            const manipulationSignalScore = Math.min(100,
                src.reportEventCount * 10 +
                src.accountIds.size * 4 +
                reportPathVariety * 8 +
                topicHintVariety * 3 +
                (src.blockEventCount > 0 && src.reportEventCount > 0 ? 8 : 0)
            );
            const manipulationRiskLevel = manipulationSignalScore >= 65 ? 'high' : (manipulationSignalScore >= 45 ? 'medium' : 'low');
            return {
                sourceUrl: src.sourceUrl,
                sourceOwners: Array.from(src.sourceOwners),
                sourceTextSamples: Array.from(src.sourceTextSamples).slice(0, 3),
                blockEventCount: src.blockEventCount,
                reportEventCount: src.reportEventCount,
                totalEventCount: src.totalEventCount,
                uniqueAccountCount: src.accountIds.size,
                accountIds: Array.from(src.accountIds),
                reportPathCounts: src.reportPathCounts,
                blockReasonCounts: src.blockReasonCounts,
                topicHintCounts: src.topicHintCounts,
                topTopicHints: Object.entries(src.topicHintCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([topicHint, count]) => ({ topicHint, count })),
                manipulationSignalScore,
                manipulationRiskLevel,
                evidence: {
                    capturedAt: evidence.capturedAt || 0,
                    updatedAt: evidence.updatedAt || 0,
                    captureCount: evidence.captureCount || 0,
                    textHash: evidence.textHash || '',
                    snippet: evidence.snippet || '',
                    sourceOwner: evidence.sourceOwner || '',
                    sourceChannel: evidence.sourceChannel || '',
                },
                platformReview: {
                    isLikelyNarrativeManipulation: null,
                    isLikelyFakeTopic: null,
                    isLikelyAICampaign: null,
                    confidence: null,
                    reviewNote: '',
                },
            };
        }).sort((a, b) => b.totalEventCount - a.totalEventCount);

        const topicMap = {};
        reportEvents.forEach((event) => {
            const leaf = event.reportLeafCategory || '';
            if (!leaf) return;
            if (!topicMap[leaf]) topicMap[leaf] = { category: leaf, eventCount: 0, accountIds: new Set(), sourceUrls: new Set() };
            topicMap[leaf].eventCount++;
            if (event.accountId) topicMap[leaf].accountIds.add(event.accountId);
            if (event.sourceUrl) topicMap[leaf].sourceUrls.add(event.sourceUrl);
        });
        const topicSeeds = Object.values(topicMap)
            .map((topic) => ({
                topicLabel: topic.category,
                eventCount: topic.eventCount,
                accountCount: topic.accountIds.size,
                sourceCount: topic.sourceUrls.size,
                sampleAccounts: Array.from(topic.accountIds).slice(0, 5),
                sampleSources: Array.from(topic.sourceUrls).slice(0, 5),
            }))
            .sort((a, b) => b.eventCount - a.eventCount)
            .slice(0, 20);

        const narrativeSeeds = sources.slice(0, 20).map((src) => ({
            sourceUrl: src.sourceUrl,
            sourceOwners: src.sourceOwners,
            sourceTextSamples: src.sourceTextSamples,
            totalEventCount: src.totalEventCount,
            blockEventCount: src.blockEventCount,
            reportEventCount: src.reportEventCount,
            uniqueAccountCount: src.uniqueAccountCount,
            dominantReportPaths: Object.entries(src.reportPathCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([path, count]) => ({ path, count })),
            dominantBlockReasons: Object.entries(src.blockReasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reasonCode, count]) => ({ reasonCode, count })),
            dominantTopicHints: src.topTopicHints.slice(0, 5),
            manipulationSignalScore: src.manipulationSignalScore,
            manipulationRiskLevel: src.manipulationRiskLevel,
        }));
        const campaignCandidates = sources
            .filter(src => src.manipulationSignalScore >= 45)
            .slice(0, 50)
            .map(src => ({
                sourceUrl: src.sourceUrl,
                sourceOwners: src.sourceOwners,
                sourceTextSamples: src.sourceTextSamples,
                manipulationSignalScore: src.manipulationSignalScore,
                manipulationRiskLevel: src.manipulationRiskLevel,
                blockEventCount: src.blockEventCount,
                reportEventCount: src.reportEventCount,
                uniqueAccountCount: src.uniqueAccountCount,
                topTopicHints: src.topTopicHints.slice(0, 5),
                dominantReportPaths: Object.entries(src.reportPathCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([path, count]) => ({ path, count })),
            }));
        const suspiciousAccountSeeds = accounts
            .filter(acc => acc.platformReview.suspicionScore >= 35)
            .slice(0, 50)
            .map(acc => ({
                accountId: acc.accountId,
                profileUrl: acc.profileUrl,
                suspicionScore: acc.platformReview.suspicionScore,
                riskLevel: acc.platformReview.riskLevel,
                blockEventCount: acc.blockEventCount,
                reportEventCount: acc.reportEventCount,
                sourceUrlCount: acc.sourceUrlCount,
                reportLeafCategoryCount: acc.reportLeafCategories.length,
            }));

        const exportPayload = {
            schema: 'threadsblocker.platform_upload.v2',
            clientSourceId: Storage.getPlatformSourceId(),
            exportedAt: new Date().toISOString(),
            exporter: {
                tool: 'ThreadsBlocker',
                version: CONFIG.VERSION,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
                locale: (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : '',
            },
            fieldSpec: {
                root: ['clientSourceId', 'exportedAt', 'exporter', 'syncPreferences', 'fieldSpec', 'summary', 'accounts', 'events', 'sources', 'sourceEvidence', 'analysisSeeds'],
                accounts: ['accountId', 'profileUrl', 'blockEventCount', 'reportEventCount', 'totalEventCount', 'firstSeenAt', 'lastSeenAt', 'sourceUrlCount', 'sourceUrls', 'sourceOwners', 'blockReasons', 'reportPrimaryCategories', 'reportLeafCategories', 'platformReview'],
                events: ['eventId', 'eventType', 'accountId', 'profileUrl', 'eventAt', 'sourceUrl', 'sourceOwner', 'sourceText', 'sourceChannel', 'blockReasonCode', 'reportPath', 'reportPrimaryCategory', 'reportLeafCategory', 'reportTargetType', 'batchId'],
                sources: ['sourceUrl', 'sourceOwners', 'sourceTextSamples', 'blockEventCount', 'reportEventCount', 'totalEventCount', 'uniqueAccountCount', 'accountIds', 'reportPathCounts', 'blockReasonCounts', 'topicHintCounts', 'topTopicHints', 'manipulationSignalScore', 'manipulationRiskLevel', 'platformReview'],
                sourceEvidence: ['sourceUrl', 'capturedAt', 'updatedAt', 'captureCount', 'sourceOwner', 'sourceChannel', 'lastEventType', 'textHash', 'snippet'],
                analysisSeeds: ['suspiciousAccounts', 'campaignCandidates', 'topicSeeds', 'narrativeSeeds'],
            },
            syncPreferences: {
                autoSyncEnabled: platformSyncEnabled,
                lastSyncedAt: platformSyncLastAt || 0,
            },
            summary: {
                accountCount: accounts.length,
                blockEventCount: blockEvents.length,
                reportEventCount: reportEvents.length,
                totalEventCount: unifiedEvents.length,
                bothBlockedAndReportedAccountCount: accounts.filter(acc => acc.blockEventCount > 0 && acc.reportEventCount > 0).length,
                sourcedBlocked: sourcedBlockCount,
                sourcedReported: sourcedReportCount,
                sourceCoveragePct,
                reportSourceCoveragePct,
                sourcePostCount: sources.length,
                sourceEvidenceCount: sourceEvidenceList.length,
                sourceEvidenceCoveragePct,
                sourceEvidenceSnippetCoveragePct,
                suspiciousCandidateCount: suspiciousAccountSeeds.length,
                campaignCandidateCount: campaignCandidates.length,
                topTopicSeedCount: topicSeeds.length,
            },
            accounts,
            events: unifiedEvents,
            sources,
            sourceEvidence: sourceEvidenceList,
            analysisSeeds: {
                suspiciousAccounts: suspiciousAccountSeeds,
                campaignCandidates,
                topicSeeds,
                narrativeSeeds,
            },
        };
        const previewRows = unifiedEvents.slice(0, 6).map((event) => ({
            eventType: event.eventType,
            accountId: event.accountId,
            sourceUrl: event.sourceUrl,
            topicHint: event.reportLeafCategory || event.blockReasonCode || '',
            t: event.eventAt || 0,
        }));

        const overlay = document.createElement('div');
        overlay.id = 'hege-analytics-overlay';
        overlay.className = 'hege-manager-overlay';

        const htmlContent = `
            <div class="hege-manager-box" style="max-width: 580px; width: 90vw; max-height: 85vh;">
                <div class="hege-manager-header">
                    <span class="hege-manager-title" style="display:flex;align-items:center;gap:6px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5ac8fa" stroke-width="2"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg>
                        來源分析報告
                    </span>
                    <span class="hege-manager-close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </span>
                </div>
                <div style="padding:16px;overflow-y:auto;max-height:calc(85vh - 60px);">
                    <div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:10px;">
                        <button id="hege-analytics-toggle-advanced" class="hege-manager-btn secondary" style="font-size:12px;padding:6px 10px;white-space:nowrap;">${analyticsShowAdvanced ? '隱藏進階分析' : '顯示進階分析'}</button>
                    </div>
                    <div style="font-size:11px;color:#666;font-weight:700;letter-spacing:1px;margin-bottom:8px;">成果概況</div>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
                        ${miniStat(totalBlocked, '封鎖帳號', '#ff453a', `${sourcedBlockCount} 筆有來源`)}
                        ${miniStat(reportHistory.length, '檢舉帳號', '#bf5af2', `${sourcedReportCount} 筆有來源`)}
                        ${miniStat(allProvenanceSources.length, '來源文章', '#5ac8fa', `${earliest} ~ ${latest}`)}
                        ${miniStat(todayCount, '今日新增動作', '#ffd60a', '封鎖 + 檢舉')}
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
                        ${miniStat(sevenDayCount, '近 7 天新增', '#4cd964', '封鎖 + 檢舉')}
                        ${miniStat(thirtyDayCount, '近 30 天新增', '#bf5af2', `${avgPerActiveDay} / 活躍日`)}
                        ${miniStat(totalSweepPosts, '水庫任務文章', '#5ac8fa', `${pendingSweepPosts} 篇待跑`)}
                        ${miniStat(totalSweepBlocked, '水庫累計封鎖', '#30d158', `${loopSweepPosts} 篇回訪中`)}
                    </div>

                    <div style="font-size:11px;color:#666;font-weight:700;letter-spacing:1px;margin-bottom:8px;">來源分析</div>
                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">來源資料概況</div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">
                            ${queueStat(`${sourcedBlockCount}/${totalBlocked}`, '有來源的封鎖', '#5ac8fa')}
                            ${queueStat(`${sourcedReportCount}/${reportHistory.length || 0}`, '有來源的檢舉', '#bf5af2')}
                            ${queueStat(`${sourceCoveragePct}%`, '封鎖來源覆蓋率', '#4cd964')}
                            ${queueStat(`${reportSourceCoveragePct}%`, '檢舉來源覆蓋率', '#bf5af2')}
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
                            ${queueStat(uniqueSources, '封鎖來源文章', '#ffd60a')}
                            ${queueStat(Object.keys(reportSourceMap).length, '檢舉來源文章', '#bf5af2')}
                            ${queueStat(allProvenanceSources.length, '交叉來源文章', '#5ac8fa')}
                            ${queueStat(legacyCount, '舊封鎖資料', legacyCount > 0 ? '#ff9f0a' : '#777')}
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px;">
                            ${queueStat(sourceEvidenceList.length, '來源證據筆數', '#5ac8fa')}
                            ${queueStat(`${sourceEvidenceCoveragePct}%`, '證據覆蓋率', '#4cd964')}
                            ${queueStat(`${sourceEvidenceSnippetCoveragePct}%`, '含文字快照率', '#bf5af2')}
                            ${queueStat(sourceEvidenceRecent7dCount, '7 天內更新', '#ffd60a')}
                        </div>
                    </div>

                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">判讀摘要</div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            ${insightRows.map(line => `<div style="font-size:12px;color:#ccc;line-height:1.45;background:#1a1a1a;border-radius:6px;padding:7px 8px;">${Utils.escapeHTML(line)}</div>`).join('')}
                        </div>
                    </div>

                    ${sourceEvidencePreview.length > 0 ? `
                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">來源證據快照（最近 ${sourceEvidencePreview.length} 筆）</div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            ${sourceEvidencePreview.map((ev, i) => `
                                <div style="display:flex;align-items:flex-start;gap:8px;padding:7px;background:#1a1a1a;border-radius:6px;">
                                    <span style="font-size:15px;font-weight:700;color:#555;min-width:18px;">${i + 1}</span>
                                    <div style="flex:1;min-width:0;">
                                        <a href="${Utils.escapeHTML(ev.sourceUrl || '')}" target="_blank" style="font-size:11px;color:#5ac8fa;text-decoration:none;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHTML((ev.sourceUrl || '').replace('https://www.threads.net', '').replace('https://www.threads.com', ''))}</a>
                                        <div style="font-size:10px;color:#777;margin-top:2px;">${ev.sourceOwner ? `@${Utils.escapeHTML(ev.sourceOwner)} · ` : ''}${ev.sourceChannel ? `來源 ${Utils.escapeHTML(ev.sourceChannel)} · ` : ''}hash ${Utils.escapeHTML(ev.textHash || '-')}</div>
                                        <div style="font-size:11px;color:#bbb;line-height:1.45;margin-top:3px;">${Utils.escapeHTML(ev.snippet || '(無文字快照)')}</div>
                                    </div>
                                    <div style="min-width:62px;text-align:right;">
                                        <div style="font-size:11px;color:#ffd60a;">x${ev.captureCount || 0}</div>
                                        <div style="font-size:10px;color:#666;">${ev.updatedAt ? new Date(ev.updatedAt).toLocaleDateString('zh-TW') : '-'}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${topProvenanceSources.length > 0 ? `
                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">封鎖 / 檢舉來源交叉表 TOP ${topProvenanceSources.length}</div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            ${topProvenanceSources.map(([url, info], i) => {
                                const pathSummary = Object.entries(info.reportPaths).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([path, count]) => `${Utils.escapeHTML(path)} ${count}`).join(' · ');
                                return `
                                <div style="display:flex;align-items:flex-start;gap:8px;padding:7px;background:#1a1a1a;border-radius:6px;">
                                    <span style="font-size:16px;font-weight:700;color:#555;min-width:20px;">${i + 1}</span>
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-size:12px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${info.postText ? Utils.escapeHTML(info.postText) : (info.postOwner ? '@' + Utils.escapeHTML(info.postOwner) : '未知來源貼文')}</div>
                                        <div style="font-size:10px;color:#777;margin-top:2px;">${info.postOwner ? `作者 @${Utils.escapeHTML(info.postOwner)} · ` : ''}${pathSummary || '無檢舉路徑紀錄'}</div>
                                        <a href="${Utils.escapeHTML(url)}" target="_blank" style="font-size:10px;color:#5ac8fa;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">${Utils.escapeHTML(url.replace('https://www.threads.net', '').replace('https://www.threads.com', ''))}</a>
                                    </div>
                                    <div style="display:flex;flex-direction:column;gap:3px;min-width:68px;text-align:right;">
                                        <span style="font-size:12px;font-weight:700;color:#ff453a;">封 ${info.blocked}</span>
                                        <span style="font-size:12px;font-weight:700;color:#bf5af2;">檢 ${info.reported}</span>
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>` : ''}

                    ${dailyEntries.length > 0 ? `
                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">近期封鎖量（${earliest} ~ ${latest}）</div>
                        <div style="display:flex;align-items:flex-end;gap:3px;height:80px;">
                            ${dailyEntries.map(([day, count]) => `
                                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
                                    <span style="font-size:9px;color:#888;margin-bottom:2px;">${count}</span>
                                    <div style="width:100%;background:#4cd964;border-radius:2px;min-height:2px;height:${Math.round(count/maxDaily*100)}%;" title="${day}: ${count} 人"></div>
                                    <span style="font-size:9px;color:#555;margin-top:2px;writing-mode:vertical-lr;">${day}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    ${topSources.length > 0 ? `
                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">封鎖來源文章排行 TOP ${topSources.length}（最大來源 ${topSourceShare}%）</div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            ${topSources.map(([url, info], i) => `
                                <div style="display:flex;align-items:flex-start;gap:8px;padding:6px;background:#1a1a1a;border-radius:6px;">
                                    <span style="font-size:16px;font-weight:700;color:#555;min-width:20px;">${i+1}</span>
                                    <div style="flex:1;min-width:0;">
                                        <div style="font-size:12px;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                            ${info.postText ? Utils.escapeHTML(info.postText) : (info.postOwner ? '@' + Utils.escapeHTML(info.postOwner) : '未知貼文')}
                                        </div>
                                        <div style="font-size:10px;color:#777;margin-top:2px;">
                                            ${info.postOwner ? `作者 @${Utils.escapeHTML(info.postOwner)} · ` : ''}${Object.entries(info.reasons).map(([k,c]) => `${reasonLabel[k] || k} ${c}`).join(' · ')}
                                        </div>
                                        <a href="${Utils.escapeHTML(url)}" target="_blank" style="font-size:10px;color:#5ac8fa;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">🔗 ${Utils.escapeHTML(url.replace('https://www.threads.net', ''))}</a>
                                    </div>
                                    <span style="font-size:14px;font-weight:700;color:#ff453a;min-width:40px;text-align:right;">${info.count} 人</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                        <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;">
                            <div style="font-weight:600;font-size:13px;margin-bottom:8px;">批次分析</div>
                            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                                ${queueStat(batchTotal, '批次數', '#5ac8fa')}
                                ${queueStat(avgBatchSize, '平均批量', '#4cd964')}
                                ${queueStat(maxBatchSize, '最大批量', '#ff9f0a')}
                            </div>
                        </div>
                        <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;">
                            <div style="font-weight:600;font-size:13px;margin-bottom:8px;">發文者來源 TOP ${topOwners.length}</div>
                            ${topOwners.length > 0 ? `<div style="display:flex;flex-direction:column;gap:5px;">
                                ${topOwners.map(([owner, info]) => `
                                    <div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#1a1a1a;border-radius:6px;padding:6px;">
                                        <span style="color:#5ac8fa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${Utils.escapeHTML(owner)}</span>
                                        <span style="color:#888;">${info.sources.size} 篇</span>
                                        <span style="color:#ff453a;font-weight:700;min-width:44px;text-align:right;">${info.count} 人</span>
                                    </div>`).join('')}
                            </div>` : `<div style="font-size:12px;color:#666;">沒有可分析的發文者資料</div>`}
                        </div>
                    </div>

                    <div style="font-size:11px;color:#666;font-weight:700;letter-spacing:1px;margin-bottom:8px;">匯出準備</div>
                    <div id="hege-analytics-upload-card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;background:#0f1720;border:1px solid #203040;border-radius:8px;padding:10px 12px;">
                        <div style="display:flex;flex-direction:column;gap:7px;min-width:0;flex:1;">
                            <div style="font-size:12px;color:#cfe8ff;line-height:1.45;">會整理封鎖與檢舉對象來自哪篇貼文、哪個批次與哪條檢舉路徑；可匯出 JSON 供平台分析。</div>
                            <label style="display:flex;align-items:flex-start;gap:8px;font-size:11px;color:#9fb9d1;line-height:1.45;">
                                <input id="hege-analytics-auto-sync-toggle" type="checkbox" ${platformSyncEnabled ? 'checked' : ''} style="margin-top:2px;">
                                <span>同意記錄「每日自動同步」偏好（Beta）。目前會把此偏好隨 upload 一起送出，供平台建立 trusted sync 與樣本分級；最近一次成功上傳：${platformSyncLastAt > 0 ? new Date(platformSyncLastAt).toLocaleString('zh-TW') : '尚未'}</span>
                            </label>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                            <button id="hege-analytics-export-provenance" class="hege-manager-btn" style="font-size:12px;padding:8px 10px;white-space:nowrap;background:#5ac8fa;color:#001018;border:none;border-radius:7px;font-weight:700;cursor:pointer;">匯出來源 JSON</button>
                            <button id="hege-analytics-upload-platform" class="hege-manager-btn" style="font-size:12px;padding:8px 10px;white-space:nowrap;background:#30d158;color:#00150a;border:none;border-radius:7px;font-weight:700;cursor:pointer;">一鍵上傳平台</button>
                        </div>
                    </div>
                    <div id="hege-analytics-upload-status" style="font-size:11px;color:#888;margin-top:-8px;margin-bottom:12px;"></div>
                    ${analyticsShowAdvanced ? `
                    <div style="font-size:11px;color:#666;font-weight:700;letter-spacing:1px;margin-bottom:8px;">進階分析</div>
                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">自動化背景</div>
                        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
                            ${queueStat(cockroachCount, '大蟑螂名單', '#ff9f0a')}
                            ${queueStat(activeQueue.length, '待封鎖 queue', activeQueue.length > 0 ? '#ff453a' : '#777')}
                            ${queueStat(failedQueue.length, '失敗可重試', failedQueue.length > 0 ? '#ff9f0a' : '#777')}
                            ${queueStat(cooldownQueue.length, cooldownUntil > Date.now() ? '冷卻備份中' : '冷卻備份', cooldownQueue.length > 0 ? '#ff9f0a' : '#777')}
                        </div>
                    </div>

                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">封鎖原因分布</div>
                        ${Object.entries(reasonCounts).filter(([,c]) => c > 0).map(([k,c]) => reasonBar(k, c)).join('')}
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                        <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;">
                            <div style="font-weight:600;font-size:13px;margin-bottom:8px;">批次分析</div>
                            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                                ${queueStat(batchTotal, '批次數', '#5ac8fa')}
                                ${queueStat(avgBatchSize, '平均批量', '#4cd964')}
                                ${queueStat(maxBatchSize, '最大批量', '#ff9f0a')}
                            </div>
                        </div>
                        <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;">
                            <div style="font-weight:600;font-size:13px;margin-bottom:8px;">發文者來源 TOP ${topOwners.length}</div>
                            ${topOwners.length > 0 ? `<div style="display:flex;flex-direction:column;gap:5px;">
                                ${topOwners.map(([owner, info]) => `
                                    <div style="display:flex;align-items:center;gap:8px;font-size:12px;background:#1a1a1a;border-radius:6px;padding:6px;">
                                        <span style="color:#5ac8fa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${Utils.escapeHTML(owner)}</span>
                                        <span style="color:#888;">${info.sources.size} 篇</span>
                                        <span style="color:#ff453a;font-weight:700;min-width:44px;text-align:right;">${info.count} 人</span>
                                    </div>`).join('')}
                            </div>` : `<div style="font-size:12px;color:#666;">沒有可分析的發文者資料</div>`}
                        </div>
                    </div>

                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;margin-bottom:12px;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">平台上傳預覽</div>
                        <div style="font-size:11px;color:#888;line-height:1.45;margin-bottom:10px;">Schema v2 固定欄位：accounts / events / sources / sourceEvidence / analysisSeeds。已內建 suspiciousAccounts / campaignCandidates / topicSeeds，可直接送平台做假帳號與帶風向分析。</div>
                        ${previewRows.length > 0 ? `
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            ${previewRows.map(row => `
                                <div style="display:grid;grid-template-columns:52px 110px 1fr 120px 72px;gap:8px;align-items:center;font-size:11px;background:#1a1a1a;border-radius:6px;padding:7px 8px;">
                                    <span style="color:${row.eventType === 'block' ? '#ff453a' : '#bf5af2'};font-weight:700;">${row.eventType === 'block' ? 'block' : 'report'}</span>
                                    <span style="color:#5ac8fa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${Utils.escapeHTML(row.accountId || '')}</span>
                                    <span style="color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${Utils.escapeHTML(row.sourceUrl || '')}">${Utils.escapeHTML((row.sourceUrl || '').replace('https://www.threads.com', '').replace('https://www.threads.net', ''))}</span>
                                    <span style="color:#777;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHTML(row.topicHint || '')}</span>
                                    <span style="color:#555;text-align:right;">${row.t ? new Date(row.t).toLocaleDateString('zh-TW') : ''}</span>
                                </div>`).join('')}
                        </div>` : `<div style="font-size:12px;color:#666;">目前還沒有可預覽的匯出資料。</div>`}
                    </div>

                    ${recentWithContext.length > 0 ? `
                    <div style="background:#111;border-radius:8px;padding:12px;border:1px solid #2a2a2a;">
                        <div style="font-weight:600;font-size:13px;margin-bottom:8px;">最近封鎖紀錄</div>
                        <div style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto;">
                            ${recentWithContext.map(e => `
                                <div style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:#1a1a1a;border-radius:4px;font-size:12px;">
                                    <a href="https://www.threads.net/@${Utils.escapeHTML(e.username)}" target="_blank" style="color:#5ac8fa;text-decoration:none;min-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">@${Utils.escapeHTML(e.username)}</a>
                                    <span style="color:#555;min-width:50px;">${e.reason ? reasonLabel[e.reason] || e.reason : ''}</span>
                                    <span style="color:#444;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;">${e.postText ? Utils.escapeHTML(e.postText.substring(0, 40)) : ''}</span>
                                    <span style="color:#444;font-size:10px;min-width:70px;text-align:right;">${e.t ? new Date(e.t).toLocaleDateString() : ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : `
                    <div style="background:#111;border-radius:8px;padding:20px;border:1px solid #2a2a2a;text-align:center;color:#555;">
                        尚無結構化封鎖紀錄。新封鎖的帳號會自動記錄來源與原因。
                    </div>`}
                    ` : `
                    <div style="font-size:11px;color:#666;margin-bottom:12px;">進階分析已收合（可展開查看自動化背景、批次分析、預覽樣本與最近封鎖紀錄）</div>
                    `}

                </div>
            </div>
        `;
        Utils.setHTML(overlay, htmlContent);
        document.body.appendChild(overlay);

        overlay.querySelector('.hege-manager-close').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        const exportBtn = overlay.querySelector('#hege-analytics-export-provenance');
        if (exportBtn) {
            exportBtn.onclick = async (e) => {
                e.stopPropagation();
                const text = JSON.stringify(exportPayload, null, 2);
                try {
                    await navigator.clipboard.writeText(text);
                    UI.showToast(`已複製 v2 JSON（封鎖 ${exportPayload.summary.blockEventCount}、檢舉 ${exportPayload.summary.reportEventCount}）`);
                } catch (err) {
                    prompt('請手動複製來源分析 JSON：', text);
                }
            };
        }
        const uploadBtn = overlay.querySelector('#hege-analytics-upload-platform');
        const uploadStatusEl = overlay.querySelector('#hege-analytics-upload-status');
        const uploadCardEl = overlay.querySelector('#hege-analytics-upload-card');
        const autoSyncToggle = overlay.querySelector('#hege-analytics-auto-sync-toggle');
        if (autoSyncToggle) {
            autoSyncToggle.onchange = () => {
                Storage.setPlatformSyncEnabled(Boolean(autoSyncToggle.checked));
                if (uploadStatusEl) {
                    uploadStatusEl.textContent = autoSyncToggle.checked
                        ? '已記錄自動同步偏好；後續 trusted sync 會沿用此設定。'
                        : '已關閉自動同步偏好；目前只會在手動上傳時送出資料。';
                }
            };
        }
        if (uploadBtn) {
            uploadBtn.onclick = async (e) => {
                e.stopPropagation();
                uploadBtn.disabled = true;
                uploadBtn.style.opacity = '0.7';
                if (uploadStatusEl) uploadStatusEl.textContent = '平台上傳中...';

                try {
                    exportPayload.syncPreferences.autoSyncEnabled = Storage.getPlatformSyncEnabled();
                    exportPayload.syncPreferences.lastSyncedAt = Storage.getPlatformSyncLastAt();
                    const result = await Reporter.submitPlatformPayload(exportPayload, { source: 'analytics_overlay', trigger: 'manual' });
                    if (Number(result?.code) === 200) {
                        if (result?.duplicate) {
                            if (uploadStatusEl) uploadStatusEl.textContent = `已存在相同批次（ID ${result?.id || '-'}）`;
                            UI.showToast(`平台已存在同批資料（ID ${result?.id || '-'}）`);
                        } else {
                            if (uploadStatusEl) uploadStatusEl.textContent = `上傳成功（批次 ID ${result?.id || '-'}；樣本層級 ${result?.trustTier || 'legacy'}）`;
                            UI.showToast(`平台上傳成功（ID ${result?.id || '-'}）`);
                        }
                    } else {
                        const msg = result?.message || '未知錯誤';
                        if (uploadStatusEl) uploadStatusEl.textContent = `上傳失敗：${msg}`;
                        UI.showToast(`平台上傳失敗：${msg}`);
                    }
                } catch (err) {
                    const msg = err?.message || String(err);
                    if (uploadStatusEl) uploadStatusEl.textContent = `上傳失敗：${msg}`;
                    UI.showToast(`平台上傳失敗：${msg}`);
                } finally {
                    uploadBtn.disabled = false;
                    uploadBtn.style.opacity = '1';
                }
            };
        }
        if (options.focusUpload && uploadCardEl) {
            uploadCardEl.style.borderColor = '#30d158';
            uploadCardEl.style.boxShadow = '0 0 0 1px rgba(48,209,88,0.45), 0 0 20px rgba(48,209,88,0.2)';
            uploadCardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (uploadStatusEl && !uploadStatusEl.textContent) {
                uploadStatusEl.textContent = '提示：按「一鍵上傳平台」即可提交一般使用者資料。';
            }
        }
        const toggleAdvancedBtn = overlay.querySelector('#hege-analytics-toggle-advanced');
        if (toggleAdvancedBtn) {
            toggleAdvancedBtn.onclick = (e) => {
                e.stopPropagation();
                Storage.set(CONFIG.KEYS.ANALYTICS_SHOW_ADVANCED, analyticsShowAdvanced ? 'false' : 'true');
                overlay.remove();
                UI.showAnalyticsReport();
            };
        }
    },

    // ========================================================================
    // 貼文水庫統一管理介面（Phase 1）
    // 合併原「定點絕排程」+「深層清理水庫」，每篇貼文可獨立設定兩個旗標：
    //   🎯 定點絕 (advanceOnComplete) — 掃完跳下一篇
    //   💧 深層清理 (longTermLoop) — 每 8h 自動回訪
    // ========================================================================
    showPostReservoir: (options = {}) => {
        if (document.getElementById('hege-reservoir-overlay')) return;

        const onStart = options.onStart;

        const statusBadge = (entry) => {
            // 引擎實際 status 值：'pending' / 'sweeping' / 'cooldown' / 'done' / 'error'
            if (entry.status === 'sweeping' || entry.status === 'active') {
                const batch = entry.batchCount ? `第 ${entry.batchCount} 批` : '';
                return `<span style="font-size:10px; color:#ff9500; background:#2d2200; padding:2px 6px; border-radius:4px;">🟡 執行中${batch ? ' · ' + batch : ''}</span>`;
            }
            if (entry.status === 'error') {
                return `<span style="font-size:10px; color:#ff453a; background:#2d0f0f; padding:2px 6px; border-radius:4px;">⚠️ 異常</span>`;
            }
            if (entry.status === 'done' || entry.done) {
                if (entry.longTermLoop) {
                    return `<span style="font-size:10px; color:#4cd964; background:#0e2e18; padding:2px 6px; border-radius:4px;">🔁 待回訪</span>`;
                }
                return `<span style="font-size:10px; color:#4cd964; background:#0e2e18; padding:2px 6px; border-radius:4px;">✅ 已完成</span>`;
            }
            return `<span style="font-size:10px; color:#888; background:#222; padding:2px 6px; border-radius:4px;">⚫ 待處理</span>`;
        };

        // 模式 badge：ON 彩色 + 可點擊關閉，OFF 灰色 + 可點擊開啟
        const modeBadges = (entry) => {
            const baseStyle = 'display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:30px;padding:6px 10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;line-height:1;user-select:none;';
            const onAdvance = `<span class="hege-mode-badge" data-url="${entry.url}" data-flag="advance" style="${baseStyle} color:#ffb340; background:#2d2200; border:1px solid #6b4a00;" title="點擊關閉定點絕">🎯 定點絕</span>`;
            const offAdvance = `<span class="hege-mode-badge" data-url="${entry.url}" data-flag="advance" style="${baseStyle} color:#777; background:#171717; border:1px solid #333;" title="點擊開啟定點絕">🎯 定點絕</span>`;
            const onLoop = `<span class="hege-mode-badge" data-url="${entry.url}" data-flag="loop" style="${baseStyle} color:#7fd2ff; background:#0a2332; border:1px solid #1f6588;" title="點擊關閉深層清理">💧 深層清理</span>`;
            const offLoop = `<span class="hege-mode-badge" data-url="${entry.url}" data-flag="loop" style="${baseStyle} color:#777; background:#171717; border:1px solid #333;" title="點擊開啟深層清理">💧 深層清理</span>`;
            return (entry.advanceOnComplete ? onAdvance : offAdvance) + ' ' + (entry.longTermLoop ? onLoop : offLoop);
        };

        const statsLine = (entry) => {
            const bits = [];
            if (entry.sweepCount > 0) bits.push(`已掃 ${entry.sweepCount} 輪`);
            if (entry.totalBlocked > 0) bits.push(`共封 ${entry.totalBlocked} 人`);
            if (entry.lastSweptAt > 0) {
                const ago = Date.now() - entry.lastSweptAt;
                const h = Math.floor(ago / 3600000);
                const m = Math.floor((ago % 3600000) / 60000);
                bits.push(`上次 ${h > 0 ? h + 'h' : m + 'm'} 前`);
            }
            return bits.join(' · ');
        };

        const renderOverlay = () => {
            const existing = document.getElementById('hege-reservoir-overlay');
            if (existing) existing.remove();

            const entries = Storage.postReservoir.getAll();
            const history = Storage.getJSON(CONFIG.KEYS.ENDLESS_HISTORY, []);
            const pendingAdvanceCount = entries.filter(p => p.advanceOnComplete && (p.status === 'pending' || p.status === 'done' || p.done === true)).length;
            const sweepRuntime = Utils.getSweepRuntimeState();
            const isEndlessRunning = sweepRuntime.running;

            const hasStartHandler = typeof onStart === 'function';
            const canStart = pendingAdvanceCount > 0 && !isEndlessRunning && hasStartHandler;
            const runningReason = sweepRuntime.flowActive
                ? `流程狀態：${sweepRuntime.state}`
                : (sweepRuntime.waitForBgActive
                    ? `等待 worker 清空佇列（目前 ${sweepRuntime.bgQueueLen} 人）`
                    : 'worker 待命或執行中');
            const startActionHtml = (() => {
                if (!hasStartHandler) return '';
                if (canStart) {
                    return `<button id="hege-reservoir-start" class="hege-manager-btn" style="padding:10px; font-size:13px; font-weight:700; background:#ff3b30; color:#fff; border:none; border-radius:8px; cursor:pointer;">🚀 立即執行定點絕（${pendingAdvanceCount} 篇待跑）</button>`;
                }
                if (pendingAdvanceCount > 0 && isEndlessRunning) {
                    return `
                        <div style="display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid #3a3020; background:#17130b; border-radius:8px;">
                            <button class="hege-manager-btn" disabled style="padding:10px; font-size:13px; font-weight:700; background:#333; color:#999; border:none; border-radius:8px; cursor:not-allowed;">定點絕執行中（${pendingAdvanceCount} 篇待跑）</button>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                                <span style="font-size:11px; color:#c9a86a; line-height:1.35;">${runningReason}</span>
                                <button id="hege-reservoir-reset-run-state" class="hege-manager-btn secondary" style="font-size:12px; padding:7px 10px; white-space:nowrap;">重置執行狀態</button>
                            </div>
                        </div>`;
                }
                if (entries.length > 0) {
                    return `<div style="padding:10px; border:1px solid #2a2a2a; background:#111; border-radius:8px; font-size:11px; color:#888; line-height:1.4;">沒有可立即執行的定點絕。請先把文章下方的「🎯 定點絕」點亮。</div>`;
                }
                return '';
            })();

            const overlay = document.createElement('div');
            overlay.id = 'hege-reservoir-overlay';
            overlay.className = 'hege-manager-overlay';

            const rows = entries.length === 0
                ? `<div style="padding:32px; text-align:center; color:#555;">貼文水庫為空<br><span style="font-size:11px;">新增貼文或在貼文頁標記為大蟑螂</span></div>`
                : entries.map((entry, i) => {
                    const label = entry.label || entry.url;
                    const short = label.length > 40 ? label.slice(0, 40) + '…' : label;
                    return `
                    <div class="hege-menu-item" data-url="${entry.url}" style="flex-direction:column; align-items:flex-start; gap:6px; padding:10px 14px;">
                        <div style="display:flex; align-items:center; gap:6px; width:100%;">
                            ${statusBadge(entry)}
                            <span style="font-size:12px; color:#f5f5f5; flex:1; word-break:break-all;">${short}</span>
                            ${entry.status !== 'pending' ? `<span class="hege-reservoir-reset" data-url="${entry.url}" style="font-size:14px; color:#5ac8fa; cursor:pointer; padding:0 6px; line-height:1;" title="重置狀態">🔄</span>` : ''}
                            <span class="hege-reservoir-remove" data-url="${entry.url}" style="font-size:18px; color:#555; cursor:pointer; padding:0 4px; line-height:1;">×</span>
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; padding-left:2px;">
                            ${modeBadges(entry)}
                        </div>
                        ${statsLine(entry) ? `<div style="font-size:10px; color:#555; padding-left:2px;">${statsLine(entry)}</div>` : ''}
                    </div>`;
                }).join('');

            const histRows = history.length === 0 ? '' : history.slice().reverse().slice(0, 10).map(h => {
                const label = h.label || h.url;
                const short = label.length > 40 ? label.slice(0, 40) + '…' : label;
                const date = new Date(h.completedAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return `<div style="padding:8px 14px; border-bottom:1px solid #1a1a1a; display:flex; flex-direction:column; gap:3px;">
                    <span style="font-size:11px; color:#f5f5f5;">${short}</span>
                    <span style="font-size:10px; color:#555;">${date} · ${h.totalBatches} 批 · ${h.totalBlocked} 人</span>
                </div>`;
            }).join('');

            overlay.innerHTML = `
                <div class="hege-manager-box" style="max-width:440px;">
                    <div class="hege-manager-header">
                        <span class="hege-manager-title">貼文水庫 (${entries.length} 篇)</span>
                        <span class="hege-manager-close">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                        </span>
                    </div>
                    <div style="padding:8px 0; max-height:320px; overflow-y:auto;">
                        ${rows}
                    </div>
                    <div style="padding:12px 16px; border-top:1px solid #333; display:flex; flex-direction:column; gap:8px;">
                        ${startActionHtml}
                        <div style="display:flex; gap:8px;">
                            <input id="hege-reservoir-input" type="text" placeholder="貼入貼文網址 (/@.../post/...)" style="flex:1; background:#1a1a1a; border:1px solid #444; border-radius:6px; padding:8px 10px; color:#f5f5f5; font-size:12px; outline:none;">
                            <button id="hege-reservoir-add" class="hege-manager-btn" style="padding:8px 14px; font-size:12px;">新增</button>
                        </div>
                        <div style="display:flex; gap:12px; font-size:11px; color:#aaa; padding:4px 2px;">
                            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                <input type="checkbox" id="hege-reservoir-flag-advance" checked style="width:13px; height:13px;">
                                🎯 定點絕
                            </label>
                            <label style="display:flex; align-items:center; gap:4px; cursor:pointer;">
                                <input type="checkbox" id="hege-reservoir-flag-loop" style="width:13px; height:13px;">
                                💧 深層清理
                            </label>
                        </div>
                        ${entries.some(e => e.status === 'done' && e.advanceOnComplete && !e.longTermLoop) ? `<button id="hege-reservoir-clear-done" class="hege-manager-btn secondary" style="font-size:12px;">清除已完成的定點絕項目</button>` : ''}
                    </div>
                    ${history.length > 0 ? `
                    <div style="border-top:1px solid #333; max-height:200px; overflow-y:auto;">
                        <div style="padding:8px 14px; font-size:11px; color:#555; font-weight:600; letter-spacing:0.5px; position:sticky; top:0; background:#1a1a1a; z-index:1;">已完成紀錄（近 10 筆）</div>
                        ${histRows}
                    </div>` : ''}
                </div>
            `;
            document.body.appendChild(overlay);

            overlay.querySelector('.hege-manager-close').onclick = () => overlay.remove();

            if (canStart) {
                const startBtn = overlay.querySelector('#hege-reservoir-start');
                if (startBtn) {
                    startBtn.onclick = () => {
                        overlay.remove();
                        onStart();
                    };
                }
            }

            const resetRunBtn = overlay.querySelector('#hege-reservoir-reset-run-state');
            if (resetRunBtn) {
                resetRunBtn.onclick = () => {
                    Storage.remove('hege_sweep_worker_standby');
                    Storage.remove('hege_sweep_stopped');
                    Storage.remove(CONFIG.KEYS.BG_CMD);
                    sessionStorage.removeItem('hege_sweep_state');
                    sessionStorage.removeItem('hege_sweep_target');
                    sessionStorage.removeItem('hege_sweep_last_first_user');
                    sessionStorage.removeItem('hege_sweep_auto_triggered_once');
                    sessionStorage.removeItem('hege_sweep_wait_started_at');
                    sessionStorage.removeItem('hege_sweep_lock');
                    UI.showToast('定點絕執行狀態已重置');
                    renderOverlay();
                };
            }

            // 移除單篇
            overlay.querySelectorAll('.hege-reservoir-remove').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    Storage.postReservoir.removeEntry(btn.dataset.url);
                    renderOverlay();
                };
            });

            // 重置單篇狀態（卡住時用）
            overlay.querySelectorAll('.hege-reservoir-reset').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const url = btn.dataset.url;
                    const queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                    const updated = queue.map(p => {
                        if (p && p.url && p.url.split('?')[0] === url.split('?')[0]) {
                            return { ...p, status: 'pending', done: false };
                        }
                        return p;
                    });
                    Storage.setJSON(CONFIG.KEYS.POST_QUEUE, updated);
                    UI.showToast('狀態已重置為待處理');
                    renderOverlay();
                };
            });

            // 模式 badge 點擊切換（取代舊 confirm dialog）
            overlay.querySelectorAll('.hege-mode-badge').forEach(badge => {
                badge.onclick = (e) => {
                    e.stopPropagation();
                    const url = badge.dataset.url;
                    const flag = badge.dataset.flag;
                    const entry = Storage.postReservoir.getByUrl(url);
                    if (!entry) return;
                    // 防呆：至少要保留一個旗標開啟（否則 entry 會被清掉）
                    if (flag === 'advance') {
                        if (entry.advanceOnComplete && !entry.longTermLoop) {
                            UI.showToast('至少要保留一個模式開啟，否則請按 × 移除整筆');
                            return;
                        }
                        Storage.postReservoir.setFlags(url, { advanceOnComplete: !entry.advanceOnComplete });
                    } else if (flag === 'loop') {
                        if (entry.longTermLoop && !entry.advanceOnComplete) {
                            UI.showToast('至少要保留一個模式開啟，否則請按 × 移除整筆');
                            return;
                        }
                        Storage.postReservoir.setFlags(url, { longTermLoop: !entry.longTermLoop });
                    }
                    renderOverlay();
                };
            });

            // 新增貼文
            const input = overlay.querySelector('#hege-reservoir-input');
            const addBtn = overlay.querySelector('#hege-reservoir-add');
            const flagAdvance = overlay.querySelector('#hege-reservoir-flag-advance');
            const flagLoop = overlay.querySelector('#hege-reservoir-flag-loop');
            if (input) {
                input.onkeydown = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        addBtn.click();
                    }
                };
            }
            addBtn.onclick = () => {
                const raw = (input.value || '').trim();
                if (!raw || !raw.includes('/post/')) {
                    UI.showToast('請貼入有效的貼文網址');
                    return;
                }
                const advance = flagAdvance.checked;
                const loop = flagLoop.checked;
                if (!advance && !loop) {
                    UI.showToast('請至少勾選一個模式（🎯 定點絕 或 💧 深層清理）');
                    return;
                }
                Storage.postReservoir.addEntry(raw, {
                    label: raw.split('?')[0],
                    advanceOnComplete: advance,
                    longTermLoop: loop,
                });
                input.value = '';
                renderOverlay();
            };

            // 清除已完成
            const clearDoneBtn = overlay.querySelector('#hege-reservoir-clear-done');
            if (clearDoneBtn) {
                clearDoneBtn.onclick = () => {
                    Storage.postReservoir.clearDoneAdvance();
                    renderOverlay();
                };
            }
        };

        renderOverlay();
    },

    showEndlessPostQueueManager: (options = {}) => {
        UI.showPostReservoir(options);
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
                        <div class="user-info" style="flex:1;">
                            <a href="https://www.threads.net/@${safeU}" target="_blank" style="color: #4cd964; text-decoration: underline; font-weight: 600;" onclick="event.stopPropagation()">@${safeU}</a>
                            <span class="time">${timeStr}</span>
                        </div>
                        <button class="hege-cockroach-open-profile" data-username="${safeU}" style="background:#5ac8fa; color:#001018; border:1px solid #5ac8fa; border-radius:6px; padding:5px 8px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">📂 開啟主頁</button>
                    </div>
                `;
            }).join('');

            listEl.querySelectorAll('.hege-cockroach-open-profile').forEach(btn => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const username = btn.dataset.username;
                    window.open(`https://www.threads.com/@${username}`, '_blank');
                    UI.showToast(`已開啟 @${username} 主頁，可在新 tab 手動定點絕想清的貼文`);
                };
            });

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
                        ${backArrow}大蟑螂名單 (Cockroach DB)
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

        // 向下相容：timestamp 可能是數字（舊格式）或物件（新格式 {t, src, reason, ...}）
        const getTs = (u) => { const e = timestamps[u]; return typeof e === 'object' && e !== null ? (e.t || 0) : (e || 0); };

        const sortUsers = () => {
            if (sortMode === 0) { // Time Desc
                users = [...blockedList].sort((a, b) => getTs(b) - getTs(a));
            } else if (sortMode === 1) { // Time Asc
                users = [...blockedList].sort((a, b) => getTs(a) - getTs(b));
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
                const time = getTs(u) ? new Date(getTs(u)).toLocaleString() : '無記錄時間';
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
