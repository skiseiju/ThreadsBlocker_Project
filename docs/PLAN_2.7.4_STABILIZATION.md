# ThreadsBlocker 2.7.4 穩定化企劃

## 這份企劃要做什麼

先把 2.7.1 集中的問題穩定下來，形成 `2.7.4-beta50` candidate。這不是正式版發布，也不是 live fixed 宣告；目前只把 source、fixture、artifact 證據整理好，等真實 Chrome installed truth 補齊。

## 報告分群與決策

### A：2.7.1 集中的搜尋／標籤導頁卡住

ID：7、9、11、15、16、17、21、22、23、25、27、28、29、33；版本全部為 `2.7.1`。

原文逐字收錄：

- #7（2.7.1）：『封鎖一個帳號時會跳轉到他主頁有的標籤，變成去搜尋那個關鍵字頁面，然後就卡住沒有繼續封鎖了，按執行封鎖也是一樣卡住，沒辦法越過那個帳號。希望可以增加功能查看目前序列中要封鎖的帳號並且進行編輯』
- #9（2.7.1）：『封鎖到一半他就會自己跑到搜尋頁面然後就停住個』
- #11（2.7.1）：『如果個人檔案有seach標籤，會封鎖程序會卡在該標籤的search的頁面上，比如這個: https://www.threads.com/search?q=ateezatiny&amp;serp_type=tags』
- #15（2.7.1）：『會自動選到興趣標籤』
- #16（2.7.1）：『會選到 nba threads 標籤』
- #17（2.7.1）：『一直跳去點對方頁面的HASHTAG』
- #21（2.7.1）：『本來想說邊打LOL邊讓系統在背景封鎖，不過視窗在跳回來之後就卡住沒有繼續封了。現在還有繼續封鎖(48人)~~7m，已選取是0人，但重新刷新文章之後，之前被勾選起來的紅框還是在，我嘗試把紅框取消選取再選一次，就變成已選取1人了，然後還是會在某個地方卡住。\n看起來是點開要封鎖者自介的標籤後卡住的』
- #22（2.7.1）：『在定點絕的過程中，自動封鎖的時候會出現主題Kpop，不確定是否因為要封鎖的對象有設定這個主題，所以會自動連結跳轉到主題，封鎖的過程就會中止，即使重新設定也會卡在同一個要封鎖的帳號，無法往下繼續。』
- #23（2.7.1）：『最近脆有興趣標籤，使用封鎖和檢舉的時候系統常常自動點擊到標籤，然後就卡死了，沒辦法繼續封鎖』
- #25（2.7.1）：『遇到有設置興趣tag的帳號，封鎖流程就會卡住\n非常感謝🙏👍』
- #27（2.7.1）：『如果貼文上有藍色的Tag會點進去相關的內容而不是更多進行封鎖，其他的功能都讚讚』
- #28（2.7.1）：『您好!電腦網頁版的在自動封鎖多人時，系統搜尋到對方的主頁後，可能系統是想找封鎖按鈕，但對方主頁若有放Threads的一些主題tag的話，系統會一直點選主題tag而點不到封鎖的部分，這部分跟您回報，感謝您製作這麼好的工具。』
- #29（2.7.1）：『封鎖會點到TAG 導致無法自動執行QQ』
- #33（2.7.1）：『明明在封鎖但會一直跳去搜尋頁面』

決策：`beta49` 已驗證不再跳到 `/search`／`/tags`，但興趣標籤案例的封鎖仍失敗；現有證據指向 profile root／More／menu／confirm gate，不支持「搜尋頁 querySelectorAll 所有帳號 + null／死迴圈」推論。不得採用「過濾沒發文帳號」來繞過，避免漏封鎖合法目標。`beta50` 只新增 closed phase diagnostics，不能宣稱 auto-block 已修；任何 fail-closed 都必須把該帳號移入 `FAILED_QUEUE` 並繼續 queue。仍需用真實 Chrome failure phase 決定最小 selector 修正，不能只靠 fixture/build 宣稱 live fixed。

### B：限制／cooldown 誤判與私密帳號

