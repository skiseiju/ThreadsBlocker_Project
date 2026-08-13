# ADR 0027：確認視窗關閉偵測改為元素追蹤＋MutationObserver

- 日期：2026-08-13
- 狀態：已採納（beta29 實作）
- 相關：[ADR 0026](0026-failure-verdict-recheck-and-failed-list-reverify.md)（同一根因的第一批止血：失敗前複驗＋失敗名單重新驗證）、[調查報告](../handoff/2026-08-13-block-success-marked-failed.md)、`src/worker.js`（autoBlock confirm 階段）、`src/utils.js`（pollUntil）、`docs/BLOCKING_ARCHITECTURE.md`

## 背景

bug report id 53/54 的根因：點確認封鎖後用 `pollUntil`（setTimeout 輪詢、牆鐘 deadline）等「全頁 `div[role="dialog"]` 歸零」。三個弱點：(1) 背景分頁計時器被 Chrome 節流，名目 5 秒實際只檢查數次；(2) turbo 模式把預算縮到 2 秒；(3) 任何無關 dialog 存在就永遠等不到零。ADR 0026 已補事後複驗，本 ADR 處理偵測機制本體。

## 選項

1. **只加大 poll 預算**。代價：治標，節流問題仍在，批量時每帳號拖更久。
2. **改追蹤特定 dialog 元素＋MutationObserver 事件驅動**（採納）。代價：改封鎖流程核心時序，需完整回歸驗證。
3. **改攔截網路回應判定成敗**。代價：Threads 用 Relay preloaded query，攔截已確認不可行（見 memory project_deep_mining_strategy），且耦合更深。

## 決定

1. **元素追蹤**：點擊確認鈕時記住該按鈕所屬的 dialog 元素；成功條件改為「該 dialog 元素已從 document 移除（`!element.isConnected`）或不可見」，不再要求全頁 dialog 歸零。
2. **事件驅動**：等待改用 MutationObserver 監聽 `document.body` 子樹變化，dialog 一移除立即 resolve；不受背景分頁 setTimeout 節流影響。
3. **預算**：總超時上限 15 秒，用不縮放的計時（等同 safeSleep 原則，不受速度模式影響）；超時後仍走 ADR 0026 的複驗與失敗路徑，行為向下相容。
4. cooldown（限流訊息）偵測保留：observer 回呼內同步檢查 checkForError。

## 後果

- 正常情況 dialog 一關立刻判定，比輪詢更快；背景分頁不再漏看。
- 無關 dialog（常駐、公告類）不再造成永遠等不到成功。
- 動到封鎖核心時序，發版前需要實機批量封鎖驗證，不能只靠 fixture。
- pollUntil 其他呼叫點不動，只改 confirm 關閉偵測這一處。
