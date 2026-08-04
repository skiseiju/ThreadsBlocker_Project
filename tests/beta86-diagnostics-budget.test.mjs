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
const listeners = new Map();
const addListener = (type, listener) => {
    const entries = listeners.get(type) || [];
    entries.push(listener);
    listeners.set(type, entries);
};
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
    screen: { availWidth: 1600, availHeight: 1000 },
    addEventListener: addListener,
    removeEventListener() {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static' }),
    close() {},
};
let panelRect = { left: 10, top: 20, width: 300, height: 500 };
const panel = {
    dataset: {},
    hidden: false,
    style: {},
    setAttribute() {},
    getBoundingClientRect: () => panelRect,
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta86-test', platform: 'test', maxTouchPoints: 0, onLine: true },
});
globalThis.CSS = { escape: value => String(value) };
globalThis.BroadcastChannel = class { postMessage() {} close() {} };
globalThis.document = {
    hidden: false,
    title: '',
    body: { appendChild() {}, addEventListener() {} },
    documentElement: { appendChild() {} },
    defaultView: windowMock,
    getElementById: id => id === 'hege-panel' ? panel : null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, remove() {}, appendChild() {} }),
    addEventListener() {},
};
globalThis.history = { replaceState() {} };

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { UI } = await import('../src/ui.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const { Worker } = await import('../src/worker.js');

const originalVersion = CONFIG.VERSION;
const originalRuntime = CONFIG.ENABLE_RUNTIME_DIAGNOSTICS;
const originalCreateStatusUI = Worker.createStatusUI;
const originalEnforceWindowBounds = Worker.enforceWindowBounds;
const originalAnchorPanel = UI.anchorPanel;

test.beforeEach(() => {
    CONFIG.VERSION = '2.8.3-beta1';
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = true;
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics._entries = [];
    RuntimeDiagnostics._lastBySignature.clear();
    RuntimeDiagnostics._operations.clear();
    Core._panelRouteDiagnosticState = null;
    panel.dataset = {};
    panel.hidden = false;
    panelRect = { left: 10, top: 20, width: 300, height: 500 };
    windowMock.location.pathname = '/home';
    windowMock.location.href = 'https://www.threads.com/home';
    listeners.clear();
    Worker._diagnosticOperationId = null;
    Worker._diagnosticPersistAt = 0;
    Worker._stepRunning = false;
    UI.anchorPanel = () => {};
});

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = originalRuntime;
    Worker.createStatusUI = originalCreateStatusUI;
    Worker.enforceWindowBounds = originalEnforceWindowBounds;
    UI.anchorPanel = originalAnchorPanel;
    RuntimeDiagnostics.clear();
});

test('閒置面板與路由診斷只記錄初始狀態，真正變化仍會留下線索', () => {
    const originalNow = Date.now;
    let now = 100000;
    Date.now = () => now;
    try {
        for (let index = 0; index < 40; index += 1) {
            Core.updatePanelRouteVisibility();
            now += 1600;
        }
        const steady = RuntimeDiagnostics.get();
        assert.equal(steady.filter(entry => entry.feature === 'panel').length, 1);
        assert.equal(steady.filter(entry => entry.feature === 'message_route').length, 1);

        windowMock.location.pathname = '/messages/123';
        Core.updatePanelRouteVisibility();
        assert.ok(RuntimeDiagnostics.get().some(entry => entry.feature === 'panel' && entry.stage === 'hide'));

        windowMock.location.pathname = '/home';
        Core.updatePanelRouteVisibility();
        assert.ok(RuntimeDiagnostics.get().some(entry => entry.feature === 'panel' && entry.stage === 'show'));
        assert.ok(RuntimeDiagnostics.get().some(entry => entry.feature === 'panel' && entry.stage === 'reposition'));
    } finally {
        Date.now = originalNow;
    }
});

test('輕量診斷先保留 blocking start 與 terminal，再補最近普通紀錄', () => {
    const originalNow = Date.now;
    let now = 200000;
    Date.now = () => now;
    try {
        RuntimeDiagnostics.record('blocking', 'start', { operationId: 'blocking-greenstart' });
        now += 1600;
        RuntimeDiagnostics.record('blocking', 'terminal', { operationId: 'blocking-greenterminal', terminal: true });
        for (let index = 0; index < 198; index += 1) {
            now += 1600;
            RuntimeDiagnostics.record('panel', 'route', {
                operationId: `panel-${index}`,
                hidden: false,
                active: true,
                visible: true,
                routeMatch: false,
                rectLeft: index,
            });
        }
        const light = Core.buildLightweightDiagnostics();
        const entries = light.runtimeDiagnostics?.entries || [];
        assert.equal(entries.length, Core.LIGHTWEIGHT_ENTRY_LIMIT);
        assert.deepEqual(entries.filter(entry => entry.feature === 'blocking').map(entry => entry.stage), ['start', 'terminal']);
        assert.ok(JSON.stringify(light).length <= 40000);
    } finally {
        Date.now = originalNow;
    }
});

