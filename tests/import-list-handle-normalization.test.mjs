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
const noopTarget = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
};

const windowMock = {
    ...noopTarget,
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
    value: { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 },
});
globalThis.chrome = { runtime: { id: 'import-list-test' } };
globalThis.document = {
    ...noopTarget,
    body: { appendChild: () => {}, innerText: '', textContent: '' },
    createElement: () => ({
        style: {}, dataset: {},
        classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
        appendChild: () => {}, setAttribute: () => {}, remove: () => {},
        querySelector: () => null, querySelectorAll: () => [],
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core } = await import('../src/core.js');
const { UI } = await import('../src/ui.js');

const resetState = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
};

test('parseImportedUsernames lowercases handles and strips url decoration', () => {
    resetState();
    assert.deepEqual(
        Core.parseImportedUsernames('FooBar'),
        ['foobar'],
        '大寫 handle 必須折成小寫，否則會和頁面抓到的小寫 href 對不上',
    );
    assert.deepEqual(
        Core.parseImportedUsernames('https://www.threads.com/@ShareUser?igshid=abc#post'),
        ['shareuser'],
        '分享連結的 query 與 hash 都不屬於 handle',
    );
    assert.deepEqual(
        Core.parseImportedUsernames('@Mixed\nmixed\nhttps://www.threads.com/@MIXED/post/1'),
        ['mixed'],
        '同一個帳號的三種寫法必須折成同一筆',
    );
    assert.deepEqual(
        Core.parseImportedUsernames('  \n , ，  '),
        [],
        '空白與分隔符不得產生空 handle',
    );
    assert.deepEqual(
        Core.parseImportedUsernames('a.b_c1'),
        ['a.b_c1'],
        'handle 允許的字元不得被誤刪',
    );
});

test('importList treats an already-blocked handle as duplicate regardless of case', () => {
    resetState();
    Storage.setJSON(CONFIG.KEYS.DB_KEY, ['blockeduser']);
    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, []);

    const toasts = [];
    const originalToast = UI.showToast;
    const originalUpdate = Core.updateControllerUI;
    globalThis.prompt = () => 'BlockedUser';
    UI.showToast = message => { toasts.push(String(message)); };
    Core.updateControllerUI = () => {};

    try {
        Core.importList();
        assert.deepEqual(
            Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []),
            [],
            '已封鎖過的帳號改成大寫貼上，不得再被排進佇列',
        );
        assert.ok(toasts.some(text => text.includes('沒有新名單')), `預期出現重複提示，實際為 ${JSON.stringify(toasts)}`);
    } finally {
        UI.showToast = originalToast;
        Core.updateControllerUI = originalUpdate;
        delete globalThis.prompt;
    }
});

test('importList queues a genuinely new handle in lowercase form', () => {
    resetState();
    Storage.setJSON(CONFIG.KEYS.DB_KEY, ['blockeduser']);
    Storage.setJSON(CONFIG.KEYS.BG_QUEUE, ['QueuedUser']);

    const originalToast = UI.showToast;
    const originalUpdate = Core.updateControllerUI;
    const originalConfirm = UI.showConfirm;
    globalThis.prompt = () => 'https://www.threads.com/@NewUser?igshid=1\nqueueduser';
    UI.showToast = () => {};
    UI.showConfirm = () => {};
    Core.updateControllerUI = () => {};

    try {
        Core.importList();
        assert.deepEqual(
            Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []),
            ['QueuedUser', 'newuser'],
            '新帳號以小寫入列；已在佇列中的帳號不論大小寫都不重複加入',
        );
    } finally {
        UI.showToast = originalToast;
        UI.showConfirm = originalConfirm;
        Core.updateControllerUI = originalUpdate;
        delete globalThis.prompt;
    }
});
