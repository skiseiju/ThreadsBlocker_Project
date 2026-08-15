import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const createStorageArea = () => {
    const values = new Map();
    return {
        getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: key => values.delete(String(key)),
        clear: () => values.clear(),
    };
};

const eventTarget = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
};
const locationMock = {
    href: 'https://www.threads.com/home',
    origin: 'https://www.threads.com',
    pathname: '/home',
    search: '',
    hash: '',
    reload() {},
    assign() {},
};
const windowMock = {
    ...eventTarget,
    location: locationMock,
    innerWidth: 1440,
    innerHeight: 900,
    outerWidth: 1440,
    outerHeight: 900,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    open: () => null,
    close() {},
};

globalThis.window = windowMock;
globalThis.location = locationMock;
globalThis.localStorage = createStorageArea();
globalThis.sessionStorage = createStorageArea();
globalThis.history = { replaceState() {} };
globalThis.CSS = { escape: value => String(value) };
globalThis.document = {
    ...eventTarget,
    hidden: false,
    title: '',
    body: {
        appendChild() {},
        addEventListener() {},
        removeEventListener() {},
        innerText: '',
        textContent: '',
    },
    documentElement: { appendChild() {} },
    defaultView: windowMock,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, contains: () => false },
        appendChild() {},
        remove() {},
        setAttribute() {},
    }),
};
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta30-fixture', platform: 'test', maxTouchPoints: 0, onLine: true },
});

const {
    CONFIG,
    BLOCK_RING_RETENTION_MS,
    DIAGNOSTIC_SIGNATURE_MEASUREMENT_FIELDS,
    DIAGNOSTIC_SIGNATURE_STATUS_FIELDS,
    buildDiagnosticStateSignature,
    isDiagnosticMeasurementField,
} = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const {
    Core,
    RuntimeDiagnostics,
    recordCheckboxOverlapObservation,
    resetCheckboxOverlapObservation,
} = await import('../src/core.js');
const {
    shouldRecordPanelReposition,
    resetPanelRepositionRecordStateForTest,
} = await import('../src/ui.js');

const resetDiagnostics = () => {
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE = 1000;
    resetCheckboxOverlapObservation();
    resetPanelRepositionRecordStateForTest();
    Storage.cache = {};
    Storage.sessionCache = {};
    localStorage.clear();
    sessionStorage.clear();
};

test.beforeEach(resetDiagnostics);

test('beta30 量測欄位只留在 fields，漂移不會進簽章', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta35');
    for (const key of ['menuItems', 'candidateCount', 'accountRowCount', 'dialogCount']) {
        assert.ok(DIAGNOSTIC_SIGNATURE_MEASUREMENT_FIELDS.includes(key), `缺少量測欄位 ${key}`);
        assert.equal(isDiagnosticMeasurementField(key), true);
        assert.equal(DIAGNOSTIC_SIGNATURE_STATUS_FIELDS.includes(key), false, `${key} 不得是狀態欄位`);
    }

    assert.equal(buildDiagnosticStateSignature({
        menuItems: 1,
        candidateCount: 2,
        accountRowCount: 3,
        dialogCount: 5,
        elapsedMs: 6,
    }), '{"dialogPresent":true}');
    assert.equal(buildDiagnosticStateSignature({ rectTop: 12.1 }), buildDiagnosticStateSignature({ rectTop: 12.4 }));
    assert.notEqual(buildDiagnosticStateSignature({ rectTop: 12.1 }), buildDiagnosticStateSignature({ rectTop: 13.1 }));
    assert.equal(buildDiagnosticStateSignature({ dialogCount: 1 }), buildDiagnosticStateSignature({ dialogCount: 2 }));
    assert.notEqual(buildDiagnosticStateSignature({ dialogCount: 0 }), buildDiagnosticStateSignature({ dialogCount: 1 }));
});

