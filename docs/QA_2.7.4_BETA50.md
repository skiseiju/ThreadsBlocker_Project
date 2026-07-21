# ThreadsBlocker 2.7.4-beta50 QA 計畫

## 結論先行

本文件是 beta50 的 regression-first QA 紀錄，不是 release approval。本輪已在保留既有 dirty 的前提下完成版本 bump、測試與本機 build；不 stage、commit、deploy、push 或發布。source 版本為 `2.7.4-beta50`，manifest 預期為 `2.7.4.50`。

工作樹已有使用者既存 dirty changes，全部保留；不得 reset、清理、以 incubator worktree 覆蓋主 repo，或拿歷史 zip 代替本次驗證 artifact。

本輪完成條件是：先新增可重現的 regression tests/fixtures 並讓缺口呈現為紅測試，再進行最小 implementation；targeted、全 tests、syntax、build/parity 與使用者目前 Chrome installed truth 全部通過後，才可由使用者另行決定是否進入 release QA。

## 1. 依據、現況與範圍

已讀：`AGENTS.md`、`PROJECT.md`、`docs/BLOCKING_ARCHITECTURE.md`、`docs/QA_2.7.4_BETA47.md`、`docs/QA_2.7.4_BETA48.md`、`docs/QA_2.7.4_BETA49.md`，以及目前的 `src/report-debug-context.js`、`src/more-locator.js`、`src/dialog-collector.js`、`src/core.js`、`src/worker.js`、`src/features/report-flow.js`、`src/features/three-no-watch.js`、`src/ui.js`、`src/config.js` 與現有 tests。

本輪範圍：

- A/B More／report／block 安全診斷的 privacy-safe phase、bounded counters 與 route/root 證據。
- D Likes collector 與 checkbox 顯示證據分層，包含 row boundary、shared ancestor、virtualization、unknown fail-closed。
- clean-list 注入、React DOM replacement/reparent、短暫可見 links、picker 與三種 action 的 listener idempotency。
- 主面板 controller 狀態列的明確狀態、active priority 與 stale `BG_STATUS` 優先序。
- 三無 stop command owner、state fence、bounded stop observation、terminal cleanup/close-once 與 race/reload/late worker。
- beta49 既有 More／report timing、Likes/Quotes、debug_context、launcher handshake、finishScan 與 build parity 回歸。

不在本輪：平台 ingest／D1／R2、公開統計、判定規則改寫、自動封鎖、正式發布、商店上傳、production deploy 或任何資料 migration。live Chrome 只作驗證，不以 live DOM 反推 selector 放寬；必須先完成 fixture 與 source contract，才由 live evidence 決定 root／More 的最小修法。

## 2. Regression-first 執行順序（強制）

### 2.1 先建 tests，後 implementation

先新增或擴充下列 deterministic tests；第一次執行預期因目前缺口而 FAIL，FAIL 證據只記錄 case id、enum、counts，不貼敏感 payload。所有紅測試具備最小 fixture、明確 assertion 與 bounded timeout 後，才允許修改 production implementation。

| Test artifact（規劃名稱） | 先鎖定的契約 |
|---|---|
| `tests/beta50-safety-diagnostics.test.mjs` | A/B phase enum、bounded counters、route/root fixture、debug_context 禁止欄位 |
| `tests/beta50-likes-checkbox.test.mjs` | shared ancestor、listitem/data-row boundary、virtualization、unknown fail-closed、checkbox/collector 分層 |
| `tests/beta50-clean-list-lifecycle.test.mjs` | React clone/replace/reparent、transient links、picker/action listener exactly-once |
| `tests/beta50-status-priority.test.mjs` | controller 第一列狀態、stale BG_STATUS 與 active priority |
| `tests/three-no-watch-beta50-stop-contract.test.mjs` | structured stop、owner/fence、await boundary、terminal cleanup、race/reload/duplicate click |
| `tests/three-no-watch-finish-scan.test.mjs`（既有測試更新） | `stopped` 的 `closeCalls: 0 → 1`，並保持 cursor/results/cleanup invariant |

測試全部建立後先跑 targeted red，再依最小修法逐組轉綠；不接受只用 source regex、單一 mock 或 build success 代替行為證據。每一組都要保留 unit/source、DOM fixture、installed truth 三層結果。

## 3. A/B 安全診斷與 More/root 決策

### 3.1 Privacy-safe phase 與 bounded schema

