# Platform Data Coverage — SDD
Date: 2026-04-21

## 背景

根據 `docs/data-coverage-map.md` 的分析，平台目前有三個資料缺口需要補齊：

1. **分類分佈**：`reportLeafCategory` 資料 extension 已上傳，但 CF Worker ingest 沒有聚合存表
2. **Signals 百分比**：三個信號指標目前全靠 `MOCK_DATA`，實際數值從未計算過
3. **政治事件資料**：完全靠手動維護 HTML，需要自動化爬蟲每日更新

---

## Item 1：分類分佈聚合

### 目標
讓 `/api/v1/platform/overview` 回傳真實的 reportCategory 聚合數字，取代目前 `public.js` 的 MOCK。

### D1 Schema 新增
```sql
CREATE TABLE IF NOT EXISTS platform_category_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER NOT NULL,
  category_label TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  account_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_platform_category_upload
  ON platform_category_metrics(upload_id);
CREATE INDEX IF NOT EXISTS idx_platform_category_event
  ON platform_category_metrics(event_count DESC);
```

### CF Worker ingest 變更（`handlePlatformIngest`）

在 ingest 完 `platform_uploads` 之後，掃 `body.events[]`：

```
categoryMap = {}
for event in body.events:
  label = event.reportLeafCategory || event.reportPrimaryCategory
  if label:
    categoryMap[label].eventCount++
    categoryMap[label].accountIds.add(event.accountId)
    categoryMap[label].sourceUrls.add(event.sourceUrl)

for each label in categoryMap:
  INSERT INTO platform_category_metrics
    (upload_id, category_label, event_count, account_count, source_count)
  VALUES (uploadId, label, eventCount, accountIds.size, sourceUrls.size)
```

### API 回傳變更（`handlePublicPlatformOverview`）

在現有 overview query 之後，新增：

```sql
SELECT
  category_label,
  SUM(event_count) AS event_count,
  SUM(account_count) AS account_count,
  SUM(source_count) AS source_count
FROM platform_category_metrics
WHERE upload_id IN (
  SELECT id FROM platform_uploads
  WHERE datetime(created_at) >= datetime('now', ?)
)
GROUP BY category_label
ORDER BY event_count DESC
LIMIT 10
```

計算 `sharePct = event_count / totalEventCount * 100`，只回傳 `sharePct >= 1` 的項目。

回傳 key：`reportCategories`（陣列，每項有 `label`, `eventCount`, `accountCount`, `sourceCount`, `sharePct`）

---

## Item 2：Signals 百分比

### 定義

| 指標 | 計算方式 | 資料來源 |
|---|---|---|
| `sourceConcentrationPct` | top 3 來源事件數 ÷ totalEventCount × 100 | `body.sources[]` 排序後取前 3 |
| `repeatedNarrativePct` | narrativeSeeds 涵蓋事件數 ÷ totalEventCount × 100 | `body.analysisSeeds.narrativeSeeds[].eventCount` |
| `shortTermDiffusionPct` | campaignCandidates 涵蓋事件數 ÷ totalEventCount × 100 | `body.analysisSeeds.campaignCandidates[].blockEventCount + reportEventCount` |

### D1 Schema 變更（`platform_uploads` 加欄）
```sql
ALTER TABLE platform_uploads ADD COLUMN source_concentration_pct REAL DEFAULT 0;
ALTER TABLE platform_uploads ADD COLUMN repeated_narrative_pct REAL DEFAULT 0;
ALTER TABLE platform_uploads ADD COLUMN short_term_diffusion_pct REAL DEFAULT 0;
```

### CF Worker ingest 計算邏輯

在 INSERT platform_uploads 之前計算：

```
sources = body.sources sorted by totalEventCount DESC
top3EventCount = sum of top 3 sources' totalEventCount
sourceConcentrationPct = min(100, top3EventCount / totalEventCount * 100)

narrativeEventCount = sum(narrativeSeed.eventCount for seed in body.analysisSeeds.narrativeSeeds)
repeatedNarrativePct = min(100, narrativeEventCount / totalEventCount * 100)

campaignEventCount = sum(c.blockEventCount + c.reportEventCount for c in body.analysisSeeds.campaignCandidates)
shortTermDiffusionPct = min(100, campaignEventCount / totalEventCount * 100)
```

Edge case：`totalEventCount == 0` 時三個值都為 0。

### API 回傳變更

在 overview 聚合中新增：

```sql
ROUND(AVG(source_concentration_pct), 1) AS avg_source_concentration_pct,
ROUND(AVG(repeated_narrative_pct), 1) AS avg_repeated_narrative_pct,
ROUND(AVG(short_term_diffusion_pct), 1) AS avg_short_term_diffusion_pct
```

回傳 key：`signals.sourceConcentrationPct`, `signals.repeatedNarrativePct`, `signals.shortTermDiffusionPct`

