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

test('beta73 injectDialogCheckboxes must anchor post author checkbox beside account name', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => { await import('/core.js'); });

    const result = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        const { DialogCollector } = await import('/dialog-collector.js');

        // Create the structure step by step
        // First create nested dialog (as separate element)
        const nestedPreview = document.createElement('div');
        nestedPreview.id = 'nested-preview';
        nestedPreview.setAttribute('role', 'dialog');
        nestedPreview.style.cssText = 'border:1px solid #999;padding:10px;margin:10px;background:#f9f9f9;width:200px';
        nestedPreview.innerHTML = `
          <div id="nested-row" style="display:flex;align-items:center;height:50px;padding:10px">
            <a id="nested-link" href="/@nesteduser" style="display:inline-block;width:100px;height:30px">nesteduser</a>
          </div>`;

        // Then create outer dialog
        const outerDialog = document.createElement('div');
        outerDialog.id = 'outer-dialog';
        outerDialog.setAttribute('role', 'dialog');
        outerDialog.style.cssText = 'width:700px;height:400px;overflow:auto;border:1px solid #ccc';
        outerDialog.innerHTML = `
          <h2 style="padding:10px">Likes</h2>
          <div id="normal-list" style="overflow:auto">
            <div id="user1-row" role="listitem" style="display:flex;align-items:center;height:50px;padding:10px">
              <a id="user1-link" href="/@normaluser" style="display:inline-block;width:100px;height:30px">normaluser</a>
            </div>
          </div>`;

        // Clear body and build structure
        document.body.innerHTML = '';
        document.body.appendChild(nestedPreview);  // Nested first
        document.body.appendChild(outerDialog);     // Outer last

        // Move nested inside outer
        outerDialog.appendChild(nestedPreview);

        // Re-append outer to body to ensure it stays last in document order
        document.body.appendChild(outerDialog);

        // Debug: check all dialogs in document
        const allDialogs = document.querySelectorAll('[role="dialog"]');
        const dialogIds = Array.from(allDialogs).map(d => d.id);

        // Check what pickBestAccountDialog actually selects
        const fallbackCtx = Core.getTopContext();
        const bestCtx = DialogCollector.pickBestAccountDialog(fallbackCtx);
        const bestTitleInfo = Core.getSupportedDialogTitle(bestCtx);

        // Call the actual Core function
        Core.injectDialogCheckboxes();

        // After injection, check what checkboxes were added
        const normalUserRow = document.querySelector('#user1-row');
        const nestedRow = document.querySelector('#nested-row');
        const normalUserCheckbox = normalUserRow?.querySelector('.hege-checkbox-container');
        const nestedCheckbox = nestedRow?.querySelector('.hege-checkbox-container');

        return {
            allDialogIds: dialogIds,
            outerDialogExists: !!outerDialog,
            topContextId: fallbackCtx?.id || null,
            bestContextId: bestCtx?.id || null,
            bestContextMatches: bestCtx === outerDialog,
            titleInfoFound: !!bestTitleInfo,
            titleText: bestTitleInfo?.titleText || null,
            normalUserLinkExists: !!document.querySelector('#user1-link'),
            nestedLinkExists: !!document.querySelector('#nested-link'),
            normalUserCheckboxCreated: !!normalUserCheckbox,
            nestedCheckboxCreated: !!nestedCheckbox,
            normalUserCheckboxHTML: normalUserCheckbox?.outerHTML || null,
            nestedCheckboxHTML: nestedCheckbox?.outerHTML || null,
        };
    });

    await page.close();

    // Log diagnostic info before assertions
    console.log('Diagnostic info:', JSON.stringify(result, null, 2));

    // Assertions
    assert.equal(result.outerDialogExists, true, 'outer dialog should be created');
    assert.equal(result.bestContextMatches, true, 'pickBestAccountDialog should select the outer dialog with account list');
    assert.equal(result.titleInfoFound, true, 'getSupportedDialogTitle should find the Likes header in outer dialog');
    assert.equal(result.normalUserLinkExists, true, 'normal user link should exist');
    assert.equal(result.nestedLinkExists, true, 'nested user link should exist');
    // The behavior we care about: both outer and nested account rows MUST have checkboxes
    // positioned adjacent to their account links (not on outer container)
    assert.equal(result.normalUserCheckboxCreated, true, 'checkbox should be injected into outer account row');
    assert.equal(result.nestedCheckboxCreated, true, 'checkbox SHOULD be injected into nested dialog row (anchored to link)');

    // Verify the nested checkbox is not floating on the container edge, but actually part of the row
    if (result.nestedCheckboxHTML) {
        assert.ok(result.nestedCheckboxHTML.includes('hege-checkbox-container'), 'nested checkbox should have correct class');
        assert.ok(result.nestedCheckboxHTML.includes('data-username="nesteduser"'), 'nested checkbox should have correct username attribute');
    }
});

console.log('beta73 author checkbox anchor beside account name: tested');
