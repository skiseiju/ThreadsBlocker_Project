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

const localStorageMock = createStorageArea();
const sessionStorageMock = createStorageArea();
const eventTarget = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
};
const locationMock = {
    href: 'https://www.threads.com/@owner',
    origin: 'https://www.threads.com',
    pathname: '/@owner',
    search: '',
    reload: () => {},
    assign: () => {},
};
let fetchCalls = 0;
const windowMock = {
    ...eventTarget,
    location: locationMock,
    innerHeight: 800,
    innerWidth: 1200,
    open: () => null,
    close: () => {},
    fetch: () => { fetchCalls += 1; throw new Error('名冊 fixture 不得發出請求'); },
    scrollTo: () => {},
};
const documentMock = {
    ...eventTarget,
    body: { innerText: '', textContent: '', appendChild: () => {}, addEventListener: () => {}, removeEventListener: () => {} },
    scrollingElement: null,
    createElement: () => ({ style: {}, dataset: {}, click: () => {}, remove: () => {}, appendChild: () => {}, setAttribute: () => {} }),
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

const makeFixture = (count = 200, threeNoCount = 30) => {
    const links = [];
    const rows = [];
    for (let index = 0; index < count; index += 1) {
        const isThreeNo = index < threeNoCount;
        const username = isThreeNo ? `panda${10000 + index}` : `friend${String(index).padStart(4, '0')}`;
        const displayName = isThreeNo ? `可疑姓名${index}` : `一般姓名${index}`;
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
            __username: username,
            __hasAvatar: !isThreeNo,
            parentElement: row,
            parentNode: row,
            getAttribute: name => name === 'href' ? `/@${username}` : null,
            querySelectorAll: () => [],
            getBoundingClientRect: () => ({ width: 120, height: 48, top: 0, left: 0 }),
        };
        row.parentElement = null;
        row.parentNode = null;
        rows.push(row);
        links.push(link);
    }
    const scroller = {
        tagName: 'DIV',
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        scrollBy: () => {},
        dispatchEvent: () => true,
    };
    const dialog = {
        isConnected: true,
        innerText: `Followers ${count}`,
        textContent: `Followers ${count}`,
        parentElement: null,
        parentNode: null,
        getBoundingClientRect: () => ({ width: 500, height: 700, top: 0, left: 0 }),
        querySelectorAll: selector => selector.startsWith('a[') ? links : [],
        dispatchEvent: () => true,
        scrollBy: () => {},
    };
    documentMock.scrollingElement = scroller;
    return { dialog, links, rows, scroller };
};

const original = {
    version: CONFIG.VERSION,
    waitForFollowersListMedia: Core.ThreeNoWatch.waitForFollowersListMedia,
    findActiveFollowersDialog: Core.ThreeNoWatch.findActiveFollowersDialog,
    findScrollContainer: Core.ThreeNoWatch.findScrollContainer,
    isStopRequested: Core.ThreeNoWatch.isStopRequested,
    setScanState: Core.ThreeNoWatch.setScanState,
    followerListRowHasVisibleAvatar: Core.ThreeNoWatch.followerListRowHasVisibleAvatar,
    setRoster: Storage.setThreeNoFollowerRoster,
    getRoster: Storage.getThreeNoFollowerRoster,
};

const resetState = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    RuntimeDiagnostics.clear();
    fetchCalls = 0;
};

const installCollectorFixture = fixture => {
    Core.ThreeNoWatch.waitForFollowersListMedia = async () => {};
    Core.ThreeNoWatch.findActiveFollowersDialog = () => fixture.dialog;
    Core.ThreeNoWatch.findScrollContainer = () => fixture.scroller;
    Core.ThreeNoWatch.isStopRequested = () => false;
    Core.ThreeNoWatch.setScanState = () => true;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = link => link.__hasAvatar === true;
};

