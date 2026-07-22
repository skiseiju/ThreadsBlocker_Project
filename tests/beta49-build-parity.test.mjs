import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const buildJs = await readFile(new URL('../build.js', import.meta.url), 'utf8');
const buildSh = await readFile(new URL('../build.sh', import.meta.url), 'utf8');

const jsOrder = [...buildJs.matchAll(/const ORDER = \[([\s\S]*?)\n\];/g)][0][1]
    .match(/'([^']+)'/g).map(value => value.slice(1, -1));
const shOrder = [...buildSh.matchAll(/FILES=\(([\s\S]*?)\n\)/g)][0][1]
    .match(/"([^"]+)"/g).map(value => value.slice(1, -1));

test('beta49 build paths use the same runtime module order', () => {
    assert.deepEqual(jsOrder, shOrder);
    for (const required of ['announcements.js', 'release-notes.js', 'dialog-collector.js', 'features/report-flow.js', 'features/three-no-watch.js']) {
        assert.ok(jsOrder.includes(required), `${required} must be present in both build paths`);
    }
});

console.log('beta49 build parity contract: PASS identical module order and required runtime modules');