| ID／版本 | 原文逐字收錄 |
|---|---|
| #3／2.6.6 | 『無法封鎖，不知為何要限制保護』 |
| #4／2.7.0 | 『每天可能只封鎖30個就達上限，這狀況已經持續一個禮拜以上了』 |
| #18／2.7.1 | 『遇到個人資料不公開的帳號，就需要手動封鎖，不知道這點有沒有解方？』 |

決策：精確區分兩條路徑。私人帳號 auto-block 仍是 `private_manual_required`（安全限制，未修）；私人帳號累積 3 筆造成 cooldown／停機的錯誤路徑已由目前 worker 修正：不增加 `consecutiveRateLimits`、移出 active queue、加入 `FAILED_QUEUE` 並繼續下一筆（`src/worker.js` queue advance branch；`tests/beta47-safety-regression.test.mjs`、`tests/beta47-report-only-queue.test.mjs`）。目前失敗清單 UI 只顯示總數，只有「全部重試／只清除」；逐筆帳號＋原因＋開啟個人頁手動處理列為 beta51 候選，不放入 beta50。 「封鎖某帳號的粉絲」是新功能，延後 H 討論，不混入 stabilization。12 小時後自動恢復／解除的目前文案已正確，列為已修。

### C：checkbox／composer 類問題

| ID／版本 | 原文逐字收錄 |
|---|---|
| #1／2.6.3 | 『沒有選取框QQ』 |
| #5／2.7.0 | 『電腦版開聊天室的時候，回覆按鈕會被勾選方塊擋住』 |
| #26／2.7.1 | 『勾選不了，選了也沒辦法封鎖』 |
| #30／2.7.1 | 『不知道選取帳號的checkbox是否可以排除互相追蹤/有在互動的名單\n跟朋友私訊聊天發現勾選方塊會跟回覆按鈕重疊\n問題截圖：https://ppt.cc/fMr3Ox』 |

決策：#5／#30 的聊天室 checkbox overlap 同類，source `v2.7.2` 已有 overlap fix；#30 的排除互相追蹤／有互動名單是另行功能建議，未實作；#1／#26 證據不足。除非現版人工測試直接重現，否則不改 checkbox production code、不宣稱 fixed。

### D：三無掃描 lifecycle

| ID／版本 | 原文逐字收錄 |
|---|---|
| #12／2.7.1 | 『沒有執行掃描三無爛封鎖』 |
| #19／2.7.1 | 『按下掃除三無，沒有跳出背景執行視窗，沒有「清除帳號」按鈕』 |
| #31／2.7.1 | 『請問每次掃描粉絲中的三無帳號時，都只會掃一下就停止，該掃描功能是否必須將畫面停在threads畫面，而無法於背景作業？』 |

決策：採 `beta48` candidate；launcher handshake、heartbeat、stale recovery、完成／停止／失敗收口與背景 worker lifecycle 已有 source/test evidence，仍待 installed truth。

### E：Likes／Quotes 互動名單

| ID／版本 | 原文逐字收錄 |
|---|---|
| #10／2.7.1 | 『建議定點絕功能在掃描互動名單時可以除外「引用」的名單，因為有些人是引用來反駁對方論點』 |
| #24／2.7.1 | 『貼文互動名單中，選擇按「喜歡」的人並點擊收集整串名單，會錯誤地也將「引用」的人也列入名單。建議「貼文水庫」功能也一併排除抓取「引用」名單，引用太常被使用來反駁發文者論點了』 |

決策：#24 是 `beta49` candidate bug；逐批 typed Likes、virtualization 保留分類、heart evidence、tab/row fail closed 與明確 end/stall/timeout reason 已完成。#10 是 feature／duplicate context，不宣稱 bug fixed。

## beta47／beta48／beta49 技術方案與證據