所有 block/report diagnostic event 必須使用固定 phase enum，不能用自由字串：

`root_resolve` → `more_resolve` → `navigation_check` → `menu_resolve` → `action_resolve` → `confirm_resolve` → `queue_advance`。

每個 event 只允許 closed schema 的 `phase`、`result`、`routeType`、`counts` 與 bounded timing fields。counts 必須包含並各自 bounded（非負有限整數、不得超過明確上限）：

- `moreCandidates`
- `menuItems`
- `confirmButtons`
- `postFallbackAttempts`
- `elapsedMs`
- `retryCount`

`elapsedMs`、`retryCount` 與各 count 均需在 append、storage reload、export 前再次 sanitize；NaN、負值、小數、超上限、陣列／物件替代值都 fail closed。每一個 phase 至多記錄實作所需的有限事件數，不能因 polling 無界膨脹。

`debug_context` 仍沿用 `threadsblocker.debug_context_v2` 的 closed schema；任何 snapshot、failure event、debug export、network payload 均不得出現：`username`、完整或截短 URL、DOM/HTML、可見 text、cookie、token、authorization、request/response body 或 raw metadata。禁止欄位即使放在 nested `debug`、`current`、`href`、`metadata` 或未知 key 也必須被移除，而不是僅靠 UI 隱藏。

### 3.2 Fixture matrix（normal/public/private/interest-tag/search/tags）

| Fixture | 必測 route/root | 預期 phase／結果 |
|---|---|---|
| normal public profile | 已驗證 profile root、單一 More、正常 menu/action/confirm | 依序走 root → More → navigation → menu → action → confirm → queue；counts bounded |
| private profile | profile root 內明確 private signal；overlay/dialog 另含同字串 | 在 `root_resolve`/`more_resolve` 可區分 `private_manual_required`；不得把 body/dialog 文案當 profile state |
| interest/tag card | More 嵌在 interest/tag link 或共享 card | `root_resolve` 或 `more_resolve` fail closed；不得點擊 link、不得觸發 Universal Links |
| `/search` | search route，含一般結果與 tag query | route type `search_tags`，不進 action；phase 可區分 route guard 與找不到 More |
| `/tags/...` | tags route，含看似 profile/post 的 More | route type `tags`，不進 action；不得 fallback 到全域／body More |
| delayed/empty menu | root/More 延遲出現、menu 無 items、confirm 無 buttons | retry 有界；`menu_resolve`／`confirm_resolve` 結果明確，不得誤報 rate limit 或成功 |

A/B 的 A 組是目前 selector/root 行為；B 組只在測試中提供替代 root/More fixture 以觀察證據差異，不能先放寬 production selector。只有 live Chrome 在上述 phase 提供可重現、無敏感資料的失敗證據後，才決定是否修正 root resolution 或 More locator，且一次只改最小 scope。

### 3.3 A/B gate

- PASS：每個 fixture 的 phase、route、result 可區分；counts/timing 全 bounded；debug schema scrub 完整；search/tags/interest 不導航。
- FAIL/blocker：任一候選依賴全域 `document.body`、共享 link、未驗證 shape、自由 text；任何敏感欄位進 snapshot/payload；retry 或 post fallback 無界；只用替代 fixture 宣稱 live 修好。

### 3.4 beta50 興趣標籤／auto-block 決策

| 決策項 | 結論 |
|---|---|
| beta49 已驗證的部分 | 不再跳到 `/search`／`/tags`；但興趣標籤目標仍可能在 profile root／More／menu／confirm gate 失敗。 |
| 證據邊界 | 現有證據不支持「搜尋頁 `querySelectorAll` 所有帳號 + null／死迴圈」推論；不得用猜測改 selector。 |
| 避免漏封鎖 | 不採用「過濾沒發文帳號」策略，合法目標不可因內容稀疏被排除。 |
| beta50 宣稱 | 只新增 closed phase diagnostics；A auto-block 不列 fixed。 |
| fail-closed 行為 | `private_manual_required`、`menu_not_found`、`navigation_mismatch` 等 per-user fail-closed 必須移出 active queue、加入 `FAILED_QUEUE`，並繼續下一筆。 |
| 下一步 | P0 先收集真實 failure phase，再做 A selector 的最小修正；不先猜、不放寬 selector。 |

### 3.5 4 月私人帳號回報決策

