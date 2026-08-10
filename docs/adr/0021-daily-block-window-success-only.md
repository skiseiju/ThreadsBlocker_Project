# ADR 0021：每日封鎖 rolling window 只記成功結果

- 日期：2026-08-10
- 狀態：已採納並實作（2.8.4-beta12；installed 實機驗收待執行）
- 相關：[ADR 0001](0001-unify-daily-block-limit.md)（每日封鎖安全上限與 rolling 24h 領域）、[ADR 0012](0012-profile-identity-gate-relaxed-fallback.md)（worker 封鎖結果與身分閘門）、`docs/BLOCKING_ARCHITECTURE.md`、`src/storage.js`、`src/worker.js`、`src/core.js`、`src/config.js`、`tests/beta3-daily-limit-notice.test.mjs`、`tests/beta12-daily-block-window.test.mjs`

## 背景

每日上限原本使用 `BLOCK_TIMESTAMPS_RING` 計算 rolling 24h，但 `Worker.runStep()` 在 `autoBlock()` 回傳後、尚未判斷 outcome 前就無條件呼叫 `Storage.recordBlock()`。除了真正成功，`already_blocked`、`already_unblocked`、解除封鎖、失敗、限流與頁面／選單問題都可能增加畫面上的「已封鎖」數。

窗口計算本身會排除超過 24 小時的時間戳，但 UI 沒有顯示下一筆何時退出，而且原始 ring 為了清理用途保留 48 小時。使用者因此容易把 rolling window 誤解成「經過 24 小時應整批清空」，也無法判斷舊版膨脹的數字何時消失。

## 決策

- 將寫入 API 改名為 `recordSuccessfulBlock()`，結果分流前不得呼叫。
- 未抽樣驗證的帳號只在 `result === 'success' && !isUnblock` 時寫入；`already_blocked`、`already_unblocked`、所有失敗與解除封鎖不寫入。
- Inline 驗證與 turbo batch 抽樣驗證會延後寫入，只有 `verifyBlock()` 通過且不是解除封鎖才計數。未被抽樣的成功仍以 Threads UI 完成確認後的 `success` 作為可觀測成功。
- `addToBatchVerify()` 回傳本次成功是否延後驗證，避免同一筆在 action success 與 batch verification success 各記一次。
- `getBlockWindowStats()` 統一產生最近 24 小時計數、下一筆退出時間、舊版估計筆數與舊版估計最晚退出時間。每筆在自己的時間滿 24 小時後逐筆退出；48 小時 retention 只影響 raw 清理，不影響顯示計數。
- 過去的 ring 只有 timestamp，無法可靠反推出 outcome。Beta12 不整批清除，以 `BLOCK_SUCCESS_COUNTER_STARTED_AT` 標記新規則開始時間：標記前仍在 24h 內的資料顯示為「舊版估計」，按原時間自然退出；標記後只接受 success-only 寫入。
- 未來時間戳與超過 48 小時的資料會被移除，避免系統時間異常讓數字永久留在窗口。
- 超限仍是提醒而不是強制停止。Worker 與主面板顯示最早一筆退出時間；存在舊版估計時另顯示筆數與最晚退出時間。

## 否決方案

- **升版直接清空 ring**：會把最近 24 小時內真實成功的封鎖一併歸零，使安全估計突然偏低。
- **從封鎖 DB 重建**：解除封鎖會刪除 DB timestamp，重複封鎖又不一定更新 timestamp，無法忠實還原最近 24 小時的 action。
- **繼續把所有嘗試當保守估計**：可以保守估算平台操作量，但既有 outcome 包含尚未點到封鎖動作的載入／選單失敗，與 UI「已封鎖」及使用者自訂上限的語意不符。

## 驗證邊界

- 固定時鐘 fixture 驗證 23 小時、2 小時與新成功資料會計入；25 小時資料不計但仍留在 48 小時 retention；49 小時與未來資料被清除。
- 每筆到達 24 小時後退出，不依賴午夜或整批 reset；空窗口的 next／legacy release 均為 0。
- Source contract 禁止 `autoBlock()` 後、outcome 分流前寫入，並鎖定一般成功、inline 驗證成功與 batch 驗證成功三個寫入點。
- 超限提醒與主面板 contract 驗證 rolling 24h、下一次逐筆釋放及舊版估計截止資訊仍可見，且提醒不停止或清空 queue。
