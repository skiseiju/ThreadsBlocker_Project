# 歷史紀錄：2026-03-27 深度分析找到的 P0-P1 問題（beta18 時點）

> 歸檔自專案 memory（2026-07-28 遷移）。行號與檔案指涉皆為 **2.7.4 beta18 當時**的程式碼，
> 之後 SweepDriver 重寫與 2.8 拆結構已大幅改動，查現況請以現行程式碼為準。
> 本檔目的：留下「當時知道哪些問題、優先序怎麼排」的決策軌跡。

Full codebase review + Worker cross-window analysis completed 2026-03-27.

Key P1 issues (not yet fixed as of beta18):

1. **consecutiveRateLimits not persisted across reload** — worker.js:11,14-23. `saveStats`/`loadStats` omit this field. After `location.reload()`, rate limit detection resets to 0, weakening the 3-strike cooldown protection.

2. **VERIFY_PENDING orphan on tab close** — worker.js:469-473. No `beforeunload` handler. If Worker tab closes between writing VERIFY_PENDING and reload, the flag persists. Next Worker init processes it on wrong page → may incorrectly update block DB (worker.js:390-403 updates DB even when page doesn't match).

3. **Controller push + Worker shift race condition** — main.js:110-113 vs worker.js:445-448. Both read-modify-write BG_QUEUE via localStorage without atomicity. Controller's push can overwrite Worker's shift, causing duplicate processing.

4. **Popup blocker silent failure** — main.js:96. window.open in showConfirm callback may not count as direct user gesture. No feedback if blocked.

5. **Language-limited menu detection** — worker.js:902-916. Only Chinese (繁體) and English menu items recognized. Other Threads locales cause all blocks to return `rate_limited` → false cooldown after 3 failures.

6. **Turbo mode unsafe for slow networks** — config.js turbo multiplier 0.4 applies to page-load waits (worker.js:817,840). pollUntil has 2s minimum but speedSleep fallbacks don't, risking premature failure.

**當時的優先序判斷**：#1、#2 會造成資料損毀，優先修；穩定版（v2.3.1）出貨前至少要解 #1-#3。
