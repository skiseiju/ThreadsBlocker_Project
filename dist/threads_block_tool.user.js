// ==UserScript==
// @name         留友封 (Threads 封鎖工具)
// @namespace    http://tampermonkey.net/
// @version      2.5.0-beta46
// @description  Modular Refactor Build
// @author       海哥
// @match        https://www.threads.net/*
// @match        https://threads.net/*
// @match        https://www.threads.com/*
// @match        https://threads.com/*
// @match        https://*.threads.net/*
// @match        https://*.threads.com/*
// @match        http://*.threads.net/*
// @match        http://*.threads.com/*
// @match        *://*.threads.net/*
// @match        *://*.threads.com/*
// @include      *://*.threads.net/*
// @include      *://*.threads.com/*
// @include      *://threads.net/*
// @include      *://threads.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=threads.net
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// ==/UserScript==

(function() {
    'use strict';
    console.log('[HegeBlock] Content Script Injected, Version: 2.5.0-beta46');
// --- config.js ---
const CONFIG = {
    VERSION: '2.5.0-beta46', // Safari-compatible stable release
    UNBLOCK_PREFIX: 'UNBLOCK:',

    BUG_REPORT_URL: 'https://script.google.com/macros/s/AKfycbxZ1cdDUST_8x2gpsYcV6gCENLqpxnb53VTaXW6MaeGV8Mbh8rcrDz9rYJkqwlYWeY4/exec',
    BUG_REPORT_SALT: 'PGO_BETA_2026_SALT',

    DEBUG_MODE: false,

    // 速度模式：'smart' | 'stable' | 'standard' | 'turbo'
    SPEED_PROFILES: {
        smart:    { label: '🧠 智慧模式', multiplier: 1.0, usePolling: true,  warnOnSelect: false },
        stable:   { label: '🛡️ 穩定模式', multiplier: 1.5, usePolling: false, warnOnSelect: false },
        standard: { label: '⚡ 標準模式', multiplier: 1.0, usePolling: false, warnOnSelect: false },
        turbo:    { label: '🚀 加速模式', multiplier: 0.4, usePolling: true,  warnOnSelect: true, forceVerify: true },
    },
    
    // 延時封鎖常數 (Task 1)
    DELAY_HOURS: 8,
    MAX_BLOCKS_PER_BATCH: 100,
    
    // 深層貼文收割常數 (Task 4)
    POST_SWEEP_BATCH_SIZE: 30, // 測試期 30 人
    POST_SWEEP_COOLDOWN_HOURS: 8,

    KEYS: {
        DB_KEY: 'hege_block_db_v1',
        PENDING: 'hege_pending_users',
        BG_STATUS: 'hege_bg_status',
        BG_QUEUE: 'hege_active_queue',
        BG_CMD: 'hege_bg_command',
        COOLDOWN: 'hege_rate_limit_until',
        POST_FALLBACK: 'hege_post_fallback',
        WORKER_STATS: 'hege_worker_stats',
        CONSOLE_LOGS: 'hege_web_console_logs',
        VERSION_CHECK: 'hege_version_check',
        POS: 'hege_panel_pos',
        STATE: 'hege_panel_state',
        DISCLAIMER_AGREED: 'hege_disclaimer_agreed_v2_1',
        FAILED_QUEUE: 'hege_failed_queue',
        COOLDOWN_QUEUE: 'hege_cooldown_queue',
        DB_TIMESTAMPS: 'hege_block_timestamps',
        VERIFY_PENDING: 'hege_verify_pending',
        DEBUG_LOG: 'hege_debug_log',
        SPEED_MODE: 'hege_speed_mode',
        DIAG_LOG: 'hege_diag_log',
        TURBO_WARNED: 'hege_turbo_warned',
        BATCH_VERIFY: 'hege_batch_verify',
        
        // Task 1: 延時封鎖
        DELAYED_QUEUE: 'hege_delayed_queue',
        DELAYED_BLOCK_ENABLED: 'hege_delayed_block_enabled',
        LAST_BATCH_TIME: 'hege_last_batch_time',
        
        // Task 2: 大蟑螂
        COCKROACH_DB: 'hege_cockroach_db_v1',
        
        // Task 3: 進階同列全封
        ADVANCED_SCROLL_ENABLED: 'hege_advanced_scroll_enabled',

        // GraphQL API 深度挖掘
        GRAPHQL_DOC_ID: 'hege_graphql_likers_doc_id',

        // 貼文深層收割
        POST_QUEUE: 'hege_post_sweep_queue'
    },
    // 多語系封鎖/解除封鎖文字偵測（含：中/英/西/法/德/義/日/韓/印尼/俄/波蘭/土耳其）
    BLOCK_TEXTS: ['封鎖', 'Block', 'Bloquear', 'Bloquer', 'Blockieren', 'Blocca', 'ブロック', '차단', 'Blokir', 'Заблокировать', 'Zablokuj', 'Engelle'],
    UNBLOCK_TEXTS: ['解除封鎖', 'Unblock', 'Desbloquear', 'Débloquer', 'Blockierung aufheben', 'Sblocca', 'ブロックを解除', '차단 해제', 'Buka blokir', 'Разблокировать', 'Odblokuj', 'Engeli kaldır'],

    SELECTORS: {
        MORE_SVG: 'svg[aria-label="更多"], svg[aria-label="More"], svg[aria-label="もっと見る"], svg[aria-label="더 보기"], svg[aria-label="Más"], svg[aria-label="Plus"], svg[aria-label="Mehr"], svg[aria-label="Altro"], svg[aria-label="Lainnya"], svg[aria-label="Ещё"]',
        MENU_ITEM: 'div[role="menuitem"], div[role="button"]',
        DIALOG: 'div[role="dialog"]',
        DIALOG_HEADER: 'div[role="dialog"] h1',
        DIALOG_USER_LINK: 'div[role="dialog"] div.html-div a[href^="/@"]',
    }
};

// --- utils.js ---



const Utils = {
    escapeHTML: (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    _myUsername: null,
    getMyUsername: () => {
        if (Utils._myUsername) return Utils._myUsername;

        // Approach: Find the profile link in the navigation bar
        const allLinks = document.querySelectorAll('a[href^="/@"]');
        for (let a of allLinks) {
            // Usually the navigation bar links are outside the main feed role
            if (!a.closest('main') && !a.closest('div[role="main"]') && !a.closest('div[data-pressable-container="true"]')) {
                // Profile nav link usually has an SVG or no text
                if (a.textContent.trim() === '' || a.querySelector('svg')) {
                    const href = a.getAttribute('href');
                    if (href) {
                        try {
                            const u = href.split('/@')[1].split('/')[0];
                            if (u) {
                                Utils._myUsername = u;
                                return u;
                            }
                        } catch (e) { }
                    }
                }
            }
        }
        return null;
    },

    getPostOwner: () => {
        const path = window.location.pathname;
        // Format: /@username/post/postId
        if (path.includes('/post/')) {
            const match = path.match(/^\/@([^/]+)\/post\//);
            if (match && match[1]) return match[1];
        }
        return null;
    },
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),

    // 取得當前速度設定
    getSpeedProfile: () => {
        const mode = Storage.get(CONFIG.KEYS.SPEED_MODE) || 'smart';
        return CONFIG.SPEED_PROFILES[mode] || CONFIG.SPEED_PROFILES.smart;
    },

    getSpeedMode: () => {
        // 總是從 localStorage 直接讀取，避免跨 tab cache 不同步
        Storage.invalidate(CONFIG.KEYS.SPEED_MODE);
        return Storage.get(CONFIG.KEYS.SPEED_MODE) || 'smart';
    },

    // 依速度模式調整的 sleep（智慧/加速模式用 polling 時會被 pollUntil 取代）
    speedSleep: (ms) => {
        const profile = Utils.getSpeedProfile();
        const adjusted = Math.max(50, Math.round(ms * profile.multiplier));
        return new Promise(r => setTimeout(r, adjusted));
    },

    // Safety-critical sleep — 不受速度模式影響，用於頁面載入 fallback、rate limit breather 等
    safeSleep: (ms) => new Promise(r => setTimeout(r, ms)),

    // 智慧等待：持續偵測條件，條件成立就立刻回傳，超時才 fallback
    // conditionFn: () => truthy value or null/false
    // maxMs: 最長等待毫秒
    // intervalMs: 偵測間隔（預設 100ms）
    pollUntil: async (conditionFn, maxMs = 5000, intervalMs = 100) => {
        const profile = Utils.getSpeedProfile();
        // timeout 下限 2 秒，避免 turbo 模式在慢網路下誤判
        const adjustedMax = Math.max(2000, Math.round(maxMs * profile.multiplier));
        const start = Date.now();
        while (Date.now() - start < adjustedMax) {
            const result = conditionFn();
            if (result) return result;
            await new Promise(r => setTimeout(r, intervalMs));
        }
        return conditionFn(); // 最後一次嘗試
    },

    log: (msg) => {
        if (!CONFIG.DEBUG_MODE) return;
        console.log(`[RightBlock] ${msg}`);
    },

    _logBuffer: null,
    initConsoleInterceptor: () => {
        if (Utils._consoleIntercepted) return;
        Utils._consoleIntercepted = true;
        
        try {
            Utils._logBuffer = JSON.parse(localStorage.getItem(CONFIG.KEYS.CONSOLE_LOGS) || '[]');
        } catch(e) {
            Utils._logBuffer = [];
        }
        
        const _log = console.log;
        const _warn = console.warn;
        const _error = console.error;
        
        const pushLog = (level, args) => {
            try {
                const msg = Array.from(args).map(a => {
                    if (a === null) return 'null';
                    if (a === undefined) return 'undefined';
                    if (a instanceof Error) return a.stack || a.message;
                    try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
                    catch(e) { return '[Circular/DOM Object]'; }
                }).join(' ');
                const timeStr = new Date().toLocaleTimeString();
                Utils._logBuffer.push(`[${timeStr}] [${level}] ${msg}`);
                if (Utils._logBuffer.length > 50) Utils._logBuffer.shift(); // Keep last 50
                
                // Persist to survive page reloads
                localStorage.setItem(CONFIG.KEYS.CONSOLE_LOGS, JSON.stringify(Utils._logBuffer));
            } catch(e) {}
        };

        console.log = function() { pushLog('INFO', arguments); _log.apply(console, arguments); };
        console.warn = function() { pushLog('WARN', arguments); _warn.apply(console, arguments); };
        console.error = function() { pushLog('ERROR', arguments); _error.apply(console, arguments); };
        
        // Inject page-level interceptor to catch React crashes
        if (typeof window !== 'undefined' && document.documentElement) {
            window.addEventListener('message', (event) => {
                if (event.source === window && event.data && event.data.type === 'HEGE_PAGE_LOG') {
                    pushLog(event.data.level, event.data.args);
                }
            });

            const scriptStr = `
                (function() {
                    if (window.__hege_intercepted) return;
                    window.__hege_intercepted = true;
                    var _l = console.log, _w = console.warn, _e = console.error;
                    var send = function(level, args) {
                        try {
                            var safeArgs = Array.from(args).map(function(a) {
                                if (a === null) return 'null';
                                if (a === undefined) return 'undefined';
                                if (a instanceof Error) return a.message + (a.stack ? "\\n" + a.stack : "");
                                try { return typeof a === 'object' ? JSON.stringify(a) : String(a); } catch(e) { return '[Object]'; }
                            });
                            window.postMessage({ type: 'HEGE_PAGE_LOG', level: level, args: safeArgs }, '*');
                        } catch(e) {}
                    };
                    console.log = function() { send('PAGE_INFO', arguments); _l.apply(console, arguments); };
                    console.warn = function() { send('PAGE_WARN', arguments); _w.apply(console, arguments); };
                    console.error = function() { send('PAGE_ERROR', arguments); _e.apply(console, arguments); };
                })();
            `;
            try {
                const s = document.createElement('script');
                if (window.trustedTypes && window.trustedTypes.createPolicy) {
                    const policy = Utils.getPolicy();
                    s.text = policy.createScript(scriptStr);
                } else {
                    s.appendChild(document.createTextNode(scriptStr));
                }
                (document.head || document.documentElement).appendChild(s);
                s.remove();
            } catch(e) {}
        }
    },
    
    getRecentLogs: () => {
        return Utils._logBuffer || [];
    },

    // Checkbox 注入診斷記錄
    _diagBuffer: [],
    diagLog: (msg) => {
        const timeStr = new Date().toLocaleTimeString();
        Utils._diagBuffer.push(`[${timeStr}] ${msg}`);
        if (Utils._diagBuffer.length > 30) Utils._diagBuffer.shift();
        try {
            localStorage.setItem(CONFIG.KEYS.DIAG_LOG, JSON.stringify(Utils._diagBuffer));
        } catch(e) {}
    },
    getDiagLogs: () => {
        if (Utils._diagBuffer.length > 0) return Utils._diagBuffer;
        try {
            return JSON.parse(localStorage.getItem(CONFIG.KEYS.DIAG_LOG) || '[]');
        } catch(e) { return []; }
    },

    isBlockText: (text) => {
        if (!text) return false;
        const t = text.trim();
        // 必須是封鎖但不是解除封鎖
        return CONFIG.BLOCK_TEXTS.some(b => t.includes(b)) &&
               !CONFIG.UNBLOCK_TEXTS.some(u => t.includes(u));
    },

    isUnblockText: (text) => {
        if (!text) return false;
        return CONFIG.UNBLOCK_TEXTS.some(u => text.trim().includes(u));
    },

    openWorkerWindow: () => {
        const w = window.open('https://www.threads.net/?hege_bg=true', 'HegeBlockWorker', 'width=800,height=600');
        if (!w || w.closed) {
            alert('瀏覽器阻擋了彈出視窗。\n請允許 threads.net 的彈出視窗權限，或手動開啟新分頁前往：\nhttps://www.threads.net/?hege_bg=true');
        }
        return w;
    },

    simClick: (element) => {
        if (!element) return;
        const opts = { bubbles: true, cancelable: true, view: window };

        // Touch events for iOS/Mobile/React
        if (typeof TouchEvent !== 'undefined') {
            element.dispatchEvent(new TouchEvent('touchstart', opts));
            element.dispatchEvent(new TouchEvent('touchend', opts));
        }

        element.dispatchEvent(new MouseEvent('mousedown', opts));
        element.dispatchEvent(new MouseEvent('mouseup', opts));
        element.click();
    },

    isMobile: () => {
        const platform = navigator.userAgentData?.platform || navigator.platform || '';
        const isIPad = (platform === 'macOS' || platform === 'MacIntel') && navigator.maxTouchPoints > 1;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || isIPad;
        return isIOS || /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },

    // Trusted Types Policy for Meta sites
    htmlPolicy: null,
    getPolicy: () => {
        if (Utils.htmlPolicy) return Utils.htmlPolicy;
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            try {
                Utils.htmlPolicy = window.trustedTypes.createPolicy('hege_policy', {
                    createHTML: (string) => string,
                    createScript: (string) => string
                });
            } catch (e) {
                console.warn('[RightBlock] Policy creation failed', e);
                // Fallback: simple object to pass-through if policy exists but creation failed (e.g. duplicate name)
                Utils.htmlPolicy = { createHTML: s => s, createScript: s => s };
            }
        } else {
            Utils.htmlPolicy = { createHTML: s => s, createScript: s => s };
        }
        return Utils.htmlPolicy;
    },

    setHTML: (element, html) => {
        // Method 1: Trusted Types Policy
        if (window.trustedTypes && window.trustedTypes.createPolicy) {
            try {
                const policy = Utils.getPolicy();
                element.innerHTML = policy.createHTML(html);
                return;
            } catch (e) {
                // Policy failed, fall through to parser
            }
        }

        // Method 2: DOMParser (Bypasses innerHTML sink)
        // Note: Scripts won't execute, which is what we want for UI.
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            element.innerHTML = '';
            // Move children
            while (doc.body.firstChild) {
                element.appendChild(doc.body.firstChild);
            }
        } catch (e) {
            console.error('[RightBlock] setHTML failed', e);
            // Last resort
            element.innerHTML = html;
        }
    }
};

// --- storage.js ---
// Simple Adapter for LocalStorage / SessionStorage with Memory Cache
const Storage = {
    cache: {},
    sessionCache: {},

    get: (key, defaultVal = null) => {
        if (Storage.cache[key] !== undefined) return Storage.cache[key];
        const val = localStorage.getItem(key);
        Storage.cache[key] = val !== null ? val : defaultVal;
        return Storage.cache[key];
    },
    set: (key, value) => {
        Storage.cache[key] = value;
        localStorage.setItem(key, value);
    },
    remove: (key) => {
        delete Storage.cache[key];
        localStorage.removeItem(key);
    },
    invalidate: (key) => {
        delete Storage.cache[key];
    },
    getJSON: (key, defaultVal = []) => {
        let parsed;
        if (Storage.cache[key] !== undefined && typeof Storage.cache[key] !== 'string') {
            parsed = Storage.cache[key];
        } else {
            const val = localStorage.getItem(key);
            try {
                parsed = val ? JSON.parse(val) : defaultVal;
                Storage.cache[key] = parsed;
            } catch (e) {
                parsed = defaultVal;
            }
        }
        // Return a clone to prevent accidental reference mutation bugs across contexts
        return Array.isArray(parsed) ? [...parsed] : (typeof parsed === 'object' && parsed !== null ? { ...parsed } : parsed);
    },
    setJSON: (key, value) => {
        Storage.cache[key] = value;
        localStorage.setItem(key, JSON.stringify(value));
    },

    // Session Storage
    getSessionJSON: (key, defaultVal = []) => {
        let parsed;
        if (Storage.sessionCache[key] !== undefined) {
            parsed = Storage.sessionCache[key];
        } else {
            const val = sessionStorage.getItem(key);
            try {
                parsed = val ? JSON.parse(val) : defaultVal;
                Storage.sessionCache[key] = parsed;
            } catch (e) {
                parsed = defaultVal;
            }
        }
        // Return a clone
        return Array.isArray(parsed) ? [...parsed] : (typeof parsed === 'object' && parsed !== null ? { ...parsed } : parsed);
    },
    setSessionJSON: (key, value) => {
        Storage.sessionCache[key] = value;
        sessionStorage.setItem(key, JSON.stringify(value));
    }
};

// --- reporter.js ---



const Reporter = {
    sourceApp: 'ThreadsBlocker',

    getHardwareId: () => {
        let hwid = Storage.get('hege_hwid');
        if (!hwid) {
            hwid = typeof crypto !== 'undefined' && crypto.randomUUID 
                ? crypto.randomUUID() 
                : 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            Storage.set('hege_hwid', hwid);
        }
        return hwid;
    },

    sha256: async (message) => {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    submitReport: async (level, message, errorCode = "", metadata = null) => {
        if (!CONFIG.BUG_REPORT_URL || !CONFIG.BUG_REPORT_SALT) {
            return { code: 500, message: 'Bug Reporter is not properly configured.' };
        }

        const hwid = Reporter.getHardwareId();
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        const rawStr = `${timestamp}${hwid}${CONFIG.BUG_REPORT_SALT}`;
        const signature = await Reporter.sha256(rawStr);
        
        const payload = {
            source_app: Reporter.sourceApp,
            version: CONFIG.VERSION,
            hwid: hwid,
            timestamp: timestamp,
            level: level,
            message: message,
            error_code: errorCode,
            metadata: metadata ? JSON.stringify(metadata) : "",
            signature: signature
        };
        
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'undefined') {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: CONFIG.BUG_REPORT_URL,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify(payload),
                    onload: (response) => {
                        try {
                            const resJson = JSON.parse(response.responseText);
                            resolve(resJson);
                        } catch (e) {
                            resolve({code: response.status, message: response.responseText});
                        }
                    },
                    onerror: (err) => {
                        reject({code: 500, message: 'Network error or CORS issue.'});
                    }
                });
            } else {
                fetch(CONFIG.BUG_REPORT_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    redirect: 'follow'
                }).then(async res => {
                    const text = await res.text();
                    try {
                        resolve(JSON.parse(text));
                    } catch(e) {
                        resolve({code: res.status, message: text});
                    }
                }).catch(err => {
                    reject({code: 500, message: err.toString()});
                });
            }
        });
    }
};

