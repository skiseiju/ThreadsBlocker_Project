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

test('beta5 引用與轉發貼文卡每卡只保留行為者勾選框', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => {
        const core = await import('/core.js');
        window.__beta5Modules = core;
        window.dialogMarkupForTest = (tab, prefix, huge) => {
            const cards = [0, 1, 2].map(index => `
              <article class="post-card" data-testid="post-card-${prefix}-${index}" style="width:640px;height:150px;padding:12px;border:1px solid #ddd;margin:8px">
                <div class="post-header" data-testid="post-header" style="display:flex;align-items:center;height:32px;gap:8px">
                  <div class="actor-name" style="display:block"><a class="actor-link" href="/@${prefix}_actor_${index}" style="display:inline-block;width:100px;height:24px">${prefix}_actor_${index}</a></div>
                  <span class="timestamp">2 小時</span>
                </div>
                <div class="post-body" style="height:42px">內容提及 <a class="mention-link" href="/@${prefix}_mention_${index}" style="display:inline-block;width:100px;height:20px">${prefix}_mention_${index}</a></div>
                <div class="quoted-body" style="height:42px">原作者 <a class="original-link" href="/@${prefix}_original_${index}" style="display:inline-block;width:100px;height:20px">${prefix}_original_${index}</a></div>
              </article>`).join('');
            return `<div id="activity-dialog" role="dialog" style="width:700px;height:${huge ? 2400 : 620}px;overflow:auto">
              <div class="tabs" style="display:flex;height:34px">
                <button role="tab" aria-selected="${tab === 'likes'}">讚</button>
                <button role="tab" aria-selected="${tab === 'quotes'}">引用</button>
                <button role="tab" aria-selected="${tab === 'reposts'}">轉發</button>
              </div><div id="cards">${cards}</div>${huge ? '<div id="shared-actions">' + [0, 1, 2].map(index => `<div class="remote-follow" role="button" aria-label="Follow">Follow ${index}</div>`).join('') + '</div>' : ''}</div>`;
        };
    });
    for (const tab of ['quotes', 'reposts']) {
        const result = await page.evaluate(({ tabName }) => {
            document.body.innerHTML = window.dialogMarkupForTest(tabName, tabName, false);
            const { Core } = window.__beta5Modules;
            Core.injectDialogCheckboxes();
            const cards = Array.from(document.querySelectorAll('.post-card')).map(card => ({
                total: card.querySelectorAll('.hege-checkbox-container').length,
                usernames: Array.from(card.querySelectorAll('.hege-checkbox-container')).map(box => box.dataset.username),
                actorDirectChild: card.querySelector('.actor-name > .hege-checkbox-container') !== null,
                nonActor: Array.from(card.querySelectorAll('.mention-link, .original-link')).filter(link => link.parentElement.querySelector('.hege-checkbox-container')).length,
                rightOfActor: (() => {
                    const name = card.querySelector('.actor-name');
                    const box = card.querySelector('.hege-checkbox-container');
                    const header = card.querySelector('.post-header');
                    return !!name && !!box && box.parentElement === header
                        && Array.from(header.children).indexOf(box) > Array.from(header.children).indexOf(name);
                })(),
            }));
            Core.injectDialogCheckboxes();
            return { tab: tabName, cards, repeatedTotal: document.querySelectorAll('.hege-checkbox-container').length };
        }, { tabName: tab });
        console.log(`beta5 fixture ${tab}:`, JSON.stringify(result));
        assert.deepEqual(result.cards.map(card => card.total), [1, 1, 1]);
        assert.deepEqual(result.cards.map(card => card.usernames.length === 1 && card.usernames[0].startsWith(`${tab}_actor_`)), [true, true, true]);
        assert.deepEqual(result.cards.map(card => card.actorDirectChild), [false, false, false]);
        assert.deepEqual(result.cards.map(card => card.nonActor), [0, 0, 0]);
        assert.deepEqual(result.cards.map(card => card.rightOfActor), [true, true, true]);
        assert.equal(result.repeatedTotal, 3);
    }
    await page.close();
});

