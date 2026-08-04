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

test('beta7 取證：貼文卡與緊湊預覽卡多輪注入維持單一框', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const measurements = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        const { UI } = await import('/ui.js');
        UI.injectStyles();
        const fixture = title => `
          <div id="activity-dialog" role="dialog" style="width:760px;height:620px;overflow:hidden">
            <h2>${title}</h2>
            <div id="post-rows">
              <article class="post-card" data-testid="post-card-short" style="width:520px;height:68px;margin:8px;padding:8px;border:1px solid #ddd">
                <div class="post-header" style="display:flex;align-items:center;width:300px;height:32px;gap:8px;overflow:hidden">
                  <div class="actor-name" style="flex:0 0 58px;min-width:58px;overflow:hidden"><a href="/@short_id" style="display:inline-block;width:58px;height:24px;white-space:nowrap">short_id</a></div>
                  <time class="timestamp" style="flex:0 0 42px;width:42px;height:20px">1天</time>
                </div>
              </article>
              <article class="post-card" data-testid="post-card-medium" style="width:520px;height:68px;margin:8px;padding:8px;border:1px solid #ddd">
                <div class="post-header" style="display:flex;align-items:center;width:300px;height:32px;gap:8px;overflow:hidden">
                  <div class="actor-name" style="flex:0 0 104px;min-width:104px;overflow:hidden"><a href="/@medium_identifier" style="display:inline-block;width:104px;height:24px;white-space:nowrap">medium_identifier</a></div>
                  <time class="timestamp" style="flex:0 0 42px;width:42px;height:20px">2天</time>
                </div>
              </article>
              <article class="post-card" data-testid="post-card-long" style="width:520px;height:68px;margin:8px;padding:8px;border:1px solid #ddd">
                <div class="post-header" style="display:flex;align-items:center;width:300px;height:32px;gap:8px;overflow:hidden">
                  <div class="actor-name" style="flex:0 0 150px;min-width:150px;overflow:hidden"><a href="/@long_identifier_name" style="display:inline-block;width:150px;height:24px;white-space:nowrap">long_identifier_name</a></div>
                  <time class="timestamp" style="flex:0 0 42px;width:42px;height:20px">3天</time>
                </div>
              </article>
            </div>
            <div id="preview-rows">
              <div class="preview-row" data-hege-preview-row="true" style="display:flex;align-items:center;width:300px;height:32px;gap:8px;overflow:visible;margin:12px 8px">
                <div class="preview-id" style="flex:0 0 64px;min-width:64px;max-width:64px;overflow:visible"><a href="/@edison.k915" style="display:inline-block;flex:0 0 64px;width:64px;height:24px;white-space:nowrap">edison.k915</a></div>
                <span class="preview-arrow" style="flex:0 0 14px;width:14px;height:20px">›</span>
                <span class="quoted-user" style="flex:0 0 100px;width:100px;height:20px">quoted_user</span>
                <time class="preview-time" style="flex:0 0 32px;width:32px;height:20px">1小時</time>
                <button class="preview-edit" style="flex:0 0 24px;width:24px;height:24px;padding:0">✎</button>
              </div>
            </div>
            <div class="follow-row" data-testid="follow-row" style="display:flex;align-items:center;width:300px;height:42px;gap:8px;margin:12px 8px">
              <a href="/@tracked_user" style="display:inline-block;width:120px;height:24px">tracked_user</a>
              <button aria-label="追蹤" style="width:64px;height:24px">追蹤</button>
            </div>
          </div>`;
        const rect = node => {
            const value = node?.getBoundingClientRect?.() || {};
            return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
        };
        const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        const measure = title => {
            document.body.innerHTML = fixture(title);
            const roundCounts = [];
            const postRoundCounts = [];
            const followRoundCounts = [];
            for (let round = 0; round < 5; round += 1) {
                Core.injectDialogCheckboxes();
                roundCounts.push(document.querySelector('.preview-row')?.querySelectorAll('.hege-checkbox-container').length || 0);
                postRoundCounts.push(Array.from(document.querySelectorAll('.post-card')).map(card => card.querySelectorAll('.hege-checkbox-container').length));
                followRoundCounts.push(document.querySelector('.follow-row')?.querySelectorAll('.hege-checkbox-container').length || 0);
            }
            const postCards = Array.from(document.querySelectorAll('.post-card')).map(card => {
            const box = rect(card.querySelector('.hege-checkbox-container'));
            const header = rect(card.querySelector('.post-header'));
            const actor = rect(card.querySelector('.actor-name'));
            const timestamp = rect(card.querySelector('.timestamp'));
            return { box, header, actor, timestamp, boxTimestampOverlap: overlap(box, timestamp) };
            });
            const preview = document.querySelector('.preview-row');
            const previewBox = rect(preview?.querySelector('.hege-checkbox-container'));
            const previewId = rect(preview?.querySelector('.preview-id a'));
            const previewNeighbors = ['.preview-id a', '.preview-arrow', '.quoted-user', '.preview-time', '.preview-edit']
            .map(selector => ({ selector, rect: rect(preview?.querySelector(selector)) }))
            .map(item => ({ ...item, overlaps: overlap(previewBox, item.rect) }));
            return {
                title,
                roundCounts,
                postRoundCounts,
                followRoundCounts,
                postCards,
                preview: { box: previewBox, id: previewId, idOverlap: overlap(previewBox, previewId), row: rect(preview), neighbors: previewNeighbors },
            };
        };
        return ['引用', '讚'].map(measure);
    });
    console.log(`beta7 取證：${JSON.stringify(measurements)}`);

    for (const measurement of measurements) {
        const postRightEdges = measurement.postCards.map(item => item.box.right);
        const postRightEdgeSpread = Math.max(...postRightEdges) - Math.min(...postRightEdges);
        const previewOverlap = measurement.preview.neighbors.filter(item => item.overlaps);
        assert.deepEqual(measurement.roundCounts, [1, 1, 1, 1, 1], `${measurement.title} 預覽卡每輪都應只有一個框`);
        assert.deepEqual(measurement.postRoundCounts, [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]], `${measurement.title} 一般貼文卡每輪都應各有一個框`);
        assert.deepEqual(measurement.followRoundCounts, [1, 1, 1, 1, 1], `${measurement.title} 有追蹤按鈕帳號列每輪都應只有一個框`);
        assert.ok(postRightEdgeSpread <= 2, `${measurement.title} 貼文卡框右緣應一致，實測 spread=${postRightEdgeSpread}`);
        assert.ok(Math.abs(measurement.preview.box.width - 24) <= 1, `${measurement.title} 緊湊預覽卡框應使用 24px 變體，實測 width=${measurement.preview.box.width}`);
        assert.ok(Math.abs(measurement.preview.box.right - measurement.preview.row.right) <= 2, `${measurement.title} 緊湊預覽卡框應靠齊列尾端，實測 box.right=${measurement.preview.box.right}, row.right=${measurement.preview.row.right}`);
        assert.deepEqual(previewOverlap, [], `${measurement.title} 預覽卡框不應與相鄰元素重疊：${JSON.stringify(previewOverlap)}`);
    }
    await page.close();
});

