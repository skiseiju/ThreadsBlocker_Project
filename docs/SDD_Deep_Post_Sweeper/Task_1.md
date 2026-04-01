# Task 1: 機制容器與排程器管理

## 1. 目標
實作 `POST_QUEUE` 的資料庫存取，以及每 8 小時自動跳出的排程器基底。

## 2. 實作細節
1. **按鈕綁定**：在原有的 `advancedBlockAll` 旁，加入「排入深層清理」按鈕。點擊後將當前 URL 寫入 `localStorage` 的 `POST_QUEUE`。
2. **排程器 (Scheduler)**：在 `main.js` 或 `core.js` 的 `init()` 中，註冊定時檢查器 (Interval)。
3. **冷卻判斷**：從 `POST_QUEUE` 取出最早需要清理的貼文（`Date.now() - lastSweptAt > 8 * 60 * 60 * 1000`），透過設置旗標並使用 `window.location.href` 跳轉。

## 3. Debug 機制 (Gemini 3.1 安全標準)
- **Console 日誌**：強制加入 `[DeepSweep-Q]` 前綴的詳細輸出。
- **測試後門**：在 Console 暴露 `window.HegeDebug.forceWakeup()`，無須等待 8 小時，強制將所有貼文的 `lastSweptAt` 歸零以立即觸發跳轉，方便驗證導航正確性。
- **防爆走保險**：跳轉前寫入 `sessionStorage` 的跳轉鎖，避免在同一秒內無限 Reload 跳轉。
