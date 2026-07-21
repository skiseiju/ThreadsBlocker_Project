import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ReportDebugContext } from '../src/report-debug-context.js';

const NOW = 1_800_000_000_000;
const PHASES = [
    'root_resolve',
    'more_resolve',
    'navigation_check',
    'menu_resolve',
    'action_resolve',
    'confirm_resolve',
    'queue_advance',
];

const diagnosticEvent = (extra = {}) => ({
    ts: NOW,
    phase: 'root_resolve',
    result: 'success',
    routeType: 'profile',
    counts: {
        moreCandidates: 2,
        menuItems: 3,
        confirmButtons: 1,
        postFallbackAttempts: 0,
    },
    elapsedMs: 120,
    retryCount: 1,
    ...extra,
});

test('beta50 diagnostics expose a closed phase enum and bounded timing/counts', () => {
    assert.deepEqual([...ReportDebugContext.PHASES], PHASES);

    const snapshot = ReportDebugContext.append(null, diagnosticEvent(), NOW);
    assert.ok(snapshot, 'a valid phase event must be accepted');
    assert.deepEqual(Object.keys(snapshot.events[0]).sort(), [
        'counts', 'elapsedMs', 'phase', 'result', 'retryCount', 'routeType', 'ts',
    ]);
    assert.deepEqual(Object.keys(snapshot.events[0].counts).sort(), [
        'confirmButtons', 'menuItems', 'moreCandidates', 'postFallbackAttempts',
    ]);
    assert.equal(snapshot.events[0].phase, 'root_resolve');
    assert.equal(snapshot.events[0].elapsedMs, 120);
    assert.equal(snapshot.events[0].retryCount, 1);
});

test('beta50 diagnostics reject open phases and malformed bounded fields', () => {
    assert.equal(ReportDebugContext.append(null, diagnosticEvent({ phase: 'free_text' }), NOW), null);
    assert.equal(ReportDebugContext.append(null, diagnosticEvent({ elapsedMs: -1 }), NOW), null);
    assert.equal(ReportDebugContext.append(null, diagnosticEvent({ retryCount: 1.5 }), NOW), null);
    assert.equal(ReportDebugContext.append(null, diagnosticEvent({ counts: { moreCandidates: 1, menuItems: Number.NaN, confirmButtons: 0, postFallbackAttempts: 0 } }), NOW), null);
    assert.equal(ReportDebugContext.append(null, diagnosticEvent({ counts: { moreCandidates: 1, menuItems: 0, confirmButtons: 0, postFallbackAttempts: 1000001 } }), NOW), null);
});

test('beta50 block/report paths expose every privacy-safe diagnostic phase', async () => {
    const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
    const report = await readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8');
    assert.match(worker, /recordSafetyDiagnostic/);
    assert.match(report, /recordSafetyDiagnostic/);
    for (const phase of PHASES) {
        assert.match(worker, new RegExp(`['"]${phase}['"]`), `worker must record ${phase}`);
        assert.match(report, new RegExp(`['"]${phase}['"]`), `report must record ${phase}`);
    }
    const safe = ReportDebugContext.append(null, diagnosticEvent({
        username: 'must-drop',
        href: 'https://threads.net/@secret',
        dom: '<div>secret</div>',
        text: 'private text',
        token: 'secret-token',
    }), NOW);
    assert.equal(JSON.stringify(safe).includes('secret'), false);
    assert.equal(JSON.stringify(safe).includes('threads.net'), false);
    assert.equal(JSON.stringify(safe).includes('<div>'), false);
});
