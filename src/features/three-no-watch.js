import { CONFIG } from '../config.js';
import { Storage } from '../storage.js';
import { Utils } from '../utils.js';
import { Reporter } from '../reporter.js';
import { UI } from '../ui.js';
import { Core } from '../core.js';

Object.assign(Core, {
    ThreeNoWatch: {
        stateKey: 'hege_three_no_scan_runtime',
        runtimeBackupKey: 'hege_three_no_scan_runtime_backup',

        isChromeExtension: () => Reporter.getClientPlatform() === 'chrome_extension',

        isScanPage: () => new URLSearchParams(window.location.search).get('hege_three_no_scan') === 'true',

        isStopRequested: () => Storage.get(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, '') === 'stop',

        requestStop: () => {
            Storage.set(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, 'stop');
            Core.ThreeNoWatch.setScanState({
                status: 'stopping',
                debug: {
                    step: 'user_stop_requested',
                    url: window.location.href,
                },
            });
        },

        getLocalDayKey: (ts = Date.now()) => {
            const d = new Date(ts);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        },

        normalizeUsername: (value = '') => String(value || '')
            .replace(/^@+/, '')
            .split('?')[0]
            .split('/')[0]
            .trim(),

        profileUrl: (username) => `${window.location.origin}/@${encodeURIComponent(Core.ThreeNoWatch.normalizeUsername(username))}`,

        getBatchSize: () => Math.max(1, parseInt(CONFIG.THREE_NO_SCAN_BATCH_SIZE || '200', 10) || 200),

        isFreshRunningState: (state = {}, now = Date.now()) => {
            const status = String(state.status || '');
            if (!['starting', 'running', 'collecting_followers', 'followers_collected', 'checking_profiles', 'stopping'].includes(status)) return false;
            const updatedAt = parseInt(state.updatedAt || '0', 10) || 0;
            return updatedAt > 0 && now - updatedAt < 90 * 1000;
        },

        setScanState: (state = {}) => {
            const previous = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            const next = {
                ...previous,
                ...state,
                updatedAt: Date.now(),
            };
            if (state.status && state.status !== 'failed' && !Object.prototype.hasOwnProperty.call(state, 'error')) {
                next.error = '';
            }
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, next);
            Core.ThreeNoWatch.renderWorkerOverlay(next);
        },

        renderWorkerOverlay: (state = {}) => {
            if (!Core.ThreeNoWatch.isScanPage()) return;
            let overlay = document.getElementById('hege-three-no-worker-overlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'hege-three-no-worker-overlay';
                overlay.style.cssText = [
                    'position:fixed',
                    'right:12px',
                    'bottom:12px',
                    'width:min(340px,calc(100vw - 24px))',
                    'z-index:2147483647',
                    'background:rgba(12,12,12,0.92)',
                    'color:#f5f5f5',
                    'border:1px solid rgba(255,255,255,0.16)',
                    'border-radius:10px',
                    'box-shadow:0 12px 34px rgba(0,0,0,0.45)',
                    'font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
                    'padding:12px',
                    'box-sizing:border-box',
                ].join(';');
                document.body.appendChild(overlay);
            }

            const statusMap = {
                starting: '啟動中',
                running: '準備掃描',
                collecting_followers: '正在開啟粉絲名單',
                followers_collected: '正在準備候選名單',
                checking_profiles: '正在檢查個人檔案',
                stopping: '正在停止',
                stopped: '已停止',
                completed: '掃描完成',
                failed: '掃描失敗',
            };
            const statusText = statusMap[state.status] || state.status || '掃描中';
            const checked = parseInt(state.checkedFollowersCount || '0', 10) || 0;
            const total = parseInt(state.candidateFollowersCount || '0', 10) || 0;
            const previous = parseInt(state.previousScannedCount || '0', 10) || 0;
            const progress = total > 0
                ? `本批 ${Math.min(checked + 1, total)} / ${total}${previous > 0 ? ` · 累計 ${previous + checked}` : ''}`
                : '';
            const triaged = parseInt(state.triagedFollowersCount || '0', 10) || 0;
            const hasCandidateSignal = Object.prototype.hasOwnProperty.call(state, 'candidateFollowersCount')
                || Object.prototype.hasOwnProperty.call(state, 'triagedFollowersCount');
            const candidateSummary = hasCandidateSignal
                ? `已抓到備選名單：${total}${triaged > 0 ? `（本批掃過 ${triaged}）` : ''}`
                : '';
            const current = state.current ? `@${state.current}` : '';
            const error = state.error ? `<div style="margin-top:8px;color:#ff9f9a;">${Utils.escapeHTML(state.error)}</div>` : '';
            const debug = state.debug && typeof state.debug === 'object' ? state.debug : {};
            const debugRows = Object.entries(debug)
                .filter(([, value]) => value !== undefined && value !== null && value !== '')
                .slice(-16)
                .map(([key, value]) => {
                    const text = Array.isArray(value) ? value.join(' | ') : String(value);
                    return `<div><span style="color:#777;">${Utils.escapeHTML(key)}:</span> ${Utils.escapeHTML(text).slice(0, 260)}</div>`;
                })
                .join('');
            const debugBlock = (Utils.isBetaBuild() || state.status === 'failed') && debugRows
                ? `<details open style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
                    <summary style="cursor:pointer;color:#8ab4f8;font-weight:700;">Debug</summary>
                    <div style="margin-top:6px;color:#aaa;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:1.45;word-break:break-word;">${debugRows}</div>
                </details>`
                : '';
            const canStop = ['starting', 'running', 'collecting_followers', 'followers_collected', 'checking_profiles'].includes(String(state.status || ''));
            const closeText = state.status === 'failed' && Utils.isBetaBuild()
                ? 'Beta 偵錯中，錯誤時不會自動關閉。'
                : (state.status === 'stopped'
                    ? '已保留目前進度；這個 worker 分頁可手動關閉。'
                    : (state.status === 'stopping'
                        ? '正在保存目前進度，請先不要關閉。'
                        : '請保持這個 worker 分頁開啟，完成後會自動關閉。'));

            Utils.setHTML(overlay, `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
                    <div style="font-weight:800;color:#fff;">三無追蹤者掃描</div>
                    <div style="color:${state.status === 'failed' ? '#ff453a' : '#30d158'};font-weight:700;">${Utils.escapeHTML(statusText)}</div>
                </div>
                <div style="height:6px;background:#222;border-radius:999px;overflow:hidden;margin-bottom:8px;">
                    <div style="height:100%;width:${total > 0 ? Math.max(5, Math.round((checked / total) * 100)) : 18}%;background:#30d158;border-radius:999px;transition:width .25s ease;"></div>
                </div>
                <div style="color:#aaa;">${progress ? `進度：${progress}` : '正在準備粉絲名單'}${current ? ` · ${Utils.escapeHTML(current)}` : ''}</div>
                ${candidateSummary ? `<div style="margin-top:4px;color:#9ad0ff;">${Utils.escapeHTML(candidateSummary)}</div>` : ''}
                <div style="margin-top:6px;color:#777;">${closeText}</div>
                ${canStop ? '<button id="hege-three-no-worker-stop" style="margin-top:10px;width:100%;border:0;border-radius:8px;background:#ff453a;color:#fff;font-weight:800;padding:8px 10px;cursor:pointer;">停止並保留進度</button>' : ''}
                ${error}
                ${debugBlock}
            `);
            const stopBtn = overlay.querySelector('#hege-three-no-worker-stop');
            if (stopBtn) {
                stopBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    stopBtn.textContent = '正在停止...';
                    stopBtn.style.background = '#666';
                    stopBtn.disabled = true;
                    Core.ThreeNoWatch.requestStop();
                };
            }
        },

        getRuntime: () => {
            try {
                const raw = sessionStorage.getItem(Core.ThreeNoWatch.stateKey);
                const parsed = raw ? JSON.parse(raw) : {};
                if (parsed && typeof parsed === 'object' && (parsed.scanId || Array.isArray(parsed.usernames))) return parsed;
            } catch (_) {
                // fall back to localStorage backup below
            }
            try {
                const raw = localStorage.getItem(Core.ThreeNoWatch.runtimeBackupKey);
                const parsed = raw ? JSON.parse(raw) : {};
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch (_) {
                return {};
            }
        },

        setRuntime: (state = {}) => {
            const raw = JSON.stringify(state);
            sessionStorage.setItem(Core.ThreeNoWatch.stateKey, raw);
            localStorage.setItem(Core.ThreeNoWatch.runtimeBackupKey, raw);
        },

        getCurrentProfileUsername: () => {
            const match = window.location.pathname.match(/^\/@([^/?#]+)(?:\/(?:replies|media|reposts))?\/?$/);
            return match ? Core.ThreeNoWatch.normalizeUsername(match[1]) : '';
        },

        buildScanUrl: (scanId, options = {}) => {
            const targetOwner = Core.ThreeNoWatch.normalizeUsername(options.targetOwner || '');
            const url = new URL(targetOwner
                ? Core.ThreeNoWatch.profileUrl(targetOwner)
                : `${window.location.origin}/`);
            url.searchParams.set('hege_bg', 'true');
            url.searchParams.set('hege_popup', 'true');
            url.searchParams.set('hege_three_no_scan', 'true');
            url.searchParams.set('hege_three_no_phase', targetOwner ? 'followers' : 'bootstrap');
            if (targetOwner) {
                url.searchParams.set('hege_three_no_owner', targetOwner);
                url.searchParams.set('hege_three_no_target_owner', targetOwner);
            }
            url.searchParams.set('hege_three_no_run', scanId);
            return url.toString();
        },

        startManualScan: async (options = {}) => {
            if (!Core.ThreeNoWatch.isChromeExtension()) return { skipped: 'not_chrome_extension' };
            if (Core.ThreeNoWatch.isScanPage()) return { skipped: 'scan_page' };

            const today = Core.ThreeNoWatch.getLocalDayKey();
            const now = Date.now();
            const lock = parseInt(Storage.get(CONFIG.KEYS.THREE_NO_SCAN_LOCK, '0') || '0', 10) || 0;
            const scanState = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            const freshScanState = Core.ThreeNoWatch.isFreshRunningState(scanState, now);
            if (lock > 0 && now - lock < 20 * 60 * 1000 && freshScanState) return { skipped: 'scan_in_flight' };
            if (lock > 0 && !freshScanState) {
                Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
                Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
                Core.ThreeNoWatch.setScanState({
                    ...scanState,
                    status: 'stale',
                    error: '',
                    debug: {
                        step: 'stale_scan_lock_cleared',
                        previousStatus: scanState.status || '',
                        previousUpdatedAt: scanState.updatedAt || 0,
                    },
                });
            }

            const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const workerRunning = bgStatus.state === 'running' && (now - (bgStatus.lastUpdate || 0) < 30000);
            if (workerRunning || Utils.isSweepRunning()) return { skipped: 'worker_busy' };

            const targetOwner = Core.ThreeNoWatch.normalizeUsername(options.targetOwner || '');
            const scanId = targetOwner
                ? `three-no:target:${targetOwner}:${today}:${now}`
                : `three-no:manual:${today}:${now}`;
            Storage.set(CONFIG.KEYS.THREE_NO_SCAN_LOCK, String(now));
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            Core.ThreeNoWatch.setScanState({
                scanId,
                scanTargetOwner: targetOwner,
                scanDate: today,
                status: 'starting',
                startedAt: now,
                checkedFollowersCount: 0,
                threeNoFollowersCount: 0,
            });

            const url = Core.ThreeNoWatch.buildScanUrl(scanId, { targetOwner });
            const workerWindow = window.open(url, 'HegeThreeNoWorker', 'width=800,height=700');
            try {
                if (!workerWindow || workerWindow.closed) throw new Error('popup_blocked');
                Core.ThreeNoWatch.setScanState({
                    scanId,
                    scanTargetOwner: targetOwner,
                    scanDate: today,
                    status: 'running',
                    startedAt: now,
                    checkedFollowersCount: 0,
                    threeNoFollowersCount: 0,
                });
                return { ok: true, scanId };
            } catch (err) {
                Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
                Core.ThreeNoWatch.setScanState({
                    scanId,
                    scanTargetOwner: targetOwner,
                    scanDate: today,
                    status: 'failed',
                    startedAt: now,
                    completedAt: Date.now(),
                    error: String(err?.message || err || 'worker_start_failed'),
                });
                return { skipped: err?.message === 'popup_blocked' ? 'popup_blocked' : 'worker_start_failed', error: err };
            }
        },

        runScanPage: async () => {
            if (!Core.ThreeNoWatch.isChromeExtension()) return;
            const params = new URLSearchParams(window.location.search);
            const phase = params.get('hege_three_no_phase') || 'followers';
            try {
                if (phase === 'bootstrap') await Core.ThreeNoWatch.runBootstrapPhase(params);
                else if (phase === 'followers') await Core.ThreeNoWatch.runFollowersPhase(params);
                else await Core.ThreeNoWatch.runProfilePhase(params);
            } catch (err) {
                await Core.ThreeNoWatch.finishScan({
                    status: 'failed',
                    error: String(err?.message || err || 'scan_failed'),
                });
            }
        },

        runBootstrapPhase: async (params) => {
            const scanId = String(params.get('hege_three_no_run') || `three-no:${Date.now()}`);
            const scanDate = Core.ThreeNoWatch.getLocalDayKey();
            const startedAt = Date.now();
            Core.ThreeNoWatch.setScanState({
                scanId,
                scanDate,
                status: 'starting',
                startedAt,
                checkedFollowersCount: 0,
                threeNoFollowersCount: 0,
            });

            const targetOwner = Core.ThreeNoWatch.normalizeUsername(params.get('hege_three_no_target_owner') || '');
            const owner = targetOwner || await Utils.pollUntil(() => Utils.getMyUsername(), 10000, 250);
            if (!owner) throw new Error('owner_unknown');

            const url = new URL(Core.ThreeNoWatch.profileUrl(owner));
            url.searchParams.set('hege_bg', 'true');
            url.searchParams.set('hege_popup', 'true');
            url.searchParams.set('hege_three_no_scan', 'true');
            url.searchParams.set('hege_three_no_phase', 'followers');
            url.searchParams.set('hege_three_no_owner', owner);
            url.searchParams.set('hege_three_no_target_owner', owner);
            url.searchParams.set('hege_three_no_run', scanId);
            location.assign(url.toString());
        },

        runFollowersPhase: async (params) => {
            const owner = Core.ThreeNoWatch.normalizeUsername(params.get('hege_three_no_target_owner') || params.get('hege_three_no_owner') || Utils.getMyUsername() || '');
            const scanId = String(params.get('hege_three_no_run') || `three-no:${Date.now()}`);
            const scanDate = Core.ThreeNoWatch.getLocalDayKey();
            const startedAt = Date.now();
            const batchSize = Core.ThreeNoWatch.getBatchSize();
            const savedCursor = Storage.getThreeNoScanCursor();
            const canResumeCursor = savedCursor.owner === owner && savedCursor.reachedEnd !== true;
            const cursor = canResumeCursor ? savedCursor : {
                owner,
                startedAt,
                updatedAt: startedAt,
                batchesCompleted: 0,
                reachedEnd: false,
                scannedUsers: [],
            };
            const scannedSet = new Set(cursor.scannedUsers || []);
            Core.ThreeNoWatch.setRuntime({
                scanId,
                scanDate,
                owner,
                scanTargetOwner: owner,
                startedAt,
                batchSize,
                previousScannedCount: scannedSet.size,
                previousBatchesCompleted: cursor.batchesCompleted || 0,
                triagedUsernames: [],
                usernames: [],
                index: 0,
                findings: [],
            });
            Core.ThreeNoWatch.setScanState({
                scanId,
                scanTargetOwner: owner,
                scanDate,
                status: 'collecting_followers',
                startedAt,
                checkedFollowersCount: 0,
                threeNoFollowersCount: 0,
                batchSize,
                previousScannedCount: scannedSet.size,
            });

            await Utils.safeSleep(2500);
            if (Core.ThreeNoWatch.isStopRequested()) {
                await Core.ThreeNoWatch.finishScan({
                    status: 'stopped',
                    debug: {
                        step: 'stopped_before_followers_dialog',
                        url: window.location.href,
                    },
                });
                return;
            }
            const dialog = await Core.ThreeNoWatch.openFollowersDialog();
            if (!dialog) throw new Error('followers_dialog_not_found');
            await Core.ThreeNoWatch.waitForFollowersListMedia(dialog);

            const candidateReportThreshold = Storage.getThreeNoCandidateThreshold
                ? Storage.getThreeNoCandidateThreshold()
                : Math.max(1, parseInt(CONFIG.THREE_NO_SCAN_CANDIDATE_REPORT_THRESHOLD || '100', 10) || 100);
            const workingScannedSet = new Set(scannedSet);
            const allUsernamesSet = new Set();
            const allTriagedSet = new Set();
            const aggregate = {
                skippedKnown: 0,
                avatarSkipped: 0,
                normalUsernameSkipped: 0,
                suspiciousUsername: 0,
                noAvatarCandidate: 0,
                seenCount: 0,
            };
            let collection = null;
            let autoRounds = 0;
            let autoStoppedNoProgress = false;
            let noProgressRounds = 0;
            const maxAutoRounds = 100;
            const maxNoProgressRounds = 6;
            do {
                collection = await Core.ThreeNoWatch.collectFollowerUsernames(dialog, owner, {
                    skipUsers: workingScannedSet,
                    batchSize,
                });
                autoRounds++;
                collection.usernames.forEach(u => allUsernamesSet.add(u));
                collection.triagedUsernames.forEach(u => {
                    allTriagedSet.add(u);
                    workingScannedSet.add(u);
                });
                aggregate.skippedKnown += collection.skippedKnown || 0;
                aggregate.avatarSkipped += collection.avatarSkipped || 0;
                aggregate.normalUsernameSkipped += collection.normalUsernameSkipped || 0;
                aggregate.suspiciousUsername += collection.suspiciousUsername || 0;
                aggregate.noAvatarCandidate += collection.noAvatarCandidate || 0;
                aggregate.seenCount += collection.seenCount || 0;

                const usernamesSoFar = Array.from(allUsernamesSet);
                const triagedSoFar = Array.from(allTriagedSet);
                const reachedCandidateLimit = usernamesSoFar.length > candidateReportThreshold;
                autoStoppedNoProgress = collection.triagedUsernames.length === 0
                    && collection.usernames.length === 0
                    && collection.hasMore === true;
                noProgressRounds = autoStoppedNoProgress ? noProgressRounds + 1 : 0;
                Core.ThreeNoWatch.setScanState({
                    scanId,
                    scanTargetOwner: owner,
                    scanDate,
                    status: 'followers_collected',
                    startedAt,
                    checkedFollowersCount: 0,
                    threeNoFollowersCount: 0,
                    candidateFollowersCount: usernamesSoFar.length,
                    batchSize,
                    previousScannedCount: scannedSet.size,
                    skippedKnownFollowersCount: aggregate.skippedKnown,
                    avatarSkippedFollowersCount: aggregate.avatarSkipped,
                    normalUsernameSkippedFollowersCount: aggregate.normalUsernameSkipped,
                    suspiciousUsernameFollowersCount: aggregate.suspiciousUsername,
                    triagedFollowersCount: triagedSoFar.length,
                    hasMore: collection.hasMore,
                    debug: {
                        step: reachedCandidateLimit ? 'followers_candidate_threshold_reached' : 'followers_auto_collecting',
                        candidateSummary: `已抓到備選名單：${usernamesSoFar.length}`,
                        collectedCount: usernamesSoFar.length,
                        triagedCount: triagedSoFar.length,
                        batchSize,
                        candidateThreshold: candidateReportThreshold,
                        autoRounds,
                        previousScannedCount: scannedSet.size,
                        skippedKnown: aggregate.skippedKnown,
                        avatarSkipped: aggregate.avatarSkipped,
                        noAvatarCandidate: aggregate.noAvatarCandidate,
                        normalUsernameSkipped: aggregate.normalUsernameSkipped,
                        suspiciousUsername: aggregate.suspiciousUsername,
                        seenCount: aggregate.seenCount,
                        lastRoundTriaged: collection.triagedUsernames.length,
                        lastRoundCandidates: collection.usernames.length,
                        reachedEnd: collection.reachedEnd,
                        hasMore: collection.hasMore,
                        autoStoppedNoProgress,
                        noProgressRounds,
                        maxNoProgressRounds,
                        collectionEndReason: collection.endReason || '',
                        collectedSample: usernamesSoFar.slice(0, 20),
                        url: window.location.href,
                    },
                });

                if (Core.ThreeNoWatch.isStopRequested()
                    || collection.stopped === true
                    || reachedCandidateLimit
                    || collection.reachedEnd
                    || collection.hasMore !== true
                    || noProgressRounds >= maxNoProgressRounds
                    || autoRounds >= maxAutoRounds) {
                    break;
                }
                await Utils.safeSleep(700);
            } while (true);

            const usernames = Array.from(allUsernamesSet);
            const triagedUsernames = Array.from(allTriagedSet);
            const hasMore = collection?.hasMore === true && collection?.reachedEnd !== true;
            Core.ThreeNoWatch.setRuntime({
                scanId,
                scanDate,
                owner,
                scanTargetOwner: owner,
                startedAt,
                batchSize,
                previousScannedCount: scannedSet.size,
                previousBatchesCompleted: cursor.batchesCompleted || 0,
                collectionReachedEnd: collection?.reachedEnd === true,
                hasMore,
                skippedKnownFollowersCount: aggregate.skippedKnown,
                avatarSkippedFollowersCount: aggregate.avatarSkipped,
                normalUsernameSkippedFollowersCount: aggregate.normalUsernameSkipped,
                suspiciousUsernameFollowersCount: aggregate.suspiciousUsername,
                triagedUsernames,
                usernames,
                index: 0,
                findings: [],
                limited: hasMore,
            });
            Core.ThreeNoWatch.setScanState({
                scanId,
                scanTargetOwner: owner,
                scanDate,
                status: 'checking_profiles',
                startedAt,
                checkedFollowersCount: 0,
                threeNoFollowersCount: 0,
                candidateFollowersCount: usernames.length,
                batchSize,
                previousScannedCount: scannedSet.size,
                hasMore,
            });

            if (Core.ThreeNoWatch.isStopRequested() || collection?.stopped === true) {
                if (usernames.length > 0) {
                    Core.ThreeNoWatch.setRuntime({
                        ...Core.ThreeNoWatch.getRuntime(),
                        stopAfterCurrentCandidates: true,
                        stopRequestedAt: Date.now(),
                    });
                    Core.ThreeNoWatch.setScanState({
                        status: 'stopping',
                        debug: {
                            step: 'stop_requested_label_candidates',
                            candidateSummary: `已抓到備選名單：${usernames.length}`,
                            autoRounds,
                            collectedCount: usernames.length,
                            triagedCount: triagedUsernames.length,
                            hasMore,
                            previousScannedCount: scannedSet.size,
                            collectionEndReason: collection?.endReason || '',
                            next: 'profile_labeling',
                            url: window.location.href,
                        },
                    });
                    await Core.ThreeNoWatch.navigateToProfile(0);
                    return;
                }
                await Core.ThreeNoWatch.finishScan({
                    status: 'stopped',
                    debug: {
                        step: 'stopped_after_followers_collection_no_candidates',
                        candidateSummary: `已抓到備選名單：${usernames.length}`,
                        autoRounds,
                        collectedCount: usernames.length,
                        triagedCount: triagedUsernames.length,
                        hasMore,
                        previousScannedCount: scannedSet.size,
                        collectionEndReason: collection?.endReason || '',
                        url: window.location.href,
                    },
                });
                return;
            }

            if (usernames.length === 0) {
                if (triagedUsernames.length > 0 || ((aggregate.seenCount > 0 || autoStoppedNoProgress) && (collection?.reachedEnd || collection?.hasMore !== true || autoStoppedNoProgress))) {
                    await Core.ThreeNoWatch.finishScan({
                        status: 'completed',
                        debug: {
                            step: autoStoppedNoProgress ? 'followers_auto_stopped_no_progress' : (triagedUsernames.length > 0 ? 'followers_batch_no_profile_candidates' : 'followers_cycle_already_complete'),
                            candidateSummary: `已抓到備選名單：${usernames.length}`,
                            autoRounds,
                            noProgressRounds,
                            maxNoProgressRounds,
                            collectionEndReason: collection?.endReason || '',
                            seenCount: aggregate.seenCount,
                            skippedKnown: aggregate.skippedKnown,
                            avatarSkipped: aggregate.avatarSkipped,
                            noAvatarCandidate: aggregate.noAvatarCandidate,
                            normalUsernameSkipped: aggregate.normalUsernameSkipped,
                            suspiciousUsername: aggregate.suspiciousUsername,
                            triagedCount: triagedUsernames.length,
                            hasMore,
                            previousScannedCount: scannedSet.size,
                            url: window.location.href,
                        },
                    });
                } else {
                    await Core.ThreeNoWatch.finishScan({
                        status: 'failed',
                        error: 'followers_empty_after_dialog_opened',
                        debug: {
                            step: 'followers_empty_after_dialog_opened',
                            autoRounds,
                            noProgressRounds,
                            maxNoProgressRounds,
                            collectionEndReason: collection?.endReason || '',
                            seenCount: aggregate.seenCount,
                            skippedKnown: aggregate.skippedKnown,
                            avatarSkipped: aggregate.avatarSkipped,
                            noAvatarCandidate: aggregate.noAvatarCandidate,
                            normalUsernameSkipped: aggregate.normalUsernameSkipped,
                            suspiciousUsername: aggregate.suspiciousUsername,
                            url: window.location.href,
                        },
                    });
                }
                return;
            }
            await Core.ThreeNoWatch.navigateToProfile(0);
        },

        runProfilePhase: async () => {
            const runtime = Core.ThreeNoWatch.getRuntime();
            const usernames = Array.isArray(runtime.usernames) ? runtime.usernames : [];
            const index = parseInt(runtime.index || '0', 10) || 0;
            const username = usernames[index];
            if (!username) {
                await Core.ThreeNoWatch.finishScan({
                    status: (runtime.stopAfterCurrentCandidates === true || Core.ThreeNoWatch.isStopRequested()) ? 'stopped' : 'completed',
                    debug: {
                        step: runtime.stopAfterCurrentCandidates === true ? 'stopped_after_candidate_labeling_no_next_user' : 'completed_no_next_user',
                        index,
                        total: usernames.length,
                    },
                });
                return;
            }

            const stopRequested = Core.ThreeNoWatch.isStopRequested();
            const stopAfterCurrentCandidates = runtime.stopAfterCurrentCandidates === true || stopRequested;
            if (stopRequested && runtime.stopAfterCurrentCandidates !== true) {
                Core.ThreeNoWatch.setRuntime({
                    ...runtime,
                    stopAfterCurrentCandidates: true,
                    stopRequestedAt: Date.now(),
                });
                Core.ThreeNoWatch.setScanState({
                    status: 'stopping',
                    debug: {
                        step: 'stop_requested_continue_candidate_labeling',
                        index,
                        total: usernames.length,
                        username,
                        remainingCandidates: Math.max(0, usernames.length - index),
                        url: window.location.href,
                    },
                });
            }

            Core.ThreeNoWatch.setScanState({
                scanId: runtime.scanId || '',
                scanDate: runtime.scanDate || Core.ThreeNoWatch.getLocalDayKey(),
                status: 'checking_profiles',
                startedAt: runtime.startedAt || 0,
                checkedFollowersCount: index,
                threeNoFollowersCount: Array.isArray(runtime.findings) ? runtime.findings.length : 0,
                current: username,
                candidateFollowersCount: usernames.length,
                batchSize: runtime.batchSize || Core.ThreeNoWatch.getBatchSize(),
                previousScannedCount: runtime.previousScannedCount || 0,
                hasMore: runtime.hasMore === true,
                debug: {
                    step: 'profile_check_start',
                    index,
                    total: usernames.length,
                    username,
                    previousScannedCount: runtime.previousScannedCount || 0,
                    findingsCount: Array.isArray(runtime.findings) ? runtime.findings.length : 0,
                    url: window.location.href,
                },
            });

            await Utils.safeSleep(CONFIG.THREE_NO_SCAN_PROFILE_DELAY_MS || 1800);
            window.scrollTo(0, 0);
            await Utils.safeSleep(500);
            const result = await Core.ThreeNoWatch.evaluateCurrentProfile(username);
            const findings = Array.isArray(runtime.findings) ? runtime.findings : [];
            if (result.isThreeNo && !Storage.isThreeNoUserIgnored(result.username)) {
                findings.push({
                    username: result.username,
                    profileUrl: result.profileUrl,
                    checkedAt: result.checkedAt,
                    scanDate: runtime.scanDate || Core.ThreeNoWatch.getLocalDayKey(),
                    scanTargetOwner: runtime.scanTargetOwner || runtime.owner || '',
                    targetOwners: [runtime.scanTargetOwner || runtime.owner || ''].filter(Boolean),
                    noAvatar: result.noAvatar,
                    noBio: result.noBio,
                    noPosts: result.noPosts,
                    noReplies: result.noReplies,
                    noReposts: result.noReposts,
                    suspiciousUsername: result.suspiciousUsername,
                    profileSignalsVersion: result.profileSignalsVersion,
                    noRepliesKnown: result.noRepliesKnown,
                    noRepostsKnown: result.noRepostsKnown,
                    followerCount: result.followerCount,
                    followerCountKnown: result.followerCountKnown,
                    joinedAt: result.joinedAt,
                    accountAgeDays: result.accountAgeDays,
                    accountAgeBucket: result.accountAgeBucket,
                    isNewAccount: result.isNewAccount,
                    locationLabel: result.locationLabel,
                    countryTag: result.countryTag,
                    regionShared: result.regionShared,
                    metadataSource: result.metadataSource,
                    metadataDebug: result.metadataDebug,
                });
            }
            Core.ThreeNoWatch.setScanState({
                scanId: runtime.scanId || '',
                scanDate: runtime.scanDate || Core.ThreeNoWatch.getLocalDayKey(),
                status: 'checking_profiles',
                startedAt: runtime.startedAt || 0,
                checkedFollowersCount: index + 1,
                threeNoFollowersCount: findings.length,
                current: username,
                candidateFollowersCount: usernames.length,
                batchSize: runtime.batchSize || Core.ThreeNoWatch.getBatchSize(),
                previousScannedCount: runtime.previousScannedCount || 0,
                hasMore: runtime.hasMore === true,
                debug: {
                    step: 'profile_check_result',
                    index,
                    total: usernames.length,
                    username,
                    previousScannedCount: runtime.previousScannedCount || 0,
                    noAvatar: result.noAvatar,
                    noBio: result.noBio,
                    noPosts: result.noPosts,
                    noReplies: result.noReplies,
                    noReposts: result.noReposts,
                    suspiciousUsername: result.suspiciousUsername,
                    profileSignalsVersion: result.profileSignalsVersion,
                    noRepliesKnown: result.noRepliesKnown,
                    noRepostsKnown: result.noRepostsKnown,
                    followerCount: result.followerCount,
                    followerCountKnown: result.followerCountKnown,
                    joinedAt: result.joinedAt,
                    accountAgeDays: result.accountAgeDays,
                    accountAgeBucket: result.accountAgeBucket,
                    locationLabel: result.locationLabel,
                    countryTag: result.countryTag,
                    metadataSource: result.metadataSource,
                    metadataDebug: result.metadataDebug,
                    isThreeNo: result.isThreeNo,
                    findingsCount: findings.length,
                    url: window.location.href,
                },
            });

            const nextRuntime = {
                ...runtime,
                findings,
                index: index + 1,
                stopAfterCurrentCandidates,
                stopRequestedAt: runtime.stopRequestedAt || (stopRequested ? Date.now() : 0),
            };
            Core.ThreeNoWatch.setRuntime(nextRuntime);

            if (index + 1 >= usernames.length) {
                await Core.ThreeNoWatch.finishScan({
                    status: stopAfterCurrentCandidates ? 'stopped' : 'completed',
                    debug: {
                        step: stopAfterCurrentCandidates ? 'stopped_after_candidate_labeling' : 'completed_after_profile_check',
                        index: index + 1,
                        total: usernames.length,
                        username,
                        findingsCount: findings.length,
                        hasMore: runtime.hasMore === true,
                    },
                });
                return;
            }
            await Core.ThreeNoWatch.navigateToProfile(index + 1);
        },

        openFollowersDialog: async () => {
            const snapshotCandidates = (limit = 10) => Array.from(document.querySelectorAll('span[dir="auto"], span, a, button, div[role="button"], [tabindex="0"]'))
                .filter(el => !el.closest('[role="dialog"]'))
                .map(el => {
                    const rect = el.getBoundingClientRect();
                    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                    return {
                        text,
                        tag: el.tagName.toLowerCase(),
                        role: el.getAttribute('role') || '',
                        href: el.getAttribute('href') || '',
                        top: Math.round(rect.top),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                    };
                })
                .filter(item => item.text && item.width > 0 && item.height > 0 && item.top >= 0 && item.top < Math.min(720, window.innerHeight))
                .filter(item => /粉絲|粉丝|follower/i.test(item.text) || /follower/i.test(item.href))
                .slice(0, limit);

            const findTrigger = () => {
                const texts = new Set(CONFIG.FOLLOWERS_TEXTS || []);
                const isVisible = (el) => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < Math.min(720, window.innerHeight);
                };
                const clickableAncestor = (el) => {
                    let node = el;
                    for (let depth = 0; node && depth < 6; depth++) {
                        if (node.matches?.('a, button, div[role="button"], [tabindex="0"]')) return node;
                        const cursor = window.getComputedStyle(node).cursor;
                        if (cursor === 'pointer') return node;
                        node = node.parentElement;
                    }
                    return el.closest?.('a, button, div[role="button"], [tabindex="0"]') || el;
                };

                const isFollowerCountText = (value = '') => {
                    const text = String(value || '').replace(/\s+/g, '').trim();
                    return /^[\d,.萬万]+位粉絲$/.test(text)
                        || /^[\d,.萬万]+粉絲$/.test(text)
                        || /^[\d,.KMB]+followers$/i.test(text);
                };

                const followerCountTextNode = Array.from(document.querySelectorAll('span[title], span[dir="auto"], span'))
                    .filter(el => !el.closest('[role="dialog"]'))
                    .filter(isVisible)
                    .find(el => isFollowerCountText(el.innerText || el.textContent || el.getAttribute('title') || ''));
                if (followerCountTextNode) return {
                    element: followerCountTextNode,
                    strategy: 'count_text_node',
                    text: (followerCountTextNode.innerText || followerCountTextNode.textContent || followerCountTextNode.getAttribute('title') || '').replace(/\s+/g, ' ').trim(),
                    href: '',
                };

                const followerCountButton = Array.from(document.querySelectorAll('div[role="button"], button, [tabindex="0"], span[dir="auto"], span'))
                    .filter(el => !el.closest('[role="dialog"]'))
                    .filter(isVisible)
                    .find(el => {
                        if (!isFollowerCountText(el.innerText || el.textContent || '')) return false;
                        const cursor = window.getComputedStyle(el).cursor;
                        return el.matches('div[role="button"], button, [tabindex="0"]') || cursor === 'pointer';
                    });
                if (followerCountButton) return {
                    element: followerCountButton.matches('span') ? clickableAncestor(followerCountButton) : followerCountButton,
                    strategy: 'count_button',
                    text: (followerCountButton.innerText || followerCountButton.textContent || '').replace(/\s+/g, ' ').trim(),
                    href: '',
                };

                const hrefTrigger = Array.from(document.querySelectorAll('a[href]'))
                    .filter(el => !el.closest('[role="dialog"]'))
                    .filter(isVisible)
                    .filter(el => {
                        const href = el.getAttribute('href') || '';
                        try {
                            const path = new URL(href, window.location.origin).pathname.toLowerCase();
                            return /\/followers?\/?$/.test(path);
                        } catch (_) {
                            return /\/followers?\/?$/.test(href.toLowerCase().split('?')[0]);
                        }
                    })
                    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
                if (hrefTrigger) return { element: clickableAncestor(hrefTrigger), strategy: 'href_path', text: (hrefTrigger.innerText || hrefTrigger.textContent || '').replace(/\s+/g, ' ').trim(), href: hrefTrigger.getAttribute('href') || '' };

                const candidates = Array.from(document.querySelectorAll('a, button, div[role="button"], [tabindex="0"], span, div'))
                    .filter(el => !el.closest('[role="dialog"]'))
                    .filter(isVisible);
                for (const el of candidates) {
                    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (!text) continue;
                    const compactText = text.replace(/\s+/g, '');
                    const isCompactFollowerCount = isFollowerCountText(compactText);
                    const isShortFollowerLabel = text.length <= 48 && [...texts].some(t => text === t || compactText === String(t || '').replace(/\s+/g, ''));
                    if (isCompactFollowerCount || isShortFollowerLabel) {
                        const target = clickableAncestor(el);
                        return { element: target, strategy: 'text_match', text, href: target.getAttribute?.('href') || '' };
                    }
                }
                return null;
            };

            Core.ThreeNoWatch.setScanState({
                status: 'collecting_followers',
                debug: {
                    step: 'finding_followers_trigger',
                    url: window.location.href,
                    candidates: snapshotCandidates().map(item => `${item.tag}${item.role ? `[${item.role}]` : ''}: ${item.text}`),
                },
            });

            const triggerInfo = await Utils.pollUntil(findTrigger, 10000, 250);
            if (!triggerInfo?.element) {
                Core.ThreeNoWatch.setScanState({
                    status: 'collecting_followers',
                    debug: {
                        step: 'followers_trigger_not_found',
                        url: window.location.href,
                        candidates: snapshotCandidates(16).map(item => `${item.tag}${item.role ? `[${item.role}]` : ''}: ${item.text}`),
                    },
                });
                return null;
            }

            const trigger = triggerInfo.element;
            Core.ThreeNoWatch.setScanState({
                status: 'collecting_followers',
                debug: {
                    step: 'click_followers_trigger',
                    strategy: triggerInfo.strategy,
                    targetText: triggerInfo.text,
                    targetTag: trigger.tagName?.toLowerCase?.() || '',
                    targetRole: trigger.getAttribute?.('role') || '',
                    targetHref: triggerInfo.href || trigger.getAttribute?.('href') || '',
                    url: window.location.href,
                    candidates: snapshotCandidates(8).map(item => `${item.tag}: ${item.text}`),
                },
            });

            Utils.simClick(trigger);
            let dialog = await Utils.pollUntil(() => Core.ThreeNoWatch.findActiveFollowersDialog(), 8000, 250);
            if (dialog) return dialog;

            Core.ThreeNoWatch.setScanState({
                status: 'collecting_followers',
                debug: {
                    step: 'first_click_no_dialog_retrying',
                    strategy: triggerInfo.strategy,
                    targetText: triggerInfo.text,
                    url: window.location.href,
                    dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                },
            });
            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            if (typeof trigger.click === 'function') trigger.click();
            dialog = await Utils.pollUntil(() => Core.ThreeNoWatch.findActiveFollowersDialog(), 10000, 250);
            Core.ThreeNoWatch.setScanState({
                status: 'collecting_followers',
                debug: {
                    step: dialog ? 'dialog_opened_after_retry' : 'dialog_not_found_after_retry',
                    strategy: triggerInfo.strategy,
                    targetText: triggerInfo.text,
                    url: window.location.href,
                    dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                    candidates: snapshotCandidates(12).map(item => `${item.tag}: ${item.text}`),
                },
            });
            return dialog;
        },

        findActiveFollowersDialog: () => {
            const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'))
                .filter(dialog => {
                    const rect = dialog.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });
            const linkSelector = 'a[href^="/@"], a[href*="threads.com/@"], a[href*="threads.net/@"]';
            const withLinks = dialogs.find(dialog => dialog.querySelector(linkSelector));
            return withLinks || dialogs[0] || null;
        },

        collectFollowerUsernames: async (dialog, owner, options = {}) => {
            const max = Math.max(1, parseInt(options.batchSize || Core.ThreeNoWatch.getBatchSize(), 10) || 200);
            const skipUsers = options.skipUsers instanceof Set
                ? options.skipUsers
                : new Set((Array.isArray(options.skipUsers) ? options.skipUsers : [])
                    .map(u => Core.ThreeNoWatch.normalizeUsername(u))
                    .filter(Boolean));
            const users = new Set();
            const triaged = new Set();
            const avatarSkippedUsers = new Set();
            const noAvatarCandidateUsers = new Set();
            const normalUsernameSkippedUsers = new Set();
            const suspiciousUsernameUsers = new Set();
            const seen = new Set();
            let stagnant = 0;
            await Core.ThreeNoWatch.waitForFollowersListMedia(dialog);
            const extract = () => {
                if (!dialog || !dialog.isConnected) {
                    dialog = Core.ThreeNoWatch.findActiveFollowersDialog();
                }
                const activeDialog = Core.ThreeNoWatch.findActiveFollowersDialog() || dialog;
                if (activeDialog) dialog = activeDialog;
                const beforeUsers = users.size;
                const beforeSeen = seen.size;
                if (!dialog) return false;
                dialog.querySelectorAll('a[href^="/@"], a[href*="threads.com/@"], a[href*="threads.net/@"]').forEach((a) => {
                    const href = a.getAttribute('href') || '';
                    const match = href.match(/\/@([^/?#]+)/);
                    const u = match ? Core.ThreeNoWatch.normalizeUsername(match[1]) : '';
                    if (!u || u === owner || u.includes('/post')) return;
                    seen.add(u);
                    if (skipUsers.has(u) || triaged.has(u)) return;
                    const suspiciousUsername = Core.ThreeNoWatch.usernameMatchesSuspiciousThreeNoCandidate(u);
                    const hasVisibleAvatar = CONFIG.THREE_NO_SCAN_PREFILTER_AVATAR === true
                        && Core.ThreeNoWatch.followerListRowHasVisibleAvatar(a);
                    triaged.add(u);
                    if (suspiciousUsername) suspiciousUsernameUsers.add(u);
                    if (hasVisibleAvatar && !suspiciousUsername) {
                        avatarSkippedUsers.add(u);
                        normalUsernameSkippedUsers.add(u);
                        return;
                    }
                    if (!hasVisibleAvatar) noAvatarCandidateUsers.add(u);
                    users.add(u);
                });
                return {
                    changedUsers: users.size > beforeUsers,
                    changedSeen: seen.size > beforeSeen,
                };
            };

            const maxIterations = Math.min(360, Math.max(24, Math.ceil((skipUsers.size + max) / 8)));
            let reachedEnd = false;
            let iterations = 0;
            let stopped = false;
            for (let i = 0; i < maxIterations && triaged.size < max; i++) {
                if (Core.ThreeNoWatch.isStopRequested()) {
                    stopped = true;
                    break;
                }
                iterations = i + 1;
                const changed = extract();
                stagnant = changed?.changedSeen ? 0 : stagnant + 1;
                if (!dialog || !dialog.isConnected) {
                    dialog = Core.ThreeNoWatch.findActiveFollowersDialog() || dialog;
                }
                const scroller = Core.ThreeNoWatch.findScrollContainer(dialog);
                const linkCount = dialog?.querySelectorAll?.('a[href^="/@"], a[href*="threads.com/@"], a[href*="threads.net/@"]')?.length || 0;
                const skippedKnown = Array.from(seen).filter(u => skipUsers.has(u)).length;
                const scrollTop = scroller ? Math.round(scroller.scrollTop || 0) : 0;
                const scrollHeight = scroller ? Math.round(scroller.scrollHeight || 0) : 0;
                const clientHeight = scroller ? Math.round(scroller.clientHeight || 0) : 0;
                const canScroll = scroller && scrollHeight > clientHeight + 20;
                const nearBottom = canScroll && scrollTop + clientHeight >= scrollHeight - 24;
                Core.ThreeNoWatch.setScanState({
                    status: 'collecting_followers',
                    candidateFollowersCount: users.size,
                    batchSize: max,
                    previousScannedCount: skipUsers.size,
                    skippedKnownFollowersCount: skippedKnown,
                    triagedFollowersCount: triaged.size,
                    avatarSkippedFollowersCount: avatarSkippedUsers.size,
                    noAvatarCandidateFollowersCount: noAvatarCandidateUsers.size,
                    normalUsernameSkippedFollowersCount: normalUsernameSkippedUsers.size,
                    suspiciousUsernameFollowersCount: suspiciousUsernameUsers.size,
                    debug: {
                        step: 'collect_followers_scroll',
                        candidateSummary: `已抓到備選名單：${users.size}`,
                        iteration: i + 1,
                        maxIterations,
                        usersCount: users.size,
                        triagedCount: triaged.size,
                        avatarSkipped: avatarSkippedUsers.size,
                        noAvatarCandidate: noAvatarCandidateUsers.size,
                        normalUsernameSkipped: normalUsernameSkippedUsers.size,
                        suspiciousUsername: suspiciousUsernameUsers.size,
                        seenCount: seen.size,
                        skippedKnown,
                        previousScannedCount: skipUsers.size,
                        usersSample: Array.from(users).slice(0, 15),
                        linkCount,
                        changedUsers: changed?.changedUsers === true,
                        changedSeen: changed?.changedSeen === true,
                        stagnant,
                        scrollerTag: scroller?.tagName?.toLowerCase?.() || '',
                        scrollerTop: scrollTop,
                        scrollerHeight: scrollHeight,
                        scrollerClientHeight: clientHeight,
                        nearBottom,
                    },
                });
                const step = Math.max(520, Math.floor((clientHeight || window.innerHeight || 700) * 0.9));
                const scrollTargets = [scroller, dialog, document.scrollingElement]
                    .filter(Boolean)
                    .filter((el, idx, arr) => arr.indexOf(el) === idx);
                scrollTargets.forEach((target) => {
                    try {
                        if (typeof target.scrollBy === 'function') target.scrollBy({ top: step, behavior: 'auto' });
                        target.scrollTop = (target.scrollTop || 0) + step;
                        target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: step }));
                        target.dispatchEvent(new Event('scroll', { bubbles: true }));
                    } catch (_) {
                        // keep trying other scroll targets
                    }
                });
                if (stagnant >= 12 && seen.size > 0 && nearBottom) {
                    reachedEnd = true;
                    break;
                }
                if (stagnant >= 24 && seen.size > 0) break;
                await Utils.safeSleep(500);
            }
            extract();
            const skippedKnown = Array.from(seen).filter(u => skipUsers.has(u)).length;
            const usernames = Array.from(users).slice(0, max);
            const triagedUsernames = Array.from(triaged);
            const avatarSkipped = avatarSkippedUsers.size;
            const noAvatarCandidate = noAvatarCandidateUsers.size;
            const normalUsernameSkipped = normalUsernameSkippedUsers.size;
            const suspiciousUsername = suspiciousUsernameUsers.size;
            const totalFollowersCount = Core.ThreeNoWatch.parseFollowersDialogTotal(dialog);
            const scannedAfterBatch = skipUsers.size + triagedUsernames.length;
            const knownMoreFromTotal = totalFollowersCount > 0 && scannedAfterBatch < totalFollowersCount;
            const exhaustedBeforeEnd = iterations >= maxIterations && triagedUsernames.length < max && !reachedEnd;
            const reachedActualEnd = totalFollowersCount > 0 && reachedEnd && !knownMoreFromTotal;
            const virtualListStalled = reachedEnd && !reachedActualEnd;
            const hasMore = stopped
                || knownMoreFromTotal
                || (!reachedActualEnd && (triagedUsernames.length >= max || exhaustedBeforeEnd || virtualListStalled));
            const endReason = stopped
                ? 'user_stopped'
                : (reachedActualEnd
                ? 'actual_end'
                : (virtualListStalled
                    ? 'virtual_list_stalled'
                    : (exhaustedBeforeEnd
                        ? 'max_iterations'
                        : (triagedUsernames.length >= max ? 'batch_size_reached' : 'open'))));
            Core.ThreeNoWatch.setScanState({
                status: 'collecting_followers',
                candidateFollowersCount: usernames.length,
                batchSize: max,
                previousScannedCount: skipUsers.size,
                skippedKnownFollowersCount: skippedKnown,
                triagedFollowersCount: triagedUsernames.length,
                avatarSkippedFollowersCount: avatarSkipped,
                noAvatarCandidateFollowersCount: noAvatarCandidate,
                normalUsernameSkippedFollowersCount: normalUsernameSkipped,
                suspiciousUsernameFollowersCount: suspiciousUsername,
                hasMore,
                totalFollowersCount,
                debug: {
                    step: 'collect_followers_done',
                    usersCount: usernames.length,
                    triagedCount: triagedUsernames.length,
                    avatarSkipped,
                    noAvatarCandidate,
                    normalUsernameSkipped,
                    suspiciousUsername,
                    seenCount: seen.size,
                    skippedKnown,
                    previousScannedCount: skipUsers.size,
                    totalFollowersCount,
                    scannedAfterBatch,
                    knownMoreFromTotal,
                    reachedEnd: reachedActualEnd,
                    virtualListStalled,
                    exhaustedBeforeEnd,
                        hasMore,
                        endReason,
                        usersSample: usernames.slice(0, 20),
                        max,
                        stopped,
                    },
                });
            return {
                usernames,
                triagedUsernames,
                seenCount: seen.size,
                skippedKnown,
                avatarSkipped,
                noAvatarCandidate,
                normalUsernameSkipped,
                suspiciousUsername,
                reachedEnd: reachedActualEnd,
                hasMore,
                endReason,
                virtualListStalled,
                stopped,
                batchSize: max,
                totalFollowersCount,
            };
        },

        waitForFollowersListMedia: async (dialog) => {
            const hasUsableRows = () => {
                const activeDialog = Core.ThreeNoWatch.findActiveFollowersDialog() || dialog;
                if (!activeDialog) return false;
                const links = activeDialog.querySelectorAll('a[href^="/@"], a[href*="threads.com/@"], a[href*="threads.net/@"]');
                const avatars = Array.from(activeDialog.querySelectorAll('img')).filter(img => {
                    const rect = img.getBoundingClientRect();
                    const src = String(img.currentSrc || img.src || '');
                    return rect.width >= 30
                        && rect.height >= 30
                        && rect.top >= 0
                        && rect.top <= window.innerHeight
                        && !!src
                        && !src.startsWith('data:');
                });
                return links.length >= 3 && avatars.length >= 1;
            };
            await Utils.pollUntil(hasUsableRows, 3500, 250).catch(() => null);
            await Utils.safeSleep(500);
        },

        parseFollowersDialogTotal: (dialog) => {
            const activeDialog = Core.ThreeNoWatch.findActiveFollowersDialog() || dialog;
            const text = (activeDialog?.innerText || activeDialog?.textContent || '').replace(/\s+/g, ' ').trim();
            const patterns = [
                /粉絲\s*([\d,.\s]+(?:萬|万)?)/,
                /([\d,.\s]+(?:萬|万)?)\s*位粉絲/,
                /Followers\s*([\d,.\s]+[KMB]?)/i,
            ];
            for (const pattern of patterns) {
                const match = text.match(pattern);
                const count = match ? Core.ThreeNoWatch.parseHumanCount(match[1]) : 0;
                if (count > 0) return count;
            }
            return 0;
        },

        parseHumanCount: (value = '') => {
            const raw = String(value || '').replace(/\s+/g, '').trim();
            if (!raw) return 0;
            const normalized = raw.replace(/,/g, '');
            const numeric = parseFloat(normalized.replace(/[^\d.]/g, ''));
            if (!Number.isFinite(numeric) || numeric <= 0) return 0;
            if (/[萬万]/.test(raw)) return Math.round(numeric * 10000);
            if (/k/i.test(raw)) return Math.round(numeric * 1000);
            if (/m/i.test(raw)) return Math.round(numeric * 1000000);
            if (/b/i.test(raw)) return Math.round(numeric * 1000000000);
            return Math.round(numeric);
        },

        usernameMatchesSuspiciousThreeNoCandidate: (username) => {
            const raw = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            const compact = raw.replace(/[._-]+/g, '');
            if (!compact) return false;
            if (/^a09\d{8}$/.test(compact)) return true;

            const animals = [
                'cat', 'kitty', 'dog', 'puppy', 'bird', 'fish', 'rabbit', 'bunny', 'bear', 'panda',
                'tiger', 'lion', 'wolf', 'fox', 'deer', 'duck', 'goose', 'horse', 'cow', 'pig',
                'sheep', 'goat', 'monkey', 'mouse', 'rat', 'hamster', 'koala', 'shark', 'whale',
                'eagle', 'owl', 'frog', 'snake', 'turtle', 'dragon', 'dolphin', 'penguin', 'otter',
                'swan', 'bee', 'ant', 'crab', 'seal', 'zebra', 'giraffe', 'leopard', 'cheetah',
            ];
            const animalPrefix = animals.find(animal => compact.startsWith(animal));
            if (!animalPrefix) return false;
            const tail = compact.slice(animalPrefix.length);
            return /^\d{4,}$/.test(tail) || /^[a-z]{0,4}\d{4,}[a-z0-9]{0,6}$/.test(tail);
        },

        isAnonymousProfileAvatarSrc: (src = '') => {
            const value = String(src || '');
            if (!value) return false;
            const candidates = [value];
            try {
                candidates.push(decodeURIComponent(value));
            } catch (_) {
                // Keep raw URL matching below.
            }
            return candidates.some(candidate => (
                /anonymous[_-]?profile[_-]?pic/i.test(candidate)
                || /ig_cache_key=YW5vbnltb3VzX3Byb2ZpbGVfcGlj/i.test(candidate)
                || /\/573323465_1219825463302212_7278921664109726296_n\.png(?:\?|$)/i.test(candidate)
                || /\/5OTfmveiK1K\.jpg(?:\?|$)/i.test(candidate)
            ));
        },

        followerListRowHasVisibleAvatar: (link) => {
            const href = link.getAttribute?.('href') || '';
            const match = href.match(/\/@([^/?#]+)/);
            const username = match ? Core.ThreeNoWatch.normalizeUsername(match[1]) : '';
            const isVisibleAvatarImage = (img) => {
                const rect = img.getBoundingClientRect();
                if (rect.width < 30 || rect.height < 30) return false;
                const ratio = rect.width / Math.max(1, rect.height);
                if (ratio < 0.72 || ratio > 1.38) return false;
                const src = String(img.currentSrc || img.src || '');
                if (!src || src.startsWith('data:')) return false;
                if (Core.ThreeNoWatch.isAnonymousProfileAvatarSrc(src)) return false;
                return true;
            };

            if (Array.from(link.querySelectorAll?.('img') || []).some(isVisibleAvatarImage)) return true;

            let node = link;
            let row = null;
            for (let depth = 0; node && depth < 14; depth++) {
                const rect = node.getBoundingClientRect?.();
                const hasAvatarImage = Array.from(node.querySelectorAll?.('img') || []).some(isVisibleAvatarImage);
                const userLinks = Array.from(node.querySelectorAll?.('a[href^="/@"], a[href*="threads.com/@"], a[href*="threads.net/@"]') || [])
                    .filter(a => {
                        const h = a.getAttribute('href') || '';
                        const m = h.match(/\/@([^/?#]+)/);
                        return Core.ThreeNoWatch.normalizeUsername(m?.[1] || '') === username;
                    });
                const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ');
                const hasRowAction = /追蹤|正在追蹤|Follow|Following/.test(text);
                const looksLikeSingleRow = rect
                    && rect.width >= 220
                    && rect.height >= 42
                    && rect.height <= 150
                    && userLinks.length >= 1
                    && (hasRowAction || text.includes(username));
                if (looksLikeSingleRow) {
                    row = node;
                    if (hasAvatarImage) break;
                }
                if (node.getAttribute?.('role') === 'dialog') break;
                node = node.parentElement;
            }

            const root = row || link.parentElement || link;
            return Array.from(root.querySelectorAll?.('img') || [])
                .filter(isVisibleAvatarImage)
                .filter(img => {
                    const imgRect = img.getBoundingClientRect();
                    const rowRect = root.getBoundingClientRect?.();
                    if (!rowRect) return true;
                    return imgRect.left >= rowRect.left - 4
                        && imgRect.right <= rowRect.right + 4
                        && imgRect.top >= rowRect.top - 8
                        && imgRect.bottom <= rowRect.bottom + 8;
                })
                .length > 0;
        },

        findScrollContainer: (root) => {
            if (!root) return null;
            const nodes = [root, ...Array.from(root.querySelectorAll('div'))];
            return nodes
                .filter(el => el.scrollHeight > el.clientHeight + 80)
                .sort((a, b) => (b.scrollHeight - b.clientHeight) - (a.scrollHeight - a.clientHeight))[0] || root;
        },

        navigateToProfile: async (index) => {
            const runtime = Core.ThreeNoWatch.getRuntime();
            const username = (Array.isArray(runtime.usernames) ? runtime.usernames : [])[index];
            if (!username) {
                await Core.ThreeNoWatch.finishScan({ status: 'completed' });
                return;
            }
            Core.ThreeNoWatch.setScanState({
                scanId: runtime.scanId || '',
                scanDate: runtime.scanDate || Core.ThreeNoWatch.getLocalDayKey(),
                status: 'checking_profiles',
                startedAt: runtime.startedAt || 0,
                checkedFollowersCount: index,
                threeNoFollowersCount: Array.isArray(runtime.findings) ? runtime.findings.length : 0,
                current: username,
                candidateFollowersCount: Array.isArray(runtime.usernames) ? runtime.usernames.length : 0,
                batchSize: runtime.batchSize || Core.ThreeNoWatch.getBatchSize(),
                previousScannedCount: runtime.previousScannedCount || 0,
                hasMore: runtime.hasMore === true,
                debug: {
                    step: 'navigate_to_profile',
                    index,
                    username,
                    previousScannedCount: runtime.previousScannedCount || 0,
                    nextUrl: Core.ThreeNoWatch.profileUrl(username),
                    runtimeUsersCount: Array.isArray(runtime.usernames) ? runtime.usernames.length : 0,
                },
            });
            const url = new URL(Core.ThreeNoWatch.profileUrl(username));
            url.searchParams.set('hege_bg', 'true');
            url.searchParams.set('hege_popup', 'true');
            url.searchParams.set('hege_three_no_scan', 'true');
            url.searchParams.set('hege_three_no_phase', 'profile');
            url.searchParams.set('hege_three_no_run', runtime.scanId || '');
            location.assign(url.toString());
        },

        enqueueAutoBlock: (payload = {}) => {
            const users = Array.isArray(payload.users) ? payload.users : [];
            const targets = [...new Set(users
                .map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || item || ''))
                .filter(Boolean))];
            if (targets.length === 0) return { ok: false, added: 0, skipped: 0, reason: 'empty_targets' };

            const db = new Set(Storage.getBlockDB());
            const cooldownQueue = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
            const currentQueue = Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []);
            const queued = new Set(currentQueue);
            const toAdd = targets.filter(username => !db.has(username) && !cooldownQueue.has(username) && !queued.has(username));
            if (toAdd.length > 0) {
                Core.setBlockContext(toAdd, {
                    reason: 'three_no_follower_auto_block',
                    batch: payload.scanId || '',
                    sourceOwner: payload.scanTargetOwner || payload.owner || '',
                }, { preserveExisting: true });
                Storage.setJSON(CONFIG.KEYS.BG_QUEUE, [...new Set([...currentQueue, ...toAdd])]);
            }
            Storage.remove(CONFIG.KEYS.BG_CMD);
            Storage.set(CONFIG.KEYS.WORKER_MODE, 'block');
            Storage.remove('hege_worker_stats');
            return { ok: true, added: toAdd.length, skipped: targets.length - toAdd.length };
        },

        evaluateCurrentProfile: async (username) => {
            const u = Core.ThreeNoWatch.normalizeUsername(username || window.location.pathname.replace(/^\/@/, ''));
            const main = document.querySelector('main, div[role="main"]') || document.body;
            await Utils.pollUntil(() => main.querySelector('a, img, span[dir="auto"], div[dir="auto"]'), 8000, 250);
            window.scrollTo(0, Math.min(420, document.body.scrollHeight || 0));
            await Utils.safeSleep(500);
            window.scrollTo(0, 0);

            const profileTopText = Core.ThreeNoWatch.getProfileTopText(main, u);
            const hasBio = profileTopText.length > 1;
            const hasPosts = Core.ThreeNoWatch.profileHasPosts(main, u);
            const followerCount = Core.ThreeNoWatch.parseProfileFollowerCount(main);
            const metadata = await Core.ThreeNoWatch.extractProfileMetadata(main);
            const hasReplies = await Core.ThreeNoWatch.profileTabHasContent(main, u, ['回覆', '回文', 'Replies', 'Reply'], 'replies');
            const hasReposts = await Core.ThreeNoWatch.profileTabHasContent(main, u, ['轉發', '转发', 'Reposts', 'Repost'], 'reposts');
            const hasAvatar = Core.ThreeNoWatch.profileHasAvatar(main);
            const noAvatar = !hasAvatar;
            const noBio = !hasBio;
            const noPosts = !hasPosts;
            const noReplies = !hasReplies;
            const noReposts = !hasReposts;
            const suspiciousUsername = Core.ThreeNoWatch.usernameMatchesSuspiciousThreeNoCandidate(u);
            return {
                username: u,
                profileUrl: `https://www.threads.com/@${u}`,
                checkedAt: Date.now(),
                noAvatar,
                noBio,
                noPosts,
                noReplies,
                noReposts,
                suspiciousUsername,
                profileSignalsVersion: 3,
                noRepliesKnown: true,
                noRepostsKnown: true,
                followerCount: Number.isFinite(followerCount) ? followerCount : 0,
                followerCountKnown: Number.isFinite(followerCount),
                joinedAt: metadata.joinedAt,
                accountAgeDays: metadata.accountAgeDays,
                accountAgeBucket: metadata.accountAgeBucket,
                isNewAccount: metadata.isNewAccount,
                locationLabel: metadata.locationLabel,
                countryTag: metadata.countryTag,
                regionShared: metadata.regionShared,
                metadataSource: metadata.source || '',
                metadataDebug: metadata.debug || {},
                isThreeNo: noAvatar && (noBio || noPosts || noReplies || noReposts || suspiciousUsername),
            };
        },

        getProfileTopText: (root, username) => {
            const skip = new Set([
                username,
                `@${username}`,
                '追蹤', '追蹤中', '粉絲', '回覆', '串文', '轉發', '分享', '更多', '關於此個人檔案', '所在地點',
                'Follow', 'Following', 'Followers', 'Replies', 'Threads', 'Reposts', 'Share', 'More',
            ]);
            return Array.from(root.querySelectorAll('span[dir="auto"], div[dir="auto"]'))
                .filter(el => !el.closest('[role="dialog"]'))
                .filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 520;
                })
                .map(el => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean)
                .filter(text => !skip.has(text))
                .filter(text => !/^@[\w.-]+$/.test(text))
                .filter(text => !/^[\d,.\s萬万]+$/.test(text))
                .filter(text => !/^https?:\/\//i.test(text))
                .filter(text => !/已加入\s*\d{4}年|Joined\s+\w+\s+\d{4}/i.test(text))
                .slice(0, 5);
        },

        parseProfileFollowerCount: (root) => {
            const parseMatchedCount = (text = '') => {
                const compact = String(text || '').replace(/\s+/g, ' ').trim();
                const patterns = [
                    /([\d,.\s]+(?:萬|万)?)\s*位粉絲/,
                    /([\d,.\s]+(?:萬|万)?)\s*粉絲/,
                    /([\d,.\s]+[KMB]?)\s*followers/i,
                    /粉絲\s*([\d,.\s]+(?:萬|万)?)/,
                    /Followers\s*([\d,.\s]+[KMB]?)/i,
                ];
                for (const pattern of patterns) {
                    const match = compact.match(pattern);
                    if (match) return Core.ThreeNoWatch.parseHumanCount(match[1]);
                }
                return null;
            };
            const nodes = Array.from((root || document.body).querySelectorAll('span[title], span[dir="auto"], div[dir="auto"], a, div[role="button"]'))
                .filter(el => !el.closest('[role="dialog"]'))
                .filter(el => {
                    const rect = el.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 620;
                });
            for (const el of nodes) {
                const values = [
                    el.getAttribute?.('title') || '',
                    el.innerText || '',
                    el.textContent || '',
                ].map(v => String(v || '').trim()).filter(Boolean);
                for (const value of values) {
                    const parsed = parseMatchedCount(value);
                    if (Number.isFinite(parsed)) return parsed;
                }
            }
            return null;
        },

        findProfileTab: (labels = [], kind = '', username = '') => {
            const normalizedLabels = labels.map(label => String(label || '').toLowerCase());
            const normalizedUser = Core.ThreeNoWatch.normalizeUsername(username);
            const kindPath = kind === 'replies'
                ? '/replies'
                : (kind === 'reposts' ? '/reposts' : '');
            const visible = (el) => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < 760;
            };
            const clickableAncestor = (el) => {
                let node = el;
                for (let depth = 0; node && depth < 8; depth++) {
                    if (node.matches?.('a, button, div[role="button"], [role="tab"], [tabindex="0"]')) return node;
                    if (window.getComputedStyle(node).cursor === 'pointer') return node;
                    node = node.parentElement;
                }
                return el.closest?.('a, button, div[role="button"], [role="tab"], [tabindex="0"]') || el;
            };
            if (kindPath) {
                const hrefMatch = Array.from(document.querySelectorAll('a[href]'))
                    .filter(el => !el.closest('[role="dialog"]'))
                    .filter(visible)
                    .find(el => {
                        const href = el.getAttribute('href') || '';
                        try {
                            const url = new URL(href, window.location.origin);
                            const path = decodeURIComponent(url.pathname);
                            return path.endsWith(kindPath)
                                && (!normalizedUser || path.includes(`/@${normalizedUser}`) || path.includes(`/@${encodeURIComponent(normalizedUser)}`));
                        } catch (_) {
                            return href.includes(kindPath);
                        }
                    });
                if (hrefMatch) return clickableAncestor(hrefMatch);
            }
            const candidates = Array.from(document.querySelectorAll('[role="tab"], a, button, div[role="button"], span[dir="auto"]'))
                .filter(el => !el.closest('[role="dialog"]'))
                .filter(visible)
                .map(el => {
                    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                    return { el, text, lower: text.toLowerCase() };
                })
                .filter(item => item.text && normalizedLabels.some(label => item.lower === label || item.lower.includes(label)));
            const direct = candidates.find(item => item.el.matches('a, button, div[role="button"], [role="tab"]'));
            if (direct) return direct.el;
            return candidates[0]?.el?.closest?.('a, button, div[role="button"], [role="tab"]') || null;
        },

        profileTabHasContent: async (root, username, labels = [], kind = '') => {
            const kindPath = kind === 'replies'
                ? '/replies'
                : (kind === 'reposts' ? '/reposts' : '');
            const alreadyOnKindPath = kindPath && decodeURIComponent(window.location.pathname).endsWith(kindPath);
            const tab = Core.ThreeNoWatch.findProfileTab(labels, kind, username);
            if (!tab && !alreadyOnKindPath) return false;
            const beforeText = (root.innerText || '').slice(0, 1400);
            const beforePath = window.location.pathname;
            if (tab) Utils.simClick(tab);
            await Utils.safeSleep(1100);
            await Utils.pollUntil(() => {
                const freshRoot = document.querySelector('main, div[role="main"]') || document.body;
                const current = (freshRoot.innerText || '').slice(0, 1400);
                const pathChangedToKind = kindPath && decodeURIComponent(window.location.pathname).endsWith(kindPath);
                return pathChangedToKind
                    || window.location.pathname !== beforePath
                    || current !== beforeText
                    || Core.ThreeNoWatch.profileSectionHasExplicitEmpty(freshRoot, kind);
            }, 3000, 250).catch(() => null);
            const freshRoot = document.querySelector('main, div[role="main"]') || document.body;
            return Core.ThreeNoWatch.profileSectionHasContent(freshRoot, username, kind);
        },

        profileSectionHasExplicitEmpty: (root, kind = '') => {
            const text = (root.innerText || '').replace(/\s+/g, ' ');
            const common = ['尚無貼文', '還沒有貼文', '沒有貼文', 'No posts yet', 'No threads yet'];
            const replies = ['尚無回覆', '還沒有回覆', '沒有回覆', 'No replies yet', 'No replies'];
            const reposts = ['尚無轉發', '還沒有轉發', '沒有轉發', '尚無轉貼', '還沒有轉貼', '沒有轉貼', 'No reposts yet', 'No reposts'];
            const phrases = kind === 'replies' ? replies : (kind === 'reposts' ? reposts : common);
            return phrases.some(t => text.includes(t)) || (kind === '' && common.some(t => text.includes(t)));
        },

        profileSectionHasContent: (root, username, kind = '') => {
            if (Core.ThreeNoWatch.profileSectionHasExplicitEmpty(root, kind)) return false;
            const postLinks = Array.from(root.querySelectorAll('a[href*="/post/"]'))
                .filter(a => !a.closest('[role="dialog"]'))
                .filter(a => {
                    const rect = a.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.top >= 120;
                });
            if (postLinks.length > 0) return true;
            if (kind === 'replies' || kind === 'reposts') {
                const articles = Array.from(root.querySelectorAll('article, [role="article"]'))
                    .filter(el => !el.closest('[role="dialog"]'))
                    .filter(el => {
                        const rect = el.getBoundingClientRect();
                        const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                        return rect.width > 0 && rect.height > 80 && rect.top >= 120 && text.length > 24;
                    });
                return articles.length > 0;
            }
            const activityButtons = Array.from(root.querySelectorAll('button, [role="button"]'))
                .filter(el => !el.closest('[role="dialog"]'))
                .filter(el => {
                    const rect = el.getBoundingClientRect();
                    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
                    return rect.width > 0
                        && rect.height > 0
                        && rect.top >= 220
                        && /(讚|回覆|轉發|分享|Like|Reply|Repost|Share)/i.test(text);
                });
            return activityButtons.length >= 2;
        },

        profileHasPosts: (root, username) => {
            const pattern = `/@${username}/post/`;
            const posts = Array.from(root.querySelectorAll('a[href*="/post/"]'))
                .filter(a => !a.closest('[role="dialog"]'))
                .filter(a => {
                    const href = a.getAttribute('href') || '';
                    return href.includes(pattern) || href.includes(`/@${encodeURIComponent(username)}/post/`);
                });
            if (posts.length > 0) return true;

            const text = (root.innerText || '').replace(/\s+/g, ' ');
            const explicitEmpty = [
                '尚無貼文', '還沒有貼文', '沒有貼文', 'No posts yet', 'No threads yet',
                'まだ投稿はありません', '아직 게시물이 없습니다'
            ].some(t => text.includes(t));
            return !explicitEmpty && posts.length > 0;
        },

        extractProfileMetadata: async (root) => {
            const parseFromText = (text = '', source = '') => {
                const joinedAt = Core.ThreeNoWatch.parseJoinedAt(text);
                const locationLabel = Core.ThreeNoWatch.parseLocationLabel(text);
                const accountAgeDays = joinedAt > 0
                    ? Math.max(0, Math.floor((Date.now() - joinedAt) / (24 * 3600 * 1000)))
                    : 0;
                return {
                    joinedAt,
                    accountAgeDays,
                    accountAgeBucket: Core.ThreeNoWatch.getAccountAgeBucket(accountAgeDays, joinedAt),
                    isNewAccount: joinedAt > 0 && accountAgeDays <= 93,
                    locationLabel,
                    countryTag: Core.ThreeNoWatch.getCountryTag(locationLabel),
                    regionShared: !!locationLabel && !/未分享|not shared|not available/i.test(locationLabel),
                    source,
                };
            };
            const clickableAncestor = (el) => {
                let node = el;
                for (let depth = 0; node && depth < 10; depth++) {
                    if (node.matches?.('a, button, [role="button"], [role="menuitem"], [tabindex="0"]')) return node;
                    if (window.getComputedStyle(node).cursor === 'pointer') return node;
                    node = node.parentElement;
                }
                return el.closest?.('a, button, [role="button"], [role="menuitem"], [tabindex="0"]') || el;
            };
            const findAboutDialog = () => Array.from(document.querySelectorAll('[role="dialog"]'))
                .filter(dialog => {
                    const rect = dialog.getBoundingClientRect();
                    const text = (dialog.innerText || dialog.textContent || '').replace(/\s+/g, ' ').trim();
                    return rect.width > 0
                        && rect.height > 0
                        && /關於此個人檔案|About this profile|已加入|Joined|所在地點|Location/i.test(text);
                })
                .pop() || null;

            const isVisible = (el) => {
                const rect = el?.getBoundingClientRect?.();
                return !!rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight;
            };
            const textOf = (el) => {
                if (!el) return '';
                const descendantAttrs = Array.from(el.querySelectorAll?.('[aria-label], [title], img[alt], svg[aria-label]') || [])
                    .map(node => [
                        node.getAttribute?.('aria-label') || '',
                        node.getAttribute?.('title') || '',
                        node.getAttribute?.('alt') || '',
                    ].join(' '))
                    .join(' ');
                return [
                    el.getAttribute?.('aria-label') || '',
                    el.getAttribute?.('title') || '',
                    el.getAttribute?.('alt') || '',
                    descendantAttrs,
                    el.innerText || '',
                    el.textContent || '',
                ].join(' ').replace(/\s+/g, ' ').trim();
            };
            const elementDebug = (el) => {
                if (!el) return null;
                const rect = el.getBoundingClientRect?.() || {};
                return {
                    tag: el.tagName?.toLowerCase?.() || '',
                    role: el.getAttribute?.('role') || '',
                    ariaLabel: el.getAttribute?.('aria-label') || '',
                    text: textOf(el).slice(0, 120),
                    rect: {
                        x: Math.round(rect.x || 0),
                        y: Math.round(rect.y || 0),
                        w: Math.round(rect.width || 0),
                        h: Math.round(rect.height || 0),
                    },
                };
            };
            const findAboutMenuItem = () => {
                const aboutPattern = /關於此個人檔案|關於此帳號資訊|About this profile|About this account/i;
                const directItems = Array.from(document.querySelectorAll('[role="menuitem"]'))
                    .filter(isVisible)
                    .filter(el => aboutPattern.test(textOf(el)));
                if (directItems.length > 0) {
                    return directItems.sort((a, b) => {
                        const ar = a.getBoundingClientRect();
                        const br = b.getBoundingClientRect();
                        return ar.top - br.top || ar.left - br.left;
                    })[0];
                }
                return Array.from(document.querySelectorAll('button, a, [role="button"], [tabindex="0"], span[dir="auto"]'))
                    .filter(isVisible)
                    .find(el => aboutPattern.test(textOf(el)));
            };
            const findProfileMoreButton = () => {
                const rootRect = (root || document.body).getBoundingClientRect?.() || { left: 0, right: window.innerWidth, top: 0, bottom: window.innerHeight };
                const contextTextOf = (el) => {
                    const pieces = [];
                    let node = el;
                    for (let depth = 0; node && depth < 7; depth++) {
                        const rect = node.getBoundingClientRect?.();
                        const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
                        if (text && rect && rect.width <= Math.max(rootRect.width || 0, 360) + 40 && rect.height <= 260) {
                            pieces.push(text);
                        }
                        node = node.parentElement;
                    }
                    return pieces.join(' ');
                };
                return Array.from(document.querySelectorAll('button, div[role="button"], [tabindex="0"]'))
                    .filter(el => !el.closest('[role="dialog"], [role="menu"]'))
                    .filter(isVisible)
                    .map(el => {
                        const rect = el.getBoundingClientRect();
                        const text = textOf(el);
                        const contextText = contextTextOf(el);
                        const inProfileColumn = rect.left >= rootRect.left - 8 && rect.right <= rootRect.right + 8;
                        const nearProfileHeader = rect.top >= Math.max(0, rootRect.top - 8) && rect.top < Math.min(420, rootRect.top + 360);
                        const looksLikeIconButton = rect.width <= 120 && rect.height <= 120;
                        const likelyProfileAction = /Instagram|IG|粉絲|位粉絲|Followers|追蹤|Follow|提及|Mention/i.test(contextText);
                        const likelyColumnTitle = /直欄標題|column title/i.test(contextText);
                        return {
                            el,
                            rect,
                            score: likelyProfileAction ? 0 : (likelyColumnTitle || rect.top <= rootRect.top + 48 ? 2 : 1),
                            valid: inProfileColumn
                            && nearProfileHeader
                            && looksLikeIconButton
                            && /更多|More/i.test(text),
                        };
                    })
                    .filter(item => item.valid)
                    .sort((a, b) => {
                        const ar = a.rect;
                        const br = b.rect;
                        return a.score - b.score || ar.top - br.top || br.left - ar.left;
                    })[0]?.el || null;
            };

            const initial = parseFromText(root.innerText || document.body.innerText || '', 'page_fallback');

            let aboutTrigger = findAboutMenuItem();
            let moreTarget = null;
            let menuOpened = !!aboutTrigger;
            if (!aboutTrigger) {
                moreTarget = findProfileMoreButton();
                if (moreTarget) {
                    Core.ThreeNoWatch.setScanState({
                        debug: {
                            step: 'about_more_click',
                            moreButton: elementDebug(moreTarget),
                            url: window.location.href,
                        },
                    });
                    Utils.simClick(moreTarget);
                    await Utils.safeSleep(500);
                    aboutTrigger = await Utils.pollUntil(findAboutMenuItem, 2200, 150).catch(() => null);
                    menuOpened = !!aboutTrigger;
                }
            }
            if (aboutTrigger) {
                const target = clickableAncestor(aboutTrigger);
                Core.ThreeNoWatch.setScanState({
                    debug: {
                        step: 'about_menu_item_click',
                        moreButtonFound: !!moreTarget,
                        moreButton: elementDebug(moreTarget),
                        aboutTrigger: elementDebug(aboutTrigger),
                        aboutTarget: elementDebug(target),
                        url: window.location.href,
                    },
                });
                Utils.simClick(target);
                await Utils.safeSleep(900);
                const dialog = await Utils.pollUntil(findAboutDialog, 4000, 250).catch(() => null);
                Core.ThreeNoWatch.setScanState({
                    debug: {
                        step: 'about_dialog_checked',
                        moreButtonFound: !!moreTarget,
                        aboutMenuOpened: menuOpened,
                        aboutDialogFound: !!dialog,
                        aboutDialogText: (dialog?.innerText || dialog?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
                        url: window.location.href,
                    },
                });
                const parsed = parseFromText(dialog?.innerText || dialog?.textContent || '', dialog ? 'about_dialog' : 'about_dialog_missing');
                const close = dialog?.querySelector?.('button[aria-label="關閉"], button[aria-label="Close"], [role="button"][aria-label="關閉"], [role="button"][aria-label="Close"]');
                if (close) Utils.simClick(close);
                else if (dialog) {
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
                    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
                }
                if (parsed.joinedAt > 0 || parsed.locationLabel) {
                    parsed.debug = {
                        aboutClicked: true,
                        aboutMenuOpened: menuOpened,
                        moreButtonFound: !!moreTarget,
                        moreButtonText: textOf(moreTarget).slice(0, 80),
                        aboutTargetTag: target.tagName?.toLowerCase?.() || '',
                        aboutTargetRole: target.getAttribute?.('role') || '',
                        aboutTargetText: textOf(target).slice(0, 80),
                        aboutDialogFound: !!dialog,
                        aboutDialogText: (dialog?.innerText || dialog?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
                    };
                    return parsed;
                }
                initial.debug = {
                    aboutClicked: true,
                    aboutMenuOpened: menuOpened,
                    moreButtonFound: !!moreTarget,
                    moreButtonText: textOf(moreTarget).slice(0, 80),
                    aboutTargetTag: target.tagName?.toLowerCase?.() || '',
                    aboutTargetRole: target.getAttribute?.('role') || '',
                    aboutTargetText: textOf(target).slice(0, 80),
                    aboutDialogFound: !!dialog,
                    aboutDialogText: (dialog?.innerText || dialog?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
                    fallbackJoinedAt: initial.joinedAt,
                    fallbackLocationLabel: initial.locationLabel,
                };
                return initial;
            }
            initial.debug = {
                aboutClicked: false,
                aboutTriggerFound: false,
                moreButtonFound: !!moreTarget,
                moreButtonText: textOf(moreTarget).slice(0, 80),
            };
            return initial;
        },

        parseJoinedAt: (text = '') => {
            const value = String(text || '').replace(/\s+/g, ' ');
            const zh = value.match(/已加入\s*(\d{4})年\s*(\d{1,2})月/);
            if (zh) return new Date(parseInt(zh[1], 10), parseInt(zh[2], 10) - 1, 1).getTime();
            const en = value.match(/Joined\s+([A-Za-z]+)\s+(\d{4})/i);
            if (en) {
                const months = {
                    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
                    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8,
                    sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
                };
                const month = months[String(en[1] || '').toLowerCase()];
                const year = parseInt(en[2], 10);
                if (Number.isFinite(month) && Number.isFinite(year)) return new Date(year, month, 1).getTime();
            }
            return 0;
        },

        parseLocationLabel: (text = '') => {
            const lines = String(text || '').split(/\n|·/).map(v => v.replace(/\s+/g, ' ').trim()).filter(Boolean);
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const inline = line.match(/所在地點\s*[:：]?\s*(.+)$/) || line.match(/Location\s*[:：]?\s*(.+)$/i);
                if (inline && inline[1]) {
                    const cleaned = inline[1]
                        .replace(/\s*(已加入|Joined|帳號建立|Account created|關於此個人檔案|About this profile).*$/i, '')
                        .trim();
                    if (cleaned) return cleaned;
                }
                if (/^所在地點$|^Location$/i.test(line) && lines[i + 1]) return lines[i + 1].trim();
            }
            if (/地區未分享|所在地點未分享|Location not shared/i.test(text)) return '地區未分享';
            return '';
        },

        getAccountAgeBucket: (ageDays = 0, joinedAt = 0) => {
            if (!joinedAt) return '';
            if (ageDays <= 93) return '低於3個月';
            if (ageDays <= 186) return '低於半年';
            if (ageDays <= 366) return '低於一年';
            return '超過一年';
        },

        getCountryTag: (locationLabel = '') => {
            const text = String(locationLabel || '').trim();
            if (!text || /未分享|not shared|not available/i.test(text)) return '地區未分享';
            const rules = [
                ['台灣', /台灣|臺灣|taiwan|taipei|kaohsiung|taichung|tainan/i],
                ['中國', /中國|大陆|china|beijing|shanghai|shenzhen|guangzhou/i],
                ['香港', /香港|hong kong/i],
                ['日本', /日本|japan|tokyo|osaka/i],
                ['韓國', /韓國|南韓|korea|seoul/i],
                ['美國', /美國|usa|united states|america|california|new york/i],
                ['加拿大', /加拿大|canada/i],
                ['澳洲', /澳洲|australia/i],
                ['英國', /英國|united kingdom|uk|london/i],
            ];
            const match = rules.find(([, pattern]) => pattern.test(text));
            return match ? match[0] : text.slice(0, 18);
        },

        profileHasAvatar: (root) => {
            const imgs = Array.from(root.querySelectorAll('img'))
                .filter(img => !img.closest('[role="dialog"]'))
                .filter(img => {
                    const rect = img.getBoundingClientRect();
                    return rect.width >= 36 && rect.height >= 36 && rect.top >= 0 && rect.top < 420;
                })
                .filter(img => {
                    const src = String(img.currentSrc || img.src || '');
                    if (!src || src.startsWith('data:')) return false;
                    if (Core.ThreeNoWatch.isAnonymousProfileAvatarSrc(src)) return false;
                    return true;
                });
            return imgs.length > 0;
        },

        finishScan: async (patch = {}) => {
            const runtime = Core.ThreeNoWatch.getRuntime();
            const findings = Array.isArray(runtime.findings) ? runtime.findings : [];
            const batchUsernames = Array.isArray(runtime.usernames) ? runtime.usernames : [];
            const triagedUsernames = Array.isArray(runtime.triagedUsernames) && runtime.triagedUsernames.length > 0
                ? runtime.triagedUsernames
                : batchUsernames;
            const owner = Core.ThreeNoWatch.normalizeUsername(runtime.owner || '');
            const scanDate = runtime.scanDate || Core.ThreeNoWatch.getLocalDayKey();
            const completedAt = Date.now();
            const status = patch.status || 'completed';
            const completed = status === 'completed';
            const stopped = status === 'stopped';
            const shouldPersistFindings = completed || stopped;
            const cursor = Storage.getThreeNoScanCursor();
            const cursorMatches = owner && cursor.owner === owner && cursor.reachedEnd !== true;
            const baseScannedUsers = cursorMatches ? cursor.scannedUsers : [];
            const checkedCandidateCount = stopped
                ? Math.max(0, Math.min(batchUsernames.length, parseInt(runtime.index || '0', 10) || 0))
                : batchUsernames.length;
            const unprocessedCandidates = new Set(stopped
                ? batchUsernames.slice(checkedCandidateCount).map(u => Core.ThreeNoWatch.normalizeUsername(u)).filter(Boolean)
                : []);
            const scanProgressUsers = completed
                ? triagedUsernames
                : triagedUsernames.filter(u => !unprocessedCandidates.has(Core.ThreeNoWatch.normalizeUsername(u)));
            const scannedUsers = shouldPersistFindings
                ? [...new Set([...baseScannedUsers, ...scanProgressUsers].map(u => Core.ThreeNoWatch.normalizeUsername(u)).filter(Boolean))]
                : baseScannedUsers;
            const previousResults = Storage.getThreeNoScanResults();
            const previousFindings = shouldPersistFindings ? (previousResults.users || []) : [];
            const findingsByUser = new Map();
            [...previousFindings, ...findings].forEach(item => {
                const username = Core.ThreeNoWatch.normalizeUsername(item?.username || '');
                if (!username) return;
                const existing = findingsByUser.get(username);
                const scanDates = [...new Set([
                    ...(existing?.scanDates || []),
                    ...(Array.isArray(item.scanDates) ? item.scanDates : []),
                    item.scanDate || scanDate,
                ].map(v => String(v || '').trim()).filter(Boolean))];
                const targetOwners = [...new Set([
                    ...(existing?.targetOwners || []),
                    ...(Array.isArray(item.targetOwners) ? item.targetOwners : []),
                    item.scanTargetOwner || owner,
                ].map(v => Core.ThreeNoWatch.normalizeUsername(v)).filter(Boolean))];
                const checkedAt = parseInt(item.checkedAt || `${completedAt}`, 10) || completedAt;
                const firstSeenAt = Math.min(
                    existing?.firstSeenAt || checkedAt,
                    parseInt(item.firstSeenAt || `${checkedAt}`, 10) || checkedAt
                );
                const lastSeenAt = Math.max(
                    existing?.lastSeenAt || checkedAt,
                    parseInt(item.lastSeenAt || `${checkedAt}`, 10) || checkedAt
                );
                findingsByUser.set(username, {
                    ...(existing || {}),
                    username,
                    profileUrl: item.profileUrl || `https://www.threads.com/@${username}`,
                    checkedAt,
                    firstSeenAt,
                    lastSeenAt,
                    scanDate: item.scanDate || scanDate,
                    scanDates,
                    scanTargetOwner: item.scanTargetOwner || owner,
                    targetOwners,
                    noAvatar: existing?.noAvatar === true || item.noAvatar === true,
                    noBio: existing?.noBio === true || item.noBio === true,
                    noPosts: existing?.noPosts === true || item.noPosts === true,
                    noReplies: existing?.noReplies === true || item.noReplies === true,
                    noReposts: existing?.noReposts === true || item.noReposts === true,
                    suspiciousUsername: existing?.suspiciousUsername === true || item.suspiciousUsername === true,
                    profileSignalsVersion: Math.max(
                        parseInt(existing?.profileSignalsVersion || '0', 10) || 0,
                        parseInt(item.profileSignalsVersion || '0', 10) || 0
                    ),
                    noRepliesKnown: existing?.noRepliesKnown === true || item.noRepliesKnown === true,
                    noRepostsKnown: existing?.noRepostsKnown === true || item.noRepostsKnown === true,
                    followerCount: item.followerCountKnown === true
                        ? (parseInt(item.followerCount || '0', 10) || 0)
                        : (parseInt(existing?.followerCount || '0', 10) || 0),
                    followerCountKnown: existing?.followerCountKnown === true || item.followerCountKnown === true,
                    joinedAt: parseInt(item.joinedAt || existing?.joinedAt || '0', 10) || 0,
                    accountAgeDays: parseInt(item.accountAgeDays || existing?.accountAgeDays || '0', 10) || 0,
                    accountAgeBucket: String(item.accountAgeBucket || existing?.accountAgeBucket || ''),
                    isNewAccount: existing?.isNewAccount === true || item.isNewAccount === true,
                    locationLabel: String(item.locationLabel || existing?.locationLabel || ''),
                    countryTag: String(item.countryTag || existing?.countryTag || ''),
                    regionShared: existing?.regionShared === true || item.regionShared === true,
                    metadataSource: String(item.metadataSource || existing?.metadataSource || ''),
                    metadataDebug: item.metadataDebug && typeof item.metadataDebug === 'object'
                        ? item.metadataDebug
                        : (existing?.metadataDebug && typeof existing.metadataDebug === 'object' ? existing.metadataDebug : {}),
                });
            });
            const mergedFindings = Array.from(findingsByUser.values());
            const previousUsernames = new Set(previousFindings.map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || '')).filter(Boolean));
            const newUnignoredFindings = findings
                .map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || ''))
                .filter(Boolean)
                .filter(username => !previousUsernames.has(username))
                .filter(username => !Storage.isThreeNoUserIgnored(username));
            const hasMore = stopped ? true : (completed ? runtime.hasMore === true : runtime.hasMore === true);
            const batchSize = parseInt(runtime.batchSize || CONFIG.THREE_NO_SCAN_BATCH_SIZE || '200', 10) || 200;
            if (shouldPersistFindings && owner) {
                Storage.setThreeNoScanCursor({
                    owner,
                    startedAt: cursorMatches ? (cursor.startedAt || runtime.startedAt || completedAt) : (runtime.startedAt || completedAt),
                    updatedAt: completedAt,
                    batchesCompleted: (cursorMatches ? cursor.batchesCompleted : 0) + (completed ? 1 : 0),
                    reachedEnd: completed ? hasMore !== true : false,
                    scannedUsers,
                });
            }
            const scanId = runtime.scanId || patch.scanId || `three-no:${scanDate}:${completedAt}`;
            const autoBlockRequested = completed && status === 'completed' && Storage.isThreeNoAutoBlockEnabled && Storage.isThreeNoAutoBlockEnabled();
            const autoBlockResult = autoBlockRequested
                ? Core.ThreeNoWatch.enqueueAutoBlock({
                    scanId,
                    scanTargetOwner: owner,
                    users: findings,
                })
                : { ok: false, added: 0, skipped: 0 };
            const payload = Storage.setThreeNoScanResults({
                scanId,
                scanTargetOwner: owner,
                scanDate,
                status,
                startedAt: runtime.startedAt || 0,
                completedAt,
                checkedFollowersCount: shouldPersistFindings ? scannedUsers.length : batchUsernames.length,
                batchCheckedFollowersCount: triagedUsernames.length,
                candidateFollowersCount: batchUsernames.length,
                triagedFollowersCount: triagedUsernames.length,
                previousScannedCount: baseScannedUsers.length,
                threeNoFollowersCount: shouldPersistFindings ? mergedFindings.length : findings.length,
                limited: hasMore,
                hasMore,
                batchSize,
                autoBlockStarted: autoBlockRequested && autoBlockResult.ok === true,
                autoBlockQueuedCount: autoBlockRequested ? autoBlockResult.added : 0,
                error: patch.error || '',
                debug: patch.debug || {},
                users: shouldPersistFindings ? mergedFindings : findings,
            });
            Storage.set(CONFIG.KEYS.THREE_NO_LAST_SCAN_DATE, scanDate);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            Storage.setThreeNoUnreadCount(payload.autoBlockStarted ? 0 : Math.max(Storage.getThreeNoUnreadCount(), newUnignoredFindings.length || payload.threeNoFollowersCount));
            sessionStorage.removeItem(Core.ThreeNoWatch.stateKey);
            localStorage.removeItem(Core.ThreeNoWatch.runtimeBackupKey);
            Core.ThreeNoWatch.setScanState({
                ...payload,
                users: undefined,
                debug: {
                    ...(patch.debug || {}),
                    autoBlockStarted: payload.autoBlockStarted,
                    autoBlockQueuedCount: payload.autoBlockQueuedCount,
                },
            });
            if (completed) {
                try {
                    await UI.tryUploadThreeNoScanStats({ scanId: payload.scanId });
                } catch (err) {
                    if (CONFIG.DEBUG_MODE) console.warn('[留友封][ThreeNo] stats upload skipped/failed', err);
                }
            }
            if (payload.autoBlockStarted && payload.autoBlockQueuedCount > 0) {
                setTimeout(() => {
                    const url = new URL(`${window.location.origin}/`);
                    url.searchParams.set('hege_bg', 'true');
                    url.searchParams.set('hege_popup', 'true');
                    location.assign(url.toString());
                }, 900);
                return;
            }
            if (Utils.isBetaBuild() || stopped) {
                return;
            }
            setTimeout(() => {
                try {
                    window.close();
                } catch (_) {
                    window.close();
                }
            }, 800);
        },
    },
});
