# ThreadsBlocker 2.7.4-beta49 QA 計畫

## 結論先行

這份文件先作為 beta49 的 QA 規劃與 fail-closed gate，後續實作與驗證結果追加於同一份文件；它不是 release approval。這一輪不 stage/commit、不 push、不 deploy、不上傳商店，也不做 D1/R2 mutation。

目前工作樹的 `src/config.js` 已 bump 至 `2.7.4-beta49`；beta47/beta48 與使用者原有 dirty changes 均視為既有輸入，全部保留；不可用清理、reset 或 incubator worktree 覆蓋主 repo 來取得基線。

beta49 已把 report #24 的 collection path 改為逐批保存 row classification；virtualized row 移除後仍保留 Likes evidence，heart 篩選空集、Likes tab／row／tab switch 無法正面識別時均 fail closed 並寫入 aggregate reason。#24 是否 ready 仍須通過本文件第 10 節全部 gate。

## 1. 依據與 QA 邊界

已讀：`AGENTS.md`、`PROJECT.md`、`docs/BLOCKING_ARCHITECTURE.md`、`CHANGELOG.md`、`src/config.js`、`build.sh`、`src/core.js` 的 `collectVisibleDialogUsers` / `collectFullDialogUsers`、checkbox/composer 判斷、`src/features/post-reservoir-engine.js` 的 `findLikesTab` / `collectBatch`，以及 `v2.7.0..HEAD` 的相關 git history。

本計畫只針對：

- post activity dialog 的 Likes/Quotes 分類、tab 切換、批次收集、virtualization、scroll/end/stall 與去重；
- 現版 profile/post/dialog/composer checkbox regression；
- fixture、source/static、build/parity、privacy 與使用者目前 Chrome 的 installed truth 分層。

不在本輪：改 blocking/report worker、改三無判定、改 storage schema、修改平台 ingest、deploy 或發布。

## 2. Report 分類與處理口徑

| Report | QA 分類 | beta49 處理 |
|---:|---|---|
| #24 | **beta48 原始 blocker；beta49 已修正，仍須通過本文件 gate**：選 Likes 混入 Quotes；virtualized rows 消失後分類失真；heart selector 命中/不命中與空結果 fallback 不安全；tab 切換失敗未 fail closed | 逐批 typed Likes、virtualization 累積、空集不 fallback、tab/row/switch fail closed |
| #10 | **功能建議／duplicate context，不當 bug fixed** | 記錄為 product follow-up；不得用「已處理 #10」宣稱 beta49 修復 |
| #5 | composer overlap source 已修 | 只做現版 regression；不因猜測擴大 production 修改 |
| #30 | 與 #5 同類，且有排除互追 feature context | 驗證排除互追不被破壞；不把 #30 另列為新 blocker，除非現版有可重現證據 |
| #1 | v2.6.3「沒有選取框」 | 歷史 context；不以舊版猜測改 production，僅納入現版 profile/post/dialog/composer regression |
| #26 | v2.7.1「無法勾選」 | 現有證據不足；只做現版可重現測試，不預設為 beta49 bug |

## 3. Report #24 收集契約

### 3.1 選取與分類

- 進入 activity dialog 後，必須辨識 Likes tab；選 Likes 不得把 Quotes、Reposts 或 Replies 列加入結果。
- heart selector 必須測「命中」與「不命中」兩條路徑；heart 命中代表該 row 屬 Likes，不能以 username 文字或 row 存在作替代。
- heart selector 找不到任何合法 Likes row 時，結果必須是空集或明確失敗；**禁止 fallback 全 users**。
- Likes/Quotes 同一 dialog、相同 username 出現於不同列時，分類要以列的證據為準，不得只以全 dialog username 去重後再回頭查最後 DOM。
- tab locator 支援已知 locale 與 `aria` 形狀；locale/aria 都缺失或 dialog 結構未知時，必須停止並回報可診斷的 fail-closed reason，不得把未知結構當 Likes。

### 3.2 批次、virtualization 與去重

