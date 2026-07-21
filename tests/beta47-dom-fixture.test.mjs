import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

// This is an executable browser fixture, not a source-regex proxy.  It loads the
// production MoreLocator implementation into Chromium and exercises its real DOM
// selectors/scoping rules against small deterministic Threads-like fragments.
const locatorSource = await readFile(new URL('../src/more-locator.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

test.after(async () => {
    await browser.close();
});

async function newFixture(html, pathname = '/@fixture') {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    // Give the fixture a non-opaque origin so history.replaceState behaves like
    // a real Threads tab. The response body is replaced immediately afterwards.
    await page.goto(`https://threads.net${pathname}`, { waitUntil: 'commit', timeout: 8000 }).catch(() => {});
    await page.setContent(`<!doctype html><style>
        * { box-sizing: border-box; }
        body { margin: 0; width: 1200px; height: 900px; }
        header, article, [role="listitem"], [data-hege-more-scope] { position: relative; display: block; width: 700px; min-height: 80px; padding: 12px; }
        button, [role="button"] { display: inline-block; width: 28px; height: 28px; }
        svg { width: 20px; height: 20px; }
    </style>${html}`);
    await page.evaluate((path) => history.replaceState(null, '', path), pathname);
    await page.evaluate((source) => {
        // Evaluate in Playwright's isolated utility world so the live Threads
        // page CSP cannot block this deterministic fixture harness.
        const bundled = source.replace(/^export const /gm, 'const ') + '\nreturn MoreLocator;';
        window.__MoreLocator = Function(bundled)();
    }, locatorSource);
    return page;
}

async function locatorResult(page, expression, ...args) {
    return page.evaluate(({ expression, args }) => {
        // eslint-disable-next-line no-new-func
        return Function('args', `return (${expression});`)(args);
    }, { expression, args });
}

test('beta47 More locator DOM matrix: profile/post/row, links, routes and global controls', async () => {
    const page = await newFixture(`
      <header id="profile-root">
        <span>fixture_user</span><span>Followers 12 Following 4</span>
        <button id="profile-more" aria-label="More"></button>
        <button id="profile-shape"><svg><circle></circle><circle></circle><circle></circle></svg></button>
        <button id="profile-wrong-shape"><svg><circle></circle></svg></button>
      </header>
      <article id="post" data-pressable-container>
        <a href="/@fixture/post/123">fixture_user · 1h</a>
        <button id="post-more" aria-label="More"></button>
      </article>
      <div id="row" role="listitem">
        <a href="/@fixture">fixture_user</a>
        <button id="row-more"><svg aria-hidden="true"><circle></circle><circle></circle><circle></circle></svg></button>
      </div>
      <button id="global-more" aria-label="More"></button>
      <a id="interest-link" href="/search?q=interest"><button id="interest-more" aria-label="More"></button></a>
      <div role="dialog"><button id="dialog-more" aria-label="More"></button></div>
      <div role="menu"><button id="menu-more" aria-label="More"></button></div>
    `);

    const result = await page.evaluate(() => {
        const L = window.__MoreLocator;
        const byId = (id) => document.getElementById(id);
        return {
            profile: L.find(byId('profile-root'), { mode: 'profile', trustedRoot: true })?.id || null,
            post: L.find(byId('post'), { mode: 'post' })?.id || null,
            row: L.find(byId('row'), { mode: 'row' })?.id || null,
            global: L.find(byId('global-more'), { mode: 'profile' })?.id || null,
            link: L.find(byId('interest-link'), { mode: 'row' })?.id || null,
            dialog: L.find(byId('dialog-more'), { mode: 'profile' })?.id || null,
            menu: L.find(byId('menu-more'), { mode: 'profile' })?.id || null,
            profileCandidates: L.findCandidates(byId('profile-root'), { mode: 'profile', trustedRoot: true }).map(({ el }) => el.id),
        };
    });

    assert.equal(result.profile, 'profile-more');
    assert.equal(result.post, 'post-more');
    assert.equal(result.row, 'row-more');
    assert.equal(result.global, null, 'unscoped global More must not be used as a profile target');
    assert.equal(result.link, null, 'More nested in an interest/search link must be rejected');
    assert.equal(result.dialog, null, 'dialog More must not be used as a profile target');
    assert.equal(result.menu, null, 'menu More must not be used as a profile target');
    assert.deepEqual(result.profileCandidates, ['profile-more', 'profile-shape'], 'explicit aria candidate wins over shape fallback and wrong shape is dropped');
    await page.close();
});

test('beta47 route guard rejects search/tags and accepts ordinary profile/post routes', async () => {
    const page = await newFixture('<div></div>');
    const result = await page.evaluate(() => {
        const L = window.__MoreLocator;
        const routes = [
            { pathname: '/@alice', search: '' },
            { pathname: '/@alice/post/123', search: '' },
            { pathname: '/search', search: '?q=alice' },
            { pathname: '/search', search: '?serp_type=tags&q=topic' },
            { pathname: '/tags/topic', search: '' },
        ];
        return routes.map((locationLike) => ({
            ...locationLike,
            type: L.routeType(locationLike),
            unsafe: L.isUnsafeRoute(locationLike),
        }));
    });
    assert.deepEqual(result.map((r) => r.type), ['profile', 'post', 'search_tags', 'search_tags', 'tags']);
    assert.deepEqual(result.map((r) => r.unsafe), [false, false, true, true, true]);
    await page.close();
});

test('beta47 slow-load and empty-menu fixtures remain fail-closed', async () => {
    const page = await newFixture(`
      <header id="profile-root"><span>Followers 0</span></header>
      <div id="menu-host"></div>
    `);
    const initial = await page.evaluate(() => window.__MoreLocator.find(document.querySelector('#profile-root'), { mode: 'profile', trustedRoot: true }));
    assert.equal(initial, null, 'before More arrives, locator returns no target');

    const delayed = await page.evaluate(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        document.querySelector('#profile-root').insertAdjacentHTML('beforeend', '<button id="delayed-more" aria-label="More"></button>');
        return window.__MoreLocator.find(document.querySelector('#profile-root'), { mode: 'profile', trustedRoot: true })?.id || null;
    });
    assert.equal(delayed, 'delayed-more', 'a slow-loading More control is found once attached');

    const emptyMenu = await page.evaluate(() => ({
        target: window.__MoreLocator.find(document.querySelector('#profile-root'), { mode: 'profile', trustedRoot: true })?.id || null,
        menuItems: document.querySelectorAll('[role="menuitem"]').length,
    }));
    assert.equal(emptyMenu.target, 'delayed-more');
    assert.equal(emptyMenu.menuItems, 0, 'empty menu has no trusted action item; caller must not infer rate limit');
    await page.close();
});

test('beta47 unscoped global More is rejected even when page text looks like a profile', async () => {
    const page = await newFixture(`
      <div id="profile-copy">fixture_user Followers 12 Following 4</div>
      <button id="global-more" aria-label="More"></button>
    `);
    const result = await page.evaluate(() => window.__MoreLocator.find(document, { mode: 'profile' })?.id || null);
    assert.equal(result, null, 'profile text alone must not widen the profile scope to the page');
    await page.close();
});

test('beta47 private-state helper is scoped to the verified profile root', async () => {
    const page = await newFixture(`
      <div id="unrelated">Private account text from another card</div>
      <section id="profile-root"><span>fixture_user Followers 12</span></section>
    `);
    const result = await page.evaluate(() => {
        const L = window.__MoreLocator;
        return {
            verifiedPublic: L.detectPrivateProfileState(document.querySelector('#profile-root')),
            unscopedDocument: L.detectPrivateProfileState(document),
        };
    });
    assert.equal(result.verifiedPublic.private, false);
    assert.equal(result.verifiedPublic.known, true);
    assert.equal(result.unscopedDocument.known, false);
    await page.close();
});

test('beta47 navigation mismatch helper rejects search/tags after More click', async () => {
    const page = await newFixture('<div></div>');
    const result = await page.evaluate(() => {
        const L = window.__MoreLocator;
        return {
            profileToProfile: L.routeMatches('profile', 'profile', 'profile'),
            profileToPostFallback: L.routeMatches('profile', 'post', 'profile'),
            profileToSearch: L.routeMatches('profile', 'search_tags', 'profile'),
            tagsToTags: L.routeMatches('tags', 'tags', 'profile'),
        };
    });
    assert.deepEqual(result, {
        profileToProfile: true,
        profileToPostFallback: false,
        profileToSearch: false,
        tagsToTags: false,
    });
    await page.close();
});
