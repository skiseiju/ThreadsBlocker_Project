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
const eventTarget = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
let profilePath = '/@candidate';
let fetchCalls = 0;
let assignedUrls = [];
const locationMock = {
    get href() { return `https://www.threads.com${profilePath}`; },
    origin: 'https://www.threads.com',
    get pathname() { return profilePath; },
    search: '',
    reload() {},
    assign(url) { assignedUrls.push(String(url)); },
};
const windowMock = {
    ...eventTarget,
    location: locationMock,
    innerHeight: 800,
    innerWidth: 1200,
    open: () => null,
    close() {},
    scrollTo() {},
    fetch() {
        fetchCalls += 1;
        throw new Error('beta19 fixture 不得發出請求');
    },
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
    value: {
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
        platform: 'MacIntel',
        maxTouchPoints: 0,
        language: 'zh-TW',
        onLine: true,
        clipboard: { writeText: async () => {} },
    },
});

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { UI } = await import('../src/ui.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
await import('../src/features/three-no-watch.js');

const original = {
    version: CONFIG.VERSION,
    safeSleep: Utils.safeSleep,
    pollUntil: Utils.pollUntil,
    waitForMedia: Core.ThreeNoWatch.waitForFollowersListMedia,
    findDialog: Core.ThreeNoWatch.findActiveFollowersDialog,
    findScroller: Core.ThreeNoWatch.findScrollContainer,
    stopRequested: Core.ThreeNoWatch.isStopRequested,
    setScanState: Core.ThreeNoWatch.setScanState,
    visibleAvatar: Core.ThreeNoWatch.followerListRowHasVisibleAvatar,
    bioCandidates: Core.ThreeNoWatch.getProfileBioCandidates,
    topText: Core.ThreeNoWatch.getProfileTopText,
    privateSignal: Core.ThreeNoWatch.readProfilePrivateSignal,
    contentSignal: Core.ThreeNoWatch.readProfileContentSignal,
    waitContentSignal: Core.ThreeNoWatch.waitForProfileContentSignal,
    metadata: Core.ThreeNoWatch.extractProfileMetadata,
    profileAvatar: Core.ThreeNoWatch.profileHasAvatar,
    setRoster: Storage.setThreeNoFollowerRoster,
};

const reset = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = '2.8.4-beta19';
    Utils.safeSleep = async () => {};
    Utils.pollUntil = async callback => callback();
    profilePath = '/@candidate';
    fetchCalls = 0;
    assignedUrls = [];
};

const makeCountNode = text => ({
    innerText: text,
    textContent: text,
    getAttribute: name => name === 'title' ? text : null,
    closest: () => null,
    getBoundingClientRect: () => ({ width: 180, height: 24, top: 96, left: 0 }),
    querySelectorAll: () => [],
});

const installProfileFixture = texts => {
    const nodes = texts.map(makeCountNode);
    const root = {
        innerText: texts.join('\n'),
        textContent: texts.join('\n'),
        querySelector: () => nodes[0] || null,
        querySelectorAll: () => nodes,
    };
    documentMock.querySelector = selector => selector === 'main, div[role="main"]' ? root : null;
    Core.ThreeNoWatch.getProfileBioCandidates = () => [];
    Core.ThreeNoWatch.getProfileTopText = () => [];
    Core.ThreeNoWatch.readProfilePrivateSignal = () => ({ private: false, reason: '', matchedText: '' });
    Core.ThreeNoWatch.readProfileContentSignal = () => ({ known: true, hasContent: true, reason: 'fixture_content' });
    Core.ThreeNoWatch.waitForProfileContentSignal = async () => ({ known: true, hasContent: true, reason: 'fixture_content' });
    Core.ThreeNoWatch.extractProfileMetadata = async () => ({ debug: {} });
    Core.ThreeNoWatch.profileHasAvatar = () => false;
    return root;
};

