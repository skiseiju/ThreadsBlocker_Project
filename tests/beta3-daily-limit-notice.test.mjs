import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');

const updateStatusStart = workerSource.indexOf('updateStatus: (state');
const setLimitWarningStart = workerSource.indexOf('setLimitWarning: (message');
const updateStatusSource = workerSource.slice(updateStatusStart, setLimitWarningStart);
const panelStart = coreSource.indexOf("const bgStatusLineEl = document.getElementById('hege-bg-status');");
const panelEnd = coreSource.indexOf('let badgeText =', panelStart);
const panelSource = coreSource.slice(panelStart, panelEnd);

test('compact worker 有上限提醒時優先顯示提醒，不被可視化說明蓋掉', () => {
    assert.ok(updateStatusStart >= 0, '找不到 Worker.updateStatus');
    assert.ok(setLimitWarningStart > updateStatusStart, '找不到 Worker.setLimitWarning');
    const progressStart = updateStatusSource.indexOf('if (pctEl) pctEl.textContent');
    const progressSource = updateStatusSource.slice(progressStart);
    const compactBranchStart = progressSource.indexOf("if (workerCover && workerCover.dataset.compact === 'true')");
    assert.ok(compactBranchStart >= 0, '找不到 compact 分支');
    const compactBranch = progressSource.slice(compactBranchStart);

    assert.match(compactBranch, /if \(Worker\.limitWarningMessage\)/);
    assert.match(compactBranch, /progressText\.textContent = Worker\.limitWarningCompactMessage \|\| Worker\.limitWarningMessage/);
    assert.match(compactBranch, /progressText\.style\.color = '#ff9f0a'/);
    assert.match(compactBranch, /progressText\.style\.fontWeight = '800'/);
    assert.match(compactBranch, /progressText\.style\.fontSize = '13px'/);
    assert.doesNotMatch(compactBranch, /progressText\.style\.fontSize = '18px'/, 'compact 提醒字級不得大於 13px');
    assert.match(compactBranch, /progressText\.style\.whiteSpace = 'normal'/);
    assert.match(compactBranch, /progressText\.style\.wordBreak = 'break-word'/);
    assert.match(compactBranch, /visualInfo\.visualEnabled/);
    assert.match(progressSource, /progressText\.textContent = Worker\.limitWarningMessage \|\|/);
    assert.match(workerSource, /window\.hegeLog\(`\[上限提醒\] \$\{Worker\.limitWarningMessage\}`\)/);
    assert.ok(
        compactBranch.indexOf('Worker.limitWarningCompactMessage') < compactBranch.indexOf('visualInfo.visualEnabled'),
        'compact 分支應先判斷提醒，再回退到可視化說明',
    );
});

test('主面板背景狀態列顯示提醒，清空或停止後還原原本狀態', () => {
    assert.ok(panelStart >= 0, '找不到主面板狀態列區段');
    assert.ok(panelEnd > panelStart, '找不到主面板狀態列結尾');
    assert.match(panelSource, /CONFIG\.KEYS\.WORKER_STATS/);
    assert.match(panelSource, /limitWarningMessage/);
    assert.match(panelSource, /limitWarningDone/);
    assert.match(panelSource, /limitWarningLimit/);
    assert.match(panelSource, /hasStructuredLimitWarning/);
    assert.doesNotMatch(coreSource, /formatLimitWarningForPanel/);
    assert.doesNotMatch(panelSource, /\.match\(/, '主面板不可用 regex 反解提醒文案');
    assert.match(panelSource, /isBackgroundRunning/);
    assert.match(panelSource, /showLimitWarning = isBackgroundRunning/);
    assert.match(panelSource, /bgStatusLineEl\.dataset\.hegeLimitWarningStatus = 'running'/);
    assert.match(panelSource, /bgStatusLineEl\.style\.color = '#ff9f0a'/);
    assert.match(panelSource, /delete bgStatusLineEl\.dataset\.hegeLimitWarningStatus/);
    assert.match(panelSource, /狀態：\$\{CONTROLLER_STATUS_LABELS\[controllerStatus\]/);
    assert.match(panelSource, /dataset\.hegeSweepStatus/);
    assert.doesNotMatch(panelSource, /textContent\.includes\(['"]冷卻['"]\)/, '定點絕保護不可依賴狀態文字比對');
});

test('每日上限文案包含自訂估計值與平台限制風險，且移除舊文案', () => {
    assert.match(workerSource, /已封鎖 \$\{done\} 筆，超過你自訂上限 \$\{limit\} 筆/);
    assert.match(workerSource, /這是自訂的安全估計值，超過可能被平台限制，但程式會繼續執行/);
    assert.match(workerSource, /compactMessage: `⚠️ 已封鎖 \$\{done\}\/\$\{limit\}，超過自訂上限仍繼續`/);
    assert.doesNotMatch(workerSource, /⚠️ Meta 上限提醒/);
});

test('上限提醒的結構化欄位會隨 save/load/reset/clear 一起處理', () => {
    assert.match(workerSource, /limitWarningCompactMessage: Worker\.limitWarningCompactMessage/);
    assert.match(workerSource, /limitWarningDone: Worker\.limitWarningDone/);
    assert.match(workerSource, /limitWarningLimit: Worker\.limitWarningLimit/);
    assert.match(workerSource, /Worker\.limitWarningCompactMessage = ''/);
    assert.match(workerSource, /Worker\.limitWarningDone = null/);
    assert.match(workerSource, /Worker\.limitWarningLimit = null/);
    assert.match(workerSource, /Worker\.limitWarningCompactMessage = typeof saved\.limitWarningCompactMessage/);
    assert.match(workerSource, /Worker\.limitWarningDone = normalizeLimitWarningNumber\(saved\.limitWarningDone\)/);
    assert.match(workerSource, /Worker\.limitWarningLimit = normalizeLimitWarningNumber\(saved\.limitWarningLimit\)/);
    const clearStart = workerSource.indexOf('clearStats: () =>');
    const clearEnd = workerSource.indexOf('\n    },', clearStart);
    const clearSource = workerSource.slice(clearStart, clearEnd);
    assert.match(clearSource, /Worker\.resetStatsState\(0\)/);
    assert.match(clearSource, /Storage\.remove\(CONFIG\.KEYS\.WORKER_STATS\)/);
});

test('守門：每日上限只產生提醒，不得由 isUnderLimit 中斷流程', () => {
    const uses = workerSource.match(/Storage\.isUnderLimit\(\)/g) || [];
    assert.equal(uses.length, 1, 'isUnderLimit 應維持唯一使用點');

    const limitStart = workerSource.indexOf('if (!Storage.isUnderLimit())');
    const limitEnd = workerSource.indexOf('// Record initial total', limitStart);
    assert.ok(limitStart >= 0 && limitEnd > limitStart, '找不到上限提醒區段');
    const limitSource = workerSource.slice(limitStart, limitEnd);
    assert.match(limitSource, /Worker\.setLimitWarning/);
    assert.doesNotMatch(limitSource, /\breturn\b|\bstop\b|clearQueue/, '上限提醒區段不可停止或清空佇列');
});
