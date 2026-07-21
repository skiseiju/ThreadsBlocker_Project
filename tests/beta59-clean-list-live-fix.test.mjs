import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { CONFIG } from '../src/config.js';
import { RuntimeDiagnostics } from '../src/core.js';

const utilsSource = await readFile(new URL('../src/utils.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const reservoirSource = await readFile(new URL('../src/features/post-reservoir-engine.js', import.meta.url), 'utf8');
const configSource = await readFile(new URL('../src/config.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

async function utilsFixture(body) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><body>${body}</body>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^import[^\n]+\n/gm, '').replace(/^export const /gm, 'const ') + '\nreturn Utils;';
        window.U = Function(bundled)();
    }, utilsSource);
    return page;
}

test('beta59 self detection ignores dialog-only liker and preserves trusted nav profile', async () => {
    const dialogOnly = await utilsFixture('<main><div role="dialog"><a href="/@liker">liker</a></div></main>');
    assert.equal(await dialogOnly.evaluate(() => U.getMyUsername()), null);
    await dialogOnly.close();

    const navAfterDialog = await utilsFixture('<main><div role="dialog"><a href="/@liker">liker</a></div></main><nav role="navigation"><a href="/@owner"><svg></svg></a></nav>');
    assert.equal(await navAfterDialog.evaluate(() => U.getMyUsername()), 'owner');
    await navAfterDialog.close();

    const navBeforeDialog = await utilsFixture('<nav role="navigation"><a href="/@owner"><svg></svg></a></nav><main><div role="dialog"><a href="/@liker">liker</a></div></main>');
    assert.equal(await navBeforeDialog.evaluate(() => U.getMyUsername()), 'owner');
    await navBeforeDialog.close();

    const navListWrapper = await utilsFixture('<nav role="navigation"><div role="list"><a href="/@owner"><svg></svg></a></div></nav><main><div role="dialog"><a href="/@liker">liker</a></div></main>');
    assert.equal(await navListWrapper.evaluate(() => U.getMyUsername()), 'owner');
    await navListWrapper.close();

    const targetHeader = await utilsFixture('<header><a href="/@target">target</a></header><div role="dialog"><a href="/@liker">liker</a></div>');
    assert.equal(await targetHeader.evaluate(() => U.getMyUsername()), null);
    await targetHeader.close();

    const dialogNestedNav = await utilsFixture('<div role="dialog"><nav role="navigation"><a href="/@fake"><svg></svg></a></nav><a href="/@liker">liker</a></div>');
    assert.equal(await dialogNestedNav.evaluate(() => U.getMyUsername()), null);
    await dialogNestedNav.close();
});

test('beta59 clean-list and reservoir use the shared ranked scroll-root helper', () => {
    assert.match(coreSource, /DialogCollector\.findScrollableRoot\(ctx\)/);
    assert.match(reservoirSource, /DialogCollector\.findScrollableRoot\(ctx\)/);
    assert.match(collectorSource, /direct account-row links|account links/);
});

test('beta59 ranked helper ignores first nested decoy overflow and selects account list', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 700px; height: 320px; overflow: hidden; }
      #decoy { width: 680px; height: 40px; overflow-y: auto; }
      #list { width: 680px; height: 180px; overflow-y: auto; }
      .row { height: 60px; } a { display: inline-block; width: 120px; height: 24px; }
    </style><div id="dialog" role="dialog"><div id="decoy"><a href="/@decoy">decoy</a><div style="height:200px"></div></div><div id="list">${Array.from({ length: 4 }, (_, i) => `<div class="row"><a href="/@row${i}">row${i}</a></div>`).join('')}</div></div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(() => {
        const root = window.D.findScrollableRoot(document.querySelector('#dialog'));
        const state = window.D.createState();
        const opts = { verifiedLikesContext: true, classificationStrategy: 'verified_likes_context' };
        window.D.collectVisible(root, state, opts);
        const before = window.D.usersFromState(state);
        root.scrollBy({ top: 120, behavior: 'auto' });
        window.D.collectVisible(root, state, opts);
        return { rootId: root?.id, before, after: window.D.usersFromState(state), scrollTop: root?.scrollTop || 0 };
    });
    assert.equal(result.rootId, 'list');
    assert.deepEqual(result.before, ['row0', 'row1', 'row2']);
    assert.deepEqual(result.after, ['row0', 'row1', 'row2', 'row3']);
    assert.ok(result.scrollTop > 0);
    await page.close();
});

