# ThreadsBlocker：Beta 47 → Beta 64 交接給 Claude

**交接目的：**記錄 Beta 47–63 的問題與證據，並交接 Beta 64 已完成的最小修正；接著由使用者人工驗收，若仍 FAIL 再依新證據 debug。這份文件只記錄已知證據；沒有證據的版本差異一律標成缺口，不猜。

**專案目錄：**`/Volumes/Working 2T/CODE/products/ThreadsBlocker`

**交接時間：**2026-07-21（Asia/Taipei）

## 1. 先看結論

1. Beta 63 實機 FAIL：清理名單切到按讚頁成功，但 140 人只抓到 1 人。
2. 已定位到最小根因：`src/core.js` 的清理名單迴圈，在尚未形成可捲動範圍時把 `atBottom` 當成真正結尾，過早 `break`。
3. v2.7.0 沒有這個早退；它用連續無新增的 bounded loop（`unchangedCount >= 4`）繼續等待／捲動。
4. Beta 64 已完成一個最小修正：移除／停用這個過早 `beforeAtBottom` break，沿用既有無新增停止機制。不要順便重寫 selector、root 選擇、collector、reservoir 或新增抽象層。
5. 使用者只做人工 Chrome 驗收。不要控制瀏覽器，不要把單元測試／build success 當成 live fixed。

## 2. 工作規則（不可違反）

- 用台灣繁體中文。先結論，短句，必要時編號。
- **Keep simple first：**最短、直接、可驗證的修正。不要自行增加 selector、門檻、防護、抽象或額外流程。
- Claude（或被使用者明確指派的實作者）寫 code。不要由使用者手改。
- 使用者人工測試。Edge 外掛仍以 Chrome 路徑處理；不要自行控制 Chrome／Edge。
- 保留目前 dirty working tree。先 `git status --short`、`git diff --stat`、`git diff` 了解現況。
- 不得 `git reset`、`git checkout`、刪檔、commit、stage、push、deploy、publish、D1 mutation、碰既有 wrangler 設定。
- 不要輸出或搜尋敏感診斷欄位、帳號／handle、完整 URL／query、DOM／HTML／class、UA、IP、hwid、signature、raw metadata。
- 任何進入 `src/` runtime 的改動都要遞增 `src/config.js` beta 版號；docs／tests／backend-only 不為形式升版。
- 正式版要移除／disable beta-only diagnostics/export UI；本次只做 beta 驗證，不發布正式版。

## 3. Beta 47 → Beta 63 逐版紀錄

> 只有下表「已知證據」可當事實。其他欄位直接寫「證據缺口」，不可補猜。

