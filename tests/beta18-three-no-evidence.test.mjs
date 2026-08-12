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
const locationMock = {
    href: 'https://www.threads.com/@owner',
    origin: 'https://www.threads.com',
    pathname: '/@owner',
    search: '',
    reload() {},
    assign() {},
};
const eventTarget = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
const windowMock = {
    ...eventTarget,
    location: locationMock,
    innerHeight: 800,
    innerWidth: 1200,
    open: () => null,
    close() {},
    scrollTo() {},
    fetch() { throw new Error('beta18 fixture 不得發出請求'); },
};
const documentMock = {
    ...eventTarget,
    body: { innerText: '', textContent: '', appendChild() {}, addEventListener() {}, removeEventListener() {} },
    scrollingElement: null,
    createElement: () => ({ style: {}, dataset: {}, click() {}, remove() {}, appendChild() {}, setAttribute() {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};

globalThis.window = windowMock;
globalThis.location = locationMock;
globalThis.document = documentMock;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.Event = class Event { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
globalThis.WheelEvent = class WheelEvent extends Event {};
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0, language: 'zh-TW', onLine: true, clipboard: { writeText: async () => {} } },
});

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core, RuntimeDiagnostics, projectScanDebugLogForExport } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const original = {
    version: CONFIG.VERSION,
    diagnosticsEnabled: CONFIG.ENABLE_BETA_DIAGNOSTICS,
    limit: CONFIG.THREE_NO_SCAN_FOLLOWER_ROSTER_LIMIT,
    safeSleep: Utils.safeSleep,
    waitForMedia: Core.ThreeNoWatch.waitForFollowersListMedia,
    findDialog: Core.ThreeNoWatch.findActiveFollowersDialog,
    findScroller: Core.ThreeNoWatch.findScrollContainer,
    stopRequested: Core.ThreeNoWatch.isStopRequested,
    setRoster: Storage.setThreeNoFollowerRoster,
    visibleAvatar: Core.ThreeNoWatch.followerListRowHasVisibleAvatar,
};

const reset = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = '2.8.4-beta18';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    CONFIG.THREE_NO_SCAN_FOLLOWER_ROSTER_LIMIT = 2000;
    Utils.safeSleep = async () => {};
    Core.ThreeNoWatch.waitForFollowersListMedia = async () => {};
    Core.ThreeNoWatch.isStopRequested = () => false;
};

const makeFixture = () => {
    const links = [];
    for (let index = 0; index < 200; index += 1) {
        const known = index < 120;
        const visibleAvatar = index >= 120 && index < 170;
        const username = known
            ? `known${String(index).padStart(4, '0')}`
            : (visibleAvatar ? `friend${String(index).padStart(4, '0')}` : `panda${10000 + index}`);
        const displayName = known ? `已掃姓名${index}` : (visibleAvatar ? `一般姓名${index}` : `可疑姓名${index}`);
        const row = {
            isConnected: true,
            innerText: `${displayName}\n${username}\nFollowing`,
            textContent: `${displayName}\n${username}\nFollowing`,
            parentElement: null,
            parentNode: null,
            getBoundingClientRect: () => ({ width: 320, height: 64, top: 0, left: 0 }),
            querySelectorAll: selector => selector.startsWith('a[') ? [link] : [],
            dispatchEvent: () => true,
        };
        const link = {
            parentElement: row,
            parentNode: row,
            __hasAvatar: visibleAvatar,
            getAttribute: name => name === 'href' ? `/@${username}` : null,
            querySelectorAll: () => [],
            getBoundingClientRect: () => ({ width: 120, height: 48, top: 0, left: 0 }),
        };
        links.push(link);
    }
    const scroller = { tagName: 'DIV', scrollTop: 300, scrollHeight: 1000, clientHeight: 700, scrollBy() {}, dispatchEvent() {} };
    const dialog = {
        isConnected: true,
        innerText: 'Followers 200',
        textContent: 'Followers 200',
        getBoundingClientRect: () => ({ width: 500, height: 700, top: 0, left: 0 }),
        querySelectorAll: selector => selector.startsWith('a[') ? links : [],
        dispatchEvent() {},
        scrollBy() {},
    };
    documentMock.scrollingElement = scroller;
    return { dialog, scroller };
};

