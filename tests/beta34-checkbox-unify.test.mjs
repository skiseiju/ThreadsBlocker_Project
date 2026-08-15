// 相關 ADR：docs/adr/0017-likes-progress-idle-timeout.md（checkbox scanner lifecycle）、
// docs/BLOCKING_ARCHITECTURE.md（嵌入式 checkbox 事件契約）、src/core.js。
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
    if (pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end('<!doctype html><title>beta34 checkbox fixture</title>');
        return;
    }
    const relative = pathname.replace(/^\/+/, '');
    if (!relative.endsWith('.js') || relative.includes('..')) {
        response.writeHead(404);
        response.end();
        return;
    }
    try {
        const source = await readFile(new URL(`file://${srcRoot}/${relative}`));
        response.writeHead(200, {
            'content-type': 'text/javascript; charset=utf-8',
            'access-control-allow-origin': '*',
        });
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

const postFixture = `
    <article id="post" style="width:640px;height:160px">
        <div class="post-header">
            <a href="/@virtualized_user">virtualized_user</a>
            <span>2 小時</span>
            <div id="more" role="button" aria-label="More">
                <svg aria-label="More" viewBox="0 0 24 24"><path d="M1 1" /></svg>
            </div>
        </div>
    </article>`;

const openPage = async () => {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`${moduleOrigin}/`);
    await page.evaluate(async () => {
        await import('/core.js');
        const { Storage } = await import('/storage.js');
        const { Utils } = await import('/utils.js');
        localStorage.clear();
        sessionStorage.clear();
        Storage.cache = {};
        Storage.sessionCache = {};
        Utils._myUsername = null;
    });
    return page;
};

test('beta34 stale data-hege-checked marker is recovered from the live DOM', async () => {
    const page = await openPage();
    const result = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = fixture;
        const button = document.querySelector('#more');
        Core.scanAndInject();
        const first = document.querySelector('.hege-checkbox-container');
        const firstCount = document.querySelectorAll('.hege-checkbox-container').length;
        first.remove();
        const staleMarker = button.getAttribute('data-hege-checked');
        Core.scanAndInject();
        return {
            staleMarker,
            firstCount,
            recoveredCount: document.querySelectorAll('.hege-checkbox-container').length,
        };
    }, postFixture);
    await page.close();

    assert.deepEqual(result, {
        staleMarker: 'true',
        firstCount: 1,
        recoveredCount: 1,
    });
});

test('beta34 live checkbox prevents duplicate post injection', async () => {
    const page = await openPage();
    const result = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = fixture;
        Core.scanAndInject();
        Core.scanAndInject();
        return {
            count: document.querySelectorAll('.hege-checkbox-container').length,
            marker: document.querySelector('#more')?.getAttribute('data-hege-checked'),
        };
    }, postFixture);
    await page.close();

    assert.deepEqual(result, { count: 1, marker: 'true' });
});

test('beta34 post checkbox keeps inline badge datasets after factory unification', async () => {
    const page = await openPage();
    const result = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = fixture;
        Core.scanAndInject();
        const box = document.querySelector('.hege-checkbox-container');
        const icon = box?.querySelector('svg');
        const rect = icon?.querySelector('rect');
        const path = icon?.querySelector('path');
        return {
            inlineBadge: box?.dataset.hegeInlineBadge,
            inlineBadgeContext: box?.dataset.hegeInlineBadgeContext,
            username: box?.dataset.username,
            viewBox: icon?.getAttribute('viewBox'),
            rect: rect ? {
                x: rect.getAttribute('x'),
                y: rect.getAttribute('y'),
                width: rect.getAttribute('width'),
                height: rect.getAttribute('height'),
                rx: rect.getAttribute('rx'),
                ry: rect.getAttribute('ry'),
                stroke: rect.getAttribute('stroke'),
                strokeWidth: rect.getAttribute('stroke-width'),
                fill: rect.getAttribute('fill'),
            } : null,
            path: path ? {
                d: path.getAttribute('d'),
                fill: path.getAttribute('fill'),
                className: path.getAttribute('class'),
            } : null,
        };
    }, postFixture);
    await page.close();

    assert.deepEqual(result, {
        inlineBadge: 'true',
        inlineBadgeContext: 'post',
        username: 'virtualized_user',
        viewBox: '0 0 24 24',
        rect: {
            x: '2',
            y: '2',
            width: '20',
            height: '20',
            rx: '6',
            ry: '6',
            stroke: 'currentColor',
            strokeWidth: '2.5',
            fill: 'none',
        },
        path: {
            d: 'M6 12 l4 4 l8 -8',
            fill: 'none',
            className: 'hege-checkmark',
        },
    });
});

test('beta34 same host with another post checkbox still injects the current post', async () => {
    const page = await openPage();
    const result = await page.evaluate(async () => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = `
            <div id="shared-host" style="width:640px;height:160px">
                <a href="/@current_post_user">current_post_user</a><span>2 小時</span>
                <div id="current-more" data-post-id="post-current" role="button">
                    <svg aria-label="More" viewBox="0 0 24 24"><path d="M1 1" /></svg>
                </div>
                <div data-post-id="post-other">
                    <div class="hege-checkbox-container" data-hege-inline-badge-context="post" data-hege-inline-post-identity="post:other" data-username="other_post_user"></div>
                </div>
            </div>`;
        Core.scanAndInject();
        return {
            currentCount: document.querySelectorAll('.hege-checkbox-container[data-username="current_post_user"]').length,
            totalCount: document.querySelectorAll('.hege-checkbox-container').length,
            marker: document.querySelector('#current-more')?.getAttribute('data-hege-checked'),
        };
    });
    await page.close();

    assert.deepEqual(result, { currentCount: 1, totalCount: 2, marker: 'true' });
});

test('beta34 append failure does not leave a processed marker or checkbox', async () => {
    const page = await openPage();
    const result = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = fixture;
        const button = document.querySelector('#more');
        const parent = button?.parentElement;
        const originalAppendChild = parent?.appendChild;
        if (parent) parent.appendChild = () => { throw new Error('synthetic append failure'); };
        Core.scanAndInject();
        if (parent && originalAppendChild) parent.appendChild = originalAppendChild;
        return {
            marker: button?.getAttribute('data-hege-checked'),
            username: button?.dataset.username,
            count: document.querySelectorAll('.hege-checkbox-container').length,
        };
    }, postFixture);
    await page.close();

    assert.deepEqual(result, { marker: null, username: undefined, count: 0 });
});

test('beta34 recycled button changing account is reinjected with the new username', async () => {
    const page = await openPage();
    const result = await page.evaluate(async fixture => {
        const { Core } = await import('/core.js');
        document.body.innerHTML = fixture;
        const button = document.querySelector('#more');
        Core.scanAndInject();
        const first = document.querySelector('.hege-checkbox-container');
        const link = document.querySelector('a[href^="/@"]');
        if (link) {
            link.setAttribute('href', '/@recycled_account');
            link.textContent = 'recycled_account';
        }
        Core.scanAndInject();
        return {
            count: document.querySelectorAll('.hege-checkbox-container').length,
            usernames: Array.from(document.querySelectorAll('.hege-checkbox-container')).map(box => box.dataset.username),
            oldDetached: !!first && !first.isConnected,
            marker: button?.getAttribute('data-hege-checked'),
        };
    }, postFixture);
    await page.close();

    assert.deepEqual(result, {
        count: 1,
        usernames: ['recycled_account'],
        oldDetached: true,
        marker: 'true',
    });
});

console.log('beta34 checkbox stale-marker/factory-unification fixtures: PASS');
