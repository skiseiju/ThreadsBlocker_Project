# ThreadsBlocker：beta77 → beta82 交接

**交接時間：**2026-07-22（Asia/Taipei）
**專案目錄：**`/Volumes/Working 2T/CODE/products/ThreadsBlocker`
**接續自：**`docs/HANDOFF_2.7.4_BETA73_TO_BETA76.md`
**基準 commit：**`f1893d9`（工作樹有大量未 commit 改動，見第 1 節）

延續前一份 handoff 的原則：**只記錄有證據的事實。沒有實機驗證的一律標「未驗證」，不得改寫成 fixed。**

---

## 1. 先看這裡：所有改動都還沒 commit

```
版本：src/config.js = 2.7.4-beta82
測試：202 pass / 0 fail（node --test "tests/*.test.mjs"）
build：SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump 通過
artifact：dist/threads_blocker_chrome_v2.7.4.82.zip
最後 commit：f1893d9（beta76 時期）
```

**beta77 到 beta82 的全部改動都在工作樹裡，一次都沒 commit**（使用者未授權）。未 commit 清單：

```
 M src/config.js  src/core.js  src/features/three-no-watch.js  src/main.js  src/ui.js
 M tests/beta54-ui-route.test.mjs  tests/beta55-message-route-diagnostics.test.mjs
 M tests/beta58-clean-list.test.mjs  tests/beta59-clean-list-live-fix.test.mjs
?? tests/beta77~beta82 六個新測試檔
```

派工規格全在 `.ai/codex_task_beta77~82*.md`（`.ai/` 已在 gitignore），要理解每一版做了什麼、為什麼，讀那些規格最快。

---

## 2. 這輪最重要的發現：線上使用者跟 beta 版差了整整一個世代

**使用者實機回報存在 Cloudflare D1，不是 Google Sheet**（repo 裡的 `gas_bug_reporter/` 尚未接上）。查法：

```bash
cd cf_bug_admin
wrangler d1 execute threadsblocker_bug_admin_v2 --remote --json --command "SELECT ..."
```
table：`bug_reports`。**查詢時只撈 `created_at`/`level`/`error_code`/`message`/`status`/`version`，不要撈 `hwid`/`ip_hash`/`user_agent`/`stack`/`metadata`（PII）。**

### 撈出來的事實（2026-07-22）

- **線上使用者跑的是 2.7.1 正式版**，2.7.4 一直是 beta，從未發布
- 2.7.1 有 32 筆回報（PENDING 12 / ACK 16 / IGNORED 4），最新 2026-07-20
- **壓倒性第一名：封鎖時誤點「興趣標籤／主題 tag」→ 跳 `/search?...serp_type=tags` → 卡死跳不過該帳號。至少 14 筆，6/23 持續到 7/15**

### 但這個 bug 在 2.7.4 的 code 裡早就修好了

雙層防護，讀 code 確認：

1. **事前不誤點**（`src/more-locator.js`）：`isMoreShape` 只認三點選單 svg、`isLinkCandidate` 排除 `<a>`/`[role=link]`（興趣標籤就是連結）、`isUnsafeRoute` 認得 `search_tags`/`tags` 路由
2. **事後自救**（`src/worker.js:1864` 起）：點「更多」前記住 `routeBeforeMore`，點完比對 `MoreLocator.routeMatches(...)`，路由變了就回 `navigation_mismatch` →「導航不符，安全跳過」→ 移除該帳號繼續下一個（`worker.js:1460` 那條 `['menu_not_found','navigation_mismatch','private_manual_required']` 分支會 shift 並 runStep）

**⚠️ 給接手者的判讀規則：D1 的回報版本欄位一定要看。線上回報反映的是 2.7.1，不是當前 code 狀態。本輪我曾因回報數量多就宣稱「這是最大的活躍 bug、該優先修」，實際上它在 beta 早已修好——使用者兩次要求「看 code」才糾正過來。**

### 因此真正的結論

