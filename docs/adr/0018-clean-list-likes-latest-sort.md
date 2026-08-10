# ADR 0018：清理名單先切 Likes「最新」排序

- 日期：2026-08-10
- 狀態：已採納並實作（2.8.4-beta8；installed 實機驗收通過）
- 相關：[ADR 0003](0003-merge-dialog-buttons.md)（清理名單入口與合併）、[ADR 0004](0004-engagement-strategy-order.md)（Likes dialog 的開啟順序）、[ADR 0017](0017-likes-progress-idle-timeout.md)（名單依最後進度停止）、`src/core.js`、`src/config.js`、`tests/beta99-clean-list-latest-sort.test.mjs`

## 背景

真實 Threads 貼文顯示 1,742 個讚，但清理名單只得到 82 人。實機把 Likes 名單的「預設」排序捲到底後，捲動高度與帳號列在 6.5 秒內都沒有再增加；這不是 beta4 的 5 秒無進度期限太短。

同一個 Likes 視窗的排序選單顯示「預設」已勾選。切成「最新」後，名單在同一實機環境繼續成長到至少 151 個帳號列。Threads 的「預設」排序是有限的精選結果；collector 即使正確等到真正無進度，也只能完整收完這份精選結果。

因此 ADR 0017 的 idle-timeout 行為仍保留，但它只解決「資料批次間短暫停頓」；本案還需要先選到可持續分頁的資料來源。

## 考慮方案

1. 延長無進度期限：預設排序已確實到底且沒有新資料，延長只會更晚得到同一份 82 人結果。
2. 所有 Likes collector 一律切「最新」：會連帶改變定點絕／reservoir fallback，超出本次「清理名單」修正範圍。
3. 只由清理名單要求「最新」：先完成既有 Likes context 驗證，再切換排序，之後沿用 ADR 0017 的完整收集與停止條件。

採方案 3。

## 決策

- `handleCleanList` 是唯一傳入 `preferLatestLikesSort: true` 的 caller；共享 collector 的其他 caller 維持原行為。
- 排序按鈕必須在目前已驗證的 Likes dialog 內精確匹配，不能全頁搜尋背景 dialog 的按鈕。
- Threads 將選項 menu portal 到 dialog 外，因此點擊已限縮的排序按鈕後，只接受本次新出現、可見且文字精確匹配「最新」的 menu item。
- 切換後重新開啟同一排序選單，利用選取標記確認「最新」已生效，再開始收集。
- 舊版面若完全沒有排序控制，沿用既有收集以保持相容；若已找到排序控制但無法開啟、選取或驗證「最新」，回傳 `likes_sort_switch_failed`，由清理名單既有 atomic rollback 拒絕送出不完整結果。
- 成功切換後仍保留 5 秒無進度期限、1000 人安全上限、800 次捲動上限與手動停止。

## Beta6 installed 失敗與 Beta7 修正

Beta6 的 fixture 使用可直接辨識的 `Likes` heading 與 selected Likes tab；真實直接 Likes 視窗則把可見標題 render 成 `1,742個讚`，且不提供 selected Likes tab。Chrome 已確認載入 beta6，但這個 context 沒通過 Likes 分類，所以流程沒有進到 `ensureLatestLikesSort()`；排序選單本身仍可精確辨識 `排序 → 預設／最新`。

Beta7 只在 `handleCleanList` 傳入 `preferLatestLikesSort: true` 時，接受「目前 dialog 內可見的 heading 同時含數字與已知 Likes 語系標籤」作為直接 Likes context 證據。一般 row／顯示名稱文字、隱藏的背景 heading 與共享 reservoir caller 不採用此放寬；分類成功後仍必須完成本 ADR 原有的 scoped sort menu 選取與驗證，才開始收集。

## Beta7 installed 失敗與 Beta8 修正

真實 Threads 的「貼文動態 → 1,742 個讚」不是建立第二個 dialog，而是在同一個 `role="dialog"` 內保留已隱藏的 Activity 畫面並顯示新的 Likes 畫面。Beta7 的掃描器雖能辨識可見的計數 Likes 標題，卻把隱藏 Activity 畫面裡既有的「清理名單」按鈕當成可沿用入口；按鈕因此維持 0×0 且仍綁著舊畫面的 handler，使用者無法從可見 Likes 工具列啟動修正流程。

Beta8 只沿用目前可見標題所在局部 subtree 內的入口。若同一 dialog 的其他隱藏 subtree 留有舊入口，掃描器會移除它並在目前工具列建立、綁定新的唯一入口。原本「短暫 lazy render 時保留入口」的行為仍適用於同一局部 subtree；跨畫面入口不再沿用。

## 影響與驗證邊界

- 真實 Threads 已證明「預設」停在 82、「最新」可超過 150；這是來源排序的 live 證據，不是 beta6 installed 功能驗收。
- red-first fixture 在修正前 0/2 通過：清理名單沒有提出排序需求，collector 也停在 fixture 的 82 人。
- 修正後 fixture 2/2 通過：只從 scoped dialog 開啟 portal menu、選到「最新」、收集 140 人並關閉 menu。
- beta6 installed 已證明直接計數 Likes 標題未通過分類；beta7 已修正分類，但仍受下列 shared-dialog 入口生命週期問題阻擋。
- beta7 installed 已證明 shared-dialog 轉場後入口停留在隱藏 Activity subtree。
- beta8 installed 由內容腳本版本訊息確認載入；同一真實貼文的入口由 0×0 恢復為唯一且可見的 104×35，排序從「預設」切到帶選取標記的「最新」，收集數由 82 增至 83 後手動停止。Atomic rollback 後維持 0 選取、173 筆既有檢舉佇列，且貼文仍未按讚，installed 驗收通過。
