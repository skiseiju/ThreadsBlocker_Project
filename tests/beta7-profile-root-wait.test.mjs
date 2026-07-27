// BUGLIST #11：小視窗下封鎖連續失敗，全部記成「找不到選單」。
//
// 實機診斷（2.8.1-beta6，viewport 800x533）顯示失敗一律停在 root_resolve，
// 而且發生在 dequeue 後 1–8ms，從來沒走到「更多」按鈕那一步。原因是載入等待
// 的條件是「頁面上有 MORE_SVG 或任何 div[role=button]」，SPA 換頁時前一頁的
// DOM 還在，條件立刻成立，findProfileRoot 於是對著還沒換好的頁面找 root。
//
// 這裡鎖的是契約：載入等待必須等到「這個 user 的 profile root」，不能用
// 「頁面上有任何按鈕」這種前一頁也會成立的寬條件。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const autoBlock = workerSource.slice(workerSource.indexOf('autoBlock: async'));
const loadPhase = autoBlock.slice(0, autoBlock.indexOf('detectPrivateProfileState'));

test('autoBlock 的載入等待必須等到本人的 profile root', () => {
    assert.match(loadPhase, /pollUntil\(\(\) => \{[\s\S]*findProfileRoot\?\.\(user\)/);
});

test('載入等待不得再用「頁面上有任何 div[role=button]」當放行條件', () => {
    assert.doesNotMatch(loadPhase, /querySelector\('div\[role="button"\]'\)/);
    assert.doesNotMatch(loadPhase, /CONFIG\.SELECTORS\.MORE_SVG/);
});

test('等待是有界的，逾時仍走 fail-closed 的 menu_not_found', () => {
    assert.match(workerSource, /const PROFILE_ROOT_WAIT_MS = \d+;/);
    assert.match(loadPhase, /PROFILE_ROOT_WAIT_MS/);
    assert.match(loadPhase, /recordDiagnostic\('root_resolve', 'menu_not_found'/);
});

test('逾時的失敗會記下實際等了多久與視窗尺寸，供下次判讀', () => {
    assert.match(loadPhase, /waitMs: Date\.now\(\) - profileWaitStartedAt/);
    assert.match(loadPhase, /viewportWidth: window\.innerWidth/);
});

test('404 仍優先於 root 判定，連結失效不會被誤記成找不到選單', () => {
    assert.ok(
        loadPhase.indexOf("'vanished'") < loadPhase.indexOf("recordDiagnostic('root_resolve', 'menu_not_found'"),
        '404 check must run before the root_resolve failure branch',
    );
});
