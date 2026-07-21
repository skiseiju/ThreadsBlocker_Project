import test from 'node:test';
import assert from 'node:assert';
import { UI } from '../src/ui.js';

test('formatFollowerCollectionMessage - incomplete scenarios', async t => {
    // Test: incomplete scenario with timeout (should mention both causes and next steps)
    await t.test('timeout with totalHint: message includes two causes and next step', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'timeout',
            count: 129,
            totalHint: 176,
            visibleRows: 129,
            breakdown: {},
        });
        assert(result.includes('129'), 'should mention collected count');
        assert(result.includes('176'), 'should mention page display count');
        assert(result.includes('已被'), 'should mention blocked possibility');
        assert(result.includes('載入'), 'should mention loading possibility');
        assert(result.includes('再執行一次'), 'should mention re-run next step');
        assert(!result.includes('timeout'), 'should not contain error code');
    });

    await t.test('limited: message includes two causes and next step', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'limited',
            count: 50,
            totalHint: 200,
            visibleRows: 50,
            breakdown: {},
        });
        assert(result.includes('50'), 'should mention collected count');
        assert(result.includes('200'), 'should mention page display count');
        assert(result.includes('已被'), 'should mention blocked possibility');
        assert(result.includes('載入'), 'should mention loading possibility');
        assert(result.includes('再執行一次'), 'should mention next step');
        assert(!result.includes('limited'), 'should not contain error code');
    });

    await t.test('scroll_stall: message includes both causes and next step', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'scroll_stall',
            count: 100,
            totalHint: 180,
            visibleRows: 100,
            breakdown: {},
        });
        assert(result.includes('100'), 'should mention collected count');
        assert(result.includes('180'), 'should mention page display count');
        assert(result.includes('已被'), 'should mention blocked possibility');
        assert(result.includes('載入'), 'should mention loading possibility');
        assert(!result.includes('scroll_stall'), 'should not contain error code');
    });

    await t.test('max_scrolls: message includes both causes and next step', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'max_scrolls',
            count: 75,
            totalHint: 300,
            visibleRows: 75,
            breakdown: {},
        });
        assert(result.includes('75'), 'should mention collected count');
        assert(result.includes('300'), 'should mention page display count');
        assert(result.includes('已被'), 'should mention blocked possibility');
        assert(result.includes('載入'), 'should mention loading possibility');
        assert(!result.includes('max_scrolls'), 'should not contain error code');
    });
});

test('formatFollowerCollectionMessage - complete scenarios should not mention causes', async t => {
    await t.test('completed: should not mention blocked or loading', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'completed',
            count: 100,
            totalHint: 100,
            visibleRows: 100,
            breakdown: {},
        });
        assert(!result.includes('已被'), 'should not mention blocked');
        assert(!result.includes('載入'), 'should not mention loading');
        assert(result.includes('完成'), 'should mention completion');
    });

    await t.test('end: should not mention causes', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'end',
            count: 50,
            totalHint: 50,
            visibleRows: 50,
            breakdown: {},
        });
        assert(!result.includes('已被'), 'should not mention blocked');
        assert(!result.includes('載入'), 'should not mention loading');
    });

    await t.test('empty_end: should maintain original meaning', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'empty_end',
            count: 0,
            totalHint: 0,
            visibleRows: 0,
            breakdown: {},
        });
        assert(result.includes('沒有'), 'should mention no followers');
        assert(!result.includes('已被'), 'should not mention blocked');
    });
});

test('formatFollowerCollectionMessage - stopped should maintain meaning', async t => {
    await t.test('stopped: should preserve user-initiated stop meaning', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'stopped',
            count: 25,
            totalHint: 100,
            visibleRows: 50,
            breakdown: {},
        });
        assert(result.includes('停止'), 'should mention stop');
        assert(!result.includes('已被'), 'should not mention blocked in stopped case');
        assert(!result.includes('載入'), 'should not mention loading in stopped case');
    });
});

test('formatFollowerCollectionMessage - totalHint=0 should not force message', async t => {
    await t.test('timeout with totalHint=0: should adjust message', () => {
        const result = UI.formatFollowerCollectionMessage({
            reason: 'timeout',
            count: 50,
            totalHint: 0,
            visibleRows: 0,
            breakdown: {},
        });
        // Should still mention two possibilities but not hardcode "顯示有 0 位"
        assert(result.includes('已被'), 'should mention blocked possibility');
        assert(result.includes('載入'), 'should mention loading possibility');
        assert(!result.includes('顯示有 0 位'), 'should not mention "display 0 followers"');
    });
});