| 案例 | beta50 結論 | 證據／後續 |
|---|---|---|
| 私人帳號 auto-block | `private_manual_required`，仍是安全限制，未修、不可列 fixed | `src/worker.js`；不得把人工 fallback 說成自動修好 |
| 私人帳號連續 3 筆造成 cooldown／停機 | 已修 candidate：不增加 `consecutiveRateLimits`，移出 active queue、加入 `FAILED_QUEUE`、繼續下一筆 | `src/worker.js` queue-advance branch；`tests/beta47-safety-regression.test.mjs`、`tests/beta47-report-only-queue.test.mjs` |
| 失敗清單 UI | 目前只顯示總數，只有全部重試／只清除 | 逐筆帳號＋原因＋開啟個人頁手動處理列 beta51，不進 beta50 |
| 「封鎖某帳號的粉絲」 | 新功能，不是 stabilization 修正 | 延後 H 討論，另做 SDD／風險決策 |
| 12 小時後自動恢復／解除 | 目前文案正確，已修 | 不列 beta50 blocker |

## 4. D Likes collector 與 checkbox 證據分層

### 4.1 shared ancestor 與 row boundary fixture

建立一個共享 container fixture：第一列 `listitem`/data-row 沒有 heart，第二列有 heart；兩列共用上層 container、同時存在 activity UI 與 checkbox。預期 Likes collector 只回第二列，絕不能因在共享 ancestor 找到 heart 而把第一列收進 Likes。

Row scope 只能使用可驗證的 listitem/data-row boundary（例如 `role=listitem`、明確 data row key 或同等單列邊界）；禁止以共享 container、dialog root、全域 `querySelector` 或 username 去重後回查 DOM 分類。必測：

- 第一列 non-heart、第二列 heart，分類只以各自 row evidence 為準。
- virtualized list 移除第一批後加入第二批，已分類 Likes 必須累積且不重複。
- 無 row boundary、未知 role/data shape、heart selector 不明確時，結果為 unknown／fail closed，不得 fallback 全 users。
- Likes/Quotes 同 username 衝突保守排除；self、post owner、reply target 仍依既有 skip contract 排除。

### 4.2 checkbox UI 與 collector evidence 分層

checkbox UI 的「全 activity 可見 rows」是 visual inventory；collector 的 Likes 結果是 typed row evidence。兩者必須在 state、debug、報告與測試 assertion 中分開呈現，例如 `activityVisibleCount` 與 `collectorLikedCount`，不得把視覺上看到的混合 rows 當成 Likes collector 證據，也不得因 UI checkbox 顯示而自動寫入 Likes 結果。

測試需驗證：全 activity checkbox 可顯示第一列與第二列；collector result 只含第二列；切換 tab、scroll、virtualization、unknown schema 後兩個 count 仍各自正確且無 listener/資料重複。

## 5. clean-list 注入與 listener lifecycle

### 5.1 React DOM mutation matrix

以實際注入函式搭配 deterministic DOM/MutationObserver fixture 驗證：

1. 已存在 clean-list button 後由 React clone/replace；再次 inject 必須找到新 node、重新綁定 handler，舊 node 不再觸發。
2. button 被 reparent 到另一個已驗證 row/container；再次 inject 只保留一顆有效 button，handler 只觸發一次。
3. visible user links 短暫少於 2（例如 lazy load、tab 切換、virtualization）後再恢復；不得永久移除 button 或失去 handler，retry/observer 必須有界且可恢復。
4. 同一 picker 已開啟時重複 inject／mutation callback，不得重複 overlay、confirm/cancel handler 或提交動作。

### 5.2 picker 與 action exactly-once

對 picker opened、collect、report、endless 三種 action 各測：首次點擊只觸發一次；重複 click、合成 click、pointer/touch/click 連發、React rerender、storage refresh 不得重複加入 queue、重複開 worker、重複上傳或重複排程。每個 action 都要有 idempotency assertion（queue delta、report queue delta、reservoir delta、worker open calls、listener count）。

## 6. Controller status 與 stale priority

主面板 controller 第一列必須對每次 render 明確顯示以下 enum 之一，不得空白或 fallback 成含糊的「執行狀態…」：

`idle`、`block`、`report`、`three_no`、`sweep`、`stopping`、`stopped`、`failed`。

狀態判定規則要可測且優先序固定：

