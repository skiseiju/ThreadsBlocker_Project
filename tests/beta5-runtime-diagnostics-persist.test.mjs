// BUGLIST #11 取證管道的回歸測試。
//
// Worker 跑在另一個視窗，RuntimeDiagnostics 的 _entries 只存在該視窗的記憶體裡，
// 視窗一關就沒了。主視窗按「複製診斷資料」因此永遠拿不到 blocking 的紀錄，
// 使用者實際貼回來的診斷 JSON summary 也只有 panel／selection／message_route。
// persist() 落盤、export() 合併，是這條管道成立的唯一條件。
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Storage } from '../src/storage.js';
import { RuntimeDiagnostics } from '../src/core.js';

const originalVersion = CONFIG.VERSION;
const originalFlag = CONFIG.ENABLE_BETA_DIAGNOSTICS;
const store = new Map();

test.before(() => {
    // 測試環境沒有真的 localStorage，補一個最小實作。
    globalThis.localStorage = {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => { store.set(key, String(value)); },
        removeItem: key => { store.delete(key); },
    };
});

test.beforeEach(() => {
    CONFIG.VERSION = '2.8.1-beta6';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    store.clear();
    Storage.cache = {};
    RuntimeDiagnostics.clear();
});

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalFlag;
    RuntimeDiagnostics.clear();
    delete globalThis.localStorage;
});

test('worker 落盤的 blocking 紀錄，主視窗匯出時看得到', () => {
    // 模擬 worker 視窗：記錄後落盤。
    const operationId = RuntimeDiagnostics.begin('blocking', { strategy: 'same_tab' });
    RuntimeDiagnostics.record('blocking', 'navigation', { operationId, reason: 'success', svgCount: 3 });
    RuntimeDiagnostics.end(operationId, 'terminal', { reason: 'menu_not_found', ok: false });
    assert.equal(RuntimeDiagnostics.persist(), true);

    // 模擬主視窗：另一份 in-memory ring，沒有 blocking 紀錄。
    RuntimeDiagnostics._entries = [];
    RuntimeDiagnostics._lastBySignature.clear();
    RuntimeDiagnostics._operations.clear();
    RuntimeDiagnostics.record('panel', 'start', { active: true });

    const exported = RuntimeDiagnostics.export();
    assert.ok(exported.summary.blocking >= 3, `blocking entries missing: ${JSON.stringify(exported.summary)}`);
    assert.equal(exported.summary.panel, 1);
    assert.ok(exported.entries.some(entry => entry.fields.svgCount === 3));
    // 合併後仍照時間排序，讀 log 的人不必自己重排。
    const timestamps = exported.entries.map(entry => entry.timestamp);
    assert.deepEqual(timestamps, [...timestamps].sort((a, b) => a - b));
});

test('落盤內容仍走隱私過濾，未列白名單的欄位不會被寫進去', () => {
    const operationId = RuntimeDiagnostics.begin('blocking', {});
    RuntimeDiagnostics.record('blocking', 'menu', {
        operationId,
        reason: 'menu_not_found',
        blockTextPresent: true,
        menuCount: 1,
        username: 'someone',          // 未列白名單
        menuText: '封鎖 @someone',     // 未列白名單
    });
    RuntimeDiagnostics.persist();

    const raw = JSON.stringify(Storage.getJSON(CONFIG.KEYS.RUNTIME_DIAGNOSTICS_RING, []));
    assert.ok(!raw.includes('someone'), 'persisted ring must not contain account names');
    assert.ok(raw.includes('blockTextPresent'), 'allowlisted observation must survive');
    assert.ok(raw.includes('menuCount'));
});

test('clear 會同時清掉落盤的那一份', () => {
    RuntimeDiagnostics.record('blocking', 'menu', { reason: 'menu_not_found' });
    RuntimeDiagnostics.persist();
    assert.ok(Storage.getJSON(CONFIG.KEYS.RUNTIME_DIAGNOSTICS_RING, []).length > 0);

    RuntimeDiagnostics.clear();
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.RUNTIME_DIAGNOSTICS_RING, []), []);
    assert.deepEqual(RuntimeDiagnostics.export().entries, []);
});
