import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';
import { Core, RuntimeDiagnostics } from '../src/core.js';
import { DialogCollector } from '../src/dialog-collector.js';

const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const moduleServer = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    if (pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>beta62 reservoir fixture</title>');
        return;
    }
    const relative = pathname.replace(/^\/+/, '');
    if (!relative.endsWith('.js') || relative.includes('..')) {
        response.writeHead(404);
        response.end();
        return;
    }
    try {
        const source = await readFile(new URL(`file://${srcRoot}/${relative}`));
        response.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'access-control-allow-origin': '*',
        });
        response.end(source);
    } catch (_) {
        response.writeHead(404);
        response.end();
    }
});
await new Promise(resolve => moduleServer.listen(0, '127.0.0.1', resolve));
const moduleOrigin = `http://127.0.0.1:${moduleServer.address().port}`;
test.after(async () => {
    await browser.close();
    await new Promise(resolve => moduleServer.close(resolve));
});

async function collect(body) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 700px; height: 320px; overflow: auto; }
      a { display: inline-block; width: 120px; height: 24px; }
    </style><div id="dialog" role="dialog"><button id="likes">Likes</button>${body}</div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(() => {
        const ctx = document.querySelector('#dialog');
        const state = D.createState();
        D.collectVisible(ctx, state, {
            verifiedLikesContext: true,
            classificationStrategy: 'verified_likes_context',
            allowVerifiedLikesAnchorFallback: true,
            anchorContext: ctx,
            skipUsers: new Set(),
        });
        const snapshot = D.getLikesContextSnapshot(ctx, ['Likes']);
        return {
            diagnostics: state.anchorDiagnostics,
            snapshot: {
                candidateCount: snapshot.candidateCount,
                uniqueCandidateCount: snapshot.uniqueCandidateCount,
                rowCount: snapshot.rowCount,
            },
            users: D.usersFromState(state),
        };
    });
    await page.close();
    return result;
}

const emptyAggregate = {
    duplicateExactLinkCount: 0,
    excludedInvalidCount: 0,
    excludedInvisibleCount: 0,
    excludedOutOfBoundsCount: 0,
    excludedHeadingHeaderCount: 0,
    excludedNavigationCount: 0,
    excludedNestedDialogCount: 0,
    unclassifiedLinkCount: 0,
};

test('beta62 same-account exact links balance links/unique/duplicate/accepted aggregates', async () => {
    const result = await collect('<div id="rows"><a href="/@Same">one</a><a href="/@same">two</a></div>');
    assert.deepEqual(result.diagnostics, {
        exactLinkCount: 2,
        uniqueExactAccountCount: 1,
        acceptedUniqueAccountCount: 1,
        classifiedLinkCount: 2,
        ...emptyAggregate,
        duplicateExactLinkCount: 1,
    });
    assert.deepEqual(result.users, ['Same']);
});

test('beta62 unique filtered links expose each exclusion bucket and stay balanced', async () => {
    const result = await collect(`<div id="rows">
      <a href="/@keep">keep</a>
      <header><a href="/@heading">heading</a></header>
      <nav><a href="/@nav">nav</a></nav>
      <a style="display:none" href="/@invisible">invisible</a>
      <a style="position:fixed;left:2000px;top:0" href="/@out">out</a>
      <div role="dialog"><a href="/@nested">nested</a></div>
      <a href="/@invalid/path">invalid</a>
    </div>`);
    assert.deepEqual(result.diagnostics, {
        exactLinkCount: 7,
        uniqueExactAccountCount: 6,
        acceptedUniqueAccountCount: 1,
        classifiedLinkCount: 7,
        duplicateExactLinkCount: 0,
        excludedInvalidCount: 1,
        excludedInvisibleCount: 1,
        excludedOutOfBoundsCount: 1,
        excludedHeadingHeaderCount: 1,
        excludedNavigationCount: 1,
        excludedNestedDialogCount: 1,
        unclassifiedLinkCount: 0,
    });
    assert.deepEqual(result.users, ['keep']);
});

test('beta62 two normal unique accounts are accepted without exclusion counts', async () => {
    const result = await collect('<div id="rows"><a href="/@one">one</a><a href="/@two">two</a></div>');
    assert.equal(result.diagnostics.exactLinkCount, 2);
    assert.equal(result.diagnostics.uniqueExactAccountCount, 2);
    assert.equal(result.diagnostics.acceptedUniqueAccountCount, 2);
    assert.equal(result.diagnostics.classifiedLinkCount, 2);
    assert.equal(result.diagnostics.unclassifiedLinkCount, 0);
    assert.deepEqual(result.users, ['one', 'two']);
});

test('beta62 readiness snapshot separates exact link count from unique account count', async () => {
    const result = await collect('<div id="rows"><a href="/@Same">one</a><a href="/@same">two</a></div>');
    assert.equal(result.snapshot.candidateCount, 2);
    assert.equal(result.snapshot.uniqueCandidateCount, 1);
    assert.equal(result.snapshot.rowCount, 2);
});

