import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
const fixtureLocation = {
    pathname: '/@fixture_user/replies',
    search: '?hege_bg=true',
    hash: '',
    href: 'https://threads.net/@fixture_user/replies?hege_bg=true',
    origin: 'https://threads.net',
    reload() {},
};

globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.location = fixtureLocation;
globalThis.history = { replaceState() {} };
globalThis.window = {
    location: fixtureLocation,
    hegeLog: null,
    innerWidth: 1200,
    innerHeight: 900,
    outerWidth: 1200,
    outerHeight: 900,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    open: () => null,
    close() {},
};
globalThis.document = {
    title: '',
    body: { innerText: '', textContent: '', appendChild() {} },
    documentElement: { appendChild() {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    dispatchEvent: () => true,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, remove() {} }),
    addEventListener() {},
};
globalThis.BroadcastChannel = class { postMessage() {} close() {} };
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 },
});

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core } = await import('../src/core.js');
const { Worker, BATCH_VERIFY_ROUTE_RETRY_TTL_MS } = await import('../src/worker.js');

const original = {
    pollUntil: Utils.pollUntil,
    waitForElementRemoval: Utils.waitForElementRemoval,
    safeSleep: Utils.safeSleep,
    speedSleep: Utils.speedSleep,
    simClick: Utils.simClick,
    isMobile: Utils.isMobile,
    openWorkerWindow: Utils.openWorkerWindow,
    resolveProfileRootWithRetry: Worker.resolveProfileRootWithRetry,
    findMoreButton: Worker.findMoreButton,
    blockVisualStep: Worker.blockVisualStep,
    updateStatus: Worker.updateStatus,
    navigateBack: Worker.navigateBack,
    verifyBlock: Worker.verifyBlock,
    recordSafetyDiagnostic: Worker.recordSafetyDiagnostic,
    findProfileRoot: Core.findProfileRoot,
};

const resetFixture = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    fixtureLocation.pathname = '/@fixture_user/replies';
    fixtureLocation.search = '?hege_bg=true';
    fixtureLocation.href = 'https://threads.net/@fixture_user/replies?hege_bg=true';
    document.body.innerText = '';
    document.body.textContent = '';
    Worker._accountNavigationStartedAt = null;
    Worker._diagnosticOperationId = null;
    Worker._diagnosticOperationFeature = 'blocking';
    Worker.stats = { success: 0, skipped: 0, failed: 0, vanished: 0, startTime: 0 };
    Utils.waitForElementRemoval = original.waitForElementRemoval;
    Worker.resolveProfileRootWithRetry = original.resolveProfileRootWithRetry;
    Worker.findMoreButton = original.findMoreButton;
    Worker.blockVisualStep = original.blockVisualStep;
    Worker.updateStatus = original.updateStatus;
    Worker.navigateBack = original.navigateBack;
    Worker.verifyBlock = original.verifyBlock;
    Worker.recordSafetyDiagnostic = original.recordSafetyDiagnostic;
    Core.findProfileRoot = original.findProfileRoot;
};

test.after(() => {
    Utils.pollUntil = original.pollUntil;
    Utils.waitForElementRemoval = original.waitForElementRemoval;
    Utils.safeSleep = original.safeSleep;
    Utils.speedSleep = original.speedSleep;
    Utils.simClick = original.simClick;
    Utils.isMobile = original.isMobile;
    Utils.openWorkerWindow = original.openWorkerWindow;
    Worker.resolveProfileRootWithRetry = original.resolveProfileRootWithRetry;
    Worker.findMoreButton = original.findMoreButton;
    Worker.blockVisualStep = original.blockVisualStep;
    Worker.updateStatus = original.updateStatus;
    Worker.navigateBack = original.navigateBack;
    Worker.verifyBlock = original.verifyBlock;
    Worker.recordSafetyDiagnostic = original.recordSafetyDiagnostic;
    Core.findProfileRoot = original.findProfileRoot;
});

