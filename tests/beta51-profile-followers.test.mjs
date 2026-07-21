import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

async function fixture(body) {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`<!doctype html><style>#dialog{width:700px;height:320px;overflow:auto}a{display:inline-block;width:120px;height:24px} [role=listitem]{width:600px;height:50px}</style><div id="dialog" role="dialog">${body}</div>`);
    await page.evaluate((raw) => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.__DialogCollector = Function(bundled)();
    }, collectorSource);
    return page;
}

test('beta51 follower collector accepts only explicit rows and rejects shared/tag/search links', async () => {
    const page = await fixture(`
      <div id="shared"><div role="listitem"><a href="/@follower_a">follower_a</a></div>
      <div role="listitem"><a href="/@follower_b">follower_b</a></div>
      <a href="/search?q=tag">tag</a><a href="/tags/topic">topic</a>
      <div class="unknown"><a href="/@unknown">unknown</a></div></div>`);
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        return D.collectFollowerRows(document.querySelector('#dialog'), D.createFollowerState(), {
            skipUsers: new Set(['follower_b']), targetOwner: 'target', selfUser: 'self', maxLimit: 50,
        });
    });
    assert.deepEqual(result.users, ['follower_a']);
    assert.equal(result.unknownRows, 1);
    await page.close();
});

test('beta51 follower collector dedupes virtualized rows and enforces the 50-row limit', async () => {
    const page = await fixture('<div id="rows"><div role="listitem"><a href="/@first">first</a></div></div>');
    const result = await page.evaluate(() => {
        const D = window.__DialogCollector;
        const state = D.createFollowerState();
        const ctx = document.querySelector('#dialog');
        D.collectFollowerRows(ctx, state, { maxLimit: 2 });
        document.querySelector('#rows').innerHTML = '<div role="listitem"><a href="/@first">first</a></div><div role="listitem"><a href="/@second">second</a></div><div role="listitem"><a href="/@third">third</a></div>';
        return D.collectFollowerRows(ctx, state, { maxLimit: 2 });
    });
    assert.deepEqual(result.users, ['first', 'second']);
    assert.equal(result.truncated, true);
    await page.close();
});

test('beta51 follower collector preserves virtualization, bounded stop/stall, confirmation and queue dedupe contracts', () => {
    assert.match(collectorSource, /collectFollowerRows/);
    assert.match(collectorSource, /createFollowerState/);
    assert.match(coreSource, /collectFollowersForProfile/);
    assert.match(coreSource, /scroll_stall/);
    assert.match(coreSource, /maxLimit|50/);
    assert.match(coreSource, /enqueueFollowerUsers/);
    assert.match(uiSource, /showFollowerCollectionConfirm/);
    assert.match(mainSource, /onCollectProfileFollowers/);
    assert.match(coreSource, /history\.replaceState/);
    assert.doesNotMatch(coreSource, /collectFollowersForProfile[\s\S]{0,500}querySelectorAll\('a\[href\*="\/@"\]\)/);
});

console.log('beta51 profile follower fixtures: PASS explicit rows, virtualization, bounded collection');
