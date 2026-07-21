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
    let finishCalls = 0;
    const originalFinish = Core.ThreeNoWatch.finishScan;
    Core.ThreeNoWatch.finishScan = async () => { finishCalls += 1; };
    await Core.ThreeNoWatch.runScanPage();
    assert.equal(finishCalls, 0, 'loading a stopping scan must return without finishing again');
    Core.ThreeNoWatch.finishScan = originalFinish;
    Core.ThreeNoWatch.renderWorkerOverlay = originalRenderWorkerOverlay;

    console.log('three-no beta50 stop contract: PASS scalar-owner-fence heartbeat-stopping-fence phase-revive-load-stopping');
} finally {
    // Test process owns isolated storage; no external state is mutated.
}
