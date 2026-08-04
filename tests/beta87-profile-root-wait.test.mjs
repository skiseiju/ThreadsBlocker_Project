import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.window = {
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
globalThis.location = {
    pathname: '/@fixture_user',
    search: '',
    href: 'https://threads.net/@fixture_user',
    origin: 'https://threads.net',
};
globalThis.document = {
    body: { innerText: '', textContent: '' },
    querySelectorAll: () => [],
    querySelector: () => null,
    getElementById: () => null,
    dispatchEvent: () => true,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {}, contains: () => false }, appendChild() {}, remove() {} }),
};

const { Utils } = await import('../src/utils.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const { MoreLocator } = await import('../src/more-locator.js');
const { Worker, PROFILE_ROOT_WAIT_MS } = await import('../src/worker.js');
const { ReportDebugContext } = await import('../src/report-debug-context.js');
await import('../src/features/report-flow.js');

const root = { id: 'profile-root' };

test('red：檢舉舊版單次查詢在 root 延遲時毫秒級失敗', () => {
    const rootAvailableAt = Date.now() + 800;
    Core.findProfileRoot = () => Date.now() >= rootAvailableAt ? root : null;
    const startedAt = Date.now();
    const profileRoot = Core.findProfileRoot('fixture_user');
    const result = {
        found: !!profileRoot,
        elapsedMs: Date.now() - startedAt,
        stage: 'navigation',
        reason: profileRoot ? 'success' : 'menu_not_found',
    };
    assert.equal(result.found, false);
    assert.ok(result.elapsedMs < 20, `red elapsedMs 應為個位數，實際 ${result.elapsedMs}`);
    assert.equal(result.stage, 'navigation');
    assert.equal(result.reason, 'menu_not_found');
});

test('green：檢舉 profile root 延遲 800ms 仍在共用預算內成功', async () => {
    const rootAvailableAt = Date.now() + 800;
    Core.findProfileRoot = () => Date.now() >= rootAvailableAt ? root : null;
    const result = await Core.ReportDriver.waitForProfileRoot('fixture_user');
    assert.equal(result.root, root);
    assert.equal(result.reason, 'success');
    assert.ok(result.waitMs >= 700, `green waitMs 應涵蓋延遲，實際 ${result.waitMs}`);
    assert.ok(result.waitMs <= PROFILE_ROOT_WAIT_MS, `green waitMs 不得超過預算 ${PROFILE_ROOT_WAIT_MS}，實際 ${result.waitMs}`);
});

test('green：profile root 永遠不出現時逾時回傳 root reason', async () => {
    const originalPollUntil = Utils.pollUntil;
    Core.findProfileRoot = () => null;
    Utils.pollUntil = async (conditionFn) => {
        conditionFn();
        return conditionFn();
    };
    try {
        const result = await Core.ReportDriver.waitForProfileRoot('fixture_user');
        assert.equal(result.root, null);
        assert.equal(result.reason, 'missing_profile_root');
    } finally {
        Utils.pollUntil = originalPollUntil;
    }
});

test('green：封鎖側延遲 profile root 維持成功且不回退', async () => {
    const previousDocument = globalThis.document;
    const previousFindProfileRoot = Core.findProfileRoot;
    const previousDetectPrivate = MoreLocator.detectPrivateProfileState;
    const previousFindMoreButton = Worker.findMoreButton;
    const previousBlockVisualStep = Worker.blockVisualStep;
    const previousRecordDiagnostic = Worker.recordSafetyDiagnostic;
    const previousSafeSleep = Utils.safeSleep;
    const previousSpeedSleep = Utils.speedSleep;
    const previousSimClick = Utils.simClick;
    const state = { phase: 'idle' };
    const profileButton = {
        kind: 'profile', isConnected: true, innerText: '', textContent: '',
        scrollIntoView() {}, querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 10, left: 10, width: 40, height: 32 }),
    };
    const blockButton = {
        kind: 'block', isConnected: true, innerText: 'Block', textContent: 'Block',
        scrollIntoView() {}, querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 10, left: 10, width: 40, height: 32 }),
    };
    const confirmButton = {
        kind: 'confirm', isConnected: true, innerText: 'Block', textContent: 'Block',
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 10, left: 10, width: 40, height: 32 }),
    };
    const dialog = {
        innerText: 'Confirm', textContent: 'Confirm', isConnected: true,
        querySelectorAll: selector => /button|role="button"/.test(selector) ? [confirmButton] : [],
    };
    globalThis.document = {
        body: { innerText: '', textContent: '' },
        getElementById: () => null,
        querySelectorAll: selector => {
            if (selector.includes('role="alert"')) return [];
            if (selector.includes('role="dialog"')) return state.phase === 'confirm' ? [dialog] : [];
            if (selector.includes('MORE_SVG')) return [];
            if (selector.includes('role="menuitem"') || selector.includes('role="button"')) {
                return state.phase === 'menu' ? [blockButton] : [];
            }
            return [];
        },
        querySelector: () => null,
        dispatchEvent: () => true,
    };
    const rootAvailableAt = Date.now() + 800;
    Core.findProfileRoot = () => Date.now() >= rootAvailableAt ? root : null;
    Core._lastProfileRootMode = 'strict';
    MoreLocator.detectPrivateProfileState = () => ({ known: true, private: false, scope: root });
    Worker.findMoreButton = async () => profileButton;
    Worker.blockVisualStep = async () => {};
    const events = [];
    Worker.recordSafetyDiagnostic = (phase, result, routeType, counts, timing) => {
        events.push({ phase, result, elapsedMs: timing?.elapsedMs || 0 });
    };
    Utils.safeSleep = async () => {};
    Utils.speedSleep = async () => {};
    Utils.simClick = (element) => {
        if (element?.kind === 'profile') state.phase = 'menu';
        if (element?.kind === 'block') state.phase = 'confirm';
        if (element?.kind === 'confirm') state.phase = 'closed';
    };
    try {
        const result = await Worker.autoBlock('fixture_user');
        assert.equal(result, 'success');
        const rootEvent = events.find(event => event.phase === 'root_resolve');
        assert.equal(rootEvent?.result, 'success');
        assert.ok(rootEvent.elapsedMs >= 700, `封鎖 root waitMs 應涵蓋延遲，實際 ${rootEvent?.elapsedMs}`);
        assert.ok(rootEvent.elapsedMs <= PROFILE_ROOT_WAIT_MS, `封鎖 root waitMs 不得超過預算 ${PROFILE_ROOT_WAIT_MS}`);
        assert.equal(events.some(event => event.result === 'menu_not_found'), false);
    } finally {
        globalThis.document = previousDocument;
        Core.findProfileRoot = previousFindProfileRoot;
        MoreLocator.detectPrivateProfileState = previousDetectPrivate;
        Worker.findMoreButton = previousFindMoreButton;
        Worker.blockVisualStep = previousBlockVisualStep;
        Worker.recordSafetyDiagnostic = previousRecordDiagnostic;
        Utils.safeSleep = previousSafeSleep;
        Utils.speedSleep = previousSpeedSleep;
        Utils.simClick = previousSimClick;
    }
});

test('missing_profile_root 是診斷與 UI 可辨識的 root reason', async () => {
    const snapshot = ReportDebugContext.append(null, {
        ts: Date.now(),
        phase: 'root_resolve',
        result: 'missing_profile_root',
        routeType: 'profile',
        counts: { moreCandidates: 0, menuItems: 0, confirmButtons: 0, postFallbackAttempts: 0 },
        elapsedMs: 12000,
        retryCount: 0,
    });
    assert.equal(snapshot.events[0].result, 'missing_profile_root');
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics.record('report', 'navigation', { reason: 'missing_profile_root', elapsedMs: 12000 });
    assert.equal(RuntimeDiagnostics.get().at(-1)?.fields.reason, 'missing_profile_root');
    const { readFile } = await import('node:fs/promises');
    const [coreSource, reportSource, uiSource] = await Promise.all([
        readFile(new URL('../src/core.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/ui.js', import.meta.url), 'utf8'),
    ]);
    assert.match(coreSource, /'missing_profile_root'/);
    assert.match(reportSource, /reason: profileRoot \? 'success' : 'missing_profile_root'/);
    assert.match(uiSource, /missing_profile_root: '帳號頁面尚未載入完成'/);
});
