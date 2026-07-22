# SDD：問題回報每日同步至 Google 試算表

**文件狀態：** Draft（未實作）
**建立：** 2026-07-22
**適用範圍：** `cf_bug_admin` Worker 新增唯讀 export endpoint、獨立 Apps Script 專案、既有回報試算表
**決策紀錄：** `docs/adr/0011-bug-report-sheet-sync.md`
**相關：** `docs/BUG_ADMIN_PLATFORM.md`、`docs/BUG_REPORT_DELETION_RUNBOOK.md`

---

## 1. 目的與問題

問題回報目前只落在 D1。維護者沒有每日提醒，也沒有可標記處理狀態的介面，導致回報容易被遺忘。

本設計提供：每日一次把新回報同步到 Google 試算表當作處理工作台，並由 Apps Script 寄出摘要 email。

**不在範圍內：** 即時同步、雙向狀態同步、回報自動分類、使用者回覆功能。

## 2. 架構

```
D1 bug_reports  ← 回報內容唯一來源（SSOT）
      │
      │ ① Apps Script 每日觸發器（台北時間 09:00）
      │   GET /api/v1/reports/export?since=<cursor>&limit=<n>
      │   Header: X-Export-Token: <REPORT_EXPORT_TOKEN>
      ▼
cf_bug_admin Worker
      │ ② 回傳 cursor 之後的新回報 JSON
      ▼
Apps Script
      ├─ ③ append 新列到試算表（只 append）
      ├─ ④ 更新 Script Properties 的 cursor
      └─ ⑤ 有新回報才寄 email 摘要
```

資料流為單向：D1 → 試算表。試算表的處理狀態不回寫 D1。

## 3. Worker：唯讀 export endpoint

### 3.1 認證

**新增獨立的 `REPORT_EXPORT_TOKEN`，不得共用 `ADMIN_TOKEN`。**

理由：所有 admin endpoint 目前共用單一 `ADMIN_TOKEN`，且該 token 可從 platform overview 取得 raw `source_url`、`source_owner`、`source_text_sample`（見 ADR 0010 的送審後 follow-up）。把該 token 放進第三方 Apps Script 會擴大外洩面。

`REPORT_EXPORT_TOKEN` 的權限邊界：
- 只能讀 `bug_reports`，不能讀 `platform_uploads`、`topic_sample_reviews` 或任何平台資料。
- 只能讀，不提供任何 mutation。
- 認證失敗回 401，不回傳任何欄位提示。

### 3.2 介面

`GET /api/v1/reports/export`

| 參數 | 必填 | 說明 |
|---|---|---|
| `since` | 否 | ISO 8601 時間字串。只回傳 `created_at` 嚴格大於此值的回報。省略時回傳最近 `limit` 筆。 |
| `limit` | 否 | 預設 200，上限 500。 |

回應：

```json
{
  "code": 200,
  "data": {
    "reports": [
      {
        "report_id": "<持續性隨機 ID>",
        "created_at": "2026-07-22T01:00:00Z",
        "type": "UI_REPORT",
        "error_code": "",
        "version": "2.8.0",
        "platform": "chrome_extension",
        "message": "<使用者填寫的問題描述全文>",
        "has_diagnostics": false
      }
    ],
    "cursor": "2026-07-22T01:00:00Z",
    "has_more": false
  }
}
```

`cursor` 是本批最後一筆的 `created_at`，供下次查詢使用。`has_more` 為 true 時 Apps Script 應在同一次執行中繼續取下一批，直到 false。

**不回傳的欄位：** IP hash、User-Agent、request signature、rate limit 紀錄。這些是防濫用用途，不屬於工作台需求，依最小必要原則排除。

## 4. 試算表結構

工作表名稱：`回報`

| 欄 | 標題 | 寫入者 | 內容 |
|---|---|---|---|
| A | 回報 ID | 腳本 | D1 `id`，去重鍵 |
| B | 收到時間 | 腳本 | 台北時間 `yyyy-MM-dd HH:mm` |
| C | 等級／代碼 | 腳本 | `level` + `error_code` |
| D | 版本／平台 | 腳本 | `version` / `platform` |
| E | 問題描述 | 腳本 | `message` 全文 |
| F | 錯誤訊息 | 腳本 | `error_name` / `error_message` |
| G | 持續性 ID | 腳本 | `hwid`，刪除要求時用來比對 |
| H | 後端狀態 | 腳本 | D1 `status` 在**匯入當下**的快照 |
| I | 處理狀態 | **人工** | 待處理／處理中／已回覆／不處理 |
| J | 備註 | **人工** | 自由填寫 |

**腳本只寫 A–H，且只在 append 新列時寫入。腳本永遠不修改既有列的任何欄位。** I、J 由人工維護，腳本不得讀取或覆蓋。

H 欄的定位要講清楚：它是 **D1 狀態在匯入那一刻的快照**，之後不會再更新。用途是讓歷史回報進來時就帶著既有的 `ACK` / `PENDING` / `IGNORED` / `FIXED`，不必從零重新分流。真正的處理狀態以人工維護的 I 欄為準——兩者刻意分開，H 不會覆蓋你在 I 的判斷。

（2026-07-22 現況：D1 共 37 筆回報，全部早於 2.8.0，狀態分布 ACK 18／PENDING 14／IGNORED 4／FIXED 1。這些狀態未反映 2.8.0 實際修掉的問題，需要人工在 I 欄逐筆判斷，不做批次標記。）

## 5. Apps Script

### 5.1 設定

Script Properties：

