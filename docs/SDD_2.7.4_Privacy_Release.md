# SDD：ThreadsBlocker 2.7.4 隱私一致性發版

- 狀態：Implementation ready（尚未發布）
- 建立日期：2026-07-16
- Owner：海哥
- 執行總控：Codex（Sol：plan / decision；Luna：implementation；Terra：verification）
- 目標版本：`2.7.4`
- Baseline checkpoint：`73bd6e4`
- 本輪邊界：只完成可送審候選；未經海哥另行明確同意，不 deploy、不送 CWS、不操作 remote D1、不 commit

## 1. 目標

2.7.3 不再做一次獨立的 privacy 修補與重送。2.7.4 一次完成下列資料契約的同步，避免同一份隱私政策改兩次：

1. Chrome 擴充功能實際處理 Threads 同站 Credentials / authentication information 的行為。
2. 平台上傳、人工覆核、去識別化短文字與公開觀測站的用途。
3. 問題回報實際附帶的頁面、佇列、來源文字與診斷資料。
4. 官網、CWS listing / Privacy Practices、README、CHANGELOG、產品內同意、方法論與新版觀測站的同一口徑。
5. 2.7.4 beta artifact、storage migration、同意回歸與獨立複核。

本 SDD 是本次總控與驗收 SSOT。話術演算法細節仍以 [SDD_Topic_Amplification.md](./SDD_Topic_Amplification.md) 與 [ADR 0009](./adr/0009-deidentified-sample-publication.md) 為準；本文件只規定 2.7.4 能否安全送審與公開。

## 2. 已納入的輸入

- Claude／新版觀測站目前 worktree（含 `site/platform/next/`、Worker、測試與文件）。
- 2026-07-13「觀測站話術樣本管線完整交接」。
- 2026-07-14「演算法預驗實測結論與樣本待審清單」。
- CWS 2.7.3 Purple Nickel / Credentials 退件脈絡（task `019f368a-1025-7790-8b76-2abf013d59d0`）。
- 海哥對 `topic_sample_reviews` #209、#210、#212、#222、#240、#251、#252、#253 的裁決。
- Chrome Web Store User Data Policy：本機讀取、處理或暫存也屬 handling；未在產品明顯功能中合理預期的資料處理，必須在處理前醒目揭露並取得明確同意。

## 3. 現況事實

### 3.1 Chrome 本機 Credentials

- `page-bridge.js` 目前在所有 Threads 頁面 `document_start` 載入。
- 它會在頁面記憶體處理 `fb_dtsg`、`lsd`、`jazoest`、`__user` 等同站 request 欄位，攔截 fetch / XHR，並在加速 profile metadata 查詢時使用 `credentials: include` 讓瀏覽器把既有 session cookies 送往 Threads 自己的同站 endpoint。
- token / cookie 值目前不持久化、不上傳到 ThreadsBlocker、觀測平台或問題回報端點。
- 2.7.3 與目前 2.7.4 的 `page-bridge.js` 行為相同；CWS 草稿與首頁的「不讀取／不處理 Credentials」是錯誤宣告。

### 3.2 平台上傳與人工覆核

- 可選平台 payload 可能含公開 Threads 帳號識別、profile URL、來源貼文 URL、公開文字片段、分類、時間、批次統計、工具版本與匿名穩定來源 ID。
- 三無掃描只上傳 aggregate 統計，不上傳三無待審帳號名單。
- B8 已把用途從「公開聚合統計」擴張到「覆核人員閱讀候選片段，並可能公開去識別短文字」；這是實質政策變更。
- `platform-sync-v2` 的舊同意不得直接視為同意此新用途。

### 3.3 新版觀測站

- 現況只要 review row 為 `approved`，原文片段即可進 public overview；沒有可驗證的律師審閱 gate。
- `observer_count` 現況是 distinct `source_url`，不是獨立使用者；`account_count` 是各列 `unique_account_count` 加總，不是跨批次 distinct 帳號。
- public overview GET 目前會建立 review queue，讀取路徑具有 D1 寫入副作用。
- 方法論仍宣稱只公開聚合資料，與 `/platform/next/` 顯示文字樣本互相矛盾。