// --- ui.js ---




const UI = {
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

        const safeMsg = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
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

                    <div class="hege-menu-item" style="cursor:default; flex-direction: column; align-items: flex-start; gap: 8px; border-bottom: none;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; width:100%;">
                            <input type="checkbox" id="hege-s-delay-toggle" style="width:16px; height:16px;">
                            <span style="font-weight:600;">啟用延時封鎖 (100人/8小時)</span>
                        </label>
                        <span style="font-size: 11px; color: #888; line-height: 1.4;">為避免觸發 Meta 次數上限，將圈選名單存入水庫，自動分批排放執行。</span>
                        <button class="hege-manager-btn secondary" id="hege-s-clear-delay" style="font-size: 12px; padding: 6px 12px; margin-top: 4px; width: 100%;">清空延時水庫 (0 人)</button>
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

// --- core.js ---






const Core = {
    blockQueue: new Set(),
    pendingUsers: new Set(),
    lastClickedBtn: null, // Track for shift-click
    lastClickedUsername: null, // Fallback if DOM node is lost
    lastClickedState: null, // null, 'checked', or 'unchecked'

    init: () => {
        Core.pendingUsers = new Set(Storage.getSessionJSON(CONFIG.KEYS.PENDING));

        const hasAgreed = Storage.get(CONFIG.KEYS.DISCLAIMER_AGREED);

        if (CONFIG.DEBUG_MODE) console.log(`[留友封] 初始化完成, 版本: ${CONFIG.VERSION}, Mobile: ${Utils.isMobile()}`);
        if (!hasAgreed) {
            UI.showDisclaimer(() => {
                Storage.set(CONFIG.KEYS.DISCLAIMER_AGREED, 'true');
                Core.startScanner();
                Core.checkPostQueueWakeup();
            });
        } else {
            Core.startScanner();
            Core.checkPostQueueWakeup();
        }
        
        // 處理深層收割自動觸發
        const params = new URLSearchParams(window.location.search);
        if (params.get('hege_post_sweep') === 'true') {
            setTimeout(() => {
                Core.executePostSweep();
            }, 3000); // 確保核心載入完畢
        }
    },


    executePostSweep: async () => {
        UI.showToast('🚀 正在準備執行貼文深層收割...', 5000);
        await Utils.safeSleep(1000);
        
        let likesLink = null;
        for (let i = 0; i < 15; i++) {
            const allLinks = document.querySelectorAll('a[role="link"], span[role="link"]');
            for (const link of allLinks) {
                const text = (link.innerText || link.textContent || '').trim().toLowerCase();
                if (/\d+.*?(讚|like)/i.test(text) && !link.closest('[role="dialog"]')) {
                    likesLink = link;
                    break;
                }
            }
            if (!likesLink) {
                const likedByLinks = document.querySelectorAll('a[href*="liked_by"]');
                if (likedByLinks.length > 0) likesLink = likedByLinks[0];
            }
            if (likesLink) break;
            await Utils.safeSleep(400);
        }
        
        if (!likesLink) {
            UI.showToast('⚠️ 未找到按讚名單，可能為無人按讚之貼文。完成查核，將從定時排程移除。', 5000);
            Core.removeCurrentPostFromQueue();
            return;
        }
        
        Utils.simClick(likesLink);
        
        // 等待對話框開啟
        await Utils.safeSleep(2000);
        
        const dialogs = document.querySelectorAll('[role="dialog"]');
        if (dialogs.length === 0) {
            UI.showToast('⚠️ 對話框開啟失敗，終止本次收割。', 3000);
            return;
        }
        
        const activeCtx = dialogs[dialogs.length - 1];
        
        // 收割 N 人 (BATCH_SIZE)
        const batchSize = CONFIG.POST_SWEEP_BATCH_SIZE || 30;
        let collectedLinks = new Set();
        let scrollBox = activeCtx;
        
        if (activeCtx.scrollHeight === activeCtx.clientHeight) {
            const innerBoxes = activeCtx.querySelectorAll('div');
            for (let b of innerBoxes) {
                if (b.scrollHeight > b.clientHeight && window.getComputedStyle(b).overflowY !== 'hidden') {
                    scrollBox = b;
                    break;
                }
            }
        }
        
        // 取得已處理過的 usernames 防止無限輪迴
        const processedSetKey = 'hege_post_sweep_processed_' + window.location.pathname;
        const processedList = Storage.getJSON(processedSetKey, []);
        const processedSet = new Set(processedList);
        
        for (let i = 0; i < 50; i++) {
            const links = activeCtx.querySelectorAll('a[href^="/@"]');
            Array.from(links).forEach(a => {
                const isHeaderLink = a.closest('h1, h2, [role="heading"]');
                if (!isHeaderLink) {
                    const href = a.getAttribute('href');
                    const u = href.split('/@')[1].split('/')[0];
                    collectedLinks.add(u);
                }
            });
            
            if (collectedLinks.size >= batchSize) break;
            
            if (i > 0) scrollBox.scrollBy({ top: 300, behavior: 'smooth' });
            await Utils.safeSleep(600);
        }
        
        const myUser = Utils.getMyUsername() || "";
        const postOwner = Utils.getPostOwner() || "";
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        
        const rawUsers = Array.from(collectedLinks)
            .filter(u => u !== myUser && u !== postOwner && !db.has(u));
            
        // 檢查無限輪迴重疊率
        const allProcessed = rawUsers.every(u => processedSet.has(u));
        if (rawUsers.length > 0 && allProcessed) {
            UI.showToast('🚨 偵測到無限遞補迴圈 (畫面上全部都是曾經收割過的帳號)，強制終止。', 6000);
            Core.removeCurrentPostFromQueue();
            return;
        }
        
        const newUsers = rawUsers.filter(u => !processedSet.has(u));
        
        if (newUsers.length === 0) {
            UI.showToast('✅ 查核完畢：畫面上已無新帳號。將此貼文從水庫排程移除。', 5000);
            Core.removeCurrentPostFromQueue();
            return;
        }
        
        Storage.setJSON(processedSetKey, [...new Set([...processedList, ...newUsers])]);
        
        const targetUsers = newUsers.slice(0, batchSize);
        
        // Task 3: 遞補失敗防呆機制 (比較本次新名單與上一批次 30 人)
        const lastBatchKey = 'hege_last_sweep_batch_' + window.location.pathname;
        const lastBatchStr = sessionStorage.getItem(lastBatchKey);
        if (lastBatchStr) {
            try {
                const lastBatch = JSON.parse(lastBatchStr);
                const intersection = targetUsers.filter(u => lastBatch.includes(u));
                const overlapRate = intersection.length / targetUsers.length;
                UI.showToast(`[驗證] 上批與這批重複率: ${(overlapRate * 100).toFixed(0)}%`, 5000);
                
                // 若重複率過高，代表封鎖失效或 Threads API 尚未遞補
                if (overlapRate > 0.8) {
                    UI.showToast('🚨 [FATAL] 偵測到遞補卡死 (上批名單未消失)，防呆機制啟動，強制進入 8 小時冷卻。', 10000);
                    console.error('[FATAL] Sweep stuck in infinite loop breaker. Aborting.', { lastBatch, targetUsers });
                    
                    // 強制解除 Post Queue 的 lock 狀態，設定時間戳為現在，啟動 8hr 冷卻
                    let postQueue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                    let qIndex = postQueue.findIndex(q => q.url.split('?')[0] === window.location.href.replace(/([&?])hege_post_sweep=true/, '').split('?')[0]);
                    if (qIndex > -1) {
                        postQueue[qIndex].status = 'pending';
                        postQueue[qIndex].lastSweptAt = Date.now();
                        Storage.setJSON(CONFIG.KEYS.POST_QUEUE, postQueue);
                    }
                    sessionStorage.removeItem(lastBatchKey);
                    sessionStorage.removeItem('hege_post_sweep_lock'); // 解鎖
                    return;
                }
            } catch(e) {}
        }

        // 更新最後一批名單
        sessionStorage.setItem(lastBatchKey, JSON.stringify(targetUsers));
        
        // Task 2: 全自動加入水庫並執行封鎖
        let activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);
        const toAdd = targetUsers.filter(u => !activeSet.has(u));

        if (toAdd.length > 0) {
            const combinedQueue = [...activeQueue, ...toAdd];
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set(combinedQueue)]);
            UI.showToast(`✅ [深層清理] 成功圈選 ${toAdd.length} 人，已全自動送入背景水庫執行！`);
            Core.updateControllerUI();

            // 若目前 Worker 沒有在跑，強制啟動它
            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
            if (!isRunning) {
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    Utils.openWorkerWindow();
                }
            }

            // Task 3: 監聽水庫清空，觸發 Reload 進入下一圈
            const checkEmptyInterval = setInterval(() => {
                const currentQ = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (currentQ.length === 0) {
                    clearInterval(checkEmptyInterval);
                    UI.showToast('🔄 [深層迴圈] 單批水庫全數清空，準備 Reload 頁面汲取下一批新名單...', 5000);
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                }
            }, 5000);

        } else {
            UI.showToast('⚠️ 名單皆已排入佇列，繼續等待。');
        }
    },
    
    removeCurrentPostFromQueue: () => {
        const queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        const cleanUrl = window.location.href.split('?')[0];
        const originalLength = queue.length;
        const newQueue = queue.filter(q => q.url.split('?')[0] !== cleanUrl);
        
        if (newQueue.length < originalLength) {
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, newQueue);
            console.log(`[DeepSweep-Q] 任務清空或異常終止，已將貼文從水庫永久解編: ${cleanUrl}`);
        }
        
        const processedSetKey = 'hege_post_sweep_processed_' + window.location.pathname;
        Storage.remove(processedSetKey); // 清理暫存
        
        UI.showToast('🎉 [深層清理] 此貼文已全數清空！任務圓滿達成，準備關閉任務...', 5000);
        
        setTimeout(() => {
            if (window.name === 'HegeSweepWorker') {
                window.close();
            } else {
                let pureUrl = window.location.href.replace(/([&?])hege_post_sweep=true/, '');
                if (pureUrl.endsWith('?') || pureUrl.endsWith('&')) pureUrl = pureUrl.substring(0, pureUrl.length - 1);
                window.location.replace(pureUrl);
            }
        }, 3000);
    },

    getBgMode: () => {
        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
        if (!isRunning) return 'IDLE';
        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const first = queue[0] || '';
        const isUnblock = first.startsWith(CONFIG.UNBLOCK_PREFIX);
        return isUnblock ? 'UNBLOCKING' : 'BLOCKING';
    },

    observer: null,
    _scrollDebounce: null,
    startScanner: () => {
        // Optimization: Use MutationObserver instead of fixed interval for most cases
        if (Core.observer) Core.observer.disconnect();

        Core.observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            let dialogChanged = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldScan = true;
                    dialogChanged = true;
                    break;
                }
            }
            if (shouldScan) Core.scanAndInject();
            if (dialogChanged) {
                Core.injectDialogBlockAll();
                Core.injectDialogCheckboxes();
            }
        });

        Core.observer.observe(document.body, { childList: true, subtree: true });

        // Scroll listener: catch virtual-scroll items entering DOM during fast scrolling in dialogs
        document.addEventListener('scroll', () => {
            clearTimeout(Core._scrollDebounce);
            Core._scrollDebounce = setTimeout(() => Core.injectDialogCheckboxes(), 80);
        }, true); // capture phase to catch scroll on any element

        // Backup interval in case mutation observer misses React's synthetic updates
        // Increased frequency from 1500 to 500ms to catch post-Loading states faster
        setInterval(() => {
            Core.scanAndInject();
            Core.injectDialogBlockAll();
            Core.injectDialogCheckboxes();
            Core.updateControllerUI();
        }, 500);

        Core.scanAndInject();

        // [Debug] Global Click Tracker (User requested to keep this around for debugging)
        if (CONFIG.DEBUG_MODE) {
            document.body.addEventListener('click', (e) => {
                let target = e.target;
                let text = target.innerText || target.textContent || '';

                // Try to find text from parent if the click was on an SVG or inner span
                if (!text.trim() && target.parentElement) {
                    text = target.parentElement.innerText || target.parentElement.textContent || '';
                }

                // Only log if we clicked something that looks like an action (has text or is an SVG)
                const isSvg = target.closest('svg');
                let logMsg = text.trim().substring(0, 30);
                if (!logMsg && isSvg) logMsg = '[SVG Icon]';

                if (logMsg) {
                    console.log(`[留友封 Debug] Clicked: "${logMsg.replace(/\n/g, ' ')}"`);

                    // Inspect DOM 1 second after click to see what React did to the headers
                    setTimeout(() => {
                        const headers = document.querySelectorAll('h1, h2');
                        console.log(`[留友封 Debug] --- DOM State 1s after click ---`);
                        console.log(`Found ${headers.length} headers total.`);
                        headers.forEach((h, idx) => {
                            const hText = (h.innerText || h.textContent || '').trim();
                            if (hText) {
                                const p = h.parentElement;
                                const injected = p ? p.dataset.hegeDialogInjected : 'N/A';
                                const hasBtn = p ? !!p.querySelector('.hege-block-all-btn') : false;

                                // Check if inside dialog
                                let isDialog = false;
                                let curr = p;
                                for (let i = 0; i < 8; i++) {
                                    if (curr && curr.getAttribute('role') === 'dialog') { isDialog = true; break; }
                                    if (curr) curr = curr.parentElement;
                                }

                                console.log(`Header [${idx}]: "${hText}" | inDialog: ${isDialog} | ParentInjectedFlag: ${injected} | BtnExists: ${hasBtn}`);

                                // Log the entire parent structure HTML (stripped of too much detail)
                                // if it's a dialog header we care about
                                if (isDialog && ['讚', '引用', '轉發', '貼文動態', '活動', 'Likes'].some(t => hText.includes(t))) {
                                    console.log(`[!] Target Header Parent HTML snippet:`, p ? p.outerHTML.substring(0, 300) + '...' : 'null');
                                }
                            }
                        });
                        console.log(`-------------------------------------------`);
                    }, 1000);
                }
            }, true); // Capture phase to guarantee we catch it even if React calls stopPropagation()
        }

        // React often swallows events or stops propagation.
        // We now bind `addEventListener('click', Core.handleGlobalClick, true)`
        // directly to the initialized containers instead of window to prevent click-through.
    },

    getTopContext: () => {
        const dialogs = document.querySelectorAll('[role="dialog"]');
        if (dialogs.length > 0) {
            // Pick the last one which is usually the topmost in DOM
            return dialogs[dialogs.length - 1];
        }
        return document.body;
    },

    saveToDB: (username) => {
        if (!username) return;
        username = username.replace('@', '').trim();
        let dbArray = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        let db = new Set(dbArray);
        if (!db.has(username)) {
            db.add(username);
            Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);

            // Also ensure timestamp is recorded
            let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
            if (!ts[username]) {
                ts[username] = Date.now();
                Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);
            }
        }
    },

    advancedBlockAll: async (ctx) => {
        const bgMode = Core.getBgMode();
        if (bgMode === 'UNBLOCKING') return;

        let scrollBox = ctx;
        if (ctx.scrollHeight === ctx.clientHeight) {
            const innerBoxes = ctx.querySelectorAll('div');
            for (let b of innerBoxes) {
                if (b.scrollHeight > b.clientHeight && window.getComputedStyle(b).overflowY !== 'hidden') {
                    scrollBox = b;
                    break;
                }
            }
        }

        const maxLimit = window.__DEBUG_HEGE_LIKES_LIMIT || 1000;
        let isAborted = false;

        // --- Create Progress UI ---
        const progressId = 'hege-advanced-progress-' + Date.now();
        const progressUI = document.createElement('div');
        progressUI.id = progressId;
        progressUI.style.cssText = 'position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.85); color: #fff; padding: 10px 20px; border-radius: 20px; z-index: 99999; display: flex; align-items: center; gap: 15px; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
        
        const countSpan = document.createElement('span');
        countSpan.textContent = '🚀 掃描中... 已捕獲: 0 人';
        
        const stopBtn = document.createElement('button');
        stopBtn.textContent = '⏹️ 停止並結算';
        stopBtn.style.cssText = 'background: #ff3b30; color: white; border: none; border-radius: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; font-weight: bold;';
        stopBtn.onclick = () => { isAborted = true; };
        
        progressUI.appendChild(countSpan);
        progressUI.appendChild(stopBtn);
        
        const currentPos = window.getComputedStyle(scrollBox).position;
        if (currentPos === 'static') scrollBox.style.position = 'relative';
        scrollBox.appendChild(progressUI);

        // Listen for ESC key to abort
        const escListener = (e) => { if (e.key === 'Escape') isAborted = true; };
        document.addEventListener('keydown', escListener);

        let collectedLinks = new Set();
        let unchangedCount = 0;
        let lastCollectedSize = 0;
        const maxScrolls = 800;
        let scrollCount = 0;

        const collectVisible = () => {
            const links = ctx.querySelectorAll('a[href^="/@"]');
            let lastLink = null;
            Array.from(links).forEach(a => {
                const isHeaderLink = a.closest('h1, h2, [role="heading"]');
                if (!isHeaderLink) {
                    const href = a.getAttribute('href');
                    const u = href.split('/@')[1].split('/')[0];
                    collectedLinks.add(u);
                    lastLink = a;
                }
            });
            return lastLink; // Return the very last node for scrolling
        };

        while (scrollCount < maxScrolls && !isAborted) {
            const lastNode = collectVisible();
            countSpan.textContent = `🚀 掃描中... 已捕獲: ${collectedLinks.size} 人`;

            if (collectedLinks.size >= maxLimit) {
                UI.showToast(`已達最大安全上限 (${maxLimit}人)，自動安全結算。`, 3000);
                break;
            }

            // 策略改變：強制把畫面拉到最後一個看得到的帳號上，保證超過 IntersectionObserver 邊界
            if (lastNode && unchangedCount === 0) {
                lastNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // 如果抓不到元素或卡住，再退回傳統滾底
                scrollBox.scrollTo(0, scrollBox.scrollHeight + 100);
            }
            
            await Utils.safeSleep(600); // 讓 Intersection Observer 觸發並重繪
            
            if (collectedLinks.size === lastCollectedSize) {
                // 人數沒增加，代表到底了或是 loader 被卡住
                unchangedCount++;
                if (unchangedCount >= 6) {
                    break; // 卡住約 6 秒 (6 * 600+400)，真的沒人了
                }
                
                // 碰到卡住狀態，多刺激一下底部的 spinner，或再往下捲
                scrollBox.scrollBy({ top: 800, behavior: 'smooth' });
                await Utils.safeSleep(500); 
            } else {
                unchangedCount = 0;
                lastCollectedSize = collectedLinks.size;
            }
            
            scrollCount++;
        }

        collectVisible(); // Final deep collect
        
        // Cleanup UI and listeners
        document.removeEventListener('keydown', escListener);
        if (progressUI.parentNode) progressUI.parentNode.removeChild(progressUI);

        const myUser = Utils.getMyUsername();
        const postOwner = Utils.getPostOwner();
        const skipUsers = new Set();
        if (myUser) skipUsers.add(myUser);
        if (postOwner) skipUsers.add(postOwner);

        const allText = ctx.innerText || ctx.textContent || "";
        const replyMatch = allText.match(/(?:正在回覆|Replying to)\s*@([a-zA-Z0-9._]+)/i);
        if (replyMatch && replyMatch[1]) skipUsers.add(replyMatch[1]);

        let rawUsers = Array.from(collectedLinks).filter(u => !skipUsers.has(u));

        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);

        const newUsers = rawUsers.filter(u => !db.has(u) && !activeSet.has(u) && !Core.pendingUsers.has(u));

        if (newUsers.length === 0) {
            UI.showToast('沒有新帳號可加入');
            return;
        }

        newUsers.forEach(u => Core.pendingUsers.add(u));
        Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

        if (isRunning) {
            const combinedQueue = [...activeQueue, ...Core.pendingUsers];
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set(combinedQueue)]);
            UI.showToast(`✅ 進階收集完成：已將 ${newUsers.length} 筆加入背景排隊`);
        } else {
            UI.showToast(`✅ 進階收集完成：已標記 ${Core.pendingUsers.size} 人，可關閉視窗至控制台「開始封鎖」`);
        }

        if (newUsers.length >= 30) {
            Core.checkCockroachRadar(null, newUsers.length);
        }

        scrollBox.scrollTo(0, 0);
        Core.updateControllerUI();

        setTimeout(() => {
            document.querySelectorAll('.hege-checkbox-container').forEach(box => {
                if (box.dataset.username && Core.pendingUsers.has(box.dataset.username)) {
                    box.classList.add('checked');
                }
            });
        }, 500);
    },

    addPostTask: (url) => {
        let postQueue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        let cleanUrl = url.split('?')[0];
        if (!postQueue.some(p => p.url.split('?')[0] === cleanUrl)) {
            postQueue.push({
                url: cleanUrl,
                last_executed_at: 0, 
                added_at: Date.now()
            });
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, postQueue);
            UI.showToast(`✅ 已將貼文加入深層清理排程（每 8 小時回訪）`);
        } else {
            UI.showToast(`此貼文已在排程中`);
        }
    },

    injectDialogBlockAll: () => {
        const ctx = Core.getTopContext();
        const isDialog = ctx !== document.body;

        const headers = ctx.querySelectorAll('h1, h2, div[role="heading"] span');
        let header = null;
        let titleText = '';

        for (let h of headers) {
            const tempText = (h.innerText || h.textContent || '');
            const text = tempText.trim();
            if (text && text !== 'Threads') {
                // 排除回覆/回文/發文 dialog — 會回文/發文代表不想或不能封鎖
                const isExcludeCtx = ['回覆', '回文', 'Reply', 'Replies', '回應', '新串文', 'New thread', '發佈串文', 'Post', '編輯', 'Edit'].some(t => text.includes(t));
                if (isExcludeCtx) continue;

                if (isDialog || ['貼文動態', '讚', 'Likes', '引用', '轉發', '活動'].some(t => text.includes(t))) {
                    header = h;
                    titleText = text;
                }
            }
        }

        if (!header) return;

        const headerContainer = header.parentElement;
        if (!headerContainer) return;

        let localCtx = headerContainer;
        for (let i = 0; i < 2; i++) {
            if (localCtx.parentElement && localCtx.parentElement.tagName !== 'BODY') {
                localCtx = localCtx.parentElement;
            }
        }

        const existingBtn = localCtx.querySelector('.hege-block-all-btn');
        if (existingBtn && document.body.contains(existingBtn)) return;

        const blockAllBtn = document.createElement('div');
        blockAllBtn.className = 'hege-block-all-btn';
        blockAllBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
            <span>殺螂囉~</span>
        `;

        const bgMode = Core.getBgMode();
        if (bgMode === 'UNBLOCKING') {
            blockAllBtn.style.opacity = '0.5';
            blockAllBtn.style.filter = 'grayscale(1)';
            blockAllBtn.style.cursor = 'not-allowed';
            blockAllBtn.title = '正在解除封鎖，暫時無法封鎖';
        }

        const handleBlockAll = (e) => {
            if (Core.getBgMode() === 'UNBLOCKING') {
                UI.showToast('目前正在「解除封鎖」，請先暫停任務再執行封鎖');
                return;
            }
            e.stopPropagation();
            e.preventDefault();

            // Beta 56: Re-calculate context and bounds at click-time for maximum precision
            const activeCtx = Core.getTopContext();
            
            // Task 3: 進階同列全封 (自動捲動收集未顯示名單)
            if (Storage.get(CONFIG.KEYS.ADVANCED_SCROLL_ENABLED) === 'true') {
                Core.advancedBlockAll(activeCtx);
                return;
            }

            const containerRect = activeCtx.getBoundingClientRect();

            // Narrow search scope to prevent "bleeding" into background layers if the list is short
            const links = activeCtx.querySelectorAll('a[href^="/@"]');
            let rawUsers = Array.from(links).filter(a => {
                const rect = a.getBoundingClientRect();
                // 1. Must be visible and have dimensions
                const isVisible = rect.height > 5 && rect.width > 5;
                // 2. Must be within the visual viewport of the active dialog
                // Adding a small 10px buffer to account for padding/rounding
                const isInBounds = rect.top >= (containerRect.top - 10) &&
                    rect.bottom <= (containerRect.bottom + 10);

                // 3. Avoid IDs in headers (labels) to focus on the actual list items
                const isHeaderLink = a.closest('h1, h2, [role="heading"]');

                return isVisible && isInBounds && !isHeaderLink;
            }).map(a => {
                const href = a.getAttribute('href');
                return href.split('/@')[1].split('/')[0];
            });

            const myUser = Utils.getMyUsername();
            const postOwner = Utils.getPostOwner();
            const skipUsers = new Set();
            if (myUser) skipUsers.add(myUser);
            if (postOwner) skipUsers.add(postOwner);

            // Beta 55: Scan for "Replying to @username" (正在回覆 @username)
            // This is crucial for comment activity views.
            const allText = activeCtx.innerText || activeCtx.textContent || "";
            const replyMatch = allText.match(/(?:正在回覆|Replying to)\s*@([a-zA-Z0-9._]+)/i);
            if (replyMatch && replyMatch[1]) {
                skipUsers.add(replyMatch[1]);
            }

            rawUsers = [...new Set(rawUsers)].filter(u => !skipUsers.has(u));

            const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
            const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const activeSet = new Set(activeQueue);

            const newUsers = rawUsers.filter(u => !db.has(u) && !activeSet.has(u) && !Core.pendingUsers.has(u));

            if (newUsers.length === 0) {
                UI.showToast('沒有新帳號可加入');
                return;
            }

            newUsers.forEach(u => Core.pendingUsers.add(u));
            Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

            if (isRunning) {
                const combinedQueue = [...activeQueue, ...Core.pendingUsers];
                Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set(combinedQueue)]);
                UI.showToast(`已將畫面上 ${newUsers.length} 筆帳號加入背景排隊`);
            } else {
                UI.showToast(`已加入「${Core.pendingUsers.size} 選取」，請至清單「開始封鎖」`);
            }
            
            // Task 2: Cockroach Radar
            if (newUsers.length >= 30) {
                Core.checkCockroachRadar(null, newUsers.length);
            }

            document.querySelectorAll('.hege-checkbox-container').forEach(box => {
                if (box.dataset.username && Core.pendingUsers.has(box.dataset.username)) {
                    box.classList.add('checked');
                }
            });

            Core.updateControllerUI();
        };

        // Add endless sweep button UI
        const endlessSweepBtn = document.createElement('div');
        endlessSweepBtn.className = 'hege-block-all-btn';
        endlessSweepBtn.style.cssText = 'background-color: #ff3b30; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 6px 14px; border-radius: 9px; color: white; font-weight: bold; font-size: 14px; border: 1px solid rgba(255,255,255,0.2);';
        endlessSweepBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M2.5 2v6h6M21.5 22v-6h-6M22 11.5A10 10 0 0 0 3.2 7.2L2.5 8M2 12.5a10 10 0 0 0 18.8 4.2l.7-.8"></path></svg>
            <span style="display:none;" class="hege-desktop-text">無盡收割</span>
        `;
        endlessSweepBtn.title = "全自動：圈選畫面上即將顯示的全數帳號，並在封鎖完畢後自動換頁繼續收割";
        
        // Show text on desktop
        if (!Utils.isMobile() && window.innerWidth > 600) {
            const spanTextNode = endlessSweepBtn.querySelector('.hege-desktop-text');
            if (spanTextNode) spanTextNode.style.display = 'inline';
        }

        const handleEndlessSweep = (e) => {
            e.stopPropagation(); e.preventDefault();
            
            // Re-run precise grab logic for endless grab
            const links = activeCtx.querySelectorAll('a[href^="/@"]');
            let endlessRawUsers = Array.from(links).map(a => {
                const href = a.getAttribute('href');
                return href.split('/@')[1].split('/')[0];
            });

            const skipUsers = new Set();
            if (Utils.getMyUsername()) skipUsers.add(Utils.getMyUsername());
            if (Utils.getPostOwner()) skipUsers.add(Utils.getPostOwner());

            endlessRawUsers = [...new Set(endlessRawUsers)].filter(u => !skipUsers.has(u));
            const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
            const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const activeSet = new Set(activeQueue);

            const newEndlessUsers = endlessRawUsers.filter(u => !db.has(u) && !activeSet.has(u));

            if (newEndlessUsers.length === 0) {
                UI.showToast('⚠️ 畫面上無可收割帳號');
                return;
            }

            // Loop Protection Check
            const lastFirstUser = sessionStorage.getItem('hege_endless_last_first_user');
            if (lastFirstUser === newEndlessUsers[0]) {
                UI.showConfirm('⚠️ 偵測到死迴圈（API可能卡單），無盡收割自動中止。');
                sessionStorage.removeItem('hege_endless_state');
                sessionStorage.removeItem('hege_endless_target');
                sessionStorage.removeItem('hege_endless_last_first_user');
                return;
            }

            // Arm the endless harvester
            sessionStorage.setItem('hege_endless_last_first_user', newEndlessUsers[0]);
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set([...activeQueue, ...newEndlessUsers])]);
            sessionStorage.setItem('hege_endless_state', 'WAIT_FOR_BG');
            sessionStorage.setItem('hege_endless_target', window.location.href);
            
            console.log(`[Endless Harvester] Triggered. ${newEndlessUsers.length} users added. State: WAIT_FOR_BG.`);
            UI.showToast(`[無盡收割啟動] 已抓取 ${newEndlessUsers.length} 人。請停留於此頁面，等待自動重載...`);
            
            Core.updateControllerUI();
            if (typeof Core.startEndlessMonitor === 'function') Core.startEndlessMonitor();
        };

        const allSpans = localCtx.querySelectorAll('span[dir="auto"]');
        let sortSpan = null;
        for (let span of allSpans) {
            const spanText = (span.innerText || span.textContent || '').trim();
            if (spanText === '排序' || spanText.includes('排序')) {
                sortSpan = span;
                break;
            }
        }

        const attachEvents = (btn, handler) => {
            if (!btn.dataset.hegeEventBound) {
                if (Utils.isMobile()) {
                    btn.addEventListener('touchend', handler, { passive: false, capture: true });
                } else {
                    btn.addEventListener('click', handler, true);
                }
                btn.dataset.hegeEventBound = 'true';
            }
        };

        attachEvents(blockAllBtn, handleBlockAll);
        attachEvents(endlessSweepBtn, handleEndlessSweep);

        if (sortSpan && sortSpan.closest('[role="button"]')) {
            const sortBtn = sortSpan.closest('[role="button"]');
            blockAllBtn.style.marginRight = '8px';
            endlessSweepBtn.style.marginRight = '8px';

            try {
                sortBtn.parentElement.style.display = 'flex';
                sortBtn.parentElement.style.alignItems = 'center';
                sortBtn.parentElement.insertBefore(endlessSweepBtn, sortBtn);
                sortBtn.parentElement.insertBefore(blockAllBtn, endlessSweepBtn);
            } catch (e) {
                headerContainer.appendChild(blockAllBtn);
                headerContainer.appendChild(endlessSweepBtn);
            }
        } else {
            blockAllBtn.style.marginLeft = 'auto';
            blockAllBtn.style.marginRight = '8px';
            endlessSweepBtn.style.marginRight = '8px';

            if (header.nextSibling) {
                headerContainer.insertBefore(blockAllBtn, header.nextSibling);
                headerContainer.insertBefore(endlessSweepBtn, header.nextSibling);
            } else {
                headerContainer.appendChild(blockAllBtn);
                headerContainer.appendChild(endlessSweepBtn);
            }
        }
    },

    injectDialogCheckboxes: () => {
        const ctx = Core.getTopContext();
        const isDialog = ctx !== document.body;

        const dialogHeaders = ctx.querySelectorAll('h1, h2, div[role="heading"] span');
        let header = null;
        for (let h of dialogHeaders) {
            const tempText = (h.innerText || h.textContent || '').trim();
            if (tempText && tempText !== 'Threads') {
                if (isDialog || ['讚', '引用', '轉發', '貼文動態', '活動', 'Likes'].some(t => tempText.includes(t))) {
                    header = h;
                }
            }
        }
        if (!header) return;

        const links = Array.from(ctx.querySelectorAll('a[href^="/@"]')).filter(a => {
            // Only filter truly invisible elements (display:none, zero-size); allow off-screen items
            const rect = a.getBoundingClientRect();
            return rect.height > 0 || a.offsetParent !== null;
        });

        const dbRef = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);

        if (CONFIG.DEBUG_MODE && links.length > 0) {
        }

        links.forEach((a, idx) => {
            const isAvatar = a.querySelector('img') || a.querySelector('svg') || a.innerText.trim() === '';
            const username = a.getAttribute('href').split('/@')[1].split('/')[0];

            if (!isAvatar) {
                // If it's not an avatar link, we only skip it if it's the 2nd link of the same user (name link)
                // However, in some views the name link IS the only link with a good flexRow. 
                // So let's try to process both, but avoid double injection via flexRow check.
            }

            if (username === Utils.getMyUsername()) return;

            let topContainer = a;
            let followBtn = null;
            for (let i = 0; i < 15; i++) {
                if (!topContainer.parentElement) break;
                topContainer = topContainer.parentElement;
                const btns = Array.from(topContainer.querySelectorAll('div[role="button"]'));
                followBtn = btns.find(b => b.innerText && ['追蹤', '正在追蹤', 'Follow', 'Following'].some(t => b.innerText.includes(t)));
                if (followBtn) break;
            }

            let flexRow = null;
            let followBtnContainer = null;

            if (followBtn) {
                let child = followBtn;
                while (child && child !== topContainer) {
                    let parent = child.parentElement;
                    let safeUsername = username.replace(/"/g, '');
                    // Threads lists usually have a clear row container that holds both user info and the follow button.
                    if (parent && parent.children.length >= 2 && parent.querySelector(`a[href*="/@${safeUsername}"]`)) {
                        flexRow = parent;
                        followBtnContainer = child;
                        break;
                    }
                    child = parent;
                }
            }

            // Fallback: If no follow button (e.g. current user or specific list type), find a container that looks like a list item.
            // Beta 53/54 optimization: Finding a stable Row Container.
            // Priority: role="listitem" -> data-pressable-container -> Common Flex Row classes
            if (!flexRow) {
                flexRow = a.closest('div[role="listitem"]') ||
                    a.closest('div[data-pressable-container="true"]') ||
                    a.closest('.x1n2onr6.x1f9n5g') ||
                    (followBtn && followBtn.parentElement ? followBtn.parentElement.closest('.x78zum5.xdt5ytf') : null) ||
                    (followBtn ? followBtn.parentElement : null);
            }

            if (!flexRow) return;

            // Beta 54: Absolute deduplication. Check the whole row for THIS user's box.
            const existingBox = flexRow.querySelector(`.hege-checkbox-container[data-username="${CSS.escape(username)}"]`);
            if (existingBox) {
                const isChecked = Core.pendingUsers.has(username);
                if (isChecked !== existingBox.classList.contains('checked')) {
                    existingBox.classList.toggle('checked', isChecked);
                }
                return;
            }

            // Beta 54: Special case - if a box already exists in this row but for a different username, 
            // it means we've hit a shared parent. For safety, let's look for a better spot or skip.
            if (flexRow.querySelector('.hege-checkbox-container')) {
                // If the user's box isn't here, maybe it's in a different sub-flex.
                // But generally, one box per role="listitem" is the goal.
                return;
            }

            const container = document.createElement("div");
            container.className = "hege-checkbox-container";
            container.dataset.username = username;
            container.style.cursor = 'pointer';
            container.style.zIndex = '100';
            container.style.flexShrink = '0';

            const bgMode = Core.getBgMode();
            if (bgMode === 'UNBLOCKING') {
                container.style.opacity = '0.4';
                container.style.filter = 'grayscale(1)';
                container.style.cursor = 'not-allowed';
                container.title = '正在解除封鎖';
            }

            const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgIcon.setAttribute("viewBox", "0 0 24 24");
            svgIcon.classList.add("hege-svg-icon");

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", "2"); rect.setAttribute("y", "2");
            rect.setAttribute("width", "20"); rect.setAttribute("height", "20");
            rect.setAttribute("rx", "6"); rect.setAttribute("ry", "6");
            rect.setAttribute("stroke", "currentColor"); rect.setAttribute("stroke-width", "2.5");
            rect.setAttribute("fill", "none");

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.classList.add("hege-checkmark");
            path.setAttribute("d", "M6 12 l4 4 l8 -8");
            path.setAttribute("fill", "none");

            svgIcon.appendChild(rect); svgIcon.appendChild(path);
            container.appendChild(svgIcon);

            container.dataset.username = username;

            if (dbRef.has(username)) {
                container.classList.add('finished');
            } else if (activeSet.has(username)) {
                container.classList.add('pending');
            } else if (Core.pendingUsers.has(username)) {
                container.classList.add('checked');
            }

            // Beta 45: Only use handleGlobalClick to avoid double-toggle issues.
            // Still keep the prevention listeners to block Threads' native behavior on these specific elements if needed.
            if (!Utils.isMobile()) {
                container.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);
                container.addEventListener('pointerup', (e) => { e.stopPropagation(); }, true);
                container.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.shiftKey) e.preventDefault(); }, true);
                container.addEventListener('mouseup', (e) => { e.stopPropagation(); }, true);
            }
            container.addEventListener('click', Core.handleGlobalClick, true);

            // 插在追蹤按鈕前面，避免重疊
            if (followBtnContainer && followBtnContainer.parentElement === flexRow) {
                flexRow.insertBefore(container, followBtnContainer);
            } else {
                flexRow.appendChild(container);
            }
        });
    },

    scanAndInject: () => {
        // Performance: Only run if window is active/visible to save CPU
        if (document.hidden) return;

        const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
        if (moreSvgs.length === 0) return;

        // Optimization: Cache DB lookup
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));

        moreSvgs.forEach(svg => {
            const btn = svg.closest('div[role="button"]');
            if (!btn || !btn.parentElement) return;

            // Dialog 內的 checkbox 由 injectDialogCheckboxes 處理，避免重複注入
            if (btn.closest('div[role="dialog"]')) return;

            // Check if already processed
            if (btn.getAttribute('data-hege-checked') === 'true') return;
            if (btn.parentElement.querySelector('.hege-checkbox-container')) {
                btn.setAttribute('data-hege-checked', 'true');
                return;
            }

            // SVG filtering
            if (!svg.querySelector('circle') && !svg.querySelector('path')) {
                Utils.diagLog(`[SKIP] SVG 無 circle/path, viewBox=${svg.getAttribute('viewBox')}`);
                return;
            }
            const viewBox = svg.getAttribute('viewBox');
            if (viewBox === '0 0 12 12' || viewBox === '0 0 13 12') return;
            const width = svg.style.width ? parseInt(svg.style.width) : 24;
            if (width < 16 && svg.clientWidth < 16) {
                Utils.diagLog(`[SKIP] SVG 太小 w=${width}, clientW=${svg.clientWidth}`);
                return;
            }

            let username = null;
            try {
                let p = btn.parentElement; let foundLink = null;
                for (let i = 0; i < 5; i++) {
                    if (!p) break;
                    foundLink = p.querySelector('a[href^="/@"]');
                    if (foundLink) break;
                    p = p.parentElement;
                }
                if (foundLink) {
                    username = foundLink.getAttribute('href').split('/@')[1].split('/')[0];
                }
            } catch (e) { }

            if (!username) {
                Utils.diagLog(`[SKIP] 找不到 username, btn.parentClasses=${btn.parentElement?.className?.substring(0, 50)}`);
            }

            if (username && username === Utils.getMyUsername()) {
                // Checkbox should not appear for the user's own account
                btn.setAttribute('data-hege-checked', 'true');
                return;
            }

            btn.setAttribute('data-hege-checked', 'true');

            const container = document.createElement('div');
            container.className = 'hege-checkbox-container';

            const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svgIcon.setAttribute("viewBox", "0 0 24 24");
            svgIcon.classList.add("hege-svg-icon");

            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", "2"); rect.setAttribute("y", "2");
            rect.setAttribute("width", "20"); rect.setAttribute("height", "20");
            rect.setAttribute("rx", "6"); rect.setAttribute("ry", "6");
            rect.setAttribute("stroke", "currentColor"); rect.setAttribute("stroke-width", "2.5");
            rect.setAttribute("fill", "none");

            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.classList.add("hege-checkmark");
            path.setAttribute("d", "M6 12 l4 4 l8 -8");
            path.setAttribute("fill", "none");

            svgIcon.appendChild(rect); svgIcon.appendChild(path);
            container.appendChild(svgIcon);

            if (username) {
                btn.dataset.username = username;
                container.dataset.username = username;

                const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));
                const cdq = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
                const bgq = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));

                if (db.has(username)) {
                    container.classList.add('finished');
                } else if (Core.pendingUsers.has(username) || cdq.has(username) || bgq.has(username)) {
                    container.classList.add('checked');
                    Core.blockQueue.add(btn);
                }
            }

            if (Utils.isMobile()) {
                container.addEventListener('touchstart', (e) => {
                    if (e.target.closest('.hege-checkbox-container')) {
                        e.stopPropagation();
                    }
                }, { passive: false });

                container.addEventListener('touchend', (e) => {
                    if (e.target.closest('.hege-checkbox-container')) {
                        if (CONFIG.DEBUG_MODE) console.log('[留友封] Checkbox Touchend detected');
                        e.stopPropagation();
                        // CRITICAL: Stop iOS from firing synthetic click that triggers Universal Link
                        if (e.cancelable) e.preventDefault();

                        // Manually trigger handleGlobalClick since we prevented the default synthetic click
                        Core.handleGlobalClick(e);
                    }
                }, { passive: false, capture: true });
            } else {
                // Desktop (Chrome + Safari): intercept pointer/mouse events before React steals them
                container.addEventListener('pointerdown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }, true);
                container.addEventListener('pointerup', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                }, true);
                container.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    if (e.shiftKey) e.preventDefault();
                }, true);
                container.addEventListener('mouseup', (e) => {
                    e.stopPropagation();
                }, true);
            }

            // Bind directly to the element using a capture phase listener.
            // This is the most bulletproof way to intercept clicks before React or <a> tags steal them.
            container.addEventListener('click', Core.handleGlobalClick, true);

            try {
                const parent = btn.parentElement;
                if (parent) {
                    const ps = window.getComputedStyle(parent).position;
                    if (ps === 'static') parent.style.position = 'relative';
                    parent.style.setProperty('overflow', 'visible', 'important');
                    // checkbox 用 absolute 定位在 button 左側
                    container.style.position = 'absolute';
                    container.style.right = '100%';
                    container.style.top = '50%';
                    container.style.transform = 'translateY(-50%)';
                    container.style.marginRight = '2px';
                    parent.appendChild(container);
                }
            } catch (e) { }
        });
    },

    handleGlobalClick: (e) => {
        if (Core.getBgMode() === 'UNBLOCKING') {
            UI.showToast('目前正在「解除封鎖」，無法手動選取封鎖帳號');
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        const container = e.target.closest('.hege-checkbox-container');
        if (!container) return;

        // Stop propagation IMMEDIATELY to prevent opening user profile or React intercepting
        e.stopPropagation();
        e.preventDefault();

        if (CONFIG.DEBUG_MODE) {
            console.log(`[Shift - Click] Container Matched! ShiftKey: ${e.shiftKey}, anchorUsername: ${Core.lastClickedUsername}`);
        }

        // --- Shift-Click Multi-Select Logic ---
        let targetBoxes = [container];
        if (e.shiftKey && (Core.lastClickedBtn || Core.lastClickedUsername)) {
            const allBoxes = Array.from(document.querySelectorAll('.hege-checkbox-container'));
            let lastIdx = allBoxes.indexOf(Core.lastClickedBtn);

            // Fallback: If DOM node was recreated by React, find by username
            if (lastIdx === -1 && Core.lastClickedUsername) {
                lastIdx = allBoxes.findIndex(box => box.dataset.username === Core.lastClickedUsername);
            }

            const currIdx = allBoxes.indexOf(container);

            if (lastIdx !== -1 && currIdx !== -1) {
                const min = Math.min(lastIdx, currIdx);
                const max = Math.max(lastIdx, currIdx);
                targetBoxes = allBoxes.slice(min, max + 1);
                if (CONFIG.DEBUG_MODE) console.log(`[Shift - Click] Processing ${targetBoxes.length} items from index ${min} to ${max}`);
            } else {
                if (CONFIG.DEBUG_MODE) console.log(`[Shift - Click] Failed to establish range.lastIdx: ${lastIdx}, currIdx: ${currIdx}`);
            }
        }

        // Determine intended state based on current container
        const isCurrentlyChecked = container.classList.contains('checked');
        const isCurrentlyFinished = container.classList.contains('finished');

        let targetAction = 'check'; // Check by default
        if (isCurrentlyFinished) {
            targetAction = 'reset';
        } else if (isCurrentlyChecked) {
            targetAction = 'uncheck';
        }

        const currentDB = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));

        targetBoxes.forEach(box => {
            const u = box.dataset.username;
            const btnElement = box.parentElement; // Used for blockQueue

            if (targetAction === 'reset' && box.classList.contains('finished')) {
                if (u) {
                    currentDB.delete(u);
                    box.classList.remove('finished');
                    box.classList.add('checked');
                    if (btnElement) btnElement.dataset.username = u; // Ensure dataset exists safely
                    if (btnElement) Core.blockQueue.add(btnElement);
                    Core.pendingUsers.add(u);
                }
            } else if (targetAction === 'uncheck' && box.classList.contains('checked')) {
                box.classList.remove('checked');
                // Remove from queue where username matches
                Array.from(Core.blockQueue).forEach(b => {
                    if (b.dataset && b.dataset.username === u) Core.blockQueue.delete(b);
                });
                if (u) {
                    Core.pendingUsers.delete(u);
                    let bg = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                    if (bg.includes(u)) Storage.setJSON(CONFIG.KEYS.BG_QUEUE, bg.filter(x => x !== u));
                    let cdq = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
                    if (cdq.includes(u)) Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, cdq.filter(x => x !== u));
                    let dq = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                    if (dq.includes(u)) Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, dq.filter(x => x !== u));
                }
            } else if (targetAction === 'check' && !box.classList.contains('checked') && !box.classList.contains('finished')) {
                box.classList.add('checked');
                if (btnElement) btnElement.dataset.username = u;
                if (btnElement) Core.blockQueue.add(btnElement);
                if (u) Core.pendingUsers.add(u);
            }
        });

        if (targetAction === 'reset') {
            Storage.setJSON(CONFIG.KEYS.DB_KEY, [...currentDB]);
            UI.showToast('已重置並重新加入排程');
        }

        Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);
        
        // Task 2: Cockroach Radar (Shift-Click selection block)
        if (targetAction === 'check' && targetBoxes.length >= 30) {
            Core.checkCockroachRadar(null, targetBoxes.length);
        }

        Core.lastClickedBtn = container;
        Core.lastClickedUsername = container.dataset.username;
        Core.lastClickedState = targetAction;

        if (CONFIG.DEBUG_MODE) {
            console.log(`[Shift - Click] State saved.next anchorUsername: ${Core.lastClickedUsername}`);
        }

        Core.updateControllerUI();
    },



    checkCockroachRadar: (rawUsers, countOverride) => {
        const count = countOverride || (rawUsers ? rawUsers.length : 0);
        if (count < 30) return;

        const postOwner = Utils.getPostOwner();
        if (!postOwner) return;

        const dbRaw = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
        const cockroachSet = new Set(dbRaw.map(x => x.username || x));
        if (cockroachSet.has(postOwner)) return;

        UI.showConfirm(
            `【大蟑螂雷達】偵測到您單次圈選了 ${count} 人。\n\n是否將該發文者 ( @${postOwner} ) 列為「大蟑螂」？\n我們將自動跳過封鎖他，並在每 10 天提醒您回頭檢查蟑螂窩。`,
            () => {
                const timeNow = Date.now();
                const db = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
                db.push({ username: postOwner, timestamp: timeNow });
                Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, db);

                // 解除封鎖排隊並取消畫面勾選
                Core.pendingUsers.delete(postOwner);
                Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);
                
                let bgq = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (bgq.includes(postOwner)) Storage.setJSON(CONFIG.KEYS.BG_QUEUE, bgq.filter(u => u !== postOwner));
                
                let dq = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                if (dq.includes(postOwner)) Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, dq.filter(u => u !== postOwner));

                Core.updateControllerUI();
                UI.showToast(`已標記 @${postOwner} 為大蟑螂，並解除其封鎖排隊！`);
            }
        );
    },

    openCockroachManager: (onBack = null) => {
        try {
            const db = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
            UI.showCockroachManager(db, (usersToRemove) => {
                const currentDb = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
                const newDb = currentDb.filter(c => {
                    const uname = (typeof c === 'string') ? c : (c.username || '');
                    return !usersToRemove.includes(uname);
                });
                Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, newDb);
                UI.showToast(`已從大蟑螂資料庫中移除 ${usersToRemove.length} 名使用者`);
                Core.openCockroachManager(onBack);
            }, onBack);
        } catch (e) {
            alert('Core Error: ' + e.message + '\n' + e.stack);
        }
    },

    startEndlessMonitor: () => {
        if (Core.endlessMonitorTimer) clearInterval(Core.endlessMonitorTimer);
        Core.endlessMonitorTimer = setInterval(() => {
            const state = sessionStorage.getItem('hege_endless_state');
            if (state !== 'WAIT_FOR_BG') {
                clearInterval(Core.endlessMonitorTimer);
                return;
            }
            
            const bgq = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            if (bgq.length === 0) {
                console.log('[Task 3] BG Queue empty. Reloading for next batch.');
                clearInterval(Core.endlessMonitorTimer);
                sessionStorage.setItem('hege_endless_state', 'RELOADING');
                UI.showToast('[無盡收割] 第一批次清理完畢，準備重新整理載入下一批名單...');
                setTimeout(() => location.reload(), 1500);
            } else {
                if (CONFIG.DEBUG_MODE) console.log(`[Task 3] BG Queue count: ${bgq.length}. Waiting...`);
            }
        }, 3000);
    },

    resumeEndlessSweep: () => {
        console.log('[Task 2] Detected RELOADING state. Attempting to click Likes button...');
        UI.showToast('無盡收割機：自動讀取下一批名單中...', 5000);
        
        let attempts = 0;
        const findLikesTimer = setInterval(() => {
            attempts++;
            if (attempts > 30) { // 15 seconds timeout
                clearInterval(findLikesTimer);
                console.log('[Task 2] Timeout waiting for Likes button. Aborting.');
                sessionStorage.removeItem('hege_endless_state');
                sessionStorage.removeItem('hege_endless_target');
                sessionStorage.removeItem('hege_endless_last_first_user');
                UI.showToast('⚠️ 無法自動尋找按讚名單，無盡收割已中止。');
                return;
            }

            // Look for "N 讚" / "likes" link
            const links = document.querySelectorAll('a[href*="/likes/"], a[href*="/quotes/"], a[href*="/reposts/"]');
            let targetLink = null;
            for (let a of links) {
                const text = (a.innerText || a.textContent || '').toLowerCase();
                if (text.includes('讚') || text.includes('likes') || text.match(/\d+/)) {
                    targetLink = a;
                    break;
                }
            }

            if (targetLink) {
                clearInterval(findLikesTimer);
                Utils.simClick(targetLink);
                
                // Wait for the popup and the list to appear
                setTimeout(() => {
                    const activeCtx = document.querySelector('div[role="dialog"]') || document;
                    
                    // Simple small force scroll to trigger lazy loaded items if needed
                    const scrollable = activeCtx.querySelector('div[style*="overflow-y: auto"], div[style*="overflow: hidden auto"]');
                    if (scrollable) scrollable.scrollTop += 500;

                    setTimeout(() => {
                        // Locate the injected endless btn and execute it to chain next batch
                        const endlessBtn = document.querySelector('.hege-block-all-btn[title*="全自動"]');
                        if (endlessBtn) {
                            Utils.simClick(endlessBtn);
                        } else {
                            // Retry once if slow injection
                            setTimeout(() => {
                                const endlessBtnRetry = document.querySelector('.hege-block-all-btn[title*="全自動"]');
                                if (endlessBtnRetry) Utils.simClick(endlessBtnRetry);
                                else {
                                    sessionStorage.removeItem('hege_endless_state');
                                    UI.showToast('⚠️ 無法自動觸發無盡收割按鈕。');
                                }
                            }, 1000);
                        }
                    }, 1000);
                }, 2000);
            }
        }, 500);
    },

    openBlockManager: () => {
        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        const ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
        UI.showBlockManager(db, ts, (toUnblock) => {
            Core.startUnblock(toUnblock);
        });
    },

    startUnblock: (usernames) => {
        if (!usernames || usernames.length === 0) return;

        const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        // Add prefix to signal unblock task to worker
        const tasks = usernames.map(u => `${CONFIG.UNBLOCK_PREFIX}${u}`);
        const newQ = [...new Set([...q, ...tasks])];

        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
        UI.showToast(`已將 ${usernames.length} 筆解鎖任務加入背景佇列`);

        // Check if worker needs to be opened
        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const running = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
        if (!running) {
            Storage.remove(CONFIG.KEYS.BG_CMD);
            if (Utils.isMobile()) {
                Core.runSameTabWorker();
            } else {
                Utils.openWorkerWindow();
            }
        }
    },

    updateControllerUI: () => {
        // Throttled UI update logic (proper deferral to prevent missed updates)
        if (Core._uiUpdatePending) return;

        const now = Date.now();
        const timeSinceLast = now - (Core._lastUIUpdate || 0);

        if (timeSinceLast < 500) {
            Core._uiUpdatePending = setTimeout(() => {
                Core._uiUpdatePending = null;
                Core.updateControllerUI();
            }, 500 - timeSinceLast);
            return;
        }

        Core._lastUIUpdate = now;
        Core._uiUpdatePending = null;

        const bgMode = Core.getBgMode();
        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));
        const cdq = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
        const bgq = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));
        const dq = new Set(Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []));

        // Global cleanup
        let pendingChanged = false;
        for (const u of Core.pendingUsers) {
            if (db.has(u) || cdq.has(u) || bgq.has(u) || dq.has(u)) {
                Core.pendingUsers.delete(u);
                pendingChanged = true;
            }
        }
        if (pendingChanged) Storage.setSessionJSON(CONFIG.KEYS.PENDING, [...Core.pendingUsers]);

        // Only update visible elements or those that need state change
        document.querySelectorAll('.hege-checkbox-container').forEach(el => {
            const u = el.dataset.username;
            if (!u) return;

            if (db.has(u)) {
                if (!el.classList.contains('finished')) {
                    el.classList.add('finished');
                    el.classList.remove('checked');
                }
            } else if (Core.pendingUsers.has(u) || cdq.has(u) || bgq.has(u) || dq.has(u)) {
                if (!el.classList.contains('checked') && !el.classList.contains('finished')) {
                    el.classList.add('checked');
                } else if (el.classList.contains('finished')) {
                    el.classList.remove('finished');
                    el.classList.add('checked');
                }
            } else {
                el.classList.remove('finished');
                el.classList.remove('checked');
            }
        });

        const selCount = document.getElementById('hege-sel-count');
        if (selCount) selCount.textContent = `${Core.pendingUsers.size} 選取`;

        const historyCount = document.getElementById('hege-history-count');
        if (historyCount) historyCount.textContent = `${db.size}`;

        const panel = document.getElementById('hege-panel');
        if (!panel) return;

        const failedQueue = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        const retryItem = document.getElementById('hege-retry-failed-item');
        const reportItem = document.getElementById('hege-report-item');
        if (retryItem) {
            if (failedQueue.length > 0) {
                retryItem.style.display = 'flex';
                const countBadge = document.getElementById('hege-failed-count');
                if (countBadge) countBadge.textContent = `${failedQueue.length} 筆`;
            } else {
                retryItem.style.display = 'none';
            }
        }

        let badgeText = Core.pendingUsers.size > 0 ? `(${Core.pendingUsers.size})` : '';

        let shouldShowStop = false;
        let mainText = '開始封鎖';
        let headerColor = 'transparent'; // Use transparent or theme color

        const bgqArr = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const firstTask = bgqArr[0] || '';
        const isUnblockTask = firstTask.startsWith(CONFIG.UNBLOCK_PREFIX);

        const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
        if (cooldownUntil > Date.now()) {
            const remainHrs = Math.ceil((cooldownUntil - Date.now()) / (1000 * 60 * 60));
            const cdQueueSize = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []).length;
            mainText = `⛔ 限制保護中 (${remainHrs}小時候恢復)`;
            headerColor = '#ff453a';
            badgeText = `(${cdQueueSize}冷卻中)`;
        } else {
            const delayEnabled = Storage.get(CONFIG.KEYS.DELAYED_BLOCK_ENABLED) === 'true';
            const delayedQueue = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
            const lastTime = parseInt(Storage.get(CONFIG.KEYS.LAST_BATCH_TIME) || '0');
            const now = Date.now();
            const delayMs = CONFIG.DELAY_HOURS * 60 * 60 * 1000;
            const isDelayReady = delayEnabled && delayedQueue.length > 0 && (lastTime === 0 || (now - lastTime) >= delayMs);

            const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            if (bgStatus.state === 'running' && (Date.now() - (bgStatus.lastUpdate || 0) < 10000)) {
                shouldShowStop = true;
                mainText = `${isUnblockTask ? '解除封鎖' : '背景執行'}中 剩餘 ${bgStatus.total}`;
                headerColor = '#4cd964';
                badgeText = `(${bgStatus.total}剩餘)`; // Show progress in header badge explicitly
            } else if (bgq.size > 0) {
                // Worker stopped/idle but queue has remaining items from a previous run
                mainText = `${isUnblockTask ? '繼續解除' : '繼續封鎖'} (${bgq.size} 筆待處理)`;
                headerColor = '#ff9500';
                badgeText = `(${bgq.size}待處理)`;
            } else if (isDelayReady) {
                // 延時水庫準備發放提示
                mainText = `💧 點擊釋放下一批 100 人`;
                headerColor = '#0a84ff';
                badgeText = `(${delayedQueue.length}人排隊中)`;
            } else if (delayEnabled && delayedQueue.length > 0) {
                // 水庫冷卻中狀態展示（但不要擋住一般勾選後的 "開始封鎖"）
                if (Core.pendingUsers.size === 0) {
                    const remainHrs = Math.ceil((delayMs - (now - lastTime)) / (1000 * 60 * 60));
                    mainText = `📥 排隊中 (${remainHrs}小時候發放)`;
                    badgeText = `(${delayedQueue.length}水庫)`;
                }
            }
        }

        const badge = document.getElementById('hege-queue-badge');
        if (badge) badge.textContent = badgeText;

        const stopBtn = document.getElementById('hege-stop-btn-item'); if (stopBtn) stopBtn.style.display = shouldShowStop ? 'flex' : 'none';
        const mainItem = document.getElementById('hege-main-btn-item');
        if (mainItem) { mainItem.querySelector('span').textContent = mainText; mainItem.style.color = shouldShowStop ? headerColor : '#f5f5f5'; }
        const header = document.getElementById('hege-header'); if (header) header.style.borderColor = headerColor;

        // Mutex: Dynamic state for all checkboxes and buttons on the page
        const isUnblocking = bgMode === 'UNBLOCKING';
        document.querySelectorAll('.hege-checkbox-container').forEach(box => {
            box.style.opacity = isUnblocking ? '0.4' : '1';
            box.style.filter = isUnblocking ? 'grayscale(1)' : 'none';
            box.style.cursor = isUnblocking ? 'not-allowed' : 'pointer';
            box.title = isUnblocking ? '正在解除封鎖' : '';
        });

        document.querySelectorAll('.hege-block-all-btn').forEach(btn => {
            btn.style.opacity = isUnblocking ? '0.5' : '1';
            btn.style.filter = isUnblocking ? 'grayscale(1)' : 'none';
            btn.style.cursor = isUnblocking ? 'not-allowed' : 'pointer';
            btn.title = isUnblocking ? '正在解除封鎖，暫時無法封鎖' : '';
        });

        // Mutex: Gray out Unblock Start if Blocking
        const unblockConfirm = document.getElementById('hege-unblock-confirm');
        if (unblockConfirm) {
            const isBlocking = bgMode === 'BLOCKING';
            unblockConfirm.style.opacity = isBlocking ? '0.5' : '1';
            unblockConfirm.style.pointerEvents = isBlocking ? 'none' : 'auto';
            unblockConfirm.title = isBlocking ? '後台正在進行封鎖任務，請先暫停' : '';
            if (isBlocking) {
                unblockConfirm.textContent = '🔒 背景排隊中...';
            } else {
                unblockConfirm.textContent = '確定解除封鎖';
            }
        }
    },

    runSameTabWorker: (explicitToAdd) => {
        const toAdd = explicitToAdd || Array.from(Core.pendingUsers);

        const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const newQ = [...new Set([...q, ...toAdd])];

        if (newQ.length === 0) {
            UI.showToast('沒有待處理的帳號');
            return;
        }

        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
        Storage.remove(CONFIG.KEYS.BG_CMD);
        Storage.remove('hege_worker_stats'); // Fresh stats for new session

        if (toAdd.length > 0 && !explicitToAdd) {
            Core.pendingUsers.clear();
            Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
        }

        // Save current page URL (without hege_bg param) so the worker can navigate back when done
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('hege_bg');
        Storage.set('hege_return_url', cleanUrl.toString());

        // CRITICAL: Use history.replaceState + reload to avoid Universal Links entirely.
        // Since we're already on threads.net, we modify the URL in-place (no navigation event)
        // and reload. Safari sees this as a page refresh, NOT a navigation to a new URL,
        // so Universal Links cannot intercept it.
        const workerUrl = new URL(window.location.origin);
        workerUrl.searchParams.set('hege_bg', 'true');
        history.replaceState(null, '', workerUrl.toString());
        location.reload();
    },

    exportHistory: () => {
        const db = Storage.getJSON(CONFIG.KEYS.DB_KEY, []);
        if (db.length === 0) { UI.showToast('歷史資料庫是空的'); return; }
        const list = db.join('\n');
        navigator.clipboard.writeText(list).then(() => { UI.showToast(`已複製 ${db.length} 人名單`); }).catch(() => { prompt("請手動複製總名單：", list); });
    },

    retryFailedQueue: () => {
        const failedUsers = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        if (failedUsers.length === 0) {
            UI.showToast('沒有失敗紀錄可重試');
            return;
        }

        UI.showConfirm(`發現 ${failedUsers.length} 筆過去封鎖失敗或找不到人的帳號。\n確定要重新將他們加入排隊列重試嗎？`, () => {
            let activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const combinedQueue = [...new Set([...activeQueue, ...failedUsers])];
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, combinedQueue);
            Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []); // Clear it out
            UI.showToast(`已將 ${failedUsers.length} 筆名單重送至背景排隊`);

            Core.updateControllerUI();

            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
            if (!isRunning) {
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    Utils.openWorkerWindow();
                }
            }
        });
    },

    importList: () => {
        const input = prompt("請貼上 ID 名單："); if (!input) return;
        let rawUsers = input.split(/[\s,，\n]+/).map(u => u.trim()).filter(u => u.length > 0).map(u => {
            u = u.split('?')[0]; // 去除網址帶有的 tracking parameters
            if (u.includes('/@')) return u.split('/@')[1].split('/')[0];
            if (u.startsWith('@')) return u.substring(1);
            return u.split('/')[0];
        });

        // 名單內部自身去重
        rawUsers = [...new Set(rawUsers)];

        const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        let activeQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const activeSet = new Set(activeQueue);

        // 雙重過濾：不在歷史紀錄中，且不在當前的排隊佇列中
        const newUsers = rawUsers.filter(u => !db.has(u) && !activeSet.has(u));

        if (newUsers.length === 0) { UI.showToast('沒有新名單可匯入 (皆已在歷史庫或等待佇列中)'); return; }

        const combinedQueue = [...activeQueue, ...newUsers];
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, combinedQueue);

        UI.showToast(`已匯入 ${newUsers.length} 筆至背景佇列`);

        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const isRunning = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');

        if (!isRunning) {
            UI.showConfirm(`已匯入 ${newUsers.length} 筆名單。\n是否立即開始背景執行？`, () => {
                if (Utils.isMobile()) {
                    Core.runSameTabWorker();
                } else {
                    Utils.openWorkerWindow();
                }
            });
        } else if (isRunning) {
            UI.showToast('已合併至正在運行的背景任務');
        }
    },

    collectDiagnostics: () => {
        const _platform = navigator.userAgentData?.platform || navigator.platform || '';
        const isIPad = (_platform === 'macOS' || _platform === 'MacIntel') && navigator.maxTouchPoints > 1;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || isIPad;
        const platform = isIOS ? 'iOS/iPad' : 'Desktop';

        // Detect Threads UI language from aria labels
        const svgs = document.querySelectorAll('svg[aria-label]');
        const ariaLabels = Array.from(svgs).map(s => s.getAttribute('aria-label'));
        const hasZh = ariaLabels.some(l => /[\u4e00-\u9fff]/.test(l));
        const hasEn = ariaLabels.some(l => /^[A-Za-z ]+$/.test(l));
        const langDetected = hasZh ? 'zh' : (hasEn ? 'en' : 'unknown');

        // SVG structure of "More" buttons
        const moreSvgs = document.querySelectorAll('svg[aria-label="更多"], svg[aria-label="More"]');
        const svgDetails = Array.from(moreSvgs).map(s => {
            const hasCircle = !!s.querySelector('circle');
            const pathCount = s.querySelectorAll('path').length;
            const vb = s.getAttribute('viewBox');
            return `circle=${hasCircle},paths=${pathCount},vb=${vb}`;
        });

        // Menu items if any are open
        const menuItems = document.querySelectorAll('div[role="menuitem"]');
        const menuTexts = Array.from(menuItems).map(el => (el.innerText || '').trim().substring(0, 30));

        // Dialog info
        const dialogs = document.querySelectorAll('div[role="dialog"]');
        const dialogTexts = Array.from(dialogs).map(d => (d.innerText || '').trim().substring(0, 80));

        // Queue states
        const bgQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const failedQueue = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        const cooldownQueue = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
        const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
        const cooldownActive = cooldownUntil > Date.now();
        const cooldownRemain = cooldownActive ? Math.ceil((cooldownUntil - Date.now()) / (1000 * 60 * 60)) + 'h' : 'N/A';

        // Worker stats
        const workerStats = Storage.getJSON('hege_worker_stats', {});
        const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});

        // Debug logs
        let debugLogs = [];
        try {
            debugLogs = JSON.parse(localStorage.getItem(CONFIG.KEYS.DEBUG_LOG) || '[]');
        } catch (e) { }

        // Checkbox states
        const checkboxes = document.querySelectorAll('.hege-checkbox-container');
        const cbChecked = Array.from(checkboxes).filter(el => el.classList.contains('checked')).length;
        const cbFinished = Array.from(checkboxes).filter(el => el.classList.contains('finished')).length;

        // UserScript manager detection
        let injectionMethod = 'unknown';
        if (typeof GM_info !== 'undefined') injectionMethod = 'Tampermonkey/Userscripts';
        else if (document.querySelector('script[src*="content.js"]')) injectionMethod = 'Chrome Extension';
        else if (typeof browser !== 'undefined' && browser.runtime) injectionMethod = 'Firefox Extension';
        else if (typeof chrome !== 'undefined' && chrome.runtime) injectionMethod = 'Chrome Extension';

        // Build report
        const lines = [
            `🛡️ 留友封 診斷報告`,
            `版本: ${CONFIG.VERSION}`,
            `平台: ${platform} | ${navigator.platform} | TP:${navigator.maxTouchPoints}`,
            `UA: ${navigator.userAgent}`,
            `注入: ${injectionMethod}`,
            `語言: ${langDetected} (偵測自 aria-labels)`,
            `URL: ${location.pathname}${location.search}`,
            ``,
            `── 佇列狀態 ──`,
            `待處理: ${bgQueue.length} | 失敗: ${failedQueue.length} | 冷卻備份: ${cooldownQueue.length}`,
            `冷卻中: ${cooldownActive ? '⚠️ 是 (剩餘 ' + cooldownRemain + ')' : '❌ 否'}`,
            `Worker: ${bgStatus.state || 'idle'} | 最後更新: ${bgStatus.lastUpdate ? new Date(bgStatus.lastUpdate).toLocaleTimeString() : 'N/A'}`,
            ``,
            `── Worker 統計 ──`,
            `成功: ${(workerStats.stats && workerStats.stats.success) || 'N/A'} | 跳過: ${(workerStats.stats && workerStats.stats.skipped) || 'N/A'} | 失敗: ${(workerStats.stats && workerStats.stats.failed) || 'N/A'}`,
            `驗證等級: ${workerStats.verifyLevel || 'N/A'} | 連續失敗: ${workerStats.consecutiveFails || 'N/A'}`,
            `Session 名單: ${(workerStats.sessionQueue && workerStats.sessionQueue.length) || 'N/A'} | 初始 Total: ${workerStats.initialTotal || 'N/A'}`,
            ``,
            `── DOM 快照 ──`,
            `更多按鈕 SVG(${moreSvgs.length}): ${svgDetails.length > 0 ? svgDetails.join(' | ') : '未找到'}`,
            `頁面 aria-labels(${ariaLabels.length}): ${JSON.stringify([...new Set(ariaLabels)])}`,
            `menuitem(${menuTexts.length}): ${menuTexts.length > 0 ? JSON.stringify(menuTexts) : '無'}`,
            `dialogs(${dialogs.length}): ${dialogTexts.length > 0 ? JSON.stringify(dialogTexts) : '無'}`,
            `checkbox: ${checkboxes.length}個 (✅${cbFinished} ☑️${cbChecked})`,
            ``,
            `── 失敗清單 ──`,
            failedQueue.length > 0 ? failedQueue.join(', ') : '(空)',
            ``,
            `── 執行紀錄 (最近${debugLogs.length}筆) ──`,
            ...debugLogs,
            ``,
            `── Web Console 追蹤 (最近50筆) ──`,
            ...Utils.getRecentLogs()
        ];

        return lines.join('\n');
    },

    showReportDialog: () => {
        const reportData = Core.collectDiagnostics();

        UI.showBugReportModal(async (level, message) => {
            return await Reporter.submitReport(level, message, "UI_REPORT", {
                diagnostics: reportData,
                speedMode: Utils.getSpeedMode(),
                checkboxDiag: Utils.getDiagLogs()
            });
        });
    },

    // ============================================================================
    // Task 1: 貼文深層清理 - 機制容器與排程器管理 (Deep Post Sweeper)
    // ============================================================================
    addPostTask: (url) => {
        let queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        const cleanUrl = url.split('?')[0];
        
        // 移除重複
        queue = queue.filter(q => q.url.split('?')[0] !== cleanUrl);
        queue.push({
            url: cleanUrl,
            addedAt: Date.now(),
            lastSweptAt: 0, // 初始化為 0 以觸發立即喚醒
            sweepCount: 0,
            status: 'pending' // pending (冷卻中), active (執行中), error (異常中斷)
        });
        
        Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
        UI.showToast('✅ 此貼文已排入深層清理水庫，系統將定時自動跳轉掃蕩。');
        console.log(`[DeepSweep-Q] 貼文已加入排程: ${cleanUrl}`);
        
        // 若此時剛加入，可直接觸發看看
        setTimeout(() => Core.checkPostQueueWakeup(), 3000);
    },


    checkPostQueueWakeup: () => {
        // 防爆走保險：如果當前分頁已經在幾分鐘內跳轉過，暫不再次強制跳轉
        const lastLock = parseInt(sessionStorage.getItem('hege_post_sweep_lock') || '0');
        if (Date.now() - lastLock < 5 * 60 * 1000) {
            return; // 5 分鐘內跳過，避免死迴圈
        }

        let queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
        if (queue.length === 0) return;

        const now = Date.now();
        const COOLDOWN_MS = CONFIG.POST_SWEEP_COOLDOWN_HOURS * 60 * 60 * 1000;

        let targetPost = null;
        for (let post of queue) {
            // 找出超過 8 小時未清理的 pending 貼文
            if (post.status !== 'error' && (now - post.lastSweptAt > COOLDOWN_MS)) {
                targetPost = post;
                break; // 取第一篇最老的
            }
        }

        if (targetPost) {
            console.log(`[DeepSweep-Q] ⏰ 偵測到排程貼文冷卻時間已滿，即將啟動被動喚醒跳轉...`, targetPost.url);
            
            // 寫入 Session Lock
            sessionStorage.setItem('hege_post_sweep_lock', Date.now().toString());

            // 將狀態先轉為活躍，避免其他分頁重複搶佔此任務
            targetPost.lastSweptAt = Date.now();
            targetPost.status = 'active';
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);

            UI.showToast('⚠️ [深層清理] 檢測到水庫貼文時間已到，3 秒後將全自動進入清理模式...', 5000);
            setTimeout(() => {
                const sep = targetPost.url.includes('?') ? '&' : '?';
                const targetUrl = targetPost.url + sep + 'hege_post_sweep=true';
                
                if (Utils.isMobile()) {
                    // Mobile (iOS) fallback to current window navigation due to popup blockers
                    const targetPath = new URL(targetUrl).pathname + new URL(targetUrl).search;
                    history.replaceState(null, '', targetPath);
                    location.reload();
                } else {
                    // Desktop: Open in a dedicated worker window to avoid disturbing the user
                    window.open(targetUrl, 'HegeSweepWorker', 'width=800,height=600,left=100,top=100');
                    UI.showToast('ℹ️ 已在獨立視窗啟動清理任務，請勿關閉該小視窗', 5000);
                }
            }, 3000);
        }
    }
};

