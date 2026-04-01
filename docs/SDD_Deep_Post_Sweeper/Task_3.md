# Task 3: 無限迴圈遞補與防呆驗證

## 1. 目標
水庫清空後，自動 Reload 頁面取得新名單，並精確驗證「這 30 個人是不是剛才那 30 個人」，決定是否繼續無限迴圈。

## 2. 實作細節
1. **全清空回調 (Queue Empty Callback)**：修改或攔截原有的背景流水線 (delayed block worker)，當佇列長度歸 0 且在收割模式下，觸發重載機制。
2. **上一批次指紋紀錄**：在準備 `location.reload()` 前，將這批 30 人的 Username Array MD5/排序字串存入 `sessionStorage` 的 `hege_last_sweep_batch`。
3. **名單比對 (Duplicate Detection)**：
   - 載入新畫面，點開清單，抓出前 30 人。
   - 與 `hege_last_sweep_batch` 比對交集。
   - 若交集率超過 90% (幾乎都是舊人)，代表系統未能正確封鎖，或 API 未刷新。
   - 觸發 **Cooldown 機制**：將此貼文從 `active` 改回 `pending`，並設定 `lastSweptAt = Date.now()` (開始冷卻 8 小時)。
4. **繼續迴圈**：如果交集小，代表成功遞補。覆蓋名單，進入 Task 2。

## 3. Debug 機制 (Gemini 3.1 安全標準)
- **交集率儀表板**：重載比對時，必定跳出 Toast 顯示 `[驗證] 上批與這批重複率: XX%`。
- **異常強制中斷**：只要重複率過高，在 Console 印出紅字 `[FATAL] Sweep stuck in infinite loop breaker. Aborting.` 並中斷。
- **安全閥**：限制單次迴圈最多執行 5 次重載。超過 5 次 (極端保守)，自動強制冷卻 8 小時，避免一整晚燒乾系統資源。