### 3.4 問題回報

- 使用者主動送出時，實際附件可能含目前 Threads URL／標題、瀏覽器資訊、近期封鎖／檢舉 queue、帳號、來源 URL／文字、操作紀錄、console logs 與 DOM 診斷。
- 現有 modal 沒有在送出前逐項揭露，也沒有未預勾的 affirmative consent。

## 4. 單一隱私契約

| 資料／用途 | 本機處理 | 傳送目的地 | 事前選擇 | 公開規則 |
|---|---|---|---|---|
| Threads 公開頁面、帳號與來源內容 | 是 | 預設不傳 | 產品功能所需 | 不直接公開個人層級資料 |
| Threads request token / session cookie | Chrome 加速三無 opt-in 後，僅頁面記憶體處理 | 只送 Threads 同站 endpoint；不送 ThreadsBlocker | 獨立醒目揭露＋明確 opt-in | 永不公開 |
| 平台來源分析 payload | 是 | 使用者手動或同意每日自動後送 Cloudflare Worker / R2 / D1 | `platform-sync-v3` | 聚合統計為主；短文字受 §5 gate 約束 |
| 候選公開文字 | Worker 去識別＋授權覆核人員有限閱讀 | review queue | 包含在 v3 用途揭露 | 預設只輸出句型描述；律師 gate 開啟後才可輸出核准短摘錄 |
| 問題回報診斷附件 | 送出前組裝並 scrub | 問題回報 Worker／備援端點 | 每次送出前未預勾確認 | 永不公開 |
| 公告 request metadata | 否 | 公告 HTTPS 基礎設施可能看到 IP、UA、時間、路徑 | 一般網路請求 | 永不公開 |

## 5. 決策

### D1. 2.7.3 不再先改一次 privacy

所有修正集中到 2.7.4。2.7.3 只保留歷史與 rollback artifact，不再產生另一套暫時宣告。

### D2. Credentials 必須 fail-closed

1. 新增獨立、版本化的本機 Credentials 處理同意。
2. 未同意時，MAIN-world bridge 不得掃描文件、不攔截 fetch / XHR、不讀 request body、不暫存 token。
3. 「加速三無」預設關閉；使用者可使用不需 Credentials bridge 的一般可見 UI / 三點選單 fallback。
4. 開啟前 modal 必須說清楚：處理哪些 token／cookies、只送 Threads、是否持久化、是否上傳、拒絕後仍可用什麼功能。
5. CWS Privacy Practices 保守勾選 `Authentication information = Yes`，並註明本機 opt-in、只用於 Threads 同站功能、不傳給 ThreadsBlocker。

### D3. 平台同意升為 v3，舊同意不得自動繼承

1. `PLATFORM_SYNC_CONSENT_POLICY_VERSION` 改為 `platform-sync-v3`。
2. v2 或舊 app 版號同意只保留偏好供 UI 顯示，不得自動寫成 v3。
3. v3 未決定前：auto upload、repair re-upload、三無統計 upload 與 manual upload 全部停止，回傳可判讀的 `pending_version_consent`。
4. v3 文案一次揭露：公開文字片段、去識別、有限人工覆核、達門檻且人工核准後「可能」公開短摘錄、目前仍受律師 gate 關閉。

### D4. 問題回報必須逐次同意並 scrub

1. modal 醒目列出頁面資訊、帳號／queue、來源 URL／文字與診斷 log。
2. 以未預勾 checkbox 取得本次診斷附件同意；未勾不得送出。
3. 送出前 scrub token、cookie、authorization 等敏感值；自動測試必須用 canary 值證明 payload 不含它們。

### D5. 公開文字樣本預設為句型描述模式

1. API projection 設版本化 `samplePublicationMode`，預設 `description`。
2. 缺少部署設定、設定版本不符或無律師完成證據時：`topicCards[].samples=[]`、`repeatedPhrases=[]`。
3. 只有人工 `approved`、通過去識別與門檻、且部署設定和程式內 legal policy version 完全相符，才可進 `reviewed_text`。
4. Gate 必須在 public API，不可只靠前端隱藏。
5. Pending / rejected 永不公開；異議採「先下架，再複核」。

