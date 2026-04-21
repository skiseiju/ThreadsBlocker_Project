# SDD：公開頁 Mock Data 規格

**文件狀態：** Draft  
**最後更新：** 2026-04-21  
**適用範圍：** `site/platform/` 公開頁示範資料、平台首頁 Demo、首份月報 Demo  
**相容目標：** `site/platform/public.js` 現行 `MOCK_DATA` 消費格式  

---

## 1. 文件目的

本文件定義 ThreadsBlocker analytics platform 公開頁在真實上傳資料量尚不足前，所使用的示範資料（mock data）規範。

此示範資料的目標不是「看起來漂亮」，而是要同時滿足以下條件：

1. 讓潛在使用者一眼看懂平台能觀察哪些模式。
2. 數字看起來可信，不過度完美，也不過度稀疏。
3. 能在圖表上明顯看出政治事件前後的波動。
4. 不因 mock data 本身而產生誤導性政治判斷或個人指涉風險。

---

## 2. 設計原則

### 2.1 真實感原則

- 不使用過度整齊的數列。
- 不使用過度圓整的數字。
- 不讓各指標彼此「完美對齊」。
- 需保留日常低波動與事件日高波動。

### 2.2 展示目的原則

- 公開頁 mock data 是產品示範，不是假裝真實監測結果。
- 所有示範資料都必須附固定註解：

```js
// 此為示範資料，實際資料來源為使用者上傳批次
```

### 2.3 中性描述原則

- 熱門敘事框架必須使用中性、模式描述型語言。
- 不命名真實個人、真實帳號、真實貼文。
- 不寫出帶有事實認定意味的措辭，例如「網軍名單」、「操控者」、「特定陣營假帳號」。

### 2.4 相容性原則

本規格需與現行 `site/platform/public.js` 相容。  
現行公開頁直接消費的主欄位如下：

- `overview`
- `dateRange`
- `credibility`
- `signals`
- `dailyTrend`
- `reportCategories`
- `topNarratives`
- `methodology`

本 SDD 可新增擴充欄位，但不得破壞上述欄位名稱與基本 shape。

---

## 3. 視覺展示策略

### 3.1 30 天圖表應呈現的感受

公開頁 30 天折線圖應呈現以下觀感：

- 平日有持續但不誇張的事件量。
- 事件日會有肉眼可見的明顯高峰。
- 高峰不是每週固定出現，避免看起來像人工硬塞。
- 30 天視窗內至少有 3 到 4 個 spike。

### 3.2 基線與 spike 規範

針對公開頁示範圖的 `dailyTrend.total_event_count`：

- 平日基線：`22` 到 `39`
- spike 日：基線的 `3x` 到 `5x`
- spike 日建議範圍：`91` 到 `132`

### 3.3 與總樣本數的關係

為了同時滿足「圖表可讀」與「平台規模感」兩件事，mock data 採雙層聚合：

- `dailyTrend.*_event_count`：公開頁視覺化用的日聚合事件桶（較小、較易讀）
- `overview.totalEventCount` 與 `credibility.totalEventSampleCount`：整個示範資料集的總樣本量（較大，代表平台已累積的匿名樣本規模）

這表示：

- 圖表上的 30 天日數列，不必與 `overview.totalEventCount` 做嚴格相加相等。
- 前者是公開頁顯示層的 normalized demo buckets。
- 後者是整體示範資料庫規模。

此差異必須在內部註解中標明，避免後續工程誤判。

---

## 4. 政治事件時間軸 Mock 資料規範

### 4.1 事件標記策略

政治事件標記分成兩層：

1. `politicalEventMarkers`
   目前 30 天示範視窗內實際要疊加到圖上的事件。
2. `eventReferenceLibrary`
   2024-2025 可重用的事件參考庫，供未來更換視窗或月報時使用。

### 4.2 必備參考事件

以下事件必須存在於 `eventReferenceLibrary`：

