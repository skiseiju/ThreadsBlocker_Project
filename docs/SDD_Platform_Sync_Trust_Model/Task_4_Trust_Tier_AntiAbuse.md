# Task 4: Trust Tier and Anti-Abuse

## 背景

公開外掛無法保證所有上傳都是真實樣本，因此必須採用 server-side trust model。

## 範圍

- 建立匿名來源信任分級。
- 讓公開統計只吃 trusted sample。
- 提供 admin 可檢視低信任資料。

## 不做什麼

- 不追求證明「誰是真人」。
- 不做實名制。

## Schema / API

- 來源 registry 新增：
  - `client_source_id`
  - `first_seen_at`
  - `last_seen_at`
  - `trust_tier`
  - `risk_score_band`
  - `upload_count`
- overview response 新增 `sampleScope`

## 實作步驟

1. 建立來源 registry。
2. 定義 risk signals。
3. 實作 tier 升降級規則。
4. 公開 API 預設只納入 trusted。

## 測試

- 新來源初始為 probation。
- 高風險樣本不進主要公開聚合。

## 驗收條件

- trusted sample 成為公開指標的唯一默認來源。

## 相依關係

- Task 1 client source id。
- Task 2 aggregation scope。
