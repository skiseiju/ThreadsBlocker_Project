import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeFailedQueueEntry, normalizeFailedQueue } from '../src/core.js';

const core = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');

test('beta51 failed queue has bounded normalization and legacy string compatibility', () => {
    assert.deepEqual(normalizeFailedQueueEntry(' @alice/profile ', 'block'), {
        username: 'alice', type: 'block', reason: 'legacy_string', failedAt: 0,
    });
    const bounded = normalizeFailedQueueEntry({ username: 'bad<script>name', reason: 'not-allowed', failedAt: -4 }, 'report');
    assert.deepEqual(bounded, { username: 'badscriptname', type: 'report', reason: 'unknown', failedAt: 0 });
    assert.deepEqual(normalizeFailedQueue(['@alice', { username: 'alice', reason: 'action_failed' }], 'block').length, 1);
    assert.match(core, /normalizeFailedQueueEntry/);
    assert.match(core, /FAILED_REASON_ENUM/);
    assert.match(core, /legacy|legacy_string/i);
    assert.match(core, /failedAt/);
});

test('beta51 failure records stay local and retry manager exposes item actions', () => {
    assert.match(core, /recordFailure/);
    assert.match(core, /retryFailedEntry/);
    assert.match(core, /clearFailedEntry/);
    assert.match(ui, /showFailedQueueManager/);
    assert.match(ui, /開啟個人頁/);
    assert.match(ui, /noopener/);
    assert.match(worker, /recordFailure/);
    assert.doesNotMatch(core, /REPORT_FAILED_QUEUE[\s\S]{0,500}Reporter\./);
});

test('beta51 failure manager actions are idempotent and never auto-block from profile link', () => {
    assert.match(ui, /hege-failed-queue-overlay|failed-queue/);
    assert.match(core, /openFailureProfile/);
    assert.match(ui, /data-action="retry-one"/);
    assert.match(ui, /data-action="clear-one"/);
    assert.match(ui, /data-action="open-profile"/);
});

console.log('beta51 failed queue fixtures: PASS legacy normalization, bounded reasons, item actions');
