# <task-id>：<一句話任務>

## 錨點
- base commit: <git rev-parse HEAD>
- 工作樹狀態: clean
- 檔案擁有權: 本任務期間 <檔案清單> 歸 luna，Orchestrator 不動

## 先讀
- <路徑>

## 已完成，不要重做
- <既有決策、已完成的部分>

## 任務
1. <可驗收的具體項目>

## 不可改動的約束
- <設計鐵律、ADR 決策>

## 邊界
- 只動：<檔案清單>
- 不准：commit、push、deploy、碰其他檔案
- secrets 只引用路徑，不得輸出值或寫進 repo

## 回報
完成後寫到 `docs/handoff/<task-id>.done.md`：

```
狀態：
修改檔案：
驗證命令與結果：
未驗證項／假設：
尚待 Orchestrator 決定：
```
