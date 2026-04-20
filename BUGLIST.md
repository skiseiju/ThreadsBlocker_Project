# Buglist

| # | 版本 | 狀態 | 摘要 | 根因 | 修復 |
|---|------|------|------|------|------|
| 1 | 2.5.0 | Fixed (2.5.1-beta2) | 定點絕第一次使用不會執行 — 「開始執行定點絕」按鈕被隱藏 | `hege_endless_worker_standby`（localStorage）跨 session 殘留，`isEndlessRunning` 誤判為 true。原因：功能上線時即缺少 startup 清理與 URL 不符時的 localStorage 同步清理 | main.js: (1) startup 時若 sessionStorage 無 endless_state 則清除殘留旗標 (2) URL 不符跳出時同步清除 localStorage 旗標 |
| 2 | 2.5.4-beta66 | Fixed (2.5.4-beta66) | 定點絕封鎖完會停在空名單頁，不會自動結束 worker | `worker.js` 在 `BG_QUEUE=0` 且 `hege_sweep_worker_standby=true` 時進入等待主視窗接續迴圈，特定分支不會收尾 | `worker.js`：空 queue 收尾分支改為直接結束（same-tab 回主頁、popup 直接關閉），不再停在空名單輪詢 |
| 3 | 2.5.4-beta67 | Fixed (2.5.4-beta67) | Menu 顯示「清單A 第N批 定點絕執行中」會殘留到 reload 才消失 | `updateControllerUI()` 只有寫入「執行中」字串，沒有在流程結束時清除 | `core.js`：加入收尾清理邏輯，當定點絕非執行中時即時重置狀態列 |
| 4 | 2.5.4-beta68 | Fixed (2.5.4-beta68) | 定點絕執行狀態在不同 UI/流程判斷不一致，偶發誤判或回錯頁 | 狀態機分散在 `ui.js` 與 `SweepDriver`；popup worker 收尾仍受 `hege_return_url` 影響；狀態清理依賴字串比對 | `utils.js` 新增 sweep runtime 單一判斷；`ui.js` 改為只讀共用判斷；`worker.js` popup 以 `hege_popup=true` 一律關閉；`core.js` 改用 `dataset` flag 清理狀態列 |
| 5 | 2.5.4-beta69 | Fixed (2.5.4-beta69) | 手動 reload 會誤續跑定點絕 | `main()` 啟動時只要命中 `WAIT_FOR_BG + target` 就直接 `waitForWorkerDrain()`，未檢查 runtime 是否真的可續跑 | `main.js`：加入 resume gate（target 狀態、runtime 條件、stale sweeping 自救）與詳細 debug log |
| 6 | 2.5.4-beta72 | Fixed (2.5.4-beta72) | 每次升版（版號更新）會固定觸發一次定點絕 | 升版 migration 把 `POST_QUEUE` 全量重設為 `pending`，深層清理項目被誤當新任務；首輪 tick/殘留 `hege_sweep` 參數會放大觸發機率 | `main.js`：改為「修復式 migration」不全量 reset；`longTermLoop + lastSweptAt + pending` 回正為 `done`；升版後跳過一次 auto tick；`hege_sweep` 參數需有 active runtime 才允許續跑 |