test('beta59 outer overflowing dialog cannot beat inner account list by descendant link count', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 420px; height: 320px; overflow-y: auto; }
      #decoy { width: 390px; height: 40px; overflow-y: auto; }
      #list { width: 390px; height: 180px; overflow-y: auto; }
      .row { height: 60px; } a { display: inline-block; width: 120px; height: 24px; }
      #tail { height: 100px; }
    </style><div id="dialog" role="dialog"><header><a href="/@header"><svg></svg></a></header><div id="decoy"><a href="/@decoy">decoy</a><div style="height:200px"></div></div><div id="list">${Array.from({ length: 4 }, (_, i) => `<div class="row"><a href="/@row${i}">row${i}</a></div>`).join('')}</div><div id="tail"></div></div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(() => {
        const root = window.D.findScrollableRoot(document.querySelector('#dialog'));
        const state = window.D.createState();
        const opts = { verifiedLikesContext: true, classificationStrategy: 'verified_likes_context' };
        window.D.collectVisible(root, state, opts);
        const before = window.D.usersFromState(state);
        root.scrollBy({ top: 120, behavior: 'auto' });
        window.D.collectVisible(root, state, opts);
        return { rootId: root?.id, before, after: window.D.usersFromState(state), scrollTop: root?.scrollTop || 0 };
    });
    assert.equal(result.rootId, 'list');
    assert.deepEqual(result.before, ['row0', 'row1', 'row2']);
    assert.deepEqual(result.after, ['row0', 'row1', 'row2', 'row3']);
    assert.ok(result.scrollTop > 0);
    await page.close();
});

test('beta59 raw decoy links do not outrank four verified account rows', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 420px; height: 320px; overflow: hidden; }
      #decoy { width: 390px; height: 60px; overflow-y: auto; }
      #list { width: 390px; height: 180px; overflow-y: auto; }
      .row { height: 60px; } a { display: inline-block; width: 120px; height: 24px; }
    </style><div id="dialog" role="dialog"><div id="decoy">${Array.from({ length: 5 }, (_, i) => `<a href="/@raw${i}">raw${i}</a>`).join('')}<div style="height:240px"></div></div><div id="list">${Array.from({ length: 4 }, (_, i) => `<div class="row" role="listitem"><a href="/@valid${i}">valid${i}</a><button aria-label="Follow">Follow</button></div>`).join('')}</div></div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(() => {
        const ctx = document.querySelector('#dialog');
        const opts = { verifiedLikesContext: true, classificationStrategy: 'verified_likes_context' };
        const root = window.D.findScrollableRoot(ctx, opts);
        const state = window.D.createState();
        window.D.collectVisible(root, state, opts);
        const before = window.D.usersFromState(state);
        root.scrollBy({ top: 120, behavior: 'auto' });
        window.D.collectVisible(root, state, opts);
        return { rootId: root?.id, before, after: window.D.usersFromState(state), scrollTop: root?.scrollTop || 0 };
    });
    assert.equal(result.rootId, 'list');
    assert.deepEqual(result.before, ['valid0', 'valid1', 'valid2']);
    assert.deepEqual(result.after, ['valid0', 'valid1', 'valid2', 'valid3']);
    assert.ok(result.scrollTop > 0);
    await page.close();
});

test('beta59 helper tokens are forwarded for verified Likes while follower path stays token-free', () => {
    assert.match(coreSource, /findScrollableRoot\(ctx,\s*\{\s*verifiedLikesContext,\s*classificationStrategy\s*\}\)/);
    assert.match(reservoirSource, /findScrollableRoot\(ctx,\s*\{\s*verifiedLikesContext,\s*classificationStrategy\s*\}\)/);
    assert.match(coreSource, /findScrollableRoot\(ctx\)/);
});

test('beta59 unverified class-only rows remain unresolved', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent('<style>#dialog{width:400px;height:200px;overflow:auto}.row{height:50px}a{display:inline-block;width:120px;height:24px}</style><div id="dialog" role="dialog"><div class="row"><a href="/@quoted">quoted</a></div></div>');
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(() => {
        const state = window.D.createState();
        window.D.collectVisible(document.querySelector('#dialog'), state, { verifiedLikesContext: false, classificationStrategy: 'unknown' });
        return { users: window.D.usersFromState(state), unknownRows: state.unknownRows };
    });
    assert.deepEqual(result, { users: [], unknownRows: 1 });
    await page.close();
});

