# 留友封觀測站 開發日誌

## 2026-06-08

### Extension platform payload 操作跡象 schema 增量

- Extension payload `events` 新增 `textFingerprint` / `textFingerprintVersion`、`timeBucket10m`、`timeBucket1h`，讓 Worker 能用不可逆文字指紋與時間桶分析話術相似度及短時間同步。
- `sourceEvidence` 由 snippet 產生同一版 `textFingerprint` 與時間桶；`sources` 新增 `textFingerprintCounts`、`topTextFingerprints`、`timeBucket10mCounts`、`timeBucket1hCounts`、`firstEventAt`、`lastEventAt`。
- `analysisSeeds` 新增 `temporalBuckets10m` / `temporalBuckets1h`，每個 bucket 聚合 block/report/total event、source/account 數與文字指紋數。
- Privacy 邊界：不新增公開原文、個人 URL 或可逆文字欄位；payload optimizer 在裁切 `sourceText` / `snippet` 後仍保留 derived hash 與時間桶。
- Extension 版本升至 `2.6.6`，此變更已進入正式版 release package。

## 2026-06-07

### Platform Worker overview / raw backfill incident 修復

- 事故現象：live 平台頁一度只顯示可分析趨勢 `2026-04-19` 單日，Worker overview API 回 `uploadCount=1`，但 D1 direct SQL 可查到 44 筆既有可分析 uploads。
- 直接原因 1：production Worker 跑的 overview projection 與 repo 版本不一致；先部署修復後，overview 恢復到 44 批次、趨勢 `2026-04-19` 至 `2026-04-29`。
- 直接原因 2：`platform_uploads` 的 `INSERT` 欄位數與 `VALUES` placeholder 數不一致，造成 5/31-6/03 的 raw 已寫入 `platform_raw_ingests`，但 2599 筆無法進入可分析表，錯誤為 `D1_ERROR: 23 values for 24 columns`。
- 直接原因 3：舊 D1 將完整 raw JSON 存在 D1，資料庫達 499,998,720 bytes，replay smoke test 遇到 `D1_ERROR: Exceeded maximum DB size`。
- 修復策略：採非破壞切換。舊 D1 `threadsblocker_bug_admin` / `28a80d0f-04fb-4ddc-a107-1d3e1de6cc99` 保留為 raw archive / rollback source；新 active D1 為 `threadsblocker_bug_admin_v2` / `595fc1df-b6fd-491a-b3c7-325994a409a7`。
- Raw 儲存架構：Worker 新增 R2 binding `RAW_INGEST_BUCKET` -> `threadsblocker-platform-raw-ingests`；完整 raw payload 寫入 R2，D1 `platform_raw_ingests.raw_payload` 只保存 `r2://...` pointer。
- Backfill：從舊 D1 選出 358 筆 unique raw backlog。第一輪 replay 328 accepted、30 HTTP 503；30 筆重試後 14 accepted、16 duplicate、0 failed。最終 358/358 unique raw 都已在 active D1 analytics 表示。
- 最終驗證：active D1 `platform_uploads=419`、`platform_daily_metrics=1395`，日期範圍 `2026-04-19` 至 `2026-06-07`，`total_event_count=65004`；live page 顯示 419 批次、193 來源、65,004 件。
- Rollback reference：production Worker final version `d21a5da8-67a1-48a3-b5b3-754b2fd3212f`；D1 v2/R2 cutover 前 rollback version `304910b0-21fb-47e5-b368-addc1929d22b`；完整 rollback 記錄在 `docs/site-backups/2026-06-07-platform-worker-overview-incident/ROLLBACK.txt`。
- Guardrail：新增 `cf_bug_admin/scripts/check-sql-placeholders.mjs`，修改 Worker D1 `INSERT` / materialized metrics 前必須跑，避免 columns / `VALUES` / bind 參數不一致。

## 2026-05-31

### Ingest 與公開頁口徑修正

