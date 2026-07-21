# ThreadsBlocker 2.7.4-beta48 QA 計畫

## 結論先行

這是 beta48 的 QA gate 與人工重現計畫，不是 release approval。source 修正與 deterministic tests 已納入本 beta48 候選；仍不得 stage/commit、push、deploy、D1/R2 mutation 或發布。

目前候選為 `src/config.js = 2.7.4-beta48`，`README.md` 的正式版標示仍為 `2.7.4`。工作樹已有 beta47 與使用者原有 dirty changes，全部視為既有輸入，不可用清理或覆蓋方式取得「乾淨」基線。beta48 只有在 source、build、installed Chrome truth 與本計畫全部通過後，才可由使用者另行決定是否發布。

## 範圍與完成條件

本計畫只涵蓋 Chrome Extension 的手動三無追蹤者掃描 launcher/worker lifecycle、cursor/state/lock recovery、停止與 cleanup、兩種 owner 路徑，以及 beta47→beta48 的回歸與隱私 gate。三無判定規則、封鎖 worker、平台同步與 production backend 不在本次修改範圍；測試不得因修啟動而改變判定規則，也不得自動封鎖。

完成條件：

1. 所有入口、拒絕原因、launcher→worker handshake、state transition、背景/失焦續跑、reload/crash recovery、stop/complete/failed cleanup 均有可重現的證據。
2. `window.open()` 成功但 worker 未 bootstrap、被 Threads 阻擋、彈出視窗被擋、未登入，必須分別落到可診斷的 enum；不能只看視窗物件非 null。
3. failure snapshot 僅保留 `stage/result/count` 等允許欄位；不得出現帳號名單、完整 URL、DOM、token/cookie/authorization 或 request/response body。
4. source/unit/integration/browser 四層證據分開；fixture、headless 或 build 成功不得冒充使用者目前 Chrome 的 installed truth。
5. build/order/parity、rollback reference 與本文件最後的最短人工 Chrome 腳本全部完成；任一 blocker 即 FAIL，不宣稱 beta48 ready。

## 現況基線與已知缺口

已讀 `PROJECT.md`、`AGENTS.md`、`README.md`、`docs/BLOCKING_ARCHITECTURE.md`、`src/features/three-no-watch.js`、`src/main.js`、`CHANGELOG.md`、`src/config.js`、`build.sh` 與現有三無測試。現有 `tests/three-no-watch-finish-scan.test.mjs` 覆蓋完成/停止/失敗收尾與有界統計上傳，但未覆蓋 launcher handshake、owner 路徑、拒絕矩陣或 crash/reload。

beta48 `startManualScan()` 先檢查 Chrome extension、scan page、lock 與一般 worker busy；寫 `starting` 後呼叫 `window.open()`，並等待同一 `scanId` 的 ready sentinel/heartbeat。有界期限後回 `worker_bootstrap_timeout`，popup、blocked、未登入與啟動例外分別使用明確 enum；`window.open()` 非 null 不再代表 ready。

三無 beta-only debug ring log 目前另含 `current` 與截短後的 `url` 欄位；它只能是獨立的 beta debug export，絕不可拿來當 beta48 failure snapshot。snapshot 一律沿用 shared `debug_context_v2`，不得另造可含 `current`/`url` 的替代 schema；本 QA 若觀察到兩者混用，直接 FAIL 並保留最小化輸出證據，不自行修改 production 實作。

## 1. 入口與拒絕原因矩陣