test('beta30 panel reposition 只對真正狀態變化寫入', () => {
    const base = {
        found: false,
        fallback: true,
        messageRoute: false,
        rectTop: 1226.046875,
        rectLeft: 145.953125,
        rectWidth: 300.25,
        rectHeight: 480.25,
        viewportWidth: 1440,
        viewportHeight: 900,
    };
    let acceptedCount = 0;
    for (let index = 0; index < 60; index += 1) {
        const fields = {
            ...base,
            menuItems: 87 + index * 3,
            candidateCount: index,
        };
        const accepted = shouldRecordPanelReposition(fields);
        assert.equal(accepted, index === 0);
        if (accepted) {
            acceptedCount += 1;
            RuntimeDiagnostics.record('panel', 'reposition', fields);
        }
    }
    assert.equal(acceptedCount, 1);
    assert.equal(RuntimeDiagnostics.get().filter(entry => entry.feature === 'panel').length, 1);

    assert.equal(shouldRecordPanelReposition({ ...base, found: true, fallback: false, menuItems: 500 }), true);
    assert.equal(shouldRecordPanelReposition({ ...base, found: true, fallback: false, rectLeft: 700, menuItems: 501 }), true);
    assert.equal(shouldRecordPanelReposition({ ...base, found: true, fallback: false, messageRoute: true, menuItems: 502 }), true);
});

test('beta30 selection/layout accountRowCount 漂移只留狀態變化', () => {
    for (let index = 0; index < 60; index += 1) {
        recordCheckboxOverlapObservation({
            path: 'dialog_injection',
            ctxIsRoleDialog: true,
            ctxVisible: true,
            isMessageRoute: false,
            dialogCount: 25 + index,
            accountRowCount: 25 + index,
            didInject: false,
            followButtonPresent: true,
            repositioned: false,
        });
    }
    const steadyEntries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection' && entry.stage === 'layout');
    assert.equal(steadyEntries.length, 1);
    assert.equal(steadyEntries[0].fields.accountRowCount, 25);
    assert.equal(steadyEntries[0].fields.dialogCount, 25);

    recordCheckboxOverlapObservation({
        path: 'dialog_injection', ctxIsRoleDialog: true, ctxVisible: true, isMessageRoute: false,
        dialogCount: 1, accountRowCount: 1, didInject: true, followButtonPresent: true, repositioned: false,
    });
    recordCheckboxOverlapObservation({
        path: 'dialog_injection', ctxIsRoleDialog: true, ctxVisible: false, isMessageRoute: false,
        dialogCount: 0, accountRowCount: 1, didInject: true, followButtonPresent: false, repositioned: true,
    });
    const changedEntries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection' && entry.stage === 'layout');
    assert.equal(changedEntries.length, 3);
    assert.equal(changedEntries[1].fields.didInject, true);
    assert.equal(changedEntries[2].fields.dialogCount, 0);
    assert.equal(changedEntries[2].fields.repositioned, true);
});

test('beta30 block/report ring 共用 config retention，debug context TTL 維持獨立', async () => {
    assert.equal(BLOCK_RING_RETENTION_MS, 48 * 60 * 60 * 1000);
    assert.equal(CONFIG.BLOCK_RING_RETENTION_MS, BLOCK_RING_RETENTION_MS);

    const [storageSource, debugContextSource] = await Promise.all([
        readFile(new URL('../src/storage.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/report-debug-context.js', import.meta.url), 'utf8'),
    ]);
    assert.match(storageSource, /import \{ BLOCK_RING_RETENTION_MS,/);
    assert.equal((storageSource.match(/BLOCK_RING_RETENTION_MS/g) || []).length, 5);
    assert.doesNotMatch(storageSource, /48 \* 60/);
    assert.match(debugContextSource, /TTL_MS: 48 \* 60 \* 60 \* 1000/);

    const originalNow = Date.now;
    const now = 10_000_000;
    Date.now = () => now;
    try {
        Storage.setJSON(CONFIG.KEYS.REPORT_TIMESTAMPS_RING, [
            now - BLOCK_RING_RETENTION_MS - 1,
            now - BLOCK_RING_RETENTION_MS + 1,
            now - 23 * 60 * 60 * 1000,
        ]);
        assert.equal(Storage.getReportsLast24h(), 1);
        assert.deepEqual(Storage.getJSON(CONFIG.KEYS.REPORT_TIMESTAMPS_RING, []), [
            now - BLOCK_RING_RETENTION_MS + 1,
            now - 23 * 60 * 60 * 1000,
        ]);
    } finally {
        Date.now = originalNow;
    }
});

test.after(() => {
    RuntimeDiagnostics.clear();
    Core.resetCheckboxOverlapObservation?.();
});

console.log('beta30 signature dedup and ring retention: PASS');
