import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ headless: true });
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const moduleServer = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
    const relative = pathname.replace(/^\/+/, '');
    if (!relative.endsWith('.js') || relative.includes('..')) {
        response.writeHead(404);
        response.end();
        return;
    }
    try {
        const source = await readFile(new URL(`file://${srcRoot}/${relative}`));
        response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'access-control-allow-origin': '*' });
        response.end(source);
    } catch (_) {
        response.writeHead(404);
        response.end();
    }
});
await new Promise(resolve => moduleServer.listen(0, '127.0.0.1', resolve));
const moduleOrigin = `http://127.0.0.1:${moduleServer.address().port}`;

test.after(async () => {
    await browser.close();
    await new Promise(resolve => moduleServer.close(resolve));
});

test('beta4 clean-list default no-progress timeout is five seconds', async () => {
    const page = await browser.newPage();
    await page.goto(`${moduleOrigin}/`);
    const timeoutMs = await page.evaluate(async () => {
        const { CLEAN_LIST_NO_PROGRESS_TIMEOUT_MS } = await import('/core.js');
        return CLEAN_LIST_NO_PROGRESS_TIMEOUT_MS;
    });
    await page.close();
    assert.equal(timeoutMs, 5000);
});

const collectFixture = async ({ lazyDelayMs = null, noProgressTimeoutMs }) => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => { await import('/core.js'); });
    const output = await page.evaluate(async ({ lazyDelayMs: delayMs, noProgressTimeoutMs: timeoutMs }) => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = `
          <div id="dialog" role="dialog" style="width:700px;height:320px;overflow:auto">
            <button role="tab" aria-selected="true">Likes</button>
            <div id="rows" style="height:auto"><a href="/@user0">user0</a></div>
          </div>`;
        const dialog = document.querySelector('#dialog');
        dialog.scrollBy = ({ top }) => {
            dialog.scrollTop = Math.min(dialog.scrollHeight - dialog.clientHeight, dialog.scrollTop + Math.min(Number(top) || 0, 300));
        };
        if (Number.isFinite(delayMs)) {
            setTimeout(() => {
                const rows = document.querySelector('#rows');
                rows.insertAdjacentHTML('beforeend', Array.from(
                    { length: 139 },
                    (_, index) => `<div style="height:10px"><a href="/@user${index + 1}">user${index + 1}</a></div>`
                ).join(''));
            }, delayMs);
        }
        const startedAt = performance.now();
        const result = await Core.collectFullDialogUsers(dialog, {
            label: 'beta4 progress timeout fixture',
            initialRenderDeadlineMs: 300,
            noProgressTimeoutMs: timeoutMs,
        });
        return { result, elapsedMs: Math.round(performance.now() - startedAt) };
    }, { lazyDelayMs, noProgressTimeoutMs });
    await page.close();
    return output;
};

test('beta4 clean-list resets its idle timer when delayed Likes rows arrive', async () => {
    const output = await collectFixture({ lazyDelayMs: 1200, noProgressTimeoutMs: 1600 });
    assert.equal(output.result.complete, true);
    assert.equal(output.result.reason, 'end');
    assert.equal(output.result.users.length, 140);
    assert.ok(output.elapsedMs >= 1200, `collector ended before delayed rows arrived: ${output.elapsedMs}ms`);
});

test('beta4 clean-list stops only after the configured no-progress timeout', async () => {
    const output = await collectFixture({ noProgressTimeoutMs: 1000 });
    assert.equal(output.result.complete, true);
    assert.equal(output.result.reason, 'end');
    assert.equal(output.result.users.length, 1);
    assert.ok(output.elapsedMs >= 900, `collector stopped too early: ${output.elapsedMs}ms`);
});

console.log('beta4 Likes progress timeout contract: delayed data resets idle time; true idle is bounded');
