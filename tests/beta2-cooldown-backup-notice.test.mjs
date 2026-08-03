import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');

const triggerSource = workerSource.slice(
    workerSource.indexOf('triggerCooldown: async () =>'),
    workerSource.indexOf('autoBlock: async', workerSource.indexOf('triggerCooldown: async () =>')),
);
const updateSource = coreSource.slice(
    coreSource.indexOf('const failedQueue = normalizeFailedQueue', coreSource.indexOf('updateUI')),
    coreSource.indexOf('const threeNoResults', coreSource.indexOf('const failedQueue = normalizeFailedQueue', coreSource.indexOf('updateUI'))),
);

test('triggerCooldown 記錄失敗、未處理與回滾數量，並明示備份去向', () => {
    assert.match(triggerSource, /失敗清單 \$\{failedQueue\.length\} 筆/);
    assert.match(triggerSource, /未處理 \$\{remainingQueue\.length\} 筆/);
    assert.match(triggerSource, /回滾 \$\{rollbackUsers\.length\} 筆/);
    assert.match(triggerSource, /已備份 \$\{fullCooldownQueue\.length\} 筆，冷卻結束後可重試/);
});

test('主視窗在冷卻中且失敗清單為空時顯示冷卻備份說明', () => {
    assert.match(updateSource, /cooldownQueue\.length > 0 && failedCooldownActive/);
    assert.match(updateSource, /已移入冷卻備份/);
    assert.match(updateSource, /已移入冷卻備份保存，冷卻結束後可重試/);
    assert.match(updateSource, /剩 \$\{remainMinutes % 60\} 分|剩 \$\{remainMinutes\} 分/);
});

// 說明列沒有東西可重試，點下去會對空的失敗清單跑重試流程，等於騙人。
test('冷卻說明列不可點，且離開冷卻時標題與可點狀態都要還原', () => {
    assert.match(updateSource, /pointerEvents = 'none'/);
    const restoreCount = (updateSource.match(/retryLabel\.textContent = '重試失敗清單'/g) || []).length;
    assert.ok(restoreCount >= 2, `離開冷卻的兩條分支都要把標題改回來，目前 ${restoreCount} 處`);
    const clearCount = (updateSource.match(/pointerEvents = ''/g) || []).length;
    assert.ok(clearCount >= 2, `離開冷卻的兩條分支都要解除不可點，目前 ${clearCount} 處`);
});