- 每一批在 row 可見時立即分類並累積 `{username, classification/evidence}`；不能等掃描完成後只看仍在 DOM 的 rows。
- 跨批 username 去重；同一 username 的 Likes/Quotes 衝突要保留分類衝突證據並採保守排除，不能因 Set 先去重而丟掉來源分類。
- 一律套用 `buildSkipUsers(ctx)`：排除目前登入者、post owner；reply composer 的 reply target 也不得誤加入。
- collection 必須有明確 end detection：scroll height/visible rows/cursor 或等價可觀測進度；連續無新分類、scroll position 未前進、DOM 不變時要進 scroll-stall 結果，不得無限重試。
- 虛擬列表移除舊 rows 後，先前已分類的 Likes 仍須保留；新批次延遲載入後要再分類，不得以最後一批覆蓋累積集。
- 停止、timeout、未知 dialog、tab switch failure 都要保留已收集的安全摘要與 reason；不得假完成或 fallback 全量。

## 4. DOM fixture 計畫與 beta49 deterministic coverage

所有 fixture 只能證明 deterministic DOM 契約，不能冒充使用者目前 Chrome。

| Fixture | 必測內容 | 預期 |
|---|---|---|
| Likes + Quotes 同一 dialog | 同一 dialog 有 Likes/Quotes tabs、兩類 rows、heart 僅存在 Likes | 選 Likes 只回 Likes；Quotes 不得混入 |
| 只有 Quotes | activity dialog 沒有合法 heart row | 空結果／明確 no-likes reason；不得 fallback 全 users |
| 延遲載入 | tab、rows、heart 先後出現 | 在有界等待內收集；逾時 fail closed |
| virtualization 移除舊 rows | scroll 後移除首批 rows、加入下一批 | 先前分類累積保留，去重正確 |
| scroll stall / end | scroll position 不動、DOM 不變、真正到尾 | 分別記 stall/end；不得永久 lock 或無限迴圈 |
| locale / aria 缺失 | 已知語系文字、無 `dir=auto`、只有 aria label、文字與 aria 均缺失 | 可辨識則切換；不可辨識則 fail closed |
| unknown dialog | 未知 role/header/row 結構、混入非使用者 links | 不猜 Likes、不 fallback 全 users |
| skip users | self、post owner、reply target 與普通 user 同批 | 只排除 skip users，其餘分類與去重不變 |

beta49 已新增 `tests/beta49-dialog-collector.test.mjs`，涵蓋上述分類 helper；測試結果追加於第 12 節。後續仍應分為：

1. production source contract：檢查分類在收集當批完成、禁止空 filtered fallback、tab failure fail closed、stall/end 有界；
2. browser fixture：以小型 Threads-like DOM 重現上述矩陣；
3. installed Chrome：只驗真實 DOM、virtualization、tab 切換與 checkbox，不把 fixture 結果升格為 live truth。

## 5. beta48 原始 FAIL 證據與 beta49 對應修正

### 5.1 Likes/Quotes 與 virtualization 混收

beta48 的 `src/core.js:410-423` 只把 username 放入 `collectedLinks`，沒有保存 row classification/heart evidence；beta49 改由 `src/dialog-collector.js` 逐批保存 typed evidence，virtualization 後仍可回傳先前 Like。

### 5.2 空 heart filtered 結果會 fallback 全 users

beta48 的 `filteredUsers.length === 0` 會 fallback 未篩選 `rawUsers`；beta49 只由 `usersFromState()` 回傳 heart-evidenced Likes，空集維持空集。

### 5.3 tab locator 缺失或失敗仍繼續 raw collection

beta48 在 tab locator null/catch 時仍 raw collect；beta49 改為 `likes_tab_not_identified` / `likes_tab_switch_failed`，post reservoir 亦以 `_lastOpenReason` 收口，不再 Strategy 2 raw fallback。

`src/features/post-reservoir-engine.js:548-562` 的 `findLikesTab` 只掃 `span[dir="auto"]` 並要求 `CONFIG.LIKES_TAB_TEXTS` exact match；語系、ARIA-only 或未知結構不符合時會回傳 null。這些情況在 beta49 必須是 fail closed，而不是 raw fallback。

