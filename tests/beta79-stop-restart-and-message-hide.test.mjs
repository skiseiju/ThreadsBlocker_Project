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
globalThis.chrome = { runtime: { id: 'beta79-test' } };
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
const { Core, RuntimeDiagnostics, isMessageRouteContext } = await import('../src/core.js');
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

const messageFixture = (signals = {}) => {
    const rect = () => signals.hidden ? { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 } : { width: 160, height: 80, top: 0, left: 0, bottom: 80, right: 160 };
    const root = { tagName: 'MAIN', getBoundingClientRect: rect, parentElement: null };
    const list = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
    const active = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
    const composer = { tagName: 'TEXTAREA', getBoundingClientRect: rect, parentElement: signals.detached ? root : active };
    const action = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: signals.detached ? root : active };
    active.contains = node => node === active || (!signals.detached && (node === composer || node === action));
    root.contains = node => [root, list, active, composer, action].includes(node);
    root.querySelectorAll = selector => {
        if (/conversation-list|inbox|對話列表/i.test(selector)) return signals.conversationList === false ? [] : [list];
        if (/active-conversation|conversation-pane|role="log"/i.test(selector)) return signals.activeConversation === false ? [] : [active];
        if (/textbox|textarea|contenteditable/i.test(selector)) return signals.composer === false ? [] : [composer];
        if (/toolbar|message-action|send message|傳送訊息/i.test(selector)) return signals.actionArea === false ? [] : [action];
        return [];
    };
    root.querySelector = () => null;
    return { querySelector: () => root };
};

const setStoppingState = ({ requestedAt, updatedAt = Date.now(), heartbeatAt = updatedAt, createdAt = Date.now() }) => {
    const scanId = 'three-no:manual:test-scan';
    const ownerToken = 'three-no:manual:test-scan:owner-token';
    Storage.set(CONFIG.KEYS.THREE_NO_SCAN_LOCK, JSON.stringify({ scanId, token: ownerToken, createdAt }));
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
        scanId,
        ownerToken,
        status: 'stopping',
        updatedAt,
        workerHeartbeatAt: heartbeatAt,
    });
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_COMMAND, {
        command: 'stop',
        scanId,
        ownerToken,
        requestedAt,
    });
};

test.after(() => {
    RuntimeDiagnostics.clear();
});

test('beta79 hides panel on /messages even without shell signals', () => {
    resetState();
    assert.equal(isMessageRouteContext({ pathname: '/messages' }, messageFixture({
        conversationList: false,
        activeConversation: false,
        composer: false,
        actionArea: false,
    })), true);
});

test('beta79 does not hide non-message profile routes without shell signals', () => {
    resetState();
    assert.equal(isMessageRouteContext({ pathname: '/@alice' }, messageFixture({
        conversationList: false,
        activeConversation: false,
        composer: false,
        actionArea: false,
    })), false);
});

test('beta79 startManualScan returns stopping_in_progress during stop grace window', async () => {
    resetState();
    setStoppingState({
        requestedAt: Date.now() - 1000,
    });
    const result = await Core.ThreeNoWatch.startManualScan({});
    assert.equal(result.skipped, 'stopping_in_progress');
    assert.notEqual(result.skipped, 'scan_in_flight');
});

test('beta79 startManualScan clears stale stopping state after grace window', async () => {
    resetState();
    setStoppingState({
        requestedAt: Date.now() - 30000,
        updatedAt: Date.now() - 1000,
        heartbeatAt: Date.now() - 1000,
    });
    const result = await Core.ThreeNoWatch.startManualScan({});
    assert.notEqual(result.skipped, 'stopping_in_progress');
    assert.notEqual(result.skipped, 'scan_in_flight');
});

test('beta79 RuntimeDiagnostics keeps stopping_in_progress reason', () => {
    resetState();
    const previousVersion = CONFIG.VERSION;
    const previousEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;
    CONFIG.VERSION = '2.7.4-beta79';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    try {
        RuntimeDiagnostics.record('three_no', 'error', { reason: 'stopping_in_progress' });
        const entry = RuntimeDiagnostics.get().find(item => item.feature === 'three_no' && item.stage === 'error');
        assert.ok(entry);
        assert.equal(entry.fields.reason, 'stopping_in_progress');
    } finally {
        CONFIG.VERSION = previousVersion;
        CONFIG.ENABLE_BETA_DIAGNOSTICS = previousEnabled;
        RuntimeDiagnostics.clear();
    }
});

console.log('beta79 stop-restart and message-hide contracts: PASS');
