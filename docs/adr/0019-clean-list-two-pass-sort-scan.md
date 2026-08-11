# ADR 0019：清理名單採兩種排序各掃一輪

- 日期：2026-08-10
- 狀態：已採納並實作（2.8.4-beta10；第一輪空白邊界補於 2.8.4-beta16；手動停止的結算語意由 [ADR 0020](0020-clean-list-stop-settles-collected-users.md) 補充）
- 相關：[ADR 0003](0003-merge-dialog-buttons.md)（清理名單入口）、[ADR 0004](0004-engagement-strategy-order.md)（Likes dialog 開啟順序）、[ADR 0017](0017-likes-progress-idle-timeout.md)（每輪依最後進度停止）、[ADR 0018](0018-clean-list-likes-latest-sort.md)（排序 locator、選取驗證與 retry）、`src/core.js`、`src/config.js`、`tests/beta99-clean-list-latest-sort.test.mjs`

## 背景

ADR 0018 原本要求清理名單在收集前先切成「最新」，用來避開 Threads「預設」排序只提供約 82 筆精選結果的限制。Beta9 另補上切換未生效時重新取得 live dialog／trigger 並重試一次。

使用者實際操作後改定流程：第一次先把目前排序掃完；依 ADR 0017 連續 5 秒沒有新帳號或捲動進度後，再切換排序並掃第二次。這能保留兩種排序各自才會提供的帳號，不必把其中一種來源事先丟掉。

## 決策

- 只有「清理名單」使用兩輪 orchestrator；定點絕、reservoir 與其他 `collectFullDialogUsers()` caller 維持單輪行為。
- 第一輪不先動排序，直接沿用目前排序收集。除下述 verified 空白 probe 外，第一輪必須通過既有完整性契約；預設 production 停止條件仍是最後一次進度後連續 5000ms 無變化。
- 第一輪完整結束後才開啟目前 Likes dialog 的 scoped 排序選單。若「最新」目前未選取，第二輪切到「最新」；若第一輪本來已是「最新」，只在排序選單恰有兩個可見選項時切到唯一另一項，確保第二輪不是相同排序重掃。
- 排序切換沿用 ADR 0018 的 portal menu 隔離、選取標記 double-check、React trigger 重抓與最多一次自動 retry。切換未驗證成功時不得開始第二輪。
- 第二輪重新使用同一個單輪 collector，因此同樣有 5 秒無進度期限、每輪 800 次捲動上限、初始版面等待與手動停止。排序切換等同重新載入名單；只要目前 dialog 的 loading indicator 仍可見，就暫停一般 idle 結束判定，最多 30 秒後回到原本的最後進度期限。這項保護不以第一輪必須剛好 0 人為前提，因為 React 可能在重載期間暫留 1 列舊資料。兩輪結果以大小寫不敏感的 username 去重合併，合併後仍受 1000 人安全上限約束。
- 第一輪若已確認為 Likes、等待版面後仍是 0 個 raw visible rows，且沒有 unknown／truncated 證據，允許繼續探測第二種排序。Likes 的直接計數標題可由語意 heading 或既有 scoped dialog title resolver 識別；Threads 實機的 `1,744個讚` 可能只是一般可見元素，不得因缺少 `h1/h2/[role="heading"]` 而降級成非 Likes 名單。切到「最新」後，初始載入等待只觀察目前 Likes dialog 內可見的 loading indicator（實機標記為 `role="status" aria-label="載入中……"`）：indicator 存在時最多等 30 秒，消失後需連續三次觀察確認；抓不到 indicator 時以 15 秒 fallback 判定。看到第一列後仍回到既有 5 秒 idle deadline。這只代表可嘗試切換，不把空白第一輪單獨視為可提交：沒有排序控制、切換失敗或第二輪不完整時仍維持 fail-closed／rollback；只有第二輪完整時才可提交合併結果。
- 除 ADR 0020 定義的使用者手動「停止並結算」外，兩輪都必須完整且沒有 unknown／truncated 結果才可交給既有 atomic commit。第一輪成功但排序或第二輪非手動失敗時，回傳空名單並由既有 rollback 恢復操作前狀態。
- 舊版面完全沒有排序控制時，保留 ADR 0018 的相容行為：只提交已完整完成的第一輪；粉絲／追蹤中等非 verified Likes 名單不進排序第二輪。

## 取代範圍

本 ADR 只取代 ADR 0018 的「收集前先切最新」時序。ADR 0018 的 scoped trigger、精確「最新」辨識、portal menu 隔離、選取驗證、bounded retry 與 fail-closed 原則繼續有效。

## 驗證邊界

- Red-first fixture 在舊版 5 項中有 4 項失敗：沒有兩輪入口、仍在收集前切最新，也不能切換到另一排序。
- Beta10 fixture 驗證第一輪已捲動且超過縮短後的 idle deadline 才點排序、Default 83 筆與 Latest 140 筆合併為 141 筆、直接計數 Likes 標題同樣完成兩輪。
- 第二輪 `scroll_stall` fixture 驗證第一輪即使完整，也會回傳空名單與不完整結果，不會外洩半套名單。
- 排序 fixture 驗證第一次 click no-op、React 替換 trigger 後第二次成功，以及第一輪已是 Latest 時能切到唯一另一項；兩次 click 都 no-op 時仍以 `likes_sort_switch_failed` 結束。
- Stacked-dialog fixture 驗證第一輪 context 已變成隱藏 Activity dialog 時，排序階段會重新取得目前最上層的 live Likes dialog，不會誤判成沒有排序控制而跳過第二輪。
- Beta16 production-path fixture 驗證第一輪 verified Likes 0 列仍會切到另一排序，且 dialog loading 持續 20 秒（超過 15 秒 fallback）時會繼續等待並取得完整第二輪；generic count fixture 使用實機同型的非 heading `1,742個讚`，驗證仍被分類為 Likes 並完成兩輪；no-sort fixture 驗證空白第一輪本身仍不可提交。
- Beta16 stale-row fixture 驗證第一輪已有 1 人、切換排序後暫留同一列且 loading 持續 20 秒時，不會在一般 idle deadline 提前結束；新列出現後才完成第二輪。
- Production 的每輪 idle deadline 仍由 `CLEAN_LIST_NO_PROGRESS_TIMEOUT_MS = 5000` 管理；測試只透過既有 option 縮短等待。Installed beta16 仍需在真實 Threads 貼文完成空白第一輪切換與 rollback 驗收。
