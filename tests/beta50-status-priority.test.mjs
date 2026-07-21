import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const helperStart = source.indexOf('export const resolveControllerStatus =');
const helperEnd = source.indexOf('\n};\n\nexport const Core =', helperStart) + 3;
const resolveControllerStatus = Function(
    `${source.slice(helperStart, helperEnd).replace('export const ', 'const ')}; return resolveControllerStatus;`
)();

test('beta50 controller status has an explicit first-row enum and deterministic priority helper', () => {
    assert.match(source, /resolveControllerStatus/);
    assert.match(source, /idle.*block.*report.*three_no.*sweep.*stopping.*stopped.*failed/s);
});

test('beta50 stale background status cannot mask active three-no or sweep state', () => {
    const helper = source.match(/resolveControllerStatus[\s\S]{0,3600}/)?.[0] || '';
    assert.match(helper, /stale|freshness|lastUpdate/i);
    assert.match(helper, /three_no/);
    assert.match(helper, /sweep/);
});

test('beta50 fresh three-no scanning outranks stale BG terminal states', () => {
    const now = 200000;
    for (const state of ['stopped', 'failed', 'stopping']) {
        assert.equal(resolveControllerStatus({
            now,
            staleMs: 10000,
            bgStatus: { state, lastUpdate: now - 60000 },
            threeNoState: { status: 'scanning' },
            threeNoActive: true,
        }), 'three_no', `stale BG_STATUS=${state} must not mask fresh three-no scanning`);
    }
});

test('beta50 fresh terminal state still outranks active three-no scanning', () => {
    const now = 200000;
    assert.equal(resolveControllerStatus({
        now,
        staleMs: 10000,
        bgStatus: { state: 'failed', lastUpdate: now - 1000 },
        threeNoState: { status: 'scanning' },
        threeNoActive: true,
    }), 'failed');
});

console.log('beta50 status priority contract: PASS');
