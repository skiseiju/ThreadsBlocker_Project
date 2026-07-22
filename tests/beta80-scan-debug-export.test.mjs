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

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core, RuntimeDiagnostics, projectScanDebugLogForExport } = await import('../src/core.js');

const originalVersion = CONFIG.VERSION;
const originalEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;

const resetState = () => {
    localStorage.clear();
    sessionStorage.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = '2.7.4-beta80';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
};

const deepFreeze = (value) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    return value;
};

const buildRow = (overrides = {}) => ({
    seq: 1,
    ts: 10,
    scanElapsedMs: 20,
    index: 0,
    status: 'stopping',
    step: 'worker_close_called',
    ...overrides,
});

test.beforeEach(() => {
    resetState();
});

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalEnabled;
    RuntimeDiagnostics.clear();
});

test('beta80 privacy guard strips usernames urls and raw state from projected scan debug export', () => {
    const projected = projectScanDebugLogForExport([
        buildRow({
            current: 'someone',
            url: 'https://threads.net/@someone',
            debug: { username: 'someone', step: 'x' },
            scanId: 'three-no:2026-07-22:123',
            extra: 'secret',
        }),
    ]);
    assert.equal(projected.length, 1);
    assert.equal(Object.hasOwn(projected[0], 'current'), false);
    assert.equal(Object.hasOwn(projected[0], 'url'), false);
    assert.equal(Object.hasOwn(projected[0], 'debug'), false);
    assert.equal(Object.hasOwn(projected[0], 'scanId'), false);
    const serialized = JSON.stringify(projected);
    assert.doesNotMatch(serialized, /someone/);
    assert.doesNotMatch(serialized, /threads\.net/);
});

test('beta80 projection keeps only the six allowlisted keys', () => {
    const projected = projectScanDebugLogForExport([
        buildRow({
            rogue: 'value',
            another: 123,
        }),
    ]);
    assert.deepEqual(Object.keys(projected[0]).sort(), ['index', 'scanElapsedMs', 'seq', 'status', 'step', 'ts']);
});

test('beta80 projection drops rows without a valid step', () => {
    const projected = projectScanDebugLogForExport([
        buildRow({ step: '' }),
        buildRow({ ts: 20, step: 'worker_close_called' }),
        buildRow({ ts: 30, step: 'bad-step' }),
    ]);
    assert.deepEqual(projected.map(row => row.ts), [20]);
});

test('beta80 projection sorts by ts and keeps only the last limit rows', () => {
    const projected = projectScanDebugLogForExport([
        buildRow({ ts: 40, seq: 4 }),
        buildRow({ ts: 10, seq: 1 }),
        buildRow({ ts: 30, seq: 3 }),
        buildRow({ ts: 20, seq: 2 }),
    ], 2);
    assert.deepEqual(projected.map(row => row.ts), [30, 40]);
    assert.deepEqual(projected.map(row => row.seq), [3, 4]);
});

test('beta80 projection is pure and does not mutate the input rows', () => {
    const rows = deepFreeze([
        buildRow({
            seq: 1.9,
            ts: 22.8,
            scanElapsedMs: '19',
            index: 3.4,
            debug: { username: 'someone' },
        }),
    ]);
    const before = JSON.stringify(rows);
    const projected = projectScanDebugLogForExport(rows);
    assert.equal(JSON.stringify(rows), before);
    assert.notStrictEqual(projected, rows);
    assert.deepEqual(projected, [{
        seq: 1,
        ts: 22,
        scanElapsedMs: 19,
        index: 3,
        status: 'stopping',
        step: 'worker_close_called',
    }]);
});

test('beta80 projection returns an empty array for illegal inputs without throwing', () => {
    for (const value of [null, 'rows', { step: 'worker_close_called' }]) {
        assert.doesNotThrow(() => projectScanDebugLogForExport(value));
        assert.deepEqual(projectScanDebugLogForExport(value), []);
    }
});

test('beta80 buildThreeNoDebugExport attaches the projected scan debug log', () => {
    const rows = [
        buildRow({
            current: 'someone',
            url: 'https://threads.net/@someone',
            debug: { username: 'someone' },
            scanId: 'three-no:2026-07-22:123',
        }),
    ];
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_DEBUG_LOG, rows);
    const payload = Core.buildThreeNoDebugExport();
    assert.ok(payload && typeof payload === 'object');
    assert.ok(Array.isArray(payload.scanDebugLog));
    assert.deepEqual(payload.scanDebugLog, projectScanDebugLogForExport(rows));
});

console.log('beta80 scan debug export diagnostics: PASS');