**這輪（以及前幾輪）在 beta 修好的所有東西，線上使用者一個都沒拿到。** 對他們而言等於全都沒修。

---

## 3. beta77 → beta82 逐版摘要

| 版本 | 性質 | 內容 |
|---|---|---|
| beta77 | 純診斷 | 清理名單六條 toast 路徑各打 `category` 標籤；`buildCleanListOutcomeFields` / `measureCleanListContext`；回滾前先量勾選框狀態 |
| beta78 | 純診斷 | 三無七條靜默 `return false` 全部留痕（寫 `THREE_NO_SCAN_DEBUG_LOG`，跨視窗保存）；`anchorPanel` 記錄分支/rect/route/掃描數 |
| beta79 | **修復** | ①三無 stop grace（結果證明沒觸發，見第 5 節）②訊息頁一律隱藏浮動面板 |
| beta80 | 純診斷 | scan debug log 的白名單投影接進匯出；`scan_in_flight` 閘門記 `category`/`durationMs` |
| beta81 | 純診斷 | 四個 `scan_in_flight` 出口全部打 `failureType` 標記 |
| beta82 | **修復** | 開新掃描前清掉 terminal 舊 scanState（`clearTerminalScanBeforeStart`） |

### 使用者實機驗收通過

| 項目 | 版本 | 狀態 |
|---|---|---|
| 訊息頁一律隱藏浮動視窗 | beta79 | ✅ pass |
| 三無停止後可立即重啟 | beta82 | ✅ pass |
| 粉絲收集、清理名單報 0 人、作者勾選框、浮動視窗錨點 | — | ✅ 使用者確認 pass |
| 私人帳號卡佇列 | — | ✅ code 確認（見下） |

**私人帳號卡佇列（舊 handoff 分群 B）已解**：`worker.js:1460` 把 `private_manual_required`/`menu_not_found`/`navigation_mismatch` 歸為 per-user outcome，**不進任何 breaker，還會把 `consecutiveRateLimits` 歸零**，直接 shift 該帳號繼續下一個。三種計數各自獨立：驗證失敗 5 次、速率限制 3 次、私人帳號 0 次（不計）。且 breaker 觸發後是 cooldown 或「記錄失敗並繼續」，不是永久卡死。

---

## 4. 診斷本身會壞，而且是靜默的（本輪新增的重要教訓）

本輪修好**四個**會讓診斷靜默失效的問題。這類 bug 不會報錯，只會讓你辛苦跑一趟實機卻拿回空證據：

1. **stage 不在 allowlist → 被正規化成 `unknown`**：`reposition`/`clamp`/`hide`/`show` 都不在 `BETA_DIAGNOSTIC_STAGES`，全被吃掉
2. **正規化後簽章相同 → 被 1 秒去重合併**：四筆進去只剩三筆出來
3. **ring buffer 被灌爆**：`anchorPanel()` 每 1500ms 跑一次，去重視窗只有 1000ms，永遠不會去重；`reposition` priority 0 最先被淘汰，約 5 分鐘就把 200 筆 buffer 灌滿，把 clean_list 證據全擠掉 → beta78 加了簽章節流 + 30 筆硬上限（實測：靜態頁 200 次 tick 只記 1 筆）
4. **匯出根本不含 scan debug log**：`Core.buildThreeNoDebugExport()`（`core.js:4041`）第二行就 `return RuntimeDiagnostics.export();`，底下讀 scan log 的程式碼是刻意留下的不可達死碼（隱私考量）。beta78 把三無證據全寫進 `appendScanDebugLog`——**一個匯出時被排除的管道**，七條診斷一條都拿不出來 → beta80 加白名單投影 `projectScanDebugLogForExport` 才接出來

