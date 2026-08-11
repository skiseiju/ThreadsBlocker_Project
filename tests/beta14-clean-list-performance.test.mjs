import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ headless: true });
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const corePath = fileURLToPath(new URL('../src/core.js', import.meta.url));
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

const buildDialogFixture = count => `
  <div id="likes-dialog" role="dialog" style="width:760px;height:620px;overflow:hidden">
    <h2 style="display:block;width:120px;height:28px">讚</h2>
    <div id="likes-list" style="width:720px;height:560px;overflow:auto">
      ${Array.from({ length: count }, (_, index) => `
        <div class="account-row" role="listitem" style="display:flex;align-items:center;width:560px;height:42px;gap:8px;margin:4px 8px;padding:4px">
          <a href="/@fixture_${index}" style="display:inline-block;width:140px;height:24px">fixture_${index}</a>
          <button aria-label="追蹤" style="width:64px;height:24px">追蹤</button>
        </div>`).join('')}
    </div>
  </div>`;

test('beta14：200 列 steady pass 只建立一次 dialog checkbox 索引', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const result = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        const { UI } = await import('/ui.js');
        UI.injectStyles();
        document.body.innerHTML = fixture;
        const dialog = document.querySelector('#likes-dialog');
        Core.injectDialogCheckboxes();

        const nativeQuerySelectorAll = dialog.querySelectorAll.bind(dialog);
        let fullDialogCheckboxQueries = 0;
        dialog.querySelectorAll = selector => {
            if (selector === '.hege-checkbox-container[data-username]') fullDialogCheckboxQueries += 1;
            return nativeQuerySelectorAll(selector);
        };

        Core.injectDialogCheckboxes();
        return {
            fullDialogCheckboxQueries,
            checkboxCount: nativeQuerySelectorAll('.hege-checkbox-container[data-username]').length,
        };
    }, buildDialogFixture(200));

    assert.equal(result.checkboxCount, 200, '最佳化後仍須保留每列一個 checkbox');
    assert.equal(result.fullDialogCheckboxQueries, 1, '每輪只能對整個 dialog 建立一次 checkbox 索引');
    await page.close();
});

test('beta14：收集期間略過 scanner，最外層結束後只排一次補掃', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const result = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = fixture;

        const originalSchedule = Core.scheduleScannerPass;
        const originalScanAndInject = Core.scanAndInject;
        const originalInjectBlockAll = Core.injectDialogBlockAll;
        const originalUpdateControllerUI = Core.updateControllerUI;
        const originalUpdatePanelRouteVisibility = Core.updatePanelRouteVisibility;
        const originalObserver = Core.observer;
        let scheduled = 0;
        let scannerCalls = 0;
        Core.scheduleScannerPass = () => { scheduled += 1; };
        Core.scanAndInject = () => { scannerCalls += 1; };
        Core.injectDialogBlockAll = () => { scannerCalls += 1; };
        Core.updateControllerUI = () => { scannerCalls += 1; };
        Core.updatePanelRouteVisibility = () => { scannerCalls += 1; };
        Core.observer = null;
        Core.beginDialogCollectionActivity();
        Core.endDialogCollectionActivity();
        const withoutStartedScanner = { active: Core.isDialogCollectionActive(), scheduled };
        Core.observer = {};

        try {
            Core.beginDialogCollectionActivity();
            Core.beginDialogCollectionActivity();
            Core.injectDialogCheckboxes();
            Core.runScannerPass();
            const duringCollection = {
                active: Core.isDialogCollectionActive(),
                checkboxCount: document.querySelectorAll('.hege-checkbox-container').length,
                scannerCalls,
                scheduled,
            };
            Core.endDialogCollectionActivity();
            const afterInnerEnd = { active: Core.isDialogCollectionActive(), scheduled };
            Core.endDialogCollectionActivity();
            const afterOuterEnd = { active: Core.isDialogCollectionActive(), scheduled };
            return { withoutStartedScanner, duringCollection, afterInnerEnd, afterOuterEnd };
        } finally {
            Core.scheduleScannerPass = originalSchedule;
            Core.scanAndInject = originalScanAndInject;
            Core.injectDialogBlockAll = originalInjectBlockAll;
            Core.updateControllerUI = originalUpdateControllerUI;
            Core.updatePanelRouteVisibility = originalUpdatePanelRouteVisibility;
            Core.observer = originalObserver;
        }
    }, buildDialogFixture(20));

    assert.deepEqual(result.withoutStartedScanner, { active: false, scheduled: 0 });
    assert.deepEqual(result.duringCollection, {
        active: true,
        checkboxCount: 0,
        scannerCalls: 0,
        scheduled: 0,
    });
    assert.deepEqual(result.afterInnerEnd, { active: true, scheduled: 0 });
    assert.deepEqual(result.afterOuterEnd, { active: false, scheduled: 1 });
    await page.close();
});

test('beta14：單輪 collector 的所有離開路徑都會解除收集狀態', async () => {
    const source = await readFile(corePath, 'utf8');
    const collectorStart = source.indexOf('collectFullDialogUsers: async');
    const collectorEnd = source.indexOf('collectCleanListDialogUsers: async', collectorStart);
    const collectorSource = source.slice(collectorStart, collectorEnd);

    assert.match(collectorSource, /Core\.beginDialogCollectionActivity\(\)/);
    assert.match(collectorSource, /finally\s*\{[\s\S]*Core\.endDialogCollectionActivity\(\)/);
});
