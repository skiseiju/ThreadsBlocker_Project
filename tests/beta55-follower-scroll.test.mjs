import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const collectorSource = await readFile(new URL('../src/dialog-collector.js', import.meta.url), 'utf8');
const uiSource = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

test('beta55 follower collector selects the nested account-list scroll root', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.setContent(`
      <div id="dialog" role="dialog" style="height:260px;overflow:hidden">
        <div id="list" style="height:180px;overflow-y:auto">
          ${Array.from({ length: 6 }, (_, i) => `<div style="height:60px"><a href="/@row${i}">row${i}</a><button aria-label="Follow">Follow</button></div>`).join('')}
        </div>
      </div>`);
    await page.evaluate(raw => {
        const bundled = raw.replace(/^export const /gm, 'const ') + '\nreturn DialogCollector;';
        window.D = Function(bundled)();
    }, collectorSource);
    const selected = await page.evaluate(() => window.D.findScrollableRoot(document.querySelector('#dialog'))?.id);
    assert.equal(selected, 'list');
    await page.close();
});

test('beta55 follower lifecycle has bounded auto-scroll progress and no manual-scroll instruction', () => {
    assert.match(coreSource, /findScrollableRoot\(ctx\)/);
    assert.match(coreSource, /scrollTop|clientHeight|scrollHeight/);
    assert.match(coreSource, /waitForFollowerProgress/);
    assert.match(coreSource, /bounce|nudge|stallRounds/);
    assert.match(coreSource, /maxDurationMs/);
    assert.match(coreSource, /totalHint/);
    assert.match(uiSource, /已自動嘗試載入/);
    assert.doesNotMatch(coreSource, /先在粉絲名單往下捲動後再試/);
});

console.log('beta55 follower scroll contract: nested root / bounded progress / stall telemetry');
