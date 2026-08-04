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

const usernames = ['hsk_0816', 'll04liou', 'willy0228', 'dempsey168', 'eunice05.08', '6iiruy_', 'stsos777', 'huangraezhen1314'];

const dialogFixture = () => `
  <div id="activity-dialog" role="dialog" style="width:760px;height:620px;overflow:hidden">
    <h2>轉發</h2>
    <div id="activity-scroll" style="width:720px;height:560px;overflow:auto">
      <div id="preview-card" data-hege-preview-card="true" style="width:560px;height:132px;margin:8px;padding:8px;border:1px solid #ddd;overflow:visible">
        <div class="preview-header" data-hege-preview-row="true" style="display:flex;align-items:center;width:540px;height:32px;gap:6px;overflow:visible">
          <div class="preview-avatar" style="flex:0 0 24px;width:24px;height:24px"><img alt="頭像" style="display:block;width:24px;height:24px" /></div>
          <div class="preview-actor" style="flex:0 0 104px;width:104px;height:24px;overflow:visible"><a href="/@edison.k915" style="display:inline-block;width:104px;height:24px;white-space:nowrap">edison.k915</a></div>
          <span class="preview-arrow" style="flex:0 0 16px;width:16px;height:24px">›</span>
          <div class="preview-quoted" style="flex:0 0 104px;width:104px;height:24px;overflow:visible"><a href="/@ezway" style="display:inline-block;width:104px;height:24px;white-space:nowrap">ezway</a></div>
          <time class="preview-time" style="flex:0 0 42px;width:42px;height:20px">2天</time>
          <button class="preview-edit" style="flex:0 0 24px;width:24px;height:24px;padding:0">✎</button>
        </div>
        <div class="preview-body" style="display:block;width:540px;height:56px;margin-top:4px;overflow:visible">
          <span class="preview-body-text" style="display:block;width:540px;height:24px;white-space:nowrap">轉發內容 <a href="/@bodymention" style="display:inline-block;width:112px;height:24px">bodymention</a></span>
        </div>
      </div>
      <div id="account-list" style="width:600px;height:392px;overflow:visible">
        ${usernames.map((username, index) => `
          <div class="account-row" data-testid="account-row-${index}" role="listitem" style="display:flex;align-items:center;width:560px;height:42px;gap:8px;margin:4px 8px;padding:4px;overflow:visible">
            <div class="account-avatar" style="flex:0 0 32px;width:32px;height:32px"><img alt="頭像" style="display:block;width:32px;height:32px" /></div>
            <div class="account-name" style="flex:0 0 140px;width:140px;height:24px;overflow:visible"><a href="/@${username}" style="display:inline-block;width:140px;height:24px;white-space:nowrap">${username}</a></div>
            <time class="account-time" style="flex:0 0 48px;width:48px;height:20px">3天</time>
            <span class="display-name" style="flex:0 0 104px;width:104px;height:20px;white-space:nowrap">顯示名稱${index + 1}</span>
            <button class="follow-button" aria-label="追蹤" style="flex:0 0 64px;width:64px;height:24px">追蹤</button>
          </div>`).join('')}
      </div>
    </div>
  </div>`;