test('Worker 啟動後沒有帳號也會落盤，主視窗可匯出 start', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    Worker.createStatusUI = () => {};
    Worker.enforceWindowBounds = () => false;
    globalThis.setTimeout = () => 1;
    try {
        await Worker.init();
        assert.ok(RuntimeDiagnostics.get().some(entry => entry.feature === 'blocking' && entry.stage === 'start'));
        const persistedBeforeClose = JSON.parse(localStorageMock.getItem(CONFIG.KEYS.RUNTIME_DIAGNOSTICS_RING) || '[]');
        assert.ok(persistedBeforeClose.some(entry => entry.feature === 'blocking' && entry.stage === 'start'));

        const beforeUnload = (listeners.get('beforeunload') || [])[0];
        beforeUnload?.();
        RuntimeDiagnostics._entries = [];
        RuntimeDiagnostics._lastBySignature.clear();
        RuntimeDiagnostics._operations.clear();
        const exported = RuntimeDiagnostics.export();
        assert.ok(exported.entries.some(entry => entry.feature === 'blocking' && entry.stage === 'start'));
    } finally {
        globalThis.setTimeout = originalSetTimeout;
    }
});

test('四層分級保留第 30 個帳號的 failure，且同 operationId 的上下文先於普通紀錄', () => {
    const originalNow = Date.now;
    const originalRateLimit = RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE;
    let now = 400000;
    Date.now = () => now;
    RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE = 1000;
    try {
        for (let index = 1; index <= 100; index += 1) {
            const operationId = `blocking-a${index}`;
            RuntimeDiagnostics.record('blocking', 'start', { operationId });
            now += 1600;
            RuntimeDiagnostics.record('blocking', 'finish', { operationId, terminal: true, ok: true });
            if (index === 30) {
                now += 1;
                RuntimeDiagnostics.record('blocking', 'failure', {
                    operationId, reason: 'failure', failure: true, retryCount: 1,
                });
            }
            now += 1600;
        }

        const light = Core.buildLightweightDiagnostics();
        const entries = light.runtimeDiagnostics?.entries || [];
        const failure = entries.find(entry => entry.operationId === 'blocking-a30' && entry.stage === 'failure');
        const context = entries.filter(entry => entry.operationId === 'blocking-a30' && entry.stage !== 'failure');
        assert.equal(entries.length, Core.LIGHTWEIGHT_ENTRY_LIMIT);
        assert.ok(failure);
        assert.equal(failure.priority, 4);
        assert.equal(entries.filter(entry => entry.priority > 0).length, Core.LIGHTWEIGHT_ENTRY_LIMIT);
        assert.ok(context.length >= 1);
    } finally {
        RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE = originalRateLimit;
        Date.now = originalNow;
    }
});

test('輕量層有額度時先補 critical operationId 的舊上下文', () => {
    const originalNow = Date.now;
    const originalRateLimit = RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE;
    let now = 450000;
    Date.now = () => now;
    RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE = 1000;
    try {
        RuntimeDiagnostics.record('blocking', 'failure', {
            operationId: 'blocking-context', reason: 'failure', failure: true,
        });
        now += 1600;
        RuntimeDiagnostics.record('blocking', 'dequeue', {
            operationId: 'blocking-context', queueCount: 1,
        });
        for (let index = 0; index < 150; index += 1) {
            now += 1600;
            RuntimeDiagnostics.record('panel', 'route', {
                operationId: `panel-c${index}`, hidden: false, active: true, rectLeft: index,
            });
        }
        const entries = Core.buildLightweightDiagnostics().runtimeDiagnostics?.entries || [];
        const contextIndex = entries.findIndex(entry => entry.operationId === 'blocking-context' && entry.stage === 'dequeue');
        const recentPanelIndex = entries.findIndex(entry => entry.feature === 'panel' && entry.fields.rectLeft === 149);
        assert.ok(contextIndex >= 0);
        assert.ok(recentPanelIndex >= 0);
        assert.ok(contextIndex < recentPanelIndex);
        assert.equal(entries.filter(entry => entry.operationId === 'blocking-context').length, 2);
    } finally {
        RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE = originalRateLimit;
        Date.now = originalNow;
    }
});

test('一般診斷同 feature 與 stage 每分鐘最多寫入 22 筆，失敗不受限且時間窗會滑動', () => {
    const originalNow = Date.now;
    let now = 500000;
    Date.now = () => now;
    try {
        for (let index = 0; index < 1000; index += 1) {
            RuntimeDiagnostics.record('three_no', 'scroll', {
                operationId: 'three_no-r2scan', scrollCount: index, progress: true,
            });
            now += 60;
        }
        const scrollEntries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'three_no' && entry.stage === 'scroll');
        assert.equal(scrollEntries.length, RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE);
        assert.ok(scrollEntries.at(-1).coalesced);
        assert.ok(scrollEntries.at(-1).fields.repeatCount > 1);

        for (let index = 0; index < 25; index += 1) {
            RuntimeDiagnostics.record('blocking', 'failure', {
                operationId: `blocking-f${index}`, reason: 'failure', failure: true, retryCount: index,
            });
        }
        assert.equal(RuntimeDiagnostics.get().filter(entry => entry.feature === 'blocking' && entry.stage === 'failure').length, 25);

        now += RuntimeDiagnostics.RATE_WINDOW_MS + 1;
        RuntimeDiagnostics.record('three_no', 'scroll', {
            operationId: 'three_no-r2scan', scrollCount: 1000, progress: true,
        });
        assert.equal(RuntimeDiagnostics.get().filter(entry => entry.feature === 'three_no' && entry.stage === 'scroll').length, RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE + 1);
    } finally {
        Date.now = originalNow;
    }
});
