import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

class MemoryStorage {
    constructor() { this.data = new Map(); }
    getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
    setItem(key, value) { this.data.set(String(key), String(value)); }
    removeItem(key) { this.data.delete(String(key)); }
    clear() { this.data.clear(); }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
const makeClassList = () => {
    const values = new Set();
    return {
        add: (...names) => names.forEach(name => values.add(name)),
        remove: (...names) => names.forEach(name => values.delete(name)),
        contains: name => values.has(name),
        toggle: (name, force) => {
            const next = force === undefined ? !values.has(name) : !!force;
            if (next) values.add(name); else values.delete(name);
            return next;
        },
    };
};
const makeElement = () => ({
    dataset: {},
    style: {},
    title: '',
    textContent: '',
    classList: makeClassList(),
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() {},
    remove() {},
});

const windowMock = {
    location: {
        href: 'https://www.threads.com/home',
        origin: 'https://www.threads.com',
        pathname: '/home',
        search: '',
    },
    innerWidth: 1200,
    innerHeight: 900,
    outerWidth: 1200,
    outerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    close() {},
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta92-fixture', platform: 'test', maxTouchPoints: 0, onLine: true },
});
globalThis.CSS = { escape: value => String(value) };
globalThis.history = { replaceState() {} };
globalThis.BroadcastChannel = class { postMessage() {} close() {} };

const users = Array.from({ length: 48 }, (_, index) => `fixture_${index + 1}`);
const checkboxElements = users.map(username => {
    const element = makeElement();
    element.dataset.username = username;
    return element;
});
const panelElements = new Map();
const panel = makeElement();
const header = makeElement();
const mainItem = makeElement();
const mainLabel = makeElement();
mainItem.querySelector = selector => selector === 'span' ? mainLabel : null;
panelElements.set('hege-panel', panel);
panelElements.set('hege-header', header);
panelElements.set('hege-main-btn-item', mainItem);
panelElements.set('hege-stop-btn-item', makeElement());
panelElements.set('hege-queue-badge', makeElement());
panelElements.set('hege-sel-count', makeElement());
panelElements.set('hege-history-count', makeElement());
panelElements.set('hege-report-count', makeElement());
panelElements.set('hege-bg-status', makeElement());

globalThis.document = {
    hidden: false,
    title: '',
    body: { appendChild() {}, addEventListener() {}, innerText: '', textContent: '' },
    documentElement: { appendChild() {} },
    defaultView: windowMock,
    getElementById: id => panelElements.get(id) || null,
    querySelector: () => null,
    querySelectorAll: selector => selector === '.hege-checkbox-container' ? checkboxElements : [],
    createElement: () => makeElement(),
    createElementNS: () => makeElement(),
    addEventListener() {},
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core, RuntimeDiagnostics, resolveStopVisibility } = await import('../src/core.js');

const LATCH_KEY = 'hege_stop_visibility_latch';
const SNAPSHOT_KEY = 'hege_selection_snapshot';
const originalStorageMethods = {
    set: Storage.set,
    remove: Storage.remove,
    setSessionJSON: Storage.setSessionJSON,
};
const originalBeginBlockSession = Core.beginBlockSession;
const metrics = {
    begin: 0,
    selectionSnapshotWrites: 0,
    stopLatchWrites: 0,
};

Storage.set = (key, ...args) => {
    if (key === LATCH_KEY) metrics.stopLatchWrites += 1;
    return originalStorageMethods.set.call(Storage, key, ...args);
};
Storage.remove = (key, ...args) => {
    if (key === LATCH_KEY) metrics.stopLatchWrites += 1;
    return originalStorageMethods.remove.call(Storage, key, ...args);
};
Storage.setSessionJSON = (key, ...args) => {
    if (key === SNAPSHOT_KEY) metrics.selectionSnapshotWrites += 1;
    return originalStorageMethods.setSessionJSON.call(Storage, key, ...args);
};
Core.beginBlockSession = (...args) => {
    metrics.begin += 1;
    return originalBeginBlockSession(...args);
};

const resetMetrics = () => {
    metrics.begin = 0;
    metrics.selectionSnapshotWrites = 0;
    metrics.stopLatchWrites = 0;
};

const resetFixture = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    resetMetrics();
    Core.pendingUsers.clear();
    Core._selectionSnapshot.clear();
    Core._stopVisibilityLatch = false;
    Core._checkboxStateSources = null;
    Core._uiUpdatePending = null;
    Core._lastUIUpdate = 0;
    Storage.setJSON(CONFIG.KEYS.DB_KEY, []);
    Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, users);
    Storage.setJSON(CONFIG.KEYS.BG_STATUS, { state: 'stopped', lastUpdate: Date.now() });
    Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, []);
    resetMetrics();
};

const stateOf = () => ({
    snapshotSize: Core._selectionSnapshot.size,
    latch: Core._stopVisibilityLatch,
    stopDisplay: panelElements.get('hege-stop-btn-item').style.display,
    checkedCount: checkboxElements.filter(element => element.classList.contains('checked')).length,
});

const legacyStopVisibility = (input = {}) => {
    const bg = input.bgStatus && typeof input.bgStatus === 'object' ? input.bgStatus : {};
    const state = String(bg.state || input.state || '').toLowerCase();
    const terminal = ['idle', 'completed', 'stopped', 'failed', 'error'].includes(state)
        || input.terminal === true;
    const activeSession = input.sessionActive === true
        || input.threeNoActive === true
        || state === 'running'
        || state === 'stopping';
    if (activeSession) return true;
    if (terminal || !state) return false;
    if (input.stopLatch) return true;
    return false;
};

