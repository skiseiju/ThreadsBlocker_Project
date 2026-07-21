# ThreadsBlocker 2.7.4-beta51 QA 實際紀錄

## 結論

beta51 整合候選在保留共享 dirty worktree 的前提下完成；版本維持 beta，不是正式 release approval。未 stage、commit、deploy、publish、D1 mutation。

## 整合範圍與契約

| 契約 | 結論 |
|---|---|
| Interest-tag profile | scoped semantic `<button>` More；search/tags ancestor rejected；不做全域盲抓 |
| Private profile | 有 validated More 時繼續 More → menu → action → confirm；只有 gate 缺失才 `private_manual_required` |
| Private report profile | blocker 已修：private state 不在 More 前提前返回；成功走 More → menu → report path，後續 gate 缺失才 `private_manual_required` |
| Queue advance | private/manual/failed 移出 active、進 failed queue、`consecutiveRateLimits` 不增加並繼續下一筆 |
| Failed queue | legacy string 相容；bounded/local-only reason；單筆 retry/clear/open profile 與全部操作保留 |
| Profile followers | explicit rows only、50 cap、virtualized dedupe、bounded stall/stop、排除 self/target/blocked/queued；confirm 後才入 `BG_QUEUE` |
| Beta50 regression | Likes shared ancestor、clean-list lifecycle、status first row、three-no stop/close、automatic report closed-schema 不退化 |

## 實際驗證（2026-07-21）

- `node --test tests/*.test.mjs`：**50/50 PASS**。
- 整合判定：**private report gate blocker 已由 Luna 修正並整合；0 個後續測試失敗、0 個 concurrency/契約 blocker**。
- beta51 fixtures：`tests/beta51-failed-queue.test.mjs`、`tests/beta51-profile-followers.test.mjs`；`tests/beta50-private-block-flow.test.mjs` 覆蓋 private block 與 private report More/menu/report path 並 PASS。
- Source syntax：全 `src/` **19/19 PASS**；`git diff --check` PASS。
- Build：`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` PASS；`src/config.js` `2.7.4-beta51`、UserScript `@version 2.7.4-beta51`、extension manifest 與三個 Chrome ZIP 均為 `2.7.4.51`。
- Artifact content SHA-256：`dist/extension/content.js` 與三個 ZIP 內 `content.js` 均為 `d42ab45036febea76d2478ea904fab49b5b99873e0f60cb50a2f417877a1fc84`；UserScript 為 `789beb455a67e62d986b44cc264ab749405f279970751f980628e7d1bf9c5ebf`。
- Chrome ZIP archive SHA-256：`dist/extension.zip`、`dist/threads_blocker_chrome.zip`、`dist/threads_blocker_chrome_v2.7.4.51.zip` 均為 `84876763625cee8c26ddf4388ca17f1a618d06ba8c40e88f4ce6253384c81626`；archive byte parity PASS。
- Build outputs syntax：dist source、UserScript 與三個 ZIP 內 `content.js` `node --check` PASS。

## 未驗證／人工

使用者目前 Chrome installed extension、live Threads DOM、CWS draft/live store、Safari/Firefox 實機與 production/network surface 尚未驗證；不得把 fixture/build PASS 當作 live PASS。Edge 不在本回合範圍。

## 下一步

先以本次 build artifact 做人工 Chrome：interest-tag/private More gate、逐筆 failed queue actions、profile followers confirmation/stop/stall/50 cap；確認 source/build/installed version 分開記錄。
