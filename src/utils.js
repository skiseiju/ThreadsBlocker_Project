import { CONFIG } from './config.js';
import { Storage } from './storage.js';

export const Utils = {
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

    // 從 DOM 抓取當前貼文的文字摘要（前 100 字）
    getPostText: () => {
        // 貼文內容在 dialog 後面的主頁面，找 [data-pressable-container] 內的文字
        const candidates = document.querySelectorAll('[data-pressable-container] span[dir="auto"], article span[dir="auto"]');
        for (const el of candidates) {
            // 跳過 dialog 內的元素（那是按讚名單，不是貼文本體）
            if (el.closest('[role="dialog"]')) continue;
            const text = (el.innerText || '').trim();
            if (text.length > 20) return text.substring(0, 100);
        }
        return '';
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
        const workerUrl = `${window.location.origin}/?hege_bg=true`;
        const w = window.open(workerUrl, 'HegeBlockWorker', 'width=800,height=600');
        if (!w || w.closed) {
            alert(`瀏覽器阻擋了彈出視窗。\n請允許 ${window.location.host} 的彈出視窗權限，或手動開啟新分頁前往：\n${workerUrl}`);
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
