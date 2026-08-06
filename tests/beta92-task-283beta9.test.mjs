import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

class CountingStorage {
    #data = new Map();
    writes = 0;
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) { this.writes += 1; this.#data.set(String(key), String(value)); }
    removeItem(key) { this.writes += 1; this.#data.delete(String(key)); }
    clear() { this.#data.clear(); this.writes = 0; }
    resetWrites() { this.writes = 0; }
}

const localStorageMock = new CountingStorage();
const sessionStorageMock = new CountingStorage();
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.window = {
    location: { href: 'https://www.threads.com/home', origin: 'https://www.threads.com', pathname: '/home', search: '' },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static' }),
};
globalThis.document = {
    hidden: false,
    body: { appendChild() {}, addEventListener() {} },
    documentElement: { appendChild() {} },
    defaultView: globalThis.window,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ style: {}, appendChild() {}, remove() {} }),
    addEventListener() {},
};
globalThis.history = { replaceState() {} };
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta92-fixture', platform: 'test', maxTouchPoints: 0, onLine: true },
});
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { RuntimeDiagnostics, buildAccountTimingFields } = await import('../src/core.js');

const originalRuntime = CONFIG.ENABLE_RUNTIME_DIAGNOSTICS;

const TIMING_FIELDS = [
    'navigationToRootMs',
    'rootToMenuMs',
    'menuToActionMs',
    'actionToConfirmMs',
    'totalMs',
    'unaccountedMs',
];

test.beforeEach(() => {
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = true;
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    localStorageMock.resetWrites();
});

test.after(() => {
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = originalRuntime;
    RuntimeDiagnostics.clear();
});

test('甲：三個帳號各有一筆分段計時，未列帳時間與人工時間相符', () => {
    const fixtures = [
        { start: 1000, root: 1120, menu: 1350, action: 1500, confirm: 1700, end: 1900 },
        { start: 2000, root: 2500, menu: 2900, action: 3300, confirm: 3900, end: 4500 },
        { start: 3000, root: 3025, menu: 3060, action: 3175, confirm: 3205, end: 5000 },
    ];

    const runFixture = (withTiming) => {
        localStorageMock.resetWrites();
        for (const fixture of fixtures) {
            // 這筆模擬既有流程的狀態寫入，計時本身不得新增寫入。
            Storage.setJSON(CONFIG.KEYS.BG_STATUS, { state: 'running', current: 'fixture', lastUpdate: fixture.start });
            if (withTiming) {
                const timing = buildAccountTimingFields({
                    accountStartedAt: fixture.start,
                    navigationStartedAt: fixture.start,
                    rootAppearedAt: fixture.root,
                    menuOpenedAt: fixture.menu,
                    actionSentAt: fixture.action,
                    confirmationCompletedAt: fixture.confirm,
                    accountEndedAt: fixture.end,
                });
                RuntimeDiagnostics.recordAccountTiming('blocking', timing);
            }
        }
        return localStorageMock.writes;
    };

    const baselineWrites = runFixture(false);
    const redTimingEntries = RuntimeDiagnostics.get().filter(entry => entry.fields?.category === 'account_timing').length;
    assert.equal(redTimingEntries, 0);
    RuntimeDiagnostics.clear();
    localStorageMock.resetWrites();
    const timedWrites = runFixture(true);
    assert.equal(timedWrites, baselineWrites, `storage 寫入數改變：基線=${baselineWrites}，加計時=${timedWrites}`);

    const entries = RuntimeDiagnostics.get().filter(entry => entry.fields?.category === 'account_timing');
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map(entry => TIMING_FIELDS.map(key => entry.fields[key])), [
        [120, 230, 150, 200, 900, 200],
        [500, 400, 400, 600, 2500, 600],
        [25, 35, 115, 30, 2000, 1795],
    ]);
    for (const entry of entries) {
        for (const key of TIMING_FIELDS) assert.equal(Number.isInteger(entry.fields[key]), true, `${key} 必須是整數`);
        const sum = TIMING_FIELDS.slice(0, 4).reduce((total, key) => total + entry.fields[key], 0);
        assert.equal(entry.fields.unaccountedMs, entry.fields.totalMs - sum);
    }

    const serialized = JSON.stringify(entries);
    assert.doesNotMatch(serialized, /username|https?:\/\//);
    console.log(`beta9 甲紅：計時條目=${redTimingEntries} 儲存寫入=${baselineWrites}；甲綠：計時條目=${entries.length} 儲存寫入=${timedWrites}`);
});

