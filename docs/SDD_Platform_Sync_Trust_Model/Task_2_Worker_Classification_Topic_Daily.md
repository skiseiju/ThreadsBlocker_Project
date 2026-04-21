# Task 2: Worker Classification and Topic Daily Rebuild

## 背景

目前 `platform_topic_daily` 用 upload day 聚合，不具備真實時序意義。

## 範圍

- 新增 taxonomy/trust metadata 欄位。
- 以 `eventAt` 重建 `platform_topic_daily`。
- 在 Worker 做 source-level topic inference。

## 不做什麼

- 不做全文 NLP 或 LLM 分類。
- 不做單貼文對單政治事件配對。

## API / Schema 變更

- `platform_uploads` 新增：
  - `client_source_id`
  - `client_platform`
  - `taxonomy_version`
  - `trust_tier`
  - `risk_score_band`
- `platform_topic_daily` 新增：
  - `taxonomy_version`
  - `sample_scope`
- `platform/overview` 回傳：
  - `taxonomyVersion`
  - `sampleScope`

## 實作步驟

1. 延伸 D1 schema。
2. 建立 source-level topic hint normalize / infer。
3. 以 `eventAt + inferredTopic` 聚合 topic daily。
4. overview/query 只回當前 taxonomy version 與 trusted scope。

## 測試

- `platform_topic_daily` 不再受 `exportedAt` 影響。
- public API 帶 `taxonomyVersion` / `sampleScope`。

## 驗收條件

- topic time series 具備真實事件日語意。

## 相依關係

- Task 1 payload。
- Task 4 trust tier 輸入。
