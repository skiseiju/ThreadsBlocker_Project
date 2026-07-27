# SDD: 話題放大偵測（Topic Amplification Detection）

- 版本: v1.3（2026-07-16：2.7.4-beta44 隱私 gate、description mode、public GET 唯讀與口徑修訂；v1.2 2026-07-11：§5.3 話術樣本公開修訂、新增 B8）
- 狀態: 施工中（B1/B2/M5 已上線；B8 已完成程式 gate 與 description-mode 過渡，律師完成證據仍未具備）
- 相關 ADR: [0006 觀測站定位轉向](adr/0006-observatory-repositioning.md)、[0007 帳號 ID 雜湊上傳與再處理層](adr/0007-account-hash-and-reprocessing.md)、[0008 每話題協調分數](adr/0008-per-topic-coordination-score.md)、[0009 話術樣本去識別化公開](adr/0009-deidentified-sample-publication.md)
- 前情: 2026-07-06 與海哥討論定案（Obsidian Bridge: 觀測站定位與帶風向偵測可行性討論）

---

## 1. 背景與定位

觀測站（threadsblocker.skiseiju.com/platform/）現況資料層厚、解讀層薄，且敘事野心（偵測協調操縱）超過資料能力（記錄防禦行為）。重定位為兩層：

- **地基「社群防禦紀錄」**：611 個貢獻者的封鎖/檢舉聚合，現在就成立
- **上層「話題放大偵測」**：本 SDD 的範圍——回答「這個話題的討論成長方式，像自然發生，還是像被推的？」

### 誠實邊界（寫死在產品文案，不得放寬）

- 只陳述行為模式（相似敘事、時間爆發、跨來源集中），不指認幕後身分
- 不宣稱內容由 AI 產生
- 不宣稱代表 Threads 全站（樣本為擴充功能使用者）

## 2. 目標與非目標

**目標**
- 90 天觀測窗自動產出 5–8 張有名字、有完整證據鏈的話題卡
- 每張卡的判定可被讀者用卡上證據自行檢驗
- 取代前台「議題關聯判定」區（人工策展已停更）

**非目標**
- 溯源 / 歸因（誰出錢、哪個組織）
- AI 生成內容判定
- 即時偵測（批次日更即可）

## 3. 資料現況盤點（2026-07-06 查核）

### 3.1 擴充功能已上傳、後端未利用的欄位（src/reporter.js）

| 欄位 | 位置 | 用途 |
|---|---|---|
| `topicHintCounts`(12/來源)、`topicSeeds`(20/批) | reporter.js:90,137 | 話題命名原料（現為原文片段，需正規化） |
| `textFingerprint` / `textHash` | reporter.js:91-97,113-114 | 同文偵測（不可逆指紋） |
| `timeBucket10mCounts` / `timeBucket1hCounts` | reporter.js:98-99 | 時間爆發偵測（已在收，毋須新欄位） |
| `temporalBuckets10m/1h`(80/批，附 top 指紋) | reporter.js:157-168 | 爆發窗口內的同文證據 |
| `narrativeSeeds.dominantTopicHints`(5) + `sourceTextSamples`(160字) | reporter.js:144-155 | 敘事群命名原料（後端輸出時未帶出 → hintLabels 空） |
| `accountIds` / `accounts[].username` | reporter.js:72-87、storage.js:1060 | 跨來源交叉驗證（**現為原文，見 §5**） |

### 3.2 後端已有聚合

- `topNarratives`：7 個同文群（前三群 59k/49k/35k 事件、25–139 來源），無名字
- `topicTimeSeries`：63 標籤，其中約 11 個是檢舉分類誤入、大量單日碎片
- `candidateTopics`：15 張人工策展卡，2026-06 後停更

### 3.3 已驗證缺口（2026-07-07）

