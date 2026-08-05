import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
const windowMock = {
    location: {
        href: 'https://www.threads.com/@fixture_user',
        origin: 'https://www.threads.com',
        pathname: '/@fixture_user',
        search: '',
    },
    innerWidth: 1200,
    innerHeight: 900,
    outerWidth: 1200,
    outerHeight: 900,
    screen: { availWidth: 1600, availHeight: 1000 },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ cursor: 'default', display: 'block', visibility: 'visible', opacity: '1' }),
    close() {},
};

let fixtureMode = 'empty';
let pollingRounds = 80;
const triggerRect = { top: 20, left: 20, width: 160, height: 32 };
const trigger = {
    tagName: 'SPAN',
    innerText: '10 followers',
    textContent: '10 followers',
    parentElement: null,
    getBoundingClientRect: () => triggerRect,
    getAttribute: name => name === 'title' ? '10 followers' : null,
    matches: selector => selector === 'span',
    closest: () => null,
    dispatchEvent: () => true,
    click() {},
};

const documentMock = {
    hidden: false,
    title: '',
    body: { appendChild() {}, addEventListener() {}, innerText: '', textContent: '' },
    documentElement: { appendChild() {} },
    defaultView: windowMock,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: selector => fixtureMode === 'trigger' && !String(selector).includes('role="dialog"') ? [trigger] : [],
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {} }),
    addEventListener() {},
    dispatchEvent() { return true; },
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta89-fixture', platform: 'test', maxTouchPoints: 0, onLine: true },
});
globalThis.CSS = { escape: value => String(value) };
globalThis.history = { replaceState() {} };
globalThis.BroadcastChannel = class { postMessage() {} close() {} };
globalThis.MouseEvent = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
globalThis.TouchEvent = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
globalThis.document = documentMock;

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const { UI } = await import('../src/ui.js');
await import('../src/features/three-no-watch.js');

const resetState = () => {
    CONFIG.VERSION = '2.8.3-beta4';
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = true;
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics.RATE_LIMIT_PER_MINUTE = 1000;
    RuntimeDiagnostics._entries = [];
    RuntimeDiagnostics._lastBySignature.clear();
    RuntimeDiagnostics._lastByRateKey.clear();
    RuntimeDiagnostics._rateWindows.clear();
    RuntimeDiagnostics._operations.clear();
    windowMock.innerWidth = 1200;
    windowMock.innerHeight = 900;
    windowMock.location.search = '';
    fixtureMode = 'empty';
    pollingRounds = 80;
};

test.beforeEach(resetState);

test('第 20 項 green：panel/clamp 穩態只留一筆，三種真變化都會記錄', () => {
    const panelRect = { left: 1155.875, top: 20.25, width: 216.125, height: 500.5 };
    const panel = {
        dataset: {},
        hidden: false,
        style: {},
        innerHTML: 'panel',
        querySelector: () => null,
        getBoundingClientRect: () => panelRect,
    };
    const originalGetElementById = documentMock.getElementById;
    documentMock.getElementById = id => id === 'hege-panel' ? panel : null;
    try {
        for (let index = 0; index < 40; index += 1) UI.anchorPanel();
    } finally {
        documentMock.getElementById = originalGetElementById;
    }
    const steady = RuntimeDiagnostics.get().filter(entry => entry.feature === 'panel' && entry.stage === 'clamp');
    assert.equal(steady.length, 1);

    const movedPanelRect = { left: 1000, top: 700, width: 300, height: 300 };
    const movedPanel = { hidden: false, style: {}, getBoundingClientRect: () => movedPanelRect };
    UI.clampPanelToViewport(movedPanel);
    movedPanelRect.left = 700;
    movedPanelRect.top = 500;
    UI.clampPanelToViewport(movedPanel);
    assert.ok(RuntimeDiagnostics.get().filter(entry => entry.feature === 'panel' && entry.stage === 'clamp').length >= 3);

    const viewportPanelRect = { left: 40, top: 40, width: 200, height: 200 };
    const viewportPanel = { hidden: false, style: {}, getBoundingClientRect: () => viewportPanelRect };
    UI.clampPanelToViewport(viewportPanel);
    windowMock.innerWidth = 1100;
    UI.clampPanelToViewport(viewportPanel);
    const clampEntries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'panel' && entry.stage === 'clamp');
    assert.ok(clampEntries.some(entry => entry.fields.viewportWidth === 1100));
    assert.ok(clampEntries.some(entry => entry.fields.rectLeft === 700));
    assert.ok(clampEntries.some(entry => entry.fields.clamped === true));
    console.log(`beta4 panel/clamp green: steady=${steady.length} total=${clampEntries.length}`);
});

