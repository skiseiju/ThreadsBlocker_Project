# Project Guidelines

## 🚨 封鎖機制修改規範

在修改以下任何檔案之前，**必須先閱讀** [`docs/BLOCKING_ARCHITECTURE.md`](./docs/BLOCKING_ARCHITECTURE.md)：

- `src/core.js`
- `src/worker.js`
- `src/main.js`
- `src/ui.js`（事件綁定相關）

該文件記錄了：
- 三種封鎖路徑（Mobile 同分頁 / Desktop 背景 / Desktop 前景）的完整架構
- iOS Universal Links 安全限制與唯一合法的導航方式
- 觸控事件綁定策略差異（面板 vs Checkbox vs 同列全封）
- 資料儲存結構

**違反文件中記載的限制（如在 iOS 上使用 `window.location.href` 導航）將導致嚴重的功能破壞。**

## 📦 版本與建置規範

- 每一次程式碼修改後，都必須在 `src/config.js` 中 **遞增 beta 版號**（例如 `2.0.7-beta22` → `2.0.7-beta23`）。
- **iOS/iPad 相容性規範**：必須包含廣泛的 `@match` 與 `@include` 規則（包含 `http` 與 `*://`），否則 iOS Userscripts 應用程式會顯示「無匹配腳本」。規範詳見 `build.sh` 與 `docs/BLOCKING_ARCHITECTURE.md`。
- 使用 `./build.sh --no-bump` 進行建置（避免 build script 自行跳號）。
- **每次出新版都必須檢查穩定使用者偏好不會被版號誤重置**：資料上傳同意、每日自動/手動上傳偏好、以及其他非功能實驗偏好，不得只因 `CONFIG.VERSION` 或 manifest 版本變更而重新詢問或重置。若需要重新取得同意，必須使用獨立的政策/資料範圍版本（例如 `PLATFORM_SYNC_CONSENT_POLICY_VERSION`）並確認是資料範圍或同意文案實質變更。
- **每次出新版都必須做 artifact parity 檢查**：確認 `src/config.js`、`dist/extension/content.js`、`dist/extension/manifest.json`、`dist/extension.zip`、`dist/threads_blocker_chrome.zip`、版本化 Chrome zip、Userscript header 版本一致，避免使用 stale zip 或錯分支包。
- **每次出新版都必須做 installed truth 檢查**：不能只看 repo/dist，必須在實際執行環境確認載入版本（例如 Chrome console 的 `Content Script Injected, Version: ...`、Safari Userscripts 實際檔案），以使用者正在跑的版本作為最終判定面。
- **每次出新版都必須做功能測試**：依本次改動覆蓋實際流程，而不是只跑 build。至少對受影響功能做 smoke test；若碰到檢舉/封鎖/worker/storage，必須驗證「Threads 畫面成功 → worker/report stats 也記 success，不得誤算 skipped/failed」、「找不到介面」不得吞掉已成功送出的結果。
- **每次出新版都必須做 storage migration / preference regression 檢查**：列出受影響 storage keys（例如 upload consent、manual/auto sync、queue、history、failed queue、debug state），確認舊版資料能被正確讀取/遷移，不會造成計數、偏好、佇列或歷史紀錄污染。
- **Release package source rule**：Chrome Web Store、手動安裝、測試安裝只能使用 `dist/extension.zip` 或已由 build script 驗證同步的 `dist/threads_blocker_chrome.zip` / 版本化 zip；禁止從歷史 zip、Chrome profile 已安裝目錄、或未驗證的暫存包反推發布。
- **正式版必須自動化檢查 debug UI 邊界**：除人工確認外，release build 後必須檢查正式版 UI 不含手動「匯出檢舉診斷」等 beta-only 入口；內部自動診斷可保留，但不可暴露使用者手動匯出按鈕。
- **Store / backend postflight**：若 release 牽涉 Chrome Web Store、平台上傳、Cloudflare Worker、D1 schema 或其他後端，必須做 dry-run / smoke test，部署後確認 live health、CWS `uploadState=SUCCESS` / `publishStatus=OK` 或等價狀態，並記錄實際部署版本。
- **Rollback artifact rule**：正式版或 production-facing 發布必須留下可回復物與來源：git tag、上一版 zip/套件、上一個 Cloudflare deployment id 或等價 rollback reference；沒有 rollback reference 不得宣稱 release 完成。
- **CHANGELOG migration/privacy rule**：只要改到資料上傳、同意文案、storage migration、queue/history/statistics、隱私或平台同步，`CHANGELOG.md` 必須明確記錄狀態變更與使用者影響，不能只寫功能摘要。
- **禁止自行發布正式版**。只有當使用者明確說「可以發布正式版」時，才執行以下流程：
  1. 使用 `./build.sh --release` 去除 beta 標籤
  2. 更新 `README.md` 中的版本號與功能說明
  3. 更新 `CHANGELOG.md`，以第一句話作為 TL;DR 摘要（Convention over Configuration 原則）
  4. 確認建置成功後，依使用者指示進行 commit / push
- **正式版必須關閉手動診斷匯出入口**。像「匯出檢舉診斷」這類 debug/export UI 只允許出現在 beta；正式版可保留內部問題回報所需的自動診斷附件，但不可提供使用者手動匯出按鈕。

## 📊 平台資料口徑規範

- `platform_source_registry` 只能代表匿名來源曾觸達系統、目前 trust tier 與近期活躍狀態；不可直接當作已入庫可分析事件數。
- `platform_raw_ingests` 是收到的完整 raw payload 存證層；所有非空且未超過平台上限的 payload 必須先寫入 raw 存證，再做 schema、duplicate、trust、materialized metrics 判定。Production active path 必須是 R2 保存完整 raw payload，D1 只保存 `r2://...` pointer，不可把大型 raw JSON 寫回 D1。
- `platform_uploads` 與其 materialized metrics（`platform_daily_metrics` / `platform_category_metrics` / `platform_source_metrics`）才是公開趨勢、分類與敘事統計的資料來源。
- Worker ingest 不可在確認 payload 可新增入 `platform_uploads` 前遞增 registry 的 `upload_count` 或 trust 累計；重複 payload 只能更新 last-seen 類活躍資訊。
- 公開頁呈現必須分開標示「近期回報來源」與「可分析批次 / 可分析事件」，避免把活躍來源數誤讀為已進入公開統計的樣本量。
- 修改 `cf_bug_admin/src/index.js` 中任何 D1 `INSERT` / materialized metrics 寫入邏輯後，部署前必須跑 `node cf_bug_admin/scripts/check-sql-placeholders.mjs`，避免欄位數、`VALUES` 數與 bind 參數數量不一致，造成 raw 已存但可分析表未入庫。
- 部署 `threadsblocker-bug-admin` Worker 前必須確認 `cf_bug_admin/wrangler.toml` 指向 active D1 `threadsblocker_bug_admin_v2` / `595fc1df-b6fd-491a-b3c7-325994a409a7`，且包含 R2 binding `RAW_INGEST_BUCKET` -> `threadsblocker-platform-raw-ingests`。舊 D1 `threadsblocker_bug_admin` / `28a80d0f-04fb-4ddc-a107-1d3e1de6cc99` 只作為 raw archive / rollback source，不可清除或切回 active ingest。