test('beta28 A：確認 dialog 延遲關閉時，固定 safeSleep 複驗改判成功', async () => {
    resetFixture();
    assert.equal(CONFIG.VERSION, '2.8.4-beta31');
    let dialogOpen = true;
    const safeSleepCalls = [];
    const diagnostics = [];
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
    const blockButton = {};
    const confirmButton = { innerText: '封鎖', textContent: '封鎖' };
    const confirmDialog = {
        isConnected: true,
        querySelectorAll: () => [confirmButton],
        innerText: '',
        textContent: '',
    };
    let pollCount = 0;

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
    Worker.recordSafetyDiagnostic = (phase, result, routeType, counts, timing, options = {}) => {
        diagnostics.push({ phase, result, fields: options.fields || {} });
    };
    Utils.speedSleep = async () => {};
    Utils.simClick = () => {};
    Utils.safeSleep = async ms => {
        safeSleepCalls.push(ms);
        if (ms === 3000) {
            dialogOpen = false;
            confirmDialog.isConnected = false;
        }
    };
    Utils.pollUntil = async condition => {
        pollCount += 1;
        if (pollCount === 1) return { action: 'found', btn: blockButton };
        if (pollCount === 2) return condition() || confirmButton;
        return null;
    };
    // beta28 regression fixture intentionally exercises the unchanged timeout
    // fallback; the beta29 observer helper has its own dedicated tests.
    Utils.waitForElementRemoval = async () => null;
    document.querySelectorAll = selector => {
        if (selector === 'div[role="dialog"]') return dialogOpen ? [confirmDialog] : [];
        return [];
    };

    const result = await Worker.autoBlock('delayed_recheck_user');
    assert.equal(result, 'success');
    assert.ok(safeSleepCalls.includes(3000), '複驗必須使用固定 3 秒 safeSleep');
    assert.ok(diagnostics.some(entry => entry.phase === 'confirm_resolve'
        && entry.result === 'success' && entry.fields.recheck === true));
    assert.match(Storage.getJSON(CONFIG.KEYS.BG_STATUS, {}).current || '', /已封鎖 \(複驗\)/);
});

test('beta28 B：失敗名單重新驗證沿用 BATCH_VERIFY，已封鎖者移除並寫入 BlockDB', async () => {
    resetFixture();
    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [
        { username: 'already_blocked', type: 'block', reason: 'action_failed', failedAt: 1 },
        { username: 'still_failed', type: 'block', reason: 'action_failed', failedAt: 2 },
    ]);
    Utils.isMobile = () => true;
    let reloadCalls = 0;
    fixtureLocation.reload = () => { reloadCalls += 1; };
    Core.reverifyFailedBlocks();
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []), ['already_blocked', 'still_failed']);
    assert.equal(Storage.get(CONFIG.KEYS.BATCH_VERIFY_INDEX), '0');
    assert.equal(Storage.get(CONFIG.KEYS.WORKER_MODE), CONFIG.FAILURE_REVERIFY_MODE);
    assert.equal(reloadCalls, 1);

    Worker.updateStatus = () => {};
    Worker.navigateBack = () => {};
    Worker.verifyBlock = async user => user === 'already_blocked';

    fixtureLocation.pathname = '/@already_blocked/replies';
    await Worker.resumeBatchVerify();
    fixtureLocation.pathname = '/@still_failed/replies';
    await Worker.resumeBatchVerify();

    assert.deepEqual(Storage.getBlockDB(), ['already_blocked']);
    const remaining = Core.getFailedQueueEntries().filter(entry => entry.type === 'block').map(entry => entry.username);
    assert.deepEqual(remaining, ['still_failed']);
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []), []);
    assert.equal(Storage.get(CONFIG.KEYS.BATCH_VERIFY_INDEX), null);
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING, []), [], '重新驗證不得回溯 stats 計數');
});