**下次埋診斷的檢查清單：**
- [ ] stage / feature / reason / failureType 是否都在對應 allowlist？（不在會被靜默丟棄）
- [ ] 欄位名是否在 `_safeFields` 的 countKeys/boolKeys？
- [ ] 這個記錄點的呼叫頻率 vs 1000ms 去重視窗——會不會灌爆 200 筆 buffer？
- [ ] **這個管道匯得出來嗎？**（`RuntimeDiagnostics` vs `appendScanDebugLog` 走的路不同）
- [ ] 寫完先在 node 裡實跑一次 record → get，確認欄位真的存得下來

---

## 5. 三無「停止後無法重啟」：連續瞄錯三次的完整記錄

這是本輪成本最高的一條，值得完整留下。

### 症狀
停止掃描後再按開始 → 「三無掃描已在執行中」，21ms 內就被擋。

### 三次瞄錯

| 輪次 | 我猜的根因 | 結果 |
|---|---|---|
| beta79 | `'stopping'` 在 `runningStatuses` 內，加 10 秒寬限期 | **沒觸發**。閘門要求 `status==='stopping'` 且停止指令還在，但 worker 觀察到停止後會刪掉指令（`three-no-watch.js:134`），兩個條件都不成立 |
| beta80 | 埋診斷在 `launch()` 內的狀態閘門 | 那筆診斷**完全沒出現**，證明擋住的地方在 `launch()` 之前就返回了 |
| beta81 前 | 賭是 `navigator.locks` 的 launcher 鎖 | 也錯 |

### beta81 的正解做法
**不再挑，把四個 `scan_in_flight` 出口全部打上 `failureType` 標記**，讓證據自己指認。實機一跑就得到 `gate_claim_lost`。

### 真正的根因（純 code 死結，可完全複現）

1. 停止後 worker 正常關閉（`worker_close_called` 有出現在 log，**推翻「worker 視窗不消失」這個從舊 handoff 帶下來的假設**），但 scanState 停在 `{ scanId: 舊, status: 'stopped' }`
2. 重按 → `clearStaleScanIfNeeded()` **第一行** `if (!isRunningStatus(state.status)) return false` —— `'stopped'` 不是 running，**直接放棄，舊 state 沒被清**
3. `setScanState({ scanId: 新, status: 'starting' })` → **第一道閘門** `requestedScanId !== previousScanId` → `return false`
4. `claimedState` 讀回舊 scanId → `ownsClaim=false` → `gate_claim_lost`

### 修法（beta82）
新增 `clearTerminalScanBeforeStart()`，在 `launch()` 產生新 scanId 前清掉 terminal 的 scanState/lock/command。
**沒有動 `setScanState` 的終態保護（那是防 race，故意的），也沒有動 `clearStaleScanIfNeeded`（那管 running 殘留）。**
`THREE_NO_SCAN_RESULTS`（報告）是另一個 key，不受影響。

### 教訓
**三次瞄錯的共同原因：每次只讀目標函式本身，沒有往外看它被誰包住、往後看誰改動了它依賴的狀態。** 這個死結要同時看三個地方才成立——`launch()` 呼叫誰、`clearStaleScanIfNeeded` 為什麼放棄、`setScanState` 為什麼拒絕——任何單獨一個都看不出來。

**當你不確定是哪個出口時，把所有出口都打上可辨識標記，比猜任何一個都快。**

---

## 6. 未解 / 進行中

### A. 打勾框跟回覆箭頭重疊（決策中，尚未動手）

**使用者回報（2026-07-20，2.7.1，最新一筆）**：「如果其他使用者在訊息裡傳貼文，留友封的打勾框框剛好會跟回覆箭頭重疊在一起」。

**已查到的 code 事實**：
- `injectDialogCheckboxes()`（`core.js:2690`）每 1.5 秒 scanner pass + 每次 scroll 都跑
- **完全沒有「訊息頁不要注入」的守衛**，只靠 `getSupportedDialogTitle(ctx)` 為 null 就 return 自我把關
- beta79 修訊息頁時**只擋了浮動面板 `#hege-panel`，沒擋 checkbox 注入**
- checkbox 定位策略：放在帳號名稱連結的父層旁

