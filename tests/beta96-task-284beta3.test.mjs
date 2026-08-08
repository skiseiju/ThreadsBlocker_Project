import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
const fixtureLocation = {
    pathname: '/@fixture_user',
    search: '',
    hash: '',
    href: 'https://threads.net/@fixture_user',
    origin: 'https://threads.net',
    reload: () => {},
};

globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
globalThis.location = fixtureLocation;
globalThis.history = { replaceState() {} };
globalThis.window = {
    location: fixtureLocation,
    hegeLog: null,
    innerWidth: 1200,
    innerHeight: 900,
    outerWidth: 1200,
    outerHeight: 900,
    devicePixelRatio: 1,
    screen: { availWidth: 1600, availHeight: 1000 },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    close() {},
};
globalThis.document = {
    title: '',
    body: { innerText: '', textContent: '', appendChild() {} },
    documentElement: { appendChild() {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    dispatchEvent: () => true,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, remove() {} }),
    addEventListener() {},
};
globalThis.BroadcastChannel = class {
    postMessage() {}
    close() {}
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core } = await import('../src/core.js');
const {
    Worker,
    PROFILE_ROOT_WAIT_MS,
    PROFILE_ROOT_RETRY_TTL_MS,
} = await import('../src/worker.js');
await import('../src/features/report-flow.js');

const originalPollUntil = Utils.pollUntil;
const originalGetSpeedProfile = Utils.getSpeedProfile;
const originalFindProfileRoot = Core.findProfileRoot;
const originalRecordDiagnostic = Worker.recordSafetyDiagnostic;
const originalIsStopRequested = Worker.isStopRequested;
const originalCanReload = Worker.canReloadCurrentPage;
const originalReload = Worker.reloadCurrentPage;
const originalHandleStop = Worker.handleStopRequested;
const originalCreateStatusUI = Worker.createStatusUI;
const originalEnforceWindowBounds = Worker.enforceWindowBounds;
const originalLoadStats = Worker.loadStats;
const originalPersistDiagnostics = Worker.persistDiagnostics;

const resetFixture = () => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    fixtureLocation.pathname = '/@fixture_user';
    fixtureLocation.search = '';
    fixtureLocation.hash = '';
    fixtureLocation.href = 'https://threads.net/@fixture_user';
    document.body.innerText = '';
    document.body.textContent = '';
    Worker._stopHandled = false;
    Worker._diagnosticOperationId = null;
    Worker._diagnosticExecutionId = null;
    Worker._diagnosticPersistAt = 0;
};

const useInstantPoll = () => {
    Utils.pollUntil = async conditionFn => conditionFn() || null;
};

const measurePollBudget = async (maxMs, mode, options) => {
    const realNow = Date.now;
    const realSetTimeout = globalThis.setTimeout;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    globalThis.setTimeout = (callback, intervalMs) => {
        fakeNow += intervalMs;
        callback();
        return 0;
    };
    Storage.set(CONFIG.KEYS.SPEED_MODE, mode);
    try {
        await Utils.pollUntil(() => null, maxMs, 100, options);
        return fakeNow - 1_000_000;
    } finally {
        Date.now = realNow;
        globalThis.setTimeout = realSetTimeout;
    }
};

test.after(() => {
    Utils.pollUntil = originalPollUntil;
    Utils.getSpeedProfile = originalGetSpeedProfile;
    Core.findProfileRoot = originalFindProfileRoot;
    Worker.recordSafetyDiagnostic = originalRecordDiagnostic;
    Worker.isStopRequested = originalIsStopRequested;
    Worker.canReloadCurrentPage = originalCanReload;
    Worker.reloadCurrentPage = originalReload;
    Worker.handleStopRequested = originalHandleStop;
    Worker.createStatusUI = originalCreateStatusUI;
    Worker.enforceWindowBounds = originalEnforceWindowBounds;
    Worker.loadStats = originalLoadStats;
    Worker.persistDiagnostics = originalPersistDiagnostics;
});