test('beta17 200 列名冊完整保留欄位、序號與三無結果，且名冊寫入不逐列增加', async () => {
    resetState();
    CONFIG.VERSION = '2.8.4-beta17';
    CONFIG.THREE_NO_SCAN_PREFILTER_AVATAR = true;
    const fixture = makeFixture(200, 30);
    installCollectorFixture(fixture);
    let rosterWrites = 0;
    Storage.setThreeNoFollowerRoster = payload => {
        rosterWrites += 1;
        return original.setRoster(payload);
    };
    let avatarReads = 0;
    const originalAvatar = Core.ThreeNoWatch.followerListRowHasVisibleAvatar;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = link => {
        avatarReads += 1;
        return originalAvatar(link);
    };
    try {
        Storage.beginThreeNoFollowerRoster({ scanId: 'three-no:beta17', scanTargetOwner: 'owner', scanDate: '2026-08-12', startedAt: 1 });
        const collection = await Core.ThreeNoWatch.collectFollowerUsernames(fixture.dialog, 'owner', {
            scanId: 'three-no:beta17',
            scanTargetOwner: 'owner',
            scanDate: '2026-08-12',
            startedAt: 1,
            batchSize: 200,
        });
        assert.equal(collection.triagedUsernames.length, 200, '現行 triage 應仍看見 200 列');
        assert.equal(collection.usernames.length, 30, '現行候選結果應仍只有 30 列');
        assert.equal(avatarReads, 200, '每列只沿用既有頭像 helper 一次');
        const findings = collection.usernames.map(username => ({ username }));
        Storage.finalizeThreeNoFollowerRoster({
            scanId: 'three-no:beta17',
            scanTargetOwner: 'owner',
            scanDate: '2026-08-12',
            status: 'completed',
            findings,
            finalizedUsernames: collection.usernames,
        });
        const roster = Storage.getThreeNoFollowerRoster();
        assert.equal(roster.rows.length, 200, '名冊應保留 200 筆');
        assert.deepEqual(roster.rows.map(row => row.sequence), Array.from({ length: 200 }, (_, index) => index + 1));
        assert.equal(roster.rows.every(row => row.displayName.length > 0), true, '名冊每列需有顯示名');
        assert.equal(roster.rows.every(row => typeof row.hasVisibleAvatar === 'boolean'), true, '名冊每列需有頭像旗標');
        assert.equal(roster.rows.filter(row => row.isThreeNo === true).length, 30, '名冊三無結果應有 30 筆');
        assert.equal(roster.rows.slice(0, 30).every(row => row.suspiciousUsername && row.hasVisibleAvatar === false), true);
        assert.equal(roster.rows.slice(30).every(row => row.suspiciousUsername === false && row.hasVisibleAvatar === true), true);
        assert.equal(roster.rows.every(row => row.finalized === true), true);
        assert.ok(rosterWrites <= 3, `名冊 storage 寫入應為固定批次，實際 ${rosterWrites} 次`);
        assert.ok(rosterWrites < roster.rows.length, '名冊 storage 寫入不得隨列數線性成長');
        assert.equal(fetchCalls, 0, 'fixture 未發出網路請求');
    } finally {
        Storage.setThreeNoFollowerRoster = original.setRoster;
    }
});

test('beta17 名冊超過 beta18 上限時只保留有界資料並標記截斷', () => {
    resetState();
    CONFIG.VERSION = '2.8.4-beta17';
    const rows = Array.from({ length: 2050 }, (_, index) => ({
        username: `overflow${index}`,
        displayName: `超量姓名${index}`,
        sequence: index + 1,
        hasVisibleAvatar: true,
    }));
    Storage.setThreeNoFollowerRoster({ scanId: 'three-no:bounded', observedCount: 2050, rows });
    const roster = Storage.getThreeNoFollowerRoster();
    assert.equal(roster.limit, 2000);
    assert.equal(roster.rows.length, 2000);
    assert.equal(roster.observedCount, 2050);
    assert.equal(roster.truncated, true);
    assert.deepEqual(roster.rows.map(row => row.sequence), Array.from({ length: 2000 }, (_, index) => index + 1));
});

