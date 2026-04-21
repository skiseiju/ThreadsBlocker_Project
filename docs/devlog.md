# 留友封觀測站 開發日誌

## 2026-04-21

### 背景

留友封觀測站（ThreadsBlocker Analytics Upload Platform）是一個讓 Extension 上傳匿名聚合資料的平台。資料流：Extension → CF Worker（cf_bug_admin/src/index.js）→ D1 資料庫 → 公開平台頁（site/platform/）呈現。

### 更動紀錄

**1. 新增「檢舉分類分佈」section**
- 檔案：site/platform/index.html、public.js、styles.css
- 初版為水平長條圖，後改為 SVG 甜甜圈（donut）圖
- 顯示欄位：分類名稱、長條/圓弧、佔比%、事件數、帳號數
- 相關 CSS class：donut-wrap、donut-svg-host、donut-legend、donut-legend-row
- 資料來源：/api/v1/platform/overview 的 reportCategories 陣列

**2. 用語修正：舉報 → 檢舉（全站，共 4 處）**
- index.html 第 62、63、99 行
- public.js 第 503 行（empty state 訊息）

**3. CF Worker：新增話題時序資料收集**
- 檔案：cf_bug_admin/src/index.js
- 新增 D1 table：platform_topic_daily
  - 欄位：day_key, topic_label, event_count, upload_count
  - UNIQUE constraint：(day_key, topic_label)
- Ingest 時從 body.analysisSeeds.topicSeeds 提取話題標籤，UPSERT 進 platform_topic_daily（依日期聚合）

**4. CF Worker：Spike 偵測算法**
- 檔案：cf_bug_admin/src/index.js
- 函式 detectSpikes(rows)：7 日滾動平均，閾值 1.5x
- dailyTrend 每筆新增 is_spike: boolean 欄位
- 結果已加入公開 API 回應

**5. CF Worker：topicTimeSeries API**
- 檔案：cf_bug_admin/src/index.js
- 查詢 platform_topic_daily，按天分組，每天最多回傳 5 個 top topic
- 資料結構：[{ date: "YYYY-MM-DD", topics: [{ label, count }] }]
- 已加入 /api/v1/platform/overview 公開 API 回應

### 目前狀態

- CF Worker 已部署（version 9dc5e4c6）
- 前端已部署至 wip-analytics-upload.threadsblocker.pages.dev
- topicTimeSeries 和 is_spike 已在 API 回傳，但前端尚未使用這兩個欄位

### 下一步

- 前端趨勢圖：spike 日加視覺標記（例如紅點或底色）
- 前端趨勢圖：topicTimeSeries 疊圖（懸停時顯示當日熱門話題）
- 評估是否需要 Spike ↔ 政治事件的日期比對邏輯（在 CF Worker 實作）

---

### 更動紀錄（續）2026-04-21 下午

6. **前端趨勢圖：Spike 視覺標記**（site/platform/public.js）
   - `renderTrendChart` 新增第五參數 `topicTimeSeries`
   - Spike 日在圖表頂部顯示橙色圓點（fill="#f97316", r=5）
   - 透明 rect 覆蓋每個日期欄位，作為 hover 觸發區（.chart-day-rect）

7. **前端趨勢圖：話題 Hover**（site/platform/public.js）
   - 滑鼠移到任意日期 → 底部 detail 區顯示當天熱門話題（最多 5 個，含次數）
   - Spike 日額外顯示「▲ 異常峰值」標記
   - 話題資料來自 API topicTimeSeries 欄位

8. **index.html 接線**（site/platform/index.html）
   - `renderTrendChart` 呼叫新增第五個參數：`data.topicTimeSeries`

**目前狀態（更新）**
- 前端已部署（https://wip-analytics-upload.threadsblocker.pages.dev）
- 所有新欄位（is_spike、topicTimeSeries）已在前後端完整串接
- topicTimeSeries 在有新上傳資料後才會有內容（目前 platform_topic_daily 為空）

**下一步**
- 等待真實 extension 上傳後驗證話題資料顯示是否正確
- 評估 Spike ↔ 政治事件的日期比對邏輯（在 CF Worker 做，加入 correlatedEvents 欄位）
- 考慮在 mock 資料中加入 topicTimeSeries 範例以便前端測試

---

### 更動紀錄（續）2026-04-22

9. **趨勢圖加 Legend 與軸標籤**（site/platform/public.js + styles.css）
   - Y 軸左側加「事件數」旋轉文字
   - 圖表下方 legend：總事件、封鎖、檢舉、來源數（虛線）、異常峰值（橙點）

10. **趨勢圖圖例改為 Filter Toggle**（site/platform/public.js + styles.css）
    - Legend 改為 pill 形狀 button，點擊切換對應線條顯示/隱藏
    - 各線條加 SVG id：chart-path-total/block/report/source，spike dots 包進 `<g id="chart-spikes">`
    - 隱藏時 opacity→0，btn 加 .chart-legend-item--off

11. **政治事件改從 D1 API 讀取**（site/platform/public.js）
    - `loadPoliticalEvents` 改為優先打 CF Worker `/api/v1/platform/political-events?days=30&limit=60`
    - 欄位對應：event_date→date, title+shortLabel(前6字), source_name→note
    - API 失敗自動 fallback 靜態 JSON
    - Linode 爬蟲每日新增事件現在自動反映在主頁趨勢圖上
