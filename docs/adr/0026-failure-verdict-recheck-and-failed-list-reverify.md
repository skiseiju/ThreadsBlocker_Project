# ADR 0026：失敗定案前複驗＋失敗名單重新驗證

- 日期：2026-08-13
- 狀態：已採納（beta28 實作）
- 相關：[調查報告](../handoff/2026-08-13-block-success-marked-failed.md)（根因與證據）、`src/worker.js`（autoBlock confirm 階段與 failed 入列）、`src/core.js`（recordFailure / removeFailure）、`src/ui.js`（失敗名單 UI）、`docs/BLOCKING_ARCHITECTURE.md`

## 背景

線上回報 id 53（2.8.2）、id 54（2.8.3）：封鎖實際成功，帳號卻列進失敗名單顯示「封鎖 · 動作失敗」。根因調查（見相關的 handoff 報告）確認：點擊確認鈕後，worker 只等 5 秒（turbo 2 秒）看「所有 dialog 消失」，批量封鎖時 Threads 回應變慢、背景分頁計時器又被節流，判定發生在 Threads 完成封鎖之前；`failed` 定案後沒有任何補救對帳。

## 選項

1. **只加大等待預算**。代價：治標，Threads 更慢時仍誤判；批量下每帳號拖更久。
2. **失敗定案前延遲複驗一次＋失敗名單提供批次重新驗證**（採納）。代價：失敗路徑每帳號多花數秒；需要新 UI 動作。
3. **重寫等待機制（MutationObserver＋盯特定 dialog）**。代價：動封鎖流程心臟，風險高，另批處理（修法 3、4，未來 ADR）。

## 決定

採選項 2，拆兩件事：

1. **失敗定案前複驗**：autoBlock 在回傳 `failed`（confirm 超時路徑）前，先 `safeSleep` 固定 3 秒（不受速度模式縮放），重新檢查 dialog 是否已消失或頁面是否已呈現解除封鎖文字；任一成立改回 `success`。
2. **失敗名單重新驗證**：失敗名單 UI 新增「重新驗證」批次動作，逐帳號檢查實際封鎖狀態，已封鎖者呼叫 `Core.removeFailure` 移除並寫入 BlockDB；未封鎖者留在名單。重用既有驗證機制，不另建平行導航流程。

不回溯修改歷史 stats 計數；重新驗證只修正名單與 BlockDB。

## 後果

- 真失敗的帳號每個多付約 3 秒；換得誤判率大幅下降。
- 已中招的使用者可一鍵清掉假失敗，不必逐帳號手動確認。
- 修法 3、4（盯特定 dialog、MutationObserver 取代輪詢）另立批次與 ADR。
