# 2.6 平台資料端到端盤點

日期：2026-04-22  
範圍：`extension exportPayload v2 -> cf_bug_admin ingest -> public API -> platform UI`

## 結論

- 2.6 的 **extension payload、worker ingest、public overview API** 已經大致接通，首頁需要的核心統計欄位大多能由真實上傳資料餵出來。
- 真正還沒完成端到端的不是 schema，而是 **最後一哩的呈現層**：
  - `platform/reports/index.html` 還是靜態月報。
  - `platform/methodology/index.html` 還沒把 API metadata 真正揭露出來。
  - `auto sync` 只有 opt-in metadata，還沒有每日自動上傳流程。
- 因此現在最準確的判斷是：
  - **homepage：大致可 live**
  - **reports：尚未 live**
  - **methodology：API 有資料，但頁面還沒吃**

## 端到端清單

| 公開輸出 | Extension 來源 | Worker / D1 路徑 | Public UI 消費端 | 狀態 |
|---|---|---|---|---|
| 總事件數 | `events[]` | `platform_uploads.total_event_count` | `platform/index.html` | **已接通** |
| 封鎖 / 檢舉分流 | `events[].eventType` | `platform_daily_metrics` / overview aggregation | `platform/index.html` | **已接通** |
| 上傳批次數 | upload batch | `platform_uploads` | `platform/index.html` | **已接通** |
| 來源樣本數 | `sources[]` | `platform_uploads.source_post_count` | `platform/index.html` | **已接通** |
| 來源覆蓋率 | `summary.sourceCoveragePct` | `platform_uploads.source_coverage_pct` | `platform/index.html` | **已接通** |
| 每日趨勢 | `events[].eventAt` | `platform_daily_metrics` | `platform/index.html` | **已接通** |
| 話題時序 | `events[]` + `sources[]` + topic inference | `platform_topic_daily_v2` | `public.js` trend chart | **已接通** |
| spike 標記 | ingest 聚合時判斷 | `dailyTrend.is_spike` | `public.js` trend chart | **已接通** |
| 分類分佈 | `events[].reportLeafCategory` | `platform_category_metrics` | `platform/index.html` | **已接通** |
| 來源集中度 | `sources[]` 分布 | ingest 計算 `source_concentration_pct` | `signals` badges | **已接通** |
| 重複敘事率 | `analysisSeeds.narrativeSeeds` | ingest 計算 `repeated_narrative_pct` | `signals` badges | **已接通** |
| 短時擴散率 | `analysisSeeds.campaignCandidates` | ingest 計算 `short_term_diffusion_pct` | `signals` badges | **已接通** |
| 協調帳號估計 | high-signal source metrics | `projectPublicPlatformOverview()` 聚合 | `signals` badges | **已接通** |
| 敘事標題 / 摘要 | `sourceTextSample` + `topTopicHints` | `buildPublicNarratives()` | `platform/index.html` | **部分接通** |
| why note / 編輯層解釋 | 無 | 無 | `public.js` mock only | **未接通** |
| taxonomy version | 無需 client 額外提供 | API `taxonomyVersion` | 尚未顯示於 methodology/home | **API 已通，UI 未通** |
| sample scope | `clientSourceId` 驅動 trust accumulation | `resolveTrustMeta()` / API `sampleScope` | 尚未顯示於 methodology/home | **API 已通，UI 未通** |
| trust policy | 無需 client 額外提供 | API `methodology.trustPolicy` | 尚未顯示於 methodology/home | **API 已通，UI 未通** |
| evidence bundle 可重分 | `sourceEvidence[]` | R2 `EVIDENCE_BUCKET` | admin / reclass future path | **基礎已通，前台未使用** |
| 政治事件表 | 不在 extension | `/api/v1/platform/political-events` | homepage / reports | **獨立資料源** |
| 每日自動同步 | `syncPreferences` / storage flags | 只記錄 `sync_enabled` / `upload_trigger` / `lastSyncedAt` | 無自動觸發器 | **未接通** |

## 驗證重點

### 1. Extension payload 已達 2.6 所需資料量

目前 `exportPayload v2` 已包含：

- `clientSourceId`
- `syncPreferences`
- `summary`
- `accounts`
- `events`
- `sources`
- `sourceEvidence`
- `analysisSeeds`

而且 `Reporter.submitPlatformPayload()` 會再補：

- `uploadMeta.clientPlatform`
- `uploadMeta.autoSyncEnabled`
- `uploadMeta.uploadTrigger`

這表示 server-side trust accumulation、signal aggregation、R2 evidence bundle 所需的 client 基礎資料都已存在。

### 2. Worker ingest 已超過早期文件描述

目前 ingest 不只會收資料，還已經做了：

- public signal 三指標聚合
- category metrics 聚合
- topic daily 聚合
- trust tier / sample scope 判定
- public overview projection
- narrative summary 規則生成
- evidence bundle 存 R2

所以先前「signals 還沒回」「report categories 還沒存」這類判斷，現在都已過期。

### 3. 真正還卡住的是 public presentation completeness

目前 `platform/index.html` 已經具備 live API 主路徑，但還有兩個現實限制：

- 仍保留 `MOCK_DATA` fallback，資料不足時首頁可能顯示 mock。
- narrative 的 `whyNote` 還只存在 mock，不在 live API。

而 `platform/reports/index.html` 更明確地還在舊狀態：

- hero meta 寫死
- 本期摘要寫死
- 趨勢表寫死
- 四大指標寫死
- 敘事卡與解讀文案寫死
- 只有政治事件表格會即時抓 API

## 建議下一步

### P1

- 把 `platform/reports/index.html` 改成吃 public API，而不是維持靜態月報數字。
- 在 `platform/methodology/index.html` 或首頁顯示 `taxonomyVersion`、`sampleScope`、`trustPolicy`，讓 trusted-only 公開原則真正被看見。
- 用一筆真實 extension upload 打 `/api/v1/platform/overview` 做一次實測，確認不是只有 code path 理論上接通。

### P2

- 決定 `topNarratives` 是否要新增 live `whyNote` / rationale 欄位；如果不要，就把前端 mock 式展開文案拿掉，避免首頁真假資料層級不一致。
- 把首頁 `MOCK_DATA` fallback 改成更明確的 empty-state，避免低資料量時看起來像「已經有真實觀測結果」。

### P3

- 若 2.6 的產品承諾包含「每日自動同步」，就補真正的 Chrome / Firefox 每日一次 upload gate；現在只有設定值與 metadata，還沒有 scheduler。
