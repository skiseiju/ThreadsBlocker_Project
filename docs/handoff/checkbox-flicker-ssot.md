# checkbox-flicker-ssot：修復封鎖進行中 checkbox 閃爍——把六份狀態推導收斂成單一來源

## 錨點
- base commit: `7177e6e2661312c79c12bab8c2aac44e349d34f9`
- 工作樹狀態: clean
- 檔案擁有權: 本任務期間 `src/core.js`、`src/ui.js` 歸 luna，Orchestrator（Claude）與 sol 不動
- 回報對象 surface: sol = `surface:6`，Orchestrator（Claude）= `surface:5`

## 先讀
- `/Volumes/Working 2T/CODE/docs/TRIO_WORKFLOW.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/AGENTS.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/CLAUDE.md`

## 已完成，不要重做（根因調查已結束，直接照這個結論修）

使用者回報：**封鎖執行中，帳號列的勾選框會閃爍**（紅色打勾一下有一下沒有）。

根因已定位，**不要再重新調查、不要再加新的 latch 補丁**：

兩個迴圈用**不同的資料來源**在算同一個 `checked` class，跑的週期不同，互相覆蓋。

1. `src/core.js:3540`（`updateControllerUI` 內的全域同步迴圈）
   判斷式：`db → finished` / `pendingUsers || isSelectionLatched || cdq || bgq → 加上 checked`
2. `src/core.js:2905`（`injectDialogCheckboxes` 的「既有框」分支）
   判斷式：`isChecked = pendingUsers || isSelectionLatched` → `classList.toggle('checked', isChecked)`
   **缺 db / cdq / bgq**

封鎖一啟動，`src/core.js:3869` 會 `Core.pendingUsers.clear()`，帳號改住 `BG_QUEUE`。
於是 2905 算出 `false` 把 checked 拿掉、3540 算出 `true` 又加回去。
3540 每次 scanner pass 跑（`src/core.js:2213`，1500ms interval）；2905 除了 scanner pass 還額外掛在 scroll debounce（`src/core.js:2209`，80ms）。一開一關 → 閃。

`Core.isSelectionLatched`（`src/core.js:690`）與 `beginBlockSession`（`src/core.js:692`，診斷欄位直接叫 `flickerLatch`）是上一輪為了壓這個閃爍加的補丁，只有帳號同時落在 `Core._selectionSnapshot` 才蓋得住。**走 `beginBlockSession` 以外的路徑進 `BG_QUEUE` 的帳號蓋不到**，例如封鎖進行中再執行「整串名單加入背景排隊」（`src/core.js:2420`、`src/core.js:2550`）——這些帳號會立刻被 `src/core.js:3515` 的 global cleanup 從 `pendingUsers` 移除，然後開始閃。

`git log -L 2900,2910:src/core.js` 顯示 2905 這行歷史上的修法一直是「OR 再串一個條件」（`354cdaf` → `53373f9`），六份沒有一起改，所以每次換一條觸發路徑就再犯一次。

**這不是 commit 沒合回。** `dist/extension/content.js:11275` 與 `src/core.js:2905` 一致，src 與 dist 沒有版本落差。是 SSOT 沒拆好。

### 六份推導的現況對照表（已核對過，可直接採信）

| 位置 | 函式 | db | pendingUsers | latch | cdq | bgq |
|---|---|---|---|---|---|---|
| `core.js:1017-1027` | `syncCheckboxQueueState` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `core.js:2905` | `injectDialogCheckboxes` 既有框 | ✗ | ✓ | ✓ | **✗** | **✗** |
| `core.js:2960-2965` | `injectDialogCheckboxes` 新框 | ✓ | ✓ | ✓ | **✗** | → `pending` |
| `core.js:3119-3124` | more-button inline 新框 | ✓ | ✓ | **✗** | ✓ | ✓ |
| `core.js:3408-3414` | pending 補標迴圈 | ✗ | ✓ | ✗ | ✗ | ✗ |
| `core.js:3535-3550` | `updateControllerUI` 全域同步 | ✓ | ✓ | ✓ | ✓ | ✓ |

