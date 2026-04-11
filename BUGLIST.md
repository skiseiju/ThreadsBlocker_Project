# Buglist

| # | 版本 | 狀態 | 摘要 | 根因 | 修復 |
|---|------|------|------|------|------|
| 1 | 2.5.0 | Fixed (2.5.1-beta2) | 定點絕第一次使用不會執行 — 「開始執行定點絕」按鈕被隱藏 | `hege_endless_worker_standby`（localStorage）跨 session 殘留，`isEndlessRunning` 誤判為 true。原因：功能上線時即缺少 startup 清理與 URL 不符時的 localStorage 同步清理 | main.js: (1) startup 時若 sessionStorage 無 endless_state 則清除殘留旗標 (2) URL 不符跳出時同步清除 localStorage 旗標 |
