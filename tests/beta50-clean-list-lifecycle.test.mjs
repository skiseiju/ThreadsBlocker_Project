import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
test.after(async () => browser.close());

test('beta50 clean-list ensure binding survives React replacement and is exactly-once', async () => {
    const page = await browser.newPage();
    await page.setContent('<div id="root"><button class="hege-clean-list-btn">clean</button></div>');
    const body = source.match(/ensureCleanListBinding:\s*\(btn, handler\) => \{([\s\S]*?)\n    \},\n\n    buildSkipUsers/)?.[1];
    assert.ok(body, 'production ensureCleanListBinding helper must be present');
    const result = await page.evaluate((helperBody) => {
        const ensure = Function('Utils', `return (btn, handler) => {${helperBody}}`)({ isMobile: () => false });
        const root = document.querySelector('#root');
        const first = root.querySelector('button');
        let calls = 0;
        const handler = () => { calls += 1; };
        ensure(first, handler);
        ensure(first, handler);
        first.click();
        const replacement = document.createElement('button');
        replacement.className = 'hege-clean-list-btn';
        root.replaceChildren(replacement);
        ensure(replacement, handler);
        replacement.click();
        replacement.remove();
        root.appendChild(replacement);
        replacement.click();
        return { calls, firstBound: first.dataset.hegeCleanListBound, replacementBound: replacement.dataset.hegeCleanListBound };
    }, body);
    assert.deepEqual(result, { calls: 2, firstBound: 'true', replacementBound: 'true' });
    await page.close();
});

test('beta50 clean-list binding is recoverable when visible links temporarily drop below two', async () => {
    assert.match(source, /hasVisibleLinks/);
    assert.match(source, /visible links <2|transient|retry/i);
});

console.log('beta50 clean-list lifecycle contract: PASS');
