// BUGLIST #12：按「重試失敗清單」後再次失敗，整份失敗清單被清空。
//
// 舊流程是「先清空再重試」：onRetryAll 把帳號推進 BG_QUEUE 後立刻把 FAILED_QUEUE
// 設成 []，然後才呼叫 startFailureRetry。只要重試沒有真的啟動（已有背景任務在跑、
// 彈出視窗被擋）或使用者中途停掉，名單就整份消失且無從還原。
//
// 契約改為：失敗紀錄只在「這一次真的成功」時逐筆移除。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../src/config.js';
import { Storage } from '../src/storage.js';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

const retryAll = coreSource.slice(coreSource.indexOf('onRetryAll:'), coreSource.indexOf('onClearAll:'));
const retryOne = coreSource.slice(coreSource.indexOf('retryFailedEntry:'), coreSource.indexOf('clearFailedEntry:'));

test('重試全部不再事先清空失敗清單', () => {
    assert.doesNotMatch(retryAll, /setJSON\(CONFIG\.KEYS\.FAILED_QUEUE, \[\]\)/);
    assert.doesNotMatch(retryAll, /setJSON\(CONFIG\.KEYS\.REPORT_FAILED_QUEUE, \[\]\)/);
});

test('重試單筆不再事先移除該筆失敗紀錄', () => {
    assert.doesNotMatch(retryOne, /Core\.removeFailure\(/);
});

test('重試沒啟動時會明說名單保留，不是無聲失敗', () => {
    assert.match(retryAll, /const started = Core\.startFailureRetry/);
    assert.match(retryAll, /if \(!started\)/);
    assert.match(retryOne, /const started = Core\.startFailureRetry/);
    assert.match(retryOne, /if \(!started\)/);
});

test('清除全部仍然清得掉，使用者主動清除的路徑沒被拿掉', () => {
    const clearAll = coreSource.slice(coreSource.indexOf('onClearAll:'), coreSource.indexOf('onClearAll:') + 400);
    assert.match(clearAll, /setJSON\(CONFIG\.KEYS\.FAILED_QUEUE, \[\]\)/);
    assert.match(clearAll, /setJSON\(CONFIG\.KEYS\.REPORT_FAILED_QUEUE, \[\]\)/);
});

test('封鎖成功時才逐筆移除失敗紀錄，兩條成功路徑都有', () => {
    const matches = workerSource.match(/Core\.removeFailure\(targetUser, 'block'\)/g) || [];
    assert.equal(matches.length, 2, `expected both the inline-success and verified-success paths, got ${matches.length}`);
    // 驗證通過的那條必須在寫入封鎖名單之後
    const verified = workerSource.slice(workerSource.indexOf('// Verification passed'));
    assert.ok(
        verified.indexOf('addToBlockDBFromContext') < verified.indexOf("Core.removeFailure(targetUser, 'block')"),
        'removeFailure must follow the DB write on the verified path',
    );
});

test('失敗紀錄的寫入與移除本身是對稱的', () => {
    const store = new Map();
    globalThis.localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)); },
        removeItem: key => { store.delete(key); },
    };
    Storage.cache = {};

    // 直接用 storage 層驗證 round-trip，不拉整個 Core 進 node 環境。
    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, [
        { username: 'alice', type: 'block', reason: 'menu_not_found', failedAt: 1 },
        { username: 'bob', type: 'block', reason: 'menu_not_found', failedAt: 2 },
    ]);
    const after = Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []).filter(entry => entry.username !== 'alice');
    Storage.setJSON(CONFIG.KEYS.FAILED_QUEUE, after);

    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.FAILED_QUEUE, []).map(e => e.username), ['bob']);
    delete globalThis.localStorage;
});
