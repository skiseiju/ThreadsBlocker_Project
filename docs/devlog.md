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

21. **設定面板移除已固定化的「完整互動名單收集」提示項**（src/ui.js）
    - 清理名單已固定為完整收集，不再在設定面板顯示唯讀 checkbox
    - 封鎖設定摘要同步移除「完整收集」字樣，避免讓使用者以為仍可切換
    - 版本升至 `2.6.0-beta39`
