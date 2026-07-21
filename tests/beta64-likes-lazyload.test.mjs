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

test('beta64 clean-list waits for lazy Likes rows instead of ending at initial bottom', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => { await import('/core.js'); });
    const result = await page.evaluate(async () => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        RuntimeDiagnostics.clear();
        document.body.innerHTML = `
          <div id="dialog" role="dialog" style="width:700px;height:320px;overflow:auto">
            <button role="tab" aria-selected="true">Likes</button>
            <div id="rows" style="height:auto"><a href="/@user0">user0</a></div>
          </div>`;
        const dialog = document.querySelector('#dialog');
        dialog.scrollBy = ({ top }) => { dialog.scrollTop = Math.min(dialog.scrollHeight - dialog.clientHeight, dialog.scrollTop + Math.min(Number(top) || 0, 300)); };
        setTimeout(() => {
            const rows = document.querySelector('#rows');
            rows.insertAdjacentHTML('beforeend', Array.from({ length: 139 }, (_, i) => `<div style="height:10px"><a href="/@user${i + 1}">user${i + 1}</a></div>`).join(''));
        }, 450);
        const result = await Core.collectFullDialogUsers(document.querySelector('#dialog'), {
            label: 'beta64 lazy Likes fixture', initialRenderDeadlineMs: 300,
        });
        const scroll = RuntimeDiagnostics.export().entries.filter(entry => entry.feature === 'clean_list' && entry.stage === 'scroll');
        return { result, scroll };
    });
    await page.close();
    assert.equal(result.result.complete, true);
    assert.equal(result.result.reason, 'end');
    assert.equal(result.result.users.length, 140);
    assert.ok(result.scroll.length >= 4, 'collector must continue through initial no-range observations');
});

console.log('beta64 lazy Likes contract: delayed rows are collected before bounded no-progress end');
