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
    assert.equal(CONFIG.VERSION, '2.8.4');
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

// beta37：形狀初判已收回。帳號名形狀無法區分真人（sweetrice039220412 的
// 顯示名是「吳佳玲」，與 kennethberryaei31413 形狀完全相同），實機誤標了
// 2.1 萬粉絲的真人帳號。改成只認「掃描已持久化的旗標」與「個人頁標題可取得
// 顯示名時的雙重比對」兩條路。
test('beta37: 只有帳號名時不得標記英文名鏡像', () => {
    withCleanState(() => {
        for (const username of [
            'kennethberryaei31413',
            'laurareedbbb68029',
            'sweetrice039220412',
        ]) {
            assert.equal(Core.getInlineFakeAccountBadgeInfo(username, { users: [] }), null, username);
        }
    });
});

test('beta37: 待審清單依是否為三無分流標籤強度', () => {
    withCleanState(() => {
        assert.equal(
            Core.getInlineFakeAccountBadgeInfo('kennethberryaei31413', {
                users: [{ username: 'other', englishNameMirrorMatch: false }],
            }),
            null,
            '不在清單內不得標記',
        );
        assert.deepEqual(
            Core.getInlineFakeAccountBadgeInfo('kennethberryaei31413', {
                users: [{ username: 'kennethberryaei31413', isThreeNo: false, englishNameMirrorMatch: true }],
            }),
            { label: '命名可疑', tone: 'warning' },
            '命名命中但非三無只掛提示強度',
        );
        assert.deepEqual(
            Core.getInlineFakeAccountBadgeInfo('kennethberryaei31413', {
                users: [{ username: 'kennethberryaei31413', isThreeNo: true, englishNameMirrorMatch: true }],
            }),
            { label: '疑似假帳號', tone: 'strong' },
            '真三無維持強標籤',
        );
        assert.deepEqual(
            Core.getInlineFakeAccountBadgeInfo('kennethberryaei31413', {
                users: [{ username: 'kennethberryaei31413' }],
            }),
            { label: '疑似假帳號', tone: 'strong' },
            '舊資料無 isThreeNo 欄位時維持既有行為',
        );
    });
});

test('beta37: 個人頁標題可取得顯示名時做雙重比對', () => {
    withCleanState(() => {
        const original = document.title;
        try {
            document.title = 'Kenneth Berry (@kennethberryaei31413) • Threads';
            assert.deepEqual(
                Core.getInlineFakeAccountBadgeInfo('kennethberryaei31413', { users: [] }),
                { label: '命名可疑', tone: 'warning' },
            );
            document.title = '吳佳玲 (@sweetrice039220412) • Threads';
            assert.equal(
                Core.getInlineFakeAccountBadgeInfo('sweetrice039220412', { users: [] }),
                null,
                '中文顯示名不得命中',
            );
            document.title = 'Kenneth Berry (@kennethberryaei31413) • Threads';
            assert.equal(
                Core.getInlineFakeAccountBadgeInfo('sweetrice039220412', { users: [] }),
                null,
                '標題帳號與查詢帳號不符時不得採用該顯示名',
            );
        } finally {
            document.title = original;
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
