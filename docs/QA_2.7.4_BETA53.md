# QA 2.7.4 Beta53

## Scope

- Follower collection reports bounded observed/eligible/skip breakdown, uses a profile total hint, and does not classify a virtualized partial list as `end` after one bottom observation.
- Clean-list Likes collection tolerates an already-selected Likes view, stages selection until collection succeeds, rolls back on tab/row/timeout failure, and renders failure toasts as warnings/errors.
- Collection results use `{ ok, complete, users, reason, counts }`; only `end`/`completed` with no unknown/truncated evidence may commit. `limit`/`limited`/partial/stall/timeout/tab failures never commit.
- Follower cap is derived from bounded `totalHint` (50–1000), and the summary explicitly reports cap/truncated state.
- Beta52 stop-button visibility and checkbox session-latch regressions remain locked.

## Red/green evidence

1. `node --test tests/beta53-follower-breakdown.test.mjs tests/beta53-clean-list-atomic.test.mjs`
2. `node --test tests/beta47*.test.mjs tests/beta48*.test.mjs tests/beta49*.test.mjs tests/beta50*.test.mjs tests/beta51*.test.mjs tests/beta52*.test.mjs tests/beta53*.test.mjs`
3. `node --check src/core.js && node --check src/dialog-collector.js && node --check src/ui.js && node --check src/main.js`
4. `git diff --check`

## 實際驗證（2026-07-21）

- 目標版本：`src/config.js` 已由 `2.7.4-beta52` bump 至 `2.7.4-beta53`；manifest 預期 `2.7.4.53`。
- beta53 targeted：`node --test tests/beta53-*.test.mjs` **8/8 PASS**。
- Full suite：`node --test tests/*.test.mjs` **68/68 PASS**；beta52 stop/checkbox、beta51 A/private/report/failure-list 與 beta50 privacy/close regressions 均 PASS。
- 整合判定：**0 個後續測試失敗、0 個 concurrency/契約 blocker**；本回合未新增 runtime 修正，僅完成 beta53 版號、文件、build 與 parity 收口。
- Follower UI／結果：confirm 摘要顯示 total hint、observed、eligible、duplicate/self-target/blocked/queued/unknown skips 與 partial/limited/scroll-stall reason；`threads_partial` 不再把虛擬化部分名單誤標 `end`。
- Clean-list atomicity：current Likes evidence 不需虛構 tab；tab retry、row/timeout failure 皆 staged 後 rollback pending/checked，failure toast 為 warning/error；成功才一次 commit。
- Complete allowlist/cap：只有 `end`／`completed` 且無 unknown、truncated、partial 證據才可 commit；`limited`、`threads_partial`、`scroll_stall`、`timeout`、`likes_tab_switch_failed` 等一律拒絕，並保留 bounded cap。
- API consumer audit：`collectFullDialogUsers` 的 core 與 `post-reservoir-engine` consumers 均讀 structured `{ ok, complete, users, reason, counts }`；無舊 `Array.isArray(fallbackUsers)` 假設。
- Source syntax：全 `src/` **19/19 PASS**；`git diff --check` PASS。

## Beta52／Beta51 保留界線

- beta52 stop/checkbox 的人工 PASS 記錄保留；本次以 regression tests 防退化。
- beta51 interest/private live PASS 與 private report/failure-list regression 保留；beta53 新增 follower/clean-list 仍未取得 live browser PASS。

## Build／artifact parity

`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` PASS；`src/config.js` `2.7.4-beta53`、UserScript `@version 2.7.4-beta53`、extension manifest 與三個 Chrome ZIP 均為 `2.7.4.53`。

- Artifact content SHA-256：`dist/extension/content.js` 與三個 ZIP 內 `content.js` 均為 `2dd445ccda867547becac9fd355a98cca08941fef52cc324f842cf05ced62749`；UserScript 為 `28f73e8b311c6f250badf0ec1f44d794dc9d63332b5e3c6d9b73bdd73f1c8d17`。
- Chrome ZIP archive SHA-256：`dist/extension.zip`、`dist/threads_blocker_chrome.zip`、`dist/threads_blocker_chrome_v2.7.4.53.zip` 均為 `149b26d13c98615bac0d28ddabd3347dd065c1249e5225d3a68f67d5f4cfc63c`；archive byte parity PASS。
- Build outputs syntax：dist source、UserScript 與三個 ZIP 內 `content.js` `node --check` PASS。

## 未驗證／人工

未驗證使用者目前 Chrome installed extension、live Threads 虛擬化粉絲名單（total hint 與 96/175 類 partial）、真實 Likes retry/rollback/timeout、CWS draft/live store、Safari/Firefox 實機與 production/network surface；不得把 fixture/build PASS 當作 live PASS。Edge 不在本回合範圍。