const installRosterCollectorFixture = rows => {
    const links = rows.map(({ username, displayName }) => {
        const row = {
            isConnected: true,
            innerText: `${displayName}\n${username}\nFollowing`,
            textContent: `${displayName}\n${username}\nFollowing`,
            parentElement: null,
            parentNode: null,
            getBoundingClientRect: () => ({ width: 320, height: 64, top: 0, left: 0 }),
            querySelectorAll: selector => selector.startsWith('a[') ? [link] : [],
            dispatchEvent() { return true; },
        };
        const link = {
            parentElement: row,
            parentNode: row,
            getAttribute: name => name === 'href' ? `/@${username}` : null,
            querySelectorAll: () => [],
            getBoundingClientRect: () => ({ width: 120, height: 48, top: 0, left: 0 }),
        };
        return link;
    });
    const scroller = {
        tagName: 'DIV',
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        scrollBy() {},
        dispatchEvent() {},
    };
    const dialog = {
        isConnected: true,
        innerText: `Followers ${links.length}`,
        textContent: `Followers ${links.length}`,
        getBoundingClientRect: () => ({ width: 500, height: 700, top: 0, left: 0 }),
        querySelectorAll: selector => selector.startsWith('a[') ? links : [],
        dispatchEvent() {},
        scrollBy() {},
    };
    documentMock.scrollingElement = scroller;
    Core.ThreeNoWatch.waitForFollowersListMedia = async () => {};
    Core.ThreeNoWatch.findActiveFollowersDialog = () => dialog;
    Core.ThreeNoWatch.findScrollContainer = () => scroller;
    Core.ThreeNoWatch.isStopRequested = () => false;
    Core.ThreeNoWatch.setScanState = () => true;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = () => false;
    return { dialog, scroller, links };
};

const runProfile = async texts => {
    installProfileFixture(texts);
    return Core.ThreeNoWatch.evaluateCurrentProfileProbe('candidate', 'base');
};

test.beforeEach(reset);

test('beta19 profile fixture 同時擷取粉絲與追蹤中數量，原文樣式進入名冊', async () => {
    const probe = await runProfile(['1,234 位粉絲', '57 位追蹤中']);
    assert.equal(probe.followerCount, 1234);
    assert.equal(probe.followerCountKnown, true);
    assert.equal(probe.followingCount, 57);
    assert.equal(probe.followingCountKnown, true);
    assert.equal(probe.followerCountMatchedText, '1,234 位粉絲');
    assert.equal(probe.followingCountMatchedText, '57 位追蹤中');
    assert.equal(probe.followerCountProbeReason, 'matched');
    assert.equal(probe.followingCountProbeReason, 'matched');

    Storage.beginThreeNoFollowerRoster({ scanId: 'three-no:beta19-counts', scanTargetOwner: 'owner', scanDate: '2026-08-12', startedAt: 1 });
    Storage.setThreeNoFollowerRoster({
        scanId: 'three-no:beta19-counts',
        rows: [{ username: 'candidate', displayName: '王大明 王', sequence: 1 }],
    });
    const rosterEvidence = Core.ThreeNoWatch.buildFollowerRosterProfileEvidence(
        Core.ThreeNoWatch.buildProfileResultFromProbes('candidate', { base: probe }),
    );
    Storage.finalizeThreeNoFollowerRoster({
        scanId: 'three-no:beta19-counts',
        status: 'completed',
        finalizedUsernames: ['candidate'],
        profileEvidence: { candidate: rosterEvidence },
    });
    const row = Storage.getThreeNoFollowerRoster().rows[0];
    assert.equal(row.followerCount, 1234);
    assert.equal(row.followerCountKnown, true);
    assert.equal(row.followingCount, 57);
    assert.equal(row.followingCountKnown, true);
    assert.equal(row.followerCountMatchedText, '1,234 位粉絲');
    assert.equal(row.followingCountMatchedText, '57 位追蹤中');
    assert.equal(row.profileOpened, true);
    assert.equal(fetchCalls, 0, 'profile fixture 不得發出請求');
    assert.equal(assignedUrls.length, 0, 'profile fixture 不得額外開頁');
});