test('beta10 同一個對話框的預覽卡與八列清單維持各自框邊界', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const measurement = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        const { UI } = await import('/ui.js');
        UI.injectStyles();
        const compactPlacement = placement => placement ? {
            rowKind: placement.rowKind || '',
            matchedBy: placement.matchedBy || '',
            shouldInject: placement.shouldInject !== false,
            previewCard: placement.previewCard ? {
                id: placement.previewCard.id || '',
                className: placement.previewCard.className || '',
                height: Number(placement.previewCard.getBoundingClientRect?.().height || placement.previewCard.clientHeight || 0),
            } : null,
        } : null;
        document.body.innerHTML = fixture;
        const dialog = document.querySelector('[role="dialog"]');
        const listRows = Array.from(document.querySelectorAll('.account-row'));
        const resolverRows = listRows.map(row => {
            const anchor = row.querySelector('a[href^="/@"]');
            return {
                username: anchor?.getAttribute('href')?.slice(2) || '',
                placement: compactPlacement(Core.resolveAccountRowContext(anchor, dialog)),
            };
        });
        const roundCounts = [];
        for (let round = 0; round < 5; round += 1) {
            Core.injectDialogCheckboxes();
            roundCounts.push({
                preview: document.querySelector('#preview-card')?.querySelectorAll('.hege-checkbox-container').length || 0,
                rows: listRows.map(row => row.querySelectorAll('.hege-checkbox-container').length),
            });
        }
        const previewCard = document.querySelector('#preview-card');
        const followRows = listRows.map(row => {
            const box = row.querySelector('.hege-checkbox-container');
            const follow = row.querySelector('.follow-button');
            return {
                username: box?.dataset.username || '',
                count: row.querySelectorAll('.hege-checkbox-container').length,
                adjacentToFollow: !!box && !!follow && box.parentElement === row && box.nextElementSibling === follow,
            };
        });
        return {
            preview: {
                count: previewCard?.querySelectorAll('.hege-checkbox-container').length || 0,
                usernames: Array.from(previewCard?.querySelectorAll('.hege-checkbox-container') || []).map(box => box.dataset.username),
            },
            rows: followRows,
            roundCounts,
            resolverRows,
            previewContainer: resolverRows[0]?.placement?.previewCard || null,
        };
    }, dialogFixture());
    console.log(`beta10 同一個對話框取證：${JSON.stringify(measurement)}`);
    assert.equal(measurement.preview.count, 1, '預覽卡應只有發文者一個框');
    assert.deepEqual(measurement.preview.usernames, ['edison.k915']);
    assert.deepEqual(measurement.rows.map(row => row.count), usernames.map(() => 1), '八列清單每列應有一個框');
    assert.deepEqual(measurement.rows.map(row => row.username), usernames);
    assert.ok(measurement.rows.every(row => row.adjacentToFollow), '清單框應緊鄰追蹤按鈕');
    assert.ok(measurement.roundCounts.every(round => round.preview === 1 && JSON.stringify(round.rows) === JSON.stringify(usernames.map(() => 1))), '五輪所有框數應維持不變');
    assert.deepEqual(measurement.resolverRows.map(item => item.placement?.rowKind), usernames.map(() => 'account'));
    assert.deepEqual(measurement.resolverRows.map(item => item.placement?.matchedBy), usernames.map(() => 'follow_row'));
    assert.ok(measurement.resolverRows.every(item => item.placement?.shouldInject === true), '清單列不可被預覽卡判定跳過');
    assert.equal(measurement.previewContainer, null, '清單列不可把捲動容器當成預覽卡');
    await page.close();
});

test('beta10 預覽卡判定失敗時退回一般帳號列並仍長框', async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const result = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        const { UI } = await import('/ui.js');
        UI.injectStyles();
        const compactPlacement = placement => placement ? {
            rowKind: placement.rowKind || '',
            matchedBy: placement.matchedBy || '',
            shouldInject: placement.shouldInject !== false,
            previewCard: placement.previewCard ? {
                id: placement.previewCard.id || '',
                className: placement.previewCard.className || '',
                height: Number(placement.previewCard.getBoundingClientRect?.().height || placement.previewCard.clientHeight || 0),
            } : null,
        } : null;
        document.body.innerHTML = `
          <div id="plain-dialog" role="dialog" style="width:560px;height:240px;overflow:hidden">
            <h2>轉發</h2>
            <div class="plain-row" role="listitem" style="display:flex;align-items:center;width:480px;height:44px;gap:8px">
              <a href="/@plain_user" style="display:inline-block;width:160px;height:24px">plain_user</a>
              <time style="width:48px;height:20px">1天</time>
              <button aria-label="追蹤" style="width:64px;height:24px">追蹤</button>
            </div>
          </div>`;
        const dialog = document.querySelector('#plain-dialog');
        const anchor = dialog.querySelector('a[href^="/@"]');
        const placement = Core.resolveAccountRowContext(anchor, dialog);
        Core.injectDialogCheckboxes();
        const row = anchor.closest('.plain-row');
        return {
            placement: compactPlacement(placement),
            count: row?.querySelectorAll('.hege-checkbox-container').length || 0,
            username: row?.querySelector('.hege-checkbox-container')?.dataset.username || '',
        };
    });
    console.log(`beta10 找不到預覽卡時的退路取證：${JSON.stringify(result)}`);
    assert.equal(result.placement?.previewCard, null, '找不到預覽卡時應保留空判定');
    assert.equal(result.placement?.rowKind, 'account');
    assert.equal(result.placement?.matchedBy, 'follow_row');
    assert.equal(result.placement?.shouldInject, true);
    assert.equal(result.count, 1);
    assert.equal(result.username, 'plain_user');
    await page.close();
});
