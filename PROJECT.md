# PROJECT

- 定位：ThreadsBlocker 主 repo 與正式發版來源，提供 Threads 批量封鎖、只檢舉、三無待審清單與本機來源分析；`ThreadsBlocker-analytics-upload` 是同專案的 `wip-analytics-upload` incubator worktree，不是另一個主發版來源。
- 類型：browser extension / userscript / Cloudflare Worker companion。
- Codex 入口：先讀 `AGENTS.md`，再讀 `README.md`、`CHANGELOG.md` 與受影響的 `docs/` 架構文件。
- 常用任務：extension/userscript release、worker/D1/R2 ingest、CWS/AMO 包裝、storage migration、隱私與 debug UI 邊界驗證。
- 注意：每次版本修改要同步 artifact parity、installed truth、storage/preference regression、rollback reference；正式版發布必須等使用者明確批准。
- analytics upload、D1／Worker／R2 或平台頁改動若源自 incubator，必須明確判定 merge-back 範圍後才帶入本主 repo，不得整個 worktree 自動覆蓋。


## Codex 收口規則

- 開始：先讀本檔，再讀上方列出的 `AGENTS.md` / `README.md` / runbook；只有前情不足或衝突時才查舊 session。
- 驗證：production、browser extension、WordPress、部署頁與資料寫入任務，要驗 live surface；不要只信 repo/build log。
- 結束：非小任務要留下 compact handoff；可用 `/Volumes/Working 2T/CODE/docs/codex/HANDOFF_TEMPLATE.md`。

## 專案工作流決策

- handoff 位置：固定寫入 Obsidian `00_AI工作區/Handoffs/ThreadsBlocker/`；repo-local handoff 只作來源 artifact。
- 是否同步 Obsidian：所有 handoff 固定進 Obsidian；長期產品方向、政策風險、CWS 審核阻塞要在 handoff 中標成 durable decision。
- PROJECT.md 應補：版本流程、installed truth、CWS/AMO 邊界、正式發布批准條件改變時才更新。
- live QA：需要。source/build/unpacked/live Threads tab/CWS live store 要分開判斷，不能用 build success 代替。
- 必用 SOP：`threadsblocker-release-qa` 做只讀檢查；`threadsblocker-release` 只在修正、打包、上傳、發布時使用。
- automation 判斷：不建議自動發布；可保留週期性 release readiness check，但 CWS publish 必須人工確認。
- 下一步：新 handoff 寫入 Obsidian `00_AI工作區/Handoffs/ThreadsBlocker/`；每次發版 closeout 必填 live-version checklist。