### D6. 數字只能用資料庫能證明的名稱

2.7.4 不把 `source_url` 稱為「使用者／觀測者」，也不把加總值稱為「獨立帳號」。在沒有 contributor distinct / account hash 去重前：

- `observer_count` 對外稱「來源貼文數」。
- `account_count` 對外稱「帳號觀測筆數」。
- 不使用「N 個獨立帳號、M 位使用者分別封鎖」等現有資料無法證明的句子。

真正的獨立使用者與跨批次獨立帳號計數另列 schema / derived-layer 工作，不阻塞 description-mode 的 2.7.4 送審。

### D7. 公開 GET 必須是唯讀

public overview GET 不得執行 `.run()` / `.exec()` 或建立 review row。候選 queue 僅能由 ingest、排程或有權限的 admin refresh 產生。

### D8. 宣告面一次同步

同一次變更必須更新：

- `site/privacy/`
- `site/index.html`
- `docs/CWS_LISTING_DRAFT.md`
- CWS Privacy Practices 待填清單
- `README.md`
- `CHANGELOG.md`（明確更正 beta41 錯誤口徑）
- `src/ui.js` 的 Credentials、平台 v3、問題回報同意
- `site/platform/methodology/`
- `site/platform/next/`
- `docs/SDD_Topic_Amplification.md` 與 `docs/adr/0009-deidentified-sample-publication.md` 的啟用狀態
- Obsidian 既有 beta43 code review 問題與修復範圍紀錄

### D9. 海哥裁決的 8 筆 remote D1 操作延後

#209／#210 退件、#251 改掛話題、#212／#222／#240／#251／#252／#253 核准的裁決已記入總控，但本輪不執行。只有 §5 gate、資料口徑與 production rollback 準備完成，且海哥重新下令後，才照原指定順序操作 remote D1 並驗證 live API。

## 6. 驗收條件

### R1 — Credentials 事前同意

- 無同意／舊同意：bridge 不處理 token、不 patch fetch/XHR。
- 明確同意：只在 Threads 頁面記憶體使用，token/cookie 不進 storage、CustomEvent、Reporter 或非 Threads request。
- 關閉後一般三無 fallback 可使用。

### R2 — Platform v3 consent

- v2 enabled 升版後不會被 migration 改成 v3。
- v3 未決定前 auto、repair、manual、three-no stats upload 都不送。
- 同意或拒絕後偏好與 policy version 分開保存；單純 beta 跳號不重問。

### R3 — 問題回報

- 未勾附件同意不得送出。
- payload 不含 token/cookie/authorization canary。
- modal 與 privacy 頁列出的附件種類與實作一致。

### R4 — 公開樣本法律 gate

- 預設或缺 env 時，即使資料庫已有 approved row，public JSON 仍找不到原文字串。
- `reviewed_text` 只有 legal policy version 完全匹配才輸出；pending/rejected 永不輸出。
- description mode 不產生文字 `<blockquote>`。

### R5 — API 與數據口徑

- public GET 零寫入。
- 前端只使用「來源貼文數／帳號觀測筆數」或其他可直接由查詢證明的名稱。
- 方法論、thresholds 與實際常數一致（現行程式為 10/2；若修改常數須一起更新測試與文件）。

### R6 — 宣告一致性

- 自動檢查不得再出現「完全不讀取／不處理 Credentials」或「公開端永遠只有聚合統計」等與實作衝突的現行宣告。
- 所有現行文案清楚區分「不要求使用者輸入密碼」「本機處理同站認證欄位」「不傳給 ThreadsBlocker」。

### R7 — Release artifact

- `src/config.js` 只跳一個新的 2.7.4 beta 版號。
- 執行 focused tests、syntax check、storage/preference regression、`./build.sh --no-bump`。
- `src/config.js`、Chrome manifest、content breadcrumb、zip、版本化 zip 與 Userscript header 版本一致。
- 正式版不含 beta-only 手動診斷匯出入口。
- installed truth 必須用使用者現有 Chrome；改動現有 Chrome 前先回報當前載入版本與狀態。

### R8 — 高風險複核