- 自動偵測的 7 個協調群組（`topNarratives`）事件量很高，但 `topKeywords` 全空；抽查後判定主要是垃圾/騷擾洗版，不是政治網軍議題。
- 政治與公共政策話題（史瓦帝尼、軍購、沈伯洋等）主要來自人工策展錨點 `PUBLIC_CANDIDATE_TOPIC_DEFS`；命名良好，但原本只算關聯與事件量，沒有算協調程度。
- 真正缺口不是「再找一批協調群組」或「再命名政治話題」，而是把兩者交叉：對每個候選政治/公共話題，用命中的 source samples 回算該話題自己的協調分數。

## 4. 工程模組

### M1 話題正規化層（後端）

輸入：raw `topicHints`、`topicSeeds`。處理：
1. 剔除檢舉分類標籤（「這是垃圾訊息」等 taxonomy 字串黑名單）
2. 中文斷詞 + 實體抽取（人名、機構、議題詞）
3. 同義/包含合併：「賴清德與川普早就見過面了」「竟然有人不知道2020年川普及彭斯都與賴清德同場」→ 正規話題「賴清德/川普 會面爭議」
4. 輸出 `normalized_topics` 衍生表：`topic_id, canonical_label, aliases[], first_seen, last_seen`

門檻維持現行「≥2 來源且 ≥20 事件」不變（碎片合併後自然過檻）。

### M2 敘事群命名與證據鏈組裝（後端）

1. `topNarratives` 輸出加欄位：`topKeywords[]`（來自 dominantTopicHints 正規化後）、`sampleFingerprints[]`
2. 證據鏈 join：話題 × 敘事群（同文組數、帳號觀測筆數）× 來源貼文數（≥N 個來源貼文）× 時間桶（爆發窗口）
3. 公開 API 新增 `topicCards[]`：每卡含 `canonical_label, verdict, evidence[], dailySeries[], window`

### M3 放大異常分數（後端）

- **相對基線，無全域絕對門檻**（海哥定案）：每話題與自身滾動基線比較（rolling median + MAD 的異常倍數）
- 冷啟動：話題歷史 <14 天時，用同類話題（政治/生活/娛樂分類）中位數作先驗
- 類別權重表放 config（D1 表或 wrangler vars），不寫死程式碼（工程紀律：規則顯性化）
- 判定檔位：`異常高`／`觀察中`（證據不足或冷啟動）／`未見異常模式`
- 誤判處置：發現即修正權重與門檻，不設額外緩衝機制（海哥定案）

### M4 前端話題卡區（取代「議題關聯判定」）

概念稿已於 2026-07-06 對話定稿（topic_amplification_detection_concept widget）：
- 一卡 = 一話題 = 一判定 badge + 證據行（每行標注「現有資料」）+ 迷你趨勢條 + 爆發窗口紅標
- 必含「未見異常」的自然話題對照卡（系統能說「沒有」才可信）
- 卡底邊界聲明（§1）
- 新聞事件對照併入證據行（取代原「新聞事件可對照的討論」子區）

### M5 每話題協調分數（後端）

目的：把人工策展錨點 `PUBLIC_CANDIDATE_TOPIC_DEFS` 與後端已聚合的 per-source 操縱訊號交叉，讓每張政治/公共話題卡都有自己的協調判定，而不是沿用整體 `topNarratives`。

#### 資料來源對應

| 指標 | 來源 | 說明 |
|---|---|---|
| 話題命中 | `PUBLIC_CANDIDATE_TOPIC_DEFS.keywords` × `platform_source_metrics.source_text_sample` | 只納入 source text sample 命中候選話題關鍵字的來源 |
| 協調訊號 | `platform_source_metrics.manipulation_signal_score`，公開查詢 alias 為 `avg_signal_score` | 擴充端已計算的 per-source proxy 訊號 |
| 事件權重 | `platform_source_metrics.total_event_count` | 用事件量加權，避免小樣本高分來源過度影響 |
| 來源貼文數 | `platform_source_metrics.source_url` distinct count | 多個不同來源貼文都命中，才降低單一恩怨或單一貼文偏差 |
| 來源集中 | max(`total_event_count`) / 話題事件總數 | 最大單一來源占比越高，越需要標示樣本偏差 |
| 時間集中 | candidate topic `topDays` / `dateRange` | 峰值日事件占比與活躍天數，用於區分單日爆發與多日持續 |

