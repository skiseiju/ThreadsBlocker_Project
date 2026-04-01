# Task 3: 致命錯誤熱修復 (Hotfix: 大蟑螂與獨立 Worker)

## 1. 目標
修復日前改版遺失的主面板「大蟑螂雷達庫」入口，並徹底改寫深層收割 (Deep Sweeper) 喚醒邏輯，確保收割任務在獨立新視窗 (Worker) 中執行，不再干擾使用者當前頁面。

## 2. 實作細節
1. **大蟑螂雷達庫入口復原**：
   - 於 `src/ui.js` 的 `hege-panel` 補回 `<div id="hege-cockroach-btn">`，恢復主面板按鈕。
   - 在 `src/main.js` 重新綁定 `callbacks.onCockroach` 呼叫 `Core.openCockroachManager()`。
2. **獨立 Worker 視窗啟動**：
   - 改寫 `src/core.js` 的 `checkPostQueueWakeup`。
   - 使用 `Utils.isMobile()` 判斷，若是行動裝置 (iOS) 由於系統防護機制仍維持同視窗跳轉；若是電腦版桌面端，則改用 `window.open(url, 'HegeSweepWorker', ...)`，彈出新視窗接管任務。
3. **收割收尾自動關閉視窗**：
   - 修復 `removeCurrentPostFromQueue` 重複定義的問題，並加入 `if (window.name === 'HegeSweepWorker') window.close();`。當收割結束或觸發無限連鎖中斷時，自動關閉該 Worker 視窗，完成無縫交接。

## 3. Debug 機制 (Gemini 3.1 安全標準)
- **Toast 提示隔離**：主頁面會提示「已在獨立視窗啟動清理任務，請勿關閉該小視窗」。
- **命名空間檢查 (window.name)**：收尾階段透過嚴格比對 `window.name` 防止誤關主視窗，測試時可 Console 輸入 `window.name` 確認當前執行環境。
- **iOS 降級驗證**：在 Safari 行動版中，透過 User Agent 偵測降級回原視窗執行，確保不會因 popup blocker 阻擋導致排程失效。