- Worker ingest：重複 payload 先判斷再處理 trust，避免 duplicate upload 灌高 `platform_source_registry.upload_count`。
- Public overview：公開統計改用來源目前的 registry trust tier 回看可公開批次；事件數以 `platform_daily_metrics` materialized rows 為準，避免舊版 summary 總量誤入趨勢口徑。
- 平台頁：四個關鍵數字分開呈現「可分析事件 / 疑似協調帳號 / 近期回報來源 / 可分析批次」。
- 事件資料：首頁改為優先讀 Worker live political-events API，靜態 JSON fallback 更新到 2026-05-30。
- 趨勢圖：日期軸補齊空白天，外部事件 pin 改為按日期合併顯示「N 件事件」，事件標題移到下方 detail 區，避免圖面文字重疊。
- 趨勢圖：新增讀圖摘要，直接列出可分析趨勢期間、可分析樣本、事件量、外部事件標記與最新來源回報；日期 hover 改顯示當日總事件、封鎖、檢舉、來源數。
- 政策讀者修正：四個關鍵數字新增時間範圍口徑提醒；疑似協調帳號副標補上「非身分或違法認定」；趨勢圖補來源數共用量尺與 0 值限制；檢舉分類甜甜圈改標明「占全部事件」與「占檢舉事件」。
- 口徑再收斂：四個關鍵數字全部改為同一可分析窗口內的數字；`近期回報來源` 移出核心數字，改為狀態訊息，避免把 5 月來源活躍誤讀成 5 月趨勢資料。
- Worker public overview：公開趨勢改為納入所有已成功寫入 `platform_uploads` / `platform_daily_metrics` 的 analysis-ready 批次，不再用 mutable `platform_source_registry.trust_tier` 回頭排除既有可分析列。
- Worker ingest：`payload_hash` 改為 source-scoped hash，同一來源同一 payload 才視為 duplicate，避免不同匿名來源送出相同內容時被全站唯一 hash 擋掉而只留下 registry last_seen。
- Worker ingest：新增 `platform_raw_ingests`，所有非空且未超過上限的 platform payload 會先保存完整 raw JSON；invalid schema/json、duplicate、accepted、error 都會留下 raw row 與狀態。
- Worker ingest：公開分析用 `payload_hash` 改由 raw data canonical hash 產生，排除 `uploadMeta.uploadedAt`、`syncPreferences.lastSyncedAt` 等傳輸欄位，duplicate 判定改看同一匿名來源的完整資料內容。
- Extension 2.6.3：新增一次性 `repair_reupload_v1` 自動重傳；已開啟平台同步的使用者會在啟動時繞過同日同步限制重送一次本機完整分析資料，server 回傳 duplicate 時不再把每日同步時間寫成成功。
- Chrome release packaging：Chrome manifest 版號改輸出為 Web Store 合法的數字格式；啟動時會 normalize / migrate 平台同步同意狀態，2.6 已勾選 `hege_platform_sync_enabled` 的使用者升版後不需重新勾選。

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

12. **Sync / Trust Model SDD 與 Task 拆分**（docs/SDD_Platform_Sync_Trust_Model/）
    - 新增總 SDD：定義 taxonomy 權威移到 Worker、trusted sample、公私 repo 邊界、R2 reclass、多平台能力分級
    - 新增 Task 0~6：backup gate、client payload、Worker topic daily 重建、R2 buffer、trust tier、public API / methodology、cross-platform 驗證
    - 明確寫入「先砍掉的野心」：不做母體真相推論、不做因果、不做單貼文對單事件硬配對

13. **Client 端匿名來源識別與 sync 偏好骨架**（src/config.js、src/storage.js、src/reporter.js、src/ui.js）
    - 新增 localStorage keys：`hege_platform_sync_enabled`、`hege_platform_sync_last_at`、`hege_platform_source_id`
    - `Reporter.submitPlatformPayload` 現在會帶 `clientSourceId`、`clientPlatform`、`autoSyncEnabled`、`uploadTrigger`
    - analytics overlay 新增「每日自動同步偏好」checkbox；目前先記錄偏好並隨 upload 送出
    - 手動上傳成功後會更新 `lastSyncedAt`

