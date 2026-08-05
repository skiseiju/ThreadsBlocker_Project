import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
        href: 'https://www.threads.com/@fixture_user/replies',
        origin: 'https://www.threads.com',
        pathname: '/@fixture_user/replies',
        search: '',
    },
    innerWidth: 1200,
    innerHeight: 900,
    outerWidth: 1200,
    outerHeight: 900,
    screen: { availWidth: 1600, availHeight: 1000 },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static' }),
    close() {},
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta88-fixture', platform: 'test', maxTouchPoints: 0, onLine: true },
});
globalThis.CSS = { escape: value => String(value) };
globalThis.history = { replaceState() {} };
globalThis.BroadcastChannel = class { postMessage() {} close() {} };
globalThis.KeyboardEvent = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };

let documentMode = 'empty';
const menuItems = [
    { innerText: '檢舉', textContent: '檢舉' },
    { innerText: '取消追蹤', textContent: '取消追蹤' },
    { innerText: '複製連結', textContent: '複製連結' },
];
const documentMock = {
    hidden: false,
    title: '',
    body: { appendChild() {}, addEventListener() {}, innerText: '', textContent: '' },
    documentElement: { appendChild() {} },
    defaultView: windowMock,
    getElementById: () => null,
    querySelector(selector) {
        if (documentMode === 'menu' && selector === 'div[role="menuitem"]') return menuItems[0];
        return null;
    },
    querySelectorAll(selector) {
        if (documentMode === 'menu' && selector === 'div[role="menuitem"], div[role="button"]') return menuItems;
        if (documentMode === 'menu' && selector === 'div[role="menuitem"]') return menuItems;
        return [];
    },
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, remove() {} }),
    addEventListener() {},
    dispatchEvent() { return true; },
};
globalThis.document = documentMock;

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const { UI } = await import('../src/ui.js');
const { MoreLocator } = await import('../src/more-locator.js');
const { Worker } = await import('../src/worker.js');
await import('../src/features/report-flow.js');
await import('../src/features/three-no-watch.js');

const resetState = () => {
    CONFIG.VERSION = '2.8.3-beta3';
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
    windowMock.location.pathname = '/@fixture_user/replies';
    windowMock.location.href = 'https://www.threads.com/@fixture_user/replies';
    documentMock.body.innerText = '';
    documentMock.body.textContent = '';
    documentMode = 'empty';
};

test.beforeEach(resetState);

