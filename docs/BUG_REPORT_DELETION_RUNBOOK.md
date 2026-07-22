# 問題回報人工刪除 Runbook

本文件適用於 `cf_bug_admin` 的問題回報資料。政策是：問題回報內容與持續性隨機回報 ID 保存到問題處理完成或不再需要為止，再由授權人員人工刪除；使用者提出刪除要求時可提前處理。目前沒有固定天數的自動 purge。

## 權限與批准

- 只有專案 owner 或被明確授權、可操作 production Cloudflare D1 的維運人員可以執行。
- 遠端 D1 刪除屬 production mutation；執行前必須取得該次明確批准，先做唯讀定位並記錄預計刪除筆數。
- 不在聊天、issue 或操作紀錄貼出問題描述、`hwid`、signature、IP hash、User-Agent、metadata 或 stack。

## 定位資料

優先使用使用者提供的問題回報編號或持續性隨機回報 ID。若資訊不足，只能由授權人員依使用者提供的約略時間與問題描述在受控環境縮小範圍，確認唯一目標後再繼續。

使用 D1 console 或其他支援 bind parameter 的受控工具執行下列唯讀查詢；不要把實際識別值寫進 repo 或 shell history。

```sql
-- 已知 server report id 時，先取得同一安裝來源的 hwid。
SELECT id, created_at, status, hwid
FROM bug_reports
WHERE id = ?;

-- 已知持續性隨機回報 ID 時，預覽所有關聯回報。
SELECT id, created_at, status
FROM bug_reports
WHERE hwid = ?
ORDER BY created_at DESC;

-- 同一 ID 的頻率限制紀錄也在刪除範圍內。
SELECT hwid, last_report_unix
FROM rate_limits
WHERE hwid = ?;
```

與使用者確認刪除範圍是單筆回報或該持續性隨機回報 ID 的全部回報。若要求刪除伺服器端相關資料，預設刪除該 ID 的全部 `bug_reports` 與對應 `rate_limits`，避免留下可持續關聯的識別值。

## 執行刪除

取得 production mutation 批准後，在同一受控 D1 session 依已驗證的 `hwid` 執行。兩個刪除都是可安全重試的 idempotent 操作；若第二個指令失敗，停止其他操作、記錄失敗，修正後只重跑未完成的刪除與驗證：

```sql
DELETE FROM bug_reports
WHERE hwid = ?;

DELETE FROM rate_limits
WHERE hwid = ?;
```

若任何目標、筆數或 bind value 與預覽不符，不要執行刪除並立即停止。不要刪除其他匿名來源 ID、平台上傳、聚合統計或無關回報。

## 驗證與非內容紀錄

刪除後用相同 bind value 做唯讀驗證：

```sql
SELECT COUNT(*) AS remaining_reports
FROM bug_reports
WHERE hwid = ?;

SELECT COUNT(*) AS remaining_rate_limits
FROM rate_limits
WHERE hwid = ?;
```

兩者都必須是 `0`。在受控的隱私請求處理紀錄中只留下：請求 reference、收到日期、完成日期、執行者、批准者、刪除範圍與刪除筆數。不得保存問題內容、`hwid`、report ID、signature、IP hash、User-Agent、metadata 或 stack。最後通知使用者處理完成；不要在通知中回傳已刪除的識別值。
