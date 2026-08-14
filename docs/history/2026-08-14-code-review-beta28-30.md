# 時點快照：beta28-30 對抗性 code review 完整發現（2026-08-14）

> 審查範圍：commits `7777487^..1f72825`（beta28 失敗複驗＋重新驗證、beta29 dialog observer、beta30 簽章釘住），src/ 六檔。**非全 codebase 審查**。
> 效力：發現已收斂進 `docs/PLAN_2.8.2_STRUCT_DEBT.md` 第 34-37 項；該表為準，本檔只保存完整失敗情境與駁回紀錄。修掉任一項後本檔不更新。

## 收錄發現（8 條，依嚴重度）

### 1. 確認框被限流視窗換裝時誤判成功（PLAUSIBLE）→ 表 #34(a)

`worker.js:2978`。beta29 改成只盯 confirmDialog 元素，且 `isGoneOrHidden` 先於 `checkForError` 判定。舊碼要求「全頁 dialog 歸零」才成功，天然擋住限流視窗；新碼在同一批 mutation「確認框卸載＋限流框掛上」時直接回 success，永遠到不了 cooldown。後果：限流下寫入 BlockDB 與 24h 環、`consecutiveRateLimits` 被歸零、三振斷路器推遲、批次在限流下硬打整條佇列。修法：`check()` 內先跑 `checkForError()` 再判移除。

### 2. 複驗 fail-open 殘留缺口（PLAUSIBLE）→ 表 #34(b)

`worker.js:3041`。`recheckDialogs.length === 0 ||` 把「頁上沒 dialog」單獨當成功證據，且 3 秒 safeSleep 後未再查限流。確認點按靜默失效＋SPA re-render 卸載 dialog 時，未封鎖帳號回 success、進 BlockDB、佔額度、不進失敗名單、零訊號。ADR 0026 有明文取捨，此為殘留缺口非推翻決策。硬化：safeSleep 後補 `checkForError`，或要求 `confirmDialog.isConnected === false`。

### 3. reverify 護欄殘留鍵無 TTL（PLAUSIBLE）→ 表 #35(a)

`core.js:1311`。`BATCH_VERIFY`／`BATCH_VERIFY_INDEX` 純存在性檢查。worker 分頁 crash 後殘留 → 每次點「重新驗證」被「請先停止」toast 擋下，而停止鈕只送 BG_CMD、清不掉這兩鍵。唯一逃生路徑（開新封鎖任務吃掉孤兒佇列）會以 `WORKER_MODE='block'` 執行、記帳錯誤。修法：比對 BG_STATUS 過期即自動清除，或 toast 提供清除動作。

### 4. observer 無節流強制 layout＋只聽 childList（CONFIRMED）→ 表 #36

`utils.js:264`。每批 mutation 同步跑 `getBoundingClientRect`＋`checkForError`（querySelectorAll＋innerText），最長 15 秒；同分頁模式（行動版／彈窗被擋）明顯卡頓。attribute/style 關閉的 dialog 偵測不到。失敗路徑成本從 5 秒（可 turbo 縮放）漲為固定 15+3 秒，失敗密集批次每帳號多 13 秒。修法：rAF 或 100ms 節流、監聽 attributes、評估超時降回 5-6 秒。

### 5. 導頁重試 TTL 制無限重載（PLAUSIBLE）→ 表 #35(b)

`worker.js:1556`。30 秒 TTL 過期即清標記重來。背景 intensive throttling 把重載週期拉超過 30 秒＋持續被導走的帳號（已刪除／改名，正是失敗名單主要族群）→ 同一筆無限重載，索引不前進，只有手動停止能斷。修法：過期保留單調 attempt 計數，或第二次失敗無條件推進索引。

### 6. failure_reverify 縱深護欄缺口（PLAUSIBLE）→ 表 #35(c)

`worker.js:1876`。runStep 通用封鎖路徑不檢查 WORKER_MODE；`resumeBatchVerify` 因 store 不一致回 false（其中 idx>=len 分支不清 WORKER_MODE）時，唯讀的重新驗證落入真實封鎖／檢舉。正常操作序列觸發不了，屬防禦深度。修法：通用路徑前 `workerMode === FAILURE_REVERIFY_MODE` 即收尾。

### 7. 批次驗證重試三件組複本（CONFIRMED）→ 表 #37(a)

`worker.js:240`。與 profile-root 三件組（`worker.js:195-238`）逐行同構，卻裸用 sessionStorage、key `hege_batch_verify_route_retry` 未進 CONFIG.KEYS。Storage 層未來行為（ADR 0023 路線）只會套到一份；KEYS 掃描／遷移會漏掉此鍵。修法：參數化單一 helper。

### 8. worker 啟動序列第三份複本已分歧（CONFIRMED）→ 表 #37(b)

`core.js:1325`。`saveReturnUrl`／`launchSameTab` 與 `runSameTabWorker`（~5578）、`runSameTabReportWorker`（~5609）三份；彈窗 fallback 形狀第四份。已分歧：只有新版清 `hege_popup` 參數、只有新版硬寫 `'/?hege_bg=true'`。修法：抽 `Core.launchWorker(mode)`。

## 駁回（3 條，日後不必重查）

1. **零尺寸矩形誤判成功**：repo 三處既有程式（`three-no-watch.js:2283`、`3596`、`report-flow.js:691`）已依賴「打開的 dialog 矩形非零」，慣例成立。
2. **子字串路徑比對寫錯帳號**：`verifyBlock` 內部有錨定身分閘門，錯頁必回 false。順手建議（已記入表 #7）：`worker.js:1534` 改用同檔 1653 的錨定 regex。
3. **BG_CMD 清除造成雙 worker**：`window.open` 用具名目標 `'HegeBlockWorker'` 會重用視窗；該模式為全檔既有慣例，新碼護欄反而最嚴。

## 次要備註（未入表主文，已散記）

- `observer: true` 診斷欄位不在白名單，被 sanitiser 靜默丟棄（記入 #36）。
- `CONFIG.BLOCK_RING_RETENTION_MS` 鏡像無生產讀者，僅測試斷言（記入 #37(c)）。
- ADR 0026/0027 的「相關」欄漏列 `src/config.js`（單向連結；下次動這兩份 ADR 時補）。
