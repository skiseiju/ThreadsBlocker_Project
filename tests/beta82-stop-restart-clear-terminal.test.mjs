import test from 'node:test';
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
    },
});
globalThis.chrome = { runtime: { id: 'beta82-test' } };
globalThis.document = {
    ...eventTarget,
    body: { appendChild: () => {}, innerText: '', textContent: '' },
    createElement: () => ({
        style: {},
        dataset: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
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
const { Storage } = await import('../src/storage.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const resetState = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    windowMock.location.href = 'https://www.threads.com/';
    windowMock.location.pathname = '/';
    windowMock.location.search = '';
};

const setScanStateRecord = (state) => {
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, state);
};

test.beforeEach(() => {
    resetState();
});

test.after(() => {
    RuntimeDiagnostics.clear();
});

test('beta82 helper only clears terminal scan state and cancelled state', () => {
    setScanStateRecord({ scanId: 'old', status: 'stopped' });
    assert.equal(Core.ThreeNoWatch.clearTerminalScanBeforeStart(), true);
    assert.deepEqual(Core.ThreeNoWatch.getScanState(), {});

    setScanStateRecord({ scanId: 'old', status: 'scanning', debug: { keep: true } });
    assert.equal(Core.ThreeNoWatch.clearTerminalScanBeforeStart(), false);
    assert.deepEqual(Core.ThreeNoWatch.getScanState(), { scanId: 'old', status: 'scanning', debug: { keep: true } });

    resetState();
    assert.equal(Core.ThreeNoWatch.clearTerminalScanBeforeStart(), false);
    assert.deepEqual(Core.ThreeNoWatch.getScanState(), {});

    setScanStateRecord({ scanId: 'old', status: 'running', cancelled: true });
    assert.equal(Core.ThreeNoWatch.clearTerminalScanBeforeStart(), true);
    assert.deepEqual(Core.ThreeNoWatch.getScanState(), {});
});

test('beta82 helper preserves scan results while clearing terminal launch state', () => {
    const fakeResults = {
        scanId: 'old',
        findings: [{ reason: 'fake' }],
        summary: { checked: 1, candidates: 1 },
    };
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_RESULTS, fakeResults);
    setScanStateRecord({ scanId: 'old', status: 'completed' });

    assert.equal(Core.ThreeNoWatch.clearTerminalScanBeforeStart(), true);
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.THREE_NO_SCAN_RESULTS, {}), fakeResults);
});

test('beta82 clearing terminal state unlocks a new claim that terminal guards would otherwise reject', () => {
    setScanStateRecord({ scanId: 'old', status: 'stopped' });

    const rejected = Core.ThreeNoWatch.setScanState({ scanId: 'new', ownerToken: 'tok', status: 'starting' });
    assert.equal(rejected, false);

    setScanStateRecord({ scanId: 'old', status: 'stopped' });
    assert.equal(Core.ThreeNoWatch.clearTerminalScanBeforeStart(), true);

    const accepted = Core.ThreeNoWatch.setScanState({ scanId: 'new', ownerToken: 'tok', status: 'starting' });
    assert.notEqual(accepted, false);
    assert.equal(Core.ThreeNoWatch.getScanState().scanId, 'new');
});

console.log('beta82 stop-restart clear-terminal contract: PASS');
