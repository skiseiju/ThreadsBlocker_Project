import assert from 'node:assert/strict';
import test from 'node:test';
import { Core } from '../src/core.js';
import '../src/features/three-no-watch.js';
import { RuntimeDiagnostics } from '../src/core.js';
import { Worker } from '../src/worker.js';
import { diagnosticsEnabled, diagnosticsSkipReason } from './helpers/diagnostics-gate.mjs';

test('beta57 observeStop owner-scoped and legacy commands finish without ReferenceError', async () => {
    const watch = Core.ThreeNoWatch;
    const originals = {
        getScanState: watch.getScanState,
        getOwnedStopCommand: watch.getOwnedStopCommand,
        ownsScan: watch.ownsScan,
        setScanState: watch.setScanState,
        finishScan: watch.finishScan,
        isTerminalStatus: watch.isTerminalStatus,
    };
    const finished = [];
    try {
        watch.isTerminalStatus = () => false;
        watch.setScanState = () => {};
        watch.finishScan = async payload => { finished.push(payload); return true; };
        watch.ownsScan = () => true;
        watch.getScanState = () => ({ scanId: 'scan-1', ownerToken: 'owner-1', status: 'running' });
        watch.getOwnedStopCommand = () => ({ command: 'stop', scanId: 'scan-1', ownerToken: 'owner-1', requestedAt: Date.now() });
        assert.equal(await watch.observeStop('owner_probe'), true);
        watch.getScanState = () => ({ scanId: '', ownerToken: '', status: 'running' });
        watch.getOwnedStopCommand = () => ({ command: 'stop', legacy: true });
        assert.equal(await watch.observeStop('legacy_probe'), true);
        assert.equal(finished.length, 2);
        assert.deepEqual(finished.map(item => item.status), ['stopped', 'stopped']);
    } finally {
        Object.assign(watch, originals);
    }
});

test('beta57 worker source has terminal cooldown handling for init and verify breaker branches', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
    assert.match(source, /Worker\.recordSafetyDiagnostic\('cooldown',[\s\S]{0,260}Worker\.endDiagnostic\(Worker\._diagnosticOperationId, 'terminal'/);
    assert.match(source, /recordSafetyDiagnostic\('breaker', 'breaker_open'/);
    assert.match(source, /recordSafetyDiagnostic\('retry', 'retry'/);
});

test('beta57 safety writer emits executable retry/failure/breaker/cooldown sequence', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, () => {
    const previousVersion = globalThis.__tb_test_version;
    const previousStorage = globalThis.localStorage;
    const memory = new Map();
    globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
    RuntimeDiagnostics.clear();
    const op = RuntimeDiagnostics.begin('blocking', { strategy: 'route' });
    try {
        Worker.recordSafetyDiagnostic('retry', 'retry', 'unknown', {}, { retryCount: 1 }, { operationId: op });
        Worker.recordSafetyDiagnostic('failure', 'failure', 'unknown', {}, { retryCount: 5 }, { operationId: op });
        Worker.recordSafetyDiagnostic('breaker', 'breaker_open', 'unknown', {}, { retryCount: 5 }, { operationId: op });
        Worker.recordSafetyDiagnostic('cooldown', 'cooldown', 'unknown', {}, {}, { operationId: op });
        RuntimeDiagnostics.end(op, 'terminal', { reason: 'cooldown', ok: false });
        const stages = RuntimeDiagnostics.get().filter(entry => entry.operationId === op).map(entry => entry.stage);
        assert.ok(stages.includes('retry'));
        assert.ok(stages.includes('failure'));
        assert.ok(stages.includes('breaker'));
        assert.ok(stages.includes('cooldown'));
        assert.ok(stages.includes('terminal'));
        assert.equal(RuntimeDiagnostics._operations.size, 0);
    } finally {
        void previousVersion;
        globalThis.localStorage = previousStorage;
    }
});