---

## Item 3：政治事件爬蟲服務

### 架構

```
Linode cron (daily 01:00 Asia/Taipei)
  └── Node.js + Crawlee 爬蟲服務
        ├── 抓台灣主流新聞 RSS（中央社、聯合、自由、三立）
        ├── 抓 Google Trends Taiwan（unofficial JSON endpoint）
        └── 結果 POST → CF Worker admin endpoint → D1 political_events
```

### 服務目錄結構（新建）
```
crawlers/
  political-events/
    package.json
    src/
      index.js          # 進入點，執行所有 crawlers，彙整後送 API
      crawlers/
        rss.js          # RSS 抓取（Crawlee HttpCrawler）
        gtrends.js      # Google Trends Taiwan
      classifier.js     # 用規則把標題分類成事件類別
      uploader.js       # POST 到 CF Worker admin endpoint
    .env.example        # PLATFORM_ADMIN_TOKEN, CF_WORKER_URL
```

### D1 Schema 新增（在 cf_bug_admin）
```sql
CREATE TABLE IF NOT EXISTS political_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_date TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  source_name TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_political_events_date
  ON political_events(event_date DESC);
```

### 新增 CF Worker endpoints

**Admin ingest（爬蟲寫入）：**
```
POST /api/v1/admin/political-events/ingest
Authorization: Bearer <ADMIN_TOKEN>
Body: { events: [{ event_date, category, title, source_name }] }
```
邏輯：UPSERT（同 event_date + title 不重複寫入），單次最多 50 筆。

**Public 查詢：**
```
GET /api/v1/platform/political-events?days=30
```
回傳最近 N 天的 political_events，依 event_date DESC 排序，最多 60 筆。無需 auth。

### 分類規則（classifier.js）

基於關鍵詞的輕量分類，不用 LLM（避免成本和 latency）：

| 類別 | 關鍵詞 |
|---|---|
| 罷免案 | 罷免、連署、投票日、門檻 |
| 國會事件 | 立法院、院會、委員會、表決、三讀 |
| 政黨動態 | 國民黨、民進黨、民眾黨、聲明、記者會 |
| 性別爭議 | 性別、婦女、平權 |
| 性騷擾指控 | MeToo、性騷、指控 |
| 娛樂八卦 | 藝人、明星、八卦、情感 |
| 歧視爭議 | 歧視、族群、仇恨言論 |
| 網路論戰 | 網紅、直播主、互罵、論戰 |
| 直播爭議 | 直播、開台、下架 |
| 社會事件 | 社群、平台、協調、假帳號 |

無法分類 → 跳過不存（不存 `其他` 避免噪音）。

### RSS 來源清單

| 媒體 | RSS URL |
|---|---|
| 中央社 | `https://feeds.rti.org.tw/news` 或 CNA RSS |
| 聯合新聞網 | `https://udn.com/rssfeed/news/2/0` |
| 自由時報 | `https://news.ltn.com.tw/rss/politics.xml` |
| 三立新聞 | `https://www.setn.com/RssXml.aspx` |

每個 RSS 抓最新 20 則標題，取 `pubDate` 當 `event_date`。

### 排程設定（Linode crontab）
```
0 1 * * * cd /home/deploy/crawlers/political-events && node src/index.js >> /var/log/political-events-crawler.log 2>&1
```

---

## 驗收條件

### Item 1
- [ ] `platform_category_metrics` 表建立
- [ ] 新 ingest 上傳後，表有對應資料列
- [ ] `/api/v1/platform/overview` 回傳 `reportCategories` 陣列
- [ ] `public.js` 讀 API 資料時正確渲染分類（不再依賴 MOCK）

### Item 2
- [ ] `platform_uploads` 三欄新增
- [ ] 新 ingest 上傳後，三個百分比正確計算並存入
- [ ] `/api/v1/platform/overview` 回傳 `signals` 物件含三個值
- [ ] `public.js` 讀 API 資料時正確渲染 signals

### Item 3
- [ ] `political_events` D1 表建立
- [ ] CF Worker 新增兩個 endpoints（admin ingest + public query）
- [ ] `crawlers/political-events/` 專案可 `node src/index.js` 執行
- [ ] 執行後 D1 有資料
- [ ] Linode crontab 設定完成，每日 01:00 自動執行
- [ ] `platform/reports/index.html` 政治事件區塊改為動態讀取 API（或 `public.js` 整合）

---

## 實作順序建議

1. Item 1 + 2 一起改（都在 `cf_bug_admin/src/index.js`）→ `wrangler deploy`
2. Item 3 CF Worker 部分（新增兩個 endpoints）→ `wrangler deploy`
3. Item 3 爬蟲服務（新建 `crawlers/political-events/`）→ Linode 部署
4. `public.js` 更新（讀 signals + reportCategories）
5. `reports/index.html` 政治事件改動態
