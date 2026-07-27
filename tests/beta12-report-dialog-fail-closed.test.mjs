// BUGLIST #10／#13：檢舉流程點到左側主導覽（訊息、搜尋、個人檔案…）或標籤頁。
//
// 實機診斷（2.8.1-beta11）顯示每次檢舉都走到 action 之後 pathnameCategory 由
// profile 變成 unknown，接著 confirm 回 submit_not_confirmed。也就是選完某一層
// 之後頁面被導走了，送出鈕當然找不到。
//
// 根因：findNextReportOption 在頁面上沒有任何 div[role="dialog"] 時，退回整份
// document 當搜尋 root，文字比對於是掃到左側主導覽，點下去就換頁。這是 fail-open。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const reportSource = await readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8');

const fnBody = name => {
    const start = reportSource.indexOf(`${name}(`);
    return reportSource.slice(start, reportSource.indexOf('\n        },', start));
};

test('沒有檢舉視窗時不再退回整份 document 找選項', () => {
    const body = fnBody('findNextReportOption');
    assert.match(body, /if \(dialogs\.length === 0\) return null;/);
    assert.doesNotMatch(body, /\[\.\.\.dialogs, document\]/);
    assert.doesNotMatch(body, /roots = .*\bdocument\b/);
});

test('診斷用的可見選項也不再列出整頁內容', () => {
    const body = reportSource.slice(
        reportSource.indexOf('getVisibleReportOptionTexts()'),
        reportSource.indexOf('logVisibleOptions('),
    );
    assert.doesNotMatch(body, /dialogs\[0\] \|\| document/);
    assert.match(body, /if \(!root\) return \[\];/);
});

test('選完一層之後會檢查有沒有被導走，導走就停手', () => {
    const loop = reportSource.slice(reportSource.indexOf('const routeAfterOption'));
    assert.match(loop, /MoreLocator\.routeMatches\(routeBeforeMore, routeAfterOption/);
    assert.match(loop, /'navigation_mismatch'/);
    // 必須在推進 pathIndex 之後、進入送出階段之前
    const clickIdx = reportSource.indexOf('Utils.simClick(match.option)');
    const guardIdx = reportSource.indexOf('const routeAfterOption');
    const submitIdx = reportSource.indexOf('let submitOriginDialog');
    assert.ok(clickIdx < guardIdx && guardIdx < submitIdx, 'route guard must sit between the option click and the submit phase');
});

test('原本 More 點擊後的路由檢查沒有被拿掉', () => {
    assert.equal((reportSource.match(/routeMatches\(routeBeforeMore/g) || []).length, 2);
});
