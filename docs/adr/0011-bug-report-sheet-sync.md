# ADR 0011：問題回報每日單向同步至 Google 試算表

- 日期：2026-07-22
- 狀態：已採納（設計，未實作）
- 相關：`docs/SDD_Bug_Report_Sheet_Sync.md`、ADR 0010（`ADMIN_TOKEN` follow-up）

## 背景

問題回報只落在 D1，維護者沒有每日提醒也沒有可標記狀態的介面，回報容易被遺忘。需求是「不要忘記」與「有個工作台可以標記處理狀態」。

repo 內已有一個 Apps Script 端點掛在 `BUG_REPORT_FALLBACK_URLS`，但它是**備援**——`getReportEndpoints()` 依序嘗試，Worker 成功就 break。實務上 Worker 幾乎不失敗，因此試算表長期是空的。這解釋了為什麼「以為接好了但沒資料」。

## 決策一：狀態單向，不回寫 D1

- **選項 A（採用）**：D1 只負責產生新回報，試算表是處理狀態的唯一來源。同步腳本只 append，永不修改既有列。
- **選項 B**：試算表狀態回寫 D1。好處是刪除 runbook 可依狀態篩選，但必須處理雙向衝突（同一筆兩邊都改）。

選 A。工作台的狀態對後端沒有任何用途，為了它引入雙向同步與衝突解決不划算。

## 決策二：GAS 拉，不是 Worker 推

- **選項 A（採用）**：Apps Script 每日觸發器呼叫 Worker 的唯讀 export endpoint。
- **選項 B**：Cloudflare Cron Trigger 推送到 GAS Web App。

選 A。排程、重試、寫表、寄信四件事全部集中在 Apps Script 一處，只有一個地方會壞；Worker 只需新增一支唯讀 endpoint。選 B 的話重試邏輯要在 Worker 再寫一套，且 Worker 失敗與 GAS 失敗會分散在兩邊的 log。

## 決策三：獨立 `REPORT_EXPORT_TOKEN`，不共用 `ADMIN_TOKEN`

所有 admin endpoint 目前共用單一 `ADMIN_TOKEN`，且該 token 可從 platform overview 取得 raw 平台內容（ADR 0010 記為送審後 follow-up）。把它放進第三方 Apps Script 等於把「一把鑰匙開全部門」的風險再擴大一個持有者。

新 token 只能讀 `bug_reports`、只能讀不能寫。這不解決 `ADMIN_TOKEN` 原問題，但確保新功能不擴大影響面。

## 決策四：試算表寫全文，刪除流程加一步

- **選項 A（採用）**：寫問題描述全文，`BUG_REPORT_DELETION_RUNBOOK.md` 加一步刪試算表列，隱私頁 §4 揭露這份副本。
- **選項 B**：只寫摘要與連結，全文留在 D1。副本風險最小、隱私頁不用改，但工作台要多點一步才看得到內容。

選 A。工作台的價值就在於一眼看完內容，摘要會讓它退化成「還是得去別的地方看」。代價是多一份副本要管，因此文件同步與程式碼**同一批交付，不得延後**——這是 2.8.0 因「文案寫得比程式做得多」被 CWS 退件的直接教訓。

## 後果

- 回報內容多一份存在 Google 的副本，刪除要求必須兩邊都執行，人工步驟增加。
- Apps Script 有每日執行時間與寄信配額限制，單次執行設 2000 筆上限作為保護。
- 同步靜默失敗的風險高於同步不存在的風險——會誤以為「今天沒新回報」。因此認證失敗與連續失敗必須主動寄告警信。
- 既有掛在 `BUG_REPORT_FALLBACK_URLS` 的 GAS 端點維持不變，仍作為 Worker 失效時的備援，與本設計互不影響。
