# 資料對照表：Extension 上傳 vs 平台呈現

更新日期：2026-04-21

## 頁面資料來源現況

| 頁面 | 資料來源 |
|---|---|
| `platform/index.html` | `public.js` → 優先打 API，API 沒資料則用 `MOCK_DATA` |
| `platform/reports/index.html` | **全靜態 hardcoded** — 不打 API，所有數字都是寫死的 |
| `platform/methodology/index.html` | 全靜態說明文字，無資料依賴 |

## 逐項對照

| 呈現的內容 | Extension 有沒有這個資料？ | 路徑 | 目前狀態 |
|---|---|---|---|
| **總事件數** (封鎖 + 檢舉) | ✅ 有 | `events[]` → D1 `platform_uploads.total_event_count` → API overview | 架構通，但 reports 頁是 mock |
| **帳號樣本數** | ✅ 有 | `accounts[]` → D1 topic_metrics `account_count` | 架構通 |
| **來源數** (source posts) | ✅ 有 | `sources[]` → D1 `source_post_count` | 架構通 |
| **有效上傳批次** | ✅ 有 | `platform_uploads.upload_count` | 架構通 |
| **每日趨勢圖** | ✅ 有 | `events[].eventAt` → D1 `platform_daily_metrics` | 架構通 |
| **來源覆蓋率 %** | ✅ 有 | `summary.sourceCoveragePct` (extension 算好送上來) | 架構通 |
| **協調帳號估計數** | ✅ 有 | `analysisSeeds.suspiciousAccounts.length` | 架構通，但 API 有沒有回這個需確認 |
| **來源集中度 %** | ⚠️ 間接有 | 需從 source_metrics 算，目前 API 沒直接欄位 | **API 沒回這個，public.js 靠 MOCK** |
| **重複敘事 %** | ⚠️ 間接有 | `narrativeSeeds` | **API 沒回這個，public.js 靠 MOCK** |
| **短時擴散 %** | ⚠️ 間接有 | `campaignCandidates` | **API 沒回這個，public.js 靠 MOCK** |
| **敘事框架 — 標題** | ⚠️ 部分有 | `topicSeeds[].topicLabel`（只有關鍵詞，如「罷免」「投票資格」） | **完整標題需人工撰寫** |
| **敘事框架 — 摘要/分析文字** | ❌ 沒有 | Extension 不產生自然語言描述 | **100% 人工撰寫** |
| **敘事框架 — 事件數/帳號數/來源數** | ✅ 有 | `platform_topic_metrics` | 架構通 |
| **敘事框架 — 信號等級 (高/中/低)** | ✅ 有 | `sources[].manipulationSignalScore` → `manipulation_risk_level` | 架構通 |
| **敘事框架 — hint tags** | ✅ 有 | `topicSeeds[].hintLabels` / `topTopicHints` | 架構通 |
| **分類分佈 (垃圾訊息/霸凌等)** | ✅ 有 | `events[].reportLeafCategory` → D1 (目前沒有獨立表) | ⚠️ **D1 沒有 reportCategory 表，API 可能沒回這個** |
| **政治事件參考表格** | ❌ 完全無關 | Extension 不抓外部政治事件 | **100% 手動維護，與 extension 無關** |
| **樣本限制數字** (活躍日、日期區間) | ✅ 有 | `platform_uploads.created_at` range | 架構通 |

## 缺口摘要

### 需要人工維護
- **敘事框架標題與分析文字**：extension 只給 topicLabel 關鍵詞，不產生人類可讀的敘事描述
- **政治事件參考表格**：與 extension 資料完全無關，純手動維護

### 架構缺口（API 沒回，目前靠 MOCK）
- `signals.sourceConcentrationPct`：來源集中度 %
- `signals.repeatedNarrativePct`：重複敘事 %
- `signals.shortTermDiffusionPct`：短時擴散 %
- **分類分佈**：D1 沒有 reportCategory 聚合表，CF Worker ingest 沒有把 `reportLeafCategory` 存進去
