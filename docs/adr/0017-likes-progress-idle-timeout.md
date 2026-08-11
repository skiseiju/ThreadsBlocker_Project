# ADR 0017：Likes 整串收集採「最後進度時間」停止

- 日期：2026-08-10
- 狀態：已採納並持續實作（停止判定 2.8.4-beta4；大型名單效能 2.8.4-beta14，待 installed 驗收）
- 相關：[ADR 0003](0003-merge-dialog-buttons.md)（清理名單入口與合併）、[ADR 0004](0004-engagement-strategy-order.md)（Likes dialog 的開啟順序）、`src/core.js`、`tests/beta98-likes-progress-timeout.test.mjs`、`tests/beta14-clean-list-performance.test.mjs`

## 背景

實際貼文顯示 3816 個讚，但清理名單只收集 71 人。舊流程每輪固定等待 180ms，只要連續 4 輪沒有新增帳號或捲動範圍變化，就在約 720ms 後結算。Threads 的 Likes dialog 會分批 lazy-load；批次間空窗超過 720ms 時，即使後面還有資料，也會被誤判成結尾。

這不是 100 人限制。清理名單的既有安全上限為 1000 人；問題發生在到達上限前的停止判定。

## 考慮方案

1. 增加固定無變化輪數：改動小，但實際等待時間仍與每輪 sleep、瀏覽器排程綁定，語意不穩定。
2. 為整趟收集設定固定總時間：容易讓仍持續有資料的長名單被截斷。
3. 依最後一次進度計時：只要資料或捲動範圍持續推進就續抓，真正閒置超時才停止。

## 決策

採方案 3。預設無進度期限為 5000ms；以下任一事件視為進度並重設計時：

- 收集到新的唯一帳號；
- `scrollTop` 向下推進；
- `scrollHeight` 增長。

連續 5 秒無進度後，若捲動容器已在底部則以 `end` 結算；尚未到底則以 `scroll_stall` 結算。保留既有 1000 人安全上限、800 次捲動上限、初始版面等待與手動停止。

測試可透過內部 option 縮短無進度期限，但 production 預設值由 `CLEAN_LIST_NO_PROGRESS_TIMEOUT_MS` 單一常數管理，允許範圍限制為 1–30 秒。

## 影響

- 批次空窗少於 5 秒時，後續 Likes 仍會被收集。
- 真正到達結尾後，結算最多增加約 5 秒等待。
- 若 Threads 超過 5 秒完全不提供資料或捲動變化，收集仍會有界停止；不保證突破平台未提供或不可見的帳號。
- 3816 個讚仍受 1000 人安全上限約束，本決策只修正 71 人等過早結算，不取消上限。

## Beta14：大型名單收集期間暫停一般掃描

實測 `injectDialogCheckboxes()` 在每個帳號列內都重新查詢整個 dialog 的 checkbox。100／200／400 列的 steady pass 約為 17.6／68.9／275.5ms，列數加倍時耗時約四倍；而 collector 每 180ms 捲動一次，scroll listener、MutationObserver 與 1500ms backup scanner 會反覆觸發這條 O(n²) 路徑，因此約 200 人後主頁明顯變慢。

Beta14 採兩層限縮修正：

- 每次 `injectDialogCheckboxes()` 只對目前 dialog 建立一次 username → checkbox 索引；每列只查自己的小型 row／host，移除整個 dialog 的逐列重掃。
- `collectFullDialogUsers()` 活躍期間，scroll、MutationObserver 與 backup interval 觸發的一般 scanner pass 直接略過；最外層 collector 在任何成功、失敗、停止或例外路徑離開後，只排一次補掃，讓最後畫面恢復 checkbox 狀態。

活動狀態使用可巢狀 depth，而不是單一布林，避免未來 nested caller 提早解除閘門。這只改掃描排程與查詢成本，不改 5 秒無進度停止、兩種排序各掃一輪、1000 人上限、atomic rollback 或「停止並結算」的既有契約。

修正後同一 fixture 的 100／200／400 列 steady pass 中位數約為 15.1／57.6／221.6ms，且整個 dialog 的 checkbox 查詢在 200 列由每輪 200 次降為 1 次。單次 pass 仍包含 Threads 列定位與 layout 成本，因此不宣稱整體已線性化；主要保護是 collector 活躍期間 scanner 呼叫為 0，避免這筆成本每 180ms 重複發生。