### 5.4 現版 checkbox/composer scope

- `src/core.js:1294-1305` 的 dialog checkbox 仍只處理可見、非零尺寸 user links；virtualized dialog 要靠後續 scroll/mutation regression 驗證，不可只看初始 DOM。
- `src/core.js:1498-1501` 會跳過 dialog 內的 post-level injection，交由 `injectDialogCheckboxes` 處理；需驗證不重複、不漏勾選。
- `src/core.js:15-24` 的 `buildSkipUsers` 是收集與 checkbox regression 的 owner/self/reply 排除依據。
- beta49 不重新打開已由 #5 修過的 composer overlap source；只驗 profile、post、dialog、composer 四種現版 profile。#30 的互追排除只驗不回退。

## 6. Checkbox regression matrix

| Surface | 操作 | Pass 條件 |
|---|---|---|
| Profile | 他人 profile、自己 profile、無 `main`/`role=main`、sticky header | 只在正確 profile header 出現；不覆蓋 Instagram/通知/More；自己帳號不誤加入 |
| Post | 有作者+時間、絕對日期、無完整文章 role | checkbox/badge 出現於 post scope；不掛到 profile header/action row |
| Dialog | followers/following/likes/quotes、延遲 rows、virtualization | 每列最多一顆；切 tab/scroll 不重複、不把 Quotes 當 Likes；owner/self 排除 |
| Composer | reply composer、contenteditable/textarea、#5 overlap shape | clean-list/checkbox 不蓋 composer；reply target 不被當普通 user；不因舊 report 猜測改 source |

#1 與 #26 僅作歷史 context；若人工不能用現版重現，不得標成 beta49 fixed/blocked。

## 7. 真實 Chrome 人工腳本與證據分層

### Fixture truth（自動化）

- 使用 deterministic fixture 只記錄 fixture id、預期/實際 users count、classification、stall/end reason。
- 不使用 fixture 的通過結果宣稱目前 Chrome、CWS 或 Threads live DOM 正常。

### Installed truth（使用者目前 Google Chrome）

1. 先回報目前 Chrome profile 中 Threads tab 的版本、URL 類型、已載入 extension 版本；不要貼 cookie、token、帳號名單、完整貼文文字或 request body。
2. 只用本次 QA build 的 unpacked `dist/extension` reload；記錄 source version、unpacked version、目前 installed version、Threads tab breadcrumb 四者是否一致。
3. 在一篇可撤銷測試貼文打開 activity dialog：選 Likes，切 tab 前後各截取非敏感的 counts/enum；確認 Quotes 不進結果。
4. 測 virtualization（快速滾動、停留、回到上方）、延遲載入、scroll stall/end；確認已分類批次累積、去重、self/post owner 排除、無永久 lock。
5. 以可控方式測 tab locator：正常 locale、ARIA-only、語系缺失、未知 dialog；後三者應停在 fail-closed reason，不能加入 raw users。
6. 分別測 profile/post/dialog/composer checkbox 與 #5/#30 regression；#1/#26 只記錄現版可否重現，不做猜測性修正。

人工回報格式：`case/report → PASS/FAIL → source/build/installed truth → result enum → counts → classification → dedupe/skip/stall/end → lock cleanup`。

## 8. Privacy 與資料邊界

- QA log 只保存 enum、counts、classification totals、stall/end reason、版本與時間；不保存 username list、post text、完整 URL、DOM/HTML、token、cookie、authorization 或 request/response body。
- Likes/Quotes 收集是本機暫態操作；不得新增平台 upload、D1/R2 寫入或公開統計來源。
- 若發現 debug/report snapshot 帶出敏感資料，這是 privacy blocker；需保留 scrub 後的最小證據並停止擴大測試。
- 未取得使用者明確批准，不執行 deploy、migration、D1/R2 mutation、商店上傳、發布或 push 發布分支。

## 9. Build / parity / rollback gate（下一輪驗證）

本輪 runtime source 已修正，使用 `./build.sh --no-bump`（`SKIP_SAFARI_DEPLOY=true`）驗證。需核對：

