import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

globalThis.localStorage = new MemoryStorage();

const [{ CONFIG }, { Storage }] = await Promise.all([
    import('../src/config.js'),
    import('../src/storage.js'),
]);
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');

const HOUR_MS = 60 * 60 * 1000;
const originalNow = Date.now;

test.after(() => {
    Date.now = originalNow;
    delete globalThis.localStorage;
});

test('beta12 rolling window逐筆釋放，排除未來時間並保留舊版估計邊界', () => {
    const now = Date.UTC(2026, 7, 10, 12, 0, 0);
    Date.now = () => now;
    Storage.cache = {};
    localStorage.values.clear();
    localStorage.setItem(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING, JSON.stringify([
        now - 49 * HOUR_MS,
        now - 25 * HOUR_MS,
        now - 23 * HOUR_MS,
        now - 2 * HOUR_MS,
        now + HOUR_MS,
    ]));

    const initial = Storage.getBlockWindowStats();
    assert.equal(initial.count, 2);
    assert.equal(initial.legacyCount, 2);
    assert.equal(initial.nextReleaseAt, now + HOUR_MS);
    assert.equal(initial.legacyLastReleaseAt, now + 22 * HOUR_MS);
    assert.deepEqual(
        JSON.parse(localStorage.getItem(CONFIG.KEYS.BLOCK_TIMESTAMPS_RING)),
        [now - 25 * HOUR_MS, now - 23 * HOUR_MS, now - 2 * HOUR_MS],
        '超過48小時與未來時間都必須移除，但25小時資料仍可留在48小時 retention',
    );

    Storage.recordSuccessfulBlock();
    const afterSuccess = Storage.getBlockWindowStats();
    assert.equal(afterSuccess.count, 3);
    assert.equal(afterSuccess.legacyCount, 2, 'beta12 新成功不得再標成舊版估計');
    assert.equal(afterSuccess.nextReleaseAt, now + HOUR_MS);
    assert.equal(Storage.getBlocksLast24h(), 3);

    Date.now = () => now + 24 * HOUR_MS + 1;
    const expired = Storage.getBlockWindowStats();
    assert.equal(expired.count, 0, '每筆滿24小時後應退出，不等待午夜或整批重設');
    assert.equal(expired.legacyCount, 0);
    assert.equal(expired.nextReleaseAt, 0);
    assert.equal(expired.legacyLastReleaseAt, 0);
});

test('beta12 worker只在成功封鎖確定後計數，排除失敗、已封鎖與解除封鎖', () => {
    assert.doesNotMatch(workerSource, /Storage\.recordBlock\(\)/, '舊的無條件 attempt 計數不得保留');

    const autoBlockStart = workerSource.indexOf('const result = await Worker.autoBlock(targetUser, isUnblock);');
    const outcomeStart = workerSource.indexOf("if (result === 'success' || result === 'already_blocked'", autoBlockStart);
    const preOutcomeSource = workerSource.slice(autoBlockStart, outcomeStart);
    assert.doesNotMatch(preOutcomeSource, /recordSuccessfulBlock/, '結果分流前不得先計數');

    const normalOutcomeEnd = workerSource.indexOf("} else if (result === 'failed')", outcomeStart);
    const normalOutcomeSource = workerSource.slice(outcomeStart, normalOutcomeEnd);
    assert.match(normalOutcomeSource, /result === 'success'/);
    assert.match(normalOutcomeSource, /!isUnblock/);
    assert.match(normalOutcomeSource, /!deferredBatchVerification/);
    assert.match(normalOutcomeSource, /Storage\.recordSuccessfulBlock\(\)/);

    const inlineVerifyStart = workerSource.indexOf('// Verification passed');
    const inlineVerifyEnd = workerSource.indexOf('// 每步開始前 invalidate cache', inlineVerifyStart);
    const inlineVerifySource = workerSource.slice(inlineVerifyStart, inlineVerifyEnd);
    assert.match(inlineVerifySource, /if \(!isUnblockVerify\)/);
    assert.match(inlineVerifySource, /Storage\.recordSuccessfulBlock\(\)/);

    const batchVerifyStart = workerSource.indexOf('resumeBatchVerify: async () =>');
    const batchVerifyEnd = workerSource.indexOf('navigateBack: () =>', batchVerifyStart);
    const batchVerifySource = workerSource.slice(batchVerifyStart, batchVerifyEnd);
    assert.match(batchVerifySource, /if \(result\)/);
    assert.match(batchVerifySource, /if \(!isUnblock\)/);
    assert.match(batchVerifySource, /Storage\.recordSuccessfulBlock\(\)/);

    assert.equal(
        (workerSource.match(/Storage\.recordSuccessfulBlock\(\)/g) || []).length,
        3,
        '只允許一般成功、inline驗證成功、batch驗證成功三個計數點',
    );
});