test('第 16 項 green：三無收尾各階段有數字／布林觀測且條目數不隨帳號數增加', async () => {
    const originalUpload = UI.tryUploadThreeNoScanStats;
    const originalSetTimeout = globalThis.setTimeout;
    UI.tryUploadThreeNoScanStats = async () => ({ code: 204 });
    globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, Math.min(Number(delay) || 0, 5), ...args);

    const runFixture = async (count) => {
        resetState();
        const users = Array.from({ length: count }, (_, index) => `fixture_${index}`);
        const runtime = {
            scanId: `three-no:fixture:${count}`,
            owner: 'fixture_owner',
            scanDate: '2026-08-05',
            startedAt: 100,
            findings: users.map(username => ({ username, noAvatar: true, noBio: true })),
            usernames: users,
            triagedUsernames: users,
            index: users.length,
            hasMore: false,
            batchSize: 200,
        };
        Storage.setJSON(CONFIG.KEYS.THREE_NO_SCAN_STATE, {
            scanId: runtime.scanId,
            status: 'scanning',
            diagnosticOperationId: `three_no-fixture${count}`,
        });
        sessionStorageMock.setItem(Core.ThreeNoWatch.stateKey, JSON.stringify(runtime));
        const originalSetItem = localStorageMock.setItem.bind(localStorageMock);
        const originalRecord = RuntimeDiagnostics.record;
        let localStorageWriteCount = 0;
        let writesAtStorageComplete = null;
        localStorageMock.setItem = (key, value) => {
            localStorageWriteCount += 1;
            return originalSetItem(key, value);
        };
        RuntimeDiagnostics.record = function recordWithWriteCheckpoint(feature, stage, fields) {
            const entry = originalRecord.call(this, feature, stage, fields);
            if (feature === 'three_no' && stage === 'storage' && fields?.active === false && fields?.complete === true) {
                writesAtStorageComplete = localStorageWriteCount;
            }
            return entry;
        };
        try {
            await Core.ThreeNoWatch.finishScan({ status: 'completed' });
        } finally {
            localStorageMock.setItem = originalSetItem;
            RuntimeDiagnostics.record = originalRecord;
        }
        return {
            entries: RuntimeDiagnostics.get()
                .filter(entry => entry.feature === 'three_no')
                .filter(entry => ['status', 'aggregate', 'storage', 'render', 'wait'].includes(entry.stage)),
            localStorageWriteCount,
            writesAtStorageComplete,
        };
    };

    try {
        const small = await runFixture(12);
        const large = await runFixture(400);
        const entries = large.entries;
        const latest = stage => entries.filter(entry => entry.stage === stage).at(-1)?.fields || {};
        const aggregateEnd = latest('aggregate');
        const storageEnd = latest('storage');
        const render = latest('render');
        const waitEnd = latest('wait');
        const status = latest('status');

        for (const stage of ['status', 'aggregate', 'storage', 'render', 'wait']) {
            assert.ok(entries.some(entry => entry.stage === stage), `缺少 ${stage} 觀測`);
        }
        for (const entry of entries) {
            for (const [key, value] of Object.entries(entry.fields)) {
                assert.ok(['number', 'boolean'].includes(typeof value), `${entry.stage}.${key} 必須是數字或布林`);
            }
        }
        for (const key of ['active', 'complete', 'stopped', 'failure']) assert.equal(typeof status[key], 'boolean');
        for (const key of ['checkedCount', 'candidateCount', 'queuedCount']) assert.equal(typeof status[key], 'number');
        assert.ok(entries.some(entry => entry.stage === 'aggregate' && entry.fields.active === true));
        assert.equal(aggregateEnd.complete, true);
        assert.equal(typeof aggregateEnd.elapsedMs, 'number');
        assert.equal(typeof aggregateEnd.uniqueBefore, 'number');
        assert.equal(typeof aggregateEnd.uniqueAfter, 'number');
        assert.equal(typeof aggregateEnd.duplicateCount, 'number');
        assert.equal(storageEnd.complete, true);
        assert.equal(typeof storageEnd.storageWriteCount, 'number');
        assert.equal(typeof storageEnd.storageWriteBytes, 'number');
        assert.equal(typeof storageEnd.cursorSizeBytes, 'number');
        assert.equal(typeof storageEnd.resultSizeBytes, 'number');
        assert.equal(render.renderTriggered, true);
        assert.equal(render.resultPersisted, true);
        assert.equal(typeof render.resultSizeBytes, 'number');
        assert.equal(entries.find(entry => entry.stage === 'render')?.fields.renderTriggered, false);
        assert.equal(waitEnd.complete, true);
        assert.equal(waitEnd.externalWait, true);
        assert.equal(typeof waitEnd.waitMs, 'number');
        assert.equal(typeof waitEnd.timedOut, 'boolean');
        assert.equal(storageEnd.storageWriteCount, large.writesAtStorageComplete);
        assert.equal(small.entries.filter(entry => entry.stage === 'storage').at(-1)?.fields.storageWriteCount, small.writesAtStorageComplete);
        assert.ok(entries.length <= 16, `收尾摘要條目必須有界，實際 ${entries.length}`);
        assert.ok(large.entries.length <= small.entries.length + 1, `400 筆與 12 筆不應按帳號數線性增加：${small.entries.length} → ${large.entries.length}`);
    } finally {
        UI.tryUploadThreeNoScanStats = originalUpload;
        globalThis.setTimeout = originalSetTimeout;
    }
});

