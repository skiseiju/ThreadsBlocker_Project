# 資料對照表：Extension 上傳 vs 平台呈現

更新日期：2026-04-22

## 頁面資料來源現況

| 頁面 | 資料來源 | 現況 |
|---|---|---|
| `platform/index.html` | `public.js` 優先打 `/api/v1/platform/overview`，資料不足時 fallback `MOCK_DATA` | **半即時**：主頁可吃真實資料，但仍保留 mock fallback |
| `platform/reports/index.html` | 只有政治事件表格會打 `/api/v1/platform/political-events` | **大多靜態**：主文案、數字、趨勢表、四大指標、敘事卡都還是 hardcoded |
| `platform/methodology/index.html` | 靜態 HTML 文案 | **靜態**：沒有動態顯示 `taxonomyVersion` / `sampleScope` / `trustPolicy` |

## 逐項對照

| 呈現的內容 | Extension 有沒有這個資料？ | 路徑 | 目前狀態 |
|---|---|---|---|
| **總事件數** | ✅ 有 | `events[]` → D1 `platform_uploads.total_event_count` → public overview | **已接通** |
| **封鎖 / 檢舉事件數** | ✅ 有 | `events[].eventType` → D1 聚合 → public overview | **已接通** |
| **有效上傳批次** | ✅ 有 | `platform_uploads` 聚合 | **已接通** |
| **來源樣本數** | ✅ 有 | `sources[]` → D1 `source_post_count` | **已接通** |
| **來源覆蓋率 / 檢舉來源覆蓋率** | ✅ 有 | extension `summary.*CoveragePct` → D1 `platform_uploads` → public overview | **已接通** |
| **每日趨勢圖** | ✅ 有 | `events[].eventAt` → D1 `platform_daily_metrics` → `dailyTrend` | **已接通** |
| **話題時序 / spike marker** | ✅ 有 | `events[]` + `sources[]` → D1 `platform_topic_daily_v2` → `topicTimeSeries` | **已接通** |
| **分類分佈** | ✅ 有 | `events[].reportLeafCategory` → D1 `platform_category_metrics` → `reportCategories` | **已接通** |
| **來源集中度 %** | ⚠️ 間接有 | `sources[]` / source 分布 → ingest 時計算 `source_concentration_pct` → public `signals` | **已接通** |
| **重複敘事 %** | ⚠️ 間接有 | `analysisSeeds.narrativeSeeds` → ingest 時計算 `repeated_narrative_pct` → public `signals` | **已接通** |
| **短時擴散 %** | ⚠️ 間接有 | `analysisSeeds.campaignCandidates` → ingest 時計算 `short_term_diffusion_pct` → public `signals` | **已接通** |
| **協調帳號估計數** | ⚠️ 間接有 | `sources[]` / high-signal source metrics → public `signals.coordinatedAccountEstimate` | **已接通** |
| **敘事框架標題** | ⚠️ 部分有 | `sources[].sourceTextSample` + `topTopicHints` → API `buildPublicNarratives()` 規則生成 | **部分接通**：不是人工 editorial title，但已不是純 mock |
| **敘事框架摘要文字** | ⚠️ 部分有 | API `summarizeNarrativePattern()` 規則生成 `summary` | **部分接通**：有 live summary，但仍是規則摘要，不是完整人工分析 |
| **敘事框架 why note / 深度解讀** | ❌ 沒有 | `public.js` mock 支援 `whyNote`，live API 目前不回 | **仍靠 mock / 手寫文案** |
| **taxonomy version / sample scope / trust policy** | ✅ 有 | ingest / public API 已回 `taxonomyVersion`、`sampleScope`、`methodology.trustPolicy` | **API 已接通，頁面揭露不足** |
| **最近上傳批次時間** | ✅ 有 | D1 `platform_uploads.created_at` → `recentUploads` | **API 已接通，首頁未明顯使用** |
| **政治事件參考表格** | ❌ Extension 無此資料 | `/api/v1/platform/political-events` + `/platform/data/political-events.json` fallback | **獨立資料源，與 extension 無直接關聯** |
| **每日自動同步** | ⚠️ 只有 metadata | local storage `hege_platform_sync_*` + payload `syncPreferences` / `uploadMeta` | **尚未實作真正自動同步排程** |

## 缺口摘要

### 已經接通，但舊文件過期

- `signals.sourceConcentrationPct`
- `signals.repeatedNarrativePct`
- `signals.shortTermDiffusionPct`
- `reportCategories`
- `topicTimeSeries`
- `taxonomyVersion` / `sampleScope` / `trustPolicy`（API 層）

### 已有 live 資料，但平台呈現仍不完整

- `topNarratives` 已能由 API 規則生成 `title` / `summary` / `signalBand` / `hintLabels`，但沒有 `whyNote` 這種較完整的人工解讀層。
- `platform/index.html` 雖然可吃 live API，但 `public.js` 仍保留 `MOCK_DATA` fallback；資料量不足時，首頁仍可能顯示 mock。
- `platform/methodology/index.html` 仍是靜態頁，沒有把 API 已提供的 `taxonomyVersion`、`sampleScope`、`trustPolicy` 直接揭露出來。

### 仍未端到端接通

- `platform/reports/index.html` 仍以固定月份文案與寫死數字為主，不是由 extension 上傳資料驅動。
- opt-in sync 目前只有設定值與 upload metadata，沒有真正的每日一次自動同步流程。
