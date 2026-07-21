# ThreadsBlocker 2.7.4-beta52 測試計畫

## 範圍

- P0：清理名單的實際 dialog/root/row/collector gate；Likes 只接受可證明的 heart row，Quotes/unknown 不混入；React replacement、virtualization、短暫 links < 2 可恢復，找不到時回 bounded reason。
- P0：背景封鎖/檢舉/三無停止按鈕 visibility latch；BG_STATUS stale、queue/storage event、navigation 與 stop → stopping → stopped 不閃爍。
- P0：封鎖 session 的 checkbox selection snapshot/latch 與待選 UI 分離；queue 逐筆移除、storage refresh、React replacement 不反覆 checked/unchecked。
- P1：粉絲收集文案、初始 load/render observation、真實 row shape（單一 profile anchor + 同列 native action/badge）、empty/end 與 rows_unknown 分離；確認後才加入 BG_QUEUE。
- Lifecycle fixture：followers dialog 先以 0 rows mount，延遲 render 兩個 valid follower rows；collector 不得在注入前 terminal，最後必須收集 2 人。

## 紅→綠 gate

1. `node --test tests/beta52-*.test.mjs`：先確認 boundary、initial-end、stop latch、checkbox latch 與 follower UX 測試在修正前失敗。
2. 最小修正後重跑 beta52，接著跑 beta47–51 regressions、`node --check` 受影響 source、`git diff --check`。
3. 本回合不 stage、commit、deploy 或 D1；fixture/source/build PASS 不等同 live Threads PASS。

## 實際驗證（2026-07-21）

- 目標版本：`src/config.js` 已由 `2.7.4-beta51` bump 至 `2.7.4-beta52`；manifest 預期 `2.7.4.52`。
- beta52 targeted：`node --test tests/beta52-*.test.mjs` **10/10 PASS**。
- Full suite：`node --test tests/*.test.mjs` **60/60 PASS**；包含 beta51 private report、failure-list、follower regressions，以及 beta50 stop/close/privacy regressions。
- 整合判定：**0 個後續測試失敗、0 個 concurrency/契約 blocker**；本回合未新增 runtime 修正，僅完成 beta52 版號、文件、build 與 parity 收口。
- Clean-list／Likes：button → bounded row inventory → collector call chain 共用 `DialogCollector` helper；shared ancestor 不回退為 Likes evidence。
- Follower lifecycle：profile entry → dialog → bounded collector → confirm → `BG_QUEUE`；initial-render bounded gate 等待延遲注入；0 evidence 回 `rows_missing` 且 `ok:false`，unknown rows 回 `rows_unknown`，只有明確空狀態才回 `empty_end`，與 `end` 分開。
- 延遲注入 fixture：dialog 先以 0 rows mount，200ms 後注入兩個 valid follower rows；collector 最終收集 2 人且不會提前 terminal `empty_end`。
- Stop／selection：storage-backed stop latch 在 terminal 且無 active work 後清除；selection snapshot 與 active queue 分離，running queue shift 不清掉 checked，terminal drain 後不永久 checked。
- Source syntax：全 `src/` **19/19 PASS**；`git diff --check` PASS。

## Beta51 保留界線

- beta51 已記錄的 interest-tag 與 private auto-block live PASS 保留，不因 beta52 regression 重新宣稱或改寫。
- beta51 private report、failure-list 與 beta50 stop/close/privacy 以本次 full suite regression PASS 證明；beta52 新增 row/lifecycle/latch 仍是 fixture/source contract。

## Build／artifact parity

`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` PASS；`src/config.js` `2.7.4-beta52`、UserScript `@version 2.7.4-beta52`、extension manifest 與三個 Chrome ZIP 均為 `2.7.4.52`。

- Artifact content SHA-256：`dist/extension/content.js` 與三個 ZIP 內 `content.js` 均為 `3b50f057cef011e19b0a1701db00afe95d41f057ff1865606e826a7a2495794a`；UserScript 為 `7ef8f578245d3c3177464694376fa27f7c5b6fdfb0e9845588d07d9513285335`。
- Chrome ZIP archive SHA-256：`dist/extension.zip`、`dist/threads_blocker_chrome.zip`、`dist/threads_blocker_chrome_v2.7.4.52.zip` 均為 `963ff6812c35f8d12c5d7ed0012e7ff8f0685af2b1e00a33e49f8d6e2481527b`；archive byte parity PASS。
- Build outputs syntax：dist source、UserScript 與三個 ZIP 內 `content.js` `node --check` PASS。

## 未驗證／人工

beta52 尚未驗證使用者目前 Chrome installed extension、live Threads DOM 的真實 row shape、0-row 初始載入與 stop/checkbox React timing、CWS draft/live store、Safari/Firefox 實機與 production/network surface；不得把 fixture/build PASS 當作 live PASS。Edge 不在本回合範圍。