| 入口 | 操作/前置 | 預期 request | 必測拒絕或錯誤 |
|---|---|---|---|
| 浮動選單「掃描三無追蹤者」 | 自己帳號路徑、非 scan page | `source=manual_menu`, 無 `targetOwner` | `not_chrome_extension`、`scan_page`、`scan_in_flight`、`worker_busy`、`popup_blocked`、`worker_start_failed`、`worker_bootstrap_timeout`、`worker_blocked`、`not_logged_in` |
| Profile 選單「掃描此帳號粉絲三無」 | 他人 profile 已解析到 username | `source=profile_menu`, `targetOwner=<normalized>` | 同上；另測 `owner_unknown`、profile path/target mismatch |
| 報告視窗「續掃」 | 既有結果含 `scanTargetOwner` / cursor | 重用正確 owner、cursor，不覆蓋既有 results | stale lock 清除後可重啟；不應因上一輪 completed cursor 把新輪拒絕 |
| 非 Chrome/Userscript/Safari | 任一 UI 入口 | 不啟動 worker | `not_chrome_extension` |
| 已在 worker scan page | 手動點擊或重複 callback | 不另開 popup | `scan_page` |
| 新鮮 scan lock/heartbeat | 另一 worker 正在跑 | 不改 lock/cursor | `scan_in_flight` |
| 一般 block/sweep worker 忙碌 | `BG_STATUS` fresh running 或 sweep active | 不啟動三無 | `worker_busy` |
| popup 回傳 null/closed | 瀏覽器 popup blocker | 清 lock、寫 failed snapshot | `popup_blocked` |
| popup 回傳非 null 但沒有 bootstrap | worker tab 空白、JS exception 或 Threads route 不載入 | 不得回報 `ok/running`；等 timeout 後清理 | `worker_bootstrap_timeout` |
| Threads 導航/內容被擋 | challenge、network blocked、worker 只載到 blank/error | 不得假裝 ready | `worker_blocked` |
| 未登入 | `Utils.getMyUsername()` 在 bootstrap deadline 內為空且出現登入 gate | 不建立有效 cursor | `not_logged_in`（不可與 `owner_unknown` 混用） |

每個 case 記錄 `scanId`、stage、result、counts、lock 是否清除；人工回報不得貼 username、完整 URL、DOM 或認證資料。

## 2. Launcher → worker ready handshake gate

### 必須存在的契約

- launcher 建立唯一 `scanId`，先寫 `starting`；worker bootstrap 後以同一 `scanId` 寫出不可偽造的 ready sentinel（例如 `readyAt`/heartbeat + worker tab marker），launcher 才能轉 `ready`。
- ready 必須能區分「popup 物件存在」與「worker 已載入 ThreadsBlocker、已讀取 scan query、已開始 heartbeat」。
- deadline 必須是有界且可測的（建議 10 秒，實作可有理由地不同）；逾時一定回 `worker_bootstrap_timeout`，清除 lock/command，保留可重試的 state。
- worker bootstrap 遇到 challenge/blocked 或登入頁必須回 `worker_blocked` / `not_logged_in`，不可等到 generic `worker_start_failed` 才失敗。
- handshake 訊息需帶 `scanId` 與 monotonic timestamp；舊 worker 或舊 scanId 的 ready 不得解鎖新 scan。

### 測試矩陣

| Case | Popup | Worker signal | 預期狀態/結果 |
|---|---|---|---|
| 正常 | non-null、未 closed | 同 scanId ready | `starting → ready → scanning` |
| popup 被擋 | null/closed | 無 | `failed`, `popup_blocked` |
| 假成功 | non-null | deadline 內無 signal | `failed`, `worker_bootstrap_timeout` |
| blocked | non-null | blocked signal | `failed`, `worker_blocked` |
| 未登入 | non-null | login gate / owner empty | `failed`, `not_logged_in` |
| 舊訊號 | non-null | signal 的 scanId 不同 | 忽略舊訊號，最後 timeout；不得誤進 ready |

## 3. Worker state machine

beta48 的可觀察狀態與合法轉移如下；`running` 只能作相容顯示，不可取代可驗證的 `ready`/`scanning`：

```text
idle
  └─ launch ─> starting
       ├─ ready handshake ─> ready
       │                      └─ first scan step ─> scanning
       │                           ├─ queue drained ─> completed
       │                           ├─ user stop ─> stopped
       │                           └─ exception/blocked/timeout ─> failed
       └─ popup/handshake/login failure ─> failed
```

逐一驗證：

- `starting`：只建立 lock、command 清除、最小 state；沒有自動封鎖或資料判定。
- `ready`：同 scanId worker heartbeat 已出現；失焦、背景、切 tab 不得停止。
- `scanning`：每個 candidate 只處理一次；cursor、checked count、candidate count 單調增加。
- `completed`：結果/cursor 寫入、aggregate upload 有界、lock/command/runtime backup 清除、worker 關窗；不啟動 block worker。
- `stopped`：保留已處理進度與可續掃 cursor，清 command/lock，不把未處理 candidate 標成已掃。
- `failed`：保留 enum/stage/count 與可重試 cursor；不得假完成、不得永久鎖死。

