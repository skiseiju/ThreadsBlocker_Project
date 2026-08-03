import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');

const panelStart = coreSource.indexOf('const failedQueue = normalizeFailedQueue', coreSource.indexOf('updateControllerUI: () =>'));
const panelEnd = coreSource.indexOf('shouldShowStop = resolveStopVisibility', panelStart);
const panelSource = coreSource.slice(panelStart, panelEnd);
const retryPanelStart = panelSource.indexOf('const retryItem = document.getElementById');
const restorePanelStart = panelSource.indexOf('const restoreItem = document.getElementById', retryPanelStart);
const restorePanelEnd = panelSource.indexOf('\n\n        const threeNoResults', restorePanelStart);
const retryPanelSource = panelSource.slice(retryPanelStart, restorePanelStart);
const restorePanelSource = panelSource.slice(restorePanelStart, restorePanelEnd);
const retryStart = coreSource.indexOf('retryFailedQueue: () =>');
const retryEnd = coreSource.indexOf('\n    },', retryStart);
const retrySource = coreSource.slice(retryStart, retryEnd);
const triggerStart = workerSource.indexOf('triggerCooldown: async () =>');
const triggerCommentStart = workerSource.lastIndexOf('// 2026-08-03', triggerStart);
const triggerEnd = workerSource.indexOf('\n    },', triggerStart);
const triggerSource = workerSource.slice(triggerStart, triggerEnd);
const verifyStart = workerSource.indexOf('if (Worker.consecutiveFails >= 5)');
const rateLimitedStart = workerSource.indexOf("} else if (result === 'rate_limited')");
const verifyEnd = rateLimitedStart;
const verifySource = workerSource.slice(verifyStart, verifyEnd);
const rateLimitedEnd = workerSource.indexOf("} else if (result === 'cooldown')", rateLimitedStart);
const rateLimitedSource = workerSource.slice(rateLimitedStart, rateLimitedEnd);
const explicitLimitStart = workerSource.indexOf("} else if (result === 'cooldown')");
const explicitLimitEnd = workerSource.indexOf('\n        } finally {', explicitLimitStart);
const explicitLimitSource = workerSource.slice(explicitLimitStart, explicitLimitEnd);

