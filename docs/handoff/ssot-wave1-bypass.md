# ssot-wave1-bypass：把「已有 canonical helper 但呼叫端自己重寫」的五處收斂

## 錨點
- base commit: `3cea5d0`（2.8.1-beta1）
- 工作樹狀態: clean（僅 `docs/handoff/ssot-inventory.md` 未追蹤）
- 檔案擁有權: 本任務期間 `src/` 與 `tests/` 歸 luna
- 回報對象 surface: sol = `surface:6`，Orchestrator（Claude）= `surface:5`

## 先讀
- `/Volumes/Working 2T/CODE/docs/TRIO_WORKFLOW.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/AGENTS.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/docs/BLOCKING_ARCHITECTURE.md`（動 `core.js`／`worker.js`／`main.js` 前必讀，AGENTS.md §任務路由 要求）
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/docs/handoff/ssot-inventory.done.md`（本任務的來源清單，行號基準同為 `3cea5d0`）

## 已完成，不要重做

`ssot-inventory.done.md` 已完成全面清點並經 Orchestrator 抽驗行號。**不要重新掃描、不要重新分類、不要擴充清單。**

本任務只處理其中「canonical helper 已存在，但呼叫端自己重寫一份」這一類，共 5 項（inventory 編號 1、7、8、9、10）。其餘 7 項不在範圍內，看到也不要順手改。

## 任務（依序執行，每項獨立驗證後才進下一項）

### 階段 1：編號 9 — beta diagnostics gate（最小風險，先做）

canonical：`src/core.js:55-63`（`RuntimeDiagnostics.enabled()`，不 active 時會清 ring／operations／dispose observers）。

改為呼叫 canonical 的位置：`src/reporter.js:383`、`src/ui.js:849`、`src/ui.js:1432`。

`src/utils.js:262` 的 `isBetaBuild`（`/-beta/i`）與 `src/features/three-no-watch.js:9` 的用法屬於「beta UI 是否顯示」，語意與「runtime diagnostics 是否啟用」不同。**不要直接合併**。請保留 `isBetaBuild` 供 UI 判斷，但確認 three-no debug log 用的是 diagnostics 語意還是 UI 語意，並在 `.done.md` 說明你的判定與依據。

### 階段 2：編號 10 — checkbox SSOT bypass（一行）

`src/main.js:960-965` 的 clear-selection callback 直接 `classList.remove('checked')`，繞過 `Core.applyCheckboxState`（`src/core.js:724-729`）。

改為走 helper。注意 `Core.updateControllerUI()` 有 500ms 節流（`src/core.js:3481-3497`），所以不能假設緊接著的呼叫會立即重算。

### 階段 3：編號 7 — scroll root

canonical：`src/dialog-collector.js:253-304`（overflow 檢查、排除巢狀 dialog、exact link 與 row evidence、depth／height score）。

本地重寫：`src/core.js:2305-2313`（legacy advanced block）、`src/features/three-no-watch.js:2174-2180`（follower scan）。

兩處改為使用 canonical。若兩者的 row contract 確實不同（例如 follower row 與 likes row 判定不同），**用 canonical 的 options 參數表達差異，不得再開一份 resolver**。

### 階段 4：編號 1 — 「是否執行中」判斷

canonical：`src/core.js:589-610`（`resolveControllerStatus`，可注入 `now`／`staleMs`，先處理 `failed`／`stopping`／`stopped`）；停止按鈕另有 `src/core.js:613-628`（`resolveStopVisibility`，把 `stopping` 視為 active session）。

硬寫 10 秒且只接受 `running`：`src/core.js:773`、`2100`、`2433`、`2562`、`3465`、`3765`（變體）、`4601`；`src/main.js:622`、`855`。

硬寫 30 秒：`src/utils.js:301`、`src/features/post-reservoir-engine.js:158`、`src/features/three-no-watch.js:936`。

**這一項會改變行為，不是純機械替換。** 要求：

1. 先在 `.done.md` 列出「收斂後每個呼叫點的行為變化」。至少要回答：原本在 `stopping` 狀態被當成「沒在跑」的位置，改成「在跑」之後會走哪條分支？原本 30 秒視窗的三處縮成 10 秒後，10–30 秒 stale 區間的行為變化是什麼？
2. **若某個呼叫點的語意確實應該是 30 秒或確實應該忽略 `stopping`，不要為了統一而改壞它。** 改用 canonical 並傳入該呼叫點需要的 `staleMs`／選項，把差異變成顯性參數而不是複製的表達式。哪些保留差異、理由是什麼，寫進 `.done.md`。
3. 每個呼叫點都要能說出「這裡問的是哪一種活躍」：背景封鎖 worker、sweep、report、three-no、或 queue 非空。

### 階段 5：編號 8 — More 控制項（風險最高，最後做）

canonical：`src/more-locator.js:3-175`（visibility、route safety、dialog/menu/link exclusion、profile/post/row scope、候選 score）。正式呼叫：`src/worker.js:1590-1608`、`src/features/report-flow.js:508-525`。

本地重寫：`src/core.js:1082-1111`（profile action anchor，使用點 `1122`、`1148`）、`src/features/report-flow.js:466-506`（legacy `getMoreButtonText`／clickable ancestor／shape 判定）。

**這條在封鎖成功路徑上，改壞會直接讓封鎖失敗。** 要求：

1. `src/core.js:1082-1111` 目前會把 Instagram、bell、profile-more 都當成 action anchor。**只把其中「找 More」的分支委派給 `MoreLocator`，其他 action 類型維持原行為。** 不得把整段換掉。
2. `src/features/report-flow.js:466-506` 若確認已無呼叫端，直接刪除並在 `.done.md` 附證明（grep 結果）；若仍有呼叫端，改為委派 canonical。
3. 改動前後各跑一次既有 block／report 相關測試，逐項附上結果。

## 驗證要求（每階段都要）

- `node --check` 所有被改動的檔案。
- 每階段結束跑 `node --test tests/*.test.mjs`，附 pass／fail／skip 數字。基準：`3cea5d0` 上 beta 版號為 232 tests、229 pass、0 skip、3 fail（beta54／58／59 硬編舊版號，既有問題）。**fail 數不得增加**。
- 階段 4 與階段 5 各自新增回歸測試：
  - 階段 4：至少一個測試證明 `stopping` 狀態下，收斂後的呼叫點與 `resolveControllerStatus` 給出一致答案。
  - 階段 5：至少一個測試證明 profile header 的 More 委派後仍能定位到正確控制項，且 unsafe route（search／tag ancestor）仍 fail closed。
- 每階段結束附 `git diff --stat`。

## 不可改動的約束

- **不得處理 inventory 編號 2、3、4、5、6、11、12。** 那七項要先做產品決定或屬於大工程，另外開工。
- 不得為了統一而刪除有意義的行為差異。差異要變成顯性參數並記錄理由。
- 不得改 `dist/`、版本號、CHANGELOG、manifest。
- 不得 commit、push、deploy、build。
- iOS 導航不得改成會觸發 Universal Links 的 `window.location.href` 路徑（AGENTS.md）。
- 外部 API slug／identifier／DOM selector 一律以實際程式或 `git show` 舊版驗證，不得從名字推測。

## 邊界

- 只動：`src/`、`tests/`
- 不准：commit、push、deploy、build、改 `dist/`、碰 inventory 其餘七項
- secrets 只引用路徑，不得輸出值或寫進 repo

## 回報

每完成一個階段就在 `docs/handoff/ssot-wave1-bypass.done.md` 追加該階段結果（不要等五個階段全做完才寫）。全部完成或受阻後通知 sol：

```bash
cmux send --surface surface:6 "ssot-wave1-bypass 階段N 完成／受阻，結果見 docs/handoff/ssot-wave1-bypass.done.md"
cmux send-key --surface surface:6 Enter
```

sol 自行實跑驗證後通知 Claude：

```bash
cmux send --surface surface:5 "ssot-wave1-bypass 已彙整，結果見 docs/handoff/ssot-wave1-bypass.done.md"
cmux send-key --surface surface:5 Enter
```

`.done.md` 每階段格式：

```
## 階段 N（inventory 編號 X）
狀態：
修改檔案與 diff --stat：
行為變化清單（階段 4／5 必填）：
保留差異的項目與理由：
驗證命令與結果（pass / fail / skip）：
新增測試：
未驗證項／假設：
```
