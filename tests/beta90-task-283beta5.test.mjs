import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
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
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static' }),
    close() {},
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta90-fixture', platform: 'test', maxTouchPoints: 0, onLine: true },
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
    addEventListener() {},
};

const {
    CONFIG,
    DIAGNOSTIC_SIGNATURE_MEASUREMENT_FIELDS,
    DIAGNOSTIC_SIGNATURE_STATUS_FIELDS,
    buildDiagnosticStateSignature,
    isDiagnosticMeasurementField,
} = await import('../src/config.js');
const {
    RuntimeDiagnostics,
    recordCheckboxOverlapObservation,
    resetCheckboxOverlapObservation,
} = await import('../src/core.js');
const {
    shouldRecordPanelReposition,
    resetPanelRepositionRecordStateForTest,
} = await import('../src/ui.js');

const resetState = () => {
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = true;
    localStorageMock.clear();
    sessionStorageMock.clear();
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE = 1000;
    resetCheckboxOverlapObservation();
    resetPanelRepositionRecordStateForTest();
};

test.beforeEach(resetState);

test('守門測試：簽章欄位清單排除量測值，dialogCount 只保留有無', () => {
    const overlap = DIAGNOSTIC_SIGNATURE_STATUS_FIELDS.filter(key =>
        DIAGNOSTIC_SIGNATURE_MEASUREMENT_FIELDS.includes(key) || isDiagnosticMeasurementField(key)
    );
    assert.deepEqual(overlap, []);
    for (const key of ['menuItems', 'candidateCount', 'accountRowCount', 'dialogCount', 'elapsedMs', 'repeatCount']) {
        assert.ok(DIAGNOSTIC_SIGNATURE_MEASUREMENT_FIELDS.includes(key), `缺少量測欄位 ${key}`);
    }

    const emptySignature = buildDiagnosticStateSignature({ menuItems: 1, candidateCount: 2, accountRowCount: 3, elapsedMs: 4, repeatCount: 5 });
    assert.equal(emptySignature, '{}');
    assert.equal(buildDiagnosticStateSignature({ futureCount: 7, elapsedMs: 20 }), '{}');
    assert.notEqual(buildDiagnosticStateSignature({ dialogCount: 0 }), buildDiagnosticStateSignature({ dialogCount: 1 }));
    assert.equal(buildDiagnosticStateSignature({ dialogCount: 1 }), buildDiagnosticStateSignature({ dialogCount: 2 }));
});

test('red／green：面板閒置 60 秒的 menuItems 漂移不再製造 reposition 條目', () => {
    const base = {
        found: false, fallback: true, messageRoute: false,
        rectTop: 1226.046875, rectLeft: 1226.046875, rectWidth: 145.953125, rectHeight: 480.25,
        viewportWidth: 1440, viewportHeight: 900,
    };
    const redSignatures = new Set();
    let greenWrites = 0;
    for (let index = 0; index < 60; index += 1) {
        const fields = { ...base, menuItems: 87 + index * 3, candidateCount: index };
        redSignatures.add(JSON.stringify(fields));
        if (shouldRecordPanelReposition(fields)) {
            greenWrites += 1;
            RuntimeDiagnostics.record('panel', 'reposition', fields);
        }
    }
    const entries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'panel' && entry.stage === 'reposition');
    assert.equal(redSignatures.size, 60);
    assert.equal(greenWrites, 1);
    assert.equal(entries.length, 1);

    assert.equal(shouldRecordPanelReposition({ ...base, menuItems: 500, candidateCount: 999 }), false);
    assert.equal(shouldRecordPanelReposition({ ...base, found: true, fallback: false, menuItems: 500 }), true);
    assert.equal(shouldRecordPanelReposition({ ...base, found: true, fallback: false, rectLeft: 700, menuItems: 501 }), true);
    console.log(`beta5 panel/reposition: red=${redSignatures.size} green=${entries.length}`);
});

test('red／green：selection/layout 的 accountRowCount 漂移只留狀態變化', () => {
    const redSignatures = new Set();
    for (let index = 0; index < 60; index += 1) {
        const fields = {
            path: 'dialog_injection', ctxIsRoleDialog: true, ctxVisible: true, isMessageRoute: false,
            dialogCount: 25 + index, accountRowCount: 25 + index, didInject: false,
            followButtonPresent: true, repositioned: false,
        };
        redSignatures.add(JSON.stringify(fields));
        recordCheckboxOverlapObservation(fields);
    }
    const steadyEntries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection' && entry.stage === 'layout');
    assert.equal(redSignatures.size, 60);
    assert.equal(steadyEntries.length, 1);

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
    assert.equal(changedEntries[0].fields.dialogCount, 25);
    assert.equal(changedEntries[0].fields.accountRowCount, 25);
    assert.equal(changedEntries[1].fields.didInject, true);
    assert.equal(changedEntries[2].fields.dialogCount, 0);
    console.log(`beta5 selection/layout: red=${redSignatures.size} green=${steadyEntries.length} changed=${changedEntries.length}`);
});

console.log('beta5 diagnostics contract: shared state signature / measurement exclusion / reduced dialog presence');
