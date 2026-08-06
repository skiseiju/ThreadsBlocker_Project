import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Storage } from './storage.js';
import { Core, RuntimeDiagnostics, buildAccountTimingFields } from './core.js';
import { MoreLocator } from './more-locator.js';
import { ReportDebugContext } from './report-debug-context.js';

// 等「這個帳號的 profile root 真的出現」的上限。原本的載入等待只等到 2.5 秒，
// 而且條件寬到前一頁的 DOM 就能滿足；改為等真正的 root，需要涵蓋慢網路下的
// SPA 換頁，同時仍是有界等待，不會卡住整批。
export const PROFILE_ROOT_WAIT_MS = 12000;

// Worker 視窗只有內容區（viewport）下界，沒有外框尺寸規則：外框在不同電腦被
// 工具列／邊框／縮放吃掉的量不同，拿外框當標準就是 2.8.1 #47 卡死的病因。
// 實測可運作的 viewport 下界：700x453 全數成功，670x457 以下開始出現選單打不開。
// 低於下界 Threads 會改用窄版面，個人頁的 root 與「更多」按鈕都定位不到。
const WORKER_MIN_VIEWPORT_WIDTH = 700;
const WORKER_MIN_VIEWPORT_HEIGHT = 440;

const normalizeLimitWarningNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
};

const readWindowMetrics = () => {
    const outerWidth = Number(window.outerWidth) || 0;
    const outerHeight = Number(window.outerHeight) || 0;
    const innerWidth = Number(window.innerWidth) || 0;
    const innerHeight = Number(window.innerHeight) || 0;
    const devicePixelRatio = Number(window.devicePixelRatio) || 0;
    return {
        outerWidth,
        outerHeight,
        innerWidth,
        innerHeight,
        devicePixelRatio,
        sizeRatio: innerWidth > 0 ? Math.round((outerWidth / innerWidth) * 100) / 100 : 0,
    };
};

