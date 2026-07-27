// BUGLIST #14：清理名單等待不夠久就判定失敗。
//
// 實機診斷（2.8.1-beta12）：clean_list 從 start 到 rollback 只花 2031ms，
// anchor_filter 顯示 exactLinkCount 23、uniqueExactAccountCount 20，但
// excludedInvisibleCount 21、acceptedUniqueAccountCount 0，最後 stopReason
// 是 rows_missing。也就是名單其實在，只是 Threads 的 lazy render 還沒把那些
// anchor 排版出來，rect 仍是 0x0，被可見性過濾整批排除。
//
// waitForLikesContextReady 只要看到 likes 證據就回來（reason marker_or_evidence），
// 那時 rowCount 只有 2。收集迴圈接著以「沒有變化」為由收工，把還沒渲染判成空名單。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');

test('有版面落地等待預算，且長於實測失敗的 2 秒', () => {
    const ms = Number(coreSource.match(/const CLEAN_LIST_LAYOUT_WAIT_MS = (\d+);/)?.[1]);
    assert.ok(Number.isFinite(ms), 'CLEAN_LIST_LAYOUT_WAIT_MS must exist');
    assert.ok(ms >= 5000, `budget must exceed the observed 2031ms failure, got ${ms}`);
});

test('收集開始前會等到真的看見一列，或等滿預算', () => {
    const gate = coreSource.slice(coreSource.indexOf('const layoutWaitUntil'), coreSource.indexOf('while (scrollCount < maxScrolls'));
    assert.match(gate, /while \(!sawVisibleRows && !isAborted && Date\.now\(\) < layoutWaitUntil\)/);
    assert.match(gate, /collectRendered\(\)/);
});

test('一列都沒看到時，「沒有變化」不得被當成已到底而收工', () => {
    const loop = coreSource.slice(coreSource.indexOf('if (!progress) unchangedCount += 1;'));
    const guard = loop.slice(0, loop.indexOf('if (unchangedCount >= 4'));
    assert.match(guard, /!sawVisibleRows && Date\.now\(\) < layoutWaitUntil/);
    assert.match(guard, /unchangedCount = 0;/);
    assert.match(guard, /continue;/);
});

test('等不到仍然 fail-closed，維持 rows_missing 而不是假裝空名單', () => {
    assert.match(coreSource, /else if \(!sawVisibleRows\) \{/);
    assert.match(coreSource, /'rows_missing'/);
});