1. active stop/terminal state（`stopping`、`stopped`、`failed`）優先於其他 badge。
2. fresh active three-no/sweep/report/block 狀態優先於 stale 或過期 `BG_STATUS`。
3. stale `BG_STATUS` 不得顯示成 running、不得遮住可恢復 queue，也不得把 idle 誤報為 active。
4. 沒有 active work、沒有可恢復 queue 時才顯示 `idle`；任何未知／空白 state 要落到明確 `failed` 或 `idle`，並保留 bounded reason。

測試以 stale timestamp、active three-no、active sweep、block/report queue、stopping/stopped/failed 混合 storage fixture 驗證第一列文字、enum、stop button 顯示與 queue badge 不互相覆蓋。

## 7. 三無 stop、owner 與 terminal lifecycle

### 7.1 Structured command 與 owner fence

stop command 不得再是裸字串；必須是可驗證結構，至少包含 `command: 'stop'`、`scanId`、`ownerToken`、`requestedAt`，並在讀取時驗證型別、scanId/token match、時間 bounded。owner mismatch 必須拒絕且不得清除 winner lock/command、不得改寫 state。

heartbeat、late worker、reload、stale cleanup 寫入前都必須重讀 state/lock 並通過 owner fence：

- stale heartbeat write 不得覆蓋 `stopping` 或任何 terminal state。
- `stopping` 是 state fence；只有同 owner 的 terminal transition 或明確 cleanup 可以寫入，phase/heartbeat/debug/status 更新一律拒絕。
- terminal state 一旦寫入不可被 late `ready`/`scanning`/heartbeat/duplicate finish revive。

### 7.2 Bounded stop observation

worker 每個 `await` 前後、每個 phase boundary、每個 scroll/profile/action batch 都要做有界 stop observation；stop signal 到達後最多完成目前安全 atomic step，不能再開始下一個 profile/action。`safeSleep`、network wait、dialog polling、about/profile probe、upload wait 都必須有 deadline／retry cap；停止期間不允許無界等待或清掉未處理 cursor。

### 7.3 Terminal stopped contract

`stopped` 必須依固定順序完成：

1. 以同 owner 寫入 terminal state，保存 cursor、results、counts 與 bounded reason。
2. 確認 state write 成功後，清除 lock、structured stop command、session/local runtime backup。
3. 確認 cleanup 完成後，worker `window.close()` exactly once。

不得先 close 再保存資料、不得在 stop command 尚未驗證時清除 winner state、不得因 late worker 再次 close。`completed`/`failed` 亦需保持 terminal idempotency；`stopped` 不上傳不必要的 aggregate，且不得誤標全部未處理候選為已掃。

### 7.4 Required lifecycle tests

- 更新既有 `tests/three-no-watch-finish-scan.test.mjs`：`stopped` 的 `closeCalls` 預期由 0 改為 1。
- race：stop 與 profile/phase completion 同時發生，只能有一個 terminal writer。
- late worker/late heartbeat：terminal 或 stopping 後所有寫入拒絕，cursor/results/lock 不倒退。
- worker reload：讀 runtime backup/cursor 後可續跑，不能重掃已完成候選或清空 stopped results。
- duplicate click：兩次 stop/兩個 tab 只產生一個 structured command、一次 terminal cleanup、一次 close。
- owner mismatch：錯 token 不能 stop、finish、clear lock 或覆蓋 state。

## 8. 回歸測試與驗證 gate

### 8.1 Targeted gate（先跑）

```sh
node --test \
  tests/beta50-safety-diagnostics.test.mjs \
  tests/beta50-likes-checkbox.test.mjs \
  tests/beta50-clean-list-lifecycle.test.mjs \
  tests/beta50-privacy-dataflow.test.mjs \
  tests/beta50-status-priority.test.mjs \
  tests/three-no-watch-beta50-stop-contract.test.mjs \
  tests/three-no-watch-finish-scan.test.mjs \
  tests/beta47-debug-context.test.mjs \
  tests/beta47-dom-fixture.test.mjs \
  tests/beta47-report-context.test.mjs \
  tests/beta47-report-only-queue.test.mjs \
  tests/beta47-safety-regression.test.mjs \
  tests/beta49-dialog-collector.test.mjs \
  tests/beta49-build-parity.test.mjs \
  tests/report-flow-timing.test.mjs \
  tests/three-no-watch-beta48-launcher-contract.test.mjs
```

### 8.2 Full tests、syntax、build/parity