| 版本 | 目的／變更（目前可確認） | Auto test | 人工驗收 | 證據缺口／交接注意 |
|---|---|---|---|---|
| beta47 | More locator／profile root、report flow、privacy／debug-context、限制／cooldown、report queue 與三無收尾採 fail-closed。 | 有 beta47 locator／profile／report／privacy／debug-context 測試；QA47 沒有獨立 final count，後續 beta49 full **24/24** 含回歸 | live 未證明 | 這是 QA／測試證據，不是逐版 commit 歷史。 |
| beta48 | 三無 launcher／ready handshake、finish-scan、跨 tab／失焦／reload／crash lifecycle、stop cleanup。 | 有 beta48 launcher／finish-scan 測試；QA48 沒有獨立 final count，後續 beta49 full **24/24** 含回歸 | live 未證明 | QA48 明寫仍缺 installed Chrome 與多個 browser cases。 |
| beta49 | Likes／Quotes row 分類、延遲／virtualization、checkbox 分層、dialog collector。 | **24/24 PASS**；dialog collector 8 cases | live 未證明 | 不跳 search/tags 只代表導航層；封鎖成功仍需 live。 |
| beta50 | 整合 diagnostics、Likes row boundary、clean-list exactly-once、status priority、structured stop。 | **39/39 full PASS**；src syntax **19/19** | live 未證明 | interest-tag auto-block 不列 fixed；private cooldown candidate 有 source/test 證據。 |
| beta51 | private block/report、failed queue、逐筆失敗操作、followers collector。 | **50/50 full PASS**；src syntax **19/19** | 不可延伸成現況 fixed | 文件與後續驗收有矛盾，見下方。 |
| beta52 | real-row boundary、stop visibility／latch、checkbox 與 active queue 分離。 | targeted **10/10**；full **60/60**；src syntax **19/19** | live row shape／stop timing 未證明 | 文件同時保留 beta51 live PASS 與 beta52 未驗證 live；以未驗證限制為準。 |
| beta53 | partial／atomic clean-list commit、rollback、follower summary。 | targeted **8/8**；full **68/68**；src syntax **19/19** | clean-list/follower live 未證明 | 新 collector 仍未取得 live browser PASS。 |
| beta54 | 白話 follower UI、partial summary、message route／floating clamp、idle／stop 文案。 | targeted **9/9**；full **77/77**；src syntax 全部 PASS | live 未證明 | 175/96/16/80 只在 fixture／文案契約；不是實機完成。 |
| beta55 | beta-only 200-entry ring diagnostics；stable channel disabled；加入 message route／follower scroll stage logs；attachment 4xx 降級為 message-only。 | targeted **10/10**；full **87/87**；privacy／syntax／build PASS | clean-list 仍 FAIL；關閉第三方 extension 後仍相同 | 診斷內容只能保留非敏感計數／時序／狀態。不能記帳號、href、文字、DOM。 |
| beta56 | semantic readiness／delayed Likes refresh、no-op fail-closed、atomic commit gate。 | targeted **7/7**；privacy/diagnostics **11/11**；full **95/95** | live 未證明 | delayed fixture 不等於 live pass。 |
| beta57 | 全流程 observability、operation lifecycle、panel lifecycle、adversarial terminal handling。 | diagnostics **4/4**；operation **2/2**；panel **1/1**；smoke **16/16**；full **108/108** | live 未證明 | log 有輸出不等於功能修好。 |
| beta58 | verified Likes context：可信純 profile row 可收；heart 只作輔助；unverified／Quotes／shared ancestor／header fail-closed。 | contract **6/6**；targeted **42/42**；full **114/114**；build PASS | 無 live PASS；使用者仍回報清理名單失效 | 測試 pass 不等於 live pass；以 beta63 safe counters 和實機結果為準。 |
| beta59 | trusted profile rows、self detection、shared/ranked scroll root、nested decoy／outer overflow。 | targeted **35/35**；full **124/124**；contract **10/10**；privacy **20/20** | live 未證明 | 測試有資料；不能當 installed truth。 |
| beta60 | exact Likes anchors／fallback；owner/self/reply exclusion、Quotes/unverified fail-closed。 | contract **5/5**；targeted **55/55**；full **129/129**；privacy **15/15** | live 未證明 | 目前仍走 dialog path，不是跳頁。 |
| beta61 | raw observed before skip；normalized dedupe、unverified／Quotes／failure fail-closed。 | contract **4/4**；targeted **59/59**；full **133/133**；privacy **19/19**；parity **1/1** | live FAIL（曾 0 人） | 只保留安全計數；不可寫入敏感原始資料。 |
| beta62 | aggregate counters：exact links／unique accounts／duplicates／exclusion buckets／readiness。 | contract **7/7**；targeted **66/66**；full **140/140**；privacy **26/26**；parity **1/1** | live 未取得可靠 fixed | 診斷數字必須同一輪對齊，且不帶個資。 |
| beta63 | owner policy：clean-list 可含 owner；reservoir 仍排除 owner。 | contract **4/4**；targeted **70/70**；full **144/144**；privacy **30/30**；parity **1/1** | **FAIL（使用者實機附件）：**約 140 人只抓到 1 人 | 已由 beta64 移除 early `atBottom` break；beta63 本身仍是失敗證據。 |
| beta64 | clean-list 等待 lazy Likes rows；只移除 early `atBottom` break，保留 `unchangedCount >= 4`。 | lazy-load **1/1**；targeted **31/31**；full **145/145**；syntax／diff／build／parity **PASS** | **待使用者 Chrome 人工驗收** | runtime `2.7.4-beta64`；Chrome `2.7.4.64`；UserScript `2.7.4-beta64`。不可稱 live fixed。 |

### 版本表的已知限制

