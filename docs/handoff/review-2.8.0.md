# review-2.8.0：對 2.8.0 已發版的程式碼做只讀對抗複核

## 錨點
- base commit: 27c38f3071799e46f93d8a0ff451d39f1790103a
- 工作樹狀態: clean
- 檔案擁有權: 無（本任務唯讀，不得修改任何檔案）
- 回報對象 surface: surface:5

## 先讀
- `/Volumes/Working 2T/CODE/docs/TRIO_WORKFLOW.md`（角色與邊界）
- `docs/adr/0010-honest-human-review-disclosure-and-consent-v4.md`
- `docs/adr/0011-bug-report-sheet-sync.md`
- `CHANGELOG.md` 的 `## v2.8.0` 區塊

## 已完成，不要重做
2.8.0 已經發版：CWS 送審中、AMO 待審、GitHub tag `v2.8.0`。以下都做完了，不要重複建議：

- credentials／token 處理（page bridge、fetch/XHR patch）已整段移除
- `PLATFORM_SYNC_CONSENT_POLICY_VERSION` 已升 `platform-sync-v4`
- `assertAdmin` 已換成 `assertScope`，scoped token 已 deploy 並 live 驗證
- 隱私頁已 deploy 到 2.8.0 並 live 驗證
- 示範觀測平台（`?mock=1`）已移除
- 已知未解（不用再提）：`sample-reviews` 仍回傳原文、raw access 無 audit log、18 個 beta 測試依賴 beta 版號

## 任務

對 2.8.0 的程式碼做**對抗性只讀複核**，目標是找出「已發版但我們還沒發現」的問題。重點順序：

1. **credentials 移除是否真的乾淨**：`src/` 與 `dist/` 有無殘留的 token 擷取、注入、fetch/XHR 攔截路徑，或只是被繞過但程式碼還在。
2. **consent v4 gate 是否真的 fail-closed**：找出任何能繞過 `hasPlatformSyncConsentForCurrentVersion()` 而送出資料的路徑（含 auto、repair、manual、三無統計四條）。
3. **`assertScope` 有無漏網**：`cf_bug_admin/src/index.js` 是否還有未經 scope 檢查就存取 D1／R2 的 handler，或有 handler 拿到比需要更大的 scope。
4. **正式版診斷關閉是否可靠**：`/-beta\d+$/` 這個判斷有無可被繞過或誤判的情況（例如版號格式變動、storage 殘留設定）。
5. **問題回報路徑的 PII 邊界**：未勾診斷附件時，是否真的只送出描述與服務必要欄位。

每個發現請給：檔案:行號、為什麼是問題、具體觸發情境、嚴重度（高/中/低）。**找不到問題也要明說某項已檢查且未發現**，不要略過。

## 不可改動的約束
- 本任務**唯讀**。不得修改、格式化或重構任何檔案。
- 不得 commit、push、deploy。
- 不要提出與「已完成，不要重做」重複的建議。
- secrets 只引用路徑，不得輸出值。

## 邊界
- 可讀：整個 repo
- 可寫：只有 `docs/handoff/review-2.8.0.done.md` 這一個檔案

## 回報
把結果寫到 `docs/handoff/review-2.8.0.done.md`：

```
狀態：
逐項檢查結果（1~5 每項都要有結論，含「已檢查未發現」）：
發現清單（檔案:行號／問題／觸發情境／嚴重度）：
未驗證項／假設：
尚待 Orchestrator 決定：
```

寫完後**主動通知**：

```bash
cmux send --surface surface:5 "review-2.8.0 完成，結果見 docs/handoff/review-2.8.0.done.md"
cmux send-key --surface surface:5 Enter
```

受阻也要照上面通知，不要沉默。