test('beta5 時序注入與巨大共用祖先在讚、引用、轉發分頁保持單一位置', async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/@owner/post/123`);
    await page.evaluate(async () => {
        const core = await import('/core.js');
        window.__beta5Modules = core;
        window.dialogMarkupForTest = (tab, prefix, huge) => {
            const cards = [0, 1, 2].map(index => `<article class="post-card" data-testid="post-card-${prefix}-${index}" style="width:640px;height:150px;padding:12px;border:1px solid #ddd;margin:8px">
              <div class="post-header" data-testid="post-header" style="display:flex;align-items:center;height:32px;gap:8px">
                <div class="actor-name" style="display:block"><a class="actor-link" href="/@${prefix}_actor_${index}" style="display:inline-block;width:100px;height:24px">${prefix}_actor_${index}</a></div><span>2 小時</span>
              </div><div class="post-body" style="height:42px">提及 <a class="mention-link" href="/@${prefix}_mention_${index}" style="display:inline-block;width:100px;height:20px">${prefix}_mention_${index}</a></div>
              <div class="quoted-body" style="height:42px">原作者 <a class="original-link" href="/@${prefix}_original_${index}" style="display:inline-block;width:100px;height:20px">${prefix}_original_${index}</a></div>
            </article>`).join('');
            const rows = [0, 1, 2].map(index => `<div class="account-row" data-testid="account-row-${prefix}-${index}" style="display:flex;align-items:center;width:640px;height:42px;padding:8px">
              <div class="actor-name" style="display:block"><a class="actor-link" href="/@${prefix}_actor_${index}" style="display:inline-block;width:100px;height:24px">${prefix}_actor_${index}</a></div>
            </div>`).join('');
            const body = tab === 'likes' ? rows : cards;
            return `<div id="activity-dialog" role="dialog" style="width:700px;height:${huge ? 2400 : 620}px;overflow:auto"><div class="tabs">
              <button role="tab" aria-selected="${tab === 'likes'}">讚</button><button role="tab" aria-selected="${tab === 'quotes'}">引用</button><button role="tab" aria-selected="${tab === 'reposts'}">轉發</button>
            </div><div id="cards">${body}</div>${huge ? '<div id="shared-actions">' + [0, 1, 2].map(index => `<div role="button" aria-label="Follow">Follow ${index}</div>`).join('') + '</div>' : ''}</div>`;
        };
    });
    for (const tab of ['likes', 'quotes', 'reposts']) {
        const result = await page.evaluate(({ tabName }) => {
            document.body.innerHTML = window.dialogMarkupForTest(tabName, `timing-${tabName}`, false);
            const { Core } = window.__beta5Modules;
            Core.injectDialogCheckboxes();
            const rowSelector = '.post-card, .account-row';
            const first = Array.from(document.querySelectorAll(rowSelector)).map(card => card.querySelectorAll('.hege-checkbox-container').length);
            document.querySelectorAll(tabName === 'likes' ? '.account-row' : '.post-header').forEach(header => {
                const button = document.createElement('div');
                button.setAttribute('role', 'button');
                button.setAttribute('aria-label', 'Follow');
                button.textContent = 'Follow';
                header.appendChild(button);
            });
            Core.injectDialogCheckboxes();
            const second = Array.from(document.querySelectorAll(rowSelector)).map(card => ({
                count: card.querySelectorAll('.hege-checkbox-container').length,
                usernames: Array.from(card.querySelectorAll('.hege-checkbox-container')).map(box => box.dataset.username),
                directChild: card.querySelector('.actor-name > .hege-checkbox-container') !== null,
                rightOfActor: (() => {
                    const name = card.querySelector('.actor-name');
                    const box = card.querySelector('.hege-checkbox-container');
                    const host = card.classList.contains('post-card') ? card.querySelector('.post-header') : card;
                    return !!name && !!box && box.parentElement === host
                        && Array.from(host.children).indexOf(box) > Array.from(host.children).indexOf(name);
                })(),
            }));
            document.body.innerHTML = window.dialogMarkupForTest(tabName, `huge-${tabName}`, true);
            Core.injectDialogCheckboxes();
            return {
                tab: tabName,
                first,
                second,
                hugeCards: Array.from(document.querySelectorAll(rowSelector)).map(card => card.querySelectorAll('.hege-checkbox-container').length),
                hugeDirect: document.querySelector('#activity-dialog')?.querySelectorAll(':scope > .hege-checkbox-container').length || 0,
            };
        }, { tabName: tab });
        console.log(`beta5 fixture timing ${tab}:`, JSON.stringify(result));
        assert.deepEqual(result.first, [1, 1, 1]);
        assert.deepEqual(result.second.map(item => item.count), [1, 1, 1]);
        assert.deepEqual(result.second.map(item => item.usernames.length === 1 && item.usernames[0].startsWith(`timing-${tab}_actor_`)), [true, true, true]);
        assert.deepEqual(result.second.map(item => item.directChild), [false, false, false]);
        assert.deepEqual(result.second.map(item => item.rightOfActor), [true, true, true]);
        assert.deepEqual(result.hugeCards, [1, 1, 1]);
        assert.equal(result.hugeDirect, 0);
    }
    await page.close();
});

test('beta5 injectDialogCheckboxes 只透過 row resolver，不保留 inline 列判定鏈', async () => {
    const source = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
    const start = source.indexOf('injectDialogCheckboxes:');
    const end = source.indexOf('scanAndInject:', start);
    assert.ok(start >= 0 && end > start);
    const body = source.slice(start, end);
    assert.match(source, /resolveAccountRowContext/);
    assert.doesNotMatch(body, /closest\(['"]div\[role="listitem"\]['"]\)/);
    assert.doesNotMatch(body, /data-pressable-container/);
    assert.doesNotMatch(body, /x1n2onr6|x78zum5/);
});
