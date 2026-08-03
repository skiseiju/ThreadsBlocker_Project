import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');

const boundsSource = workerSource.slice(
    workerSource.indexOf('enforceWindowBounds: () =>'),
    workerSource.indexOf('init: async () =>', workerSource.indexOf('enforceWindowBounds: () =>')),
);

test('外尺寸達標但內容區不足時，仍以 inner 尺寸觸發補足', () => {
    assert.match(boundsSource, /before\.innerWidth < WORKER_MIN_VIEWPORT_WIDTH/);
    assert.match(boundsSource, /before\.innerHeight < WORKER_MIN_VIEWPORT_HEIGHT/);
    assert.doesNotMatch(boundsSource, /window\.outerWidth < WORKER_MIN_WIDTH/);
    assert.doesNotMatch(boundsSource, /window\.outerHeight < WORKER_MIN_HEIGHT/);
});

test('補足用絕對目標 resizeTo，禁止加法式 resizeBy（拖拉事件連發會累加暴衝）', () => {
    assert.match(boundsSource, /frameWidth \+ WORKER_MIN_VIEWPORT_WIDTH/);
    assert.match(boundsSource, /frameHeight \+ WORKER_MIN_VIEWPORT_HEIGHT/);
    assert.match(boundsSource, /window\.resizeTo\(requestedWidth, requestedHeight\)/);
    assert.doesNotMatch(boundsSource, /resizeBy\(/);
});

test('只有內容區下界，沒有外框上界（拉大不得被縮回），且不超過螢幕可用範圍', () => {
    assert.doesNotMatch(boundsSource, /WORKER_MAX_WIDTH|WORKER_MAX_HEIGHT|tooLarge/);
    assert.match(boundsSource, /availWidth/);
    assert.match(boundsSource, /availHeight/);
});

test('resize 監聽有 debounce，不得逐事件立即調整（拖拉中讀值是暫態）', () => {
    const listenerSource = workerSource.slice(workerSource.indexOf("addEventListener('resize'"), workerSource.indexOf("addEventListener('resize'") + 400);
    assert.match(listenerSource, /setTimeout/);
    assert.match(listenerSource, /clearTimeout/);
});

test('resize 取證欄位全部在 RuntimeDiagnostics 安全白名單', () => {
    const floatKeys = coreSource.slice(coreSource.indexOf('const floatKeys'), coreSource.indexOf('for (const key of floatKeys)'));
    for (const field of [
        'outerWidth', 'outerHeight', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'sizeRatio',
        'resizeRequestedWidth', 'resizeRequestedHeight', 'resizeEffectiveWidth', 'resizeEffectiveHeight',
    ]) assert.match(floatKeys, new RegExp(`'${field}'`));
    for (const field of ['outerWidth', 'innerWidth', 'sizeRatio', 'resizeRequestedWidth', 'resizeEffectiveWidth']) {
        assert.match(workerSource, new RegExp(`\\b${field}\\b`));
    }
});
