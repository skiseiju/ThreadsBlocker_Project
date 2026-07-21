# ThreadsBlocker Instructions

本 repo 是 ThreadsBlocker 主發版來源。先讀 `PROJECT.md`，再依改動面讀對應架構／SDD；不要把 `ThreadsBlocker-analytics-upload` incubator 的改動整批覆蓋回主 repo。

## 任務路由

- 修改 `src/core.js`、`src/worker.js`、`src/main.js`，或 `src/ui.js` 的事件綁定前，必讀 `docs/BLOCKING_ARCHITECTURE.md`。iOS 導航不得改成會觸發 Universal Links 的 `window.location.href` 路徑。
- Platform ingest／D1／R2／公開統計：讀 `docs/BUG_ADMIN_PLATFORM.md`、`docs/SDD_Platform_Sync_Trust_Model/SDD.md` 與相關 task SDD。
- Release readiness 使用 `threadsblocker-release-qa`；修正、打包、上傳或發布使用 `threadsblocker-release`。技能不會取代下方發布批准。
- UI／DOM 變更按需要讀 `docs/THREADS_DOM_GOTCHAS.md` 或受影響 feature SDD，不全文載入所有歷史設計。

## Version、Build 與 Release

- 會進入 extension／userscript runtime 的 `src/` 變更遞增 `src/config.js` beta 版號；docs、tests 或 backend-only 變更不為了形式跳 extension 版號。
- Build 使用 `./build.sh --no-bump`。發版前由 release QA 驗證版本／artifact parity、storage／preference migration、受影響功能與 rollback reference。
- Release package 只可來自本次 build 驗證的 `dist/extension.zip`、同步 Chrome zip 或版本化 zip；不得使用歷史 zip、installed profile 目錄或未驗證暫存包。
- **不得自行發布正式版、上傳商店、deploy Worker／D1／R2 或 push 發布分支。** 只有使用者明確批准對應 target 後才執行；正式版同步 `README.md`、`CHANGELOG.md`，並移除 beta-only 手動 debug/export UI。

## Real-browser Truth

- 使用者要求 Chrome extension、實機畫面、installed truth 或「用我現在的 Chrome」時，優先檢查既有 Google Chrome 視窗／profile／extension；GStack、臨時 Chromium、HTML preview 或測試 profile 不能冒充使用者現況。
- 改動使用者既有 Chrome 狀態前，先回報目前版本、URL 與 extension／DOM 狀態。若只能用測試環境，清楚標示不是 installed truth。
- Preview 必須忠實反映實作的文字、連結、按鈕、位置與狀態；最小改動代表保留既有行為與版型，只改需求差異。

## Data Invariants

- `platform_source_registry` 只代表觸達與活躍；公開分析只能使用 accepted `platform_uploads` 及其 materialized metrics。
- 非空合法 payload 先保存 raw；active path 的完整 raw 在 R2，D1 保存 pointer。Duplicate 不得增加 upload／trust／public metric，只能更新 last-seen。
- 公開頁分開呈現近期來源、可分析批次與可分析事件；所有 published metric 必須可回溯 accepted upload 與 raw evidence。
- 修改 D1 `INSERT` 或 materialized metric 寫入後，跑 `node cf_bug_admin/scripts/check-sql-placeholders.mjs`。
- Scanner／ingest 重跑必須 idempotent；private、timeout、schema／trust conflict 與 upload failure 保留 reason，不得假完成或留下永久 lock。