追加缺陷：`core.js:2963` 給 `bgq` 帳號的 class 是 `pending`，但 `src/ui.js:306-324` 的 CSS **完全沒有 `.pending` 規則**，所以那個狀態畫出來跟「未勾選」一模一樣，本身就是閃爍的一個來源。

## 任務

1. 在 `src/core.js` 新增單一推導函式，例如
   `Core.resolveCheckboxState(username, sources)` → 回傳 `'finished' | 'checked' | 'none'`。
   - `sources` 可傳入已建好的 `{ db, cdq, bgq }` Set 讓呼叫端重用，不傳則自行讀 Storage。
   - 判斷順序固定為：`db → 'finished'`；否則 `pendingUsers || isSelectionLatched || cdq || bgq → 'checked'`；否則 `'none'`。
   - 這是**唯一**允許決定 checkbox 視覺狀態的地方。
2. 再新增一個套用函式，例如 `Core.applyCheckboxState(el, state)`，負責把 `finished` / `checked` class 加上或移除，確保三種狀態互斥。
3. 上表**六個呼叫點全部改為呼叫**這兩個函式，不得保留任何一份自行寫 OR 條件的判斷。
4. 移除 `pending` 這個沒有 CSS 的中間 class：`core.js:2963` 的 `bgq` 分支改走統一推導（結果會是 `checked`）。若程式碼別處有讀 `.pending`，一併清乾淨；`grep -n "'pending'" src/core.js` 結果要為 0（或只剩與 checkbox 無關的用途，需在 `.done.md` 說明）。
5. 加自動化測試到 `tests/`，至少涵蓋：
   - a. 帳號只在 `BG_QUEUE`、不在 `pendingUsers`、且**不在** `_selectionSnapshot` 時，連續跑 `injectDialogCheckboxes()` 與 `updateControllerUI()` 各兩輪，`checked` class 必須全程維持 `true`（這就是閃爍的回歸測試）。
   - b. 帳號在 `db` 時維持 `finished`、不得同時有 `checked`。
   - c. 帳號都不在任何集合時，`checked` 與 `finished` 都不存在。
6. 跑既有測試全綠，並在 `.done.md` 附上指令與輸出摘要。

## 不可改動的約束

- **不准再加新的 latch / snapshot / 計時器來遮蓋閃爍。** `isSelectionLatched` 與 `beginBlockSession` 保留現有語意，繼續當推導的一個輸入項，但不得擴充成新的補丁。
- 不得改動使用者可見的封鎖行為、佇列語意、`BG_QUEUE` / `COOLDOWN_QUEUE` / `PENDING` 的讀寫時機。這是純視覺狀態推導的重構。
- 不得改 `dist/`。build artifact 由 Orchestrator 依 `AGENTS.md` 處理。
- 不得動版本號、CHANGELOG、manifest。
- 重寫既有邏輯前，若對舊行為有疑問，`git show <SHA>:src/core.js` 逐行對照，不得從函式名字推測。

## 邊界

- 只動：`src/core.js`、`src/ui.js`（僅在需要補 CSS 時）、`tests/` 底下新增的測試檔
- 不准：commit、push、deploy、動 `dist/`、碰其他檔案
- secrets 只引用路徑，不得輸出值或寫進 repo

## 回報

完成或受阻後寫到 `docs/handoff/checkbox-flicker-ssot.done.md`，**接著主動通知 sol**：

```bash
cmux send --surface surface:6 "checkbox-flicker-ssot 完成／受阻，結果見 docs/handoff/checkbox-flicker-ssot.done.md"
cmux send-key --surface surface:6 Enter
```

sol 彙整後主動通知 Claude：

```bash
cmux send --surface surface:5 "checkbox-flicker-ssot 已彙整，結果見 docs/handoff/checkbox-flicker-ssot.done.md"
cmux send-key --surface surface:5 Enter
```

受阻也要送，沉默與「還在做」無法區分。

`.done.md` 格式：

```
狀態：
修改檔案：
驗證命令與結果：
未驗證項／假設：
尚待 Orchestrator 決定：
```