| 日期 | 事件 |
| --- | --- |
| 2024-01-13 | 2024 年總統與立委選舉投票日 |
| 2024-05-20 | 賴清德、蕭美琴就職 |
| 2024-05-17 | 立法院處理國會職權修法時爆發激烈衝突 |
| 2024-05-21 | 立法院續審國會職權修法，再度成為政治焦點 |
| 2024-10-13 | 基隆市長罷免案投票 |
| 2025-03-12 | 總預算、財劃法覆議案遭立法院否決 |
| 2025-04-08 | 多起立委罷免案進入第二階段連署領表焦點期 |
| 2025-04-15 | 中選會表示 41 件罷免案涉偽造或死亡連署並已告發 |
| 2025-04-16 | 幽靈連署案偵辦升高，政治討論量擴大 |
| 2025-04-24 | 大罷免二階連署倒數記者會成為輿論節點 |

### 4.3 本次示範視窗

公開頁第一版 mock data 建議固定使用：

- `2025-04-01` 至 `2025-04-30`

理由：

- 可直接對應「2025 年 4 月月報」。
- 30 天內自然存在 4 個可視化 spike。
- 不需硬把 2024 事件塞進同一視窗。

### 4.4 本次示範視窗的 spike 對照

| 日期 | 事件 | 預期波動 |
| --- | --- | --- |
| 2025-04-02 | 文學界與公眾人物連署挺罷免聲量升高 | 第 1 波 spike |
| 2025-04-08 | 多件罷免案進入二階連署領表期 | 第 2 波 spike |
| 2025-04-15 ~ 2025-04-16 | 中選會告發涉偽造連署案、檢調偵辦升高 | 第 3 波 spike |
| 2025-04-24 ~ 2025-04-25 | 二階連署倒數、領表與記者會形成新一波討論 | 第 4 波 spike |

### 4.5 `dailyTrend` 建議示範數列

以下數列作為第一版公開頁示範資料的標準值：

| 日期 | total | block | report | sourceCount | 備註 |
| --- | ---: | ---: | ---: | ---: | --- |
| 2025-04-01 | 29 | 18 | 11 | 11 | 基線 |
| 2025-04-02 | 94 | 61 | 33 | 27 | spike：罷免聲量升高 |
| 2025-04-03 | 37 | 24 | 13 | 14 | 回落 |
| 2025-04-04 | 33 | 21 | 12 | 13 | 基線 |
| 2025-04-05 | 27 | 17 | 10 | 10 | 基線 |
| 2025-04-06 | 31 | 19 | 12 | 12 | 基線 |
| 2025-04-07 | 35 | 22 | 13 | 13 | 微升 |
| 2025-04-08 | 112 | 71 | 41 | 31 | spike：二階領表 |
| 2025-04-09 | 38 | 24 | 14 | 14 | 回落 |
| 2025-04-10 | 34 | 21 | 13 | 12 | 基線 |
| 2025-04-11 | 29 | 18 | 11 | 11 | 基線 |
| 2025-04-12 | 26 | 16 | 10 | 10 | 基線 |
| 2025-04-13 | 32 | 20 | 12 | 12 | 基線 |
| 2025-04-14 | 36 | 23 | 13 | 13 | 微升 |
| 2025-04-15 | 128 | 82 | 46 | 34 | spike：中選會告發 |
| 2025-04-16 | 121 | 76 | 45 | 33 | spike：偵辦升高 |
| 2025-04-17 | 41 | 26 | 15 | 15 | 回落但仍偏高 |
| 2025-04-18 | 34 | 21 | 13 | 12 | 基線 |
| 2025-04-19 | 30 | 19 | 11 | 11 | 基線 |
| 2025-04-20 | 28 | 17 | 11 | 10 | 基線 |
| 2025-04-21 | 33 | 21 | 12 | 12 | 基線 |
| 2025-04-22 | 37 | 23 | 14 | 13 | 微升 |
| 2025-04-23 | 35 | 22 | 13 | 13 | 微升 |
| 2025-04-24 | 103 | 65 | 38 | 29 | spike：倒數記者會 |
| 2025-04-25 | 97 | 62 | 35 | 28 | spike：領表焦點延續 |
| 2025-04-26 | 39 | 24 | 15 | 14 | 回落 |
| 2025-04-27 | 31 | 19 | 12 | 11 | 基線 |
| 2025-04-28 | 34 | 21 | 13 | 12 | 基線 |
| 2025-04-29 | 36 | 22 | 14 | 13 | 微升 |
| 2025-04-30 | 32 | 20 | 12 | 12 | 基線 |

