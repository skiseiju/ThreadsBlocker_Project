import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Storage } from './storage.js';
import { Core } from './core.js';

export const Worker = {
    stats: { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: 0 },
    initialTotal: 0,
    sessionQueue: [],          // 本次 session 完整名單快照
    verifyLevel: 0,            // 0=每5次, 1=每3次, 2=每次
    verifyCount: 0,            // 自上次驗證以來的計數
    consecutiveRateLimits: 0,
    consecutiveFails: 0,       // Level 2 連續失敗計數
    limitWarningMessage: '',
    _stepRunning: false,       // mutex: prevent concurrent runStep chains
    _workerVisualStorageListenerBound: false,

    saveStats: () => {
        Storage.setJSON(CONFIG.KEYS.WORKER_STATS, {
            stats: Worker.stats,
            initialTotal: Worker.initialTotal,
            sessionQueue: Worker.sessionQueue,
            verifyLevel: Worker.verifyLevel,
            verifyCount: Worker.verifyCount,
            consecutiveFails: Worker.consecutiveFails,
            consecutiveRateLimits: Worker.consecutiveRateLimits,
            limitWarningMessage: Worker.limitWarningMessage
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
            Worker.limitWarningMessage = saved.limitWarningMessage || '';
        } else {
            Worker.stats = { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: Date.now() };
            Worker.initialTotal = 0;
            Worker.sessionQueue = [];
            Worker.verifyLevel = 0;
            Worker.verifyCount = 0;
            Worker.consecutiveFails = 0;
            Worker.consecutiveRateLimits = 0;
            Worker.limitWarningMessage = '';
        }
    },

    clearStats: () => {
        Worker.limitWarningMessage = '';
        Storage.remove(CONFIG.KEYS.WORKER_STATS);
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

    markTargetFailedAndContinue: async (rawTarget, targetUser, currentTotal, logMessage = '', sleepMs = 3000) => {
        if (logMessage && window.hegeLog) window.hegeLog(logMessage);
        Worker.stats.failed++;
        Worker.saveStats();

        const queue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        if (queue.length > 0 && queue[0] === rawTarget) {
            queue.shift();
            Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
        }

        Storage.queueAddUnique(CONFIG.KEYS.FAILED_QUEUE, targetUser);
        Worker.updateStatus('running', targetUser, 0, currentTotal);
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
            Storage.queueRemove(CONFIG.KEYS.REPORT_FAILED_QUEUE, target);
        },
        onSkipped: (user, reason) => {
            const target = user || reportUser;
            Worker.bumpReportStat('skipped', target, reason);
            Storage.queueAddUnique(CONFIG.KEYS.REPORT_FAILED_QUEUE, target);
        },
    }),

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
                const logs = Storage.getJSON(CONFIG.KEYS.DEBUG_LOG, []);
                logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
                if (logs.length > 100) logs.splice(0, logs.length - 100);
                Storage.setJSON(CONFIG.KEYS.DEBUG_LOG, logs);
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
        Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
        if (keepBlockSelection && batchUsers.length > 0) {
            Storage.setJSON(CONFIG.KEYS.REPORT_RESTORE_PENDING, { users: batchUsers, updatedAt: Date.now(), source: 'stop' });
            if (Core.restorePendingUsers) Core.restorePendingUsers(batchUsers);
        }
        if (window.hegeLog) {
            window.hegeLog(`[只檢舉] 中斷回填 batch=${batchUsers.length} keepBlockSelection=${keepBlockSelection}`);
        }
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
                Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
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

    updateStatus: (state, current = '', progress = 0, total = 0) => {
        const s = { state, current, progress, total, lastUpdate: Date.now() };
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, s);

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
                const visualInfo = Worker.getVisualModeInfo();
                progressText.textContent = visualInfo.visualEnabled
                    ? '可視化開啟：逐步標示點擊目標'
                    : '可視化關閉：安靜執行，不標示點擊目標';
                progressText.style.fontSize = '11px';
                progressText.style.color = '#aaa';
                progressText.style.fontWeight = '400';
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

    setLimitWarning: (message = '') => {
        Worker.limitWarningMessage = message || '';
        if (window.hegeLog && Worker.limitWarningMessage) {
            window.hegeLog(`[上限提醒] ${Worker.limitWarningMessage}`);
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
                if (!isUnblock && Storage.getJSON(CONFIG.KEYS.DB_KEY, []).includes(user)) {
                    Storage.removeFromBlockDB(user);
                    Storage.queueAddUnique(CONFIG.KEYS.FAILED_QUEUE, user);
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
        Worker._stepRunning = true;
        try {
        if (Storage.get(CONFIG.KEYS.BG_CMD) === 'stop') {
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
                            if (Storage.isCooldownProtectionEnabled()) {
                                await Worker.triggerCooldown();
                            } else {
                                await Worker.markTargetFailedAndContinue(
                                    verifyPending,
                                    targetUser,
                                    currentTotal,
                                    `[冷卻保護] 驗證連續失敗達 ${Worker.consecutiveFails} 次，但自動冷卻保護已關閉；改記錄失敗並繼續`,
                                    3000
                                );
                            }
                            return;
                        }
                    }
                    Worker.stats.failed++;
                    Worker.saveStats();
                    if (queue.length > 0 && queue[0] === verifyPending) {
                        queue.shift();
                        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, queue);
                    }
                    Storage.queueAddUnique(CONFIG.KEYS.FAILED_QUEUE, targetUser);
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
                Worker.ensureReportStats(reportQueue.length);
                const handled = await Core.ReportDriver.processNext(Worker.getReportDriverOptions(reportUser, reportContext));
                if (handled) return;
                return;
            }

            Worker.updateStatus('idle', '✅ 檢舉全部完成！', 0, 0);
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
            Worker.clearStats();
            Storage.remove(CONFIG.KEYS.WORKER_MODE);
            const stopBtn = document.getElementById('hege-worker-stop');
            if (stopBtn) stopBtn.style.display = 'none';
            Worker.navigateBack();
            return;
        }

        if (!Storage.isUnderLimit()) {
            const limit = Storage.getDailyBlockLimit();
            const done = Storage.getBlocksLast24h();
            Worker.setLimitWarning(`⚠️ Meta 上限提醒 ${done}/${limit}，仍繼續執行`);
        } else if (Worker.limitWarningMessage.startsWith('⚠️ Meta 上限提醒')) {
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

                if (isUnblock) {
                    Storage.removeFromBlockDB(targetUser);
                } else {
                    Storage.addToBlockDBFromContext(targetUser);
                }

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
                Storage.queueAddUnique(CONFIG.KEYS.FAILED_QUEUE, targetUser);

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
                if (Storage.getJSON(CONFIG.KEYS.DB_KEY, []).includes(targetUser)) {
                    Storage.removeFromBlockDB(targetUser);
                    window.hegeLog(`[清理] @${targetUser} 已從資料庫移除 (404/失效)`);
                }

                Worker.updateStatus('running', targetUser, 0, currentTotal);
                setTimeout(Worker.runStep, 100);
            } else if (result === 'rate_limited') {
                Worker.consecutiveRateLimits++;
                Worker.saveStats();

                if (Worker.consecutiveRateLimits >= 3) {
                    if (Storage.isCooldownProtectionEnabled()) {
                        if (window.hegeLog) window.hegeLog(`[⚠️警告] 選單異常達 ${Worker.consecutiveRateLimits} 次，偵測到 Meta 限制操作，強制冷卻`);
                        await Worker.triggerCooldown();
                        Worker.clearStats();
                        return;
                    }
                    await Worker.markTargetFailedAndContinue(
                        rawTarget,
                        targetUser,
                        currentTotal,
                        `[⚠️警告] 選單異常達 ${Worker.consecutiveRateLimits} 次，但自動冷卻保護已關閉；改記錄失敗並繼續`
                    );
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
                    Storage.queueAddUnique(CONFIG.KEYS.FAILED_QUEUE, targetUser);

                    Worker.updateStatus('running', targetUser, 0, currentTotal);
                    await Utils.safeSleep(3000); // extra breather — 不受速度模式影響
                    setTimeout(Worker.runStep, 100);
                }
                return;
            } else if (result === 'cooldown') {
                if (Storage.isCooldownProtectionEnabled()) {
                    await Worker.triggerCooldown();
                    Worker.clearStats();
                    return;
                }
                await Worker.markTargetFailedAndContinue(
                    rawTarget,
                    targetUser,
                    currentTotal,
                    '[冷卻保護] 偵測到頻率限制，但自動冷卻保護已關閉；改記錄失敗並繼續'
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

    findMoreButton: async (timeout = 5000) => {
        return await Utils.pollUntil(() => {
            const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
            for (let svg of moreSvgs) {
                if (svg.querySelector('circle') && svg.querySelectorAll('path').length >= 3) {
                    const btn = svg.closest('div[role="button"]');
                    if (btn) return btn;
                }
            }
            if (moreSvgs.length > 0) return moreSvgs[0].closest('div[role="button"]');
            return null;
        }, timeout, 200);
    },

    findPostMoreButtons: (user) => {
        const postLinks = document.querySelectorAll(`a[href*="/@${CSS.escape(user)}/post/"]`);
        const results = [];
        for (const link of postLinks) {
            let container = link;
            for (let lvl = 0; lvl < 8; lvl++) {
                container = container.parentElement;
                if (!container) break;
                const svg = container.querySelector(CONFIG.SELECTORS.MORE_SVG);
                if (!svg) continue;
                const btn = svg.closest('div[role="button"]');
                if (!btn) continue;
                results.push({ btn, link });
                break;
            }
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
            let profileBtn = await Worker.findMoreButton(5000);

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
            const statusEl = document.getElementById('bg-status');
            if (statusEl) statusEl.textContent = `${user}: ${msg}`;
            const progressText = document.getElementById('hege-progress-text');
            if (progressText) progressText.textContent = msg;
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
                return document.querySelector(CONFIG.SELECTORS.MORE_SVG) ||
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
                let profileBtn = await Worker.findMoreButton(12000);

                if (!profileBtn) {
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
                    return 'failed';
                }

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

                        const postBtns = Worker.findPostMoreButtons(user);
                        if (window.hegeLog) window.hegeLog(`[DIAG] 在 replies 頁找到 ${postBtns.length} 篇貼文連結`);

                        for (const { btn: postMoreBtn, link } of postBtns) {
                            if (window.hegeLog) window.hegeLog(`[DIAG] 嘗試貼文「更多」按鈕: ${link.getAttribute('href')}`);

                            // 點擊 Post 層的三個點
                            await Worker.blockVisualStep(user, '貼文備案：準備點「更多」', postMoreBtn, 420);
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
            await Worker.blockVisualStep(user, isUnblock ? '準備點「解除封鎖」' : '準備點「封鎖」', blockBtn, 420);
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
            await Worker.blockVisualStep(user, isUnblock ? '準備點「確認解除封鎖」' : '準備點「確認封鎖」', confirmBtn, 420);
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
