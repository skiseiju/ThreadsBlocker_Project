import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const feature = fs.readFileSync(path.join(root, 'src/features/three-no-watch.js'), 'utf8');
const extractStart = feature.indexOf('extractProfileMetadata: async');
const extractEnd = feature.indexOf('parseJoinedAt:', extractStart);
const extract = feature.slice(extractStart, extractEnd);

class FixtureElement {
    constructor(tagName = 'div', attrs = {}, rect = { x: 0, y: 0, width: 0, height: 0 }) {
        this.tagName = tagName.toLowerCase();
        this.attrs = { ...attrs };
        this.children = [];
        this.parentElement = null;
        this.innerText = attrs.text || '';
        this.textContent = this.innerText;
        this.visible = attrs.visible !== false;
        this.rect = rect;
        this.onclick = null;
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    setVisible(value) { this.visible = value; return this; }

    getAttribute(key) { return this.attrs[key] ?? null; }
    setAttribute(key, value) { this.attrs[key] = String(value); }

    getBoundingClientRect() {
        let node = this;
        while (node) {
            if (!node.visible) return { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
            node = node.parentElement;
        }
        const { x = 0, y = 0, width = 0, height = 0 } = this.rect;
        return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
    }

    matches(selector) {
        return selector.split(',').some(raw => {
            const value = raw.trim();
            if (!value) return false;
            const attr = value.match(/^([\w-]+)?\[([^=\]]+)(?:="([^"]*)")?\]$/);
            if (attr) {
                return (!attr[1] || this.tagName === attr[1].toLowerCase())
                    && Object.hasOwn(this.attrs, attr[2])
                    && (attr[3] === undefined || this.attrs[attr[2]] === attr[3]);
            }
            if (value.startsWith('[') && value.endsWith(']')) {
                const key = value.slice(1, -1);
                return Object.hasOwn(this.attrs, key);
            }
            return this.tagName === value.toLowerCase();
        });
    }

    querySelectorAll(selector) {
        const descendants = this.children.flatMap(child => [child, ...child.querySelectorAll(selector)]);
        return descendants.filter(child => child.matches(selector));
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

    closest(selector) {
        let node = this;
        while (node) {
            if (node.matches(selector)) return node;
            node = node.parentElement;
        }
        return null;
    }
}

class FixtureDocument extends FixtureElement {
    constructor() {
        super('body', {}, { x: 0, y: 0, width: 600, height: 900 });
        this.body = this;
        this.documentElement = this;
    }
}

const memory = new Map();
globalThis.localStorage = {
    getItem: key => memory.has(String(key)) ? memory.get(String(key)) : null,
    setItem: (key, value) => memory.set(String(key), String(value)),
    removeItem: key => memory.delete(String(key)),
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.window = {
    innerHeight: 900,
    location: { href: 'https://www.threads.net/@fixture', origin: 'https://www.threads.net', pathname: '/@fixture' },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    getComputedStyle: () => ({ cursor: '' }),
};
globalThis.location = window.location;
Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { userAgent: 'Chrome fixture', platform: 'Linux', maxTouchPoints: 0 },
});
globalThis.chrome = { runtime: {} };
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
globalThis.document = new FixtureDocument();

const { Core } = await import('../src/core.js');
const { Utils } = await import('../src/utils.js');
await import('../src/features/three-no-watch.js');

const originalPollUntil = Utils.pollUntil;
const originalSafeSleep = Utils.safeSleep;
const originalSimClick = Utils.simClick;
Utils.pollUntil = async condition => condition();
Utils.safeSleep = async () => {};

function resetFixture() {
    memory.clear();
    globalThis.document = new FixtureDocument();
    window.location.href = 'https://www.threads.net/@fixture';
    window.location.pathname = '/@fixture';
}

function buildProfileFixture({ withMore = true, withAbout = true, withDialog = true } = {}) {
    const root = new FixtureElement('main', {}, { x: 0, y: 0, width: 600, height: 900 });
    root.innerText = 'Fixture profile';
    root.textContent = root.innerText;
    document.appendChild(root);
    let menu;
    let dialog;
    if (withMore) {
        const more = new FixtureElement('button', { 'aria-label': 'More', text: 'More' }, { x: 320, y: 100, width: 40, height: 40 });
        const svg = new FixtureElement('svg', { 'aria-label': 'More' }, { x: 320, y: 100, width: 40, height: 40 });
        more.appendChild(svg);
        root.appendChild(more);
        menu = new FixtureElement('div', { role: 'menu', visible: false }, { x: 300, y: 140, width: 220, height: 180 });
        document.appendChild(menu);
        if (withAbout) {
            const about = new FixtureElement('div', { role: 'menuitem', text: 'About this profile' }, { x: 320, y: 160, width: 180, height: 40 });
            menu.appendChild(about);
            about.onclick = () => {
                if (!withDialog) return;
                dialog.setVisible(true);
            };
        }
        more.onclick = () => menu.setVisible(true);
        Utils.simClick = element => element?.onclick?.({ target: element });
    }
    dialog = new FixtureElement('div', { role: 'dialog', text: 'About this profile\nJoined January 2020\nLocation: Taipei', visible: false }, { x: 120, y: 180, width: 360, height: 300 });
    if (withDialog) {
        const close = new FixtureElement('button', { 'aria-label': 'Close' }, { x: 430, y: 190, width: 20, height: 20 });
        close.onclick = () => dialog.setVisible(false);
        dialog.appendChild(close);
    }
    document.appendChild(dialog);
    return root;
}

test.after(() => {
    Utils.pollUntil = originalPollUntil;
    Utils.safeSleep = originalSafeSleep;
    Utils.simClick = originalSimClick;
});

test('v280 three-no metadata uses the existing More → About DOM fallback', () => {
    assert.match(extract, /const findAboutMenuItem = \(\) =>/);
    assert.match(extract, /const findProfileMoreButton = \(\) =>/);
    assert.match(extract, /let aboutTrigger = findAboutMenuItem\(\)/);
    assert.match(extract, /moreTarget = findProfileMoreButton\(\)/);
    assert.match(extract, /Utils\.simClick\(moreTarget\)/);
    assert.match(extract, /Utils\.pollUntil\(findAboutMenuItem/);
    assert.match(extract, /about_dialog_missing/);
    assert.match(extract, /return initial;/);
});

test('v280 executable fallback opens More → About and parses visible dialog metadata', async () => {
    resetFixture();
    const root = buildProfileFixture({ withMore: true, withAbout: true, withDialog: true });
    const result = await Core.ThreeNoWatch.extractProfileMetadata(root, 'fixture');

    assert.ok(result.joinedAt > 0);
    assert.equal(result.locationLabel, 'Taipei');
    assert.equal(result.source, 'about_dialog');
    assert.equal(result.debug.aboutClicked, true);
    assert.equal(result.debug.moreButtonFound, true);
    assert.equal(result.debug.aboutDialogFound, true);
    assert.equal(window.location.href, 'https://www.threads.net/@fixture');
});

test('v280 executable fallback fails closed when exact More/About/dialog is missing', async () => {
    resetFixture();
    const noMoreRoot = buildProfileFixture({ withMore: false, withAbout: false, withDialog: false });
    const noMore = await Core.ThreeNoWatch.extractProfileMetadata(noMoreRoot, 'fixture');
    assert.equal(noMore.joinedAt, 0);
    assert.equal(noMore.locationLabel, '');
    assert.equal(noMore.debug.aboutClicked, false);
    assert.equal(window.location.href, 'https://www.threads.net/@fixture');

    resetFixture();
    const missingDialogRoot = buildProfileFixture({ withMore: true, withAbout: true, withDialog: false });
    const missingDialog = await Core.ThreeNoWatch.extractProfileMetadata(missingDialogRoot, 'fixture');
    assert.equal(missingDialog.joinedAt, 0);
    assert.equal(missingDialog.locationLabel, '');
    assert.equal(missingDialog.debug.aboutClicked, true);
    assert.equal(missingDialog.debug.aboutDialogFound, false);
    assert.equal(missingDialog.debug.aboutDialogText, '');
    assert.equal(window.location.href, 'https://www.threads.net/@fixture');
});

test('v280 three-no fallback has no bridge, navigation, or auto-block side path', () => {
    assert.doesNotMatch(extract, /installAboutProfilePassiveBridge|readProfileMetadataCache|waitForPassiveAboutMetadata|requestActiveAboutMetadata|buildMetadataFromCachedAbout/);
    assert.doesNotMatch(extract, /hege:threads-about-profile|window\.fetch\s*=|XMLHttpRequest\.prototype/);
    assert.doesNotMatch(extract, /window\.location\.(?:href|assign)\s*=/);
    assert.doesNotMatch(extract, /Core\.runSameTabWorker|window\.open|autoBlock/);
    assert.match(extract, /aboutClicked: false/);
});
