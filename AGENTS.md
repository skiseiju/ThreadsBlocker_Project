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


<claude-mem-context>
# Memory Context

# [ThreadsBlocker/ThreadsBlocker-analytics-upload] recent context, 2026-04-22 2:38am GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (13,800t read) | 578,818t work | 98% savings

### Apr 21, 2026
S128 ThreadsBlocker platform 部署目標確認 + SDD 產品定位核心訊息新增 (Apr 21 at 1:41 AM)
S130 ThreadsBlocker platform/index.html 光主題最簡重設計 — Codex 重寫並部署至 Cloudflare Pages (Apr 21 at 1:45 AM)
S134 分析 Extension 上傳資料架構 vs 公開頁面呈現資料的對應關係，找出架構缺口 (Apr 21 at 1:51 AM)
S135 建立 Extension 上傳 vs 平台呈現資料對照表 (Apr 21 at 5:25 PM)
S136 撰寫 SDD 並請 Codex fast 處理實作 (Apr 21 at 5:27 PM)
S137 Platform Data Coverage SDD 建立 — 三項資料缺口補齊計畫 (Apr 21 at 5:32 PM)
S138 新建政治事件爬蟲服務 crawlers/political-events/ (Apr 21 at 5:38 PM)
S139 Political Events Crawler Dry Run — RSS Failures and Working Source (Apr 21 at 5:43 PM)
S140 gtrends.js 改用 ht:news_item_title 解析；rss.js 移除三立新聞 (Apr 21 at 5:59 PM)
S141 三立新聞整合進 fetchRssEvents sources 陣列 (Apr 21 at 6:09 PM)
1134 6:19p 🔵 public.js political event pin color system uses category set membership
1135 " 🔵 April 2026 monthly report content and statistics confirmed
1136 " ✅ Political events table in monthly report given hookable DOM IDs and CSS classes
1137 6:20p 🟣 Monthly report political events table converted to dynamic API-driven rendering
1138 7:03p ⚖️ 敘事摘要長度規範調整為 3-5 行
1139 " 🔵 ThreadsBlocker 分析報告頁面內容結構確認
1140 7:04p 🔵 月報頁面動態載入政治事件對照表的實作確認
1141 " 🟣 hint-tag 點擊開啟 Narrative Modal
1142 7:05p 🔵 reports/index.html 插入點行號確認
1143 " 🟣 月報 hint-tag 點擊展開 modal 詳情功能
1144 7:06p 🟣 hint-tag modal 已成功寫入 index.html，版本升至 2.6.0-beta29
1163 10:46p 🟣 Donut SVG Chart for renderReportCategories in public.js
1164 " 🔵 renderReportCategories Pre-Edit State: Bar Chart at Line 499, Donut CSS Already Present
1165 10:47p 🟣 renderReportCategories Replaced with SVG Donut Chart — Shipped as 2.6.0-beta30
1183 11:40p 🟣 Add platform_topic_daily aggregation table and ingest logic to cf_bug_admin
1184 " 🟣 Spike Detection and Topic Time Series Added to Platform Overview API
1185 11:41p 🔵 cf_bug_admin index.js structure mapped for platform_topic_daily insertion
1186 " 🟣 Spike Detection and Topic Time Series Successfully Patched into cf_bug_admin
1187 " 🔵 cf_bug_admin index.js Contains Much Larger Feature Set Than Expected
1188 " 🟣 platform_topic_daily table and daily upsert logic added to cf_bug_admin
1189 " 🔵 Verified Final Line Numbers for Spike Detection and Topic Time Series in index.js
1191 11:47p 🟣 renderTrendChart 增加峰值標記、日期矩形互動與話題時序資料
1192 " 🟣 renderTrendChart 峰值標記與話題互動功能已成功套用，版本升至 beta31
1193 11:48p 🟣 ThreadsBlocker 2.6.0-beta31 建置成功，所有產物均已產出
1194 11:53p 🟣 Interactive Legend Toggle Filters for Trend Chart
1196 11:54p 🔵 Legend Toggle CSS Already Exists; public.js Is Untracked
1198 " 🟣 Chart Legend Toggle Filters Shipped in 2.6.0-beta32
### Apr 22, 2026
1292 1:36a 🔵 platform_topic_daily 記錄上傳日期而非實際封鎖日期
1293 1:37a 🔵 CF Worker ingest 完整程式碼路徑已釐清：platform_topic_daily 與 platform_daily_metrics 的分歧點
1294 " 🔵 Block 事件的 reportLeafCategory 為空——話題標籤只存在於 report 事件
1295 1:38a 🔵 toDayKey 自動處理秒與毫秒時間戳記
1303 1:51a 🔵 Extension Upload 與爬蟲事件的資料結構缺乏明確關聯鍵
1304 1:56a 🔵 Extension 資料與政治事件爬蟲的關聯設計：時間軸疊加，非資料表 JOIN
1305 2:09a ⚖️ X 事件定位架構：URL → 內容分析 → Spike 比對
1306 2:10a 🔵 Storage.evidence.upsert 資料結構與更新邏輯
1307 2:11a 🔵 sourceEvidence IndexMap 雙層架構：IndexedDB 全量 + localStorage 摘要索引
1308 " 🔵 Analytics Upload Schema v2：五大固定區塊含 sourceEvidence 與 analysisSeeds
1309 2:12a 🔵 Storage.evidence 容量與保留參數配置
1310 2:16a ⚖️ Taxonomy 分類架構三項關鍵決策
1311 2:17a ⚖️ 可重分線索存 R2 raw buffer，D1 只存聚合索引
1312 2:23a 🔵 CF Worker handlePlatformIngest 端點：Schema v2 接收與 D1 寫入流程
1313 " 🔵 Reporter.submitPlatformPayload 上傳流程：主端點 + fallback + GM_xmlhttpRequest 優先
1314 2:24a ⚖️ 平台資料信任模型：分級信任 + 寧可少算 + 行為累積升級
1315 2:28a 🔵 iOS 無法使用 Userscript 功能的限制確認
1316 " 🔵 iOS 實際上可透過 Userscripts App 使用留友封
1317 2:29a 🔵 留友封 build.sh 建置流程：三平台輸出 + Safari iCloud 自動部署
1318 " 🔵 留友封 iOS 三模式架構：同分頁模式專為 Safari Universal Links 限制設計
1319 2:35a 🔵 留友封專案當前 git 工作狀態：platform 公開頁面與站點更新待提交
1320 " 🔵 留友封 config.js 當前版本與核心端點配置（v2.6.0-beta32）
1321 " 🔵 留友封 SDD 文件架構：多個功能模組各自有獨立 SDD 目錄

Access 579k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>