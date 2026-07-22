import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
    #data = new Map();
    getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
    setItem(key, value) { this.#data.set(String(key), String(value)); }
    removeItem(key) { this.#data.delete(String(key)); }
    clear() { this.#data.clear(); }
}

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
const listeners = new Map();
const eventTarget = {
    addEventListener(type, listener) {
        const entries = listeners.get(type) || [];
        entries.push(listener);
        listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
        listeners.set(type, (listeners.get(type) || []).filter(entry => entry !== listener));
    },
};
const windowMock = {
    ...eventTarget,
    location: {
        href: 'https://www.threads.com/messages/123',
        origin: 'https://www.threads.com',
        pathname: '/messages/123',
        search: '',
    },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1', position: 'static' }),
    open: () => null,
    close: () => {},
};

globalThis.window = windowMock;
globalThis.location = windowMock.location;
globalThis.localStorage = localStorageMock;
globalThis.sessionStorage = sessionStorageMock;
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'beta84-test', platform: 'MacIntel', maxTouchPoints: 0 },
});
globalThis.chrome = { runtime: { id: 'beta84-test' } };
globalThis.CSS = { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&') };
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
globalThis.document = {
    body: { appendChild() {} },
    documentElement: { appendChild() {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, remove() {} }),
};

const { CONFIG } = await import('../src/config.js');
const { Storage } = await import('../src/storage.js');
const { Utils } = await import('../src/utils.js');
const { UI } = await import('../src/ui.js');
const { DialogCollector } = await import('../src/dialog-collector.js');
const { Core, RuntimeDiagnostics } = await import('../src/core.js');

const originalVersion = CONFIG.VERSION;
const originalDiagnosticsEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;

const makeElement = (overrides = {}) => {
    const attributes = new Map();
    const children = [];
    const classes = new Set();
    const element = {
        children,
        parentElement: null,
        dataset: {},
        className: '',
        style: { setProperty() {} },
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle: (name, force) => {
                const next = force === undefined ? !classes.has(name) : !!force;
                if (next) classes.add(name); else classes.delete(name);
                return next;
            },
        },
        appendChild(child) {
            if (!child) return child;
            children.push(child);
            child.parentElement = element;
            return child;
        },
        insertBefore(child, before) {
            const index = children.indexOf(before);
            if (index < 0) return element.appendChild(child);
            children.splice(index, 0, child);
            child.parentElement = element;
            return child;
        },
        addEventListener() {},
        remove() {},
        setAttribute(name, value) { attributes.set(name, String(value)); },
        getAttribute(name) { return attributes.has(name) ? attributes.get(name) : null; },
        querySelector: () => null,
        querySelectorAll: () => [],
        closest: () => null,
        getBoundingClientRect: () => ({ top: 20, left: 0, width: 120, height: 40 }),
        ...overrides,
    };
    return element;
};

const resetState = ({ version = '2.7.4-beta84', enabled = true } = {}) => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    Storage.cache = {};
    Storage.sessionCache = {};
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = version;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = enabled;
    listeners.clear();
    windowMock.location.pathname = '/messages/123';
    windowMock.location.href = 'https://www.threads.com/messages/123';
    Core.resetCheckboxOverlapObservation?.();
};

const overlapEntries = () => (Core.buildThreeNoDebugExport()?.entries || [])
    .filter(entry => entry.feature === 'selection' && entry.stage === 'layout');

test.after(() => {
    CONFIG.VERSION = originalVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = originalDiagnosticsEnabled;
    RuntimeDiagnostics.clear();
    Core.resetCheckboxOverlapObservation?.();
});

test('beta84 export records both checkbox overlap paths with safe fields', () => {
    resetState();
    Core.recordCheckboxOverlapObservation({
        path: 'dialog_injection',
        ctxIsRoleDialog: true,
        ctxVisible: true,
        isMessageRoute: true,
        dialogCount: 2,
        accountRowCount: 7,
        didInject: false,
    });
    Core.recordCheckboxOverlapObservation({
        path: 'inline_post_injection',
        insideRoleDialog: false,
        isMessageRoute: true,
        didInject: true,
    });

    const entries = overlapEntries();
    assert.equal(entries.length, 2);
    const dialog = entries.find(entry => entry.fields.path === 'dialog_injection');
    const inline = entries.find(entry => entry.fields.path === 'inline_post_injection');
    assert.deepEqual(dialog?.fields, {
        ctxIsRoleDialog: true,
        ctxVisible: true,
        isMessageRoute: true,
        dialogCount: 2,
        accountRowCount: 7,
        didInject: false,
        path: 'dialog_injection',
    });
    assert.deepEqual(inline?.fields, {
        insideRoleDialog: false,
        isMessageRoute: true,
        didInject: true,
        path: 'inline_post_injection',
    });
});

