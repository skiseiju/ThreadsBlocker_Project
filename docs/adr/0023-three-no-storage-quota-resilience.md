# ADR 0023：三無儲存配額防爆與重置備份保留政策

- 日期：2026-08-12
- 狀態：已採納
- 相關：[ADR 0022](0022-three-no-formula-requires-confirmed-empty-content.md)（判定公式）、`src/features/three-no-watch.js`（finishScan `:3874`）、`src/main.js`（重置備份 `:314`）

## 背景

2026-08-12 實機掃描（2,760 追蹤者、多批次）在第二批 40 個候選人全部查完後無聲卡死：游標已寫入，但結果寫入之後的所有步驟未執行、無任何 log，工作視窗心跳正常。實測 localStorage 總用量 5,069,453 字元，頂到 5MB 配額。結算函式 `finishScan` 的 `setThreeNoScanResults` 等大寫入沒有 try/catch，QuotaExceededError 直接炸斷 async 鏈，terminal state 永遠寫不出去。

用量前四名：六月重置留下的 `hege_three_no_reset_backup_*` 1.44M（無任何清理機制）、名冊 1.25M、掃描結果 0.72M、掃描 log 0.57M。

## 決定

1. **結算防爆**：`finishScan` 內所有可能超配額的寫入（roster finalize、scan results、terminal state）包防爆。scan results 寫入失敗時降級重試：第一次丟 `debugLog`，第二次把每筆 user 的 `metadataDebug` 縮減為只留三個 `*SignalReason` 字串欄位。降級仍失敗也必須寫入 terminal state（小 payload，含 `error: 'storage_quota'`），掃描以 failed 收場並在 scanDebugLog 記 `finish_storage_quota_degraded` / `finish_storage_quota_failed`。禁止無聲卡死。
2. **重置備份保留政策**：`hege_three_no_reset_backup_*` 最多保留最新一份；腳本啟動時清除其餘與超過 7 天的備份。理由：備份的用途是重置誤按後的立即救援，兩個月前的備份無救援價值，卻佔近三成配額。

## 選項與代價

- 全面搬去 IndexedDB：一勞永逸但工程大，2.8 系列只修 bug 不做結構遷移（見 2.8 穩定化決策），列為未來選項。
- 只清備份不做防爆：下次名單再長大同樣爆，治標。

## 後果

- 配額臨界時掃描結果可能缺 debugLog 或 metadataDebug 細節，但 findings 主體與終態保證落地。
- 使用者按重置後只剩最新一份備份可救援。