// --- worker.js ---




const Worker = {
    stats: { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: 0 },
    initialTotal: 0,
    sessionQueue: [],          // 本次 session 完整名單快照
    verifyLevel: 0,            // 0=每5次, 1=每3次, 2=每次
    verifyCount: 0,            // 自上次驗證以來的計數
    consecutiveRateLimits: 0,
    consecutiveFails: 0,       // Level 2 連續失敗計數

    saveStats: () => {
        Storage.setJSON(CONFIG.KEYS.WORKER_STATS, {
            stats: Worker.stats,
            initialTotal: Worker.initialTotal,
            sessionQueue: Worker.sessionQueue,
            verifyLevel: Worker.verifyLevel,
            verifyCount: Worker.verifyCount,
            consecutiveFails: Worker.consecutiveFails,
            consecutiveRateLimits: Worker.consecutiveRateLimits
        });
    },

    loadStats: () => {
        const saved = Storage.getJSON(CONFIG.KEYS.WORKER_STATS, null);
        if (saved && saved.stats) {
            Worker.stats = saved.stats;
            Worker.initialTotal = saved.initialTotal || 0;
            Worker.sessionQueue = saved.sessionQueue || [];
            Worker.verifyLevel = saved.verifyLevel || 0;
            Worker.verifyCount = saved.verifyCount || 0;
            Worker.consecutiveFails = saved.consecutiveFails || 0;
            Worker.consecutiveRateLimits = saved.consecutiveRateLimits || 0;
        } else {
            Worker.stats = { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: Date.now() };
            Worker.initialTotal = 0;
            Worker.sessionQueue = [];
            Worker.verifyLevel = 0;
            Worker.verifyCount = 0;
            Worker.consecutiveFails = 0;
            Worker.consecutiveRateLimits = 0;
        }
    },

    clearStats: () => {
        Storage.remove(CONFIG.KEYS.WORKER_STATS);
    },

    init: async () => {
        Worker.loadStats();
        // Pre-initialize UI to capture early logs
        Worker.createStatusUI();

        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const first = queue[0] || '';
        const isUnblock = first.startsWith(CONFIG.UNBLOCK_PREFIX);

        document.title = `🛡️ 留友封-${isUnblock ? '解除封鎖' : '背景執行'}中`;

        // Enforce maximum safe desktop window size
        try {
            if (window.outerWidth > 800 || window.outerHeight > 600) {
                window.resizeTo(800, 600);
            }
        } catch (e) { }

        const channel = new BroadcastChannel('hege_debug_channel');
        window.hegeLog = (msg) => {
            if (CONFIG.DEBUG_MODE) {
                console.log(`[BG-LOG] ${msg}`);
                channel.postMessage({ type: 'log', msg: `[BG] ${msg}` });
            }

            // Always Append to UI Log in the worker window regardless of DEBUG_MODE
            const logEl = document.getElementById('hege-worker-log');
            if (logEl) {
                const line = document.createElement('div');
                line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
                line.style.borderBottom = '1px solid #333';
                logEl.prepend(line); // Newest on top
            }
            // Persist to localStorage buffer
            try {
                const logs = JSON.parse(localStorage.getItem(CONFIG.KEYS.DEBUG_LOG) || '[]');
                logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
                if (logs.length > 100) logs.splice(0, logs.length - 100);
                localStorage.setItem(CONFIG.KEYS.DEBUG_LOG, JSON.stringify(logs));
            } catch (e) { }
        };

        // Worker 視窗關閉時清理狀態
        window.addEventListener('beforeunload', () => {
            Storage.remove(CONFIG.KEYS.VERIFY_PENDING);
            // 批次驗證進度不清除 — 重新開啟 Worker 時可繼續
            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            if (status.state === 'running') {
                status.state = 'paused';
                status.lastUpdate = Date.now();
                Storage.setJSON(CONFIG.KEYS.BG_STATUS, status);
            }
            Worker.saveStats();
        });

        window.hegeLog('[BG-INIT] Worker Started');

        // Cooldown check
        const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
        if (cooldownUntil > Date.now()) {
            const remainMs = cooldownUntil - Date.now();
            const remainHrs = Math.ceil(remainMs / (1000 * 60 * 60));
            Worker.updateStatus('error', `⛔ 封鎖功能被限制，約 ${remainHrs} 小時後自動恢復`);
            const stopBtn = document.getElementById('hege-worker-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            return;
        }

        // Restore from cooldown queue if needed
        const cooldownQueue = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
        if (cooldownQueue.length > 0) {
            const currentQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            // 以 username 為 key 去重，cooldownQueue 的操作優先（較新）
            const extractUser = (entry) => entry.startsWith(CONFIG.UNBLOCK_PREFIX) ? entry.replace(CONFIG.UNBLOCK_PREFIX, '') : entry;
            const seen = new Map(); // username → raw entry
            [...currentQueue, ...cooldownQueue].forEach(entry => {
                seen.set(extractUser(entry), entry);
            });
            const merged = [...seen.values()];
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, merged);
            Storage.remove(CONFIG.KEYS.COOLDOWN_QUEUE);
            Storage.remove(CONFIG.KEYS.COOLDOWN);

            Worker.stats = { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: Date.now() };
            Worker.initialTotal = 0;
            Worker.sessionQueue = [];
            Worker.verifyLevel = 0;
            Worker.verifyCount = 0;
            Worker.consecutiveFails = 0;
            Worker.saveStats();
            window.hegeLog(`[BG-INIT] Cooldown expired, restored ${cooldownQueue.length} users from backup`);
        }

        setTimeout(Worker.runStep, 1000);
    },

    createStatusUI: () => {
        const cover = document.createElement('div');
        cover.id = 'hege-worker-cover';
        cover.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%);color:#e0e0e0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;font-family:system-ui,-apple-system,sans-serif;font-size:14px;padding:24px 20px;box-sizing:border-box;overflow:hidden;';

        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const first = queue[0] || '';
        const isVerifying = !!Storage.get(CONFIG.KEYS.VERIFY_PENDING);
        const isUnblock = first.startsWith(CONFIG.UNBLOCK_PREFIX) || (isVerifying && (Storage.get(CONFIG.KEYS.VERIFY_PENDING) || '').startsWith(CONFIG.UNBLOCK_PREFIX));

        Utils.setHTML(cover, `
            <div style="width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center;flex:1;overflow:hidden;">
                <div id="hege-worker-title" style="font-size:22px;font-weight:700;margin-bottom:4px;letter-spacing:0.5px;">🛡️ ${isUnblock ? '解除封鎖進行中' : '封鎖進行中'}</div>
                <div style="font-size:12px;color:#666;margin-bottom:24px;">請勿離開此頁面，完成後會自動返回</div>

                <!-- Progress Bar -->
                <div style="width:100%;background:#222;border-radius:12px;height:28px;overflow:hidden;margin-bottom:8px;position:relative;box-shadow:inset 0 2px 4px rgba(0,0,0,0.5);">
                    <div id="hege-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#4cd964,#30d158);border-radius:12px;transition:width 0.5s ease;position:relative;">
                        <div style="position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:12px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5);" id="hege-progress-pct">0%</div>
                    </div>
                </div>
                <div id="hege-progress-text" style="font-size:13px;color:#888;margin-bottom:20px;">準備中...</div>

                <!-- Stats Row -->
                <div style="display:flex;gap:16px;margin-bottom:16px;width:100%;justify-content:center;">
                    <div style="text-align:center;flex:1;background:#1a2e1a;border-radius:10px;padding:10px 0;">
                        <div id="hege-stat-success" style="font-size:24px;font-weight:700;color:#4cd964;">0</div>
                        <div style="font-size:11px;color:#6a6a6a;margin-top:2px;">✅ 成功</div>
                    </div>
                    <div style="text-align:center;flex:1;background:#2e2e1a;border-radius:10px;padding:10px 0;">
                        <div id="hege-stat-skipped" style="font-size:24px;font-weight:700;color:#ff9f0a;">0</div>
                        <div style="font-size:11px;color:#6a6a6a;margin-top:2px;">⏭️ 跳過</div>
                    </div>
                    <div style="text-align:center;flex:1;background:#2e1a1a;border-radius:10px;padding:10px 0;">
                        <div id="hege-stat-failed" style="font-size:24px;font-weight:700;color:#ff453a;">0</div>
                        <div style="font-size:11px;color:#6a6a6a;margin-top:2px;">❌ 失敗</div>
                    </div>
                    <div style="text-align:center;flex:1;background:#1a1a1a;border-radius:10px;padding:10px 0;">
                        <div id="hege-stat-vanished" style="font-size:24px;font-weight:700;color:#888;">0</div>
                        <div style="font-size:11px;color:#6a6a6a;margin-top:2px;">🫥 已消失</div>
                    </div>
                </div>

                <!-- ETA -->
                <div id="hege-eta" style="font-size:13px;color:#888;margin-bottom:6px;">⏱️ 計算中...</div>

                <!-- Current Target -->
                <div id="bg-status" style="font-size:15px;font-weight:600;color:#4cd964;margin-bottom:20px;">等待指令...</div>

                <!-- Stop Button -->
                <div id="hege-worker-stop" style="background:#ff453a;color:#fff;font-size:16px;font-weight:700;padding:14px 48px;border-radius:14px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 12px rgba(255,69,58,0.3);transition:transform 0.15s,opacity 0.15s;margin-bottom:20px;">🛑 停止${isUnblock ? '解除封鎖' : '封鎖'}</div>

                <!-- Debug Log -->
                <div id="hege-worker-log" style="width:100%;flex:1;overflow-y:auto;border:1px solid #222;border-radius:8px;padding:10px;text-align:left;font-family:monospace;font-size:11px;color:#555;background:#0a0a0a;"></div>
            </div>
        `);
        document.body.appendChild(cover);

        // Bind stop button
        const stopBtn = document.getElementById('hege-worker-stop');
        if (stopBtn) {
            const handleStop = () => {
                Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
                stopBtn.textContent = '⏳ 正在停止...';
                stopBtn.style.background = '#666';
                stopBtn.style.pointerEvents = 'none';
            };
            stopBtn.addEventListener('click', handleStop);
            if (Utils.isMobile()) {
                stopBtn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleStop();
                }, { passive: false });
            }
        }
    },

    updateStatus: (state, current = '', progress = 0, total = 0) => {
        const s = { state, current, progress, total, lastUpdate: Date.now() };
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, s);

        // Status text
        const el = document.getElementById('bg-status');
        if (el) el.textContent = state === 'running' ? `目前：@${current.replace(/^(前往|封鎖中|略過|解除封鎖中|解鎖前往)[：:] ?/, '')}` : current;

        // Title
        const processed = Worker.stats.success + Worker.stats.skipped + Worker.stats.failed + Worker.stats.vanished;
        const initTotal = Worker.initialTotal || total;
        document.title = state === 'running' ? `🛡️ ${processed}/${initTotal}` : '🛡️ 留友封';

        // Progress bar
        const pct = initTotal > 0 ? Math.round((processed / initTotal) * 100) : 0;
        const bar = document.getElementById('hege-progress-bar');
        const pctEl = document.getElementById('hege-progress-pct');
        const progressText = document.getElementById('hege-progress-text');
        const workerTitle = document.getElementById('hege-worker-title');
        const workerCover = document.getElementById('hege-worker-cover');

        const isVerifying = !!Storage.get(CONFIG.KEYS.VERIFY_PENDING);

        if (bar) {
            bar.style.width = `${pct}%`;
            bar.style.background = isVerifying
                ? 'linear-gradient(90deg,#007aff,#5ac8fa)' // Blue for verify
                : 'linear-gradient(90deg,#4cd964,#30d158)'; // Green for work
        }

        if (workerCover) {
            workerCover.style.background = isVerifying
                ? 'linear-gradient(135deg,#0a0a0a 0%,#1a2a4a 100%)' // Deep Blue for verify
                : 'linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%)'; // Regular Navy
        }

        if (workerTitle) {
            const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const isUnblock = (queue[0] || '').startsWith(CONFIG.UNBLOCK_PREFIX) || (isVerifying && Storage.get(CONFIG.KEYS.VERIFY_PENDING).startsWith(CONFIG.UNBLOCK_PREFIX));

            if (isVerifying) {
                workerTitle.textContent = '🔍 驗證正在進行中...';
                workerTitle.style.color = '#5ac8fa';
            } else {
                workerTitle.textContent = `🛡️ ${isUnblock ? '解除封鎖進行中' : '封鎖進行中'}`;
                workerTitle.style.color = '#fff';
            }
        }

        if (pctEl) pctEl.textContent = `${pct}%`;
        if (progressText) progressText.textContent = isVerifying ? `正在確認結果... (@${current})` : `${processed} / ${initTotal} 已處理`;

        // Stats counters
        const sEl = document.getElementById('hege-stat-success');
        const skEl = document.getElementById('hege-stat-skipped');
        const fEl = document.getElementById('hege-stat-failed');
        const vEl = document.getElementById('hege-stat-vanished');
        if (sEl) sEl.textContent = Worker.stats.success;
        if (skEl) skEl.textContent = Worker.stats.skipped;
        if (fEl) fEl.textContent = Worker.stats.failed;
        if (vEl) vEl.textContent = Worker.stats.vanished;

        // ETA calculation
        const etaEl = document.getElementById('hege-eta');
        if (etaEl && processed > 0 && state === 'running') {
            const elapsed = (Date.now() - Worker.stats.startTime) / 1000;
            const avgPerUser = elapsed / processed;
            const remaining = initTotal - processed;
            const etaSec = Math.round(avgPerUser * remaining);
            if (etaSec > 60) {
                const mins = Math.floor(etaSec / 60);
                const secs = etaSec % 60;
                etaEl.textContent = `⏱️ 預估剩餘：~${mins} 分 ${secs} 秒`;
            } else {
                etaEl.textContent = `⏱️ 預估剩餘：~${etaSec} 秒`;
            }
        } else if (etaEl && state !== 'running') {
            etaEl.textContent = state === 'idle' ? '⏱️ 已完成' : `⏱️ ${state}`;
        }
    },

    // 批次驗證：reload 後繼續的入口
    resumeBatchVerify: async () => {
        const idxStr = Storage.get('hege_batch_verify_idx');
        if (idxStr === null) return false;

        const batchQueue = Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []);
        const idx = parseInt(idxStr);
        if (idx >= batchQueue.length) {
            // 全部完成
            Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, []);
            Storage.remove('hege_batch_verify_idx');
            return false;
        }

        const rawTarget = batchQueue[idx];
        const isUnblock = rawTarget.startsWith(CONFIG.UNBLOCK_PREFIX);
        const user = isUnblock ? rawTarget.replace(CONFIG.UNBLOCK_PREFIX, '') : rawTarget;
        const total = batchQueue.length;

        Worker.updateStatus('running', `驗證中: @${user} (${idx + 1}/${total})`, 0, total - idx);
        if (window.hegeLog) window.hegeLog(`[批次驗證] @${user} (${idx + 1}/${total})`);

        // 確認是否在正確頁面
        const onPage = location.pathname.includes(`/@${user}`);
        if (onPage) {
            const result = await Worker.verifyBlock(user, isUnblock);
            if (result) {
                if (window.hegeLog) window.hegeLog(`[批次驗證] @${user} ✅ 確認成功`);
            } else {
                if (window.hegeLog) window.hegeLog(`[批次驗證] @${user} ❌ 驗證失敗`);
                // 從 DB 移除未確認的封鎖
                let db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
                let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
                if (!isUnblock && db.has(user)) {
                    db.delete(user);
                    delete ts[user];
                    Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);
                    Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);
                    // 加入失敗佇列
                    let fq = new Set(Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []));
                    fq.add(user);
                    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [...fq]);
                    if (window.hegeLog) window.hegeLog(`[批次驗證] @${user} 已從 DB 移除，加入失敗佇列`);
                }
            }
        } else {
            if (window.hegeLog) window.hegeLog(`[批次驗證] @${user} 頁面不符，跳過`);
        }

        // 下一筆
        const nextIdx = idx + 1;
        if (nextIdx >= batchQueue.length) {
            // 全部完成
            if (window.hegeLog) window.hegeLog(`[批次驗證] 全部完成`);
            Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, []);
            Storage.remove('hege_batch_verify_idx');
            Worker.updateStatus('idle', '✅ 全部完成（含驗證）！', 0, 0);
            Worker.clearStats();
            const stopBtn = document.getElementById('hege-worker-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            Worker.navigateBack();
            return true;
        }

        // 導航到下一筆
        Storage.set('hege_batch_verify_idx', nextIdx.toString());
        const nextRaw = batchQueue[nextIdx];
        const nextUser = nextRaw.startsWith(CONFIG.UNBLOCK_PREFIX) ? nextRaw.replace(CONFIG.UNBLOCK_PREFIX, '') : nextRaw;
        const nextPath = `/@${nextUser}/replies`;
        history.replaceState(null, '', `${nextPath}?hege_bg=true`);
        location.reload();
        return true; // 告訴呼叫者已接管流程
    },

    navigateBack: () => {
        setTimeout(() => {
            const returnUrl = Storage.get('hege_return_url');
            if (returnUrl) {
                Storage.remove('hege_return_url');
                // Use history.replaceState + reload to avoid Universal Links on iOS
                const url = new URL(returnUrl);
                history.replaceState(null, '', url.pathname + url.search);
                location.reload();
            } else {
                // Desktop popup fallback
                window.close();
            }
        }, 2000);
    },

    runStep: async () => {
        if (Storage.get(CONFIG.KEYS.BG_CMD) === 'stop') {
            Storage.remove(CONFIG.KEYS.BG_CMD);
            Storage.remove(CONFIG.KEYS.VERIFY_PENDING);
            Storage.remove('hege_batch_verify_idx');
            Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, []);
            Worker.updateStatus('stopped', '已停止');
            Worker.clearStats();
            Worker.navigateBack();
            return;
        }

        // 批次驗證 resume（turbo 模式，reload 後繼續）
        const batchResumed = await Worker.resumeBatchVerify();
        if (batchResumed) return;

        // Handle pending verification (after page reload)
        const verifyPending = Storage.get(CONFIG.KEYS.VERIFY_PENDING);
        if (verifyPending) {
            const isUnblockVerify = verifyPending.startsWith(CONFIG.UNBLOCK_PREFIX);
            const targetUser = isUnblockVerify ? verifyPending.replace(CONFIG.UNBLOCK_PREFIX, '') : verifyPending;

            // Trigger UI update to Verification Mode
            Worker.updateStatus('running', targetUser);

            Storage.remove(CONFIG.KEYS.VERIFY_PENDING);
            const onVerifyPage = new RegExp(`^/@${targetUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\/|$)`).test(location.pathname);
            if (onVerifyPage) {
                window.hegeLog(`[驗證] 頁面已刷新，驗證 @${targetUser}`);
                const verified = await Worker.verifyBlock(targetUser, isUnblockVerify);
                let queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                const currentTotal = queue.length;

                if (!verified) {
                    window.hegeLog(`[驗證] @${targetUser} 驗證失敗 (靜默失敗)`);
                    if (Worker.verifyLevel < 2) {
                        Worker.verifyLevel++;
                        Worker.consecutiveFails = 0;
                        window.hegeLog(`[驗證] 升級至 Level ${Worker.verifyLevel}`);
                    } else {
                        Worker.consecutiveFails++;
                        window.hegeLog(`[驗證] Level 2 連續失敗 ${Worker.consecutiveFails}/5`);
                        if (Worker.consecutiveFails >= 5) {
                            await Worker.triggerCooldown();
                            return;
                        }
                    }
                    Worker.stats.failed++;
                    Worker.saveStats();
                    if (queue.length > 0 && queue[0] === verifyPending) {
                        queue.shift();
                        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
                    }
                    let fq = new Set(Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []));
                    fq.add(targetUser);
                    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [...fq]);
                    Worker.updateStatus('running', targetUser, 0, currentTotal);
                    setTimeout(Worker.runStep, 100);
                    return;
                }

                // Verification passed
                Worker.consecutiveFails = 0;
                Worker.stats.success++;
                Worker.saveStats();
                if (queue.length > 0 && queue[0] === verifyPending) {
                    queue.shift();
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
                }

                let db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
                let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});

                if (isUnblockVerify) {
                    db.delete(targetUser);
                    delete ts[targetUser];
                } else {
                    db.add(targetUser);
                    ts[targetUser] = Date.now();
                }

                Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);
                Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);
                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
                return;
            } else {
                // 頁面不符 — 不更新 DB，清除 VERIFY_PENDING 讓下一步正常處理
                window.hegeLog(`[驗證] 頁面不符，跳過驗證 @${targetUser}，不更新 DB`);
                // 不 shift 佇列，讓 runStep 重新導航到正確頁面
            }
        }

        // 每步開始前 invalidate cache，確保讀到最新佇列（避免與 Controller 競態）
        Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
        let queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        if (queue.length === 0) {
            // 檢查是否有批次驗證待執行（turbo 模式）
            const batchQueue = Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []);
            if (batchQueue.length > 0) {
                if (window.hegeLog) window.hegeLog(`[批次驗證] 封鎖完成，開始驗證 ${batchQueue.length} 筆`);
                Storage.set('hege_batch_verify_idx', '0');
                // 導航到第一筆
                const firstRaw = batchQueue[0];
                const firstUser = firstRaw.startsWith(CONFIG.UNBLOCK_PREFIX) ? firstRaw.replace(CONFIG.UNBLOCK_PREFIX, '') : firstRaw;
                history.replaceState(null, '', `/@${firstUser}/replies?hege_bg=true`);
                location.reload();
                return;
            }

            Worker.updateStatus('idle', '✅ 全部完成！', 0, 0);
            Worker.clearStats();
            const stopBtn = document.getElementById('hege-worker-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            Worker.navigateBack();
            return;
        }

        // Record initial total on first run, and dynamically sync if queue grows
        if (Worker.initialTotal === 0) {
            Worker.initialTotal = queue.length;
            Worker.sessionQueue = [...queue]; // 快照本次 session 名單
            Worker.saveStats();
        } else {
            // 動態同步：若佇列在執行期間被外部追加，更新 total + sessionQueue
            const processed = Worker.stats.success + Worker.stats.skipped + Worker.stats.failed + Worker.stats.vanished;
            const currentTotal = processed + queue.length;
            if (currentTotal > Worker.initialTotal) {
                // Append new users to sessionQueue
                const sessionSet = new Set(Worker.sessionQueue);
                queue.forEach(u => { if (!sessionSet.has(u)) Worker.sessionQueue.push(u); });
                Worker.initialTotal = currentTotal;
                Worker.saveStats();
            }
        }

        const rawTarget = queue[0];
        const isUnblock = rawTarget.startsWith(CONFIG.UNBLOCK_PREFIX);
        const targetUser = isUnblock ? rawTarget.replace(CONFIG.UNBLOCK_PREFIX, '') : rawTarget;
        const currentTotal = queue.length;

        let db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        if (!isUnblock && db.has(targetUser)) {
            Worker.stats.skipped++;
            Worker.saveStats();
            Worker.updateStatus('running', `略過: ${targetUser}`, 0, currentTotal);
            queue.shift();
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
            setTimeout(Worker.runStep, 100);
            return;
        }

        const onTargetPage = new RegExp(`^/@${targetUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\/|$)`).test(location.pathname);
        if (!onTargetPage) {
            Worker.updateStatus('running', `${isUnblock ? '解鎖前往' : '前往'}: ${targetUser}`, 0, currentTotal);
            await Utils.speedSleep(500 + Math.random() * 300);
            const useReplies = Storage.get(CONFIG.KEYS.POST_FALLBACK) !== 'false';
            const navPath = useReplies ? `/@${targetUser}/replies` : `/@${targetUser}`;
            history.replaceState(null, '', `${navPath}?hege_bg=true`);
            location.reload();
        } else {
            Worker.updateStatus('running', `${isUnblock ? '解除封鎖中' : '封鎖中'}: ${targetUser}`, 0, currentTotal);
            const result = await Worker.autoBlock(targetUser, isUnblock);

            if (result === 'success' || result === 'already_blocked' || result === 'already_unblocked') {
                // Post-block/unblock verification via adaptive sampling
                Worker.verifyCount++;
                if (result === 'success' && Worker.shouldVerify()) {
                    // Save pending verification and reload page
                    window.hegeLog(`[驗證] Level ${Worker.verifyLevel} 排定驗證 @${targetUser}，重新載入頁面...`);
                    Storage.set(CONFIG.KEYS.VERIFY_PENDING, rawTarget);
                    Worker.saveStats();
                    await Utils.speedSleep(800);
                    location.reload();
                    return;
                }

                // No inline verification — turbo 模式記錄到批次驗證佇列
                Worker.addToBatchVerify(rawTarget);
                Worker.stats.success++;
                Worker.consecutiveRateLimits = 0;
                Worker.saveStats();
                let q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (q.length > 0 && q[0] === rawTarget) {
                    q.shift();
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, q);
                }

                db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
                let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});

                if (isUnblock) {
                    db.delete(targetUser);
                    delete ts[targetUser];
                } else {
                    db.add(targetUser);
                    ts[targetUser] = Date.now();
                }

                Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);
                Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);

                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
            } else if (result === 'failed') {
                Worker.stats.failed++;
                Worker.saveStats();
                // Remove from active queue
                let q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (q.length > 0 && q[0] === rawTarget) {
                    q.shift();
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, q);
                }

                // Add to failed queue (DO NOT add to history DB)
                let fq = new Set(Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []));
                fq.add(targetUser);
                Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [...fq]);

                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
            } else if (result === 'vanished') {
                Worker.stats.vanished++;
                Worker.saveStats();
                // Remove from active queue
                let q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (q.length > 0 && q[0] === rawTarget) {
                    q.shift();
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, q);
                }

                // Remove from database since user is gone
                let db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
                let ts = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
                if (db.has(targetUser)) {
                    db.delete(targetUser);
                    delete ts[targetUser];
                    Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);
                    Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, ts);
                    window.hegeLog(`[清理] @${targetUser} 已從資料庫移除 (404/失效)`);
                }

                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
            } else if (result === 'rate_limited') {
                Worker.consecutiveRateLimits++;
                Worker.saveStats();

                if (Worker.consecutiveRateLimits >= 3) {
                    if (window.hegeLog) window.hegeLog(`[⚠️警告] 選單異常達 ${Worker.consecutiveRateLimits} 次，偵測到 Meta 限制操作，強制冷卻`);
                    await Worker.triggerCooldown();
                    Worker.clearStats();
                    return;
                } else {
                    if (window.hegeLog) window.hegeLog(`[⚠️警告] 選單異常 (第 ${Worker.consecutiveRateLimits}/3 次)，可能為網路延遲或初級限制，跳過並靜置...`);
                    // treat as normal failure but give it a larger timeout to breathe
                    Worker.stats.failed++;
                    Worker.saveStats();

                    let q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                    if (q.length > 0 && q[0] === rawTarget) {
                        q.shift();
                        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, q);
                    }
                    let fq = new Set(Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []));
                    fq.add(targetUser);
                    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [...fq]);

                    Worker.updateStatus('running', targetUser, 0, currentTotal);
                    await Utils.safeSleep(3000); // extra breather — 不受速度模式影響
                    setTimeout(Worker.runStep, 100);
                }
                return;
            } else if (result === 'cooldown') {
                Worker.updateStatus('error', '⚠️ 頻率限制觸發，請稍後再試');
                const stopBtn = document.getElementById('hege-worker-stop');
                if (stopBtn) stopBtn.style.display = 'none';
            }
        }
    },

    shouldVerify: () => {
        // Turbo 模式跳過 inline verify，改為事後批次驗證
        const profile = Utils.getSpeedProfile();
        if (profile.forceVerify) return false;

        if (Worker.verifyLevel === 0) return Worker.verifyCount % 5 === 0;
        if (Worker.verifyLevel === 1) return Worker.verifyCount % 3 === 0;
        return true; // Level 2: always verify
    },

    // Turbo 模式：將成功封鎖的帳號加入批次驗證佇列（20% 抽樣，每 5 筆取 1）
    addToBatchVerify: (rawTarget) => {
        const profile = Utils.getSpeedProfile();
        if (!profile.forceVerify) return;
        // 20% sampling: only add every 5th successfully blocked user (same rate as smart mode Level 0)
        if (Worker.stats.success % 5 !== 0) return;
        const bv = Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []);
        if (!bv.includes(rawTarget)) {
            bv.push(rawTarget);
            Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, bv);
        }
    },

    verifyBlock: async (user, isUnblockTask = false) => {
        // Page has been reloaded — check if "Unblock" appears in menu (= block succeeded)
        try {
            // 智慧等待頁面載入
            const verifyPageLoaded = await Utils.pollUntil(() => {
                return document.querySelector('svg[aria-label="更多"], svg[aria-label="More"]');
            }, 2500);
            if (!verifyPageLoaded) await Utils.safeSleep(1000);

            // Find "More" button again (智慧等待)
            let profileBtn = await Utils.pollUntil(() => {
                const moreSvgs = document.querySelectorAll('svg[aria-label="更多"], svg[aria-label="More"]');
                for (let svg of moreSvgs) {
                    if (svg.querySelector('circle') && svg.querySelectorAll('path').length >= 3) {
                        const btn = svg.closest('div[role="button"]');
                        if (btn) return btn;
                    }
                }
                if (moreSvgs.length > 0) return moreSvgs[0].closest('div[role="button"]');
                return null;
            }, 5000, 200);

            let blockStatus = null; // 'unblocked', 'blocked', or null

            if (profileBtn) {
                await Utils.speedSleep(300);
                Utils.simClick(profileBtn);

                // Wait for menu to appear (智慧等待)
                await Utils.pollUntil(() => {
                    const menuItems = document.querySelectorAll('div[role="menuitem"], div[role="button"]');
                    for (let item of menuItems) {
                        const t = item.innerText || item.textContent;
                        if (!t) continue;
                        if (Utils.isUnblockText(t)) {
                            blockStatus = 'blocked';
                            return true;
                        }
                        if (Utils.isBlockText(t)) {
                            blockStatus = 'unblocked';
                            return true;
                        }
                    }
                    return null;
                }, 5000, 150);

                // Close the menu by pressing ESC
                try {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                    await Utils.speedSleep(200);
                    const backdrop = document.querySelector('div[data-overlay-container="true"]');
                    if (backdrop) Utils.simClick(backdrop);
                    await Utils.speedSleep(300);
                } catch (e) { }
            }

            // 如果 Profile 選單無效或沒開，且在 replies 頁面，嘗試從貼文驗證
            if (!blockStatus) {
                const onRepliesPage = window.location.pathname.includes('/replies');
                if (onRepliesPage) {
                    window.hegeLog('[驗證] Profile 選單無效，嘗試從貼文驗證...');
                    const postLinks = document.querySelectorAll(`a[href*="/@${CSS.escape(user)}/post/"]`);
                    for (const link of postLinks) {
                        let container = link;
                        let postMoreBtn = null;
                        for (let lvl = 0; lvl < 8; lvl++) {
                            container = container.parentElement;
                            if (!container) break;
                            const svg = container.querySelector('svg[aria-label="更多"], svg[aria-label="More"]');
                            if (!svg) continue;
                            const btn = svg.closest('div[role="button"]');
                            if (!btn) continue;
                            postMoreBtn = btn;
                            break;
                        }

                        if (!postMoreBtn) continue;

                        postMoreBtn.scrollIntoView({ block: 'center' });
                        await Utils.speedSleep(300);
                        Utils.simClick(postMoreBtn);

                        await Utils.pollUntil(() => {
                            const menuItems = document.querySelectorAll('div[role="menuitem"], div[role="button"]');
                            for (let item of menuItems) {
                                const t = item.innerText || item.textContent;
                                if (!t) continue;
                                if (Utils.isUnblockText(t)) {
                                    blockStatus = 'blocked';
                                    return true;
                                }
                                if (Utils.isBlockText(t)) {
                                    blockStatus = 'unblocked';
                                    return true;
                                }
                            }
                            return null;
                        }, 5000, 150);

                        // Close the menu by pressing ESC
                        try {
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                            await Utils.speedSleep(200);
                            const backdrop = document.querySelector('div[data-overlay-container="true"]');
                            if (backdrop) Utils.simClick(backdrop);
                            await Utils.speedSleep(300);
                        } catch (e) { }

                        if (blockStatus) break;
                    }
                }
            }

            // Determine expected status
            const expected = isUnblockTask ? 'unblocked' : 'blocked';

            if (blockStatus === expected) {
                window.hegeLog(`[驗證] @${user} 確認已${isUnblockTask ? '解除' : ''}封鎖 ✅`);
                return true;
            } else if (blockStatus && blockStatus !== expected) {
                window.hegeLog(`[驗證] @${user} 狀態與預期不符 (${blockStatus}) ❌`);
                return false;
            }

            // Could not determine — treat as failure to be safe
            window.hegeLog('[驗證] 無法判定，視為失敗 ❌');
            return false;
        } catch (e) {
            console.error('[驗證] Error:', e);
            window.hegeLog('[驗證] 發生錯誤，視為失敗 ❌');
            return false;
        }
    },

    triggerCooldown: async () => {
        window.hegeLog('[冷卻] 觸發 12 小時冷卻保護！正在回滾 session...');

        // 1. Remove all session users from DB
        let db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
        const sessionSet = new Set(Worker.sessionQueue);
        for (const u of sessionSet) {
            db.delete(u);
        }

        // 2. Check if user wants to also rollback recent 50 blocks (before this session)
        let rollbackUsers = [];
        const timestamps = Storage.getJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
        const sortedRecent = Object.entries(timestamps)
            .filter(([username]) => !sessionSet.has(username) && db.has(username))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50);

        if (sortedRecent.length > 0) {
            rollbackUsers = sortedRecent.map(([username]) => username);
            for (const u of rollbackUsers) {
                db.delete(u);
                delete timestamps[u];
            }
            window.hegeLog(`[冷卻] 已自動回滾 ${rollbackUsers.length} 筆發生在本次之前的疑似失敗封鎖紀錄`);
        }

        // Remove session users' timestamps too
        for (const u of sessionSet) {
            delete timestamps[u];
        }
        Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, timestamps);
        Storage.setJSON(CONFIG.KEYS.DB_KEY, [...db]);

        // 3. Backup rollback list + remaining unprocessed BG_QUEUE + FAILED_QUEUE to COOLDOWN_QUEUE
        const remainingQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const failedQueue = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        const fullRollbackList = [...Worker.sessionQueue, ...rollbackUsers];
        const fullCooldownQueue = [...new Set([...fullRollbackList, ...remainingQueue, ...failedQueue])];
        Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, fullCooldownQueue);

        // 4. Set cooldown timestamp (12 hours)
        const cooldownUntil = Date.now() + (12 * 60 * 60 * 1000);
        Storage.set(CONFIG.KEYS.COOLDOWN, cooldownUntil.toString());

        // 5. Clear operational queues (all data now safely in COOLDOWN_QUEUE)
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        Worker.clearStats();

        // 6. Update UI and navigate back
        const totalRolled = fullRollbackList.length;
        Worker.updateStatus('error', `⛔ 偵測到系統限制，已啟動 12 小時冷卻保護\n共 ${totalRolled} 筆名單已保存，冷卻結束後自動恢復`);
        const stopBtn = document.getElementById('hege-worker-stop');
        if (stopBtn) stopBtn.style.display = 'none';
        Worker.navigateBack();
    },

    autoBlock: async (user, isUnblock = false) => {
        // Updated with Robust Polling and STRICT SVG Check
        function setStep(msg) {
            const s = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            s.current = `${user}: ${msg}`;
            s.lastUpdate = Date.now();
            Storage.setJSON(CONFIG.KEYS.BG_STATUS, s);
            if (window.hegeLog) window.hegeLog(msg);
        }

        function checkForError() {
            const errorPhrases = ['稍後再試', 'Try again later', '為了保護', 'protect our community', '受到限制', 'restrict certain activity'];
            const dialogs = document.querySelectorAll('div[role="dialog"]');
            for (let dialog of dialogs) {
                const t = dialog.innerText || dialog.textContent;
                if (!t) continue;
                if (errorPhrases.some(p => t.includes(p))) {
                    console.log(`[留友封] 偵測到限制訊息`);
                    return true;
                }
            }
            return false;
        }

        function checkFor404() {
            // Use stricter phrases to avoid false positives on private/restricted but existing accounts
            const invalidPhrases = ['連結失效', '頁面不存在', 'Page not found', 'Broken link', 'Sorry, this page', '找不到頁面'];
            const bodyText = document.body.innerText || '';
            const isInvalid = invalidPhrases.some(p => bodyText.includes(p));
            if (isInvalid && window.hegeLog) window.hegeLog(`[DIAG] @${user} 偵測到無效頁面 (404/失效)`);
            return isInvalid;
        }

        try {
            setStep('載入中...');
            // 智慧等待頁面載入，偵測到主要內容就繼續
            const pageLoaded = await Utils.pollUntil(() => {
                return document.querySelector('svg[aria-label="更多"], svg[aria-label="More"]') ||
                       document.querySelector('div[role="button"]');
            }, 2500);
            if (!pageLoaded) await Utils.safeSleep(1500);

            if (checkFor404()) {
                setStep('跳過: 連結失效 (404)');
                return 'vanished';
            }

            let blockBtn = null;
            {
                // 1. Wait for "More" button (智慧等待)
                let profileBtn = await Utils.pollUntil(() => {
                    const moreSvgs = document.querySelectorAll('svg[aria-label="更多"], svg[aria-label="More"]');
                    for (let svg of moreSvgs) {
                        if (svg.querySelector('circle') && svg.querySelectorAll('path').length >= 3) {
                            const btn = svg.closest('div[role="button"]');
                            if (btn) return btn;
                        }
                    }
                    // Fallback
                    if (moreSvgs.length > 0) {
                        return moreSvgs[0].closest('div[role="button"]');
                    }
                    return null;
                }, 12000, 200);

                if (!profileBtn) {
                    // Diagnostic dump: collect all SVG info on page
                    const allSvgs = document.querySelectorAll('svg[aria-label]');
                    const svgLabels = Array.from(allSvgs).map(s => s.getAttribute('aria-label'));
                    const moreSvgs = document.querySelectorAll('svg[aria-label="更多"], svg[aria-label="More"]');
                    const svgDetails = Array.from(moreSvgs).map(s => {
                        const hasCircle = !!s.querySelector('circle');
                        const pathCount = s.querySelectorAll('path').length;
                        const vb = s.getAttribute('viewBox');
                        return `circle=${hasCircle},paths=${pathCount},viewBox=${vb}`;
                    });
                    const dialogCount = document.querySelectorAll('div[role="dialog"]').length;
                    if (window.hegeLog) {
                        window.hegeLog(`[DIAG] @${user} 找不到更多按鈕`);
                        window.hegeLog(`[DIAG] URL: ${location.pathname}`);
                        window.hegeLog(`[DIAG] 頁面 SVG aria-labels(${svgLabels.length}): ${JSON.stringify(svgLabels)}`);
                        window.hegeLog(`[DIAG] 更多按鈕 SVG(${moreSvgs.length}): ${JSON.stringify(svgDetails)}`);
                        window.hegeLog(`[DIAG] Dialogs: ${dialogCount}`);
                    }
                    return 'failed';
                }

                setStep('開啟選單...');
                if (window.hegeLog && profileBtn) {
                    const rect = profileBtn.getBoundingClientRect();
                    let parentText = '';
                    try {
                        let parent = profileBtn.parentElement;
                        for (let p = 0; p < 3 && parent; p++) {
                            parentText += (parent.textContent || '').substring(0, 10).replace(/\n/g, '') + '|';
                            parent = parent.parentElement;
                        }
                    } catch (e) { }
                    window.hegeLog(`[DIAG] 準備點擊按鈕 x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, 父層文案=${parentText}`);
                }
                await Utils.speedSleep(300);
                profileBtn.scrollIntoView({ block: 'center', inline: 'center' });
                await Utils.safeSleep(200); // scroll animation settle — not speed-adjusted
                Utils.simClick(profileBtn);

                // 2. Wait for Menu (智慧等待 + retry click)
                let clickRetried = false;
                const menuStartTime = Date.now();

                const menuResult = await Utils.pollUntil(() => {
                    // After 3s with no menuitem, retry the click once
                    if (!clickRetried && Date.now() - menuStartTime > 3000) {
                        const testMenu = document.querySelectorAll('div[role="menuitem"]');
                        if (testMenu.length === 0) {
                            clickRetried = true;
                            if (window.hegeLog) window.hegeLog(`[DIAG] 選單未開啟，重試 simClick...`);
                            Utils.simClick(profileBtn);
                        }
                    }

                    const menuItems = document.querySelectorAll('div[role="menuitem"], div[role="button"]');
                    for (let item of menuItems) {
                        const t = item.innerText || item.textContent;
                        if (!t) continue;

                        if (isUnblock) {
                            if (Utils.isBlockText(t)) {
                                return { action: 'already_unblocked' };
                            }
                            if (Utils.isUnblockText(t)) {
                                return { action: 'found', btn: item };
                            }
                        } else {
                            if (Utils.isUnblockText(t)) {
                                return { action: 'already_blocked' };
                            }
                            if (Utils.isBlockText(t)) {
                                return { action: 'found', btn: item };
                            }
                        }
                    }
                    return null;
                }, 8000, 150);

                if (menuResult) {
                    if (menuResult.action === 'already_unblocked') { setStep('已解鎖 (略過)'); return 'already_unblocked'; }
                    if (menuResult.action === 'already_blocked') { setStep('已封鎖 (略過)'); return 'already_blocked'; }
                    if (menuResult.action === 'found') blockBtn = menuResult.btn;
                }

                if (!blockBtn) {
                    const menuItems = document.querySelectorAll('div[role="menuitem"], div[role="button"]');
                    for (let item of menuItems) {
                        const t = item.innerText || item.textContent;
                        if (t && (Utils.isUnblockText(t))) {
                            if (isUnblock) {
                                blockBtn = item;
                                break;
                            } else {
                                setStep('已封鎖 (略過)');
                                return 'already_blocked';
                            }
                        }
                    }

                    // === Post-Level Fallback（僅在 /replies 頁面時就地執行，不需跳轉）===
                    const onRepliesPage = window.location.pathname.includes('/replies');
                    if (onRepliesPage) {
                        setStep('Profile 選單無效，嘗試貼文備案...');
                        if (window.hegeLog) window.hegeLog(`[DIAG] Profile 選單無封鎖鈕，就地搜尋貼文 More`);

                        // 關閉 Profile 選單
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        await Utils.speedSleep(300);

                        const postLinks = document.querySelectorAll(`a[href*="/@${CSS.escape(user)}/post/"]`);
                        if (window.hegeLog) window.hegeLog(`[DIAG] 在 replies 頁找到 ${postLinks.length} 篇貼文連結`);

                        for (const link of postLinks) {
                            // 從貼文連結往上爬 DOM，尋找包含「更多」SVG 的共同容器
                            let container = link;
                            let postMoreBtn = null;
                            for (let lvl = 0; lvl < 8; lvl++) {
                                container = container.parentElement;
                                if (!container) break;
                                const svg = container.querySelector('svg[aria-label="更多"], svg[aria-label="More"]');
                                if (!svg) continue;
                                const btn = svg.closest('div[role="button"]');
                                if (!btn) continue;
                                postMoreBtn = btn;
                                break;
                            }

                            if (!postMoreBtn) continue;

                            if (window.hegeLog) window.hegeLog(`[DIAG] 嘗試貼文「更多」按鈕: ${link.getAttribute('href')}`);

                            // 點擊 Post 層的三個點
                            postMoreBtn.scrollIntoView({ block: 'center' });
                            await Utils.safeSleep(200); // scroll settle
                            Utils.simClick(postMoreBtn);

                            // 等選單 + 尋找封鎖按鈕 (智慧等待)
                            const postMenuResult = await Utils.pollUntil(() => {
                                const pMenuItems = document.querySelectorAll('div[role="menuitem"], div[role="button"]');
                                for (let item of pMenuItems) {
                                    const t = item.innerText || item.textContent;
                                    if (!t) continue;
                                    if (Utils.isUnblockText(t)) {
                                        return isUnblock ? { action: 'found', btn: item } : { action: 'already_blocked' };
                                    }
                                    if (Utils.isBlockText(t)) {
                                        return { action: 'found', btn: item };
                                    }
                                }
                                return null;
                            }, 6000, 150);

                            if (postMenuResult) {
                                if (postMenuResult.action === 'already_blocked') { setStep('已封鎖 (略過)'); return 'already_blocked'; }
                                if (postMenuResult.action === 'found') { blockBtn = postMenuResult.btn; }
                            }

                            if (blockBtn) {
                                if (window.hegeLog) window.hegeLog(`[DIAG] ✅ 貼文備案成功找到封鎖鈕！`);
                                break;
                            }

                            // 這篇失敗，關閉選單繼續下一篇
                            if (window.hegeLog) window.hegeLog(`[DIAG] 貼文備案此篇無效，嘗試下一篇...`);
                            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                            await Utils.speedSleep(300);
                        }
                    }

                    if (!blockBtn) {
                        // 全部失敗 — 診斷 dump + rate_limited
                        const allMenuItems = document.querySelectorAll('div[role="menuitem"]');
                        const menuTexts = Array.from(allMenuItems).map(el => (el.innerText || el.textContent || '').trim().substring(0, 30));
                        const allBtns = document.querySelectorAll('div[role="button"]');
                        const btnTexts = Array.from(allBtns).map(el => (el.innerText || el.textContent || '').trim().substring(0, 30)).filter(t => t.length > 0);
                        const dialogCount = document.querySelectorAll('div[role="dialog"]').length;
                        if (window.hegeLog) {
                            window.hegeLog(`[DIAG] @${user} 找不到封鎖鈕 (含貼文備案)`);
                            window.hegeLog(`[DIAG] menuitem(${menuTexts.length}): ${JSON.stringify(menuTexts)}`);
                            window.hegeLog(`[DIAG] buttons(${btnTexts.length}): ${JSON.stringify(btnTexts.slice(0, 15))}`);
                            window.hegeLog(`[DIAG] Dialogs: ${dialogCount}`);
                        }
                        setStep('錯誤: 找不到封鎖鈕 (可能遭限制)');
                        return 'rate_limited';
                    }
                }
            }

            setStep(isUnblock ? '點擊解除封鎖...' : '點擊封鎖...');
            await Utils.speedSleep(500);
            Utils.simClick(blockBtn);

            // 3. Wait for Confirmation Dialog (智慧等待)
            let confirmBtn = await Utils.pollUntil(() => {
                const dialogs = document.querySelectorAll('div[role="dialog"]');
                for (let dialog of dialogs) {
                    const btns = dialog.querySelectorAll('div[role="button"], button');
                    for (let btn of btns) {
                        const t = btn.innerText || btn.textContent;
                        if (!t) continue;

                        // 排除取消/Cancel 按鈕
                        const isCancelBtn = t.includes('取消') || t.includes('Cancel');
                        if (isCancelBtn) continue;

                        if (isUnblock) {
                            if (Utils.isUnblockText(t)) return btn;
                        } else {
                            if (Utils.isBlockText(t)) return btn;
                        }
                    }
                }
                return null;
            }, 5000, 150);

            if (!confirmBtn) {
                // 可能是直接封鎖無確認 dialog — 檢查頁面是否已出現「解除封鎖」
                const pageText = document.body.innerText || '';
                const directBlocked = isUnblock
                    ? Utils.isBlockText(pageText) // 解鎖後應看到「封鎖」
                    : Utils.isUnblockText(pageText); // 封鎖後應看到「解除封鎖」

                if (directBlocked) {
                    if (window.hegeLog) window.hegeLog(`[DIAG] @${user} 無確認 dialog 但偵測到已${isUnblock ? '解鎖' : '封鎖'}，視為成功`);
                    setStep(isUnblock ? '✅ 已解除封鎖 (直接)' : '✅ 已封鎖 (直接)');
                    return 'success';
                }

                // 真的失敗 — 診斷 dump
                const dialogs = document.querySelectorAll('div[role="dialog"]');
                if (window.hegeLog) {
                    window.hegeLog(`[DIAG] @${user} 找不到確認對話框`);
                    window.hegeLog(`[DIAG] Dialogs: ${dialogs.length}`);
                    for (let i = 0; i < dialogs.length; i++) {
                        const d = dialogs[i];
                        const btns = d.querySelectorAll('div[role="button"], button');
                        const btnTexts = Array.from(btns).map(b => (b.innerText || b.textContent || '').trim().substring(0, 40)).filter(t => t.length > 0);
                        window.hegeLog(`[DIAG] Dialog[${i}] 按鈕: ${JSON.stringify(btnTexts)}`);
                    }
                }
                setStep('找不到確認');
                return 'failed';
            }

            setStep(isUnblock ? '確認解除封鎖...' : '確認封鎖...');
            await Utils.safeSleep(200); // confirm button React handler settle — not speed-adjusted
            Utils.simClick(confirmBtn);

            // 4. Wait for confirmation dialog to close (智慧等待)
            const closeResult = await Utils.pollUntil(() => {
                const dialogs = document.querySelectorAll('div[role="dialog"]');
                if (dialogs.length === 0) return 'success';
                if (checkForError()) return 'cooldown';
                return null;
            }, 5000, 150);

            if (closeResult === 'success') {
                setStep(isUnblock ? '✅ 已解除封鎖' : '✅ 已封鎖');
                return 'success';
            }
            if (closeResult === 'cooldown') {
                return 'cooldown';
            }

            // Dialog 超時未關閉 — 再次檢查是否為限流
            if (checkForError()) {
                if (window.hegeLog) window.hegeLog(`[DIAG] @${user} dialog 超時且偵測到限流`);
                return 'cooldown';
            }

            // 檢查頁面是否顯示已封鎖（可能 dialog 只是動畫慢）
            const pageText = document.body.innerText || '';
            const likelyBlocked = isUnblock ? Utils.isBlockText(pageText) : Utils.isUnblockText(pageText);

            if (window.hegeLog) {
                const dialogs = document.querySelectorAll('div[role="dialog"]');
                window.hegeLog(`[DIAG] @${user} 確認後 dialog 未關閉，殘留 ${dialogs.length} 個`);
                window.hegeLog(`[DIAG] 頁面偵測已${isUnblock ? '解鎖' : '封鎖'}: ${likelyBlocked}`);
            }

            if (likelyBlocked) {
                setStep(isUnblock ? '✅ 已解除封鎖 (超時)' : '✅ 已封鎖 (超時)');
                return 'success';
            }

            setStep('超時未確認');
            return 'failed';
        } catch (e) {
            console.error('autoBlock error:', e);
            return 'failed';
        }
    }
};