### 4.6 事件標記文案規則

事件標記需符合下列格式：

```js
{
  date: '2025-04-15',
  title: '中選會表示多件罷免案涉偽造或死亡連署',
  category: '罷免案',
  note: '公共政治事件標記，僅作時序對照，不代表與平台樣本存在已證實因果關係。'
}
```

規則：

- `title` 要精簡，不超過 28 個全形字。
- `category` 用中性類別，例如 `選舉`、`罷免案`、`國會事件`、`政黨政治`。
- `note` 固定帶入外部參考免責語。

---

## 5. 四大指標 Mock 資料規範

### 5.1 欄位定義

現行公開頁使用 `signals`：

```js
signals: {
  sourceConcentrationPct,
  repeatedNarrativePct,
  shortTermDiffusionPct,
  coordinatedAccountEstimate,
  coordinatedSourceCount
}
```

### 5.2 建議值

| 指標 | 對外顯示值 | 內部 normalized 值 | 說明 |
| --- | --- | --- | --- |
| 來源集中度 | `67.4%` | `0.674` | 中度偏高，可讀為少數來源集中放大 |
| 文字重複率 | `43.2%` | `0.432` | 中度偏高，足夠顯示模式但不誇張 |
| 短期擴散速度 | `+38.6%` | `0.386` | 最近 7 日相較前 7 日的增幅 |
| 協調帳號數 | `847` | 不適用 | 用估計值，不用整百整千 |

### 5.3 相容性規範

為了相容現行 `public.js`，mock data 內必須保留 `%` 用的數值欄位：

```js
signals: {
  sourceConcentrationPct: 67.4,
  repeatedNarrativePct: 43.2,
  shortTermDiffusionPct: 38.6,
  coordinatedAccountEstimate: 847,
  coordinatedSourceCount: 23,
  normalized: {
    sourceConcentrationRatio: 0.674,
    repeatedNarrativeRatio: 0.432,
    shortTermDiffusionRatio: 0.386
  }
}
```

---

## 6. 舉報分類分佈 Mock 資料規範

### 6.1 分佈原則

- `垃圾訊息` 應為最大宗，因為這是最常被快速使用的預設路徑。
- `霸凌或騷擾` 應明顯居次。
- `其他` 必須保留但不可過大。

### 6.2 建議分佈

以 `reportEventCount = 7,148` 作為示範總量時，建議如下：

| 分類 | eventCount | sharePct |
| --- | ---: | ---: |
| 垃圾訊息 | 4,147 | 58.0 |
| 霸凌或騷擾 | 1,352 | 18.9 |
| 不實資訊 | 1,006 | 14.1 |
| 暴力或仇恨 | 429 | 6.0 |
| 其他 | 214 | 3.0 |

### 6.3 相容 shape

```js
reportCategories: [
  { label: '垃圾訊息', eventCount: 4147, accountCount: 612, sourceCount: 141, sharePct: 58.0 },
  { label: '霸凌或騷擾', eventCount: 1352, accountCount: 248, sourceCount: 79, sharePct: 18.9 },
  { label: '不實資訊', eventCount: 1006, accountCount: 187, sourceCount: 62, sharePct: 14.1 },
  { label: '暴力或仇恨', eventCount: 429, accountCount: 94, sourceCount: 31, sharePct: 6.0 },
  { label: '其他', eventCount: 214, accountCount: 53, sourceCount: 18, sharePct: 3.0 }
]
```

---

## 7. 熱門協調敘事框架 Top 5 Mock 資料規範

### 7.1 內容原則

- 主題需貼近台灣政治討論脈絡。
- 內容保持中性，不點名特定個人。
- 敘事描述要像研究摘要，不像政治評論。