**sol 的分析（2026-07-22）**：反對「訊息路由一刀切擋掉」，理由是會誤傷「使用者在訊息頁點開貼文 → 開按讚名單彈窗 → 想用打勾框收集」（低頻但真實）。sol 指出更底層的根因：`getSupportedDialogTitle()` 對任何有可見標題的容器都放行，`injectDialogCheckboxes()` 又掃整個容器的 `/@` 連結，**訊息串裡的 inline 貼文作者被誤當成名單帳號**。sol 建議守衛要求：可見 `[role="dialog"]` + 明確的名單標題/tab + 帳號名單列證據，否則不注入並清掉既有框。

**三個選項（等使用者拍板）**：
- **A. 最小守衛**：注入前要求 `ctx` 是真正可見的 `[role="dialog"]`。inline 貼文不是 dialog → 排除；訊息頁的名單彈窗是 dialog → 保留不誤傷。改動小、不重構
- **B. 先取證**：出診斷版，使用者下次遇到匯出 DOM 形狀再修（嚴格照第 8 節鐵律應走這條）
- **C. sol 完整版**：收緊整個 dialog 分類。修根因但動核心注入邏輯，高風險區

**未驗證**：以上「inline 貼文作者被誤注入」是讀 code + sol 分析的推論，**沒有 7/20 那筆的實際 DOM 證據**。

### B. 沒有確切證據的線上回報項目

| 項目 | 回報日 | 狀態 |
|---|---|---|
| 按讚名單混入「引用」的人 | 7/04 | `dialog-collector.js` 有辨識/排除 quotes/引用的邏輯（`otherSelected`/`otherHeading`），但該情境未單獨實測 |
| 三無掃描只掃一下就停 / 沒跳背景視窗 | 7/13、7/01、6/26 | 與 beta82 修的「停止後重啟」是不同症狀，未單獨驗證 |
| 進度條卡在「準備中／計算中／等待指令」 | 6/27 | 很可能是 tag 誤點的連帶症狀（封鎖根本沒跑起來），tag 修了應連帶好，**無實證** |

### C. 觀察到一次無法歸因的偶發測試失敗

全套測試曾出現一次 192 pass / **1 fail**，但**沒抓到失敗的測試名稱**。之後 5 次全套 + 8 次單檔都沒重現。Playwright 那批要開真 Chromium，是最可能的來源，但**沒有證據**。下次再出現時務必記下名稱。

Codex 另外回報（未動手）：`tests/beta55` 的隱私斷言用 `/alice|123|Messages/i` 比對整份診斷 JSON，而 `operationId` 是隨機字串，偶爾會剛好含 `123` 而誤紅。這是假測試的另一種型態——不是驗行為，是驗字串碰巧不出現。

### D. 舊 handoff 尚未處理的

`docs/HANDOFF_CLAUDE_BETA47_TO_BETA63.md` 第 4 節的分群 **G（狀態文字不白話、內部錯誤碼外露）** 仍未做。純文案，不需實機測試。

---

## 7. 正式版前必須處理（沿用，未變）

- **`src/config.js` 的 `ENABLE_BETA_DIAGNOSTICS` 目前是 `true`**，正式版必須關閉，beta-only 診斷／匯出 UI 也要 disable
- 診斷輸出不得包含帳號、連結、文字、DOM、UA、IP、hwid、signature 或 raw metadata
- **⚠️ 新增**：三無的 `THREE_NO_SCAN_DEBUG_LOG` 內部本來就會存 username 與 url（`sanitizeDebugValue` 不剝除）。beta80 的 `projectScanDebugLogForExport` 只在**匯出時**投影成六個安全欄位（`seq`/`ts`/`scanElapsedMs`/`index`/`status`/`step`），**localStorage 裡的原始 log 仍含 PII**。發正式版前要確認這條是否可接受
- **最重要**：2.7.4 累積了大量修復（tag 誤點、三無停止、私人帳號、浮動視窗、清理名單），線上使用者還在用 2.7.1 受同樣的苦。**發布優先度高於繼續修新 bug**