- 以上逐版內容來自各 beta QA／測試紀錄；多數檔案與測試在 dirty／untracked working tree，不能假設每版都有獨立 git commit。
- 任何「auto test pass」只代表該測試 fixture／mock 通過。不能宣稱 Threads live fixed。
- 2.7.0 → 2.7.4 的完整衝突比對先前做過；本次只處理目前 1/140 根因，不重開無關比對。

## 4. 全部問題分群與目前狀態

### 證據分層（先看這段）

- **Auto／build：**各 QA 文件記錄的 fixture、source syntax、build、parity 數字。它們只能證明本機契約，不能證明 Threads 實機。
- **Live：**只有使用者在 Chrome 的人工結果才算 live。Beta63 的「約 140 人只抓到 1 人」來自使用者實機附件，不是 QA63 自動測試。
- **目前檔案狀態：**`src/config.js` 是 `2.7.4-beta64`，`ENABLE_BETA_DIAGNOSTICS=true`；beta64 只移除 clean-list early break。QA／tests 多數屬 dirty 或 untracked，不能當成逐版 commit 證據。
- **並行 Codex：**先前對話曾要求停止另一個 fork；這只是對話運作狀態，不是 repo 證據。Claude 開始前仍要自己檢查 `git status --short`、`git diff --stat`、`git diff`。

### beta51／52／53 文件矛盾，採保守解讀

1. beta51 文件記錄 private／interest／failed queue 的自動測試與部分 live 判斷。
2. beta52 文件又明寫真實 Chrome row shape、stop timing 尚未驗證。
3. beta53 文件保留回歸 PASS，但新 follower／clean-list 仍未取得 live browser PASS。

因此：回歸測試可以標 PASS；產品 live 狀態不能自動標 fixed。Claude 不得用較早的「live PASS」覆蓋後來使用者 FAIL。

### A. 標籤／興趣誤點，跳到搜尋頁後卡住；後續封鎖失敗

**使用者回報原文（整理，保留意思）：**

- 「封鎖一個帳號時會跳轉到他主頁的標籤，變成搜尋關鍵字頁面，然後卡住，無法越過那個帳號。」
- 「封鎖到一半自己跑到搜尋頁面然後停住。」
- 「個人檔案有 search 標籤，封鎖程序會卡在 tag search 頁。」
- 「一直跳去點對方頁面的 hashtag。」
- 「有興趣 tag 的帳號，封鎖流程就會卡住。」
- 「貼文藍色 Tag 會點進相關內容，不是更多／封鎖。」
- 「自動封鎖多人時，主頁的 Threads 主題 tag 被點到，點不到封鎖。」
- 「封鎖會點到 TAG，導致無法自動執行。」
- 「明明在封鎖但會一直跳去搜尋頁面。」

**集中版本：**主要集中在 2.7.1；Win32 與 MacIntel 都有回報。原先使用者判斷 2.7.0 沒有這麼多。

**目前驗收：**

- 使用者曾回報：不再跳搜尋／標籤頁，但封鎖仍失敗。故只能算「跳頁症狀部分改善」，不是整體 fixed。
- 不能用 selector 猜測或單元測試代替 live evidence。

**建議動作：**先用現有 runtime diagnostics 查封鎖狀態機實際停在哪一步；修正範圍限於最小 production path。若沒有同輪 live evidence，維持 FAIL／待修。

### B. 私人帳號、限制保護、cooldown／太早進冷卻、失敗三次自動停

**使用者回報原文（整理）：**

- 「私人帳號會封鎖失敗。」
- 「無法封鎖，不知為何要限制保護。」
- 「每天可能只封鎖 30 個就達上限，持續一週以上。」
- 「檢舉都是失敗，是不是查無帳號留言？」
- 「封鎖失敗三次就自動停止，累積三個私人帳號就卡住。」

**狀態：**使用者先前判斷私人帳號／限制保護／太早進 cooldown「應該已解」；驗收結果是「沒有 cooldown，但封鎖失敗」。因此目前是 **部分 pass、實際封鎖仍 FAIL**，不可結案。

**建議動作：**把私人／不可操作／未知狀態變成可跳過且可見的失敗清單，不要讓三個失敗把整個佇列永久卡住。需要使用者決策：失敗帳號是否只加入人工清單、是否允許繼續下一個。

### C. Checkbox／回覆按鈕／選取框

**使用者回報原文（整理）：**

