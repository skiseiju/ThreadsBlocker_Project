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
const { Utils } = await import('../src/utils.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const {
    countConfirmedThreeNoFindings,
    matchesEnglishNameMirrorUsername,
    usernameLooksLikeEnglishNameMirrorShape,
} = await import('../src/features/three-no-watch.js');

const original = {
    version: CONFIG.VERSION,
    diagnostics: CONFIG.ENABLE_BETA_DIAGNOSTICS,
    prefilterAvatar: CONFIG.THREE_NO_SCAN_PREFILTER_AVATAR,
    waitForMedia: Core.ThreeNoWatch.waitForFollowersListMedia,
    findDialog: Core.ThreeNoWatch.findActiveFollowersDialog,
    findScroller: Core.ThreeNoWatch.findScrollContainer,
    isStopRequested: Core.ThreeNoWatch.isStopRequested,
    setScanState: Core.ThreeNoWatch.setScanState,
    safeSleep: Utils.safeSleep,
    visibleAvatar: Core.ThreeNoWatch.followerListRowHasVisibleAvatar,
    displayName: Core.ThreeNoWatch.followerListDisplayName,
};

const profileResult = (username, displayName, base = {}) => Core.ThreeNoWatch.buildProfileResultFromProbes(username, {
    base: {
        noAvatar: false,
        noBio: false,
        accountPrivate: false,
        suspiciousUsername: false,
        displayName,
        postsSignal: { known: true, hasContent: true },
        ...base,
    },
    replies: { known: true, hasContent: true },
    reposts: { known: true, hasContent: true },
});