const releaseWithLegacyResolver = () => {
    if (legacyStopVisibility({
        bgStatus: { state: 'stopped' },
        blockQueueCount: users.length,
        reportQueueCount: 0,
        threeNoActive: false,
        stopLatch: Core._stopVisibilityLatch,
    })) return;
    Core._stopVisibilityLatch = false;
    Core._selectionSnapshot.clear();
    Storage.remove(LATCH_KEY);
    Storage.setSessionJSON(SNAPSHOT_KEY, []);
};

const runPasses = ({ replayLegacyResolver = false } = {}) => {
    const passes = [];
    for (let index = 0; index < 5; index += 1) {
        Core._lastUIUpdate = 0;
        Core._uiUpdatePending = null;
        const sources = Core.beginCheckboxStatePass();
        const afterBegin = {
            ...stateOf(),
            liveSession: sources.liveSession,
        };
        Core.updateControllerUI();
        const afterUpdate = stateOf();
        if (replayLegacyResolver) releaseWithLegacyResolver();
        const afterLegacyRelease = stateOf();
        Core.endCheckboxStatePass();
        passes.push({ pass: index + 1, afterBegin, afterUpdate, afterLegacyRelease });
    }
    return passes;
};

test.after(() => {
    Storage.set = originalStorageMethods.set;
    Storage.remove = originalStorageMethods.remove;
    Storage.setSessionJSON = originalStorageMethods.setSessionJSON;
    Core.beginBlockSession = originalBeginBlockSession;
});

test('beta92 red／green：停止後 48 筆佇列的五輪 scanner pass 不再震盪', () => {
    resetFixture();
    const red = runPasses({ replayLegacyResolver: true });
    const redRing = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection');
    const redSummary = {
        begin: metrics.begin,
        selectionSnapshotWrites: metrics.selectionSnapshotWrites,
        stopLatchWrites: metrics.stopLatchWrites,
        storageWrites: metrics.selectionSnapshotWrites + metrics.stopLatchWrites,
        ring: redRing.length,
        commits: redRing.filter(entry => entry.stage === 'commit').length,
        endStates: red.map(item => item.afterLegacyRelease),
    };

    resetFixture();
    const green = runPasses();
    const greenRing = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection');
    const greenSummary = {
        begin: metrics.begin,
        selectionSnapshotWrites: metrics.selectionSnapshotWrites,
        stopLatchWrites: metrics.stopLatchWrites,
        storageWrites: metrics.selectionSnapshotWrites + metrics.stopLatchWrites,
        ring: greenRing.length,
        commits: greenRing.filter(entry => entry.stage === 'commit').length,
        endStates: green.map(item => item.afterUpdate),
    };

    assert.equal(redSummary.begin, 5);
    assert.equal(redSummary.storageWrites, 20);
    assert.equal(redSummary.ring, 20);
    assert.equal(redSummary.commits, 5);
    assert.ok(redSummary.endStates.every(state => state.snapshotSize === 0 && state.latch === false));

    assert.equal(greenSummary.begin, 1);
    assert.equal(greenSummary.selectionSnapshotWrites, 1);
    assert.equal(greenSummary.stopLatchWrites, 1);
    assert.equal(greenSummary.storageWrites, 2);
    assert.equal(greenSummary.ring, 4);
    assert.equal(greenSummary.commits, 1);
    assert.ok(greenSummary.endStates.every(state => state.snapshotSize === 48));
    assert.ok(greenSummary.endStates.every(state => state.latch === true));
    assert.ok(greenSummary.endStates.every(state => state.stopDisplay === 'flex'));
    assert.ok(greenSummary.endStates.every(state => state.checkedCount === 48));

    console.log(`beta7 red：begin=${redSummary.begin} selection=${redSummary.selectionSnapshotWrites} latch=${redSummary.stopLatchWrites} writes=${redSummary.storageWrites} ring=${redSummary.ring} commits=${redSummary.commits}`);
    console.log(`beta7 green：begin=${greenSummary.begin} selection=${greenSummary.selectionSnapshotWrites} latch=${greenSummary.stopLatchWrites} writes=${greenSummary.storageWrites} ring=${greenSummary.ring} commits=${greenSummary.commits}`);
});

test('beta92 行為守門：佇列清空後 terminal 收起，三無掃描維持顯示', () => {
    assert.equal(resolveStopVisibility({
        bgStatus: { state: 'stopped' },
        blockQueueCount: 48,
        reportQueueCount: 0,
        threeNoActive: false,
        stopLatch: false,
    }), true);
    assert.equal(resolveStopVisibility({
        bgStatus: { state: 'stopped' },
        blockQueueCount: 0,
        reportQueueCount: 3,
        threeNoActive: false,
        stopLatch: false,
    }), true);
    assert.equal(resolveStopVisibility({
        bgStatus: { state: 'completed' },
        blockQueueCount: 0,
        reportQueueCount: 0,
        threeNoActive: false,
        stopLatch: true,
    }), false);
    assert.equal(resolveStopVisibility({
        bgStatus: { state: 'idle' },
        blockQueueCount: 0,
        reportQueueCount: 0,
        threeNoActive: true,
        stopLatch: false,
    }), true);
});

console.log('beta92 stop visibility SSOT contract: PASS');
