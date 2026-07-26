# diagnostics-gated-tests：把 18 個依賴 beta diagnostics 的測試改為隨閘門自動 skip

## 錨點
- base commit: `7177e6e2661312c79c12bab8c2aac44e349d34f9`
- 工作樹狀態: **dirty**——`src/core.js` 有 checkbox-flicker-ssot 的未 commit 修改，`docs/handoff/`、`tests/checkbox-flicker-ssot.test.mjs` 為未追蹤新檔。**本任務不得碰 `src/`**，所以不會衝突。
- 檔案擁有權: 本任務期間 `tests/` 底下的既有測試檔歸 luna；`src/` 全部不得動；`tests/checkbox-flicker-ssot.test.mjs` 不得動
- 回報對象 surface: sol = `surface:6`，Orchestrator（Claude）= `surface:5`

## 先讀
- `/Volumes/Working 2T/CODE/docs/TRIO_WORKFLOW.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/AGENTS.md`

## 已完成，不要重做（根因已查明）

`node --test tests/*.test.mjs` 目前 18 個 FAIL。**已確認 18 個全部同一個根因，且在 base commit `7177e6e` 上就已經是 18 個 FAIL，與 checkbox 修改無關。**

根因：`src/config.js:6` 的 `ENABLE_BETA_DIAGNOSTICS` 雖為 `true`，但實際閘門是

```js
CONFIG.ENABLE_BETA_DIAGNOSTICS === true && /-beta\d+$/i.test(String(CONFIG.VERSION || ''))
```

（出現在 `src/core.js:56`、`src/reporter.js:383`、`src/ui.js:849`、`src/ui.js:1432`）

`CONFIG.VERSION` 現在是 `'2.8.0'`，不含 `-beta`，所以 RuntimeDiagnostics 在 stable 完全關閉、不寫任何 entry。

這 18 個測試都是 beta 期寫的，做法是「執行動作 → 讀 diagnostics ring → 斷言有記到某筆」。ring 是空的（或為 null），因此：
- 斷言計數 `0 !== 1`
- `assert.ok(row)` 拿到 undefined
- `Cannot read properties of null (reading 'entries')`

**被測的功能行為本身沒有壞**，壞的是「有沒有留下診斷紀錄」這個附帶斷言。

### 18 個 FAIL 清單（已核對）

```
beta54 version is bumped without building
beta55 diagnostics are beta-only, bounded, session-memory and privacy-safe
beta55 diagnostics coalesce high-frequency message events without starving clean-list stages
beta55 message route requires shell evidence and records normalized signal matrix
beta57 safety writer emits executable retry/failure/breaker/cooldown sequence
beta58 verified contract is shared by clean-list and post-reservoir and diagnostics are privacy-safe
beta59 diagnostics expose privacy-safe skip breakdown and scroll progress
beta61 Core settlement executes raw observed skip-only and true zero-row outcomes
beta62 Core clean_list emits anchor_filter and rows aggregate diagnostics
beta62 production reservoir collectBatch exports balanced anchor_filter and rows aggregates
beta63 clean-list continues to skip self and reply target
beta63 clean-list verified Likes keeps post owner as eligible
beta63 reservoir production path keeps post-owner exclusion and does not enqueue
beta64 clean-list waits for lazy Likes rows instead of ending at initial bottom
beta65 clean-list resolves the real scroll root after lazy rows arrive
beta78 appendScanDebugLog probe is privacy-safe for new stop-gate entries
beta78 finishScan terminal guard stays false and records finish_rejected_early_terminal
beta78 requestStop missing ids stays false and records stop_rejected_missing_ids
```

## 任務

1. 新增共用測試輔助檔（例如 `tests/helpers/diagnostics-gate.mjs`），匯出：
   - `diagnosticsEnabled`：**從 `src/config.js` 讀真實的 `CONFIG`，套用與產品完全相同的那條閘門表達式**算出布林值。不得在測試裡另寫一份版本判斷邏輯，也不得寫死 `false`。
2. 上列 18 個測試各自改為：`diagnosticsEnabled === false` 時以 `test(name, { skip: '...' })` 條件跳過，skip 理由要寫明「stable build 停用 beta diagnostics」。
   - **不得刪除測試、不得註解掉、不得改動斷言內容。** 目的是讓它們在下一次 beta 版號時自動恢復執行。
   - 逐一比對 skip 的測試名稱與上面清單一致，不得順手 skip 沒在清單上的測試。
3. `beta54 version is bumped without building` 與 `beta55 diagnostics are beta-only, ...` 這兩個要先各自確認**是否真的屬於同一根因**。若其中有測的是「stable 必須保持 diagnostics 關閉」這種**在 stable 就應該通過**的契約，那它是真的壞掉、不能 skip，要在 `.done.md` 單獨列出並說明，交回給 Orchestrator 決定。
4. 驗證：
   - `node --test tests/*.test.mjs` → **fail 必須為 0**，並回報 pass / skip 各幾個。
   - 確認 skip 數等於實際條件跳過的數量，且沒有測試因此變成靜默通過。
   - 反向驗證：暫時把 `src/config.js` 的 `VERSION` 改成 `'2.8.0-beta1'` 跑一次全套，確認這 18 個**會重新執行**（不論通過與否，回報結果），**跑完務必把 VERSION 改回 `'2.8.0'`** 並以 `git diff src/config.js` 為空證明還原乾淨。

## 不可改動的約束

- **不得改 `src/` 底下任何檔案**（第 4 點的 VERSION 反向驗證是唯一例外，且必須還原到 `git diff src/config.js` 為空）。
- 不得改 `src/core.js`。它正帶著另一個任務的未 commit 修改。
- 不得刪除或弱化任何斷言。skip 是條件式的，不是永久關閉。
- 不得改 `dist/`、版本號、CHANGELOG、manifest。
- 不得 commit、push、deploy。

## 邊界

- 只動：`tests/` 底下的既有測試檔、新增的 `tests/helpers/` 輔助檔
- 不准：碰 `src/`（除第 4 點反向驗證且必須還原）、碰 `tests/checkbox-flicker-ssot.test.mjs`、commit、push、deploy
- secrets 只引用路徑，不得輸出值或寫進 repo

## 回報

完成或受阻後寫到 `docs/handoff/diagnostics-gated-tests.done.md`，接著主動通知 sol：

```bash
cmux send --surface surface:6 "diagnostics-gated-tests 完成／受阻，結果見 docs/handoff/diagnostics-gated-tests.done.md"
cmux send-key --surface surface:6 Enter
```

sol 自行實跑驗證後通知 Claude：

```bash
cmux send --surface surface:5 "diagnostics-gated-tests 已彙整，結果見 docs/handoff/diagnostics-gated-tests.done.md"
cmux send-key --surface surface:5 Enter
```

`.done.md` 格式：

```
狀態：
修改檔案：
驗證命令與結果（含 pass / fail / skip 數字，與 VERSION 反向驗證結果）：
第 3 點的判定（哪些是真的壞、不能 skip）：
未驗證項／假設：
尚待 Orchestrator 決定：
```
