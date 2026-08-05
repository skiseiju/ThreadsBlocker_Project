import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

class MemoryStorage {
    constructor(scope, counters) {
        this.scope = scope;
        this.counters = counters;
        this.data = new Map();
    }
    getItem(key) {
        this.counters.reads[this.scope] = (this.counters.reads[this.scope] || 0) + 1;
        return this.data.has(String(key)) ? this.data.get(String(key)) : null;
    }
    setItem(key, value) {
        this.counters.writes[this.scope] = (this.counters.writes[this.scope] || 0) + 1;
        this.data.set(String(key), String(value));
    }
    removeItem(key) {
        this.counters.writes[this.scope] = (this.counters.writes[this.scope] || 0) + 1;
        this.data.delete(String(key));
    }
    clear() { this.data.clear(); }
}

const counters = {
    reads: { local: 0, session: 0 },
    writes: { local: 0, session: 0 },
    apiReads: { db: 0, json: 0 },
    apiWrites: { local: 0, session: 0 },
};
const localStorageMock = new MemoryStorage('local', counters);
const sessionStorageMock = new MemoryStorage('session', counters);
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
    value: { userAgent: 'beta91-fixture', platform: 'test', maxTouchPoints: 0, onLine: true },
});
globalThis.CSS = { escape: value => String(value) };
globalThis.history = { replaceState() {} };
globalThis.BroadcastChannel = class { postMessage() {} close() {} };
globalThis.document = {
    hidden: false,
    title: '',
    body: { appendChild() {}, addEventListener() {}, innerText: '', textContent: '' },
    documentElement: { appendChild() {} },
    defaultView: windowMock,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {} }),
    createElementNS: () => ({ setAttribute() {}, classList: { add() {}, remove() {} }, appendChild() {} }),
    addEventListener() {},
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');

const originalStorageMethods = {
    getBlockDB: Storage.getBlockDB,
    getJSON: Storage.getJSON,
    set: Storage.set,
    setJSON: Storage.setJSON,
    setSessionJSON: Storage.setSessionJSON,
};
Storage.getBlockDB = (...args) => {
    counters.apiReads.db += 1;
    return originalStorageMethods.getBlockDB(...args);
};
Storage.getJSON = (key, ...args) => {
    if (key !== CONFIG.KEYS.DB_KEY) counters.apiReads.json += 1;
    return originalStorageMethods.getJSON(key, ...args);
};
Storage.set = (...args) => {
    counters.apiWrites.local += 1;
    return originalStorageMethods.set(...args);
};
Storage.setJSON = (...args) => {
    counters.apiWrites.local += 1;
    return originalStorageMethods.setJSON(...args);
};
Storage.setSessionJSON = (...args) => {
    counters.apiWrites.session += 1;
    return originalStorageMethods.setSessionJSON(...args);
};

const originalApplyCheckboxState = Core.applyCheckboxState;
const originalRateLimit = RuntimeDiagnostics.RATE_LIMIT_PRIORITY_2_3_PER_MINUTE;
const originalNow = Date.now;

const users = Array.from({ length: 48 }, (_, index) => `fixture_${index + 1}`);
const makeContainer = () => {
    const names = new Set();
    return {
        classList: {
            add: (...values) => values.forEach(value => names.add(value)),
            remove: (...values) => values.forEach(value => names.delete(value)),
            contains: value => names.has(value),
        },
        dataset: {},
    };
};

const resetFixture = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    counters.reads.local = 0;
    counters.reads.session = 0;
    counters.writes.local = 0;
    counters.writes.session = 0;
    counters.apiReads.db = 0;
    counters.apiReads.json = 0;
    counters.apiWrites.local = 0;
    counters.apiWrites.session = 0;
    RuntimeDiagnostics.clear();
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = true;
    RuntimeDiagnostics.RATE_LIMIT_PRIORITY_2_3_PER_MINUTE = 1000;
    Core.pendingUsers.clear();
    Core._selectionSnapshot.clear();
    Core._stopVisibilityLatch = false;
    Core._checkboxStateSources = null;
    Core.blockQueue.clear();
    Storage.setJSON(CONFIG.KEYS.DB_KEY, []);
    Storage.setJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []);
    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, users);
    Storage.setJSON(CONFIG.KEYS.BG_STATUS, { state: 'running', lastUpdate: Date.now() });
    Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, []);
    counters.writes.local = 0;
    counters.writes.session = 0;
    counters.apiWrites.local = 0;
    counters.apiWrites.session = 0;
};

const readCounts = () => ({
    db: counters.apiReads.db,
    json: counters.apiReads.json,
    total: counters.apiReads.db + counters.apiReads.json,
});