test('乙：執行起點把 ring 分成前後兩段，舊條目完整保留', () => {
    const originalNow = Date.now;
    let now = 100000;
    Date.now = () => now;
    try {
        const seedEntries = (withExecutionBoundary) => {
            RuntimeDiagnostics.clear();
            Storage.cache = {};
            for (let index = 0; index < 4; index += 1) {
                RuntimeDiagnostics.record('panel', 'route', {
                    operationId: `panel-old${index}`,
                    active: true,
                    visible: true,
                });
                now += 10;
            }
            RuntimeDiagnostics.persist();
            if (withExecutionBoundary) RuntimeDiagnostics.startExecution('blocking', { strategy: 'same_tab', force: true });
            now += 10;
            for (let index = 0; index < 3; index += 1) {
                RuntimeDiagnostics.record('blocking', 'wait', {
                    operationId: `blocking-new${index}`,
                    waitMs: 20 + index,
                });
                now += 10;
            }
            RuntimeDiagnostics.persist();
            return RuntimeDiagnostics.export();
        };

        const redExport = seedEntries(false);
        assert.equal(redExport.summary.executionBoundary.entriesBeforeLatestStart, 7);
        assert.equal(redExport.summary.executionBoundary.entriesAfterLatestStart, 0);

        const exported = seedEntries(true);
        const executionId = RuntimeDiagnostics.getActiveExecution()?.operationId;
        assert.match(executionId, /^blocking-[a-z0-9]{1,16}$/i);
        const oldRing = Storage.getJSON(CONFIG.KEYS.RUNTIME_DIAGNOSTICS_RING, []);
        assert.equal(oldRing.filter(entry => /^panel-old\d+$/.test(entry.operationId)).length, 4);

        const boundary = exported.summary.executionBoundary;
        assert.equal(boundary.entriesBeforeLatestStart, 4);
        assert.equal(boundary.entriesAfterLatestStart, 3);
        assert.equal(exported.entries.filter(entry => entry.fields?.category === 'execution_start').length, 1);

        const persisted = Storage.getJSON(CONFIG.KEYS.RUNTIME_DIAGNOSTICS_RING, []);
        assert.equal(persisted.filter(entry => /^panel-old\d+$/.test(entry.operationId)).length, 4);
        assert.equal(RuntimeDiagnostics.PERSIST_LIMIT, 400);
        RuntimeDiagnostics.endExecution(executionId);
        console.log(`beta9 乙紅：起點前=${redExport.summary.executionBoundary.entriesBeforeLatestStart} 起點後=${redExport.summary.executionBoundary.entriesAfterLatestStart}；乙綠：起點前=${boundary.entriesBeforeLatestStart} 起點後=${boundary.entriesAfterLatestStart} 舊條目保留=4`);
    } finally {
        Date.now = originalNow;
    }
});

test('執行起點在同一輪只寫一次，跨頁不依賴 sessionId', () => {
    const first = RuntimeDiagnostics.startExecution('blocking', { strategy: 'same_tab', force: true });
    const second = RuntimeDiagnostics.ensureExecution('blocking', { strategy: 'same_tab' });
    assert.equal(second, first);
    assert.equal(RuntimeDiagnostics.get().filter(entry => entry.fields?.category === 'execution_start').length, 1);
    assert.notEqual(first, RuntimeDiagnostics._sessionId);
    RuntimeDiagnostics.endExecution(first);
});