#### 公式

- `coordinationSignal.weightedAverage = sum(signal_score * total_event_count) / sum(total_event_count)`
- `coordinationSignal.max = max(signal_score)`
- `coordinationScore = coordinationSignal.weightedAverage`，範圍 0–100
- `crossObserverCount = count(distinct source_url)`
- `sourceConcentrationPct = max(source.total_event_count) / max(topic_event_count, sum(source.total_event_count)) * 100`
- `peakConcentration = max(day.eventCount) / sum(day.eventCount) * 100`
- `activeDayCount = count(days where eventCount > 0)`

#### 門檻

門檻放在 Worker 模組常數，與公開 API `thresholds` 一起輸出，避免散落魔數：

| 常數 | 目前值 | 用途 |
|---|---:|---|
| `PUBLIC_HIGH_SIGNAL_THRESHOLD` | 65 | 高協調訊號分數 |
| `PUBLIC_MEDIUM_SIGNAL_THRESHOLD` | 45 | 中等協調訊號分數 |
| `PUBLIC_COORDINATION_HIGH_OBSERVER_MIN` | 3 | 判為「協調訊號偏高」所需最低來源貼文數 |
| `PUBLIC_COORDINATION_WATCH_OBSERVER_MIN` | 2 | 觀察中樣本解讀門檻，保留於 API thresholds 供前端/文件引用 |

判定：

- **協調訊號偏高**：`coordinationScore >= PUBLIC_HIGH_SIGNAL_THRESHOLD` 且 `crossObserverCount >= PUBLIC_COORDINATION_HIGH_OBSERVER_MIN`
- **觀察中**：分數中等，或分數偏高但來源貼文數不足
- **協調訊號低**：`coordinationScore < PUBLIC_MEDIUM_SIGNAL_THRESHOLD`

#### 誠實邊界

- 此分數來自擴充端 per-source 訊號聚合 + 來源集中 + 時間集中，是 proxy，不是重新推導的同文比例。
- 只涵蓋 `source_text_sample` 命中候選話題關鍵字的活動；未命中樣本不會被納入該話題。
- 不指認幕後身分、不宣稱內容由 AI 產生、不代表 Threads 全站。
- `sourceConcentrationPct` 高時代表單一來源主導，應解讀為樣本偏差警訊，不可直接等同協調操作。

#### DoD

- `candidateTopics[]` 每個命中話題輸出 `coordinationScore`、`coordinationBand`、`coordinationSignal`、`crossObserverCount`、`sourceConcentrationPct`、`peakConcentration`、`activeDayCount`、`coordinationNote`。
- `topicCards[]` 使用 candidate topic 的 `coordinationBand` 作為 `verdict`，並在 `evidence[]` 補上分數、跨來源、來源集中與時間集中白話條目。
- 單元測試以 fixtures 覆蓋高協調、多來源不足觀察中、低協調三種判定，不依賴 D1。
- Worker 必須通過 `node --check cf_bug_admin/src/index.js`。

## 5. 隱私與合規（個資法）

### 5.1 上傳端變更（唯一的擴充功能改動）

- `accountId`/`username` 上傳前改 **SHA-256 + 固定鹽** 雜湊（schema 升版 `platform_upload.v3`）
- 跨來源交叉計數只需同帳號同值，不需原文
- **前台永不呈現任何帳號識別**——原文不行，雜湊值也不呈現（海哥定案）

### 5.2 存量資料：再處理，不遷移（海哥定案）