test('beta17 正式版號完全不收集、不寫入、不提供名冊匯出', async () => {
    resetState();
    CONFIG.VERSION = '2.8.4';
    const fixture = makeFixture(200, 30);
    installCollectorFixture(fixture);
    let rosterWrites = 0;
    Storage.setThreeNoFollowerRoster = payload => {
        rosterWrites += 1;
        return original.setRoster(payload);
    };
    let avatarReads = 0;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = () => {
        avatarReads += 1;
        return true;
    };
    try {
        await Core.ThreeNoWatch.collectFollowerUsernames(fixture.dialog, 'owner', {
            scanId: 'three-no:stable',
            scanTargetOwner: 'owner',
            batchSize: 200,
        });
        original.setRoster({
            scanId: 'three-no:stable-direct-storage',
            rows: [{ username: 'stable-user', displayName: '正式版姓名' }],
        });
        assert.equal(rosterWrites, 0);
        assert.equal(avatarReads, 200, '正式版仍應沿用既有頭像預過濾 helper');
        assert.equal(localStorageMock.getItem(CONFIG.KEYS.THREE_NO_SCAN_FOLLOWER_ROSTER), null, '正式版 storage writer 也必須拒絕名冊');
        assert.equal(Storage.getThreeNoFollowerRoster().rows.length, 0);
        assert.equal(Core.buildThreeNoFollowerRosterExport(), null);
    } finally {
        Storage.setThreeNoFollowerRoster = original.setRoster;
    }
});

test('beta17 平台 payload、診斷 ring、bug report 附件都不含名冊欄位', () => {
    resetState();
    CONFIG.VERSION = '2.8.4-beta17';
    Storage.setThreeNoFollowerRoster({
        scanId: 'three-no:privacy',
        scanTargetOwner: 'owner',
        rows: [{ username: 'panda10000', displayName: '第三方中文姓名', sequence: 1, hasVisibleAvatar: false, suspiciousUsername: true, isTriaged: true, isThreeNo: true, finalized: true }],
    });
    RuntimeDiagnostics.record('three_no', 'rows', {
        username: 'panda10000',
        displayName: '第三方中文姓名',
        followerRoster: 'hege_three_no_scan_follower_roster',
        rowCount: 1,
    });
    const platformPayload = UI.buildPlatformExportPayload({ platformSyncEnabled: true, platformSyncLastAt: 0 });
    const diagnostics = RuntimeDiagnostics.export();
    const bugReportAttachment = Core.buildBugReportDiagnosticsBundle();
    assert.doesNotMatch(JSON.stringify(platformPayload), /第三方中文姓名|followerRoster|hege_three_no_scan_follower_roster/);
    assert.doesNotMatch(JSON.stringify(diagnostics), /第三方中文姓名|panda10000|followerRoster|hege_three_no_scan_follower_roster/);
    assert.doesNotMatch(JSON.stringify(bugReportAttachment), /第三方中文姓名|panda10000|followerRoster|hege_three_no_scan_follower_roster/);
    assert.match(JSON.stringify(Core.buildThreeNoFollowerRosterExport()), /第三方中文姓名/);
});

test.after(() => {
    CONFIG.VERSION = original.version;
    Core.ThreeNoWatch.waitForFollowersListMedia = original.waitForFollowersListMedia;
    Core.ThreeNoWatch.findActiveFollowersDialog = original.findActiveFollowersDialog;
    Core.ThreeNoWatch.findScrollContainer = original.findScrollContainer;
    Core.ThreeNoWatch.isStopRequested = original.isStopRequested;
    Core.ThreeNoWatch.setScanState = original.setScanState;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = original.followerListRowHasVisibleAvatar;
    Storage.setThreeNoFollowerRoster = original.setRoster;
    Storage.getThreeNoFollowerRoster = original.getRoster;
});

console.log('beta17 三無追蹤者名冊：200 列完整、正式版 gate、三道外送守門 PASS');