test('beta84 overlap observation drops rogue PII-shaped fields before export', () => {
    resetState();
    const marker = 'BETA84_PII_MARKER';
    Core.recordCheckboxOverlapObservation({
        path: 'dialog_injection',
        ctxIsRoleDialog: true,
        ctxVisible: true,
        isMessageRoute: false,
        dialogCount: 1,
        accountRowCount: 1,
        didInject: false,
        username: marker,
        href: `https://threads.example/@${marker}`,
        url: `https://threads.example/${marker}`,
        text: marker,
        class: marker,
        html: `<div>${marker}</div>`,
        'aria-label': marker,
        ariaLabel: marker,
    });
    assert.doesNotMatch(JSON.stringify(Core.buildThreeNoDebugExport()), new RegExp(marker));
});

test('beta84 stable or diagnostics-disabled export stays null and adds no entry', () => {
    for (const scenario of [
        { version: '2.7.4', enabled: true },
        { version: '2.7.4-beta84', enabled: false },
    ]) {
        resetState(scenario);
        assert.equal(Core.recordCheckboxOverlapObservation({ path: 'dialog_injection', didInject: true }), null);
        assert.equal(Core.buildThreeNoDebugExport(), null);
        assert.deepEqual(RuntimeDiagnostics.get(), []);
    }
});

test('beta84 overlap helper coalesces same-tick repeats and hard-caps varied observations', () => {
    resetState();
    for (let i = 0; i < 200; i += 1) {
        Core.recordCheckboxOverlapObservation({
            path: 'inline_post_injection',
            insideRoleDialog: false,
            isMessageRoute: false,
            didInject: true,
        });
    }
    assert.ok(overlapEntries().length <= 1, 'same signature should be throttled');

    Core.resetCheckboxOverlapObservation();
    RuntimeDiagnostics.clear();
    for (let i = 0; i < 200; i += 1) {
        Core.recordCheckboxOverlapObservation({
            path: i % 2 ? 'dialog_injection' : 'inline_post_injection',
            ctxIsRoleDialog: i % 2 === 0,
            ctxVisible: true,
            insideRoleDialog: i % 3 === 0,
            isMessageRoute: i % 4 === 0,
            dialogCount: i,
            accountRowCount: i,
            didInject: i % 5 === 0,
        });
    }
    assert.ok(overlapEntries().length < 200, 'dedicated cap must stay below global ring limit');
    assert.ok(overlapEntries().length <= 40, 'dedicated checkbox observation cap should be bounded');
});

test('beta84 unchanged scanner polling stays one quota across 1500ms ticks, while route change records', () => {
    const originalNow = Date.now;
    let now = 1000;
    Date.now = () => now;
    try {
        resetState();
        for (let i = 0; i < 50; i += 1) {
            Core.recordCheckboxOverlapObservation({
                path: 'dialog_injection',
                ctxIsRoleDialog: true,
                ctxVisible: true,
                isMessageRoute: false,
                dialogCount: 1,
                accountRowCount: 4,
                didInject: false,
            });
            now += 1600;
        }
        assert.equal(overlapEntries().length, 1);
        Core.recordCheckboxOverlapObservation({
            path: 'dialog_injection',
            ctxIsRoleDialog: true,
            ctxVisible: true,
            isMessageRoute: true,
            dialogCount: 1,
            accountRowCount: 4,
            didInject: false,
        });
        assert.equal(overlapEntries().length, 2);
        assert.equal(overlapEntries().at(-1)?.fields.isMessageRoute, true);
    } finally {
        Date.now = originalNow;
    }
});

test('beta84 clearRuntimeDiagnostics resets the dedicated observation quota', () => {
    resetState();
    for (let i = 0; i < 40; i += 1) {
        Core.recordCheckboxOverlapObservation({
            path: 'dialog_injection',
            ctxIsRoleDialog: true,
            ctxVisible: true,
            isMessageRoute: false,
            dialogCount: 1,
            accountRowCount: i,
            didInject: false,
        });
    }
    assert.equal(Core.recordCheckboxOverlapObservation({
        path: 'dialog_injection',
        ctxIsRoleDialog: true,
        ctxVisible: true,
        isMessageRoute: false,
        dialogCount: 1,
        accountRowCount: 100,
        didInject: false,
    }), null);

    const originalShowToast = UI.showToast;
    UI.showToast = () => {};
    try {
        assert.equal(Core.clearRuntimeDiagnostics(), true);
    } finally {
        UI.showToast = originalShowToast;
    }
    Core.recordCheckboxOverlapObservation({
        path: 'dialog_injection',
        ctxIsRoleDialog: true,
        ctxVisible: true,
        isMessageRoute: true,
        dialogCount: 1,
        accountRowCount: 100,
        didInject: false,
    });
    const entries = overlapEntries();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.fields.accountRowCount, 100);
    assert.equal(entries[0]?.fields.isMessageRoute, true);
});