test('beta7 低信心框在高信心列出現後只搬移一次', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const result = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        const { UI } = await import('/ui.js');
        UI.injectStyles();
        document.body.innerHTML = `
          <div id="activity-dialog" role="dialog" style="width:760px;height:620px;overflow:hidden">
            <h2>引用</h2>
            <div class="preview-row" data-hege-preview-row="true" style="display:flex;align-items:center;width:300px;height:32px;gap:8px;overflow:visible">
              <div class="preview-id" style="flex:0 0 64px;min-width:64px;max-width:64px;overflow:visible"><a href="/@edison.k915" style="display:inline-block;width:64px;height:24px">edison.k915</a></div>
              <span style="flex:0 0 14px;width:14px;height:20px">›</span>
              <span style="flex:0 0 100px;width:100px;height:20px">quoted_user</span>
              <time style="flex:0 0 32px;width:32px;height:20px">1小時</time>
            </div>
          </div>`;
        Core.injectDialogCheckboxes();
        const firstBox = document.querySelector('.hege-checkbox-container');
        const first = {
            count: document.querySelectorAll('.hege-checkbox-container').length,
            confidence: firstBox?.dataset.hegeRowConfidence || '',
            parent: firstBox?.parentElement?.className || '',
        };
        const previewId = document.querySelector('.preview-id');
        const highConfidenceRow = document.createElement('div');
        highConfidenceRow.setAttribute('role', 'listitem');
        highConfidenceRow.style.cssText = 'display:block;width:80px;height:24px;overflow:visible';
        previewId.parentElement.insertBefore(highConfidenceRow, previewId);
        highConfidenceRow.appendChild(previewId);
        Core.injectDialogCheckboxes();
        const secondBox = document.querySelector('.hege-checkbox-container');
        return {
            first,
            second: {
                count: document.querySelectorAll('.hege-checkbox-container').length,
                confidence: secondBox?.dataset.hegeRowConfidence || '',
                movedIntoHighConfidenceHost: secondBox?.parentElement === previewId,
            },
        };
    });
    console.log(`beta7 低信心搬移：${JSON.stringify(result)}`);
    assert.equal(result.first.count, 1);
    assert.equal(result.first.confidence, '1');
    assert.equal(result.second.count, 1);
    assert.equal(result.second.confidence, '3');
    assert.equal(result.second.movedIntoHighConfidenceHost, true);
    await page.close();
});
