// BUGLIST #11：把 worker 視窗縮到很小之後，封鎖連續失敗。
//
// 2.8.1-beta7 的診斷給出決定性數字：失敗全部是 viewport 197x327，waitMs 都跑滿
// 12 秒，findProfileRoot 一直回 null；同一批在 800x533 下則全部成功。原因是兩處
// 用畫面絕對座標的判斷，在矮視窗下會把真正的「更多」整個濾掉：
//   1. MoreLocator.isVisible 要求元素與 viewport 有交集，折線以下的按鈕被當成不可見。
//   2. findProfileActionAnchor 的 header 幾何條件是 `top < min(innerHeight, 460)`，
//      視窗越矮允許帶越窄。
// 兩者都改成相對 root 的位移。這裡用真的小 viewport 把行為鎖住。
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const locatorSource = await readFile(new URL('../src/more-locator.js', import.meta.url), 'utf8');
const coreSource = await readFile(new URL('../src/core.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });

test.after(async () => browser.close());

// 模擬窄版面：內容欄變窄、頭部堆疊，動作列被擠到折線以下。
async function narrowProfile({ width, height }) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('https://threads.net/@fixture', { waitUntil: 'commit', timeout: 8000 }).catch(() => {});
    await page.setContent(`<!doctype html><style>
      body { margin: 0; }
      main, section { display: block; width: 100%; padding: 8px; }
      /* 頭部堆疊後動作列落在 y≈420，超過 327 的折線 */
      #spacer { height: 420px; }
      button, [role="button"] { display: inline-block; width: 36px; height: 36px; }
      svg { width: 22px; height: 22px; }
    </style>
    <main id="main"><section id="profile-root">
      <span>fixture_user</span>
      <p>Followers 12</p>
      <div id="spacer"></div>
      <div id="real-more" role="button"><svg aria-label="更多"><circle></circle><circle></circle><circle></circle></svg></div>
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
    return page;
}

test('197x327 的小視窗仍找得到 profile root 與更多按鈕', async () => {
    const page = await narrowProfile({ width: 197, height: 327 });
    const result = await page.evaluate(() => {
        const root = document.querySelector('#profile-root');
        const more = document.querySelector('#real-more');
        return {
            innerHeight: window.innerHeight,
            moreTop: more.getBoundingClientRect().top,
            visible: window.__MoreLocator.isVisible(more),
            actionId: window.__Core.findProfileActionAnchor(root)?.id || null,
            rootFound: !!window.__Core.findProfileRoot('fixture_user'),
        };
    });
    assert.ok(result.moreTop > result.innerHeight, `fixture must place More below the fold, got ${result.moreTop} vs ${result.innerHeight}`);
    assert.deepEqual(
        { visible: result.visible, actionId: result.actionId, rootFound: result.rootFound },
        { visible: true, actionId: 'real-more', rootFound: true },
    );
    await page.close();
});

test('同一份版面在大視窗下結果一致，改動沒有只針對小視窗開後門', async () => {
    const page = await narrowProfile({ width: 1200, height: 900 });
    const result = await page.evaluate(() => ({
        actionId: window.__Core.findProfileActionAnchor(document.querySelector('#profile-root'))?.id || null,
        rootFound: !!window.__Core.findProfileRoot('fixture_user'),
    }));
    assert.deepEqual(result, { actionId: 'real-more', rootFound: true });
    await page.close();
});

test('位置加權改用相對 root 的位移，不再讀畫面絕對座標', () => {
    assert.match(locatorSource, /offsetTop = rect\.top - \(rootRect\.top \|\| 0\)/);
    assert.doesNotMatch(locatorSource, /rect\.top < window\.innerHeight/);
    // 註解裡會引用舊條件，只檢查實際程式碼行。
    const codeLines = coreSource.split('\n').filter(line => !line.trim().startsWith('//'));
    assert.ok(
        !codeLines.some(line => line.includes('Math.min(window.innerHeight,')),
        'core.js must not clamp header geometry to the current viewport height',
    );
});