### 7.2 標準格式

每筆敘事框架至少包含：

```js
{
  title,
  signalScore,
  sampleCount,
  firstSeen,
  category
}
```

為了相容現行頁面，也必須補齊：

- `summary`
- `eventCount`
- `sourceCount`
- `accountCount`
- `signalBand`
- `hintLabels`

### 7.3 建議 Top 5

```js
[
  {
    title: '以「程序正當性」與「議事透明」為主軸的重複討論框架',
    signalScore: 74,
    sampleCount: 628,
    firstSeen: '2025-04-02',
    category: '國會程序',
    summary: '多個來源反覆使用相近措辭，圍繞議事程序、表決合法性與公開透明等角度進行轉述。',
    eventCount: 628,
    sourceCount: 14,
    accountCount: 173,
    signalBand: 'high',
    hintLabels: ['程序正當性', '議事透明']
  },
  {
    title: '以「連署真偽爭議」與「選務公正」為核心的同步轉述框架',
    signalScore: 71,
    sampleCount: 587,
    firstSeen: '2025-04-15',
    category: '罷免案',
    summary: '樣本中出現高度相似的提問句與判斷句，集中討論連署真偽、查核機制與制度信任問題。',
    eventCount: 587,
    sourceCount: 12,
    accountCount: 149,
    signalBand: 'high',
    hintLabels: ['連署真偽', '選務公正']
  },
  {
    title: '以「大罷免倒數」與「公民動員」為主題的口號式擴散框架',
    signalScore: 68,
    sampleCount: 541,
    firstSeen: '2025-04-08',
    category: '公民動員',
    summary: '可觀察到短句口號、時間倒數與行動呼籲被多次複製轉傳，語氣明顯一致。',
    eventCount: 541,
    sourceCount: 11,
    accountCount: 138,
    signalBand: 'high',
    hintLabels: ['倒數', '公民動員']
  },
  {
    title: '以「預算審議衝突」延伸到「治理失衡」的評論框架',
    signalScore: 62,
    sampleCount: 463,
    firstSeen: '2025-03-12',
    category: '預算與憲政',
    summary: '部分來源以固定句型延伸討論預算審議、覆議結果與治理穩定性的關聯。',
    eventCount: 463,
    sourceCount: 9,
    accountCount: 121,
    signalBand: 'medium',
    hintLabels: ['預算審議', '治理失衡']
  },
  {
    title: '以「地方治理表現」連結「中央政治對立」的混合式敘事框架',
    signalScore: 57,
    sampleCount: 394,
    firstSeen: '2025-04-24',
    category: '地方與中央',
    summary: '多個樣本將地方治理議題與中央政治對立並置，使用相似修辭形成跨主題聚合。',
    eventCount: 394,
    sourceCount: 8,
    accountCount: 109,
    signalBand: 'medium',
    hintLabels: ['地方治理', '中央對立']
  }
]
```

---

## 8. 資料可信度指標 Mock 資料規範

### 8.1 建議值

| 指標 | 建議值 |
| --- | --- |
| 獨立貢獻使用者數 | 312 |
| 資料涵蓋時間範圍 | 30 days |
| 總事件樣本數 | 18,432 |
| 來源覆蓋率 | 73% |

### 8.2 相容 shape

```js
credibility: {
  effectiveUploadCount: 312,
  activeObservationDays: 30,
  totalEventSampleCount: 18432,
  sourceCoveragePct: 73,
  reportSourceCoveragePct: 69
}
```

### 8.3 `overview` 建議值

首頁摘要卡建議同步採用：

```js
overview: {
  uploadCount: 312,
  blockEventCount: 11284,
  reportEventCount: 7148,
  totalEventCount: 18432,
  sourcePostCount: 2763,
  topicSeedCount: 57,
  sourceCoveragePct: 73,
  reportSourceCoveragePct: 69
}
```

原則：

- 總量要足以讓平台看起來已有公共觀測價值。
- 不能大到像「平台全量資料」。
- `topicSeedCount`、`sourcePostCount` 也必須避開圓整值。

