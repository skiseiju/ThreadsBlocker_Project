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
const launcherLockName = 'threadsblocker:three-no-scan-launcher';
let launcherLockHeld = false;
const launcherLocksMock = {
    request: async (name, options, callback) => {
        assert.equal(name, launcherLockName);
        assert.equal(options?.ifAvailable, true);
        if (launcherLockHeld) return callback(null);
        launcherLockHeld = true;
        try {
            return await callback({ name });
        } finally {
            launcherLockHeld = false;
        }
    },
};
const eventTarget = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true };
const windowMock = {
    ...eventTarget,
    location: { href: 'https://www.threads.com/', origin: 'https://www.threads.com', pathname: '/', search: '', assign: () => {} },
    close: () => {},
    open: () => null,
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
        locks: launcherLocksMock,
    },
});
globalThis.chrome = { runtime: { id: 'beta48-test' } };
globalThis.document = {
    ...eventTarget,
    body: { appendChild: () => {}, innerText: '', textContent: '' },
    createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [], remove: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const reset = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    windowMock.location.search = '';
    windowMock.location.pathname = '/';
    Core.ThreeNoWatch.READY_TIMEOUT_MS = 35;
};

const start = async (openImpl, { resetStorage = true } = {}) => {
    if (resetStorage) reset();
    windowMock.open = openImpl;
    return Core.ThreeNoWatch.startManualScan({});
};

const signalReady = (scanId, override = {}) => {
    const state = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
        ...state,
        scanId: override.scanId || scanId,
        status: 'ready',
        workerReadyAt: Date.now(),
        workerHeartbeatAt: Date.now(),
        workerBootstrapResult: 'ready',
    });
};

try {
    const popupBlocked = await start(() => null);
    assert.equal(popupBlocked.skipped, 'popup_blocked');
    assert.equal(Storage.get(CONFIG.KEYS.THREE_NO_SCAN_LOCK, ''), '');
    assert.equal(Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {}).status, 'failed');

    const noReady = await start(() => ({ closed: false }));
    assert.equal(noReady.skipped, 'worker_bootstrap_timeout');
    assert.equal(Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {}).error, 'worker_bootstrap_timeout');
    const failedState = Core.ThreeNoWatch.getScanState();
    assert.equal(Core.ThreeNoWatch.markWorkerSignal(failedState.scanId, 'ready'), false, 'late ready cannot revive failed scan');
    assert.equal(Core.ThreeNoWatch.setScanState({ scanId: failedState.scanId, status: 'scanning' }), false, 'late scanning cannot revive failed scan');
    assert.equal(await Core.ThreeNoWatch.finishScan({ scanId: failedState.scanId, status: 'completed' }), false, 'late finish cannot revive failed scan');

    const wrongReady = await start(() => {
        setTimeout(() => signalReady('wrong-scan-id', { scanId: 'wrong-scan-id' }), 0);
        return { closed: false };
    });
    assert.equal(wrongReady.skipped, 'worker_bootstrap_timeout');

    let requestedUrl = '';
    const ready = await start((url) => {
        requestedUrl = url;
        setTimeout(() => {
            const scanId = new URL(url).searchParams.get('hege_three_no_run');
            signalReady(scanId);
        }, 0);
        return { closed: false };
    });
    assert.equal(ready.ok, true);
    assert.match(requestedUrl, /hege_three_no_scan=true/);
    assert.equal(Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {}).status, 'ready');
    assert.equal(Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {}).workerBootstrapResult, 'ready');

    const targetUrl = Core.ThreeNoWatch.buildScanUrl('three-no:target:test', { targetOwner: '@target-owner' });
    assert.equal(new URL(targetUrl).pathname, '/@target-owner');
    assert.equal(new URL(targetUrl).searchParams.get('hege_three_no_target_owner'), 'target-owner');

    Core.ThreeNoWatch.recordLifecycleSnapshot({
        status: 'failed',
        checkedFollowersCount: 3,
        candidateFollowersCount: 8,
        threeNoFollowersCount: 1,
        current: 'secret-user',
        debug: { url: 'https://www.threads.com/@secret-user', dom: '<div>secret</div>' },
    }, 'worker_bootstrap_timeout');
    const safeSnapshot = Storage.getJSON(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, {});
    const event = safeSnapshot.events.at(-1);
    assert.equal(event.stage, 'three_no');
    assert.deepEqual(event.counts, { checked: 3, candidates: 8, findings: 1 });
    assert.equal(JSON.stringify(event).includes('secret-user'), false);
    assert.equal(JSON.stringify(event).includes('threads.com'), false);
    assert.equal(JSON.stringify(event).includes('<div>'), false);

    reset();
    let openCalls = 0;
    const firstLauncher = start(() => { openCalls += 1; return { closed: false }; });
    await new Promise(resolve => setTimeout(resolve, 0));
    const secondLauncher = await start(() => { openCalls += 1; return { closed: false }; }, { resetStorage: false });
    assert.equal(secondLauncher.skipped, 'scan_in_flight');
    const winnerStateWhileHeld = Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {});
    assert.equal(winnerStateWhileHeld.status, 'starting', 'loser must not clear winner state');
    assert.notEqual(Storage.get(CONFIG.KEYS.THREE_NO_SCAN_LOCK, ''), '', 'loser must not clear winner lock');
    const firstResult = await firstLauncher;
    assert.equal(firstResult.skipped, 'worker_bootstrap_timeout');
    assert.equal(openCalls, 1, 'loser must not open a worker');
    assert.equal(Storage.get(CONFIG.KEYS.THREE_NO_SCAN_LOCK, ''), '');
    assert.equal(launcherLockHeld, false, 'Web Lock releases after terminal timeout cleanup');

    reset();
    const winnerToken = 'winner-token';
    Storage.set(CONFIG.KEYS.THREE_NO_SCAN_LOCK, JSON.stringify({ scanId: 'winner-scan', token: winnerToken, createdAt: Date.now() }));
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, { scanId: 'winner-scan', ownerToken: winnerToken, status: 'starting' });
    assert.equal(Core.ThreeNoWatch.clearOwnedScan('loser-scan', 'loser-token'), false);
    assert.notEqual(Storage.get(CONFIG.KEYS.THREE_NO_SCAN_LOCK, ''), '');

    windowMock.location.pathname = '/';
    const targetParams = new URLSearchParams({ hege_three_no_run: 'owner-scan', hege_three_no_target_owner: 'target-owner' });
    await assert.rejects(() => Core.ThreeNoWatch.runFollowersPhase(targetParams), /owner_unknown/);
    windowMock.location.pathname = '/@other-owner';
    await assert.rejects(() => Core.ThreeNoWatch.runFollowersPhase(targetParams), /owner_mismatch/);

    console.log('three-no beta48 launcher contract: PASS race conditional-cleanup late-terminal owner-enums/path/privacy');
} finally {
    windowMock.open = () => null;
}
