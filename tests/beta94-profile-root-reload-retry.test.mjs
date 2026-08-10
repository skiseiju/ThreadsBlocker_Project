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

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
let reloadCount = 0;
let replaceStateCount = 0;
const fixtureLocation = {
    pathname: '/@fixture_user',
    search: '',
    hash: '',
    href: 'https://threads.net/@fixture_user',
    origin: 'https://threads.net',
    reload: () => { reloadCount += 1; },
};
globalThis.location = fixtureLocation;
globalThis.history = {
    replaceState: () => { replaceStateCount += 1; },
};
globalThis.window = {
    location: fixtureLocation,
    hegeLog: null,
    innerWidth: 1200,
    innerHeight: 900,
    outerWidth: 1200,
    outerHeight: 900,
    devicePixelRatio: 1,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    addEventListener: () => {},
    removeEventListener: () => {},
};
globalThis.document = {
    body: { innerText: '', textContent: '' },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    dispatchEvent: () => true,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, remove() {} }),
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core } = await import('../src/core.js');
const { Worker, PROFILE_ROOT_WAIT_MS } = await import('../src/worker.js');
await import('../src/features/report-flow.js');

const root = { id: 'profile-root' };
const originalPollUntil = Utils.pollUntil;
const originalFindProfileRoot = Core.findProfileRoot;
const originalRecordDiagnostic = Worker.recordSafetyDiagnostic;

const resetFixture = () => {
    localStorage.clear();
    sessionStorage.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    reloadCount = 0;
    replaceStateCount = 0;
    Worker._stopHandled = false;
    Worker._diagnosticOperationId = null;
    Worker._diagnosticExecutionId = null;
    globalThis.document.body.innerText = '';
    globalThis.document.body.textContent = '';
    globalThis.location.pathname = '/@fixture_user';
    globalThis.location.search = '';
    globalThis.location.hash = '';
};

const useInstantPoll = () => {
    Utils.pollUntil = async (conditionFn) => conditionFn() || null;
};

const resolveBlockRoot = (user, findRoot, options = {}) => Worker.resolveProfileRootWithRetry(user, {
    mode: 'block',
    findRoot,
    isInvalidProfilePage: options.isInvalidProfilePage || (() => false),
    hasRestrictionSignal: options.hasRestrictionSignal || (() => false),
});

test('red：root 永遠不存在時只重載一次，最終失敗且診斷最多兩筆', async () => {
    resetFixture();
    useInstantPoll();
    const events = [];
    Worker.recordSafetyDiagnostic = (phase, result, routeType, counts, timing, options) => {
        if (phase === 'root_resolve') events.push({ result, timing, fields: options?.fields || {} });
    };
    let fakeNow = Date.now();
    const realNow = Date.now;
    Date.now = () => fakeNow;
    Utils.pollUntil = async (conditionFn) => {
        conditionFn();
        fakeNow += PROFILE_ROOT_WAIT_MS;
        return null;
    };
    try {
        Core.findProfileRoot = () => null;
        const startedAt = Date.now();
        const first = await Worker.autoBlock('never_rendered_user');
        const second = await Worker.autoBlock('never_rendered_user');
        const elapsedMs = Date.now() - startedAt;
        assert.equal(first, 'profile_root_reload');
        assert.equal(second, 'missing_profile_root');
        assert.equal(reloadCount, 1);
        assert.equal(replaceStateCount, 1);
        assert.equal(events.length, 2);
        assert.deepEqual(events.map(event => event.fields.attempt), [1, 2]);
        assert.equal(events[0].fields.retry, true);
        assert.equal(events[1].fields.retry, true);
        assert.equal(events[0].fields.reloadRequested, true);
        assert.equal(events[0].fields.reloadResumed, false);
        assert.notEqual(events[0].fields.renderTriggered, true);
        assert.equal(events[1].fields.reloadResumed, true);
        assert.equal(elapsedMs, PROFILE_ROOT_WAIT_MS * 2);
        console.log(JSON.stringify({ fixture: 'red-never-rendered', elapsedMs, rootResolveDiagnostics: events.length, reloads: reloadCount, final: second }));
    } finally {
        Date.now = realNow;
        Worker.recordSafetyDiagnostic = originalRecordDiagnostic;
        Utils.pollUntil = originalPollUntil;
        Core.findProfileRoot = originalFindProfileRoot;
    }
});

