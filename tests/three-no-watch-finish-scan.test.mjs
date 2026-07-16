import assert from 'node:assert/strict';

const createStorageArea = () => {
    const values = new Map();
    return {
        getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: (key) => values.delete(String(key)),
        clear: () => values.clear(),
    };
};

const localStorageMock = createStorageArea();
const sessionStorageMock = createStorageArea();
const eventTarget = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
};

let closeCalls = 0;
const windowMock = {
    ...eventTarget,
    location: {
        href: 'https://www.threads.com/?hege_three_no_scan=true',
        origin: 'https://www.threads.com',
        pathname: '/',
        search: '?hege_three_no_scan=true',
        assign: () => {},
        reload: () => {},
    },
    close: () => {
        closeCalls += 1;
    },
    open: () => null,
    postMessage: () => {},
    scrollTo: () => {},
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    onLine: true,
    },
});
globalThis.document = {
    ...eventTarget,
    body: {
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
globalThis.KeyboardEvent = class KeyboardEvent {
    constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
    }
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { UI } = await import('../src/ui.js');
const { Core } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
globalThis.setTimeout = (callback, delay, ...args) => realSetTimeout(callback, Math.min(Number(delay) || 0, 20), ...args);
CONFIG.THREE_NO_SCAN_STATS_UPLOAD_TIMEOUT_MS = 10;

const originalStorageMethods = {
    getThreeNoScanCursor: Storage.getThreeNoScanCursor,
    setThreeNoScanCursor: Storage.setThreeNoScanCursor,
    getThreeNoScanResults: Storage.getThreeNoScanResults,
    setThreeNoScanResults: Storage.setThreeNoScanResults,
    getThreeNoUnreadCount: Storage.getThreeNoUnreadCount,
    setThreeNoUnreadCount: Storage.setThreeNoUnreadCount,
    isThreeNoUserSafe: Storage.isThreeNoUserSafe,
    isThreeNoUserIgnored: Storage.isThreeNoUserIgnored,
    set: Storage.set,
    remove: Storage.remove,
};
const originalThreeNoMethods = {
    getRuntime: Core.ThreeNoWatch.getRuntime,
    getScanDebugLog: Core.ThreeNoWatch.getScanDebugLog,
    setScanState: Core.ThreeNoWatch.setScanState,
};
const originalIsBetaBuild = Utils.isBetaBuild;
const originalUpload = UI.tryUploadThreeNoScanStats;

const baseRuntime = {
    scanId: 'three-no:test',
    owner: 'owner',
    scanDate: '2026-07-16',
    startedAt: 100,
    findings: [{ username: 'candidate' }],
    usernames: ['candidate'],
    triagedUsernames: ['candidate'],
    index: 1,
    hasMore: false,
    batchSize: 1,
};

const waitForRealTime = (ms) => new Promise(resolve => realSetTimeout(resolve, ms));

const runFinishScan = async ({ status, beta, upload }) => {
    const runtime = { ...baseRuntime, findings: [...baseRuntime.findings], usernames: [...baseRuntime.usernames], triagedUsernames: [...baseRuntime.triagedUsernames] };
    const state = {
        cursor: { owner: 'owner', startedAt: 100, batchesCompleted: 0, reachedEnd: false, scannedUsers: [] },
        previousResults: { status: '', users: [] },
        result: null,
        scanState: null,
        cursorWrite: null,
        unreadCount: null,
        uploadCalls: 0,
    };

    closeCalls = 0;
    localStorageMock.clear();
    sessionStorageMock.clear();
    localStorageMock.setItem(CONFIG.KEYS.THREE_NO_SCAN_LOCK, 'scan-lock');
    localStorageMock.setItem(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, 'stop');
    localStorageMock.setItem(Core.ThreeNoWatch.runtimeBackupKey, JSON.stringify(runtime));
    sessionStorageMock.setItem(Core.ThreeNoWatch.stateKey, JSON.stringify(runtime));

    Storage.getThreeNoScanCursor = () => state.cursor;
    Storage.setThreeNoScanCursor = (payload) => { state.cursorWrite = payload; return payload; };
    Storage.getThreeNoScanResults = () => state.previousResults;
    Storage.setThreeNoScanResults = (payload) => { state.result = payload; return payload; };
    Storage.getThreeNoUnreadCount = () => 0;
    Storage.setThreeNoUnreadCount = (count) => { state.unreadCount = count; };
    Storage.isThreeNoUserSafe = () => false;
    Storage.isThreeNoUserIgnored = () => false;
    Storage.set = (key, value) => localStorageMock.setItem(key, value);
    Storage.remove = (key) => localStorageMock.removeItem(key);
    Core.ThreeNoWatch.getRuntime = () => runtime;
    Core.ThreeNoWatch.getScanDebugLog = () => [];
    Core.ThreeNoWatch.setScanState = (payload) => { state.scanState = payload; };
    Utils.isBetaBuild = () => beta;
    UI.tryUploadThreeNoScanStats = async (...args) => {
        state.uploadCalls += 1;
        return upload(...args);
    };

    await Core.ThreeNoWatch.finishScan({ status });
    await waitForRealTime(70);

    assert.equal(state.result?.status, status, `${status}: result status must remain unchanged`);
    assert.equal(state.scanState?.status, status, `${status}: published scan state must remain unchanged`);
    assert.equal(localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_LOCK), null, `${status}: scan lock must be cleared`);
    assert.equal(localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_COMMAND), null, `${status}: scan command must be cleared`);
    assert.equal(localStorageMock.getItem(Core.ThreeNoWatch.runtimeBackupKey), null, `${status}: runtime backup must be cleared`);
    assert.equal(sessionStorageMock.getItem(Core.ThreeNoWatch.stateKey), null, `${status}: session runtime must be cleared`);
    return state;
};

