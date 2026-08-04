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

test('beta8 取證：預覽卡只保留發文者框並維持列內幾何', async () => {
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
              <div class="preview-row" data-hege-preview-row="true" style="display:flex;align-items:center;width:248px;height:20px;gap:4px;overflow:visible;margin:12px 8px 0">
                <div class="preview-avatar" style="flex:0 0 20px;width:20px;height:20px;overflow:hidden"><img alt="頭像" style="display:block;width:20px;height:20px" /></div>
                <div class="preview-id" style="flex:0 0 68px;min-width:68px;max-width:68px;overflow:visible"><a href="/@edison.k915" style="display:inline-block;flex:0 0 68px;width:68px;height:20px;white-space:nowrap">edison.k915</a></div>
                <span class="preview-arrow" style="flex:0 0 14px;width:14px;height:20px">›</span>
                <div class="quoted-user" style="flex:0 0 54px;min-width:54px;max-width:54px;overflow:visible"><a href="/@ezway" style="display:inline-block;width:54px;height:20px;white-space:nowrap">ezway</a></div>
                <time class="preview-time" style="flex:0 0 28px;width:28px;height:20px">1天</time>
                <button class="preview-edit" style="flex:0 0 22px;width:22px;height:20px;padding:0">✎</button>
              </div>
              <div class="next-row" style="display:flex;align-items:center;width:248px;height:24px;gap:4px;margin:-4px 8px 0">
                <span class="next-row-content" style="margin-left:auto;flex:0 0 72px;width:72px;height:20px">瀏覽次數</span>
              </div>
              <div class="preview-roomy" data-hege-preview-row="true" style="display:flex;align-items:center;width:300px;height:32px;gap:8px;overflow:visible;margin:12px 8px">
                <div class="preview-roomy-id" style="flex:0 0 96px;min-width:96px;max-width:96px;overflow:visible"><a href="/@roomy_actor" style="display:inline-block;width:96px;height:24px;white-space:nowrap">roomy_actor</a></div>
                <time class="preview-roomy-time" style="flex:0 0 36px;width:36px;height:20px">2天</time>
                <button class="preview-roomy-edit" style="flex:0 0 24px;width:24px;height:24px;padding:0">✎</button>
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
            const staleQuotedBox = Core.createCheckboxContainer('ezway');
            staleQuotedBox.dataset.hegeDialogCheckbox = 'true';
            document.querySelector('.preview-row')?.appendChild(staleQuotedBox);
            const roundCounts = [];
            const roomyRoundCounts = [];
            const postRoundCounts = [];
            const followRoundCounts = [];
            for (let round = 0; round < 5; round += 1) {
                Core.injectDialogCheckboxes();
                roundCounts.push(document.querySelector('.preview-row')?.querySelectorAll('.hege-checkbox-container').length || 0);
                roomyRoundCounts.push(document.querySelector('.preview-roomy')?.querySelectorAll('.hege-checkbox-container').length || 0);
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
            const previewRow = rect(preview);
            const previewBoxes = Array.from(preview?.querySelectorAll('.hege-checkbox-container') || []).map(box => ({
                username: box.dataset.username,
                rect: rect(box),
            }));
            const previewBox = previewBoxes[0]?.rect || rect(null);
            const previewId = rect(preview?.querySelector('.preview-id a'));
            const previewNeighbors = ['.preview-avatar', '.preview-id a', '.preview-arrow', '.quoted-user a', '.preview-time', '.preview-edit']
            .map(selector => ({ selector, rect: rect(preview?.querySelector(selector)) }))
            .map(item => ({ ...item, overlaps: overlap(previewBox, item.rect) }));
            const nextRowContent = rect(document.querySelector('.next-row-content'));
            const roomy = document.querySelector('.preview-roomy');
            const roomyBox = rect(roomy?.querySelector('.hege-checkbox-container'));
            const previewBoxBounds = previewBoxes.map(item => ({
                username: item.username,
                insideRow: item.rect.left >= previewRow.left
                    && item.rect.right <= previewRow.right
                    && item.rect.top >= previewRow.top
                    && item.rect.bottom <= previewRow.bottom,
                overlapsNextRow: overlap(item.rect, nextRowContent),
            }));
            return {
                title,
                roundCounts,
                roomyRoundCounts,
                postRoundCounts,
                followRoundCounts,
                postCards,
                preview: {
                    box: previewBox,
                    id: previewId,
                    idOverlap: overlap(previewBox, previewId),
                    row: previewRow,
                    usernames: Array.from(preview?.querySelectorAll('a[href^="/@"]') || []).map(anchor => anchor.getAttribute('href').slice(2)),
                    boxes: previewBoxes,
                    boxBounds: previewBoxBounds,
                    neighbors: previewNeighbors,
                    nextRowContent,
                    boxNextRowOverlap: overlap(previewBox, nextRowContent),
                    staleQuotedBoxRemoved: !preview?.querySelector('.hege-checkbox-container[data-username="ezway"]'),
                    roomy: { box: roomyBox, row: rect(roomy), username: roomy?.querySelector('a')?.getAttribute('href')?.slice(2) },
                },
            };
        };
        return ['引用', '讚'].map(measure);
    });
    console.log(`beta9 既有幾何回歸：${JSON.stringify(measurements)}`);

    for (const measurement of measurements) {
        const postRightEdges = measurement.postCards.map(item => item.box.right);
        const postRightEdgeSpread = Math.max(...postRightEdges) - Math.min(...postRightEdges);
        const previewOverlap = measurement.preview.neighbors.filter(item => item.overlaps);
        assert.deepEqual(measurement.roundCounts, [1, 1, 1, 1, 1], `${measurement.title} 預覽卡每輪都應只有一個框`);
        assert.deepEqual(measurement.roomyRoundCounts, [1, 1, 1, 1, 1], `${measurement.title} 寬鬆預覽卡每輪都應只有一個框`);
        assert.deepEqual(measurement.postRoundCounts, [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]], `${measurement.title} 一般貼文卡每輪都應各有一個框`);
        assert.deepEqual(measurement.followRoundCounts, [1, 1, 1, 1, 1], `${measurement.title} 有追蹤按鈕帳號列每輪都應只有一個框`);
        assert.ok(postRightEdgeSpread <= 2, `${measurement.title} 貼文卡框右緣應一致，實測 spread=${postRightEdgeSpread}`);
        assert.ok(Math.abs(measurement.preview.box.width - 16) <= 1, `${measurement.title} 空間不足的緊湊預覽卡應使用 16px 退路，實測 width=${measurement.preview.box.width}`);
        assert.ok(Math.abs(measurement.preview.box.right - measurement.preview.row.right) <= 2, `${measurement.title} 緊湊預覽卡框應靠齊列尾端，實測 box.right=${measurement.preview.box.right}, row.right=${measurement.preview.row.right}`);
        assert.ok(Math.abs(measurement.preview.roomy.box.width - 24) <= 1, `${measurement.title} 空間足夠的預覽卡仍應使用 24px 變體，實測 width=${measurement.preview.roomy.box.width}`);
        assert.ok(Math.abs(measurement.preview.roomy.box.right - measurement.preview.roomy.row.right) <= 2, `${measurement.title} 空間足夠的預覽卡框應靠齊列尾端`);
        assert.deepEqual(previewOverlap, [], `${measurement.title} 預覽卡框不應與相鄰元素重疊：${JSON.stringify(previewOverlap)}`);
        assert.deepEqual(measurement.preview.boxes.map(item => item.username), ['edison.k915'], `${measurement.title} 預覽卡只應保留發文者框`);
        assert.equal(measurement.preview.staleQuotedBoxRemoved, true, `${measurement.title} 預覽卡應清除先前誤植的被引用者框`);
        assert.deepEqual(measurement.preview.boxBounds, [{ username: 'edison.k915', insideRow: true, overlapsNextRow: false }], `${measurement.title} 預覽卡框必須完整落在列內且不壓到下一列`);
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

