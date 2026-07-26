# more-locator-unify：個人頁 action anchor 的 More 偵測改用共用 locator

## 錨點
- base commit: `a8dfaae`（2.8.1-beta2，使用者已實機 verify 通過匯入修正）
- 工作樹狀態: clean
- 檔案擁有權: 本任務期間 `src/core.js`、`src/features/report-flow.js`、`tests/` 歸 luna
- 回報對象 surface: sol = `surface:6`，Orchestrator（Claude）= `surface:5`

## 先讀
- `/Volumes/Working 2T/CODE/docs/TRIO_WORKFLOW.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/AGENTS.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/docs/BLOCKING_ARCHITECTURE.md`（必讀，改 `core.js` 前）
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/docs/THREADS_DOM_GOTCHAS.md`
- `/Volumes/Working 2T/CODE/products/ThreadsBlocker/src/more-locator.js`（canonical 全文）

## 工作方式（本專案 2.8 起的新規則）

**一個 bug 一個 commit，使用者實機 verify 通過才做下一個。** 本任務只做 SSOT inventory 編號 8，不得順手處理其他項目。

## 已完成，不要重做

SSOT inventory（`docs/handoff/ssot-inventory.done.md`）已完成清點。Orchestrator 已另外追出本項的**實際影響路徑**，以下為已驗證事實，直接採用：

1. 封鎖流程要點 More，走的是 `src/worker.js:1590-1598` 的 `Worker.findMoreButton`，它已經呼叫 canonical `MoreLocator.find(profileRoot, { mode: 'profile', trustedRoot: true })`。**這一段沒有問題，不要動。**
2. 但 `findMoreButton` 的第一步是 `Core.findProfileRoot(username)`（`src/core.js:1113-1129`）。`findProfileRoot` 在 `src/core.js:1124` 有一道 filter：**必須同時找到 `usernameEl` 與 `actionAnchor`，否則整個 root 被淘汰、回傳 null。**
3. `actionAnchor` 來自 `Core.findProfileActionAnchor`（`src/core.js:1082-1111`），那是一份**自己重寫的** More／Instagram／bell 偵測，與 canonical `MoreLocator` 無關。
4. 因此：`findProfileActionAnchor` 找不到東西 → `findProfileRoot` 回 null → `findMoreButton` 永遠 poll 不到 → **封鎖直接失敗**。canonical locator 再準也沒機會被呼叫。

**這就是本項要修的真正影響路徑。** 不是「點錯元素」，是「找不到就整個放棄」。

### 兩份偵測的能力差異（已核對）

`findProfileActionAnchor` 的 More 判定只有：SVG 形狀（1 個 circle + ≥3 個 path）或多語系 label regex，加上 `rect.top >= 120 && rect.top < min(innerHeight, 460)`、`width/height >= 24` 的幾何窗，以及 search／tags href 排除。

canonical `MoreLocator`（`src/more-locator.js:3-175`）另外有：visibility 檢查、route safety、dialog／menu／link exclusion、profile／post／row scope、候選 scoring、`explicitAriaLabel` 判定。

也就是說本地那份是**能力較弱的複製品**，卻擋在封鎖路徑的最前面。

## 任務

1. `Core.findProfileActionAnchor`（`src/core.js:1082-1111`）**只把「找 More」那一支委派給 `MoreLocator`**，Instagram 與 bell 兩種 anchor 類型維持現行判定與排序優先序（Instagram → bell → More）。
   - 不得整段換掉。這個函式同時服務 `findProfileRoot`（封鎖路徑，`src/core.js:1122`）與 profile header checkbox 的插入位置（`src/core.js:1148`），兩邊都要維持既有行為。
   - 委派時使用 `mode: 'profile'`。是否傳 `trustedRoot` 要依 `findProfileActionAnchor` 的 `root` 來源判斷並在 `.done.md` 說明理由。
2. 確認委派後 More 候選的幾何窗變化。canonical 有自己的 visibility／scope 規則，本地原本另有 `rect.top` 區間限制。**若移除本地幾何窗會讓 checkbox 插到錯的位置，就把幾何窗保留為 anchor 排序條件，而不是 More 偵測條件**，並在 `.done.md` 說明取捨。
3. `src/features/report-flow.js:466-506` 的 `getMoreButtonText` 仍有呼叫端（`src/features/report-flow.js:498-499`）。**不得刪除**。改為與 canonical 一致的判定，或明確說明為何必須保留獨立實作，寫進 `.done.md`。
4. 新增回歸測試，至少涵蓋：
   - a. 個人頁 header 只有「More」而沒有 Instagram／bell 時，`findProfileActionAnchor` 仍能找到 anchor，`findProfileRoot` 不回 null。**這是封鎖失敗的直接回歸測試。**
   - b. unsafe route（search／tags ancestor）仍 fail closed，不得因為改用 canonical 而放寬。
   - c. Instagram 與 bell anchor 的既有優先序不變。
   - 測試要能在修改前的 `core.js` 上失敗、修改後通過。luna 要自己做這個反向驗證並附結果。

## 不可改動的約束

- 不得動 `src/worker.js`（`findMoreButton` 已經正確）。
- 不得動 `src/more-locator.js` 的既有判定，除非要新增 options；若新增 options 必須向後相容，且要說明 worker／report 既有呼叫不受影響。
- 不得處理 SSOT inventory 其他編號。
- 不得改 `dist/`、版本號、CHANGELOG、manifest。
- 不得 commit、push、deploy、build。
- iOS 導航不得改成會觸發 Universal Links 的 `window.location.href` 路徑。
- DOM selector 一律以實際程式或 `git show` 舊版驗證，不得從名字推測（CLAUDE.md 明列的重寫鐵律）。

## 邊界

- 只動：`src/core.js`、`src/features/report-flow.js`、`tests/`
- 不准：commit、push、deploy、build、改 `dist/`、動 `src/worker.js`、碰 inventory 其餘項目
- secrets 只引用路徑，不得輸出值或寫進 repo

## 回報

完成或受阻後寫 `docs/handoff/more-locator-unify.done.md`，接著通知 sol：

```bash
cmux send --surface surface:6 "more-locator-unify 完成／受阻，結果見 docs/handoff/more-locator-unify.done.md"
cmux send-key --surface surface:6 Enter
```

sol 自行實跑驗證後通知 Claude：

```bash
cmux send --surface surface:5 "more-locator-unify 已彙整，結果見 docs/handoff/more-locator-unify.done.md"
cmux send-key --surface surface:5 Enter
```

`.done.md` 格式：

```
狀態：
修改檔案與 diff --stat：
委派範圍與保留範圍（含 trustedRoot 判斷理由、幾何窗取捨）：
report-flow getMoreButtonText 的處理與理由：
新增測試與反向驗證結果（修改前失敗／修改後通過）：
驗證命令與結果（pass / fail / skip）：
未驗證項／假設：
```
