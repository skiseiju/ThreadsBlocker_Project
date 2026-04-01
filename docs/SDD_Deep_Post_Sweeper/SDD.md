# [Goal Description]
緊急修復大蟑螂資料庫入口，並徹底翻修「深層收割 (Deep Sweeper)」的啟動與執行邏輯，確保收割任務在「獨立新視窗 (Worker)」中運行，絕不干擾使用者目前正在瀏覽的主視窗。

## User Review Required
> [!IMPORTANT]
> 針對您剛才回報的兩個致命問題，我已經找到原因並草擬了這份修正企劃。請過目！

### 問題 1 真相：大蟑螂資料庫為什麼不見了？
**原因**：在幾天前的某次改版中，我把「大蟑螂雷達庫」的按鈕**收進了「設定 (齒輪圖案)」裡面**，導致面版上找不到。
**解法**：我會立刻將「大蟑螂雷達庫」的捷徑重新放回**主面板 (hege-panel) 上**，讓您一眼就能看到，不用再點開設定尋找。

### 問題 2 真相：深層收割為什麼會影響原本的視窗？
**原因**：目前的寫法是「當 8 小時排程到了（或是手動用測試後門歸零），系統會直接把您『當前正在看的分頁』轉跳到貼文去抓人」。這會害您正在看的廢文直接不見。
**解決架構（獨立視窗 Worker 模式）**：
1. **另開新頁**：系統排程滿 8 小時啟動時，會學「背景開始封鎖」一樣，用 `window.open()` 彈出一個全新的小視窗 (Worker)，網址帶有收割參數 `?hege_post_sweep=true`。
2. **防干擾執行**：該小視窗會自己點開讚數名單 -> 自己圈選 30 人 -> 自己把人丟進水庫 -> 自己 Reload（重新整理自己，不影響您）。
3. **無縫交接**：小視窗選完名單丟進背景後，如果在水庫排隊的人數小於 100 或是觸發了封鎖指令，背景執行緒會接手處刑。

---

## Proposed Changes

### [UI]
#### [MODIFY] src/ui.js / src/main.js
- 在主控制面板 `hege-panel` HTML 中，補回 `<div class="hege-menu-item" id="hege-cockroach-btn">大蟑螂雷達庫</div>`。
- 在 `main.js` 中重新綁定此按鈕直通 `Core.openCockroachManager()`。

### [CORE]
#### [MODIFY] src/core.js / src/utils.js
- 徹底改寫 `Core.checkPostQueueWakeup`：拔除 `window.location.href = ...`，改用 `window.open(targetPost.url + '?hege_post_sweep=true', 'HegeSweepWorker', 'width=800,height=600')`。
- 只有當前不是在手機版，才會彈出新視窗。若在手機版 (iOS) 則維持在原視窗跳轉（因 iOS 安全性限制不允許任意彈出分頁）。
- 確保 Sweep Worker 在成功選取名單並塞入 `BG_QUEUE` 後，若偵測到已經結束該貼文的所有審核，會自動關閉視窗 `window.close()`。

## Verification Plan
1. **大蟑螂雷達回歸**：主面板上應立即出現紫色的雷達庫按鈕，點擊能彈出對話框。
2. **背景排程不干擾**：在使用 `HegeDebug.forceWakeup()` 時，原本的畫面不准動，系統會自動彈出一個獨立的新視窗去跑貼文收割流程。