test('beta4 三個原冷卻觸發點已停用，但保留提醒與失敗記錄', () => {
    assert.doesNotMatch(verifySource, /triggerCooldown\s*\(/);
    assert.doesNotMatch(rateLimitedSource, /triggerCooldown\s*\(/);
    assert.doesNotMatch(explicitLimitSource, /triggerCooldown\s*\(/);
    assert.equal((workerSource.match(/偵測到疑似平台限制，已連續/g) || []).length, 3);
    assert.match(verifySource, /markTargetFailedAndContinue/);
    assert.match(rateLimitedSource, /markTargetFailedAndContinue/);
    assert.match(explicitLimitSource, /markTargetFailedAndContinue/);
});

test('beta4 triggerCooldown 本體保留並明確註記停用方式', () => {
    assert.ok(triggerCommentStart >= 0, 'triggerCooldown 上方缺少停用日期註解');
    assert.ok(triggerStart > triggerCommentStart, '停用註解應位於 triggerCooldown 本體上方');
    assert.match(workerSource.slice(triggerCommentStart, triggerStart), /2026-08-03/);
    assert.match(workerSource.slice(triggerCommentStart, triggerStart), /停用自動觸發/);
    assert.match(workerSource.slice(triggerCommentStart, triggerStart), /重新接回呼叫點/);
    assert.match(triggerSource, /COOLDOWN_QUEUE/);
    assert.match(triggerSource, /回滾/);
});

test('beta4 冷卻備份使用獨立選單列，不佔用重試失敗清單入口', () => {
    assert.match(uiSource, /id="hege-restore-cooldown-item" style="display:none;"/);
    assert.match(uiSource, /id="hege-restore-cooldown-label"/);
    assert.match(uiSource, /class="status" id="hege-restore-cooldown-count"/);
    assert.match(uiSource, /bindClick\('hege-restore-cooldown-item', callbacks\.onRestoreCooldownBackup\)/);
    assert.match(mainSource, /onRestoreCooldownBackup: \(\) => Core\.restoreCooldownBackup\(\)/);
    assert.match(coreSource, /restoreCooldownBackup: \(\) =>/);
    assert.match(coreSource, /沒有可併回的冷卻備份/);
    assert.doesNotMatch(retrySource, /restoreCooldownQueue/);
    assert.doesNotMatch(retryPanelSource, /cooldownQueue\.length > 0/);
    assert.doesNotMatch(retryPanelSource, /把冷卻備份併回待處理清單/);
    assert.match(restorePanelSource, /cooldownQueue\.length > 0/);
    assert.match(restorePanelSource, /把冷卻備份併回待處理清單/);
});

test('beta4 主面板移除冷卻標頭，兩個入口的顯示條件彼此獨立', () => {
    assert.ok(panelStart >= 0 && panelEnd > panelStart, '找不到主面板佇列標頭區段');
    assert.doesNotMatch(panelSource, /限制保護中/);
    assert.doesNotMatch(panelSource, /cooldownUntil/);
    assert.match(retryPanelSource, /if \(totalFailed > 0\)/);
    assert.match(restorePanelSource, /if \(cooldownQueue\.length > 0\)/);
    assert.doesNotMatch(panelSource, /else if \(totalFailed > 0\)/);
    assert.match(coreSource, /restoreCooldownQueue/);
    assert.match(coreSource, /Storage\.remove\(CONFIG\.KEYS\.COOLDOWN_QUEUE\)/);
    assert.match(coreSource, /const blockDb = new Set\(Storage\.getBlockDB\(\)\.map/);
    assert.match(coreSource, /!blockDb\.has\(user\.trim\(\)\.toLowerCase\(\)\)/);
});

test('beta4 retryFailedQueue 不會併回冷卻備份，限制提醒依三次門檻分級', () => {
    const highWarning = /偵測到疑似平台限制，已連續 \$\{Worker\.consecutive(?:Fails|RateLimits)\} 次失敗，建議手動暫停/;
    const menuLowWarning = /偵測到選單異常，第 \$\{Worker\.consecutiveRateLimits\} 次，已跳過此筆並繼續/;
    const explicitLowWarning = /偵測到限制訊號，第 \$\{Worker\.consecutiveRateLimits\} 次，已跳過此筆並繼續/;
    assert.match(rateLimitedSource, highWarning);
    assert.match(rateLimitedSource, menuLowWarning);
    assert.match(explicitLimitSource, highWarning);
    assert.match(explicitLimitSource, explicitLowWarning);
    assert.match(rateLimitedSource, /Worker\.consecutiveRateLimits < 3/);
    assert.match(rateLimitedSource, /Worker\.consecutiveRateLimits >= 3/);
    assert.match(explicitLimitSource, /const explicitRestrictionThresholdReached = Worker\.consecutiveRateLimits >= 3/);
    assert.doesNotMatch(rateLimitedSource, /if \(Worker\.consecutiveRateLimits >= 3\) \{\s*await Worker\.markTargetFailedAndContinue/);
    assert.doesNotMatch(explicitLimitSource, /triggerCooldown\s*\(/);
});

test('beta4 主流程不再詢問強制取消冷卻', () => {
    assert.doesNotMatch(mainSource, /強制取消冷卻並繼續封鎖/);
    assert.doesNotMatch(mainSource, /仍要把這批三無追蹤者加入封鎖佇列並強制繼續/);
    assert.doesNotMatch(mainSource, /Storage\.remove\(CONFIG\.KEYS\.COOLDOWN_QUEUE\)/);
    assert.doesNotMatch(mainSource, /removeItem\(['"]hege_cooldown_queue['"]\)/);
    assert.match(mainSource, /Core\.restoreCooldownQueue\?\.\(\)/);
});