---

## 9. 月報 Mock 資料規範

### 9.1 月份

- `2025年4月`

### 9.2 報告摘要文字範本

建議約 150 字，範例如下：

> 2025 年 4 月公開樣本顯示，平台事件量在平日維持低至中度波動，但於罷免案二階連署、選務爭議與檢調偵辦升高的節點出現明顯增幅。整體四大指標呈現中度風險訊號，其中來源集中度與文字重複率均高於穩定背景值，顯示少數敘事框架在短時間內被反覆轉述。由於本平台資料來自使用者自願上傳，並非社群平台全量資料，因此本月報告僅反映匿名樣本中的可觀察模式與公共事件之時序對照。

### 9.3 Key findings

- 4 月共有 4 波可視化 spike，均與罷免案與選務爭議節點相鄰。
- 來源集中度為 `67.4%`，顯示少數來源在高波動時段具有較高放大量。
- 重複敘事主要集中在程序正當性、連署真偽與公民動員三類框架。

### 9.4 Notable events correlations

- `2025-04-02`：文學界與公眾人物連署挺罷免後，圖表出現本月第一波明顯上揚。
- `2025-04-08`：多件立委罷免案進入二階領表期，事件量升至第二波高點。
- `2025-04-15` 至 `2025-04-16`：中選會告發與檢調偵辦升高，形成全月最高峰。
- `2025-04-24` 至 `2025-04-25`：二階連署倒數與公開記者會再度推高事件量。

### 9.5 建議物件

```js
monthlyReportDemo: {
  monthKey: '2025-04',
  monthLabel: '2025年4月',
  summary: '2025 年 4 月公開樣本顯示，平台事件量在平日維持低至中度波動，但於罷免案二階連署、選務爭議與檢調偵辦升高的節點出現明顯增幅。整體四大指標呈現中度風險訊號，其中來源集中度與文字重複率均高於穩定背景值，顯示少數敘事框架在短時間內被反覆轉述。由於本平台資料來自使用者自願上傳，並非社群平台全量資料，因此本月報告僅反映匿名樣本中的可觀察模式與公共事件之時序對照。',
  keyFindings: [
    '4 月共有 4 波可視化 spike，均與罷免案與選務爭議節點相鄰。',
    '來源集中度為 67.4%，顯示少數來源在高波動時段具有較高放大量。',
    '重複敘事主要集中在程序正當性、連署真偽與公民動員三類框架。'
  ],
  notableEventCorrelations: [
    { date: '2025-04-02', label: '文學界連署挺罷免聲量升高', impact: '形成第一波 spike' },
    { date: '2025-04-08', label: '多件罷免案進入二階領表期', impact: '形成第二波 spike' },
    { date: '2025-04-15', label: '中選會告發涉偽造或死亡連署案', impact: '形成全月最高峰' },
    { date: '2025-04-24', label: '二階連署倒數記者會', impact: '形成第四波 spike' }
  ]
}
```

---

## 10. JS 資料格式規範

### 10.1 單一物件規範

所有 mock data 必須統一收斂到單一 JS 物件：

```js
const MOCK_DATA = { ... };
```

### 10.2 最低必要欄位

```js
const MOCK_DATA = {
  // 此為示範資料，實際資料來源為使用者上傳批次
  schema: 'threadsblocker.platform_public.v1',
  generatedAt: '2026-04-21T00:00:00Z',
  days: 30,
  overview: {},
  dateRange: {},
  credibility: {},
  thresholds: {},
  signals: {},
  dailyTrend: [],
  politicalEventMarkers: [],
  eventReferenceLibrary: [],
  reportCategories: [],
  topNarratives: [],
  monthlyReportDemo: {},
  methodology: {}
};
```

### 10.3 與現行 `public.js` 的相容說明

1. `dailyTrend` 的每筆資料必須保留：
   - `day_key`
   - `total_event_count`
   - `block_event_count`
   - `report_event_count`
   - `source_count`
