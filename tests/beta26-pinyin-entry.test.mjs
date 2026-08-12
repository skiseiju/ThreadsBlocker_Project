import test from 'node:test';
import assert from 'node:assert/strict';

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
    fetch: () => { throw new Error('beta26 pinyin-entry fixture 不得發出請求'); },
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
const { Core } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const profileResult = (username, base = {}, replies = {}, reposts = {}) => Core.ThreeNoWatch.buildProfileResultFromProbes(username, {
    base: {
        noAvatar: false,
        noBio: false,
        accountPrivate: false,
        suspiciousUsername: false,
        postsSignal: { known: false, hasContent: false },
        ...base,
    },
    replies,
    reposts,
});

test('beta26 拼音＋確認無內容可繞過頭像門檻', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta26');

    const pinyinEmpty = profileResult('chenyuxin8661', {
        noAvatar: false,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(pinyinEmpty.pinyinNameMatch, true);
    assert.equal(pinyinEmpty.noPosts, true);
    assert.equal(pinyinEmpty.isThreeNo, true, '拼音命中＋確認無發文即使有頭像也應進名單');

    const pinyinActive = profileResult('chenyuxin8661', {
        noAvatar: false,
        postsSignal: { known: true, hasContent: true },
    }, {
        known: true,
        hasContent: true,
    }, {
        known: true,
        hasContent: true,
    });
    assert.equal(pinyinActive.pinyinNameMatch, true);
    assert.equal(pinyinActive.isThreeNo, false, '拼音命中＋三項有內容不得判三無');

    const pinyinPrivate = profileResult('chenyuxin8661', {
        noAvatar: false,
        accountPrivate: true,
        postsSignal: { known: true, hasContent: false },
    }, {
        known: true,
        hasContent: false,
    }, {
        known: true,
        hasContent: false,
    });
    assert.equal(pinyinPrivate.pinyinNameMatch, true);
    assert.equal(pinyinPrivate.noPosts, false, '私密帳號內容旗標必須強制為 false');
    assert.equal(pinyinPrivate.isThreeNo, false, '私密帳號不得經拼音路徑進名單');

    const nonPinyin = profileResult('love0822tw', {
        noAvatar: false,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(nonPinyin.pinyinNameMatch, false);
    assert.equal(nonPinyin.isThreeNo, false, '非拼音帳號仍受有頭像門檻限制');

    const narrowedPinyin = profileResult('linpeiyan496', {
        noAvatar: false,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(narrowedPinyin.pinyinNameMatch, false);
    assert.equal(narrowedPinyin.isThreeNo, false, 'beta24 收窄後的拼音語意不得回退');

    const noAvatarRegression = profileResult('ordinary-user', {
        noAvatar: true,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(noAvatarRegression.isThreeNo, true, '既有無頭像＋確認無發文路徑仍應成立');
});

console.log('beta26 pinyin entry: PASS avatar bypass, active/private guards, narrowed matcher, no-avatar regression');
