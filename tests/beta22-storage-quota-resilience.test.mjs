import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    failSet = null;

    get length() { return this.#data.size; }
    key(index) { return [...this.#data.keys()][index] ?? null; }
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) {
        const normalized = String(key);
        if (this.failSet?.(normalized, value) === true) {
            const error = new Error(`Quota exceeded while writing ${normalized}`);
            error.name = 'QuotaExceededError';
            throw error;
        }
        this.#data.set(normalized, String(value));
    }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
    keys() { return [...this.#data.keys()]; }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
const eventTarget = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
};
const locationMock = {
    href: 'https://www.threads.com/?hege_three_no_scan=true',
    origin: 'https://www.threads.com',
    pathname: '/',
    search: '?hege_three_no_scan=true',
    assign: () => {},
    reload: () => {},
};
const windowMock = {
    ...eventTarget,
    location: locationMock,
    close: () => {},
    open: () => null,
    postMessage: () => {},
    scrollTo: () => {},
};

globalThis.window = windowMock;
globalThis.location = locationMock;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.chrome = { runtime: { id: 'beta22-storage-quota-test' } };
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0,
        language: 'zh-TW',
        onLine: true,
    },
});
globalThis.document = {
    ...eventTarget,
    body: {
        innerText: '',
        textContent: '',
        appendChild: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    },
    createElement: () => ({
        style: {},
        dataset: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        appendChild: () => {},
        setAttribute: () => {},
        remove: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
    }
};

const { CONFIG } = await import('../src/config.js');
// 本檔測的是 beta 才開的名冊／verbose log 行為；正式版 config 預設關閉，測試自行開啟（每個測試檔獨立行程，不外漏）。
CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
CONFIG.VERSION = '2.8.4-beta22';
const { pruneThreeNoResetBackups } = await import('../src/three-no-reset-backup.js');
const { Storage } = await import('../src/storage.js');
const { UI } = await import('../src/ui.js');
const { Core } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const original = {
    version: CONFIG.VERSION,
    statsTimeout: CONFIG.THREE_NO_SCAN_STATS_UPLOAD_TIMEOUT_MS,
    getRuntime: Core.ThreeNoWatch.getRuntime,
    getScanState: Core.ThreeNoWatch.getScanState,
    setScanState: Core.ThreeNoWatch.setScanState,
    ownsScan: Core.ThreeNoWatch.ownsScan,
    clearOwnedScan: Core.ThreeNoWatch.clearOwnedScan,
    renderWorkerOverlay: Core.ThreeNoWatch.renderWorkerOverlay,
    uploadStats: UI.tryUploadThreeNoScanStats,
};

const baseRuntime = {
    scanId: 'three-no:quota-test',
    ownerToken: 'owner-token',
    owner: 'owner',
    scanDate: '2026-08-12',
    startedAt: 100,
    findings: [{
        username: 'candidate',
        noAvatar: true,
        metadataDebug: {
            postsSignalReason: 'posts_empty',
            repliesSignalReason: 'replies_empty',
            repostsSignalReason: 'reposts_empty',
            extraDetail: 'must be dropped',
            nested: { secret: 'drop' },
        },
    }],
    usernames: ['candidate'],
    triagedUsernames: ['candidate'],
    index: 1,
    hasMore: false,
    batchSize: 1,
};

const waitForTimers = () => new Promise(resolve => setTimeout(resolve, 15));

const setupFinishFixture = (resultWriteFailures) => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    localStorageMock.failSet = (key) => {
        if (key !== CONFIG.KEYS.THREE_NO_SCAN_RESULTS) return false;
        if (resultWriteFailures.remaining <= 0) return false;
        resultWriteFailures.remaining -= 1;
        return true;
    };
    const state = {
        scanId: baseRuntime.scanId,
        ownerToken: baseRuntime.ownerToken,
        status: 'scanning',
        cancelled: false,
    };
    localStorageMock.setItem(CONFIG.KEYS.THREE_NO_SCAN_LOCK, JSON.stringify({
        scanId: state.scanId,
        token: state.ownerToken,
        createdAt: 100,
    }));
    localStorageMock.setItem(CONFIG.KEYS.THREE_NO_SCAN_STATE, JSON.stringify(state));
    return state;
};