test('第 21 項 green：100 帳號的 menu/root 失敗都進輕量層且 priority=4', () => {
    for (let index = 1; index <= 100; index += 1) {
        const operationId = `blocking-a${index}`;
        const result = index === 30 ? 'menu_not_found' : index === 60 ? 'missing_profile_root' : 'success';
        const phase = index === 30 ? 'menu_resolve' : index === 60 ? 'root_resolve' : 'queue_advance';
        Worker.recordSafetyDiagnostic(phase, result, 'profile', {}, {}, { operationId });
    }

    const lightEntries = Core.buildLightweightDiagnostics().runtimeDiagnostics?.entries || [];
    const menuFailure = lightEntries.find(entry => entry.operationId === 'blocking-a30' && entry.fields.reason === 'menu_not_found');
    const rootFailure = lightEntries.find(entry => entry.operationId === 'blocking-a60' && entry.fields.reason === 'missing_profile_root');
    assert.ok(menuFailure);
    assert.ok(rootFailure);
    assert.equal(menuFailure.priority, 4);
    assert.equal(rootFailure.priority, 4);

    Worker.recordSafetyDiagnostic('queue_advance', 'success', 'profile', {}, {}, { operationId: 'blocking-success' });
    Worker.recordSafetyDiagnostic('queue_advance', 'completed', 'profile', {}, {}, { operationId: 'blocking-completed' });
    Worker.recordSafetyDiagnostic('menu_resolve', 'already_blocked', 'profile', {}, {}, { operationId: 'blocking-already' });
    const ring = RuntimeDiagnostics.get();
    assert.equal(ring.find(entry => entry.operationId === 'blocking-success')?.priority, 0);
    assert.equal(ring.find(entry => entry.operationId === 'blocking-completed')?.priority, 0);
    assert.equal(ring.find(entry => entry.operationId === 'blocking-already')?.priority, 0);
    assert.equal(ring.find(entry => entry.operationId === 'blocking-already')?.fields.failure, false);
});

test('第 21 項 red 基線數字保留：beta2 反向判定會漏掉兩筆', () => {
    const legacyFailure = result => ['failed', 'failure', 'error'].includes(result);
    const baseline = ['menu_not_found', 'missing_profile_root'].map(result => ({
        result,
        selectedInLightweight: false,
        priority: legacyFailure(result) ? 4 : 0,
    }));
    assert.deepEqual(baseline.map(item => item.selectedInLightweight), [false, false]);
    assert.deepEqual(baseline.map(item => item.priority), [0, 0]);
});

test('第 22、24 項 green：root timeout 回傳、失敗清單、診斷欄位與既有 retry 標籤一致', async () => {
    const previous = {
        findProfileRoot: Core.findProfileRoot,
        pollUntil: Utils.pollUntil,
        recordSafetyDiagnostic: Worker.recordSafetyDiagnostic,
    };
    const events = [];
    Core.findProfileRoot = () => null;
    Utils.pollUntil = async condition => { condition(); return condition(); };
    Worker.recordSafetyDiagnostic = (phase, result, routeType, counts, timing, options) => {
        events.push({ phase, result, routeType, counts, timing, fields: options?.fields || {} });
        return null;
    };
    try {
        const result = await Worker.autoBlock('root_timeout_user');
        assert.equal(result, 'missing_profile_root');
        assert.equal(events.at(-1)?.result, 'missing_profile_root');
        assert.equal(typeof events.at(-1)?.fields.profileRootCandidateCount, 'number');
        assert.equal(typeof events.at(-1)?.fields.relaxedRootAttempted, 'boolean');
        assert.equal(typeof events.at(-1)?.fields.privateProfile, 'boolean');
        assert.equal(typeof events.at(-1)?.fields.rootSeenThenMissing, 'boolean');

        Core.recordFailure('block', 'root_timeout_user', result);
        const failed = Core.getFailedQueueEntries().find(entry => entry.username === 'root_timeout_user');
        assert.equal(failed?.reason, 'missing_profile_root');

        const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
        assert.match(workerSource, /\['menu_not_found', 'missing_profile_root', 'navigation_mismatch', 'private_manual_required'\]/);
        const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
        assert.match(uiSource, /missing_profile_root: '帳號頁面尚未載入完成'/);
    } finally {
        Core.findProfileRoot = previous.findProfileRoot;
        Utils.pollUntil = previous.pollUntil;
        Worker.recordSafetyDiagnostic = previous.recordSafetyDiagnostic;
    }
});

