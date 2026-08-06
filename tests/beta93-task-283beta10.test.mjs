import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    BACKGROUND_WORKER_BUSY_WINDOW_MS,
    BACKGROUND_WORKER_RUNNING_WINDOW_MS,
    isBackgroundWorkerBusy,
    isBackgroundWorkerRunning,
} from '../src/utils.js';

const SRC_ROOT = fileURLToPath(new URL('../src/', import.meta.url));
const NOW = 1_000_000;
const MISSING = Symbol('missing');

const STATUS_CASES = [
    ['running', 'running'],
    ['stopping', 'stopping'],
    ['stopped', 'stopped'],
    ['idle', 'idle'],
    ['completed', 'completed'],
    ['failed', 'failed'],
    ['空字串', ''],
    ['欄位不存在', MISSING],
];

const LAST_UPDATE_CASES = [
    ['現在', NOW],
    ['9 秒前', NOW - 9_000],
    ['10 秒前', NOW - 10_000],
    ['11 秒前', NOW - 11_000],
    ['29 秒前', NOW - 29_000],
    ['30 秒前', NOW - 30_000],
    ['31 秒前', NOW - 31_000],
    ['0', 0],
    ['不存在', MISSING],
    ['未來時間', NOW + 1_000],
];

const makeStatus = (state, lastUpdate) => {
    const status = {};
    if (state !== MISSING) status.state = state;
    if (lastUpdate !== MISSING) status.lastUpdate = lastUpdate;
    return status;
};

// 舊運算式固定寫在測試裡，作為等價性基準，不從產品函式反推。
const legacyGeneral判定 = bgStatus =>
    bgStatus.state === 'running' && (Date.now() - (bgStatus.lastUpdate || 0) < 10000);
const legacyConservative判定 = bgStatus =>
    bgStatus.state === 'running' && (Date.now() - (bgStatus.lastUpdate || 0) < 30000);

const countCalls = (source, name) => (source.match(new RegExp(`\\b${name}\\s*\\(`, 'g')) || []).length;

async function listSourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async entry => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return listSourceFiles(path);
        return entry.isFile() && entry.name.endsWith('.js') ? [path] : [];
    }));
    return nested.flat();
}

const heartbeatComparisonPattern = /(?:Date\.now\(\)|\bnow)\s*-\s*\(\s*[A-Za-z_$][\w$]*\.lastUpdate\s*\|\|\s*0\s*\)\s*(?:<|<=|>|>=)/g;

function removeNamedHelper(source, name) {
    const marker = `export const ${name} =`;
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, `${name} 定義必須存在`);
    const end = source.indexOf('\n\n', start);
    assert.notEqual(end, -1, `${name} 定義必須以空行結束`);
    return `${source.slice(0, start)}${source.slice(end + 2)}`;
}

test('beta10 甲乙真值表逐格等價，保留 10 秒與 30 秒心跳窗', () => {
    assert.equal(BACKGROUND_WORKER_RUNNING_WINDOW_MS, 10_000);
    assert.equal(BACKGROUND_WORKER_BUSY_WINDOW_MS, 30_000);

    const originalNow = Date.now;
    Date.now = () => NOW;
    try {
        for (const [stateLabel, state] of STATUS_CASES) {
            for (const [lastUpdateLabel, lastUpdate] of LAST_UPDATE_CASES) {
                const status = makeStatus(state, lastUpdate);
                const label = `${stateLabel}/${lastUpdateLabel}`;
                assert.equal(
                    isBackgroundWorkerRunning(status),
                    legacyGeneral判定(status),
                    `一般判準不等價：${label}`,
                );
                assert.equal(
                    isBackgroundWorkerBusy(status),
                    legacyConservative判定(status),
                    `保守判準不等價：${label}`,
                );
            }
        }
    } finally {
        Date.now = originalNow;
    }

    console.log(`beta10 真值表：${STATUS_CASES.length} 種狀態 × ${LAST_UPDATE_CASES.length} 種 lastUpdate = ${STATUS_CASES.length * LAST_UPDATE_CASES.length} 格，甲乙共 ${STATUS_CASES.length * LAST_UPDATE_CASES.length * 2} 格逐格相等`);
});

test('beta10 來源分析守門禁止呼叫點內的 lastUpdate 心跳比較', async () => {
    const files = await listSourceFiles(SRC_ROOT);
    const sources = new Map(await Promise.all(files.map(async path => [path, await readFile(path, 'utf8')])));
    const utilsPath = join(SRC_ROOT, 'utils.js');
    const utilsSource = sources.get(utilsPath);
    assert.ok(utilsSource, 'src/utils.js 必須可讀');

    const helperOnlySource = removeNamedHelper(
        removeNamedHelper(utilsSource, 'isBackgroundWorkerRunning'),
        'isBackgroundWorkerBusy',
    );
    const inlineMatches = [];
    for (const [path, source] of sources) {
        const candidate = path === utilsPath ? helperOnlySource : source;
        for (const match of candidate.matchAll(heartbeatComparisonPattern)) {
            inlineMatches.push(`${path}:${source.slice(0, match.index).split('\n').length}`);
        }
    }
    assert.deepEqual(inlineMatches, [], `發現行內 lastUpdate 心跳比較：${inlineMatches.join(', ')}`);
    assert.equal((utilsSource.match(heartbeatComparisonPattern) || []).length, 2, '兩個具名函式各保留一份等價運算式');

    const expectedCallCounts = [
        ['core.js', 'isBackgroundWorkerRunning', 8],
        ['main.js', 'isBackgroundWorkerRunning', 2],
        ['utils.js', 'isBackgroundWorkerBusy', 1],
        ['features/post-reservoir-engine.js', 'isBackgroundWorkerBusy', 1],
        ['features/three-no-watch.js', 'isBackgroundWorkerBusy', 1],
    ];
    for (const [relativePath, name, expected] of expectedCallCounts) {
        const source = sources.get(join(SRC_ROOT, relativePath));
        assert.ok(source, `${relativePath} 必須可讀`);
        assert.equal(countCalls(source, name), expected, `${relativePath} 的 ${name} 呼叫點數量不符`);
    }

    console.log('beta10 來源分析：src/ 呼叫點沒有行內心跳比較，13 個具名函式呼叫全數存在');
});
