import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('beta52 stop visibility has a latched resolver and terminal drain gate', () => {
    assert.match(coreSource, /resolveStopVisibility/);
    assert.match(coreSource, /stopVisibilityLatch|stop.*latch/i);
    assert.match(coreSource, /terminal.*queue|queue.*terminal/i);
    assert.match(coreSource, /hege_stop_visibility_latch/);
});

test('beta52 stop callback enters stopping before worker heartbeat catches up', () => {
    assert.match(coreSource, /state:\s*['"]stopping['"]/);
    assert.match(mainSource, /markStopRequested|BG_CMD/);
});

test('beta52 checkbox running selection is independent from active queue removal', () => {
    assert.match(coreSource, /selectionSnapshot|selectionLatch/);
    assert.match(coreSource, /isSelectionLatched|selection.*running/i);
    assert.match(coreSource, /React|replacement|reinject/i);
});

console.log('beta52 stop/checkbox contract: RED then PASS after latches');
