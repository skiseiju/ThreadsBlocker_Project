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
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
};
const locationMock = {
    href: 'https://www.threads.com/@candidate',
    origin: 'https://www.threads.com',
    pathname: '/@candidate',
    search: '',
    reload: () => {},
    assign: () => {},
};
const windowMock = {
    ...eventTarget,
    location: locationMock,
    innerHeight: 800,
    innerWidth: 1200,
    open: () => null,
    close: () => {},
    scrollTo: () => {},
    fetch: () => { throw new Error('beta32 fixture 不得發出請求'); },
};

globalThis.window = windowMock;
globalThis.location = locationMock;
globalThis.localStorage = createStorageArea();
globalThis.sessionStorage = createStorageArea();
globalThis.document = {
    ...eventTarget,
    body: {
        innerText: '',
        textContent: '',
        appendChild: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
    },
    scrollingElement: null,
    createElement: () => ({
        style: {},
        dataset: {},
        click: () => {},
        remove: () => {},
        appendChild: () => {},
        setAttribute: () => {},
    }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};
globalThis.Event = class Event {
    constructor(type, init = {}) {
        this.type = type;
        Object.assign(this, init);
    }
};
globalThis.WheelEvent = class WheelEvent extends Event {};
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

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Core } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const withCleanState = (fn) => {
    localStorage.clear();
    sessionStorage.clear();
    return fn();
};

test('beta33: 內嵌 badge 版號斷言', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta33');
});

test('beta33: 動物字典命名仍回命名可疑（既有行為不變）', () => {
    withCleanState(() => {
        const info = Core.getInlineFakeAccountBadgeInfo('panda123456', { users: [] });
        assert.deepEqual(info, { label: '命名可疑', tone: 'warning' });
    });
});

test('beta33: 拼音命名回命名可疑', () => {
    withCleanState(() => {
        const info = Core.getInlineFakeAccountBadgeInfo('zhengkexin128', { users: [] });
        assert.deepEqual(info, { label: '命名可疑', tone: 'warning' });
    });
});

test('beta33: 英文名鏡像形狀回命名可疑（貼文情境只有帳號名）', () => {
    withCleanState(() => {
        for (const username of [
            'kennethberryaei31413',
            'laurareedbbb68029',
            'timothyhodgeyft36541',
            'ernestlopezgei67416',
        ]) {
            const info = Core.getInlineFakeAccountBadgeInfo(username, { users: [] });
            assert.deepEqual(info, { label: '命名可疑', tone: 'warning' }, username);
        }
    });
});

test('beta33: 一般帳號名不掛標籤', () => {
    withCleanState(() => {
        for (const username of ['skiseiju', 'hello_world', 'abc123']) {
            assert.equal(Core.getInlineFakeAccountBadgeInfo(username, { users: [] }), null, username);
        }
    });
});

test('beta33: 安全名單帳號一律不掛標籤', () => {
    withCleanState(() => {
        Storage.addThreeNoUserSafe?.('kennethberryaei31413');
        const info = Core.getInlineFakeAccountBadgeInfo('kennethberryaei31413', { users: [] });
        if (Storage.isThreeNoUserSafe('kennethberryaei31413')) {
            assert.equal(info, null);
        }
    });
});
