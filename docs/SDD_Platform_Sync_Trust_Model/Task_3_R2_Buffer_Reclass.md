# Task 3: R2 Evidence Buffer and Reclass

## 背景

taxonomy 會持續更新，若不保存可重分 evidence，就無法對歷史資料重算。

## 範圍

- 將輕量 evidence bundle 存入 R2。
- 建立背景重分入口與資料重建規則。

## 不做什麼

- 不把 R2 當公開查詢主資料庫。

## Schema / Interface

- upload response 新增：
  - `storedInR2`
  - `reclassEligible`
- admin 端新增 reclass job 入口。

## 實作步驟

1. 定義 evidence bundle 形狀。
2. upload 後寫 R2 object。
3. 實作讀取 R2 bundle 的 reclass pipeline。

## 測試

- 新上傳可落 R2。
- taxonomy version 變更後可重分指定 upload / 日期範圍。

## 驗收條件

- 平台保有歷史重分能力。

## 相依關係

- Task 2 schema 與 taxonomy version。