const runFollowerFixture = async (mode, rounds) => {
    resetState();
    fixtureMode = mode;
    pollingRounds = rounds;
    const originalPollUntil = Utils.pollUntil;
    Utils.pollUntil = async condition => {
        for (let index = 0; index < pollingRounds; index += 1) {
            const result = condition();
            if (result) return result;
        }
        return condition();
    };
    try {
        const result = await Core.ThreeNoWatch.openFollowersDialog();
        return {
            result,
            entries: RuntimeDiagnostics.get().filter(entry => entry.feature === 'followers'),
        };
    } finally {
        Utils.pollUntil = originalPollUntil;
    }
};

test('第 17 項 green：四種取法全落空會留下可分辨的 followers 取證，且輪詢取樣有界', async () => {
    const shortRun = await runFollowerFixture('empty', 40);
    const longRun = await runFollowerFixture('empty', 400);
    assert.equal(shortRun.result, null);
    assert.equal(longRun.result, null);
    const strategies = ['count_text_node', 'count_button', 'href_path', 'text_match'];
    for (const strategy of strategies) {
        const entry = longRun.entries.find(item => item.stage === 'wait' && item.fields.strategy === strategy && item.fields.complete === true);
        assert.ok(entry, `缺少 ${strategy} 取法紀錄`);
        assert.ok(entry.fields.attempt > 0);
        assert.equal(entry.fields.found, false);
    }
    assert.ok(longRun.entries.some(entry => entry.stage === 'failure' && entry.fields.reason === 'followers_trigger_not_found'));
    assert.ok(longRun.entries.some(entry => entry.stage === 'terminal' && entry.fields.reason === 'followers_trigger_not_found'));
    assert.ok(longRun.entries.length <= 24, `輪詢條目過多：${longRun.entries.length}`);
    assert.ok(longRun.entries.length <= shortRun.entries.length + 2, '輪詢時間拉長不應線性增加條目');
    console.log(`beta4 followers trigger green: short=${shortRun.entries.length} long=${longRun.entries.length}`);
});

test('第 17 項 green：觸發元素存在但對話框不開會分辨兩次點擊與最終成因', async () => {
    const fixture = await runFollowerFixture('trigger', 80);
    assert.equal(fixture.result, null);
    const dialogEntries = fixture.entries.filter(entry => entry.stage === 'dialog');
    assert.equal(dialogEntries.length, 2);
    assert.deepEqual(dialogEntries.map(entry => entry.fields.attempt), [1, 2]);
    assert.deepEqual(dialogEntries.map(entry => entry.fields.dialogFound), [false, false]);
    assert.deepEqual(dialogEntries.map(entry => entry.fields.dialogCount), [0, 0]);
    assert.ok(fixture.entries.some(entry => entry.stage === 'failure' && entry.fields.reason === 'followers_dialog_not_found_after_retry'));
    assert.ok(fixture.entries.some(entry => entry.stage === 'terminal' && entry.fields.reason === 'followers_dialog_not_found_after_retry'));
    assert.ok(fixture.entries.some(entry => entry.stage === 'wait' && entry.fields.pollCount > 0 && typeof entry.fields.elapsedMs === 'number'));
    console.log(`beta4 followers dialog green: entries=${fixture.entries.length} attempts=${dialogEntries.length}`);
});

test('第 17 項 green：bug report bundle 只帶允許的三無 debug.step 代號', () => {
    resetState();
    Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
        status: 'failed',
        error: 'followers_trigger_not_found',
        debug: {
            step: 'followers_trigger_not_found',
            candidates: ['敏感頁面文字'],
            url: 'https://www.threads.com/@private',
        },
    });
    const bundle = Core.buildBugReportDiagnosticsBundle();
    assert.equal(bundle.threeNoDebugStep, 'followers_trigger_not_found');
    assert.equal(Object.prototype.hasOwnProperty.call(bundle, 'debug'), false);
    assert.doesNotMatch(JSON.stringify(bundle), /敏感頁面文字|threads\.com\/@private/);
});

console.log('beta4 diagnostics contract: panel clamp / followers trigger evidence / bounded polling / debug-step enum');
