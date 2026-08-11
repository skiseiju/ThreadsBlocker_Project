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

test('beta16：清理名單達 200 人時顯示一次效能提醒並保留停止結算', async () => {
    const source = await readFile(corePath, 'utf8');
    const collectorStart = source.indexOf('collectFullDialogUsers: async');
    const collectorEnd = source.indexOf('collectCleanListDialogUsers: async', collectorStart);
    const collectorSource = source.slice(collectorStart, collectorEnd);
    const orchestratorStart = collectorEnd;
    const orchestratorEnd = source.indexOf('collectFollowersForProfile: async', orchestratorStart);
    const orchestratorSource = source.slice(orchestratorStart, orchestratorEnd);

    assert.match(source, /export const CLEAN_LIST_SLOWDOWN_NOTICE_THRESHOLD = 200;/);
    assert.match(collectorSource, /id = 'hege-clean-list-slowdown-notice'/);
    assert.match(collectorSource, /名單已達 \$\{CLEAN_LIST_SLOWDOWN_NOTICE_THRESHOLD\} 人，網頁可能開始變慢。若操作已明顯變慢，可先按「停止並結算」保留目前名單，之後再繼續掃描。/);
    assert.match(collectorSource, /visibleUsers\.length >= CLEAN_LIST_SLOWDOWN_NOTICE_THRESHOLD/);
    assert.match(collectorSource, /largeListNotice\.hidden = false/);
    assert.match(collectorSource, /category: 'clean_list_large_list_notice'[\s\S]*selectedCount: visibleUsers\.length[\s\S]*visible: true/);
    assert.match(orchestratorSource, /largeListNoticeState: \{ shown: false \}/, '兩輪掃描共用一次性提醒狀態');
    assert.match(collectorSource, /stopBtn\.textContent = '停止並結算'/, '提醒不能取代停止結算入口');
});

test('beta16：200 人提醒在實際 collector 進度浮層出現且不阻斷結算', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const result = await page.evaluate(async () => {
        const { Core, RuntimeDiagnostics } = await import('/core.js');
        const { DialogCollector } = await import('/dialog-collector.js');
        document.body.innerHTML = `
          <div id="likes-dialog" role="dialog" style="display:block;width:720px;height:500px;overflow:auto">
            <button role="tab" aria-selected="true" style="display:block;width:80px;height:30px">Likes</button>
            <a href="/@fixture_0" style="display:block;width:120px;height:24px">fixture_0</a>
          </div>`;
        const dialog = document.querySelector('#likes-dialog');
        const users = Array.from({ length: 200 }, (_, index) => `fixture_${index}`);
        const originalCollectVisible = DialogCollector.collectVisible;
        const originalUsersFromState = DialogCollector.usersFromState;
        DialogCollector.collectVisible = (_ctx, state) => {
            state.entries = new Map(users.map(username => [username, { username }]));
            state.visibleRows = 200;
            state.uniqueVisibleRows = 200;
            state.activityVisibleCount = 200;
            state.validAccountRows = 200;
            state.unknownRows = 0;
            state.batches = Number(state.batches || 0) + 1;
            return {
                visibleRows: 200,
                uniqueVisibleRows: 200,
                activityVisibleCount: 200,
                validAccountRows: 200,
                unknownRows: 0,
            };
        };
        DialogCollector.usersFromState = () => users;
        RuntimeDiagnostics._entries = [];

        try {
            const collectionPromise = Core.collectFullDialogUsers(dialog, {
                label: '大型名單提醒 fixture',
                cleanListLikesMode: true,
                noProgressTimeoutMs: 1000,
            });
            const notice = await new Promise((resolve, reject) => {
                const deadline = Date.now() + 2000;
                const poll = () => {
                    const element = document.querySelector('#hege-clean-list-slowdown-notice:not([hidden])');
                    if (element) return resolve(element);
                    if (Date.now() >= deadline) return reject(new Error('slowdown notice did not appear'));
                    setTimeout(poll, 20);
                };
                poll();
            });
            const text = notice.textContent;
            const stopButton = Array.from(document.querySelectorAll('button'))
                .find(button => button.textContent === '停止並結算');
            stopButton.click();
            const collection = await collectionPromise;
            const noticeDiagnostics = RuntimeDiagnostics._entries.filter(entry =>
                entry.feature === 'clean_list'
                && entry.stage === 'show'
                && entry.fields?.category === 'clean_list_large_list_notice');
            return {
                text,
                reason: collection.reason,
                userCount: collection.users.length,
                diagnosticCount: noticeDiagnostics.length,
                diagnosticFields: noticeDiagnostics[0]?.fields || null,
            };
        } finally {
            DialogCollector.collectVisible = originalCollectVisible;
            DialogCollector.usersFromState = originalUsersFromState;
        }
    });

    assert.match(result.text, /名單已達 200 人/);
    assert.match(result.text, /網頁可能開始變慢/);
    assert.match(result.text, /若操作已明顯變慢，可先按「停止並結算」保留目前名單，之後再繼續掃描/);
    assert.equal(result.reason, 'stopped');
    assert.equal(result.userCount, 200, '提醒出現後仍可停止並保留已收集名單');
    assert.equal(result.diagnosticCount, 1, '一次操作只記一筆提醒顯示診斷');
    assert.deepEqual(result.diagnosticFields, {
        selectedCount: 200,
        visible: true,
        category: 'clean_list_large_list_notice',
    });
    await page.close();
});
