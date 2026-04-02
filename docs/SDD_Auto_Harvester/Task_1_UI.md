# Task 1: UI Injection (無盡收割按鈕與觸發狀態)

## 目標
在按讚名單對話框標題列，也就是「同列全封」按鈕旁，新增一個「無盡收割」按鈕。點擊後能觸發第一次擷取並改變狀態。

## 實作細節
1. **修改目標**：`src/core.js` 的 `checkDialogCheckboxes` 函式。
2. **生成按鈕**：
   - ID: `hege-endless-sweep-btn`
   - 樣式：紅色底色配合無限循環圖示 (`<svg viewBox="0 0 24 24"><path d="..."></svg>`)
   - 提示：Hover 顯示：「自動收割全數名單並重新整理，直到清空」
3. **綁定事件** `handleEndlessSweep`：
   - 取代 `handleBlockAll`，執行相同的抓取名單邏輯。
   - 名單去重、過濾後，將全部抓到的使用者寫入 `BG_QUEUE`。
   - 將剛才抓取的第一筆使用者名稱設定為 `hege_endless_last_first_user` (防呆依據)。
   - 將狀態設定為：`sessionStorage.setItem('hege_endless_state', 'WAIT_FOR_BG')`
   - 將 URL 狀態設定為：`sessionStorage.setItem('hege_endless_target', window.location.href)`
   - 啟動監聽器 (`Core.startEndlessMonitor`)。

## Debug 機制
- 當按下按鈕時，Console 印出 `[Task 1] Endless Sweep triggered. X users added. State: WAIT_FOR_BG.`
- 若按鈕點擊後沒有抓到任何使用者，直接跳出 `UI.showToast` 警告，且**不設定** `WAIT_FOR_BG` 狀態。
