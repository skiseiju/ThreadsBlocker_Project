import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { UI } from './ui.js';
import { Core } from './core.js';
import { Worker } from './worker.js';

// Side-effect imports: feature files attach methods to Core via Object.assign
// (Build strips imports and concatenates; this matters for direct ESM dev mode)
import './features/post-reservoir-engine.js';
import './features/report-flow.js';
import './features/cockroach.js';

(function () {
    'use strict';

    // (Early-boot interceptor removed to prevent Safari Userscripts crash)
    Utils.initConsoleInterceptor();
    console.log('[留友封] Extension Script Initializing...');

    function migratePostReservoirPhase2() {
        if (Storage.get(CONFIG.KEYS.RESERVOIR_PHASE2_MIGRATED) === 'true') {
            console.log('[留友封] Post Reservoir Phase 2 migration already completed; skipping');
            return;
        }

        const norm = (url) => ((url || '').split('?')[0]);
        const parseQueue = (key) => {
            try {
                return JSON.parse(localStorage.getItem(key) || '[]');
            } catch (e) {
                return [];
            }
        };
        const normalizeStatus = (status, done) => {
            if (done) return 'done';
            if (status === 'error' || status === 'done' || status === 'cooldown') return status;
            return 'pending';
        };
        const mergeEntry = (byUrl, entry, source) => {
            if (!entry || !entry.url) return;
            const key = norm(entry.url);
            if (!key) return;
            const existing = byUrl[key] || {
                url: key,
                label: entry.label || key,
                addedAt: entry.addedAt || Date.now(),
                advanceOnComplete: false,
                longTermLoop: false,
                lastSweptAt: 0,
                sweepCount: 0,
                batchCount: 0,
                totalBlocked: 0,
                status: 'pending',
            };

            existing.label = entry.label || existing.label || key;
            existing.addedAt = Math.min(existing.addedAt || Date.now(), entry.addedAt || Date.now());
            existing.lastSweptAt = Math.max(existing.lastSweptAt || 0, entry.lastSweptAt || 0);
            existing.sweepCount = (existing.sweepCount || 0) + (entry.sweepCount || 0);
            existing.batchCount = (existing.batchCount || 0) + (entry.batchCount || 0);
            existing.totalBlocked = (existing.totalBlocked || 0) + (entry.totalBlocked || 0);

            if (source === 'post') {
                const alreadyCanonical = Object.prototype.hasOwnProperty.call(entry, 'advanceOnComplete')
                    || Object.prototype.hasOwnProperty.call(entry, 'longTermLoop');
                existing.longTermLoop = alreadyCanonical ? !!entry.longTermLoop : true;
                existing.advanceOnComplete = alreadyCanonical ? !!entry.advanceOnComplete : !!existing.advanceOnComplete;
                existing.status = normalizeStatus(entry.status, false);
            } else if (source === 'endless') {
                existing.advanceOnComplete = true;
                existing.longTermLoop = !!existing.longTermLoop;
                existing.status = entry.done ? 'done' : normalizeStatus(existing.status, false);
            }

            byUrl[key] = existing;
        };

        const postRaw = localStorage.getItem(CONFIG.KEYS.POST_QUEUE);
        if (localStorage.getItem(CONFIG.KEYS.POST_QUEUE_BACKUP_PHASE2) === null) {
            localStorage.setItem(CONFIG.KEYS.POST_QUEUE_BACKUP_PHASE2, postRaw || '[]');
        }

        const postQueue = parseQueue(CONFIG.KEYS.POST_QUEUE);
        const endlessQueue = parseQueue(CONFIG.KEYS.ENDLESS_POST_QUEUE);
        const byUrl = {};
        postQueue.forEach(entry => mergeEntry(byUrl, entry, 'post'));
        endlessQueue.forEach(entry => mergeEntry(byUrl, entry, 'endless'));

        Storage.setJSON(CONFIG.KEYS.POST_QUEUE, Object.values(byUrl));

        [
            'hege_endless_state',
            'hege_endless_target',
            'hege_endless_last_first_user',
            'hege_auto_triggered_once',
            'hege_post_sweep_lock',
        ].forEach(key => sessionStorage.removeItem(key));
        localStorage.removeItem(CONFIG.KEYS.ENDLESS_WORKER_STANDBY);
        Storage.set(CONFIG.KEYS.RESERVOIR_PHASE2_MIGRATED, 'true');
        console.log('[留友封] Post Reservoir Phase 2 migration complete');
    }

    if (Storage.get(CONFIG.KEYS.VERSION_CHECK) !== CONFIG.VERSION) {
        migratePostReservoirPhase2();

        // DB_KEY 遷移：舊版本使用 "undefined" 作為 key（CONFIG.KEYS.DB_KEY 未定義的 bug）
        const legacyDB = localStorage.getItem('undefined');
        if (legacyDB && !localStorage.getItem(CONFIG.KEYS.DB_KEY)) {
            localStorage.setItem(CONFIG.KEYS.DB_KEY, legacyDB);
            localStorage.removeItem('undefined');
            console.log('[留友封] DB migrated from legacy "undefined" key');
        }

        const legacyDelayedQueue = Storage.getJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
        const legacyBgQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
        const migratedBgQueue = [...new Set([...legacyBgQueue, ...legacyDelayedQueue])];

        // 清除暫存佇列；舊延時水庫併回背景佇列
        Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, migratedBgQueue);
        Storage.setJSON(CONFIG.KEYS.DELAYED_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {});
        Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
        Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
        Storage.setJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, []);
        Storage.remove(CONFIG.KEYS.REPORT_RESTORE_PENDING);

        Storage.remove(CONFIG.KEYS.COOLDOWN_QUEUE);
        Storage.remove(CONFIG.KEYS.COOLDOWN);
        Storage.remove(CONFIG.KEYS.WORKER_STATS);
        Storage.remove(CONFIG.KEYS.WORKER_MODE);
        Storage.remove(CONFIG.KEYS.REPORT_BATCH_PATH);
        Storage.remove(CONFIG.KEYS.REPORT_KEEP_BLOCK_SELECTION);
        Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});

        // 清除歷史遺留 key
        localStorage.removeItem('hege_ios_active');
        localStorage.removeItem('hege_mac_mode');

        // 升版只修復異常狀態，避免把所有 entry 重設成 pending 而誤觸發定點絕
        try {
            const postQ = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
            const knownStatuses = new Set(['pending', 'sweeping', 'cooldown', 'done', 'error']);
            let repaired = 0;
            const resetQ = postQ.map(p => {
                if (!p || typeof p !== 'object') return p;
                const next = { ...p };
                const rawStatus = typeof next.status === 'string' ? next.status : '';

                if (!rawStatus) {
                    next.status = next.done ? 'done' : 'pending';
                    repaired++;
                    return next;
                }

                if (!knownStatuses.has(rawStatus)) {
                    next.status = 'pending';
                    next.done = false;
                    repaired++;
                    return next;
                }

                // 只修復可能卡住的 sweeping；其餘（done/cooldown/error）保留原狀
                if (rawStatus === 'sweeping') {
                    next.status = 'pending';
                    next.done = false;
                    repaired++;
                }

                // 深層清理項目若已有 lastSweptAt，pending 多半是舊版升級時被重置；回正為 done 以避免升版後立刻誤觸發
                if (next.longTermLoop === true && next.status === 'pending' && (next.lastSweptAt || 0) > 0) {
                    next.status = 'done';
                    next.done = true;
                    repaired++;
                }

                return next;
            });
            Storage.setJSON(CONFIG.KEYS.POST_QUEUE, resetQ);
            console.log(`[留友封] POST_QUEUE repair complete: ${repaired}/${resetQ.length} entries adjusted`);
        } catch (e) {
            console.warn('[留友封] POST_QUEUE repair 失敗:', e);
        }

        // 清掉 sweep session 殘留（hege_sweep_*）
        const sweepSessionKeys = [
            'hege_sweep_state', 'hege_sweep_target', 'hege_sweep_last_first_user',
            'hege_sweep_auto_triggered_once', 'hege_sweep_wait_started_at',
            'hege_sweep_lock', 'hege_sweep_worker_standby', 'hege_sweep_stopped',
        ];
        sweepSessionKeys.forEach(k => {
            sessionStorage.removeItem(k);
            localStorage.removeItem(k);
        });
        // 同時清掉 hege_sweep_processed_* 與 hege_sweep_last_batch_*
        Object.keys(localStorage).filter(k => k.startsWith('hege_sweep_')).forEach(k => localStorage.removeItem(k));
        Object.keys(sessionStorage).filter(k => k.startsWith('hege_sweep_')).forEach(k => sessionStorage.removeItem(k));
        console.log('[留友封] Sweep session 殘留全數清除');

        // 升版後只跳過第一次 auto tick，避免歷史殘留狀態在第一輪誤觸發
        sessionStorage.setItem('hege_skip_sweep_tick_once', 'true');

        Storage.set(CONFIG.KEYS.VERSION_CHECK, CONFIG.VERSION);
        console.log(`[留友封] Updated to v${CONFIG.VERSION}. Cleared temporary queues and report queue/context. Migrated delayed queue: ${legacyDelayedQueue.length}`);
    }

    // Clear stale sweep standby flag from previous session
    if (!sessionStorage.getItem('hege_sweep_state') && localStorage.getItem('hege_sweep_worker_standby') === 'true') {
        localStorage.removeItem('hege_sweep_worker_standby');
        console.log('[留友封] Cleared stale hege_sweep_worker_standby flag');
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
            
            // Phase 2: Check for SweepDriver resumption
            const sweepState = sessionStorage.getItem('hege_sweep_state');
            const sweepTarget = sessionStorage.getItem('hege_sweep_target');
            const currentCleanUrl = window.location.href.split('?')[0];
            const targetCleanUrl = (sweepTarget || '').split('?')[0];
            const sweepRuntime = Utils.getSweepRuntimeState ? Utils.getSweepRuntimeState() : { running: false };
            const targetEntry = targetCleanUrl ? Storage.postReservoir.getByUrl(targetCleanUrl) : null;
            const targetIsSweeping = !!targetEntry && targetEntry.status === 'sweeping';
            const targetSweepingStale = targetIsSweeping && (Date.now() - (targetEntry.lastSweptAt || 0) > 5 * 60 * 1000);
            if (sweepState === 'WAIT_FOR_BG' && targetCleanUrl === currentCleanUrl) {
                if (CONFIG.DEBUG_MODE) {
                    console.log('[SweepDriver][RESUME-CHECK]', JSON.stringify({
                        sweepState,
                        currentCleanUrl,
                        targetCleanUrl,
                        targetStatus: targetEntry?.status || '(missing)',
                        targetIsSweeping,
                        targetSweepingStale,
                        runtime: {
                            running: !!sweepRuntime.running,
                            standby: !!sweepRuntime.standby,
                            bgQueueLen: sweepRuntime.bgQueueLen || 0,
                            workerRunning: !!sweepRuntime.workerRunning,
                            flowActive: !!sweepRuntime.flowActive,
                            waitForBgActive: !!sweepRuntime.waitForBgActive,
                        },
                    }));
                }
                if (targetSweepingStale) {
                    // stale sweeping 自救：避免手動 reload 被誤判為要繼續定點絕
                    Core.SweepDriver.updateEntry(targetCleanUrl, p => ({ ...p, status: 'pending', done: false }));
                    Core.SweepDriver.clearTransientState();
                    console.log('[SweepDriver] Cleared stale WAIT_FOR_BG + sweeping state on startup');
                } else {
                    const canResume = targetIsSweeping && (
                        !!sweepRuntime.standby
                        || (sweepRuntime.bgQueueLen || 0) > 0
                        || !!sweepRuntime.workerRunning
                        || !!sweepRuntime.waitForBgActive
                    );
                    if (canResume) {
                        if (CONFIG.DEBUG_MODE) console.log('[SweepDriver][RESUME-CHECK] resume waitForWorkerDrain');
                        Core.SweepDriver.waitForWorkerDrain();
                    } else {
                        if (CONFIG.DEBUG_MODE) console.log('[SweepDriver][RESUME-CHECK] clear transient state (cannot resume)');
                        Core.SweepDriver.clearTransientState();
                    }
                }
            } else if (sweepState && targetCleanUrl && targetCleanUrl !== currentCleanUrl) {
                if (CONFIG.DEBUG_MODE) console.log('[SweepDriver][RESUME-CHECK] clear transient state (target mismatch)');
                Core.SweepDriver.clearTransientState();
            } else if (sweepState && !targetCleanUrl) {
                if (CONFIG.DEBUG_MODE) console.log('[SweepDriver][RESUME-CHECK] clear transient state (missing target)');
                Core.SweepDriver.clearTransientState();
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
                    const dailyLimit = Storage.getDailyBlockLimit();
                    const blocks24h = Storage.getBlocksLast24h();
                    UI.showConfirm(
                        `⚠️ 目前處於冷卻保護中（約 ${remainHrs} 小時後自動解除）\n\n強制取消冷卻並繼續封鎖？\n\n最近 24 小時紀錄：${blocks24h}/${dailyLimit}。\n\n若已大量封鎖，後續操作可能失敗，Meta 也可能對您的帳號施加額外限制。`,
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
                            Storage.set(CONFIG.KEYS.WORKER_MODE, 'block');
                            if (Utils.isMobile()) {
                                Core.runSameTabWorker();
                            } else {
                                // window.open must be called directly in the click handler to preserve user gesture
                                const workerWindow = Utils.openWorkerWindow();
                                if (!workerWindow || workerWindow.closed) {
                                    UI.showToast('彈出視窗被阻擋，改用目前視窗執行。');
                                    Core.runSameTabWorker();
                                }
                            }
                        }
                    );
                    return;
                }

                let toAdd = Array.from(pending);
                let currentQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);

                if (toAdd.length === 0 && currentQueue.length === 0) { UI.showToast('請先勾選用戶！'); return; }

                if (Utils.isMobile()) {
                    Core.runSameTabWorker(toAdd);
                } else {
                    Storage.invalidate(CONFIG.KEYS.BG_QUEUE);
                    const q = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
                    const newQ = [...new Set([...q, ...toAdd])];
                    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, newQ);
                    
                    if (toAdd.length > 0) {
                        UI.showToast(`已提交 ${toAdd.length} 筆至背景佇列`);
                    }

                    const status = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
                    const running = (Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running');
                    if (!running) {
                        Storage.remove(CONFIG.KEYS.BG_CMD);
                        Storage.set(CONFIG.KEYS.WORKER_MODE, 'block');
                        const workerWindow = Utils.openWorkerWindow();
                        if (!workerWindow || workerWindow.closed) {
                            UI.showToast('彈出視窗被阻擋，改用目前視窗執行。');
                            Core.runSameTabWorker();
                        }
                    }
                }
            };

            const confirmClearDB = () => UI.showConfirm('確定清除所有歷史紀錄？', () => {
                Storage.setJSON(CONFIG.KEYS.DB_KEY, []);
                Storage.setJSON(CONFIG.KEYS.DB_TIMESTAMPS, {});
                Storage.setJSON(CONFIG.KEYS.REPORT_HISTORY, []);
                Storage.remove(CONFIG.KEYS.SOURCE_EVIDENCE_INDEX);
                Storage.remove(CONFIG.KEYS.SOURCE_EVIDENCE_PRUNE_AT);
                Storage.evidence.clearAll().catch(() => {});
                Core.updateControllerUI();
                UI.showToast('封鎖/檢舉歷史與來源證據已清除');
            });

            const callbacks = {
                onMainClick: handleMainButton,
                onStartReport: () => {
                    const pending = Array.from(Core.pendingUsers || new Set());
                    const existing = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);

                    if (pending.length === 0 && existing.length === 0) {
                        UI.showToast('請先勾選使用者，或在互動名單 dialog 點只檢舉');
                        return;
                    }

                    const startWorker = () => {
                        Storage.remove(CONFIG.KEYS.BG_CMD);
                        Storage.set(CONFIG.KEYS.WORKER_MODE, 'report');
                        Storage.remove(CONFIG.KEYS.WORKER_STATS);
                        if (Utils.isMobile()) {
                            Core.runSameTabReportWorker();
                        } else {
                            const workerWindow = Utils.openWorkerWindow();
                            if (!workerWindow || workerWindow.closed) {
                                UI.showToast('彈出視窗被阻擋，改用目前視窗執行。');
                                Core.runSameTabReportWorker();
                            }
                        }
                    };

                    const enqueueAndStart = (keepBlockSelection) => {
                        UI.showReportPicker((path) => {
                            Storage.setJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, []);
                            Storage.remove(CONFIG.KEYS.REPORT_RESTORE_PENDING);
                            Storage.set(CONFIG.KEYS.REPORT_KEEP_BLOCK_SELECTION, keepBlockSelection ? 'true' : 'false');
                            Storage.set(CONFIG.KEYS.REPORT_BATCH_PATH, JSON.stringify(path));
                            let added = 0;
                            pending.forEach(u => {
                                const sourceUrl = Storage.getJSON(CONFIG.KEYS.REPORT_CONTEXT, {})[u]?.sourceUrl || Core.findSourcePostUrl(document.body);
                                Core.setReportContext(u, {
                                    sourceUrl,
                                    source: 'panel',
                                    targetType: 'account',
                                    sourceText: Utils.getPostText(sourceUrl),
                                    sourceOwner: Utils.getPostOwner(sourceUrl) || '',
                                });
                                if (Storage.queueAddUnique(CONFIG.KEYS.REPORT_QUEUE, u)) added++;
                            });
                            const total = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length;
                            Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []));
                            if (pending.length > 0) {
                                Core.clearPendingUsers(pending);
                            }
                            const keepNote = pending.length > 0
                                ? (keepBlockSelection ? '，完成後回填封鎖清單' : '，不保留封鎖清單')
                                : '';
                            Core.updateControllerUI();
                            UI.showToast(pending.length > 0
                                ? `已加入 ${added} 人進檢舉佇列（共 ${total} 筆）${keepNote}，啟動 worker`
                                : `已選擇檢舉項目，啟動佇列內 ${existing.length} 筆`);
                            startWorker();
                        });
                    };

                    if (pending.length > 0) {
                        UI.showConfirm(
                            '檢舉完後要保留封鎖清單嗎？\n\n按「保留」：檢舉完後可以再手動封鎖\n按「不保留」：只檢舉，啟動後清掉所有清單',
                            () => enqueueAndStart(true),
                            () => enqueueAndStart(false),
                            { confirm: '保留', cancel: '不保留' }
                        );
                    } else {
                        enqueueAndStart(true);
                    }
                },
                onClearSel: () => {
                    UI.showConfirm('確定要清除目前的「選取清單」與所有「背景排隊」的帳號嗎？\n(這不會影響已完成的封鎖歷史紀錄)', () => {
                        Core.pendingUsers.clear();
                        Storage.setSessionJSON(CONFIG.KEYS.PENDING, []);
                        Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
                        Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, []);
                        Storage.setJSON(CONFIG.KEYS.BG_STATUS, {});
                        Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, []);
                        Storage.setJSON(CONFIG.KEYS.REPORT_CONTEXT, {});
                        Storage.setJSON(CONFIG.KEYS.REPORT_BATCH_USERS, []);
                        Storage.setJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, []);
                        Storage.remove(CONFIG.KEYS.REPORT_BATCH_PATH);
                        Storage.remove(CONFIG.KEYS.REPORT_KEEP_BLOCK_SELECTION);
                        Storage.remove(CONFIG.KEYS.REPORT_RESTORE_PENDING);
                        Core.blockQueue.forEach(b => {
                            const cb = b.parentElement.querySelector('.hege-checkbox-container');
                            if (cb) cb.classList.remove('checked');
                        });
                        Core.blockQueue.clear();
                        Core.updateControllerUI();
                        UI.showToast('待封鎖、待檢舉與背景佇列已全數清除');
                    });
                },
                onEndlessQueue: () => UI.showPostReservoir({
                    onStart: () => Core.SweepDriver.startNow()
                }),
                onSettings: () => {
                    const openSettings = () => {
                        UI.showSettingsModal({
                            onManage: () => Core.openBlockManager(),
                            onImport: () => Core.importList(),
                            onExport: () => Core.exportHistory(),
                            onClearDB: confirmClearDB,
                            onCockroach: () => Core.openCockroachManager(() => openSettings()),
                            onReservoir: () => UI.showPostReservoir({
                                onStart: () => Core.SweepDriver.startNow()
                            }),
                            onReport: () => Core.showReportDialog(),
                            onAnalytics: () => UI.showAnalyticsReport(),
                        });
                    };
                    openSettings();
                },
                onRetryFailed: () => Core.retryFailedQueue(),
                onStop: () => { UI.showConfirm('確定要停止背景執行？', () => {
                    Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
                    Storage.set('hege_sweep_stopped', 'true');
                    Storage.remove('hege_sweep_worker_standby');
                }); }
            };

            const panel = UI.createPanel(callbacks);

            const syncCompletedReportSelection = () => {
                const completedUsers = Storage.getJSON(CONFIG.KEYS.REPORT_COMPLETED_USERS, []);
                if (completedUsers.length === 0) return;
                const keepBlockSelection = Storage.get(CONFIG.KEYS.REPORT_KEEP_BLOCK_SELECTION, 'true') !== 'false';
                if (keepBlockSelection) {
                    Core.restorePendingUsers(completedUsers);
                } else {
                    Core.clearPendingUsers(completedUsers);
                }
            };
            const syncReportRestorePending = () => {
                const payload = Storage.getJSON(CONFIG.KEYS.REPORT_RESTORE_PENDING, {});
                const users = Array.isArray(payload.users) ? payload.users : [];
                if (users.length === 0) return;
                Core.restorePendingUsers(users);
                Storage.remove(CONFIG.KEYS.REPORT_RESTORE_PENDING);
            };

            // Sync Logic (Restored from beta46)
            const syncKeySet = new Set(CONFIG.SYNC_KEYS);
            window.addEventListener('storage', (e) => {
                if (syncKeySet.has(e.key)) {
                    Storage.invalidate(e.key); // Force cache clear so getJSON fetches fresh data
                    if (e.key === CONFIG.KEYS.REPORT_COMPLETED_USERS) {
                        Storage.invalidate(CONFIG.KEYS.REPORT_KEEP_BLOCK_SELECTION);
                        syncCompletedReportSelection();
                    } else if (e.key === CONFIG.KEYS.REPORT_RESTORE_PENDING) {
                        syncReportRestorePending();
                    }
                    Core.updateControllerUI();
                }
            });
            setInterval(() => {
                Storage.invalidateMulti(CONFIG.SYNC_KEYS);
                syncReportRestorePending();
                syncCompletedReportSelection();
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
                if (sessionStorage.getItem('hege_skip_sweep_tick_once') === 'true') {
                    sessionStorage.removeItem('hege_skip_sweep_tick_once');
                    if (CONFIG.DEBUG_MODE) console.log('[SweepDriver] Skip first auto tick after version update');
                    return;
                }
                Core.SweepDriver.tick();
            }, 60000);

            // Task 1: Debug 測試後門，允許無視 8H 直接歸零並立即跳轉
            if (CONFIG.DEBUG_MODE) {
                window.HegeDebug = {
                    forceWakeup: () => {
                        let queue = Storage.getJSON(CONFIG.KEYS.POST_QUEUE, []);
                        queue.forEach(q => q.lastSweptAt = 0);
                        Storage.setJSON(CONFIG.KEYS.POST_QUEUE, queue);
                        console.log('[DeepSweep-Q] 測試後門觸發：已將所有深層清理貼文的冷卻時間歸零！');
                        Core.SweepDriver.tick();
                    }
                };
            }

            Core.init();

            const params = new URLSearchParams(window.location.search);
            if (params.get('hege_sweep') === 'true' || params.get('hege_post_sweep') === 'true') {
                const currentPostUrl = window.location.href.split('?')[0];
                const runtime = Utils.getSweepRuntimeState ? Utils.getSweepRuntimeState() : { running: false };
                const entry = Storage.postReservoir.getByUrl(currentPostUrl);
                const shouldResumeSweepPage = !!runtime.running || (entry && entry.status === 'sweeping');
                if (shouldResumeSweepPage) {
                    Utils.pollUntil(() => document.querySelector('a[role="link"], span[role="link"], div[role="button"]'), 10000)
                        .then(() => Core.SweepDriver.runCurrentPage());
                } else {
                    if (CONFIG.DEBUG_MODE) console.log('[SweepDriver] Ignore stale hege_sweep param without active runtime');
                    const cleanUrl = new URL(window.location.href);
                    cleanUrl.searchParams.delete('hege_sweep');
                    cleanUrl.searchParams.delete('hege_post_sweep');
                    history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
                }
            }

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

    // --- 全局除錯/測試函式（只在 DEBUG_MODE 下暴露）---
    if (CONFIG.DEBUG_MODE) {
        window.__DEBUG_HEGE_CLEAR_DAILY_RING = () => {
            localStorage.removeItem(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING);
            Storage.invalidate(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING);
            console.log('[DEBUG] Meta 每日安全上限紀錄已清空。');
        };

        window.__DEBUG_GENERATE_COCKROACH = (username = 'test_roach_' + Math.floor(Math.random()*1000)) => {
            const db = JSON.parse(localStorage.getItem(CONFIG.KEYS.COCKROACH_DB) || '[]');
            // 設定為 11 天前，以觸發 10 天提醒
            db.push({ username, timestamp: Date.now() - (11 * 24 * 60 * 60 * 1000) });
            localStorage.setItem(CONFIG.KEYS.COCKROACH_DB, JSON.stringify(db));
            console.log(`[DEBUG] 已注入大蟑螂 @${username} (時標為 11 天前)。重新裝載網頁後將會觸發回望提醒！`);
        };
    }

})();