- 「沒有選取框 QQ。」（舊版）
- 「電腦版開聊天室，回覆按鈕會被勾選方塊擋住。」（2.7.0 回報）
- 「勾選不了，選了也沒辦法封鎖。」
- 「checkbox 是否可排除互相追蹤／有互動名單；勾選方塊跟回覆按鈕重疊。」
- 使用者後續澄清：「私訊／回覆區：checkbox 不擋回覆按鈕，本來就沒擋住。」

**版本／驗收：**除較新的 report 30 外，多數是舊版回報；使用者後續標記 C pass。不要再把「不擋回覆按鈕」當成待修 bug；只追蹤真正的選取失敗或閃爍。

### D. 三無掃描沒有啟動、停止無效、worker 不消失

**使用者回報原文（整理）：**

- 「沒有執行掃描三無爛封鎖。」（2.7.1）
- 「按掃除三無，沒有背景執行視窗，沒有清除帳號按鈕。」
- 「粉絲中的三無帳號只掃一下就停止，是否必須停在 Threads 畫面，不能背景作業？」
- 「清理名單失效，所以後續測試無法進行。」
- 「停止三無按下去不會真的停止。」
- 「三無停止之後，worker 視窗不會消失。」

**驗收：**使用者回報 D fail（附圖：背景 worker／三無狀態未正常推進）。使用者後續確認關閉其他擴充功能後仍 fail；不是可歸因於單一外掛衝突。

**建議動作：**建立最小狀態序列測試：start → running → stop requested → worker terminated → UI idle。診斷只記狀態轉移、計數、時間，不記 DOM／帳號資料。

### E. 清理名單、按讚名單混入「引用」、找不到名單

**使用者回報原文（整理）：**

- 「清理名單失效。」
- 「按讚名單混入引用的人。」
- 「貼文互動名單選『喜歡』並收集整串，錯誤把引用的人列入；建議水庫也排除引用。」
- 「清理名單未完成：`likes_tab_switch_failed`。」（錯誤代碼只作內部狀態，不可直接展示給使用者）
- 「清理名單失效，會找不到名單。」

**已知方向：**按讚應走目前的 Likes dialog／anchor path，不要改回跳頁。Beta 63 的 owner policy 已測試，但 live collection 仍 1/140；此問題目前未 fixed。

**重要限制：**不能把「引用排除」功能建議當成 live fixed；需要實機確認按讚集合沒有引用誤入。

### F. 粉絲收集 0、16/175、96/175、未自動捲動

**使用者回報原文（整理）：**

- 「已收集 0 位粉絲（結束原因：end）。」
- 「已收集 16 位粉絲（目前看見 96 列；停止原因：end），但其實有 175 位。」
- 「總數 175；觀察 16，新增 16，略過 80（重複 80）；Threads 只載入 96/175；停止原因：threads_partial。界面文字看不懂。」
- 「收集未完成。顯示 175 位，但只載入 96；新增 16，80 已在名單；約 79 尚未載入。為什麼不能自動往下捲？」

**狀態：**收集器目前能辨認 partial，但沒有完成自動往下捲動／等待 lazy-load 的使用者期待。這是獨立於 Likes 1/140 的另一組 collection bug，不能用同一個修正順帶宣稱解決。

**建議動作：**先定義「應自動捲到底」或「明確告知只能收集目前已載入」的產品決策。若要自動捲，必須在 production path 加 bounded scroll／growth wait 測試；不可用無限迴圈。

### G. 狀態 UI／文字不白話／第一行消失

**使用者回報原文（整理）：**

- 「執行狀態第一行字不見了。」
- 「idle 時介面空白，出現停止執行。」
- 「停止原因看不懂，其他的也看不懂，這個界面請設計白話文。」
- `likes_tab_switch_failed` 這類內部代碼不應直接顯示給使用者。

**狀態：**UI 仍有可讀性問題。必須把狀態、完成／未完成、停止原因用白話顯示；idle 狀態不可留可誤按的「停止執行」。

### H. 停止執行／勾選閃爍／背景 worker 狀態競態

**使用者回報原文（整理）：**

- 「封鎖進行時，停止執行會出現又消失。」
- 「封鎖進行時，被勾選的名單會一直閃打勾跟取消打勾。」
- 「停止三無之後，worker 視窗不會消失。」