| Key | 說明 |
|---|---|
| `EXPORT_ENDPOINT` | Worker export endpoint URL |
| `EXPORT_TOKEN` | `REPORT_EXPORT_TOKEN` |
| `SHEET_ID` | 試算表 ID |
| `NOTIFY_EMAIL` | `skiseiju@gmail.com` |
| `CURSOR` | 上次同步到的 `created_at`，由腳本維護 |

Token 只存在 Script Properties，不得寫進程式碼或 commit 進 repo。

### 5.2 同步流程

1. 讀 `CURSOR`。首次執行時為空，此時只取最近 200 筆，避免一次灌入全部歷史。
2. 呼叫 export endpoint，`has_more` 為 true 時繼續取下一批，單次執行最多 10 批（2000 筆）作為 runaway 保護。
3. 讀取試算表 A 欄全部既有 ID 建成 Set。
4. 過濾掉 Set 中已存在的 `report_id`。
5. 用 `appendRow` 逐列寫入，或以單次 `setValues` 批次寫入新列區塊。
6. 全部寫入成功後才更新 `CURSOR`。**寫入失敗不得更新 cursor**，確保下次重跑會補上。
7. 新列數 > 0 時寄 email。

### 5.3 冪等性

以 A 欄 ID 去重，因此：
- 同一天重複執行不會產生重複列。
- cursor 遺失或被重設時，重跑只會補上缺漏的列，不會重複。

### 5.4 Email

只在本次新增列數 > 0 時寄出。

- 收件者：`NOTIFY_EMAIL`
- 主旨：`留友封 問題回報 N 筆（yyyy-MM-dd）`
- 內容：每筆一行（ID／類型／描述前 60 字），結尾附試算表連結。

## 6. 錯誤處理

| 情況 | 行為 |
|---|---|
| Worker 無回應或 5xx | 不更新 cursor，不寄信，記錄到 Apps Script 執行紀錄。下次觸發自然重試。 |
| 401 認證失敗 | 同上，並在 email 主旨標示 `[同步失敗]` 寄出一封告警信，避免靜默停擺。 |
| 試算表寫入部分失敗 | 不更新 cursor。因為去重靠 ID，下次重跑會補齊未寫入的列。 |
| 單次回報筆數超過 2000 | 寫入前 2000 筆並更新 cursor 到該批最後一筆，下次觸發繼續。 |

**靜默失敗是本設計最主要的風險**（同步壞掉但沒人發現，反而比沒有同步更危險，因為會誤以為「沒新回報」）。因此 401 與連續失敗必須主動告警。

## 7. 隱私與刪除

試算表是回報內容的第二份副本，必須與現有刪除承諾一致：

1. **`docs/BUG_REPORT_DELETION_RUNBOOK.md` 新增一步**：刪除 D1 紀錄後，必須在試算表刪除對應 `report_id` 的整列；處理紀錄需註明兩邊皆已刪除，且不得保留回報內容或 ID。
2. **`site/privacy/index.html` §4 新增揭露**：問題回報內容可能複製到內部處理用的 Google 試算表；刪除要求會一併處理該副本。

   **⚠ 上線閘門（2026-07-22 調整）**：此揭露段落**已從隱私頁移除**，因為 2.8.0 正在 CWS 審查中，而試算表同步尚未啟用——副本此刻並不存在，多寫一項未發生的第三方轉移只會增加與 CWS Dashboard 表單答案對不上的風險。

   **在第一次成功執行 `syncBugReports()` 之前，必須先把該段落加回 `site/privacy/index.html` §4 並 `wrangler pages deploy site --project-name=threadsblocker` 部署上線。** 順序不可顛倒：只要同步跑過一次，副本就存在，未更新的隱私頁即為不實揭露。

   加回的文字（原文保留於此，供直接複製）：

   ```html
   <li>為了追蹤處理進度，問題回報內容與持續性隨機回報 ID 會每日複製一份到僅限授權人員存取的內部 Google 試算表。這份副本只用於問題處理，不公開、不用於廣告或出售。使用者提出刪除要求時，這份副本會與伺服器端資料一併刪除。</li>
   ```
3. **`docs/CWS_PRIVACY_PRACTICES_2.8.0.md` 同步**：Google（Apps Script／試算表）已列為基礎設施服務，補上「內部問題處理工作表」用途。

上述三項與程式碼同一批交付，不得延後。

## 8. 完成定義（DoD）

- [ ] Worker export endpoint 實作完成，`REPORT_EXPORT_TOKEN` 與 `ADMIN_TOKEN` 分離
- [ ] 測試：無 token / 錯誤 token 回 401；`ADMIN_TOKEN` **不可**通過 export endpoint 認證
- [ ] 測試：`since` 過濾正確；回應不含 IP hash、User-Agent、signature
- [ ] 測試：`limit` 上限 500 生效
- [ ] Apps Script 實作完成並設定每日 09:00 觸發器
- [ ] 實跑驗證：連續執行兩次不產生重複列
- [ ] 實跑驗證：手動改 G/H 欄後再同步，該列 G/H 不被覆蓋
- [ ] 實跑驗證：零筆新回報時不寄信
- [x] 刪除 runbook 與 CWS practices 已更新（commit 7a2ea0a）
- [ ] **上線閘門**：隱私頁 §4 試算表揭露加回並 deploy 上線 —— 必須在第一次 `syncBugReports()` 成功執行之前完成
- [ ] Apps Script 原始碼納入 repo（`scripts/gas/` 或獨立目錄）以便版控，但不含任何 token

## 9. 未解與後續

- Apps Script 專案本身無版控機制，需人工把 repo 內的原始碼貼上 Apps Script 編輯器。若未來要自動化，可評估 `clasp`。
- `ADMIN_TOKEN` 單一 token 旁路仍未修（ADR 0010 follow-up）。本設計以獨立 token 迴避擴大影響，但不解決原問題。
