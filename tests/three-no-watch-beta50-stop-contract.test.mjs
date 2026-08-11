import assert from 'node:assert/strict';

const area = () => {
    const values = new Map();
    return {
        getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: (key) => values.delete(String(key)),
        clear: () => values.clear(),
    };
};

const localStorageMock = area();
const sessionStorageMock = area();
const eventTarget = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true };
const windowMock = {
    ...eventTarget,
    location: {
        href: 'https://www.threads.com/?hege_three_no_scan=true&hege_three_no_run=scan-1',
        origin: 'https://www.threads.com',
        pathname: '/',
        search: '?hege_three_no_scan=true&hege_three_no_run=scan-1',
        assign: () => {},
    },
    close: () => {},
    open: () => null,
};
globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.chrome = { runtime: { id: 'three-no-stop-test' } };
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 },
});
globalThis.document = {
    ...eventTarget,
    body: { appendChild: () => {}, innerText: '', textContent: '' },
    createElement: () => ({ style: {}, textContent: '', innerHTML: '', appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [], remove: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const owner = 'scan-1';
const token = 'owner-1';
const seed = (status = 'scanning') => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, { scanId: owner, ownerToken: token, status });
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_LOCK, { scanId: owner, token, createdAt: Date.now() });
};

try {
    const originalRenderWorkerOverlay = Core.ThreeNoWatch.renderWorkerOverlay;
    Core.ThreeNoWatch.renderWorkerOverlay = () => {};
    seed();
    Storage.set(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, 'stop');
    assert.equal(Core.ThreeNoWatch.isStopRequested(), false, 'scalar stop without owner must not cross owner fence');
    assert.equal(Core.ThreeNoWatch.requestStop(), true, 'owner-scoped stop request must be accepted');
    const structuredStop = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, {});
    assert.deepEqual(Object.keys(structuredStop).sort(), ['command', 'ownerToken', 'requestedAt', 'scanId']);
    assert.equal(structuredStop.scanId, owner);
    assert.equal(structuredStop.ownerToken, token);
    assert.equal(Core.ThreeNoWatch.getScanState().status, 'stopping');

    seed('stopping');
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, {
        command: 'stop', scanId: owner, ownerToken: token, requestedAt: Date.now(),
    });
    assert.equal(Core.ThreeNoWatch.setScanState({ scanId: owner, ownerToken: token, status: 'scanning' }), false, 'stopping cannot revive to scanning');

    let heartbeatTick;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (callback) => { heartbeatTick = callback; return 1; };
    globalThis.clearInterval = () => {};
    let heartbeatWrites = 0;
    const originalSetJSON = Storage.setJSON;
    Storage.setJSON = (key, value) => {
        if (key === CONFIG.KEYS.THREE_NO_SCAN_STATE) heartbeatWrites += 1;
        return originalSetJSON(key, value);
    };
    Core.ThreeNoWatch.startWorkerHeartbeat();
    await heartbeatTick?.();
    assert.equal(heartbeatWrites, 0, 'late heartbeat must not overwrite stopping');
    Storage.setJSON = originalSetJSON;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;

    seed('stopping');
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, {
        command: 'stop', scanId: owner, ownerToken: token, requestedAt: Date.now(),
    });
    let finishCalls = 0;
    let finishPatch = null;
    const originalFinish = Core.ThreeNoWatch.finishScan;
    Core.ThreeNoWatch.finishScan = async (patch) => {
        finishCalls += 1;
        finishPatch = patch;
    };
    await Core.ThreeNoWatch.runScanPage();
    assert.equal(finishCalls, 1, 'loading a stopping scan must settle the recovered runtime exactly once');
    assert.equal(finishPatch?.status, 'stopped', 'recovered stop must preserve partial findings instead of cancelling');
    Core.ThreeNoWatch.finishScan = originalFinish;

    seed('scanning');
    assert.equal(Core.ThreeNoWatch.setRuntime({
        scanId: owner,
        ownerToken: token,
        owner: 'owner',
        scanDate: '2026-08-11',
        startedAt: Date.now() - 1000,
        findings: [{ username: 'candidate', noAvatar: true, noBio: true, noPosts: true }],
        usernames: ['candidate', 'not-checked-yet'],
        triagedUsernames: ['candidate', 'not-checked-yet'],
        index: 1,
        hasMore: true,
        batchSize: 2,
    }), true, 'active runtime fixture must be persisted before stop');
    assert.equal(Core.ThreeNoWatch.requestStop(), true);
    await Core.ThreeNoWatch.runScanPage();
    const stoppedResults = Storage.getThreeNoScanResults();
    assert.equal(stoppedResults.status, 'stopped');
    assert.deepEqual(stoppedResults.users.map(item => item.username), ['candidate'], 'stopping must persist findings already confirmed before the stop');
    assert.equal(Core.ThreeNoWatch.getScanState().status, 'stopped');

    assert.equal(Core.ThreeNoWatch.hasReviewableScanResults?.({
        status: 'stopped', completedAt: Date.now(), users: [{ username: 'candidate' }],
    }), true, 'a stopped scan with findings must remain reviewable and eligible for auto-open');
    assert.equal(Core.ThreeNoWatch.hasReviewableScanResults?.({
        status: 'stopped', completedAt: Date.now(), users: [],
    }), false, 'an empty stopped scan must not create a blank report');
    Core.ThreeNoWatch.renderWorkerOverlay = originalRenderWorkerOverlay;

    console.log('three-no stop contract: PASS owner-fence heartbeat-fence recovered-stop-settlement reviewable-partial-report');
} finally {
    // Test process owns isolated storage; no external state is mutated.
}
