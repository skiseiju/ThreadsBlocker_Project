import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

test('beta52 collectFollowersForProfile waits through an initially empty render and collects later rows', async () => {
    const functionMatch = coreSource.match(/collectFollowersForProfile:\s*async \(targetOwner = '', options = \{\}\) => \{([\s\S]*?)\n    \},\n\n    normalizeSourceUrl/);
    assert.ok(functionMatch, 'production follower lifecycle function must be extractable');
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent('<main id="profile"><button id="followers-control">Followers</button></main>');
    await page.evaluate(({ collector, body }) => {
        const bundled = collector.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.__DialogCollector = Function(bundled)();
        const profile = document.querySelector('#profile');
        const control = document.querySelector('#followers-control');
        control.addEventListener('click', () => {
            const dialog = document.createElement('div');
            dialog.id = 'followers-dialog';
            dialog.setAttribute('role', 'dialog');
            dialog.innerHTML = '<h2>Followers</h2><div id="rows"></div>';
            document.body.appendChild(dialog);
            setTimeout(() => {
                document.querySelector('#rows').innerHTML = '<div class="row"><a href="/@later_one">later_one</a><button aria-label="Following">Following</button></div><div class="row"><a href="/@later_two">later_two</a><button aria-label="Following">Following</button></div>';
            }, 200);
        });
        window.__followerCore = {
            _followerCollectionRunning: false,
            findProfileRoot: () => profile,
            findProfileFollowersControl: () => control,
            getTopContext: () => document.querySelector('#followers-dialog') || document.body,
        };
        window.__followerUtils = {
            simClick: (element) => element.click(),
            safeSleep: (ms) => new Promise(resolve => setTimeout(resolve, Math.min(ms, 5))),
            getMyUsername: () => '',
        };
        window.__followerConfig = { FOLLOWERS_TEXTS: ['Followers'] };
        window.__normalizeFollower = (value) => String(value || '').replace(/^@+/, '').split(/[/?#\\s]/)[0];
        window.__followerFunction = Function('Core', 'Utils', 'CONFIG', 'DialogCollector', 'normalizeFailureUsername', `return async (targetOwner = '', options = {}) => {${body}}`)(window.__followerCore, window.__followerUtils, window.__followerConfig, window.__DialogCollector, window.__normalizeFollower);
    }, { collector: collectorSource, body: functionMatch[1] });
    const result = await page.evaluate(() => window.__followerFunction('target'));
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(result.users, ['later_one', 'later_two']);
    assert.notEqual(result.reason, 'empty_end');
    await page.close();
});

test('beta52 follower real-style row has no role/data-row but has one profile anchor and native action', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent('<div id="dialog" role="dialog"><div class="x1n2onr6"><a href="/@follower">follower</a><button aria-label="Following">Following</button><img alt="avatar"></div><div class="shared"><a href="/@other">other</a><span data-hege-like="true"></span></div></div>');
    await page.evaluate((raw) => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.__DialogCollector = Function(bundled)();
    }, collectorSource);
    const result = await page.evaluate(() => window.__DialogCollector.collectFollowerRows(
        document.querySelector('#dialog'), window.__DialogCollector.createFollowerState(), { maxLimit: 50 }
    ));
    assert.deepEqual(result.users, ['follower']);
    assert.equal(result.unknownRows, 1);
    await page.close();
});

test('beta52 follower initial observation distinguishes rows_unknown from real empty end', () => {
    assert.match(coreSource, /rows_unknown/);
    assert.match(coreSource, /initial.*observation|observed.*render|load.*render/i);
    assert.match(coreSource, /dialog_missing|rows_missing/);
});

test('beta52 follower UI explains collect-only and bounded result reason', () => {
    assert.match(uiSource, /收集這個帳號的粉絲/);
    assert.match(uiSource, /只收集，不會立即封鎖/);
    assert.match(uiSource, /停止原因|結束原因/);
});

console.log('beta52 follower lifecycle contract: RED then PASS after initial observation/UX');
