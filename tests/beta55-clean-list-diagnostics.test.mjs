import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');

test('beta55 clean-list diagnostics cover tab/context/rows and atomic commit rollback', () => {
    for (const token of [
        "record('clean_list', 'start'", "record('clean_list', 'tab'", "record('clean_list', 'wait'",
        "record('clean_list', 'dialog'", "record('clean_list', 'rows'", "record('clean_list', 'commit'",
        "record('clean_list', 'rollback'", 'likes_tab_switch_failed', 'rollbackStagedCollection',
    ]) assert.equal(coreSource.includes(token), true, token);
});

test('beta55 diagnostics copy/clear controls are beta gated and use plain-language failure copy', () => {
    assert.match(uiSource, /hege-copy-diagnostics-item/);
    assert.match(uiSource, /hege-clear-diagnostics-item/);
    // ADR 0013：手動 debug UI 的 beta 閘門改由 betaDebugUI() 表達，
    // 不再直接讀 CONFIG.ENABLE_BETA_DIAGNOSTICS。
    assert.match(uiSource, /betaDebugUI\?\.\(\) === true/);
    assert.match(coreSource, /已複製診斷資料/);
    assert.match(coreSource, /沒有找到可勾選的帳號/);
});

console.log('beta55 clean-list diagnostics contract: stage evidence / atomic outcome / beta controls');
