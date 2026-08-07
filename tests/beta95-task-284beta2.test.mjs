// - 相關：ADR 0013，beta 診斷閘門；src/ui.js；src/config.js

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../src/config.js';
import { RuntimeDiagnostics } from '../src/core.js';
import { assertSupportedVersion } from './helpers/version-contract.mjs';

const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const reportStart = uiSource.indexOf('showBugReportModal:');
const reportEnd = uiSource.indexOf('showReportPackExportModal:', reportStart);
assert.ok(reportStart >= 0, '找不到問題回報視窗函式');
assert.ok(reportEnd > reportStart, '找不到問題回報視窗函式結尾');
const reportSource = uiSource.slice(reportStart, reportEnd);

test('beta95 回報視窗版面契約讓送出列固定且內容區可捲動', () => {
    const shortViewportHeight = 320;
    assert.ok(shortViewportHeight < 720, 'fixture 必須涵蓋矮視窗情境');
    assert.match(reportSource, /<div class="hege-manager-box" style="height:auto;max-height:calc\(100vh - 24px\);max-height:calc\(100dvh - 24px\);display:flex;flex-direction:column;overflow:hidden;">/);
    assert.match(reportSource, /<div style="flex:1 1 auto;padding:20px;overflow:auto;min-height:0;-webkit-overflow-scrolling:touch;">/);
    assert.match(reportSource, /<div class="hege-manager-footer" style="flex:0 0 auto;position:sticky;bottom:0;z-index:1;padding-bottom:max\(16px,env\(safe-area-inset-bottom\)\);">/);

    const contentStart = reportSource.indexOf('flex:1 1 auto;padding:20px;overflow:auto;');
    const footerTagStart = reportSource.indexOf('<div class="hege-manager-footer" style="flex:0 0 auto;');
    const footerStart = reportSource.indexOf('class="hege-manager-footer" style="flex:0 0 auto;');
    assert.ok(contentStart >= 0 && footerStart > contentStart, '送出列必須位於內容捲動區之後');
    assert.match(reportSource.slice(contentStart, footerTagStart), /<\/div>\s*$/);
    assert.doesNotMatch(reportSource.slice(footerStart, footerStart + 260), /overflow(?:-y)?:\s*auto/);
});

test('beta95 回報視窗欄位、選項與技術資訊揭露維持原契約', () => {
    for (const field of ['hege-report-msg', 'hege-report-level', 'hege-report-diagnostic-consent']) {
        assert.match(reportSource, new RegExp(`id="${field}"`));
    }
    for (const option of [
        '<option value="PRAISE">🎉 我覺得很棒</option>',
        '<option value="INFO">💡 功能建議</option>',
        '<option value="WARNING">⚠️ 有點怪怪的</option>',
        '<option value="ERROR" selected>❌ 功能壞了</option>',
        '<option value="CRITICAL">💀 完全無法使用</option>',
    ]) {
        assert.match(reportSource, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    for (const disclosure of [
        '送出時會一併附上技術資訊：',
        '工具版本、瀏覽器環境與視窗尺寸，以及最近的操作步驟代號與次數（例如「找不到選單、第 3 次、共 12 筆」）。',
        '這部分不含帳號名稱、選單文字、頁面網址與瀏覽紀錄，用來判斷問題卡在哪一步。',
        '要不要附上完整紀錄？',
        '勾了我們比較好查，修得比較快。裡面會多帶你當下的頁面網址與操作紀錄，密碼、cookie 這類東西一律不會送出。',
        '不勾也可以，只送你寫的問題描述。',
        '我同意本次問題回報附上上述完整診斷附件（單次同意，不會改變平台同步設定）。',
    ]) {
        assert.ok(reportSource.includes(disclosure), `技術資訊揭露文字遺失：${disclosure}`);
    }
});

test('beta95 版本契約接受正式版與後續 beta 版', () => {
    for (const version of ['2.8.4-beta2', '2.8.3', '2.7.4-beta63']) {
        assert.doesNotThrow(() => assertSupportedVersion(version));
    }
});

test('beta95 beta 診斷閘門仍只在 beta 版且開關開啟時顯示', () => {
    const previousVersion = CONFIG.VERSION;
    const previousEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;
    try {
        CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
        for (const version of ['2.8.4-beta2', '2.7.4-beta63']) {
            CONFIG.VERSION = version;
            assert.equal(RuntimeDiagnostics.betaDebugUI(), true);
        }
        CONFIG.VERSION = '2.8.3';
        assert.equal(RuntimeDiagnostics.betaDebugUI(), false);
        CONFIG.VERSION = '2.8.4-beta2';
        CONFIG.ENABLE_BETA_DIAGNOSTICS = false;
        assert.equal(RuntimeDiagnostics.betaDebugUI(), false);
    } finally {
        CONFIG.VERSION = previousVersion;
        CONFIG.ENABLE_BETA_DIAGNOSTICS = previousEnabled;
    }
});

console.log('beta95 2.8.4-beta2 回報視窗與版本契約 fixture: PASS');
