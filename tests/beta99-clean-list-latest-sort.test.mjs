import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const browser = await chromium.launch({ headless: true });
const srcRoot = fileURLToPath(new URL('../src/', import.meta.url));
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
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

test('beta6 clean-list route requests Latest ordering without changing shared collector callers', () => {
    assert.match(
        coreSource,
        /collectFullDialogUsers\(activeCtx,\s*\{\s*operationId,\s*preferLatestLikesSort:\s*true\s*\}\)/,
    );
    assert.equal((coreSource.match(/preferLatestLikesSort:\s*true/g) || []).length, 1);
});

test('beta6 clean-list switches the scoped Likes dialog from Default to Latest before collecting', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const output = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        const renderRows = count => Array.from(
            { length: count },
            (_, index) => `<div style="height:10px"><a href="/@user${index}">user${index}</a></div>`,
        ).join('');
        document.body.innerHTML = `
          <div id="background-dialog" role="dialog">
            <div id="background-sort" role="button" aria-haspopup="menu" aria-expanded="false">排序</div>
            <a href="/@background">background</a>
          </div>
          <div id="dialog" role="dialog" style="width:700px;height:320px;overflow:auto">
            <h1>Likes</h1>
            <button role="tab" aria-selected="true">Likes</button>
            <div id="sort" role="button" aria-haspopup="menu" aria-expanded="false">排序</div>
            <div id="rows">${renderRows(82)}</div>
          </div>`;
        const dialog = document.querySelector('#dialog');
        const sort = document.querySelector('#sort');
        const rows = document.querySelector('#rows');
        let backgroundSortClicks = 0;
        document.querySelector('#background-sort').onclick = () => { backgroundSortClicks += 1; };
        let currentSort = 'default';
        let latestSortClicks = 0;
        const closeMenu = () => {
            document.querySelector('#sort-menu')?.remove();
            sort.setAttribute('aria-expanded', 'false');
        };
        const selectedMark = () => '<svg role="img" viewBox="0 0 24 24"><path d="M1 1"></path></svg>';
        sort.onclick = () => {
            if (document.querySelector('#sort-menu')) {
                closeMenu();
                return;
            }
            sort.setAttribute('aria-expanded', 'true');
            const menu = document.createElement('div');
            menu.id = 'sort-menu';
            menu.setAttribute('role', 'menu');
            menu.innerHTML = `
              <div id="default-sort" role="menuitem">預設${currentSort === 'default' ? selectedMark() : ''}</div>
              <div id="latest-sort" role="menuitem">最新${currentSort === 'latest' ? selectedMark() : ''}</div>`;
            document.body.appendChild(menu);
            menu.querySelector('#default-sort').onclick = () => {
                currentSort = 'default';
                rows.innerHTML = renderRows(82);
                closeMenu();
            };
            menu.querySelector('#latest-sort').onclick = () => {
                currentSort = 'latest';
                latestSortClicks += 1;
                rows.innerHTML = renderRows(140);
                closeMenu();
            };
        };
        dialog.scrollBy = ({ top }) => {
            dialog.scrollTop = Math.min(dialog.scrollHeight - dialog.clientHeight, dialog.scrollTop + Math.min(Number(top) || 0, 300));
        };

        const result = await Core.collectFullDialogUsers(dialog, {
            label: 'beta6 latest sort fixture',
            preferLatestLikesSort: true,
            initialRenderDeadlineMs: 300,
            noProgressTimeoutMs: 1000,
        });
        const noSortDialog = document.createElement('div');
        noSortDialog.setAttribute('role', 'dialog');
        noSortDialog.innerHTML = '<h1>Likes</h1><a href="/@legacy">legacy</a>';
        document.body.appendChild(noSortDialog);
        const noSortResult = await Core.ensureLatestLikesSort(noSortDialog);
        return {
            result,
            noSortResult,
            backgroundSortClicks,
            latestSortClicks,
            currentSort,
            menuOpen: !!document.querySelector('#sort-menu'),
        };
    });
    await page.close();

    assert.equal(output.latestSortClicks, 1);
    assert.equal(output.backgroundSortClicks, 0);
    assert.equal(output.noSortResult.ok, true);
    assert.equal(output.noSortResult.available, false);
    assert.equal(output.currentSort, 'latest');
    assert.equal(output.menuOpen, false);
    assert.equal(output.result.complete, true);
    assert.equal(output.result.reason, 'end');
    assert.equal(output.result.users.length, 140);
});

