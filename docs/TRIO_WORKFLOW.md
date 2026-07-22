# Trio 工作模式（Claude + sol + luna）

Claude（Orchestrator）與 cmux 內兩個 Codex pane 協作的規則。目的是**把使用者移出訊息路由的位置**——使用者只下決策，不當中繼站。

角色對應見 `/CODE/docs/MODEL-CHARTER.md`；本檔只定義 trio 的操作機制。

## 0. 角色

| 角色 | 誰 | 職責 |
|---|---|---|
| Orchestrator | Claude | 產品判斷、與使用者往返、驗收、commit、不可逆操作 |
| 協調 | sol（cmux surface） | 拆解任務、指派 luna、彙整回報 |
| 實作 | luna（cmux surface） | 機械性程式編輯、大量改動、測試撰寫 |

**只有 Orchestrator 能 commit、deploy、對外發布。** worker 一律不 commit——這讓任何中斷都能用 `git checkout` 還原。

## 1. 派工前置檢查（每次都要做）

```bash
cmux tree --all          # 確認 surface 還在，不要假設
git status --short       # 必須乾淨；不乾淨先處理完再派工
git rev-parse HEAD       # 記進任務書，這是 rollback 錨點
```

沒做這三步就派工，等於把「工作樹現在長怎樣」交給運氣。曾經因為沒查 surface 就另外開了一個一次性 subagent，浪費一次派工。

## 2. 任務書格式（固定）

寫到 `docs/handoff/<task-id>.md`，內容七段，缺一不可：

```markdown
# <task-id>：<一句話任務>

## 錨點
- base commit: <sha>
- 工作樹狀態: clean
- 檔案擁有權: <本任務期間歸 luna 的檔案清單>
- 回報對象 surface: <Orchestrator 的 surface ref，worker 完成後往這裡送通知>

## 先讀
<檔案路徑清單>

## 已完成，不要重做
<避免 worker 重複造輪子或推翻既有決策>

## 任務
<編號、可驗收>

## 不可改動的約束
<設計鐵律、ADR 決策>

## 邊界
- 只動：<檔案清單>
- 不准：commit、push、deploy、碰其他檔案

## 回報
完成或受阻後寫到 docs/handoff/<task-id>.done.md（狀態／修改檔案／驗證命令與結果／
未驗證項／尚待 Orchestrator 決定），接著用 cmux send 主動通知回報對象 surface。
```

## 3. 來回機制：完成方主動通知，不輪詢

`cmux send` 是**雙向**的。worker 做完直接對 Orchestrator 的 surface 送一句話，那句話會落進 Orchestrator 的輸入並被處理——這就是通知，不需要任何等待或輪詢。

Orchestrator 掛背景等待是錯的：浪費一個 process、延遲取決於 sleep 間隔、worker 掛掉時等待端毫無所覺。**誰完成誰負責通知。**

### 派工（Orchestrator → worker）

```bash
cmux send --surface surface:6 "讀 docs/handoff/<task-id>.md 並執行"
cmux send-key --surface surface:6 Enter
```

`send` 之後**必須補 `send-key Enter`**，否則文字只停在輸入列。

### 回報（worker → Orchestrator）

任務書的「錨點」段必須寫明 Orchestrator 的 surface ref，worker 完成後執行：

```bash
cmux send --surface <orchestrator-surface> "<task-id> 完成／受阻，結果見 docs/handoff/<task-id>.done.md"
cmux send-key --surface <orchestrator-surface> Enter
```

**受阻也要通知**，不能沉默。沉默與「還在做」無法區分，那正是今天要解決的問題。

### luna ↔ sol

同一機制。sol 指派 luna 時把自己的 surface ref 寫進任務書，luna 完成後通知 sol，sol 彙整後再通知 Orchestrator。

### surface ref 怎麼查

會變動，不要寫死在文件裡。派工當下用 `cmux tree --all` 查，或各自用 `cmux identify` 取得自己的 `surface_ref`，寫進任務書。

### 逾時的唯一情況

worker 崩潰到連通知都送不出來。此時是使用者察覺異常後告知，或 Orchestrator 在下次接觸時發現——依第 5 節接管。這種情況不該用輪詢來預防，成本高而收益低。

## 4. 分工判準

