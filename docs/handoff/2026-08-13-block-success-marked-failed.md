# 調查：封鎖實際成功卻被列入失敗名單（「封鎖 · 動作失敗」）

- 日期：2026-08-13
- 性質：唯讀調查，未動 src/
- 來源：D1 `threadsblocker_bug_admin_v2`.`bug_reports` id 53（v2.8.2，2026-08-07）、id 54（v2.8.3，2026-08-13）
- 相關程式：`src/worker.js` autoBlock 確認階段（約 2811–2935 行）、失敗入列（1925–1941 行）、`src/utils.js` pollUntil（178–192 行）、`src/config.js` SPEED_PROFILES / UNBLOCK_TEXTS

## 一句話結論

封鎖確認鈕確實被點下、Threads 端也完成封鎖，但 worker 在點擊後只給約 5 秒（turbo 模式 2 秒）等「所有 dialog 從 DOM 消失」，等不到就用頁面文字找「解除封鎖」當備援；兩關都沒過就回傳 `failed`，直接進失敗名單，之後沒有任何補救對帳。判定發生在 Threads 實際完成封鎖之前，所以「已成功卻列失敗」。

## 診斷紀錄裡的鐵證（metadata.runtimeDiagnostics）

兩筆回報的 blocking entries 都呈現同一模式，同一個 operationId 內：

1. `stage: confirm, success: true`（priority 0）——對應 `worker.js:2873`：**找到確認鈕**時先記一筆成功。
2. 約 7 秒後 `stage: confirm, success: false, reason: failed`（priority 4）——對應 `worker.js:2934`：dialog 未關、文字備援也沒過，記失敗。
3. `stage: dequeue, failure: true` 後換下一個帳號。

id 54（一次批量，20+ 帳號全中）的五個操作全是這個序列。7 秒差 = 200ms settle + 點擊 + 5000ms dialog-close poll + checkForError + likelyBlocked 檢查，與程式碼逐行吻合。

id 54 另有一個成功案例（operationId `blocking-10ad503c61ac`）：confirm success 帶 `repeatCount: 2`（找到鈕＋dialog 關閉各記一次成功），證明同一份程式偶爾等得到 dialog 關閉——差別只在等待期間 Threads 有沒有來得及回應。

### 環境惡化的旁證（id 54）

同一批次內各操作的等待時間持續拉長：

- 開選單等待：3.0s → 26.0s → 30.0s → 36.0s
- 點「封鎖」後等確認 dialog 出現：2.0s → 7.0s → 18.9s → 29.0s（此 poll 名目上限也是 5 秒，實際跑到 29 秒）

兩個事實指向：(a) Threads 在連續封鎖下回應越來越慢（rate-limit backpressure）；(b) poll 的實際節奏被嚴重拉長——桌機封鎖策略是 `background_tab`（`worker.js:598`），背景分頁的 setTimeout 被 Chrome 節流（最少 1 秒，掛久了進 intensive throttling），`pollUntil` 用牆鐘 deadline（`utils.js:186`），5 秒預算內可能只輪詢到 3–5 次甚至更少。

## 判定流程（現行 2.8.x，與 2.4.0 逐行比對過）

`git show 7c7b4b8:src/worker.js`（v2.4.0）的 dialog-close 判定與現行**一字不差**：`document.querySelectorAll('div[role="dialog"]').length === 0` 才算成功、5000ms/150ms poll、備援用 `isUnblockText(document.body.innerText)`。所以這不是近期 rewrite 的 selector 回歸，是既有設計在 2.8 的環境（背景分頁＋大批量）下曝險放大。

`failed` 回傳後在 `worker.js:1938` 走 `Core.recordFailure('block', targetUser, 'action_failed')`，UI 對照表在 `ui.js:1134` 顯示「動作失敗」。成功路徑有 batch verify 抽驗，**失敗路徑沒有任何事後複驗**。

## 根因假設清單（依信心排序）

### H1（主因，證據強）：判定比 Threads 完成封鎖更早，5 秒預算等不到 dialog 關閉

點擊確認鈕後封鎖請求已送出，Threads 端最終成功；但批量封鎖時回應超過 5 秒（dialog 留在畫面上轉圈），poll 超時。備援檢查當下頁面還蓋著 dialog、個人頁尚未重繪出「解除封鎖」，`likelyBlocked` 為 false → 回傳 `failed`。幾秒後 Threads 完成封鎖，但名單已定案。
證據：先成功後失敗的雙 confirm 記錄、7 秒固定間隔、同批次等待時間遞增、偶發成功案例 dialog 確實有關閉。

### H2（放大器，證據強）：背景分頁計時器節流讓 poll 名目 5 秒實際只檢查個位數次

桌機策略 `background_tab`，Chrome 對背景分頁 setTimeout 節流；`pollUntil` 是牆鐘 deadline 不是次數制，節流下 5 秒窗只跑少數幾次檢查，錯過 dialog 關閉的時點機率大增。id 54 中 poll 實跑 29 秒（名目 5 秒）就是節流證據。

### H3（放大器，待驗證）：turbo 模式把 dialog-close 預算縮到 2 秒

`pollUntil` 預設 `scaleBySpeed=true`，turbo multiplier 0.4 → `max(2000, 5000*0.4)` = 2000ms。回報者若用加速模式，等待窗更小。metadata 沒帶 speed mode，無法確認回報者設定；修法時建議這個 poll 標成不縮放。

### H4（次要，證據弱）：dialog-close 條件要求「零個 dialog」過嚴

只要頁面存在任何其他 `div[role="dialog"]`（Threads 新增的常駐 dialog、翻譯提示、cookie 條等），永遠等不到 0。但 id 54 有操作最終偵測到關閉成功，表示回報者環境當下沒有常駐 dialog；此假設不足以解釋主案，列入修法時一併防禦（改成追蹤「當初那個確認 dialog」是否消失）。

### 已排除

- 已封鎖帳號重跑造成誤判：所有 entries `alreadyBlocked: false`，且失敗後帳號留在失敗名單並未自動重試。
- 舊版 selector 回歸（first vs last dialog 之類）：2.4.0 與現行判定逐行相同。
- 找不到選單/找不到確認鈕：兩筆回報全部走到 confirm 成功（鈕有找到、有點擊）。

## 修法方向建議（本次未實作）

1. 失敗定案前做「封鎖狀態複驗」：回 `failed` 前（或 dequeue 前）重新查頁面/選單是否已呈現「解除封鎖」，甚至延遲數秒再驗一次。等同把成功路徑的 verify 機制對稱地用在失敗路徑。
2. dialog-close 判定改追蹤特定 dialog 元素消失，而非全頁 dialog 歸零；預算加大並標 `scaleBySpeed: false`。
3. 針對背景分頁節流：poll 改次數制或用 MutationObserver 取代 setTimeout 輪詢。
4. 失敗名單提供「重新驗證」動作：批次檢查失敗名單中的帳號實際封鎖狀態，已封鎖者自動移除。這對已受影響的使用者是最直接的止血。

## 驗證指令

```bash
# 撈回報原文與診斷
cd cf_bug_admin && wrangler d1 execute threadsblocker_bug_admin_v2 --remote --json \
  --command "SELECT id, version, message FROM bug_reports WHERE id IN (53,54)"

# 舊版對照
git show 7c7b4b8:src/worker.js | sed -n '1206,1250p'
```