test('beta62 aggregate diagnostics are sanitizer-allowlisted and privacy-safe', () => {
    const originalVersion = CONFIG.VERSION;
    CONFIG.VERSION = '2.7.4-beta63';
    RuntimeDiagnostics.clear();
    try {
        RuntimeDiagnostics.record('clean_list', 'anchor_filter', {
            exactLinkCount: 7,
            uniqueExactAccountCount: 7,
            duplicateExactLinkCount: 0,
            acceptedUniqueAccountCount: 1,
            excludedInvalidCount: 1,
            excludedInvisibleCount: 1,
            excludedOutOfBoundsCount: 1,
            excludedHeadingHeaderCount: 1,
            excludedNavigationCount: 1,
            excludedNestedDialogCount: 1,
            classifiedLinkCount: 7,
            unclassifiedLinkCount: 0,
            username: 'SECRET_USER', href: '/@SECRET_USER', url: 'https://threads.example/@SECRET_USER',
            path: '/@SECRET_USER/post/1', query: '?secret=1', text: 'secret text', DOM: '<a>secret</a>',
            class: 'secret-class', userAgent: 'secret-ua', ip: '127.0.0.1', hwid: 'secret-hwid',
            signature: 'secret-signature', rawMetadata: { secret: true },
        });
        const exported = RuntimeDiagnostics.export();
        const entry = exported.entries.find(item => item.feature === 'clean_list' && item.stage === 'anchor_filter');
        assert.ok(entry);
        assert.equal(entry.fields.exactLinkCount, 7);
        assert.equal(entry.fields.uniqueExactAccountCount, 7);
        assert.equal(entry.fields.acceptedUniqueAccountCount, 1);
        assert.equal(entry.fields.excludedHeadingHeaderCount, 1);
        assert.equal(entry.fields.unclassifiedLinkCount, 0);
        const serialized = JSON.stringify(exported);
        for (const forbidden of ['SECRET_USER', 'threads.example', 'secret text', 'secret-class', 'secret-ua', '127.0.0.1', 'secret-hwid', 'secret-signature', 'rawMetadata']) {
            assert.doesNotMatch(serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        }
    } finally {
        CONFIG.VERSION = originalVersion;
        RuntimeDiagnostics.clear();
    }
});

const settlementNode = () => ({
    style: {}, dataset: {}, parentNode: null,
    append(...children) { children.forEach(child => { child.parentNode = this; }); },
    appendChild(child) { child.parentNode = this; return child; },
    removeChild(child) { if (child) child.parentNode = null; },
    setAttribute() {},
});

test('beta62 Core clean_list emits anchor_filter and rows aggregate diagnostics', async () => {
    const originals = {
        findLikesTab: DialogCollector.findLikesTab,
        isSelectedTab: DialogCollector.isSelectedTab,
        hasCurrentLikesEvidence: DialogCollector.hasCurrentLikesEvidence,
        waitForLikesContextReady: DialogCollector.waitForLikesContextReady,
        findScrollableRoot: DialogCollector.findScrollableRoot,
        collectVisible: DialogCollector.collectVisible,
        buildSkipUsers: Core.buildSkipUsers,
        getSkipUserBreakdown: Core.getSkipUserBreakdown,
        window: globalThis.window,
        document: globalThis.document,
    };
    const body = settlementNode();
    const document = {
        body,
        createElement: () => settlementNode(),
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
    };
    const link = { getAttribute: name => name === 'href' ? '/@keep' : '' };
    const dialog = {
        innerText: 'Likes', textContent: 'Likes', scrollTop: 0, scrollHeight: 100, clientHeight: 100,
        querySelectorAll(selector) {
            if (selector === 'span[dir="auto"], h1, h2, [role="heading"]') return [{ innerText: 'Likes', textContent: 'Likes' }];
            if (selector.includes('a[href^="/@"]')) return [link];
            return [];
        },
        scrollBy() {}, scrollTo() {},
    };
    try {
        globalThis.document = document;
        globalThis.window = { __DEBUG_HEGE_LIKES_LIMIT: 1000, location: { pathname: '/@fixture/post/diagnostics' } };
        DialogCollector.findLikesTab = () => ({ tab: true });
        DialogCollector.isSelectedTab = () => true;
        DialogCollector.hasCurrentLikesEvidence = () => false;
        DialogCollector.waitForLikesContextReady = async ctx => ({
            ctx, snapshot: { rowCount: 1, candidateCount: 1, uniqueCandidateCount: 1 },
            verifiedLikesContext: true, classificationStrategy: 'verified_likes_context',
        });
        DialogCollector.findScrollableRoot = ctx => ctx;
        DialogCollector.collectVisible = (_ctx, state) => {
            state.classificationStrategy = 'verified_likes_context';
            state.verifiedLikesContext = true;
            state.entries.set('keep', { username: 'keep', liked: true, nonLiked: false, valid: true, unresolved: false, marker: false });
            state.observedUsernames.add('keep');
            state.visibleRows = 1;
            state.uniqueVisibleRows = 1;
            state.validAccountRows = 1;
            state.activityVisibleCount = 1;
            state.likeRows = 1;
            state.anchorDiagnostics = {
                exactLinkCount: 1, uniqueExactAccountCount: 1, duplicateExactLinkCount: 0,
                acceptedUniqueAccountCount: 1, excludedInvalidCount: 0, excludedInvisibleCount: 0,
                excludedOutOfBoundsCount: 0, excludedHeadingHeaderCount: 0, excludedNavigationCount: 0,
                excludedNestedDialogCount: 0, classifiedLinkCount: 1, unclassifiedLinkCount: 0,
            };
            state.batches += 1;
            return state;
        };
        Core.buildSkipUsers = () => new Set();
        Core.getSkipUserBreakdown = () => ({ selfSkippedCount: 0, ownerSkippedCount: 0, replySkippedCount: 0 });
        RuntimeDiagnostics.clear();
        const result = await Core.collectFullDialogUsers(dialog, { initialRenderDeadlineMs: 300, label: 'beta62 fixture' });
        assert.equal(result.complete, true);
        const entries = RuntimeDiagnostics.get().filter(entry => entry.feature === 'clean_list');
        const anchor = entries.find(entry => entry.stage === 'anchor_filter');
        assert.ok(anchor);
        assert.equal(anchor.fields.exactLinkCount, 1);
        assert.equal(anchor.fields.uniqueExactAccountCount, 1);
        assert.equal(anchor.fields.acceptedUniqueAccountCount, 1);
        const rows = entries.find(entry => entry.stage === 'rows' && entry.fields.rowCandidates === 1);
        assert.ok(rows);
        assert.equal(rows.fields.validAccountRows, 1);
        assert.equal(rows.fields.eligibleCount, 1);
        assert.equal(rows.fields.unclassifiedLinkCount, 0);
    } finally {
        Object.assign(DialogCollector, {
            findLikesTab: originals.findLikesTab,
            isSelectedTab: originals.isSelectedTab,
            hasCurrentLikesEvidence: originals.hasCurrentLikesEvidence,
            waitForLikesContextReady: originals.waitForLikesContextReady,
            findScrollableRoot: originals.findScrollableRoot,
            collectVisible: originals.collectVisible,
        });
        Core.buildSkipUsers = originals.buildSkipUsers;
        Core.getSkipUserBreakdown = originals.getSkipUserBreakdown;
        RuntimeDiagnostics.clear();
        if (originals.window === undefined) delete globalThis.window;
        else globalThis.window = originals.window;
        if (originals.document === undefined) delete globalThis.document;
        else globalThis.document = originals.document;
    }
});

test('beta62 production reservoir collectBatch exports balanced anchor_filter and rows aggregates', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/`);
    const output = await page.evaluate(async () => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        await import('/features/post-reservoir-engine.js');
        localStorage.clear();
        RuntimeDiagnostics.clear();
        Core.pendingUsers?.clear?.();
        document.body.innerHTML = `
          <div id="dialog" role="dialog" style="width:700px;height:320px;overflow:auto">
            <button id="likes" role="tab" aria-selected="true">Likes</button>
            <div id="rows">
              <a href="/@keep">keep</a><a href="/@keep">duplicate</a>
              <header><a href="/@heading">heading</a></header>
              <nav><a href="/@nav">nav</a></nav>
              <a style="display:none" href="/@invisible">invisible</a>
              <a href="/@invalid/path">invalid</a>
            </div>
          </div>`;
        const result = await Core.SweepDriver.collectBatch(document.querySelector('#dialog'));
        const exported = RuntimeDiagnostics.export();
        return {
            result,
            entries: exported.entries
                .filter(entry => entry.feature === 'reservoir' && ['anchor_filter', 'rows'].includes(entry.stage))
                .map(entry => ({ stage: entry.stage, fields: entry.fields })),
            serialized: JSON.stringify(exported),
        };
    });
    await page.close();

    const anchor = output.entries.find(entry => entry.stage === 'anchor_filter');
    const rows = output.entries.find(entry => entry.stage === 'rows');
    assert.ok(anchor, 'production reservoir anchor_filter diagnostic missing');
    assert.ok(rows, 'production reservoir rows diagnostic missing');
    for (const fields of [anchor.fields, rows.fields]) {
        assert.equal(fields.exactLinkCount, 6);
        assert.equal(fields.uniqueExactAccountCount, 4);
        assert.equal(fields.duplicateExactLinkCount, 1);
        assert.equal(fields.acceptedUniqueAccountCount, 1);
        assert.equal(fields.excludedInvalidCount, 1);
        assert.equal(fields.excludedInvisibleCount, 1);
        assert.equal(fields.excludedHeadingHeaderCount, 1);
        assert.equal(fields.excludedNavigationCount, 1);
        assert.equal(fields.classifiedLinkCount, 6);
        assert.equal(fields.unclassifiedLinkCount, 0);
    }
    assert.deepEqual(output.result.users, ['keep']);
    for (const forbidden of ['/@keep', 'keep', 'https://', 'outerHTML']) {
        assert.doesNotMatch(output.serialized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
});

console.log('beta62 anchor diagnostics contract: balanced link/account aggregates, filter reasons, readiness uniqueness, privacy-safe export');
