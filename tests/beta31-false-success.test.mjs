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
const locationMock = {
    pathname: '/@fixture_user/replies',
    search: '?hege_bg=true',
    hash: '',
    href: 'https://threads.net/@fixture_user/replies?hege_bg=true',
    origin: 'https://threads.net',
    reload() {},
};
const eventTarget = {
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
};

globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.location = locationMock;
globalThis.history = { replaceState() {} };
globalThis.window = {
    ...eventTarget,
    location: locationMock,
    hegeLog: null,
    innerWidth: 1200,
    innerHeight: 900,
    outerWidth: 1200,
    outerHeight: 900,
    devicePixelRatio: 1,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    open: () => null,
    close() {},
};
globalThis.document = {
    ...eventTarget,
    title: '',
    body: {
        innerText: '',
        textContent: '',
        appendChild() {},
        addEventListener() {},
        removeEventListener() {},
    },
    documentElement: { appendChild() {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    createElement: () => ({
        style: {},
        dataset: {},
        classList: { add() {}, remove() {}, contains: () => false },
        appendChild() {},
        remove() {},
        setAttribute() {},
    }),
};
globalThis.Event = class Event {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
};
globalThis.KeyboardEvent = class KeyboardEvent extends Event {};
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0,
        language: 'zh-TW',
        onLine: true,
    },
});

const { CONFIG, DIAGNOSTIC_SIGNATURE_STATUS_FIELDS } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const { Worker } = await import('../src/worker.js');

const originalMutationObserver = globalThis.MutationObserver;
const activeObservers = [];

class TestMutationObserver {
    constructor(callback) {
        this.callback = callback;
        this.observeArgs = null;
        this.disconnectCalls = 0;
        activeObservers.push(this);
    }

    observe(target, options) {
        this.observeArgs = { target, options };
    }

    disconnect() {
        this.disconnectCalls += 1;
    }

    trigger() {
        this.callback([]);
    }
}

const originalWorkerFixture = {
    pollUntil: Utils.pollUntil,
    waitForElementRemoval: Utils.waitForElementRemoval,
    safeSleep: Utils.safeSleep,
    speedSleep: Utils.speedSleep,
    simClick: Utils.simClick,
    isMobile: Utils.isMobile,
    resolveProfileRootWithRetry: Worker.resolveProfileRootWithRetry,
    findMoreButton: Worker.findMoreButton,
    blockVisualStep: Worker.blockVisualStep,
    updateStatus: Worker.updateStatus,
    recordSafetyDiagnostic: Worker.recordSafetyDiagnostic,
    findProfileRoot: Core.findProfileRoot,
};

const resetStorage = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    locationMock.pathname = '/@fixture_user/replies';
    locationMock.search = '?hege_bg=true';
    locationMock.href = 'https://threads.net/@fixture_user/replies?hege_bg=true';
    document.body.innerText = '';
    document.body.textContent = '';
    window.hegeLog = null;
    Worker._accountNavigationStartedAt = null;
    Worker._diagnosticOperationId = null;
    Worker._diagnosticOperationFeature = 'blocking';
    Worker.stats = { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: 0 };
};

const restoreWorkerFixture = () => {
    Utils.pollUntil = originalWorkerFixture.pollUntil;
    Utils.waitForElementRemoval = originalWorkerFixture.waitForElementRemoval;
    Utils.safeSleep = originalWorkerFixture.safeSleep;
    Utils.speedSleep = originalWorkerFixture.speedSleep;
    Utils.simClick = originalWorkerFixture.simClick;
    Utils.isMobile = originalWorkerFixture.isMobile;
    Worker.resolveProfileRootWithRetry = originalWorkerFixture.resolveProfileRootWithRetry;
    Worker.findMoreButton = originalWorkerFixture.findMoreButton;
    Worker.blockVisualStep = originalWorkerFixture.blockVisualStep;
    Worker.updateStatus = originalWorkerFixture.updateStatus;
    Worker.recordSafetyDiagnostic = originalWorkerFixture.recordSafetyDiagnostic;
    Core.findProfileRoot = originalWorkerFixture.findProfileRoot;
};

