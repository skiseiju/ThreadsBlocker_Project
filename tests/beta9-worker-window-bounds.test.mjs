// BUGLIST #11 收尾：worker 視窗尺寸下界。
//
// 實測 197x327 與 254x269 兩種尺寸下，Threads 切成窄版面，findProfileRoot 等滿
// 12 秒仍回 null，整批封鎖 100% 失敗。beta7（等到 root 才判定）與 beta8（幾何
// 判定改相對 root）都沒有救回來。使用者拍板：不追窄版面，改成把過小的視窗撐回
// 可運作的下界並說明原因。
//
// 這裡鎖的是契約：下界存在、撐回時同時夾住上界、正常尺寸不動它。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

function loadBounds() {
    const pick = name => Number(workerSource.match(new RegExp(`const ${name} = (\\d+);`))?.[1]);
    return {
        minW: pick('WORKER_MIN_WIDTH'),
        minH: pick('WORKER_MIN_HEIGHT'),
        maxW: pick('WORKER_MAX_WIDTH'),
        maxH: pick('WORKER_MAX_HEIGHT'),
    };
}

// 直接跑 enforceWindowBounds 的邏輯，避免把整個 Worker 模組拉進 node 環境。
function clampWith(bounds, outerWidth, outerHeight) {
    const tooSmall = outerWidth < bounds.minW || outerHeight < bounds.minH;
    const tooLarge = outerWidth > bounds.maxW || outerHeight > bounds.maxH;
    if (!tooSmall && !tooLarge) return null;
    return {
        width: Math.min(bounds.maxW, Math.max(bounds.minW, outerWidth)),
        height: Math.min(bounds.maxH, Math.max(bounds.minH, outerHeight)),
    };
}

test('下界存在，且大於實測會失敗的兩個尺寸', () => {
    const b = loadBounds();
    assert.ok(b.minW > 254, `min width must exceed the observed failing width, got ${b.minW}`);
    assert.ok(b.minH > 327, `min height must exceed the observed failing height, got ${b.minH}`);
    assert.ok(b.minW <= b.maxW && b.minH <= b.maxH);
});

test('實測失敗的尺寸會被撐回下界', () => {
    const b = loadBounds();
    for (const [w, h] of [[197, 327], [254, 269]]) {
        const next = clampWith(b, w, h);
        assert.deepEqual(next, { width: b.minW, height: b.minH }, `${w}x${h}`);
    }
});

test('過大的視窗仍被夾回上界，舊行為沒有被拿掉', () => {
    const b = loadBounds();
    assert.deepEqual(clampWith(b, 1920, 1080), { width: b.maxW, height: b.maxH });
});

test('介於上下界之間的尺寸不動它', () => {
    const b = loadBounds();
    assert.equal(clampWith(b, 750, 560), null);
    assert.equal(clampWith(b, b.minW, b.minH), null);
    assert.equal(clampWith(b, b.maxW, b.maxH), null);
});

test('resize 之後會重新套用，不是只在開窗時做一次', () => {
    assert.match(workerSource, /addEventListener\('resize', \(\) => Worker\.enforceWindowBounds\(\)\)/);
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
    const pick = name => Number(workerSource.match(new RegExp(`const ${name} = (\\d+);`))?.[1]);
    assert.ok(pick('WORKER_MIN_VIEWPORT_WIDTH') <= 700);
    assert.ok(pick('WORKER_MIN_VIEWPORT_HEIGHT') <= 453);
});

test('暫停時畫面與紀錄都說得出目前尺寸與需要的尺寸', () => {
    assert.match(workerSource, /視窗太小已暫停/);
    assert.match(workerSource, /放大視窗就會自動繼續/);
});