test('beta9 卡片層級：不同 row 的被引用帳號不產生框', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    const result = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        const { UI } = await import('/ui.js');
        UI.injectStyles();
        const fixture = `
          <div id="activity-dialog" role="dialog" style="width:760px;height:620px;overflow:hidden">
            <h2>__TITLE__</h2>
            <div class="preview-card" data-hege-preview-card="true" style="width:360px;height:96px;margin:12px 8px;border:1px solid #ddd;overflow:visible">
              <div class="preview-header" data-hege-preview-row="true" style="display:flex;align-items:center;width:340px;height:32px;gap:4px;overflow:visible">
                <div class="preview-avatar" style="flex:0 0 20px;width:20px;height:20px"><img alt="頭像" style="display:block;width:20px;height:20px" /></div>
                <div class="preview-id" style="flex:0 0 68px;min-width:68px;max-width:68px;overflow:visible"><a href="/@edison.k915" style="display:inline-block;width:68px;height:20px;white-space:nowrap">edison.k915</a></div>
                <span class="preview-arrow" style="flex:0 0 14px;width:14px;height:20px">›</span>
                <div class="quoted-user" role="listitem" data-row-key="quoted-user" style="flex:0 0 54px;width:54px;height:20px;overflow:visible"><a href="/@ezway" style="display:inline-block;width:54px;height:20px;white-space:nowrap">ezway</a></div>
                <time class="preview-time" style="flex:0 0 28px;width:28px;height:20px">2天</time>
                <button class="preview-edit" style="flex:0 0 22px;width:22px;height:20px;padding:0">✎</button>
              </div>
              <div class="post-body" style="display:flex;align-items:center;width:340px;height:24px;margin-top:-4px;overflow:visible">
                <span class="body-first-line" style="display:block;width:340px;height:20px;white-space:nowrap">用這麼久的app才知道… <a class="body-mention" href="/@bodymention" style="display:inline-block;width:72px;height:20px">bodymention</a></span>
              </div>
            </div>
          </div>`;
        const rect = node => {
            const value = node?.getBoundingClientRect?.() || {};
            return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
        };
        const overlapRect = (a, b) => {
            const left = Math.max(a.left, b.left);
            const right = Math.min(a.right, b.right);
            const top = Math.max(a.top, b.top);
            const bottom = Math.min(a.bottom, b.bottom);
            const width = Math.max(0, right - left);
            const height = Math.max(0, bottom - top);
            return { width, height, area: width * height };
        };
        return ['引用', '讚'].map(title => {
            document.body.innerHTML = fixture.replace('__TITLE__', title);
            const card = document.querySelector('.preview-card');
            const staleQuotedBox = Core.createCheckboxContainer('ezway');
            staleQuotedBox.dataset.hegeDialogCheckbox = 'true';
            card?.querySelector('.quoted-user')?.appendChild(staleQuotedBox);
            const roundCounts = [];
            for (let round = 0; round < 5; round += 1) {
                Core.injectDialogCheckboxes();
                roundCounts.push(card?.querySelectorAll('.hege-checkbox-container').length || 0);
            }
            const headerRect = rect(card?.querySelector('.preview-header'));
            const bodyRect = rect(card?.querySelector('.body-first-line'));
            return {
                title,
                card: rect(card),
                header: headerRect,
                body: bodyRect,
                roundCounts,
                boxes: Array.from(card?.querySelectorAll('.hege-checkbox-container') || []).map(box => {
                    const boxRect = rect(box);
                    return {
                        username: box.dataset.username,
                        rect: boxRect,
                        rowKind: box.dataset.hegeRowKind || '',
                        matchedBy: box.dataset.hegeRowMatchedBy || '',
                        confidence: Number(box.dataset.hegeRowConfidence || 0),
                        insideHeader: boxRect.left >= headerRect.left && boxRect.right <= headerRect.right
                            && boxRect.top >= headerRect.top && boxRect.bottom <= headerRect.bottom,
                        bodyOverlap: overlapRect(boxRect, bodyRect),
                    };
                }),
            };
        });
    });
    console.log(`beta9 nested preview：${JSON.stringify(result)}`);
    for (const measurement of result) {
        assert.deepEqual(measurement.roundCounts, [1, 1, 1, 1, 1], `${measurement.title} 整張預覽卡每輪應只有一個框，實測=${JSON.stringify(measurement)}`);
        assert.deepEqual(measurement.boxes.map(box => box.username), ['edison.k915']);
        assert.equal(measurement.boxes[0]?.rowKind, 'preview');
        assert.equal(measurement.boxes[0]?.matchedBy, 'bounded_parent');
        assert.equal(measurement.boxes[0]?.confidence, 1);
        assert.equal(measurement.boxes[0]?.insideHeader, true);
        assert.equal(measurement.boxes[0]?.bodyOverlap?.area, 0);
    }
    await page.close();
});
