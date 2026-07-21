import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

async function fixture(body) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>#dialog{width:700px;height:320px;overflow:auto}.row{width:600px;height:60px}.row a{display:inline-block;width:120px;height:24px}.native-action{display:inline-block;width:80px;height:24px}</style><div id="dialog" role="dialog">${body}</div>`);
    await page.evaluate((raw) => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.__DialogCollector = Function(bundled)();
    }, source);
    return page;
}

test('beta52 real activity row shape is accepted only with a single-anchor native action', async () => {
    const page = await fixture(`
      <div id="shared">
        <div class="row"><a href="/@plain">plain</a><span class="native-action" data-testid="follow-button">Follow</span></div>
        <div class="row"><a href="/@liked">liked</a><span class="native-action" data-testid="follow-button">Following</span><span data-hege-like="true"></span></div>
      </div>`);
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return { users: D.usersFromState(state), unknownRows: state.unknownRows, likeRows: state.likeRows };
    });
    assert.deepEqual(result, { users: ['liked'], unknownRows: 0, likeRows: 1 });
    await page.close();
});

test('beta52 shared dialog/container remains unknown and cannot borrow heart evidence', async () => {
    const page = await fixture(`
      <div id="shared"><a href="/@plain">plain</a><span data-hege-like="true"></span><a href="/@other">other</a></div>`);
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createState();
        D.collectVisible(document.querySelector('#dialog'), state);
        return { users: D.usersFromState(state), unknownRows: state.unknownRows, likeRows: state.likeRows };
    });
    assert.deepEqual(result, { users: [], unknownRows: 2, likeRows: 0 });
    await page.close();
});

test('beta52 clean-list uses shared bounded row-boundary helper', () => {
    assert.match(source, /findRowBoundary|findRowForLink[\s\S]{0,1200}single|native/i);
});

console.log('beta52 clean-list boundary fixtures: RED contract/then PASS after row helper');