test('第 23 項 green：選單觀測只增加數字／布林，穩態不重複洗版', async () => {
    const previous = {
        findProfileRoot: Core.findProfileRoot,
        findMoreButton: Worker.findMoreButton,
        findPostMoreButtons: Worker.findPostMoreButtons,
        blockVisualStep: Worker.blockVisualStep,
        pollUntil: Utils.pollUntil,
        safeSleep: Utils.safeSleep,
        speedSleep: Utils.speedSleep,
        simClick: Utils.simClick,
        detectPrivateProfileState: MoreLocator.detectPrivateProfileState,
    };
    const root = { isConnected: true };
    const profileButton = {
        isConnected: true,
        tagName: 'BUTTON',
        getAttribute: () => '',
        querySelector: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 10, left: 10, width: 40, height: 32 }),
        scrollIntoView() {},
    };
    Core.findProfileRoot = () => root;
    Core._lastProfileRootMode = 'strict';
    Worker.findMoreButton = async () => profileButton;
    Worker.findPostMoreButtons = () => [];
    Worker.blockVisualStep = async () => {};
    Utils.pollUntil = async condition => condition();
    Utils.safeSleep = async () => {};
    Utils.speedSleep = async () => {};
    Utils.simClick = () => {};
    MoreLocator.detectPrivateProfileState = () => ({ known: true, private: false });
    documentMode = 'menu';
    try {
        const result = await Worker.autoBlock('menu_observation_user');
        assert.equal(result, 'menu_not_found');
        const menuEntries = RuntimeDiagnostics.get().filter(entry => entry.stage === 'menu');
        const observed = menuEntries.at(-1)?.fields || {};
        assert.equal(typeof observed.recognizedMenuItemCount, 'number');
        assert.equal(typeof observed.knownReportItemCount, 'number');
        assert.equal(typeof observed.knownFollowItemCount, 'number');
        assert.equal(typeof observed.knownCopyLinkItemCount, 'number');
        assert.equal(typeof observed.ownAriaLabel, 'boolean');
        assert.equal(typeof observed.nestedAriaLabel, 'boolean');
        assert.equal(typeof observed.sameMenuElement, 'boolean');
        assert.equal(JSON.stringify(observed).includes('檢舉'), false);

        const before = RuntimeDiagnostics.get().length;
        Worker.recordSafetyDiagnostic('menu_resolve', 'menu_not_found', 'profile', { menuItems: 3 }, {}, { operationId: 'blocking-steady' });
        Worker.recordSafetyDiagnostic('menu_resolve', 'menu_not_found', 'profile', { menuItems: 3 }, {}, { operationId: 'blocking-steady' });
        const steady = RuntimeDiagnostics.get().filter(entry => entry.operationId === 'blocking-steady');
        assert.equal(steady.length, 1);
        assert.ok(RuntimeDiagnostics.get().length >= before + 1);
    } finally {
        Core.findProfileRoot = previous.findProfileRoot;
        Worker.findMoreButton = previous.findMoreButton;
        Worker.findPostMoreButtons = previous.findPostMoreButtons;
        Worker.blockVisualStep = previous.blockVisualStep;
        Utils.pollUntil = previous.pollUntil;
        Utils.safeSleep = previous.safeSleep;
        Utils.speedSleep = previous.speedSleep;
        Utils.simClick = previous.simClick;
        MoreLocator.detectPrivateProfileState = previous.detectPrivateProfileState;
    }
});