**狀態：**尚未可靠 fixed。這組問題可能是 worker 狀態更新與 content UI 重繪競態，但不能只靠猜；要用狀態轉移診斷與實機驗收確認。

### I. 浮動視窗在訊息頁錯位

**使用者回報原文（整理）：**

- 「訊息介面中，留友封會出現在帳號列表跟訊息內容中間。」
- 「從訊息介面點出來後，floating 視窗混亂往上跑。」
- 未點進訊息時在正常右上角；點進訊息後卡在列表與內容中間。

**狀態：**未完成。需要用目前 Chrome 實機確認定位基準；不要用 preview／測試 profile 冒充 installed truth。

### J. 功能建議／非核心 bug

**使用者原文（整理）：**

- 「希望增加移除粉絲，而不是直接封鎖。」
- 「希望可以查看目前序列中要封鎖的帳號並編輯。」
- 「掃描互動名單可排除引用。」
- 「希望新增封鎖帳號粉絲功能。」
- 「希望有英文單字加無意義數字 AI 預設帳號的批量封鎖。」
- 「失敗帳號列出來讓使用者手動封鎖。」
- 「12 小時後恢復」錯字修正。

**狀態：**這些不能標成 bug fixed。先分成 feature backlog、文案修正、人工操作輔助，再另行決策。

## 5. Beta 55–63 診斷演進（非敏感摘要）

| 版本 | 診斷演進 | 可用價值 | 限制 |
|---|---|---|---|
| beta55 | 200-entry ring、stable disabled、message route／follower scroll stage logs、4xx 降級 message-only。 | 可知道階段／時序，不再只靠猜。 | 正式版必須 disable；不可輸出敏感資料。 |
| beta57 | 延續 runtime diagnostics。 | 可追查切換、等待、提交是否發生。 | 沒有完整 diff，不能宣稱修好。 |
| beta58 | verified Likes context 的可信純 profile row；heart 僅輔助，unverified／Quotes／shared/header fail-closed。 | 可對照「之前好、現在壞」，並避免把不可信列當候選。 | 測試 pass 不等於 live pass。 |
| beta59 | 延續收集路徑診斷。 | 讓實機結果可定位到等待／收集階段。 | 不能從 log 猜 DOM。 |
| beta60 | 按讚 anchor fallback／Likes 路徑方向被確認。 | 防止退回跳頁處理。 | 不代表引用已排除。 |
| beta61 | 延續 raw-before-skip 類安全時序診斷。 | 能分辨資料被略過前的計數狀態。 | 使用者實機仍回報抓不到。 |
| beta62 | 加入／修正候選、anchor、owner、停止原因等計數。 | 找到 0／1／16／96／175 的差異。 | 計數必須同一輪對齊，且不帶個資。 |
| beta63 | Likes switch、anchor filter、owner policy 與 scroll 時序可觀測。 | 本次已能從數字定位 early break。 | 1/140 live FAIL；不要把 diagnostics 自身當功能。 |

**正式版 diagnostics 原則：**保留最少必要的錯誤代碼與可讀狀態；beta-only 詳細診斷／export UI 在正式版 disable。不要記錄帳號、連結、文字、DOM、UA、IP、hwid、signature 或 raw metadata。

## 6. Beta 63 live FAIL 的安全證據

以下數字已去除敏感欄位，可直接用於 debug：

1. Likes switch：**成功**。
2. readiness：`candidateCount=2`、`uniqueCandidateCount=1`。
3. anchor filter：`exactLinkCount=2`、`uniqueExactAccountCount=1`、`duplicateExactLinkCount=1`、`acceptedUniqueAccountCount=1`；其他排除計數為 0。
4. owner policy：**成功**；`eligibleCount=1`、`selectedCount=1`、`ownerSkippedCount=0`。
5. scroll：`scrollRootSelected=false`、`scrollTop=0`、`clientHeight=1224`、`scrollHeight=1224`、`rootAdvanced=false`、`atBottom=true`。
6. 時序：readiness 約 `10656ms`；commit 約 `10845ms`；兩者只差約 **189ms**。
7. 實機結果：使用者確認實際約 140 人，但只抓到 1 人。這是 **FAIL**，不是 partial pass。

