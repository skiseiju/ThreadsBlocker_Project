# ssot-inventory：清點 src/ 尚未結構化（SSOT 缺失）的部位

## 錨點
- base commit: `3cea5d0`（2.8.1-beta1）
- 工作樹狀態: clean
- 檔案擁有權: **本任務唯讀，不改任何檔案**，只產出報告
- 回報對象 surface: sol = `surface:6`，Orchestrator（Claude）= `surface:5`

## 先讀
- `/Volumes/Working 2T/CODE/docs/TRIO_WORKFLOW.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/AGENTS.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/docs/handoff/checkbox-flicker-ssot.md`（示範什麼叫「同一判斷被抄多份」）

## 背景

剛修完的 bug（commit `0bfab09`）根因是：checkbox 視覺狀態的推導在 `src/core.js` 有六份各自為政的複製，來源集合不一致，兩個不同週期的迴圈互相覆蓋，造成閃爍。歷史上這個 bug 被「OR 再串一個條件」修過兩次都復發。

Orchestrator 已另外找到三個同型問題（見下方「已知，不要重複回報，但要驗證行號是否仍正確」）。

本任務要把**同型問題全部清點出來**，讓使用者一次看到還欠多少債。

## 判定標準（符合任一即列入）

1. **同一個判斷／推導出現在 2 個以上位置，且輸入條件不完全一致**。這是最高優先，因為它必然導致行為分歧。
2. 同一個判斷被複製 3 次以上，即使目前條件一致（改一處就會漏改其他處）。
3. 同一個 magic number／時間門檻／字串常數被硬寫在 3 個以上位置，而不是集中在 `CONFIG` 或單一 helper。
4. 同一份資料有兩套以上互相競爭的取得方式（例如兩個不同的 DOM 定位函式服務同一個目的，呼叫端混用）。
5. 已經有正確抽出的 SSOT helper，但仍有呼叫端繞過它自己重寫一份。

**不列入**：單純的程式碼長度、命名風格、缺少註解、可讀性、效能、測試覆蓋率。本任務只看「同一件事有幾份真理」。

## 已知，不要重複回報，但要驗證行號是否仍正確

Orchestrator 已找到這三個，請在報告中確認行號在 `3cea5d0` 上是否仍成立，並補上任何遺漏的呼叫點：

- **A. 「是否執行中」判斷有 7 份。** `src/core.js:588` 的 `resolveControllerStatus()` 是正確抽出的 SSOT（門檻可參數化、處理 `stopping`／`failed`），但只有主面板在用。另外 6 處硬寫 `Date.now() - (status.lastUpdate || 0) < 10000 && status.state === 'running'`：`core.js:773`、`2100`、`2433`、`2562`、`3466`、`4602`，加上 `3766` 的變體。這 6 處把 `stopping` 當成「沒在跑」，與面板顯示相反。
- **B. dialog context 有兩套競爭取法。** `Core.getTopContext()`（`core.js:2292`）取**最後一個** `[role="dialog"]`；`DialogCollector.pickBestAccountDialog()`（`dialog-collector.js:84`）取**帳號連結最多的**。呼叫端混用：`core.js:2811`、`357` 有包 `pickBest`，但 `2462`、`2524`、`2598`、`2721` 直接用 `getTopContext()` 原始結果。這是 CLAUDE.md 記載的 v2.5.2 first-vs-last dialog 慘案同一條斷層線。
- **C. 三個佇列集合散讀 55 次。** `BG_QUEUE` 24 次、`Storage.getBlockDB()` 17 次、`COOLDOWN_QUEUE` 14 次，散在 `core.js` 各處自行 `new Set`，沒有集中 accessor。

## 任務

1. 全面掃描 `src/` 底下所有 `.js`（`core.js`、`ui.js`、`worker.js`、`main.js`、`storage.js`、`utils.js`、`config.js`、`reporter.js`、`dialog-collector.js`、`more-locator.js`、`report-debug-context.js`、`announcements.js`、`release-notes.js`、`background.js`、`features/`），依上方判定標準找出所有案例。
2. 每一個案例必須附：
   - 一句話說明「這是什麼判斷／什麼資料」
   - **完整的位置清單**（`檔案:行號`），不得只寫「多處」
   - 各位置的**輸入條件差異**（像 checkbox 那張對照表那樣，明確標出誰少了什麼）
   - **是否已經造成可觀察的行為分歧**：分成「已分歧」（不同位置目前就會算出不同答案）與「尚未分歧」（目前一致，但改一處會漏）
   - 修復規模估計：小（改 <10 個呼叫點且無行為變更風險）／中／大
3. 依風險排序，**已分歧的排在尚未分歧的前面**。
4. 寫成報告 `docs/handoff/ssot-inventory.done.md`。報告開頭放一張總表：編號、一句話標題、位置數、已分歧／尚未分歧、修復規模。
5. **不要修任何東西。** 這是清點，不是修復。

## 不可改動的約束

- **唯讀任務。** 不得修改 `src/`、`tests/`、`dist/` 或任何既有檔案。唯一允許新增的檔案是 `docs/handoff/ssot-inventory.done.md`。
- 不得 commit、push、deploy、build。
- 不得為了湊數把「風格問題」「可讀性」「缺測試」列進來。列進來的每一項都要對得上判定標準的第幾條。
- 位置一律寫 `檔案:行號`，不得寫「多處」「若干」。行號要在 `3cea5d0` 上可驗證。

## 邊界

- 只讀：`src/`、`tests/`、`docs/`
- 只寫：`docs/handoff/ssot-inventory.done.md`
- secrets 只引用路徑，不得輸出值或寫進 repo

## 回報

寫完 `docs/handoff/ssot-inventory.done.md` 後主動通知 sol：

```bash
cmux send --surface surface:6 "ssot-inventory 完成，結果見 docs/handoff/ssot-inventory.done.md"
cmux send-key --surface surface:6 Enter
```

sol 抽驗行號正確性後通知 Claude：

```bash
cmux send --surface surface:5 "ssot-inventory 已彙整，結果見 docs/handoff/ssot-inventory.done.md"
cmux send-key --surface surface:5 Enter
```