test('beta19 只有粉絲數時追蹤中明確記為找不到，三無判定不變', async () => {
    const withFollowerOnly = await runProfile(['321 followers']);
    const withoutCounts = await runProfile([]);
    assert.equal(withFollowerOnly.followerCount, 321);
    assert.equal(withFollowerOnly.followerCountKnown, true);
    assert.equal(withFollowerOnly.followingCount, 0);
    assert.equal(withFollowerOnly.followingCountKnown, false);
    assert.equal(withFollowerOnly.followingCountProbeReason, 'not_found');
    assert.deepEqual(withFollowerOnly.followingCountProbeStrategies, [
        'number_before_zh_following',
        'label_before_zh_following',
        'number_before_en_following',
        'label_before_en_following',
    ]);
    for (const field of ['noAvatar', 'noBio', 'noPosts', 'noReplies', 'noReposts', 'accountPrivate', 'suspiciousUsername', 'isThreeNo']) {
        assert.equal(withFollowerOnly[field], withoutCounts[field], `追蹤中取證不得改變 ${field}`);
    }

    Storage.beginThreeNoFollowerRoster({ scanId: 'three-no:beta19-missing', scanTargetOwner: 'owner', scanDate: '2026-08-12', startedAt: 1 });
    Storage.setThreeNoFollowerRoster({
        scanId: 'three-no:beta19-missing',
        rows: [{ username: 'candidate', displayName: '正常姓名', sequence: 1 }],
    });
    Storage.finalizeThreeNoFollowerRoster({
        scanId: 'three-no:beta19-missing',
        status: 'completed',
        finalizedUsernames: ['candidate'],
        profileEvidence: {
            candidate: Core.ThreeNoWatch.buildFollowerRosterProfileEvidence(
                Core.ThreeNoWatch.buildProfileResultFromProbes('candidate', { base: withFollowerOnly }),
            ),
        },
    });
    const row = Storage.getThreeNoFollowerRoster().rows[0];
    assert.equal(row.followerCount, 321);
    assert.equal(row.followerCountKnown, true);
    assert.equal(row.followingCount, 0);
    assert.equal(row.followingCountKnown, false);
    assert.equal(row.followingCountProbeReason, 'not_found');
    assert.equal(fetchCalls, 0, '找不到追蹤中數量不得以請求補查');
});

test('beta19 名冊三種中文顯示名與阿拉伯帳號的兩個命名旗標正確', async () => {
    const fixture = installRosterCollectorFixture([
        { username: 'repeat-wang', displayName: '王大明 王' },
        { username: 'repeat-jian', displayName: '簡大花 簡' },
        { username: 'normal-user', displayName: '正常中文名' },
        { username: 'حساب1234', displayName: '普通姓名' },
    ]);
    Storage.beginThreeNoFollowerRoster({ scanId: 'three-no:beta19-names', scanTargetOwner: 'owner', scanDate: '2026-08-12', startedAt: 1 });
    const collection = await Core.ThreeNoWatch.collectFollowerUsernames(fixture.dialog, 'owner', {
        scanId: 'three-no:beta19-names',
        scanTargetOwner: 'owner',
        scanDate: '2026-08-12',
        startedAt: 1,
        batchSize: 4,
    });
    assert.equal(collection.triagedUsernames.length, 4);
    const rows = Storage.getThreeNoFollowerRoster().rows;
    assert.equal(rows.length, 4);
    assert.equal(rows[0].displayNameEndsWithRepeatedSurname, true);
    assert.equal(rows[1].displayNameEndsWithRepeatedSurname, true);
    assert.equal(rows[2].displayNameEndsWithRepeatedSurname, false);
    assert.equal(rows[3].displayNameEndsWithRepeatedSurname, false);
    assert.equal(rows[0].hasArabicPersianText, false);
    assert.equal(rows[1].hasArabicPersianText, false);
    assert.equal(rows[2].hasArabicPersianText, false);
    assert.equal(rows[3].hasArabicPersianText, true);
    assert.equal(rows.every(row => row.followerCountKnown === false && row.followingCountKnown === false), true);
});