test('beta59 diagnostics expose privacy-safe skip breakdown and scroll progress', () => {
    for (const key of ['selfSkippedCount', 'ownerSkippedCount', 'replySkippedCount']) {
        assert.match(coreSource, new RegExp(key));
    }
    for (const key of ['scrollAttempt', 'scrollTop', 'clientHeight', 'scrollHeight', 'atBottom', 'progress']) {
        assert.match(coreSource, new RegExp(key));
    }
    assert.match(coreSource, /beforeScrollTop|afterScrollTop/);
    assert.match(configSource, /2\.7\.4-beta(?:6[3456789]|7[0-6])/);
});

test('beta59 runtime sanitizer keeps new aggregate fields and drops sensitive values', () => {
    const previousVersion = CONFIG.VERSION;
    const previousEnabled = CONFIG.ENABLE_BETA_DIAGNOSTICS;
    CONFIG.VERSION = '2.7.4-beta63';
    CONFIG.ENABLE_BETA_DIAGNOSTICS = true;
    RuntimeDiagnostics.clear();
    RuntimeDiagnostics.record('clean_list', 'scroll', {
        selfSkippedCount: 1, ownerSkippedCount: 1, replySkippedCount: 0,
        scrollAttempt: 2, beforeScrollTop: 10, afterScrollTop: 40,
        beforeScrollHeight: 900, afterScrollHeight: 1200, atBottom: false,
        progress: true, rootAdvanced: true, strategy: 'scroll_ancestor',
        username: 'SECRET', href: 'https://threads.invalid/@SECRET', text: 'private', className: 'secret',
    });
    const serialized = JSON.stringify(RuntimeDiagnostics.export());
    assert.match(serialized, /selfSkippedCount|ownerSkippedCount|scrollAttempt|scroll_ancestor/);
    assert.doesNotMatch(serialized, /SECRET|threads\.invalid|private|className|href|username/);
    CONFIG.VERSION = '2.7.4';
    assert.equal(RuntimeDiagnostics.record('clean_list', 'scroll', { selfSkippedCount: 2 }), null);
    assert.deepEqual(RuntimeDiagnostics.get(), []);
    CONFIG.VERSION = previousVersion;
    CONFIG.ENABLE_BETA_DIAGNOSTICS = previousEnabled;
    RuntimeDiagnostics.clear();
});

test('beta59 skip consumers compare normalized usernames case-insensitively', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent('<style>#dialog{width:400px;height:200px;overflow:auto}.row{height:40px}a{display:inline-block;width:120px;height:24px}</style><div id="dialog"><div class="row"><a href="/@OWNER">OWNER</a><button aria-label="Follow">Follow</button></div></div>');
    const functionBody = coreSource.match(/collectVisibleDialogUsers: \(ctx\) => \{([\s\S]*?)\n    \},\n\n    collectFullDialogUsers/)?.[1];
    assert.ok(functionBody, 'collectVisibleDialogUsers body must be extractable');
    const result = await page.evaluate(({ body }) => {
        const C = { buildSkipUsers: () => new Set(['owner']) };
        const collect = Function('Core', `return (ctx) => {${body}}`)(C);
        return collect(document.querySelector('#dialog'));
    }, { body: functionBody });
    assert.deepEqual(result, []);
    await page.close();

    const followerPage = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await followerPage.setContent('<style>#dialog{width:400px;height:200px;overflow:auto}.row{height:40px}a{display:inline-block;width:120px;height:24px}</style><div id="dialog"><div class="row" role="listitem"><a href="/@OWNER">OWNER</a><button aria-label="Follow">Follow</button></div></div>');
    await followerPage.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const followerResult = await followerPage.evaluate(() => {
        const state = window.D.createFollowerState();
        return window.D.collectFollowerRows(document.querySelector('#dialog'), state, { skipUsers: new Set(['owner']), maxLimit: 20 });
    });
    assert.deepEqual(followerResult.users, []);
    assert.equal(followerResult.breakdown.blocked, 1);
    await followerPage.close();
});

console.log('beta59 clean-list live-fix contract: red fixtures for self, shared root, skip breakdown, scroll telemetry');
