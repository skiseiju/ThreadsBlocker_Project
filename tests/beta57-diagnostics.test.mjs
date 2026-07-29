import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { RuntimeDiagnostics } from '../src/core.js';
import { readFile } from 'node:fs/promises';

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

test('beta57 operation lifecycle shares id and exports feature summary', () => {
    const operationId = RuntimeDiagnostics.begin('blocking', { queueCount: 2, strategy: 'same_tab' });
    RuntimeDiagnostics.record('blocking', 'dequeue', { operationId, pendingCount: 2 });
    RuntimeDiagnostics.end(operationId, 'finish', { reason: 'completed', ok: true });
    const entries = RuntimeDiagnostics.get().filter(entry => entry.operationId === operationId);
    assert.ok(entries.length >= 3);
    assert.deepEqual(new Set(entries.map(entry => entry.operationId)), new Set([operationId]));
    assert.equal(RuntimeDiagnostics.export().summary.blocking, entries.length);
});

test('beta57 terminal entries survive scroll/message noise in bounded ring', () => {
    const operationId = RuntimeDiagnostics.begin('clean_list', { strategy: 'dialog_context' });
    for (let i = 0; i < 400; i += 1) RuntimeDiagnostics.record('message_route', 'scroll', { operationId: `message_route-${String(i).padStart(12, '0')}`, scrollTop: i });
    RuntimeDiagnostics.end(operationId, 'rollback', { reason: 'timeout', ok: false });
    const entries = RuntimeDiagnostics.get();
    assert.ok(entries.some(entry => entry.operationId === operationId && entry.stage === 'start'));
    assert.ok(entries.some(entry => entry.operationId === operationId && entry.stage === 'rollback'));
    assert.ok(entries.length <= 200);
});

test('beta57 privacy sanitizer drops sensitive fields and stable gate is empty', () => {
    RuntimeDiagnostics.record('report', 'http', {
        operationId: 'report-abc123', statusCode: 422, category: '4xx',
        username: '@private', message: 'secret post text', href: 'https://threads.example/@private?x=1',
        html: '<div class="secret">', token: 'secret', diagnosticsAttached: true,
    });
    const serialized = JSON.stringify(RuntimeDiagnostics.export());
    assert.doesNotMatch(serialized, /private|secret|threads\.example|token|html|href/);
    // ADR 0013：收集的總開關是 ENABLE_RUNTIME_DIAGNOSTICS，不再是 beta 版號。
    const previousRuntime = CONFIG.ENABLE_RUNTIME_DIAGNOSTICS;
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = false;
    assert.equal(RuntimeDiagnostics.record('runtime', 'config', { active: true }), null);
    assert.deepEqual(RuntimeDiagnostics.get(), []);
    assert.equal(RuntimeDiagnostics.export(), null);
    CONFIG.ENABLE_RUNTIME_DIAGNOSTICS = previousRuntime;
});

test('beta57 source coverage includes all requested diagnostic feature families', async () => {
    const sources = await Promise.all([
        readFile(new URL('../src/worker.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/core.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/features/three-no-watch.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/features/post-reservoir-engine.js', import.meta.url), 'utf8'),
        readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8'),
    ]);
    const all = sources.join('\n');
    for (const feature of ['blocking', 'selection', 'three_no', 'reservoir', 'report', 'runtime']) assert.match(all, new RegExp(`['"]${feature}['"]`));
    for (const stage of ['dequeue', 'navigation', 'menu', 'confirm', 'retry', 'cooldown', 'launch', 'worker', 'http', 'rollback']) assert.match(all, new RegExp(`['"]${stage}['"]`));
});

console.log('beta57 diagnostics contract: operation lifecycle / terminal priority / privacy / coverage');
