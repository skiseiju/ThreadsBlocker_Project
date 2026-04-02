# SDD: 貼文無盡收割機 (Endless Harvester)

## 目標
取代過去依賴 8 小時被動喚醒的「標記大蟑螂窩」，實作具備主動性與視覺回饋的「同列全封加強版」。使用者主動在按讚名單對話框發起指令後，系統會自動在「圈選送封鎖 -> 監聽背景執行 -> 頁面重新整理 (換頁) -> 自動再開對話框 -> 繼續圈選」的迴圈中運行，直到該貼文無人可殺為止。

## 介面設計
在 Threads 的對話框 (Dialog) 標題列中，置於原本的「同列全封」按鈕旁邊，加入**「無盡收割」**按鈕。
- 顏色：使用搶眼的警示色（例如橘色或紫色搭配動畫圖示）。
- 提示：Hover 時顯示「全自動：圈選畫面上即將顯示的全數帳號，並在封鎖完畢後自動換頁繼續收割」。

## 動作與狀態機 (State Machine) 設計
由於 `location.reload()` 會重置 JavaScript 的執行狀態，因此必須透過 `sessionStorage` 來維護這套收割機的「狀態」。

### State 1: IDLE (閒置)
- **手動觸發**：使用者點擊「無盡收割」按鈕。
- **作動**：
  1. 擷取當前畫面上未屏蔽的帳號名單（同「同列全封」抓取邏輯）。
  2. 檢查此批名單是否與上一批（存於 `hege_endless_last_batch`）高度重疊（>80%）。若重疊，表示封鎖失效或 Meta 阻擋，強制終止並清除所有狀態。
  3. 若無重疊或首次執行，將名單寫入背景排隊 (`BG_QUEUE`)。
  4. 寫入狀態：`sessionStorage.setItem('hege_endless_state', 'WAIT_FOR_BG')` 與當前 URL。

### State 2: WAIT_FOR_BG (等待背景清空)
- **觸發時機**：每次 DOM 更新或每 3 秒的 `setInterval` 檢查。
- **判斷條件**：當 `Storage.getJSON(CONFIG.KEYS.BG_QUEUE).length === 0`。
- **作動**：代表這批 30 人已經在背景（被 Worker）成功殺光。
  - 將狀態改為：`sessionStorage.setItem('hege_endless_state', 'RELOADING')`。
  - 觸發 `location.reload()`。

### State 3: RELOADING (重載後接軌)
- **觸發時機**：頁面啟動 (`Core.init()`) 且偵測到狀態為 `RELOADING`。
- **作動**：
  1. 等待 3 秒讓 React 渲染完畢。
  2. 尋找畫面上的「N 讚 (Likes)」連結並模擬點擊 (`Utils.simClick`)，開啟對話框。
  3. 等待對話框開啟後向下捲動幾次（汲取下一批 30 人），接著直接 **自動模擬手動觸發 State 1**，進入下一迴圈。

## 保險與 Debug 機制 (Gemini 3.1 安全標準)
1. **中斷保護 (Circuit Breaker)**：若 `BG_QUEUE` 卡住超過 5 分鐘都沒清空，強制解除收割狀態。
2. **死迴圈防禦 (Infinite Loop Shield)**：每次進 State 1 前比對 `last_batch`，如果發現名單抓不到新人或舊人殺不死，代表 Meta API 限流或有幽靈帳號，自動退出。
3. **主動取消入口**：在運行過程中，UI 右下角或原本按鈕處提供強制「中止無盡收割」的選項（呼叫 `sessionStorage.removeItem('hege_endless_state')`）。
4. **Console Tracing**：每個 State 轉換時，必須輸出明確的 `[Endless Harvester] State matched: WAIT_FOR_BG -> RELOADING` 機制日誌以利追蹤。