## 7. Root cause

目前 `src/core.js` clean-list 迴圈有類似下列邏輯：

```js
const beforeAtBottom = ...;
if (beforeAtBottom && renderObservations >= 2) {
  reachedEnd = true;
  break;
}
```

切到 Likes 後，Threads 還沒有建立可捲動高度時，`clientHeight === scrollHeight`，所以 `atBottom=true`。程式在只等了約 189ms 時就把「尚未載入」誤判為「已到底」，直接 commit 1 人。

v2.7.0 的差異（目前已確認的行為層級）：

- 沒有這個 `beforeAtBottom && renderObservations >= 2` 早退。
- 會沿用連續無新增的 bounded 停止條件（已知 `unchangedCount >= 4`），讓 lazy content 有機會出現。
- 這不是要求回復整個舊版；只回復造成 1/140 的最小等待／停止語義。

## 8. Beta 64 最小修法（已完成；交給 Claude 驗收）

### 已完成的修正

1. `src/core.js` clean-list 已移除 `beforeAtBottom && renderObservations >= 2` early break。
2. `src/config.js` 已升至 beta64；lazy-load production-path test、targeted/full、syntax/diff/build/parity 均已通過。
3. Claude 接手時仍先看 `git status --short`、`git diff --stat`、`git diff`，保留所有既有 dirty 變更；不要重做或回退 beta64。

### 若人工驗收仍 FAIL，才可改這些

1. 先讀使用者新 diagnostics，確認是新的可重現 blocker。
2. 只在 clean-list production path 延續既有 `unchangedCount >= 4` bounded no-growth 語義。
3. 若實際 red test 顯示 180ms 仍不足，精確恢復 v2.7.0 的額外約 160ms no-progress wait；不要新增無限等待。
4. 如果是 runtime `src/` 改動，`src/config.js` 升到 beta64；docs／tests-only 不為形式升版。
5. 不碰 reservoir、owner policy、selector、root ranking、collector、跳頁方案或新的抽象層。

### Production-path red test（已完成；不可重做成另一套 mock）

用實際 `Core.collectFullDialogUsers`／目前 production path，不要只測 helper mock：

1. 初始 Likes dialog 只呈現 1 個 unique candidate。
2. 初始 scroll root 沒有 scroll range（`clientHeight === scrollHeight`）。
3. 約 400–500ms 後，同一 dialog 非同步長到 140 個可見候選。
4. 斷言 collector 最終得到 140 個 unique candidates，且不能在約 189ms 就 commit 1 個。
5. 同時保留 owner policy：clean-list 可含 owner；reservoir 不含 owner。

若此 red test 無法在目前測試基礎建立，直接記錄證據缺口，不要用另一套 selector／DOM mock 取代。

## 9. 驗證計畫

### Auto test

按 repo 現有測試命令執行，不自行發明新套件腳本：

1. 先跑 Beta 64 production-path red/regression test。
2. 跑受影響的 targeted tests：clean-list、Likes、owner policy、reservoir、worker stop／UI 狀態。
3. 跑完整測試：`node --test tests/*.test.mjs`（若 repo 現況命令不同，以 package／QA 文件為準）。
4. 跑 privacy／diagnostics safety 測試：確認輸出沒有敏感欄位。
5. 語法／parity／diff 檢查。
6. Build：`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump`。

### 人工 Chrome 驗收

使用者自行在現有 Chrome 外掛測試。Codex／Claude 不控制瀏覽器。

1. 對實際約 140 人的 Likes 名單執行清理名單。
2. 確認不是只抓 1 人；確認畫面不顯示內部 `likes_tab_switch_failed`。
3. 確認按讚名單不混入引用；不使用跳頁 workaround。
4. 確認 owner policy 不回歸：clean-list 可選作者；reservoir 排除作者。
5. 確認三無 start／stop／worker 消失與 idle UI。
6. 確認停止執行不閃現又消失，已勾選名單不反覆閃爍。
7. 確認訊息頁 floating 視窗位置。
8. 確認私人帳號失敗不會讓整批永久卡死，失敗原因可見。

**人工驗收未完成前，只能說「測試通過／部分完成」，不能說 live fixed。**

## 10. 並行工作與 rollback

