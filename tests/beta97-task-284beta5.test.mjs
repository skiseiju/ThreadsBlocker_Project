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
const fixtureLocation = {
    pathname: '/@fixture_user',
    search: '',
    hash: '',
    href: 'https://threads.net/@fixture_user',
    origin: 'https://threads.net',
    reload() {},
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
globalThis.BroadcastChannel = class { postMessage() {} close() {} };

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const { UI } = await import('../src/ui.js');
const { Worker } = await import('../src/worker.js');
await import('../src/features/report-flow.js');

const originalVersion = CONFIG.VERSION;
const originalRuntimeFlag = CONFIG.ENABLE_RUNTIME_DIAGNOSTICS;
const originalPollUntil = Utils.pollUntil;
const originalFindProfileRoot = Core.findProfileRoot;
const originalStopRequested = Worker.isStopRequested;
const originalCanReload = Worker.canReloadCurrentPage;
const originalReload = Worker.reloadCurrentPage;
const originalToast = UI.showToast;
const originalReportDebugTrace = Core.ReportDriver.recordDebugTrace;
const originalReportRestriction = Core.ReportDriver.hasExplicitRestrictionSignal;
const originalReportRemoveCurrent = Core.ReportDriver.removeCurrent;
const originalReportScheduleNext = Core.ReportDriver.scheduleNext;

const resetFixture = () => {
    CONFIG.VERSION = '2.8.4-beta5';
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = true;
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics._entries = [];
    RuntimeDiagnostics._lastBySignature.clear();
    RuntimeDiagnostics._lastByRateKey.clear();
    RuntimeDiagnostics._rateWindows.clear();
    RuntimeDiagnostics._operations.clear();
    fixtureLocation.pathname = '/@fixture_user';
    fixtureLocation.search = '';
    fixtureLocation.hash = '';
    fixtureLocation.href = 'https://threads.net/@fixture_user';
    document.body.innerText = '';
    document.body.textContent = '';
    Worker._stopHandled = false;
    Worker._diagnosticOperationId = null;
    Worker._diagnosticOperationFeature = 'blocking';
    Worker._diagnosticExecutionId = null;
    Worker._diagnosticPersistAt = 0;
    Core.ReportDriver._running = false;
    Core.ReportDriver._diagnosticOperationId = null;
    Utils.pollUntil = async conditionFn => conditionFn() || null;
    Core.findProfileRoot = () => null;
    Worker.isStopRequested = () => false;
    Worker.canReloadCurrentPage = () => true;
    Worker.reloadCurrentPage = () => false;
    UI.showToast = () => {};
    Core.ReportDriver.recordDebugTrace = () => {};
    Core.ReportDriver.hasExplicitRestrictionSignal = () => false;
    Core.ReportDriver.removeCurrent = () => {};
    Core.ReportDriver.scheduleNext = () => {};
};

test.beforeEach(resetFixture);

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = originalRuntimeFlag;
    Utils.pollUntil = originalPollUntil;
    Core.findProfileRoot = originalFindProfileRoot;
    Worker.isStopRequested = originalStopRequested;
    Worker.canReloadCurrentPage = originalCanReload;
    Worker.reloadCurrentPage = originalReload;
    UI.showToast = originalToast;
    Core.ReportDriver.recordDebugTrace = originalReportDebugTrace;
    Core.ReportDriver.hasExplicitRestrictionSignal = originalReportRestriction;
    Core.ReportDriver.removeCurrent = originalReportRemoveCurrent;
    Core.ReportDriver.scheduleNext = originalReportScheduleNext;
    RuntimeDiagnostics.clear();
});

test('beta5：reload 要求與恢復欄位通過封閉白名單，不接受原始文字', () => {
    const safe = RuntimeDiagnostics._safeFields({
        reloadRequested: true,
        reloadResumed: false,
        failureType: 'reload_call_failed',
        username: 'must_not_leave_fixture',
        href: 'https://threads.net/@must_not_leave_fixture',
    });
    assert.equal(safe.reloadRequested, true);
    assert.equal(safe.reloadResumed, false);
    assert.equal(safe.failureType, 'reload_call_failed');
    assert.equal(Object.hasOwn(safe, 'username'), false);
    assert.equal(Object.hasOwn(safe, 'href'), false);
});

test('beta5：封鎖 reload 呼叫失敗會落盤獨立原因，不再把 capability 當成成功', async () => {
    const result = await Worker.autoBlock('block_reload_failure');
    assert.equal(result, 'missing_profile_root');

    const entries = RuntimeDiagnostics.export()?.entries || [];
    const requested = entries.find(entry => entry.feature === 'blocking'
        && entry.stage === 'navigation'
        && entry.fields.reason === 'missing_profile_root'
        && entry.fields.reloadRequested === true);
    const failed = entries.find(entry => entry.feature === 'blocking'
        && entry.stage === 'retry'
        && entry.fields.failureType === 'reload_call_failed');
    assert.ok(requested);
    assert.equal(requested.fields.reloadResumed, false);
    assert.notEqual(requested.fields.renderTriggered, true);
    assert.ok(failed);
    assert.equal(failed.fields.reloadRequested, true);
    assert.equal(failed.fields.reloadResumed, false);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
});

test('beta5：reload API 不可用時直接留下 reload_unavailable，且不呼叫 reload', async () => {
    Worker.canReloadCurrentPage = () => false;
    let reloadCalls = 0;
    Worker.reloadCurrentPage = () => { reloadCalls += 1; return true; };

    const result = await Worker.autoBlock('block_reload_unavailable');
    assert.equal(result, 'missing_profile_root');
    assert.equal(reloadCalls, 0);

    const unavailable = (RuntimeDiagnostics.export()?.entries || []).find(entry => (
        entry.fields.failureType === 'reload_unavailable'
    ));
    assert.ok(unavailable);
    assert.equal(unavailable.fields.reloadRequested, false);
    assert.equal(unavailable.fields.reloadResumed, false);
});

test('beta5：只檢舉 reload 呼叫失敗也會輸出 reload_call_failed', async () => {
    Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, ['report_reload_failure']);
    const handled = await Core.ReportDriver.processNext({ mode: 'profile', keepWorkerOpenOnError: false });
    assert.equal(handled, true);

    const entries = RuntimeDiagnostics.export()?.entries || [];
    const failed = entries.find(entry => entry.feature === 'report'
        && entry.stage === 'retry'
        && entry.fields.failureType === 'reload_call_failed');
    assert.ok(failed);
    assert.equal(failed.fields.reloadRequested, true);
    assert.equal(failed.fields.reloadResumed, false);
    assert.notEqual(failed.fields.renderTriggered, true);
    assert.equal(Storage.getJSON(CONFIG.KEYS.PROFILE_ROOT_RETRY, null), null);
});

test('beta5：runtime 版本與 release contract 已升至 2.8.4-beta5', () => {
    assert.equal(CONFIG.VERSION, '2.8.4-beta5');
});