- D1 既有 raw data（含原文 username、snippet）**保留不動**
- 公開呈現一律出自**再處理層（derived tables）**：處理時對 raw username 施同鹽雜湊後做交叉計數，輸出只有聚合數字
- raw 層與 derived 層權限分離：公開 API 只讀 derived

### 5.3 文本欄位與話術樣本公開（2026-07-11 修訂，見 ADR 0009）

原則自「貼文原文永不出現在公開 API」修訂為：**raw 文本預設不公開；通過樣本閘門的去識別化「話術樣本」得以公開**（海哥裁決：有資訊就想公開，接受法律風險框架）。

#### 樣本閘門（准入規則，須寫進程式碼）

- 僅限「≥N 個帳號觀測筆數重複出現 且 ≥M 個來源貼文」的文字；N/M 放模組常數並隨 API thresholds 輸出。這是准入門檻，不代表跨批次去重後的使用者或帳號數
- 現值（2026-07-13 調整）：`SAMPLE_MIN_ACCOUNTS=10`、`SAMPLE_MIN_OBSERVERS=2`。初始 20/3 僅產出 35 筆候選、多數話題卡無材料；降為 10/2 候選增至 113 筆，品質由人工覆核把關
- **准入規則只有一份實作：`passesSampleGate()`（2026-07-27 收口）**。判定對象是「去識別化後合併的樣本」，同時涵蓋 `SAMPLE_MIN_ACCOUNTS` / `SAMPLE_MIN_OBSERVERS` 與 `SAMPLE_MIN_TEXT_LENGTH`（去識別化後長度，避免整段被代換成 `[帳號]` 仍上架）
- 取候選的 SQL 不得再寫第二份門檻（原本的 `HAVING` 已移除）。逐字 raw 列是去識別化樣本的子集，對子集套帳號／來源門檻會在合併前砍掉本來會過關的樣本——例如同句只差 @帳號名散在 3 個來源、每源 7 筆，合併後為 21/3 應過關，但每個 raw 變形都只有 1 來源、7 筆而被 SQL 先丟掉
- 取候選仍有列數上限 `SAMPLE_CANDIDATE_ROW_LIMIT=500`（依 `account_count` 排序）；命中上限時 Worker 必須 `console.warn`，不得靜默截斷
- 去識別化 regex 涵蓋：@帳號名、`回覆xxx` 前綴、裸帳號名（含分隔符或字母數字混合的 token）、URL、電話樣式
- 去識別化處理：移除 @帳號名、URL、私人（非公眾人物）之姓名與聯絡方式；公眾人物姓名屬可受公評之評論對象，可保留
- **人工覆核閘門**：樣本進公開頁前須經覆核佇列核准，不自動發布
- 未過閘門的 `snippet`/`sourceText` 維持僅供分群運算、不進公開 API；保存期限納入隱私聲明（建議值 180 天，待核定）
- **公開 API legal gate**：projection 版本化輸出 `samplePublicationMode`，預設 `description`；缺少 env、env policy version 與 code 常數不完全相符，或沒有律師完成證據時，`topicCards[].samples=[]`、`repeatedPhrases=[]`，`patternDescription` 只能說明聚合指標且不得由原文衍生
- 只有環境 policy version 完全匹配、樣本通過門檻與去識別、且人工狀態為 `approved` 時，才可使用 `reviewed_text`；`pending` / `rejected` 永不公開。public overview GET 唯讀，review queue 僅由 ingest、排程或有權限 admin refresh 產生

#### 文案鐵律（程式化，非自律）

- 卡片模板僅陳述可驗證事實：「此段文字有 N 筆帳號觀測、來自 M 個來源貼文」——每句皆可自 D1 證明；不得改稱獨立使用者或獨立帳號
- 禁用詞黑名單進 code：網軍、機器人、假帳號、側翼
- 頁尾異議管道：「認為樣本涉及您的權益？來信即先下架複核」

