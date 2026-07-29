// 2.8.0 封鎖回歸：findProfileRoot 變成一票否決的身分閘門，過不了就整批失敗。
//
// 2.7.1 的 findMoreButton 是整頁寬鬆搜尋加評分，幾乎不會空手而回。2.8.0 改成
// 必須先同時認出「頭部的帳號名稱」與「頭部的動作按鈕」才准往下找「更多」，
// 而且沒有任何退路。名稱那一條要求文字一字不差且落在相對 root 0–280px 的位置帶，
// 版面一被擠開就整批 menu_not_found。
//
// 本次修法是「放寬」而不是「回到 2.7.1 的整頁搜尋」：保留身分證明，但改成
// 網址確認是本人個人頁 + DOM 有一處名稱對得上。認錯人的風險不放大，容錯拉回來。
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const locatorSource = await readFile(new URL('../src/more-locator.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

test.after(async () => browser.close());

// usernamePlacement:
//   'header' 名稱在頭部位置帶內（嚴格版可命中）
//   'pushed' 名稱被擠到位置帶外（嚴格版必失敗，放寬版該救回來）
//   'post'   名稱只出現在貼文裡（兩版都不該接受）
async function fixture({ usernamePlacement = 'header', route = '/@fixture_user' } = {}) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto('https://threads.net/', { waitUntil: 'commit', timeout: 8000 }).catch(() => {});
    const nameMarkup = '<span id="handle">fixture_user</span>';
    await page.setContent(`<!doctype html><style>
      body { margin: 0; width: 1200px; height: 2000px; }
      main { display: block; width: 760px; padding: 0; }
      #actions { padding-top: 20px; }
      button, [role="button"] { display: inline-block; width: 40px; height: 32px; }
      svg { width: 22px; height: 22px; }
      #handle { display: inline-block; padding: 4px; }
      #pushed { margin-top: 400px; }
      article { display: block; margin-top: 600px; }
    </style>
    <main id="main">
      <div id="actions">
        <button id="real-more"><svg><circle></circle><circle></circle><circle></circle></svg></button>
      </div>
      ${usernamePlacement === 'header' ? nameMarkup : ''}
      <div id="pushed">${usernamePlacement === 'pushed' ? nameMarkup : ''}</div>
      <article id="post">${usernamePlacement === 'post' ? nameMarkup : ''}<p>hello</p></article>
    </main>`);
    await page.evaluate((path) => history.replaceState(null, '', path), route);
    await page.evaluate((source) => {
        const bundled = source.replace(/^export const /gm, 'const ') + '\nreturn MoreLocator;';
        window.MoreLocator = Function(bundled)();
    }, locatorSource);
    await page.evaluate((source) => {
        const bundled = source.replace(/^import .*$/gm, '').replace(/^export const /gm, 'const ') + '\nreturn Core;';
        window.__Core = Function(bundled)();
    }, coreSource);
    return page;
}

const resolve = (page) => page.evaluate(() => {
    const root = window.__Core.findProfileRoot('fixture_user');
    return { found: !!root, id: root?.id || '', mode: window.__Core._lastProfileRootMode };
});

test('名稱在頭部時仍走嚴格判定，行為不變', async () => {
    const page = await fixture({ usernamePlacement: 'header' });
    assert.deepEqual(await resolve(page), { found: true, id: 'main', mode: 'strict' });
    await page.close();
});

test('名稱被擠出位置帶時，放寬路徑救回來（2.8.0 在此整批失敗）', async () => {
    const page = await fixture({ usernamePlacement: 'pushed' });
    const strictOnly = await page.evaluate(() =>
        !!window.__Core.findProfileHeaderUsernameElement(document.getElementById('main'), 'fixture_user'));
    assert.equal(strictOnly, false, '嚴格版必須先真的失敗，否則這個測試沒有守到東西');
    assert.deepEqual(await resolve(page), { found: true, id: 'main', mode: 'relaxed' });
    await page.close();
});

test('網址不是本人個人頁時，放寬不啟用（防止 SPA 空窗期封鎖到錯的人）', async () => {
    const page = await fixture({ usernamePlacement: 'pushed', route: '/@someone_else' });
    assert.deepEqual(await resolve(page), { found: false, id: '', mode: 'none' });
    await page.close();
});

test('停在動態牆等非個人頁路徑時，放寬不啟用', async () => {
    const page = await fixture({ usernamePlacement: 'pushed', route: '/' });
    assert.deepEqual(await resolve(page), { found: false, id: '', mode: 'none' });
    await page.close();
});

test('名稱只出現在貼文裡時不算佐證，放寬仍拒絕', async () => {
    const page = await fixture({ usernamePlacement: 'post' });
    assert.deepEqual(await resolve(page), { found: false, id: '', mode: 'none' });
    await page.close();
});

test('放寬路徑會留下 relaxedRoot 診斷欄位，且在安全欄位白名單內', () => {
    assert.match(coreSource, /RuntimeDiagnostics\.record\('root_resolve', 'relaxed', \{ relaxedRoot: true/);
    const boolKeys = coreSource.slice(coreSource.indexOf('const boolKeys'), coreSource.indexOf('for (const key of boolKeys)'));
    assert.match(boolKeys, /'relaxedRoot'/);
});
