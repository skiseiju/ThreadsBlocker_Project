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

// Beta68: When multiple dialogs are present, pick the likes dialog by account-row
// evidence instead of DOM order. The fixture has a 30-row likes dialog followed by
// a 2-link preview dialog that should not interfere.
test('beta68 likes-dialog-pick selects the correct dialog by link count', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => { await import('/core.js'); });
    const result = await page.evaluate(async () => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        RuntimeDiagnostics.clear();
        document.body.innerHTML = `
          <div id="likes" role="dialog" style="width:700px;height:320px;overflow:visible">
            <button role="tab" aria-selected="true">Likes</button>
            <div id="list" style="height:280px;overflow:auto">
              <div id="rows">
              </div>
            </div>
          </div>
          <div id="preview" role="dialog" style="width:700px;height:120px;overflow:visible">
            <a href="/@owner">owner</a><a href="/@owner">owner avatar</a>
          </div>`;
        const likesDialog = document.querySelector('#likes');
        const rows = document.querySelector('#rows');
        // Insert 30 rows of users
        rows.insertAdjacentHTML('beforeend', Array.from({ length: 30 }, (_, i) => `<div style="height:24px"><a href="/@user${i}">user${i}</a></div>`).join(''));
        const collected = await Core.collectFullDialogUsers(likesDialog, {
            label: 'beta68 likes-dialog-pick fixture', initialRenderDeadlineMs: 300,
        });
        return {
            collected,
            likesHasScroll: likesDialog.scrollHeight > likesDialog.clientHeight,
            likesLinkCount: likesDialog.querySelectorAll('a[href^="/@"]').length,
            previewLinkCount: document.querySelector('#preview').querySelectorAll('a[href^="/@"]').length,
        };
    });
    await page.close();
    // Guard the fixture: likes dialog must have scroll range and the right links
    assert.equal(result.likesLinkCount, 30, 'fixture likes dialog must have 30 links');
    assert.equal(result.previewLinkCount, 2, 'fixture preview dialog must have 2 links');
    // Main assertion: collectFullDialogUsers must pick the likes dialog (30 users)
    // not the preview dialog (2 users).
    assert.equal(result.collected.users.length, 30, 'collector must select the likes dialog with 30 users, not the preview dialog with 2 links');
});

console.log('beta68 likes-dialog-pick contract: select the dialog with the most account links instead of DOM order');
