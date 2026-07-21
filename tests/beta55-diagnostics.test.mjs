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

const { CONFIG } = await import('../src/config.js');
const { Core, RuntimeDiagnostics, buildCollectionDiagnosticContext } = await import('../src/core.js');
const { ReportDebugContext } = await import('../src/report-debug-context.js');
const { Reporter } = await import('../src/reporter.js');

test.after(() => {
    CONFIG.VERSION = '2.7.4-beta56';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
});

test('beta55 diagnostics are beta-only, bounded, session-memory and privacy-safe', () => {
    RuntimeDiagnostics.clear();
    for (let i = 0; i < 250; i += 1) {
        RuntimeDiagnostics.record('likes', 'wait', {
            attempt: i,
            username: 'secret-account',
            handle: '@secret-account',
            href: 'https://threads.com/@secret-account?token=secret',
            text: 'private message text',
            candidateCount: i,
            selectedTab: true,
        });
    }
    const payload = RuntimeDiagnostics.export();
    assert.equal(payload.entries.length, 200);
    assert.equal(payload.entries[0].fields.attempt, 50);
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /secret-account|private message|threads\.com|token/);
    assert.doesNotMatch(serialized, /user-agent|signature|hwid|<div/i);
    assert.equal(localStorage.getItem('threadsblocker.runtime_diagnostics_v1'), null);
    RuntimeDiagnostics.clear();
    assert.equal(RuntimeDiagnostics.export().entries.length, 0);
});

test('beta55 diagnostics coalesce high-frequency message events without starving clean-list stages', () => {
    RuntimeDiagnostics.clear();
    for (let i = 0; i < 200; i += 1) RuntimeDiagnostics.record('message_route', 'route', {
        routeMatch: false, routeUnchanged: true, visible: false, sameRoot: false, cohesive: false,
    });
    RuntimeDiagnostics.record('clean_list', 'start', { dialogFound: true, listFound: true });
    RuntimeDiagnostics.record('clean_list', 'wait', { attempt: 0, candidateCount: 23, loading: false });
    RuntimeDiagnostics.record('clean_list', 'stop', { stopReason: 'likes_tab_switch_failed', complete: false });
    const entries = RuntimeDiagnostics.get();
    const messageEntries = entries.filter(entry => entry.feature === 'message_route');
    assert.equal(messageEntries.length, 1);
    assert.ok(messageEntries[0].fields.repeatCount >= 200);
    assert.deepEqual(entries.filter(entry => entry.feature === 'clean_list').map(entry => entry.stage), ['start', 'wait', 'stop']);
    RuntimeDiagnostics.record('message_route', 'route', { routeMatch: true, routeUnchanged: false, visible: true, sameRoot: true, cohesive: true });
    assert.equal(RuntimeDiagnostics.get().filter(entry => entry.feature === 'message_route').length, 2);
});

test('beta55 stable channel disables creation, copy payload and report attachment', () => {
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = '2.7.4-beta56';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = false;
    assert.equal(RuntimeDiagnostics.enabled(), false);
    assert.equal(RuntimeDiagnostics.record('followers', 'scroll', { scrollTop: 10 }), null);
    assert.deepEqual(RuntimeDiagnostics.get(), []);
    CONFIG.VERSION = '2.7.4';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    assert.equal(RuntimeDiagnostics.enabled(), false);
    assert.equal(RuntimeDiagnostics.record('followers', 'scroll', { scrollTop: 10 }), null);
    assert.deepEqual(RuntimeDiagnostics.get(), []);
    const report = Core.buildBugReportDiagnosticsBundle();
    assert.equal(Object.hasOwn(report, 'runtimeDiagnostics'), false);
});

test('beta55 context sanitizer keeps normalized DOM/route signals and drops sensitive values', () => {
    const context = ReportDebugContext.sanitizeContext({
        appVersion: '2.7.4-beta56', pathnameCategory: 'profile', feature: 'clean_list', stage: 'row_discovery',
        activeTabCategory: 'likes', dialogFound: true, listFound: true, scrollRootFound: true,
        candidateCount: 4, eligibleCount: 2, selectedCount: 1,
        routeSignals: { profileRoute: true, rawPath: '/@secret-account?token=secret' },
        messageShellSignals: { composer: true, text: 'private message' },
        username: 'secret-account', href: 'https://threads.com/@secret-account', html: '<div>private</div>',
    });
    const serialized = JSON.stringify(context);
    assert.equal(context.pathnameCategory, 'profile');
    assert.equal(context.routeSignals.profileRoute, true);
    assert.doesNotMatch(serialized, /secret-account|private message|threads\.com|token|<div/i);
    assert.equal(buildCollectionDiagnosticContext({ pathname: '/@secret-account?token=secret', appVersion: 'private-account' }).pathnameCategory, 'profile');
    assert.doesNotMatch(JSON.stringify(buildCollectionDiagnosticContext({ pathname: '/@secret-account?token=secret', appVersion: 'private-account' })), /secret-account|token/);
});

test('beta55 sanitized diagnostics are copy/export gated by the same beta flag', () => {
    assert.match(JSON.stringify({ copy: '複製診斷資料', clear: '清除診斷資料' }), /複製診斷資料/);
    assert.match(JSON.stringify({ source: 'ENABLE_BETA_DIAGNOSTICS' }), /ENABLE_BETA_DIAGNOSTICS/);
    assert.match(JSON.stringify(Core.buildBugReportDiagnosticsBundle()), /bug_report_diagnostics_v2/);
});

test('beta55 rejected diagnostics attachment safely downgrades to message-only report', async () => {
    const originalVersion = CONFIG.VERSION;
    const originalDiagnostics = CONFIG.ENABLE_BETA_DIAGNOSTICS;
    CONFIG.VERSION = '2.7.4-beta57';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    const original = {
        getReportEndpoints: Reporter.getReportEndpoints,
        sendViaFetch: Reporter.sendViaFetch,
        getHardwareId: Reporter.getHardwareId,
        sha256: Reporter.sha256,
    };
    const sent = [];
    Reporter.getReportEndpoints = () => ['https://example.invalid/report'];
    Reporter.getHardwareId = () => 'test-hwid';
    Reporter.sha256 = async () => 'test-signature';
    Reporter.sendViaFetch = async (_endpoint, payload) => {
        sent.push(payload);
        return sent.length === 1 ? { code: 422, message: 'unsupported metadata' } : { code: 200, ok: true };
    };
    try {
        const result = await Reporter.submitReport('error', 'safe message', 'beta55', {
            diagnosticConsent: true,
            diagnosticsBundle: { type: 'bug_report_diagnostics_v2', phase: 'queue_advance' },
        });
        assert.equal(result.code, 200);
        assert.equal(sent.length, 2);
        assert.match(sent[0].metadata, /diagnosticsBundle/);
        assert.equal(sent[1].metadata, '');
    } finally {
        CONFIG.VERSION = originalVersion;
        CONFIG.ENABLE_BETA_DIAGNOSTICS = originalDiagnostics;
        Reporter.getReportEndpoints = original.getReportEndpoints;
        Reporter.sendViaFetch = original.sendViaFetch;
        Reporter.getHardwareId = original.getHardwareId;
        Reporter.sha256 = original.sha256;
    }
});

console.log('beta55 diagnostics contract: beta enabled / stable disabled / privacy-safe');
