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
    fetch: () => { throw new Error('beta20 formula fixture 不得發出請求'); },
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

test('beta20 版本與三無公式回歸案例', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta35');

    const noBioOnly = profileResult('ordinary-user', {
        noAvatar: true,
        noBio: true,
    });
    assert.equal(noBioOnly.noBio, true, 'noBio 顯示訊號仍保留');
    assert.equal(noBioOnly.noPosts, false);
    assert.equal(noBioOnly.noReplies, false);
    assert.equal(noBioOnly.noReposts, false);
    assert.equal(noBioOnly.isThreeNo, false, '只有無頭像＋無簡介不得判三無');

    const privateAccount = profileResult('private-user', {
        noAvatar: true,
        accountPrivate: true,
        postsSignal: { known: true, hasContent: false },
    }, {
        known: true,
        hasContent: false,
    }, {
        known: true,
        hasContent: false,
    });
    assert.equal(privateAccount.accountPrivate, true, '私密訊號仍保留');
    assert.equal(privateAccount.noPosts, false, '私密帳號內容旗標必須被強制為 false');
    assert.equal(privateAccount.noReplies, false, '私密帳號內容旗標必須被強制為 false');
    assert.equal(privateAccount.noReposts, false, '私密帳號內容旗標必須被強制為 false');
    assert.equal(privateAccount.isThreeNo, false, '私密帳號不得僅因 isPrivate 判三無');

    const confirmedNoPosts = profileResult('empty-posts-user', {
        noAvatar: true,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(confirmedNoPosts.noPosts, true);
    assert.equal(confirmedNoPosts.noPostsKnown, true);
    assert.equal(confirmedNoPosts.isThreeNo, true, '無頭像＋已確認無發文應判三無');

    const avatarWithNoPosts = profileResult('avatar-user', {
        noAvatar: false,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(avatarWithNoPosts.noPosts, true);
    assert.equal(avatarWithNoPosts.isThreeNo, false, '有頭像時即使確認無發文也不得判三無');
});

console.log('beta20 three-no formula regression: PASS noBio/private-only=false confirmed-noPosts=true avatar-guard=true');
