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
- 本節各項 release QA 在同一版本只執行一次；明確不受本次改動影響的項目標記 `N/A` 並附一句理由，不為了形式重跑。驗收失敗最多做一次本次範圍內修正並重驗；仍失敗就停止、保留證據並回報，不得自行展開新的驗證或返工循環。
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

## 🎛️ UI / Preview 忠實度規範

- **ThreadsBlocker 實機 QA / 截圖禁止用 gstack 代替 Chrome**：當使用者要求「直接用 Chrome」、驗證 Chrome extension、Threads 真實頁面、實機截圖或 installed truth 時，必須使用本機 Google Chrome / Chrome profile / Chrome extension 實際環境；不得用 gstack browser、GStack、臨時 Chromium、示意 HTML preview 或其他替代瀏覽器冒充 Chrome 結果。若因限制只能使用其他瀏覽器或臨時環境，必須明確標示「不是 Chrome installed truth」，且不得拿該結果當作使用者正在跑的版本結論。
- **Chrome installed truth 必須優先使用使用者已開啟的 Chrome**：若使用者已經開好 Chrome、Threads 分頁或要求「用我現在這個 Chrome」，必須先用該現有 Google Chrome 視窗 / profile / extension 做 installed truth；不得自行另開臨時 Chrome、測試 profile、Playwright persistent context 或重新解壓 extension 來替代。只有使用者明確同意開測試 profile，或現有 Chrome 無法被自動化讀取時，才可另開臨時 Chrome；且必須標示為「測試安裝 / 不是使用者目前正在跑的 installed truth」，不得拿它當最終判定。
- **專案 Chrome 規則優先於通用 debug / visual QA skills**：若通用技能要求「fresh browser」「Playwright」「installed truth」或「manual QA」，必須先套用本檔的 Chrome 規則：讀取現有 Chrome → 確認目前載入版本與 DOM 狀態 → 再決定是否需要重新載入既有 extension / 分頁。不得因 skill 建議而跳過現有 Chrome、另開瀏覽器、或用測試安裝結果覆蓋使用者目前 Chrome 的事實。
- **改動使用者現有 Chrome 狀態前必須先回報目前事實**：若現有 Chrome 正在跑舊版、Threads 分頁不在前景、extension 未載入或需要 reload，先回報看到的具體狀態（例如 `Content Script Injected, Version: ...`、`hege_version_check`、目前 URL），再依使用者指示操作；不得默默改用臨時環境繞過。
- **Ponytail / 最小改動不得犧牲 UI 忠實度、既有版型穩定性、預覽一致性**：少寫程式碼只能代表少動正確的地方，不得用「快速、簡化、差不多」作為改變文案、排版、按鈕位置或互動行為的理由。
- **Ponytail 在 UI / 文案 / 預覽任務的邊界**：Ponytail 只能用來減少抽象、檔案數、重複程式與 speculative features；不能用來減少必要確認、忠實度、既有文案保留、既有版型保留、互動位置穩定或 preview 一致性。
- **最小改動的定義**：最小改動不是「最快做出看起來可用的版本」，而是「保留既有行為與畫面，只改使用者要求的最小差異」。若使用者要求加按鈕、加文案或調整入口，預設應沿用原本 modal / footer / CTA 的版型規則，不得重新詮釋整個區塊。
- **臨時 HTML preview 必須忠實反映實際產品檔**：若為 modal、頁面或元件建立預覽，文字、按鈕數量、按鈕位置、連結、主要版型與互動狀態必須從實際實作逐字逐版型同步；不得手刻簡化版、摘要文案、替換連結或只做示意圖冒充實際畫面。
- **使用者要求「給我看」時的 preview 規則**：必須優先提供實際實作畫面；若受限只能做臨時 HTML preview，該 preview 必須逐字逐版型同步實作內容，並明確避免示意圖、摘要版、手刻簡化版。
- **既有 modal / footer 加按鈕不得讓版型自行漂移**：新增第三顆按鈕時，必須明確固定左 / 中 / 右或沿用既有設計規則，不能只把按鈕塞進 `flex-wrap` 造成桌面、窄螢幕或預覽畫面排列不一致。

## 📊 平台資料口徑規範

- `platform_source_registry` 只能代表匿名來源曾觸達系統、目前 trust tier 與近期活躍狀態；不可直接當作已入庫可分析事件數。
- `platform_raw_ingests` 是收到的完整 raw payload 存證層；所有非空且未超過平台上限的 payload 必須先寫入 raw 存證，再做 schema、duplicate、trust、materialized metrics 判定。Production active path 必須是 R2 保存完整 raw payload，D1 只保存 `r2://...` pointer，不可把大型 raw JSON 寫回 D1。
- `platform_uploads` 與其 materialized metrics（`platform_daily_metrics` / `platform_category_metrics` / `platform_source_metrics`）才是公開趨勢、分類與敘事統計的資料來源。
- Worker ingest 不可在確認 payload 可新增入 `platform_uploads` 前遞增 registry 的 `upload_count` 或 trust 累計；重複 payload 只能更新 last-seen 類活躍資訊。
- 公開頁呈現必須分開標示「近期回報來源」與「可分析批次 / 可分析事件」，避免把活躍來源數誤讀為已進入公開統計的樣本量。
- 修改 `cf_bug_admin/src/index.js` 中任何 D1 `INSERT` / materialized metrics 寫入邏輯後，部署前必須跑 `node cf_bug_admin/scripts/check-sql-placeholders.mjs`，避免欄位數、`VALUES` 數與 bind 參數數量不一致，造成 raw 已存但可分析表未入庫。
- 部署 `threadsblocker-bug-admin` Worker 前必須確認 `cf_bug_admin/wrangler.toml` 指向 active D1 `threadsblocker_bug_admin_v2` / `595fc1df-b6fd-491a-b3c7-325994a409a7`，且包含 R2 binding `RAW_INGEST_BUCKET` -> `threadsblocker-platform-raw-ingests`。舊 D1 `threadsblocker_bug_admin` / `28a80d0f-04fb-4ddc-a107-1d3e1de6cc99` 只作為 raw archive / rollback source，不可清除或切回 active ingest。

## Scanner 與平台資料可靠性

- Profile scanner 是可恢復的有限掃描工作，不以 ADCL（自治資料補全迴圈）管理。完成判定以本次使用者選定範圍、cursor 是否到達終點，以及具名的 completed／private／failed 狀態為準。
- 相同 cursor 或 input snapshot 重跑不得重複 profile、queue item、raw ingest 或 materialized metric，也不得建立第二個 active worker。
- private profile、timeout、schema/trust conflict 與 upload failure 不得假完成；所有 skipped／failed 必須保留可判讀 reason，暫態 lock 最終必須釋放。
- 平台 raw ingest → accepted upload → materialized metrics 屬資料 reconciliation：duplicate payload 不得重複計數，公開統計必須能回溯 accepted upload 與原始存證。
- 人工 approved／rejected 是單筆 review 狀態，不自動代表可泛化規則；若要改分類規則，必須另有 reviewed fixture、regression test 與明確版本變更。
