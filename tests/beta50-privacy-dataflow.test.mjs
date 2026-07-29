import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const { Core } = await import('../src/core.js');
const { CONFIG } = await import('../src/config.js');
const { ReportDebugContext } = await import('../src/report-debug-context.js');

test('beta50 automatic bug-report diagnostics use only the closed schema', () => {
    const now = Date.now();
    localStorage.setItem(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, JSON.stringify({
        schema: ReportDebugContext.SCHEMA,
        events: [{
            ts: now,
            phase: 'menu_resolve',
            result: 'menu_not_found',
            routeType: 'profile',
            counts: { moreCandidates: 1, menuItems: 0, confirmButtons: 0, postFallbackAttempts: 1 },
            elapsedMs: 120,
            retryCount: 1,
            username: 'must-drop',
            href: 'https://threads.net/@must-drop',
        }],
        batchUsers: ['must-drop'],
        source: { href: 'https://threads.net/@must-drop' },
        traces: [{ username: 'must-drop', url: 'https://threads.net/@must-drop', logs: ['secret'] }],
    }));
    localStorage.setItem(CONFIG.KEYS.REPORT_DEBUG_BATCH, JSON.stringify({
        batchUsers: ['must-drop'],
        source: { href: 'https://threads.net/@must-drop' },
        traces: [{ username: 'must-drop', url: 'https://threads.net/@must-drop' }],
    }));

    const payload = Core.buildBugReportDiagnosticsBundle();
    assert.deepEqual(Object.keys(payload).sort(), [
        'collectedAt', 'counts', 'elapsedMs', 'phase', 'result', 'retryCount',
        'routeType', 'status', 'type', 'version',
    ]);
    assert.deepEqual(Object.keys(payload.counts).sort(), [
        'confirmButtons', 'menuItems', 'moreCandidates', 'postFallbackAttempts',
    ]);
    assert.equal(payload.phase, 'menu_resolve');
    assert.equal(payload.result, 'menu_not_found');
    assert.equal(JSON.stringify(payload).includes('must-drop'), false);
    assert.equal(JSON.stringify(payload).includes('threads.net'), false);
    assert.equal(JSON.stringify(payload).includes('secret'), false);
});

test('beta50 local report/three-no exports remain separate from automatic upload path', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile(new URL('../src/core.js', import.meta.url), 'utf8');
    const reporter = await fs.readFile(new URL('../src/reporter.js', import.meta.url), 'utf8');
    const showReport = source.match(/showReportDialog:[\s\S]{0,1200}/)?.[0] || '';
    assert.match(showReport, /buildBugReportDiagnosticsBundle/);
    assert.doesNotMatch(showReport, /collectDiagnosticsBundle\(\)/);
    const submitReport = reporter.match(/submitReport:[\s\S]{0,2600}/)?.[0] || '';
    // ADR 0013：clientEnv 現在是輕量層的一部分，會隨問題回報送出。原本斷言
    // 「submitReport 不得出現 clientEnv」的用意是「回報路徑不得自行蒐集環境
    // 資料」，這個用意仍然成立，改為守住它：只能轉送 Core 交來的欄位。
    assert.doesNotMatch(submitReport, /Reporter\.collectClientEnv\(/);
    assert.match(submitReport, /clientEnv: safeLightweight\.clientEnv \|\| null/);
    assert.match(source, /buildReportDebugExport/);
    assert.match(source, /buildThreeNoDebugExport/);
});