## 4. 背景、失焦、切 tab 與 lifecycle

Chrome installed truth 必測：啟動後切到另一個 tab、最小化/失焦 30 秒、回到 Threads 主 tab、關閉主 tab 但保留 worker（若 Chrome 行為允許）。worker 必須依 heartbeat/同 origin storage 繼續，不依賴 launcher window focus；主 tab 回來時 UI 讀到最新 state，不能重開第二 worker。

需同時驗證：瀏覽器 popup 名稱重用不會把舊 tab 當新 ready；主頁重新載入不會重複處理 candidate；`storage` event 與 polling 不會讓 count 倒退或重複累加。

## 5. Reload/crash recovery、cursor 與 lock

| 情境 | 操作 | 預期 |
|---|---|---|
| worker 正常 reload | 在 `ready` 或 `scanning` 重新整理 worker | 讀 runtime backup/cursor，繼續同一 scanId；不重掃已完成 username |
| worker crash/手動關閉 | 關閉 worker，等待 heartbeat 過期，再從主頁重試 | stale lock 被清除並標 `stopped`/可診斷 stale reason；可重新啟動，不永久鎖死 |
| 主頁 reload | reload launcher，worker 仍在跑 | 只讀現有 state，不另開 popup；停止按鈕仍可發 command |
| duplicate click/race | 兩 tab 同時點入口 | 只有一個有效 lock/scan；另一個 `scan_in_flight`，cursor 不重複 |
| completed cursor | 已完成且 `reachedEnd=true` 再按續掃 | 不破壞 completed results；明確提示無更多或開新輪次，不能清空既有報告 |
| stopped cursor | stop 後續掃 | 從未處理 candidate 接續，已 triaged/已掃集合去重 |

驗證 invariant：每個 username 至多一次有效 profile processing；state/lock/command 的 stale 清理可重試；任何 exception 後不留下永久 `starting`/`scanning` lock。

## 6. 自己帳號與指定帳號兩條路徑

### 自己帳號

浮動選單 → bootstrap 首頁 → 解析 `Utils.getMyUsername()` → 自己 profile → followers dialog → cursor。測試登入、未登入、username 暫時尚未出現、自己 profile 路徑錯誤；`owner_unknown` 與 `not_logged_in` 必須分開。

### 指定帳號

他人 profile 選單 → URL 直接帶 normalized `targetOwner`/`scanTargetOwner` → 指定 profile followers。測試 `@`、query/path 正規化、owner mismatch、private/blocked profile；結果 target owner、cursor owner、報告 filter 必須一致，不得 fallback 掃成自己的粉絲，也不得把 profile URL 當貼文 evidence。

## 7. Stop、complete、failed cleanup 與安全邊界

- Stop button 與主面板 stop 都只能寫三無 `stop` command、進 `stopping`/`stopped`，保留已掃進度；不得清空既有 results/cursor。
- `completed`：寫 results/cursor，再做有界 aggregate upload；upload pending/失敗不可阻塞收尾或改寫 status。
- `failed`：保留 `error` enum、stage、counts 與可續掃資訊；可重試時只重試未完成部分。
- 三種收尾都清除 scan lock、stop command、runtime backup；stopped/failed 不得送 aggregate upload，除非另有明確產品契約。
- 掃描結果只進本機管理清單；「加入封鎖清單」只排入正常 block queue，仍須使用者回主面板手動按「開始封鎖」。三無掃描不得自動封鎖，不得改 `noAvatar/noBio/noPosts/noReplies/noReposts` 的判定規則。

## 8. v2.7.1 report 12/19/31 重現矩陣

Repo 內沒有 report registry 或 12/19/31 的原始回報 payload；以下以已提供的原文建立 beta48 gate。#12 明確列為 ambiguous，不把它推論成 private/profile probe；若取得原始 payload，僅可補充操作細節，不得擴大驗收範圍。

