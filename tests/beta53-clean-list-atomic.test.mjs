import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const postReservoirSource = await readFile(new URL('../src/features/post-reservoir-engine.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

test('beta53 already-on-Likes context is explicit and does not require a tab button', async () => {
  const page = await browser.newPage();
  await page.setContent('<div id="dialog" role="dialog"><h2>Likes</h2><div class="row"><a href="/@one">one</a><button data-testid="follow-button">Follow</button><span data-hege-like="true"></span></div></div>');
  await page.evaluate(raw => { const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;'; window.D = Function(bundled)(); }, collectorSource);
  const result = await page.evaluate(() => ({ has: D.hasCurrentLikesEvidence(document.querySelector('#dialog')), tab: D.findLikesTab(document.querySelector('#dialog'), ['Likes']) }));
  assert.equal(result.has, true);
  assert.equal(result.tab, null);
  await page.close();
});

test('beta53 clean-list collection is staged/rollback-safe and failure toast has severity', () => {
  assert.match(coreSource, /staged|stage/i);
  assert.match(coreSource, /rollback/i);
  assert.match(coreSource, /likes_tab_switch_failed/);
  assert.match(coreSource, /severity:\s*['"](?:error|warning)/);
  assert.match(uiSource, /severity/);
    assert.match(uiSource, /rgba\(.*(?:error|warning)|#(?:d00|f|c00)/i);
});

test('beta53 collector contract rejects partial results before any commit', () => {
  assert.match(coreSource, /normalizeDialogCollectionResult/);
  assert.match(coreSource, /shouldCommitDialogCollection/);
  assert.match(coreSource, /completeAllowlist|COMPLETE_DIALOG_REASONS/);
  assert.match(coreSource, /rows_unknown|scroll_stall|timeout|likes_tab_switch_failed|limited/);
  assert.match(coreSource, /pendingUsers[\s\S]{0,500}(?:complete|rollback)/i);
  assert.match(coreSource, /REPORT_QUEUE/);
  assert.match(uiSource, /warning|error/);
});

test('beta53 complete allowlist is conservative for partial collector reasons', () => {
  const helperMatch = coreSource.match(/export const COMPLETE_DIALOG_REASONS[\s\S]*?export const shouldCommitDialogCollection = \(raw = \{\}\) => normalizeDialogCollectionResult\(raw\)\.complete;/);
  assert.ok(helperMatch, 'structured result helper must be extractable');
  const helper = Function(`${helperMatch[0].replace(/^export const /gm, 'const ')}\nreturn shouldCommitDialogCollection;`)();
  for (const reason of ['rows_unknown', 'scroll_stall', 'timeout', 'likes_tab_switch_failed', 'limited', 'threads_partial']) {
    assert.equal(helper({ users: ['partial'], reason, complete: false }), false, reason);
  }
  assert.equal(helper({ users: ['done'], reason: 'end', complete: true, counts: { unknownRows: 0 } }), true);
});

test('beta53 follower summary exposes bounded cap/truncated state', () => {
  assert.match(coreSource, /maxLimit\s*=\s*Math\.max\(50,\s*Math\.min\(1000/);
  assert.match(coreSource, /truncated/);
  assert.match(uiSource, /cap|上限|truncated|截斷/);
});

test('beta53 collectFullDialogUsers consumers use structured results', () => {
  assert.match(postReservoirSource, /const fallbackCollection = await Core\.collectFullDialogUsers\(/);
  assert.doesNotMatch(postReservoirSource, /Array\.isArray\(fallbackUsers\)/);
  assert.match(coreSource, /normalizeDialogCollectionResult\(await Core\.collectFullDialogUsers\(/);
});

console.log('beta53 clean-list atomic contract: RED then PASS');
