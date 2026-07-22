import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
const listeners = new Map();
const dispatchedEvents = [];

const eventTarget = {
    addEventListener(type, listener) {
        const entries = listeners.get(type) || [];
        entries.push(listener);
        listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
        const entries = listeners.get(type) || [];
        listeners.set(type, entries.filter(entry => entry !== listener));
    },
    dispatchEvent(event) {
        dispatchedEvents.push(event);
        for (const listener of listeners.get(event?.type) || []) listener(event);
        return true;
    },
};

const windowMock = {
    ...eventTarget,
    location: {
        href: 'https://www.threads.com/',
        origin: 'https://www.threads.com',
        pathname: '/',
        search: '',
        assign: () => {},
        reload: () => {},
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
globalThis.chrome = { runtime: { id: 'beta83-test' } };
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
const { Core, RuntimeDiagnostics, projectScanDebugLogForExport } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const originalVersion = CONFIG.VERSION;
const originalDiagnosticsEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;
const debugKey = CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG;
const schemaKey = CONFIG.KEYS.THREE_NO_SCAN_DEBUG_SCHEMA;

const resetState = ({ version = '2.7.4-beta83', enabled = true } = {}) => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = version;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = enabled;
    listeners.clear();
    dispatchedEvents.length = 0;
    delete windowMock.__hegeThreeNoNetworkDiscoveryInstalled;
};

const seedDebugStorage = () => {
    const raw = JSON.stringify([{
        seq: 1,
        ts: 10,
        scanId: 'pii-scan',
        current: 'private-user',
        url: 'https://www.threads.com/@private-user',
        debug: { username: 'private-user', token: 'should-not-survive' },
        step: 'seeded',
    }]);
    localStorageMock.setItem(debugKey, raw);
    localStorageMock.setItem(schemaKey, 'network-discovery-v6');
    return { raw, schema: 'network-discovery-v6' };
};

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalDiagnosticsEnabled;
    RuntimeDiagnostics.clear();
});

test('beta83 stable or diagnostics-disabled writers and reset do not add or rewrite debug storage', () => {
    for (const scenario of [
        { version: '2.7.4', enabled: false },
        { version: '2.7.4-beta83', enabled: false },
        { version: '2.7.4', enabled: true },
    ]) {
        resetState(scenario);
        const seeded = seedDebugStorage();
        Core.ThreeNoWatch.appendScanDebugLog({ scanId: 'inactive', debug: { step: 'writer_one', username: 'pii' } });
        Core.ThreeNoWatch.appendNetworkDiscoveryLog({ url: { kind: 'bulk_route' }, hrefKind: 'profile_base' });
        Core.ThreeNoWatch.appendNetworkActionMarker('profile', { user: 'pii' });
        Core.ThreeNoWatch.resetScanDebugLog();
        assert.equal(localStorageMock.getItem(debugKey), seeded.raw, `debug log must remain byte-for-byte unchanged for ${JSON.stringify(scenario)}`);
        assert.equal(localStorageMock.getItem(schemaKey), seeded.schema, `schema must remain unchanged for ${JSON.stringify(scenario)}`);
    }
});

test('beta83 inactive boot purges stale raw log/schema without bridge listener', () => {
    resetState({ version: '2.7.4', enabled: true });
    seedDebugStorage();
    windowMock.__hegeThreeNoNetworkDiscoveryInstalled = true;

    assert.equal(Core.ThreeNoWatch.purgeInactiveThreeNoDebugLog(), true);
    assert.equal(typeof Core.ThreeNoWatch.installNetworkDiscoveryListener, 'undefined');

    assert.equal(localStorageMock.getItem(debugKey), null);
    assert.equal(localStorageMock.getItem(schemaKey), null);
    assert.equal(listeners.has('hege:threads-network-discovery'), false);
    assert.equal(dispatchedEvents.some(event => event.type === 'hege:threads-network-discovery-toggle'), false);
});

test('beta83 beta writers and reset retain raw behavior while export projection stays six-column', () => {
    resetState();
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
        scanId: 'beta-scan',
        status: 'scanning',
        startedAt: 10,
        current: 'state-user',
        checkedFollowersCount: 2,
    });

    Core.ThreeNoWatch.appendScanDebugLog({
        scanId: 'beta-scan',
        current: 'raw-user',
        debug: {
            step: 'worker_step',
            username: 'raw-user',
            url: 'https://www.threads.com/@raw-user',
        },
    });
    Core.ThreeNoWatch.appendNetworkDiscoveryLog({
        url: { kind: 'bulk_route', path: '/api/graphql' },
        request: { routeUrls: { posts: 1 } },
        hrefKind: 'profile_base',
        rawPrivateField: 'kept-in-beta',
    });
    Core.ThreeNoWatch.appendNetworkActionMarker('profile', { user: 'action-user', rawPrivateField: 'kept-in-beta' });

    const rows = Core.ThreeNoWatch.getScanDebugLog('beta-scan');
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map(row => row.step), ['worker_step', 'network_discovery', 'network_action_marker']);
    assert.equal(rows[0].debug.username, 'raw-user');
    assert.equal(rows[1].debug.rawPrivateField, 'kept-in-beta');
    assert.equal(rows[2].debug.rawPrivateField, 'kept-in-beta');

    Core.ThreeNoWatch.appendScanDebugLog({
        scanId: 'other-scan',
        debug: { step: 'other_step', username: 'other-user' },
    });
    Core.ThreeNoWatch.resetScanDebugLog('beta-scan');
    assert.deepEqual(Core.ThreeNoWatch.getScanDebugLog().map(row => row.scanId), ['other-scan']);
    Core.ThreeNoWatch.resetScanDebugLog();
    assert.deepEqual(Core.ThreeNoWatch.getScanDebugLog(), []);

    const projected = projectScanDebugLogForExport([{
        seq: 1,
        ts: 10,
        scanElapsedMs: 20,
        index: 0,
        status: 'scanning',
        step: 'worker_step',
        current: 'private-user',
        url: 'https://www.threads.com/@private-user',
        debug: { username: 'private-user' },
    }]);
    assert.deepEqual(Object.keys(projected[0]).sort(), ['index', 'scanElapsedMs', 'seq', 'status', 'step', 'ts']);
    assert.doesNotMatch(JSON.stringify(projected), /private-user|threads\.com/);
});

console.log('beta83 debug-log production purge contract: PASS');