| 丟給 luna | Orchestrator 自己做 |
|---|---|
| 機械性大量編輯（>100 行、跨檔重複改動） | 需要產品判斷或文案取捨 |
| boilerplate、測試撰寫 | 需與使用者來回確認 |
| 大範圍掃描與盤點 | 不可逆操作（deploy、發布、DB mutation） |
| 與主線隔離的蒐證 | 驗收 |

判準是「這件事錯了誰負責」。要人決定的自己做，要人打字的丟出去。

**實作者不得是唯一驗證者。** luna 交回後 Orchestrator 必須自己實跑驗證命令，不採信回報文字。

## 5. Fail-safe：usage limit 或 worker 中斷

任何一方可能在任務中途因額度、崩潰或被中斷而消失。設計前提是**隨時可能斷，斷了要能無損接手**。

### 為什麼安全

- worker 從不 commit → 未完成的工作一定是 dirty working tree
- 任務書寫在磁碟 → 不依賴任何 agent 的記憶
- base commit 記在任務書 → 隨時知道乾淨狀態在哪

### luna 中斷

1. `cmux tree --all` 確認 pane 狀態
2. `git status --short` 盤點被改了什麼
3. 判斷：改動可用 → 保留並由 Orchestrator 接手收尾；改動不可用 → `git checkout -- <檔案>` 還原到 base commit
4. 明確轉移檔案擁有權後才重新派工，**不得兩個 worker 同時擁有同一檔案**

### sol 中斷

Orchestrator 直接對 luna（`surface:7`）派工，任務書格式不變。sol 只是協調層，不是必要路徑。

### Orchestrator（Claude）中斷

使用者手上有兩個東西就能接續：`docs/handoff/` 的任務書與 base commit。可以：

- 把任務書交給 sol，讓 sol 兼任協調與驗收（風險：實作者驗自己，需人工複核）
- 或等 Orchestrator 恢復，工作樹狀態不會遺失

**中斷後絕對不做的事**：在不知道誰動過哪些檔案的情況下直接繼續改。先 `git status` 盤點，再決定。

## 6. Fail-safe：Codex 整個不能用

指 Codex 額度耗盡、訂閱到期或服務中斷，**sol 與 luna 都沒得用**。這不是「某個 worker 掛了」，是整層執行工人消失。

### 判斷

pane 回 quota / 認證錯誤，或 `codex` 指令直接失敗。不要重試三次以上——額度問題重試不會好，只是浪費時間。

### 立即處置

1. 停止一切派工，不要留半完成的任務
2. `git status --short` 盤點 dirty tree，依第 5 節決定保留或還原
3. 告知使用者：哪些工作卡住、預計用什麼替代、成本差在哪

### 降級順序

| 層級 | 用什麼 | 適合 | 代價 |
|---|---|---|---|
| 1 | Claude subagent（Agent tool，haiku） | 機械性編輯、大範圍掃描、測試撰寫 | 不同額度池，多半還能用；品質略降，回報需更嚴格驗收 |
| 2 | Orchestrator 自己做 | 需要判斷、或 subagent 也不可用時 | 燒 context，長任務會撞上壓縮 |
| 3 | 延後 | 非緊急的大量機械工作 | 進度延後，但不會做壞 |

**選擇原則**：不可逆或有時效的（deploy、送審、修 production bug）不論多貴都由 Orchestrator 自己做完；純粹省時間的整理工作直接延後，不要為了做而降低品質。

### 自己做的時候

- 先拆成 commit 大小的段落，每段做完就 commit——context 壓縮不會弄丟已完成的部分
- 大量重複編輯用腳本（python/sed）批次處理並自我驗證，不要逐行手改
- 驗收標準不降低。沒有 worker 不代表可以少跑測試

### 預防

- 大任務一律拆成可獨立交付的段落，每段結束由 Orchestrator commit——commit 就是天然存檔點
- 不要把「改 50 個檔案」當成一個任務丟出去，斷在中間很難收
- 高價值不可逆的事（發版、deploy）盡量不依賴 worker，這樣 Codex 消失時關鍵路徑不受影響

## 7. 開 trio 的固定指令

開新 pane 後第一句話固定為：

```
你是 <sol|luna>。讀 docs/TRIO_WORKFLOW.md 確認角色與邊界，然後待命。
```

不要在開場白裡描述任務——任務一律走任務書。開場只確立角色。
