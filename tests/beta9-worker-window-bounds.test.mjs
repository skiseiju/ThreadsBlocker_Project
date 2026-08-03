// BUGLIST #11 收尾：worker 視窗尺寸下界。
//
// 實測 197x327 與 254x269 兩種尺寸下，Threads 切成窄版面，findProfileRoot 等滿
// 12 秒仍回 null，整批封鎖 100% 失敗。beta7（等到 root 才判定）與 beta8（幾何
// 判定改相對 root）都沒有救回來。使用者拍板：不追窄版面，改成把過小的視窗撐回
// 可運作的下界並說明原因。
//
// 2.8.2-beta1 契約更新（回報 #47）：外框（outer）上下界整組移除——外框在不同
// 電腦被工具列／邊框／縮放吃掉的量不同，拿外框當標準會造成「撐大說夠了、暫停
// 說不夠」永遠卡死。現在唯一的尺寸規則是內容區（viewport）下界 700x440：過小
// 時以「邊框差＋下界」換算絕對外尺寸一次 resizeTo 吸附，拉大不縮回，resize
// 事件 debounce 後才套用。絕對目標與 debounce 的細節鎖在
// beta1-window-bounds-viewport.test.mjs，這裡鎖的是暫停策略與下界本身。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

const pick = name => Number(workerSource.match(new RegExp(`const ${name} = (\\d+);`))?.[1]);

test('viewport 下界存在，且大於實測會失敗的兩個尺寸', () => {
    assert.ok(pick('WORKER_MIN_VIEWPORT_WIDTH') > 254);
    assert.ok(pick('WORKER_MIN_VIEWPORT_HEIGHT') > 269);
});

test('外框上下界常數已整組移除（2.8.2-beta1 契約）', () => {
    assert.doesNotMatch(workerSource, /WORKER_MIN_WIDTH|WORKER_MIN_HEIGHT|WORKER_MAX_WIDTH|WORKER_MAX_HEIGHT/);
});

test('resize 之後會重新套用，不是只在開窗時做一次', () => {
    const listenerAt = workerSource.indexOf("addEventListener('resize'");
    assert.ok(listenerAt > -1);
    assert.match(workerSource.slice(listenerAt, listenerAt + 400), /enforceWindowBounds\(\)/);
});

test('撐回時會在 worker 紀錄區說明原因', () => {
    assert.match(workerSource, /視窗太小會讓 Threads 切成窄版面/);
});

// beta9 實測：硬撐回去不夠。resizeTo 可能被使用者繼續拖小或被瀏覽器忽略，
// 診斷顯示 viewport 真的維持 700x453 時全數成功，失敗都發生在仍小於下界的
// 期間。硬跑會把名單消耗掉並記成假失敗，所以改成暫停等待。
test('視窗過小時 runStep 直接暫停，不進佇列也不記失敗', () => {
    const runStep = workerSource.slice(workerSource.indexOf('runStep: async'));
    const guard = runStep.slice(0, runStep.indexOf('Worker._stepRunning = true'));
    assert.match(guard, /isWindowTooSmall\(\)/);
    assert.match(guard, /noteWindowTooSmall\(\)/);
    assert.match(guard, /setTimeout\(Worker\.runStep, 1000\)/);
    // 暫停分支必須在 dequeue 與失敗記錄之前 return。
    assert.doesNotMatch(guard, /recordFailure|markTargetFailedAndContinue/);
});

test('過小判定用 viewport，不是含邊框的 outer 尺寸', () => {
    const fn = workerSource.slice(workerSource.indexOf('isWindowTooSmall:'), workerSource.indexOf('noteWindowTooSmall:'));
    assert.match(fn, /window\.innerWidth < WORKER_MIN_VIEWPORT_WIDTH/);
    assert.match(fn, /window\.innerHeight < WORKER_MIN_VIEWPORT_HEIGHT/);
    assert.doesNotMatch(fn, /outerWidth|outerHeight/);
});

test('viewport 下界不高於實測成功的 700x453', () => {
    assert.ok(pick('WORKER_MIN_VIEWPORT_WIDTH') <= 700);
    assert.ok(pick('WORKER_MIN_VIEWPORT_HEIGHT') <= 453);
});

test('暫停時畫面與紀錄都說得出目前尺寸與需要的尺寸', () => {
    assert.match(workerSource, /視窗太小已暫停/);
    assert.match(workerSource, /放大視窗就會自動繼續/);
});