- 實作者完成後，由未參與實作的 Terra Reviewer 只讀檢查 diff、測試證據與宣告一致性。
- 最多一輪 scope 內修正；仍有阻塞即回報，不無限返工。

## 7. 驗證指令與證據

至少包含：

- 相關 JS `node --check`
- `node cf_bug_admin/tests/topic_amplification.test.mjs`
- `python3 cf_bug_admin/tests/platform_upload_schema_smoke.py`
- 若 Worker SQL 寫入有變更：`node cf_bug_admin/scripts/check-sql-placeholders.mjs`
- privacy / credential / consent / report scrub 專項測試
- `./build.sh --no-bump`
- zip manifest、content breadcrumb、Userscript header 與檔案清單 parity
- Terra Reviewer 的只讀結論

不得把 live public overview GET 當一般驗證，因 baseline 版本會寫 D1；須先完成 R5。不得在本輪把測試結果解讀成已 deploy 或已送審。

## 8. Rollback

- Baseline checkpoint：`73bd6e4`；不得覆蓋 Claude／使用者既有工作。
- production 前必須另外記錄上一個 CWS artifact、git tag／commit、Cloudflare deployment id 與 D1 影響清單。
- Credentials consent 或平台 v3 若發生回歸，回退到一般三無 fallback、停止上傳與 `description` mode；不可用自動沿用舊同意作為 rollback。

## 9. Go / No-Go

只有 R1–R8 都有證據，2.7.4 才能標記「可送審候選」。

「可送審候選」不等於「已發布」；正式版 build、deploy、CWS upload / submit、remote D1 裁決與 commit 仍需海哥另行明確指令。

## 10. 當前驗收證據矩陣（2026-07-16）

| 驗收項目 | 狀態 | 可核實證據 |
|---|---|---|
| R1 Credentials 事前同意 | PASS | `credentials-processing-v1` 預設關閉；privacy 專項涵蓋未同意、同意與撤回；Luna 修正後撤回會解除 patch、清除記憶體與跨分頁同步。 |
| R2 Platform v3 consent | PASS | `platform-sync-v3`；舊同意不自動升版，auto／repair／manual／three-no upload 共用 v3 gate；偏好與 policy version 分開保存。 |
| R3 問題回報 | PASS | 診斷附件 checkbox 未預勾；未同意不送；token／cookie／authorization canary scrub 專項通過。 |
| R4 公開樣本法律 gate | PASS | 缺 env 預設 `description`；只有 `sample-publication-legal-v1` 完全匹配才可能輸出 `reviewed_text`；pending／rejected 排除且 description 不產生 `<blockquote>`。 |
| R5 API 與數據口徑 | PASS | overview 與 political-events 公開 GET 零寫入；公開名稱使用「來源貼文數／帳號觀測筆數」；樣本常數 `SAMPLE_MIN_ACCOUNTS=10`、`SAMPLE_MIN_OBSERVERS=2` 與 SDD/API thresholds 一致。 |
| R6 宣告一致性 | PASS | 產品同意、官網、privacy、CWS、README、CHANGELOG 與觀測站均改為「不要求輸入密碼；只在 Threads 本機處理同站認證欄位；不傳給 ThreadsBlocker」。現行宣告掃描沒有衝突舊句。 |
| R7 Release artifact | PASS | focused tests、14 個 JS syntax check、storage/preference regression、no-bump build、artifact parity 與使用者現有 Chrome beta44 installed-truth smoke 均已完成。 |
| R8 高風險複核 | PASS | Luna rollout 證明實作者為 `gpt-5.6-luna`。Terra 初次複驗與最終收口均為 `gpt-5.6-terra`；初次 turn 的原始 `turn_context` 為 `sandbox=read-only`，最終 turn 雖為 unrestricted sandbox，但全程依唯讀指令執行，收口後再驗證 HEAD、staged diff 與工作樹均無 reviewer mutation。Terra 最終判定 R1–R7 PASS，唯一 conditional 已由 orchestrator 直接核實 rollout metadata 後解除。 |

### 10.1 測試與產物證據

