# Project Guidelines

## 🚨 封鎖機制修改規範

在修改以下任何檔案之前，**必須先閱讀** [`BLOCKING_ARCHITECTURE.md`](./BLOCKING_ARCHITECTURE.md)：

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
- **iOS/iPad 相容性規範**：必須包含廣泛的 `@match` 與 `@include` 規則（包含 `http` 與 `*://`），否則 iOS Userscripts 應用程式會顯示「無匹配腳本」。規範詳見 `build.sh` 與 `BLOCKING_ARCHITECTURE.md`。
- 使用 `./build.sh --no-bump` 進行建置（避免 build script 自行跳號）。
- **禁止自行發布正式版**。只有當使用者明確說「可以發布正式版」時，才執行以下流程：
  1. 使用 `./build.sh --release` 去除 beta 標籤
  2. 更新 `README.md` 中的版本號與功能說明
  3. 更新 `CHANGELOG.md`，以第一句話作為 TL;DR 摘要（Convention over Configuration 原則）
  4. 確認建置成功後，依使用者指示進行 commit / push
- **正式版必須關閉手動診斷匯出入口**。像「匯出檢舉診斷」這類 debug/export UI 只允許出現在 beta；正式版可保留內部問題回報所需的自動診斷附件，但不可提供使用者手動匯出按鈕。


<claude-mem-context>
# Memory Context

# [ThreadsBlocker] recent context, 2026-04-25 5:12pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (9,151t read) | 761,262t work | 99% savings

