# ADR 0020：清理名單「停止並結算」保留已收集帳號

- 日期：2026-08-10
- 狀態：已採納並實作（2.8.4-beta11；installed 實機驗收待執行）
- 相關：[ADR 0003](0003-merge-dialog-buttons.md)（清理名單入口與提交）、[ADR 0017](0017-likes-progress-idle-timeout.md)（單輪停止條件）、[ADR 0019](0019-clean-list-two-pass-sort-scan.md)（兩種排序與 atomic 合併）、`src/core.js`、`src/config.js`、`tests/beta53-clean-list-atomic.test.mjs`、`tests/beta99-clean-list-latest-sort.test.mjs`

## 背景

單輪 collector 的按鈕文字一直是「停止並結算」，按下後也會以 `reason=stopped` 回傳當下已驗證的 `users`。但既有 atomic gate 只接受 `end`／`completed`；ADR 0019 的第二輪非完整分支還會把 `users` 明確清成空陣列。因此使用者在長名單掃描途中按停止，畫面雖稱「結算」，實際卻把第一、第二輪已抓到的帳號全部 rollback。

## 決策

- `COMPLETE_DIALOG_REASONS` 維持只接受 `end`／`completed`；手動停止不能假裝資料完整。
- 只有清理名單 orchestrator 可對 `reason=stopped` 明確設定 `partialCommit`。正規化層同時要求至少一個帳號，且沒有 `truncated`／技術性 `partial`，不能只靠外部傳入旗標繞過原因與安全上限。
- 第一輪停止時不再切排序，直接結算第一輪目前已收集的帳號。
- 第二輪停止時，合併第一輪完整結果與第二輪目前結果，以大小寫不敏感的 username 去重，再套用既有 1000 人合併上限。
- 部分結算結果保持 `complete=false`、`reason=stopped`，但 `ok=true`、`partialCommit=true`；`shouldCommitDialogCollection()` 只對這個明確組合放行，讓既有 `handleBlockAll()`／`handleReportOnly()` 接收同一份名單。
- 停止時尚未收集到任何帳號、結果已截斷或合併後超限，不建立 `partialCommit`。`scroll_stall`、timeout、unknown、排序切換失敗與其他非使用者停止理由完全不變，仍整批 rollback。
- 完成部分結算後顯示已保留人數與實際新增至封鎖清單的人數，避免把「停止」誤解為取消。

## 驗證邊界

- Production-path fixture 實際點擊第一輪進度 UI 的「停止並結算」，驗證已收集帳號可提交且排序完全沒有被點擊。
- 第二輪 fixture 驗證第一輪完整名單加第二輪停止時名單會合併，大小寫不同的同帳號只保留一筆。
- Handler fixture 從「清理名單」入口接收停止結算結果，驗證相同兩個帳號同時進入 session `pendingUsers` 與 `REPORT_QUEUE`，不是只在 collector 層宣稱可提交。
- 空名單停止不可提交；一般 `stopped` 若沒有 orchestrator 的明確 opt-in、reason 不是 stopped，或結果 truncated，也不可通過 atomic gate。
- 既有 `scroll_stall` 第二輪 fixture 維持回傳空名單，證明本 ADR 沒有把一般不完整結果放寬。