test.after(() => {
    restoreWorkerFixture();
    if (originalMutationObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = originalMutationObserver;
});

test('beta31 A：限流視窗換裝時 waitForElementRemoval 回 cooldown，不被確認框卸載搶先判成功', async () => {
    activeObservers.length = 0;
    globalThis.MutationObserver = TestMutationObserver;
    const confirmDialog = {
        isConnected: true,
        getBoundingClientRect: () => ({ width: 320, height: 180 }),
    };
    let rateLimitVisible = false;
    const resultPromise = Utils.waitForElementRemoval(confirmDialog, () => rateLimitVisible, 1000);

    assert.equal(activeObservers.length, 1);
    rateLimitVisible = true; // 限流框先掛上
    confirmDialog.isConnected = false; // 同一批 mutation 再卸載確認框
    activeObservers[0].trigger();

    assert.equal(await resultPromise, 'cooldown');
    assert.equal(activeObservers[0].disconnectCalls, 1);
});

test('beta31 A：初次同步檢查也先判限流', async () => {
    activeObservers.length = 0;
    globalThis.MutationObserver = TestMutationObserver;
    const result = await Utils.waitForElementRemoval(
        { isConnected: false, getBoundingClientRect: () => ({ width: 0, height: 0 }) },
        () => true,
        1000,
    );

    assert.equal(result, 'cooldown');
    assert.equal(activeObservers.length, 0);
});

const runAutoBlockFixture = async ({ rateLimitAfterRecheck = false } = {}) => {
    resetStorage();
    const diagnostics = [];
    const logs = [];
    const profileRoot = {
        innerText: '',
        textContent: '',
        matches: () => false,
        cloneNode: () => ({ querySelectorAll: () => [], innerText: '', textContent: '' }),
        querySelectorAll: () => [],
        contains: () => true,
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 500, height: 500 }),
    };
    const profileButton = {
        getAttribute: () => '',
        querySelector: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 10, left: 10, width: 40, height: 40 }),
        scrollIntoView() {},
    };
    const blockButton = { innerText: '封鎖', textContent: '封鎖' };
    const confirmButton = { innerText: '封鎖', textContent: '封鎖' };
    const confirmDialog = {
        isConnected: true,
        innerText: '',
        textContent: '',
        querySelectorAll: () => [confirmButton],
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 320, height: 180 }),
    };
    const rateLimitDialog = { innerText: '稍後再試', textContent: '稍後再試' };
    let phase = 'menu';
    let rateLimitVisible = false;
    let pollCount = 0;

    window.hegeLog = message => logs.push(String(message));
    Core.findProfileRoot = () => profileRoot;
    Worker.resolveProfileRootWithRetry = async () => ({
        root: profileRoot,
        rootAppearedAt: Date.now(),
        observation: {},
        attempt: 1,
        waitMs: 0,
    });
    Worker.findMoreButton = async () => profileButton;
    Worker.blockVisualStep = async () => {};
    Worker.updateStatus = () => {};
    Worker.recordSafetyDiagnostic = (feature, result, routeType, counts, timing, options = {}) => {
        diagnostics.push({ feature, result, fields: options.fields || {} });
    };
    Utils.speedSleep = async () => {};
    Utils.simClick = () => {};
    Utils.waitForElementRemoval = async () => null;
    Utils.safeSleep = async ms => {
        if (ms === 3000) {
            phase = 'recheck';
            rateLimitVisible = rateLimitAfterRecheck;
        }
    };
    Utils.pollUntil = async condition => {
        pollCount += 1;
        if (pollCount === 1) return { action: 'found', btn: blockButton };
        if (pollCount === 2) {
            phase = 'confirm';
            return condition();
        }
        return null;
    };
    document.querySelectorAll = selector => {
        if (selector === 'div[role="dialog"]') return phase === 'confirm' ? [confirmDialog] : [];
        if (selector === 'div[role="dialog"], [role="alert"]') return rateLimitVisible ? [rateLimitDialog] : [];
        return [];
    };

    const result = await Worker.autoBlock('beta31_fixture_user');
    return { result, diagnostics, logs, confirmDialog };
};

test('beta31 B：複驗零 dialog 但 confirmDialog 仍連接時不得判成功', async () => {
    const { result, diagnostics, confirmDialog } = await runAutoBlockFixture();

    assert.equal(result, 'failed');
    assert.equal(confirmDialog.isConnected, true);
    const recheck = diagnostics.find(entry => entry.fields.recheck === true && entry.result === 'failed');
    assert.ok(recheck, '應保留複驗失敗診斷');
    assert.equal(recheck.fields.dialogCount, 0);
    assert.equal(recheck.fields.confirmDialogDetached, false);
});

