import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../src/config.js';
import { diagnosticsEnabled, diagnosticsSkipReason } from './helpers/diagnostics-gate.mjs';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const configSource = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');

test('beta54 follower UI is plain language and does not expose internal reason codes', () => {
    assert.match(uiSource, /收集未完成。這個帳號顯示有/);
    assert.match(uiSource, /Threads 目前只載入/);
    assert.match(uiSource, /約 .*尚未載入/);
    assert.match(uiSource, /已自動嘗試載入/);
    assert.match(uiSource, /只收集，不會立即封鎖；確認後才會加入封鎖佇列/);
    assert.match(uiSource, /rows_unknown|scroll_stall|likes_tab_switch_failed/);
    assert.match(uiSource, /formatFollowerCollectionMessage/);
});

test('beta54 partial follower copy names loaded, added, already-listed and not-loaded counts', () => {
    const match = uiSource.match(/formatFollowerCollectionMessage: \(summary = \{\}\) => \{([\s\S]*?)\n    \},\n\n    showFollowerCollectionConfirm/);
    assert.ok(match, 'follower formatter must be extractable');
    const format = Function(`return (summary = {}) => {${match[1]}}`)();
    const message = format({
        count: 16, visibleRows: 96, totalHint: 175, reason: 'threads_partial',
        breakdown: { duplicate: 80, selfTarget: 0, blocked: 0, queued: 0 },
    });
    assert.equal(message, '收集未完成。這個帳號顯示有 175 位粉絲，但 Threads 目前只載入 96 位。這次新增 16 位，另外 80 位已在名單中；約 79 位尚未載入。留友封已自動嘗試載入，Threads 暫時沒有繼續提供資料；你可以稍後重試。\n\n只收集，不會立即封鎖；確認後才會加入封鎖佇列。');
    assert.doesNotMatch(message, /threads_partial|bounded|上限/);
    assert.doesNotMatch(coreSource, /名單未完成：\$\{collection\.reason\}/);
    assert.doesNotMatch(coreSource, /收集未完成（\$\{reason\}）/);
});

test('beta54 version is bumped without building', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, () => {
    const versionMatch = /^(?:2\.7\.4-beta(\d+)|2\.8\.3-beta\d+|2\.8\.4-beta\d+)$/.exec(String(CONFIG.VERSION));
    assert.ok(versionMatch, `CONFIG.VERSION must be a supported beta version, got ${CONFIG.VERSION}`);
    if (versionMatch[1]) assert.ok(Number(versionMatch[1]) >= 63, `CONFIG.VERSION beta number must be >= 63, got ${CONFIG.VERSION}`);
});

test('beta54 message route requires route plus message shell and preserves normal routes', () => {
    const match = coreSource.match(/export const isMessageRouteContext = \(locationLike = \{\}, doc = null\) => \{([\s\S]*?)\n\};/);
    assert.ok(match, 'route helper must be present');
    const isMessageRouteContext = Function(`const isMessageRouteContext = (locationLike = {}, doc = null) => {${match[1]}}; return isMessageRouteContext;`)();
    const fixture = (html, hasShell = false) => {
        const rect = () => ({ top: 0, left: 0, width: 100, height: 40, bottom: 40, right: 100 });
        const root = { tagName: 'MAIN', getBoundingClientRect: rect, parentElement: null };
        const list = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
        const active = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: root };
        const composer = { tagName: 'TEXTAREA', getBoundingClientRect: rect, parentElement: active };
        const action = { tagName: 'DIV', getBoundingClientRect: rect, parentElement: active };
        active.contains = node => node === active || node === composer || node === action;
        root.contains = node => [root, list, active, composer, action].includes(node);
        root.querySelectorAll = selector => {
            if (!hasShell) return [];
            if (/conversation-list|inbox|對話列表/i.test(selector)) return [list];
            if (/active-conversation|conversation-pane|role="log"/i.test(selector)) return [active];
            if (/textbox|textarea|contenteditable/i.test(selector)) return [composer];
            if (/toolbar|message-action|send message|傳送訊息/i.test(selector)) return [action];
            return [];
        };
        root.querySelector = () => null;
        return { querySelector: () => root };
    };
    assert.equal(isMessageRouteContext({ pathname: '/messages' }, fixture('Messages', true)), true);
    assert.equal(isMessageRouteContext({ pathname: '/messages' }, fixture('')), true);
    assert.equal(isMessageRouteContext({ pathname: '/@alice' }, fixture('Messages')), false);
    assert.equal(isMessageRouteContext({ pathname: '/@alice' }, fixture('Messages', false)), false);
});

test('beta54 route lifecycle hides only panel, keeps pending, and marks reposition after return', () => {
    assert.match(coreSource, /hegeMessageHidden/);
    assert.match(coreSource, /hegeRepositionRequired/);
    assert.match(coreSource, /updatePanelRouteVisibility/);
    assert.match(coreSource, /pendingUsers/);
});

test('beta54 idle status is human-readable and stop visibility has no-active gate', () => {
    assert.match(coreSource, /idle:\s*['"]待命中['"]/);
    assert.match(coreSource, /if.*terminal.*return false/i);
    assert.match(coreSource, /hege-stop-btn-item/);
});

test('beta54 Likes flow waits for the post-switch context/list before collecting', () => {
    assert.match(coreSource, /waitForLikesRender/);
    assert.match(coreSource, /getTopContext/);
    assert.match(coreSource, /stableObservations/);
    assert.match(coreSource, /likes_tab_switch_failed/);
    assert.match(coreSource, /hasCurrentLikesEvidence/);
});

test('beta54 viewport clamp and navigation/resize hooks are bounded', () => {
    assert.match(uiSource, /clampViewportPosition/);
    assert.match(uiSource, /viewportWidth|innerWidth/);
    assert.match(coreSource, /addEventListener\(['"]resize['"]/);
    assert.match(uiSource, /hegeRepositionRequired/);
});

test('beta54 clamp keeps stale offscreen panel geometry inside viewport', () => {
    const match = uiSource.match(/export const clampViewportPosition = \(\{[\s\S]*?\}\) => \(\{[\s\S]*?\}\);/);
    assert.ok(match, 'clamp helper must be extractable');
    const clamp = Function(`${match[0].replace('export const ', 'const ')}; return clampViewportPosition;`)();
    assert.deepEqual(clamp({ left: -80, top: -30, width: 240, height: 400, viewportWidth: 320, viewportHeight: 500 }), { left: 6, top: 6 });
    assert.deepEqual(clamp({ left: 290, top: 480, width: 240, height: 400, viewportWidth: 320, viewportHeight: 500 }), { left: 74, top: 94 });
});

console.log('beta54 UI/route contracts: RED then PASS');
