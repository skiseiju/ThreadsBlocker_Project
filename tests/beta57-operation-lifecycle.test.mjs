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
const { CONFIG } = await import('../src/config.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');
const { Reporter } = await import('../src/reporter.js');

const originalVersion = CONFIG.VERSION;
const originalFlag = CONFIG.ENABLE_BETA_DIAGNOSTICS;

test.beforeEach(() => {
    CONFIG.VERSION = '2.7.4-beta57';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
});

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalFlag;
    RuntimeDiagnostics.clear();
});

test('selection and clean-list helpers keep one operation id from start to terminal', async () => {
    Core.beginBlockSession(['local-only']);
    Core.markStopRequested();
    const selectionEntries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'selection');
    assert.ok(selectionEntries.length >= 4);
    assert.ok(selectionEntries.every(entry => /^selection-[a-z0-9]{1,16}$/i.test(entry.operationId)));

    RuntimeDiagnostics.clear();
    const result = await Core.collectFullDialogUsers(null);
    assert.equal(result.complete, false);
    const cleanEntries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'clean_list');
    assert.ok(cleanEntries.some(entry => entry.stage === 'start'));
    assert.ok(cleanEntries.some(entry => entry.fields.terminal === true));
    assert.equal(new Set(cleanEntries.map(entry => entry.operationId)).size, 1);
});

test('report HTTP success/client/server buckets remain distinct after coalesce', async () => {
    const original = {
        endpoints: Reporter.getReportEndpoints,
        fetch: Reporter.sendViaFetch,
        hwid: Reporter.getHardwareId,
        sha: Reporter.sha256,
    };
    let call = 0;
    Reporter.getReportEndpoints = () => ['https://example.invalid/report'];
    Reporter.getHardwareId = () => 'test';
    Reporter.sha256 = async () => 'signature';
    Reporter.sendViaFetch = async () => ({ code: [200, 422, 503][call++] });
    try {
        await Reporter.submitReport('error', 'safe', 'test');
        await Reporter.submitReport('error', 'safe', 'test');
        await Reporter.submitReport('error', 'safe', 'test');
        const http = RuntimeDiagnostics.get().filter(entry => entry.feature === 'runtime' && entry.stage === 'http');
        assert.equal(http.length, 3);
        assert.deepEqual(http.map(entry => entry.fields.category), ['success', 'client_error', 'server_error']);
    } finally {
        Reporter.getReportEndpoints = original.endpoints;
        Reporter.sendViaFetch = original.fetch;
        Reporter.getHardwareId = original.hwid;
        Reporter.sha256 = original.sha;
    }
});

console.log('beta57 operation lifecycle helpers: PASS selection/clean-list/report HTTP buckets');