2. `reportCategories` 的每筆資料必須保留：
   - `label`
   - `eventCount`
   - `accountCount`
   - `sourceCount`
   - `sharePct`
3. `topNarratives` 的每筆資料必須保留現行頁面欄位，並可加上新欄位：
   - `title`
   - `summary`
   - `eventCount`
   - `sourceCount`
   - `accountCount`
   - `signalBand`
   - `hintLabels`
   - `signalScore`
   - `sampleCount`
   - `firstSeen`
   - `category`

### 10.4 `politicalEventMarkers` 與外部事件檔

目前 `public.js` 的政治事件資料由 `/platform/data/political-events.json` 載入。  
本 SDD 要求 mock data 在單一物件中仍保留：

```js
politicalEventMarkers: [...]
```

若頁面維持現況，有兩種實作方式：

1. build 時將 `MOCK_DATA.politicalEventMarkers` 輸出成 `political-events.json`
2. mock mode 下直接改由 `MOCK_DATA.politicalEventMarkers` 供圖表渲染

第一版可先採第 1 種，最少改動。

---

## 11. 建議完整示範物件骨架

```js
const MOCK_DATA = {
  // 此為示範資料，實際資料來源為使用者上傳批次
  schema: 'threadsblocker.platform_public.v1',
  generatedAt: '2026-04-21T00:00:00Z',
  days: 30,
  overview: {
    uploadCount: 312,
    blockEventCount: 11284,
    reportEventCount: 7148,
    totalEventCount: 18432,
    sourcePostCount: 2763,
    topicSeedCount: 57,
    sourceCoveragePct: 73,
    reportSourceCoveragePct: 69
  },
  dateRange: {
    start: '2025-04-01',
    end: '2025-04-30',
    activeDays: 30
  },
  credibility: {
    effectiveUploadCount: 312,
    activeObservationDays: 30,
    totalEventSampleCount: 18432,
    sourceCoveragePct: 73,
    reportSourceCoveragePct: 69
  },
  thresholds: {
    categoryMinEvents: 7,
    narrativeMinSources: 3,
    narrativeMinEvents: 34,
    highSignalScore: 70,
    mediumSignalScore: 55
  },
  signals: {
    sourceConcentrationPct: 67.4,
    repeatedNarrativePct: 43.2,
    shortTermDiffusionPct: 38.6,
    coordinatedAccountEstimate: 847,
    coordinatedSourceCount: 23,
    normalized: {
      sourceConcentrationRatio: 0.674,
      repeatedNarrativeRatio: 0.432,
      shortTermDiffusionRatio: 0.386
    }
  },
  dailyTrend: [
    { day_key: '2025-04-01', total_event_count: 29, block_event_count: 18, report_event_count: 11, source_count: 11 },
    { day_key: '2025-04-02', total_event_count: 94, block_event_count: 61, report_event_count: 33, source_count: 27 },
    { day_key: '2025-04-03', total_event_count: 37, block_event_count: 24, report_event_count: 13, source_count: 14 },
    { day_key: '2025-04-04', total_event_count: 33, block_event_count: 21, report_event_count: 12, source_count: 13 },
    { day_key: '2025-04-05', total_event_count: 27, block_event_count: 17, report_event_count: 10, source_count: 10 },
    { day_key: '2025-04-06', total_event_count: 31, block_event_count: 19, report_event_count: 12, source_count: 12 },
    { day_key: '2025-04-07', total_event_count: 35, block_event_count: 22, report_event_count: 13, source_count: 13 },
    { day_key: '2025-04-08', total_event_count: 112, block_event_count: 71, report_event_count: 41, source_count: 31 },
    { day_key: '2025-04-09', total_event_count: 38, block_event_count: 24, report_event_count: 14, source_count: 14 },
    { day_key: '2025-04-10', total_event_count: 34, block_event_count: 21, report_event_count: 13, source_count: 12 },
    { day_key: '2025-04-11', total_event_count: 29, block_event_count: 18, report_event_count: 11, source_count: 11 },
    { day_key: '2025-04-12', total_event_count: 26, block_event_count: 16, report_event_count: 10, source_count: 10 },
    { day_key: '2025-04-13', total_event_count: 32, block_event_count: 20, report_event_count: 12, source_count: 12 },
    { day_key: '2025-04-14', total_event_count: 36, block_event_count: 23, report_event_count: 13, source_count: 13 },
    { day_key: '2025-04-15', total_event_count: 128, block_event_count: 82, report_event_count: 46, source_count: 34 },
    { day_key: '2025-04-16', total_event_count: 121, block_event_count: 76, report_event_count: 45, source_count: 33 },
    { day_key: '2025-04-17', total_event_count: 41, block_event_count: 26, report_event_count: 15, source_count: 15 },
    { day_key: '2025-04-18', total_event_count: 34, block_event_count: 21, report_event_count: 13, source_count: 12 },
    { day_key: '2025-04-19', total_event_count: 30, block_event_count: 19, report_event_count: 11, source_count: 11 },
    { day_key: '2025-04-20', total_event_count: 28, block_event_count: 17, report_event_count: 11, source_count: 10 },
    { day_key: '2025-04-21', total_event_count: 33, block_event_count: 21, report_event_count: 12, source_count: 12 },
    { day_key: '2025-04-22', total_event_count: 37, block_event_count: 23, report_event_count: 14, source_count: 13 },
    { day_key: '2025-04-23', total_event_count: 35, block_event_count: 22, report_event_count: 13, source_count: 13 },
    { day_key: '2025-04-24', total_event_count: 103, block_event_count: 65, report_event_count: 38, source_count: 29 },
    { day_key: '2025-04-25', total_event_count: 97, block_event_count: 62, report_event_count: 35, source_count: 28 },
    { day_key: '2025-04-26', total_event_count: 39, block_event_count: 24, report_event_count: 15, source_count: 14 },
    { day_key: '2025-04-27', total_event_count: 31, block_event_count: 19, report_event_count: 12, source_count: 11 },
    { day_key: '2025-04-28', total_event_count: 34, block_event_count: 21, report_event_count: 13, source_count: 12 },
    { day_key: '2025-04-29', total_event_count: 36, block_event_count: 22, report_event_count: 14, source_count: 13 },
    { day_key: '2025-04-30', total_event_count: 32, block_event_count: 20, report_event_count: 12, source_count: 12 }
  ],
  politicalEventMarkers: [
    { date: '2025-04-02', title: '文學界連署挺罷免聲量升高', category: '罷免案', note: '公共政治事件標記，僅作時序對照，不代表與平台樣本存在已證實因果關係。' },
    { date: '2025-04-08', title: '多件罷免案進入二階連署領表期', category: '罷免案', note: '公共政治事件標記，僅作時序對照，不代表與平台樣本存在已證實因果關係。' },
    { date: '2025-04-15', title: '中選會表示多件罷免案涉偽造或死亡連署', category: '罷免案', note: '公共政治事件標記，僅作時序對照，不代表與平台樣本存在已證實因果關係。' },
    { date: '2025-04-16', title: '幽靈連署案偵辦升高', category: '罷免案', note: '公共政治事件標記，僅作時序對照，不代表與平台樣本存在已證實因果關係。' },
    { date: '2025-04-24', title: '二階連署倒數記者會成為輿論節點', category: '公民動員', note: '公共政治事件標記，僅作時序對照，不代表與平台樣本存在已證實因果關係。' }
  ],
  eventReferenceLibrary: [
    { date: '2024-01-13', title: '2024 年總統與立委選舉投票日', category: '選舉' },
    { date: '2024-05-17', title: '立法院國會職權修法攻防爆發衝突', category: '國會事件' },
    { date: '2024-05-20', title: '賴清德、蕭美琴就職', category: '就職' },
    { date: '2024-05-21', title: '立法院續審國會職權修法', category: '國會事件' },
    { date: '2024-10-13', title: '基隆市長罷免案投票', category: '罷免案' },
    { date: '2025-03-12', title: '總預算與財劃法覆議案遭否決', category: '預算與憲政' },
    { date: '2025-04-08', title: '多件罷免案進入二階連署領表期', category: '罷免案' },
    { date: '2025-04-15', title: '中選會告發多件涉偽造或死亡連署案', category: '罷免案' },
    { date: '2025-04-16', title: '幽靈連署案偵辦升高', category: '罷免案' },
    { date: '2025-04-24', title: '二階連署倒數記者會', category: '公民動員' }
  ],
  reportCategories: [
    { label: '垃圾訊息', eventCount: 4147, accountCount: 612, sourceCount: 141, sharePct: 58.0 },
    { label: '霸凌或騷擾', eventCount: 1352, accountCount: 248, sourceCount: 79, sharePct: 18.9 },
    { label: '不實資訊', eventCount: 1006, accountCount: 187, sourceCount: 62, sharePct: 14.1 },
    { label: '暴力或仇恨', eventCount: 429, accountCount: 94, sourceCount: 31, sharePct: 6.0 },
    { label: '其他', eventCount: 214, accountCount: 53, sourceCount: 18, sharePct: 3.0 }
  ],
  topNarratives: [],
  monthlyReportDemo: {},
  methodology: {
    scoreBands: { low: '0-54', medium: '55-69', high: '70+' },
    principles: [
      '公開頁只呈現匿名樣本中的統計模式與中性訊號。',
      '示範資料為產品展示用途，不代表真實平台現況。',
      '資料來自使用者自願上傳，並非平台全量資料。'
    ]
  }
};
```

