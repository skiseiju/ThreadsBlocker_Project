import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { RuntimeDiagnostics } from '../src/core.js';
import { UI } from '../src/ui.js';

test('panel destroy helper closes the mounted panel operation', () => {
    const originalVersion = CONFIG.VERSION;
    const originalFlag = CONFIG.ENABLE_BETA_DIAGNOSTICS;
    CONFIG.VERSION = '2.7.4-beta57';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
    const operationId = RuntimeDiagnostics.begin('panel', { strategy: 'route', active: true });
    const panel = { dataset: { hegeDiagnosticOperationId: operationId }, remove() { this.removed = true; } };
    assert.equal(UI.destroyPanel(panel), true);
    const entries = RuntimeDiagnostics.get().filter(entry => entry.operationId === operationId);
    assert.ok(entries.some(entry => entry.stage === 'close' && entry.fields.terminal === true));
    assert.equal(panel.removed, true);
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalFlag;
    RuntimeDiagnostics.clear();
});

console.log('beta57 panel lifecycle helper: PASS mount-operation terminal close');