- `beta47`：More locator 只接受正面 profile/post/row scope；search/tags、navigation mismatch、private/manual、menu missing 與 rate limit 分流，避免點到 hashtag 後卡死。
- `beta48`：三無 launcher 以同一 `scanId` handshake，worker ready／heartbeat 有界確認；stale、stop、failed、completed 清理 lock/command/runtime，保留可續掃 cursor。
- `beta49`：Likes tab 必須明確 selected；row 只接受穩定 heart SVG 或內部 fixture marker；unknown dialog fail closed；post-reservoir 傳遞 `end`、`scroll_stall`、`timeout` aggregate reason；`build.js`／`build.sh` module order 對齊；profile More 不信任 `document.body`。
- 自動化證據：final `39/39` full tests PASS；build/parity 與 independent QA PASS。D Likes shared ancestor、clean-list lifecycle、status first row、three-no stop/close、automatic report closed-schema 均為 code/test fixed candidate；A auto-block 與私人 auto-block 不得列 fixed。這些是 source／fixture／artifact evidence，installed/live browser 未驗證；Edge 依本回合要求不處理，因此不是 blocker。

## 變更量與 dirty worktree 口徑

- `2.7.0 → 2.7.1`：1 commit、17 files、`+2743/-423`。
- `2.7.1 → 9423a43`：10 commits、84 files、`+16849/-1508`。
- `9423a43 → 目前 dirty`：19 tracked files、`+848/-539`；16 untracked files、約 2101 lines。
- 目前 dirty worktree 包含使用者原有變更、beta47、beta48 與本批 beta49 變更；以上 dirty 統計不可全部算成本批新增。

## 衝突稽核與剩餘風險

衝突稽核已關閉：

1. `build.js`／`build.sh` runtime module order/list 不一致。
2. More locator／profile root 信任 `document.body`。
3. beta49 four blockers：selected Likes tab、過寬 like evidence、unknown dialog raw fallback、post-reservoir reason 傳遞。

剩餘人工風險，先不擴張 source 修改：

- Web Locks unavailable fallback race。
- checkbox touch + click 雙事件交互。
- unknown locale fail-closed 可能漏收。
- cooldown thresholds 在真實平台限制下的邊界。

## beta50 最終決策表與下一版優先順序

| 議題 | 目前證據／決策 | beta50 狀態 | 後續 |
|---|---|---|---|
| 興趣標籤 auto-block | `/search`／`/tags` 導頁已止住，但封鎖仍可能卡在 profile root／More／menu／confirm gate；不支持全域帳號掃描／死迴圈推論 | **未修**；只新增 closed phase diagnostics；fail-closed 必須進 `FAILED_QUEUE` 並繼續 queue | **P0**：收集真實 failure phase 後修 A selector，不猜 |
| 私人帳號 auto-block | `private_manual_required` 仍是安全限制 | **未修／不可列 fixed** | **P0** diagnostics 後再決策，不以人工 fallback 宣稱自動修好 |
| 私人帳號 3 筆限制誤觸 cooldown | worker 不增 `consecutiveRateLimits`，移出 active、進 `FAILED_QUEUE`、繼續下一筆；beta47 tests 覆蓋 | **已修 candidate** | 維持 regression |
| 失敗清單逐筆處理 | 現 UI 只有總數、全部重試／只清除 | **未做** | **P1**：逐筆帳號、原因、開啟個人頁手動處理 |
| Likes shared ancestor／clean-list／status first row | source + deterministic tests 已通過 | **已修 candidate** | 補 installed truth |
| three-no stop／close | persist → cleanup → close once；fake-timer/closeCalls 已通過 | **已修 candidate** | 補 installed truth |
| automatic report privacy | consent upload 改為 closed schema；完整 debug export 僅本機主動匯出 | **已修 candidate** | 補 network/live evidence |
| 封鎖某帳號的粉絲 | 新功能，非 stabilization bug | **延期** | **P2**：另做 SDD／風險決策 |
| 12 小時冷卻恢復 | 目前文案已正確 | **已修** | 不再納入 beta50 blocker |

固定優先順序：**P0** 收集 beta50 phase diagnostics 後修 A selector（需要真實 failure phase，不猜）→ **P1** 逐筆失敗／手動處理 UI → **P2** 粉絲封鎖另做 SDD／風險決策。

## 人工測試步驟與回報格式

### 測試前

1. 記錄 source version、unpacked build version、目前 installed extension version；不記錄 cookie、token、帳號清單、完整貼文、DOM/HTML 或 request body。
2. 只在可撤銷測試貼文／測試帳號操作；先確認可停 worker、可清除 pending queue，並保留 beta48 candidate source/artifact 作 rollback reference。

