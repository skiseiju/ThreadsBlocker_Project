# Task 2: 畫面自動化與水庫整合

## 1. 目標
進入目標貼文網址後，系統自動幫忙「點開按讚名單 -> 滾動 -> 勾選 30 人 -> 送入背景封鎖水庫」。

## 2. 實作細節
1. **觸發條件**：透過 URL Query Parameter (如 `?hege_deep_sweep=true`) 或是查閱 localStorage，判斷目前載入之頁面是否處於收割輪迴中。
2. **自動展開名單**：使用 `Core.openReactionsDialog()` 概念模組，尋找讚數並模擬點擊，帶有 retry Timeout。
3. **自動勾選**：尋找前 30 名尚未封鎖的使用者（透過 `.hege-block-btn.pending`）。
4. **掛載煞車 (若需)**：在第一次實作時，我們先套用「按下煞車」的保險栓。勾選 30 人後，跳 Toast 請使用者「確認再按殺螂囉~」，避免未準備好就狂砍。日後再改為全自動。
5. **水庫對接**：透過模擬點擊「殺螂囉~」，或直接呼叫 `Core.advancedBlockAll` 的背景排隊機制。

## 3. Debug 機制 (Gemini 3.1 安全標準)
- **視覺化追蹤**：勾選前，自動在該 User 的 DOM 上掛上粗框紅線與 Console Log，明確標示「即將封鎖：@name」。
- **煞車中斷 (Fail-safe)**：如果在 10 秒內找不到按讚清單對話框，自動 `throw new Error` 放棄本次收割，並解除 `POST_QUEUE` 鎖定。
- **Rate Limit 監控**：封鎖呼叫會即時印出 `[Sweep-Block] Sending request for @name...`，利於排查是否掉包。