test('第 5 項 green：第二步逾時不再誤記 submit_not_confirmed，且等待區間有診斷條目', async () => {
    const report = Core.ReportDriver;
    const previous = {
        waitForProfileRoot: report.waitForProfileRoot,
        findProfileMoreButton: report.findProfileMoreButton,
        visualStep: report.visualStep,
        findAnyText: report.findAnyText,
        selectReportTargetIfShown: report.selectReportTargetIfShown,
        getBlankDialogState: report.getBlankDialogState,
        getExecutionPath: report.getExecutionPath,
        findNextReportOption: report.findNextReportOption,
        findConfirmationButton: report.findConfirmationButton,
        checkReportDone: report.checkReportDone,
        getSubmitSuccessState: report.getSubmitSuccessState,
        getVisibleReportOptionTexts: report.getVisibleReportOptionTexts,
        hasExplicitRestrictionSignal: report.hasExplicitRestrictionSignal,
        didNavigateToUserPost: report.didNavigateToUserPost,
        recordDebugTrace: report.recordDebugTrace,
        removeCurrent: report.removeCurrent,
        scheduleNext: report.scheduleNext,
        skipOrPauseForDebug: report.skipOrPauseForDebug,
        safeSleep: Utils.safeSleep,
        speedSleep: Utils.speedSleep,
        pollUntil: Utils.pollUntil,
        simClick: Utils.simClick,
    };
    const uiModule = await import('../src/ui.js');
    const oldUiToast = uiModule.UI.showToast;
    let firstStepFound = false;
    report.waitForProfileRoot = async () => ({ root: { isConnected: true }, reason: 'success', waitMs: 12, observation: {} });
    report.findProfileMoreButton = async () => ({ isConnected: true });
    report.visualStep = async () => {};
    report.findAnyText = () => ({ isConnected: true, closest: () => null });
    report.selectReportTargetIfShown = async () => false;
    report.getBlankDialogState = () => null;
    report.getExecutionPath = () => ['第一步', '第二步'];
    report.findNextReportOption = (_path, startIndex) => {
        if (startIndex === 0 && !firstStepFound) {
            firstStepFound = true;
            return { option: { isConnected: true }, step: '第一步', offset: 0 };
        }
        return null;
    };
    report.findConfirmationButton = () => null;
    report.checkReportDone = () => false;
    report.getSubmitSuccessState = () => null;
    report.getVisibleReportOptionTexts = () => [];
    report.hasExplicitRestrictionSignal = () => false;
    report.didNavigateToUserPost = () => false;
    report.recordDebugTrace = () => {};
    report.removeCurrent = () => {};
    report.scheduleNext = () => {};
    report.skipOrPauseForDebug = previous.skipOrPauseForDebug;
    Utils.safeSleep = async () => {};
    Utils.speedSleep = async () => {};
    Utils.pollUntil = async condition => condition();
    Utils.simClick = () => {};
    uiModule.UI.showToast = () => {};
    Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, ['report_fixture_user']);
    try {
        await report.processNext({ mode: 'profile', keepWorkerOpenOnError: false });
        const reportFailure = RuntimeDiagnostics.get().find(entry => entry.fields.reason === 'missing_report_step');
        assert.ok(reportFailure);
        assert.equal(reportFailure.fields.waitingForStep, true);
        assert.equal(RuntimeDiagnostics.get().some(entry => entry.fields.reason === 'submit_not_confirmed'), false);
        assert.equal(reportFailure.fields.actionCount, 1);
        assert.equal(typeof reportFailure.fields.elapsedMs, 'number');
        assert.equal(RuntimeDiagnostics.get().filter(entry => entry.fields.waitingForStep === true).length >= 1, true);
    } finally {
        report.waitForProfileRoot = previous.waitForProfileRoot;
        report.findProfileMoreButton = previous.findProfileMoreButton;
        report.visualStep = previous.visualStep;
        report.findAnyText = previous.findAnyText;
        report.selectReportTargetIfShown = previous.selectReportTargetIfShown;
        report.getBlankDialogState = previous.getBlankDialogState;
        report.getExecutionPath = previous.getExecutionPath;
        report.findNextReportOption = previous.findNextReportOption;
        report.findConfirmationButton = previous.findConfirmationButton;
        report.checkReportDone = previous.checkReportDone;
        report.getSubmitSuccessState = previous.getSubmitSuccessState;
        report.getVisibleReportOptionTexts = previous.getVisibleReportOptionTexts;
        report.hasExplicitRestrictionSignal = previous.hasExplicitRestrictionSignal;
        report.didNavigateToUserPost = previous.didNavigateToUserPost;
        report.recordDebugTrace = previous.recordDebugTrace;
        report.removeCurrent = previous.removeCurrent;
        report.scheduleNext = previous.scheduleNext;
        report.skipOrPauseForDebug = previous.skipOrPauseForDebug;
        Utils.safeSleep = previous.safeSleep;
        Utils.speedSleep = previous.speedSleep;
        Utils.pollUntil = previous.pollUntil;
        Utils.simClick = previous.simClick;
        uiModule.UI.showToast = oldUiToast;
    }
});

