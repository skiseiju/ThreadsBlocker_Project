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

    getPostOwner: (sourceUrl = '') => {
        let path = window.location.pathname;
        if (sourceUrl) {
            try {
                path = new URL(sourceUrl, window.location.origin).pathname || path;
            } catch (e) {}
        }
        if (path.includes('/post/')) {
            const match = path.match(/^\/@([^/]+)\/post\//);
            if (match && match[1]) return match[1];
        }
        return null;
    },

    normalizePostUrl: (sourceUrl = '') => {
        if (!sourceUrl) return '';
        try {
            const parsed = new URL(sourceUrl, window.location.origin);
            if (!parsed.pathname.includes('/post/')) return '';
            return `${parsed.origin}${parsed.pathname}`;
        } catch (e) {
            return '';
        }
    },

    _extractTextFromContainer: (container) => {
        if (!container) return '';
        const blocks = Array.from(container.querySelectorAll('span[dir="auto"], div[dir="auto"]'))
            .filter(el => !el.closest('[role="dialog"]'))
            .map(el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
            .filter(text => text.length >= 14)
            .filter(text => !/^@[\w.]+$/.test(text))
            .filter(text => !/^[0-9.,\s]+$/.test(text));
        if (blocks.length === 0) return '';
        const merged = blocks.join(' ').replace(/\s+/g, ' ').trim();
        return merged.slice(0, 180);
    },

    // 從 DOM 抓取來源貼文的文字摘要（前 180 字）；優先鎖定 sourceUrl 對應貼文
    getPostText: (sourceUrl = '') => {
        const sourcePath = (() => {
            const norm = Utils.normalizePostUrl(sourceUrl);
            if (norm) {
                try { return new URL(norm).pathname; } catch (e) {}
            }
            if (window.location.pathname.includes('/post/')) return window.location.pathname.split('?')[0];
            return '';
        })();

        if (sourcePath) {
            const anchors = Array.from(document.querySelectorAll('a[href*="/post/"]'))
                .filter(a => !a.closest('[role="dialog"]'))
                .filter(a => {
                    try {
                        const p = new URL(a.getAttribute('href') || '', window.location.origin).pathname;
                        return p === sourcePath;
                    } catch (e) {
                        return false;
                    }
                });

            for (const anchor of anchors) {
                const container = anchor.closest('article, [data-pressable-container], [role="article"], div[data-pressable-container="true"]');
                const text = Utils._extractTextFromContainer(container);
                if (text.length > 0) return text;
            }
        }

        const mainContainer = document.querySelector('main article, div[role="main"] article, [data-pressable-container]');
        const mainText = Utils._extractTextFromContainer(mainContainer);
        if (mainText.length > 0) return mainText;

        const fallbackCandidates = document.querySelectorAll('[data-pressable-container] span[dir="auto"], article span[dir="auto"]');
        for (const el of fallbackCandidates) {
            if (el.closest('[role="dialog"]')) continue;
            const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
            if (text.length > 20) return text.substring(0, 180);
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

    isBetaBuild: () => /\-beta/i.test(String(CONFIG.VERSION || '')),

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

    getSweepRuntimeState: () => {
        const state = sessionStorage.getItem('hege_sweep_state') || '';
        const standby = Storage.get('hege_sweep_worker_standby') === 'true';
        const entries = Storage.postReservoir.getAll();
        const hasSweeping = entries.some(p => p && p.status === 'sweeping');
        const bgQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        const workerRunning = bgStatus.state === 'running' && (Date.now() - (bgStatus.lastUpdate || 0) < 30000);
        const verifyPending = Storage.get(CONFIG.KEYS.VERIFY_PENDING);
        const batchVerify = Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []);
        const flowActive = state === 'RELOADING' || state === 'SCANNING';
        const waitForBgActive = state === 'WAIT_FOR_BG'
            && (bgQueue.length > 0 || workerRunning || verifyPending !== null || batchVerify.length > 0 || hasSweeping);
        const standbyActive = standby
            && (bgQueue.length > 0 || workerRunning || verifyPending !== null || batchVerify.length > 0 || hasSweeping || flowActive);
        const running = hasSweeping || flowActive || waitForBgActive || standbyActive;

        return {
            state,
            standby,
            bgQueueLen: bgQueue.length,
            hasSweeping,
            workerRunning,
            flowActive,
            waitForBgActive,
            standbyActive,
            running,
        };
    },

    isSweepRunning: () => Utils.getSweepRuntimeState().running,

    openWorkerWindow: () => {
        const workerUrl = `${window.location.origin}/?hege_bg=true&hege_popup=true`;
        const w = window.open(workerUrl, 'HegeBlockWorker', 'width=800,height=600');
        if (!w || w.closed) {
            console.warn('[HegeBlock] Worker popup blocked; caller should fall back to same-tab worker:', workerUrl);
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

    setHTML: (element, html) => {
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            element.replaceChildren(...Array.from(doc.body.childNodes));
        } catch (e) {
            console.error('[RightBlock] setHTML failed', e);
            element.textContent = '';
        }
    }
};