14. **CF Worker：topic daily v2 / trust metadata / public sample scope**（cf_bug_admin/src/index.js）
    - `PLATFORM_MAX_PAYLOAD_BYTES` 先收斂到 1MB，維持輕量 payload 路徑
    - `platform_uploads` 新增 `client_source_id`、`client_platform`、`taxonomy_version`、`trust_tier`、`risk_score_band`、`sync_enabled`、`upload_trigger`
    - 新增 `platform_source_registry` 與 `platform_topic_daily_v2`
    - ingest 新增 `resolveTrustMeta()`：新來源先從 probation 起步；短時間高頻 upload 直接 flagged；跨日穩定來源升 trusted
    - `platform_topic_daily_v2` 改為依 `eventAt + inferredTopic` 聚合，不再用 upload day 寫時序
    - 若 Worker 有綁 `EVIDENCE_BUCKET`，會把輕量 evidence bundle 存入 R2；沒綁時則安全略過

15. **Public API metadata 擴充**（cf_bug_admin/src/index.js、site/platform/public.js）
    - `/api/v1/platform/overview` 與 public projection 現在帶 `taxonomyVersion` 與 `sampleScope`
    - public overview 預設只讀 trusted sample；legacy 舊資料以 trusted 視角相容
    - methodology metadata 新增 `trustPolicy: public-trusted-only`

16. **版本與建置驗證**
    - 版本升至 `2.6.0-beta33`
    - `node --check cf_bug_admin/src/index.js` 通過
    - `node --check src/reporter.js` 通過
    - `./build.sh --no-bump` 通過；Userscript / Chrome / Firefox 產物均已產出
    - Safari iCloud Userscripts 複製步驟遭到 macOS 權限阻擋，repo 內建置不受影響

17. **build.sh：Safari 部署改為嚴格檢查 `cp` 成敗**（build.sh）
    - Safari Userscripts 部署段維持直接用 `cp`
    - 只有 `cp` 成功才印 `Safari Build deployed`
    - 若 iCloud Userscripts 目錄因 macOS 權限被拒，現在會明確印出 `Safari deploy failed (cp)`，不再誤報成功
    - 版本升至 `2.6.0-beta34`

18. **新增「自動冷卻保護」單獨開關**（src/config.js、src/storage.js、src/ui.js、src/worker.js）
    - 新增設定 key：`hege_cooldown_protection_enabled`
    - 設定面板「封鎖設定」新增 checkbox：`自動冷卻保護`
    - 預設開啟；開啟時維持原本行為：遇到 Meta 限制會自動進冷卻並備份名單
    - 關閉後：
      - 超過 Meta 每日安全上限時不自動停機
      - 連續 rate-limited / cooldown 時不進 12 小時冷卻
      - 改為把當前目標標記失敗、移入 `FAILED_QUEUE`，並繼續執行
    - 版本升至 `2.6.0-beta35`

19. **自動冷卻保護收尾：補齊驗證失敗分支並收斂失敗處理**（src/worker.js）
    - 新增 `markTargetFailedAndContinue()` helper，統一「記錄失敗 → 移出 `BG_QUEUE` → 加入 `FAILED_QUEUE` → 稍候繼續」流程
    - `rate_limited` 與 `cooldown` 兩條分支改用共用 helper，避免後續修邏輯時漏改
    - 補齊驗證模式下 `Level 2` 連續失敗 5 次的分支：當「自動冷卻保護」關閉時，不再強制進 12 小時冷卻，改記錄失敗並繼續跑
    - 保持原本預設行為不變：開關開啟時仍會自動冷卻並備份名單
    - 版本升至 `2.6.0-beta36`

