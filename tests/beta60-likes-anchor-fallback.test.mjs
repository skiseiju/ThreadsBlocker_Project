import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const reservoirSource = await readFile(new URL('../src/features/post-reservoir-engine.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

async function fixture(body) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 700px; height: 320px; overflow: auto; }
      #rows { min-height: 700px; }
      a { display: inline-block; width: 120px; height: 24px; }
    </style><div id="dialog" role="dialog"><button id="likes">Likes</button>${body}</div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    return page;
}

const verifiedFallback = {
    verifiedLikesContext: true,
    classificationStrategy: 'verified_likes_context',
    allowVerifiedLikesAnchorFallback: true,
};

test('beta60 verified Likes readiness recovers 23-to-2 exact anchors without synthetic row markers', async () => {
    const page = await fixture(`<div id="rows">${Array.from({ length: 23 }, (_, i) => `<a href="/@old${i}">old${i}</a>`).join('')}</div>`);
    const result = await page.evaluate(async options => {
        const dialog = document.querySelector('#dialog');
        document.querySelector('#likes').addEventListener('click', () => {
            document.querySelector('#rows').innerHTML = '<a href="/@new0">new0</a><a href="/@new1">new1</a>';
        });
        const readinessPromise = D.waitForLikesContextReady(dialog, {
            likesTexts: ['Likes'], getLiveContext: () => dialog,
            requireChange: true, maxAttempts: 4, waitMs: 20,
        });
        document.querySelector('#likes').click();
        const readiness = await readinessPromise;
        const state = D.createState();
        D.collectVisible(dialog, state, { ...options, anchorContext: readiness?.ctx, skipUsers: new Set() });
        return {
            ready: !!readiness?.verifiedLikesContext,
            users: D.usersFromState(state),
            visibleRows: state.visibleRows,
            validAccountRows: state.validAccountRows,
            unknownRows: state.unknownRows,
        };
    }, verifiedFallback);
    assert.deepEqual(result, {
        ready: true, users: ['new0', 'new1'], visibleRows: 2, validAccountRows: 2, unknownRows: 0,
    });
    await page.close();
});

test('beta60 exact-anchor fallback observes raw anchors before downstream owner/self/reply exclusion', async () => {
    const page = await fixture('<div id="rows">\
      <a href="/@owner">owner</a><a href="/@self">self</a><a href="/@reply">reply</a>\
      <a href="/@Keep">keep</a><a href="/@keep">keep duplicate</a>\
      <span>Replying to @reply</span></div>');
    const result = await page.evaluate(options => {
        const ctx = document.querySelector('#dialog');
        const state = D.createState();
        D.collectVisible(ctx, state, {
            ...options,
            anchorContext: ctx,
            skipUsers: new Set(['owner', 'self', 'reply']),
        });
        const skip = new Set(['owner', 'self', 'reply']);
        return {
            observedUsers: D.usersFromState(state),
            users: D.usersFromState(state, skip),
            unknownRows: state.unknownRows,
            visibleRows: state.visibleRows,
            validAccountRows: state.validAccountRows,
        };
    }, verifiedFallback);
    assert.deepEqual(result, {
        observedUsers: ['owner', 'self', 'reply', 'Keep'],
        users: ['Keep'],
        unknownRows: 0,
        visibleRows: 4,
        validAccountRows: 4,
    });
    await page.close();
});

test('beta60 Quotes and unverified contexts never enable exact-anchor fallback', async () => {
    const page = await fixture('<div role="tab" aria-selected="true">Quotes</div><div id="rows"><a href="/@quoted">quoted</a></div>');
    const result = await page.evaluate(() => {
        const ctx = document.querySelector('#dialog');
        const state = D.createState();
        D.collectVisible(ctx, state, {
            verifiedLikesContext: false,
            classificationStrategy: 'unknown',
            allowVerifiedLikesAnchorFallback: true,
            anchorContext: ctx,
        });
        return { users: D.usersFromState(state), unknownRows: state.unknownRows };
    });
    assert.deepEqual(result, { users: [], unknownRows: 1 });
    await page.close();
});

test('beta60 failed Likes switch does not enable exact-anchor fallback', async () => {
    const page = await fixture('<div id="rows"><a href="/@notReady">notReady</a></div>');
    const result = await page.evaluate(async () => {
        const ctx = document.querySelector('#dialog');
        const readiness = await D.waitForLikesContextReady(ctx, {
            likesTexts: ['Likes'], getLiveContext: () => ctx,
            requireChange: true, maxAttempts: 2, waitMs: 20,
        });
        const state = D.createState();
        D.collectVisible(ctx, state, {
            verifiedLikesContext: readiness?.verifiedLikesContext === true,
            classificationStrategy: readiness?.classificationStrategy || 'unknown',
            allowVerifiedLikesAnchorFallback: readiness?.verifiedLikesContext === true,
            anchorContext: readiness?.ctx || ctx,
        });
        return { ready: !!readiness, users: D.usersFromState(state), unknownRows: state.unknownRows };
    });
    assert.deepEqual(result, { ready: false, users: [], unknownRows: 1 });
    await page.close();
});

test('beta60 clean-list and reservoir share the readiness-gated exact-anchor fallback', () => {
    assert.match(collectorSource, /collectVerifiedLikesAnchors/);
    assert.match(coreSource, /allowVerifiedLikesAnchorFallback/);
    assert.match(coreSource, /anchorContext/);
    assert.match(reservoirSource, /allowVerifiedLikesAnchorFallback/);
    assert.match(reservoirSource, /anchorContext/);
    assert.match(coreSource, /waitForLikesContextReady/);
    assert.match(reservoirSource, /waitForLikesContextReady/);
});

console.log('beta60 Likes anchor fallback contract: readiness-gated 23-to-2 recovery, exclusions, no Quotes widening');
