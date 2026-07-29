// ADR 0013：診斷拆成輕量層（所有版本、免同意）與完整層（勾選同意）。
//
// 起因：2.8.0 多數使用者回報無法封鎖，但收到的每一封回報都只有一句描述加版本號。
// RuntimeDiagnostics.enabled() 寫死只在 `-betaN` 版本回 true，正式版既不收集、
// 回報視窗的勾選框也不顯示，等於災情期間完全沒有線索可查。
//
// 本檔守三件事：輕量層真的會送、完整層仍要同意、以及輕量層不得夾帶敏感值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const read = (rel) => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const configSource = await read('src/config.js');
const coreSource = await read('src/core.js');
const uiSource = await read('src/ui.js');
const gasSource = await read('gas_bug_reporter/bug_report_server.gs');
const workerAdminSource = await read('cf_bug_admin/src/index.js');

const localValues = new Map();
globalThis.localStorage = {
    getItem: (key) => localValues.has(key) ? localValues.get(key) : null,
    setItem: (key, value) => localValues.set(key, String(value)),
    removeItem: (key) => localValues.delete(key),
};
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: { platform: 'test', userAgent: 'lightweight-diagnostics-test', onLine: true },
    });
}
const { Reporter } = await import('../src/reporter.js');

async function capture(metadata) {
    let sent = null;
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (_endpoint, options) => {
        sent = JSON.parse(options.body);
        return { text: async () => JSON.stringify({ code: 200 }) };
    };
    try {
        const result = await Reporter.submitReport('ERROR', 'lightweight test', 'UI_REPORT', metadata);
        assert.equal(result.code, 200);
        return sent;
    } finally {
        globalThis.fetch = oldFetch;
    }
}

test('收集閘門與 beta debug UI 閘門是兩條，不得再合併', () => {
    assert.match(configSource, /ENABLE_RUNTIME_DIAGNOSTICS: true/);
    assert.match(coreSource, /betaDebugUI\(\) \{\s*\n\s*return CONFIG\.ENABLE_BETA_DIAGNOSTICS === true && \/-beta/);
    const enabledFn = coreSource.slice(coreSource.indexOf('    enabled() {'), coreSource.indexOf('    installObservers('));
    assert.match(enabledFn, /CONFIG\.ENABLE_RUNTIME_DIAGNOSTICS === true/);
    assert.doesNotMatch(enabledFn, /-beta/, 'ring buffer 收集不得再綁 beta 版號');
});

test('手動 debug／export UI 仍只在 beta 版出現（AGENTS.md 要求）', () => {
    assert.match(uiSource, /onCopyDiagnostics && globalThis\.__hegeRuntimeDiagnostics\?\.betaDebugUI\?\.\(\) === true/);
    assert.match(coreSource, /copyRuntimeDiagnostics: async \(\) => \{\s*\n\s*if \(!RuntimeDiagnostics\.betaDebugUI\(\)\)/);
    assert.match(coreSource, /clearRuntimeDiagnostics: \(\) => \{\s*\n\s*if \(!RuntimeDiagnostics\.betaDebugUI\(\)\)/);
});

test('回報一律組出輕量層，完整附件才看勾選同意', () => {
    const dialog = coreSource.slice(coreSource.indexOf('showReportDialog: () => {'));
    assert.match(dialog, /lightweightDiagnostics: Core\.buildLightweightDiagnostics\(\)/);
    assert.match(dialog, /\.\.\.\(fullConsent \? \{ diagnosticsBundle: Core\.buildBugReportDiagnosticsBundle\(\) \} : \{\}\)/);
});

test('沒有勾選同意時，輕量層仍然送得出去', async () => {
    const sent = await capture({
        diagnosticConsent: false,
        lightweightDiagnostics: {
            schema: 'threadsblocker.lightweight_diagnostics_v1',
            clientEnv: { platform: 'test', scriptManager: 'none' },
            viewport: { width: 1200, height: 900 },
            runtimeDiagnostics: { entries: [{ feature: 'block', stage: 'root_resolve', fields: { relaxedRoot: true } }] },
        },
    });
    assert.notEqual(sent.metadata, '', '輕量層不得被當成「沒有同意就不送」而清空');
    const parsed = JSON.parse(sent.metadata);
    assert.equal(parsed.lightweightDiagnostics.schema, 'threadsblocker.lightweight_diagnostics_v1');
    assert.equal(parsed.userMetadata, undefined, '沒有同意就不得出現完整附件');
});

test('完全沒有 metadata 時不得自己捏造內容', async () => {
    const sent = await capture(null);
    assert.equal(sent.metadata, '');
});

test('輕量層一樣要過 scrub，不得夾帶憑證值', async () => {
    const sent = await capture({
        diagnosticConsent: false,
        lightweightDiagnostics: {
            schema: 'threadsblocker.lightweight_diagnostics_v1',
            clientEnv: { platform: 'test' },
            cookie: 'COOKIE_CANARY',
            authorization_canary: 'AUTH_CANARY',
            requestBody: 'fb_dtsg=TOKEN_CANARY',
        },
    });
    const blob = JSON.stringify(sent);
    for (const canary of ['COOKIE_CANARY', 'AUTH_CANARY', 'TOKEN_CANARY']) {
        assert.equal(blob.includes(canary), false, `${canary} 不得出現在輕量層`);
    }
});

test('GAS 備援端點不得把診斷寫進試算表', () => {
    const appendRow = gasSource.slice(gasSource.indexOf('sheet.appendRow(['), gasSource.indexOf(']);', gasSource.indexOf('sheet.appendRow([')));
    assert.doesNotMatch(appendRow, /data\.metadata/, '備援只需要求救訊息，不需要診斷內容');
    assert.match(gasSource, /diagnostics_present_not_stored/);
});

test('後台補上單筆查詢，診斷讀得回來且仍是唯讀', () => {
    assert.match(workerAdminSource, /async function handleAdminDetail\(request, env, rawId\)/);
    const fn = workerAdminSource.slice(workerAdminSource.indexOf('async function handleAdminDetail'), workerAdminSource.indexOf('__name(handleAdminDetail'));
    assert.match(fn, /assertScope\(request, env, "reports:read"\)/);
    assert.match(fn, /metadata\n\s*FROM bug_reports/);
    assert.doesNotMatch(fn, /INSERT|UPDATE|DELETE/, '這支必須是唯讀');
});
