import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(key) ? this.#data.get(key) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
}

globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();
globalThis.window = { hegeLog: null, innerHeight: 900, innerWidth: 1200, getComputedStyle: () => ({}) };
globalThis.document = {
    body: { innerText: '', textContent: '', contains: () => true },
    querySelectorAll: () => [],
    querySelector: () => null,
};
globalThis.location = { pathname: '/@fixture', href: 'https://threads.net/@fixture' };

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { UI } = await import('../src/ui.js');
const { Core } = await import('../src/core.js');
await import('../src/worker.js');
await import('../src/features/report-flow.js');

test('beta47 report-only explicit restriction records rate_limited and advances queue without cooldown', () => {
    Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, ['alice', 'bob']);
    let scheduled = false;
    Core.ReportDriver.hasExplicitRestrictionSignal = () => true;
    Core.ReportDriver.recordDebugTrace = () => {};
    Core.ReportDriver.scheduleNext = () => { scheduled = true; };
    Core.ReportDriver.removeCurrent = (user) => {
        const queue = Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []);
        Storage.setJSON(CONFIG.KEYS.REPORT_QUEUE, queue.filter((item) => item !== user));
    };
    UI.showToast = () => {};
    const result = Core.ReportDriver.skipOrPauseForDebug('alice', { onSkipped: () => {} }, 'menu_not_found', '限制訊息');
    const snapshot = Storage.getJSON(CONFIG.KEYS.REPORT_FAILURE_SNAPSHOT, null);
    assert.equal(result, true);
    assert.equal(snapshot.events.at(-1).result, 'rate_limited');
    assert.deepEqual(Storage.getJSON(CONFIG.KEYS.REPORT_QUEUE, []), ['bob']);
    assert.equal(scheduled, true);
    assert.equal(Storage.getJSON(CONFIG.KEYS.COOLDOWN, null), null);
});