#### 法律定性（妨害名譽為主要曝險）

- 「被提告」無法歸零（刑事妨害名譽提告成本低、政治領域有騷擾式提告文化）；「告得成」可設計
- 防線：刑法 310-3 真實抗辯（陳述皆可自資料庫證明）＋刑法 311 善意評論（可受公評之事）＋釋字 509（方法論公開＝相當理由之書面證據）
- 結構性防護：原告須自認為大量複製文字之作者
- 個資法風險低（去識別化重複文字非個資）；著作權風險可忽略（大量複製句式原創性存疑）
- **上線前 DoD：卡片文案模板與樣本准入規則送律師一次性審閱**（審模板，非逐則內容）；審閱完成前公開頁可先以「句型描述」模式運行（不引原文，僅描述話術類型）

### 5.4 法律定性備忘

- 被封帳號之公開資訊：個資法 §19①7「一般可得之來源」為蒐集依據；特定目的（社群安全觀測統計）、僅發布聚合、訂保存期限，符合比例原則
- beta44 的上傳者同意機制改為獨立 `platform-sync-v3`；舊 v2 / 數字版同意不 migration 成 v3。這個 policy version 是同意 gate，不等同於尚未完成的 payload schema v3 / derived hash 工作
- 隱私聲明（site/privacy/）補：蒐集範圍、目的、保存期限、僅聚合公開

## 6. Backlog 與 DoD

| # | 項目 | DoD（驗收條件） |
|---|---|---|
| B1 | M1 正規化層 | 現有 63 標籤重跑：分類標籤混入 = 0；碎片合併率報告；單元測試涵蓋合併/剔除規則 |
| B2 | M2 命名輸出 | `topNarratives` 帶 `topKeywords`；7 群中 ≥5 群產出可讀名稱；公開頁不再出現「高相似文字敘事」佔位名 |
| B3 | 雜湊上傳 | schema v3 部署；實際 payload 抽驗無原文 ID；同意文案與隱私聲明同步上線 |
| B4 | 再處理層 | raw 表零改動（checksum 比對）；derived 表建立；交叉計數與現值一致性抽查 ±0 |
| B5 | M3 異常分數 | 以 90 天真實資料回測，輸出 5–8 張卡且含 ≥1 張「未見異常」；權重表在 config 可調並生效 |
| B6 | M4 前端話題卡 | 取代舊「議題關聯判定」區；mock 與真實 API 皆無 console error；行動版無溢出 |
| B7 | 文件 | 方法論頁補計算方式與門檻；隱私聲明更新；本 SDD 標記完成狀態 |
| B8 | 話術樣本管線（§5.3） | 樣本閘門常數化＋去識別化處理＋人工覆核佇列＋前端樣本區＋異議管道上線；文案禁用詞黑名單進 code；律師審閱模板完成後才開放原文樣本（前置期以句型描述模式運行） |

實作順序：B1 → B2 → B5（回測）→ B4 → B6 → B3 → B7。B3 獨立可並行。B8 於 M5 上線後優先（2026-07-11 新增：話術樣本是話題卡從「分數」變「證據」的關鍵）。

## 7. 回測驗收方式

1. 以 2026-05-06 ~ 07-06 全量資料跑 M1–M3
2. 人工核對輸出卡片：命名可讀性、證據數字與 D1 原始查詢一致
3. 已知事件對照：軍購/國防議題期間（05/23–06/13）應觸發異常；淡江大橋類生活話題應判「未見異常」
4. 權重敏感度：政治類基線調 ±50%，卡片組成變化在預期方向

## 8. 未決事項

- snippet 保存期限數值（建議 180 天，待核定）
- 中文斷詞方案選型（Workers 環境限制下：jieba-wasm / 簡易詞表 / 外部批次），實作時出 ADR
- candidateTopics 人工策展卡的退場方式：直接下線或保留為「編輯精選」欄位
