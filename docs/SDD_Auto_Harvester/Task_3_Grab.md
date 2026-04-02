# Task 3: Background Monitor & Loop Protection (背景監聽與防死迴圈)

## 目標
系統必須智慧地知道「何時該 Reload」以及「何時該停手（防呆）」。

## 實作細節
1. **背景監聽 (`Core.startEndlessMonitor`)**：
   - 狀態進入 `WAIT_FOR_BG` 時啟動。
   - 每 3 秒檢查 `Storage.getJSON(CONFIG.KEYS.BG_QUEUE, []).length`。
   - 若為 0（或等同於上次快照的大小），代表背景已經把這批人處理完。
     - 設定 `sessionStorage.setItem('hege_endless_state', 'RELOADING')`
     - 執行 `location.reload()`
2. **防死迴圈機制 (`Core.triggerNextEndlessBatch`)**：
   - 開啟對話框後被呼叫。
   - 抓取畫面上的使用者名單。
   - 檢查第一位使用者是否與 `hege_endless_last_first_user` 一模一樣。
   - 如果一模一樣，代表「上一批封鎖失敗」或是「API 卡單」，這時候 Reload 一百次畫面都不會變。
     - 若偵測到死迴圈，呼叫 `UI.showConfirm('偵測到名單不再變動，可能是 Meta API 已達上限或名單已清空。已自動終止此貼文的無盡收割。')`。
     - 清除所有 `hege_endless_*` 的標籤，解除武裝。

## Debug 機制
- Console 印出 `[Task 3] BG Queue count: X. Waiting...`
- 當偵測到死迴圈時，Console 印出 `[Task 3] INFINITE LOOP DETECTED. Prev First User = ${prev}, Current = ${curr}. Aborting.`