- Privacy 專項：11 pass、0 fail。
- Topic amplification：15 pass；platform schema smoke fresh／legacy 通過；SQL placeholder check 通過。
- `src/config.js` 為 `2.7.4-beta44`，Chrome manifest 為 `2.7.4.44`。
- `dist/extension.zip`、`dist/threads_blocker_chrome.zip`、`dist/threads_blocker_chrome_v2.7.4.44.zip` SHA-256 均為 `66de42156b1eaf79a2b28b8be99f29f583ff385dff2f5bf84e933a8d9a723fe6`。
- Firefox XPI SHA-256：`f3f9b9eb70513a9eb2fc4730d5a09047fa7c097520ab85c4486e97a9809ad6f3`；Userscript SHA-256：`923ac53e74612973bc6805a90a461351e0e234ed1d050217cfd8d7006dc26a09`。
- `git diff --check` 通過；HEAD 仍為 rollback checkpoint `73bd6e4`，本輪沒有新 commit。

### 10.2 Installed-truth smoke 與 rollback

- 使用者現有 Google Chrome／既有 profile 的 Threads URL 為 `https://www.threads.com/activity`。
- 測試前 console breadcrumb 為 `[HegeBlock] Content Script Injected, Version: 2.7.4-beta42`；使用者在原 extension entry 按重新載入後，新分頁與既有分頁都出現 `[HegeBlock] Content Script Injected, Version: 2.7.4-beta44`，extension ID 保持 `fdakbcimhdgdlglccljfphogmgkcndni`。
- CWS 開發者頁 listing ID 為 `goibhoemcnjojlejjlojpikfehmccbbj`；兩者不同，不能據此猜測 beta42 的實際載入方式。
- `platform-sync-v3` 在兩個 beta44 分頁都先顯示重新同意視窗；未決狀態的 filtered ThreadsBlocker platform request 為空。為繼續 smoke 採最小權限的「只使用手動上傳」，沒有開啟每日自動同步，也沒有執行 manual／repair upload。
- Credentials 初始設定文字為「預設關閉」。測試 opt-in 後，第二個既有分頁顯示「已明確同意並開啟」；從第二分頁撤回後，第一分頁與新開分頁都回到「預設關閉」。MAIN-world patch／unpatch 的 deterministic 行為由 privacy 專項測試覆蓋；Browser 的唯讀 evaluate 沙箱不暴露 `fetch`／XHR，因此不以該沙箱的 function 內容冒充 MAIN-world 證據。
- 問題回報診斷 checkbox 實機確認未預勾；輸入 token／cookie／authorization canary 後，在未勾同意時按送出，畫面顯示「未同意不會送出回報」，submit 未 disabled，filtered report request 仍為空。Canary scrub transformation 由 privacy 專項測試覆蓋；實機沒有真的送出回報。
- 390×844 實測：platform v3、credentials 與問題回報三個 modal 的 box、checkbox 與 CTA 都在 viewport 內，`documentScrollWidth=375`，沒有水平 overflow；測試後已 reset viewport。
- Smoke 結束狀態：credentials 已撤回為關閉、平台為手動模式、三個分頁 filtered ThreadsBlocker platform/report requests 皆為空、所有測試 modal 關閉、原使用者 Threads 面板恢復 minimized、臨時分頁已關閉。
- beta42 rollback artifact：`dist/threads_blocker_chrome_v2.7.4.42.zip`，zip 完整、manifest `2.7.4.42`、content breadcrumb `2.7.4-beta42`，SHA-256 `8d83a01fc923a767b7f16a4794fccf6381a3d473a8103b871061289d50ee2310`。
- Chrome 自動化仍不操作 `chrome://extensions/`；beta44 是海哥在原 extension entry 手動重新載入。依 installed-truth smoke 授權，是否恢復 beta42 仍須在 Terra 收口後確認，不能用不同 ID 的臨時安裝冒充原狀復原。

### 10.3 當前 go / no-go

- Code、privacy 宣告、CWS 草稿與 artifact：GO。
- Installed-truth smoke：GO。
- 2.7.4 可送審候選：**GO**。R1–R8 均有證據，Terra 最終複核沒有 code、artifact 或 installed-truth blocker。
- Chrome 現況仍為 beta44；留存 beta44 或恢復 beta42 不改變 RC 技術判定，但最終 installed state 仍依海哥決定，不能用不同 extension ID 冒充復原。
- 正式 build、deploy、CWS upload／submit、remote D1 mutation、commit／push：未授權且未執行。