test('beta19 storage 寫入維持 beta18 固定批次水準，三道外送與正式版 gate 不變', async () => {
    let rosterWrites = 0;
    Storage.setThreeNoFollowerRoster = payload => {
        rosterWrites += 1;
        return original.setRoster(payload);
    };
    try {
        Storage.beginThreeNoFollowerRoster({ scanId: 'three-no:beta19-privacy', scanTargetOwner: 'owner', scanDate: '2026-08-12', startedAt: 1 });
        Storage.setThreeNoFollowerRoster({
            scanId: 'three-no:beta19-privacy',
            rows: [{
                username: 'حساب1234',
                displayName: '王大明 王',
                displayNameEndsWithRepeatedSurname: true,
                hasArabicPersianText: true,
                followerCount: 1234,
                followerCountKnown: true,
                followingCount: 57,
                followingCountKnown: true,
                profileOpened: true,
            }],
        });
        Storage.finalizeThreeNoFollowerRoster({ scanId: 'three-no:beta19-privacy', status: 'completed' });
        assert.equal(rosterWrites, 3, '名冊寫入次數應維持 begin、batch、finalize 三次');
        assert.equal(localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_FOLLOWER_ROSTER) !== null, true);

        const platformPayload = UI.buildPlatformExportPayload({ platformSyncEnabled: true, platformSyncLastAt: 0 });
        const diagnostics = RuntimeDiagnostics.export();
        const bugReportAttachment = Core.buildBugReportDiagnosticsBundle();
        for (const payload of [platformPayload, diagnostics, bugReportAttachment]) {
            const serialized = JSON.stringify(payload);
            assert.doesNotMatch(serialized, /displayNameEndsWithRepeatedSurname|hasArabicPersianText|followingCount|followerCountMatchedText|حساب1234|王大明 王/);
        }

        CONFIG.VERSION = '2.8.4';
        localStorageMock.clear();
        Storage.cache = {};
        rosterWrites = 0;
        const stableFixture = installRosterCollectorFixture([{ username: 'stable-user', displayName: '王大明 王' }]);
        await Core.ThreeNoWatch.collectFollowerUsernames(stableFixture.dialog, 'owner', {
            scanId: 'three-no:stable',
            scanTargetOwner: 'owner',
            batchSize: 1,
        });
        assert.equal(rosterWrites, 0, '正式版不得收集或寫入名冊');
        assert.equal(localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_FOLLOWER_ROSTER), null);
        assert.equal(Core.buildThreeNoFollowerRosterExport(), null);
    } finally {
        Storage.setThreeNoFollowerRoster = original.setRoster;
    }
});

test.after(() => {
    CONFIG.VERSION = original.version;
    Utils.safeSleep = original.safeSleep;
    Utils.pollUntil = original.pollUntil;
    Core.ThreeNoWatch.waitForFollowersListMedia = original.waitForMedia;
    Core.ThreeNoWatch.findActiveFollowersDialog = original.findDialog;
    Core.ThreeNoWatch.findScrollContainer = original.findScroller;
    Core.ThreeNoWatch.isStopRequested = original.stopRequested;
    Core.ThreeNoWatch.setScanState = original.setScanState;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = original.visibleAvatar;
    Core.ThreeNoWatch.getProfileBioCandidates = original.bioCandidates;
    Core.ThreeNoWatch.getProfileTopText = original.topText;
    Core.ThreeNoWatch.readProfilePrivateSignal = original.privateSignal;
    Core.ThreeNoWatch.readProfileContentSignal = original.contentSignal;
    Core.ThreeNoWatch.waitForProfileContentSignal = original.waitContentSignal;
    Core.ThreeNoWatch.extractProfileMetadata = original.metadata;
    Core.ThreeNoWatch.profileHasAvatar = original.profileAvatar;
    Storage.setThreeNoFollowerRoster = original.setRoster;
});

console.log('beta19 三無 profile count、命名旗標、storage 與外送守門 fixture: PASS');
