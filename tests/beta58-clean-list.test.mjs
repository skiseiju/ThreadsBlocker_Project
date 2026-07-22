import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../src/config.js';
import { RuntimeDiagnostics } from '../src/core.js';

const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const reservoirSource = await readFile(new URL('../src/features/post-reservoir-engine.js', import.meta.url), 'utf8');
const configSource = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

async function fixture(body) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 700px; height: 320px; overflow: auto; }
      .row, [role="listitem"] { width: 600px; height: 34px; }
      a { display: inline-block; width: 120px; height: 24px; }
    </style><div id="dialog" role="dialog"><button id="likes">Likes</button>${body}</div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    return page;
}

const verified = { verifiedLikesContext: true, classificationStrategy: 'verified_likes_context' };

test('beta58 verified Likes context accepts pure profile rows without heart marker', async () => {
    const page = await fixture('<div class="row"><a href="/@plain">plain</a></div>');
    const result = await page.evaluate(opts => {
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state, opts);
        return { users: D.usersFromState(state), visibleRows: state.visibleRows, validAccountRows: state.validAccountRows, unknownRows: state.unknownRows };
    }, verified);
    assert.deepEqual(result, { users: ['plain'], visibleRows: 1, validAccountRows: 1, unknownRows: 0 });
    await page.close();
});

test('beta58 unverified context remains marker-only and quotes/reposts do not fall back', async () => {
    const page = await fixture('<div role="listitem"><a href="/@plain">plain</a></div><div role="listitem"><a href="/@liked">liked</a><span data-hege-like="true"></span></div>');
    const result = await page.evaluate(() => {
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return { users: D.usersFromState(state), unknownRows: state.unknownRows };
    });
    assert.deepEqual(result, { users: ['liked'], unknownRows: 0 });
    await page.close();
});

test('beta58 shared ancestor and profile header are never account rows', async () => {
    const page = await fixture('<div class="profile-header"><a href="/@header">header</a><button>Follow</button></div><div class="shared"><a href="/@shared">shared</a></div>');
    const result = await page.evaluate(opts => {
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state, opts);
        return { users: D.usersFromState(state), visibleRows: state.visibleRows, validAccountRows: state.validAccountRows, unknownRows: state.unknownRows };
    }, verified);
    assert.deepEqual(result, { users: [], visibleRows: 2, validAccountRows: 0, unknownRows: 2 });
    await page.close();
});

test('beta58 repeated username does not inflate and unknown-to-valid supersedes unresolved evidence', async () => {
    const page = await fixture('<div id="rows"><div class="shared"><a href="/@same">same</a></div></div>');
    const result = await page.evaluate(opts => {
        const ctx = document.querySelector('#dialog');
        const state = D.createState();
        D.collectVisible(ctx, state, opts);
        D.collectVisible(ctx, state, opts);
        document.querySelector('#rows').innerHTML = '<div class="row"><a href="/@same">same</a></div>';
        D.collectVisible(ctx, state, opts);
        return { users: D.usersFromState(state), visibleRows: state.visibleRows, validAccountRows: state.validAccountRows, unknownRows: state.unknownRows, uniqueVisibleRows: state.uniqueVisibleRows };
    }, verified);
    assert.deepEqual(result, { users: ['same'], visibleRows: 1, validAccountRows: 1, unknownRows: 0, uniqueVisibleRows: 1 });
    await page.close();
});

test('beta58 unresolved unique row remains unknown and cannot commit', async () => {
    const page = await fixture('<div class="shared"><a href="/@unresolved">unresolved</a></div>');
    const result = await page.evaluate(opts => {
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state, opts);
        return { users: D.usersFromState(state), unknownRows: state.unknownRows, complete: state.unknownRows === 0 };
    }, verified);
    assert.deepEqual(result, { users: [], unknownRows: 1, complete: false });
    await page.close();
});

test('beta58 verified contract is shared by clean-list and post-reservoir and diagnostics are privacy-safe', () => {
    assert.match(coreSource, /classificationStrategy/);
    assert.match(coreSource, /verified_likes_context/);
    assert.match(coreSource, /validAccountRows/);
    assert.match(reservoirSource, /classificationStrategy/);
    assert.match(reservoirSource, /verified_likes_context/);
    assert.match(reservoirSource, /typedState\.unknownRows/);
    assert.match(coreSource, /uniqueVisibleRows|uniqueUnknownRows/);
    assert.match(coreSource, /BETA_DIAGNOSTIC_STRATEGIES/);
    const versionMatch = /^2\.7\.4-beta(\d+)$/.exec(String(CONFIG.VERSION));
    assert.ok(versionMatch, `CONFIG.VERSION must be a 2.7.4 beta version, got ${CONFIG.VERSION}`);
    assert.ok(Number(versionMatch[1]) >= 63, `CONFIG.VERSION beta number must be >= 63, got ${CONFIG.VERSION}`);
    assert.doesNotMatch(coreSource, /record\('clean_list',[\s\S]{0,300}(?:username|href|outerHTML|innerText)/i);
    const previous = { version: CONFIG.VERSION, enabled: CONFIG.ENABLE_BETA_DIAGNOSTICS };
    CONFIG.VERSION = '2.7.4-beta63';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics.record('clean_list', 'rows', {
        classificationStrategy: 'verified_likes_context', uniqueVisibleRows: 3, uniqueUnknownRows: 1,
        uniqueEligibleCount: 2, validAccountRows: 2, username: 'SECRET', href: 'https://secret', className: 'secret', textContent: 'secret',
    });
    const exported = JSON.stringify(RuntimeDiagnostics.export());
    assert.match(exported, /verified_likes_context/);
    assert.doesNotMatch(exported, /SECRET|secret|username|href|className|textContent/);
    RuntimeDiagnostics.clear();
    CONFIG.VERSION = previous.version;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = previous.enabled;
});

console.log('beta58 clean-list contract: verified context / unique evidence / privacy gate');
