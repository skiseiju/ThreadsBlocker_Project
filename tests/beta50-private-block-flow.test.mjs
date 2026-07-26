import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const locatorSource = await readFile(new URL('../src/more-locator.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const workerSource = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');
const reportSource = await readFile(new URL('../src/features/report-flow.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

test.after(async () => browser.close());

async function fixture({ privateProfile = false, actionMarkup = null } = {}) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto('https://threads.net/@fixture', { waitUntil: 'commit', timeout: 8000 }).catch(() => {});
    await page.setContent(`<!doctype html><style>
      body { margin: 0; width: 1200px; height: 900px; }
      main, header, section { display: block; width: 760px; min-height: 180px; padding: 16px; }
      section { margin-top: 140px; }
      button, [role="button"] { display: inline-block; width: 40px; height: 32px; }
      svg { width: 22px; height: 22px; }
      a { display: inline-block; padding: 8px; }
    </style>
    <main id="main"><section id="profile-root">
      <span>fixture_user</span>
      ${privateProfile ? '<p data-private="true">This account is private</p>' : '<p>Followers 12</p>'}
      <a id="interest-link" href="/tags/topic">topic</a>
      ${actionMarkup || '<button id="real-more"><svg><circle></circle><circle></circle><circle></circle></svg></button>'}
      <div id="menu-host"></div>
    </section></main>`);
    await page.evaluate(() => history.replaceState(null, '', '/@fixture'));
    await page.evaluate((source) => {
        const bundled = source.replace(/^export const /gm, 'const ') + '\nreturn MoreLocator;';
        window.__MoreLocator = Function(bundled)();
        window.MoreLocator = window.__MoreLocator;
    }, locatorSource);
    await page.evaluate((source) => {
        const bundled = source.replace(/^import .*$/gm, '').replace(/^export const /gm, 'const ') + '\nreturn Core;';
        window.__Core = Function(bundled)();
    }, coreSource);
    await page.evaluate(() => {
        const more = document.getElementById('real-more');
        more.addEventListener('click', () => {
            document.getElementById('menu-host').innerHTML = '<div role="menu"><button id="block-action">Block</button><button id="report-action">Report</button></div>';
            document.getElementById('block-action').addEventListener('click', () => {
                document.getElementById('menu-host').innerHTML = '<div role="dialog"><button id="confirm-action">Confirm</button></div>';
                document.getElementById('confirm-action').addEventListener('click', () => {
                    document.getElementById('profile-root').dataset.blocked = 'true';
                });
            });
            document.getElementById('report-action').addEventListener('click', () => {
                document.getElementById('menu-host').innerHTML = '<div role="dialog"><button id="report-confirm">Submit</button></div>';
                document.getElementById('report-confirm').addEventListener('click', () => {
                    document.getElementById('profile-root').dataset.reported = 'true';
                });
            });
        });
    });
    return page;
}

async function runBlockFixture(page) {
    return page.evaluate(() => {
        const root = document.querySelector('#profile-root');
        const more = window.__MoreLocator.find(root, { mode: 'profile', trustedRoot: true });
        more?.click();
        document.querySelector('#block-action')?.click();
        document.querySelector('#confirm-action')?.click();
        return {
            moreId: more?.id || null,
            coreRootFound: !!window.__Core.findProfileRoot('fixture_user'),
            coreActionId: window.__Core.findProfileActionAnchor(root)?.id || null,
            blocked: document.querySelector('#profile-root')?.dataset.blocked === 'true',
            pathname: location.pathname,
            unsafeAncestor: !!more?.closest('a[href*="/search"], a[href*="/tags"]'),
        };
    });
}

async function runReportFixture(page) {
    return page.evaluate(() => {
        const root = document.querySelector('#profile-root');
        const more = window.__MoreLocator.find(root, { mode: 'profile', trustedRoot: true });
        more?.click();
        document.querySelector('#report-action')?.click();
        document.querySelector('#report-confirm')?.click();
        return {
            moreId: more?.id || null,
            reported: document.querySelector('#profile-root')?.dataset.reported === 'true',
            pathname: location.pathname,
            unsafeAncestor: !!more?.closest('a[href*="/search"], a[href*="/tags"]'),
        };
    });
}

test('beta50 interest-tag profile uses the scoped semantic More and completes block/confirm', async () => {
    const page = await fixture();
    const result = await runBlockFixture(page);
    assert.deepEqual(result, {
        moreId: 'real-more',
        coreRootFound: true,
        coreActionId: 'real-more',
        blocked: true,
        pathname: '/@fixture',
        unsafeAncestor: false,
    });
    await page.close();
});

test('beta50 private profile still attempts validated More → block → confirm', async () => {
    const page = await fixture({ privateProfile: true });
    const result = await runBlockFixture(page);
    assert.equal(result.moreId, 'real-more');
    assert.equal(result.coreRootFound, true);
    assert.equal(result.coreActionId, 'real-more');
    assert.equal(result.blocked, true);
    assert.equal(result.pathname, '/@fixture');
    await page.close();
});

test('beta50 legal More outside legacy header geometry still resolves the profile root', async () => {
    const page = await fixture({
        actionMarkup: '<button id="real-more" style="margin-top:400px"><svg><circle></circle><circle></circle><circle></circle></svg></button>',
    });
    const result = await page.evaluate(() => {
        const root = document.querySelector('#profile-root');
        const action = window.__Core.findProfileActionAnchor(root);
        return {
            rectTop: document.querySelector('#real-more')?.getBoundingClientRect().top || 0,
            rootFound: !!window.__Core.findProfileRoot('fixture_user'),
            actionId: action?.id || null,
        };
    });
    assert.ok(result.rectTop >= 460, `fixture must be outside legacy geometry window, got ${result.rectTop}`);
    assert.deepEqual({ rootFound: result.rootFound, actionId: result.actionId }, { rootFound: true, actionId: 'real-more' });
    await page.close();
});

test('beta50 unsafe search ancestor keeps profile More resolution fail-closed', async () => {
    for (const href of ['/search?q=topic', '/tags/topic']) {
        const page = await fixture({
            actionMarkup: `<a id="unsafe-more-link" href="${href}"><button id="real-more"><svg><circle></circle><circle></circle><circle></circle></svg></button></a>`,
        });
        const result = await page.evaluate(() => ({
            rootFound: !!window.__Core.findProfileRoot('fixture_user'),
            actionId: window.__Core.findProfileActionAnchor(document.querySelector('#profile-root'))?.id || null,
        }));
        assert.deepEqual(result, { rootFound: false, actionId: null }, href);
        await page.close();
    }
});

test('beta50 Instagram and bell anchors keep their existing priority over More', async () => {
    for (const scenario of [
        {
            actionMarkup: `
                <button id="instagram"><svg aria-label="Instagram"></svg></button>
                <button id="bell"><svg viewBox="0 0 25 24"><path></path><path></path></svg></button>
                <button id="real-more"><svg><circle></circle><circle></circle><circle></circle></svg></button>
            `,
            expected: 'instagram',
        },
        {
            actionMarkup: `
                <button id="bell"><svg viewBox="0 0 25 24"><path></path><path></path></svg></button>
                <button id="real-more"><svg><circle></circle><circle></circle><circle></circle></svg></button>
            `,
            expected: 'bell',
        },
    ]) {
        const page = await fixture(scenario);
        const result = await page.evaluate(() => ({
            rootFound: !!window.__Core.findProfileRoot('fixture_user'),
            actionId: window.__Core.findProfileActionAnchor(document.querySelector('#profile-root'))?.id || null,
        }));
        assert.deepEqual(result, { rootFound: true, actionId: scenario.expected });
        await page.close();
    }
});

test('beta50 root/action resolver admits semantic buttons and never uses tag/search anchors', () => {
    const actionStart = coreSource.indexOf('findProfileActionAnchor');
    const actionBody = coreSource.slice(actionStart, actionStart + 2400);
    assert.match(actionBody, /querySelectorAll\(['"]a, div\[role="button"\], button['"]\)/);
    assert.match(actionBody, /aria-label/);
    assert.match(actionBody, /search|tags/i);
    assert.match(actionBody, /MoreLocator\.findCandidates\(root/);
    assert.match(reportSource, /getMoreButtonText\(el\)\s*\{\s*return MoreLocator\.textOf\(el\);/);
    assert.match(reportSource, /MoreLocator\.isMoreShape\(el\)/);
    assert.match(reportSource, /MoreLocator\.find\(profileRoot, \{ mode: 'profile', trustedRoot: true \}\)/);
});

test('beta50 private gate is downstream of validated More resolution', () => {
    const autoBlock = workerSource.slice(workerSource.indexOf('autoBlock: async'));
    const moreIndex = autoBlock.indexOf('Worker.findMoreButton(12000, user)');
    assert.equal(autoBlock.slice(0, moreIndex).includes("return 'private_manual_required'"), false, 'private text must not short-circuit before More resolution');
    assert.match(autoBlock, /recordDiagnostic\('more_resolve', 'success'\)/);
    assert.match(autoBlock, /recordDiagnostic\('confirm_resolve', 'success'\)/);
});

test('beta51 private report profile gate is downstream of validated More/menu/report path', async () => {
    const processNext = reportSource.slice(reportSource.indexOf('async processNext'));
    const moreIndex = processNext.indexOf('findProfileMoreButton(user)');
    const privateIndex = processNext.indexOf('privateProfile: privateState.private');
    assert.ok(moreIndex >= 0, 'profile report path must resolve validated More');
    assert.ok(privateIndex > moreIndex, 'private report signal must not short-circuit before More');
    assert.match(processNext, /recordSafetyDiagnostic\('menu_resolve', 'success'/);
    assert.match(processNext, /report_menu_click/);

    const page = await fixture({ privateProfile: true });
    const result = await runReportFixture(page);
    assert.deepEqual(result, {
        moreId: 'real-more',
        reported: true,
        pathname: '/@fixture',
        unsafeAncestor: false,
    });
    await page.close();
});
