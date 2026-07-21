import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

async function fixture(body) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>
      #dialog { width: 700px; height: 320px; overflow: auto; }
      a { display: inline-block; width: 120px; height: 24px; }
      svg { width: 18px; height: 18px; }
    </style><div id="dialog" role="dialog">${body}</div>`);
    await page.evaluate((raw) => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.__DialogCollector = Function(bundled)();
    }, source);
    return page;
}

test('beta50 Likes row boundary never borrows heart evidence from shared ancestor', async () => {
    const page = await fixture(`
      <div id="shared" data-shared="true"><button aria-label="activity"></button>
        <div class="row"><a href="/@plain">plain</a></div>
        <div class="row"><a href="/@liked">liked</a><svg data-hege-like="true"></svg></div>
      </div>`);
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return { users: D.usersFromState(state), unknownRows: state.unknownRows, liked: state.likeRows };
    });
    assert.deepEqual(result, { users: [], unknownRows: 2, liked: 0 });
    await page.close();
});

test('beta50 Likes collector keeps typed evidence separate from activity visual inventory', async () => {
    const page = await fixture(`
      <div id="shared"><div role="listitem"><a href="/@plain">plain</a></div>
      <div role="listitem"><a href="/@liked">liked</a><span data-hege-like="true"></span></div></div>`);
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return {
            activityVisibleCount: D.inventoryVisibleRows(document.querySelector('#dialog')).length,
            collectorLikedCount: D.usersFromState(state).length,
            stateActivityVisibleCount: state.activityVisibleCount,
            stateCollectorLikedCount: state.collectorLikedCount,
        };
    });
    assert.deepEqual(result, {
        activityVisibleCount: 2,
        collectorLikedCount: 1,
        stateActivityVisibleCount: 2,
        stateCollectorLikedCount: 1,
    });
    await page.close();
});

test('beta50 Likes virtualized rows accumulate without duplicate evidence', async () => {
    const page = await fixture('<div id="rows"><div role="listitem"><a href="/@first">first</a><span data-hege-like="true"></span></div></div>');
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createState();
        const ctx = document.querySelector('#dialog');
        D.collectVisible(ctx, state);
        document.querySelector('#rows').innerHTML = '<div role="listitem"><a href="/@second">second</a><span data-hege-like="true"></span></div>';
        D.collectVisible(ctx, state);
        return { users: D.usersFromState(state), batches: state.batches };
    });
    assert.deepEqual(result, { users: ['first', 'second'], batches: 2 });
    await page.close();
});

console.log('beta50 Likes/checkbox fixtures: PASS');