test('beta31 B：複驗後限流成立時回 cooldown，不進成功路徑', async () => {
    const { result, diagnostics, logs } = await runAutoBlockFixture({ rateLimitAfterRecheck: true });

    assert.equal(result, 'cooldown');
    assert.ok(logs.some(message => message.includes('複驗後偵測到限流')));
    assert.ok(diagnostics.some(entry => entry.result === 'cooldown' && entry.fields.recheck === true));
});

test('beta31 B：confirmDialogDetached 已進入診斷簽章白名單', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta35');
    assert.ok(DIAGNOSTIC_SIGNATURE_STATUS_FIELDS.includes('confirmDialogDetached'));
    RuntimeDiagnostics.clear();
    const entry = RuntimeDiagnostics.record('blocking', 'confirm', {
        recheck: true,
        confirmDialogDetached: true,
    });
    assert.equal(entry?.fields.confirmDialogDetached, true, 'sanitiser 不得丟掉收緊路徑欄位');
    RuntimeDiagnostics.clear();
});

test('beta31 C：非忙碌時清掉批次殘留後仍可啟動 reverify', () => {
    resetStorage();
    const logs = [];
    const batchWrites = [];
    const originalSetJSON = Storage.setJSON;
    const originalRemove = Storage.remove;
    const removedKeys = [];
    Storage.setJSON = (key, value) => {
        if (key === CONFIG.KEYS.BATCH_VERIFY) batchWrites.push(value);
        return originalSetJSON(key, value);
    };
    Storage.remove = key => {
        if (key === CONFIG.KEYS.BATCH_VERIFY_INDEX || key === CONFIG.KEYS.WORKER_MODE) removedKeys.push(key);
        return originalRemove(key);
    };
    window.hegeLog = message => logs.push(String(message));
    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [{ username: 'fresh_user', type: 'block', reason: 'action_failed' }]);
    Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, ['orphan_user']);
    Storage.set(CONFIG.KEYS.BATCH_VERIFY_INDEX, '4');
    Storage.set(CONFIG.KEYS.WORKER_MODE, CONFIG.FAILURE_REVERIFY_MODE);
    Storage.setJSON(CONFIG.KEYS.BG_STATUS, { state: 'stopped', lastUpdate: Date.now() });
    Utils.isMobile = () => true;
    locationMock.reload = () => {};

    try {
        assert.equal(Core.reverifyFailedBlocks(), true);
        assert.deepEqual(batchWrites.slice(-2), [[], ['fresh_user']]);
        assert.equal(Storage.get(CONFIG.KEYS.BATCH_VERIFY_INDEX), '0');
        assert.equal(Storage.get(CONFIG.KEYS.WORKER_MODE), CONFIG.FAILURE_REVERIFY_MODE);
        assert.ok(removedKeys.includes(CONFIG.KEYS.BATCH_VERIFY_INDEX));
        assert.ok(removedKeys.includes(CONFIG.KEYS.WORKER_MODE));
        assert.ok(logs.some(message => message.includes('清除未執行中的批次驗證殘留')));
    } finally {
        Storage.setJSON = originalSetJSON;
        Storage.remove = originalRemove;
    }
});

test('beta31 C：worker 忙碌時仍擋下 reverify 且保留殘留鍵', () => {
    resetStorage();
    const logs = [];
    window.hegeLog = message => logs.push(String(message));
    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [{ username: 'fresh_user', type: 'block', reason: 'action_failed' }]);
    Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, ['orphan_user']);
    Storage.set(CONFIG.KEYS.BATCH_VERIFY_INDEX, '4');
    Storage.set(CONFIG.KEYS.WORKER_MODE, CONFIG.FAILURE_REVERIFY_MODE);
    Storage.setJSON(CONFIG.KEYS.BG_STATUS, { state: 'running', lastUpdate: Date.now() });
    Utils.isMobile = () => true;

    assert.equal(Core.reverifyFailedBlocks(), false);
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []), ['orphan_user']);
    assert.equal(Storage.get(CONFIG.KEYS.BATCH_VERIFY_INDEX), '4');
    assert.equal(Storage.get(CONFIG.KEYS.WORKER_MODE), CONFIG.FAILURE_REVERIFY_MODE);
    assert.equal(logs.some(message => message.includes('清除未執行中的批次驗證殘留')), false);
});

console.log('beta31 false-success hardening: PASS cooldown ordering, recheck guards, orphan cleanup, busy guard');