| Report | v2.7.1 對應 family（待原始回報核對） | 重現操作 | beta48 必須證明 |
|---:|---|---|---|
| 12 | **ambiguous**：原文「沒有執行掃描三無爛封鎖」；證據不足，不能混淆掃描與自動封鎖 | 只驗證從自己帳號入口能否正確啟動三無掃描，以及掃描完成/報告 UI 明確不會自動封鎖；不綁 private/profile probe | launcher/結果 UI 可觀察；三無掃描不自動封鎖，加入封鎖清單後仍須使用者手動啟動；不得因本 case 改三無判定規則 |
| 19 | 原文「按下掃除三無，沒有跳出背景執行視窗，沒有『清除帳號』按鈕」；主要是 launcher/popup/handshake 與結果 UI | 從浮動選單與 profile 選單各啟動一次；測 popup blocker、popup non-null 但未 bootstrap、ready timeout，再檢查結果 UI 是否有清除帳號/清單處理入口 | `popup_blocked`、`worker_bootstrap_timeout` 等 enum 不被假成功吞掉；ready handshake 可證明 worker 已 bootstrap；結果 UI 顯示預期清除/管理按鈕 |
| 31 | 原文「每次掃描粉絲中的三無帳號時，都只會掃一下就停止，是否必須將畫面停在 Threads 畫面」；主要是背景/失焦續跑與 heartbeat/lifecycle | worker `ready/scanning` 後切 tab、失焦/最小化 30 秒，觀察多批 followers 是否持續；再測主頁 reload 與 worker reload/crash | 不要求畫面停在 Threads 主頁；heartbeat 持續、cursor 單調且不重複、可從 stale state 恢復，不永久 lock |

每個 ID 需保存：版本、操作步驟、期望/實際 stage/result/count、cursor/lock 是否清除、console error enum。不要保存帳號名單、完整 URL、DOM 或 credentials。

## 9. Privacy-safe failure snapshot gate

沿用 shared `debug_context_v2`，不另造 snapshot schema。三無事件固定使用 `stage=three_no`；`result` 必須是 shared implementation 的 allowlist 值（至少涵蓋 `popup_blocked`、`worker_bootstrap_timeout`、`worker_blocked`、`not_logged_in`、`stopped`、`failed`、`completed`），不得自由帶入帳號或頁面文字。`counts` 固定只擴充/使用 `checked`、`candidates`、`findings` 三個 keys。

允許事件形狀（以 shared `debug_context_v2` 包裝；欄位名稱依既有實作）：

```json
{
  "stage": "three_no",
  "result": "worker_bootstrap_timeout|worker_blocked|not_logged_in|stopped|failed",
  "counts": { "checked": 0, "candidates": 0, "findings": 0 }
}
```

允許額外 scalar 只限 shared `debug_context_v2` 已定義的 schema version、phase/route enum、monotonic timestamp、expiry；禁止 username/account arrays、target owner、完整或可還原 URL、HTML/DOM/textContent、request/response body、token、cookie、authorization、canary。以 entropy/regex 檢查 payload，而不是只看 UI。

目前 beta47 三無 debug ring log 的 `current`/`url` 欄位不屬於 shared snapshot；它必須與 `debug_context_v2` 分開標示、分開測試，不能升格為 failure snapshot，也不能用它繞過上述 privacy gate。

## 10. 分層測試與證據

| 層級 | 必測內容 | 可宣稱 | 不可宣稱 |
|---|---|---|---|
| Source/static | 入口/enum、狀態轉移、禁止 auto-block、snapshot schema、bundle order | 原始碼契約符合/缺口明確 | 真實 popup/Threads 行為 |
| Unit/fixture | launcher handshake timeout、scanId matching、state reducer、cursor 去重/cleanup | deterministic model 行為 | installed extension 成功 |
| Integration | 真實 storage event、跨 tab heartbeat、worker reload/crash、upload timeout | 本機整合流程 | 使用者 Chrome profile |
| Browser installed truth | 本機 Google Chrome 目前 profile、以本次 `dist/extension` reload、真 Threads tab | installed/version/DOM/lifecycle 證據 | headless/HTML preview 代替目前 Chrome |

現有 `tests/three-no-watch-finish-scan.test.mjs` 與 `tests/three-no-watch-beta48-launcher-contract.test.mjs` 分別覆蓋收尾與 launcher/handshake fixture；仍需以 installed Chrome truth 補足跨 tab、失焦與 crash/reload 證據。

## 11. Build、order、parity 與 rollback gate

本次含 runtime source 變更，版號已升至 beta48。候選 build 使用：

```sh
SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump
node --test tests/three-no-watch-finish-scan.test.mjs tests/three-no-watch-beta48-launcher-contract.test.mjs
node --check dist/extension/content.js
unzip -p dist/extension.zip content.js | node --check --input-type=commonjs
```