test('甲：四種速度模式的 profile root 等待一律使用 12000ms，且不讀取速度倍率', async () => {
    resetFixture();
    Core.findProfileRoot = () => null;
    Utils.getSpeedProfile = () => { throw new Error('profile root 不得讀取速度倍率'); };
    const waits = {};
    const realNow = Date.now;
    const realSetTimeout = globalThis.setTimeout;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    globalThis.setTimeout = (callback, intervalMs) => {
        fakeNow += intervalMs;
        callback();
        return 0;
    };
    try {
        for (const mode of ['smart', 'stable', 'standard', 'turbo']) {
            resetFixture();
            Storage.set(CONFIG.KEYS.SPEED_MODE, mode);
            fakeNow = 1_000_000;
            const result = await Worker.resolveProfileRootWithRetry(`speed_${mode}`, {
                mode: 'block',
                findRoot: () => null,
            });
            waits[mode] = result.waitMs;
            assert.equal(result.waitMs, PROFILE_ROOT_WAIT_MS, `${mode} profile root wait`);
        }
    } finally {
        Date.now = realNow;
        globalThis.setTimeout = realSetTimeout;
        Utils.getSpeedProfile = originalGetSpeedProfile;
    }
    console.log(JSON.stringify({ fixture: 'profile-root-speed-modes', waits, waitBudgetMs: PROFILE_ROOT_WAIT_MS }));
});

test('甲：其他三個 pollUntil 呼叫點仍維持速度倍率與 2 秒下限', async () => {
    resetFixture();
    const samples = [
        { callSite: 'Worker.findMoreButton', maxMs: 12000 },
        { callSite: 'Worker.verifyBlock menu wait', maxMs: 5000 },
        { callSite: 'main.js sweep bootstrap', maxMs: 9000 },
    ];
    const measured = [];
    for (const sample of samples) {
        const turboMs = await measurePollBudget(sample.maxMs, 'turbo');
        const stableMs = await measurePollBudget(sample.maxMs, 'stable');
        const expectedTurbo = Math.max(2000, Math.round(sample.maxMs * CONFIG.SPEED_PROFILES.turbo.multiplier));
        const expectedStable = Math.max(2000, Math.round(sample.maxMs * CONFIG.SPEED_PROFILES.stable.multiplier));
        assert.equal(turboMs, expectedTurbo, `${sample.callSite} turbo budget`);
        assert.equal(stableMs, expectedStable, `${sample.callSite} stable budget`);
        measured.push({ ...sample, turboMs, stableMs });
    }
    const [workerSource, reportSource, mainSource] = await Promise.all([
        readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
    ]);
    assert.match(workerSource, /findMoreButton: async[\s\S]*?Utils\.pollUntil\([\s\S]*?timeout, 200\)/);
    assert.match(reportSource, /findPostContentMoreButton\(\)[\s\S]*?Utils\.pollUntil\([\s\S]*?PROFILE_ROOT_WAIT_MS, 150\)/);
    assert.match(mainSource, /Utils\.pollUntil\(\(\) => document\.querySelector\([\s\S]*?10000\)/);
    console.log(JSON.stringify({ fixture: 'other-poll-unscaled-contract', measured }));
});

test('乙：超過時效的殘留標記會清除，重新取得完整兩輪機會', async () => {
    resetFixture();
    useInstantPoll();
    Core.findProfileRoot = () => null;
    Storage.setJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, {
        user: 'stale_user',
        mode: 'block',
        attempt: 1,
        requestedAt: Date.now() - PROFILE_ROOT_RETRY_TTL_MS - 1,
    });
    const first = await Worker.resolveProfileRootWithRetry('stale_user', {
        mode: 'block',
        findRoot: () => null,
    });
    assert.equal(first.attempt, 1);
    assert.equal(first.retryRequested, true);
    let rootAvailable = true;
    const second = await Worker.resolveProfileRootWithRetry('stale_user', {
        mode: 'block',
        findRoot: () => rootAvailable ? { id: 'profile-root' } : null,
    });
    assert.equal(second.attempt, 2);
    assert.equal(second.reason, 'success');
    console.log(JSON.stringify({ fixture: 'stale-retry-marker', ttlMs: PROFILE_ROOT_RETRY_TTL_MS, attempts: [first.attempt, second.attempt] }));
});