20. **2.6 公開呈現補完：live 月報、方法論 metadata、空狀態首頁與每日 auto sync**（site/platform/*、cf_bug_admin/src/index.js、src/main.js、src/ui.js、src/config.js）
    - `platform/reports/index.html` 改為直接讀取 public overview API 與 political events API，不再使用寫死月報數字
    - `platform/methodology/index.html` 新增 live metadata 區塊，會顯示 `taxonomyVersion`、`sampleScope`、`trustPolicy`
    - `platform/index.html` / `public.js` 改為資料不足時顯示真實 empty state，不再自動 fallback 到 mock；仍保留 `?mock=1` 供示意版型使用
    - public API 的 `topNarratives` 新增 `whyNote`，首頁與月報都能顯示 live 敘事解釋，不再只靠前端 mock 文案
    - extension 新增真正的每日 auto sync gate：僅限 Chrome / Firefox extension、每天最多一次、成功才更新 `lastSyncedAt`、iOS 維持手動上傳
    - 版本升至 `2.6.0-beta38`

21. **平台 mock mode 改為「真實事件時間軸＋合成平台數字」**（site/platform/public.js、site/platform/index.html、site/platform/data/political-events.json、src/config.js）
    - `?mock=1` 不再使用固定 30 日靜態趨勢；改為讀取近 60 天真實公開政治事件快照，依事件節點生成 synthetic `dailyTrend`
    - mock mode 的英雄文案與狀態訊息明確標示：政治事件為真實公開事件，封鎖/檢舉/分類/敘事統計仍為示意資料
    - `site/platform/data/political-events.json` 改為 2026-02-24 至 2026-04-23 的真實政治事件清單，移除先前混入的娛樂／網紅／社會事件假資料
    - 平台首頁文案去除寫死的「近 30 日」說法，改成較中性的「觀測窗」表述，避免 mock 與 live 時窗不一致
    - 版本升至 `2.6.0-beta40`

22. **首頁事件 pin 改回單一 curated 清單**（site/platform/public.js、src/config.js）
    - `loadPoliticalEvents()` 不再混入 crawler API，首頁趨勢圖一律只讀 `site/platform/data/political-events.json`
    - 移除右側堆疊的即時事件 pin，讓正式站與 mock 使用同一份人工整理的事件時間軸
    - 版本升至 `2.6.0-beta41`

23. **事件 pin 改為實際落在線上**（site/platform/public.js、src/config.js）
    - 趨勢圖的事件 marker 不再只是上方圓點＋整條投影線；改為把事件點錨定在 `總事件` 曲線對應日期的 y 值上
    - 標籤仍保留在圖上方，但改用短虛線連到實際事件點，避免「標的點不在線上」的誤讀
    - 版本升至 `2.6.0-beta42`

24. **mock 熱門敘事改為對齊 60 天政治事件軸**（site/platform/public.js、src/config.js）
    - `topNarratives` 移除舊的罷免／媒體／表決爭議文案，改成與目前事件表一致的五組敘事：國防特別條例程序攻防、訪中和平框架、外交與兩岸壓力、總預算與國防支出、國會外交站隊解讀
    - 讓 mock 的敘事說明、`hintLabels` 與時間軸上的事件主題一致，避免首頁同時出現兩套互不相干的 demo 故事
    - 版本升至 `2.6.0-beta43`

25. **移除事件軸最右側未採認的尾端事件**（site/platform/data/political-events.json、src/config.js）
    - 刪除 `2026-04-21`、`2026-04-22`、`2026-04-23` 三筆 crawler snapshot 尾端事件
    - 事件時間軸回到只保留前面人工確認過的節點，避免右側 still 看起來像混入假資料
    - 版本升至 `2.6.0-beta44`

26. **首頁延伸閱讀先收斂成整理中提示**（site/platform/index.html、src/config.js）
    - 移除「完整資料分析」卡片
    - 「分析方法論」與「月報彙整」改為純文字資訊卡，不再跳轉，直接標示內容仍在整理中
    - 先把首頁定位成記錄入口，等資料與呈現修正完成後再重新開放
    - 版本升至 `2.6.0-beta45`

27. **異常峰值改為貼線顯示並避開事件 pin**（site/platform/public.js、src/config.js）
    - `異常峰值` 不再固定畫在圖頂端，改為貼著 `總事件` 曲線上方顯示
    - 若同一天已有事件 pin，峰值 marker 會自動向右錯開，避免兩個標記重疊
    - 版本升至 `2.6.0-beta46`

28. **峰值 marker 改回同一天對齊，只做垂直錯位**（site/platform/public.js、src/config.js）
    - 移除 `異常峰值` 的橫向偏移，讓 marker 回到與當天日期、曲線相同的 x 座標
    - 若同一天也有事件 pin，改成把峰值再往上讓更多，避免重疊但不破壞對齊
    - 版本升至 `2.6.0-beta47`

29. **事件軸補入公共社會事件，不再只有政治節點**（site/platform/data/political-events.json、site/platform/public.js、src/config.js）
    - 新增 5 筆近 60 天公共社會事件：兒少性侵追訴時效釋憲說明會、未成年性侵重判案、法官猥褻改判、頭份男醫性騷案、台大舍監跟騷案
    - 事件軸改為「政治主軸 + 社會補充」，避免使用者首頁只看到政治事件
    - 新增 `公共社會事件`、`重大司法事件` 類別的 pin 顏色，和政治事件視覺區隔
    - 版本升至 `2.6.0-beta48`

30. **移除事件 pin 的空心圓 marker**（site/platform/public.js、src/config.js）
    - 事件 pin 改為只保留標籤與短虛線，不再畫空心圓點
    - 維持 hover / focus 細節互動，但讓趨勢圖視覺更乾淨
    - 版本升至 `2.6.0-beta49`

31. **修正事件表 metadata 與實際採認事件不一致**（site/platform/data/political-events.json、src/config.js）
    - `updatedAt` 更新為 `2026-04-29`
    - `windowEnd` 改為實際最後一筆採認事件日期 `2026-04-13`
    - 說明文字改為「近 60 天內採認的真實公開事件」，避免誤解為每天自動完整更新
    - 版本升至 `2.6.0-beta50`

32. **首頁區分真人貢獻與可信資料批次**（cf_bug_admin/src/index.js、site/platform/index.html、site/platform/styles.css）
    - public overview 新增 `overview.contributorCount`，用於顯示「位真人貢獻資料」
    - 首頁新增「筆通過可信門檻的資料」，避免把有效上傳批次誤寫成真人數
    - 統計卡改為自適應欄寬，四張卡在桌面與手機都可正常排列
    - 平台版本對應 `0.1.0-beta1`

33. **真人貢獻與觀測區間改用全體上傳 metadata**（cf_bug_admin/src/index.js、site/platform/index.html）
    - `位真人貢獻資料` 改為計算觀測窗內所有可辨識匿名來源，不再只看 trusted sample
    - public overview 新增 `contribution` 區塊，包含全體上傳批次、匿名來源數與上傳日期範圍
    - 首頁觀測區間優先使用全體上傳日期範圍，有新上傳才推進，不再被 trusted 舊資料卡住
    - 平台版本對應 `0.1.0-beta2`

34. **首頁關鍵數字固定四卡排列**（site/platform/index.html、site/platform/styles.css）
    - 標題改為「四個關鍵數字」
    - 桌面版統計列固定一排四張卡，避免第四張掉到下一行
    - 窄螢幕改為兩欄，手機再收成單欄
    - 平台版本對應 `0.1.0-beta3`

35. **首頁移除技術 metadata 行**（site/platform/index.html）
    - 移除 hero 上的 `taxonomy / sample / policy` 技術資訊，避免干擾一般使用者
    - 技術揭露仍保留在方法論與月報頁
    - 平台版本對應 `0.1.0-beta4`

36. **拆分 extension 與平台版號**（AGENTS.md、site/platform/version.json、site/platform/public.js、src/config.js）
    - extension 版號回到 `2.6.0-beta50`，平台頁/API 不再使用 extension 版號跳版
    - 新增 `site/platform/version.json` 作為平台版本來源，目前平台版本 `0.1.0-beta11`
    - `PlatformPublic.PLATFORM_VERSION` 也同步暴露平台版本，方便前端或檢查工具讀取
