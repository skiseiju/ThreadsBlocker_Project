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
globalThis.window = {
    ...eventTarget,
    location: locationMock,
    innerHeight: 800,
    innerWidth: 1200,
    open: () => null,
    close: () => {},
    scrollTo: () => {},
    fetch: () => { throw new Error('beta27 fixture 不得發出請求'); },
};
globalThis.location = locationMock;
globalThis.localStorage = createStorageArea();
globalThis.sessionStorage = createStorageArea();
globalThis.document = {
    ...eventTarget,
    body: { innerText: '', textContent: '', appendChild: () => {}, addEventListener: () => {}, removeEventListener: () => {} },
    scrollingElement: null,
    createElement: () => ({ style: {}, dataset: {}, click: () => {}, remove: () => {}, appendChild: () => {}, setAttribute: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};
globalThis.Event = class Event { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
globalThis.WheelEvent = class WheelEvent extends Event {};
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0, language: 'zh-TW', onLine: true },
});

const { CONFIG } = await import('../src/config.js');
const { Core } = await import('../src/core.js');
const { Storage } = await import('../src/storage.js');
const { countConfirmedThreeNoFindings } = await import('../src/features/three-no-watch.js');

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

test('beta27 拼音活躍帳號進待審、三無計數分開', async () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta29');
    const active = profileResult('chenyuxin8661', {
        postsSignal: { known: true, hasContent: true },
    }, { known: true, hasContent: true }, { known: true, hasContent: true });
    assert.equal(active.isThreeNo, false);
    assert.equal(active.pinyinNameMatch, true);

    const queueGate = result => (result.isThreeNo || result.pinyinNameMatch) === true;
    assert.equal(queueGate(active), true, '拼音活躍帳號應通過 findings 閘門');

    const ordinary = profileResult('love0822tw', {
        postsSignal: { known: true, hasContent: true },
    }, { known: true, hasContent: true }, { known: true, hasContent: true });
    assert.equal(ordinary.pinyinNameMatch, false);
    assert.equal(ordinary.isThreeNo, false);
    assert.equal(queueGate(ordinary), false, '非拼音、非三無不得進入 findings');

    const empty = profileResult('ordinary-user', {
        noAvatar: true,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(empty.isThreeNo, true);
    assert.equal(queueGate(empty), true, '三無帳號仍應進入 findings');

    const activeFinding = { username: 'chenyuxin8661', isThreeNo: false, pinyinNameMatch: true };
    const threeNoFinding = { username: 'ordinary-user', isThreeNo: true, pinyinNameMatch: false };
    assert.equal(countConfirmedThreeNoFindings([activeFinding, threeNoFinding]), 1);
    const persisted = Storage.setThreeNoScanResults({ users: [activeFinding, threeNoFinding], status: 'completed', completedAt: 1 });
    assert.equal(persisted.threeNoFollowersCount, 1);
    assert.equal(persisted.users[0].pinyinNameMatch, true);
    assert.equal(persisted.users[0].isThreeNo, false);
});

test('beta27 UI 活躍拼音使用琥珀標籤且三無不重複', async () => {
    const source = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
    assert.match(source, /item\.pinyinNameMatch === true && item\.isThreeNo !== true/);
    assert.match(source, /拼音命名・有活動/);
    assert.match(source, /amber: \['#ffd27a', 'rgba\(255,190,80,0\.50\)', 'rgba\(255,190,80,0\.12\)'\]/);
    assert.match(source, /: \(review\.pinyinName \? \['疑似簡體拼音', 'gray'\]/);
});

console.log('beta27 pinyin badge: PASS active queue gate, three-no-only count, storage preservation, amber UI guard');
