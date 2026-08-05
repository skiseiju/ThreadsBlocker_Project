import { CONFIG } from '../config.js';
import { Storage } from '../storage.js';
import { Utils } from '../utils.js';
import { Reporter } from '../reporter.js';
import { UI } from '../ui.js';
import { Core } from '../core.js';
import { ReportDebugContext } from '../report-debug-context.js';

// Persistent three-no debug material follows the diagnostics lifecycle gate.
// UI copy remains separately beta-visible through Utils.isBetaBuild() below.
const isThreeNoDebugLogActive = () => Core.RuntimeDiagnostics?.betaDebugUI?.() === true;
const serializedByteLength = (value) => {
    let serialized = '';
    try {
        serialized = typeof value === 'string' ? value : JSON.stringify(value);
    } catch (_) {
        return 0;
    }
    if (typeof serialized !== 'string') serialized = String(serialized ?? '');
    try {
        return typeof TextEncoder === 'function' ? new TextEncoder().encode(serialized).length : serialized.length;
    } catch (_) {
        return serialized.length;
    }
};

Object.assign(Core, {
    ThreeNoWatch: {
        stateKey: 'hege_three_no_scan_runtime',
        runtimeBackupKey: 'hege_three_no_scan_runtime_backup',
        networkContentHints: {},

        isChromeExtension: () => Reporter.getClientPlatform() === 'chrome_extension',

        isScanPage: () => new URLSearchParams(window.location.search).get('hege_three_no_scan') === 'true',

        readStopCommand: () => {
            Storage.invalidate(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            const raw = Storage.get(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, '');
            if (raw && typeof raw === 'object') return raw;
            if (String(raw || '') === 'stop') return { command: 'stop', legacy: true };
            try {
                const parsed = raw ? JSON.parse(raw) : null;
                return parsed && typeof parsed === 'object' ? parsed : null;
            } catch (_) {
                return null;
            }
        },

        getOwnedStopCommand: (state = Core.ThreeNoWatch.getScanState()) => {
            const command = Core.ThreeNoWatch.readStopCommand();
            if (!command || String(command.command || '') !== 'stop') return null;
            const scanId = String(state.scanId || '');
            const ownerToken = String(state.ownerToken || '');
            if (command.legacy === true) {
                // Legacy scalar commands are accepted only for ownerless legacy scans.
                return ownerToken ? null : command;
            }
            const requestedAt = Number(command.requestedAt || 0);
            if (!scanId || !ownerToken
                || String(command.scanId || '') !== scanId
                || String(command.ownerToken || '') !== ownerToken
                || !Number.isFinite(requestedAt) || requestedAt <= 0
                || requestedAt > Date.now() + 5 * 60 * 1000
                || Date.now() - requestedAt > 24 * 60 * 60 * 1000) return null;
            return {
                command: 'stop',
                scanId,
                ownerToken,
                requestedAt,
            };
        },

        isStopRequested: () => !!Core.ThreeNoWatch.getOwnedStopCommand(),

        observeStop: async (step = 'stop_observed') => {
            const state = Core.ThreeNoWatch.getScanState();
            if (Core.ThreeNoWatch.isTerminalStatus(state.status) || state.cancelled === true) return true;
            const command = Core.ThreeNoWatch.getOwnedStopCommand(state);
            if (!command) return false;
            const scanId = String(state.scanId || '');
            const ownerToken = String(state.ownerToken || '');
            const legacyOwnerless = command.legacy === true && !ownerToken;
            if ((!scanId && !legacyOwnerless) || (!legacyOwnerless && !Core.ThreeNoWatch.ownsScan(scanId, ownerToken))) return false;
            if (state.status !== 'stopping') {
                Core.ThreeNoWatch.setScanState({
                    scanId,
                    ownerToken,
                    status: 'stopping',
                    debug: { step, stopObservedAt: Date.now() },
                });
            }
            await Core.ThreeNoWatch.finishScan({
                scanId,
                ownerToken,
                status: 'stopped',
                debug: { step, stopObservedAt: Date.now() },
            });
            return true;
        },

        runningStatuses: ['starting', 'ready', 'running', 'scanning', 'collecting_followers', 'followers_collected', 'checking_profiles', 'stopping'],

        terminalStatuses: ['completed', 'stopped', 'failed'],

        READY_TIMEOUT_MS: 10000,
        HEARTBEAT_STALE_MS: 30000,
        STOP_GRACE_MS: 10000,
        LAUNCHER_LOCK_NAME: 'threadsblocker:three-no-scan-launcher',

        readScanLock: () => {
            Storage.invalidate(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
            const raw = Storage.get(CONFIG.KEYS.THREE_NO_SCAN_LOCK, '');
            if (!raw) return null;
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') return {
                    scanId: String(parsed.scanId || ''),
                    token: String(parsed.token || ''),
                    createdAt: parseInt(parsed.createdAt || '0', 10) || 0,
                };
            } catch (_) {}
            const createdAt = parseInt(raw, 10) || 0;
            return createdAt > 0 ? { scanId: '', token: 'legacy', createdAt } : null;
        },

        ownsScan: (scanId = '', token = '') => {
            const state = Core.ThreeNoWatch.getScanState();
            const lock = Core.ThreeNoWatch.readScanLock();
            const id = String(scanId || '');
            const owner = String(token || '');
            return !!id && !!owner
                && String(state.scanId || '') === id
                && String(state.ownerToken || '') === owner
                && !!lock
                && String(lock.scanId || '') === id
                && String(lock.token || '') === owner
                && !Core.ThreeNoWatch.isTerminalStatus(state.status)
                && state.cancelled !== true;
        },

        clearOwnedScan: (scanId = '', token = '') => {
            const id = String(scanId || '');
            const owner = String(token || '');
            const lock = Core.ThreeNoWatch.readScanLock();
            if (lock && lock.scanId === id && lock.token === owner) Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
            const state = Core.ThreeNoWatch.getScanState();
            const command = Core.ThreeNoWatch.readStopCommand();
            if (String(state.scanId || '') === id && String(state.ownerToken || '') === owner
                && (command?.legacy === true
                    || (String(command?.scanId || '') === id && String(command?.ownerToken || '') === owner))) {
                Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            }
            return !!(String(state.scanId || '') === id && String(state.ownerToken || '') === owner);
        },

        markTerminalIfOwned: (scanId, token, patch = {}) => {
            if (!Core.ThreeNoWatch.ownsScan(scanId, token)) return false;
            const accepted = Core.ThreeNoWatch.setScanState({
                scanId,
                ownerToken: token,
                ...patch,
                cancelled: true,
                terminalAt: Date.now(),
            });
            if (accepted === false) return false;
            Core.ThreeNoWatch.clearOwnedScan(scanId, token);
            return true;
        },

        isRunningStatus: (status = '') => Core.ThreeNoWatch.runningStatuses.includes(String(status || '')),

        isTerminalStatus: (status = '') => Core.ThreeNoWatch.terminalStatuses.includes(String(status || '')),

        normalizeLifecycleStatus: (status = '') => {
            const value = String(status || '');
            if (value === 'running') return 'ready';
            if (['collecting_followers', 'followers_collected', 'checking_profiles'].includes(value)) return 'scanning';
            return value;
        },

        lifecycleCounts: (state = {}) => ({
            checked: Math.max(0, parseInt(state.checkedFollowersCount || '0', 10) || 0),
            candidates: Math.max(0, parseInt(state.candidateFollowersCount || '0', 10) || 0),
            findings: Math.max(0, parseInt(state.threeNoFollowersCount || '0', 10) || 0),
        }),

        recordLifecycleSnapshot: (state = {}, result = '') => {
            const allowed = ReportDebugContext.RESULTS.has(result) ? result : 'unknown';
            const now = Date.now();
            const previous = Storage.getJSON(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, null);
            const snapshot = ReportDebugContext.append(previous, {
                ts: now,
                stage: 'three_no',
                result: allowed,
                routeType: 'other',
                counts: Core.ThreeNoWatch.lifecycleCounts(state),
            }, now);
            if (!snapshot) return null;
            Storage.setJSON(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, snapshot);
            Storage.setJSON(CONFIG.KEYS.REPORT_DEBUG_CONTEXT_V2, ReportDebugContext.contextFromSnapshot(snapshot, now));
            return snapshot;
        },

        getDebugSchemaVersion: () => 'network-discovery-v6',

        resetOldDebugSchemaIfNeeded: () => {
            if (!isThreeNoDebugLogActive()) return false;
            const key = CONFIG.KEYS.THREE_NO_SCAN_DEBUG_SCHEMA || 'hege_three_no_scan_debug_schema';
            const next = Core.ThreeNoWatch.getDebugSchemaVersion();
            const previous = Storage.get(key, '');
            if (previous === next) return false;
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, []);
            Storage.set(key, next);
            return true;
        },

        // Production/beta builds with diagnostics disabled must clear stale raw
        // debug material at boot, independently of any network event listener.
        purgeInactiveThreeNoDebugLog: () => {
            if (isThreeNoDebugLogActive()) return false;
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_SCHEMA);
            return true;
        },

        requestStop: () => {
            const state = Core.ThreeNoWatch.getScanState();
            const scanId = String(state.scanId || '');
            const ownerToken = String(state.ownerToken || '');
            const appendRejectDebug = (step = '') => {
                try {
                    Core.ThreeNoWatch.appendScanDebugLog({
                        scanId,
                        status: String(state.status || ''),
                        debug: { step },
                    });
                } catch (_) {}
            };
            if (!scanId || !ownerToken || Core.ThreeNoWatch.isTerminalStatus(state.status) || state.cancelled === true) {
                let rejectStep = 'stop_rejected_missing_ids';
                if (scanId && ownerToken) {
                    rejectStep = Core.ThreeNoWatch.isTerminalStatus(state.status)
                        ? 'stop_rejected_already_terminal'
                        : 'stop_rejected_cancelled';
                }
                appendRejectDebug(rejectStep);
                return false;
            }
            if (!Core.ThreeNoWatch.ownsScan(scanId, ownerToken)) {
                appendRejectDebug('stop_rejected_not_owned');
                return false;
            }
            const requestedAt = Date.now();
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, {
                command: 'stop',
                scanId,
                ownerToken,
                requestedAt,
            });
            Core.RuntimeDiagnostics?.record('three_no', 'request', { operationId: state.diagnosticOperationId, stopRequested: true, active: true, ok: true });
            const accepted = Core.ThreeNoWatch.setScanState({
                scanId,
                ownerToken,
                status: 'stopping',
                debug: {
                    step: 'user_stop_requested',
                    requestedAt,
                },
            });
            if (accepted === false) {
                const command = Core.ThreeNoWatch.readStopCommand();
                if (command?.scanId === scanId && command?.ownerToken === ownerToken) Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
                appendRejectDebug('stop_rejected_set_state');
                return false;
            }
            return true;
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
            if (heartbeatAt > 0) return now - heartbeatAt < Core.ThreeNoWatch.HEARTBEAT_STALE_MS;
            return updatedAt > 0 && now - updatedAt < Core.ThreeNoWatch.HEARTBEAT_STALE_MS;
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
            if (!isThreeNoDebugLogActive()) return;
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
            if (!isThreeNoDebugLogActive()) return;
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

        // 2.8：擷取 request token 的 page bridge 與 installNetworkDiscoveryListener 已移除，
        // 這個 writer 已無生產呼叫點，只保留給 beta83 production-purge regression 覆蓋。
        appendNetworkDiscoveryLog: (detail = {}) => {
            if (!isThreeNoDebugLogActive()) return;
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
                    source: 'passive_local_hint',
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
            if (!isThreeNoDebugLogActive()) return;
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

        clearStaleScanIfNeeded: (reason = 'stale_scan_worker_missing') => {
            const state = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            if (!Core.ThreeNoWatch.isRunningStatus(state.status)) return false;
            const stopCommand = Core.ThreeNoWatch.readStopCommand();
            const stopRequestedAt = parseInt(stopCommand?.requestedAt || '0', 10) || 0;
            const staleStopping = String(state.status || '') === 'stopping'
                && stopRequestedAt > 0
                && Date.now() - stopRequestedAt >= Core.ThreeNoWatch.STOP_GRACE_MS;
            if (!staleStopping && Core.ThreeNoWatch.isFreshRunningState(state)) return false;
            if (state.scanId && state.ownerToken) {
                return Core.ThreeNoWatch.markTerminalIfOwned(state.scanId, state.ownerToken, {
                    status: 'stopped',
                    completedAt: Date.now(),
                    error: 'worker_stale',
                    debug: {
                        ...(state.debug && typeof state.debug === 'object' ? state.debug : {}),
                        step: reason,
                        stalePreviousStatus: state.status || '',
                        staleUpdatedAt: state.updatedAt || 0,
                        staleWorkerHeartbeatAt: state.workerHeartbeatAt || 0,
                    },
                });
            }
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            Core.ThreeNoWatch.setScanState({
                ...state,
                status: 'stopped',
                completedAt: Date.now(),
                error: 'worker_stale',
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

        clearTerminalScanBeforeStart: () => {
            const state = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            const isTerminal = Core.ThreeNoWatch.isTerminalStatus(state.status) || state.cancelled === true;
            if (!isTerminal) return false;
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_STATE);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
            Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            Core.RuntimeDiagnostics?.record('three_no', 'precondition', {
                reason: 'stopped', failureType: 'cleared_terminal_before_start', active: false,
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
                const state = Core.ThreeNoWatch.getScanState();
                if (!Core.ThreeNoWatch.isRunningStatus(state.status) || state.status === 'stopping' || Core.ThreeNoWatch.isTerminalStatus(state.status)) {
                    clearInterval(window.__hegeThreeNoWorkerHeartbeat);
                    window.__hegeThreeNoWorkerHeartbeat = null;
                    return;
                }
                if (state.ownerToken && !Core.ThreeNoWatch.ownsScan(state.scanId, state.ownerToken)) return;
                const now = Date.now();
                // Re-read immediately before writing so a late heartbeat cannot revive
                // a stopping/terminal state written by another tab.
                Storage.invalidate(CONFIG.KEYS.THREE_NO_SCAN_STATE);
                const latest = Core.ThreeNoWatch.getScanState();
                if (latest.status === 'stopping' || Core.ThreeNoWatch.isTerminalStatus(latest.status)
                    || latest.cancelled === true
                    || String(latest.scanId || '') !== String(state.scanId || '')
                    || String(latest.ownerToken || '') !== String(state.ownerToken || '')) return;
                Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
                    ...latest,
                    workerHeartbeatAt: now,
                    workerInstanceId: latest.workerInstanceId || window.__hegeThreeNoWorkerInstanceId || '',
                    updatedAt: now,
                });
            };
            window.__hegeThreeNoWorkerHeartbeat = setInterval(tick, 5000);
            tick();
        },

        setScanState: (state = {}) => {
            Storage.invalidate(CONFIG.KEYS.THREE_NO_SCAN_STATE);
            const previous = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            const rawStatus = String(state.status || '');
            const lifecycleStatus = Core.ThreeNoWatch.normalizeLifecycleStatus(rawStatus);
            const requestedScanId = String(state.scanId || '');
            const previousScanId = String(previous.scanId || '');
            if (requestedScanId && previousScanId && requestedScanId !== previousScanId) return false;
            if (Core.ThreeNoWatch.isTerminalStatus(previous.status) || previous.cancelled === true) return false;
            if (previous.status === 'stopping' && !Core.ThreeNoWatch.isTerminalStatus(lifecycleStatus || rawStatus)) return false;
            if (state.ownerToken && previous.ownerToken && String(state.ownerToken) !== String(previous.ownerToken)) return false;
            if (window.__hegeThreeNoWorkerOwnerToken && previous.ownerToken
                && String(window.__hegeThreeNoWorkerOwnerToken) !== String(previous.ownerToken)) return false;
            const next = {
                ...previous,
                ...state,
                ...(lifecycleStatus && lifecycleStatus !== rawStatus ? { phase: rawStatus, status: lifecycleStatus } : {}),
                updatedAt: Date.now(),
            };
            if (state.status && state.status !== 'failed' && !Object.prototype.hasOwnProperty.call(state, 'error')) {
                next.error = '';
            }
            Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, next);
            Core.ThreeNoWatch.appendScanDebugLog(next);
            Core.ThreeNoWatch.renderWorkerOverlay(next);
            const operationId = String(next.diagnosticOperationId || '').trim();
            if (operationId && (String(previous.status || '') !== String(next.status || '')
                || Object.prototype.hasOwnProperty.call(state, 'checkedFollowersCount')
                || Object.prototype.hasOwnProperty.call(state, 'candidateFollowersCount')
                || Object.prototype.hasOwnProperty.call(state, 'workerReadyAt')
                || Object.prototype.hasOwnProperty.call(state, 'workerHeartbeatAt'))) {
                const status = String(next.status || '');
                const terminal = ['failed', 'stopped', 'completed'].includes(status);
                const stage = terminal ? (status === 'completed' ? 'finish' : status === 'stopped' ? 'stop' : 'error')
                    : status === 'starting' ? 'launch'
                        : status === 'ready' ? 'worker'
                            : status === 'stopping' ? 'ack' : 'progress';
                Core.RuntimeDiagnostics?.record('three_no', stage, {
                    operationId,
                    created: status === 'starting', attached: status === 'ready',
                    stopped: status === 'stopping' || status === 'stopped',
                    complete: status === 'completed', failure: status === 'failed',
                    checkedCount: parseInt(next.checkedFollowersCount || '0', 10) || 0,
                    candidateCount: parseInt(next.candidateFollowersCount || '0', 10) || 0,
                    queuedCount: parseInt(next.queuedCount || next.threeNoFollowersCount || '0', 10) || 0,
                    scrollCount: parseInt(next.scrollCount || '0', 10) || 0,
                    requestCount: parseInt(next.requestCount || '0', 10) || 0,
                });
                if (Object.prototype.hasOwnProperty.call(state, 'scrollCount')) {
                    Core.RuntimeDiagnostics?.record('three_no', 'scroll', { operationId, scrollCount: parseInt(next.scrollCount || '0', 10) || 0, progress: true });
                }
                if (Object.prototype.hasOwnProperty.call(state, 'requestCount')) {
                    Core.RuntimeDiagnostics?.record('three_no', 'request', { operationId, requestCount: parseInt(next.requestCount || '0', 10) || 0 });
                }
                if (terminal && String(previous.status || '') !== status) {
                    Core.RuntimeDiagnostics?.record('three_no', 'close', { operationId, closed: true, disappeared: status !== 'completed', terminal: true });
                    Core.RuntimeDiagnostics?.end(operationId, stage, {
                        reason: status === 'completed' ? 'completed' : status === 'stopped' ? 'stopped' : 'failure',
                        ok: status === 'completed', complete: status === 'completed', stopped: status === 'stopped',
                    });
                }
            }
            if (['failed', 'stopped', 'completed'].includes(String(next.status || ''))) {
                Core.ThreeNoWatch.recordLifecycleSnapshot(next, String(next.status));
            }
            return true;
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
                ready: 'worker 已就緒',
                running: '準備掃描',
                scanning: '正在掃描',
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
            const failureMessages = {
                followers_trigger_not_found: '卡在尋找粉絲入口：頁面上沒有找到可點擊的粉絲元素。',
                followers_dialog_not_found_after_retry: '卡在點擊粉絲入口後等待對話框：第一次點擊與重試都沒有開啟視窗。',
                followers_dialog_not_found: '卡在點擊粉絲入口後等待對話框：視窗沒有開啟。',
            };
            const failureKey = String(state.error || state.debug?.step || '');
            const failureText = failureMessages[failureKey] || String(state.error || '');
            const error = failureText ? `<div style="margin-top:8px;color:#ff9f9a;">${Utils.escapeHTML(failureText)}</div>` : '';
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
            const canStop = ['starting', 'ready', 'running', 'scanning', 'collecting_followers', 'followers_collected', 'checking_profiles'].includes(String(state.status || ''));
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
                <div style="margin-top:4px;color:#9ad0ff;">掃描只產生本機待審結果，不會自動封鎖；請由你手動加入封鎖清單並按「開始封鎖」。</div>
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
            const active = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
            if (state.scanId && active.scanId && String(state.scanId) !== String(active.scanId)) return false;
            if (active.cancelled === true || Core.ThreeNoWatch.isTerminalStatus(active.status) || active.status === 'stopping') return false;
            if (state.ownerToken && active.ownerToken && String(state.ownerToken) !== String(active.ownerToken)) return false;
            const raw = JSON.stringify(state);
            sessionStorage.setItem(Core.ThreeNoWatch.stateKey, raw);
            localStorage.setItem(Core.ThreeNoWatch.runtimeBackupKey, raw);
            return true;
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

        getScanState: () => {
            Storage.invalidate(CONFIG.KEYS.THREE_NO_SCAN_STATE);
            return Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
        },

        isLoginGateVisible: () => {
            const text = String(document?.body?.innerText || document?.body?.textContent || '').replace(/\s+/g, ' ').slice(0, 6000);
            return !!document?.querySelector?.('[href*="/login"], [data-testid*="login"], input[type="password"]')
                || /登入 Threads|登錄 Threads|登入以|登錄以|log in to threads|sign in to threads|log in to continue|sign in to continue|login required/i.test(text);
        },

        isWorkerBlockedPage: () => {
            const text = String(document?.body?.innerText || document?.body?.textContent || '').replace(/\s+/g, ' ').slice(0, 6000);
            return /challenge|checkpoint|temporarily blocked|請稍後再試|暫時無法|blocked|網路錯誤|network error/i.test(text)
                && !Core.ThreeNoWatch.isLoginGateVisible();
        },

        markWorkerSignal: (scanId, result = 'ready', extra = {}) => {
            const state = Core.ThreeNoWatch.getScanState();
            if (String(state.scanId || '') !== String(scanId || '')) return false;
            const now = Date.now();
            const workerInstanceId = window.__hegeThreeNoWorkerInstanceId || `three-no-worker:${now}:${Math.random().toString(36).slice(2, 8)}`;
            window.__hegeThreeNoWorkerInstanceId = workerInstanceId;
            const nextStatus = result === 'ready'
                ? (['starting', 'running'].includes(String(state.status || '')) ? 'ready' : (state.status || 'ready'))
                : (state.status || 'starting');
            const accepted = Core.ThreeNoWatch.setScanState({
                scanId,
                ownerToken: state.ownerToken || '',
                status: nextStatus,
                workerReadyAt: result === 'ready' ? (state.workerReadyAt || now) : (state.workerReadyAt || 0),
                workerHeartbeatAt: now,
                workerInstanceId,
                workerBootstrapResult: result,
                workerBootstrapAt: now,
                phase: result === 'ready' ? (state.phase || 'bootstrap') : 'bootstrap',
                ...extra,
            });
            return accepted !== false;
        },

        waitForWorkerReady: async (scanId, timeoutMs = Core.ThreeNoWatch.READY_TIMEOUT_MS, ownerToken = '') => {
            const deadline = Date.now() + Math.max(250, Number(timeoutMs) || Core.ThreeNoWatch.READY_TIMEOUT_MS);
            while (Date.now() < deadline) {
                const state = Core.ThreeNoWatch.getScanState();
                if (String(state.scanId || '') !== String(scanId || '')) {
                    await Utils.safeSleep(50);
                    continue;
                }
                if (ownerToken && String(state.ownerToken || '') !== String(ownerToken)) {
                    Core.RuntimeDiagnostics?.record('three_no', 'precondition', {
                        reason: 'scan_in_flight',
                        failureType: 'gate_worker_ready_owner',
                        active: true,
                    });
                    return { ok: false, result: 'scan_in_flight', state };
                }
                if (ownerToken && (state.cancelled === true || Core.ThreeNoWatch.isTerminalStatus(state.status))) {
                    return { ok: false, result: state.error || 'worker_start_failed', state };
                }
                const signal = String(state.workerBootstrapResult || '');
                if (['worker_blocked', 'not_logged_in', 'owner_unknown', 'owner_mismatch', 'worker_start_failed'].includes(signal)) return { ok: false, result: signal, state };
                const readyAt = parseInt(state.workerReadyAt || '0', 10) || 0;
                const heartbeatAt = parseInt(state.workerHeartbeatAt || '0', 10) || 0;
                if (['ready', 'scanning', 'running'].includes(String(state.status || ''))
                    && state.workerBootstrapResult === 'ready'
                    && readyAt > 0 && heartbeatAt >= readyAt && heartbeatAt <= Date.now() + 5000) {
                    return { ok: true, state };
                }
                await Utils.safeSleep(100);
            }
            return { ok: false, result: 'worker_bootstrap_timeout', state: Core.ThreeNoWatch.getScanState() };
        },

        startManualScan: async (options = {}) => {
            const operationId = Core.RuntimeDiagnostics?.begin('three_no', { foreground: true, background: false, strategy: 'window_open' });
            Core.RuntimeDiagnostics?.record('three_no', 'precondition', { operationId, foreground: true, background: false, active: true });
            const endLaunch = (reason, fields = {}) => {
                Core.RuntimeDiagnostics?.record('three_no', 'error', { operationId, reason, ...fields });
                Core.RuntimeDiagnostics?.end(operationId, 'terminal', { reason, ok: false, ...fields });
                return { skipped: reason };
            };
            if (!Core.ThreeNoWatch.isChromeExtension()) { Core.RuntimeDiagnostics?.end(operationId, 'terminal', { reason: 'failure', ok: false }); return { skipped: 'not_chrome_extension' }; }
            if (Core.ThreeNoWatch.isScanPage()) { Core.RuntimeDiagnostics?.end(operationId, 'terminal', { reason: 'failure', ok: false }); return { skipped: 'scan_page' }; }

            const launch = async () => {
                const today = Core.ThreeNoWatch.getLocalDayKey();
                const now = Date.now();
                let lockRecord = Core.ThreeNoWatch.readScanLock();
                let lock = lockRecord?.createdAt || 0;
                let scanState = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
                let freshScanState = Core.ThreeNoWatch.isFreshRunningState(scanState, now);
                const stopCommand = Core.ThreeNoWatch.readStopCommand();
                const stoppingStatus = String(scanState.status || '') === 'stopping';
                const stopRequestedAt = parseInt(stopCommand?.requestedAt || 0, 10) || 0;
                if (stoppingStatus && stopRequestedAt > 0 && now - stopRequestedAt >= Core.ThreeNoWatch.STOP_GRACE_MS) {
                    Core.ThreeNoWatch.clearStaleScanIfNeeded('stale_stopping_scan_cleared_before_start');
                    lockRecord = Core.ThreeNoWatch.readScanLock();
                    lock = lockRecord?.createdAt || 0;
                    scanState = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
                    freshScanState = Core.ThreeNoWatch.isFreshRunningState(scanState, now);
                    if (Core.ThreeNoWatch.isTerminalStatus(scanState.status) || scanState.cancelled === true) {
                        Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_STATE);
                        scanState = {};
                        freshScanState = false;
                    }
                }
                if (stoppingStatus && (!stopRequestedAt || now - stopRequestedAt < Core.ThreeNoWatch.STOP_GRACE_MS)) {
                    return endLaunch('stopping_in_progress');
                }
                if (lock > 0 && now - lock < 20 * 60 * 1000 && freshScanState) Core.RuntimeDiagnostics?.record('three_no', 'precondition', {
                    operationId,
                    reason: 'scan_in_flight',
                    failureType: 'gate_state_fresh',
                    category: (() => {
                        const candidate = `status_${String(scanState.status || '').toLowerCase()}`;
                        return /^[a-z][a-z0-9_]{0,32}$/.test(candidate) ? candidate : 'status_unknown';
                    })(),
                    stopRequested: !!Core.ThreeNoWatch.readStopCommand(),
                    elapsedMs: now - lock,
                    durationMs: (() => {
                        const activeAt = parseInt(scanState.workerHeartbeatAt || scanState.updatedAt || 0, 10) || 0;
                        return activeAt > 0 ? Math.max(0, now - activeAt) : 0;
                    })(),
                    active: freshScanState,
                });
                if (lock > 0 && now - lock < 20 * 60 * 1000 && freshScanState) return endLaunch('scan_in_flight');
                if (lock > 0 && !freshScanState) {
                    Core.ThreeNoWatch.clearStaleScanIfNeeded('stale_scan_lock_cleared_before_start');
                }

                const bgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
                const workerRunning = bgStatus.state === 'running' && (now - (bgStatus.lastUpdate || 0) < 30000);
                if (workerRunning || Utils.isSweepRunning()) return endLaunch('worker_busy');

                Core.ThreeNoWatch.clearTerminalScanBeforeStart();
                const targetOwner = Core.ThreeNoWatch.normalizeUsername(options.targetOwner || '');
                const scanId = targetOwner
                    ? `three-no:target:${targetOwner}:${today}:${now}`
                    : `three-no:manual:${today}:${now}`;
                const ownerToken = `${scanId}:${Math.random().toString(36).slice(2, 12)}`;
                Core.ThreeNoWatch.resetScanDebugLog(scanId);
                Storage.set(CONFIG.KEYS.THREE_NO_SCAN_LOCK, JSON.stringify({ scanId, token: ownerToken, createdAt: now }));
                Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
                Core.ThreeNoWatch.setScanState({
                    scanId,
                    ownerToken,
                    scanTargetOwner: targetOwner,
                    scanDate: today,
                    status: 'starting',
                    diagnosticOperationId: operationId,
                    startedAt: now,
                    checkedFollowersCount: 0,
                    threeNoFollowersCount: 0,
                });

                const claimedState = Core.ThreeNoWatch.getScanState();
                const claimedLock = Core.ThreeNoWatch.readScanLock();
                const ownsClaim = claimedState.scanId === scanId
                    && claimedState.ownerToken === ownerToken
                    && claimedLock?.scanId === scanId
                    && claimedLock?.token === ownerToken;
                if (!ownsClaim) {
                    Core.RuntimeDiagnostics?.record('three_no', 'precondition', {
                        operationId,
                        reason: 'scan_in_flight',
                        failureType: 'gate_claim_lost',
                        active: true,
                        stopRequested: !!Core.ThreeNoWatch.readStopCommand(),
                    });
                    return endLaunch('scan_in_flight');
                }

                const url = Core.ThreeNoWatch.buildScanUrl(scanId, { targetOwner });
                let workerWindow = null;
                try {
                    workerWindow = window.open(url, 'HegeThreeNoWorker', 'width=800,height=700');
                    if (!workerWindow || workerWindow.closed) throw new Error('popup_blocked');
                    Core.RuntimeDiagnostics?.record('three_no', 'worker', { operationId, created: true, foreground: true, background: true });
                    const ready = await Core.ThreeNoWatch.waitForWorkerReady(scanId, Core.ThreeNoWatch.READY_TIMEOUT_MS, ownerToken);
                    if (!ready.ok) throw new Error(ready.result || 'worker_bootstrap_timeout');
                    Core.RuntimeDiagnostics?.record('three_no', 'worker', { operationId, attached: true, active: true });
                    return { ok: true, scanId };
                } catch (err) {
                    const rawError = String(err?.message || err || '');
                    const errorCode = ['popup_blocked', 'worker_bootstrap_timeout', 'worker_blocked', 'not_logged_in', 'owner_unknown', 'owner_mismatch', 'scan_in_flight', 'worker_start_failed']
                        .includes(rawError)
                        ? rawError
                        : (/popup|blocked/i.test(rawError) ? 'popup_blocked' : 'worker_start_failed');
                    if (workerWindow && !workerWindow.closed && typeof workerWindow.close === 'function') {
                        try { workerWindow.close(); } catch (_) {}
                    }
                    Core.RuntimeDiagnostics?.record('three_no', 'close', { operationId, closed: !!workerWindow?.closed, failure: true });
                    Core.RuntimeDiagnostics?.end(operationId, 'error', { reason: errorCode === 'worker_bootstrap_timeout' ? 'timeout' : 'failure', ok: false, closed: !!workerWindow?.closed });
                    Core.ThreeNoWatch.markTerminalIfOwned(scanId, ownerToken, {
                        scanTargetOwner: targetOwner,
                        scanDate: today,
                        status: 'failed',
                        startedAt: now,
                        completedAt: Date.now(),
                        error: errorCode,
                        workerBootstrapResult: errorCode,
                    });
                    const current = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
                    if (current.scanId === scanId && current.ownerToken === ownerToken) Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
                    return { skipped: errorCode, error: err };
                }
            };

            const locks = typeof navigator !== 'undefined' ? navigator.locks : null;
            if (locks && typeof locks.request === 'function') {
                return locks.request(Core.ThreeNoWatch.LAUNCHER_LOCK_NAME, { ifAvailable: true }, async (lockHandle) => {
                    if (!lockHandle) {
                        Core.RuntimeDiagnostics?.record('three_no', 'precondition', {
                            operationId, reason: 'scan_in_flight', failureType: 'gate_launcher_lock', active: true,
                        });
                        return endLaunch('scan_in_flight');
                    }
                    return launch();
                });
            }
            // Non-Web-Locks environments retain the conservative storage claim; it is not atomic across tabs.
            return launch();
        },

        runScanPage: async () => {
            if (!Core.ThreeNoWatch.isChromeExtension()) return;
            const params = new URLSearchParams(window.location.search);
            const scanId = String(params.get('hege_three_no_run') || '').trim();
            const currentState = Core.ThreeNoWatch.getScanState();
            if (!scanId || String(currentState.scanId || '') !== scanId) return;
            if (!Core.ThreeNoWatch.isRunningStatus(currentState.status) || currentState.status === 'stopping') return;
            if (currentState.ownerToken && !Core.ThreeNoWatch.ownsScan(scanId, currentState.ownerToken)) return;
            window.__hegeThreeNoWorkerOwnerToken = currentState.ownerToken || '';
            if (await Core.ThreeNoWatch.observeStop('stop_observed_at_load')) return;
            if (Core.ThreeNoWatch.isWorkerBlockedPage()) {
                Core.ThreeNoWatch.markWorkerSignal(scanId, 'worker_blocked');
                await Core.ThreeNoWatch.finishScan({ status: 'failed', error: 'worker_blocked' });
                return;
            }
            if (Core.ThreeNoWatch.isLoginGateVisible()) {
                Core.ThreeNoWatch.markWorkerSignal(scanId, 'not_logged_in');
                await Core.ThreeNoWatch.finishScan({ status: 'failed', error: 'not_logged_in' });
                return;
            }
            Core.ThreeNoWatch.markWorkerSignal(scanId, 'ready');
            Core.ThreeNoWatch.startWorkerHeartbeat();
            const phase = params.get('hege_three_no_phase') || 'followers';
            try {
                if (phase === 'bootstrap') await Core.ThreeNoWatch.runBootstrapPhase(params);
                else if (phase === 'followers') await Core.ThreeNoWatch.runFollowersPhase(params);
                else await Core.ThreeNoWatch.runProfilePhase(params);
            } catch (err) {
                const startupError = ['worker_blocked', 'not_logged_in', 'owner_unknown', 'owner_mismatch'].includes(String(err?.message || ''))
                    ? String(err.message)
                    : '';
                if (startupError) Core.ThreeNoWatch.markWorkerSignal(scanId, startupError);
                const failureError = String(err?.message || err || 'worker_start_failed');
                const carriesFollowerDebug = ['followers_trigger_not_found', 'followers_dialog_not_found', 'followers_dialog_not_found_after_retry'].includes(failureError);
                const failureState = Core.ThreeNoWatch.getScanState();
                const failureDebug = carriesFollowerDebug && failureState?.debug && typeof failureState.debug === 'object'
                    ? failureState.debug
                    : undefined;
                await Core.ThreeNoWatch.finishScan({
                    status: 'failed',
                    error: failureError,
                    ...(failureDebug ? { debug: failureDebug } : {}),
                });
            }
        },

        runBootstrapPhase: async (params) => {
            const scanId = String(params.get('hege_three_no_run') || `three-no:${Date.now()}`);
            const scanDate = Core.ThreeNoWatch.getLocalDayKey();
            const startedAt = Date.now();
            const existing = Core.ThreeNoWatch.getScanState();
            if (String(existing.scanId || '') !== scanId) return;
            if (await Core.ThreeNoWatch.observeStop('stop_observed_at_bootstrap')) return;
            Core.ThreeNoWatch.setScanState({
                scanId,
                scanDate,
                scanTargetOwner: Core.ThreeNoWatch.normalizeUsername(existing.scanTargetOwner || ''),
                status: 'ready',
                startedAt,
                checkedFollowersCount: 0,
                threeNoFollowersCount: 0,
            });

            const targetOwner = Core.ThreeNoWatch.normalizeUsername(params.get('hege_three_no_target_owner') || '');
            const stateTargetOwner = Core.ThreeNoWatch.normalizeUsername(existing.scanTargetOwner || '');
            if (stateTargetOwner && targetOwner && stateTargetOwner !== targetOwner) throw new Error('owner_mismatch');
            const owner = targetOwner || Core.ThreeNoWatch.normalizeUsername(await Utils.pollUntil(() => Utils.getMyUsername(), 10000, 250));
            if (await Core.ThreeNoWatch.observeStop('stop_observed_after_bootstrap_identity')) return;
            if (!owner) throw new Error(Core.ThreeNoWatch.isLoginGateVisible() ? 'not_logged_in' : 'owner_unknown');

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
            const requestedOwner = Core.ThreeNoWatch.normalizeUsername(params.get('hege_three_no_target_owner') || '');
            const owner = requestedOwner || Core.ThreeNoWatch.normalizeUsername(params.get('hege_three_no_owner') || Utils.getMyUsername() || '');
            const scanId = String(params.get('hege_three_no_run') || `three-no:${Date.now()}`);
            if (!owner) throw new Error(Core.ThreeNoWatch.isLoginGateVisible() ? 'not_logged_in' : 'owner_unknown');
            if (requestedOwner) {
                const currentOwner = Core.ThreeNoWatch.getCurrentProfileUsername();
                if (!currentOwner) throw new Error('owner_unknown');
                if (currentOwner.toLowerCase() !== requestedOwner.toLowerCase()) throw new Error('owner_mismatch');
            }
            const recoveredRuntime = Core.ThreeNoWatch.getRuntime();
            if (recoveredRuntime.scanId === scanId
                && Array.isArray(recoveredRuntime.usernames)
                && recoveredRuntime.usernames.length > 0
                && parseInt(recoveredRuntime.index || '0', 10) < recoveredRuntime.usernames.length) {
                Core.ThreeNoWatch.setScanState({
                    scanId,
                    scanTargetOwner: owner,
                    owner,
                    status: 'scanning',
                    phase: 'profile_recovery',
                    checkedFollowersCount: parseInt(recoveredRuntime.index || '0', 10) || 0,
                    candidateFollowersCount: recoveredRuntime.usernames.length,
                    threeNoFollowersCount: Array.isArray(recoveredRuntime.findings) ? recoveredRuntime.findings.length : 0,
                });
                await Core.ThreeNoWatch.navigateToProfile(parseInt(recoveredRuntime.index || '0', 10) || 0);
                return;
            }
            const scanDate = Core.ThreeNoWatch.getLocalDayKey();
            const startedAt = Date.now();
            const batchSize = Core.ThreeNoWatch.getBatchSize();
            const ownerToken = String(Core.ThreeNoWatch.getScanState().ownerToken || '');
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
                ownerToken,
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
                owner,
                scanDate,
                status: 'scanning',
                startedAt,
                checkedFollowersCount: 0,
                threeNoFollowersCount: 0,
                batchSize,
                previousScannedCount: scannedSet.size,
            });

            await Utils.safeSleep(2500);
            if (await Core.ThreeNoWatch.observeStop('stopped_before_followers_dialog')) return;
            const dialog = await Core.ThreeNoWatch.openFollowersDialog();
            if (await Core.ThreeNoWatch.observeStop('stopped_after_followers_dialog_open')) return;
            if (!dialog) {
                const failedStep = String(Core.ThreeNoWatch.getScanState()?.debug?.step || '');
                throw new Error(failedStep === 'followers_trigger_not_found'
                    ? 'followers_trigger_not_found'
                    : 'followers_dialog_not_found_after_retry');
            }
            await Core.ThreeNoWatch.waitForFollowersListMedia(dialog);
            if (await Core.ThreeNoWatch.observeStop('stopped_after_followers_media_wait')) return;

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
                if (await Core.ThreeNoWatch.observeStop('stopped_at_followers_phase_boundary')) return;
                collection = await Core.ThreeNoWatch.collectFollowerUsernames(dialog, owner, {
                    skipUsers: workingScannedSet,
                    batchSize,
                });
                autoRounds++;
                if (await Core.ThreeNoWatch.observeStop('stopped_after_followers_collection')) return;
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

                if (collection.stopped === true
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
                status: 'scanning',
                startedAt,
                checkedFollowersCount: 0,
                threeNoFollowersCount: 0,
                candidateFollowersCount: usernames.length,
                batchSize,
                previousScannedCount: scannedSet.size,
                hasMore,
            });

            if (Core.ThreeNoWatch.isStopRequested() || collection?.stopped === true) {
                await Core.ThreeNoWatch.observeStop('stopped_after_followers_collection_before_profile');
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
            if (await Core.ThreeNoWatch.observeStop('stopped_at_profile_phase_boundary')) return;
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
            if (await Core.ThreeNoWatch.observeStop('stopped_after_profile_delay')) return;
            if ((window.scrollY || window.pageYOffset || 0) > 80) {
                window.scrollTo(0, 0);
                await Utils.safeSleep(150);
                if (await Core.ThreeNoWatch.observeStop('stopped_after_profile_scroll_reset')) return;
            }

            const probeResult = await Core.ThreeNoWatch.evaluateCurrentProfileProbe(username, probeKind);
            if (await Core.ThreeNoWatch.observeStop('stopped_after_profile_probe')) return;
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
            if (await Core.ThreeNoWatch.observeStop('stopped_before_next_profile')) return;
            await Core.ThreeNoWatch.navigateToProfile(index + 1);
        },

        openFollowersDialog: async () => {
            const diagnostics = Core.RuntimeDiagnostics;
            const diagnosticOperationId = diagnostics?.begin?.('followers', { active: true, strategy: 'unknown' }) || null;
            const triggerStrategies = ['count_text_node', 'count_button', 'href_path', 'text_match'];
            const strategyObservations = new Map(triggerStrategies.map(strategy => [strategy, { attempts: 0, found: false }]));
            const diagnosticRecord = (stage, fields = {}) => {
                try {
                    return diagnostics?.record?.('followers', stage, {
                        ...(diagnosticOperationId ? { operationId: diagnosticOperationId } : {}),
                        ...fields,
                    }) || null;
                } catch (_) {
                    return null;
                }
            };
            const endDiagnosticOperation = (reason, fields = {}) => {
                try {
                    return diagnostics?.end?.(diagnosticOperationId, 'terminal', {
                        reason,
                        ok: reason === 'success',
                        complete: reason === 'success',
                        ...fields,
                    }) || null;
                } catch (_) {
                    return null;
                }
            };
            const noteStrategy = (strategy, found) => {
                const observation = strategyObservations.get(strategy);
                if (!observation) return;
                observation.attempts += 1;
                if (found) observation.found = true;
            };
            const recordStrategyObservations = () => {
                for (const strategy of triggerStrategies) {
                    const observation = strategyObservations.get(strategy);
                    diagnosticRecord('wait', {
                        strategy,
                        attempt: observation?.attempts || 0,
                        found: observation?.found === true,
                        complete: true,
                    });
                }
            };
            const POLL_SAMPLE_INTERVAL = 12;
            const MAX_POLL_SAMPLES = 4;
            const pollSampleCounts = new Map();
            const recordPollSample = (phase, phaseStartedAt, pollCount, waitMs, fields = {}) => {
                if (pollCount !== 1 && pollCount % POLL_SAMPLE_INTERVAL !== 0) return;
                const sampleCount = pollSampleCounts.get(phase) || 0;
                if (sampleCount >= MAX_POLL_SAMPLES) return;
                pollSampleCounts.set(phase, sampleCount + 1);
                diagnosticRecord('wait', {
                    ...fields,
                    pollCount,
                    waitMs,
                    elapsedMs: Math.max(0, Date.now() - phaseStartedAt),
                });
            };
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
                if (followerCountTextNode) {
                    noteStrategy('count_text_node', true);
                    return {
                        element: followerCountTextNode,
                        strategy: 'count_text_node',
                        text: (followerCountTextNode.innerText || followerCountTextNode.textContent || followerCountTextNode.getAttribute('title') || '').replace(/\s+/g, ' ').trim(),
                        href: '',
                    };
                }
                noteStrategy('count_text_node', false);

                const followerCountButton = Array.from(document.querySelectorAll('div[role="button"], button, [tabindex="0"], span[dir="auto"], span'))
                    .filter(el => !el.closest('[role="dialog"]'))
                    .filter(isVisible)
                    .find(el => {
                        if (!isFollowerCountText(el.innerText || el.textContent || '')) return false;
                        const cursor = window.getComputedStyle(el).cursor;
                        return el.matches('div[role="button"], button, [tabindex="0"]') || cursor === 'pointer';
                    });
                if (followerCountButton) {
                    noteStrategy('count_button', true);
                    return {
                        element: followerCountButton.matches('span') ? clickableAncestor(followerCountButton) : followerCountButton,
                        strategy: 'count_button',
                        text: (followerCountButton.innerText || followerCountButton.textContent || '').replace(/\s+/g, ' ').trim(),
                        href: '',
                    };
                }
                noteStrategy('count_button', false);

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
                if (hrefTrigger) {
                    noteStrategy('href_path', true);
                    return { element: clickableAncestor(hrefTrigger), strategy: 'href_path', text: (hrefTrigger.innerText || hrefTrigger.textContent || '').replace(/\s+/g, ' ').trim(), href: hrefTrigger.getAttribute('href') || '' };
                }
                noteStrategy('href_path', false);

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
                        noteStrategy('text_match', true);
                        return { element: target, strategy: 'text_match', text, href: target.getAttribute?.('href') || '' };
                    }
                }
                noteStrategy('text_match', false);
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

            const triggerPollStartedAt = Date.now();
            let triggerPollCount = 0;
            let triggerInfo;
            try {
                triggerInfo = await Utils.pollUntil(() => {
                    triggerPollCount += 1;
                    const result = findTrigger();
                    recordPollSample('trigger', triggerPollStartedAt, triggerPollCount, 10000, {
                        strategy: result?.strategy || 'unknown',
                        found: !!result?.element,
                    });
                    return result;
                }, 10000, 250);
            } catch (error) {
                diagnosticRecord('failure', { reason: 'exception', failure: true, pollCount: triggerPollCount });
                endDiagnosticOperation('exception', { ok: false, pollCount: triggerPollCount });
                throw error;
            }
            const triggerElapsedMs = Math.max(0, Date.now() - triggerPollStartedAt);
            recordStrategyObservations();
            diagnosticRecord('wait', {
                strategy: triggerInfo?.strategy || 'unknown',
                found: !!triggerInfo?.element,
                complete: true,
                attempt: triggerPollCount,
                pollCount: triggerPollCount,
                waitMs: 10000,
                elapsedMs: triggerElapsedMs,
            });
            if (!triggerInfo?.element) {
                Core.ThreeNoWatch.setScanState({
                    status: 'collecting_followers',
                    debug: {
                        step: 'followers_trigger_not_found',
                        url: window.location.href,
                        candidates: snapshotCandidates(16).map(item => `${item.tag}${item.role ? `[${item.role}]` : ''}: ${item.text}`),
                    },
                });
                diagnosticRecord('failure', {
                    reason: 'followers_trigger_not_found',
                    failure: true,
                    found: false,
                    attempt: triggerPollCount,
                    pollCount: triggerPollCount,
                    waitMs: 10000,
                    elapsedMs: triggerElapsedMs,
                });
                endDiagnosticOperation('followers_trigger_not_found', {
                    waitMs: triggerElapsedMs,
                    elapsedMs: triggerElapsedMs,
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

            const waitForDialog = async (maxMs, clickAttempt, retry) => {
                const dialogPollStartedAt = Date.now();
                let dialogPollCount = 0;
                let result;
                try {
                    result = await Utils.pollUntil(() => {
                        dialogPollCount += 1;
                        const foundDialog = Core.ThreeNoWatch.findActiveFollowersDialog();
                        recordPollSample(`dialog_${clickAttempt}`, dialogPollStartedAt, dialogPollCount, maxMs, {
                            attempt: clickAttempt,
                            retry,
                            clicked: true,
                            dialogFound: !!foundDialog,
                            dialogCount: document.querySelectorAll('div[role="dialog"]').length,
                        });
                        return foundDialog;
                    }, maxMs, 250);
                } catch (error) {
                    diagnosticRecord('failure', {
                        reason: 'exception',
                        failure: true,
                        clicked: true,
                        retry,
                        pollCount: dialogPollCount,
                    });
                    endDiagnosticOperation('exception', { ok: false, retry, pollCount: dialogPollCount });
                    throw error;
                }
                const elapsedMs = Math.max(0, Date.now() - dialogPollStartedAt);
                const dialogCount = document.querySelectorAll('div[role="dialog"]').length;
                diagnosticRecord('dialog', {
                    attempt: clickAttempt,
                    retry,
                    clicked: true,
                    dialogFound: !!result,
                    dialogCount,
                    pollCount: dialogPollCount,
                    waitMs: maxMs,
                    elapsedMs,
                });
                return { dialog: result, elapsedMs, dialogCount, pollCount: dialogPollCount };
            };

            try {
                Utils.simClick(trigger);
            } catch (error) {
                diagnosticRecord('failure', { reason: 'exception', failure: true, clicked: false });
                endDiagnosticOperation('exception', { ok: false });
                throw error;
            }
            let dialogWait = await waitForDialog(8000, 1, false);
            let dialog = dialogWait.dialog;
            if (dialog) {
                endDiagnosticOperation('success', { dialogFound: true, dialogCount: dialogWait.dialogCount, waitMs: dialogWait.elapsedMs });
                return dialog;
            }

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
            try {
                trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                if (typeof trigger.click === 'function') trigger.click();
            } catch (error) {
                diagnosticRecord('failure', { reason: 'exception', failure: true, clicked: false, retry: true });
                endDiagnosticOperation('exception', { ok: false, retry: true });
                throw error;
            }
            dialogWait = await waitForDialog(10000, 2, true);
            dialog = dialogWait.dialog;
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
            if (dialog) {
                endDiagnosticOperation('success', { dialogFound: true, dialogCount: dialogWait.dialogCount, waitMs: dialogWait.elapsedMs, retry: true });
            } else {
                diagnosticRecord('failure', {
                    reason: 'followers_dialog_not_found_after_retry',
                    failure: true,
                    clicked: true,
                    retry: true,
                    dialogFound: false,
                    dialogCount: dialogWait.dialogCount,
                    pollCount: dialogWait.pollCount,
                    waitMs: 10000,
                    elapsedMs: dialogWait.elapsedMs,
                });
                endDiagnosticOperation('followers_dialog_not_found_after_retry', {
                    retry: true,
                    dialogFound: false,
                    dialogCount: dialogWait.dialogCount,
                    waitMs: dialogWait.elapsedMs,
                });
            }
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
            if (Core.ThreeNoWatch.isStopRequested()) stopped = true;
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

            const animals = [
                'alligator', 'alpaca', 'armadillo', 'badger', 'bat', 'bear', 'camel', 'cat',
                'chameleon', 'cheetah', 'chipmunk', 'crab', 'deer', 'dinosaur', 'dog', 'dolphin',
                'dragon', 'duck', 'elephant', 'elk', 'gazelle', 'giraffe', 'goat', 'goose',
                'hamster', 'hawk', 'horse', 'iguana', 'jellyfish', 'kangaroo', 'kitty', 'leopard',
                'lion', 'llama', 'moose', 'otter', 'owl', 'panda', 'panther', 'penguin',
                'platypus', 'quail', 'rabbit', 'reindeer', 'rhino', 'sheep', 'squirrel', 'tiger',
                'turtle', 'unicorn', 'zebra', 'puppy', 'bird', 'fish', 'bunny', 'wolf', 'fox',
                'cow', 'pig', 'monkey', 'mouse', 'rat', 'koala', 'shark', 'whale', 'eagle',
                'frog', 'snake', 'swan', 'bee', 'ant', 'seal',
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
            const activeState = Core.ThreeNoWatch.getScanState();
            const runtimeScanId = String(runtime.scanId || patch.scanId || activeState.scanId || '');
            const runtimeOwnerToken = String(runtime.ownerToken || patch.ownerToken || activeState.ownerToken || '');
            const appendFinishDebug = (step = '', statusValue = '', scanIdValue = runtimeScanId) => {
                try {
                    Core.ThreeNoWatch.appendScanDebugLog({
                        scanId: String(scanIdValue || ''),
                        status: String(statusValue || ''),
                        debug: { step },
                    });
                } catch (_) {}
            };
            if (Core.ThreeNoWatch.isTerminalStatus(activeState.status) || activeState.cancelled === true) {
                appendFinishDebug('finish_rejected_early_terminal', activeState.status);
                return false;
            }
            if (runtimeOwnerToken && runtimeScanId && !Core.ThreeNoWatch.ownsScan(runtimeScanId, runtimeOwnerToken)) {
                appendFinishDebug('finish_rejected_early_not_owned', activeState.status);
                return false;
            }
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
            const failed = status === 'failed';
            const shouldPersistFindings = completed || stopped || failed;
            const diagnosticOperationId = String(activeState.diagnosticOperationId || runtime.diagnosticOperationId || '').trim();
            const finishStartedAt = Date.now();
            const storageMetrics = {
                writeCount: 0,
                writeBytes: 0,
            };
            const recordFinishDiagnostic = (stage, fields = {}) => {
                try {
                    return Core.RuntimeDiagnostics?.record('three_no', stage, {
                        ...(diagnosticOperationId ? { operationId: diagnosticOperationId } : {}),
                        ...fields,
                    });
                } catch (_) {
                    return null;
                }
            };
            const noteStorageWrite = (value, count = 1) => {
                const writeCount = Math.max(0, parseInt(count || '0', 10) || 0);
                storageMetrics.writeCount += writeCount;
                storageMetrics.writeBytes += serializedByteLength(value) * writeCount;
            };
            recordFinishDiagnostic('status', {
                active: true,
                complete: completed,
                stopped,
                failure: failed,
                checkedCount: parseInt(runtime.index || '0', 10) || 0,
                candidateCount: Array.isArray(runtime.usernames) ? runtime.usernames.length : 0,
                queuedCount: Array.isArray(runtime.findings) ? runtime.findings.length : 0,
            });
            const aggregationStartedAt = Date.now();
            recordFinishDiagnostic('aggregate', {
                active: true,
                candidateCount: batchUsernames.length,
                checkedCount: parseInt(runtime.index || '0', 10) || 0,
                queuedCount: findings.length,
            });
            const cursor = Storage.getThreeNoScanCursor();
            const cursorMatches = owner && cursor.owner === owner && cursor.reachedEnd !== true;
            const baseScannedUsers = cursorMatches ? cursor.scannedUsers : [];
            const checkedCandidateCount = (stopped || failed)
                ? Math.max(0, Math.min(batchUsernames.length, parseInt(runtime.index || '0', 10) || 0))
                : batchUsernames.length;
            const unprocessedCandidates = new Set((stopped || failed)
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
            const aggregationInputCount = previousFindingsToMerge.length + findings.length;
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
            recordFinishDiagnostic('aggregate', {
                active: false,
                complete: true,
                elapsedMs: Date.now() - aggregationStartedAt,
                uniqueBefore: aggregationInputCount,
                uniqueAfter: mergedFindings.length,
                duplicateCount: Math.max(0, aggregationInputCount - findingsByUser.size),
                processedCount: findingsByUser.size,
                candidateCount: batchUsernames.length,
                checkedCount: checkedCandidateCount,
                remainingCount: unprocessedCandidates.size,
                queuedCount: mergedFindings.length,
            });
            const previousUsernames = new Set(previousFindings.map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || '')).filter(Boolean));
            const newUnignoredFindings = findings
                .map(item => Core.ThreeNoWatch.normalizeUsername(item?.username || ''))
                .filter(Boolean)
                .filter(username => !previousUsernames.has(username))
                .filter(username => !Storage.isThreeNoUserIgnored(username))
                .filter(username => !Storage.isThreeNoUserSafe(username));
            const hasMore = stopped ? true : (completed ? runtime.hasMore === true : runtime.hasMore === true);
            const batchSize = parseInt(runtime.batchSize || CONFIG.THREE_NO_SCAN_BATCH_SIZE || '200', 10) || 200;
            const beforePersist = Core.ThreeNoWatch.getScanState();
            if (Core.ThreeNoWatch.isTerminalStatus(beforePersist.status) || beforePersist.cancelled === true) {
                appendFinishDebug('finish_rejected_late_terminal', beforePersist.status);
                return false;
            }
            if (runtimeOwnerToken && runtimeScanId && !Core.ThreeNoWatch.ownsScan(runtimeScanId, runtimeOwnerToken)) {
                appendFinishDebug('finish_rejected_late_not_owned', beforePersist.status);
                return false;
            }
            const storageStartedAt = Date.now();
            recordFinishDiagnostic('storage', {
                active: true,
                candidateCount: batchUsernames.length,
                checkedCount: checkedCandidateCount,
                remainingCount: unprocessedCandidates.size,
                queuedCount: mergedFindings.length,
                storageWriteCount: 0,
                storageWriteBytes: 0,
            });
            if (shouldPersistFindings && owner) {
                const cursorPayload = {
                    owner,
                    startedAt: cursorMatches ? (cursor.startedAt || runtime.startedAt || completedAt) : (runtime.startedAt || completedAt),
                    updatedAt: completedAt,
                    batchesCompleted: (cursorMatches ? cursor.batchesCompleted : 0) + (completed ? 1 : 0),
                    reachedEnd: completed ? hasMore !== true : false,
                    scannedUsers,
                };
                noteStorageWrite(cursorPayload, 1);
                recordFinishDiagnostic('storage', {
                    active: true,
                    cursorSizeBytes: serializedByteLength(cursorPayload),
                    storageWriteCount: storageMetrics.writeCount,
                    storageWriteBytes: storageMetrics.writeBytes,
                });
                Storage.setThreeNoScanCursor(cursorPayload);
            }
            const scanId = runtime.scanId || patch.scanId || `three-no:${scanDate}:${completedAt}`;
            const debugLog = Core.ThreeNoWatch.getScanDebugLog(scanId);
            const resultInput = {
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
            };
            recordFinishDiagnostic('render', {
                active: true,
                renderTriggered: false,
                resultPersisted: false,
                candidateCount: batchUsernames.length,
                checkedCount: checkedCandidateCount,
                queuedCount: mergedFindings.length,
            });
            const payload = Storage.setThreeNoScanResults(resultInput);
            noteStorageWrite(payload, 1);
            recordFinishDiagnostic('render', {
                active: false,
                complete: true,
                renderTriggered: true,
                resultPersisted: true,
                resultSizeBytes: serializedByteLength(payload),
                elapsedMs: Date.now() - finishStartedAt,
                candidateCount: batchUsernames.length,
                checkedCount: checkedCandidateCount,
                queuedCount: payload.threeNoFollowersCount,
            });
            const terminalStatePayload = {
                ...payload,
                ownerToken: runtimeOwnerToken || undefined,
                users: undefined,
                cancelled: true,
                terminalAt: completedAt,
                debug: {
                    ...(patch.debug || {}),
                    debugLogCount: debugLog.length,
                    autoBlockRemoved: true,
                },
            };
            const finalStateWritten = Core.ThreeNoWatch.setScanState(terminalStatePayload);
            if (finalStateWritten === false) return false;
            const terminalDebugLogWriteCount = isThreeNoDebugLogActive() && terminalStatePayload.debug?.step ? 1 : 0;
            const terminalStateWriteCount = 1 + terminalDebugLogWriteCount + 2;
            noteStorageWrite(terminalStatePayload, terminalStateWriteCount);
            Storage.set(CONFIG.KEYS.THREE_NO_LAST_SCAN_DATE, scanDate);
            noteStorageWrite(scanDate, 1);
            if (runtimeOwnerToken && runtimeScanId) Core.ThreeNoWatch.clearOwnedScan(runtimeScanId, runtimeOwnerToken);
            else {
                Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
                Storage.remove(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
            }
            const unreadCount = Math.max(Storage.getThreeNoUnreadCount(), newUnignoredFindings.length || payload.threeNoFollowersCount);
            Storage.setThreeNoUnreadCount(unreadCount);
            noteStorageWrite(String(unreadCount), 1);
            sessionStorage.removeItem(Core.ThreeNoWatch.stateKey);
            localStorage.removeItem(Core.ThreeNoWatch.runtimeBackupKey);
            recordFinishDiagnostic('storage', {
                active: false,
                complete: true,
                elapsedMs: Date.now() - storageStartedAt,
                storageWriteCount: storageMetrics.writeCount,
                storageWriteBytes: storageMetrics.writeBytes,
                cursorSizeBytes: shouldPersistFindings && owner ? serializedByteLength({ owner, scannedUsers }) : 0,
                resultSizeBytes: serializedByteLength(payload),
                candidateCount: batchUsernames.length,
                checkedCount: checkedCandidateCount,
                remainingCount: unprocessedCandidates.size,
                queuedCount: payload.threeNoFollowersCount,
            });
            if (completed) {
                let statsUploadTimeoutId;
                let statsUploadTimedOut = false;
                const statsUploadStartedAt = Date.now();
                recordFinishDiagnostic('wait', {
                    active: true,
                    externalWait: true,
                    waitingForExternal: true,
                    candidateCount: batchUsernames.length,
                    checkedCount: checkedCandidateCount,
                });
                try {
                    const configuredTimeout = Number(CONFIG.THREE_NO_SCAN_STATS_UPLOAD_TIMEOUT_MS);
                    const statsUploadTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 0
                        ? configuredTimeout
                        : 1500;
                    await Promise.race([
                        Promise.resolve().then(() => UI.tryUploadThreeNoScanStats({ scanId: payload.scanId })),
                        new Promise(resolve => {
                            statsUploadTimeoutId = setTimeout(() => {
                                statsUploadTimedOut = true;
                                resolve();
                            }, statsUploadTimeoutMs);
                        }),
                    ]);
                } catch (err) {
                    if (CONFIG.DEBUG_MODE) console.warn('[留友封][ThreeNo] stats upload skipped/failed', err);
                } finally {
                    if (statsUploadTimeoutId !== undefined) clearTimeout(statsUploadTimeoutId);
                    recordFinishDiagnostic('wait', {
                        active: false,
                        complete: true,
                        externalWait: true,
                        waitingForExternal: false,
                        timedOut: statsUploadTimedOut,
                        waitMs: Date.now() - statsUploadStartedAt,
                        elapsedMs: Date.now() - finishStartedAt,
                        candidateCount: batchUsernames.length,
                        checkedCount: checkedCandidateCount,
                    });
                }
            }
            // Stopped workers must close only after terminal state, result/cursor
            // persistence, and owner-scoped cleanup have all succeeded.
            appendFinishDebug('worker_close_scheduled', status, scanId);
            setTimeout(() => {
                appendFinishDebug('worker_close_called', status, scanId);
                try {
                    window.close();
                } catch (_) {}
            }, 800);
        },
    },
});
