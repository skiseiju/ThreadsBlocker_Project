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
      [role=listitem] { width: 600px; height: 70px; padding: 12px; }
      a { display: inline-block; width: 120px; height: 24px; }
      svg { width: 18px; height: 18px; }
    </style><div id="dialog" role="dialog">${body}</div>`);
    await page.evaluate((raw) => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.__DialogCollector = Function(bundled)();
    }, source);
    return page;
}

const collect = (page) => page.evaluate(() => {
    const D = window.__DialogCollector;
    const ctx = document.querySelector('#dialog');
    const state = D.createState();
    D.collectVisible(ctx, state);
    return { users: D.usersFromState(state), stats: { visibleRows: state.visibleRows, likeRows: state.likeRows, nonLikeRows: state.nonLikeRows, unknownRows: state.unknownRows } };
});

test('beta49 fixture: Likes + Quotes same dialog only returns heart-evidenced Likes', async () => {
    const page = await fixture(`
      <div role="tab" aria-selected="true">Likes</div><div role="tab">Quotes</div>
      <div role="listitem" data-testid="like-row"><a href="/@liked">liked</a><span data-hege-like="true"></span></div>
      <div role="listitem" data-testid="quote-row"><a href="/@quoted">quoted</a></div>
      <div role="listitem" data-testid="quote-like-count-details"><a href="/@quoted_by_aria">quoted_by_aria</a><span aria-label="Like count details"></span></div>`);
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const tab = D.findLikesTab(document.querySelector('#dialog'), ['Likes']);
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return { tabFound: !!tab, selected: D.isSelectedTab(tab), users: D.usersFromState(state) };
    });
    assert.deepEqual(result, { tabFound: true, selected: true, users: ['liked'] });
    await page.close();
});

test('beta49 fixture: only Quotes and heart selector miss never falls back to raw users', async () => {
    const page = await fixture(`
      <div role="tab" aria-selected="true">Likes</div><div role="tab">Quotes</div>
      <div role="listitem"><a href="/@quote_only">quote_only</a></div>`);
    const result = await collect(page);
    assert.deepEqual(result.users, []);
    assert.equal(result.stats.nonLikeRows, 1);
    await page.close();
});

test('beta49 fixture: delayed row is collected once it becomes visible', async () => {
    const page = await fixture('<div role="tab" aria-selected="true">Likes</div><div id="rows"></div>');
    const result = await page.evaluate(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        document.querySelector('#rows').innerHTML = '<div role="listitem"><a href="/@delayed">delayed</a><span data-hege-like="true"></span></div>';
        const D = window.__DialogCollector;
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return D.usersFromState(state);
    });
    assert.deepEqual(result, ['delayed']);
    await page.close();
});

test('beta49 fixture: virtualization keeps prior Like classification after old row is removed', async () => {
    const page = await fixture('<div role="tab" aria-selected="true">Likes</div><div id="rows"><div role="listitem"><a href="/@first">first</a><span data-hege-like="true"></span></div></div>');
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createState();
        const ctx = document.querySelector('#dialog');
        D.collectVisible(ctx, state);
        document.querySelector('#rows').innerHTML = '<div role="listitem"><a href="/@second">second</a><span data-hege-like="true"></span></div><div role="listitem"><a href="/@quote">quote</a></div>';
        D.collectVisible(ctx, state);
        return { users: D.usersFromState(state), batches: state.batches };
    });
    assert.deepEqual(result, { users: ['first', 'second'], batches: 2 });
    await page.close();
});

test('beta49 fixture: locale/ARIA tab labels are supported, missing labels fail closed', async () => {
    const page = await fixture('<div id="locale" role="tab" aria-label="J\'aime" aria-selected="true"></div><div id="aria" role="tab" aria-label="Likes" aria-selected="true"></div><div id="unknown" role="button">???</div>');
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const ctx = document.querySelector('#dialog');
        return {
            locale: !!D.findLikesTab(ctx, ["J'aime"]),
            aria: !!D.findLikesTab(ctx, ['Likes']),
            missing: !!D.findLikesTab(document.querySelector('#unknown'), ['Likes']),
        };
    });
    assert.deepEqual(result, { locale: true, aria: true, missing: false });
    await page.close();
});

test('beta49 fixture: unknown row structure is not guessed as Like', async () => {
    const page = await fixture('<div role="tab" aria-selected="true">Likes</div><div><a href="/@unknown">unknown</a><span data-hege-like="true"></span></div>');
    const result = await collect(page);
    assert.deepEqual(result.users, []);
    assert.equal(result.stats.unknownRows, 1);
    await page.close();
});

test('beta49 fixture: aria/data-testid like-looking metadata is not Like evidence', async () => {
    const page = await fixture('<div role="listitem" data-testid="like-count-details"><a href="/@metadata_only">metadata_only</a><span aria-label="Like count details"></span></div>');
    const result = await collect(page);
    assert.deepEqual(result.users, []);
    assert.equal(result.stats.nonLikeRows, 1);
    await page.close();
});

test('beta49 fixture: skip users and duplicate classification are conservative', async () => {
    const page = await fixture('<div role="listitem"><a href="/@self">self</a><span data-hege-like="true"></span></div><div role="listitem"><a href="/@keep">keep</a><span data-hege-like="true"></span></div><div role="listitem"><a href="/@keep">keep</a></div>');
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return D.usersFromState(state, new Set(['self']));
    });
    assert.deepEqual(result, [], 'Like/Quote conflict must be excluded conservatively');
    await page.close();
});

console.log('beta49 dialog collector fixtures: PASS');