## 11. 2.7.4 正式轉換 closeout（2026-07-16）

- **§10 snapshot note**：§10.1–10.3 保留 beta44 正式轉換前的驗收快照；本節 supersede 其中「正式 build 尚未執行」的當時狀態。
- **本輪狀態**：已將現有 `2.7.4-beta44` 轉為本機正式 `2.7.4` artifacts；未 commit、push、deploy、CWS／AMO upload／publish、remote D1 或修改 Chrome／Safari installed state。正式發布與 installed-truth reload／功能測試交由海哥在 commit 後自行執行。
- **Rollback**：完整 dirty state、binary diff、untracked files、beta44／beta42 artifacts 與 metadata 保存在 `/Volumes/Working 2T/CODE/products/ThreadsBlocker-release-rollbacks/2026-07-16-beta44-pre-2.7.4`；HEAD／baseline 為 `73bd6e4ef916ccee35265cc1294b3ca36a3feac7`。
- **公告決策**：`site/announcements.json` 與 `src/announcements.js` 維持 byte-identical，不新增 2.7.4 active announcement。兩檔是獨立消息／CTA feed，現有 2.7.1 已 inactive；2.7.4 升版內容已有 release-notes modal，新增公告會重複彈窗，且本版沒有獨立外部消息／CTA。
- **Build**：唯一正式建置命令為 `SKIP_SAFARI_DEPLOY=true ./build.sh --release`，exit 0；`build.sh` 的 `SKIP_SAFARI_DEPLOY=true/1` guard 已永久保留，未設定時預設行為不變。
- **Version parity**：`src/config.js`、Chrome／Firefox manifest、Chrome／Firefox content breadcrumb 與 Userscript header 均為 `2.7.4`；正式三份 Chrome zip hash 與內容一致，且不含 `background.js` 或 manifest background。
- **正式 artifact SHA-256**：`dist/extension.zip`、`dist/threads_blocker_chrome.zip`、`dist/threads_blocker_chrome_v2.7.4.zip` 均為 `8a38156a677ced8a957e088cb76129043d975c78680e1af9642c4a09f89adf9c`；`dist/threads_blocker_firefox.xpi` 為 `7db012095ef0f42a2f8fbcec58efcb778786013ec85de703894565ab1a563efc`；`dist/threads_block_tool.user.js` 為 `e0bb267cd8fdc8a295f16a95a06eee1b270638bead987e53f09725bbe9d642dd`。
- **Rollback artifact parity**：beta44 versioned zip 保持 `66de42156b1eaf79a2b28b8be99f29f583ff385dff2f5bf84e933a8d9a723fe6`；beta42 rollback zip 保持 `8d83a01fc923a767b7f16a4794fccf6381a3d473a8103b871061289d50ee2310`。
- **Safari**：iCloud Safari Userscript target 保持 mtime `2026-07-06T16:45:21+0800`、`1043568` bytes、SHA-256 `d5419fe05d1a8925a4e98ef0f29d39a738eff4d5d1547ae2375114a47b2e589c`。
- **正式版邊界**：deterministic release gate 證明 `Utils.isBetaBuild() === false`、debug callbacks 為 `null`、檢舉／三無診斷 entry IDs 為空且不生成 UI；正式 extension unpacked／zip 均無 background service worker。
- **同意與偏好**：`platform-sync-v3`、`credentials-processing-v1` 不變；version migration 不觸碰 platform consent、credentials consent 或 manual／auto sync preference keys。
- **驗證證據**：privacy test `11 pass / 0 fail`；相關 JS `node --check` 14 個 exit 0；`bash -n build.sh` exit 0；`git diff --check` exit 0；artifact／announcement／debug UI／preference regression checks 均 exit 0。Topic amplification、schema、SQL placeholder 為本次純版本轉換範圍外，N/A。
- **限制**：本 closeout 不代表已發布、已送審或 installed truth 已更新；海哥需在 commit 後使用現有 Chrome／Safari 狀態自行 reload／test。