test('beta28 B：UI 重新驗證按鈕只對封鎖失敗批次出現並接到 Core callback', async () => {
    const [uiSource, coreSource, workerSource] = await Promise.all([
        readFile(new URL('../src/ui.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/core.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
    ]);
    assert.match(uiSource, /data-action="reverify-blocks"/);
    assert.match(uiSource, /重新驗證/);
    assert.match(coreSource, /onReverifyBlocks: \(\) => Core\.reverifyFailedBlocks\(\)/);
    assert.match(workerSource, /CONFIG\.KEYS\.BATCH_VERIFY/);
    assert.match(workerSource, /addToBlockDBFromContext\(user\)[\s\S]*?Core\.removeFailure\(user, 'block'\)/);
});

test('beta28 C：批次驗證導頁最多重試一次，刪除帳號在重新驗證仍留失敗名單', async () => {
    resetFixture();
    const originalReplaceState = globalThis.history.replaceState;
    const originalReload = fixtureLocation.reload;
    const batch = ['deleted_user', 'next_user'];
    const logs = [];
    const navigations = [];
    let reloadCount = 0;
    let verifyCalls = 0;

    Storage.setJSON(CONFIG.KEYS.BATCH_VERIFY, batch);
    Storage.set(CONFIG.KEYS.BATCH_VERIFY_INDEX, '0');
    Storage.set(CONFIG.KEYS.WORKER_MODE, CONFIG.FAILURE_REVERIFY_MODE);
    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, batch.map(username => ({
        username,
        type: 'block',
        reason: 'action_failed',
        failedAt: 1,
    })));
    sessionStorageMock.setItem('hege_batch_verify_route_retry', JSON.stringify({
        rawTarget: 'deleted_user',
        index: 0,
        mode: CONFIG.FAILURE_REVERIFY_MODE,
        attempt: 1,
        requestedAt: Date.now() - BATCH_VERIFY_ROUTE_RETRY_TTL_MS - 1,
    }));
    fixtureLocation.pathname = '/@unrelated_user/replies';
    globalThis.history.replaceState = (_state, _title, path) => navigations.push(path);
    fixtureLocation.reload = () => { reloadCount += 1; };
    window.hegeLog = message => logs.push(message);
    Worker.updateStatus = () => {};
    Worker.navigateBack = () => {};
    Worker.verifyBlock = async () => {
        verifyCalls += 1;
        throw new Error('頁面不符時不應進入 verifyBlock');
    };

    try {
        const first = await Worker.resumeBatchVerify();
        assert.equal(first, true);
        assert.equal(Storage.get(CONFIG.KEYS.BATCH_VERIFY_INDEX), '0');
        assert.equal(reloadCount, 1, '第一次頁面不符應只導頁重試一次');
        const marker = JSON.parse(sessionStorageMock.getItem('hege_batch_verify_route_retry'));
        assert.equal(marker.rawTarget, 'deleted_user');
        assert.equal(marker.index, 0);
        assert.equal(marker.mode, CONFIG.FAILURE_REVERIFY_MODE);
        assert.equal(marker.attempt, 1);

        const second = await Worker.resumeBatchVerify();
        assert.equal(second, true);
        assert.equal(Storage.get(CONFIG.KEYS.BATCH_VERIFY_INDEX), '1', '第二次仍不符應前進下一筆');
        assert.equal(reloadCount, 2, '第二次只應導航到下一筆，不應再次重試同一帳號');
        assert.equal(sessionStorageMock.getItem('hege_batch_verify_route_retry'), null);
        assert.equal(verifyCalls, 0);
        assert.ok(logs.includes('[批次驗證] @deleted_user 頁面不符，跳過'));
        assert.deepEqual(navigations, [
            '/@deleted_user/replies?hege_bg=true',
            '/@next_user/replies?hege_bg=true',
        ]);
        assert.deepEqual(Storage.getJSON(CONFIG.KEYS.BATCH_VERIFY, []), batch);
        assert.deepEqual(
            Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []).map(entry => entry.username),
            batch,
            '重新驗證模式下導頁不符的帳號仍留在失敗名單',
        );
    } finally {
        globalThis.history.replaceState = originalReplaceState;
        fixtureLocation.reload = originalReload;
        window.hegeLog = null;
    }
});
