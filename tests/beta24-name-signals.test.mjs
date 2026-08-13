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
    fetch: () => { throw new Error('beta24 name-signal fixture 不得發出請求'); },
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
const { analyze, matchesPinyinName } = await import('../src/three-no-name-pattern.js');
const { Core } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const pinyinCases = [
    ['zhengkexin128', true],
    ['qiuyayan50', true],
    ['xiesiyi368', true],
    ['chenyuxin8661', true],
    ['linpeiyan496', false],
    ['hongsihan877', false],
    ['love0822tw', false],
    ['abcdefgh123', false],
];

test('beta24 narrows pinyin matches to mainland-distinctive initials', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta30');
    for (const [username, expected] of pinyinCases) {
        assert.equal(analyze(username) !== null, expected, `${username} analyze mismatch`);
        assert.equal(matchesPinyinName(username), expected, `${username} matchesPinyinName mismatch`);
    }
});

test('beta24 tightens animal-number candidates to five digits', () => {
    const matchesSuspiciousCandidate = Core.ThreeNoWatch.usernameMatchesSuspiciousThreeNoCandidate;
    assert.equal(matchesSuspiciousCandidate('dolphin986363'), true, 'six-digit animal default should match');
    assert.equal(matchesSuspiciousCandidate('shark20819'), true, 'five-digit animal suffix should match');
    assert.equal(matchesSuspiciousCandidate('shark2081'), false, 'four-digit animal suffix should not match');
});

console.log('beta24 name signals: PASS mainland pinyin narrowing, informational matcher, five-digit animal threshold');