export const Worker = {
    stats: { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: 0 },
    initialTotal: 0,
    sessionQueue: [],          // 本次 session 完整名單快照
    verifyLevel: 0,            // 0=每5次, 1=每3次, 2=每次
    verifyCount: 0,            // 自上次驗證以來的計數
    consecutiveRateLimits: 0,
    consecutiveFails: 0,       // Level 2 連續失敗計數
    limitWarningMessage: '',
    limitWarningCompactMessage: '',
    limitWarningDone: null,
    limitWarningLimit: null,
    _stepRunning: false,       // mutex: prevent concurrent runStep chains
    _workerVisualStorageListenerBound: false,
    _diagnosticOperationId: null,
    _diagnosticOperationFeature: 'blocking',
    _diagnosticExecutionId: null,
    _diagnosticPersistAt: 0,
    _diagnosticPersistMinIntervalMs: 500,
    _accountNavigationStartedAt: null,

    persistDiagnostics: (force = false) => {
        if (!RuntimeDiagnostics.enabled()) return false;
        const now = Date.now();
        if (!force && now - Worker._diagnosticPersistAt < Worker._diagnosticPersistMinIntervalMs) return false;
        const persisted = RuntimeDiagnostics.persist();
        if (persisted) Worker._diagnosticPersistAt = now;
        return persisted;
    },

    endDiagnostic: (operationId, stage = 'terminal', fields = {}) => {
        const entry = RuntimeDiagnostics.end(operationId, stage, fields);
        Worker.persistDiagnostics(true);
        return entry;
    },

    endExecution: () => {
        const ended = RuntimeDiagnostics.endExecution(Worker._diagnosticExecutionId);
        Worker._diagnosticExecutionId = null;
        return ended;
    },

    saveStats: () => {
        Storage.setJSON(CONFIG.KEYS.WORKER_STATS, {
            stats: Worker.stats,
            initialTotal: Worker.initialTotal,
            sessionQueue: Worker.sessionQueue,
            verifyLevel: Worker.verifyLevel,
            verifyCount: Worker.verifyCount,
            consecutiveFails: Worker.consecutiveFails,
            consecutiveRateLimits: Worker.consecutiveRateLimits,
            limitWarningMessage: Worker.limitWarningMessage,
            limitWarningCompactMessage: Worker.limitWarningCompactMessage,
            limitWarningDone: Worker.limitWarningDone,
            limitWarningLimit: Worker.limitWarningLimit,
        });
    },

    resetStatsState: (startTime = 0) => {
        Worker.stats = { success: 0, skipped: 0, failed: 0, vanished: 0, startTime };
        Worker.initialTotal = 0;
        Worker.sessionQueue = [];
        Worker.verifyLevel = 0;
        Worker.verifyCount = 0;
        Worker.consecutiveFails = 0;
        Worker.consecutiveRateLimits = 0;
        Worker.limitWarningMessage = '';
        Worker.limitWarningCompactMessage = '';
        Worker.limitWarningDone = null;
        Worker.limitWarningLimit = null;
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
            Worker.limitWarningMessage = typeof saved.limitWarningMessage === 'string' ? saved.limitWarningMessage : '';
            Worker.limitWarningCompactMessage = typeof saved.limitWarningCompactMessage === 'string'
                ? saved.limitWarningCompactMessage
                : '';
            Worker.limitWarningDone = normalizeLimitWarningNumber(saved.limitWarningDone);
            Worker.limitWarningLimit = normalizeLimitWarningNumber(saved.limitWarningLimit);
        } else {
            Worker.resetStatsState(Date.now());
        }
    },

    clearStats: () => {
        Worker.resetStatsState(0);
        Storage.remove(CONFIG.KEYS.WORKER_STATS);
    },

    // Closed, aggregate-only diagnostics for block/report gates. This writer
    // deliberately accepts no user, URL, DOM, text, or raw metadata fields.
    recordSafetyDiagnostic: (phase, result = 'unknown', routeType = 'unknown', counts = {}, timing = {}, diagnosticOptions = {}) => {
        const now = Date.now();
        const previous = Storage.getJSON(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, null);
        const snapshot = ReportDebugContext.append(previous, {
            ts: now,
            phase,
            result,
            routeType: ReportDebugContext.ROUTES.has(routeType) ? routeType : 'unknown',
            counts,
            elapsedMs: timing.elapsedMs ?? 0,
            retryCount: timing.retryCount ?? 0,
        }, now);
        if (snapshot) {
            Storage.setJSON(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, snapshot);
            Storage.setJSON(CONFIG.KEYS.REPORT_DEBUG_CONTEXT_V2, ReportDebugContext.contextFromSnapshot(snapshot, now));
        }
        const feature = diagnosticOptions.feature || (Worker._diagnosticOperationFeature || 'blocking');
        let operationId = diagnosticOptions.operationId || Worker._diagnosticOperationId;
        const ownsOperation = !operationId && RuntimeDiagnostics.enabled();
        if (ownsOperation) operationId = RuntimeDiagnostics.begin(feature, { strategy: 'route' });
        const stageMap = {
            queue_advance: 'dequeue', root_resolve: 'navigation', more_resolve: 'navigation', navigation_check: 'navigation',
            menu_resolve: 'menu', action_resolve: 'action', confirm_resolve: 'confirm', retry: 'retry',
            cooldown: 'cooldown', breaker: 'breaker', failure: 'failure',
        };
        const stage = stageMap[phase] || 'status';
        RuntimeDiagnostics.record(feature, stage, {
            operationId,
            reason: result,
            pathnameCategory: routeType === 'profile' || routeType === 'post' ? routeType : 'unknown',
            candidateCount: counts.moreCandidates,
            menuItems: counts.menuItems,
            confirmButtons: counts.confirmButtons,
            retryCount: timing.retryCount,
            elapsedMs: timing.elapsedMs,
            failure: Core.isDiagnosticFailureResult(result),
            success: Core.isDiagnosticSuccessResult(result),
            private: result === 'private_manual_required',
            protected: result === 'protected',
            alreadyBlocked: result === 'already_blocked',
            cooldownActive: result === 'cooldown' || result === 'rate_limited',
            // 呼叫端補充的觀測欄位。RuntimeDiagnostics._safeFields 仍是唯一守門，
            // 不在允許清單裡的 key 會被丟掉，這裡不會放寬隱私邊界。
            ...(diagnosticOptions.fields || {}),
        });
        if (ownsOperation) Worker.endDiagnostic(operationId, 'terminal', { reason: result, ok: Core.isDiagnosticSuccessResult(result), complete: true });
        Worker.persistDiagnostics(true);
        return snapshot;
    },

    resetStatsIfStorageCleared: () => {
        Storage.invalidate(CONFIG.KEYS.WORKER_STATS);
        const saved = Storage.getJSON(CONFIG.KEYS.WORKER_STATS, null);
        if (saved && saved.stats) return;

        const processed = Worker.stats.success + Worker.stats.skipped + Worker.stats.failed + Worker.stats.vanished;
        if (processed > 0 || Worker.initialTotal > 0 || Worker.sessionQueue.length > 0) {
            Worker.resetStatsState(0);
        }
    },

    ensureReportStats: (totalHint = 0) => {
        const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        const processed = Worker.stats.success + Worker.stats.skipped + Worker.stats.failed + Worker.stats.vanished;
        const currentTotal = processed + reportQueue.length;
        const nextTotal = Math.max(totalHint, currentTotal, Worker.initialTotal);

        if (Worker.stats.startTime === 0) Worker.stats.startTime = Date.now();
        if (Worker.initialTotal === 0 || nextTotal > Worker.initialTotal) {
            Worker.initialTotal = nextTotal;
            const batchUsers = Storage.getJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
            Worker.sessionQueue = batchUsers.length > 0 ? batchUsers : [...reportQueue];
            Worker.saveStats();
        }
    },

    bumpReportStat: (kind, user, reason = '') => {
        Worker.ensureReportStats();
        if (!Object.prototype.hasOwnProperty.call(Worker.stats, kind)) return;
        Worker.stats[kind]++;
        Worker.saveStats();
        const labelMap = {
            success: '完成',
            skipped: '跳過',
            failed: '失敗',
            vanished: '已消失',
        };
        const label = labelMap[kind] || kind;
        if (window.hegeLog) {
            const suffix = reason ? ` reason=${reason}` : '';
            window.hegeLog(`[只檢舉][STATS] @${user} ${label} success=${Worker.stats.success} skipped=${Worker.stats.skipped} failed=${Worker.stats.failed} vanished=${Worker.stats.vanished}${suffix}`);
        }
        Worker.updateStatus('running', `只檢舉${label}: ${user}`, 0, Worker.initialTotal);
    },

    markTargetFailedAndContinue: async (rawTarget, targetUser, currentTotal, logMessage = '', sleepMs = 3000, failureReason = 'unknown') => {
        if (logMessage && window.hegeLog) window.hegeLog(logMessage);
        Worker.stats.failed++;
        Worker.saveStats();

        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        if (queue.length > 0 && queue[0] === rawTarget) {
            queue.shift();
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
        }

        Core.recordFailure('block', targetUser, failureReason);
        Worker.updateStatus('running', logMessage || targetUser, 0, currentTotal);
        if (sleepMs > 0) await Utils.safeSleep(sleepMs);
        setTimeout(Worker.runStep, 100);
    },

    getReportDriverOptions: (reportUser, reportContext) => ({
        mode: 'profile',
        continueWith: Worker.runStep,
        keepWorkerOpenOnError: false,
        visualDebug: Worker.isReportVisualDebugEnabled,
        reportContext,
        onSuccess: (user) => {
            const target = user || reportUser;
            Worker.bumpReportStat('success', target);
            Core.removeFailure(target, 'report');
        },
        onSkipped: (user, reason) => {
            const target = user || reportUser;
            Worker.bumpReportStat('skipped', target, reason);
            Core.recordFailure('report', target, reason || 'report_failed');
        },
    }),

    // 撐回下界時不要每次 resize 事件都洗一行 log。
    _windowBoundsNoticeAt: 0,
    _windowPausedNoticeAt: 0,

    // 以 viewport（innerWidth/innerHeight）判定，因為真正影響 Threads 版面的是
    // 內容區大小，不是含視窗邊框的 outerWidth。
    isWindowTooSmall: () => {
        try {
            return window.innerWidth < WORKER_MIN_VIEWPORT_WIDTH || window.innerHeight < WORKER_MIN_VIEWPORT_HEIGHT;
        } catch (e) { return false; }
    },

    noteWindowTooSmall: () => {
        const now = Date.now();
        const metrics = readWindowMetrics();
        Worker.updateStatus('running', `⏸️ 視窗太小已暫停（目前 ${metrics.innerWidth}x${metrics.innerHeight}，需要至少 ${WORKER_MIN_VIEWPORT_WIDTH}x${WORKER_MIN_VIEWPORT_HEIGHT}）。放大視窗就會自動繼續。`);
        if (now - Worker._windowPausedNoticeAt < 5000) return;
        Worker._windowPausedNoticeAt = now;
        if (window.hegeLog) {
            window.hegeLog(`[視窗] 目前 ${metrics.innerWidth}x${metrics.innerHeight} 小於可運作下界 ${WORKER_MIN_VIEWPORT_WIDTH}x${WORKER_MIN_VIEWPORT_HEIGHT}，已暫停並保留名單。放大視窗就會自動繼續。`);
        }
        RuntimeDiagnostics.record(Worker._diagnosticOperationFeature || 'blocking', 'wait', {
            operationId: Worker._diagnosticOperationId,
            clamped: true,
            idle: true,
            ...metrics,
            viewportWidth: metrics.innerWidth,
            viewportHeight: metrics.innerHeight,
            resizeRequestedWidth: 0,
            resizeRequestedHeight: 0,
            resizeEffectiveWidth: metrics.outerWidth,
            resizeEffectiveHeight: metrics.outerHeight,
        });
    },

    enforceWindowBounds: () => {
        try {
            const before = readWindowMetrics();
            // 只管最小內容區（功能前提），使用者要拉多大隨意，不再有上界縮回。
            const tooSmall = before.innerWidth < WORKER_MIN_VIEWPORT_WIDTH || before.innerHeight < WORKER_MIN_VIEWPORT_HEIGHT;
            if (!tooSmall) return false;
            // 邊框＋工具列吃掉的尺寸（outer 與 inner 的差），據此換算「內容區剛好
            // 700x440 所需的絕對外尺寸」。一律用絕對值 resizeTo：拖拉中事件連發時
            // inner 讀值會慢半拍，加法式 resizeBy 會把缺口重複累加造成視窗暴衝。
            // 這個目標在同一台機器上是固定值，過小時永遠吸附到同一個尺寸。
            const frameWidth = Math.max(0, before.outerWidth - before.innerWidth);
            const frameHeight = Math.max(0, before.outerHeight - before.innerHeight);
            const requestedWidth = Math.min(frameWidth + WORKER_MIN_VIEWPORT_WIDTH, Number(window.screen?.availWidth) || Infinity);
            const requestedHeight = Math.min(frameHeight + WORKER_MIN_VIEWPORT_HEIGHT, Number(window.screen?.availHeight) || Infinity);
            window.resizeTo(requestedWidth, requestedHeight);
            const effective = readWindowMetrics();
            if (tooSmall && Date.now() - Worker._windowBoundsNoticeAt > 3000) {
                Worker._windowBoundsNoticeAt = Date.now();
                if (window.hegeLog) {
                    window.hegeLog(`[視窗] 視窗太小會讓 Threads 切成窄版面、抓不到個人頁，已自動補足至約 ${requestedWidth}x${requestedHeight}。可以移動或蓋住這個視窗，但不要縮得更小。`);
                }
                RuntimeDiagnostics.record(Worker._diagnosticOperationFeature || 'blocking', 'layout', {
                    operationId: Worker._diagnosticOperationId,
                    clamped: true,
                    ...effective,
                    viewportWidth: effective.innerWidth,
                    viewportHeight: effective.innerHeight,
                    resizeRequestedWidth: requestedWidth,
                    resizeRequestedHeight: requestedHeight,
                    resizeEffectiveWidth: effective.outerWidth,
                    resizeEffectiveHeight: effective.outerHeight,
                });
            }
            return true;
        } catch (e) { return false; }
    },

    init: async () => {
        Worker._diagnosticOperationFeature = Storage.get(CONFIG.KEYS.WORKER_MODE, '') === 'report' ? 'report' : 'blocking';
        Worker._diagnosticPersistAt = 0;
        Worker._diagnosticExecutionId = RuntimeDiagnostics.ensureExecution(Worker._diagnosticOperationFeature, {
            strategy: Utils.isMobile() ? 'same_tab' : 'background_tab',
            foreground: !Utils.isMobile(),
            background: Utils.isMobile() === false,
        });
        Worker._diagnosticOperationId = RuntimeDiagnostics.begin(Worker._diagnosticOperationFeature, { strategy: Utils.isMobile() ? 'same_tab' : 'background_tab', foreground: !Utils.isMobile(), background: Utils.isMobile() === false });
        RuntimeDiagnostics.record(Worker._diagnosticOperationFeature, 'precondition', { operationId: Worker._diagnosticOperationId, queueCount: Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []).length, pendingCount: Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length });
        Worker.persistDiagnostics(true);
        Worker.loadStats();
        // Pre-initialize UI to capture early logs
        Worker.createStatusUI();

        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const first = queue[0] || '';
        const isUnblock = first.startsWith(CONFIG.UNBLOCK_PREFIX);

        document.title = `🛡️ 留友封-${isUnblock ? '解除封鎖' : '背景執行'}中`;

        // Worker 視窗尺寸有上下界。上界避免佔滿螢幕；下界是功能前提：實測把視窗
        // 縮到 197x327 或 254x269，Threads 會切成窄版面，個人頁的 root 與「更多」
        // 都認不出來，整批封鎖 100% 失敗（BUGLIST #11）。與其追著窄版面改判定，
        // 這裡把它當成不支援的尺寸，偵測到就撐回下界並在畫面上說明。
        Worker.enforceWindowBounds();
        // 拖拉中 outer/inner 讀值是暫態的，逐事件立即調整會讓每次落點不同；
        // 等使用者放手（250ms 無新事件）才量一次穩定值、調一次。
        window.addEventListener('resize', () => {
            clearTimeout(Worker._enforceBoundsTimer);
            Worker._enforceBoundsTimer = setTimeout(() => Worker.enforceWindowBounds(), 250);
        });

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
                const logs = Storage.getJSON(CONFIG.KEYS.DEBUG_LOG, []);
                logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
                // 每個帳號會寫約 10 行，舊上限 100 只留得住約 10 個帳號，
                // 一批小視窗測試跑完就被沖掉了。
                if (logs.length > 600) logs.splice(0, logs.length - 600);
                Storage.setJSON(CONFIG.KEYS.DEBUG_LOG, logs);
            } catch (e) { }
        };

        // Worker 關閉前先保存診斷，再清理暫存狀態。
        let closeHandled = false;
        const handleWorkerClose = () => {
            Worker.persistDiagnostics(true);
            if (closeHandled) return;
            closeHandled = true;
            Storage.remove(CONFIG.KEYS.VERIFY_PENDING);
            // 批次驗證進度不清除 — 重新開啟 Worker 時可繼續
            const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            if (status.state === 'running') {
                status.state = 'paused';
                status.lastUpdate = Date.now();
                Storage.setJSON(CONFIG.KEYS.BG_STATUS, status);
            }
            Worker.saveStats();
        };
        window.addEventListener('pagehide', handleWorkerClose);
        window.addEventListener('beforeunload', handleWorkerClose);

        window.hegeLog('[BG-INIT] Worker Started');

        // Cooldown check
        const cooldownUntil = parseInt(Storage.get(CONFIG.KEYS.COOLDOWN) || '0');
        if (cooldownUntil > Date.now()) {
            const remainMs = cooldownUntil - Date.now();
            const remainHrs = Math.ceil(remainMs / (1000 * 60 * 60));
            Worker.updateStatus('error', `⛔ 封鎖功能被限制，約 ${remainHrs} 小時後自動恢復`);
            const stopBtn = document.getElementById('hege-worker-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            Worker.recordSafetyDiagnostic('cooldown', 'cooldown', MoreLocator.routeType(), {}, {}, { operationId: Worker._diagnosticOperationId });
            Worker.endDiagnostic(Worker._diagnosticOperationId, 'terminal', { reason: 'cooldown', ok: false, cooldownActive: true });
            Worker.endExecution();
            Worker._diagnosticOperationId = null;
            return;
        }

        // Restore from cooldown queue if needed
        const cooldownQueue = Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
        if (cooldownQueue.length > 0) {
            const restoredCount = Core.restoreCooldownQueue();

            Worker.stats = { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: Date.now() };
            Worker.initialTotal = 0;
            Worker.sessionQueue = [];
            Worker.verifyLevel = 0;
            Worker.verifyCount = 0;
            Worker.consecutiveFails = 0;
            Worker.saveStats();
            window.hegeLog(`[BG-INIT] Cooldown expired, restored ${restoredCount} users from backup`);
        }

        setTimeout(Worker.runStep, 1000);
    },

    escapeHTML: (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[ch])),

    getUsernameFromHref: (href = '') => {
        try {
            const path = new URL(href, window.location.origin).pathname;
            if (!path.startsWith('/@')) return '';
            return decodeURIComponent(path.slice(2).split('/')[0] || '');
        } catch (e) {
            return href.includes('/@') ? href.split('/@')[1].split(/[/?#]/)[0] : '';
        }
    },

    summarizeRect: (el) => {
        if (!el || !el.getBoundingClientRect) return null;
        const rect = el.getBoundingClientRect();
        return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
        };
    },

    markScanElement: (el, color = '#ffd60a') => {
        if (!Worker.isReportVisualDebugEnabled()) return;
        if (!el || !el.style || el.dataset.hegeReportScanMarked === 'true') return;
        el.dataset.hegeReportScanMarked = 'true';
        el.style.outline = `3px solid ${color}`;
        el.style.outlineOffset = '2px';
        el.style.boxShadow = `0 0 0 6px ${color}33`;
        el.style.borderRadius = el.style.borderRadius || '8px';
    },

    findReportUserOccurrences: (user) => {
        const links = Array.from(document.querySelectorAll('a[href^="/@"]'))
            .filter(a => Worker.getUsernameFromHref(a.getAttribute('href') || '') === user);
        const seenContainers = new Set();
        const occurrences = [];

        links.forEach((link) => {
            let node = link;
            let best = null;
            for (let depth = 0; depth < 18 && node && node !== document.body; depth++) {
                if (node.querySelector && node.querySelector(CONFIG.SELECTORS.MORE_SVG)) {
                    best = node;
                    break;
                }
                if (!best && node.matches && node.matches('article, [role="article"], [data-pressable-container="true"]')) {
                    best = node;
                }
                node = node.parentElement;
            }

            const container = best || link.closest('div');
            if (!container || seenContainers.has(container)) return;
            seenContainers.add(container);

            const moreSvgs = Array.from(container.querySelectorAll(CONFIG.SELECTORS.MORE_SVG));
            const moreButtons = moreSvgs.map(svg => {
                const btn = svg.closest('div[role="button"], button, a[role="link"]') || svg;
                return {
                    circles: svg.querySelectorAll('circle').length,
                    paths: svg.querySelectorAll('path').length,
                    aria: svg.getAttribute('aria-label') || '',
                    rect: Worker.summarizeRect(btn),
                };
            });

            const postLinks = [...new Set(Array.from(container.querySelectorAll('a[href*="/post/"]'))
                .map(a => {
                    try {
                        const url = new URL(a.getAttribute('href') || '', window.location.origin);
                        return `${url.origin}${url.pathname}`;
                    } catch (e) {
                        return '';
                    }
                })
                .filter(Boolean))]
                .slice(0, 6);

            const rect = Worker.summarizeRect(container);
            const isVisible = rect && rect.w > 5 && rect.h > 5 && rect.y > -window.innerHeight && rect.y < window.innerHeight * 2;
            if (isVisible) {
                Worker.markScanElement(container, moreButtons.length > 0 ? '#ffd60a' : '#ff9f0a');
                moreSvgs.forEach(svg => {
                    const btn = svg.closest('div[role="button"], button, a[role="link"]') || svg;
                    Worker.markScanElement(btn, '#30d158');
                });
            }

            occurrences.push({
                text: (container.innerText || container.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
                rect,
                isVisible,
                moreCount: moreButtons.length,
                moreButtons,
                postLinks,
            });
        });

        return occurrences.slice(0, 8);
    },

    showReportQueueInspector: () => {
        Storage.invalidate(CONFIG.KEYS.REPORT_QUEUE);
        Storage.invalidate(CONFIG.KEYS.REPORT_CONTEXT);
        const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        const contextMap = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
        const origin = window.location.origin;
        const firstSourceUrl = reportQueue
            .map(user => (contextMap[user] || {}).sourceUrl || '')
            .find(Boolean);
        if (firstSourceUrl) {
            try {
                const source = new URL(firstSourceUrl, origin);
                if (source.pathname && source.pathname !== location.pathname) {
                    Storage.setJSON(CONFIG.KEYS.BG_STATUS, {
                        state: 'running',
                        current: `只檢舉掃描來源貼文：${source.pathname}`,
                        progress: 0,
                        total: reportQueue.length,
                        lastUpdate: Date.now(),
                    });
                    if (window.hegeLog) window.hegeLog(`[只檢舉][INSPECT] 前往來源貼文掃描 ${source.pathname}`);
                    history.replaceState(null, '', `${source.pathname}?hege_bg=true&hege_report_inspect=true`);
                    location.reload();
                    return;
                }
            } catch (e) {
                if (window.hegeLog) window.hegeLog(`[只檢舉][INSPECT] sourceUrl 解析失敗 ${firstSourceUrl}: ${e.message}`);
            }
        }

        const rows = reportQueue.map((user, index) => {
            const ctx = contextMap[user] || {};
            const profileUrl = `${origin}/@${encodeURIComponent(user)}`;
            const sourceUrl = ctx.sourceUrl || '';
            const occurrences = Worker.findReportUserOccurrences(user);
            return {
                index: index + 1,
                user,
                profileUrl,
                sourceUrl,
                source: ctx.source || '',
                targetType: ctx.targetType || '',
                updatedAt: ctx.updatedAt || null,
                occurrences,
                moreCount: occurrences.reduce((sum, item) => sum + item.moreCount, 0),
                quickLinks: [...new Set(occurrences.flatMap(item => item.postLinks || []))].slice(0, 8),
            };
        });

        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {
            state: 'paused',
            current: `只檢舉候選清單待確認：${rows.length} 筆`,
            progress: 0,
            total: rows.length,
            lastUpdate: Date.now(),
            debug: { reportCandidates: rows },
        });

        const listHTML = rows.map(item => {
            const user = Worker.escapeHTML(item.user);
            const profileUrl = Worker.escapeHTML(item.profileUrl);
            const sourceUrl = Worker.escapeHTML(item.sourceUrl || '(沒有來源連結)');
            const sourceHref = item.sourceUrl ? Worker.escapeHTML(item.sourceUrl) : '';
            const meta = Worker.escapeHTML([
                item.source ? `source=${item.source}` : '',
                item.targetType ? `target=${item.targetType}` : '',
                item.updatedAt ? `updated=${new Date(item.updatedAt).toLocaleString()}` : '',
            ].filter(Boolean).join(' · ') || '沒有 context metadata');
            const scanSummary = item.occurrences.length > 0
                ? `頁面找到 ${item.occurrences.length} 個位置，三點候選 ${item.moreCount} 個`
                : '目前頁面沒有找到這個 ID 的留言/回覆列';
            const quickLinksHTML = item.quickLinks.length > 0
                ? item.quickLinks.map((link, idx) => {
                    const safeLink = Worker.escapeHTML(link);
                    return `<div style="margin-top:3px;word-break:break-all;">快速連結 ${idx + 1}: <a href="${safeLink}" target="_blank" rel="noreferrer" style="color:#30d158;text-decoration:none;">${safeLink}</a></div>`;
                }).join('')
                : '<div style="margin-top:3px;color:#777;">沒有找到留言/回覆快速連結</div>';
            const occurrenceHTML = item.occurrences.slice(0, 3).map((occ, idx) => {
                const rect = occ.rect ? `x=${occ.rect.x}, y=${occ.rect.y}, ${occ.rect.w}x${occ.rect.h}` : 'no rect';
                return `
                    <div style="margin-top:4px;padding:5px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background:rgba(255,255,255,0.03);">
                        <div style="color:#ddd;">位置 ${idx + 1}: 三點=${occ.moreCount} · ${Worker.escapeHTML(rect)}</div>
                        <div style="margin-top:3px;color:#888;">${Worker.escapeHTML(occ.text || '(沒有文字摘要)')}</div>
                    </div>
                `;
            }).join('');

            return `
                <div style="padding:8px 0;border-top:1px solid rgba(255,255,255,0.12);">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <strong style="font-size:12px;color:#fff;">${item.index}. @${user}</strong>
                        <a href="${profileUrl}" target="_blank" rel="noreferrer" style="color:#5ac8fa;text-decoration:none;font-size:11px;">個人頁</a>
                    </div>
                    <div style="margin-top:4px;font-size:10px;color:#aaa;word-break:break-all;">ID: ${user}</div>
                    <div style="margin-top:4px;font-size:10px;color:#aaa;word-break:break-all;">Profile: ${profileUrl}</div>
                    <div style="margin-top:4px;font-size:10px;color:#aaa;word-break:break-all;">
                        Source: ${item.sourceUrl ? `<a href="${sourceHref}" target="_blank" rel="noreferrer" style="color:#ffd60a;text-decoration:none;">${sourceUrl}</a>` : sourceUrl}
                    </div>
                    <div style="margin-top:4px;font-size:10px;color:#777;word-break:break-word;">${meta}</div>
                    <div style="margin-top:6px;font-size:11px;color:${item.moreCount > 0 ? '#30d158' : '#ff9f0a'};">${Worker.escapeHTML(scanSummary)}</div>
                    <div style="margin-top:4px;font-size:10px;color:#aaa;">${quickLinksHTML}</div>
                    ${occurrenceHTML}
                </div>
            `;
        }).join('');

        const panel = document.getElementById('hege-report-inspector');
        if (panel) {
            Utils.setHTML(panel, rows.length > 0 ? listHTML : '<div style="font-size:11px;color:#aaa;">REPORT_QUEUE 是空的</div>');
        }

        const statusEl = document.getElementById('bg-status');
        if (statusEl) statusEl.textContent = `只檢舉候選清單待確認：${rows.length} 筆`;

        const progressText = document.getElementById('hege-progress-text');
        if (progressText) progressText.textContent = '已停止檢舉，正在來源貼文掃描 ID、留言列、三點候選與快速連結';

        if (window.hegeLog) {
            window.hegeLog(`[只檢舉][INSPECT] 自動執行已暫停，候選 ${rows.length} 筆`);
            rows.forEach(item => {
                window.hegeLog(`[只檢舉][INSPECT] #${item.index} user=${item.user} profile=${item.profileUrl} source=${item.sourceUrl || '(none)'} occurrences=${item.occurrences.length} more=${item.moreCount} quickLinks=${JSON.stringify(item.quickLinks)}`);
            });
        }
    },

    isReportVisualDebugEnabled: () => {
        Storage.invalidate(CONFIG.KEYS.REPORT_VISUAL_DEBUG);
        return Storage.get(CONFIG.KEYS.REPORT_VISUAL_DEBUG) === 'true';
    },

    isBlockVisualDebugEnabled: () => {
        Storage.invalidate(CONFIG.KEYS.BLOCK_VISUAL_DEBUG);
        return Storage.get(CONFIG.KEYS.BLOCK_VISUAL_DEBUG) === 'true';
    },

    getVisualModeInfo: () => {
        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        const workerMode = Storage.get(CONFIG.KEYS.WORKER_MODE, '');
        const first = queue[0] || '';
        const isVerifying = !!Storage.get(CONFIG.KEYS.VERIFY_PENDING);
        const verifyPending = Storage.get(CONFIG.KEYS.VERIFY_PENDING) || '';
        const isUnblock = first.startsWith(CONFIG.UNBLOCK_PREFIX) || (isVerifying && verifyPending.startsWith(CONFIG.UNBLOCK_PREFIX));
        const isReport = workerMode === 'report' || (!workerMode && queue.length === 0 && reportQueue.length > 0);
        const isBlock = !isReport && (workerMode === 'block' || queue.length > 0 || isVerifying);
        const visualKey = isReport ? CONFIG.KEYS.REPORT_VISUAL_DEBUG : CONFIG.KEYS.BLOCK_VISUAL_DEBUG;
        const visualEnabled = isReport ? Worker.isReportVisualDebugEnabled() : Worker.isBlockVisualDebugEnabled();
        const actionText = isReport ? '檢舉' : (isUnblock ? '解除封鎖' : '封鎖');
        return { queue, reportQueue, workerMode, first, isVerifying, isUnblock, isReport, isBlock, visualKey, visualEnabled, actionText };
    },

    blockVisualStep: async (user, label, el = null, delay = 420) => {
        if (!Worker.isBlockVisualDebugEnabled()) return;
        const current = `封鎖可視化：@${user} ${label}`;
        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        status.state = 'running';
        status.current = current;
        status.lastUpdate = Date.now();
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, status);

        const statusEl = document.getElementById('bg-status');
        if (statusEl) statusEl.textContent = current;
        const progressText = document.getElementById('hege-progress-text');
        if (progressText) progressText.textContent = label;
        if (window.hegeLog) window.hegeLog(`[封鎖][VISUAL] @${user} ${label}`);

        if (el && el.style) {
            const oldOutline = el.style.outline;
            const oldBoxShadow = el.style.boxShadow;
            const oldBorderRadius = el.style.borderRadius;
            el.style.outline = '3px solid #ffd60a';
            el.style.boxShadow = '0 0 0 6px rgba(255,214,10,0.28)';
            el.style.borderRadius = oldBorderRadius || '8px';
            setTimeout(() => {
                if (!el.isConnected) return;
                el.style.outline = oldOutline;
                el.style.boxShadow = oldBoxShadow;
                el.style.borderRadius = oldBorderRadius;
            }, Math.max(delay + 1000, 1400));
        }

        await Utils.safeSleep(delay);
    },

    completeReportRun: () => {
        const completedUsers = Storage.getJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
        const keepBlockSelection = Storage.get(CONFIG.KEYS.REPORT_KEEP_BLOCK_SELECTION, 'true') !== 'false';
        Worker.finalizeReportDebugExport('completed', { completedUsers });

        Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
        Storage.remove(CONFIG.KEYS.REPORT_BATCH_PATH);
        Storage.setJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, completedUsers);
        Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);

        if (keepBlockSelection) {
            Storage.setJSON(CONFIG.KEYS.REPORT_RESTORE_PENDING, { users: completedUsers, updatedAt: Date.now(), source: 'complete' });
        }
        if (keepBlockSelection && Core.restorePendingUsers) {
            Core.restorePendingUsers(completedUsers);
        } else if (!keepBlockSelection && Core.clearPendingUsers) {
            Core.clearPendingUsers(completedUsers);
        }
        if (window.hegeLog) {
            window.hegeLog(`[只檢舉] 完成清理 completed=${completedUsers.length} keepBlockSelection=${keepBlockSelection}`);
        }
    },

    interruptReportRun: () => {
        const batchUsers = Storage.getJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
        const keepBlockSelection = Storage.get(CONFIG.KEYS.REPORT_KEEP_BLOCK_SELECTION, 'true') !== 'false';
        Worker.finalizeReportDebugExport('stopped', { completedUsers: batchUsers });
        Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
        if (keepBlockSelection && batchUsers.length > 0) {
            Storage.setJSON(CONFIG.KEYS.REPORT_RESTORE_PENDING, { users: batchUsers, updatedAt: Date.now(), source: 'stop' });
            if (Core.restorePendingUsers) Core.restorePendingUsers(batchUsers);
        }
        if (window.hegeLog) {
            window.hegeLog(`[只檢舉] 中斷回填 batch=${batchUsers.length} keepBlockSelection=${keepBlockSelection}`);
        }
    },

    finalizeReportDebugExport: (status = 'completed', extra = {}) => {
        const payload = Core.finalizeReportDebugBatch(status, {
            workerStats: { ...Worker.stats },
            initialTotal: Worker.initialTotal,
            verifyLevel: Worker.verifyLevel,
            consecutiveFails: Worker.consecutiveFails,
            limitWarningMessage: Worker.limitWarningMessage,
            limitWarningCompactMessage: Worker.limitWarningCompactMessage,
            limitWarningDone: Worker.limitWarningDone,
            limitWarningLimit: Worker.limitWarningLimit,
            ...extra,
        });
        if (!payload) return null;

        const filename = `${payload.batch?.batchId || `report-debug-${Date.now()}`}.json`;
        if (window.hegeLog) {
            window.hegeLog(`[只檢舉][DEBUG] 批次診斷包已保存 status=${status} file=${filename}`);
        }
        return payload;
    },

    refreshStatusUI: () => {
        const oldCover = document.getElementById('hege-worker-cover');
        if (oldCover) oldCover.remove();
        Worker.createStatusUI();
        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
        if (status && status.state) {
            Worker.updateStatus(status.state, status.current || '', status.progress || 0, status.total || Worker.initialTotal);
        }
    },

    createStatusUI: () => {
        const bindStopButton = () => {
            const stopBtn = document.getElementById('hege-worker-stop');
            if (!stopBtn) return;

            const handleStop = () => {
                Storage.set('hege_sweep_stopped', 'true'); // 讓主頁面 driver 立即中止，防止空 queue 被誤判為批次完成
                if (Core.markStopRequested) Core.markStopRequested();
                else Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
                Storage.remove('hege_sweep_worker_standby');
                sessionStorage.removeItem('hege_sweep_state');
                sessionStorage.removeItem('hege_sweep_target');
                sessionStorage.removeItem('hege_sweep_last_first_user');
                sessionStorage.removeItem('hege_sweep_auto_triggered_once');
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
        };

        const syncWorkerVisualToggle = () => {
            const toggle = document.getElementById('hege-worker-report-visual-toggle');
            if (!toggle) return;
            const visualInfo = Worker.getVisualModeInfo();
            const enabled = visualInfo.visualEnabled;
            toggle.checked = enabled;
            const label = document.getElementById('hege-worker-report-visual-label');
            if (label) label.textContent = enabled ? '可視化開啟' : '可視化關閉';
            const hint = document.getElementById('hege-worker-report-visual-hint');
            if (hint) hint.textContent = '';
        };

        const bindWorkerVisualToggle = () => {
            const toggle = document.getElementById('hege-worker-report-visual-toggle');
            if (!toggle) return;
            syncWorkerVisualToggle();
            toggle.addEventListener('change', () => {
                const visualInfo = Worker.getVisualModeInfo();
                const enabled = toggle.checked;
                Storage.set(visualInfo.visualKey, enabled ? 'true' : 'false');
                if (window.hegeLog) window.hegeLog(`[${visualInfo.actionText}][VISUAL] worker 即時切換 ${enabled ? 'ON' : 'OFF'}`);
                Worker.refreshStatusUI();
                const statusEl = document.getElementById('bg-status');
                if (statusEl) statusEl.textContent = enabled ? '可視化已開啟' : '可視化已關閉';
            });
        };

        const cover = document.createElement('div');
        cover.id = 'hege-worker-cover';

        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        const workerMode = Storage.get(CONFIG.KEYS.WORKER_MODE, '');
        const first = queue[0] || '';
        const isVerifying = !!Storage.get(CONFIG.KEYS.VERIFY_PENDING);
        const isUnblock = first.startsWith(CONFIG.UNBLOCK_PREFIX) || (isVerifying && (Storage.get(CONFIG.KEYS.VERIFY_PENDING) || '').startsWith(CONFIG.UNBLOCK_PREFIX));
        const isReportOnlyWorker = workerMode === 'report' || (!workerMode && queue.length === 0 && reportQueue.length > 0);
        const reportVisualDebugEnabled = Worker.isReportVisualDebugEnabled();
        const isBlockWorker = !isReportOnlyWorker && (workerMode === 'block' || queue.length > 0 || isVerifying);
        const blockVisualDebugEnabled = Worker.isBlockVisualDebugEnabled();
        const workerVisualDebugEnabled = isReportOnlyWorker ? reportVisualDebugEnabled : blockVisualDebugEnabled;
        const useCompactUI = workerVisualDebugEnabled;
        const visualActionText = isReportOnlyWorker ? '檢舉' : (isUnblock ? '解除封鎖' : '封鎖');
        const visualTitleText = `${visualActionText}可視化`;

        if ((isReportOnlyWorker || isBlockWorker) && useCompactUI) {
            cover.dataset.compact = 'true';
            cover.style.cssText = 'position:fixed;right:12px;bottom:12px;width:min(360px,calc(100vw - 24px));max-height:42vh;background:rgba(10,10,10,0.86);color:#e8e8e8;z-index:999999;border:1px solid rgba(255,255,255,0.16);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.36);font-family:system-ui,-apple-system,sans-serif;font-size:12px;padding:10px;box-sizing:border-box;overflow:hidden;backdrop-filter:blur(10px);';

            Utils.setHTML(cover, `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                    <div id="hege-worker-title" style="font-size:13px;font-weight:700;color:#fff;">${visualTitleText}</div>
                    <div id="hege-worker-stop" style="background:#ff453a;color:#fff;font-size:12px;font-weight:700;padding:6px 10px;border-radius:7px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;">停止</div>
                </div>
                <div id="bg-status" style="font-size:12px;font-weight:650;color:#4cd964;margin-bottom:6px;line-height:1.35;">等待指令...</div>
                <div style="width:100%;background:#222;border-radius:8px;height:8px;overflow:hidden;margin-bottom:6px;">
                    <div id="hege-progress-bar" style="height:100%;width:0%;background:#4cd964;border-radius:8px;transition:width 0.3s ease;"></div>
                </div>
                <div style="display:none;">
                    <span id="hege-progress-pct">0%</span>
                    <span id="hege-stat-success">0</span>
                    <span id="hege-stat-skipped">0</span>
                    <span id="hege-stat-failed">0</span>
                    <span id="hege-stat-vanished">0</span>
                    <span id="hege-eta"></span>
                </div>
                <div id="hege-progress-text" style="font-size:11px;color:#aaa;margin-bottom:6px;">可視化開啟：逐步標示點擊目標</div>
                <label id="hege-worker-report-visual-control" style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:6px 8px;margin-bottom:6px;cursor:pointer;user-select:none;">
                    <span style="display:flex;flex-direction:column;gap:1px;">
                        <span id="hege-worker-report-visual-label" style="font-size:11px;font-weight:700;color:#e5f0ff;">可視化開啟</span>
                    </span>
                    <input type="checkbox" id="hege-worker-report-visual-toggle" checked style="width:16px;height:16px;flex:0 0 auto;">
                </label>
                <div id="hege-report-inspector" style="display:${reportVisualDebugEnabled ? 'block' : 'none'};width:100%;max-height:28vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:7px;text-align:left;font-size:10px;line-height:1.35;color:#b8b8b8;background:rgba(0,0,0,0.3);box-sizing:border-box;margin-bottom:6px;"></div>
                <div id="hege-worker-log" style="width:100%;max-height:24vh;overflow-y:auto;border:1px solid rgba(255,255,255,0.12);border-radius:7px;padding:7px;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:1.35;color:#b8b8b8;background:rgba(0,0,0,0.42);box-sizing:border-box;"></div>
            `);
            document.body.appendChild(cover);
            bindStopButton();
            bindWorkerVisualToggle();
            if (!Worker._workerVisualStorageListenerBound) {
                Worker._workerVisualStorageListenerBound = true;
                window.addEventListener('storage', (e) => {
                    if (![CONFIG.KEYS.REPORT_VISUAL_DEBUG, CONFIG.KEYS.BLOCK_VISUAL_DEBUG].includes(e.key)) return;
                    Worker.refreshStatusUI();
                });
            }
            return;
        }

        cover.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%);color:#e0e0e0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;font-family:system-ui,-apple-system,sans-serif;font-size:14px;padding:24px 20px;box-sizing:border-box;overflow:hidden;';
        const workerTitleText = isReportOnlyWorker ? '檢舉進行中' : (isUnblock ? '解除封鎖進行中' : '封鎖進行中');
        const stopActionText = Storage.get('hege_sweep_worker_standby') === 'true'
            ? '定點絕'
            : (isReportOnlyWorker ? '檢舉' : (isUnblock ? '解除封鎖' : '封鎖'));

        Utils.setHTML(cover, `
            <div style="width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center;flex:1;overflow:hidden;">
                <div id="hege-worker-title" style="font-size:22px;font-weight:700;margin-bottom:4px;letter-spacing:0.5px;">🛡️ ${workerTitleText}</div>
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

                ${(isReportOnlyWorker || isBlockWorker) ? `
                <label id="hege-worker-report-visual-control" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#111827;border:1px solid #26364d;border-radius:10px;padding:10px 12px;margin-bottom:14px;box-sizing:border-box;cursor:pointer;user-select:none;">
                    <span style="display:flex;flex-direction:column;gap:2px;">
                        <span id="hege-worker-report-visual-label" style="font-size:13px;font-weight:700;color:#e5f0ff;">${workerVisualDebugEnabled ? '可視化開啟' : '可視化關閉'}</span>
                    </span>
                    <input type="checkbox" id="hege-worker-report-visual-toggle" ${workerVisualDebugEnabled ? 'checked' : ''} style="width:18px;height:18px;flex:0 0 auto;">
                </label>
                ` : ''}

                <!-- Stop Button -->
                <div id="hege-worker-stop" style="background:#ff453a;color:#fff;font-size:16px;font-weight:700;padding:14px 48px;border-radius:14px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 12px rgba(255,69,58,0.3);transition:transform 0.15s,opacity 0.15s;margin-bottom:20px;">🛑 停止${stopActionText}</div>

                <!-- Debug Log -->
                <div id="hege-worker-log" style="width:100%;flex:1;overflow-y:auto;border:1px solid #222;border-radius:8px;padding:10px;text-align:left;font-family:monospace;font-size:11px;color:#555;background:#0a0a0a;"></div>
            </div>
        `);
        document.body.appendChild(cover);

        bindStopButton();
        bindWorkerVisualToggle();
        if (!Worker._workerVisualStorageListenerBound) {
            Worker._workerVisualStorageListenerBound = true;
            window.addEventListener('storage', (e) => {
                if (![CONFIG.KEYS.REPORT_VISUAL_DEBUG, CONFIG.KEYS.BLOCK_VISUAL_DEBUG].includes(e.key)) return;
                Worker.refreshStatusUI();
            });
        }
    },

    updateStatus: (state, current = '', progress = 0, total = 0, metadata = null) => {
        const s = { state, current, progress, total, lastUpdate: Date.now() };
        const navigationStartedAt = Number(metadata?.accountNavigationStartedAt);
        if (Number.isFinite(navigationStartedAt) && navigationStartedAt > 0) {
            s.accountNavigationStartedAt = Math.floor(navigationStartedAt);
        }
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, s);
        if (state === 'error') Worker.persistDiagnostics(true);

        // Status text
        const el = document.getElementById('bg-status');
        if (el) el.textContent = state === 'running' ? `目前：@${current.replace(/^(前往|封鎖中|略過|解除封鎖中|解鎖前往|檢舉帳號前往)[：:] ?/, '')}` : current;

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

        if (workerCover && workerCover.dataset.compact !== 'true') {
            workerCover.style.background = isVerifying
                ? 'linear-gradient(135deg,#0a0a0a 0%,#1a2a4a 100%)' // Deep Blue for verify
                : 'linear-gradient(135deg,#0a0a0a 0%,#1a1a2e 100%)'; // Regular Navy
        }

        if (workerTitle) {
            if (workerCover && workerCover.dataset.compact === 'true') {
                const visualInfo = Worker.getVisualModeInfo();
                workerTitle.textContent = `${visualInfo.actionText}可視化`;
                workerTitle.style.color = '#fff';
            } else {
                const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
                const workerMode = Storage.get(CONFIG.KEYS.WORKER_MODE, '');
                const isReportOnlyWorker = workerMode === 'report' || (!workerMode && queue.length === 0 && reportQueue.length > 0);
                const isUnblock = (queue[0] || '').startsWith(CONFIG.UNBLOCK_PREFIX) || (isVerifying && Storage.get(CONFIG.KEYS.VERIFY_PENDING).startsWith(CONFIG.UNBLOCK_PREFIX));

                if (isVerifying) {
                    workerTitle.textContent = '🔍 驗證正在進行中...';
                    workerTitle.style.color = '#5ac8fa';
                } else if (isReportOnlyWorker) {
                    workerTitle.textContent = '🛡️ 檢舉進行中';
                    workerTitle.style.color = '#fff';
                } else {
                    workerTitle.textContent = `🛡️ ${isUnblock ? '解除封鎖進行中' : '封鎖進行中'}`;
                    workerTitle.style.color = '#fff';
                }
            }
        }

        if (pctEl) pctEl.textContent = `${pct}%`;
        if (progressText) {
            if (workerCover && workerCover.dataset.compact === 'true') {
                if (Worker.limitWarningMessage) {
                    progressText.textContent = Worker.limitWarningCompactMessage || Worker.limitWarningMessage;
                    progressText.style.fontSize = '13px';
                    progressText.style.color = '#ff9f0a';
                    progressText.style.fontWeight = '800';
                    progressText.style.lineHeight = '1.35';
                    progressText.style.whiteSpace = 'normal';
                    progressText.style.wordBreak = 'break-word';
                } else {
                    const visualInfo = Worker.getVisualModeInfo();
                    progressText.textContent = visualInfo.visualEnabled
                        ? '可視化開啟：逐步標示點擊目標'
                        : '可視化關閉：安靜執行，不標示點擊目標';
                    progressText.style.fontSize = '11px';
                    progressText.style.color = '#aaa';
                    progressText.style.fontWeight = '400';
                    progressText.style.lineHeight = '';
                    progressText.style.whiteSpace = '';
                    progressText.style.wordBreak = '';
                }
            } else {
                progressText.textContent = Worker.limitWarningMessage || (isVerifying ? `正在確認結果... (@${current})` : `${processed} / ${initTotal} 已處理`);
                progressText.style.fontSize = Worker.limitWarningMessage ? '18px' : '13px';
                progressText.style.color = Worker.limitWarningMessage ? '#ff9f0a' : '#888';
                progressText.style.fontWeight = Worker.limitWarningMessage ? '800' : '400';
            }
        }

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

    setLimitWarning: (message = '', options = {}) => {
        const nextMessage = message || '';
        const warningOptions = options && typeof options === 'object' ? options : {};
        const nextCompactMessage = typeof warningOptions.compactMessage === 'string'
            ? warningOptions.compactMessage
            : '';
        const nextDone = normalizeLimitWarningNumber(warningOptions.done);
        const nextLimit = normalizeLimitWarningNumber(warningOptions.limit);
        if (
            Worker.limitWarningMessage === nextMessage
            && Worker.limitWarningCompactMessage === nextCompactMessage
            && Worker.limitWarningDone === nextDone
            && Worker.limitWarningLimit === nextLimit
        ) return;

        Worker.limitWarningMessage = nextMessage;
        Worker.limitWarningCompactMessage = nextCompactMessage;
        Worker.limitWarningDone = nextDone;
        Worker.limitWarningLimit = nextLimit;
        Worker.saveStats();

        if (window.hegeLog && Worker.limitWarningMessage) {
            window.hegeLog(`[上限提醒] ${Worker.limitWarningMessage}`);
        }

        const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, null);
        if (status && status.state) {
            Worker.updateStatus(status.state, status.current || '', status.progress || 0, status.total || Worker.initialTotal);
        }
    },

    noteReportRateLimit: ({ user = '', detail = '' } = {}) => {
        const bannerMessage = '⚠️ 疑似碰到 Meta 檢舉限流，常見要等 24 小時左右；若想先停可按下方「停止」，是否現在停止由你決定。';
        const changed = Worker.limitWarningMessage !== bannerMessage;
        Worker.setLimitWarning(bannerMessage);

        if (window.hegeLog) {
            const detailSuffix = detail ? ` detail=${detail}` : '';
            const userSuffix = user ? ` @${user}` : '';
            window.hegeLog(`[只檢舉][LIMIT-REMINDER]${userSuffix}${detailSuffix}`);
        }

        return {
            changed,
            bannerMessage,
            toastMessage: user
                ? `偵測到 @${user} 疑似碰到 Meta 檢舉限流，常見要等 24 小時左右才會恢復。若你想先停，可以按下方「停止」；是否現在停止由你決定。`
                : '疑似碰到 Meta 檢舉限流，常見要等 24 小時左右才會恢復。若你想先停，可以按下方「停止」；是否現在停止由你決定。'
        };
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
                if (!isUnblock && Storage.getBlockDB().includes(user)) {
                    Storage.removeFromBlockDB(user);
                    Core.recordFailure('block', user, 'verification_failed');
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
            Storage.remove(CONFIG.KEYS.WORKER_MODE);
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
        if (Worker._stepRunning) return;
        // 視窗太小時「暫停」而不是「失敗」。resizeTo 不保證成功：使用者可以繼續
        // 拖小，某些情況瀏覽器也會拒絕。實測顯示只要 viewport 真的維持在下界
        // （700x453）就全數成功，失敗都發生在視窗仍小於下界的期間。硬跑只會把
        // 名單消耗掉並記成假失敗，所以這裡不進佇列、不記失敗，等尺寸恢復再繼續。
        if (Worker.isWindowTooSmall()) {
            Worker.enforceWindowBounds();
            if (Worker.isWindowTooSmall()) {
                Worker.noteWindowTooSmall();
                setTimeout(Worker.runStep, 1000);
                return;
            }
        }
        Worker._stepRunning = true;
        try {
        const operationFeature = Worker._diagnosticOperationFeature || 'blocking';
        const operationId = Worker._diagnosticOperationId || (Worker._diagnosticOperationId = RuntimeDiagnostics.begin(operationFeature, { strategy: Utils.isMobile() ? 'same_tab' : 'background_tab' }));
        RuntimeDiagnostics.record(operationFeature, 'dequeue', { operationId, queueCount: Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []).length, pendingCount: Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length });
        Worker.persistDiagnostics();
        if (Storage.get(CONFIG.KEYS.BG_CMD) === 'stop') {
            Worker.recordSafetyDiagnostic('queue_advance', 'stopped', MoreLocator.routeType());
            Worker.endDiagnostic(operationId, 'stop', { reason: 'user_stop', ok: false });
            Worker.endExecution();
            const workerMode = Storage.get(CONFIG.KEYS.WORKER_MODE, '');
            if (workerMode === 'report') Worker.interruptReportRun();
            Storage.remove(CONFIG.KEYS.BG_CMD);
            Storage.remove(CONFIG.KEYS.WORKER_MODE);
            Storage.remove(CONFIG.KEYS.VERIFY_PENDING);
            Storage.remove('hege_sweep_worker_standby');
            Storage.remove('hege_batch_verify_idx');
            Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, []);
            sessionStorage.removeItem('hege_sweep_state');
            sessionStorage.removeItem('hege_sweep_target');
            sessionStorage.removeItem('hege_sweep_last_first_user');
            sessionStorage.removeItem('hege_sweep_auto_triggered_once');
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
                            Worker.recordSafetyDiagnostic('retry', 'retry', MoreLocator.routeType(), {}, { retryCount: Worker.consecutiveFails }, { operationId: Worker._diagnosticOperationId });
                            Worker.recordSafetyDiagnostic('failure', 'failure', MoreLocator.routeType(), {}, { retryCount: Worker.consecutiveFails }, { operationId: Worker._diagnosticOperationId });
                            Worker.recordSafetyDiagnostic('breaker', 'breaker_open', MoreLocator.routeType(), {}, { retryCount: Worker.consecutiveFails }, { operationId: Worker._diagnosticOperationId });
                            await Worker.markTargetFailedAndContinue(
                                verifyPending,
                                targetUser,
                                currentTotal,
                                `⚠️ 偵測到疑似平台限制，已連續 ${Worker.consecutiveFails} 次失敗，建議手動暫停`,
                                3000,
                                'verification_failed'
                            );
                            return;
                        }
                    }
                    Worker.stats.failed++;
                    Worker.saveStats();
                    if (queue.length > 0 && queue[0] === verifyPending) {
                        queue.shift();
                        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
                    }
                    Core.recordFailure('block', targetUser, 'verification_failed');
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

                if (isUnblockVerify) {
                    Storage.removeFromBlockDB(targetUser);
                } else {
                    Storage.addToBlockDBFromContext(targetUser);
                }
                Core.removeFailure(targetUser, 'block');
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
        const workerMode = Storage.get(CONFIG.KEYS.WORKER_MODE, '');
        if (workerMode === 'report') {
            Storage.invalidate(CONFIG.KEYS.REPORT_QUEUE);
            const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
            if (reportQueue.length > 0 && Core.ReportDriver) {
                const reportUser = reportQueue[0];
                const reportContext = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {})[reportUser] || {};
                const onReportPage = new RegExp(`^/@${reportUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\/|$)`).test(location.pathname);
                if (window.hegeLog) {
                    window.hegeLog(`[只檢舉][worker] mode=report queue=${reportQueue.length} user=${reportUser} pathname=${location.pathname}`);
                    window.hegeLog(`[只檢舉][worker] context=${JSON.stringify(reportContext)}`);
                }
                if (!onReportPage) {
                    Worker.updateStatus('running', `檢舉帳號前往: ${reportUser}`, 0, reportQueue.length);
                    await Utils.speedSleep(500 + Math.random() * 300);
                    history.replaceState(null, '', `/@${reportUser}?hege_bg=true`);
                    location.reload();
                    return;
                }

                if (window.hegeLog) window.hegeLog(`[只檢舉] 開始帳號檢舉 REPORT_QUEUE ${reportQueue.length} 筆`);
                Worker.resetStatsIfStorageCleared();
                Worker.ensureReportStats(reportQueue.length);
                const handled = await Core.ReportDriver.processNext(Worker.getReportDriverOptions(reportUser, reportContext));
                if (handled) return;
                return;
            }

            Worker.updateStatus('idle', '✅ 檢舉全部完成！', 0, 0);
            Worker.recordSafetyDiagnostic('queue_advance', 'completed', MoreLocator.routeType());
            Worker.endDiagnostic(Worker._diagnosticOperationId, 'finish', { reason: 'completed', ok: true, complete: true, processedCount: Worker.stats.success + Worker.stats.skipped });
            Worker.endExecution();
            Worker._diagnosticOperationId = null;
            Worker.completeReportRun();
            Worker.clearStats();
            Storage.remove(CONFIG.KEYS.WORKER_MODE);
            const stopBtn = document.getElementById('hege-worker-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            Worker.navigateBack();
            return;
        }

        Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
        let queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        if (queue.length === 0) {
            Storage.invalidate(CONFIG.KEYS.REPORT_QUEUE);
            const reportQueue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
            if (workerMode !== 'block' && reportQueue.length > 0 && Core.ReportDriver) {
                const reportUser = reportQueue[0];
                const reportContext = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {})[reportUser] || {};
                const onReportPage = new RegExp(`^/@${reportUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\/|$)`).test(location.pathname);
                if (window.hegeLog) {
                    window.hegeLog(`[只檢舉][worker] queue=${reportQueue.length} user=${reportUser} mode=profile pathname=${location.pathname}`);
                    window.hegeLog(`[只檢舉][worker] context=${JSON.stringify(reportContext)}`);
                }
                if (!onReportPage) {
                    Worker.updateStatus('running', `檢舉帳號前往: ${reportUser}`, 0, reportQueue.length);
                    await Utils.speedSleep(500 + Math.random() * 300);
                    history.replaceState(null, '', `/@${reportUser}?hege_bg=true`);
                    location.reload();
                    return;
                }

                if (window.hegeLog) window.hegeLog(`[只檢舉] 開始帳號檢舉 REPORT_QUEUE ${reportQueue.length} 筆`);
                Worker.resetStatsIfStorageCleared();
                Worker.ensureReportStats(reportQueue.length);
                const handled = await Core.ReportDriver.processNext(Worker.getReportDriverOptions(reportUser, reportContext));
                if (handled) return;
                return;
            }

            // 貼文水庫批次完成橋接：通知主視窗接續下一批；空 queue 啟動不再待命。
            if (Storage.get('hege_sweep_worker_standby') === 'true') {
                const hadWork = Worker.initialTotal > 0
                    || Worker.sessionQueue.length > 0
                    || (Worker.stats.success + Worker.stats.skipped + Worker.stats.failed + Worker.stats.vanished) > 0;
                const isPopupWorker = new URLSearchParams(window.location.search).get('hege_popup') === 'true';
                if (!hadWork) {
                    Storage.remove('hege_sweep_worker_standby');
                    Worker.updateStatus('idle', '定點絕 worker 無待處理佇列，已結束。', 0, 0);
                    if (window.hegeLog) window.hegeLog('[BG] 空 queue 啟動，清除貼文水庫待命旗標。');
                    if (isPopupWorker) window.close();
                    else Worker.navigateBack();
                    return;
                }

                Worker.updateStatus('idle', '✅ 本批定點絕完成，等待主視窗接續...', 0, Worker.initialTotal);
                if (window.hegeLog) window.hegeLog('[BG] 本批佇列完成，等待主視窗接續下一批...');

                // Same-tab fallback 會有 hege_return_url；popup worker 一律直接關閉避免回錯頁
                if (!window.opener || window.opener.closed) {
                    if (isPopupWorker) {
                        if (window.hegeLog) window.hegeLog('[BG] Popup 無 opener，清除待命旗標並關閉 worker。');
                        Storage.remove('hege_sweep_worker_standby');
                        window.close();
                    } else {
                        if (window.hegeLog) window.hegeLog('[BG] Same-tab 模式，返回主頁面讓 SweepDriver 處理下一批...');
                        Worker.navigateBack();
                    }
                    return;
                }

                // Popup 模式（有 opener）：Safari Background Tab 最終防線，由 Active Worker 強制重載 Opener
                try {
                    if (window.opener && !window.opener.closed) {
                        const openerState = window.opener.sessionStorage.getItem('hege_sweep_state');
                        if (openerState === 'WAIT_FOR_BG') {
                            window.opener.sessionStorage.setItem('hege_sweep_state', 'RELOADING');
                            window.opener.sessionStorage.removeItem('hege_sweep_auto_triggered_once');
                            if (window.hegeLog) window.hegeLog('[BG] 主視窗休眠中，由 Worker 強行代為 Reload 跨視窗喚醒...');
                            window.opener.location.reload();
                        }
                    }
                } catch (e) {
                    if (window.hegeLog) window.hegeLog('[BG] 跨域防護阻止直接 Reload: ' + e.message);
                    try {
                        if (window.opener && !window.opener.closed) {
                            window.opener.postMessage('HEGE_WAKEUP_RELOAD', '*');
                        }
                    } catch(err) {}
                }

                // popup worker 不需要停在空佇列頁面，交回主視窗後直接結束
                setTimeout(() => {
                    if (isPopupWorker) window.close();
                    else Worker.navigateBack();
                }, 800);
                return;
            }

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
            Worker.recordSafetyDiagnostic('queue_advance', 'completed', MoreLocator.routeType());
            Worker.endDiagnostic(Worker._diagnosticOperationId, 'finish', { reason: 'completed', ok: true, complete: true, processedCount: Worker.stats.success + Worker.stats.skipped });
            Worker.endExecution();
            Worker._diagnosticOperationId = null;
            Worker.clearStats();
            Storage.remove(CONFIG.KEYS.WORKER_MODE);
            const stopBtn = document.getElementById('hege-worker-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            Worker.navigateBack();
            return;
        }

        const hasStructuredDailyLimitWarning = Number.isFinite(Worker.limitWarningDone)
            && Number.isFinite(Worker.limitWarningLimit);
        if (!Storage.isUnderLimit()) {
            const limit = Storage.getDailyBlockLimit();
            const done = Storage.getBlocksLast24h();
            Worker.setLimitWarning(
                `⚠️ 已封鎖 ${done} 筆，超過你自訂上限 ${limit} 筆。這是自訂的安全估計值，超過可能被平台限制，但程式會繼續執行。`,
                {
                    compactMessage: `⚠️ 已封鎖 ${done}/${limit}，超過自訂上限仍繼續`,
                    done,
                    limit,
                },
            );
        } else if (
            hasStructuredDailyLimitWarning
            || Worker.limitWarningMessage.startsWith('⚠️ 已封鎖')
            || Worker.limitWarningMessage.startsWith('⚠️ Meta')
        ) {
            Worker.setLimitWarning('');
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

        let db = new Set(Storage.getBlockDB());
        if (!isUnblock && db.has(targetUser)) {
            Worker.stats.skipped++;
            Worker.saveStats();
            Worker.updateStatus('running', `略過: ${targetUser}`, 0, currentTotal);
            queue.shift();
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
            Worker.recordSafetyDiagnostic('queue_advance', 'success', MoreLocator.routeType(), {
                skipped: 0,
            });
            setTimeout(Worker.runStep, 100);
            return;
        }

        const onTargetPage = new RegExp(`^/@${targetUser.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\/|$)`).test(location.pathname);
        if (!onTargetPage) {
            Worker.recordSafetyDiagnostic('navigation_check', 'success', MoreLocator.routeType());
            const navigationStartedAt = Date.now();
            Worker.updateStatus('running', `${isUnblock ? '解鎖前往' : '前往'}: ${targetUser}`, 0, currentTotal, { accountNavigationStartedAt: navigationStartedAt });
            await Utils.speedSleep(500 + Math.random() * 300);
            const useReplies = Storage.get(CONFIG.KEYS.POST_FALLBACK) !== 'false';
            const navPath = useReplies ? `/@${targetUser}/replies` : `/@${targetUser}`;
            history.replaceState(null, '', `${navPath}?hege_bg=true`);
            location.reload();
        } else {
            const previousStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const navigationStartedAt = Number(previousStatus?.accountNavigationStartedAt);
            Worker._accountNavigationStartedAt = Number.isFinite(navigationStartedAt) && navigationStartedAt > 0
                ? Math.floor(navigationStartedAt)
                : null;
            Worker.updateStatus('running', `${isUnblock ? '解除封鎖中' : '封鎖中'}: ${targetUser}`, 0, currentTotal);
            const result = await Worker.autoBlock(targetUser, isUnblock);
            Storage.recordBlock();

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

                Worker.recordSafetyDiagnostic('queue_advance', 'success', MoreLocator.routeType(), {
                    moreCandidates: 0,
                    menuItems: 0,
                    confirmButtons: 0,
                    postFallbackAttempts: 0,
                });

                if (isUnblock) {
                    Storage.removeFromBlockDB(targetUser);
                } else {
                    Storage.addToBlockDBFromContext(targetUser);
                }
                // 失敗紀錄只在「這次真的成功」時才移除。重試流程不再事先清空整份
                // 失敗清單，否則重試沒跑起來或中途停掉，名單就憑空消失（BUGLIST #12）。
                Core.removeFailure(targetUser, 'block');

                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
            } else if (result === 'failed') {
                Worker.consecutiveRateLimits = 0;
                Worker.recordSafetyDiagnostic('queue_advance', 'failed', MoreLocator.routeType());
                Worker.stats.failed++;
                Worker.saveStats();
                // Remove from active queue
                let q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (q.length > 0 && q[0] === rawTarget) {
                    q.shift();
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, q);
                }

                // Add to failed queue (DO NOT add to history DB)
                Core.recordFailure('block', targetUser, 'action_failed');

                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
            } else if (['menu_not_found', 'missing_profile_root', 'navigation_mismatch', 'private_manual_required'].includes(result)) {
                // These are actionable per-user outcomes, not platform rate limits.
                Worker.consecutiveRateLimits = 0;
                Worker.stats.failed++;
                Worker.saveStats();
                let q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (q.length > 0 && q[0] === rawTarget) {
                    q.shift();
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, q);
                }
                Core.recordFailure('block', targetUser, result);
                Worker.recordSafetyDiagnostic('queue_advance', result, MoreLocator.routeType());
                Worker.updateStatus('running', `${targetUser}: ${result}`, 0, currentTotal);
                await Utils.safeSleep(300);
                setTimeout(Worker.runStep, 100);
            } else if (result === 'vanished') {
                Worker.consecutiveRateLimits = 0;
                Worker.recordSafetyDiagnostic('queue_advance', 'vanished', MoreLocator.routeType());
                Worker.stats.vanished++;
                Worker.saveStats();
                // Remove from active queue
                let q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                if (q.length > 0 && q[0] === rawTarget) {
                    q.shift();
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, q);
                }

                // Remove from database since user is gone
                if (Storage.getBlockDB().includes(targetUser)) {
                    Storage.removeFromBlockDB(targetUser);
                    window.hegeLog(`[清理] @${targetUser} 已從資料庫移除 (404/失效)`);
                }

                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
            } else if (result === 'rate_limited') {
                Worker.recordSafetyDiagnostic('queue_advance', 'rate_limited', MoreLocator.routeType());
                Worker.consecutiveRateLimits++;
                Worker.saveStats();

                if (Worker.consecutiveRateLimits < 3) {
                    Worker.recordSafetyDiagnostic('retry', 'retry', MoreLocator.routeType(), {}, { retryCount: Worker.consecutiveRateLimits }, { operationId: Worker._diagnosticOperationId });
                }
                const menuLimitWarning = Worker.consecutiveRateLimits >= 3
                    ? `⚠️ 偵測到疑似平台限制，已連續 ${Worker.consecutiveRateLimits} 次失敗，建議手動暫停`
                    : `⚠️ 偵測到選單異常，第 ${Worker.consecutiveRateLimits} 次，已跳過此筆並繼續`;
                await Worker.markTargetFailedAndContinue(
                    rawTarget,
                    targetUser,
                    currentTotal,
                    menuLimitWarning,
                    3000,
                    'rate_limited'
                );
                return;
            } else if (result === 'cooldown') {
                Worker.recordSafetyDiagnostic('queue_advance', 'cooldown', MoreLocator.routeType());
                // Explicit Threads restriction signals share the same three-strike
                // counter; a single warning must not create a false cooldown.
                // 自動冷卻已停用，triggerCooldown 只保留在下方供日後重新接回。
                Worker.consecutiveRateLimits++;
                Worker.saveStats();
                const explicitRestrictionThresholdReached = Worker.consecutiveRateLimits >= 3;
                if (explicitRestrictionThresholdReached) {
                    Worker.recordSafetyDiagnostic('breaker', 'breaker_open', MoreLocator.routeType(), {}, { retryCount: Worker.consecutiveRateLimits }, { operationId: Worker._diagnosticOperationId });
                }
                const explicitLimitWarning = explicitRestrictionThresholdReached
                    ? `⚠️ 偵測到疑似平台限制，已連續 ${Worker.consecutiveRateLimits} 次失敗，建議手動暫停`
                    : `⚠️ 偵測到限制訊號，第 ${Worker.consecutiveRateLimits} 次，已跳過此筆並繼續`;
                await Worker.markTargetFailedAndContinue(
                    rawTarget,
                    targetUser,
                    currentTotal,
                    explicitLimitWarning,
                    3000,
                    'rate_limited'
                );
                return;
            }
        }
        } finally {
            Worker._stepRunning = false;
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

    findMoreButton: async (timeout = 5000, username = '') => await Utils.pollUntil(() => {
        const profileRoot = Core.findProfileRoot?.(username);
        if (!profileRoot) return null;
        const button = MoreLocator.find(profileRoot, { mode: 'profile', trustedRoot: true });
        if (button && window.hegeLog) {
            window.hegeLog(`[DIAG] 共用 More locator 命中 profile (${MoreLocator.explicitAriaLabel(button) ? 'aria' : 'shape'})`);
        }
        return button;
    }, timeout, 200),

    findPostMoreButtons: (user) => {
        const escaped = String(user || '').replace(/["'\\]/g, '\\$&');
        const postLinks = document.querySelectorAll(`a[href*="/@${escaped}/post/"]`);
        const results = [];
        for (const link of postLinks) {
            const container = link.closest('article, [role="article"], [data-pressable-container], [role="listitem"]') || link.parentElement;
            const btn = MoreLocator.find(container, { mode: 'post' });
            if (btn) results.push({ btn, link });
        }
        return results;
    },

    verifyBlock: async (user, isUnblockTask = false) => {
        // Page has been reloaded — check if "Unblock" appears in menu (= block succeeded)
        try {
            // 智慧等待頁面載入
            const verifyPageLoaded = await Utils.pollUntil(() => {
                return document.querySelector(CONFIG.SELECTORS.MORE_SVG);
            }, 2500);
            if (!verifyPageLoaded) await Utils.safeSleep(1000);

            // Find "More" button again (智慧等待)
            let profileBtn = await Worker.findMoreButton(5000, user);

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
                    const postBtns = Worker.findPostMoreButtons(user);
                    for (const { btn: postMoreBtn } of postBtns) {
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

    // 2026-08-03 依使用者決定停用自動觸發，保留實作以便日後重新啟用。
    // 唯一啟用方式是重新接回呼叫點。
    triggerCooldown: async () => {
        window.hegeLog('[冷卻] 觸發 12 小時冷卻保護！正在回滾 session...');

        // 1. Remove all session users from DB
        let db = new Set(Storage.getBlockDB());
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
        window.hegeLog(`[冷卻] 失敗清單 ${failedQueue.length} 筆、未處理 ${remainingQueue.length} 筆、回滾 ${rollbackUsers.length} 筆已併入冷卻備份`);

        // 4. Set cooldown timestamp (12 hours)
        const cooldownUntil = Date.now() + (12 * 60 * 60 * 1000);
        Storage.set(CONFIG.KEYS.COOLDOWN, cooldownUntil.toString());

        // 5. Clear operational queues (all data now safely in COOLDOWN_QUEUE)
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        Worker.clearStats();

        // 6. Update UI and navigate back
        Worker.updateStatus('error', `⛔ 偵測到系統限制，已啟動 12 小時冷卻保護\n已備份 ${fullCooldownQueue.length} 筆，冷卻結束後可重試`);
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
            const statusEl = document.getElementById('bg-status');
            if (statusEl) statusEl.textContent = `${user}: ${msg}`;
            const progressText = document.getElementById('hege-progress-text');
            if (progressText) progressText.textContent = msg;
            if (window.hegeLog) window.hegeLog(msg);
        }

        function checkForError() {
            const errorPhrases = ['稍後再試', 'Try again later', '為了保護', 'protect our community', '受到限制', 'restrict certain activity'];
            const dialogs = document.querySelectorAll('div[role="dialog"], [role="alert"]');
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

        const diagnosticStartedAt = Date.now();
        const navigationStartedAt = Number(Worker._accountNavigationStartedAt);
        Worker._accountNavigationStartedAt = null;
        const accountStartedAt = Number.isFinite(navigationStartedAt) && navigationStartedAt > 0
            ? Math.floor(navigationStartedAt)
            : diagnosticStartedAt;
        let rootAppearedAt = null;
        let menuOpenedAt = null;
        let actionSentAt = null;
        let confirmationCompletedAt = null;
        let moreCandidates = 0;
        let menuItems = 0;
        let confirmButtons = 0;
        let postFallbackAttempts = 0;
        let diagnosticRetryCount = 0;
        let rootSeenThenMissing = false;
        let profileRootObservation = {};
        let moreButtonFields = {};
        let menuElementBeforeRetry = null;
        let menuElementAfterRetry = null;
        let sameMenuElement = false;
        let clickRetried = false;
        const getMenuElement = () => document.querySelector('[role="menu"]')
            || document.querySelector('div[role="menuitem"]')?.closest?.('[role="menu"]')
            || document.querySelector('div[role="menuitem"]')
            || null;
        const getMenuObservation = () => {
            const menuRoot = document.querySelector('[role="menu"]');
            const nodes = menuRoot
                ? Array.from(menuRoot.querySelectorAll('div[role="menuitem"], div[role="button"]'))
                : Array.from(document.querySelectorAll('div[role="menuitem"]'));
            let recognizedMenuItemCount = 0;
            let knownReportItemCount = 0;
            let knownFollowItemCount = 0;
            let knownCopyLinkItemCount = 0;
            for (const node of nodes) {
                const text = node.innerText || node.textContent || '';
                const reportItem = /檢舉|举报|Report/i.test(text);
                const followItem = /取消追蹤|解除追蹤|Unfollow|Following|追蹤中/i.test(text);
                const copyLinkItem = /複製連結|复制链接|Copy link|Copy URL/i.test(text);
                if (reportItem) knownReportItemCount++;
                if (followItem) knownFollowItemCount++;
                if (copyLinkItem) knownCopyLinkItemCount++;
                if (reportItem || followItem || copyLinkItem || Utils.isBlockText(text) || Utils.isUnblockText(text)) {
                    recognizedMenuItemCount++;
                }
            }
            const currentMenuElement = getMenuElement();
            if (clickRetried && !menuElementAfterRetry && currentMenuElement) {
                menuElementAfterRetry = currentMenuElement;
                sameMenuElement = !!menuElementBeforeRetry && menuElementBeforeRetry === menuElementAfterRetry;
            }
            return {
                recognizedMenuItemCount,
                knownReportItemCount,
                knownFollowItemCount,
                knownCopyLinkItemCount,
                sameMenuElement,
            };
        };
        const recordDiagnostic = (phase, result, extra = {}, fields = {}) => Worker.recordSafetyDiagnostic(
            phase,
            result,
            MoreLocator.routeType(),
            {
                moreCandidates,
                menuItems,
                confirmButtons,
                postFallbackAttempts,
                ...extra,
            },
            {
                elapsedMs: Math.max(0, Date.now() - diagnosticStartedAt),
                retryCount: diagnosticRetryCount,
            },
            { fields },
        );

        try {
            setStep('載入中...');
            // 舊條件是「頁面上有 MORE_SVG 或任何 div[role=button]」。SPA 換頁時前一頁
            // 的 DOM 還在，這個條件在毫秒內就成立，等於根本沒等到本人的個人頁就往下
            // 走，findProfileRoot 因此回 null，失敗會被誤標成選單問題。實機診斷顯示失敗
            // 全部發生在 dequeue 後 1–8ms，且都停在 root_resolve，從沒走到「更多」按鈕。
            // 改成等到「這個 user 的 profile root 真的出現」才繼續，才是 fail-closed。
            const profileWaitStartedAt = Date.now();
            let profileRoot = null;
            await Utils.pollUntil(() => {
                if (checkFor404()) return true;
                const nextRoot = Core.findProfileRoot?.(user) || null;
                if (profileRoot && !nextRoot) rootSeenThenMissing = true;
                profileRoot = nextRoot;
                if (profileRoot && rootAppearedAt === null) rootAppearedAt = Date.now();
                return !!profileRoot;
            }, PROFILE_ROOT_WAIT_MS);

            if (checkFor404()) {
                recordDiagnostic('root_resolve', 'vanished');
                setStep('跳過: 連結失效 (404)');
                return 'vanished';
            }

            // pollUntil 逾時後再取一次，避免最後一輪與逾時之間的空窗。
            if (!profileRoot) profileRoot = Core.findProfileRoot?.(user) || null;
            if (profileRoot && rootAppearedAt === null) rootAppearedAt = Date.now();
            profileRootObservation = Core.getProfileRootObservation?.(user) || {};
            if (!profileRoot) {
                recordDiagnostic('root_resolve', 'missing_profile_root', {}, {
                    waitMs: Date.now() - profileWaitStartedAt,
                    viewportWidth: window.innerWidth,
                    viewportHeight: window.innerHeight,
                    relaxedRoot: false,
                    ...profileRootObservation,
                    rootSeenThenMissing,
                    invalidProfilePage: checkFor404(),
                    restrictionSignal: checkForError(),
                });
                return 'missing_profile_root';
            }
            const resolvedRootMode = Core._lastProfileRootMode;
            const liveRoot = Core.findProfileRoot?.(user) || null;
            if (profileRoot && !liveRoot) rootSeenThenMissing = true;
            recordDiagnostic('root_resolve', 'success', {}, {
                waitMs: Date.now() - profileWaitStartedAt,
                relaxedRoot: resolvedRootMode === 'relaxed',
                ...profileRootObservation,
                strictRootMatched: resolvedRootMode === 'strict',
                rootSeenThenMissing,
            });
            const privateState = MoreLocator.detectPrivateProfileState(profileRoot);

            let blockBtn = null;
            let postFallbackUsed = false;
            const routeBeforeMore = MoreLocator.routeType();
            {
                // 1. Wait for "More" button (智慧等待)
                let profileBtn = await Worker.findMoreButton(12000, user);
                moreCandidates = Math.min(document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG).length, ReportDebugContext.MAX_COUNT);

                if (!profileBtn) {
                    const missingMoreResult = privateState.private ? 'private_manual_required' : 'menu_not_found';
                    recordDiagnostic('more_resolve', missingMoreResult);
                    // Diagnostic dump: collect all SVG info on page
                    const allSvgs = document.querySelectorAll('svg[aria-label]');
                    const svgLabels = Array.from(allSvgs).map(s => s.getAttribute('aria-label'));
                    const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
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
                    if (privateState.private) setStep('需要手動處理：私人帳號');
                    return missingMoreResult;
                }
                const ownLabel = profileBtn.getAttribute?.('aria-label') || '';
                const nestedLabel = profileBtn.querySelector?.('svg[aria-label]')?.getAttribute('aria-label') || '';
                moreButtonFields = {
                    ownAriaLabel: !!ownLabel,
                    nestedAriaLabel: !!nestedLabel,
                    svgCount: profileBtn.querySelectorAll?.('svg').length ?? 0,
                };
                recordDiagnostic('more_resolve', 'success', {}, moreButtonFields);

                setStep('開啟選單...');
                await Worker.blockVisualStep(user, '準備點「更多」', profileBtn, 420);
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
                    // #11 取證：只記錄，不改行為。要分辨「點到的是 ⋯ 本身」還是
                    // 「點到包住 ⋯ 的外層容器」，光看座標與父層文案分不出來。
                    const identity = [
                        `tag=${profileBtn.tagName}`,
                        `role=${profileBtn.getAttribute?.('role') || '-'}`,
                        `tabindex=${profileBtn.getAttribute?.('tabindex') ?? '-'}`,
                        `ownLabel=${ownLabel || '-'}`,
                        `nestedLabel=${nestedLabel || '-'}`,
                        `size=${Math.round(rect.width)}x${Math.round(rect.height)}`,
                        `svgCount=${profileBtn.querySelectorAll?.('svg').length ?? 0}`,
                        `viewport=${window.innerWidth}x${window.innerHeight}`,
                    ].join(' ');
                    window.hegeLog(`[DIAG] 準備點擊按鈕 x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, 父層文案=${parentText}`);
                    window.hegeLog(`[DIAG] 更多按鈕本體 ${identity}`);
                    // 同一份觀測寫進診斷資料，這樣小視窗下不必從 log 面板手抄。
                    recordDiagnostic('more_resolve', 'success', {}, {
                        tag: profileBtn.tagName,
                        role: profileBtn.getAttribute?.('role') || '',
                        ownAriaLabel: !!ownLabel,
                        nestedAriaLabel: !!nestedLabel,
                        svgCount: profileBtn.querySelectorAll?.('svg').length ?? 0,
                        rectTop: rect.top,
                        rectLeft: rect.left,
                        rectWidth: rect.width,
                        rectHeight: rect.height,
                        viewportWidth: window.innerWidth,
                        viewportHeight: window.innerHeight,
                    });
                }
                await Utils.speedSleep(300);
                profileBtn.scrollIntoView({ block: 'center', inline: 'center' });
                await Utils.safeSleep(200); // scroll animation settle — not speed-adjusted
                Utils.simClick(profileBtn);
                await Utils.safeSleep(60);
                if (!MoreLocator.routeMatches(routeBeforeMore, MoreLocator.routeType(), 'profile')) {
                    recordDiagnostic('navigation_check', 'navigation_mismatch');
                    setStep('導航不符，安全跳過');
                    return 'navigation_mismatch';
                }
                recordDiagnostic('navigation_check', 'success');

                // 2. Wait for Menu (智慧等待 + retry click)
                const menuStartTime = Date.now();

                const menuResult = await Utils.pollUntil(() => {
                    // After 3s with no menuitem, retry the click once
                    if (!clickRetried && Date.now() - menuStartTime > 3000) {
                        const testMenu = document.querySelectorAll('div[role="menuitem"]');
                        if (testMenu.length === 0) {
                            clickRetried = true;
                            diagnosticRetryCount++;
                            menuElementBeforeRetry = getMenuElement();
                            // #11 取證：分辨「完全沒有任何浮層」與「浮層開了但不是我們要的選單」。
                            const menuItemCount = document.querySelectorAll('div[role="menuitem"]').length;
                            const menuCount = document.querySelectorAll('[role="menu"]').length;
                            const dialogCount = document.querySelectorAll('div[role="dialog"]').length;
                            const overlayCount = document.querySelectorAll('div[data-overlay-container="true"]').length;
                            if (window.hegeLog) {
                                window.hegeLog(`[DIAG] 選單未開啟，重試 simClick...`);
                                window.hegeLog(`[DIAG] 重試前浮層盤點 menuitem=${menuItemCount} menu=${menuCount} dialog=${dialogCount} overlay=${overlayCount}`);
                            }
                            recordDiagnostic('retry', 'retry', {}, {
                                menuItems: menuItemCount,
                                menuCount,
                                dialogCount,
                                overlayCount,
                                ...getMenuObservation(),
                                ...moreButtonFields,
                            });
                            Utils.simClick(profileBtn);
                        }
                    }

                    const menuNodes = document.querySelectorAll('div[role="menuitem"], div[role="button"]');
                    menuItems = Math.min(menuNodes.length, ReportDebugContext.MAX_COUNT);
                    for (let item of menuNodes) {
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
                    if (menuOpenedAt === null) menuOpenedAt = Date.now();
                    if (menuResult.action === 'already_unblocked') { recordDiagnostic('menu_resolve', 'already_unblocked'); setStep('已解鎖 (略過)'); return 'already_unblocked'; }
                    if (menuResult.action === 'already_blocked') { recordDiagnostic('menu_resolve', 'already_blocked'); setStep('已封鎖 (略過)'); return 'already_blocked'; }
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
                                recordDiagnostic('menu_resolve', 'already_blocked');
                                setStep('已封鎖 (略過)');
                                return 'already_blocked';
                            }
                        }
                    }

                    // === Post-Level Fallback（僅在 /replies 頁面時就地執行，不需跳轉）===
                    const onRepliesPage = window.location.pathname.includes('/replies');
                    if (onRepliesPage) {
                        setStep('Profile 選單無效，嘗試貼文備案...');
                        // #11 取證：選單到底開出了什麼。空清單代表根本沒開。
                        const seenTexts = Array.from(document.querySelectorAll('div[role="menuitem"]'))
                            .map(el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20))
                            .filter(Boolean);
                        if (window.hegeLog) {
                            window.hegeLog(`[DIAG] Profile 選單無封鎖鈕，就地搜尋貼文 More`);
                            window.hegeLog(`[DIAG] Profile 選單實際內容 menuitem=${seenTexts.length} 內容=[${seenTexts.join(' / ')}]`);
                        }
                        // 診斷資料只留數量與「有沒有封鎖字樣」，選單文字不進診斷（可能含帳號名）。
                        recordDiagnostic('menu_resolve', 'menu_not_found', {}, {
                            menuItems: seenTexts.length,
                            menuCount: document.querySelectorAll('[role="menu"]').length,
                            dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                            blockTextPresent: seenTexts.some(t => Utils.isBlockText(t)),
                            ...getMenuObservation(),
                            ...moreButtonFields,
                        });

                        // 關閉 Profile 選單
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                        await Utils.speedSleep(300);

                        const postBtns = Worker.findPostMoreButtons(user);
                        if (window.hegeLog) window.hegeLog(`[DIAG] 在 replies 頁找到 ${postBtns.length} 篇貼文連結`);

                        for (const { btn: postMoreBtn, link } of postBtns) {
                            postFallbackAttempts++;
                            if (window.hegeLog) window.hegeLog(`[DIAG] 嘗試貼文「更多」按鈕: ${link.getAttribute('href')}`);

                            // 點擊 Post 層的三個點
                            await Worker.blockVisualStep(user, '貼文備案：準備點「更多」', postMoreBtn, 420);
                            postMoreBtn.scrollIntoView({ block: 'center' });
                            await Utils.safeSleep(200); // scroll settle
                            Utils.simClick(postMoreBtn);
                            await Utils.safeSleep(60);
                            if (!MoreLocator.routeMatches(routeBeforeMore, MoreLocator.routeType(), 'profile')) {
                                recordDiagnostic('navigation_check', 'navigation_mismatch');
                                setStep('導航不符，安全跳過');
                                return 'navigation_mismatch';
                            }

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
                                if (menuOpenedAt === null) menuOpenedAt = Date.now();
                                if (postMenuResult.action === 'already_blocked') { recordDiagnostic('menu_resolve', 'already_blocked'); setStep('已封鎖 (略過)'); return 'already_blocked'; }
                                if (postMenuResult.action === 'found') { blockBtn = postMenuResult.btn; }
                            }

                            if (blockBtn) {
                                postFallbackUsed = true;
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
                        const missingActionResult = checkForError()
                            ? 'cooldown'
                            : privateState.private ? 'private_manual_required' : 'menu_not_found';
                        const allMenuItems = document.querySelectorAll('div[role="menuitem"]');
                        recordDiagnostic('menu_resolve', missingActionResult, {}, {
                            ...getMenuObservation(),
                            ...moreButtonFields,
                            menuItems: allMenuItems.length,
                            menuCount: document.querySelectorAll('[role="menu"]').length,
                            dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                            blockTextPresent: Array.from(allMenuItems).some(item => Utils.isBlockText(item.innerText || item.textContent || '')),
                        });
                        // 全部失敗 — 診斷 dump；沒有明確限制訊息就 fail closed
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
                        if (checkForError()) {
                            setStep('偵測到 Threads 限制訊息');
                            return 'cooldown';
                        }
                        if (privateState.private) {
                            setStep('需要手動處理：私人帳號');
                            return 'private_manual_required';
                        }
                        setStep('找不到可信選單');
                        return 'menu_not_found';
                    }
                }
            }

            menuItems = Math.min(document.querySelectorAll('div[role="menuitem"], div[role="button"]').length, ReportDebugContext.MAX_COUNT);
            recordDiagnostic('menu_resolve', 'success', {}, {
                ...getMenuObservation(),
                ...moreButtonFields,
            });
            recordDiagnostic('action_resolve', 'success');
            setStep(isUnblock ? '點擊解除封鎖...' : '點擊封鎖...');
            await Worker.blockVisualStep(user, isUnblock ? '準備點「解除封鎖」' : '準備點「封鎖」', blockBtn, 420);
            await Utils.speedSleep(500);
            Core.ThreeNoWatch?.appendNetworkActionMarker?.(isUnblock ? 'unblock_menu_click' : 'block_menu_click', {
                user,
                phase: 'before_click',
                fallbackUsed: postFallbackUsed,
            });
            actionSentAt = Date.now();
            Utils.simClick(blockBtn);

            // 3. Wait for Confirmation Dialog (智慧等待)
            let confirmBtn = await Utils.pollUntil(() => {
                const dialogs = document.querySelectorAll('div[role="dialog"]');
                for (let dialog of dialogs) {
                    const btns = dialog.querySelectorAll('div[role="button"], button');
                    confirmButtons = Math.min(confirmButtons + btns.length, ReportDebugContext.MAX_COUNT);
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
                    confirmationCompletedAt = Date.now();
                    recordDiagnostic('confirm_resolve', 'success');
                    if (window.hegeLog) window.hegeLog(`[DIAG] @${user} 無確認 dialog 但偵測到已${isUnblock ? '解鎖' : '封鎖'}，視為成功`);
                    setStep(isUnblock ? '✅ 已解除封鎖 (直接)' : '✅ 已封鎖 (直接)');
                    Core.ThreeNoWatch?.appendNetworkActionMarker?.(isUnblock ? 'unblock_success_direct' : 'block_success_direct', {
                        user,
                        phase: 'detected_after_menu_click',
                        fallbackUsed: postFallbackUsed,
                    });
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
                const missingConfirmResult = privateState.private ? 'private_manual_required' : 'failed';
                setStep(privateState.private ? '需要手動處理：私人帳號' : '找不到確認');
                recordDiagnostic('confirm_resolve', missingConfirmResult);
                return missingConfirmResult;
            }

            recordDiagnostic('confirm_resolve', 'success');
            setStep(isUnblock ? '確認解除封鎖...' : '確認封鎖...');
            await Worker.blockVisualStep(user, isUnblock ? '準備點「確認解除封鎖」' : '準備點「確認封鎖」', confirmBtn, 420);
            await Utils.safeSleep(200); // confirm button React handler settle — not speed-adjusted
            Core.ThreeNoWatch?.appendNetworkActionMarker?.(isUnblock ? 'unblock_confirm_click' : 'block_confirm_click', {
                user,
                phase: 'before_click',
                fallbackUsed: postFallbackUsed,
            });
            Utils.simClick(confirmBtn);

            // 4. Wait for confirmation dialog to close (智慧等待)
            const closeResult = await Utils.pollUntil(() => {
                const dialogs = document.querySelectorAll('div[role="dialog"]');
                if (dialogs.length === 0) return 'success';
                if (checkForError()) return 'cooldown';
                return null;
            }, 5000, 150);

            if (closeResult === 'success') {
                confirmationCompletedAt = Date.now();
                recordDiagnostic('confirm_resolve', 'success');
                setStep(isUnblock ? '✅ 已解除封鎖' : '✅ 已封鎖');
                Core.ThreeNoWatch?.appendNetworkActionMarker?.(isUnblock ? 'unblock_success' : 'block_success', {
                    user,
                    phase: 'dialog_closed',
                    fallbackUsed: postFallbackUsed,
                });
                return 'success';
            }
            if (closeResult === 'cooldown') {
                recordDiagnostic('confirm_resolve', 'cooldown');
                return 'cooldown';
            }

            // Dialog 超時未關閉 — 再次檢查是否為限流
            if (checkForError()) {
                if (window.hegeLog) window.hegeLog(`[DIAG] @${user} dialog 超時且偵測到限流`);
                recordDiagnostic('confirm_resolve', 'cooldown');
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
                confirmationCompletedAt = Date.now();
                recordDiagnostic('confirm_resolve', 'success');
                setStep(isUnblock ? '✅ 已解除封鎖 (超時)' : '✅ 已封鎖 (超時)');
                return 'success';
            }

            const timeoutResult = privateState.private ? 'private_manual_required' : 'failed';
            setStep(privateState.private ? '需要手動處理：私人帳號' : '超時未確認');
            recordDiagnostic('confirm_resolve', timeoutResult);
            return timeoutResult;
        } catch (e) {
            console.error('autoBlock error:', e);
            recordDiagnostic('action_resolve', 'failed');
            return 'failed';
        } finally {
            const timing = buildAccountTimingFields({
                accountStartedAt,
                navigationStartedAt: Number.isFinite(navigationStartedAt) && navigationStartedAt > 0
                    ? navigationStartedAt
                    : accountStartedAt,
                rootAppearedAt,
                menuOpenedAt,
                actionSentAt,
                confirmationCompletedAt,
                accountEndedAt: Date.now(),
            });
            RuntimeDiagnostics.recordAccountTiming('blocking', timing);
        }
    }
};