### 測試步驟

1. **A／More 與路由**：profile、post、search、tags、多個 More、主題 tag；確認只點可信 scope，search/tags 不被當 profile，失敗有 reason 且可重試。
2. **B／限制**：模擬正常封鎖、明確 rate limit、空 menu、private account；確認只有明確 restriction 進 cooldown，private 保留人工路徑。
3. **C／checkbox**：profile、post、dialog、composer/chat；確認每列最多一顆、不擋回覆、不因 touch+click 重複、不把 #1/#26 的不足證據當結論。
4. **D／三無**：啟動、worker ready、heartbeat、切換焦點、延遲載入、stale、stop、completed、failed、續掃；確認 lock/command/runtime 清理與 cursor 保留。
5. **E／Likes**：Likes+Quotes 同 dialog、只有 Quotes、延遲 row、virtualization、heart 命中／不命中、locale/ARIA、tab switch no-op；確認 Quotes 不進結果，未 selected 或 unknown 直接 fail closed。
6. 只保存 aggregate：case、PASS/FAIL、reason enum、counts、classification、end/stall/timeout、lock cleanup、版本；不要保存 username list 或原始 metadata。

### 回報格式

`case/report → PASS/FAIL → source/unpacked/installed version → reason enum → counts → classification → dedupe/skip → end/stall/timeout → lock cleanup → privacy-safe evidence path`

任何 FAIL 都附最小可重現步驟與非敏感截圖／counts；不要把 fixture PASS 或 build PASS 寫成 live PASS。

## D1 status 決策

目前不變更 D1。現在只有 source、fixture、artifact evidence，沒有 installed truth；等 installed truth 完成後，才把精確 report ID 從 `PENDING` 更新。這份企劃不聲稱已做 D1 mutation，也不授權任何 status mutation。

## Rollback

Rollback reference：回到 `2.7.4-beta48` candidate source/artifact；本次企劃未執行 rollback。若 beta49 candidate 在人工測試失敗，先停用本次 unpacked extension，再重新載入 beta48 verified candidate；只讀確認 queue、pending users、preference 與 dialog state，不做 migration 或資料寫入。

## Beta51 測試計畫：逐筆失敗清單與指定帳號粉絲收集

本節只涵蓋 beta51 兩個本機、可逆功能；不修改 MoreLocator、worker block selector、版本、build、stage、commit、deploy 或平台資料。

### A. 逐筆失敗清單

- 以 `FAILED_QUEUE`／`REPORT_FAILED_QUEUE` 的舊 string 與新 object fixture 驗證向後相容；新 object 僅允許 bounded `type`、`reason`、`failedAt` 與本機 username reference。
- reason 只能是固定 enum；invalid、超長、NaN、負值與敏感 metadata fail closed。reason／username 不進 reporter、debug export 或 network payload。
- manager 顯示每筆 username、block/report 類型、reason、failedAt，並提供全部重試／只清除、單筆重試／清除、開啟個人頁；React rerender、synthetic click 與重複開啟均 exactly-once。
- 個人頁 desktop 以 `window.open(url, '_blank', 'noopener,noreferrer')`；iOS 以 `history.replaceState` + `location.reload()`，禁止 `window.location.href` 與自動封鎖。

### B. 指定帳號粉絲收集

- profile scope 只接受目前帳號的明確 followers control；dialog collector 僅接受 `role=listitem`／`data-row-key`／`data-key` 單列 row，tag/search/non-follower/shared ancestor 與 unknown DOM fail closed。
- fixture 覆蓋 normal rows、shared ancestor、non-follower/tag/search links、virtualization、stall、50-row truncation、stop、duplicate click、confirmation cancel/accept 與 queue dedupe。
- 收集結果只回傳 bounded count、`end`／`scroll_stall`／`limit`／`stopped` reason；確認前不得寫入 `BG_QUEUE`，確認後只加入未 blocked/queued/self/target 的 username。
- targeted gate：beta51 tests、beta49 dialog/build regressions、相關 beta50 tests、`node --check` 與 `git diff --check`；不以 build 或 live Chrome 代替 source/fixture evidence。
