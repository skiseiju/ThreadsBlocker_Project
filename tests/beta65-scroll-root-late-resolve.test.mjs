import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { diagnosticsEnabled, diagnosticsSkipReason } from './helpers/diagnostics-gate.mjs';

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

// Live beta64 shape: the dialog context itself is a non-scrollable shell
// (scrollHeight === clientHeight, overflow visible). The real scroll root is an
// inner list that only gains scroll range once lazy rows arrive. The one-shot
// root resolution therefore falls back to the shell and every scroll is a no-op.
test('beta65 clean-list resolves the real scroll root after lazy rows arrive', { skip: diagnosticsEnabled ? false : diagnosticsSkipReason }, async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => { await import('/core.js'); });
    const result = await page.evaluate(async () => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        RuntimeDiagnostics.clear();
        document.body.innerHTML = `
          <div id="dialog" role="dialog" style="width:700px;height:320px;overflow:visible">
            <button role="tab" aria-selected="true">Likes</button>
            <div id="list" style="height:280px;overflow:auto">
              <div id="rows"><a href="/@user0">user0</a></div>
            </div>
          </div>`;
        const dialog = document.querySelector('#dialog');
        setTimeout(() => {
            const rows = document.querySelector('#rows');
            rows.insertAdjacentHTML('beforeend', Array.from({ length: 139 }, (_, i) => `<div style="height:24px"><a href="/@user${i + 1}">user${i + 1}</a></div>`).join(''));
        }, 450);
        const collected = await Core.collectFullDialogUsers(dialog, {
            label: 'beta65 late scroll root fixture', initialRenderDeadlineMs: 300,
        });
        const entries = RuntimeDiagnostics.export().entries.filter(entry => entry.feature === 'clean_list');
        return {
            collected,
            shellIsNotScrollable: dialog.scrollHeight === dialog.clientHeight,
            scrollRootSelected: entries.some(entry => entry.stage === 'dialog' && entry.fields.scrollRootSelected === true),
            advanced: entries.some(entry => entry.stage === 'scroll' && entry.fields.rootAdvanced === true),
        };
    });
    await page.close();
    // Guard the fixture itself: if the shell ever becomes scrollable the test
    // stops reproducing the live shape and would pass for the wrong reason.
    assert.equal(result.shellIsNotScrollable, true, 'fixture shell must stay non-scrollable like live Threads');
    assert.equal(result.scrollRootSelected, true, 'collector must select the inner list, not fall back to the shell');
    assert.equal(result.advanced, true, 'scrolling must actually advance a real scroll root');
    assert.equal(result.collected.users.length, 140);
});

console.log('beta65 scroll-root contract: late-appearing scroll range is resolved instead of latched to the shell');