```sh
node --test tests/*.test.mjs
node --check src/report-debug-context.js
node --check src/more-locator.js
node --check src/dialog-collector.js
node --check src/core.js
node --check src/worker.js
node --check src/features/report-flow.js
node --check src/features/three-no-watch.js
node --check src/ui.js
SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump
node --check dist/extension/content.js
unzip -p dist/extension.zip content.js | node --check --input-type=commonjs
```

build/parity gate 必須核對 `src/config.js`（本輪維持 beta50）、UserScript banner、extension manifests、`dist/extension/content.js`、本次 build 的 `dist/extension.zip` 與版本化 Chrome zip 的版本與內容 hash；確認 beta-only background、bundle order、無歷史 artifact 混入。任何 source/test/docs-only dirty 變更都不能被誤算成 runtime artifact。

### 8.3 Installed Chrome truth（不可由 fixture 代替）

使用者需先提供目前 Google Chrome profile 中 Threads tab 的版本、URL 類型、已載入 extension 版本；不要提供 cookie、token、帳號名單、完整貼文或 request body。只載入本次 build 的 unpacked extension，逐項驗證：

1. normal/public/private/interest/tag/search/tags route 的 More/root phase 與 no-navigation guard。
2. activity dialog 的 shared ancestor、Likes/Quotes、virtualization、unknown fail-closed；UI checkbox count 與 collector evidence 分層。
3. React clone/replace/reparent、links 暫少於 2、picker open、collect/report/endless 重複 click；每項確認 handler/queue/action exactly-once。
4. 主面板 idle/block/report/three_no/sweep/stopping/stopped/failed 第一列，以及 stale BG_STATUS 與 active priority。
5. 三無啟動後在 collecting、profile probe、reload、切 tab/失焦、stop race、duplicate click、late worker 各測一次；只回報 enum/counts/cleanup/closeCalls。

installed truth 回報格式：`case → PASS/FAIL → source/build/installed version → phase/status/result → bounded counts → cursor/results/lock cleanup → closeCalls`。不得把 headless fixture、HTML preview 或 build success 當作目前 Chrome truth。

## 9. Privacy、rollback 與 PASS/FAIL

### Privacy gate

自動問題回報 attachment、beta50 `debug_context_v2`、QA artifact、console 摘要與 network inspection 只保存 enum、bounded counts、phase/status、時間與版本；不得保存 username、URL、DOM/HTML、text、cookie、token、authorization、raw metadata 或 request/response body。beta-only 的 `exportLastReportDebug`／`exportThreeNoDebug` 是使用者主動本機下載路徑，明確不進自動回報；其完整 local evidence 不得被誤算成 network payload。若敏感欄位進入自動回報或 beta50 diagnostics，立即判定 privacy blocker，停止擴大 live 測試。

### Rollback reference

本輪未重新 build／驗證 beta49 artifact；rollback reference 沿用 QA beta49 所記錄的 source/artifact，不能把本輪 beta50 build 視為 beta49 rollback proof。若 beta50 任一 blocker，停用／移除本次 beta50 unpacked build，只有在取得並核對該 verified beta49 artifact 後，才可只讀核對 block/report queue、three-no state/cursor/results、lock/command/runtime 與 preference；不執行 migration、資料寫入、deploy 或發布。不得使用歷史未驗證 zip、installed profile 目錄或 incubator artifact。

### PASS / FAIL gate

**PASS**：所有 regression tests 先紅後綠；A/B phase、bounded diagnostics、privacy schema、Likes row boundary、checkbox evidence split、clean-list exactly-once、controller status priority、three-no owner/fence/stop/terminal cleanup 全通；targeted/full/syntax/build/parity 與 installed Chrome truth 均有證據；無未授權外部 mutation。

**FAIL / blocker**：先 implementation 後補測試、selector/root 未經 live evidence 即放寬、任一 More/navigation 誤點、Quotes/共享 ancestor 混入 Likes、unknown fallback 全 users、短暫 links 導致永久漏注入、picker/action 重複 listener、controller 第一列空白或 stale BG_STATUS 蓋 active、owner mismatch/late heartbeat 覆蓋 stopping/terminal、stop close 早於 persist/cleanup、`stopped` closeCalls 非 1、cursor/results 遺失、任一 privacy 禁止欄位外洩、artifact parity/syntax/build 失敗，或只以 fixture/build 冒充 installed truth。

## 10. 本輪收口