const runFinishFixture = async (resultWriteFailures) => {
    const state = setupFinishFixture(resultWriteFailures);
    const runtime = {
        ...baseRuntime,
        findings: baseRuntime.findings.map(item => ({ ...item, metadataDebug: { ...item.metadataDebug } })),
    };
    let terminalState = null;
    Core.ThreeNoWatch.getRuntime = () => runtime;
    Core.ThreeNoWatch.getScanState = () => state;
    Core.ThreeNoWatch.ownsScan = () => true;
    Core.ThreeNoWatch.setScanState = payload => {
        terminalState = payload;
        localStorageMock.setItem(CONFIG.KEYS.THREE_NO_SCAN_STATE, JSON.stringify(payload));
        return true;
    };
    Core.ThreeNoWatch.clearOwnedScan = () => {
        localStorageMock.removeItem(CONFIG.KEYS.THREE_NO_SCAN_LOCK);
        localStorageMock.removeItem(CONFIG.KEYS.THREE_NO_SCAN_COMMAND);
        return true;
    };
    Core.ThreeNoWatch.renderWorkerOverlay = () => {};
    UI.tryUploadThreeNoScanStats = async () => ({ code: 200 });
    CONFIG.THREE_NO_SCAN_STATS_UPLOAD_TIMEOUT_MS = 0;
    await Core.ThreeNoWatch.finishScan({ status: 'completed' });
    await waitForTimers();
    const resultRaw = localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_RESULTS);
    const stateRaw = localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_STATE);
    const debugRaw = localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG);
    return {
        result: resultRaw ? JSON.parse(resultRaw) : null,
        terminalState,
        storedState: stateRaw ? JSON.parse(stateRaw) : null,
        debugLog: debugRaw ? JSON.parse(debugRaw) : [],
    };
};

test('beta22 results write drops debugLog once and keeps completed terminal state', async () => {
    const fixture = await runFinishFixture({ remaining: 1 });
    assert.ok(fixture.result, 'results should be persisted after the first fallback');
    assert.deepEqual(fixture.result.debugLog, [], 'level 1 fallback removes debugLog');
    assert.equal(fixture.terminalState.status, 'completed');
    assert.equal(fixture.terminalState.error, '');
    assert.ok(fixture.debugLog.some(row => row.step === 'finish_storage_quota_degraded' && row.debug.level === 1));
});

test('beta22 results write reaches metadata fallback with only three reason strings', async () => {
    const fixture = await runFinishFixture({ remaining: 2 });
    assert.ok(fixture.result, 'results should be persisted after the second fallback');
    assert.deepEqual(Object.keys(fixture.result.users[0].metadataDebug).sort(), [
        'postsSignalReason',
        'repliesSignalReason',
        'repostsSignalReason',
    ]);
    assert.deepEqual(fixture.result.users[0].metadataDebug, {
        postsSignalReason: 'posts_empty',
        repliesSignalReason: 'replies_empty',
        repostsSignalReason: 'reposts_empty',
    });
    assert.ok(fixture.debugLog.some(row => row.step === 'finish_storage_quota_degraded' && row.debug.level === 1));
    assert.ok(fixture.debugLog.some(row => row.step === 'finish_storage_quota_degraded' && row.debug.level === 2));
    assert.equal(fixture.terminalState.status, 'completed');
});

test('beta22 all results writes failing still publishes a storage_quota failed terminal state', async () => {
    const fixture = await runFinishFixture({ remaining: Number.POSITIVE_INFINITY });
    assert.equal(fixture.result, null, 'failed result persistence must be abandoned');
    assert.equal(fixture.terminalState.status, 'failed');
    assert.equal(fixture.terminalState.error, 'storage_quota');
    assert.equal(fixture.storedState.status, 'failed');
    assert.equal(fixture.storedState.error, 'storage_quota');
    assert.ok(fixture.debugLog.some(row => row.step === 'finish_storage_quota_failed' && row.debug.level === 3));
});

test('beta22 reset backup cleanup keeps only the newest and removes an expired newest backup', () => {
    const now = Date.UTC(2026, 7, 12);
    const day = 24 * 60 * 60 * 1000;
    localStorageMock.clear();
    const oldA = `hege_three_no_reset_backup_${now - (10 * day)}`;
    const oldB = `hege_three_no_reset_backup_${now - (9 * day)}`;
    const newest = `hege_three_no_reset_backup_${now - day}`;
    localStorageMock.setItem(oldA, '{}');
    localStorageMock.setItem(oldB, '{}');
    localStorageMock.setItem(newest, '{}');
    pruneThreeNoResetBackups(localStorageMock, now);
    assert.deepEqual(localStorageMock.keys(), [newest]);

    localStorageMock.removeItem(newest);
    const expired = `hege_three_no_reset_backup_${now - (8 * day)}`;
    localStorageMock.setItem(expired, '{}');
    pruneThreeNoResetBackups(localStorageMock, now);
    assert.deepEqual(localStorageMock.keys(), []);
});

test.after(() => {
    CONFIG.VERSION = original.version;
    CONFIG.THREE_NO_SCAN_STATS_UPLOAD_TIMEOUT_MS = original.statsTimeout;
    Core.ThreeNoWatch.getRuntime = original.getRuntime;
    Core.ThreeNoWatch.getScanState = original.getScanState;
    Core.ThreeNoWatch.setScanState = original.setScanState;
    Core.ThreeNoWatch.ownsScan = original.ownsScan;
    Core.ThreeNoWatch.clearOwnedScan = original.clearOwnedScan;
    Core.ThreeNoWatch.renderWorkerOverlay = original.renderWorkerOverlay;
    UI.tryUploadThreeNoScanStats = original.uploadStats;
    localStorageMock.failSet = null;
});