QA 必核對：`src/config.js`、UserScript banner、extension manifest、`dist/extension/content.js`、zip 內 content 與版本化 zip 的版本/內容；beta build 應有 beta-only `background.js`，正式 build 不應有。確認 bundle order 為 config → utils/storage → reporter/ui/core → features → worker → main（含本次實際 feature import），不得採用歷史或未本次驗證的 zip。

Rollback reference：保留本次驗證的 beta47 source/artifact 與 commit（目前 HEAD `9423a43` 為 three-no finish close 修正；實際 release rollback 仍需由 release QA 指定最後一個 verified artifact）。若 beta48 blocker，停用/移除本次 unpacked extension，重新載入該 verified beta47 artifact；先只讀備份並核對三無 results/cursor、scan state/lock、BG/REPORT queue，不執行 migration 或資料寫入。正式發布、商店上傳、deploy、push 均需使用者另行明確批准。

## 12. Pass/Fail gate

**PASS**：入口與拒絕矩陣全通；ready handshake 有 scanId/timeout/明確 enum；state 只走合法轉移；失焦/切 tab/reload/crash 不重複、不永久鎖；自己/指定 owner 一致；stop/complete/failed cleanup 正確；不自動封鎖且判定規則未變；report 12/19/31 重現通過；snapshot privacy gate 通過；unit/integration/browser 分層證據齊全；build/order/parity/syntax 與 rollback reference 通過。

**FAIL / blocker**：只憑 `window.open()` 成功判 ready、任一啟動錯誤被吞成 generic、login/blocked 與 popup 混淆、cursor 重複/遺失、永久 lock、切 tab 停止、scan 完成自動封鎖、判定規則漂移、snapshot 含禁止欄位、只用 mock/headless 冒充 installed Chrome、artifact stale/parity 不一致，或任何未授權 deploy/publish。

## 最短人工 Chrome 腳本（使用者執行）

1. 在目前 Google Chrome profile 開一個 Threads tab；只回報 Chrome/extension 版本、URL 類型與是否已載入本次 `dist/extension`，不要貼 cookie/token/帳號名單。
2. 從本次 QA build 載入/reload unpacked `dist/extension`，確認 breadcrumb/manifest 版本；保留原有其他 extension 狀態。
3. 浮動選單啟動「掃描三無追蹤者」（自己帳號），再從他人 profile 啟動「掃描此帳號粉絲三無」（指定帳號）；各記 `stage/result/count`。
4. 逐次測 popup blocker、popup 有但 worker 空白/未 bootstrap、Threads blocked/challenge、未登入；確認分別為 `popup_blocked`、`worker_bootstrap_timeout`、`worker_blocked`、`not_logged_in`，而不是成功或 generic。
5. worker 進 `ready/scanning` 後切 tab、失焦 30 秒；接著在 `starting/ready/scanning` 各做一次 worker reload/關閉，等 stale heartbeat 後從主頁重試，確認 cursor 不重複、lock 可清、可續跑。
6. 對一批分別按 stop、等待 complete、製造一次 failed；確認 command/lock/runtime cleanup、結果 status 與 counts，且不自動封鎖；若加入封鎖清單，另回主面板手動按開始封鎖。
7. 以 report 12/19/31 的 canonical case 各跑一次，並在 console/network 只檢查 `stage/result/count`；確認 failure snapshot 沒有帳號名單、完整 URL、DOM 或認證資料。

人工回報格式只需：`case/report id → PASS/FAIL → stage/result/count → lock/cursor cleanup yes/no → console error enum`。

## 自動化缺口與本次證據

- 現有自動測試只覆蓋 `finishScan` 收尾；沒有 launcher ready handshake、timeout、blocked/login、兩條 owner 路徑、跨 tab focus、crash/reload idempotency、report 12/19/31 或 installed Chrome。
- 本計畫新增的 launcher contract fixture 驗證 popup null、ready timeout、錯誤 scanId 與同 scanId ready；若失敗，保留精確 stage/result/count 證據，不以 mock 結果冒充 installed Chrome。
- 沒有使用者目前 Chrome 的版本、URL、安裝 extension breadcrumb 或 live Threads tab 證據前，不能宣稱 beta48 ready；headless/fixture 只能作分層中的 source/unit/integration 證據。
