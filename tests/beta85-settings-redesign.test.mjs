import test from 'node:test';
import assert from 'node:assert/strict';

class TestElement {
    constructor(tagName = 'div', attrs = {}) {
        this.tagName = tagName.toLowerCase();
        this.attrs = { ...attrs };
        this.id = attrs.id || '';
        this.className = attrs.class || '';
        this.dataset = {};
        this.style = {};
        this.children = [];
        this.parentNode = null;
        this._text = '';
        this.onclick = null;

        Object.entries(attrs).forEach(([key, value]) => {
            if (key.startsWith('data-')) {
                const dataKey = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                this.dataset[dataKey] = value;
            }
        });
        String(attrs.style || '').split(';').forEach(rule => {
            const separator = rule.indexOf(':');
            if (separator < 0) return;
            const key = rule.slice(0, separator).trim();
            if (key) this.style[key] = rule.slice(separator + 1).trim();
        });
    }

    get textContent() {
        return this._text + this.children.map(child => child.textContent).join('');
    }

    set textContent(value) {
        this._text = String(value ?? '');
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        this.children = [];
        children.forEach(child => this.appendChild(child));
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.children = this.parentNode.children.filter(child => child !== this);
            this.parentNode = null;
        }
    }

    setAttribute(key, value) {
        const normalized = String(value);
        this.attrs[key] = normalized;
        if (key.startsWith('data-')) {
            const dataKey = key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
            this.dataset[dataKey] = normalized;
        }
    }

    getAttribute(key) {
        return Object.hasOwn(this.attrs, key) ? this.attrs[key] : null;
    }

    click() {
        this.onclick?.({ stopPropagation() {} });
    }

    matches(selector) {
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
        const attr = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (attr) {
            return Object.hasOwn(this.attrs, attr[1])
                && (attr[2] === undefined || this.attrs[attr[1]] === attr[2]);
        }
        return this.tagName === selector.toLowerCase();
    }

    descendants() {
        return this.children.flatMap(child => [child, ...child.descendants()]);
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
        if (selector.includes(',')) {
            return [...new Set(selector.split(',').flatMap(part => this.querySelectorAll(part.trim())))];
        }
        return this.descendants().filter(element => element.matches(selector));
    }
}

function parseHTML(html) {
    const root = new TestElement('body');
    const stack = [root];
    const voidTags = new Set(['area', 'base', 'br', 'circle', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'path', 'rect', 'source', 'track', 'wbr']);
    const tokenPattern = /<\/?([a-z][\w-]*)\b([^>]*)>/gi;
    let cursor = 0;
    let match;

    while ((match = tokenPattern.exec(html))) {
        stack.at(-1)._text += html.slice(cursor, match.index).replace(/\s+/g, ' ');
        cursor = tokenPattern.lastIndex;
        const full = match[0];
        const tagName = match[1].toLowerCase();
        if (full.startsWith('</')) {
            if (stack.length > 1) stack.pop();
            continue;
        }

        const attrs = {};
        for (const attr of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
            attrs[attr[1]] = attr[2] ?? '';
        }
        const element = new TestElement(tagName, attrs);
        stack.at(-1).appendChild(element);
        if (!voidTags.has(tagName) && !full.endsWith('/>')) stack.push(element);
    }
    stack.at(-1)._text += html.slice(cursor).replace(/\s+/g, ' ');
    return root;
}

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: key => memory.delete(key),
};
globalThis.sessionStorage = globalThis.localStorage;
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Chrome beta85', platform: 'Linux', maxTouchPoints: 0 },
});
globalThis.chrome = { runtime: {} };
globalThis.window = {
    open() {},
    addEventListener() {},
    location: { href: 'https://www.threads.net/', origin: 'https://www.threads.net', pathname: '/' },
};
globalThis.location = window.location;
globalThis.DOMParser = class {
    parseFromString(html) {
        return { body: { childNodes: parseHTML(html).children } };
    }
};
globalThis.document = {
    body: new TestElement('body'),
    createElement: tagName => new TestElement(tagName),
    getElementById(id) {
        return this.body.descendants().find(element => element.id === id) || null;
    },
    querySelector(selector) {
        return this.body.querySelector(selector);
    },
    querySelectorAll(selector) {
        return this.body.querySelectorAll(selector);
    },
};

const { UI } = await import('../src/ui.js');
const { CONFIG } = await import('../src/config.js');
const originalVersion = CONFIG.VERSION;
test.after(() => { CONFIG.VERSION = originalVersion; });

const callbackBindings = [
    ['onManage', 'hege-s-manage'],
    ['onCockroach', 'hege-s-cockroach'],
    ['onReservoir', 'hege-s-reservoir'],
    ['onImport', 'hege-s-import'],
    ['onExport', 'hege-s-export'],
    ['onExportReportPack', 'hege-s-reportpack-export'],
    ['onImportReportPack', 'hege-s-reportpack-import'],
    ['onExportReportDebug', 'hege-s-export-report-debug'],
    ['onExportThreeNoDebug', 'hege-s-export-three-no-debug'],
    ['onDevReloadExtension', 'hege-s-dev-reload'],
    ['onClearDB', 'hege-s-clear-db'],
    ['onReport', 'hege-s-report'],
    ['onCredentialsConsent', 'hege-s-credentials-consent'],
    ['onAnalytics', 'hege-s-analytics'],
];