const writeCounts = () => ({
    local: counters.apiWrites.local,
    session: counters.apiWrites.session,
    total: counters.apiWrites.local + counters.apiWrites.session,
});

const runCurrentPasses = async () => {
    const states = [];
    for (let pass = 0; pass < 3; pass += 1) {
        const sources = Core.beginCheckboxStatePass();
        const passStates = [];
        users.forEach(username => {
            const box = makeContainer();
            Core.syncCheckboxQueueState(box, username, null, sources);
            passStates.push({
                checked: box.classList.contains('checked'),
                finished: box.classList.contains('finished'),
                pending: box.classList.contains('pending'),
            });
        });
        Core.endCheckboxStatePass();
        states.push(passStates);
        await Promise.resolve();
    }
    return states;
};

const runLegacyPasses = ({ terminalLimit = 1000 } = {}) => {
    const beginCalls = { value: 0 };
    const legacyBeginBlockSession = (names) => {
        beginCalls.value += 1;
        const operationId = RuntimeDiagnostics.begin('selection', { strategy: 'semantic_row', active: true });
        RuntimeDiagnostics.record('selection', 'snapshot', { selectedCount: names.length, flickerLatch: true, active: true, operationId });
        names.filter(Boolean).forEach(username => Core._selectionSnapshot.add(username));
        Core._stopVisibilityLatch = true;
        Storage.setSessionJSON('hege_selection_snapshot', [...Core._selectionSnapshot]);
        Storage.set('hege_stop_visibility_latch', 'true');
        RuntimeDiagnostics.record('selection', 'restore', { selectedCount: Core._selectionSnapshot.size, flickerLatch: true, active: true, operationId });
        RuntimeDiagnostics.end(operationId, 'commit', { committed: true, complete: true, selectedCount: Core._selectionSnapshot.size });
    };
    RuntimeDiagnostics.RATE_LIMIT_PRIORITY_2_3_PER_MINUTE = terminalLimit;
    for (let pass = 0; pass < 3; pass += 1) {
        users.forEach(username => {
            const db = new Set(Storage.getBlockDB());
            const cdq = new Set(Storage.getJSON(CONFIG.KEYS.COOLDOWN_QUEUE, []));
            const bgq = new Set(Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []));
            const liveBgStatus = Storage.getJSON(CONFIG.KEYS.BG_STATUS, {});
            const liveState = String(liveBgStatus.state || '').toLowerCase();
            const liveSession = liveState === 'running' || liveState === 'stopping'
                || bgq.size > 0 || Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []).length > 0;
            if (liveSession) legacyBeginBlockSession([...Core.pendingUsers, ...bgq]);
            const state = Core.resolveCheckboxState(username, { db, cdq, bgq });
            const box = makeContainer();
            Core.applyCheckboxState(box, state);
        });
    }
    return {
        beginCalls: beginCalls.value,
        writes: writeCounts(),
        reads: readCounts(),
        ring: RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection'),
    };
};

test.beforeEach(() => {
    resetFixture();
    Core.applyCheckboxState = (element, state) => {
        element.classList.remove('finished', 'checked', 'pending');
        if (state === 'finished') element.classList.add('finished');
        if (state === 'checked') element.classList.add('checked');
    };
});

test.after(() => {
    Core.applyCheckboxState = originalApplyCheckboxState;
    RuntimeDiagnostics.RATE_LIMIT_PRIORITY_2_3_PER_MINUTE = originalRateLimit;
    Storage.getBlockDB = originalStorageMethods.getBlockDB;
    Storage.getJSON = originalStorageMethods.getJSON;
    Storage.set = originalStorageMethods.set;
    Storage.setJSON = originalStorageMethods.setJSON;
    Storage.setSessionJSON = originalStorageMethods.setSessionJSON;
    Date.now = originalNow;
});