try {
    const pending = await runFinishScan({
        status: 'completed',
        beta: true,
        upload: () => new Promise(() => {}),
    });
    assert.equal(pending.uploadCalls, 1, 'pending upload: stats upload should be attempted once');
    assert.equal(pending.result.status, 'completed', 'pending upload: scan must be completed');
    assert.equal(closeCalls, 1, 'pending upload: beta worker must close once after bounded wait');

    const immediate = await runFinishScan({
        status: 'completed',
        beta: false,
        upload: async () => ({ code: 200 }),
    });
    assert.equal(immediate.uploadCalls, 1, 'immediate upload: stats upload should be attempted once');
    assert.equal(immediate.result.status, 'completed', 'immediate upload: scan must be completed');
    assert.equal(closeCalls, 1, 'immediate upload: formal worker must close exactly once');

    const stopped = await runFinishScan({
        status: 'stopped',
        beta: true,
        upload: async () => ({ code: 200 }),
    });
    assert.equal(stopped.uploadCalls, 0, 'stopped scan: stats upload must not run');
    assert.equal(stopped.result.status, 'stopped', 'stopped scan must not be rewritten as completed');
    assert.equal(closeCalls, 0, 'stopped beta scan keeps its existing no-close behavior');

    const failed = await runFinishScan({
        status: 'failed',
        beta: false,
        upload: async () => ({ code: 200 }),
    });
    assert.equal(failed.uploadCalls, 0, 'failed scan: stats upload must not run');
    assert.equal(failed.result.status, 'failed', 'failed scan must not be rewritten as completed');
    assert.equal(closeCalls, 1, 'failed formal scan preserves its existing close behavior');

    console.log('three-no finishScan regression: PASS pending-beta=close-once immediate-formal=close-once stopped/failed=preserved-status-and-cleanup');
} finally {
    Storage.getThreeNoScanCursor = originalStorageMethods.getThreeNoScanCursor;
    Storage.setThreeNoScanCursor = originalStorageMethods.setThreeNoScanCursor;
    Storage.getThreeNoScanResults = originalStorageMethods.getThreeNoScanResults;
    Storage.setThreeNoScanResults = originalStorageMethods.setThreeNoScanResults;
    Storage.getThreeNoUnreadCount = originalStorageMethods.getThreeNoUnreadCount;
    Storage.setThreeNoUnreadCount = originalStorageMethods.setThreeNoUnreadCount;
    Storage.isThreeNoUserSafe = originalStorageMethods.isThreeNoUserSafe;
    Storage.isThreeNoUserIgnored = originalStorageMethods.isThreeNoUserIgnored;
    Storage.set = originalStorageMethods.set;
    Storage.remove = originalStorageMethods.remove;
    Core.ThreeNoWatch.getRuntime = originalThreeNoMethods.getRuntime;
    Core.ThreeNoWatch.getScanDebugLog = originalThreeNoMethods.getScanDebugLog;
    Core.ThreeNoWatch.setScanState = originalThreeNoMethods.setScanState;
    Utils.isBetaBuild = originalIsBetaBuild;
    UI.tryUploadThreeNoScanStats = originalUpload;
}
