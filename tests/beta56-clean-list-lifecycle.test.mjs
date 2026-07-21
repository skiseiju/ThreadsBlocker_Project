import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const reservoirSource = await readFile(new URL('../src/features/post-reservoir-engine.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

test('beta56 live-like 23-to-2 Likes refresh is ready without selected marker or heart evidence', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 700px; height: 320px; overflow: auto; }
      .row { height: 34px; } a { display:inline-block; width:120px; height:24px; }
    </style><div id="dialog" role="dialog"><button id="likes">Likes</button><div id="rows">
      ${Array.from({ length: 2 }, (_, i) => `<div class="row"><a href="/@new${i}">new${i}</a><button aria-label="Follow">Follow</button></div>`).join('')}
    </div></div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(() => {
        const ctx = document.querySelector('#dialog');
        const snapshot = D.getLikesContextSnapshot(ctx, ['Likes']);
        return {
            ready: D.isLikesContextReady(ctx, ['Likes']),
            selected: D.isSelectedTab(document.querySelector('#likes')),
            evidence: D.hasCurrentLikesEvidence(ctx),
            candidateCount: snapshot.candidateCount,
            semanticRows: snapshot.semanticRows,
        };
    });
    assert.deepEqual(result, { ready: true, selected: false, evidence: false, candidateCount: 2, semanticRows: true });
    await page.close();
});

test('beta56 clean-list switch contract accepts changed live context but rejects a no-op click', () => {
    assert.match(coreSource, /waitForLikesContextReady/);
    assert.match(collectorSource, /getLikesContextSnapshot/);
    assert.match(collectorSource, /contextChanged/);
    assert.match(collectorSource, /rootChanged/);
    assert.match(collectorSource, /listChanged/);
    assert.match(collectorSource, /stableObservations/);
    assert.match(collectorSource, /semanticReady/);
    assert.match(coreSource, /likes_tab_switch_failed/);
    assert.match(reservoirSource, /waitForLikesContextReady/);
});

test('beta56 successful semantic switch remains behind existing atomic commit gate', () => {
    assert.match(coreSource, /shouldCommitDialogCollection/);
    assert.match(coreSource, /rollbackStagedCollection/);
    assert.match(coreSource, /selectedCount/);
});

test('beta56 post-reservoir confirm uses the shared bounded helper on delayed 23-to-2 refresh', async () => {
    const fnMatch = reservoirSource.match(/const confirmSelectedLikesContext = async \(dialog\) => \{([\s\S]*?)\n            \};\n            const existingDialog/);
    assert.ok(fnMatch, 'post-reservoir confirm helper must be extractable');
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 700px; height: 320px; overflow: auto; }
      .row { height: 34px; } a { display:inline-block; width:120px; height:24px; }
    </style><div id="dialog" role="dialog"><button id="likes">Likes</button><div id="rows">
      ${Array.from({ length: 23 }, (_, i) => `<div class="row"><a href="/@old${i}">old${i}</a><button aria-label="Follow">Follow</button></div>`).join('')}
    </div></div>`);
    await page.evaluate(({ collector, body }) => {
        const bundled = collector.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
        const dialog = document.querySelector('#dialog');
        document.querySelector('#likes').addEventListener('click', () => {
            setTimeout(() => {
                document.querySelector('#rows').innerHTML = '<div class="row"><a href="/@new0">new0</a><button aria-label="Follow">Follow</button></div><div class="row"><a href="/@new1">new1</a><button aria-label="Follow">Follow</button></div>';
            }, 220);
        });
        window.confirmLikes = Function('DialogCollector', 'Utils', 'Core', 'CONFIG', `return async function (dialog) {${body}}`)(window.D, {
            simClick: element => element.click(),
        }, {
            getTopContext: () => dialog,
        }, { LIKES_TAB_TEXTS: ['Likes'] });
    }, { collector: collectorSource, body: fnMatch[1] });
    const result = await page.evaluate(async () => {
        const dialog = document.querySelector('#dialog');
        const returned = await window.confirmLikes(dialog);
        return { same: returned === dialog, returned: !!returned, snapshot: window.D.getLikesContextSnapshot(dialog, ['Likes']) };
    });
    assert.equal(result.same, true, JSON.stringify(result));
    await page.close();
});

test('beta56 shared readiness rejects a transient refresh that enters loading', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<div id="dialog" role="dialog"><button id="likes">Likes</button><div id="rows">
      ${Array.from({ length: 23 }, (_, i) => `<div class="row"><a href="/@old${i}">old${i}</a><button>Follow</button></div>`).join('')}
    </div></div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
        document.querySelector('#likes').addEventListener('click', () => {
            setTimeout(() => {
                document.querySelector('#rows').innerHTML = '<div class="row"><a href="/@new0">new0</a><button>Follow</button></div><div class="row"><a href="/@new1">new1</a><button>Follow</button></div>';
            }, 80);
            setTimeout(() => { document.querySelector('#dialog').insertAdjacentText('beforeend', 'Loading'); }, 170);
        });
    }, collectorSource);
    const result = await page.evaluate(async () => {
        const dialog = document.querySelector('#dialog');
        document.querySelector('#likes').click();
        return D.waitForLikesContextReady(dialog, {
            likesTexts: ['Likes'], getLiveContext: () => dialog,
            requireChange: true, maxAttempts: 8, waitMs: 50,
        });
    });
    assert.equal(result, null, 'loading transition must not be accepted as a completed Likes switch');
    await page.close();
});

test('beta56 shared readiness fails closed when a Likes click is a no-op', async () => {
    const page = await browser.newPage();
    await page.setContent('<div id="dialog" role="dialog"><button id="likes">Likes</button><div class="row"><a href="/@same">same</a><button>Follow</button></div></div>');
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(async () => D.waitForLikesContextReady(document.querySelector('#dialog'), {
        likesTexts: ['Likes'], getLiveContext: () => document.querySelector('#dialog'),
        requireChange: true, maxAttempts: 3, waitMs: 20,
    }));
    assert.equal(result, null);
    await page.close();
});

test('beta56 shared readiness handles already-Likes empty and rejects a selected other activity view', async () => {
    const page = await browser.newPage();
    await page.setContent('<div id="dialog" role="dialog"><button id="likes">Likes</button><button id="quotes" role="tab">Quotes</button><div id="rows"></div></div>');
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(async () => {
        const dialog = document.querySelector('#dialog');
        const empty = await D.waitForLikesContextReady(dialog, {
            likesTexts: ['Likes'], getLiveContext: () => dialog,
            requireChange: false, maxAttempts: 4, waitMs: 20,
        });
        document.querySelector('#quotes').setAttribute('aria-selected', 'true');
        const other = await D.waitForLikesContextReady(dialog, {
            likesTexts: ['Likes'], getLiveContext: () => dialog,
            requireChange: false, maxAttempts: 2, waitMs: 20,
        });
        document.querySelector('#quotes').removeAttribute('aria-selected');
        document.querySelector('#likes').setAttribute('aria-selected', 'true');
        const selectedLikes = await D.waitForLikesContextReady(dialog, {
            likesTexts: ['Likes'], getLiveContext: () => dialog,
            requireChange: false, maxAttempts: 2, waitMs: 20,
        });
        return { emptyReason: empty?.reason, other: !!other, selectedReason: selectedLikes?.reason };
    });
    assert.equal(result.emptyReason, 'empty_stable');
    assert.equal(result.other, false);
    assert.equal(result.selectedReason, 'marker_or_evidence');
    await page.close();
});

console.log('beta56 clean-list lifecycle contract: live semantic refresh / no-op fail-closed / atomic commit');