- `src/config.js` beta 版號、UserScript banner、extension manifest、`dist/extension/content.js`、`dist/extension.zip`、versioned Chrome zip 內容一致；
- beta build 的 beta-only background 與正式 build 邊界；bundle order 與 source import 一致；
- `node --check dist/extension/content.js` 與 zip 內 content syntax；
- 不使用歷史 zip、installed profile 目錄或未驗證暫存包。

Rollback reference：以「本次驗證、最後通過的 beta artifact/source」為唯一回退點。若 beta49 blocker，先停用本次 unpacked extension，再重新載入該 verified artifact；只讀核對 block/report queue、pending users、storage preference 與 dialog collection state，不執行 migration 或資料寫入。正式版同步 README/CHANGELOG 與任何發布動作均需另取得批准。

## 10. Pass / Fail gate

**PASS**：#24 的 Likes/Quotes 分類、heart 命中/不命中、tab failure fail closed、批次累積、virtualization、去重、self/owner 排除、end/stall、延遲/未知 DOM fixture 全通；checkbox 四 surface regression 全通；source/unit/fixture/integration/installed truth 分層證據齊全；privacy、build/parity、syntax、rollback reference 全通。

**FAIL / blocker**：任何 Quotes 混入 Likes、virtualized Likes 遺失、空 filtered fallback 全 users、tab/locale/ARIA/unknown 結構 raw fallback、scroll stall 無界或永久 lock、self/owner 未排除、checkbox/composer overlap 回歸、只用 fixture/build 冒充 installed truth、artifact parity/syntax/privacy/rollback 失敗，或未授權外部 mutation。

Report #10 不得作為 PASS/FAIL bug fixed 證據；#1/#26 沒有現版重現證據時維持未驗證，不得用猜測補 production。

## 11. 本輪收口

- 本輪新增 `src/dialog-collector.js`、`tests/beta49-dialog-collector.test.mjs`，並更新 `src/core.js`、`src/features/post-reservoir-engine.js`、`src/config.js`、`build.sh`、`CHANGELOG.md`；其他 dirty files 均保留。
- 未 stage/commit/deploy/publish/D1 mutation；人工 Chrome installed truth 仍按第 7 節分層，不以 fixture/build 代替。
- beta49 readiness 以第 12 節實際結果為準；未通過的 gate 維持 **FAIL / not ready**，不作正式版宣稱。

## 12. beta49 實作後驗證紀錄（可重跑）

- Deterministic DOM fixture：`node --test tests/beta49-dialog-collector.test.mjs`；Likes+Quotes、只有 Quotes、延遲載入、virtualization、heart 命中/不命中、locale/ARIA、未知結構、分類衝突去重，以及 aria/data-testid like-looking metadata 負向 case 共 8 cases PASS。
- Source syntax：`node --check src/dialog-collector.js && node --check src/core.js && node --check src/features/post-reservoir-engine.js && node --check src/config.js` PASS。
- Targeted + beta47/beta48 regression：`node --test tests/beta49-dialog-collector.test.mjs tests/beta49-build-parity.test.mjs tests/beta47-*.test.mjs tests/report-flow-timing.test.mjs tests/three-no-watch-beta48-launcher-contract.test.mjs tests/three-no-watch-finish-scan.test.mjs`，24 tests PASS；全套 `node --test tests/*.test.mjs` 亦 24 PASS。
- Focused blocker gates：post-reservoir 每個入口確認 `isSelectedTab === true`；click no-op/context change 未 selected 一律 `likes_tab_switch_failed`；unknown dialog `unknown_dialog_schema`；`build.js`/`build.sh` module order contract PASS；profile More 不信任 `document.body` PASS。
- Build/parity：`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` PASS；`dist/extension/content.js` 與 zip 內 content syntax PASS；UserScript `2.7.4-beta49`、manifest `2.7.4.49`、三個 Chrome zip 內容與 hash parity PASS。
- 未驗證：使用者目前 Google Chrome installed extension、live Threads DOM/CWS 版本、實機 virtualization/延遲/tab failure 與四 surface checkbox 人工流程；不把 fixture/build success 當 installed truth。