function openSettings(version = '2.7.4-beta85', initialView = 'home') {
    CONFIG.VERSION = version;
    memory.clear();
    document.body = new TestElement('body');
    const callbacks = Object.fromEntries(callbackBindings.map(([name]) => [name, () => {}]));
    if (!/-beta\d+$/i.test(version)) {
        callbacks.onExportReportDebug = null;
        callbacks.onExportThreeNoDebug = null;
        callbacks.onDevReloadExtension = null;
    }
    callbacks.initialView = initialView;
    UI.showSettingsModal(callbacks);
    return document.getElementById('hege-settings-overlay');
}

const idsByPanel = {
    data: ['hege-s-manage', 'hege-s-cockroach', 'hege-s-reservoir', 'hege-s-import', 'hege-s-export'],
    tools: ['hege-s-reportpack-export', 'hege-s-reportpack-import', 'hege-s-three-no-threshold-row', 'hege-s-credentials-consent', 'hege-s-analytics', 'hege-s-clear-db'],
    common: ['hege-s-speed', 'hege-s-daily-limit', 'hege-s-daily-report-limit', 'hege-s-auto-mark-leader-row', 'hege-s-block-visual-debug-row', 'hege-s-report-visual-debug-row'],
};

test('beta85 product module renders three isolated panels and maps legacy home to data', () => {
    const overlay = openSettings('2.7.4-beta85', 'home');
    const panels = Object.fromEntries(['data', 'tools', 'common'].map(view => [
        view,
        overlay.querySelector(`[data-hege-settings-view-panel="${view}"]`),
    ]));

    assert.equal(panels.data.style.display, 'flex');
    assert.equal(panels.tools.style.display, 'none');
    assert.equal(panels.common.style.display, 'none');
    for (const [view, expectedIds] of Object.entries(idsByPanel)) {
        for (const id of expectedIds) assert.ok(panels[view].querySelector(`#${id}`), `${id} belongs to ${view}`);
        for (const [otherView, otherIds] of Object.entries(idsByPanel)) {
            if (otherView === view) continue;
            for (const id of otherIds) assert.equal(panels[view].querySelector(`#${id}`), null, `${id} is absent from ${view}`);
        }
    }

    overlay.querySelector('[data-hege-settings-tab="tools"]').click();
    assert.equal(panels.tools.style.display, 'flex');
    assert.equal(panels.data.style.display, 'none');
    assert.equal(panels.common.style.display, 'none');
    overlay.querySelector('[data-hege-settings-tab="common"]').click();
    assert.equal(panels.common.style.display, 'flex');
    assert.equal(panels.data.style.display, 'none');
    assert.equal(panels.tools.style.display, 'none');
});

test('beta85 product module retains every callback and preference binding', () => {
    openSettings();
    for (const [, id] of callbackBindings) {
        assert.equal(typeof document.getElementById(id)?.onclick, 'function', `${id} callback is bound`);
    }
    assert.equal(typeof document.getElementById('hege-s-speed')?.onclick, 'function');
    assert.equal(typeof document.getElementById('hege-s-three-no-threshold')?.onchange, 'function');
    assert.equal(typeof document.getElementById('hege-s-daily-limit-select')?.onchange, 'function');
    assert.equal(typeof document.getElementById('hege-s-daily-report-limit-select')?.onchange, 'function');
    assert.equal(typeof document.getElementById('hege-s-auto-mark-leader')?.onchange, 'function');
    assert.equal(typeof document.getElementById('hege-s-block-visual-debug-toggle')?.onchange, 'function');
    assert.equal(typeof document.getElementById('hege-s-report-visual-debug-toggle')?.onchange, 'function');
});

test('beta85 product module preserves beta gates and the five-item footer', () => {
    let overlay = openSettings('2.7.4-beta85');
    assert.ok(overlay.querySelector('#hege-s-export-three-no-debug'));
    assert.ok(overlay.querySelector('#hege-s-export-report-debug'));
    assert.ok(overlay.querySelector('#hege-s-dev-reload'));
    assert.equal(overlay.querySelectorAll('[data-hege-settings-footer-item]').length, 5);

    overlay = openSettings('2.7.4');
    assert.equal(overlay.querySelector('#hege-s-export-three-no-debug'), null);
    assert.equal(overlay.querySelector('#hege-s-export-report-debug'), null);
    assert.equal(overlay.querySelector('#hege-s-dev-reload'), null);
    assert.equal(overlay.querySelectorAll('[data-hege-settings-footer-item]').length, 5);
});

test('beta85 product module renders the four approved item copy changes', () => {
    const text = openSettings().textContent;
    for (const copy of [
        '加速三無檢查（進階）',
        '定點絕：自動列入大蟑螂名單',
        '顯示封鎖即時進度',
        '顯示檢舉即時進度',
    ]) assert.match(text, new RegExp(copy));
    for (const oldCopy of [
        '加速三無的認證欄位處理',
        '定點絕時自動標頭目',
        '封鎖流程可視化',
        '檢舉流程可視化',
    ]) assert.doesNotMatch(text, new RegExp(oldCopy));
});