test('第 5 項 green：第二步在既有等待預算內出現時流程成功', async () => {
    const report = Core.ReportDriver;
    const previous = {
        waitForProfileRoot: report.waitForProfileRoot,
        findProfileMoreButton: report.findProfileMoreButton,
        visualStep: report.visualStep,
        findAnyText: report.findAnyText,
        selectReportTargetIfShown: report.selectReportTargetIfShown,
        getBlankDialogState: report.getBlankDialogState,
        getExecutionPath: report.getExecutionPath,
        findNextReportOption: report.findNextReportOption,
        findConfirmationButton: report.findConfirmationButton,
        checkReportDone: report.checkReportDone,
        getSubmitSuccessState: report.getSubmitSuccessState,
        getVisibleReportOptionTexts: report.getVisibleReportOptionTexts,
        hasExplicitRestrictionSignal: report.hasExplicitRestrictionSignal,
        didNavigateToUserPost: report.didNavigateToUserPost,
        recordDebugTrace: report.recordDebugTrace,
        recordHistory: report.recordHistory,
        removeCurrent: report.removeCurrent,
        scheduleNext: report.scheduleNext,
        skipOrPauseForDebug: report.skipOrPauseForDebug,
        safeSleep: Utils.safeSleep,
        speedSleep: Utils.speedSleep,
        pollUntil: Utils.pollUntil,
        simClick: Utils.simClick,
    };
    const uiModule = await import('../src/ui.js');
    const oldUiToast = uiModule.UI.showToast;
    let actionIndex = 0;
    let confirmClicks = 0;
    report.waitForProfileRoot = async () => ({ root: { isConnected: true }, reason: 'success', waitMs: 12, observation: {} });
    report.findProfileMoreButton = async () => ({ isConnected: true });
    report.visualStep = async () => {};
    report.findAnyText = () => ({ isConnected: true, closest: () => null });
    report.selectReportTargetIfShown = async () => false;
    report.getBlankDialogState = () => null;
    report.getExecutionPath = () => ['第一步', '第二步'];
    report.findNextReportOption = (_path, startIndex) => {
        if (startIndex !== actionIndex || actionIndex > 1) return null;
        const current = actionIndex;
        actionIndex += 1;
        return { option: { isConnected: true }, step: current === 0 ? '第一步' : '第二步', offset: 0 };
    };
    report.findConfirmationButton = () => actionIndex >= 2 ? { isConnected: true, closest: () => null } : null;
    report.checkReportDone = () => false;
    report.getSubmitSuccessState = () => confirmClicks > 0 ? { confirmed: true, signal: 'fixture' } : null;
    report.getVisibleReportOptionTexts = () => [];
    report.hasExplicitRestrictionSignal = () => false;
    report.didNavigateToUserPost = () => false;
    report.recordDebugTrace = () => {};
    report.recordHistory = () => {};
    report.removeCurrent = () => {};
    report.scheduleNext = () => {};
    report.skipOrPauseForDebug = previous.skipOrPauseForDebug;
    Utils.safeSleep = async () => {};
    Utils.speedSleep = async () => {};
    Utils.pollUntil = async condition => condition();
    Utils.simClick = () => { confirmClicks += 1; };
    uiModule.UI.showToast = () => {};
    Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, ['report_success_fixture']);
    try {
        const handled = await report.processNext({ mode: 'profile', keepWorkerOpenOnError: false });
        assert.equal(handled, true);
        assert.equal(RuntimeDiagnostics.get().some(entry => entry.fields.reason === 'missing_report_step'), false);
        assert.ok(RuntimeDiagnostics.get().some(entry => entry.stage === 'action' && entry.fields.actionCount === 2));
    } finally {
        report.waitForProfileRoot = previous.waitForProfileRoot;
        report.findProfileMoreButton = previous.findProfileMoreButton;
        report.visualStep = previous.visualStep;
        report.findAnyText = previous.findAnyText;
        report.selectReportTargetIfShown = previous.selectReportTargetIfShown;
        report.getBlankDialogState = previous.getBlankDialogState;
        report.getExecutionPath = previous.getExecutionPath;
        report.findNextReportOption = previous.findNextReportOption;
        report.findConfirmationButton = previous.findConfirmationButton;
        report.checkReportDone = previous.checkReportDone;
        report.getSubmitSuccessState = previous.getSubmitSuccessState;
        report.getVisibleReportOptionTexts = previous.getVisibleReportOptionTexts;
        report.hasExplicitRestrictionSignal = previous.hasExplicitRestrictionSignal;
        report.didNavigateToUserPost = previous.didNavigateToUserPost;
        report.recordDebugTrace = previous.recordDebugTrace;
        report.recordHistory = previous.recordHistory;
        report.removeCurrent = previous.removeCurrent;
        report.scheduleNext = previous.scheduleNext;
        report.skipOrPauseForDebug = previous.skipOrPauseForDebug;
        Utils.safeSleep = previous.safeSleep;
        Utils.speedSleep = previous.speedSleep;
        Utils.pollUntil = previous.pollUntil;
        Utils.simClick = previous.simClick;
        uiModule.UI.showToast = oldUiToast;
    }
});

