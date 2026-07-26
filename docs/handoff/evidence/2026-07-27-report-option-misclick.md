# 證據：檢舉選項點到左側導覽（BUGLIST #10）

回報時間：2026-07-27 深夜（log 時間戳 `[上午2:05:31]`）
版本：`2.8.1-beta1`（診斷 JSON 的 `version` 欄位）
sessionId：`7e9c70f69797`

## 使用者回報

> 在檢舉時，有一些選項會出錯……看起來是 ui 點錯

## 關鍵 log

```
[上午2:05:31] [只檢舉] 選擇「這是垃圾訊息」後 可見選項=["為你推薦","為你推薦","新串文","新串文","搜尋搜尋","搜尋","訊息訊息","訊息","通知動態","動態","個人檔案個人檔案","個人檔案","洞察報告洞察報告","洞察報告","已儲存已儲存","已儲存","動態消息","編輯","編輯","追蹤中"] dialogs=0 {"nextPath":[]}
```

判讀：

- `dialogs=0`：當下頁面上沒有任何 `div[role="dialog"]`。
- 可見選項全部是 Threads 左側主導覽的項目，不是檢舉對話框的選項。
- 部分項目出現兩次且其中一份是疊字（`搜尋搜尋` / `搜尋`），符合同一元素的 `innerText` 與 `textContent` 都被收集的取樣方式，佐證掃描範圍是整頁而非對話框。
- `nextPath: []`：本次剛好沒有後續步驟，所以沒有真的點下去。**路徑較長的檢舉理由會有下一步，屆時就會誤點導覽列。**

## 診斷 JSON 摘要

```
summary: { panel: 72, selection: 8, message_route: 120 }
```

- **沒有任何 `report` feature 的 entry。** 檢舉流程只寫 `window.hegeLog`，沒有接 RuntimeDiagnostics。
- `message_route` 全程 `routeMatch: false`、`messageRoute: false`，與本問題無關，是常態噪音。
- `pathnameCategory: "profile"`，viewport 1540×1279，`clamped: false`，面板位置正常。
- 多筆 `elapsedMs: 1000000` 是 operation 早已 terminal 後的固定上限值，不是真實耗時。

## 對應程式

`src/features/report-flow.js`

- `findNextReportOption`（約 243-256 行）：
  `const roots = dialogs.length > 0 ? [...dialogs, document] : [document];`
  沒有 dialog 時直接把 `document` 當 root，整頁文字比對。
- `getVisibleReportOptionTexts`（約 257-264 行）：
  `const root = dialogs[0] || document;`
  同樣的 fallback，所以診斷訊息本身也會誤導。

## 修復方向

1. `dialogs.length === 0` 時**不得** fallback 到 `document`。應回 `null`，交由上層重試或明確失敗，並保留 reason。
2. `getVisibleReportOptionTexts` 同步改掉，讓 log 反映真實 root。
3. 補上 report flow 的 RuntimeDiagnostics 儀器，至少涵蓋：進入某一步、找到／找不到選項、dialog 消失、路徑中斷。
4. 回歸測試：頁面上沒有 dialog 但存在文字相同的導覽項目時，`findNextReportOption` 必須回 `null`，不得回傳導覽元素。

屬 SSOT inventory #4「dialog context 取法不一致」家族，可與該項合併處理。
