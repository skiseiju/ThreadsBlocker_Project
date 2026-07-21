import assert from 'node:assert/strict';
import test from 'node:test';
import { CONFIG } from '../src/config.js';
import { RuntimeDiagnostics, Core } from '../src/core.js';
import { Reporter } from '../src/reporter.js';

const originalVersion = CONFIG.VERSION;
const originalEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;

const resetDiagnostics = () => {
    CONFIG.VERSION = '2.7.4-beta57';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
};

test('beta57 adversarial reporter primary and fallback network rejects are terminal and bucketed', async () => {
    resetDiagnostics();
    const originals = { endpoints: Reporter.getReportEndpoints, hwid: Reporter.getHardwareId, sha: Reporter.sha256, send: Reporter.sendViaFetch };
    Reporter.getReportEndpoints = () => ['https://example.invalid/report'];
    Reporter.getHardwareId = () => 'test-hwid';
    Reporter.sha256 = async () => 'sig';
    try {
        Reporter.sendViaFetch = async () => { throw new Error('primary network'); };
        await Reporter.submitReport('error', 'message', 'network', null);
        let exported = RuntimeDiagnostics.export();
        assert.ok(exported.entries.some(e => e.feature === 'report' && e.stage === 'http' && e.fields.httpBucket === 'network'));
        assert.equal(RuntimeDiagnostics._operations.size, 0);

        let calls = 0;
        Reporter.sendViaFetch = async () => (++calls === 1 ? { code: 422, message: 'reject metadata' } : Promise.reject(new Error('fallback network')));
        await Reporter.submitReport('error', 'message', 'network', { diagnosticConsent: true, diagnosticsBundle: { schema: 'safe' } });
        exported = RuntimeDiagnostics.export();
        assert.ok(exported.entries.some(e => e.feature === 'report' && e.stage === 'http' && e.fields.httpBucket === 'network' && e.fields.diagnosticsFallback === true));
        assert.equal(RuntimeDiagnostics._operations.size, 0);
    } finally {
        Object.assign(Reporter, { getReportEndpoints: originals.endpoints, getHardwareId: originals.hwid, sha256: originals.sha, sendViaFetch: originals.send });
    }
});

test('beta57 collector exception records error and terminal and clears operation map', async () => {
    resetDiagnostics();
    const ctx = { querySelectorAll() { throw new Error('fixture collector failure'); } };
    await assert.rejects(() => Core.collectFullDialogUsers(ctx), /fixture collector failure/);
    const entries = RuntimeDiagnostics.export().entries.filter(e => e.feature === 'clean_list');
    assert.ok(entries.some(e => e.stage === 'error'));
    assert.ok(entries.some(e => e.fields.terminal === true || e.stage === 'terminal'));
    assert.equal(RuntimeDiagnostics._operations.size, 0);
});

test('beta57 stable gate strips consent attachment and legacy debug exports', async () => {
    const originals = { endpoints: Reporter.getReportEndpoints, hwid: Reporter.getHardwareId, sha: Reporter.sha256, send: Reporter.sendViaFetch };
    CONFIG.VERSION = '2.7.4';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    const sent = [];
    Reporter.getReportEndpoints = () => ['https://example.invalid/report'];
    Reporter.getHardwareId = () => 'test-hwid';
    Reporter.sha256 = async () => 'sig';
    Reporter.sendViaFetch = async (_endpoint, payload) => { sent.push(payload); return { code: 200 }; };
    try {
        await Reporter.submitReport('error', 'message', 'stable', { diagnosticConsent: true, diagnosticsBundle: { username: 'SECRET', url: 'https://secret.invalid', userAgent: 'UA' } });
        assert.equal(sent.length, 1);
        assert.doesNotMatch(sent[0].metadata, /diagnosticsBundle|SECRET|secret\.invalid|userAgent/i);
        assert.equal(Core.buildReportDebugExport(), null);
        assert.equal(Core.buildThreeNoDebugExport(), null);
        assert.equal(Core.collectDiagnosticsBundle(), null);
    } finally {
        Object.assign(Reporter, { getReportEndpoints: originals.endpoints, getHardwareId: originals.hwid, sha256: originals.sha, sendViaFetch: originals.send });
        CONFIG.VERSION = originalVersion;
        CONFIG.ENABLE_BETA_DIAGNOSTICS = originalEnabled;
    }
});