- 本輪保留所有既有 dirty，並只在需求範圍內更新 `src/core.js`、`src/features/three-no-watch.js`、`tests/`、`CHANGELOG.md` 與本文件；版本維持 `2.7.4-beta50`，未 stage、commit、deploy、push 或發布。
- 進入 implementation 時，必須先依第 2 節建立並執行 regression tests，再以最小 diff 逐組修正；任何超出本計畫的安全等級、資料契約或持續成本擴張需另行確認。
- 未取得使用者目前 Chrome 的版本、installed extension breadcrumb 與 live case 結果前，不宣稱 beta50 ready。

## 11. beta50 實際驗證紀錄（2026-07-20）

- 初始 blocker reproduction：新增 status 對抗測試、privacy data-flow 測試與 fake-timer/closeCalls 測試先各自重現失敗；修正後 full gate `node --test tests/*.test.mjs` **39/39 PASS**。`node --check` 逐一檢查 `src/` **19/19 PASS**。
- Blocker resolution：stale `BG_STATUS` terminal 不再壓過 fresh three-no；自動問題回報改送 closed `bug_report_diagnostics_v2`（只含 enum、bounded counts、elapsed/retry、時間/版本），並移除 consent upload 的 client-environment attachment；完整 report/three-no debug export 保留為使用者主動本機匯出；duplicate finish 與 close exception 均只呼叫 `window.close()` 一次，且 persist/cleanup 先完成。
- Targeted 契約：上述 QA 8.1 指定的 16 個 test files 執行結果 **39/39 PASS**。A/B closed privacy phase、Likes shared-ancestor row boundary、clean-list React replacement/rebind exactly-once、controller 第一列 status priority、structured stop owner fence／late heartbeat／stopped persist-cleanup-close-once 均由 beta50 tests 覆蓋並 PASS；另 beta47/beta48/beta49 與 report timing 回歸亦 PASS。
- 版本與 build：`src/config.js` 維持 `2.7.4-beta50`；執行 `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` PASS，產生本次 `dist/extension`、`dist/extension.zip`、`dist/threads_blocker_chrome.zip`、`dist/threads_blocker_chrome_v2.7.4.50.zip`、UserScript 與 Firefox artifacts。extension manifest 為 `2.7.4.50`；source／userscript／manifest／三個 Chrome zip 內容與 SHA-256 parity PASS；三個 Chrome zip archive SHA-256 均為 `52823ee43a3b23e9c2a0d5904065f7d02f8cf8441f5e802dfa260c594509fd09`，`content.js` SHA-256 均為 `937ee01440f235302d0a5e163986f7ac6edb63940efdefeb83d24d4f9132a05a`，UserScript SHA-256 為 `405fca4293099a3b53e9e98e7a5bb1a04cb15d773a5fb7cc638ee12428c6d5d3`；`dist/extension/content.js`、UserScript、zip 內 `content.js` syntax PASS；`git diff --check` PASS。
- Artifact scope：只採本次 build 產物，不使用歷史 zip、installed profile 或 incubator artifact；Safari deploy 依旗標跳過。
- 未驗證：目前使用者 Chrome installed extension／live Threads tab、CWS draft/live store、Safari 實機、Firefox/Chrome store upload 與所有 network/production surface；本地 fixture/build 結果不能代替 installed truth。
- Edge 依本回合要求不處理，因此不列為本回合 blocker；Chrome installed/live 仍未驗證。

## 12. beta50 程式／測試結論與下一版優先順序

| 項目 | 狀態 |
|---|---|
| D Likes shared ancestor | code/test fixed candidate |
| clean-list lifecycle | code/test fixed candidate |
| controller status first row／stale priority | code/test fixed candidate |
| three-no stop／persist-cleanup-close-once | code/test fixed candidate |
| automatic report closed-schema | code/test fixed candidate |
| A auto-block（興趣標籤含 root/More/menu/confirm gate） | **未修，不得列 fixed** |
| 私人帳號 auto-block | **未修，`private_manual_required` 安全限制** |
| 39/39 full tests、build/parity、independent QA | PASS |
| installed/live browser | 未驗證；Edge 依要求不處理，非本回合 blocker |

固定優先順序：

1. **P0**：收集 beta50 phase diagnostics 後修 A selector；需要真實 failure phase，不猜、不先放寬。
2. **P1**：逐筆失敗／手動處理 UI（帳號、原因、開啟個人頁）。
3. **P2**：粉絲封鎖另做 SDD／風險決策。
