import test from 'node:test';
import assert from 'node:assert/strict';

// Set up minimal globals for core.js
const area = () => {
    const values = new Map();
    return {
        getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => values.set(String(key), String(value)),
        removeItem: (key) => values.delete(String(key)),
        clear: () => values.clear(),
    };
};

const localStorageMock = area();
const sessionStorageMock = area();
const eventTarget = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true };
const windowMock = {
    ...eventTarget,
    location: {
        href: 'https://www.threads.com/',
        origin: 'https://www.threads.com',
        pathname: '/',
        search: '',
        assign: () => {},
    },
    close: () => {},
    open: () => null,
};
globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36', platform: 'MacIntel', maxTouchPoints: 0 },
});
globalThis.document = {
    ...eventTarget,
    body: { appendChild: () => {}, innerText: '', textContent: '' },
    createElement: () => ({ style: {}, textContent: '', innerHTML: '', appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [], remove: () => {} }),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
};
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

// Import resolveStopVisibility from core.js (now exported)
const { resolveStopVisibility } = await import('../src/core.js');

test('beta74 stop visibility keeps queued work active until the queue drains', () => {
    // 第 1 項：worker 進入閒置後仍有佇列，停止按鈕維持顯示
    const queuedButIdle = resolveStopVisibility({
        blockQueueCount: 37,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'idle' },
        sessionActive: false,
        threeNoActive: false,
        stopLatch: false,
    });
    assert.equal(queuedButIdle, true, 'Queue with items must keep showing stop button after the worker becomes idle');

    // Case 2: Worker running (state === 'running') -> should show
    const running = resolveStopVisibility({
        blockQueueCount: 37,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'running' },
        sessionActive: false,
        threeNoActive: false,
        stopLatch: false,
    });
    assert.equal(running, true, 'Running state must show stop button');

    // Case 3: Three-no scan active -> should show
    const threeNoActive = resolveStopVisibility({
        blockQueueCount: 0,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'idle' },
        sessionActive: false,
        threeNoActive: true,
        stopLatch: false,
    });
    assert.equal(threeNoActive, true, 'Three-no active must show stop button');

    // Case 4: Stopping state -> should show
    const stopping = resolveStopVisibility({
        blockQueueCount: 37,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'stopping' },
        sessionActive: false,
        threeNoActive: false,
        stopLatch: false,
    });
    assert.equal(stopping, true, 'Stopping state must show stop button');

    // Case 5: Latch set with empty/unknown state -> should NOT show
    // This is the beta76 regression guard: when state is empty/unknown (not just terminal),
    // latch must be released to prevent lingering stop button after navigation/reload
    const latchedEmptyState = resolveStopVisibility({
        blockQueueCount: 0,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: '' },  // empty/unknown state, not terminal yet unknown
        sessionActive: false,
        threeNoActive: false,
        stopLatch: true,
    });
    assert.equal(latchedEmptyState, false, 'Latch must be released when state is empty/unknown (beta76 regression guard)');

    // 第 6 項：terminal 狀態仍有佇列，代表工作尚未結束
    const terminalNoSession = resolveStopVisibility({
        blockQueueCount: 37,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'completed' },
        sessionActive: false,
        threeNoActive: false,
        stopLatch: false,
    });
    assert.equal(terminalNoSession, true, 'Terminal state with queued work must keep showing stop button');

    // 第 6b 項：terminal 狀態且佇列為空，正常完成時收起停止按鈕
    const terminalEmptyQueue = resolveStopVisibility({
        blockQueueCount: 0,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'completed' },
        sessionActive: false,
        threeNoActive: false,
        stopLatch: false,
    });
    assert.equal(terminalEmptyQueue, false, 'Terminal state with an empty queue must hide stop button');

    // 第 7 項：terminal 狀態、佇列為空且 latch 存在時釋放 latch
    const terminalWithLatch = resolveStopVisibility({
        blockQueueCount: 0,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'stopped' },
        sessionActive: false,
        threeNoActive: false,
        stopLatch: true,  // even though latch is set
    });
    assert.equal(terminalWithLatch, false, 'Terminal state must release latch and hide button (regression guard)');

    // Case 5b (new): Latch with non-terminal, non-empty unknown state -> should show
    // Ensures latch still functions as a defensive fallback for unclassified state values
    // (e.g., 'paused' or other future states not in terminal list)
    const latchedUnknownNonTerminal = resolveStopVisibility({
        blockQueueCount: 0,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'paused' },  // non-terminal, non-empty, not in terminal list
        sessionActive: false,
        threeNoActive: false,
        stopLatch: true,
    });
    assert.equal(latchedUnknownNonTerminal, true, 'Latch must survive non-terminal unknown states (defensive fallback)');

    // Case 8: Session active but queue empty and idle -> should show
    const sessionActive = resolveStopVisibility({
        blockQueueCount: 0,
        reportQueueCount: 0,
        cooldownQueueCount: 0,
        bgStatus: { state: 'idle' },
        sessionActive: true,
        threeNoActive: false,
        stopLatch: false,
    });
    assert.equal(sessionActive, true, 'Session active must show stop button');
});

console.log('beta74 stop visibility contract: queued-idle-show running-show three-no-show stopping-show latch-show terminal-queued-show terminal-empty-hide session-show');
