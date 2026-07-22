import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const eventTarget = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true };
const windowMock = {
    ...eventTarget,
    location: {
        href: 'https://www.threads.com/',
        origin: 'https://www.threads.com',
        pathname: '/',
        search: '',
        assign: () => {},
    },
    close: () => {},
    open: () => null,
};
const navigatorMock = {
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
    platform: 'MacIntel',
    maxTouchPoints: 0,
    locks: {
        request: async (_name, _options, callback) => callback({ name: _name }),
    },
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: navigatorMock,
});
globalThis.chrome = { runtime: { id: 'beta81-test' } };
globalThis.document = {
    ...eventTarget,
    body: { appendChild: () => {}, innerText: '', textContent: '' },
    createElement: () => ({ style: {}, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [], remove: () => {} }),
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
const { Storage } = await import('../src/storage.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const originalVersion = CONFIG.VERSION;
const originalEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;
const gateFailureTypes = [
    'gate_launcher_lock',
    'gate_claim_lost',
    'gate_worker_ready_owner',
    'gate_state_fresh',
];

const resetState = () => {
    localStorage.clear();
    sessionStorage.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = '2.7.4-beta81';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    windowMock.location.search = '';
    windowMock.location.pathname = '/';
    windowMock.open = () => null;
    navigatorMock.locks.request = async (_name, _options, callback) => callback({ name: _name });
    Core.ThreeNoWatch.READY_TIMEOUT_MS = 35;
};

const findThreeNoPrecondition = (failureType) => RuntimeDiagnostics.get().find((entry) => (
    entry.feature === 'three_no'
    && entry.stage === 'precondition'
    && entry.fields?.failureType === failureType
));

test.beforeEach(() => {
    resetState();
});

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalEnabled;
    RuntimeDiagnostics.clear();
});

test('beta81 RuntimeDiagnostics allowlist preserves all four scan_in_flight failure types', () => {
    if (!RuntimeDiagnostics.enabled()) assert.fail(`RuntimeDiagnostics.enabled() is false for ${CONFIG.VERSION}`);
    for (const failureType of gateFailureTypes) {
        RuntimeDiagnostics.record('three_no', 'precondition', { failureType });
        const entry = RuntimeDiagnostics.get().at(-1);
        assert.ok(entry);
        assert.equal(entry.fields.failureType, failureType);
    }
});

test('beta81 failure types are unique and match the allowlist regex', () => {
    assert.equal(new Set(gateFailureTypes).size, gateFailureTypes.length);
    for (const failureType of gateFailureTypes) {
        assert.match(failureType, /^[a-z][a-z0-9_]{0,32}$/);
    }
});

test('beta81 waitForWorkerReady records gate_worker_ready_owner on owner token mismatch', async () => {
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
        scanId: 'scan-1',
        ownerToken: 'other-owner',
        status: 'starting',
    });
    const result = await Core.ThreeNoWatch.waitForWorkerReady('scan-1', 250, 'expected-owner');
    assert.equal(result.ok, false);
    assert.equal(result.result, 'scan_in_flight');
    const entry = findThreeNoPrecondition('gate_worker_ready_owner');
    assert.ok(entry);
    assert.equal(entry.fields.reason, 'scan_in_flight');
    assert.equal(entry.fields.active, true);
  });

test('beta81 startManualScan records gate_state_fresh before returning scan_in_flight for a fresh claimed scan', async () => {
    const now = Date.now();
    Storage.set(CONFIG.KEYS.THREE_NO_SCAN_LOCK, JSON.stringify({ scanId: 'winner-scan', token: 'winner-token', createdAt: now }));
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
        scanId: 'winner-scan',
        ownerToken: 'winner-token',
        status: 'starting',
        updatedAt: now,
        workerHeartbeatAt: now,
    });
    let openCalls = 0;
    windowMock.open = () => {
        openCalls += 1;
        return { closed: false };
    };
    const result = await Core.ThreeNoWatch.startManualScan({});
    assert.equal(result.skipped, 'scan_in_flight');
    assert.equal(openCalls, 0);
    const entry = findThreeNoPrecondition('gate_state_fresh');
    assert.ok(entry);
    assert.equal(entry.fields.reason, 'scan_in_flight');
    assert.equal(entry.fields.active, true);
});

test('beta81 startManualScan records gate_claim_lost when the storage claim is no longer owned', async () => {
    let openCalls = 0;
    windowMock.open = () => {
        openCalls += 1;
        return { closed: false };
    };
    const originalGetScanState = Core.ThreeNoWatch.getScanState;
    Core.ThreeNoWatch.getScanState = () => ({ scanId: 'other-scan', ownerToken: 'other-token' });
    try {
        const result = await Core.ThreeNoWatch.startManualScan({});
        assert.equal(result.skipped, 'scan_in_flight');
    } finally {
        Core.ThreeNoWatch.getScanState = originalGetScanState;
    }
    assert.equal(openCalls, 0);
    const entry = findThreeNoPrecondition('gate_claim_lost');
    assert.ok(entry);
    assert.equal(entry.fields.reason, 'scan_in_flight');
    assert.equal(entry.fields.active, true);
    assert.equal(entry.fields.stopRequested, false);
});

test('beta81 startManualScan records gate_launcher_lock when Web Lock is unavailable', async () => {
    let openCalls = 0;
    windowMock.open = () => {
        openCalls += 1;
        return { closed: false };
    };
    navigatorMock.locks.request = async (_name, _options, callback) => callback(null);
    const result = await Core.ThreeNoWatch.startManualScan({});
    assert.equal(result.skipped, 'scan_in_flight');
    assert.equal(openCalls, 0);
    const entry = findThreeNoPrecondition('gate_launcher_lock');
    assert.ok(entry);
    assert.equal(entry.fields.reason, 'scan_in_flight');
    assert.equal(entry.fields.active, true);
});

console.log('beta81 scan_in_flight gate diagnostics: PASS');