test('beta84 production callsites record dialog and inline observations', () => {
    resetState();
    const link = makeElement({ getAttribute: () => '/@BETA84_CALLSITE_MARKER' });
    const ctx = makeElement({
        matches: selector => selector === '[role="dialog"]',
        querySelectorAll: selector => selector === 'a[href^="/@"]' ? [link] : [],
    });
    const parent = makeElement({
        querySelector(selector) {
            if (selector === 'a[href^="/@"]') return link;
            if (selector === '.hege-checkbox-container') return this.children.find(child => child.className === 'hege-checkbox-container') || null;
            return null;
        },
    });
    const btn = makeElement({ parentElement: parent, closest: () => null });
    const svg = makeElement({
        style: { width: '' },
        clientWidth: 24,
        closest: selector => selector === 'div[role="button"]' ? btn : null,
        querySelector: selector => selector === 'circle' ? makeElement() : null,
        getAttribute: name => name === 'viewBox' ? '0 0 24 24' : null,
    });
    parent.parentElement = makeElement();
    parent.appendChild(btn);
    const documentMock = {
        hidden: false,
        body: makeElement(),
        defaultView: windowMock,
        querySelector(selector) { return null; },
        querySelectorAll(selector) {
            if (selector === '[role="dialog"]') return [ctx];
            if (selector === CONFIG.SELECTORS.MORE_SVG) return [svg];
            return [];
        },
        createElement: () => makeElement(),
        createElementNS: () => makeElement(),
        addEventListener() {},
    };

    const originals = {
        document: globalThis.document,
        getTopContext: Core.getTopContext,
        getSupportedDialogTitle: Core.getSupportedDialogTitle,
        pickBest: DialogCollector.pickBestAccountDialog,
        syncLinkBadges: Core.syncInlineFakeAccountLinkBadges,
        profileCheckbox: Core.injectProfileHeaderCheckbox,
        inlineContext: Core.isInlinePostElementContext,
        inlineBadge: Core.syncInlineFakeAccountBadge,
        threeNo: Core.ThreeNoWatch,
        getResults: Storage.getThreeNoScanResults,
        getBlockDB: Storage.getBlockDB,
        getJSON: Storage.getJSON,
        getMyUsername: Utils.getMyUsername,
        isMobile: Utils.isMobile,
        diagLog: Utils.diagLog,
    };
    try {
        globalThis.document = documentMock;
        Core.getTopContext = () => ctx;
        DialogCollector.pickBestAccountDialog = () => ctx;
        Core.getSupportedDialogTitle = () => null;
        Core.syncInlineFakeAccountLinkBadges = () => {};
        Core.injectProfileHeaderCheckbox = () => {};
        Core.isInlinePostElementContext = () => true;
        Core.syncInlineFakeAccountBadge = () => {};
        Storage.getThreeNoScanResults = () => ({ users: [] });
        Storage.getBlockDB = () => [];
        Storage.getJSON = () => [];
        Utils.getMyUsername = () => '';
        Utils.isMobile = () => false;
        Utils.diagLog = () => {};
        Core.injectDialogCheckboxes();
        Core.scanAndInject();
    } finally {
        globalThis.document = originals.document;
        Core.getTopContext = originals.getTopContext;
        Core.getSupportedDialogTitle = originals.getSupportedDialogTitle;
        DialogCollector.pickBestAccountDialog = originals.pickBest;
        Core.syncInlineFakeAccountLinkBadges = originals.syncLinkBadges;
        Core.injectProfileHeaderCheckbox = originals.profileCheckbox;
        Core.isInlinePostElementContext = originals.inlineContext;
        Core.syncInlineFakeAccountBadge = originals.inlineBadge;
        Core.ThreeNoWatch = originals.threeNo;
        Storage.getThreeNoScanResults = originals.getResults;
        Storage.getBlockDB = originals.getBlockDB;
        Storage.getJSON = originals.getJSON;
        Utils.getMyUsername = originals.getMyUsername;
        Utils.isMobile = originals.isMobile;
        Utils.diagLog = originals.diagLog;
    }

    const paths = new Set(overlapEntries().map(entry => entry.fields.path));
    assert.equal(paths.has('dialog_injection'), true);
    assert.equal(paths.has('inline_post_injection'), true);
    assert.doesNotMatch(JSON.stringify(Core.buildThreeNoDebugExport()), /BETA84_CALLSITE_MARKER/);
});
