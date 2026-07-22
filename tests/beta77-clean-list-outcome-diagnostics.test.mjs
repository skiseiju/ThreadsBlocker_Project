import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { buildCleanListOutcomeFields, countDialogCheckboxes, measureCleanListContext, RuntimeDiagnostics } from '../src/core.js';

const originalVersion = CONFIG.VERSION;
const originalFlag = CONFIG.ENABLE_BETA_DIAGNOSTICS;

test.beforeEach(() => {
    CONFIG.VERSION = '2.7.4-beta77';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
});

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalFlag;
    RuntimeDiagnostics.clear();
});

test('beta77 category sanitization keeps valid values and downgrades invalid ones to unknown', () => {
    assert.equal(buildCleanListOutcomeFields({ category: 'clean_toast_queued' }).category, 'clean_toast_queued');
    assert.equal(buildCleanListOutcomeFields({ category: 'Clean-Toast' }).category, 'unknown');
    assert.equal(buildCleanListOutcomeFields({ category: '' }).category, 'unknown');
    assert.equal(buildCleanListOutcomeFields({ category: 123 }).category, 'unknown');
});

test('beta77 count fields clamp negatives, coerce non-finite values to zero, and floor decimals', () => {
    const fields = buildCleanListOutcomeFields({
        rawUserCount: -1,
        newUserCount: Number.NaN,
        pendingCount: undefined,
        checkedInputCount: '4',
        checkboxContainerCount: 6.9,
        exactLinkCount: -2.5,
        bestExactLinkCount: 8.1,
    });
    assert.equal(fields.rawUserCount, 0);
    assert.equal(fields.newUserCount, 0);
    assert.equal(fields.pendingCount, 0);
    assert.equal(fields.checkedInputCount, 0);
    assert.equal(fields.checkboxContainerCount, 6);
    assert.equal(fields.exactLinkCount, 0);
    assert.equal(fields.bestExactLinkCount, 8);
});

test('beta77 boolean fields use double-negation semantics', () => {
    const fields = buildCleanListOutcomeFields({
        contextMatch: 'false',
        activityDialog: 0,
        committed: 'false',
        rollback: 0,
    });
    assert.equal(fields.contextMatch, true);
    assert.equal(fields.activityDialog, false);
    assert.equal(fields.committed, true);
    assert.equal(fields.rollback, false);
});

test('beta77 buildCleanListOutcomeFields is pure and does not mutate the input object', () => {
    const input = {
        category: 'clean_toast_pending_added',
        rawUserCount: 3.7,
        contextMatch: true,
        committed: false,
    };
    const snapshot = { ...input };
    buildCleanListOutcomeFields(input);
    assert.deepEqual(input, snapshot);
});

test('beta77 RuntimeDiagnostics allowlist preserves clean-list outcome fields', () => {
    if (!RuntimeDiagnostics.enabled()) assert.fail(`RuntimeDiagnostics.enabled() is false for ${CONFIG.VERSION}`);
    RuntimeDiagnostics.record('clean_list', 'status', buildCleanListOutcomeFields({
        category: 'clean_toast_report_added',
        rawUserCount: 12,
        newUserCount: 8,
        pendingCount: 5,
        checkedInputCount: 4,
        checkboxContainerCount: 9,
        exactLinkCount: 7,
        bestExactLinkCount: 6,
        contextMatch: true,
        activityDialog: true,
        committed: true,
        rollback: false,
    }));
    const entry = RuntimeDiagnostics.get().at(-1);
    assert.ok(entry);
    for (const key of [
        'bestExactLinkCount',
        'checkedInputCount',
        'checkboxContainerCount',
        'newUserCount',
        'rawUserCount',
        'activityDialog',
        'contextMatch',
    ]) assert.equal(Object.prototype.hasOwnProperty.call(entry.fields, key), true, key);
});

test('beta77 RuntimeDiagnostics privacy gate drops username href and text fields', () => {
    if (!RuntimeDiagnostics.enabled()) assert.fail(`RuntimeDiagnostics.enabled() is false for ${CONFIG.VERSION}`);
    RuntimeDiagnostics.record('clean_list', 'status', {
        ...buildCleanListOutcomeFields({ category: 'clean_toast_collect_failed', rollback: true }),
        username: 'someone',
        href: '/@someone',
        text: 'hi',
    });
    const entry = RuntimeDiagnostics.get().at(-1);
    assert.ok(entry);
    assert.equal(Object.prototype.hasOwnProperty.call(entry.fields, 'username'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(entry.fields, 'href'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(entry.fields, 'text'), false);
});

test('beta77 countDialogCheckboxes returns zeroed defaults without DOM and does not throw', () => {
    assert.doesNotThrow(() => countDialogCheckboxes());
    assert.deepEqual(countDialogCheckboxes(), {
        checkedInputCount: 0,
        checkboxContainerCount: 0,
    });
});

test('beta77 measureCleanListContext returns zeroed defaults without DOM', () => {
    assert.deepEqual(measureCleanListContext(null), {
        contextMatch: false,
        exactLinkCount: 0,
        bestExactLinkCount: 0,
        checkedInputCount: 0,
        checkboxContainerCount: 0,
    });
});