const installFixture = fixture => {
    Core.ThreeNoWatch.findActiveFollowersDialog = () => fixture.dialog;
    Core.ThreeNoWatch.findScrollContainer = () => fixture.scroller;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = link => link.__hasAvatar === true;
};

test.beforeEach(reset);

test('beta18 名冊 200 列涵蓋四種本輪處理狀態，順序與計數正確，寫入維持三次', async () => {
    const fixture = makeFixture();
    installFixture(fixture);
    let rosterWrites = 0;
    Storage.setThreeNoFollowerRoster = payload => {
        rosterWrites += 1;
        return original.setRoster(payload);
    };
    const knownUsers = new Set(Array.from({ length: 120 }, (_, index) => `known${String(index).padStart(4, '0')}`));
    try {
        Storage.beginThreeNoFollowerRoster({ scanId: 'three-no:beta18', scanTargetOwner: 'owner', scanDate: '2026-08-12', startedAt: 1 });
        const collection = await Core.ThreeNoWatch.collectFollowerUsernames(fixture.dialog, 'owner', {
            scanId: 'three-no:beta18',
            scanTargetOwner: 'owner',
            scanDate: '2026-08-12',
            startedAt: 1,
            batchSize: 200,
            skipUsers: knownUsers,
        });
        assert.equal(collection.usernames.length, 30);
        assert.equal(collection.triagedUsernames.length, 80, '既有 triage 進入數維持包含頭像預過濾列');
        const candidateUsers = collection.usernames.map(username => ({ username }));
        Storage.finalizeThreeNoFollowerRoster({
            scanId: 'three-no:beta18',
            scanTargetOwner: 'owner',
            scanDate: '2026-08-12',
            status: 'completed',
            findings: candidateUsers,
            finalizedUsernames: collection.usernames,
        });
        const roster = Storage.getThreeNoFollowerRoster();
        assert.equal(roster.rows.length, 200);
        assert.deepEqual(roster.rows.map(row => row.sequence), Array.from({ length: 200 }, (_, index) => index + 1));
        assert.deepEqual(roster.processingStatusCounts, {
            skipped_known: 120,
            skipped_visible_avatar: 50,
            triage_completed: 30,
            triage_incomplete: 0,
        });
        assert.equal(roster.rows.filter(row => row.processingStatus === 'skipped_known').length, 120);
        assert.equal(roster.rows.filter(row => row.processingStatus === 'skipped_visible_avatar').length, 50);
        assert.equal(roster.rows.filter(row => row.processingStatus === 'triage_completed').length, 30);
        assert.equal(roster.rows.filter(row => row.processingStatus === 'triage_incomplete').length, 0);
        assert.equal(roster.rows.slice(0, 120).every(row => row.isTriaged === false), true);
        assert.equal(roster.rows.slice(120, 170).every(row => row.isTriaged === true && row.finalized === true), true);
        assert.equal(roster.rows.slice(170).every(row => row.isThreeNo === true && row.finalized === true), true);
        assert.equal(rosterWrites, 3, 'beta17 的開始、收集、完成三次批次寫入仍維持');
    } finally {
        Storage.setThreeNoFollowerRoster = original.setRoster;
    }
});

