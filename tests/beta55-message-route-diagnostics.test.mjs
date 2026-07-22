import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.get(String(key)) ?? null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const { isMessageRouteContext, RuntimeDiagnostics } = await import('../src/core.js');

const fixture = (signals = {}) => {
    const rect = () => signals.hidden ? { width: 0, height: 0, top: 0, left: 0, bottom: 0, right: 0 } : { width: 160, height: 80, top: 0, left: 0, bottom: 80, right: 160 };
    const root = { tagName: 'MAIN', getBoundingClientRect: rect, parentElement: null };
    const list = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
    const active = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
    const composer = { tagName: 'TEXTAREA', getBoundingClientRect: rect, parentElement: signals.detached ? root : active };
    const action = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: signals.detached ? root : active };
    active.contains = node => node === active || (!signals.detached && (node === composer || node === action));
    root.contains = node => [root, list, active, composer, action].includes(node);
    root.querySelectorAll = selector => {
        if (/conversation-list|inbox|對話列表/i.test(selector)) return signals.conversationList === false ? [] : [list];
        if (/active-conversation|conversation-pane|role="log"/i.test(selector)) return signals.activeConversation === false ? [] : [active];
        if (/textbox|textarea|contenteditable/i.test(selector)) return signals.composer === false ? [] : [composer];
        if (/toolbar|message-action|send message|傳送訊息/i.test(selector)) return signals.actionArea === false ? [] : [action];
        return [];
    };
    root.querySelector = () => null;
    return { querySelector: () => root };
};

test('beta55 message route requires shell evidence and records normalized signal matrix', () => {
    RuntimeDiagnostics.clear();
    assert.equal(isMessageRouteContext({ pathname: '/messages/123' }, fixture({})), true);
    assert.equal(isMessageRouteContext({ pathname: '/messages/123' }, fixture({ hidden: true })), true);
    assert.equal(isMessageRouteContext({ pathname: '/@alice' }, fixture({ detached: true })), false);
    assert.equal(isMessageRouteContext({ pathname: '/@alice' }, fixture({})), true);
    assert.equal(isMessageRouteContext({ pathname: '/@alice' }, fixture({ composer: true, actionArea: true, conversationList: false, activeConversation: false })), false);
    const entries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'message_route');
    assert.ok(entries.length >= 5);
    assert.ok(entries.some(entry => Object.hasOwn(entry.fields, 'cohesive')));
    assert.ok(entries.some(entry => Object.hasOwn(entry.fields, 'sameRoot')));
    assert.ok(entries.some(entry => Object.hasOwn(entry.fields, 'visible')));
    const serialized = JSON.stringify(entries);
    assert.doesNotMatch(serialized, /alice|123|Messages|conversation text/i);
});

console.log('beta55 message route contract: route/shell matrix and privacy-safe telemetry');
