# Task 2: State Persistence & Auto Re-opening (自動重啟與開啓對話框)

## 目標
因為 `location.reload()` 會將記憶體清空，必須確保網頁重新整理後，系統能接續執行並自動打開對話框。

## 實作細節
1. **修改目標**：`src/main.js` 與 `src/core.js`
2. **初始化檢查** (在 `main()`)：
   - 檢查 `sessionStorage.getItem('hege_endless_state') === 'RELOADING'`
   - 檢查 `sessionStorage.getItem('hege_endless_target') === window.location.href`
   - 若符合，啟動 `Core.resumeEndlessSweep()`。
3. **自動尋找對話框 (`Core.resumeEndlessSweep`)**：
   - 顯示 Toast：「無盡收割機：自動讀取下一批名單中...」
   - `setInterval` 尋找 `a[href$="/likes/"]` 或是含有「讚」或「likes」字樣的連結。
   - 找到後，執行 `Utils.simClick(likesBtn)`。
   - 等待對話框開啟 (`[role="dialog"]`) 且有內容後，暫停 3 秒讓 React 渲染。
   - 呼叫 `Core.triggerNextEndlessBatch()` 執行新一批抓取。

## Debug 機制
- 在啟動時，Console 印出 `[Task 2] Detected RELOADING state. Attempting to click Likes button...`
- 若尋找按讚連結超過 15 秒找不到，Console 印出 `[Task 2] Timeout waiting for Likes button. Aborting.` 並自動清除 `hege_endless_state`，終止收割以免死迴圈。