---

## 12. 驗收條件

### 12.1 數值驗收

- 不使用 `100`、`500`、`1000`、`10000` 這類過度圓整值。
- 四大指標、分類計數、摘要卡數值都需為非圓整值。
- `協調帳號數` 使用 `847`，不可改為 `800` 或 `850`。

### 12.2 圖表驗收

- 30 天圖表內需有 `3` 到 `4` 個肉眼明顯可見的 spike。
- spike 至少為基線的 `3x`。
- 平日波動不能看起來完全線性。

### 12.3 事實驗收

- 政治事件標記日期必須可被查證，且日期正確。
- 2024 與 2025 的事件 reference marker 必須實際存在於台灣政治時序中。
- 不得杜撰不存在的政治事件。

### 12.4 文案驗收

- 全文使用台灣繁體中文。
- 熱門敘事框架不得命名真實個人、真實帳號、真實社群貼文。
- 月報摘要不得使用帶有法律定性的措辭。

### 12.5 工程驗收

- `MOCK_DATA` 可直接 inline 於 `public.js` 使用。
- 若維持現行外部事件檔模式，`politicalEventMarkers` 可無損轉出為 `/platform/data/political-events.json`。
- 現行 `public.js` 在 mock mode 下不應因新增欄位而報錯。

---

## 13. 實作建議

第一版建議採以下做法：

1. 以本文件的完整 `MOCK_DATA` 規格更新 `site/platform/public.js` 內的 mock 資料。
2. 另同步更新 `/site/platform/data/political-events.json`，內容取自 `MOCK_DATA.politicalEventMarkers`。
3. 月報頁上線時，直接使用 `monthlyReportDemo` 作為首份示範報告內容來源。

若後續公開頁改為真正模組化資料檔，則保留同一個 object shape，不要重新命名欄位。

---

## 14. 來源日期參考

本文件採用的關鍵日期應以公開可驗證新聞或官方資訊為準，至少包含：

- `2024-01-13`：中選會公告之 2024 總統立委選舉投票日
- `2024-05-20`：總統府與中央社可驗證之就職日期
- `2024-05-17`、`2024-05-21`：中央社對立法院國會職權修法衝突與續審報導
- `2024-10-13`：中央社對基隆市長罷免案投票日期報導
- `2025-03-12`：中央社對總預算、財劃法覆議案遭否決報導
- `2025-04-08`、`2025-04-15`、`2025-04-16`、`2025-04-24`：中央社對 2025 年 4 月罷免案政治節點報導

本 SDD 只引用日期作為公共事件時序標記，不對事件本身做政治立場判斷。
