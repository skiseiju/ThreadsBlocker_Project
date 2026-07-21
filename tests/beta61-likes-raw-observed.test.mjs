import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { Core, RuntimeDiagnostics } from '../src/core.js';
import { DialogCollector } from '../src/dialog-collector.js';
import { Utils } from '../src/utils.js';

const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
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

test('beta61 verified Likes keeps raw observed skip-only anchors before downstream filtering', async () => {
    const page = await fixture('<div id="rows"><a href="/@Owner">Owner</a><a href="/@owner">duplicate</a></div>');
    const result = await page.evaluate(options => {
        const ctx = document.querySelector('#dialog');
        const state = D.createState();
        const skip = new Set(['owner']);
        D.collectVisible(ctx, state, { ...options, anchorContext: ctx, skipUsers: skip });
        return {
            visibleRows: state.visibleRows,
            validAccountRows: state.validAccountRows,
            unknownRows: state.unknownRows,
            observedUsers: D.usersFromState(state),
            eligibleUsers: D.usersFromState(state, skip),
        };
    }, verifiedFallback);
    assert.deepEqual(result, {
        visibleRows: 1,
        validAccountRows: 1,
        unknownRows: 0,
        observedUsers: ['Owner'],
        eligibleUsers: [],
    });
    await page.close();
});

test('beta61 verified Likes collects non-skip exact anchors with normalized dedupe', async () => {
    const page = await fixture('<div id="rows"><a href="/@Keep">Keep</a><a href="/@keep">duplicate</a><a href="/@other">Other</a></div>');
    const result = await page.evaluate(options => {
        const ctx = document.querySelector('#dialog');
        const state = D.createState();
        D.collectVisible(ctx, state, { ...options, anchorContext: ctx, skipUsers: new Set() });
        return { users: D.usersFromState(state), visibleRows: state.visibleRows, validAccountRows: state.validAccountRows, unknownRows: state.unknownRows };
    }, verifiedFallback);
    assert.deepEqual(result, { users: ['Keep', 'other'], visibleRows: 2, validAccountRows: 2, unknownRows: 0 });
    await page.close();
});

test('beta61 unverified, Quotes and failed switch paths remain fail-closed', async () => {
    const page = await fixture('<div role="tab" aria-selected="true">Quotes</div><div id="rows"><a href="/@quoted">quoted</a></div>');
    const result = await page.evaluate(async () => {
        const ctx = document.querySelector('#dialog');
        const unverified = D.createState();
        D.collectVisible(ctx, unverified, {
            verifiedLikesContext: false, classificationStrategy: 'unknown',
            allowVerifiedLikesAnchorFallback: true, anchorContext: ctx,
        });
        const failedReadiness = await D.waitForLikesContextReady(ctx, {
            likesTexts: ['Likes'], getLiveContext: () => ctx,
            requireChange: true, maxAttempts: 2, waitMs: 20,
        });
        const failed = D.createState();
        D.collectVisible(ctx, failed, {
            verifiedLikesContext: failedReadiness?.verifiedLikesContext === true,
            classificationStrategy: failedReadiness?.classificationStrategy || 'unknown',
            allowVerifiedLikesAnchorFallback: failedReadiness?.verifiedLikesContext === true,
            anchorContext: failedReadiness?.ctx || ctx,
        });
        return {
            unverifiedUsers: D.usersFromState(unverified),
            unverifiedUnknownRows: unverified.unknownRows,
            failedReady: !!failedReadiness,
            failedUsers: D.usersFromState(failed),
            failedUnknownRows: failed.unknownRows,
        };
    });
    assert.deepEqual(result, {
        unverifiedUsers: [], unverifiedUnknownRows: 1,
        failedReady: false, failedUsers: [], failedUnknownRows: 1,
    });
    await page.close();
});

const makeSettlementNode = () => ({
    style: {},
    dataset: {},
    parentNode: null,
    append(...children) { children.forEach(child => { child.parentNode = this; }); },
    appendChild(child) { child.parentNode = this; return child; },
    removeChild(child) { if (child) child.parentNode = null; },
    setAttribute() {},
});

const makeSettlementDocument = () => {
    const body = makeSettlementNode();
    return {
        body,
        createElement: () => makeSettlementNode(),
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
    };
};

const makeSettlementDialog = ({ observedUsers }) => {
    const links = observedUsers.map(username => ({
        getAttribute: name => name === 'href' ? `/@${username}` : '',
    }));
    const dialog = {
        innerText: 'Likes',
        textContent: 'Likes',
        scrollTop: 0,
        scrollHeight: 100,
        clientHeight: 100,
        querySelectorAll(selector) {
            if (selector === 'span[dir="auto"], h1, h2, [role="heading"]') {
                return [{ innerText: 'Likes', textContent: 'Likes' }];
            }
            if (selector.includes('a[href^="/@"]')) return links;
            return [];
        },
        getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 100, width: 100, height: 100 }),
        scrollBy() {},
        scrollTo() {},
    };
    return dialog;
};