const makeFollowerFixture = () => {
    const definitions = [
        { username: 'ordinary-user', displayName: 'Ordinary User' },
        { username: 'kennethberryaei31413', displayName: 'Kenneth Berry' },
    ];
    const links = definitions.map(({ username, displayName }) => {
        const row = {
            isConnected: true,
            innerText: `${displayName}\n${username}\nFollowing`,
            textContent: `${displayName}\n${username}\nFollowing`,
            parentElement: null,
            parentNode: null,
            getBoundingClientRect: () => ({ width: 320, height: 64, top: 0, left: 0 }),
            querySelectorAll: selector => selector.startsWith('a[') ? [link] : [],
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
        scrollBy: () => {},
        dispatchEvent: () => {},
    };
    const dialog = {
        isConnected: true,
        innerText: 'Followers 2',
        textContent: 'Followers 2',
        getBoundingClientRect: () => ({ width: 500, height: 700, top: 0, left: 0 }),
        querySelectorAll: selector => selector.startsWith('a[') ? links : [],
        scrollBy: () => {},
    };
    return { dialog, scroller };
};

test('beta32 英文名鏡像四筆樣本命中，真人與非英文顯示名不誤判', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta34');
    const samples = [
        ['Kenneth Berry', 'kennethberryaei31413'],
        ['Laura Reed', 'laurareedbbb68029'],
        ['Timothy Hodge', 'timothyhodgeyft36541'],
        ['Ernest Lopez', 'ernestlopezgei67416'],
    ];
    for (const [displayName, username] of samples) {
        assert.equal(usernameLooksLikeEnglishNameMirrorShape(username), true, `${username} cheap shape mismatch`);
        assert.equal(matchesEnglishNameMirrorUsername(username, displayName), true, `${username} should match`);
        assert.equal(Core.ThreeNoWatch.matchesEnglishNameMirrorUsername(username, displayName), true);
    }
    assert.equal(matchesEnglishNameMirrorUsername('johnsmith12345', 'John Smith'), false, 'plain name plus digits is not a mirror suffix');
    assert.equal(matchesEnglishNameMirrorUsername('wangxiaomingabc12345', '王小明'), false, 'Chinese display name must not normalize into a match');
    assert.equal(matchesEnglishNameMirrorUsername('randomuserabc12345', 'Kenneth Berry'), false, 'unrelated username must not match');
    assert.equal(matchesEnglishNameMirrorUsername('kennethberryaei31413', 'K3nneth Berry'), false, 'display name normalization must retain only a-z');
});

test('beta32 有頭像鏡像帳號通過 prefilter，便宜條件未命中不抽取顯示名', async () => {
    CONFIG.ENABLE_BETA_DIAGNOSTICS = false;
    CONFIG.THREE_NO_SCAN_PREFILTER_AVATAR = true;
    RuntimeDiagnostics.clear();
    const fixture = makeFollowerFixture();
    Core.ThreeNoWatch.waitForFollowersListMedia = async () => {};
    Core.ThreeNoWatch.findActiveFollowersDialog = () => fixture.dialog;
    Core.ThreeNoWatch.findScrollContainer = () => fixture.scroller;
    Core.ThreeNoWatch.isStopRequested = () => false;
    Core.ThreeNoWatch.setScanState = () => true;
    Utils.safeSleep = async () => {};
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = () => true;
    let displayNameCalls = 0;
    Core.ThreeNoWatch.followerListDisplayName = (...args) => {
        displayNameCalls += 1;
        return original.displayName(...args);
    };

    const collection = await Core.ThreeNoWatch.collectFollowerUsernames(fixture.dialog, 'owner', {
        batchSize: 10,
        skipUsers: [],
    });
    assert.deepEqual(collection.usernames, ['kennethberryaei31413'], '有頭像鏡像帳號不得被 skip');
    assert.deepEqual(collection.triagedUsernames, ['ordinary-user', 'kennethberryaei31413']);
    assert.equal(displayNameCalls, 1, '只有便宜形狀命中的列可抽取顯示名');

    const active = profileResult('kennethberryaei31413', 'Kenneth Berry');
    assert.equal(active.englishNameMirrorMatch, true);
    assert.equal(active.isThreeNo, false, '三項內容都有時鏡像訊號不得判三無');
    assert.equal((active.isThreeNo || active.pinyinNameMatch || active.englishNameMirrorMatch), true, '鏡像命中應通過 findings 閘門');
});

test('beta32 英文名鏡像對稱進三無公式，活動與私密仍保留邊界', () => {
    const mirrorEmpty = profileResult('kennethberryaei31413', 'Kenneth Berry', {
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(mirrorEmpty.englishNameMirrorMatch, true);
    assert.equal(mirrorEmpty.noPosts, true);
    assert.equal(mirrorEmpty.isThreeNo, true, '鏡像命中且至少一項內容為空應判三無');

    const mirrorActive = profileResult('kennethberryaei31413', 'Kenneth Berry', {
        postsSignal: { known: true, hasContent: true },
    });
    assert.equal(mirrorActive.englishNameMirrorMatch, true);
    assert.equal(mirrorActive.isThreeNo, false, '鏡像命中但三項內容都有不得判三無');
    assert.equal((mirrorActive.isThreeNo || mirrorActive.englishNameMirrorMatch), true, '活躍鏡像帳號仍應進待審清單');

    const mirrorPrivate = profileResult('kennethberryaei31413', 'Kenneth Berry', {
        accountPrivate: true,
        postsSignal: { known: true, hasContent: false },
    });
    assert.equal(mirrorPrivate.englishNameMirrorMatch, true);
    assert.equal(mirrorPrivate.noPosts, false, '私密帳號的發文旗標必須沿 ADR 0022 強制為 false');
    assert.equal(mirrorPrivate.noReplies, false, '私密帳號的回文旗標必須沿 ADR 0022 強制為 false');
    assert.equal(mirrorPrivate.noReposts, false, '私密帳號的轉發旗標必須沿 ADR 0022 強制為 false');
    assert.equal(mirrorPrivate.isThreeNo, false, '私密鏡像帳號不得經新路徑進三無');
});

test('beta32 finding 持久化與統計只計三無，UI 掛英文名鏡像琥珀標籤', async () => {
    const mirrorActive = { username: 'kennethberryaei31413', isThreeNo: false, englishNameMirrorMatch: true };
    const mirrorEmpty = { username: 'laurareedbbb68029', isThreeNo: true, englishNameMirrorMatch: true };
    const mirrorPrivate = { username: 'timothyhodgeyft36541', isThreeNo: false, accountPrivate: true, englishNameMirrorMatch: true };
    const ordinaryThreeNo = { username: 'ordinary-user', isThreeNo: true, englishNameMirrorMatch: false };
    const mixedFindings = [mirrorActive, mirrorEmpty, mirrorPrivate, ordinaryThreeNo];
    const trueThreeNoCount = mixedFindings.filter(item => item.isThreeNo === true).length;
    assert.equal(countConfirmedThreeNoFindings(mixedFindings), trueThreeNoCount, '三無數字只能等於真正 isThreeNo 的筆數');
    assert.equal(trueThreeNoCount, 2);
    const persisted = Storage.setThreeNoScanResults({ users: mixedFindings, status: 'completed', completedAt: 1 });
    assert.equal(persisted.users[0].englishNameMirrorMatch, true);
    assert.equal(Storage.getThreeNoScanResults().users[0].englishNameMirrorMatch, true);
    assert.equal(Storage.getThreeNoScanResults().threeNoFollowersCount, trueThreeNoCount);

    const source = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
    assert.match(source, /item\.englishNameMirrorMatch === true && item\.isThreeNo !== true/);
    assert.match(source, /英文名鏡像・疑似批次註冊/);
    assert.match(source, /amber: \['#ffd27a', 'rgba\(255,190,80,0\.50\)', 'rgba\(255,190,80,0\.12\)'\]/);
});

test.after(() => {
    CONFIG.VERSION = original.version;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = original.diagnostics;
    CONFIG.THREE_NO_SCAN_PREFILTER_AVATAR = original.prefilterAvatar;
    Core.ThreeNoWatch.waitForFollowersListMedia = original.waitForMedia;
    Core.ThreeNoWatch.findActiveFollowersDialog = original.findDialog;
    Core.ThreeNoWatch.findScrollContainer = original.findScroller;
    Core.ThreeNoWatch.isStopRequested = original.isStopRequested;
    Core.ThreeNoWatch.setScanState = original.setScanState;
    Utils.safeSleep = original.safeSleep;
    Core.ThreeNoWatch.followerListRowHasVisibleAvatar = original.visibleAvatar;
    Core.ThreeNoWatch.followerListDisplayName = original.displayName;
});

console.log('beta32 english-name mirror: PASS samples, avatar bypass, bounded display extraction, finding persistence, count, UI badge');