---

## 8. 工作方式（使用者於 2026-07-22 指定，已變更）

**新分工，覆蓋前一份 handoff 的「Opus 只討論、實作派 Haiku」：**

| 角色 | 誰 | 職責 |
|---|---|---|
| 對使用者 | Claude | **唯一任務：跟使用者討論、用白話文回報現況** |
| 決策參謀 | `gpt-5.6-sol` | Claude 做決定前先跟它討論 |
| 實作 | `gpt-5.6-luna` | 寫 code |

- 呼叫法：`codex exec --skip-git-repo-check -m gpt-5.6-sol "..."`（討論）；實作走 `run_codex.sh --model gpt-5.6-luna`
- 使用者 config 預設已是 `gpt-5.6-luna`。另有 `gpt-5.6-terra` 未指定用途
- **Claude 仍須自己實跑驗收**：跑測試、核 `git diff` 逐條對規格，不採信 codex 的回報數字（codex 沙箱跑不動 Playwright，常回報一批假 fail；歷史上也有謊報完成的紀錄）
- 使用者**人工實機測試**，AI 不控制瀏覽器
- 任何 `src/` runtime 改動要遞增 `src/config.js` beta 版號；docs／tests-only 不升版
- 不得 commit／push／deploy／碰 wrangler（唯讀 D1 查詢除外），除非使用者明說

### 派工實務（本輪驗證有效）

寫死規格檔放 `.ai/codex_task_*.md`，內容必須包含：
- 鐵律（不准做什麼，逐條列）
- 根因說明（讓它知道為什麼這樣改，避免它自作聰明）
- 逐行改法 + 明確的「不要動哪些行」
- 測試要求：**必須 import 產品模組**、禁止 grep 原始碼、禁止在測試檔內重寫產品邏輯
- **必做紅→綠證據**：還原修正證明測試會紅
- 「做不到就誠實停下回報，省略不報比做不到更嚴重」

**本輪 codex 表現**：誠實度良好——主動回報沙箱跑不動 Playwright（不謊稱通過）、主動指出規格外必須補的洞（`clearStaleScanIfNeeded` 那個守衛，不補的話 beta79 的修法完全失效）、主動回報 allowlist 缺漏。**但仍須逐條核 diff**。

---

## 9. 除錯紀律（沿用前一份 + 本輪新增）

前一份 handoff 第 8 節的鐵律**全部仍然有效**：涉及 DOM 結構的判斷，先出純診斷版取證再動手；fixture 會讓 bug 隱形；不要預測「A 修好了 B 應該也會跟著好」。

**本輪新增三條：**

1. **診斷本身會壞，而且是靜默的。** 埋完診斷要先驗證「它真的存得下來、匯得出去」，再交給使用者跑實機。否則浪費的是使用者的時間（見第 4 節）。

2. **不確定是哪個出口時，把所有出口都標記，不要挑一個猜。** beta79/80 各猜一個都錯，beta81 四個全標一次命中（見第 5 節）。

3. **線上回報的版本欄位一定要看。** 回報反映的是使用者手上那版，不是當前 code。用回報數量推斷「這個 bug 還開著」會得到完全相反的結論（見第 2 節）。**先讀 code 再下結論。**

---

## 10. 下一步（依使用者未指定順序）

1. **打勾框重疊**（第 6 節 A）——三個選項等使用者拍板
2. **發布 2.7.4**——這是目前價值最高的動作。線上使用者受的苦有一大半已經在 beta 修好了。需先處理第 7 節的正式版清單
3. **commit 現有改動**——beta77~82 全部未 commit，風險集中
4. 狀態文字白話化（分群 G）
5. 第 6 節 B 的三項無確切證據項目，可在發布後依新回報再判斷

**開工前務必先讀第 9 節的除錯紀律，以及第 2 節關於「線上回報 ≠ 當前 code」的判讀規則。**