test('beta61 Core settlement executes raw observed skip-only and true zero-row outcomes', async () => {
    const originals = {
        findLikesTab: DialogCollector.findLikesTab,
        isSelectedTab: DialogCollector.isSelectedTab,
        hasCurrentLikesEvidence: DialogCollector.hasCurrentLikesEvidence,
        waitForLikesContextReady: DialogCollector.waitForLikesContextReady,
        findScrollableRoot: DialogCollector.findScrollableRoot,
        collectVisible: DialogCollector.collectVisible,
        buildSkipUsers: Core.buildSkipUsers,
        getSkipUserBreakdown: Core.getSkipUserBreakdown,
        safeSleep: Utils.safeSleep,
        window: globalThis.window,
        document: globalThis.document,
    };
    const runSettlement = async (observedUsers) => {
        const dialog = makeSettlementDialog({ observedUsers });
        const document = makeSettlementDocument();
        globalThis.document = document;
        globalThis.window = {
            __DEBUG_HEGE_LIKES_LIMIT: 1000,
            location: { pathname: '/@fixture/post/settlement' },
        };
        DialogCollector.findLikesTab = () => ({ tab: true });
        DialogCollector.isSelectedTab = () => true;
        DialogCollector.hasCurrentLikesEvidence = () => false;
        DialogCollector.waitForLikesContextReady = async ctx => ({
            ctx,
            snapshot: { rowCount: observedUsers.length },
            verifiedLikesContext: true,
            classificationStrategy: 'verified_likes_context',
        });
        DialogCollector.findScrollableRoot = ctx => ctx;
        DialogCollector.collectVisible = (_ctx, state) => {
            state.verifiedLikesContext = true;
            state.classificationStrategy = 'verified_likes_context';
            for (const username of observedUsers) {
                const normalized = username.toLowerCase();
                state.entries.set(normalized, {
                    username, liked: true, nonLiked: false, valid: true,
                    unresolved: false, marker: false,
                });
                state.observedUsernames.add(normalized);
            }
            state.visibleRows = state.observedUsernames.size;
            state.uniqueVisibleRows = state.visibleRows;
            state.validAccountRows = state.entries.size;
            state.activityVisibleCount = state.validAccountRows;
            state.likeRows = state.validAccountRows;
            state.unknownRows = 0;
            state.uniqueUnknownRows = 0;
            state.batches += 1;
            return state;
        };
        Core.buildSkipUsers = () => new Set(['owner']);
        Core.getSkipUserBreakdown = (_ctx, usernames) => ({
            selfSkippedCount: 0,
            ownerSkippedCount: usernames.some(value => String(value).toLowerCase() === 'owner') ? 1 : 0,
            replySkippedCount: 0,
        });
        RuntimeDiagnostics.clear();
        return Core.collectFullDialogUsers(dialog, { initialRenderDeadlineMs: 300, label: 'beta61 fixture' });
    };
    try {
        const skipOnly = await runSettlement(['Owner']);
        assert.equal(skipOnly.complete, true);
        assert.equal(skipOnly.ok, true);
        assert.equal(skipOnly.reason, 'end');
        assert.notEqual(skipOnly.reason, 'rows_missing');
        assert.deepEqual(skipOnly.users, []);
        assert.equal(skipOnly.counts.visibleRows, 1);
        assert.equal(skipOnly.counts.validAccountRows, 1);
        assert.equal(skipOnly.counts.ownerSkippedCount, 1);
        const skipOnlyRows = RuntimeDiagnostics.get().filter(entry => entry.feature === 'clean_list' && entry.stage === 'rows');
        assert.ok(skipOnlyRows.some(entry => entry.fields.rowCandidates === 1
            && entry.fields.validAccountRows === 1
            && entry.fields.eligibleCount === 0));
        assert.ok(skipOnlyRows.some(entry => entry.fields.ownerSkippedCount === 1));

        const noObservedRows = await runSettlement([]);
        assert.equal(noObservedRows.complete, false);
        assert.equal(noObservedRows.ok, false);
        assert.equal(noObservedRows.reason, 'rows_missing');
        assert.deepEqual(noObservedRows.users, []);
        assert.equal(noObservedRows.counts.visibleRows, 0);
        const emptyRows = RuntimeDiagnostics.get().filter(entry => entry.feature === 'clean_list' && entry.stage === 'rows');
        assert.ok(emptyRows.some(entry => entry.fields.rowCandidates === 0 && entry.fields.eligibleCount === 0));
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
        Utils.safeSleep = originals.safeSleep;
        RuntimeDiagnostics.clear();
        if (originals.window === undefined) delete globalThis.window;
        else globalThis.window = originals.window;
        if (originals.document === undefined) delete globalThis.document;
        else globalThis.document = originals.document;
    }
});

console.log('beta61 Likes raw-observed contract: skip-only anchors remain observed, downstream filtering stays separate');
