# Task 1: Client Payload and Opt-in Sync

## 背景

client 端目前 upload payload 過度依賴既有 analytics export，缺少匿名穩定來源識別與 opt-in 自動同步模型。

## 範圍

- 新增匿名穩定來源識別。
- 新增 opt-in 自動同步設定。
- 精簡 payload，只保留可重分的輕量 evidence。

## 不做什麼

- 不在 client 內做最終 canonical topic 分類。
- 不上傳 `fullText`。

## API / Storage 變更

- local storage 新增：
  - `hege_platform_sync_enabled`
  - `hege_platform_sync_last_at`
  - `hege_platform_source_id`
- payload 新增：
  - `clientSourceId`
  - `uploadMeta.clientPlatform`
  - `uploadMeta.autoSync`

## 實作步驟

1. 建立 stable pseudonymous source id。
2. 在 upload payload 注入來源識別與 platform metadata。
3. 新增 opt-in sync 設定與每日同步狀態儲存。
4. 對 source evidence 做去重與 snippet 選優。

## 測試

- payload 不含 `fullText`。
- 同一 client 重複上傳，`clientSourceId` 穩定。
- 關閉 sync 時不進行自動同步。

## 驗收條件

- payload 能提供 server-side trust accumulation 所需的匿名穩定來源識別。
- 自動同步預設關閉，並具備清楚揭露。

## 相依關係

- 與 Task 2 的 payload 解析契約同步。