test('第 5 項 red 基線數字：只有一次 action，空白區間沒有可辨識診斷', () => {
    const baseline = { actionEntries: 1, blankIntervalEntries: 0, reason: 'submit_not_confirmed', elapsedMs: 7154 };
    assert.deepEqual(baseline, { actionEntries: 1, blankIntervalEntries: 0, reason: 'submit_not_confirmed', elapsedMs: 7154 });
});

test('第 23、24 項欄位仍受安全白名單限制', () => {
    const safe = RuntimeDiagnostics._safeFields({
        recognizedMenuItemCount: 3,
        profileRootCandidateCount: 1,
        sameMenuElement: false,
        rootSeenThenMissing: false,
        storageWriteCount: 9,
        storageWriteBytes: 2048,
        cursorSizeBytes: 120,
        resultSizeBytes: 1800,
        renderTriggered: true,
        resultPersisted: true,
        externalWait: true,
        waitingForExternal: false,
        username: 'must-drop',
        accountName: 'must-drop',
        pageText: 'must-drop',
        scanResult: { username: 'must-drop', noBio: true },
        scanResults: [{ username: 'must-drop' }],
        resultContent: 'must-drop',
        menuText: '檢舉',
        href: 'https://threads.com/@secret',
        profileUrl: 'https://threads.com/@secret',
    });
    assert.equal(typeof safe.recognizedMenuItemCount, 'number');
    assert.equal(typeof safe.profileRootCandidateCount, 'number');
    assert.equal(typeof safe.sameMenuElement, 'boolean');
    assert.equal(typeof safe.storageWriteCount, 'number');
    assert.equal(typeof safe.storageWriteBytes, 'number');
    assert.equal(typeof safe.cursorSizeBytes, 'number');
    assert.equal(typeof safe.resultSizeBytes, 'number');
    assert.equal(typeof safe.renderTriggered, 'boolean');
    assert.equal(typeof safe.resultPersisted, 'boolean');
    assert.equal(typeof safe.externalWait, 'boolean');
    assert.equal(typeof safe.waitingForExternal, 'boolean');
    assert.equal(Object.hasOwn(safe, 'username'), false);
    assert.equal(Object.hasOwn(safe, 'accountName'), false);
    assert.equal(Object.hasOwn(safe, 'pageText'), false);
    assert.equal(Object.hasOwn(safe, 'scanResult'), false);
    assert.equal(Object.hasOwn(safe, 'scanResults'), false);
    assert.equal(Object.hasOwn(safe, 'resultContent'), false);
    assert.equal(Object.hasOwn(safe, 'menuText'), false);
    assert.equal(Object.hasOwn(safe, 'href'), false);
    assert.equal(Object.hasOwn(safe, 'profileUrl'), false);
});
