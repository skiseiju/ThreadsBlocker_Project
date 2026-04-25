# SDD: Platform Sync, Trust Model, and Anti-Abuse

更新日期：2026-04-22

## 1. 背景

ThreadsBlocker 平台已具備匿名聚合資料上傳、Cloudflare Worker ingest、D1 聚合與公開頁呈現能力，但目前仍有四個根本缺口：

1. `platform_topic_daily` 以 upload day 聚合，無法和真實 `eventAt` 對齊。
2. topic/taxonomy 若放在 extension 端，會被版本落差拖垮。
3. 公開 repo + 公開外掛的前提下，client-side secret 無法作為資料可信來源。
4. Chrome / Firefox extension 與 iOS Userscript 的能力不對等，不能用單一客戶端能力模型設計同步與信任。

本 SDD 的目標是把平台定位成「保守、可信、可揭露限制的觀測系統」，而不是全平台真相引擎。

## 2. 目標

- 建立 `topic + day` 為核心的公開觀測資料模型。
- 把 taxonomy / classification 權威移到 Worker。
- 讓 taxonomy 可持續更新，且可對歷史 evidence 做背景重分。
- 支援 opt-in 自動同步，但不讓自動同步成為 Chrome Web Store 風險點。
- 建立 server-side trust tier，讓公開統計只吃 trusted sample。
- 支援 Chrome、Firefox、iOS 三平台，但接受能力與 trust 不對等。

## 3. 非目標 / 先砍掉的野心

- 不做全 Threads 母體推論。
- 不做單貼文對單政治事件的硬配對。
- 不做因果判定，只做 topic-level 時序相關。
- 不讓 iOS Userscript 擔任高信任自動同步主平台。
- 不把完整全文當主上傳路徑。
- 不要求所有公開上傳都直接進公開統計。
- 不依賴 client-side secret、salt、signature 證明資料真實。

## 4. 核心設計

### 4.1 Repo / 權限邊界

- 公開 repo：
  - 封鎖功能
  - UI
  - 本地資料收集與整理
  - build / cross-platform packaging
  - 基本 upload client
- 私有 server-side：
  - ingestion admission
  - trust scoring
  - anti-abuse 規則
  - taxonomy registry 的敏感映射
  - R2 reclass pipeline
  - admin risk tooling

### 4.2 Classification Authority

- 最終 canonical topic 只由 Worker 決定。
- client 只上傳可重分的輕量 evidence。
- taxonomy 必須帶 `taxonomy_version`。
- public API 只回單一 taxonomy version 的一致資料。

### 4.3 資料流

`Client -> Worker ingest -> R2 evidence bundle -> Worker classification -> D1 projections/aggregates -> Public API`

資料分層：

- Client payload：`eventAt`、`sourceUrl`、短 `snippet`、hashtags、`sourceOwner`、最小 event metadata、匿名穩定來源識別。
- R2：可重分 evidence bundle。
- D1：
  - `platform_uploads`
  - source/topic projection
  - event/topic projection
  - `platform_daily_metrics`
  - `platform_topic_daily`
  - trust/risk metadata

### 4.4 Trust Model

- 每個來源都使用 stable pseudonymous source id。
- 來源識別是匿名且可持續追蹤，不對應真實身分。
- trust tiers：
  - `probation`
  - `trusted`
  - `flagged`
  - `blocked`
- 公開頁預設只吃 `trusted` scope。

風險訊號包含：

- upload cadence 異常
- payload 結構異常
- snippet/hash 高重複
- topic 分布極端單一
- `eventAt` 時序不合理
- 多來源高度相似 payload
- 與 trusted baseline 顯著脫節

### 4.5 Cross-Platform Capability Model

- Chrome extension：
  - 支援 opt-in 每日同步
  - 可成為高信任主來源
- Firefox extension：
  - 同級支援每日同步
  - 與 Chrome 共用主要同步設計
- iOS Userscript：
  - 保留封鎖功能與手動上傳
  - 預設較低 trust
  - 不作高信任自動同步主平台

## 5. 隱私與 Disclosure

- 自動同步必須是明確 user-facing feature，預設關閉。
- 必須揭露：
  - 上傳頻率
  - 上傳欄位
  - 是否包含 sourceUrl / snippet
  - 是否使用匿名穩定來源識別
  - 用途：匿名分析、topic 聚合、anti-abuse
- 不應收集：
  - 真實姓名
  - Email
  - 手機
  - 社群登入帳號
  - 大量原始瀏覽紀錄
  - `fullText` 作為主路徑 payload

## 6. 驗收標準

- `platform_topic_daily` 以 `eventAt` 聚合，不再使用 upload day。
- overview/topic time series 回傳 `taxonomyVersion` 與 `sampleScope`。
- taxonomy 更新後可對歷史 evidence 重分。
- 公開頁默認只讀 trusted sample。
- Chrome / Firefox 自動同步可用，iOS 手動上傳不退化。
- 方法論頁與產品內 disclosure 明確說明 trusted sample 與樣本限制。