test('beta7 direct counted Likes dialog switches to Latest before collecting', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const output = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        const renderRows = count => Array.from(
            { length: count },
            (_, index) => `<div style="height:10px"><a href="/@counted${index}">counted${index}</a></div>`,
        ).join('');
        document.body.innerHTML = `
          <div id="counted-dialog" role="dialog" style="width:700px;height:320px;overflow:auto">
            <h1>1,742個讚</h1>
            <div id="counted-sort" role="button" aria-haspopup="menu" aria-expanded="false">排序</div>
            <div id="counted-rows">${renderRows(82)}</div>
          </div>`;
        const dialog = document.querySelector('#counted-dialog');
        const sort = document.querySelector('#counted-sort');
        const rows = document.querySelector('#counted-rows');
        let currentSort = 'default';
        let latestSortClicks = 0;
        const closeMenu = () => {
            document.querySelector('#counted-sort-menu')?.remove();
            sort.setAttribute('aria-expanded', 'false');
        };
        const selectedMark = () => '<svg role="img" viewBox="0 0 24 24"><path d="M1 1"></path></svg>';
        sort.onclick = () => {
            if (document.querySelector('#counted-sort-menu')) {
                closeMenu();
                return;
            }
            sort.setAttribute('aria-expanded', 'true');
            const menu = document.createElement('div');
            menu.id = 'counted-sort-menu';
            menu.setAttribute('role', 'menu');
            menu.innerHTML = `
              <div id="counted-default-sort" role="menuitem">預設${currentSort === 'default' ? selectedMark() : ''}</div>
              <div id="counted-latest-sort" role="menuitem">最新${currentSort === 'latest' ? selectedMark() : ''}</div>`;
            document.body.appendChild(menu);
            menu.querySelector('#counted-default-sort').onclick = () => {
                currentSort = 'default';
                rows.innerHTML = renderRows(82);
                closeMenu();
            };
            menu.querySelector('#counted-latest-sort').onclick = () => {
                currentSort = 'latest';
                latestSortClicks += 1;
                rows.innerHTML = renderRows(140);
                closeMenu();
            };
        };
        dialog.scrollBy = ({ top }) => {
            dialog.scrollTop = Math.min(dialog.scrollHeight - dialog.clientHeight, dialog.scrollTop + Math.min(Number(top) || 0, 300));
        };

        const result = await Core.collectFullDialogUsers(dialog, {
            label: 'beta7 counted Likes heading fixture',
            preferLatestLikesSort: true,
            initialRenderDeadlineMs: 300,
            noProgressTimeoutMs: 1000,
        });
        return { result, currentSort, latestSortClicks, menuOpen: !!document.querySelector('#counted-sort-menu') };
    });
    await page.close();

    assert.equal(output.latestSortClicks, 1);
    assert.equal(output.currentSort, 'latest');
    assert.equal(output.menuOpen, false);
    assert.equal(output.result.complete, true);
    assert.equal(output.result.reason, 'end');
    assert.equal(output.result.users.length, 140);
});

test('beta8 moves the clean-list entry from hidden Activity content to the visible counted Likes toolbar', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const output = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = `
          <div id="shared-dialog" role="dialog" style="width:700px;height:520px;overflow:auto">
            <section id="activity-screen">
              <div><div id="activity-header"><h1>貼文動態</h1></div></div>
              <div><a href="/@activity1">activity1</a></div>
              <div><a href="/@activity2">activity2</a></div>
            </section>
            <section id="likes-screen" style="display:none">
              <div>
                <div id="likes-header"><h1>1,742個讚</h1></div>
                <div><span dir="auto">排序</span></div>
              </div>
              <div><a href="/@latest1">latest1</a></div>
              <div><a href="/@latest2">latest2</a></div>
            </section>
          </div>`;

        Core.injectDialogBlockAll();
        const firstButton = document.querySelector('.hege-clean-list-btn');
        const firstInActivity = !!document.querySelector('#activity-screen .hege-clean-list-btn');

        document.querySelector('#activity-screen').style.display = 'none';
        document.querySelector('#likes-screen').style.display = 'block';
        Core.injectDialogBlockAll();

        const buttons = Array.from(document.querySelectorAll('.hege-clean-list-btn'));
        const currentButton = document.querySelector('#likes-screen .hege-clean-list-btn');
        const rect = currentButton?.getBoundingClientRect() || {};
        currentButton?.click();
        return {
            firstInActivity,
            buttonCount: buttons.length,
            movedToLikes: !!currentButton,
            replacedForFreshBinding: !!currentButton && currentButton !== firstButton,
            visible: Number(rect.width) > 0 && Number(rect.height) > 0,
            pickerOpened: !!document.querySelector('#hege-clean-list-picker-overlay'),
        };
    });
    await page.close();

    assert.equal(output.firstInActivity, true);
    assert.equal(output.buttonCount, 1);
    assert.equal(output.movedToLikes, true);
    assert.equal(output.replacedForFreshBinding, true);
    assert.equal(output.visible, true);
    assert.equal(output.pickerOpened, true);
});

