import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticsEnabled, diagnosticsSkipReason } from './helpers/diagnostics-gate.mjs';

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
        reload: () => {},
    },
    close: () => {},
    open: () => null,
    innerWidth: 1280,
    innerHeight: 720,
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
globalThis.KeyboardEvent = class KeyboardEvent {
    constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
    }
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core, RuntimeDiagnostics, isMessageRouteContext } = await import('../src/core.js');
const { shouldRecordPanelReposition, resetPanelRepositionRecordStateForTest } = await import('../src/ui.js');
await import('../src/features/three-no-watch.js');

const resetState = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    resetPanelRepositionRecordStateForTest();
    windowMock.location.href = 'https://www.threads.com/';
    windowMock.location.pathname = '/';
    windowMock.location.search = '';
};

const lastDebugRow = (scanId = '') => Core.ThreeNoWatch.getScanDebugLog(scanId).at(-1) || null;
const createPanelRepositionFields = (overrides = {}) => ({
    found: true,
    fallback: false,
    messageRoute: false,
    rectTop: 100,
    rectLeft: 20,
    rectWidth: 30,
    rectHeight: 40,
    viewportWidth: 1200,
    viewportHeight: 700,
    menuItems: 12,
    candidateCount: 3,
    ...overrides,
});

const messageShellFixture = () => {
    const rect = () => ({ width: 160, height: 80, top: 0, left: 0, bottom: 80, right: 160 });
    const root = { tagName: 'MAIN', getBoundingClientRect: rect, parentElement: null };
    const list = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
    const active = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
    const composer = { tagName: 'TEXTAREA', getBoundingClientRect: rect, parentElement: active };
    const action = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: active };
    active.contains = node => [active, composer, action].includes(node);
    root.contains = node => [root, list, active, composer, action].includes(node);
    root.querySelectorAll = selector => {
        if (/conversation-list|inbox|對話列表/i.test(selector)) return [list];
        if (/active-conversation|conversation-pane|role="log"/i.test(selector)) return [active];
        if (/textbox|textarea|contenteditable/i.test(selector)) return [composer];
        if (/toolbar|message-action|send message|傳送訊息/i.test(selector)) return [action];
        return [];
    };
    root.querySelector = () => null;
    return { querySelector: () => root };
};

test.after(() => {
    RuntimeDiagnostics.clear();
});

test('beta78 appendScanDebugLog probe is privacy-safe for new stop-gate entries', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, () => {
    resetState();
    Core.ThreeNoWatch.appendScanDebugLog({
        scanId: 'privacy-probe',
        status: 'scanning',
        debug: {
            step: 'stop_rejected_not_owned',
            username: 'someone',
            url: 'https://x/@someone',
        },
    });
    const probeRows = Core.ThreeNoWatch.getScanDebugLog('privacy-probe');
    assert.equal(probeRows.length, 1);
    const probeLeaksSomeone = probeRows.some(row => JSON.stringify(row.debug || {}).includes('someone'));
    if (!probeLeaksSomeone) {
        assert.equal(probeLeaksSomeone, false);
        return;
    }

    resetState();
    assert.equal(Core.ThreeNoWatch.requestStop(), false);
    const row = lastDebugRow();
    assert.ok(row);
    assert.equal(row.step, 'stop_rejected_missing_ids');
    assert.equal(JSON.stringify(row.debug || {}).includes('someone'), false);
    assert.deepEqual(Object.keys(row.debug || {}), ['step']);
});

test('beta78 requestStop missing ids stays false and records stop_rejected_missing_ids', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, () => {
    resetState();
    const result = Core.ThreeNoWatch.requestStop();
    assert.equal(result, false);
    const row = lastDebugRow();
    assert.ok(row);
    assert.equal(row.step, 'stop_rejected_missing_ids');
});

test('beta78 finishScan terminal guard stays false and records finish_rejected_early_terminal', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, async () => {
    resetState();
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
        scanId: 'finish-terminal',
        ownerToken: 'owner-token',
        status: 'completed',
    });
    const result = await Core.ThreeNoWatch.finishScan({
        scanId: 'finish-terminal',
        ownerToken: 'owner-token',
        status: 'completed',
    });
    assert.equal(result, false);
    const row = lastDebugRow('finish-terminal');
    assert.ok(row);
    assert.equal(row.step, 'finish_rejected_early_terminal');
});