test('beta18 捲動 log 保留欄位、第一筆、最後一筆與狀態轉換，匯出仍保留數字欄位', () => {
    const scanId = 'three-no:scroll-beta18';
    for (let iteration = 1; iteration <= 1000; iteration += 1) {
        Core.ThreeNoWatch.appendScanDebugLog({
            scanId,
            startedAt: 1,
            status: 'collecting_followers',
            debug: {
                step: 'collect_followers_scroll',
                iteration,
                maxIterations: 1000,
                seenCount: iteration + 20,
                linkCount: 12,
                skippedKnown: 8,
                scrollerTop: iteration * 10,
                scrollerHeight: 12000,
                scrollerClientHeight: 700,
                nearBottom: iteration >= 1000,
                changedSeen: iteration % 3 === 0,
                stagnant: iteration % 11,
            },
        });
    }
    Core.ThreeNoWatch.appendScanDebugLog({
        scanId,
        startedAt: 1,
        status: 'scanning',
        debug: { step: 'profile_probe_start', index: 0 },
    });
    const rows = Core.ThreeNoWatch.getScanDebugLog(scanId);
    const scrollRows = rows.filter(row => row.step === 'collect_followers_scroll');
    assert.ok(rows.length <= 600, `log 上限應維持 600，實際 ${rows.length}`);
    assert.ok(scrollRows.length < 1000, '中間捲動列應採抽樣');
    assert.equal(scrollRows[0].iteration, 1, '第一筆捲動列必須保留');
    assert.equal(scrollRows.at(-1).iteration, 1000, '最後一筆捲動列必須保留');
    for (const row of scrollRows) {
        for (const field of ['iteration', 'maxIterations', 'seenCount', 'linkCount', 'skippedKnown', 'scrollerTop', 'scrollerHeight', 'scrollerClientHeight', 'nearBottom', 'changedSeen', 'stagnant']) {
            assert.equal(Object.prototype.hasOwnProperty.call(row, field), true, `raw log 缺少 ${field}`);
        }
    }
    assert.equal(rows.some(row => row.status === 'scanning' && row.step === 'profile_probe_start'), true, '狀態轉換列必須保留');
    const projected = projectScanDebugLogForExport(rows, 80);
    const projectedScrollRows = projected.filter(row => row.step === 'collect_followers_scroll');
    assert.equal(projectedScrollRows[0].iteration, 1);
    assert.equal(projectedScrollRows.at(-1).iteration, 1000);
    assert.equal(projectedScrollRows.at(-1).stagnant, 10);
});

test('beta18 名冊超過 2000 筆時仍保留四種狀態總計', () => {
    const rows = Array.from({ length: 2050 }, (_, index) => ({
        username: `bounded${index}`,
        displayName: `名冊姓名${index}`,
        sequence: index + 1,
        isTriaged: index >= 120,
        hasVisibleAvatar: index >= 120 && index < 620,
        processingStatus: index < 120
            ? 'skipped_known'
            : (index < 620 ? 'skipped_visible_avatar' : (index < 920 ? 'triage_completed' : 'triage_incomplete')),
    }));
    Storage.setThreeNoFollowerRoster({
        scanId: 'three-no:bounded-beta18',
        observedCount: 2050,
        truncated: true,
        processingStatusCounts: {
            skipped_known: 120,
            skipped_visible_avatar: 500,
            triage_completed: 300,
            triage_incomplete: 1130,
        },
        rows,
    });
    const roster = Storage.getThreeNoFollowerRoster();
    assert.equal(roster.rows.length, 2000);
    assert.equal(roster.observedCount, 2050);
    assert.equal(roster.truncated, true);
    assert.deepEqual(roster.processingStatusCounts, {
        skipped_known: 120,
        skipped_visible_avatar: 500,
        triage_completed: 300,
        triage_incomplete: 1130,
    });
});

test.after(() => {
    CONFIG.VERSION = original.version;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = original.diagnosticsEnabled;
    CONFIG.THREE_NO_SCAN_FOLLOWER_ROSTER_LIMIT = original.limit;
    Utils.safeSleep = original.safeSleep;
    Core.ThreeNoWatch.waitForFollowersListMedia = original.waitForMedia;
    Core.ThreeNoWatch.findActiveFollowersDialog = original.findDialog;
    Core.ThreeNoWatch.findScrollContainer = original.findScroller;
    Core.ThreeNoWatch.isStopRequested = original.stopRequested;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = original.visibleAvatar;
    Storage.setThreeNoFollowerRoster = original.setRoster;
});

console.log('beta18 三無名冊狀態與捲動 log fixture: PASS');