### Apr 18, 2026
420 11:07p ⚖️ ThreadsBlocker：「收集整串名單做封鎖或檢舉」統一收集邏輯
423 11:09p 🔵 ThreadsBlocker 開發環境：gemini CLI 指令不存在
424 11:11p 🔵 ThreadsBlocker ui.js：showCleanListPicker 已整合同列全封與只檢舉為同一 Picker UI
### Apr 19, 2026
597 9:16p ⚖️ ThreadsBlocker 觀測平台 UI 重設計任務啟動
598 " 🔵 ThreadsBlocker 觀測平台 admin/platform 頁面完整架構確認
600 9:44p ⚖️ ThreadsBlocker 觀測平台 UI 重新設計：需求與限制確立
602 9:48p ⚖️ ThreadsBlocker 觀測平台 UI 重新設計：任務規格與設計方向確立
604 " 🟣 ThreadsBlocker admin/index.html 全面 UI 重構：暗色主題 + 威脅感知卡片系統
607 9:50p ✅ admin/index.html 二次寫入確認：subagent 完整覆蓋並移除 bypass 檔
S62 ThreadsBlocker 觀測平台公開報告頁設計討論：攻擊者分類是否需要統稱 (Apr 19 at 9:57 PM)
S64 ThreadsBlocker 公開報告頁攻擊者分類設計：小草定義為政治狂熱非中立帳號 (Apr 19 at 9:58 PM)
608 10:00p ⚖️ ThreadsBlocker 攻擊者分類：小草定義確立為政治狂熱非中立帳號
S66 ThreadsBlocker 公開現況報告頁設計：攻擊者分類推斷邏輯與完整頁面架構提案 (Apr 19 at 10:00 PM)
609 10:01p ⚖️ ThreadsBlocker 公開報告頁攻擊者分類：從封鎖來源推斷類型
S70 ThreadsBlocker 觀測平台 UI 重新設計：platform/index.html 公開報告頁完成並部署 (Apr 19 at 10:01 PM)
610 10:25p 🟣 ThreadsBlocker 公開資訊平台頁面全面重寫
611 10:30p ⚖️ ThreadsBlocker 觀測平台 UI 重新設計：需求與設計方向確立
613 " 🟣 ThreadsBlocker platform/index.html 全面重寫：公開意識報告頁上線
S74 ThreadsBlocker 公開頁攻擊者分類卡片缺少統計來源說明 — 提議讓卡片可展開顯示帳號列表與判定依據 (Apr 19 at 10:31 PM)
614 10:33p 🔵 threads-observe.skiseiju.com 無法連線：疑似 DNS 或 Cloudflare Pages 設定問題
615 10:36p ⚖️ ThreadsBlocker 公開報告頁假議題區塊 UI 方向討論
616 10:37p 🔵 ThreadsBlocker platform/index.html 完整架構確認（395 行）
617 10:42p 🟣 ThreadsBlocker platform/index.html：假議題 accordion 開關 + 使用者上傳區塊
619 " 🔵 platform/index.html mobile CSS 殘留舊 .fake-card / .fc-score 選擇器
622 10:43p 🔴 platform/index.html mobile CSS 修正：移除廢棄 fake-card 選擇器，改為 upload-hero 響應式規則
623 " ✅ site/_redirects 新增 /observe 路徑別名指向 platform/index.html
625 10:44p ✅ ThreadsBlocker platform 頁面部署至 Cloudflare Pages（accordion + 上傳區塊）
627 10:50p ⚖️ ThreadsBlocker 公開頁「帶風向議題」區塊 UI 佈局討論
628 " 🔵 ThreadsBlocker platform/index.html 完整頁面結構確認（480 行）
630 10:51p ⚖️ ThreadsBlocker 公開頁攻擊者分類卡片缺少統計來源說明
S77 ThreadsBlocker platform/index.html「是誰在破壞？」區塊重構為可展開帳號清單並部署 (Apr 19 at 10:51 PM)
632 10:52p ⚖️ ThreadsBlocker 攻擊者分類：AI 帳號偵測判斷邏輯討論
633 10:56p 🔵 ThreadsBlocker platform/index.html 完整資料架構確認（第 250-450 行）
634 11:00p 🟣 ThreadsBlocker platform/index.html「是誰在破壞？」區塊重構為可展開帳號清單
S79 ThreadsBlocker platform/index.html 攻擊者分類卡片重構為可展開 AJAX 詳情 + 曲線圖設計確認 (Apr 19 at 11:01 PM)
635 11:03p ⚖️ ThreadsBlocker platform/index.html 攻擊者分類重構決定 rollback
636 11:04p 🔵 site/platform/index.html 與 site/admin/index.html 皆為 untracked 檔案
638 11:06p 🔴 platform/index.html 攻擊者分類區塊 rollback：還原靜態卡片設計
640 " ✅ ThreadsBlocker platform/index.html rollback 部署至 Cloudflare Pages
642 11:13p ⚖️ ThreadsBlocker 攻擊者分類卡片重構為可展開 AJAX 詳情頁
S81 ThreadsBlocker platform/index.html 大改版：五卡片佈局 + 彈出視窗 + 趨勢折線圖，並部署至 Cloudflare Pages (Apr 19 at 11:13 PM)
644 11:21p 🟣 ThreadsBlocker platform/index.html 全面重構：五卡片佈局 + 彈出視窗 + 趨勢折線圖
S84 ThreadsBlocker platform/index.html：攻擊者帳號明細加入 Threads 貼文連結（source_url） (Apr 19 at 11:21 PM)
645 11:29p ⚖️ ThreadsBlocker 攻擊者帳號明細需加入貼文連結
647 " 🔵 ThreadsBlocker platform/index.html 帳號資料結構確認：suspectedAiBots 無貼文連結欄位
649 " 🔵 platform/index.html：aiBotComments 已含 source_url，可與 suspectedAiBots 透過 account_id 關聯
652 11:30p 🔵 platform/index.html normalizeDisplayData 完整資料流：suspectedAiBots 與 aiBotComments 並行填充
653 11:32p 🟣 ThreadsBlocker platform/index.html：Codex 派工加入貼文連結（source_url）至攻擊者帳號明細
655 11:33p 🟣 Codex 執行 platform/index.html source_url 三處修改完成
656 " 🔴 Codex workdir 錯誤：在 mispricing-engine 執行而非 ThreadsBlocker，任務規格找不到
658 11:35p ✅ Codex 第二次派工：明確指定 --repo mispricing-engine，任務規格已就位
660 11:36p 🔵 Codex sandbox 安全限制：無法寫入 workspace 以外的路徑（/Volumes/Working 2T/...）
662 " ✅ 建立 .codex-bypass 旗標：啟用 Opus 直接編輯模式
664 " 🟣 platform/index.html：suspectedAiBots mock 資料與 padAIBots() 均已加入 source_url 欄位
667 11:37p 🟣 platform/index.html 全部三處 source_url 修改驗證完成，攻擊者帳號明細現可顯示貼文連結
672 11:56p ⚖️ ThreadsBlocker platform/index.html「他們在散布什麼？」區塊設計規格確立
674 11:57p 🔵 ThreadsBlocker platform/index.html 檔案為空（0 bytes）
677 " 🔵 ThreadsBlocker platform/index.html 實際內容存於 Cloudflare Pages（54,742 bytes），本地檔案為空
S85 ThreadsBlocker platform/index.html：熱門議題列表卡片新增文章明細展開功能（含貼文連結與評斷依據） (Apr 19 at 11:57 PM)
### Apr 20, 2026
678 12:01a 🔵 ThreadsBlocker platform/index.html：openFakeModal 函式架構確認

Access 761k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