test('beta9 retries Latest once when Threads ignores the first selection click', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const output = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = `
          <div id="retry-dialog" role="dialog" style="width:700px;height:320px;overflow:auto">
            <h1>1,742個讚</h1>
            <div id="retry-sort" role="button" aria-haspopup="menu" aria-expanded="false">排序</div>
            <div><a href="/@retry1">retry1</a></div>
            <div><a href="/@retry2">retry2</a></div>
          </div>`;
        const dialog = document.querySelector('#retry-dialog');
        const sort = document.querySelector('#retry-sort');
        let currentSort = 'default';
        let latestSortClicks = 0;
        let acceptSecondClick = true;
        let triggerReplacements = 0;
        const closeMenu = (trigger) => {
            document.querySelector('#retry-sort-menu')?.remove();
            trigger?.setAttribute('aria-expanded', 'false');
        };
        const selectedMark = () => '<svg role="img" viewBox="0 0 24 24"><path d="M1 1"></path></svg>';
        const bindSort = (trigger) => {
            trigger.onclick = () => {
                if (document.querySelector('#retry-sort-menu')) {
                    closeMenu(trigger);
                    return;
                }
                trigger.setAttribute('aria-expanded', 'true');
                const menu = document.createElement('div');
                menu.id = 'retry-sort-menu';
                menu.setAttribute('role', 'menu');
                menu.innerHTML = `
                  <div id="retry-default-sort" role="menuitem">預設${currentSort === 'default' ? selectedMark() : ''}</div>
                  <div id="retry-latest-sort" role="menuitem">最新${currentSort === 'latest' ? selectedMark() : ''}</div>`;
                document.body.appendChild(menu);
                menu.querySelector('#retry-latest-sort').onclick = () => {
                    latestSortClicks += 1;
                    if (acceptSecondClick && latestSortClicks >= 2) currentSort = 'latest';
                    closeMenu(trigger);
                    if (latestSortClicks === 1) {
                        const replacement = trigger.cloneNode(true);
                        trigger.replaceWith(replacement);
                        triggerReplacements += 1;
                        bindSort(replacement);
                    }
                };
            };
        };
        bindSort(sort);

        const result = await Core.ensureLatestLikesSort(dialog);
        const successfulClicks = latestSortClicks;
        const successfulSort = currentSort;
        acceptSecondClick = false;
        currentSort = 'default';
        latestSortClicks = 0;
        const failedResult = await Core.ensureLatestLikesSort(dialog);
        return {
            result,
            successfulClicks,
            successfulSort,
            failedResult,
            failedClicks: latestSortClicks,
            triggerReplacements,
            menuOpen: !!document.querySelector('#retry-sort-menu'),
        };
    });
    await page.close();

    assert.equal(output.result.ok, true);
    assert.equal(output.result.switched, true);
    assert.equal(output.result.switchAttempts, 2);
    assert.equal(output.successfulClicks, 2);
    assert.equal(output.successfulSort, 'latest');
    assert.equal(output.failedResult.ok, false);
    assert.equal(output.failedResult.reason, 'likes_sort_switch_failed');
    assert.equal(output.failedResult.switchAttempts, 2);
    assert.equal(output.failedClicks, 2);
    assert.equal(output.triggerReplacements, 2);
    assert.equal(output.menuOpen, false);
});

console.log('beta9 clean-list latest-sort contract: counted headings, shared-dialog transitions, and verified retry are covered');
