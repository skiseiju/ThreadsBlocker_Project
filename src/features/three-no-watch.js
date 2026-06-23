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
        networkContentHints: {},

        isChromeExtension: () => Reporter.getClientPlatform() === 'chrome_extension',

        isScanPage: () => new URLSearchParams(window.location.search).get('hege_three_no_scan') === 'true',

        isStopRequested: () => Storage.get(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, '') === 'stop',

        runningStatuses: ['starting', 'running', 'collecting_followers', 'followers_collected', 'checking_profiles', 'stopping'],

        isRunningStatus: (status = '') => Core.ThreeNoWatch.runningStatuses.includes(String(status || '')),

        getDebugSchemaVersion: () => 'network-discovery-v6',

        resetOldDebugSchemaIfNeeded: () => {
            if (!Utils.isBetaBuild()) return false;
            const key = CONFIG.KEYS.THREE_NO_SCAN_DEBUG_SCHEMA || 'hege_three_no_scan_debug_schema';
            const next = Core.ThreeNoWatch.getDebugSchemaVersion();
            const previous = Storage.get(key, '');
            if (previous === next) return false;
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, []);
            Storage.set(key, next);
            return true;
        },

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

        profileProbeUrl: (username, probeKind = 'base') => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username);
            const suffix = probeKind === 'replies'
                ? '/replies'
                : (probeKind === 'reposts' ? '/reposts' : '');
            return `${window.location.origin}/@${encodeURIComponent(normalized)}${suffix}`;
        },

        isOnProfileProbePath: (username = '', probeKind = 'base') => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            if (!normalized) return false;
            const suffix = probeKind === 'replies'
                ? '/replies'
                : (probeKind === 'reposts' ? '/reposts' : '');
            const path = decodeURIComponent(window.location.pathname || '').replace(/\/+$/, '').toLowerCase();
            return path === `/@${normalized}${suffix}`;
        },

        getProfileSignalsVersion: () => 9,

        getBatchSize: () => Math.max(1, parseInt(CONFIG.THREE_NO_SCAN_BATCH_SIZE || '200', 10) || 200),

        isFreshRunningState: (state = {}, now = Date.now()) => {
            const status = String(state.status || '');
            if (!Core.ThreeNoWatch.isRunningStatus(status)) return false;
            const updatedAt = parseInt(state.updatedAt || '0', 10) || 0;
            const heartbeatAt = parseInt(state.workerHeartbeatAt || '0', 10) || 0;
            if (heartbeatAt > 0) return now - heartbeatAt < 25 * 1000;
            return updatedAt > 0 && now - updatedAt < 30 * 1000;
        },

        sanitizeDebugValue: (value, depth = 0) => {
            if (value === null || value === undefined) return value;
            if (typeof value === 'number' || typeof value === 'boolean') return value;
            if (typeof value === 'string') return value.slice(0, 500);
            if (Array.isArray(value)) {
                return value.slice(0, 30).map(item => Core.ThreeNoWatch.sanitizeDebugValue(item, depth + 1));
            }
            if (typeof value === 'object') {
                if (depth >= 4) return '[object]';
                return Object.fromEntries(Object.entries(value)
                    .slice(0, 40)
                    .map(([key, item]) => [key, Core.ThreeNoWatch.sanitizeDebugValue(item, depth + 1)]));
            }
            return String(value).slice(0, 500);
        },

        getScanDebugLog: (scanId = '') => {
            const raw = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, []);
            const rows = Array.isArray(raw) ? raw : [];
            const target = String(scanId || '').trim();
            return target ? rows.filter(row => row?.scanId === target) : rows;
        },

        resetScanDebugLog: (scanId = '') => {
            const target = String(scanId || '').trim();
            if (!target) {
                Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, []);
                return;
            }
            const rows = Core.ThreeNoWatch.getScanDebugLog()
                .filter(row => row?.scanId !== target);
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, rows.slice(-600));
        },

        appendScanDebugLog: (state = {}) => {
            const debug = state.debug && typeof state.debug === 'object' ? state.debug : null;
            if (!debug || !debug.step) return;
            const scanId = String(state.scanId || debug.scanId || '').trim();
            const rows = Core.ThreeNoWatch.getScanDebugLog();
            const now = Date.now();
            const scanRows = scanId ? rows.filter(row => row?.scanId === scanId) : rows;
            const previousSeq = scanRows.reduce((max, row) => {
                const seq = parseInt(row?.seq || '0', 10) || 0;
                return seq > max ? seq : max;
            }, 0);
            const startedAt = parseInt(state.startedAt || debug.startedAt || '0', 10) || 0;
            const entry = {
                seq: previousSeq + 1,
                ts: now,
                iso: new Date(now).toISOString(),
                scanElapsedMs: startedAt > 0 ? Math.max(0, now - startedAt) : 0,
                scanId,
                status: String(state.status || ''),
                current: String(state.current || debug.username || ''),
                index: Number.isFinite(parseInt(debug.index || state.checkedFollowersCount || '0', 10))
                    ? (parseInt(debug.index || state.checkedFollowersCount || '0', 10) || 0)
                    : 0,
                step: String(debug.step || ''),
                url: String(debug.url || window.location.href || '').slice(0, 500),
                debug: Core.ThreeNoWatch.sanitizeDebugValue(debug),
            };
            rows.push(entry);
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, rows.slice(-600));
        },

        appendNetworkDiscoveryLog: (detail = {}) => {
            if (!Utils.isBetaBuild()) return;
            const state = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            Core.ThreeNoWatch.recordNetworkContentHint(detail, state);
            const rows = Core.ThreeNoWatch.getScanDebugLog();
            const now = Date.now();
            const scanId = String(state.scanId || '').trim();
            const scanRows = scanId ? rows.filter(row => row?.scanId === scanId) : rows;
            const previousSeq = scanRows.reduce((max, row) => {
                const seq = parseInt(row?.seq || '0', 10) || 0;
                return seq > max ? seq : max;
            }, 0);
            const startedAt = parseInt(state.startedAt || '0', 10) || 0;
            rows.push({
                seq: previousSeq + 1,
                ts: now,
                iso: new Date(now).toISOString(),
                scanElapsedMs: startedAt > 0 ? Math.max(0, now - startedAt) : 0,
                scanId,
                status: String(state.status || ''),
                current: String(state.current || ''),
                index: parseInt(state.checkedFollowersCount || '0', 10) || 0,
                step: 'network_discovery',
                url: String(window.location.href || '').slice(0, 500),
                debug: Core.ThreeNoWatch.sanitizeDebugValue({
                    source: 'passive_page_bridge',
                    schema: Core.ThreeNoWatch.getDebugSchemaVersion(),
                    workerMode: Storage.get(CONFIG.KEYS.WORKER_MODE, ''),
                    blockQueueLength: Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []).length,
                    reportQueueLength: Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length,
                    ...detail,
                }),
            });
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, rows.slice(-600));
        },

        networkHrefKindToProbeKind: (hrefKind = '') => {
            if (hrefKind === 'profile_replies') return 'replies';
            if (hrefKind === 'profile_reposts') return 'reposts';
            if (hrefKind === 'profile_base') return 'base';
            return '';
        },

        recordNetworkContentHint: (detail = {}, state = {}) => {
            if (detail?.url?.kind !== 'bulk_route') return false;
            const routePosts = parseInt(detail?.request?.routeUrls?.posts || '0', 10) || 0;
            if (routePosts <= 0) return false;
            const probeKind = Core.ThreeNoWatch.networkHrefKindToProbeKind(detail.hrefKind || '');
            if (!probeKind) return false;
            const username = Core.ThreeNoWatch.normalizeUsername(state.current || Core.ThreeNoWatch.getCurrentProfileUsername?.() || '').toLowerCase();
            if (!username) return false;
            const key = `${username}:${probeKind}`;
            Core.ThreeNoWatch.networkContentHints[key] = {
                hasContent: true,
                reason: `private_route_posts:${routePosts}`,
                routePosts,
                hrefKind: detail.hrefKind || '',
                capturedAt: Date.now(),
            };
            const entries = Object.entries(Core.ThreeNoWatch.networkContentHints);
            if (entries.length > 80) {
                Core.ThreeNoWatch.networkContentHints = Object.fromEntries(entries.slice(-80));
            }
            return true;
        },

        getNetworkContentHint: (username = '', kind = 'base', maxAgeMs = 20000) => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            const probeKind = kind === 'replies' || kind === 'reposts' ? kind : 'base';
            const hint = Core.ThreeNoWatch.networkContentHints[`${normalized}:${probeKind}`];
            if (!hint || hint.hasContent !== true) return null;
            if (Date.now() - (parseInt(hint.capturedAt || '0', 10) || 0) > maxAgeMs) return null;
            return hint;
        },

        appendNetworkActionMarker: (kind = '', detail = {}) => {
            if (!Utils.isBetaBuild()) return;
            const state = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            const rows = Core.ThreeNoWatch.getScanDebugLog();
            const now = Date.now();
            const scanId = String(state.scanId || '').trim();
            const scanRows = scanId ? rows.filter(row => row?.scanId === scanId) : rows;
            const previousSeq = scanRows.reduce((max, row) => {
                const seq = parseInt(row?.seq || '0', 10) || 0;
                return seq > max ? seq : max;
            }, 0);
            const startedAt = parseInt(state.startedAt || '0', 10) || 0;
            rows.push({
                seq: previousSeq + 1,
                ts: now,
                iso: new Date(now).toISOString(),
                scanElapsedMs: startedAt > 0 ? Math.max(0, now - startedAt) : 0,
                scanId,
                status: String(state.status || ''),
                current: String(detail.user || state.current || ''),
                index: parseInt(state.checkedFollowersCount || '0', 10) || 0,
                step: 'network_action_marker',
                url: String(window.location.href || '').slice(0, 500),
                debug: Core.ThreeNoWatch.sanitizeDebugValue({
                    source: 'content_action_marker',
                    schema: Core.ThreeNoWatch.getDebugSchemaVersion(),
                    kind,
                    workerMode: Storage.get(CONFIG.KEYS.WORKER_MODE, ''),
                    blockQueueLength: Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []).length,
                    reportQueueLength: Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length,
                    ...detail,
                }),
            });
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, rows.slice(-600));
        },

        installNetworkDiscoveryListener: () => {
            if (window.__hegeThreeNoNetworkDiscoveryInstalled) return;
            window.__hegeThreeNoNetworkDiscoveryInstalled = true;
            Core.ThreeNoWatch.resetOldDebugSchemaIfNeeded();
            window.addEventListener('hege:threads-network-discovery', (event) => {
                const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
                Core.ThreeNoWatch.appendNetworkDiscoveryLog(detail);
            });
            window.dispatchEvent(new CustomEvent('hege:threads-network-discovery-toggle', {
                detail: { enabled: Utils.isBetaBuild() === true },
            }));
        },

        clearStaleScanIfNeeded: (reason = 'stale_scan_worker_missing') => {
            const state = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            if (!Core.ThreeNoWatch.isRunningStatus(state.status)) return false;
            if (Core.ThreeNoWatch.isFreshRunningState(state)) return false;
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            try {
                localStorage.removeItem(Core.ThreeNoWatch.runtimeBackupKey);
            } catch (_) {}
            Core.ThreeNoWatch.setScanState({
                ...state,
                status: 'stopped',
                completedAt: Date.now(),
                error: '',
                debug: {
                    ...(state.debug && typeof state.debug === 'object' ? state.debug : {}),
                    step: reason,
                    stalePreviousStatus: state.status || '',
                    staleUpdatedAt: state.updatedAt || 0,
                    staleWorkerHeartbeatAt: state.workerHeartbeatAt || 0,
                },
            });
            return true;
        },

        startWorkerHeartbeat: () => {
            if (!Core.ThreeNoWatch.isScanPage()) return;
            if (window.__hegeThreeNoWorkerHeartbeat) return;
            const tick = () => {
                if (!Core.ThreeNoWatch.isScanPage()) {
                    clearInterval(window.__hegeThreeNoWorkerHeartbeat);
                    window.__hegeThreeNoWorkerHeartbeat = null;
                    return;
                }
                const state = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
                if (!Core.ThreeNoWatch.isRunningStatus(state.status)) {
                    clearInterval(window.__hegeThreeNoWorkerHeartbeat);
                    window.__hegeThreeNoWorkerHeartbeat = null;
                    return;
                }
                const now = Date.now();
                Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
                    ...state,
                    workerHeartbeatAt: now,
                    updatedAt: now,
                });
            };
            window.__hegeThreeNoWorkerHeartbeat = setInterval(tick, 5000);
            tick();
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
            Core.ThreeNoWatch.appendScanDebugLog(next);
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
                Core.ThreeNoWatch.clearStaleScanIfNeeded('stale_scan_lock_cleared_before_start');
            }

            const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const workerRunning = bgStatus.state === 'running' && (now - (bgStatus.lastUpdate || 0) < 30000);
            if (workerRunning || Utils.isSweepRunning()) return { skipped: 'worker_busy' };

            const targetOwner = Core.ThreeNoWatch.normalizeUsername(options.targetOwner || '');
            const scanId = targetOwner
                ? `three-no:target:${targetOwner}:${today}:${now}`
                : `three-no:manual:${today}:${now}`;
            Core.ThreeNoWatch.resetScanDebugLog(scanId);
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
            Core.ThreeNoWatch.startWorkerHeartbeat();
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

            const probeKind = ['base', 'replies', 'reposts'].includes(runtime.profileProbeKind)
                ? runtime.profileProbeKind
                : 'base';
            const probeResults = runtime.profileProbeResults && typeof runtime.profileProbeResults === 'object'
                ? runtime.profileProbeResults
                : {};
            if (!Core.ThreeNoWatch.isOnProfileProbePath(username, probeKind)) {
                await Core.ThreeNoWatch.navigateToProfileProbe(index, probeKind, probeResults);
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
                candidateFollowersCount: usernames.length,
                batchSize: runtime.batchSize || Core.ThreeNoWatch.getBatchSize(),
                previousScannedCount: runtime.previousScannedCount || 0,
                hasMore: runtime.hasMore === true,
                debug: {
                    step: 'profile_probe_start',
                    index,
                    total: usernames.length,
                    username,
                    probeKind,
                    previousScannedCount: runtime.previousScannedCount || 0,
                    findingsCount: Array.isArray(runtime.findings) ? runtime.findings.length : 0,
                    url: window.location.href,
                },
            });

            await Utils.safeSleep(CONFIG.THREE_NO_SCAN_PROFILE_DELAY_MS || 1800);
            if ((window.scrollY || window.pageYOffset || 0) > 80) {
                window.scrollTo(0, 0);
                await Utils.safeSleep(150);
            }

            const probeResult = await Core.ThreeNoWatch.evaluateCurrentProfileProbe(username, probeKind);
            const nextProbeResults = {
                ...probeResults,
                [probeKind]: probeResult,
            };
            const baseResult = nextProbeResults.base || {};
            const nextProbeKind = probeKind === 'base'
                ? (baseResult.accountPrivate === true ? '' : 'replies')
                : (probeKind === 'replies' ? 'reposts' : '');
            if (nextProbeKind) {
                Core.ThreeNoWatch.setRuntime({
                    ...runtime,
                    profileProbeKind: nextProbeKind,
                    profileProbeResults: nextProbeResults,
                    stopAfterCurrentCandidates,
                    stopRequestedAt: runtime.stopRequestedAt || (stopRequested ? Date.now() : 0),
                });
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
                        step: 'profile_probe_continue',
                        index,
                        total: usernames.length,
                        username,
                        probeKind,
                        nextProbeKind,
                        probesCompleted: Object.keys(nextProbeResults).join(','),
                        accountPrivate: baseResult.accountPrivate === true,
                        privateSignalReason: baseResult.privateSignalReason || '',
                        privateSignalMatchedText: baseResult.privateSignalMatchedText || '',
                        url: window.location.href,
                    },
                });
                await Core.ThreeNoWatch.navigateToProfileProbe(index, nextProbeKind, nextProbeResults);
                return;
            }

            const result = Core.ThreeNoWatch.buildProfileResultFromProbes(username, nextProbeResults);
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
                    accountPrivate: result.accountPrivate,
                    suspiciousUsername: result.suspiciousUsername,
                    profileSignalsVersion: result.profileSignalsVersion,
                    noPostsKnown: result.noPostsKnown,
                    noRepliesKnown: result.noRepliesKnown,
                    noRepostsKnown: result.noRepostsKnown,
                    followerCount: result.followerCount,
                    followerCountKnown: result.followerCountKnown,
                    bioSignalReason: result.bioSignalReason,
                    contentProbeSkippedReason: result.contentProbeSkippedReason,
                    privateDetectedAt: result.privateDetectedAt,
                    privateSignalReason: result.privateSignalReason,
                    privateSignalMatchedText: result.privateSignalMatchedText,
                    followerCountSkippedReason: result.followerCountSkippedReason,
                    joinedAt: result.joinedAt,
                    accountAgeDays: result.accountAgeDays,
                    accountAgeBucket: result.accountAgeBucket,
                    isNewAccount: result.isNewAccount,
                    locationLabel: result.locationLabel,
                    countryTag: result.countryTag,
                    regionShared: result.regionShared,
                    metadataSource: result.metadataSource,
                    metadataSourcePage: result.metadataSourcePage,
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
                    accountPrivate: result.accountPrivate,
                    suspiciousUsername: result.suspiciousUsername,
                    profileSignalsVersion: result.profileSignalsVersion,
                    noPostsKnown: result.noPostsKnown,
                    noRepliesKnown: result.noRepliesKnown,
                    noRepostsKnown: result.noRepostsKnown,
                    followerCount: result.followerCount,
                    followerCountKnown: result.followerCountKnown,
                    bioSignalReason: result.bioSignalReason,
                    contentProbeSkippedReason: result.contentProbeSkippedReason,
                    privateDetectedAt: result.privateDetectedAt,
                    privateSignalReason: result.privateSignalReason,
                    privateSignalMatchedText: result.privateSignalMatchedText,
                    followerCountSkippedReason: result.followerCountSkippedReason,
                    joinedAt: result.joinedAt,
                    accountAgeDays: result.accountAgeDays,
                    accountAgeBucket: result.accountAgeBucket,
                    locationLabel: result.locationLabel,
                    countryTag: result.countryTag,
                    metadataSource: result.metadataSource,
                    metadataSourcePage: result.metadataSourcePage,
                    metadataDebug: result.metadataDebug,
                    probesCompleted: Object.keys(nextProbeResults).join(','),
                    isThreeNo: result.isThreeNo,
                    findingsCount: findings.length,
                    url: window.location.href,
                },
            });

            const nextRuntime = {
                ...runtime,
                findings,
                index: index + 1,
                profileProbeKind: 'base',
                profileProbeResults: {},
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
            await Core.ThreeNoWatch.navigateToProfileProbe(index, 'base', {});
        },

        navigateToProfileProbe: async (index, probeKind = 'base', profileProbeResults = {}) => {
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
                    step: 'navigate_to_profile_probe',
                    index,
                    username,
                    probeKind,
                    previousScannedCount: runtime.previousScannedCount || 0,
                    nextUrl: Core.ThreeNoWatch.profileProbeUrl(username, probeKind),
                    runtimeUsersCount: Array.isArray(runtime.usernames) ? runtime.usernames.length : 0,
                },
            });
            Core.ThreeNoWatch.setRuntime({
                ...runtime,
                index,
                profileProbeKind: ['base', 'replies', 'reposts'].includes(probeKind) ? probeKind : 'base',
                profileProbeResults: profileProbeResults && typeof profileProbeResults === 'object' ? profileProbeResults : {},
            });
            const url = new URL(Core.ThreeNoWatch.profileProbeUrl(username, probeKind));
            url.searchParams.set('hege_bg', 'true');
            url.searchParams.set('hege_popup', 'true');
            url.searchParams.set('hege_three_no_scan', 'true');
            url.searchParams.set('hege_three_no_phase', 'profile');
            url.searchParams.set('hege_three_no_probe', probeKind);
            url.searchParams.set('hege_three_no_run', runtime.scanId || '');
            location.assign(url.toString());
        },

        evaluateCurrentProfile: async (username) => {
            const base = await Core.ThreeNoWatch.evaluateCurrentProfileProbe(username, 'base');
            return Core.ThreeNoWatch.buildProfileResultFromProbes(username, { base });
        },

        evaluateCurrentProfileProbe: async (username, probeKind = 'base') => {
            const u = Core.ThreeNoWatch.normalizeUsername(username || window.location.pathname.replace(/^\/@/, ''));
            const main = document.querySelector('main, div[role="main"]') || document.body;
            const startedAt = Date.now();
            const probe = ['base', 'replies', 'reposts'].includes(probeKind) ? probeKind : 'base';
            await Utils.pollUntil(() => main.querySelector('a, img, span[dir="auto"], div[dir="auto"]'), 9000, 250).catch(() => null);
            if (!Core.ThreeNoWatch.isOnProfileProbePath(u, probe)) {
                return {
                    kind: probe,
                    username: u,
                    known: false,
                    reason: 'path_mismatch',
                    path: window.location.pathname,
                    elapsedMs: Date.now() - startedAt,
                };
            }
            const firstVisibleSignal = Core.ThreeNoWatch.readProfileContentSignal(main, u, probe, { allowExplicitEmpty: true });
            if (!firstVisibleSignal.known) await Utils.safeSleep(probe === 'base' ? 350 : 550);

            if (probe !== 'base') {
                const signal = firstVisibleSignal.known
                    ? {
                        ...firstVisibleSignal,
                        waitedMs: 0,
                        emptyObservedMs: firstVisibleSignal.hasContent === false ? 0 : 0,
                    }
                    : await Core.ThreeNoWatch.waitForProfileContentSignal(main, u, probe);
                return {
                    kind: probe,
                    username: u,
                    ...signal,
                    elapsedMs: Date.now() - startedAt,
                };
            }

            const bioDebug = {};
            const bioCandidates = Core.ThreeNoWatch.getProfileBioCandidates(main, u, bioDebug);
            const hasBio = bioCandidates.length > 0;
            const profileTopText = Core.ThreeNoWatch.getProfileTopText(main, u);
            const privateSignal = Core.ThreeNoWatch.readProfilePrivateSignal(main);
            const accountPrivate = privateSignal.private === true;
            const followerCount = accountPrivate ? null : Core.ThreeNoWatch.parseProfileFollowerCount(main);
            const postsSignal = accountPrivate
                ? { known: false, hasContent: false, reason: 'private_profile' }
                : (firstVisibleSignal.known
                    ? { ...firstVisibleSignal, waitedMs: 0, emptyObservedMs: 0 }
                    : await Core.ThreeNoWatch.waitForProfileContentSignal(main, u, 'base'));
            const metadata = await Core.ThreeNoWatch.extractProfileMetadata(main, u);
            const hasAvatar = Core.ThreeNoWatch.profileHasAvatar(main);
            return {
                kind: 'base',
                username: u,
                checkedAt: Date.now(),
                hasAvatar,
                noAvatar: !hasAvatar,
                hasBio,
                noBio: !hasBio,
                bioSignalReason: hasBio ? 'profile_header_bio_candidate' : 'no_profile_header_bio_candidate',
                bioCandidates,
                bioDebug,
                profileTopText,
                accountPrivate,
                privateDetectedAt: accountPrivate ? 'base_profile' : '',
                privateSignalReason: privateSignal.reason || '',
                privateSignalMatchedText: privateSignal.matchedText || '',
                postsSignal,
                followerCount: Number.isFinite(followerCount) ? followerCount : 0,
                followerCountKnown: accountPrivate ? false : Number.isFinite(followerCount),
                followerCountSkippedReason: accountPrivate ? 'private_profile' : '',
                suspiciousUsername: Core.ThreeNoWatch.usernameMatchesSuspiciousThreeNoCandidate(u),
                metadata,
                metadataSourcePage: 'base_profile',
                contentProbeSkippedReason: accountPrivate ? 'private_profile' : '',
                elapsedMs: Date.now() - startedAt,
            };
        },

        buildProfileResultFromProbes: (username, probes = {}) => {
            const u = Core.ThreeNoWatch.normalizeUsername(username);
            const base = probes.base || {};
            const replies = probes.replies || {};
            const reposts = probes.reposts || {};
            const isPrivate = base.accountPrivate === true;
            const postsKnown = isPrivate ? false : base.postsSignal?.known === true;
            const repliesKnown = isPrivate ? false : replies.known === true;
            const repostsKnown = isPrivate ? false : reposts.known === true;
            const noPosts = postsKnown ? base.postsSignal?.hasContent !== true : false;
            const noReplies = repliesKnown ? replies.hasContent !== true : false;
            const noReposts = repostsKnown ? reposts.hasContent !== true : false;
            const metadata = base.metadata || {};
            const noAvatar = base.noAvatar === true;
            const noBio = base.noBio === true;
            const suspiciousUsername = base.suspiciousUsername === true;
            return {
                username: u,
                profileUrl: `https://www.threads.com/@${u}`,
                checkedAt: base.checkedAt || Date.now(),
                noAvatar,
                noBio,
                noPosts,
                noReplies,
                noReposts,
                accountPrivate: isPrivate,
                suspiciousUsername,
                profileSignalsVersion: Core.ThreeNoWatch.getProfileSignalsVersion(),
                noPostsKnown: postsKnown,
                noRepliesKnown: repliesKnown,
                noRepostsKnown: repostsKnown,
                followerCount: isPrivate ? 0 : (parseInt(base.followerCount || '0', 10) || 0),
                followerCountKnown: isPrivate ? false : base.followerCountKnown === true,
                bioSignalReason: base.bioSignalReason || '',
                contentProbeSkippedReason: isPrivate ? 'private_profile' : '',
                privateDetectedAt: isPrivate ? 'base_profile' : '',
                privateSignalReason: isPrivate ? (base.privateSignalReason || 'profile_private_phrase') : '',
                privateSignalMatchedText: isPrivate ? (base.privateSignalMatchedText || '') : '',
                followerCountSkippedReason: isPrivate ? 'private_profile' : '',
                joinedAt: metadata.joinedAt || 0,
                accountAgeDays: metadata.accountAgeDays || 0,
                accountAgeBucket: metadata.accountAgeBucket || '',
                isNewAccount: metadata.isNewAccount === true,
                locationLabel: metadata.locationLabel || '',
                countryTag: metadata.countryTag || '',
                regionShared: metadata.regionShared === true,
                metadataSource: metadata.source || '',
                metadataSourcePage: base.metadataSourcePage || 'base_profile',
                metadataDebug: {
                    ...(metadata.debug || {}),
                    baseElapsedMs: base.elapsedMs || 0,
                    bioCandidates: Array.isArray(base.bioCandidates) ? base.bioCandidates.slice(0, 8) : [],
                    bioDebug: base.bioDebug && typeof base.bioDebug === 'object' ? base.bioDebug : {},
                    profileTopText: Array.isArray(base.profileTopText) ? base.profileTopText.slice(0, 8) : [],
                    postsSignalReason: base.postsSignal?.reason || '',
                    repliesSignalReason: replies.reason || '',
                    repostsSignalReason: reposts.reason || '',
                    privateSignalReason: base.privateSignalReason || '',
                    privateSignalMatchedText: base.privateSignalMatchedText || '',
                    probesCompleted: Object.keys(probes).join(','),
                },
                isThreeNo: noAvatar && (noBio || noPosts || noReplies || noReposts || suspiciousUsername || isPrivate),
            };
        },

        readProfilePrivateSignal: (root) => {
            const text = (root?.innerText || root?.textContent || '').replace(/\s+/g, ' ').trim();
            const phrases = [
                '此個人檔案不公開。',
                '此個人檔案不公開',
                '這個個人檔案不公開。',
                '這個個人檔案不公開',
                '此個人檔案為不公開',
                '這個個人檔案為不公開',
                'This profile is private',
                'This profile is private.',
                'This account is private',
                'This account is private.',
            ];
            const matchedText = phrases.find(phrase => text.includes(phrase)) || '';
            return {
                private: !!matchedText,
                reason: matchedText ? 'profile_private_phrase' : '',
                matchedText,
            };
        },

        profileIsPrivate: (root) => Core.ThreeNoWatch.readProfilePrivateSignal(root).private === true,

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

        getProfileBioCandidates: (root, username, debug = null) => {
            const normalizedUser = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            const isBareUsernameLike = (text = '') => {
                const compact = String(text || '').replace(/\s+/g, '').trim();
                return /^[a-z0-9][a-z0-9._]{2,29}$/i.test(compact) && /[._0-9]/.test(compact);
            };
            const isUiText = (text = '') => {
                const compact = String(text || '').replace(/\s+/g, ' ').trim();
                const noSpace = compact.replace(/\s+/g, '');
                if (!compact) return true;
                if (compact.toLowerCase() === normalizedUser || compact.toLowerCase() === `@${normalizedUser}`) return true;
                if (compact === '+' || compact === '＋') return true;
                if (/^@[\w.-]+$/i.test(compact)) return true;
                if (/^https?:\/\//i.test(compact)) return true;
                if (/^[\d,.\s萬万KMBkmb]+$/.test(compact)) return true;
                if (/^[\d,.\s萬万KMBkmb]+\s*(位)?粉絲$/i.test(compact)) return true;
                if (/^[\d,.\sKMBkmb]+\s*followers$/i.test(compact)) return true;
                if (/^(追蹤|追蹤中|粉絲|回覆|回文|串文|轉發|轉貼|分享|更多|發送訊息|提及|所在地點|關於此個人檔案|為你推薦|推薦給你|你可能認識)$/i.test(compact)) return true;
                if (/^(Follow|Following|Followers|Replies|Reply|Threads|Reposts|Repost|Share|More|Message|Mention|Location|About this profile|Recommended for you|Suggested for you|For you|People you may know)$/i.test(compact)) return true;
                if (/^(Instagram|Threads|threads\.net)$/i.test(compact)) return true;
                if (/已加入\s*\d{4}年|Joined\s+\w+\s+\d{4}|帳號建立|Account created|所在地點|Location/i.test(compact)) return true;
                return ['追蹤中', '追蹤', '粉絲', '回覆', '串文', '轉發', '為你推薦', '推薦給你', '你可能認識'].includes(noSpace);
            };
            const isBoundaryText = (text = '') => {
                const compact = String(text || '').replace(/\s+/g, ' ').trim();
                return /粉絲|followers|回覆|Replies|串文|Threads|轉發|Reposts|發送訊息|Message|所在地點|Location/i.test(compact);
            };
            const isDisqualifyingInteractiveAncestor = (el) => {
                const interactive = el.closest('a, button, [role="tab"], [role="menuitem"]');
                if (interactive) return true;
                const roleButton = el.closest('div[role="button"]');
                if (!roleButton) return false;
                const roleText = (roleButton.innerText || roleButton.textContent || '').replace(/\s+/g, ' ').trim();
                return /^(追蹤|追蹤中|發送訊息|更多|分享|Follow|Following|Message|More|Share)$/i.test(roleText);
            };
            const nodes = Array.from((root || document.body).querySelectorAll('span[dir="auto"], div[dir="auto"], h1, h2'))
                .filter(el => !el.closest('[role="dialog"]'))
                .filter(el => !isDisqualifyingInteractiveAncestor(el))
                .filter(el => !el.matches('[tabindex="0"]'))
                .map(el => {
                    const rect = el.getBoundingClientRect();
                    const rawText = (el.innerText || el.textContent || '').trim();
                    const text = rawText.replace(/\s+/g, ' ').trim();
                    const style = String(el.getAttribute('style') || '');
                    const className = String(el.getAttribute('class') || '');
                    const translate = String(el.getAttribute('translate') || '');
                    return { el, rect, text, rawText, style, className, translate };
                })
                .filter(item => item.text && item.rect.width > 0 && item.rect.height > 0 && item.rect.top >= 70 && item.rect.top < 560)
                .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

            let seenHandle = false;
            const candidates = [];
            const seenText = new Set();
            const rejected = [];
            for (const item of nodes) {
                const text = item.text;
                const lower = text.toLowerCase();
                if (lower === normalizedUser || lower === `@${normalizedUser}` || lower.includes(`@${normalizedUser}`)) {
                    seenHandle = true;
                    continue;
                }
                const lineClampBioLike = item.el.matches('span[dir="auto"]') && /line-clamp|lineHeight/i.test(item.style);
                if (!seenHandle) {
                    if (rejected.length < 8) rejected.push({ text, reason: 'before_handle', top: Math.round(item.rect.top) });
                    continue;
                }
                if (item.el.matches('h1, h2')) {
                    if (rejected.length < 8) rejected.push({ text, reason: 'heading_text', top: Math.round(item.rect.top) });
                    continue;
                }
                if (item.translate.toLowerCase() === 'no' && isBareUsernameLike(text)) {
                    if (rejected.length < 8) rejected.push({ text, reason: 'translate_no_username_like', top: Math.round(item.rect.top) });
                    continue;
                }
                if (isBoundaryText(text)) {
                    if (lineClampBioLike && !isUiText(text) && text.length <= 220 && !seenText.has(text)) {
                        seenText.add(text);
                        candidates.push(text);
                    }
                    break;
                }
                if (isUiText(text)) {
                    if (rejected.length < 8) rejected.push({ text, reason: 'ui_text', top: Math.round(item.rect.top) });
                    continue;
                }
                if (text.length > 220) {
                    if (rejected.length < 8) rejected.push({ text: text.slice(0, 120), reason: 'too_long', top: Math.round(item.rect.top) });
                    continue;
                }
                if (!lineClampBioLike) {
                    if (rejected.length < 8) rejected.push({ text, reason: 'not_bio_shape', top: Math.round(item.rect.top) });
                    continue;
                }
                if (seenText.has(text)) continue;
                seenText.add(text);
                candidates.push(text);
            }
            if (debug && typeof debug === 'object') {
                debug.seenHandle = seenHandle;
                debug.nodeCount = nodes.length;
                debug.rejected = rejected;
                debug.nodeSamples = nodes.slice(0, 10).map(item => ({
                    text: item.text.slice(0, 120),
                    top: Math.round(item.rect.top),
                    left: Math.round(item.rect.left),
                    tag: item.el.tagName.toLowerCase(),
                    translate: item.translate,
                    lineClampStyle: /line-clamp|lineHeight/i.test(item.style),
                }));
            }
            return candidates.slice(0, 4);
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

        getProfileTabPath: (username = '', kind = '') => {
            const normalizedUser = Core.ThreeNoWatch.normalizeUsername(username);
            if (!normalizedUser) return '';
            const kindPath = kind === 'replies'
                ? '/replies'
                : (kind === 'reposts' ? '/reposts' : '');
            return `/@${normalizedUser}${kindPath}`;
        },

        isOnProfileTabPath: (username = '', kind = '') => {
            const expected = Core.ThreeNoWatch.getProfileTabPath(username, kind);
            if (!expected) return false;
            const current = decodeURIComponent(window.location.pathname || '').replace(/\/+$/, '').toLowerCase();
            return current === expected.toLowerCase();
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
                            const path = decodeURIComponent(url.pathname).toLowerCase();
                            const lowerUser = normalizedUser.toLowerCase();
                            return path.endsWith(kindPath)
                                && (!normalizedUser || path.includes(`/@${lowerUser}`) || path.includes(`/@${encodeURIComponent(lowerUser)}`));
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
            const alreadyOnKindPath = kindPath && Core.ThreeNoWatch.isOnProfileTabPath(username, kind);
            const tab = Core.ThreeNoWatch.findProfileTab(labels, kind, username);
            if (!tab && !alreadyOnKindPath) return false;
            const beforeText = (root.innerText || '').slice(0, 1400);
            const beforePath = window.location.pathname;
            if (tab) Utils.simClick(tab);
            await Utils.safeSleep(900);
            await Utils.pollUntil(() => {
                const freshRoot = document.querySelector('main, div[role="main"]') || document.body;
                const current = (freshRoot.innerText || '').slice(0, 1400);
                const pathChangedToKind = kindPath && Core.ThreeNoWatch.isOnProfileTabPath(username, kind);
                if (kindPath) {
                    return pathChangedToKind
                        || (alreadyOnKindPath && (
                            current !== beforeText
                            || Core.ThreeNoWatch.profileSectionHasExplicitEmpty(freshRoot, kind)
                        ));
                }
                return pathChangedToKind
                    || window.location.pathname !== beforePath
                    || current !== beforeText
                    || Core.ThreeNoWatch.profileSectionHasExplicitEmpty(freshRoot, kind);
            }, kind === 'replies' ? 6500 : 5000, 250).catch(() => null);
            const freshRoot = document.querySelector('main, div[role="main"]') || document.body;
            if (kindPath && !Core.ThreeNoWatch.isOnProfileTabPath(username, kind)) return false;
            await Utils.safeSleep(kind === 'replies' ? 2200 : 1400);
            await Utils.pollUntil(() => {
                const settledRoot = document.querySelector('main, div[role="main"]') || document.body;
                return Core.ThreeNoWatch.profileSectionHasExplicitEmpty(settledRoot, kind)
                    || Core.ThreeNoWatch.profileSectionHasContent(settledRoot, username, kind);
            }, kind === 'replies' ? 8000 : 5000, 300).catch(() => null);
            const settledRoot = document.querySelector('main, div[role="main"]') || document.body;
            if (kindPath && !Core.ThreeNoWatch.isOnProfileTabPath(username, kind)) return false;
            return Core.ThreeNoWatch.profileSectionHasContent(settledRoot, username, kind);
        },

        readProfileContentSignal: (root, username, kind = 'base', options = {}) => {
            const probeKind = kind === 'replies' || kind === 'reposts' ? kind : 'base';
            const allowExplicitEmpty = options.allowExplicitEmpty !== false;
            if (!Core.ThreeNoWatch.isOnProfileProbePath(username, probeKind)) {
                return {
                    known: false,
                    hasContent: false,
                    reason: 'path_mismatch',
                };
            }
            // bulk-route-definitions may include prefetched or adjacent post routes that are
            // not owned by the profile currently being probed. Keep those events as debug
            // evidence only; visible DOM or explicit empty text must decide content state.
            const emptySignal = Core.ThreeNoWatch.readProfileExplicitEmptySignal(root, probeKind);
            if (emptySignal.empty) {
                if (!allowExplicitEmpty) {
                    return {
                        known: false,
                        hasContent: false,
                        reason: `explicit_empty_waiting_for_stability:${emptySignal.matchedText}`,
                        emptyMatchedText: emptySignal.matchedText,
                    };
                }
                return {
                    known: true,
                    hasContent: false,
                    reason: `explicit_empty:${emptySignal.matchedText}`,
                    emptyMatchedText: emptySignal.matchedText,
                };
            }
            if (Core.ThreeNoWatch.profileSectionHasContent(root, username, probeKind)) {
                return {
                    known: true,
                    hasContent: true,
                    reason: 'content_found',
                };
            }
            const text = (root?.innerText || root?.textContent || '').replace(/\s+/g, ' ').trim();
            const hasSkeleton = Array.from((root || document.body).querySelectorAll('[aria-busy="true"], [role="progressbar"], div'))
                .some(el => {
                    const rect = el.getBoundingClientRect?.();
                    const style = window.getComputedStyle?.(el);
                    return rect
                        && rect.width > 40
                        && rect.height > 8
                        && rect.top >= 80
                        && rect.top < window.innerHeight
                        && /animation|pulse|skeleton|loading/i.test(`${el.className || ''} ${style?.animationName || ''}`);
                });
            return {
                known: false,
                hasContent: false,
                reason: hasSkeleton || !text ? 'loading_or_skeleton' : 'no_stable_signal',
            };
        },

        waitForProfileContentSignal: async (root, username, kind = 'base') => {
            const timeout = kind === 'replies' ? 9000 : (kind === 'reposts' ? 8000 : 6000);
            const startedAt = Date.now();
            let emptyFirstSeenAt = 0;
            let emptyLastReason = '';
            let lastReason = '';
            let finalKnown = null;
            while (Date.now() - startedAt < timeout) {
                const freshRoot = document.querySelector('main, div[role="main"]') || document.body || root;
                const contentSignal = Core.ThreeNoWatch.readProfileContentSignal(freshRoot, username, kind, { allowExplicitEmpty: false });
                lastReason = contentSignal.reason || '';
                if (contentSignal.known && contentSignal.hasContent === true) {
                    finalKnown = {
                        ...contentSignal,
                        waitedMs: Date.now() - startedAt,
                        emptyObservedMs: emptyFirstSeenAt ? Date.now() - emptyFirstSeenAt : 0,
                    };
                    break;
                }
                const explicitEmpty = Core.ThreeNoWatch.profileSectionHasExplicitEmpty(freshRoot, kind);
                if (explicitEmpty) {
                    if (!emptyFirstSeenAt) emptyFirstSeenAt = Date.now();
                    const emptySignal = Core.ThreeNoWatch.readProfileExplicitEmptySignal(freshRoot, kind);
                    const emptyElapsed = Date.now() - emptyFirstSeenAt;
                    emptyLastReason = `explicit_empty:${emptySignal.matchedText || kind || 'unknown'}`;
                    finalKnown = {
                        known: true,
                        hasContent: false,
                        reason: `explicit_empty:${emptySignal.matchedText || kind}`,
                        emptyMatchedText: emptySignal.matchedText || '',
                        waitedMs: Date.now() - startedAt,
                        emptyObservedMs: emptyElapsed,
                    };
                    break;
                } else {
                    emptyFirstSeenAt = 0;
                    emptyLastReason = '';
                }
                await Utils.safeSleep(220);
            }
            if (finalKnown) return finalKnown;
            const finalRoot = document.querySelector('main, div[role="main"]') || document.body || root;
            const signal = Core.ThreeNoWatch.readProfileContentSignal(finalRoot, username, kind, {
                allowExplicitEmpty: kind === 'base',
            });
            if (signal.known) return {
                ...signal,
                waitedMs: Date.now() - startedAt,
                emptyObservedMs: emptyFirstSeenAt ? Date.now() - emptyFirstSeenAt : 0,
            };
            return {
                known: false,
                hasContent: false,
                reason: emptyFirstSeenAt
                    ? `timeout_after_unstable_empty:${emptyLastReason || lastReason || signal.reason || 'unknown'}`
                    : (signal.reason || lastReason || 'timeout_unknown'),
                waitedMs: Date.now() - startedAt,
                emptyObservedMs: emptyFirstSeenAt ? Date.now() - emptyFirstSeenAt : 0,
            };
        },

        readProfileExplicitEmptySignal: (root, kind = '') => {
            const text = (root?.innerText || root?.textContent || '').replace(/\s+/g, ' ').trim();
            const common = ['尚無任何串文。', '尚無任何串文', 'No threads yet', 'No posts yet'];
            const replies = ['尚無回覆。', '尚無回覆', 'No replies yet'];
            const reposts = ['尚未轉發內容。', '尚未轉發內容', 'No reposts yet'];
            const phrases = kind === 'replies' ? replies : (kind === 'reposts' ? reposts : common);
            const matchedText = phrases.find(phrase => text.includes(phrase)) || '';
            return {
                empty: !!matchedText,
                matchedText,
                kind: kind || 'base',
            };
        },

        profileSectionHasExplicitEmpty: (root, kind = '') => Core.ThreeNoWatch.readProfileExplicitEmptySignal(root, kind).empty === true,

        profileSectionHasContent: (root, username, kind = '') => {
            const postLinks = Array.from(root.querySelectorAll('a[href*="/post/"]'))
                .filter(a => !a.closest('[role="dialog"]'))
                .filter(a => {
                    const rect = a.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.top >= 120;
                });
            if (postLinks.length > 0) return true;
            if (Core.ThreeNoWatch.profileSectionHasExplicitEmpty(root, kind)) return false;
            if (kind === 'replies' || kind === 'reposts') {
                const articles = Array.from(root.querySelectorAll('article, [role="article"], [data-pressable-container="true"]'))
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

        installAboutProfilePassiveBridge: () => {
            if (window.__hegeAboutProfilePassiveBridgeInstalled) {
                Core.ThreeNoWatch.seedAboutProfileBridgeCaches();
                window.dispatchEvent(new CustomEvent('hege:threads-about-profile-bridge-ping'));
                return;
            }
            window.__hegeAboutProfilePassiveBridgeInstalled = true;
            window.__hegeAboutProfilePassiveBridgeStatus = {
                ready: false,
                source: '',
                checkedAt: Date.now(),
                error: '',
            };
            window.addEventListener('hege:threads-about-profile', (event) => {
                const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
                const username = Core.ThreeNoWatch.normalizeUsername(detail.username || Core.ThreeNoWatch.getCurrentProfileUsername() || '');
                if (!username && !detail.joined && !detail.location) return;
                Core.ThreeNoWatch.writeProfileMetadataCache(username, {
                    username,
                    displayName: String(detail.displayName || ''),
                    joined: String(detail.joined || ''),
                    location: String(detail.location || ''),
                    isVerified: detail.isVerified === true,
                    source: String(detail.source || 'passive_about_api'),
                    capturedAt: Date.now(),
                });
            });
            window.addEventListener('hege:threads-profile-user-id', (event) => {
                const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
                Core.ThreeNoWatch.writeProfileUserIdCache(detail.username || '', {
                    userId: detail.userId || detail.id || '',
                    source: detail.source || 'passive_payload',
                    capturedAt: detail.capturedAt || Date.now(),
                });
            });
            window.addEventListener('hege:threads-about-profile-template', (event) => {
                const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
                Core.ThreeNoWatch.writeAboutRequestTemplateCache(detail);
            });
            window.addEventListener('hege:threads-about-profile-bridge-status', (event) => {
                const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
                window.__hegeAboutProfilePassiveBridgeStatus = {
                    ready: detail.ready === true,
                    source: String(detail.source || ''),
                    href: String(detail.href || window.location.href || '').slice(0, 500),
                    hasFetch: detail.hasFetch === true,
                    hasXhr: detail.hasXhr === true,
                    hasFbDtsg: detail.hasFbDtsg === true,
                    knownUserIds: parseInt(detail.knownUserIds || '0', 10) || 0,
                    checkedAt: Date.now(),
                    error: String(detail.error || ''),
                };
            });

            const bridgeSource = `(() => {
                if (window.__hegeThreadsAboutPassiveBridge) return;
                window.__hegeThreadsAboutPassiveBridge = true;
                const ABOUT_TEMPLATE_MAX_AGE_MS = 12 * 3600 * 1000;
                const stripPrefix = text => String(text || '').startsWith('for (;;);') ? String(text || '').slice(9) : String(text || '');
                const clean = value => String(value || '').replace(/\\\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\s+/g, ' ').trim();
                const readBoundText = value => {
                    const text = clean(value);
                    const match = text.match(/"([^"]*)"\\s*,\\s*"([^"]+)"/);
                    return match ? clean(match[1] || match[2]) : text;
                };
                const walk = (node, state) => {
                    if (!node || typeof node !== 'object') return;
                    const textNode = node['bk.components.Text'];
                    if (textNode && typeof textNode === 'object') {
                        const labelish = clean(textNode.text || readBoundText(textNode.on_bind || ''));
                        const style = clean(textNode.text_style || '');
                        if (style === 'semibold' && labelish) state.lastLabel = labelish;
                        else if (style === 'normal' && labelish && state.lastLabel) {
                            state.pairs.push({ label: state.lastLabel, value: labelish });
                            state.lastLabel = '';
                        }
                    }
                    const rich = node['bk.components.RichText'];
                    if (rich && Array.isArray(rich.children)) {
                        const joined = rich.children.map(child => clean(child?.['bk.components.TextSpan']?.text || '')).join('').trim();
                        const profile = joined.match(/^(.+?)\\s*[（(]@([\\w.]+)[)）]?/) || joined.match(/@([\\w.]+)/);
                        if (profile) {
                            if (profile[2]) {
                                state.displayName = clean(profile[1]);
                                state.username = clean(profile[2]);
                            } else {
                                state.username = clean(profile[1]);
                            }
                        }
                    }
                    Object.values(node).forEach(value => {
                        if (Array.isArray(value)) value.forEach(child => walk(child, state));
                        else if (value && typeof value === 'object') walk(value, state);
                    });
                };
                const labelIn = (label, values) => values.some(value => clean(label).toLowerCase() === value.toLowerCase());
                const parseAbout = text => {
                    let parsed;
                    try { parsed = JSON.parse(stripPrefix(text)); } catch (_) { return null; }
                    const state = { pairs: [], lastLabel: '', username: '', displayName: '' };
                    walk(parsed, state);
                    if (!state.pairs.length && !state.username) return null;
                    const joinedLabels = ['Joined', '已加入', '參加日', '参加日', '가입일', '가입 날짜'];
                    const locationLabels = ['Based in', '所在地點', '所在地', '位置', '거주지'];
                    const verifiedLabels = ['Verified by Meta', 'Meta 驗證', 'Meta 验证', 'Meta認証', 'Meta 인증'];
                    const relevant = state.pairs.filter(pair => !labelIn(pair.label, ['Name', '名稱', '名称', '名前', '이름', 'Former usernames', 'Previous usernames', '先前的使用者名稱', '先前的用戶名稱', '以前のユーザーネーム', '이전 사용자 이름']));
                    const joined = relevant.find(pair => labelIn(pair.label, joinedLabels));
                    const location = relevant.find(pair => labelIn(pair.label, locationLabels));
                    const verified = relevant.find(pair => labelIn(pair.label, verifiedLabels));
                    return {
                        username: state.username,
                        displayName: state.displayName,
                        joined: clean((joined || {}).value || ''),
                        location: clean((location || {}).value || ''),
                        isVerified: !!verified,
                    };
                };
                const session = {};
                const userIds = new Map();
                const publishedUserIds = new Set();
                let aboutRequestTemplate = null;
                const rememberToken = (key, value) => {
                    const cleanValue = clean(value);
                    if (key && cleanValue && cleanValue !== 'null' && cleanValue !== 'undefined') session[key] = cleanValue;
                };
                const rememberText = (text) => {
                    const source = String(text || '');
                    if (!source) return;
                    [
                        ['fb_dtsg', /"fb_dtsg"\\s*:\\s*"([^"]+)"/],
                        ['fb_dtsg', /"DTSGInitialData"[\\s\\S]{0,800}?"token"\\s*:\\s*"([^"]+)"/],
                        ['fb_dtsg', /\\["DTSGInitData",\\[\\],\\{"token":"([^"]+)"/],
                        ['lsd', /"lsd"\\s*:\\s*"([^"]+)"/],
                        ['lsd', /"LSD"[\\s\\S]{0,500}?"token"\\s*:\\s*"([^"]+)"/],
                        ['jazoest', /(?:^|[?&"'\\s])jazoest(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__user', /(?:^|[?&"'\\s])__user(?:=|["']?\\s*:\\s*["'])(\\d+)/],
                        ['__user', /"USER_ID"\\s*:\\s*"(\\d{4,})"/],
                        ['__user', /"viewer_id"\\s*:\\s*"?(\\d{4,})"?/],
                        ['__hs', /(?:^|[?&"'\\s])__hs(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__hsi', /(?:^|[?&"'\\s])__hsi(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__comet_req', /(?:^|[?&"'\\s])__comet_req(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__ccg', /(?:^|[?&"'\\s])__ccg(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__a', /(?:^|[?&"'\\s])__a(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__d', /(?:^|[?&"'\\s])__d(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__spin_r', /(?:^|[?&"'\\s])__spin_r(?:=|["']?\\s*:\\s*["'])(\\d+)/],
                        ['__spin_b', /(?:^|[?&"'\\s])__spin_b(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__spin_t', /(?:^|[?&"'\\s])__spin_t(?:=|["']?\\s*:\\s*["'])(\\d+)/],
                        ['__dyn', /(?:^|[?&"'\\s])__dyn(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__csr', /(?:^|[?&"'\\s])__csr(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                        ['__rev', /(?:^|[?&"'\\s])__rev(?:=|["']?\\s*:\\s*["'])(\\d+)/],
                        ['__s', /(?:^|[?&"'\\s])__s(?:=|["']?\\s*:\\s*["'])([^&"'\\s]+)["']?/],
                    ].forEach(([key, pattern]) => {
                        const match = source.match(pattern);
                        if (match) rememberToken(key, decodeURIComponent(match[1] || ''));
                    });
                    const rawForm = source.includes('%') ? source.replace(/\\+/g, ' ') : source;
                    ['fb_dtsg', 'lsd', 'jazoest', '__user', '__a', '__hs', '__hsi', '__spin_r', '__spin_b', '__spin_t', '__dyn', '__csr', '__rev', '__s', '__comet_req', '__ccg', '__d'].forEach(key => {
                        const match = rawForm.match(new RegExp('(?:^|&)' + key.replace(/_/g, '\\\\_') + '=([^&]+)'));
                        if (match) rememberToken(key, decodeURIComponent(match[1] || ''));
                    });
                };
                const publishUserId = (uname, uid, source = 'passive_payload') => {
                    const key = uname + ':' + uid;
                    if (publishedUserIds.has(key)) return;
                    publishedUserIds.add(key);
                    window.dispatchEvent(new CustomEvent('hege:threads-profile-user-id', {
                        detail: { username: uname, userId: uid, source, capturedAt: Date.now() },
                    }));
                };
                const rememberUser = (username, id, source = 'passive_payload') => {
                    const uname = clean(username).replace(/^@+/, '').toLowerCase();
                    const uid = clean(id).replace(/\\D+/g, '');
                    if (uname && uid.length >= 4) {
                        userIds.set(uname, uid);
                        publishUserId(uname, uid, source);
                    }
                };
                const collectUsers = (node, depth = 0) => {
                    if (!node || depth > 12) return;
                    if (Array.isArray(node)) {
                        node.forEach(child => collectUsers(child, depth + 1));
                        return;
                    }
                    if (typeof node !== 'object') return;
                    const username = node.username || node.user_name || node.profile_username || node.handle || node.display_username;
                    const id = node.id || node.pk || node.user_id || node.profile_user_id || node.strong_id__;
                    if (username && id) rememberUser(username, id);
                    Object.values(node).forEach(value => collectUsers(value, depth + 1));
                };
                const findUserIdNearUsername = (username, text) => {
                    const uname = clean(username).replace(/^@+/, '').toLowerCase();
                    if (!uname || !text) return '';
                    const lower = String(text).toLowerCase();
                    const idx = lower.indexOf(uname);
                    if (idx < 0) return '';
                    const slice = String(text).slice(Math.max(0, idx - 1800), idx + 2400);
                    const patterns = [
                        /"(?:id|pk|user_id|profile_user_id|strong_id__)"\\s*:\\s*"?([0-9]{4,})"?/g,
                        /(?:id|pk|user_id|profile_user_id)=([0-9]{4,})/g,
                    ];
                    for (const pattern of patterns) {
                        let match;
                        while ((match = pattern.exec(slice))) {
                            if (match[1]) return match[1];
                        }
                    }
                    return '';
                };
                const scanDocumentState = (username = '') => {
                    Array.from(document.querySelectorAll('script')).forEach(script => {
                        const text = script.textContent || script.src || '';
                        if (!text) return;
                        rememberText(text);
                        const foundId = findUserIdNearUsername(username, text);
                        if (foundId) rememberUser(username, foundId, 'document_state');
                        if ((text.trim().startsWith('{') || text.trim().startsWith('[') || text.startsWith('for (;;);')) && text.length < 600000) {
                            try { collectUsers(JSON.parse(stripPrefix(text))); } catch (_) {}
                        }
                    });
                };
                const findBkv = () => {
                    const sources = [
                        location.href,
                        ...Array.from(document.querySelectorAll('script[src], link[href]')).map(el => el.src || el.href || ''),
                        ...Array.from(document.querySelectorAll('script')).slice(0, 25).map(el => el.textContent || ''),
                    ];
                    for (const source of sources) {
                        const text = String(source || '');
                        const byUrl = text.match(/[?&]__bkv=([^&"'\\s]+)/);
                        if (byUrl) return clean(decodeURIComponent(byUrl[1]));
                        const byJson = text.match(/"__bkv"\\s*:\\s*"([^"]+)"/);
                        if (byJson) return clean(byJson[1]);
                    }
                    return '';
                };
                const resolveUserId = (username, seededTargetUserId = '') => {
                    const uname = clean(username).replace(/^@+/, '').toLowerCase();
                    const seeded = clean(seededTargetUserId).replace(/\\D+/g, '');
                    if (seeded) return seeded;
                    scanDocumentState(uname);
                    if (userIds.has(uname)) return userIds.get(uname);
                    const profileMatch = location.pathname.match(new RegExp('/(@[A-Za-z0-9_.]+)'));
                    if (profileMatch && clean(profileMatch[1]).replace(/^@+/, '').toLowerCase() === uname) {
                        const bodyId = findUserIdNearUsername(uname, document.documentElement?.innerHTML || '');
                        if (bodyId) rememberUser(uname, bodyId, 'document_state');
                    }
                    return userIds.get(uname) || '';
                };
                const templateIsFresh = template => !!template && template.capturedAt && Date.now() - template.capturedAt <= ABOUT_TEMPLATE_MAX_AGE_MS;
                const sanitizeAboutTemplate = (transport, rawUrl = '', body = '', headers = {}) => {
                    let parsedUrl;
                    try { parsedUrl = new URL(String(rawUrl || ''), location.origin); } catch (_) { return null; }
                    if (!parsedUrl.href.includes('about_this_profile_async_action')) return null;
                    let params = null;
                    try { params = new URLSearchParams(String(body || '')); } catch (_) { params = null; }
                    let bloksParams = {};
                    if (params?.get('params')) {
                        try { bloksParams = JSON.parse(params.get('params') || '{}') || {}; } catch (_) { bloksParams = {}; }
                    }
                    const headerValue = name => {
                        const lower = String(name || '').toLowerCase();
                        if (!headers || typeof headers !== 'object') return '';
                        if (typeof headers.get === 'function') return clean(headers.get(name) || headers.get(lower) || '');
                        const entry = Object.entries(headers).find(([key]) => String(key || '').toLowerCase() === lower);
                        return entry ? clean(entry[1]) : '';
                    };
                    const template = {
                        capturedAt: Date.now(),
                        source: 'passive_' + (transport || 'network'),
                        path: parsedUrl.pathname,
                        appid: clean(parsedUrl.searchParams.get('appid') || 'com.bloks.www.text_post_app.about_this_profile_async_action'),
                        type: clean(parsedUrl.searchParams.get('type') || 'app'),
                        bkv: clean(parsedUrl.searchParams.get('__bkv') || ''),
                        friendlyName: headerValue('X-FB-Friendly-Name') || clean(params?.get('fb_api_req_friendly_name') || 'BarcelonaProfileAboutThisProfileAsyncActionQuery'),
                        refererType: clean(bloksParams.referer_type || 'TextPostAppProfileOverflow'),
                        paramKeys: Object.keys(bloksParams).slice(0, 20),
                        formKeys: params ? Array.from(new Set(Array.from(params.keys()))).filter(key => !['fb_dtsg', 'lsd', 'jazoest'].includes(key)).slice(0, 40) : [],
                    };
                    aboutRequestTemplate = template;
                    window.dispatchEvent(new CustomEvent('hege:threads-about-profile-template', { detail: template }));
                    return template;
                };
                const seedAboutTemplate = (detail = {}) => {
                    const capturedAt = parseInt(detail.capturedAt || '0', 10) || 0;
                    if (!detail.path || !detail.appid || !capturedAt || Date.now() - capturedAt > ABOUT_TEMPLATE_MAX_AGE_MS) return;
                    aboutRequestTemplate = {
                        capturedAt,
                        source: clean(detail.source || 'content_cache'),
                        path: clean(detail.path || '/async/wbloks/fetch/'),
                        appid: clean(detail.appid || 'com.bloks.www.text_post_app.about_this_profile_async_action'),
                        type: clean(detail.type || 'app'),
                        bkv: clean(detail.bkv || ''),
                        friendlyName: clean(detail.friendlyName || 'BarcelonaProfileAboutThisProfileAsyncActionQuery'),
                        refererType: clean(detail.refererType || 'TextPostAppProfileOverflow'),
                    };
                };
                const emitActiveResponse = (requestId, detail) => {
                    window.dispatchEvent(new CustomEvent('hege:threads-about-profile-fetch-response', {
                        detail: { requestId, ...detail },
                    }));
                };
                const fetchActiveAbout = async (requestId, username, seededTargetUserId = '') => {
                    try {
                        const template = templateIsFresh(aboutRequestTemplate) ? aboutRequestTemplate : null;
                        const targetUserId = resolveUserId(username, seededTargetUserId);
                        const bkv = findBkv() || template?.bkv || '';
                        if (!template) return emitActiveResponse(requestId, { ok: false, error: 'missing_about_template' });
                        if (!targetUserId) return emitActiveResponse(requestId, { ok: false, error: 'missing_user_id' });
                        if (!session.fb_dtsg) return emitActiveResponse(requestId, { ok: false, error: 'missing_fb_dtsg' });
                        if (!bkv) return emitActiveResponse(requestId, { ok: false, error: 'missing_bkv' });
                        const form = new URLSearchParams();
                        form.set('av', session.__user || '0');
                        form.set('__user', session.__user || '0');
                        form.set('__a', session.__a || '1');
                        form.set('__req', 'hege_about');
                        form.set('__hs', session.__hs || '');
                        form.set('dpr', String(window.devicePixelRatio || 1));
                        form.set('__ccg', session.__ccg || 'EXCELLENT');
                        form.set('__comet_req', session.__comet_req || '29');
                        form.set('__d', session.__d || 'www');
                        ['__rev', '__s', '__hsi', '__dyn', '__csr', '__spin_r', '__spin_b', '__spin_t', 'jazoest', 'lsd'].forEach(key => {
                            if (session[key]) form.set(key, session[key]);
                        });
                        form.set('fb_dtsg', session.fb_dtsg);
                        form.set('params', JSON.stringify({
                            atpTriggerSessionID: crypto.randomUUID?.() || (Date.now() + '_' + Math.random().toString(36).slice(2)),
                            referer_type: template.refererType || 'TextPostAppProfileOverflow',
                            target_user_id: targetUserId,
                        }));
                        const headers = {
                            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                            'X-FB-Friendly-Name': template.friendlyName || 'BarcelonaProfileAboutThisProfileAsyncActionQuery',
                        };
                        if (session.lsd) headers['X-FB-LSD'] = session.lsd;
                        const url = (template.path || '/async/wbloks/fetch/') + '?appid=' + encodeURIComponent(template.appid) + '&type=' + encodeURIComponent(template.type || 'app') + '&__bkv=' + encodeURIComponent(bkv);
                        const response = await fetch(url, {
                            method: 'POST',
                            credentials: 'include',
                            headers,
                            body: form.toString(),
                        });
                        const body = await response.text();
                        rememberText(body);
                        if (response.status === 429) return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'rate_limited' });
                        if (!response.ok) return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'http_' + response.status });
                        const data = parseAbout(body);
                        if (data && (data.username || data.joined || data.location)) {
                            if (!data.username) data.username = clean(username).replace(/^@+/, '');
                            window.dispatchEvent(new CustomEvent('hege:threads-about-profile', { detail: { ...data, source: 'accelerated_about_api' } }));
                            return emitActiveResponse(requestId, { ok: true, status: response.status, data });
                        }
                        return emitActiveResponse(requestId, { ok: false, status: response.status, error: 'empty_about_payload' });
                    } catch (error) {
                        return emitActiveResponse(requestId, { ok: false, error: String(error?.message || error || 'active_about_error') });
                    }
                };
                const publish = (body) => {
                    rememberText(body);
                    const data = parseAbout(body);
                    if (data && (data.username || data.joined || data.location)) {
                        window.dispatchEvent(new CustomEvent('hege:threads-about-profile', { detail: data }));
                    }
                };
                const originalFetch = window.fetch;
                if (typeof originalFetch === 'function') {
                    window.fetch = async function(...args) {
                        const url = String(args[0]?.url || args[0] || '');
                        const body = String(args[0]?.body || args[1]?.body || '');
                        const headers = args[0]?.headers || args[1]?.headers || {};
                        rememberText(body);
                        const response = await originalFetch.apply(this, args);
                        if (url.includes('about_this_profile_async_action')) {
                            sanitizeAboutTemplate('fetch', url, body, headers);
                            response.clone().text().then(publish).catch(() => {});
                        } else if (/graphql|bulk-route|api/i.test(url)) {
                            response.clone().text().then(body => {
                                rememberText(body);
                                if (body && body.length < 600000) {
                                    try { collectUsers(JSON.parse(stripPrefix(body))); } catch (_) {}
                                }
                            }).catch(() => {});
                        }
                        return response;
                    };
                }
                const originalOpen = XMLHttpRequest.prototype.open;
                const originalSend = XMLHttpRequest.prototype.send;
                const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    this.__hegeAboutUrl = String(url || '');
                    this.__hegeRequestHeaders = {};
                    return originalOpen.call(this, method, url, ...rest);
                };
                XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
                    this.__hegeRequestHeaders = this.__hegeRequestHeaders || {};
                    this.__hegeRequestHeaders[String(name || '')] = String(value || '');
                    return originalSetRequestHeader.call(this, name, value);
                };
                XMLHttpRequest.prototype.send = function(...args) {
                    const requestBody = String(args[0] || '');
                    rememberText(requestBody);
                    if (this.__hegeAboutUrl && this.__hegeAboutUrl.includes('about_this_profile_async_action')) {
                        sanitizeAboutTemplate('xhr', this.__hegeAboutUrl, requestBody, this.__hegeRequestHeaders || {});
                        this.addEventListener('load', function() { publish(this.responseText || ''); });
                    }
                    return originalSend.apply(this, args);
                };
                window.addEventListener('hege:threads-profile-user-id-seed', event => {
                    const items = Array.isArray(event?.detail?.items) ? event.detail.items : [];
                    items.forEach(item => rememberUser(item?.username || '', item?.userId || '', 'content_cache_seed'));
                });
                window.addEventListener('hege:threads-about-profile-template-seed', event => {
                    seedAboutTemplate(event?.detail || {});
                });
                window.addEventListener('hege:threads-about-profile-fetch-request', event => {
                    const detail = event?.detail || {};
                    const requestId = clean(detail.requestId || '');
                    const username = clean(detail.username || '');
                    if (!requestId || !username) return;
                    fetchActiveAbout(requestId, username, detail.targetUserId || '');
                });
                scanDocumentState();
            })();`;
            const script = document.createElement('script');
            script.textContent = bridgeSource;
            script.addEventListener('error', () => {
                window.__hegeAboutProfilePassiveBridgeStatus = {
                    ...(window.__hegeAboutProfilePassiveBridgeStatus || {}),
                    ready: false,
                    source: 'inline_script_error',
                    checkedAt: Date.now(),
                    error: 'script_error',
                };
            });
            (document.documentElement || document.head || document.body).appendChild(script);
            script.remove();
            Core.ThreeNoWatch.seedAboutProfileBridgeCaches();
            window.dispatchEvent(new CustomEvent('hege:threads-about-profile-bridge-ping'));
        },

        getAboutProfileBridgeStatus: () => {
            const status = window.__hegeAboutProfilePassiveBridgeStatus;
            if (!status || typeof status !== 'object') {
                return { ready: false, source: '', error: 'no_status' };
            }
            return {
                ready: status.ready === true,
                source: String(status.source || ''),
                href: String(status.href || ''),
                hasFetch: status.hasFetch === true,
                hasXhr: status.hasXhr === true,
                hasFbDtsg: status.hasFbDtsg === true,
                knownUserIds: parseInt(status.knownUserIds || '0', 10) || 0,
                hasAboutTemplate: status.hasAboutTemplate === true,
                aboutTemplateAgeMs: parseInt(status.aboutTemplateAgeMs || '0', 10) || 0,
                checkedAt: parseInt(status.checkedAt || '0', 10) || 0,
                error: String(status.error || ''),
            };
        },

        getProfileMetadataCache: () => {
            const cache = Storage.getJSON(CONFIG.KEYS.THREE_NO_PROFILE_METADATA_CACHE, {});
            return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
        },

        readProfileMetadataCache: (username = '') => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            if (!normalized) return null;
            const item = Core.ThreeNoWatch.getProfileMetadataCache()[normalized];
            if (!item || typeof item !== 'object') return null;
            const capturedAt = parseInt(item.capturedAt || '0', 10) || 0;
            const maxAge = 24 * 3600 * 1000;
            if (!capturedAt || Date.now() - capturedAt > maxAge) return null;
            return item;
        },

        writeProfileMetadataCache: (username = '', payload = {}) => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username || payload.username || '').toLowerCase();
            if (!normalized) return;
            const cache = Core.ThreeNoWatch.getProfileMetadataCache();
            cache[normalized] = {
                username: normalized,
                displayName: String(payload.displayName || ''),
                joined: String(payload.joined || ''),
                location: String(payload.location || ''),
                isVerified: payload.isVerified === true,
                source: String(payload.source || 'passive_about_api'),
                capturedAt: parseInt(payload.capturedAt || `${Date.now()}`, 10) || Date.now(),
            };
            const entries = Object.entries(cache)
                .sort((a, b) => (parseInt(b[1]?.capturedAt || '0', 10) || 0) - (parseInt(a[1]?.capturedAt || '0', 10) || 0))
                .slice(0, 500);
            Storage.setJSON(CONFIG.KEYS.THREE_NO_PROFILE_METADATA_CACHE, Object.fromEntries(entries));
        },

        getProfileUserIdCache: () => {
            const cache = Storage.getJSON(CONFIG.KEYS.THREE_NO_PROFILE_USER_ID_CACHE, {});
            return cache && typeof cache === 'object' && !Array.isArray(cache) ? cache : {};
        },

        readProfileUserIdCache: (username = '') => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            if (!normalized) return null;
            const item = Core.ThreeNoWatch.getProfileUserIdCache()[normalized];
            if (!item || typeof item !== 'object') return null;
            const capturedAt = parseInt(item.capturedAt || '0', 10) || 0;
            const maxAge = 30 * 24 * 3600 * 1000;
            if (!capturedAt || Date.now() - capturedAt > maxAge) return null;
            const userId = String(item.userId || '').replace(/\D+/g, '');
            if (!userId) return null;
            return {
                username: normalized,
                userId,
                source: String(item.source || ''),
                capturedAt,
            };
        },

        writeProfileUserIdCache: (username = '', payload = {}) => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username || payload.username || '').toLowerCase();
            const userId = String(payload.userId || payload.id || '').replace(/\D+/g, '');
            if (!normalized || !userId) return;
            const cache = Core.ThreeNoWatch.getProfileUserIdCache();
            cache[normalized] = {
                username: normalized,
                userId,
                source: String(payload.source || 'passive_payload'),
                capturedAt: parseInt(payload.capturedAt || `${Date.now()}`, 10) || Date.now(),
            };
            const entries = Object.entries(cache)
                .sort((a, b) => (parseInt(b[1]?.capturedAt || '0', 10) || 0) - (parseInt(a[1]?.capturedAt || '0', 10) || 0))
                .slice(0, 1200);
            Storage.setJSON(CONFIG.KEYS.THREE_NO_PROFILE_USER_ID_CACHE, Object.fromEntries(entries));
        },

        getAboutRequestTemplateCache: () => {
            const template = Storage.getJSON(CONFIG.KEYS.THREE_NO_ABOUT_REQUEST_TEMPLATE, {});
            if (!template || typeof template !== 'object' || Array.isArray(template)) return null;
            const capturedAt = parseInt(template.capturedAt || '0', 10) || 0;
            const maxAge = parseInt(CONFIG.THREE_NO_ABOUT_TEMPLATE_MAX_AGE_MS || `${12 * 3600 * 1000}`, 10) || 12 * 3600 * 1000;
            if (!capturedAt || Date.now() - capturedAt > maxAge) return null;
            if (!template.path || !template.appid) return null;
            return template;
        },

        writeAboutRequestTemplateCache: (payload = {}) => {
            if (!payload || typeof payload !== 'object') return null;
            const template = {
                capturedAt: parseInt(payload.capturedAt || `${Date.now()}`, 10) || Date.now(),
                source: String(payload.source || 'passive_network'),
                path: String(payload.path || '/async/wbloks/fetch/').slice(0, 160),
                appid: String(payload.appid || 'com.bloks.www.text_post_app.about_this_profile_async_action').slice(0, 160),
                type: String(payload.type || 'app').slice(0, 40),
                bkv: String(payload.bkv || '').slice(0, 120),
                friendlyName: String(payload.friendlyName || 'BarcelonaProfileAboutThisProfileAsyncActionQuery').slice(0, 160),
                refererType: String(payload.refererType || 'TextPostAppProfileOverflow').slice(0, 120),
                paramKeys: Array.isArray(payload.paramKeys) ? payload.paramKeys.map(String).slice(0, 20) : [],
                formKeys: Array.isArray(payload.formKeys) ? payload.formKeys.map(String).slice(0, 40) : [],
            };
            if (!template.path || !template.appid) return null;
            Storage.setJSON(CONFIG.KEYS.THREE_NO_ABOUT_REQUEST_TEMPLATE, template);
            return template;
        },

        seedAboutProfileBridgeCaches: () => {
            const userIdEntries = Object.values(Core.ThreeNoWatch.getProfileUserIdCache())
                .filter(item => Core.ThreeNoWatch.readProfileUserIdCache(item?.username || ''))
                .slice(0, 400)
                .map(item => ({
                    username: item.username,
                    userId: item.userId,
                }));
            if (userIdEntries.length > 0) {
                window.dispatchEvent(new CustomEvent('hege:threads-profile-user-id-seed', {
                    detail: { items: userIdEntries },
                }));
            }
            const template = Core.ThreeNoWatch.getAboutRequestTemplateCache();
            if (template) {
                window.dispatchEvent(new CustomEvent('hege:threads-about-profile-template-seed', {
                    detail: template,
                }));
            }
        },

        injectActiveAboutMetadataRequest: (requestId = '', username = '', targetUserId = '') => {
            const cleanRequestId = String(requestId || '').trim();
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            if (!cleanRequestId || !normalized) return false;
            window.dispatchEvent(new CustomEvent('hege:threads-about-profile-fetch-request', {
                detail: {
                    requestId: cleanRequestId,
                    username: normalized,
                    targetUserId: String(targetUserId || '').replace(/\D+/g, ''),
                },
            }));
            return true;
        },

        waitForPassiveAboutMetadata: async (username = '', timeoutMs = 1600) => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            if (!normalized) return null;
            const before = Core.ThreeNoWatch.readProfileMetadataCache(normalized);
            if (before) return before;
            await Utils.pollUntil(() => Core.ThreeNoWatch.readProfileMetadataCache(normalized), timeoutMs, 150).catch(() => null);
            return Core.ThreeNoWatch.readProfileMetadataCache(normalized);
        },

        requestActiveAboutMetadataOnce: async (username = '', timeoutMs = 3500, attempt = 1) => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            if (!normalized || !Storage.getThreeNoAcceleratedProfileEnabled?.()) {
                return { ok: false, attempt, error: 'accelerated_disabled' };
            }
            Core.ThreeNoWatch.installAboutProfilePassiveBridge();
            Core.ThreeNoWatch.seedAboutProfileBridgeCaches();
            window.dispatchEvent(new CustomEvent('hege:threads-about-profile-bridge-ping'));
            await Utils.safeSleep(120);
            const bridgeStatus = Core.ThreeNoWatch.getAboutProfileBridgeStatus();
            if (bridgeStatus.ready !== true) {
                return {
                    ok: false,
                    attempt,
                    error: 'bridge_not_ready',
                    bridgeStatus,
                };
            }
            const cachedUserId = Core.ThreeNoWatch.readProfileUserIdCache(normalized)?.userId || '';
            const requestId = `hege_about_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            return new Promise(resolve => {
                let settled = false;
                const cleanup = () => {
                    settled = true;
                    clearTimeout(timer);
                    window.removeEventListener('hege:threads-about-profile-fetch-response', handler);
                };
                const finish = (value) => {
                    if (settled) return;
                    cleanup();
                    resolve(value);
                };
                const timer = setTimeout(() => {
                    finish({ ok: false, attempt, error: 'timeout' });
                }, timeoutMs);
                const handler = (event) => {
                    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
                    if (detail.requestId !== requestId) return;
                    if (!detail.ok) {
                        finish({
                            ok: false,
                            attempt,
                            status: detail.status || 0,
                            error: String(detail.error || 'unknown'),
                            bridgeStatus: Core.ThreeNoWatch.getAboutProfileBridgeStatus(),
                        });
                        return;
                    }
                    const data = detail.data && typeof detail.data === 'object' ? detail.data : {};
                    Core.ThreeNoWatch.writeProfileMetadataCache(normalized, {
                        username: normalized,
                        displayName: String(data.displayName || ''),
                        joined: String(data.joined || ''),
                        location: String(data.location || ''),
                        isVerified: data.isVerified === true,
                        source: 'accelerated_about_api',
                        capturedAt: Date.now(),
                    });
                    const cached = Core.ThreeNoWatch.readProfileMetadataCache(normalized);
                    if (cached) cached.activeAboutAttempt = attempt;
                    finish({
                        ok: true,
                        attempt,
                        status: detail.status || 200,
                        item: cached,
                        bridgeStatus: Core.ThreeNoWatch.getAboutProfileBridgeStatus(),
                    });
                };
                window.addEventListener('hege:threads-about-profile-fetch-response', handler);
                if (!Core.ThreeNoWatch.injectActiveAboutMetadataRequest(requestId, normalized, cachedUserId)) {
                    finish({ ok: false, attempt, error: 'active_injection_failed' });
                }
            });
        },

        summarizeActiveAboutAttempts: (attempts = []) => attempts
            .map(item => {
                const status = item.status ? `:${item.status}` : '';
                return `${item.attempt}/${item.maxAttempts || attempts.length}:${item.ok ? 'ok' : (item.error || 'failed')}${status}`;
            })
            .join(' | '),

        requestActiveAboutMetadata: async (username = '', options = {}) => {
            const normalized = Core.ThreeNoWatch.normalizeUsername(username).toLowerCase();
            if (!normalized || !Storage.getThreeNoAcceleratedProfileEnabled?.()) return null;
            const maxAttempts = Math.max(1, Math.min(2, parseInt(options.maxAttempts || '1', 10) || 1));
            const timeoutMs = Math.max(900, Math.min(5000, parseInt(options.timeoutMs || `${CONFIG.THREE_NO_ABOUT_ACTIVE_TIMEOUT_MS || 2200}`, 10) || 2200));
            const attempts = [];
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                Core.ThreeNoWatch.setScanState({
                    debug: {
                        step: 'accelerated_about_attempt',
                        username: normalized,
                        activeAboutAttempt: `${attempt}/${maxAttempts}`,
                        activeAboutAttempts: Core.ThreeNoWatch.summarizeActiveAboutAttempts(attempts),
                        url: window.location.href,
                    },
                });
                const result = await Core.ThreeNoWatch.requestActiveAboutMetadataOnce(normalized, timeoutMs, attempt);
                const record = {
                    attempt,
                    maxAttempts,
                    ok: result?.ok === true,
                    status: result?.status || 0,
                    error: result?.ok ? '' : String(result?.error || 'unknown'),
                    bridgeStatus: result?.bridgeStatus || Core.ThreeNoWatch.getAboutProfileBridgeStatus(),
                };
                attempts.push(record);
                const summary = Core.ThreeNoWatch.summarizeActiveAboutAttempts(attempts);
                if (result?.ok && result.item && (result.item.joined || result.item.location)) {
                    result.item.activeAboutAttempts = summary;
                    result.item.activeAboutAttemptCount = attempt;
                    Core.ThreeNoWatch.setScanState({
                        debug: {
                            step: 'accelerated_about_success',
                            username: normalized,
                            activeAboutAttempt: `${attempt}/${maxAttempts}`,
                            activeAboutAttempts: summary,
                            status: result.status || 200,
                            url: window.location.href,
                        },
                    });
                    return result.item;
                }
                const shouldRetry = record.error === 'timeout' && attempt < maxAttempts;
                Core.ThreeNoWatch.setScanState({
                    debug: {
                        step: shouldRetry ? 'accelerated_about_retry_wait' : 'accelerated_about_fallback_after_retries',
                        username: normalized,
                        activeAboutAttempt: `${attempt}/${maxAttempts}`,
                        activeAboutAttempts: summary,
                        status: record.status,
                        error: record.error,
                        bridgeStatus: record.bridgeStatus,
                        retryPolicy: 'passive_template_once',
                        fallbackNext: shouldRetry ? '' : 'about_menu_three_dots',
                        url: window.location.href,
                    },
                });
                if (!shouldRetry) break;
                await Utils.safeSleep(Math.min(1200, 350 + attempt * 250));
            }
            return null;
        },

        buildMetadataFromCachedAbout: (item = {}, source = 'passive_about_api_cache') => {
            const joinedAt = Core.ThreeNoWatch.parseJoinedAt(item.joined || '');
            const locationLabel = String(item.location || '').trim();
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
                debug: {
                    cacheSource: item.source || '',
                    cachedAt: item.capturedAt || 0,
                    passiveJoined: item.joined || '',
                    passiveLocation: item.location || '',
                    activeAboutAttempts: item.activeAboutAttempts || '',
                    activeAboutAttemptCount: item.activeAboutAttemptCount || 0,
                },
            };
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

        extractProfileMetadata: async (root, username = '') => {
            const normalizedUser = Core.ThreeNoWatch.normalizeUsername(username || Core.ThreeNoWatch.getCurrentProfileUsername()).toLowerCase();
            Core.ThreeNoWatch.installAboutProfilePassiveBridge();
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
            const cached = Core.ThreeNoWatch.readProfileMetadataCache(normalizedUser);
            if (cached && (cached.joined || cached.location)) {
                return Core.ThreeNoWatch.buildMetadataFromCachedAbout(cached, 'passive_about_api_cache');
            }
            const passiveWaitMs = Math.max(250, Math.min(1800, parseInt(CONFIG.THREE_NO_ABOUT_PASSIVE_WAIT_MS || '700', 10) || 700));
            const passiveBeforeActive = await Core.ThreeNoWatch.waitForPassiveAboutMetadata(normalizedUser, passiveWaitMs);
            if (passiveBeforeActive && (passiveBeforeActive.joined || passiveBeforeActive.location)) {
                return Core.ThreeNoWatch.buildMetadataFromCachedAbout(passiveBeforeActive, 'passive_about_api');
            }
            if (Storage.getThreeNoAcceleratedProfileEnabled?.()) {
                const active = await Core.ThreeNoWatch.requestActiveAboutMetadata(normalizedUser, {
                    maxAttempts: 1,
                    timeoutMs: CONFIG.THREE_NO_ABOUT_ACTIVE_TIMEOUT_MS || 2200,
                });
                if (active && (active.joined || active.location)) {
                    return Core.ThreeNoWatch.buildMetadataFromCachedAbout(active, 'accelerated_about_api');
                }
            }
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
                const clickableAncestorForButton = (el) => {
                    let node = el;
                    for (let depth = 0; node && depth < 8; depth++) {
                        if (node.matches?.('button, div[role="button"], [tabindex="0"]')) return node;
                        node = node.parentElement;
                    }
                    return el.closest?.('button, div[role="button"], [tabindex="0"]') || el;
                };
                const looksLikeMoreSvg = (svg) => {
                    if (!svg) return false;
                    const circleCount = svg.querySelectorAll?.('circle').length || 0;
                    const pathCount = svg.querySelectorAll?.('path').length || 0;
                    return /更多|More|もっと見る|더 보기|เพิ่มเติม|Lainnya|Más|Plus|Mehr|Altro|Mais|Ещё|Więcej|Diğer|Thêm|المزيد|और|Meer|Higit pa/i.test(textOf(svg))
                        || (circleCount === 3 && pathCount === 0)
                        || (circleCount >= 1 && pathCount >= 3);
                };
                const seen = new Set();
                return Array.from(document.querySelectorAll([
                    'button',
                    'div[role="button"]',
                    '[tabindex="0"]',
                    CONFIG.SELECTORS.MORE_SVG,
                    'svg[aria-label]',
                ].join(',')))
                    .map(clickableAncestorForButton)
                    .filter(el => {
                        if (!el || seen.has(el)) return false;
                        seen.add(el);
                        return true;
                    })
                    .filter(el => !el.closest('[role="dialog"], [role="menu"]'))
                    .filter(isVisible)
                    .map(el => {
                        const rect = el.getBoundingClientRect();
                        const text = textOf(el);
                        const contextText = contextTextOf(el);
                        const svg = el.matches?.('svg') ? el : (el.querySelector?.(CONFIG.SELECTORS.MORE_SVG) || el.querySelector?.('svg[aria-label]'));
                        const inProfileColumn = rect.left >= rootRect.left - 8 && rect.right <= rootRect.right + 8;
                        const nearProfileHeader = rect.top >= Math.max(0, rootRect.top - 8) && rect.top < Math.min(420, rootRect.top + 360);
                        const looksLikeIconButton = rect.width <= 120 && rect.height <= 120;
                        const likelyProfileAction = /Instagram|IG|粉絲|位粉絲|Followers|追蹤|Follow|提及|Mention/i.test(contextText);
                        const likelyColumnTitle = /直欄標題|column title/i.test(contextText);
                        const likelyGlobalMenu = /外觀|設定|已讀|封存|登出|Appearance|Settings|Archive|Log out/i.test(contextText);
                        const circleCount = svg?.querySelectorAll?.('circle').length || 0;
                        const pathCount = svg?.querySelectorAll?.('path').length || 0;
                        let score = 100;
                        if (inProfileColumn) score -= 24;
                        if (nearProfileHeader) score -= 22;
                        if (likelyProfileAction) score -= 28;
                        if (looksLikeIconButton) score -= 8;
                        if (circleCount >= 1 && pathCount >= 3) score -= 8;
                        if (circleCount === 3 && pathCount === 0) score -= 4;
                        if (likelyColumnTitle || rect.top <= rootRect.top + 48) score += 16;
                        if (likelyGlobalMenu || rect.left < 72) score += 70;
                        return {
                            el,
                            rect,
                            score,
                            valid: inProfileColumn
                            && nearProfileHeader
                            && looksLikeIconButton
                            && (/更多|More/i.test(text) || looksLikeMoreSvg(svg)),
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
                const passive = await Core.ThreeNoWatch.waitForPassiveAboutMetadata(normalizedUser, 2200);
                if (passive && (passive.joined || passive.location)) {
                    const parsedPassive = Core.ThreeNoWatch.buildMetadataFromCachedAbout(passive, 'passive_about_api');
                    parsedPassive.debug = {
                        ...(parsedPassive.debug || {}),
                        aboutClicked: true,
                        aboutMenuOpened: menuOpened,
                        moreButtonFound: !!moreTarget,
                        aboutTargetTag: target.tagName?.toLowerCase?.() || '',
                        aboutTargetRole: target.getAttribute?.('role') || '',
                        aboutTargetText: textOf(target).slice(0, 80),
                    };
                    return parsedPassive;
                }
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
            const zh = value.match(/(?:已加入|加入|參加日|参加日)?\s*(\d{4})年\s*(\d{1,2})月/);
            if (zh) return new Date(parseInt(zh[1], 10), parseInt(zh[2], 10) - 1, 1).getTime();
            const ko = value.match(/(\d{4})년\s*(\d{1,2})월/);
            if (ko) return new Date(parseInt(ko[1], 10), parseInt(ko[2], 10) - 1, 1).getTime();
            const en = value.match(/Joined\s+([A-Za-z]+)\s+(\d{4})/i);
            const enLoose = en || value.match(/\b([A-Za-z]+)\s+(\d{4})\b/i);
            if (enLoose) {
                const months = {
                    january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
                    may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8, sep: 8,
                    sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
                };
                const month = months[String(enLoose[1] || '').toLowerCase()];
                const year = parseInt(enLoose[2], 10);
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
            const scanProgressUserSet = new Set(scanProgressUsers
                .map(u => Core.ThreeNoWatch.normalizeUsername(u))
                .filter(Boolean));
            const currentFindingUsers = new Set(findings
                .map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || ''))
                .filter(Boolean));
            const currentFindingItems = new Set(findings);
            const previousFindingsToMerge = previousFindings.filter(item => {
                const username = Core.ThreeNoWatch.normalizeUsername(item?.username || '');
                if (!username) return false;
                return !(scanProgressUserSet.has(username) && !currentFindingUsers.has(username));
            });
            const findingsByUser = new Map();
            [...previousFindingsToMerge, ...findings].forEach(item => {
                const username = Core.ThreeNoWatch.normalizeUsername(item?.username || '');
                if (!username) return;
                const existing = findingsByUser.get(username);
                const itemIsFreshFinding = currentFindingItems.has(item);
                const mergeBooleanSignal = (key) => itemIsFreshFinding
                    ? item?.[key] === true
                    : (existing?.[key] === true || item?.[key] === true);
                const hasExplicitEmptyReason = (source, key) => /^explicit_empty:/i.test(String(source?.metadataDebug?.[key] || ''));
                const hasNoContentEvidence = (source, knownKey, valueKey, reasonKey) => {
                    if (!source || source.accountPrivate === true) return false;
                    return (source?.[knownKey] === true && source?.[valueKey] === true) || hasExplicitEmptyReason(source, reasonKey);
                };
                const accountPrivate = mergeBooleanSignal('accountPrivate');
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
                    noAvatar: mergeBooleanSignal('noAvatar'),
                    noBio: mergeBooleanSignal('noBio'),
                    noPosts: accountPrivate ? false : (itemIsFreshFinding
                        ? hasNoContentEvidence(item, 'noPostsKnown', 'noPosts', 'postsSignalReason')
                        : (hasNoContentEvidence(existing, 'noPostsKnown', 'noPosts', 'postsSignalReason') || hasNoContentEvidence(item, 'noPostsKnown', 'noPosts', 'postsSignalReason'))),
                    noReplies: accountPrivate ? false : (itemIsFreshFinding
                        ? hasNoContentEvidence(item, 'noRepliesKnown', 'noReplies', 'repliesSignalReason')
                        : (hasNoContentEvidence(existing, 'noRepliesKnown', 'noReplies', 'repliesSignalReason') || hasNoContentEvidence(item, 'noRepliesKnown', 'noReplies', 'repliesSignalReason'))),
                    noReposts: accountPrivate ? false : (itemIsFreshFinding
                        ? hasNoContentEvidence(item, 'noRepostsKnown', 'noReposts', 'repostsSignalReason')
                        : (hasNoContentEvidence(existing, 'noRepostsKnown', 'noReposts', 'repostsSignalReason') || hasNoContentEvidence(item, 'noRepostsKnown', 'noReposts', 'repostsSignalReason'))),
                    accountPrivate,
                    suspiciousUsername: mergeBooleanSignal('suspiciousUsername'),
                    profileSignalsVersion: Math.max(
                        parseInt(existing?.profileSignalsVersion || '0', 10) || 0,
                        parseInt(item.profileSignalsVersion || '0', 10) || 0
                    ),
                    noPostsKnown: accountPrivate ? false : (itemIsFreshFinding
                        ? item.noPostsKnown === true
                        : (existing?.noPostsKnown === true || item.noPostsKnown === true)),
                    noRepliesKnown: accountPrivate ? false : (itemIsFreshFinding
                        ? item.noRepliesKnown === true
                        : (existing?.noRepliesKnown === true || item.noRepliesKnown === true)),
                    noRepostsKnown: accountPrivate ? false : (itemIsFreshFinding
                        ? item.noRepostsKnown === true
                        : (existing?.noRepostsKnown === true || item.noRepostsKnown === true)),
                    followerCount: itemIsFreshFinding
                        ? (parseInt(item.followerCount || '0', 10) || 0)
                        : (item.followerCountKnown === true
                            ? (parseInt(item.followerCount || '0', 10) || 0)
                            : (parseInt(existing?.followerCount || '0', 10) || 0)),
                    followerCountKnown: itemIsFreshFinding
                        ? item.followerCountKnown === true
                        : (existing?.followerCountKnown === true || item.followerCountKnown === true),
                    bioSignalReason: String(item.bioSignalReason || existing?.bioSignalReason || ''),
                    contentProbeSkippedReason: String(item.contentProbeSkippedReason || existing?.contentProbeSkippedReason || ''),
                    privateDetectedAt: String(item.privateDetectedAt || existing?.privateDetectedAt || ''),
                    privateSignalReason: String(item.privateSignalReason || existing?.privateSignalReason || ''),
                    privateSignalMatchedText: String(item.privateSignalMatchedText || existing?.privateSignalMatchedText || ''),
                    followerCountSkippedReason: String(item.followerCountSkippedReason || existing?.followerCountSkippedReason || ''),
                    joinedAt: parseInt(item.joinedAt || existing?.joinedAt || '0', 10) || 0,
                    accountAgeDays: parseInt(item.accountAgeDays || existing?.accountAgeDays || '0', 10) || 0,
                    accountAgeBucket: String(item.accountAgeBucket || existing?.accountAgeBucket || ''),
                    isNewAccount: mergeBooleanSignal('isNewAccount'),
                    locationLabel: String(item.locationLabel || existing?.locationLabel || ''),
                    countryTag: String(item.countryTag || existing?.countryTag || ''),
                    regionShared: mergeBooleanSignal('regionShared'),
                    metadataSource: String(item.metadataSource || existing?.metadataSource || ''),
                    metadataSourcePage: String(item.metadataSourcePage || existing?.metadataSourcePage || ''),
                    metadataDebug: item.metadataDebug && typeof item.metadataDebug === 'object'
                        ? item.metadataDebug
                        : (existing?.metadataDebug && typeof existing.metadataDebug === 'object' ? existing.metadataDebug : {}),
                });
            });
            const mergedFindings = Array.from(findingsByUser.values())
                .filter(item => !Storage.isThreeNoUserSafe(item.username));
            const previousUsernames = new Set(previousFindings.map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || '')).filter(Boolean));
            const newUnignoredFindings = findings
                .map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || ''))
                .filter(Boolean)
                .filter(username => !previousUsernames.has(username))
                .filter(username => !Storage.isThreeNoUserIgnored(username))
                .filter(username => !Storage.isThreeNoUserSafe(username));
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
            const debugLog = Core.ThreeNoWatch.getScanDebugLog(scanId);
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
                error: patch.error || '',
                debug: patch.debug || {},
                debugLog,
                users: shouldPersistFindings ? mergedFindings : findings,
            });
            Storage.set(CONFIG.KEYS.THREE_NO_LAST_SCAN_DATE, scanDate);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            Storage.setThreeNoUnreadCount(Math.max(Storage.getThreeNoUnreadCount(), newUnignoredFindings.length || payload.threeNoFollowersCount));
            sessionStorage.removeItem(Core.ThreeNoWatch.stateKey);
            localStorage.removeItem(Core.ThreeNoWatch.runtimeBackupKey);
            Core.ThreeNoWatch.setScanState({
                ...payload,
                users: undefined,
                debug: {
                    ...(patch.debug || {}),
                    debugLogCount: debugLog.length,
                    autoBlockRemoved: true,
                },
            });
            if (completed) {
                try {
                    await UI.tryUploadThreeNoScanStats({ scanId: payload.scanId });
                } catch (err) {
                    if (CONFIG.DEBUG_MODE) console.warn('[留友封][ThreeNo] stats upload skipped/failed', err);
                }
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
