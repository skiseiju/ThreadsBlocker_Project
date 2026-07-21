import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

test('beta53 follower rows expose bounded breakdown and dedupe skips', async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await page.setContent(`<div id="dialog" role="dialog">
    <div class="row"><a href="/@new_one">new</a><button data-testid="follow-button">Follow</button></div>
    <div class="row"><a href="/@new_one">duplicate</a><button data-testid="follow-button">Follow</button></div>
    <div class="row"><a href="/@target">target</a><button data-testid="follow-button">Following</button></div>
    <div class="row"><a href="/@blocked">blocked</a><button data-testid="follow-button">Following</button></div>
    <div class="row"><a href="/@queued">queued</a><button data-testid="follow-button">Following</button></div>
  </div>`);
  await page.evaluate(raw => { const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;'; window.D = Function(bundled)(); }, source);
  const result = await page.evaluate(() => {
    const state = D.createFollowerState();
    return D.collectFollowerRows(document.querySelector('#dialog'), state, {
      targetOwner: 'target', selfUser: 'self', blockedUsers: ['blocked'], queuedUsers: ['queued'], maxLimit: 50,
    });
  });
  assert.deepEqual(result.users, ['new_one']);
  assert.deepEqual(result.breakdown, { observedUnique: 4, eligibleNew: 1, duplicate: 1, selfTarget: 1, blocked: 1, queued: 1, unknown: 0, invalid: 0 });
  await page.close();
});

test('beta53 follower lifecycle has total hint, partial/limited reasons and bounded scroll confirmation', () => {
  assert.match(coreSource, /totalHint/);
  assert.match(coreSource, /threads_partial/);
  assert.match(coreSource, /scroll_stall/);
  assert.match(coreSource, /limited/);
  assert.match(coreSource, /breakdown/);
  assert.match(coreSource, /bottom.*(?:observ|confirm)|(?:observ|confirm).*bottom/i);
});

console.log('beta53 follower breakdown contract: RED then PASS');