test('green：第一次逾時後重載一次，第二次找到 root 即成功', async () => {
    resetFixture();
    useInstantPoll();
    let findCount = 0;
    Core.findProfileRoot = () => {
        findCount += 1;
        return findCount > 1 ? root : null;
    };
    const first = await resolveBlockRoot('retry_then_success', () => Core.findProfileRoot('retry_then_success'));
    assert.equal(first.reason, 'retry_requested');
    assert.equal(first.attempt, 1);
    assert.equal(Worker.reloadCurrentPage(), true);
    const second = await resolveBlockRoot('retry_then_success', () => Core.findProfileRoot('retry_then_success'));
    assert.equal(second.reason, 'success');
    assert.equal(second.root, root);
    assert.equal(second.attempt, 2);
    assert.equal(reloadCount, 1);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
    console.log(JSON.stringify({ fixture: 'retry-then-success', attempts: [first.attempt, second.attempt], reloads: reloadCount, final: second.reason }));
});

test('green：第一次就找到 root 時完全不重載且只走一次診斷機會', async () => {
    resetFixture();
    useInstantPoll();
    Core.findProfileRoot = () => root;
    const result = await resolveBlockRoot('already_rendered', () => Core.findProfileRoot('already_rendered'));
    assert.equal(result.reason, 'success');
    assert.equal(result.attempt, 1);
    assert.equal(reloadCount, 0);
    assert.equal(replaceStateCount, 0);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
    console.log(JSON.stringify({ fixture: 'first-poll-success', waitMs: result.waitMs, reloads: reloadCount, rootResolveDiagnostics: 1 }));
});

test('green：第二次等待收到停止指令時立即中止，不等滿第二個等待預算', async () => {
    resetFixture();
    useInstantPoll();
    Core.findProfileRoot = () => null;
    const first = await resolveBlockRoot('stop_during_retry', () => Core.findProfileRoot('stop_during_retry'));
    assert.equal(first.reason, 'retry_requested');
    assert.equal(Worker.reloadCurrentPage(), true);
    Storage.set(CONFIG.KEYS.BG_CMD, 'stop');
    const second = await resolveBlockRoot('stop_during_retry', () => Core.findProfileRoot('stop_during_retry'));
    assert.equal(second.reason, 'stopped');
    assert.equal(second.waitMs < PROFILE_ROOT_WAIT_MS, true);
    assert.equal(reloadCount, 1);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
    console.log(JSON.stringify({ fixture: 'stop-during-retry', waitMs: second.waitMs, waitBudgetMs: PROFILE_ROOT_WAIT_MS, reloads: reloadCount, final: second.reason }));
});

test('green：404 與限制訊號在第一次等待就提前返回且不重試', async () => {
    resetFixture();
    useInstantPoll();
    Core.findProfileRoot = () => null;
    const invalid = await resolveBlockRoot('invalid_profile', () => null, { isInvalidProfilePage: () => true });
    assert.equal(invalid.reason, 'vanished');
    assert.equal(invalid.attempt, 1);
    assert.equal(reloadCount, 0);

    resetFixture();
    useInstantPoll();
    const restricted = await resolveBlockRoot('restricted_profile', () => null, { hasRestrictionSignal: () => true });
    assert.equal(restricted.reason, 'missing_profile_root');
    assert.equal(restricted.retryRequested, false);
    assert.equal(reloadCount, 0);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
    console.log(JSON.stringify({ fixture: '404-and-restriction', invalid: invalid.reason, restriction: restricted.reason, reloads: reloadCount }));
});

test('green：檢舉側沿用同一重載標記與第二次 root 結果', async () => {
    resetFixture();
    useInstantPoll();
    let rootAvailable = false;
    Core.findProfileRoot = () => rootAvailable ? root : null;
    const first = await Core.ReportDriver.waitForProfileRoot('report_retry');
    assert.equal(first.reason, 'reload_requested');
    assert.equal(first.reloadRequested, true);
    assert.equal(reloadCount, 1);
    rootAvailable = true;
    const second = await Core.ReportDriver.waitForProfileRoot('report_retry');
    assert.equal(second.reason, 'success');
    assert.equal(second.attempt, 2);
    assert.equal(second.root, root);
});

test('行為守門：其他失敗理由與 iOS 導航限制仍保留', async () => {
    const [workerSource, reportSource, architecture] = await Promise.all([
        readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8'),
        readFile(new URL('../docs/BLOCKING_ARCHITECTURE.md', import.meta.url), 'utf8'),
    ]);
    for (const reason of ['menu_not_found', 'navigation_mismatch', 'private_manual_required']) {
        assert.match(workerSource, new RegExp(`'${reason}'`));
    }
    assert.match(workerSource, /\['menu_not_found', 'missing_profile_root', 'navigation_mismatch', 'private_manual_required'\]\.includes\(result\)/);
    assert.match(reportSource, /waitForProfileRoot/);
    assert.doesNotMatch(workerSource, /window\.location\.href\s*=/);
    assert.doesNotMatch(reportSource, /window\.location\.href\s*=/);
    assert.match(workerSource, /history\.replaceState\(null, '', currentPath\)/);
    assert.match(workerSource, /location\.reload\(\)/);
    assert.match(architecture, /`window\.location\.href = 'threads\.net\/\.\.\.'`/);
});
