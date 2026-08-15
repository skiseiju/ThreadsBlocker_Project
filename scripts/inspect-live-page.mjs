#!/usr/bin/env node
/**
 * 連上使用者正在使用的 Chrome，直接檢查 Threads 頁面的實機狀態。
 *
 * 目的：這類「只在實機出現」的 DOM 問題（勾選框漏注入、可見性判定、
 * 版面錯位）過去只能請使用者手動貼 console 指令，一來一回六七次才
 * 定位得到根因。連上 CDP 之後由開發端直接讀 DOM，一次到位。
 *
 * 前置（使用者端一次性）：
 *   1. 完全關閉 Chrome
 *   2. open -a "Google Chrome" --args --remote-debugging-port=9222
 *      （沿用原本的 profile，登入狀態保留）
 *
 * 用法：
 *   node scripts/inspect-live-page.mjs                    # 預設：勾選框覆蓋率診斷
 *   node scripts/inspect-live-page.mjs --eval "expr"      # 執行任意運算式並印回傳值
 *   node scripts/inspect-live-page.mjs --shot out.png     # 順便截圖
 *
 * 唯讀為原則：預設診斷不會改動頁面狀態，只讀 DOM 與座標。
 */

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const CDP_URL = process.env.CDP_URL || 'http://localhost:9222';

const args = process.argv.slice(2);
const argOf = name => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
};

// 預設診斷：把每個「更多」按鈕的注入結果與判定條件一次攤開。
// 與 src/core.js 的 isInlinePostElementContext 判定條件保持同構，
// 若該處邏輯變更，這裡要同步，否則診斷結論會誤導。
const DEFAULT_PROBE = `(() => {
  const S = 'svg[aria-label="更多"],svg[aria-label="More"]';
  const T = /(?:剛剛|昨天|今日|今天|\\d{4}[/-]\\d{1,2}[/-]\\d{1,2}|\\d+\\s*(?:秒|分鐘|分|小時|時|天|週|周|個月|月|年)|\\d+\\s*(?:s|m|h|d|w|mo|y)\\b)/i;
  const btns = [...document.querySelectorAll(S)]
    .map(s => s.closest('div[role="button"]'))
    .filter(Boolean);
  const rows = btns.map((b, idx) => {
    const box = !!b.parentElement?.querySelector('.hege-checkbox-container');
    let user = '';
    for (let p = b.parentElement, i = 0; i < 5 && p; i++, p = p.parentElement) {
      const a = p.querySelector('a[href^="/@"]');
      if (a) { user = a.getAttribute('href').split('/@')[1].split('/')[0].toLowerCase(); break; }
    }
    let context = '', passes = false, passDepth = -1;
    for (let n = b.parentElement, d = 0; n && d < 8; n = n.parentElement, d++) {
      const moreCount = n.querySelectorAll(S).length;
      const raw = (n.innerText || '').trim();
      const text = raw.replace(/\\s+/g, ' ');
      if (!context && text.length > 5) context = text.slice(0, 30);
      if ((text.length <= 260 || moreCount === 1) && user && text.toLowerCase().includes(user) && T.test(text)) {
        passes = true; passDepth = d; break;
      }
    }
    return {
      idx,
      hasCheckbox: box,
      postContext: passes,
      passDepth,
      marker: b.getAttribute('data-hege-checked') || null,
      identity: b.dataset.hegeInlinePostIdentity || null,
      user: user || null,
      top: Math.round(b.getBoundingClientRect().top),
      preview: context,
    };
  });
  return {
    url: location.pathname,
    version: document.querySelector('#hege-panel')?.innerText?.match(/2\\.\\d+\\.\\d+[-\\w.]*/)?.[0] || null,
    total: rows.length,
    missing: rows.filter(r => r.postContext && !r.hasCheckbox).length,
    rows,
  };
})()`;

const main = async () => {
    let browser;
    try {
        browser = await chromium.connectOverCDP(CDP_URL);
    } catch (error) {
        console.error(`無法連上 ${CDP_URL}：${error.message}`);
        console.error('請確認 Chrome 已完全關閉後，以下列指令重新啟動：');
        console.error('  open -a "Google Chrome" --args --remote-debugging-port=9222');
        process.exitCode = 1;
        return;
    }

    const pages = browser.contexts().flatMap(context => context.pages());
    const page = pages.find(p => /threads\.(com|net)/.test(p.url()));
    if (!page) {
        console.error('找不到 Threads 分頁。目前開啟的分頁：');
        pages.forEach(p => console.error('  ' + p.url()));
        await browser.close();
        process.exitCode = 1;
        return;
    }

    const expression = argOf('--eval') || DEFAULT_PROBE;
    const result = await page.evaluate(expression);
    console.log(JSON.stringify(result, null, 2));

    const shot = argOf('--shot');
    if (shot) {
        await writeFile(shot, await page.screenshot({ fullPage: false }));
        console.error(`截圖已存至 ${shot}`);
    }

    // connectOverCDP 的 close 只切斷連線，不會關閉使用者的瀏覽器。
    await browser.close();
};

main();
