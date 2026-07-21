import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
const { ReportDebugContext } = await import('../src/report-debug-context.js');
const { Core } = await import('../src/core.js');
const { CONFIG } = await import('../src/config.js');

const now = Date.now();

test('beta47 report snapshot drops malformed pre-existing events before append', () => {
    const malformed = {
        schema: ReportDebugContext.SCHEMA,
        events: [
            { ts: now - 1000, stage: 'block', result: 'menu_not_found', routeType: 'profile', counts: { queue: 2, failed: 1, success: 0, skipped: 0, vanished: 0 }, username: 'must-drop' },
            { ts: now - 1000, stage: 'not-allowlisted', result: 'menu_not_found', routeType: 'profile', counts: { queue: 2 } },
            { ts: now - 1000, stage: 'report', result: 'menu_not_found', routeType: 'profile', counts: { queue: 2.5 } },
            { ts: now - ReportDebugContext.TTL_MS - 1, stage: 'report', result: 'failed', routeType: 'profile', counts: { queue: 1 } },
        ],
        secret: 'must-drop',
    };
    localStorage.setItem(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, JSON.stringify(malformed));
    const saved = Core.recordReportFailureSnapshot({ stage: 'report', result: 'rate_limited', routeType: 'profile', counts: { queue: 1 } });
    assert.ok(saved);
    assert.equal(saved.events.length, 2);
    assert.deepEqual(saved.events.map((event) => event.result), ['menu_not_found', 'rate_limited']);
    assert.equal(Object.hasOwn(saved, 'secret'), false);
    assert.deepEqual(Object.keys(saved.events[0].counts).sort(), ReportDebugContext.COUNT_KEYS.slice().sort());
    assert.equal(Object.hasOwn(saved.events[0], 'username'), false);
});

test('beta47 report snapshot enforces allowlists, TTL and cap', () => {
    assert.equal(ReportDebugContext.append(null, {
        ts: now,
        stage: 'report',
        result: 'made_up_result',
        routeType: 'profile',
        counts: { queue: 1 },
    }, now), null);
    const events = Array.from({ length: 30 }, (_, index) => ({
        ts: now - 30 + index,
        stage: 'block',
        result: 'failed',
        routeType: 'post',
        counts: { queue: index, failed: 0, success: 0, skipped: 0, vanished: 0, extra: 9 },
    }));
    const safe = ReportDebugContext.sanitizeSnapshot({ schema: ReportDebugContext.SCHEMA, events }, now);
    assert.equal(safe.events.length, ReportDebugContext.MAX_EVENTS);
    assert.equal(safe.events[0].ts, now - 25);
    assert.equal(Object.hasOwn(safe.events[0].counts, 'extra'), false);
    assert.equal(ReportDebugContext.sanitizeSnapshot({ schema: ReportDebugContext.SCHEMA, events: [{ ...events[0], ts: now - ReportDebugContext.TTL_MS - 1 }] }, now), null);
});
