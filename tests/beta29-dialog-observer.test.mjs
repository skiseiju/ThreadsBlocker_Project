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

globalThis.localStorage = createStorageArea();
globalThis.sessionStorage = createStorageArea();
globalThis.document = { body: {} };
globalThis.window = { location: { pathname: '/', origin: 'https://threads.net' } };
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 },
});

const { CONFIG } = await import('../src/config.js');
const { Utils } = await import('../src/utils.js');

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

const visibleDialog = () => ({
    isConnected: true,
    getBoundingClientRect: () => ({ width: 320, height: 180 }),
});

test.after(() => {
    if (originalMutationObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = originalMutationObserver;
});

test('beta29 dialog observer：移除目標 dialog 立即成功並 disconnect', async () => {
    activeObservers.length = 0;
    globalThis.MutationObserver = TestMutationObserver;
    const dialog = visibleDialog();
    const resultPromise = Utils.waitForElementRemoval(dialog, () => false, 1000);

    assert.equal(activeObservers.length, 1);
    assert.deepEqual(activeObservers[0].observeArgs, {
        target: document.body,
        options: { childList: true, subtree: true },
    });
    dialog.isConnected = false;
    activeObservers[0].trigger();

    assert.equal(await resultPromise, 'success');
    assert.equal(activeObservers[0].disconnectCalls, 1);
});

test('beta29 dialog observer：掛 observer 前已關閉仍同步成功', async () => {
    activeObservers.length = 0;
    globalThis.MutationObserver = TestMutationObserver;
    const dialog = visibleDialog();
    dialog.isConnected = false;

    assert.equal(await Utils.waitForElementRemoval(dialog, () => false, 1000), 'success');
    assert.equal(activeObservers.length, 0, '已關閉 dialog 不應建立 observer');
});

test('beta29 dialog observer：超時回傳 null 並 disconnect，交給既有 fallback', async () => {
    activeObservers.length = 0;
    globalThis.MutationObserver = TestMutationObserver;
    const result = await Utils.waitForElementRemoval(visibleDialog(), () => false, 5);

    assert.equal(result, null);
    assert.equal(activeObservers.length, 1);
    assert.equal(activeObservers[0].disconnectCalls, 1);
});

test('beta29 dialog observer：observer callback 偵測限流回傳 cooldown 並 disconnect', async () => {
    activeObservers.length = 0;
    globalThis.MutationObserver = TestMutationObserver;
    let cooldown = false;
    const resultPromise = Utils.waitForElementRemoval(visibleDialog(), () => cooldown, 1000);

    cooldown = true;
    activeObservers[0].trigger();
    assert.equal(await resultPromise, 'cooldown');
    assert.equal(activeObservers[0].disconnectCalls, 1);
});

test('beta29 dialog observer：callback 例外回傳 null 並 disconnect', async () => {
    activeObservers.length = 0;
    globalThis.MutationObserver = TestMutationObserver;
    let shouldThrow = false;
    const resultPromise = Utils.waitForElementRemoval(visibleDialog(), () => {
        if (shouldThrow) throw new Error('fixture callback failure');
        return false;
    }, 1000);

    assert.equal(activeObservers.length, 1);
    shouldThrow = true;
    activeObservers[0].trigger();
    assert.equal(await resultPromise, null);
    assert.equal(activeObservers[0].disconnectCalls, 1);
});

test('beta29 confirm 段追蹤特定 dialog 並使用固定 15 秒 observer helper', async () => {
    const [workerSource, configSource] = await Promise.all([
        readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/config.js', import.meta.url), 'utf8'),
    ]);
    assert.equal(CONFIG.VERSION, '2.8.4-beta35');
    assert.equal(CONFIG.CONFIRM_DIALOG_CLOSE_TIMEOUT_MS, 15000);
    assert.match(configSource, /CONFIRM_DIALOG_CLOSE_TIMEOUT_MS:\s*15000/);
    assert.match(workerSource, /confirmDialog\s*=\s*dialog/);
    assert.match(workerSource, /Utils\.waitForElementRemoval\(\s*confirmDialog/);
    assert.match(workerSource, /mutationTrigger:\s*true/);
});