- 先前曾要求停止並行 Codex fork；這不代表它是否改過 repo。Claude 開始前必須重新檢查 `git status/diff`，把當下 dirty diff 當唯一 repo 證據。
- 既有 wrangler、Cloudflare binding、D1、deploy 設定不可碰。
- Rollback 只反向 Beta 64 本次 diff。不要 `git reset`、不要 `git checkout`、不要覆蓋其他 beta47–63 dirty 變更。
- 若發現無法區分 beta64 diff，先停下來列出檔案與行，不要清理工作樹。

## 11. 目前結論／已完成／還缺／下一步

### 目前結論

Beta 63 的 Likes 清理名單 live FAIL：1/140。Beta64 已移除 clean-list early `atBottom` break；自動測試收集 140/140，但仍待 Chrome live 驗收。

### 已完成

- Beta 55–63 的非敏感 runtime diagnostics 方向已建立。
- Beta64 修正與測試已完成：lazy-load 1/1、targeted 31/31、full 145/145、syntax/diff/build/parity PASS；artifact 版本已對齊。
- Likes switch、anchor filter、owner policy 的 Beta 63 safe counters 已取得。
- v2.7.0 與目前 early-break 行為差異已確認。
- 使用者已明確要求：簡單修、Claude 寫 code、使用者人工測。

### 還缺

- 使用者 Chrome 實機重新驗收。
- 其他分群（清理名單 UI、三無 worker、停止競態、浮窗、私人帳號）仍未 live fixed。

### 下一步

1. Claude 先確認 dirty diff 與 beta64 現況，不要重做已完成修正。
2. 先讓使用者在 Chrome 人工驗收 1→140；若仍 FAIL，才依新 diagnostics 繼續 debug。
3. 任何後續修正仍限於新證據，不擴張 selector／collector／reservoir。

### 下次可直接下的指令

> 讀 `/Volumes/Working 2T/CODE/products/ThreadsBlocker/docs/HANDOFF_CLAUDE_BETA47_TO_BETA63.md`。先檢查目前 `git status --short` 與 `git diff`，不要 reset/checkout。只修 Beta 63 clean-list 的 early `atBottom` break：讓 1→140 的 Likes lazy-load production-path test 在 400–500ms 後收集到 140，沿用 `unchangedCount >= 4` bounded stop；必要時只恢復 v2.7.0 額外約 160ms wait。不要碰 selector、root、collector、reservoir、owner policy 或跳頁。完成 targeted/full/privacy/syntax/build，並回報檔案、測試結果與證據缺口；不要 commit、push、deploy 或控制瀏覽器。

## 12. 可直接貼給 Claude 的完整 Prompt

你接手 `/Volumes/Working 2T/CODE/products/ThreadsBlocker`。請先讀本文件與 repo 的 `AGENTS.md`、`PROJECT.md`、`docs/BLOCKING_ARCHITECTURE.md`、`docs/THREADS_DOM_GOTCHAS.md`。

目前 blocker 已有 Beta64 最小修正：Beta63 實機清理 Likes 名單約 140 人只抓到 1 人；根因是 `src/core.js` clean-list 的 `beforeAtBottom && renderObservations >= 2` 過早 break。Beta64 已移除該 early break，保留 `unchangedCount >= 4`；lazy-load fixture 收集 140/140，targeted 31/31、full 145/145、syntax/diff/build/parity PASS。仍待使用者 Chrome 人工驗收，沒有 live evidence 不得宣稱 fixed。

Beta64 最小修正已完成：`src/core.js` 已移除該 early break，版本為 `2.7.4-beta64`；不要重做或回退這個修正。先保留 dirty tree，不 reset／checkout。不要 commit、stage、push、deploy、D1、碰 wrangler、控制 Chrome／Edge。若使用者人工驗收仍 FAIL，先讀新 diagnostics，再只針對可重現的新 blocker 修正。

已完成：production-path lazy-load test 1/1（1→140）、targeted 31/31、`node --test tests/*.test.mjs` 145/145、syntax／parity／diff／build PASS；artifact runtime 2.7.4-beta64、Chrome 2.7.4.64、UserScript 2.7.4-beta64。現在只剩使用者 Chrome 實機驗收；若 FAIL，請從實機 diagnostics 繼續 debug，不要重做已完成修正。
