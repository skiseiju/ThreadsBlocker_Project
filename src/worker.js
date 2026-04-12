import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { Storage } from './storage.js';

export const Worker = {
    stats: { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: 0 },
    initialTotal: 0,
    sessionQueue: [],          // 本次 session 完整名單快照
    verifyLevel: 0,            // 0=每5次, 1=每3次, 2=每次
    verifyCount: 0,            // 自上次驗證以來的計數
    consecutiveRateLimits: 0,
    consecutiveFails: 0,       // Level 2 連續失敗計數
    _stepRunning: false,       // mutex: prevent concurrent runStep chains

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
                <div id="hege-worker-stop" style="background:#ff453a;color:#fff;font-size:16px;font-weight:700;padding:14px 48px;border-radius:14px;cursor:pointer;user-select:none;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 12px rgba(255,69,58,0.3);transition:transform 0.15s,opacity 0.15s;margin-bottom:20px;">🛑 停止${Storage.get('hege_endless_worker_standby') === 'true' ? '定點絕' : (isUnblock ? '解除封鎖' : '封鎖')}</div>

                <!-- Debug Log -->
                <div id="hege-worker-log" style="width:100%;flex:1;overflow-y:auto;border:1px solid #222;border-radius:8px;padding:10px;text-align:left;font-family:monospace;font-size:11px;color:#555;background:#0a0a0a;"></div>
            </div>
        `);
        document.body.appendChild(cover);

        // Bind stop button
        const stopBtn = document.getElementById('hege-worker-stop');
        if (stopBtn) {
            const handleStop = () => {
                Storage.set(CONFIG.KEYS.ENDLESS_STOPPED, 'true'); // 讓主頁面 monitor 立即中止，防止空 queue 被誤判為批次完成
                Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
                Storage.remove('hege_endless_worker_standby');
                sessionStorage.removeItem('hege_endless_state');
                sessionStorage.removeItem('hege_endless_target');
                sessionStorage.removeItem('hege_endless_last_first_user');
                sessionStorage.removeItem('hege_auto_triggered_once');
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
        if (Worker._stepRunning) return;
        Worker._stepRunning = true;
        try {
        if (Storage.get(CONFIG.KEYS.BG_CMD) === 'stop') {
            Storage.remove(CONFIG.KEYS.BG_CMD);
            Storage.remove(CONFIG.KEYS.VERIFY_PENDING);
            Storage.remove('hege_endless_worker_standby');
            Storage.remove('hege_batch_verify_idx');
            Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, []);
            sessionStorage.removeItem('hege_endless_state');
            sessionStorage.removeItem('hege_endless_target');
            sessionStorage.removeItem('hege_endless_last_first_user');
            sessionStorage.removeItem('hege_auto_triggered_once');
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
            // 定點絕待命模式：即使佇列空了也保持開啟，等待主視窗塞入下一批
            if (Storage.get('hege_endless_worker_standby') === 'true') {
                Worker.updateStatus('idle', '⌛ 等待定點絕餵食...', 0, 0);
                if (window.hegeLog) window.hegeLog('[BG] 佇列空，但定點絕待命中...');

                // Same-tab 模式（無 opener）：直接返回主頁面，由主頁面的 startEndlessMonitor 接管倒數/下一批
                if (!window.opener || window.opener.closed) {
                    if (window.hegeLog) window.hegeLog('[BG] Same-tab 模式，返回主頁面讓 startEndlessMonitor 處理下一批...');
                    Worker.navigateBack();
                    return;
                }

                // Popup 模式（有 opener）：Safari Background Tab 最終防線，由 Active Worker 強制重載 Opener
                try {
                    if (window.opener && !window.opener.closed) {
                        const openerState = window.opener.sessionStorage.getItem('hege_endless_state');
                        if (openerState === 'WAIT_FOR_BG') {
                            window.opener.sessionStorage.setItem('hege_endless_state', 'RELOADING');
                            window.opener.sessionStorage.removeItem('hege_auto_triggered_once');
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

                setTimeout(Worker.runStep, 1000);
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

    verifyBlock: async (user, isUnblockTask = false) => {
        // Page has been reloaded — check if "Unblock" appears in menu (= block succeeded)
        try {
            // 智慧等待頁面載入
            const verifyPageLoaded = await Utils.pollUntil(() => {
                return document.querySelector(CONFIG.SELECTORS.MORE_SVG);
            }, 2500);
            if (!verifyPageLoaded) await Utils.safeSleep(1000);

            // Find "More" button again (智慧等待)
            let profileBtn = await Utils.pollUntil(() => {
                const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
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
                            const svg = container.querySelector(CONFIG.SELECTORS.MORE_SVG);
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
                let profileBtn = await Utils.pollUntil(() => {
                    const moreSvgs = document.querySelectorAll(CONFIG.SELECTORS.MORE_SVG);
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
                                const svg = container.querySelector(CONFIG.SELECTORS.MORE_SVG);
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
