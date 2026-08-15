import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const configSource = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');

test('beta35: 版號斷言', () => {
    assert.match(configSource, /VERSION: '2\.8\.4-beta36'/);
});

// 迴歸防線：個人頁的標題區與貼文屬於同一帳號，過去用「按鈕在畫面上緣以內」
// 區分兩者。使用者往下捲時貼文 top 會變小甚至為負，於是每則捲過頂端的貼文
// 都被誤判成標題區並蓋上永久跳過印記，實機表現為勾選框與標籤整排消失
// （2026-08-15 實測：門檻 330，top 為 -370/-204/272 的三則全數漏注入）。
// 標題區與貼文的差異在結構不在座標，判定一律走 isInlinePostElementContext。
test('beta35: 不得再用畫面座標判定個人頁標題區', () => {
    assert.equal(
        coreSource.includes('profileHeaderBottom'),
        false,
        'profileHeaderBottom 是捲動即失效的座標判準，不得重新引入',
    );
});

test('beta35: 貼文情境判定仍是結構式而非座標式', () => {
    const fn = coreSource.slice(coreSource.indexOf('isInlinePostElementContext: (element'));
    const body = fn.slice(0, fn.indexOf('\n    },'));
    assert.ok(body.includes('postTimePattern'), '必須保留時間文字這個結構訊號');
    assert.equal(body.includes('getBoundingClientRect'), false, '貼文情境判定不得依賴座標');
});
