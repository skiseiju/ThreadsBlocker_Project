import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const updateStart = coreSource.indexOf('updateControllerUI: () =>');
const updateEnd = coreSource.indexOf('\n    },', updateStart);
const updateSource = coreSource.slice(updateStart, updateEnd);
const retryStart = updateSource.indexOf('const retryItem = document.getElementById');
const restoreStart = updateSource.indexOf('const restoreItem = document.getElementById', retryStart);
const restoreEnd = updateSource.indexOf('\n\n        const threeNoResults', restoreStart);
const retrySource = updateSource.slice(retryStart, restoreStart);
const restoreSource = updateSource.slice(restoreStart, restoreEnd);

test('beta2 守門：主面板不再顯示冷卻備份說明列', () => {
    assert.ok(updateStart >= 0, '找不到主面板更新函式');
    assert.ok(updateEnd > updateStart, '找不到主面板更新函式結尾');
    assert.doesNotMatch(updateSource, /failedCooldownActive/);
    assert.doesNotMatch(updateSource, /已移入冷卻備份/);
    assert.doesNotMatch(updateSource, /冷卻結束後可重試/);
});

test('beta2 守門：失敗清單與舊冷卻備份各自依自己的條件顯示', () => {
    assert.match(retrySource, /totalFailed > 0/);
    assert.match(retrySource, /重試失敗清單/);
    assert.doesNotMatch(retrySource, /cooldownQueue\.length > 0/);
    assert.doesNotMatch(retrySource, /把冷卻備份併回待處理清單/);
    assert.match(restoreSource, /cooldownQueue\.length > 0/);
    assert.match(restoreSource, /把冷卻備份併回待處理清單/);
    assert.doesNotMatch(updateSource, /else if \(totalFailed > 0\)/);
});