test('beta78 panel reposition allowlist keeps geometry, route and counter fields', () => {
    resetState();
    const previousVersion = CONFIG.VERSION;
    const previousEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;
    CONFIG.VERSION = '2.7.4-beta78';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    try {
        RuntimeDiagnostics.record('panel', 'reposition', {
            rectTop: 10,
            rectLeft: 20,
            rectWidth: 30,
            rectHeight: 40,
            viewportWidth: 1200,
            viewportHeight: 700,
            menuItems: 12,
            candidateCount: 3,
            found: true,
            fallback: false,
            messageRoute: true,
        });
        const entry = RuntimeDiagnostics.get().find(item => item.feature === 'panel');
        assert.ok(entry);
        for (const key of ['rectTop', 'rectLeft', 'rectWidth', 'rectHeight', 'viewportWidth', 'viewportHeight', 'menuItems', 'candidateCount', 'found', 'fallback', 'messageRoute']) {
            assert.ok(Object.hasOwn(entry.fields, key), `${key} must survive RuntimeDiagnostics allowlist`);
        }
    } finally {
        CONFIG.VERSION = previousVersion;
        CONFIG.ENABLE_BETA_DIAGNOSTICS = previousEnabled;
        RuntimeDiagnostics.clear();
    }
});

test('beta78 panel stage allowlist preserves reposition, clamp, hide and show without unknown fallback', () => {
    resetState();
    const previousVersion = CONFIG.VERSION;
    const previousEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;
    CONFIG.VERSION = '2.7.4-beta78';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    try {
        RuntimeDiagnostics.record('panel', 'reposition', { repositioned: true });
        RuntimeDiagnostics.record('panel', 'clamp', { clamped: true });
        RuntimeDiagnostics.record('panel', 'hide', { hidden: true, active: false });
        RuntimeDiagnostics.record('panel', 'show', { hidden: false, visible: true, active: true });
        const entries = RuntimeDiagnostics.get().filter(item => item.feature === 'panel');
        assert.equal(entries.length, 4);
        assert.deepEqual(entries.map(item => item.stage), ['reposition', 'clamp', 'hide', 'show']);
        assert.equal(entries.some(item => item.stage === 'unknown'), false);
    } finally {
        CONFIG.VERSION = previousVersion;
        CONFIG.ENABLE_BETA_DIAGNOSTICS = previousEnabled;
        RuntimeDiagnostics.clear();
    }
});

test('beta78 shouldRecordPanelReposition only records the first identical payload', () => {
    resetState();
    const fields = createPanelRepositionFields();
    assert.equal(shouldRecordPanelReposition(fields), true);
    assert.equal(shouldRecordPanelReposition(fields), false);
    assert.equal(shouldRecordPanelReposition(fields), false);
});

test('beta78 shouldRecordPanelReposition records a changed rectTop signature', () => {
    resetState();
    assert.equal(shouldRecordPanelReposition(createPanelRepositionFields({ rectTop: 100 })), true);
    assert.equal(shouldRecordPanelReposition(createPanelRepositionFields({ rectTop: 250 })), true);
});

test('beta78 shouldRecordPanelReposition ignores subpixel rectTop jitter after rounding', () => {
    resetState();
    assert.equal(shouldRecordPanelReposition(createPanelRepositionFields({ rectTop: 100 })), true);
    assert.equal(shouldRecordPanelReposition(createPanelRepositionFields({ rectTop: 100.3 })), false);
});

test('beta78 shouldRecordPanelReposition enforces a 30-entry hard limit for unique payloads', () => {
    resetState();
    let recordedCount = 0;
    for (let index = 0; index < 40; index += 1) {
        const didRecord = shouldRecordPanelReposition(createPanelRepositionFields({
            rectTop: index * 10,
            rectLeft: index,
            menuItems: index + 1,
            candidateCount: index + 2,
        }));
        if (didRecord) recordedCount += 1;
    }
    assert.ok(recordedCount <= 30, `recordedCount must stay <= 30, got ${recordedCount}`);
});

test('beta78 isMessageRouteContext path contract stays message-only', () => {
    resetState();
    const shell = messageShellFixture();
    assert.equal(isMessageRouteContext({ pathname: '/messages' }, shell), true);
    assert.equal(isMessageRouteContext({ pathname: '/messages/t/123' }, shell), true);
    assert.equal(isMessageRouteContext({ pathname: '/direct' }, shell), true);
    assert.equal(isMessageRouteContext({ pathname: '/inbox' }, shell), true);
    assert.equal(isMessageRouteContext({ pathname: '/@someone' }, null), false);
    assert.equal(isMessageRouteContext({ pathname: '/' }, null), false);
});

console.log('beta78 diagnostics contract: stop/finish gates, panel allowlist, message-route path gate');