test('beta13 超限提醒以短句保留rolling 24h、下一次釋放與舊版估計截止', () => {
    const normalizeMatch = workerSource.match(/const normalizeLimitWarningNumber = \(value\) => \{[\s\S]*?\n\};/);
    const formatMatch = workerSource.match(/const formatBlockWindowReleaseAt = value => \{[\s\S]*?\n\};/);
    const builderMatch = workerSource.match(/export const buildDailyBlockLimitWarning = \(blockWindow = \{\}, limit = 0\) => \{[\s\S]*?\n\};/);
    assert.ok(normalizeMatch, '找不到提醒數字正規化 helper');
    assert.ok(formatMatch, '找不到釋放時間格式 helper');
    assert.ok(builderMatch, '找不到每日上限短文案 builder');

    const buildDailyBlockLimitWarning = Function(
        `${normalizeMatch[0]}\n${formatMatch[0]}\n${builderMatch[0].replace('export const ', 'const ')}\nreturn buildDailyBlockLimitWarning;`,
    )();
    const nextReleaseAt = new Date(2026, 7, 11, 19, 30).getTime();
    const legacyLastReleaseAt = new Date(2026, 7, 11, 23, 8).getTime();
    const withLegacy = buildDailyBlockLimitWarning({
        count: 234,
        legacyCount: 233,
        nextReleaseAt,
        legacyLastReleaseAt,
    }, 200);
    assert.equal(
        withLegacy.message,
        '⚠️ 近24h 234/200。8/11 19:30 起逐筆釋放；舊版估計 233 筆將於 8/11 23:08 前清完。超限仍會繼續。',
    );
    assert.equal(withLegacy.compactMessage, '⚠️ 24h 234/200｜8/11 19:30釋放｜舊233');
    assert.ok(withLegacy.message.length <= 80, '完整提醒不可再膨脹成說明段落');

    const withoutLegacy = buildDailyBlockLimitWarning({
        count: 234,
        legacyCount: 0,
        nextReleaseAt,
        legacyLastReleaseAt: 0,
    }, 200);
    assert.equal(
        withoutLegacy.message,
        '⚠️ 近24h 234/200。8/11 19:30 起逐筆釋放。超限仍會繼續。',
    );

    const limitStart = workerSource.indexOf('if (!Storage.isUnderLimit(blockWindow))');
    const limitEnd = workerSource.indexOf('// Record initial total', limitStart);
    const limitSource = workerSource.slice(limitStart, limitEnd);
    const limitSetupSource = workerSource.slice(workerSource.lastIndexOf('const blockWindow', limitStart), limitEnd);
    assert.match(limitSetupSource, /Storage\.getBlockWindowStats\(\)/);
    assert.match(limitSource, /buildDailyBlockLimitWarning\(blockWindow, limit\)/);
    assert.doesNotMatch(workerSource, /已達或超過你自訂上限/);
    assert.doesNotMatch(workerSource, /自動退出 24 小時計數/);
    assert.doesNotMatch(workerSource, /新版本不再把失敗/);
    assert.doesNotMatch(workerSource, /這是自訂的安全估計值/);

    const panelStart = coreSource.indexOf("const bgStatusLineEl = document.getElementById('hege-bg-status');");
    const panelEnd = coreSource.indexOf('let badgeText =', panelStart);
    const panelSource = coreSource.slice(panelStart, panelEnd);
    assert.match(panelSource, /limitWarningCompactMessage/);
    assert.match(panelSource, /panelLimitWarning/);
});