// --- main.js ---







(function () {
    'use strict';

    // (Early-boot interceptor removed to prevent Safari Userscripts crash)
    Utils.initConsoleInterceptor();
    console.log('[留友封] Extension Script Initializing...');

    if (Storage.get(CONFIG.KEYS.VERSION_CHECK) !== CONFIG.VERSION) {
        // DB_KEY 遷移：舊版本使用 "undefined" 作為 key（CONFIG.KEYS.DB_KEY 未定義的 bug）
        const legacyDB = localStorage.getItem('undefined');
        if (legacyDB && !localStorage.getItem(CONFIG.KEYS.DB_KEY)) {
            localStorage.setItem(CONFIG.KEYS.DB_KEY, legacyDB);
            localStorage.removeItem('undefined');
            console.log('[留友封] DB migrated from legacy "undefined" key');
        }

        // 清除暫存佇列
        Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {});

        Storage.remove(CONFIG.KEYS.COOLDOWN_QUEUE);
        Storage.remove(CONFIG.KEYS.COOLDOWN);
        Storage.remove(CONFIG.KEYS.WORKER_STATS);
        Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});

        // 清除歷史遺留 key
        localStorage.removeItem('hege_ios_active');
        localStorage.removeItem('hege_mac_mode');

        Storage.set(CONFIG.KEYS.VERSION_CHECK, CONFIG.VERSION);
        console.log(`[留友封] Updated to v${CONFIG.VERSION}. Cleared all temporary queues.`);
    }

    // Unconditional safety clear: if the user manually fired an event but they are stuck, force them away
    const forceClear = new URLSearchParams(window.location.search).get('hege_clear');
    if (forceClear === 'true') {
        localStorage.removeItem('hege_cooldown_queue');
        localStorage.removeItem('hege_rate_limit_until');
        localStorage.removeItem('hege_block_timestamps');
        localStorage.removeItem('hege_worker_stats');
        alert('緊急清除完成，請重新整理頁面。');
    }

    const isBgPage = new URLSearchParams(window.location.search).get('hege_bg') === 'true';

    // Initialize
    function main() {
        if (isBgPage) {
            Worker.init();
        } else {
            // Prevent running in iframes for Controller (Beta46 logic)
            if (window.top !== window.self) return;

            UI.injectStyles();
            
            // Task 2: Check for Endless Sweep Resumption
            const endlessState = sessionStorage.getItem('hege_endless_state');
            const endlessTarget = sessionStorage.getItem('hege_endless_target');
            if (endlessState === 'RELOADING' && endlessTarget === window.location.href) {
                Core.resumeEndlessSweep();
            } else if (endlessState) {
                // If user navigated away, clear state
                if (endlessTarget !== window.location.href) {
                    sessionStorage.removeItem('hege_endless_state');
                    sessionStorage.removeItem('hege_endless_target');
                    sessionStorage.removeItem('hege_endless_last_first_user');
                }
            }

            // Task 2: Cockroach Reminder
            setTimeout(() => {
                const cockroachDB = Storage.getJSON(CONFIG.KEYS.COCKROACH_DB, []);
                const now = Date.now();
                const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
                const toRemind = cockroachDB.filter(c => (now - c.timestamp) >= tenDaysMs);

                if (toRemind.length > 0) {
                    const listStr = toRemind.map(c => `@${c.username}`).join('\n');
                    UI.showConfirm(`【大蟑螂回望提醒】\n\n以下網軍頭領已經超過 10 天未檢查，是否要開啟他們的主頁看看有沒有新的網軍？\n\n${listStr}`, () => {
                        toRemind.forEach(c => {
                            window.open(`https://www.threads.net/@${c.username}`, '_blank');
                            c.timestamp = now; // Reset timer
                        });
                        Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, cockroachDB);
                    }, () => {
                        toRemind.forEach(c => {
                            c.timestamp = now; // Dismiss for now
                        });
                        Storage.setJSON(CONFIG.KEYS.COCKROACH_DB, cockroachDB);
                    });
                }
            }, 2000);

            const handleMainButton = () => {
                const pending = Core.pendingUsers;
                const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
                if (cooldownUntil > Date.now()) {
                    const remainHrs = Math.ceil((cooldownUntil - Date.now()) / (1000 * 60 * 60));
                    UI.showConfirm(
                        `⚠️ 目前處於冷卻保護中（約 ${remainHrs} 小時後自動解除）\n\n強制取消冷卻並繼續封鎖？\n\n若您確認今日封鎖未超過 100 位，這可能是系統誤判，可放心繼續執行。\n\n若已大量封鎖，後續操作可能失敗，Meta 也可能對您的帳號施加額外限制。`,
                        () => {
                            // Force cancel cooldown and resume
                            const cooldownQueue = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
                            const currentQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                            const pendingArr = Array.from(pending);
                            const merged = [...new Set([...currentQueue, ...cooldownQueue, ...pendingArr])];
                            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, merged);
                            Storage.remove(CONFIG.KEYS.COOLDOWN_QUEUE);
                            Storage.remove(CONFIG.KEYS.COOLDOWN);
                            Storage.invalidate(CONFIG.KEYS.COOLDOWN);
                            Storage.invalidate(CONFIG.KEYS.COOLDOWN_QUEUE);

                            if (pendingArr.length > 0) {
                                Core.pendingUsers.clear();
                                Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
                            }

                            Core.updateControllerUI();
                            UI.showToast(`已恢復佇列，共 ${merged.length} 筆，開始執行`);

                            // Directly start worker with restored queue
                            Storage.remove(CONFIG.KEYS.BG_CMD);
                            if (Utils.isMobile()) {
                                Core.runSameTabWorker();
                            } else {
                                // window.open must be called directly in the click handler to preserve user gesture
                                Utils.openWorkerWindow();
                            }
                        }
                    );
                    return;
                }

                const delayEnabled = Storage.get(CONFIG.KEYS.DELAYED_BLOCK_ENABLED) === 'true';
                let toAdd = Array.from(pending);
                let currentQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);

                if (delayEnabled) {
                    const dq = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                    const lastTime = parseInt(Storage.get(CONFIG.KEYS.LAST_BATCH_TIME) || '0');
                    const now = Date.now();
                    const delayMs = CONFIG.DELAY_HOURS * 60 * 60 * 1000;
                    
                    if (lastTime > 0 && (now - lastTime) < delayMs) {
                        // 在冷卻期內，圈選名單優先進入水庫
                        if (toAdd.length > 0) {
                            const newDq = [...new Set([...dq, ...toAdd])];
                            Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, newDq);
                            const remainHrs = ((delayMs - (now - lastTime)) / (1000 * 60 * 60)).toFixed(1);
                            UI.showToast(`📥 已存入延時水庫（共 ${newDq.length} 人排隊中），預計於 ${Math.ceil(remainHrs)} 小時後釋放`);
                            
                            Core.pendingUsers.clear();
                            Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
                            Core.updateControllerUI();
                        }
                        
                        // 如果背景沒有正在跑的佇列，就不需要啟動 Worker
                        if (currentQueue.length === 0) {
                            if (toAdd.length === 0) UI.showToast('水庫冷卻中，選取名單將自動被加入水庫。');
                            return; 
                        } else {
                            toAdd = []; // 已進入水庫，不直接加入 BG_QUEUE
                        }
                    } else {
                        // 能夠發放 (lastTime == 0 或已滿 13 小時)
                        const allCandidates = [...new Set([...dq, ...toAdd])];
                        if (allCandidates.length > CONFIG.MAX_BLOCKS_PER_BATCH) {
                            toAdd = allCandidates.slice(0, CONFIG.MAX_BLOCKS_PER_BATCH);
                            const remainder = allCandidates.slice(CONFIG.MAX_BLOCKS_PER_BATCH);
                            Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, remainder);
                            UI.showToast(`💧 水庫排程：發放 ${toAdd.length} 人，剩餘 ${remainder.length} 人待下次發動`);
                        } else {
                            toAdd = allCandidates;
                            Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
                        }
                        
                        if (toAdd.length > 0) {
                            Storage.set(CONFIG.KEYS.LAST_BATCH_TIME, now.toString());
                        }
                    }
                }

                if (toAdd.length === 0 && currentQueue.length === 0) { UI.showToast('請先勾選用戶！'); return; }

                if (Utils.isMobile()) {
                    Core.runSameTabWorker(toAdd);
                } else {
                    Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
                    const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                    const newQ = [...new Set([...q, ...toAdd])];
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
                    
                    if (toAdd.length > 0 && !delayEnabled) {
                        UI.showToast(`已提交 ${toAdd.length} 筆至背景佇列`);
                    }

                    const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
                    const running = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
                    if (!running) {
                        Storage.remove(CONFIG.KEYS.BG_CMD);
                        Utils.openWorkerWindow();
                    }
                }
            };

            const callbacks = {
                onMainClick: handleMainButton,
                onClearSel: () => {
                    UI.showConfirm('確定要清除目前的「選取清單」與所有「背景排隊」的帳號嗎？\n(這不會影響已完成的封鎖歷史紀錄)', () => {
                        Core.pendingUsers.clear();
                        Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
                        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
                        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
                        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {});
                        Core.blockQueue.forEach(b => {
                            const cb = b.parentElement.querySelector('.hege-checkbox-container');
                            if (cb) cb.classList.remove('checked');
                        });
                        Core.blockQueue.clear();
                        Core.updateControllerUI();
                        UI.showToast('待封鎖清單與背景佇列已全數清除');
                    });
                },
                onClearDB: () => { UI.showConfirm('清空歷史？', () => { Storage.setJSON(CONFIG.KEYS.DB_KEY, []); Core.updateControllerUI(); }); },
                onDeepMine: () => {
                    const postQueue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                    if (postQueue.length === 0) {
                        UI.showToast('目前水庫為空。請先進入單一貼文頁面，啟動變強封鎖對話框后點標記大蟑螂穩。');
                        return;
                    }
                    const list = postQueue.map(p => {
                        const url = p.url || '';
                        const lastSweep = p.lastSweptAt ? new Date(p.lastSweptAt).toLocaleString() : '尚未執行';
                        return `${url}\n  \u2514 上次: ${lastSweep}`;
                    }).join('\n');
                    UI.showConfirm(`【深層清理水庫】目前有 ${postQueue.length} 篇貼文排程中：\n\n${list}\n\n是否要現在就展開清理？`, () => {
                        Core.checkPostQueueWakeup();
                    });
                },
                onCockroach: () => Core.openCockroachManager(),
                onSettings: () => {
                    const openSettings = () => {
                        UI.showSettingsModal({
                            onManage: () => Core.openBlockManager(),
                            onImport: () => Core.importList(),
                            onExport: () => Core.exportHistory(),
                            onClearDB: () => { UI.showConfirm('確定清除所有歷史紀錄？', () => { Storage.setJSON(CONFIG.KEYS.DB_KEY, []); Core.updateControllerUI(); }); },
                            onCockroach: () => Core.openCockroachManager(() => openSettings())
                        });
                    };
                    openSettings();
                },
                onImport: () => Core.importList(),
                onManage: () => Core.openBlockManager(),
                onExport: () => Core.exportHistory(),
                onRetryFailed: () => Core.retryFailedQueue(),
                onReport: () => Core.showReportDialog(),
                onStop: () => { UI.showConfirm('確定要停止背景執行？', () => Storage.set(CONFIG.KEYS.BG_CMD, 'stop')); }
            };

            const panel = UI.createPanel(callbacks);

            // Sync Logic (Restored from beta46)
            window.addEventListener('storage', (e) => {
                if (e.key === CONFIG.KEYS.BG_STATUS || e.key === CONFIG.KEYS.DB_KEY || e.key === CONFIG.KEYS.BG_QUEUE || e.key === CONFIG.KEYS.COOLDOWN || e.key === CONFIG.KEYS.COOLDOWN_QUEUE || e.key === CONFIG.KEYS.FAILED_QUEUE || e.key === CONFIG.KEYS.DELAYED_QUEUE || e.key === CONFIG.KEYS.POST_QUEUE) {
                    Storage.invalidate(e.key); // Force cache clear so getJSON fetches fresh data
                    Core.updateControllerUI();
                }
            });
            setInterval(() => {
                Storage.invalidate(CONFIG.KEYS.DB_KEY);
                Storage.invalidate(CONFIG.KEYS.BG_STATUS);
                Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
                Storage.invalidate(CONFIG.KEYS.COOLDOWN);
                Storage.invalidate(CONFIG.KEYS.COOLDOWN_QUEUE);
                Storage.invalidate(CONFIG.KEYS.FAILED_QUEUE);
                Storage.invalidate(CONFIG.KEYS.DB_TIMESTAMPS);
                Storage.invalidate(CONFIG.KEYS.DELAYED_QUEUE);
                Storage.invalidate(CONFIG.KEYS.POST_QUEUE);
                Core.updateControllerUI();
            }, 2000); // Polling backup

            // Env Log
            const _envPlatform = navigator.userAgentData?.platform || navigator.platform || '';
            const isIPad = (_envPlatform === 'macOS' || _envPlatform === 'MacIntel') && navigator.maxTouchPoints > 1;
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || isIPad;
            Utils.log(`Env: ${_envPlatform}, TP:${navigator.maxTouchPoints}\nDevice: ${isIOS ? 'iOS/iPad' : 'Desktop'}\nUA: ${navigator.userAgent.substring(0, 50)}...`);

            // Anchor Loop
            UI.anchorPanel();
            setInterval(() => {
                if (!document.getElementById('hege-panel')) {
                    console.warn('[留友封] Panel missing from DOM! Attempting re-inject?');
                }
                UI.anchorPanel();
            }, 1500);

            // Task 1: 貼文深層收割 8hr 排程定期巡檢 (每 1 分鐘檢查一次)
            setInterval(() => {
                Core.checkPostQueueWakeup();
            }, 60000);

            // Task 1: Debug 測試後門，允許無視 8H 直接歸零並立即跳轉
            window.HegeDebug = {
                forceWakeup: () => {
                    let queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                    queue.forEach(q => q.lastSweptAt = 0);
                    Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
                    console.log('[DeepSweep-Q] 測試後門觸發：已將所有深層清理貼文的冷卻時間歸零！');
                    Core.checkPostQueueWakeup();
                }
            };

            Core.init();

            // Log Sync
            if (CONFIG.DEBUG_MODE) {
                // Console only
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

    // --- 全局除錯/測試函式 ---
    window.__DEBUG_HEGE_FAST_FORWARD_TIME = (hours = 8) => {
        const ms = hours * 60 * 60 * 1000;
        const lastTime = parseInt(localStorage.getItem(CONFIG.KEYS.LAST_BATCH_TIME) || '0');
        if (lastTime > 0) {
            localStorage.setItem(CONFIG.KEYS.LAST_BATCH_TIME, (lastTime - ms).toString());
            console.log(`[DEBUG] 延時水庫時鐘已倒轉 ${hours} 小時！`);
        } else {
            console.log(`[DEBUG] LAST_BATCH_TIME 為空，水庫本來就可以直接發放！`);
        }
    };

    window.__DEBUG_GENERATE_COCKROACH = (username = 'test_roach_' + Math.floor(Math.random()*1000)) => {
        const db = JSON.parse(localStorage.getItem(CONFIG.KEYS.COCKROACH_DB) || '[]');
        // 設定為 11 天前，以觸發 10 天提醒
        db.push({ username, timestamp: Date.now() - (11 * 24 * 60 * 60 * 1000) });
        localStorage.setItem(CONFIG.KEYS.COCKROACH_DB, JSON.stringify(db));
        console.log(`[DEBUG] 已注入大蟑螂 @${username} (時標為 11 天前)。重新裝載網頁後將會觸發回望提醒！`);
    };

})();

})();