test('甲 red／green：48 個勾選框跑三輪後只讀一次 pass 狀態，沒有逐列 session 副作用', async () => {
    const red = runLegacyPasses({ terminalLimit: 1000 });
    assert.equal(red.beginCalls, 48 * 3);
    assert.equal(red.writes.total, 48 * 3 * 2);
    assert.equal(red.reads.total, 48 * 3 * 4);
    assert.ok(red.ring.filter(entry => entry.stage === 'commit').length > 100);

    resetFixture();
    const sessionSizeBefore = Core.beginBlockSession(users);
    const writesAfterSession = writeCounts();
    const ringAfterSession = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection').length;
    const states = await runCurrentPasses();
    const greenWrites = writeCounts();
    const greenReads = readCounts();
    const greenRing = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection');

    assert.equal(sessionSizeBefore, 48);
    assert.deepEqual(writesAfterSession, { local: 1, session: 1, total: 2 });
    assert.deepEqual(greenWrites, writesAfterSession);
    assert.equal(greenReads.total, 12);
    assert.equal(greenRing.length, ringAfterSession);
    assert.equal(greenRing.filter(entry => entry.stage === 'commit').length, 1);
    assert.ok(states.flat().every(state => state.checked && !state.finished && !state.pending));

    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);
    const stoppedSources = Core.beginCheckboxStatePass();
    const afterDequeue = users.map(username => {
        const box = makeContainer();
        Core.syncCheckboxQueueState(box, username, null, stoppedSources);
        return box.classList.contains('checked');
    });
    Core.endCheckboxStatePass();
    assert.ok(afterDequeue.every(Boolean), '停止或佇列移除後仍應由 latch 保留勾選');
    assert.equal(Core._selectionSnapshot.size, 48);
    console.log(`beta6 甲：red begin=${red.beginCalls} writes=${red.writes.total} reads=${red.reads.total} ring=${red.ring.length} commits=${red.ring.filter(entry => entry.stage === 'commit').length}; green begin=0 writes=${greenWrites.total} reads=${greenReads.total} ring=${greenRing.length} commits=${greenRing.filter(entry => entry.stage === 'commit').length}`);
});

test('甲乙對照：只修甲、只修乙、兩者都修的 selection commit 數', async () => {
    resetFixture();
    const onlyAStates = await runCurrentPasses();
    const onlyA = { commits: RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection' && entry.stage === 'commit').length };

    resetFixture();
    const onlyB = runLegacyPasses({ terminalLimit: 60 });
    resetFixture();
    await runCurrentPasses();
    const both = { commits: RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection' && entry.stage === 'commit').length };

    assert.equal(onlyA.commits, 1);
    assert.equal(onlyB.ring.filter(entry => entry.stage === 'commit').length, 60);
    assert.equal(both.commits, 1);
    assert.equal(onlyAStates.length, 3);
    console.log(`beta6 對照：只修甲=${onlyA.commits}、只修乙=${onlyB.ring.filter(entry => entry.stage === 'commit').length}、兩者都修=${both.commits}`);
});

test('乙 red／green：同一分鐘 100 筆 terminal 加 5 筆 failure，failure 全數保留', () => {
    const originalNowValue = Date.now;
    let now = 1000000;
    Date.now = () => now;
    try {
        RuntimeDiagnostics.clear();
        RuntimeDiagnostics.RATE_LIMIT_PRIORITY_2_3_PER_MINUTE = 1000;
        for (let index = 0; index < 100; index += 1) {
            RuntimeDiagnostics.record('selection', 'commit', {
                operationId: `selection-t${index}`,
                terminal: true,
                committed: true,
                complete: true,
            });
        }
        for (let index = 0; index < 5; index += 1) {
            RuntimeDiagnostics.record('selection', 'failure', {
                operationId: `selection-f${index}`,
                failure: true,
                reason: 'failure',
            });
        }
        const redTerminal = RuntimeDiagnostics.get().filter(entry => entry.stage === 'commit').length;
        const redFailure = RuntimeDiagnostics.get().filter(entry => entry.stage === 'failure').length;

        RuntimeDiagnostics.clear();
        RuntimeDiagnostics.RATE_LIMIT_PRIORITY_2_3_PER_MINUTE = 60;
        for (let index = 0; index < 100; index += 1) {
            RuntimeDiagnostics.record('selection', 'commit', {
                operationId: `selection-g${index}`,
                terminal: true,
                committed: true,
                complete: true,
            });
        }
        for (let index = 0; index < 5; index += 1) {
            RuntimeDiagnostics.record('selection', 'failure', {
                operationId: `selection-h${index}`,
                failure: true,
                reason: 'failure',
            });
        }
        const greenTerminal = RuntimeDiagnostics.get().filter(entry => entry.stage === 'commit').length;
        const greenFailure = RuntimeDiagnostics.get().filter(entry => entry.stage === 'failure').length;

        assert.equal(redTerminal, 100);
        assert.equal(redFailure, 5);
        assert.equal(greenTerminal, 60);
        assert.equal(greenFailure, 5);
        assert.ok(RuntimeDiagnostics.get().filter(entry => entry.stage === 'failure').every(entry => entry.priority === 4));
        console.log(`beta6 乙：red terminal=${redTerminal} failure=${redFailure}; green terminal=${greenTerminal} failure=${greenFailure}`);
    } finally {
        Date.now = originalNowValue;
    }
});

console.log('beta6 勾選框 session 與診斷節流 fixture: PASS');