test('乙：時效內標記只識別一次 attempt 2，不會無限重載', () => {
    resetFixture();
    Storage.setJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, {
        user: 'fresh_user',
        mode: 'report',
        attempt: 1,
        requestedAt: Date.now() - PROFILE_ROOT_RETRY_TTL_MS + 1,
    });
    assert.equal(Worker.getProfileRootRetryAttempt('fresh_user', 'report'), 2);
    assert.equal(Worker.getProfileRootRetryAttempt('fresh_user', 'report'), 2);
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null).user, 'fresh_user');
});

test('乙：requestedAt 缺漏、非數字、未來時間都回 attempt 1 並清除', () => {
    const cases = [
        { label: 'missing', requestedAt: undefined },
        { label: 'non-number', requestedAt: '1700000000000' },
        { label: 'future', requestedAt: Date.now() + 1 },
    ];
    for (const item of cases) {
        resetFixture();
        Storage.setJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, {
            user: `invalid_${item.label}`,
            mode: 'block',
            attempt: 1,
            requestedAt: item.requestedAt,
        });
        assert.equal(Worker.getProfileRootRetryAttempt(`invalid_${item.label}`, 'block'), 1, item.label);
        assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null, item.label);
    }
});

test('丙：重載發出前收到停止時不呼叫 reload，交回既有 stopped 收尾', async () => {
    resetFixture();
    useInstantPoll();
    Core.findProfileRoot = () => null;
    Worker.recordSafetyDiagnostic = () => {};
    Worker.canReloadCurrentPage = () => true;
    let reloadCount = 0;
    Worker.reloadCurrentPage = () => { reloadCount += 1; return true; };
    let stopChecks = 0;
    Worker.isStopRequested = () => ++stopChecks >= 4;
    const result = await Worker.autoBlock('stop_before_profile_root_reload');
    assert.equal(result, 'stopped');
    assert.equal(reloadCount, 0);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
    console.log(JSON.stringify({ fixture: 'stop-before-reload', stopChecks, reloads: reloadCount, final: result }));
});

test('丙：只檢舉重載發出前收到停止時同樣不呼叫 reload', async () => {
    resetFixture();
    useInstantPoll();
    Core.findProfileRoot = () => null;
    Worker.canReloadCurrentPage = () => true;
    let reloadCount = 0;
    Worker.reloadCurrentPage = () => { reloadCount += 1; return true; };
    let stopChecks = 0;
    Worker.isStopRequested = () => ++stopChecks >= 4;
    const result = await Core.ReportDriver.waitForProfileRoot('report_stop_before_reload');
    assert.equal(result.reason, 'stopped');
    assert.equal(reloadCount, 0);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
});

test('丙：重載後初始化若已有停止指令，不會排入第二輪等待', async () => {
    resetFixture();
    Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
    const scheduled = [];
    const realSetTimeout = globalThis.setTimeout;
    let handled = 0;
    Worker.handleStopRequested = () => { handled += 1; return true; };
    Worker.createStatusUI = () => {};
    Worker.enforceWindowBounds = () => false;
    Worker.loadStats = () => {};
    Worker.persistDiagnostics = () => {};
    globalThis.setTimeout = (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
        return scheduled.length;
    };
    try {
        await Worker.init();
    } finally {
        globalThis.setTimeout = realSetTimeout;
    }
    assert.equal(handled, 1);
    assert.equal(scheduled.length, 0, '停止後不得排入 runStep 或第二輪等待');
});

test('丙：block 與 report 都使用同一個不縮放 profile root helper，停止檢查位於 reload 前', async () => {
    const [utilsSource, workerSource, reportSource] = await Promise.all([
        readFile(new URL('../src/utils.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8'),
    ]);
    assert.match(utilsSource, /scaleBySpeed/);
    assert.match(workerSource, /PROFILE_ROOT_WAIT_MS, 100, \{ scaleBySpeed: false \}/);
    assert.match(reportSource, /resolveProfileRootWithRetry\(user, \{/);
    assert.ok(workerSource.indexOf('Worker.isStopRequested()') < workerSource.indexOf('Worker.reloadCurrentPage()'));
    assert.ok(reportSource.indexOf('Worker.isStopRequested()') < reportSource.indexOf('Worker.reloadCurrentPage()'));
});
