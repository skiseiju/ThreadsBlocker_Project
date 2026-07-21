## v2.7.4-beta64 — wait for lazy Likes rows before clean-list end

* **TL;DR：**移除 verified Likes clean-list 在初始無 scroll range 時的過早 `atBottom` 結束；沿用連續 4 次無進度才結算，讓 Threads 延遲載入的 Likes 名單有機會展開。仍是 beta，未宣稱 live/installed PASS。
* **範圍：**只改 `Core.collectFullDialogUsers()` clean-list loop；不改 selector、scroll-root、reservoir、owner/self/reply policy 或 enqueue。
* **驗證：**新增 beta64 lazy-load production-path fixture；測試、build/parity 與 live 人工驗收結果另記於 `docs/QA_2.7.4_BETA64.md`。

## v2.7.4-beta63 — verified Likes owner policy split

* **TL;DR：beta63 修正 verified Likes clean-list 將貼文作者誤當 eligibility skip 的 policy regression；clean-list 保留 Likes 中的 post owner，仍排除 trusted self 與 reply target；post-reservoir／定點絕維持排除 post owner。仍是 beta，不代表 Threads live/installed PASS。**
* **最小 policy split**：`Core.collectFullDialogUsers()` 在 verified Likes clean-list 預設 `skipPostOwner=false`；`SweepDriver.collectBatch()` 與其 fallback 明確 `skipPostOwner=true`。`buildSkipUsers`／`getSkipUserBreakdown` 共用同一 flag，避免 eligibility 與 diagnostics 分歧；其他 unverified、Quotes、follower 與非 Likes 路徑維持 fail-closed／既有 owner skip。
* **驗證邊界**：beta63 executable owner-policy fixture **4/4**、targeted **70/70**、privacy **30/30**、full **144/144**、syntax、build/parity 與 `git diff --check` 通過，詳見 `docs/QA_2.7.4_BETA63.md`。未操作使用者 live/installed browser、未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta62 — aggregate Likes anchor-filter diagnostics

* **TL;DR：beta62 只補 verified Likes exact-anchor diagnostics，不改任何收集、排除、結算或 enqueue 行為；將 readiness links 與 collector accepted/filtered accounts 拆成可平衡的 privacy-safe aggregate counters。仍是 beta，不代表 Threads live/installed PASS。**
* **Aggregate boundary**：每個 exact-anchor batch 記錄 `exactLinkCount`、`uniqueExactAccountCount`、`duplicateExactLinkCount`、`acceptedUniqueAccountCount`，以及 invalid、invisible、out-of-bounds、heading/header、navigation、nested-dialog exclusions；`classifiedLinkCount`／`unclassifiedLinkCount` 提供 input balance invariant。
* **Readiness／runtime diagnostics**：Likes readiness snapshot 另記 `uniqueCandidateCount`，保留 `candidateCount`（links）與 `rowCount`（rows）原有語意；clean-list rows 與 `anchor_filter`、post-reservoir rows 與 `anchor_filter` 都只輸出 allowlisted numeric aggregates。禁止 username、href、URL/path/query、text、DOM/HTML/class、UA/IP/hwid/signature/raw metadata。
* **驗證邊界**：beta62 fixture **7/7**、targeted **66/66**、privacy **26/26**、full **140/140**、syntax、build/parity 與 `git diff --check` 通過，詳見 `docs/QA_2.7.4_BETA62.md`。未操作瀏覽器、未宣稱 live/installed PASS，未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta61 — raw observed Likes evidence before downstream skips

* **TL;DR：beta61 修正 verified Likes exact-anchor collector 先套 owner/self/reply skip、導致整頁只剩被排除帳號時誤判 `rows_missing` 的 regression；先保存 raw observed/valid evidence，再由 clean-list／post-reservoir downstream 產生 eligible 與 skip breakdown。仍是 beta，不代表 Threads live/installed PASS。**
* **Raw／eligible 分離**：verified Likes readiness 與 exact `/@username` boundary 不變；normalized duplicate、header/nav/tab/profile-header 仍在 collector boundary 排除，但 owner、trusted self、reply target 與 queue 等 eligibility skip 不在 collector 前置過濾。只含被排除帳號的頁面仍可觀測、到達 end/empty outcome，不會被誤標 `rows_missing`。
* **Diagnostics／fail closed**：rows diagnostics 同時保留 observed row/valid counts、eligible count 與 privacy-safe owner/self/reply skip counts；unverified、Quotes、follower、Likes readiness 失敗與 unknown rows 路徑維持 fail closed／atomic commit。
* **驗證邊界**：beta61 fixture **4/4**、targeted **59/59**、privacy **19/19**、full **133/133**、syntax、`git diff --check` 與本次 build/parity 通過。未操作瀏覽器、未宣稱 live/installed PASS，未 deploy、上傳商店、push 或發布正式版。
* **Build artifacts**：`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump`；Chrome zip 三份內容與 SHA-256 相同，詳見 `docs/QA_2.7.4_BETA61.md`。

## v2.7.4-beta60 — verified Likes exact-anchor recovery

* **TL;DR：beta60 修正 Likes tab live 23→2 refresh 後，真實 liker 只有 exact `/@user` anchors、沒有 synthetic row／Follow／heart shape 時被 strict row gate 誤拒的 regression；仍是 beta，不代表 Threads live/installed PASS。**
* **Readiness-gated fallback**：只有 `waitForLikesContextReady()` 已驗證 Likes context 後，clean-list 與 post-reservoir 才從該 top live dialog/context 收集 visible exact profile anchors；Quotes、unverified、follower 與切換失敗路徑不啟用。
* **Boundary / dedupe**：排除 header、navigation、tab、post owner、trusted self、reply target，normalized username 去重；不把 fallback 放回 global 或未知 dialog collector。
* **驗證邊界**：beta60 fixture **5/5**、targeted **55/55**、privacy **15/15**、full **129/129**、syntax、`git diff --check` 與 build/parity 通過。未操作瀏覽器、未宣稱 live/installed PASS，未 deploy、上傳商店、push 或發布正式版。
* **Build artifacts**：`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump`；Chrome zip 三份內容與 SHA-256 相同，詳見 `docs/QA_2.7.4_BETA60.md`。

## v2.7.4-beta59 — clean-list self-scope 與 scroll-root diagnostics 修正

* **TL;DR：beta59 修正 beta58 live diagnostics 暗示的 Likes clean-list regression：dialog liker 不再被誤認為 self，clean-list 與 post-reservoir 改用同一個有證據排名的 scroll root；仍是 beta，不代表 Threads live/installed PASS。**
* **Self scope**：`Utils.getMyUsername()` 只接受可信 `nav`／`[role="navigation"]`／明確 sidebar profile control；dialog、main/feed、pressable content、profile/activity list 與一般 post/profile header 都 fail closed，沒有可信 self evidence 時回 `null`。
* **Scroll lifecycle**：兩條收集路徑共用 `DialogCollector.findScrollableRoot()`，依 account-row evidence／深度排名，排除 stacked/background dialog；scroll loop 以真正 root 的 before/after `scrollTop`、`scrollHeight`、`clientHeight` 與 visible unique progress 判斷 end／scroll_stall，progress UI 不再改變 root metrics；結果維持完整才 atomic commit，不完整就 rollback。
* **Diagnostics**：新增 privacy-safe `selfSkippedCount`、`ownerSkippedCount`、`replySkippedCount`，以及 `scrollAttempt`、before/after scroll metrics、`atBottom`、`progress`、`rootAdvanced`、selected strategy；只保留 counts／booleans／enums，禁止 username、href、URL/path、text、DOM/class、raw metadata。
* **驗證邊界**：beta58 verified Likes、self/dialog/nav/header、trusted nav list wrapper、outer-overflow nested scroll fixture、raw-link decoy vs verified rows、verified Likes token forwarding、skip breakdown、end vs stall contract 均通過；targeted **35/35**、full **124/124**、privacy **20/20**、syntax、`git diff --check` 與本次 build/parity 通過。未操作瀏覽器、未宣稱 live/installed PASS，未 deploy、上傳商店、push 或發布正式版。
* **Build artifacts**：`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump`；Chrome zip 三份內容與 SHA-256 相同，詳見 `docs/QA_2.7.4_BETA59.md`。

## v2.7.4-beta57 — 全流程 observability 與 terminal-safe diagnostics

* **TL;DR：beta57 延續 beta56 的 Likes 23→2 semantic readiness／atomic 修正，將 beta diagnostics 擴至 blocking/report、selection/UI、three-no worker、clean/follower/reservoir、bug report/runtime 全流程；正式版 gate 維持關閉。**
* **共用 diagnostics core**：所有 operation 可用同一 operationId 記 start→state→terminal；200 筆 bounded ring 對 start/stop/error/commit/rollback/finish 提供 terminal priority，observer/route/scroll 高頻事件維持 change-only/coalesce，export 附 feature summary。
* **Privacy/stable**：只記 normalized enum、counts、booleans、strategy、reason、timing、HTTP status bucket 與 sanitized error name/code/function/line；不記帳號、內容、URL/path/query/ID、HTML/class、UA/IP/hwid/signature/raw metadata。stable/release flag 關閉時不建立 entries、observers、UI 或 payload。
* **Reviewer blocker 修正**：panel mount/state/hide/show/reposition/clamp/route suppression/close、selection transaction、clean-list caller→collector、blocking/report safety branches、three-no 跨 window worker lifecycle 全部共用 operationId；HTTP bucket 改為 `success`/`client_error`/`server_error`/`network`，不再被 coalesce 合併。
* **第二輪 blocker 修正**：primary/fallback network reject 都寫入同一 report operationId 的 `network` bucket 並 terminal；collector/follower/three-no early return 與 exception 收口；retry/cooldown/breaker 補 state/terminal；stable gate 強制移除 diagnostics attachment；舊 report/three-no/DOM debug export 改為 beta-only RuntimeDiagnostics allowlist schema。
* **第三輪 blocker 修正**：owner-scoped/legacy three-no stop probe 先取得 owned command；Worker init hard-cooldown 與 verify breaker 都寫 retry/failure/breaker/cooldown 並 terminal、清 operation map。
* **驗證邊界**：新增 adversarial network/collector/stable-export/stop/breaker probes；targeted、privacy、full regression（108/108）、syntax、diff check 與本次 build/parity 均通過。未操作瀏覽器、未宣稱 live/installed PASS，未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta56 — Likes semantic readiness 與 diagnostics coalesce

* **TL;DR：beta56 修正 live Likes sequence 在 23→2、selected=false、無 heart evidence 時被舊 gate 誤判 `likes_tab_switch_failed`；改用 context/root/list 變化、semantic rows、非 loading 與穩定觀察確認 readiness。仍是 beta，不代表 live PASS。**
* **Likes／post-reservoir**：already-Likes、延遲 render、semantic switch 與真正失敗仍共用 strict fail-closed／atomic commit/rollback；no-op click 沒有 context/root/list 變化時仍拒絕。post-reservoir 使用同一 gate。
* **Diagnostics**：高頻相同 feature/stage/allowlist fields 一秒內 coalesce 為 `repeatCount`，clean-list stage/state-change 不被 message-route noise 淹沒；privacy allowlist、stable disable 與 beta55 attachment fallback 保留。
* **驗證邊界**：targeted 7/7、privacy 11/11、full 95/95、syntax、privacy、build/parity 通過；未操作瀏覽器、未宣稱 live PASS，仍需使用者重跑實際 clean-list Likes 並複製 sanitized diagnostics；未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta55 — session diagnostics、粉絲捲動與回報降級

* **TL;DR：beta55 提供 beta-only 200 筆 session diagnostics ring、複製／清除入口與 deep allowlist sanitizer；stable/release 完全停用。仍是 beta，不代表 live browser 已修好。**
* **Privacy boundary**：Likes／粉絲／message stage logs 只保留 enum、bounded counts／timing／geometry／布林 signals；不含帳號、訊息、貼文、HTML/class、完整 URL/path/query/ID、UA、IP、hwid、signature 或 raw metadata。診斷 attachment 需明確同意且只送 sanitized schema；backend 拒絕 attachment 時自動降級為 message-only report。
* **Message route hardening**：route 不匹配時只接受 visible conversation list／active pane、composer/action 同 active pane、共享可見相鄰 layout ancestor 的 cohesive split-view；detached、hidden、global signal 與一般 reply composer 都 fail closed。diagnostics 只記 `visible`／`sameRoot`／`cohesive` 等 allowlisted signals。
* **Follower lifecycle**：使用實際 nested scroll root、live context refresh、lazy render bounded wait、virtualized accumulation、bounce/retry、stop／timeout／max-scroll 上限；不宣稱 Likes/message live fixed，第三方 extension 關閉後的 clean-list reproduction 仍依 stage log 定位。
* **驗證邊界**：targeted 10/10、full 87/87、syntax、privacy、build/parity 通過；未操作 Chrome/Edge，未宣稱 live PASS。需要使用者在 beta 實機跑一次並複製 sanitized diagnostics；未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta54 — 粉絲摘要、Likes atomic 收集與 SPA 面板生命週期

* **TL;DR：beta54 將粉絲收集結果改為白話摘要、保留未載入數量的明確提示；Likes 清理維持完整成功才一次提交；待命／停止與 message/chat 路由面板生命週期補上回歸契約。仍是 beta，不代表正式版或 live browser 通過。**
* **Follower summary**：一般確認視窗不顯示 `threads_partial`、bounded cap 或 reason code；175/96/16/80 類型的不完整結果會說明目前只載入 96 位、這次新增 16 位、80 位已在名單中，約 79 位尚未載入。內部 diagnostics 仍可保留 bounded code。
* **Likes／clean-list**：已在 Likes、成功切換及切換後延遲 render 都等待可證實的 current evidence；只有完整成功才 commit。真正失敗才 rollback，不完整結果不新增 pending/checked side effects，並以 warning/error 白話 toast 呈現。
* **Panel lifecycle**：無 active task 時顯示「待命中」且隱藏停止操作；active stop latch 與 selection checkbox regression 保留。修正 reviewer blocker 後，只有 `routeMatch && real message shell` 才隱藏 message/chat route 的 floating panel/chip；text-only Messages 與普通頁不誤傷、不清 pending。回到一般 SPA route 重新 attach/measure，stale 或越界位置才 clamp，resize 維持 viewport 內。
* **驗證邊界**：自動測試、syntax、build 與 artifact parity 需通過；本輪未操作 Chrome/Edge，未宣稱 Threads live、installed extension、CWS 或其他瀏覽器人工 PASS，未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta53 — follower coverage breakdown 與 clean-list atomicity

* **TL;DR：beta53 補上粉絲收集的 total hint／observed／eligible／skip breakdown、多輪底部穩定確認與 partial/limited 原因；clean-list Likes 改為 staged atomic commit/rollback；仍是 beta，不代表正式版發布。**
* **Follower coverage**：UI 顯示 total hint、observed、eligible、duplicate/self-target/blocked/queued/unknown skips；多輪 bottom stability 防止虛擬化部分名單（例如 96/175）誤標 `end`，保留 `threads_partial`、`scroll_stall`、`limited`。
* **Clean-list atomicity**：已在 Likes context 時可直接使用 current evidence；tab retry、row/timeout failure 均 rollback pending/checked，失敗 toast 使用 warning/error severity；成功才一次 commit。
* **驗證邊界**：beta52 stop/checkbox manual PASS 與 beta51 A/private/report regression 保留；未宣稱 beta53 live browser PASS，未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta52 — bounded row lifecycle、停止 latch 與 selection snapshot

* **TL;DR：beta52 收口 clean-list／粉絲 collector 的 bounded real-row boundary、初始載入終點判斷、停止 visibility latch、selection snapshot/latch 與粉絲收集文案；仍是 beta，不代表正式版發布。**
* **Clean-list／Likes**：button → row inventory → collector 共用 bounded row helper；shared ancestor 不會借用 heart evidence，找不到可信 row 時 fail closed。
* **Follower lifecycle**：profile entry → followers dialog → collector → confirm → `BG_QUEUE`；initial-render 以有界 observation gate 等待延遲注入，0 evidence 回 `rows_missing` 且 `ok:false`，unknown rows 回 `rows_unknown`，只有明確空狀態才回 `empty_end`，並維持 bounded stop/50 cap。
* **Stop／selection UI**：stop visibility 使用 storage-backed latch，terminal drain 後清除；running selection 以 snapshot/latch 與 active queue 分離，避免 queue shift 或 React replacement 造成 checkbox 閃爍或永久 checked。
* **驗證邊界**：beta51 interest/private/report/failure-list 與 beta50 stop/close/privacy regression 保留；未宣稱 beta52 人工 live Chrome PASS，未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta51 — 私人帳號 gate、逐筆失敗處理與粉絲收集

* **TL;DR：beta51 整合 semantic More／私人帳號 gate、逐筆失敗清單與指定 profile 粉絲收集；仍是 beta，不代表正式版發布。**
* **Auto-block gate**：profile root 只接受 scoped semantic `<button>` More，拒絕 search/tags ancestor；private profile 有 validated More 時繼續走 More → menu → action → confirm，只有 gate 缺失才回 `private_manual_required`。
* **Private report blocker fix**：私人 profile 的只檢舉流程不再在 More 前提前返回；先完成可信 More → menu → report path，只有缺少後續 gate 才回 `private_manual_required`，並保留佇列前進與非 rate-limit 分流。
* **Failure queue**：舊 string 與 structured entry 相容；reason 維持 bounded/local-only，支援單筆重試、單筆清除、開啟個人頁與既有全部操作，不會由 profile link 自動封鎖。
* **Profile followers**：只收明確 row、排除 self/target/blocked/queued、上限 50、virtualization 去重、stall/stop 有界；確認後才加入 `BG_QUEUE`，不做全域盲抓。
* **驗證邊界**：全套測試、syntax、build/parity 需通過；未宣稱人工 Chrome/live/CWS，未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta50 — 整合診斷、名單生命週期與三無停止契約

* **TL;DR：整合 beta47–49 修正並補齊 beta50 regression gate；beta50 仍是 beta，不代表正式版發布。**
* **Privacy-safe diagnostics**：block/report A/B 路徑使用 closed phase schema 與 bounded counts/timing，未知或敏感欄位 fail closed。
* **Likes／clean-list**：Likes 只採單列 typed heart evidence，shared ancestor 不會誤收；React replacement/reparent 後 clean-list listener 可重綁且維持 exactly-once。
* **Controller／三無 lifecycle**：主面板第一列使用明確狀態與 active priority；structured stop command 加入 scan/owner fence，late heartbeat 不可 revive，stopped terminal persist/cleanup 後只 close 一次。
* **QA follow-up**：stale `BG_STATUS` terminal 不再壓過 fresh three-no；自動問題回報 attachment 改為 closed diagnostics schema 並移除 consent upload 的 client-environment attachment；finish cleanup 的 close exception／duplicate finish 維持 exactly-once。
* **範圍**：本輪僅做本機版本 bump、測試、build 與 artifact parity；未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta49 — Likes 名單只收可證實的按讚列

* **TL;DR：修正貼文互動名單在 virtualization／Quotes 混入時，把非 Likes 使用者加入收集結果的問題；beta49 仍是 beta，不代表正式版發布。**
* **Likes 分類**：捲動每一批 row 時立即保存 heart evidence；只累積可證實的 Likes，virtualized row 移除後不會遺失分類；分類衝突採保守排除。
* **Fail closed**：Likes tab、row 結構或 tab switch 無法正面識別時停止並保留明確 reason；heart 篩選為空不再 fallback 全 users。
* **範圍**：#24 為本輪 bug；#10 保留為功能建議／重複脈絡，不宣稱已修復。profile/post/dialog/composer checkbox 僅做現版 regression，未因歷史報告猜測修改。
* **隱私／發布**：未新增上傳欄位或帳號清單輸出；未 deploy、上傳商店、push 或發布正式版。

## v2.7.4-beta48 — 三無 worker handshake 與 lifecycle recovery

* **Launcher handshake**：三無掃描先寫 `starting`，只有同一 `scanId` 的 worker ready sentinel/heartbeat 在有界期限內出現，才轉為 `ready`；popup null、bootstrap timeout、blocked、未登入與啟動例外分開回報。
* **Lifecycle / recovery**：狀態收口為 `starting → ready → scanning → completed/stopped/failed`；失焦、reload、stale heartbeat 可依 cursor/runtime backup 接續，stop/failed/complete 都清除 lock、command 與 runtime，未完成進度可重試。
* **Owner / privacy**：自己帳號與指定 target owner 維持一致，不以自己帳號 fallback；shared `debug_context_v2` 新增 `three_no` 與固定 `checked/candidates/findings` counts，snapshot 不帶帳號、URL、DOM 或認證資料。三無結果仍只存本機，不會自動封鎖。
* **邊界**：beta-only 驗證與 build 完成不代表 installed Chrome truth；未 deploy、未上傳商店、未 push 或發布。

## v2.7.4-beta47 — More 安全定位與失敗原因拆分

* **TL;DR：封鎖與只檢舉共用 fail-closed More locator，拒絕 search/tags link 與不可信 shape fallback；空選單、導航不符、私人帳號與明確平台限制不再混為同一種冷卻。**
* **Profile root contract**：profile More 只在 caller 以 `Core.findProfileRoot(username)` 驗證 username header 與 profile action anchor 後傳入的 root 內尋找；未驗證 root 不使用全頁文字或全域 More 猜測。
* **流程結果**：`menu_not_found`、`navigation_mismatch`、`private_manual_required`、`vanished`、`rate_limited`、`cooldown` 分開處理；只有明確 Threads 限制訊息可累計。連續 3 次冷卻僅屬 block worker；只檢舉遇到限制時只提示、跳過並繼續佇列，不自動冷卻，找不到選單也會進失敗／可重試路徑。
* **問題回報**：新增 privacy-safe `debug_context_v2`／failure snapshot（48 小時、最多 25 筆、只含 enum／階段／路由類型／counts）；成功清除。回報可只送問題描述，完整診斷附件維持未預勾且單次同意。
* **版本／邊界**：runtime 版本升至 `2.7.4-beta47`；未 deploy、未改 production schema、未更新 bug status、未發布商店。

## v2.7.4-beta46 — 只檢舉選單慢載入容錯

* **TL;DR：只檢舉開啟 Threads 選單的等待與重試節奏對齊封鎖 worker，避免 Firefox 同時啟用會延遲選單的擴充功能時，過早誤判為找不到檢舉項目。**
* **選單容錯**：檢舉選單最長等待 8 秒；3 秒後仍沒有原生 menu item 時只重點一次「更多」，與封鎖機制一致。
* **路徑容錯**：每層檢舉選項等待放寬為 8 秒；不改檢舉路徑、每日提醒門檻、封鎖 worker、storage key 或同意設定。

## v2.7.4-beta45 — 三無掃描完成關窗修正

* **TL;DR：三無掃描完成後，統計上傳改為有界等待，正式版與 beta 都會在 `completed` 後排程關閉 worker 分頁；停止／失敗狀態與既有清理流程不變。**
* **Worker lifecycle**：aggregate stats upload 最多等待 1.5 秒；上傳端點永遠 pending 時仍會繼續關窗，不改寫掃描狀態。
* **Storage / preference**：未新增三無結果、lock、command、runtime backup 的 migration；`platform-sync-v3`、`credentials-processing-v1`、資料上傳同意與既有自動／手動偏好均不變。

## v2.7.4 — 隱私一致性正式版收口

* **TL;DR：2.7.4 正式版將 beta44 的隱私同意、上傳 gate、問題回報 scrub 與公開樣本 legal gate 收口；既有同意與每日自動／手動偏好不因去除 beta 標籤而重置。**
* **Credentials opt-in**：Chrome 加速三無維持獨立版本化 `credentials-processing-v1` 同意，預設關閉；token 與同站 session cookie 只在 Threads 同站本機暫時處理，不送到 ThreadsBlocker、平台或問題回報端點。
* **Platform consent**：平台同步維持 `platform-sync-v3`；舊版或舊政策同意不會因正式版轉換自動升級，auto、repair、manual 與三無統計偏好沿用原值並繼續受 policy gate 保護。
* **問題回報**：每次送出前重新取得未預勾的診斷附件同意，request token、cookie、authorization 與 canary 先 scrub；正式版不提供手動匯出 beta-only 檢舉／三無診斷入口。
* **公開觀測站**：公開樣本預設維持句型描述模式；只有 legal policy version、去識別、門檻與人工核准條件全部符合才可公開短摘錄，public GET 維持唯讀、不建立 review queue。

## v2.7.4-beta44 — 隱私同意、上傳 gate 與公開樣本 legal gate

* **TL;DR：建立 2.7.4-beta44 候選，補齊 credentials opt-in、platform-sync-v3、問題回報同意/scrub、公開樣本 legal gate 與 public GET 零寫入；不代表已發布。**
* **Credentials opt-in**：Chrome 加速三無改為獨立版本化 `credentials-processing-v1` 同意，預設關閉；未同意時 page bridge 不掃描 document state、不 patch fetch/XHR、不處理 request body/token，並保留一般三點 fallback。明確同意後的 token 與同站 session cookie 只在 Threads 同站本機暫時處理，不會送到平台或問題回報。
* **Platform consent**：平台同步改用 `platform-sync-v3`；舊 v2 / 數字版同意不 migration 成 v3。v3 未決定前 auto、repair、manual 與三無統計 upload 都回 `pending_version_consent` 且不得送。
* **問題回報**：送出前列明診斷附件，checkbox 不預勾；未同意不得送，payload 送出前 scrub request token、cookie、authorization 與 canary。
* **觀測站**：public projection 預設 `samplePublicationMode=description`；只有環境 legal policy version 與 code 常數完全匹配，且 row 通過門檻、去識別與人工 `approved`，才可 `reviewed_text`。description mode 的 `topicCards[].samples` / `repeatedPhrases` 為空，patternDescription 不由原文衍生；pending / rejected 永不公開。
* **API 與口徑**：public overview GET 不建立 queue 或其他寫入；外部文案將 `observer_count` 稱為「來源貼文數」、`account_count` 稱為「帳號觀測筆數」，不宣稱獨立使用者或獨立帳號。
* **文件與測試**：同步隱私頁、首頁、CWS listing、README、Topic SDD、ADR 0009，新增可直接照填的 CWS privacy practices 草稿與 deterministic privacy tests。

## v2.7.4-beta43 — B8 話術樣本覆核佇列與動態事件錨點

*   **TL;DR：新增去識別化話術樣本的人工覆核佇列與公開卡片句型描述，並讓最近 14 日政治事件可自動形成去重錨點。**
*   **樣本與隱私**：只有達到至少 20 個帳號、3 個獨立觀測來源的樣本才進入 pending 佇列；公開端只讀 approved 的去識別化文字，帳號名稱不自動剔除而交由人工覆核，公開模板不使用「網軍／機器人／假帳號／側翼」定性詞。
*   **Worker API**：新增 `topic_sample_reviews` derived table、admin 列出/核准/拒絕端點與 API thresholds；不改變既有平台上傳 payload 欄位或 extension 同意、每日自動/手動上傳偏好。
*   **Storage / 偏好**：新增的是 Worker D1 覆核佇列，不是 extension storage key；`platform-sync-v2` 與既有本機偏好不因 beta 版號重置。

## v2.7.4-beta41 — CWS Credentials 隱私揭露補強

*   **TL;DR：依 Chrome Web Store 退件信指定的 `credentials` 類型，補強隱私政策與 CWS listing draft，明確說明留友封不收集、不讀取、不儲存、不上傳也不分享認證資訊。**
*   **隱私政策**：`/privacy/` 新增 Credentials / 認證資訊資料表列與專段說明，涵蓋 Threads 密碼、登入憑證、雙因素驗證碼、session cookies、access tokens、refresh tokens 與 OAuth tokens。
*   **CWS 文案同步**：首頁摘要與 `docs/CWS_LISTING_DRAFT.md` 同步使用 CWS 審查字眼 Credentials / authentication information，避免審查員只看到「密碼」而判定未揭露 credentials 類型。
*   **Storage / 隱私**：未新增 extension storage key；未變更平台同步同意版本 `platform-sync-v2`、上傳資料範圍、每日自動/手動上傳偏好或本機資料讀寫流程。
*   **歷史口徑更正（beta44）**：本節「不收集、不讀取、不儲存、不上傳也不分享認證資訊」的宣告與當時 page bridge 實作不一致，屬歷史錯誤揭露；beta44 改為如實說明獨立 `credentials-processing-v1` opt-in、預設關閉、只在 Threads 同站本機處理且不外傳。此更正保留 beta41 的歷史紀錄，不將其改寫成不存在。

## v2.7.4-beta40 — 官網隱私頁品牌規範整理

*   **TL;DR：統一產品首頁與隱私權政策頁的品牌 banner、導覽列、色票與資料揭露入口，讓 Chrome Web Store 審查只指向 `/privacy/` 這份正式政策。**
*   **官網整理**：首頁「隱私政策」改為「隱私與資料邊界」摘要，明確標示完整隱私權政策頁是唯一正式版本；隱私頁 hero 改成與首頁一致的「留友封 / ThreadsBlocker」品牌結構。
*   **CWS 隱私口徑**：`/privacy/` 保留完整收集、處理、儲存、分享、刪除與 Limited Use 內容；首頁不再保留第二份長版政策，避免舊日期或重複口徑誤導審查。
*   **Storage / 隱私**：未新增 extension storage key；未變更平台同步同意版本 `platform-sync-v2`、上傳資料範圍、每日自動/手動上傳偏好或本機資料讀寫流程。

## v2.7.4-beta29 — Chrome profile header checkbox 修正

*   **TL;DR：修正真實 Chrome / Threads 頁面沒有 `main` / `role=main` 時，profile header checkbox 仍不會出現的問題。**
*   **Profile checkbox**：profile root 新增支援 Threads 目前的「直欄內文」容器，並避開頂部 sticky 標題列，改插在真正 profile header 的 username 旁。
*   **Chrome installed truth**：在本機 Google Chrome 實測 beta28 時，文章 checkbox / badge 已回來，但 profile header checkbox 為 0；本版針對該真實 DOM 形狀修正。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta28 — profile 安全位置 checkbox

*   **TL;DR：profile 頁重新提供可勾選入口，但放在帳號 username 旁的安全位置，不再插到 Instagram / 通知 / 更多 icon row。**
*   **Profile checkbox**：進入他人 profile 時會在 header 左側帳號資訊區加入一顆 profile-level checkbox；空帳、私密帳或文章沒載出時也能直接加入封鎖/檢舉清單。
*   **Badge 修正**：profile checkbox 可顯示同一顆「命名可疑 / 疑似假帳號」badge；文章旁 badge 維持原定位。
*   **日期修正**：文章判斷新增 `2026-6-7`、`2025-5-13` 這類 Threads 絕對日期格式，避免 hawk 類貼文漏掉 checkbox/badge。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta27 — 文章 checkbox 延遲補回

*   **TL;DR：修正 beta25 在 Threads DOM 還沒長出完整 username / 時間時就把 more button 標成已處理，導致文章旁 checkbox 與「命名可疑」badge 都不再出現。**
*   **Checkbox 修正**：找不到 username 或暫時判斷不到貼文脈絡時不再永久標記 `data-hege-checked`，下一輪掃描會補回；profile header 仍不注入文章 checkbox。
*   **Badge 修正**：貼文脈絡判斷放寬成同一小段容器內有 username 與時間即可，不要求同一行，避免真實 Threads DOM 換行造成 badge 消失。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta26 — CWS 隱私政策完整頁

*   **TL;DR：新增獨立完整隱私權政策頁，讓 Chrome Web Store 隱私權政策網址可直接指向收集、處理、儲存、分享、保留、刪除與安全措施俱全的頁面。**
*   **CWS 退件修正**：新增 `/privacy/` 完整政策頁，補齊醒目資料揭露、資料類型、處理用途、本機/伺服器儲存、公告 feed request metadata、第三方基礎設施、使用者控制與 Limited Use 聲明；首頁與 CWS listing draft 改指向固定政策 URL。
*   **Storage / 隱私**：未新增 extension storage key；未變更平台同步同意版本 `platform-sync-v2`、上傳資料範圍、每日自動/手動上傳偏好或本機資料讀寫流程。

## v2.7.4-beta25 — profile header 不注入文章 checkbox

*   **TL;DR：修正 profile header 右側 Instagram / 通知 / 更多三個圖示旁也被塞入文章勾選框，造成圖示和 checkbox 互相覆蓋。**
*   **Badge / Checkbox 修正**：`scanAndInject` 現在會先確認 more button 位於真實貼文脈絡（作者 username + 時間），才注入文章 checkbox；profile header/action row 不再注入文章 checkbox，也就不會擋到三個圖示。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta24 — 文章 badge 真實 DOM 修正

*   **TL;DR：修正 beta23 誤用 `role=article` 判斷 Threads 文章，導致 `koala800515` 這類真實貼文旁 checkbox 沒有顯示「命名可疑」。**
*   **Badge 修正**：文章 checkbox 改用 Threads 實際 DOM 特徵判斷：同一小段祖先文字內同時有作者 username 與時間（例如 `koala800515 22小時`）才顯示 badge；profile header/action row 沒有時間，不顯示也不覆蓋按鈕。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta23 — 文章 badge 定位修正

*   **TL;DR：修正 beta22 把「命名可疑」掛在 profile/action row 造成蓋住按鈕，且文章旁 checkbox 反而看不到 badge 的問題。**
*   **Badge 修正**：badge 改掛在文章 checkbox 自己裡面，只在 `[role="article"]` / `article` 內顯示；profile header、tab、username link 旁不顯示也不覆蓋按鈕。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta22 — 命名可疑只留勾選框旁

*   **TL;DR：修正「命名可疑 / 疑似假帳號」同時出現在 username、profile tab 與勾選框旁的重複問題。**
*   **Badge 修正**：可見 username / profile link 旁不再新增 badge；舊版殘留的 link badge 會在同步時清掉，只保留勾選框旁一顆本機提示。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta21 — 更新視窗補 2.7.3

*   **TL;DR：補上更新視窗「最近更新」漏列的 2.7.3，讓 2.7.4 系列視窗能銜接上一個正式版。**
*   **Modal 修正**：最近更新列表新增 2.7.3 Firefox AMO 自動發布流程與送審產物來源修正摘要。
*   **Release 流程**：release / release QA skill 加入正式版公告 feed 檢查，避免正式版只改 changelog 卻忘記公告。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta20 — 資訊視窗固定可見滑桿

*   **TL;DR：修正 beta19 在 macOS / Chrome / Safari 仍可能完全看不到 scrollbar 的問題，改成留友封自己畫固定可見的右側滑桿。**
*   **Modal 修正**：前四種長版資訊視窗改用自繪 scroll track / thumb，內容仍用原本區塊滾動，截圖與實機都會看到右側金色滑桿。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta19 — 資訊視窗可見 scrollbar

*   **TL;DR：前四種資訊視窗的內容區改成實體可見 scrollbar，不再被 macOS / Chrome overlay scrollbar 自動隱藏。**
*   **Modal 修正**：更新/首次使用資訊視窗右側加入固定 scrollbar gutter、深色軌道與金色 thumb；公告單獨視窗仍保持短版。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta18 — 資訊視窗滾動區調整

*   **TL;DR：使用前說明 / 升版更新這組資訊視窗改成固定高度，中間內容區顯示 scrollbar，避免前四種情境看起來太短。**
*   **Modal 修正**：首次使用、首次使用含公告、升版、升版含公告都使用同一個高版型；只有公告單獨跳出時維持較短版型。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta17 — 無公告升版視窗修正

*   **TL;DR：修正 beta16 在「沒有未讀最新消息」時開啟升版視窗可能噴 `content.js:2263` 錯誤。**
*   **Modal 修正**：公告資料解析現在會把 `null` / 非物件當成沒有公告，不再阻斷「留友封更新了」或「使用前說明與更新重點」視窗。
*   **Storage / 隱私**：未新增 storage key；不重置平台同步同意、公告已讀、升版已讀或每日上傳偏好。

## v2.7.4-beta16 — 資訊視窗整合

*   **TL;DR：使用前說明、升版更新與最新消息改成共用同一個資訊視窗容器；有未讀區塊才顯示，沒有就不佔空間。**
*   **Modal 修正**：升版時會先把未讀最新消息合併進「留友封更新了」視窗；最新消息單獨出現時也改用同一個容器，不再維護第二套彈窗。
*   **Storage / 隱私**：未新增 storage key；仍分別使用 `hege_release_notes_seen_version` 與 `hege_announcement_seen_id` 記錄已讀，不重置平台同步同意或每日上傳偏好。

## v2.7.4-beta15 — 首次使用說明合併更新重點

*   **TL;DR：第一次安裝時只顯示一個「使用前說明與更新重點」視窗，不再先看使用前說明、下次又補跳新版更新說明。**
*   **Modal 修正**：首次使用按「我同意並繼續」會同時記錄使用前同意與本版更新已讀；既有使用者升版仍看原本的更新說明。
*   **Storage / 隱私**：未新增 storage key，未重置平台同步同意、每日自動/手動上傳偏好或其他使用者偏好。

## v2.7.4-beta14 — 停用 checkbox lane 假帳號 badge

*   **TL;DR：假帳號提示只保留 username 旁的 badge，checkbox 旁的舊定位 badge 會被清掉，避免同一個帳號上下各一顆。**
*   **Badge 修正**：checkbox 同步流程不再新增 `命名可疑 / 疑似假帳號` badge，只負責移除舊版殘留；封鎖 checkbox 功能不變。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta13 — 同列多 profile link badge 去重

*   **TL;DR：Threads 同一列若有多個連到同帳號的 profile link，只會選一個位置顯示「命名可疑 / 疑似假帳號」。**
*   **Badge 修正**：同 row 同 username 的舊 badge 會在同步時清掉，避免 display name、username、avatar 或 checkbox 路徑各畫一顆。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta12 — 命名可疑 badge 去重

*   **TL;DR：同一列同一個帳號只保留一顆「命名可疑 / 疑似假帳號」badge，避免 username 旁與 checkbox 旁重複顯示。**
*   **Badge 修正**：若同列已有 matching username 連結，假帳號提示固定由 username 旁的 badge 顯示；checkbox 旁的舊提示會移除並不再重建。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta11 — Threads 載入效能修正

*   **TL;DR：全站 DOM 監聽改成 debounce 掃描，避免 Threads 載入時大量 DOM 變更觸發上百次留友封掃描，拖慢首頁與 activity。**
*   **效能修正**：`scanAndInject` 不再被每個 boot-time mutation 直接連打；備援輪詢也回到較保守節奏。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta10 — 升版訊息按鈕防卡死

*   **TL;DR：新版更新訊息與最新消息視窗會先移除遮罩，再記錄已讀，避免 storage 暫時失敗時整個 Threads 頁面被遮罩卡住。**
*   **Modal 修正**：更新訊息的關閉、CWS 評價、贊助，以及最新消息 CTA 都改成不讓已讀狀態寫入失敗阻斷按鈕動作。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta9 — Safari Userscript inline bridge 停用

*   **TL;DR：Safari / Userscript 版也停用 content script 的 inline about bridge，避免 Threads CSP 或 Userscripts 注入差異造成頁面卡住。**
*   **Safari fallback**：Safari / Userscript 沒有 Chrome manifest 的 `page-bridge.js` MAIN-world 橋接檔，現在會直接走既有頁面文字與三點選單 fallback；Chrome extension 仍使用 manifest page bridge。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta8 — Chrome extension CSP 錯誤修正

*   **TL;DR：Chrome extension 版不再從 content script 注入 inline about bridge，避免背景錯誤頁累積 Content Security Policy 錯誤。**
*   **Page bridge**：Chrome extension 已由 manifest 以 `world: "MAIN"` 載入 `page-bridge.js`，content script 改為只 ping 既有 bridge；Userscript / Firefox fallback 不變。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta7 — 退場舊版最新消息

*   **TL;DR：停用 2.7.1 announcement feed 舊公告，避免 2.7.4 升版訊息後又跳出第二個舊版最新消息。**
*   **Announcement**：`2026-06-17-v271` 退場；程式也會忽略本機已快取的同一公告 id，避免舊 cache 造成重複彈窗。
*   **Storage / 隱私**：未新增 storage key，未重置 `hege_release_notes_seen_version`、`hege_announcement_seen_id`、平台同步同意或每日上傳偏好。

## v2.7.4-beta6 — 可見 username 命名 badge

*   **TL;DR：假帳號 badge 改成直接掃畫面上可見的 username 命名，不再等文章右側更多按鈕。**
*   **命名提示**：留言、文章與搜尋結果中可見的 profile username 若命中「動物字詞 + 數字亂碼」或既有三無待審清單，會直接在 username 旁顯示 `命名可疑` / `疑似假帳號`。
*   **Storage / 隱私**：未新增 storage key，不抓地區時間、不新增外部 API、不變更平台同步同意版本或上傳資料範圍。

## v2.7.4-beta5 — 加速三無改為預設

*   **TL;DR：加速三無現在固定視為開啟，設定頁不再顯示「加速三無」開關。**
*   **三無掃描**：關於此個人檔案的加速讀取會預設啟用；若 Threads 限制或橋接不可用，仍沿用既有退回一般三點流程。
*   **Storage / 隱私**：沿用既有 `hege_three_no_accelerated_profile_enabled` key 但讀取時不再受舊值影響；未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta4 — 三無命名規則移除手機格式

*   **TL;DR：移除 `a09xxxxxxxx` 台灣手機號碼形狀的命名可疑判斷，避免把一般手機型帳號誤標成假帳號。**
*   **命名規則**：三無候選與文章旁 badge 不再因 `a09 + 8 位數` 命中；動物字詞加數字亂碼規則仍保留。
*   **舊資料修正**：讀取或寫入既有三無待審清單時，會清掉舊版留在 `a09xxxxxxxx` 帳號上的「命名可疑」旗標，讓 filter 立即反映新版口徑。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta3 — 假帳號 badge DOM 更新修正

*   **TL;DR：補強文章旁假帳號 badge 的 DOM 同步，避免 Threads 重用節點時留下舊 username 的提示。**
*   **Badge 更新**：同步 badge 時會先清除同一 host 上不同 username 的舊 badge，再建立或更新目前作者提示。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好。

## v2.7.4-beta2 — 文章旁 injected API 警告

*   **TL;DR：文章旁假帳號 badge 接上 Threads page-world injected API，可用本機 cache / about API 事件更即時更新提示。**
*   **Injected API**：啟動時安裝既有 page bridge 監聽，接住 Threads 自己的 profile/about 回應；命中「動物字詞 + 數字亂碼」的文章作者會排入短佇列補抓 about metadata，抓到後同步刷新旁邊 badge。
*   **提示邏輯**：本機三無待審清單仍顯示「疑似假帳號」；單純命名命中顯示「命名可疑」，若 injected API 顯示同時是新帳號，會升級為「疑似假帳號」並在 title 保留加入時間 / 地區線索。
*   **Storage / 隱私**：沿用既有三無 profile metadata cache，不新增 storage key、不新增外部 API、不變更平台同步同意版本，也不把帳號清單上傳到平台。

## v2.7.4-beta1 — 文章旁假帳號警告

*   **TL;DR：文章旁新增本機假帳號警告 badge，並擴充三無預設動物命名清單。**
*   **即時提示**：看文章時會在留友封勾選框旁顯示「疑似假帳號」或「命名可疑」；提示只使用本機三無待審清單與 username 規則，不自動封鎖、不開 profile 深掃。
*   **命名規則**：新增 alligator、alpaca、llama、panther、unicorn 等預設動物字詞，支援「動物字詞 + 數字亂碼」帳號警告。
*   **Storage / 隱私**：未新增 storage key，未變更平台同步同意版本、上傳資料範圍或使用者偏好；badge 不會把帳號清單上傳到平台。

## v2.7.3 — Firefox AMO 自動發布流程正式版

*   **TL;DR：2.7.3 補上 Firefox AMO 一鍵送件流程，並修正本次正式版發版產物來源，避免把 stale beta artifact 上傳到商店。**
*   **AMO 發布**：新增 `npm run firefox:publish`、`npm run firefox:sign` 與 `npm run firefox:publish:dry-run`，自動重建 Firefox package、產生 AMO source archive，並透過 `web-ext sign` 送出。
*   **送審資料**：新增 `amo-metadata.json`，預設分類為 Social & Communication / Privacy & Security，授權使用 `all-rights-reserved` 以符合目前 repo 未提供 LICENSE 的狀態。
*   **Firefox package**：Firefox manifest icon 宣告改為只列實際存在的 128px 圖示，避免 AMO lint 產生錯誤尺寸提醒。
*   **Storage / 隱私**：本次僅新增發布工具與 Firefox manifest metadata，未變更 storage keys、平台同步同意版本、上傳資料範圍或使用者偏好讀寫流程。

## v2.7.2 — 跨設備加密回報包與更新說明正式版

*   **TL;DR：2.7.2 新增跨設備加密回報包匯出 / 匯入，修正三無待審清單與回文彈窗清理入口，並更新正式版內建說明、CWS 留評入口與官網信任資訊。**
*   **加密分享 / 匯入**：資料與工具新增「分享到其他設備」與「匯入其他設備」，可用加密 `.tb-reportpack` 在本機設備間搬移封鎖 / 檢舉摘要；匯入資料只寫入 `hege_imported_report_packs_v1` 與 `hege_imported_report_pack_index_v1`，不加入封鎖清單、檢舉歷史或平台同步 payload。
*   **三無待審清單**：疑似程度分級改為本機可解釋分數，補強舊資料 explicit empty 顯示、profile probe 判斷與 reset 備份容量，避免舊資料或 Threads 預載訊號污染待審結果。
*   **更新說明 / CWS**：更新內建「留友封更新了」視窗，加入 CWS 留評按鈕、贊助入口與公共連署說明；footer 在窄螢幕維持固定欄位與 fallback，不讓按鈕互相重疊。
*   **官網 / 信任資訊**：產品頁補上安裝前信任檢查、Chrome Web Store 留評入口與正式版本字樣。
*   **Storage / 隱私**：平台同步同意仍使用 `platform-sync-v2`，單純升版不會重新詢問或重置每日上傳偏好；回報包只保存在使用者選擇的本機檔案與本機匯入索引，不會上傳到留友封平台。

## v2.7.2-beta32 — 新版本說明加入反詐騙連署

*   **TL;DR：更新 extension 內建「留友封更新了」說明，加入「社群媒體反詐騙，強制揭露電信國碼與其他來源資訊」公共連署入口與說明文字。**

## v2.7.2-beta31 — 新版本說明極窄螢幕 fallback

*   **TL;DR：更新說明頁 footer 加上極窄螢幕兩列 fallback，並修正專案指引檔結尾空白。**

## v2.7.2-beta30 — 新版本說明三欄按鈕穩定化

*   **TL;DR：將更新說明頁 footer 改為左右實際寬度、中間彈性欄，避免 320px 窄螢幕三顆按鈕互相重疊。**

## v2.7.2-beta29 — 新版本說明手機 footer 間距修正

*   **TL;DR：修正 320px 窄螢幕下更新說明頁三欄按鈕仍可能互相壓到的問題。**

## v2.7.2-beta28 — 新版本說明窄螢幕按鈕修正

*   **TL;DR：修正更新說明頁三欄按鈕在手機寬度可能重疊的問題，保留左「知道了」、中「前往 CWS 留評」、右「贊助維持更新」。**

## v2.7.2-beta27 — 新版本說明按鈕三欄固定

*   **TL;DR：更新說明頁底部按鈕固定為左「知道了」、中「前往 CWS 留評」、右「贊助維持更新」。**

## v2.7.2-beta26 — 新版本說明加入 CWS 留評按鈕

*   **TL;DR：更新說明頁改用「前往 CWS 留評」按鈕，讓留評入口更明顯。**

## v2.7.2-beta25 — 新版本說明加入 CWS 留評入口

*   **TL;DR：更新說明頁加入 Chrome Web Store 留評連結，讓使用者更新後可直接回到商店留下評價。**

## v2.7.2-beta24 — 官網信任與留評入口更新

*   **TL;DR：官網補上安裝前信任檢查、Chrome Web Store 留評入口，並同步顯示目前 beta 版本。**
*   **推廣信任**：首頁明確列出開源、Threads 網域限定、不要求密碼/cookies/history/tabs，以及本機保存封鎖名單與待審清單。

## v2.7.2-beta23 — 新版本說明文案更新

*   **TL;DR：更新 extension 內建「留友封更新了」說明，補上 2.7.2 加密分享/匯入與回文清理名單修正，並調整附議文案。**

## v2.7.2-beta22 — 回文彈窗清理名單誤注入修正

*   **TL;DR：修正回文/發文輸入彈窗可能誤出現「清理名單」的問題；帳號名單彈窗仍正常顯示清理入口。**

## v2.7.2-beta21 — 跨設備加密回報包匯入

*   **TL;DR：資料與工具新增「匯入其他設備」，可一次匯入多份加密 `.tb-reportpack`，用於本機跨設備/多帳號封鎖紀錄提示。**
*   **本機隔離**：匯入資料只寫入 `hege_imported_report_packs_v1` 與 `hege_imported_report_pack_index_v1`，不加入封鎖清單、檢舉歷史或觀測平台 payload。
*   **三無提示**：三無待審清單會以本機 badge 顯示「匯入命中 X 次」，但不改變疑似假帳號分數，避免把交換資料變成平台評分。
*   **多檔容錯**：多檔逐一解密，同一 `packId` 會略過；壞檔、錯密碼或格式不支援只會標記該檔失敗，不影響其他檔案匯入。

## v2.7.2-beta20 — 跨設備加密回報包匯出

*   **TL;DR：資料與工具新增「分享到其他設備」，可把本機封鎖/檢舉摘要匯出成加密 `.tb-reportpack`，用於自行搬移到其他設備。**
*   **本機加密**：匯出前輸入密碼，使用瀏覽器 Web Crypto `PBKDF2 + AES-GCM` 產生加密檔；檔案不會由留友封上傳，也不會連線 Google Drive。
*   **資料邊界**：回報包只包含帳號層摘要、來源數級距與月份 bucket，不包含來源貼文 URL、貼文全文或精確時間；匯出功能不影響觀測平台 payload 或平台同步偏好。

## v2.7.2-beta19 — 三無舊資料 explicit empty 修正

*   **TL;DR：修正舊待審資料已記錄 `explicit_empty` 命中原因，卻沒有同步顯示無發文 / 無回文 / 無轉貼，導致疑似假帳號分數過低的問題。**
*   **舊資料相容**：待審清單會從 `metadataDebug.postsSignalReason / repliesSignalReason / repostsSignalReason` 的明確空狀態補回可解釋命中原因，不必等重掃才修正。
*   **Merge 修正**：後續掃描合併舊資料時，也會把明確空狀態視為 no-content evidence，避免再次被舊布林欄位覆蓋。

## v2.7.2-beta18 — 待審清單疑似程度分級

*   **TL;DR：三無待審清單把「審核分數」改成「疑似假帳號分數」，並新增 90 分以上的「疑似程度極高」。**
*   **級距調整**：90-100 為極高、70-89 為高、40-69 為中、0-39 為低；這是本機可解釋訊號推估，仍需使用者人工確認。
*   **文案調整**：CWS draft、README 與產品頁同步把「人工審核 / 審核分數」改成「人工確認 / 疑似假帳號分數」。

## v2.7.2-beta17 — 三無首屏判斷再加速

*   **TL;DR：profile probe 已在首屏看到內容或明確空狀態時直接判定；不再固定多等回頁首後的 500ms。**
*   **可見內容優先**：只有當頁面真的停在較下方時才回到頁首，且等待縮短為 150ms；正常首屏載入不再額外等待。

## v2.7.2-beta16 — 三無 passive-first 加速

*   **TL;DR：三無 profile 檢查改成 passive-first / cache-first，優先重用自然觀察到的 about profile request 模板與 user id，減少開三點；內容判斷仍只看首屏可見內容或明確空狀態，不再用 private route hint 猜測。**
*   **穩定優先**：active about request 只有在本機已有近期被動觀察到的 request template、當前頁 token 與 user id 時才送出；缺任一條件會快速 fallback 到三點，不再硬組舊 bkv/request。
*   **速度優化**：profile probe 不再先下捲；首屏已看到內容或空狀態就直接判斷，固定 profile 等待從 1800ms 降到 1400ms，內容等待 timeout 也縮短。
*   **本機 cache**：新增 `hege_three_no_profile_user_id_cache_v1` 與 `hege_three_no_about_request_template_v1`，只保存在本機，用於三無掃描加速；reset 三無資料時會清除，平台同步不會上傳 user id、request template、token 或帳號清單。

## v2.7.2-beta15 — 三無 reset 備份容量修正

*   **TL;DR：修正 beta14 reset 因三無 debug / metadata cache 過大導致 localStorage backup 超額、清除流程中止的問題。**
*   **Backup scope**：reset 備份改存核心可回復資料；debug log、debug schema 與 profile metadata cache 只列入 omitted keys 並直接清除。
*   **Fallback**：若核心備份仍超額，會退到 minimal backup，至少保留 results、cursor、safe 與 ignored users。

## v2.7.2-beta14 — 三無掃描資料重跑入口

*   **TL;DR：新增 beta-only `hege_three_no_reset=true` 入口，重跑三無掃描前可先備份並清除三無掃描結果、cursor、safe/ignored、debug 與 profile metadata cache。**
*   **Rollback**：reset 會先把被清除的三無 local/session keys 存成 `hege_three_no_reset_backup_<timestamp>`，再清除資料。
*   **Scope**：只清三無 namespace，不動封鎖資料庫、檢舉佇列、失敗清單或一般平台同步設定。

## v2.7.2-beta13 — 三無內容訊號誤判修正

*   **TL;DR：停用 `bulk-route-definitions` 的 `/post/` 路由快判斷，避免 Threads 預載或鄰近路由把無文章、無回文、無轉發帳號誤判成有內容。**
*   **Content probe**：`private_route_posts` 只保留在三無診斷 log，不再單獨把 profile base / replies / reposts 判為有內容；內容狀態改回由可見 DOM 貼文或明確空狀態文案決定。
*   **Review Queue 舊資料**：既有待審資料若只有 `private_route_posts` 作為「有內容」來源，清單會降級顯示為待重掃，不再誤標資料完整。

## v2.7.2-beta12 — 三無待審清單視窗放寬

*   **TL;DR：放寬三無待審清單視窗，並把底部說明與操作按鈕分區換行，避免按鈕擠在同一排。**
*   **Modal layout**：待審清單最大寬度從 820px 放寬到 1040px，保留 96vw 的小螢幕限制。
*   **Footer actions**：底部改成左側本機/手動封鎖提醒、右側按鈕群；按鈕可換行，小螢幕改成兩欄式伸展。

## v2.7.2-beta11 — 三無待審清單與 CWS 文案

*   **TL;DR：把「管理三無追蹤者」改成「三無待審清單」，每筆帳號顯示本機審核分數、命中原因與資料完整度，並同步 CWS/產品頁文案為人工審核與本機處理口徑。**
*   **Review Queue**：舊的三無結果仍沿用 `hege_three_no_scan_results.users`，開啟清單時即時計算審核高 / 中 / 低、命中原因與資料完整度，不新增 migration。
*   **安全名單語意**：安全名單維持 `hege_three_no_safe_users`，只代表使用者本機確認過的例外帳號；加入後從待審清單移除，重掃時繼續排除，不上傳平台。
*   **防誤封邊界**：加入封鎖清單仍只排入 queue，不自動啟動封鎖 worker；UI 文案改為提醒使用者仍需手動開始封鎖。
*   **CWS / 隱私文案**：manifest、README、產品頁與 CWS listing draft 改成「批次封鎖、只檢舉、三無待審清單與本機來源分析」；明確寫出待審清單 / 安全名單只存在本機，平台同步只含匿名統計。

## v2.7.2-beta10 — page bridge review 修正

*   **TL;DR：修正 beta7 review 發現的 page bridge 邊界問題，token/session 不再掛到 page global，network discovery 先過濾 URL 再讀 response。**
*   **安全邊界**：`fb_dtsg`、`lsd`、`jazoest`、`__user` 等 session/token 只保留在 closure 內，bridge status 只輸出安全摘要。
*   **效能邊界**：beta network discovery 只對 graphql / bulk-route / api / ajax / about / wbloks 類 request clone response，避免讀取所有 fetch response。
*   **XHR 防守**：讀 `responseText` 前加上保護，避免非文字 responseType 造成 discovery listener 例外。

## v2.7.2-beta7 — active about retry 收斂

*   **TL;DR：`加速三無` 只在 active about `timeout` 時重試一次；`http_500`、缺 token 或缺 user id 直接退回三點選單 fallback。**
*   **Retry 政策**：避免 Threads 明確回錯時仍白等多輪，debug 會標示 `retryPolicy: timeout_once_only` 與 `fallbackNext: about_menu_three_dots`。
*   **Bridge 清理**：刪除 content side 已不可達的一次性 active about runner，active about request 統一透過 page bridge event 處理。
*   **Debug schema**：升為 `network-discovery-v6` 並清掉舊 debug ring log，方便下一輪只看 beta7 資料。

## v2.7.2-beta6 — 三無 active about bridge 修正

*   **TL;DR：修正 `加速三無` 主動 about metadata request 沒有 response、每個帳號白等 3 次 timeout 的問題。**
*   **Active bridge**：`page-bridge` 恢復 `hege:threads-about-profile-fetch-request` listener，content 端改為透過既有 page bridge 送 request，避免每次 profile probe 重新注入一次性 runner 後收不到回應。
*   **失敗診斷**：active about 失敗時會回到明確原因（例如 `missing_user_id`、`missing_fb_dtsg`、`http_xxx`、`rate_limited`），不再只留下 `timeout`。
*   **Debug schema**：升為 `network-discovery-v5` 並清掉舊 debug ring log，方便下一輪只看修正後資料。

## v2.7.2-beta5 — 三無 private route 有內容快判斷

*   **TL;DR：把 `bulk-route-definitions` 的 `routeUrls.posts > 0` 接進三無 profile probe，只用來提早確認「有內容」，不拿來單獨判斷「無內容」。**
*   **快判斷範圍**：profile base / replies / reposts 同一路徑下若 passive network discovery 看到 post routes，該 probe 直接標為 `hasContent: true`，降低等待 DOM 穩定與 explicit empty 文案的時間。
*   **保守邊界**：沒有 private route 訊號時仍走原本 DOM content / explicit empty 判斷；不會因為 API 沒回 posts 就判定無發文、無回文或無轉貼。
*   **Debug schema**：升為 `network-discovery-v4` 並清掉舊 debug ring log，方便直接分析新訊號是否命中。

## v2.7.2-beta4 — private API discovery log 重整

*   **TL;DR：重整 beta-only private API discovery log，清掉舊格式 ring log，並補上三無 route 數值摘要與封鎖 / 檢舉 action marker。**
*   **三無候選 API**：`bulk-route-definitions` discovery 現在會記錄 route 類型摘要與安全 scalar 欄位，例如 `initial_thread_count`、`max_thread_count`、`owner_posts_count_for_crawlers`、`is_reply`，用來判斷是否能取代 DOM tab 檢查。
*   **封鎖 / 檢舉對時**：封鎖、解除封鎖與只檢舉流程會在關鍵點寫入 `network_action_marker`，方便從下一份診斷 JSON 對照送出前後的 network requests。
*   **Log reset**：升到此 schema 後會清空舊的 `hege_three_no_scan_debug_log`，避免 beta2 / beta3 格式混在同一份匯出；掃描結果、cursor、三無名單與佇列不受影響。
*   **安全邊界**：仍不保存 request / response body、token、cookie、route URL 值、使用者 ID 值或貼文文字。

## v2.7.2-beta3 — 封鎖 / 檢舉 private API discovery 分類

*   **TL;DR：把 beta-only passive network discovery 擴充到封鎖、解除封鎖與檢舉流程，方便從診斷 JSON 找出相關 private API endpoint。**
*   **流程分類**：network discovery 會依 URL、request keys、doc_id / friendly name 與 response 結構標示 `workflow`，包含 `block`、`unblock`、`report`、`about_profile`、`profile_content` 與 `unknown`。
*   **對照資訊**：每筆 discovery log 會附上目前 worker mode、封鎖佇列數與檢舉佇列數，方便判斷該 request 是封鎖、檢舉或三無 profile 掃描自然觸發。
*   **安全邊界**：仍只做 passive discovery，不新增 active 封鎖/檢舉 API 呼叫，不保存 request / response body、token、cookie、帳號清單或貼文文字。

## v2.7.2-beta2 — 三無 private API passive discovery

*   **TL;DR：新增 beta-only passive network discovery，協助找出 Threads profile base / replies / reposts 自然載入時使用的 private API endpoint 與 response 結構。**
*   **private API 偵測**：page bridge 只有在 beta content script 明確啟用後，才會記錄 fetch / XHR 的 endpoint、method、request keys、doc_id / friendly name、status、response 結構 key 與 profile tab 類型。
*   **隱私邊界**：debug log 不保存 request body、response body、token、cookie、使用者 ID 值或貼文文字；資料只寫入本機 `hege_three_no_scan_debug_log`，透過 beta 的「匯出三無診斷」帶出。

## v2.7.2-beta1 — 三無 review 修正

*   **TL;DR：收斂三無自介判斷、移除常駐 active about API 觸發點，並避免 about parser 用欄位順序誤填加入時間或地區。**
*   **無自介判斷**：profile header 文字必須符合 bio line-clamp 形狀才會被視為自介，降低「為你推薦」、帳號名稱或新版 Threads header 片段誤判為有自介的機率。
*   **加速三無 API 邊界**：常駐 page bridge 改為 passive-only；active about request 只在加速三無開啟且掃描流程真的需要時注入一次性 runner，避免頁面上的任意 script 透過公開 event 觸發登入狀態 API request。
*   **關於資訊解析**：about metadata 只在 label 明確命中時填入加入時間與國家/地區，不再用 payload 第 1 / 第 2 個欄位 fallback，避免「未分享」被錯誤覆蓋。

## v2.7.1 — 三無管理與新版 Threads 介面修正正式版

*   **TL;DR：2.7.1 修正新版 Threads 介面下的三無掃描、檢舉 worker、更新通知與管理清單流程，並把三無後續處理收斂成「清除 / 安全名單 / 加入封鎖清單」的本機管理模式。**
*   **三無 profile 判斷**：改用 profile 主頁、`/replies`、`/reposts` canonical probe 分層判斷；帳號不公開只顯示「帳號不公開」，不再同時標為無發文、無回文或無轉貼。
*   **三無管理清單**：移除掃完後直接封鎖；新增安全名單、清除勾選、加入封鎖清單、掃描來源 / 日期 filter，國家/地區下拉也可直接選「未分享」。
*   **關於資訊與 debug**：「加速三無」改為使用 Threads about metadata 作為加入時間與所在地補充來源，失敗會退回一般流程；三無 debug 以固定 ring log 保存並可在 beta 匯出，正式版不顯示手動 debug 入口。
*   **只檢舉與新版選單**：支援新版 profile / post / dialog 三點選單與檢舉 dialog 載入等待，失敗清單可選擇重試或只清除。
*   **更新通知與 announcement**：新版通知改為「功能介紹」，只介紹 2.7 大功能；新增 announcement feed 與 fallback，避免遠端尚未部署時噴 JSON 解析錯誤。
*   **Storage / 隱私**：新增 `hege_three_no_safe_users`、`hege_three_no_scan_debug_log`、`hege_three_no_accelerated_profile_enabled`、`hege_three_no_profile_metadata_cache_v1` 與 announcement cache keys；平台同步同意仍使用 `platform-sync-v2`，單純升版不重置既有同意或上傳偏好。

## v2.7.1-beta14 — Announcement feed fallback 收尾

*   **TL;DR：遠端 `announcements.json` 尚未部署成 JSON 時，留友封改用內建 announcement fallback，不再在 live tab 噴 HTML 解析錯誤。**
*   **Fallback 策略**：announcement feed 先嘗試遠端；若 content-type 不是 JSON 或遠端失敗，改用內建 feed 與本機 cache。
*   **Beta 穩定性**：避免 unpacked/live 測試頁因遠端 route 尚未上線而持續出現 `Unexpected token '<'` 警告。

## v2.7.1-beta12 — 三無 debug 固定記錄與匯出

*   **TL;DR：三無掃描 debug 改成固定 localStorage ring log，掃完後可用「匯出三無診斷」輸出 JSON 給開發者分析。**
*   **固定位置**：三無 debug 會寫入 `hege_three_no_scan_debug_log`，保留最近 600 筆 step，包含 probe、private gate、API retry/fallback 與目前 URL。
*   **結果保存**：掃描完成時會把 `debugLog` 一起保存進三無掃描結果，避免即時 overlay 被下一步覆蓋後無法追查。
*   **匯出工具**：beta 設定頁的診斷區新增「匯出三無診斷」，輸出 scan state、results、cursor、runtime backup、固定 debug log 與最近 console log。

## v2.7.1-beta11 — Canonical probe 跳過原因收窄

*   **TL;DR：修正 public profile 可能被過寬 private 字串誤判，導致直接跳過 `/replies`、`/reposts` canonical probe 的問題。**
*   **Private gate**：帳號不公開只接受 profile 明確文案，例如「此個人檔案不公開。」或 `This profile/account is private`；不再使用「帳號不公開 / 私人帳號」這類過寬字串。
*   **Probe debug**：三無 worker debug 會顯示 `probesCompleted`、`privateSignalReason`、`privateSignalMatchedText`，用來確認是否真的因 private gate 跳過 canonical probes。
*   **Storage**：三無結果保留 private signal debug 欄位，方便重開管理清單後追查跳過原因。

## v2.7.1-beta10 — 加速三無 API retry debug

*   **TL;DR：加速三無會先重試 private about API 3 次，仍失敗才退回三點選單，避免大量帳號直接走慢速三點流程。**
*   **Retry 流程**：`加速三無` 開啟時，每個 profile metadata 會最多嘗試 3 次 active about request；每次等待短暫間隔後再重試。
*   **Debug 呈現**：三無 worker debug 會顯示 `activeAboutAttempt`、`activeAboutAttempts`、最後 `status/error`，以及 `fallbackNext=about_menu_three_dots`。
*   **成功來源**：成功時 metadata debug 會保留 `activeAboutAttempts` 與 attempt count，方便確認不是直接走三點。

## v2.7.1-beta9 — 三無 worker 手動關閉停止修正

*   **TL;DR：修正手動關掉「掃描此帳號粉絲三無」worker 分頁後，主頁仍誤判掃描中、無法停止或重新啟動的問題。**
*   **Worker heartbeat**：三無 worker 執行期間會寫入 heartbeat；主頁若偵測 heartbeat 中斷，會清除殘留 scan lock / stop command，避免 profile 掃描入口卡住。
*   **停止鈕**：主面板的「停止」現在也會送出三無掃描停止指令；若 worker 已被手動關閉，會直接清理 stale 狀態。
*   **掃描入口**：`掃描此帳號粉絲三無` 改用 heartbeat freshness 判斷是否真的有 worker 正在跑，不再依賴 90 秒內的舊 updatedAt。

## v2.7.1-beta8 — 加速三無設定

*   **TL;DR：新增「加速三無」設定，開啟後只用 Threads 網頁 about endpoint 加速讀取所在地與加入時間；三無成立條件仍由主頁、回覆、轉發頁面判斷。**
*   **設定邊界**：「加速三無」預設關閉，使用者開啟後才會嘗試主動讀取 about metadata；封鎖、檢舉、無自介、無頭貼、無發文、無回文、無轉發判斷不改用此 endpoint。
*   **快取策略**：about metadata 快取統一縮短為 1 天；抓不到必要參數、被限流或 endpoint 失敗時會自動回到原本三點選單流程。
*   **隱私邊界**：只保留解析後的加入時間、所在地、驗證狀態與來源標記；不保存 token、cookie 或 private API 原始回應。

## v2.7.1-beta7 — 檢舉重試回到上一版行為

*   **TL;DR：回退 beta5 的檢舉失敗 context/path 還原與新版檢舉對象 chooser 包裝，避免重新檢舉時選單正常但檢舉項目沒有被選到。**
*   **檢舉重試**：失敗清單重試只把帳號重新加入檢舉佇列，不再自動還原失敗時保存的 report path / source context。
*   **檢舉對象選擇**：回到上一版的文字選項搜尋路徑，保留新版三點按鈕相容候選器與空白 dialog 等待修正。
*   **失敗清單**：「只清除」仍保留，可清掉多次失敗後殘留的封鎖 / 檢舉失敗紀錄。

## v2.7.1-beta6 — 三無 canonical probe 與 about metadata 加速

*   **TL;DR：三無掃描改成主頁先判斷 private / 自介 / 頭像，再用 canonical `/replies`、`/reposts` 判斷內容；about 資訊新增原創被動解析與快取，不主動呼叫 Threads 私有 API。**
*   **Private gate**：帳號不公開時會保留無自介 / 無頭貼 / about metadata，但跳過無發文、無回文、無轉貼與粉絲數判斷，不再顯示「粉絲 0」或內容類三無標籤。
*   **內容判斷**：timeout、路徑不符或 skeleton 未穩定時改成 unknown，管理清單顯示待重掃，不再直接標成無內容。
*   **Metadata 加速**：新增被動 about profile 回應 parser 與本機快取，只在 Threads 自然載入「關於此個人檔案」資料時解析，並保留 `bioSignalReason`、`contentProbeSkippedReason`、`metadataSourcePage` 等 debug 欄位。

## v2.7.1-beta5 — 重試檢舉路徑與三無誤判修正

*   **TL;DR：修正重試檢舉會遺失原檢舉項目、檢舉對象選擇層沒有成功點選，以及三無「帳號不公開 / 無回文」誤判。**
*   **重試檢舉**：失敗時會保存原本的檢舉路徑與來源 context；從失敗清單重試時會恢復該 path，不再只剩 username 後回到預設項目。
*   **檢舉對象選擇**：「檢舉貼文、訊息或留言 / 檢舉帳號」改用更寬的 dialog 文字節點定位，避免 Threads 新介面選項不是標準 button role 時沒有點到。
*   **帳號不公開**：只在 profile 出現「此個人檔案不公開。」等明確 profile-private 文案時才標記，不再用過寬的「帳號不公開」字串。
*   **無回文判斷**：`replies/reposts` 先以實際 `/post/` 連結與貼文容器判斷有內容；有內容時不會被空狀態文字誤判為無回文。

## v2.7.1-beta4 — 三無回覆標籤重掃修正

*   **TL;DR：修正三無清單中「無回文 / 無回覆」舊誤判會被永久保留，導致重掃後仍顯示錯誤標籤的問題。**
*   **無回覆判斷**：實測 `@qagynessq/replies` 有明確回覆內容與貼文連結，現行頁面 selector 可判斷為有回覆。
*   **三無結果合併**：本輪有重新檢查到的帳號，會用本輪 profile 訊號覆蓋舊訊號，不再用 OR 把舊的 `noReplies: true` 黏住。
*   **清單校正**：本輪已檢查但不再符合三無條件的帳號，會從三無管理清單移除，避免舊錯誤結果一直殘留。

## v2.7.1-beta3 — 檢舉視窗載入等待修正

*   **TL;DR：修正新版 Threads 檢舉流程中，空白載入中的檢舉 dialog 會被太早判定失敗，導致檢舉直接跳過的問題。**
*   **檢舉 worker**：點「檢舉」後若 Threads 先顯示空白 / 載入中的檢舉視窗，現在會等待視窗穩定載入，不會立刻把該帳號加入檢舉失敗清單。
*   **檢舉目標選擇**：「檢舉貼文、訊息或留言 / 檢舉帳號」只會在 Threads 的可見檢舉 dialog 內尋找，避免誤把留友封自己的可視化面板或 toast 文字當成可點選項。
*   **錯誤判定**：只有檢舉 dialog 連續維持空白超過等待門檻後，才會判定為 Meta 視窗未載入。

## v2.7.1-beta2 — 更新文案、設定視覺與三無標籤修正

*   **TL;DR：修正 2.7.1 更新通知文案結構、設定頁 section header 視覺、回覆 tab 載入等待，並新增「帳號不公開」三無標籤。**
*   **更新通知**：開發者近況只放帳號恢復與公共倡議；正式內文改為本次修正、已知限制與 2.7 大功能介紹；最近更新只列正式版。
*   **設定頁視覺**：section header 改成低飽和深色樣式，靠字重、間距、細線與 subtle background 分區，不再使用突兀藍色側邊條。
*   **無回文判斷**：點擊「回覆」tab 後延長等待，先確認路徑切到 `/replies`，再等待內容或空狀態穩定後判斷。
*   **三無標籤**：profile 檢查新增 `accountPrivate` 訊號，管理清單會顯示與篩選「帳號不公開」。

## v2.7.1-beta1 — 三無判斷、檢舉 worker 與設定清理

*   **TL;DR：2.7.1 線修正新版 Threads 介面下的無自介 / 無回文誤判、只檢舉 worker 三點選單、失敗清單清除與設定頁分區；同時移除三無「掃完後直接封鎖」設定。**
*   **更新通知**：更新視窗改為開發者近況、正式內文、最近更新三區；開發者帳號已恢復，請 follow `@skiseiju`。
*   **三無 profile 判斷**：無自介改忽略頂部 sticky username，只從 profile card 的 handle 後、粉絲 / tab 前取自介候選；無回文 / 無轉貼會點擊對應 tab，並確認進到 `/@user/replies` 或 `/@user/reposts` 後才判斷內容。
*   **失敗清單**：重試失敗清單新增「只清除」選項，可清掉多次失敗後殘留的封鎖 / 檢舉失敗紀錄，不強制重送 worker。
*   **三無設定**：移除「掃完後直接封鎖」設定與自動啟動封鎖 worker 行為；後續封鎖只能從三無管理清單加入封鎖清單後，由使用者手動執行。
*   **設定頁**：各設定分區改為更明顯的 section header，避免資料與工具頁裡的項目看起來混成同一區。
*   **已知限制**：粉絲數極大的帳號，Threads 網頁可能只載入前 50 位粉絲；留友封只能掃目前網頁實際顯示出的名單。

## v2.7.0-beta12 — 三無 profile 訊號與檢舉 worker 新介面修正

*   **TL;DR：修正三無掃描在新 Threads 介面下的無回文與無自介誤判，並讓只檢舉 worker 支援新版 profile / post / dialog 三點選單。**
*   **無回文判斷**：`replies` 檢查現在必須確認目前路徑為 `/@user/replies`，避免把主頁或錯誤的「回覆」按鈕文字誤當成回文分頁內容。
*   **無自介判斷**：改用 `getProfileBioCandidates()` 過濾 profile header 文字，排除追蹤、粉絲、回覆、分頁、按鈕、metadata 與數字計數，降低新介面把 UI 文案判為自介的機率。
*   **只檢舉 worker**：profile 檢舉共用新版 profile 三點候選器，dialog row 與來源貼文檢舉也改用多語 aria、SVG shape 與 button wrapper fallback，不再只吃舊版 `MORE_SVG`。

## v2.7.0-beta11 — 三無管理改版與最新消息 feed

*   **TL;DR：三無管理底部改成「續掃 / 清除勾選名單 / 加入安全名單 / 加入封鎖清單 / 關閉」，並新增不綁升版的最新消息 announcement feed。**
*   **三無管理流程**：「加入封鎖清單」只排入正常封鎖佇列，使用者仍需回主面板按「開始封鎖」執行；不再從管理視窗直接啟動 worker。
*   **安全名單 storage**：新增本機 `hege_three_no_safe_users`，被標為安全的帳號會視為正常使用者，之後續掃或重掃也不再回到三無管理清單。
*   **清單清除語意**：「清除勾選名單」只把勾選帳號從未處理三無清單移除，不加入安全名單；加入封鎖清單與加入安全名單都會同步移出未處理三無清單，避免處理完仍殘留。
*   **新舊 Threads 介面相容**：profile 三點按鈕改用候選評分，兼容舊版圓框三點、新版裸三點、不同 DOM 包裝與 profile header / profile card 位置，降低誤點左側或標題列選單的機率。
*   **Announcement feed**：新增 `https://threadsblocker.skiseiju.com/announcements.json` 檢查與已讀 id 記錄，未來可像更新視窗一樣跳「最新消息」，但不需要每次升版。

## v2.7.0 — 三無追蹤者掃描與粉絲清理正式版

*   **TL;DR：2.7.0 正式加入 Chrome 手動三無追蹤者掃描，可掃自己的粉絲或指定帳號粉絲，並修正 profile about 資訊、停止補標籤、filter 與粉絲 / 追蹤中清理流程。**
*   **開發者近況提醒**：這版因為我的個人 Threads、Facebook，以及商業攝影帳號已被 Meta 停用，無法像過去一樣做完整實帳測試；核心功能在可測範圍內確認可用，但仍可能有未發現的 bug。接下來會暫停開發一段時間，先處理本業帳號、Facebook 與申訴；若你知道其他 Meta / Threads / Facebook 申訴管道，或願意贊助我喝咖啡，都非常感謝。
*   **三無追蹤者掃描**：Chrome 版可手動掃描自己或指定帳號的粉絲，依無大頭照 / 預設大頭照、無自介、無發文、無回文、無轉貼與命名可疑建立本機管理清單。
*   **管理與處理**：報告支援多重 filter、批次忽略、加入清理名單或二次確認後直接封鎖；掃描停止時會先補完已抓到備選帳號的標籤再產生報告。
*   **關於資訊修正**：worker 會優先點 profile 區塊三點讀「關於此個人檔案 / 關於此帳號資訊」，抓加入時間與所在地點，避免誤點頂部標題列三點。
*   **粉絲 / 追蹤中清理**：粉絲與追蹤中名單支援批次勾選，checkbox 固定在「追蹤對方」旁，確認視窗不再誤顯示清理入口。
*   **隱私邊界**：三無帳號名單只保留在本機；平台同步只上傳檢查數、符合數、掃描狀態與工具版本等匿名 aggregate 統計。

## v2.7.0-beta9 — 三無停止時補完備選標籤

*   **TL;DR：按下停止後，三無 worker 會先把已抓到但尚未檢查的備選帳號進 profile 建立標籤，再以 stopped 狀態產生報告。**
*   **停止流程修正**：停止不再直接丟棄尚未檢查的備選；worker 會停止收集更多粉絲，但繼續處理本批已抓到的備選帳號。
*   **標籤完整性**：停止後補跑的帳號仍會讀取無自介、無發文、無回文、無轉貼、加入時間、所在地點、粉絲數與 about debug。
*   **接續口徑**：補標籤完成後才寫入 cursor，下一次掃描會跳過這批已檢查帳號，但仍可從後續粉絲接續。

## v2.7.0-beta8 — 三無 worker 強化三點選單抓取

*   **TL;DR：修正三無 worker 沒有實際打開 profile 三點選單內「關於此個人檔案」的問題，並補上更明確的 about dialog debug。**
*   **三點選單辨識**：metadata 抓取現在會讀 icon 子層的 `aria-label` / `title` / `alt`，優先選 profile header 的三點按鈕，不再只依賴可見文字。
*   **關於項目點擊修正**：選單打開後會優先點擊真正的 `role="menuitem"`，避免找到文字但點到錯誤祖先元素。
*   **worker debug 強化**：overlay debug 會顯示 `about_more_click`、`about_menu_item_click`、`about_dialog_checked`，方便確認三點按鈕、menu item 與 dialog 是否成功。

## v2.7.0-beta7 — 三無掃描選單單一入口

*   **TL;DR：三無掃描在選單中改為單一入口，依目前頁面切換文案，不再同時顯示自己的掃描與指定帳號掃描。**
*   **選單顯示修正**：其他使用者 profile 頁只顯示「掃描此帳號粉絲三無 @handle」；一般河道、貼文頁與自己的頁面只顯示「掃描三無追蹤者」。
*   **掃描中狀態整合**：若三無 worker 正在執行，單一入口直接顯示收集中、停止中或進度數字，不再多出第二列狀態。

## v2.7.0-beta6 — 三無掃描入口與停止保留進度

*   **TL;DR：三無掃描選單只在其他人的 profile 顯示「掃描此帳號粉絲三無」，worker 新增「停止並保留進度」按鈕。**
*   **掃描入口修正**：一般河道、貼文頁與自己的頁面維持「掃描三無追蹤者」，只掃自己的粉絲；只有其他使用者的 profile / replies / media / reposts 頁才顯示「掃描此帳號粉絲三無」。
*   **停止保留進度**：三無 worker 可手動停止，停止後寫入 `stopped` 狀態，保留已檢查出的三無、已掃過帳號、抓到的備選數與本批掃描數；未進 profile 檢查的候選不會被標成已掃，避免之後接續時漏掉。

## v2.7.0-beta5 — 三無 worker 修正關於此個人檔案抓取

*   **TL;DR：三無 worker 現在會先打開 profile 右上「更多」選單，再點「關於此個人檔案」抓加入日期與所在地點。**
*   **加入日期修正**：metadata 抓取順序改為先在 profile 主頁執行，再切到回文 / 轉貼 tab，避免切頁後找不到 profile header 的「更多」入口。
*   **偵錯資訊保留**：三無結果會保留 `metadataSource` / `metadataDebug`，方便確認 about dialog 是否有成功開啟與解析。

## v2.7.0-beta4 — 三無管理批次按鈕防誤操作

*   **TL;DR：三無管理清單的批次按鈕現在必須先勾選帳號；未勾選時只提示，不會自動套用到目前可見名單。**
*   **批次操作修正**：「加入清理勾選」、「忽略勾選」、「直接封鎖勾選」不再用目前 filter 後的全部可見帳號作為 fallback，避免沒勾選時誤加入或誤封鎖。

## v2.7.0-beta3 — 三無管理新增粉絲數 filter

*   **TL;DR：三無 worker 現在會讀取 profile 頂部粉絲數，管理清單新增「粉絲為0」與「粉絲低於30」兩個 filter。**
*   **粉絲數標籤**：新版掃描到的三無帳號會保存本機粉絲數，0 粉絲顯示「粉絲 0」，1-29 粉絲顯示實際粉絲數標籤。
*   **多重 filter**：「粉絲為0」與「粉絲低於30」可與無頭貼、無自介、無轉貼、地區未分享等既有條件一起使用；0 粉絲也會符合低於 30。

## v2.7.0-beta2 — 三無管理 filter 與關於資訊修正

*   **TL;DR：修正三無管理清單的 filter 與 worker profile 檢查，讓「無轉貼」、地區未分享、空管理清單與「關於此個人檔案」資料更符合實際畫面。**
*   **無轉貼 / 無回文判斷修正**：worker 會優先點擊 profile 的回文 / 轉貼 tab 連結，並以頁面內容或明確空狀態判斷，不再把空轉貼頁的操作按鈕誤判為有轉貼。
*   **關於此個人檔案**：worker 會嘗試點開「關於此個人檔案」dialog 抓取加入時間與所在地點，再 fallback 到頁面文字；debug 會記錄是否成功點開 about dialog。
*   **管理 filter 修正**：國家/地區下拉不再重複顯示「地區未分享」，只保留三無原因中的「地區未分享」filter；舊 beta1 產生且缺少可靠回文/轉貼訊號的資料會標示為待重掃。
*   **空管理清單入口**：當本機沒有未處理三無名單時，主選單不再打開上一次空報告，會回到手動掃描自己的粉絲。

## v2.7.0-beta1 — Chrome 三無追蹤者掃描與粉絲清理

*   **TL;DR：2.7.0 beta 加入 Chrome 手動三無追蹤者掃描，可掃自己的粉絲或指定帳號的粉絲名單，完成後以本機報告、floating icon 紅色驚嘆號與匿名 aggregate 統計呈現；預設不自動封鎖。**
*   **手動三無掃描**：主選單「掃描三無追蹤者」會開啟 Threads worker 分頁執行，不使用 MV3 background service worker，也不新增 `tabs` / `scripting` 權限；使用者也可在其他人的 profile 使用「掃描此帳號粉絲三無」。
*   **三無候選判定**：粉絲列表中無大頭照 / 預設大頭照會優先進 profile 檢查；已有頭像但 username 命中「動物字詞 + 數字亂碼」或 `a09xxxxxxxx` 台灣手機格式，也會列入候選。進 profile 後，必須無大頭照，且符合無自介、無發文、無回文、無轉貼或命名可疑任一條件，才列入三無管理清單。
*   **新標籤與多重 filter**：管理清單新增無回文、無轉貼、新帳號、加入時間、國家/地區與地區未分享標籤；可用多重 filter 篩出低於 3 個月、低於半年、低於一年等帳號，再決定是否加入清理或封鎖。
*   **管理清單累加**：主選單文案改為「管理三無追蹤者」；掃自己或掃其他帳號的三無結果會累加在同一份本機管理清單，不再因下一次掃描覆蓋前一次未處理的結果。
*   **分批與接續**：掃描以 200 人為基本批次，並會在同一個 worker 內自動續掃，直到備選名單超過使用者設定門檻、掃到底或遇到防呆停止條件；已掃過帳號存在本機 cursor，下一輪會跳過已檢查過的人。
*   **報告與後續處理**：掃描完成後在原本 Threads 分頁顯示管理清單，可逐筆或批次勾選加入清理名單、忽略，也可二次確認後直接封鎖；設定中可開啟「掃完後直接封鎖」，預設為關閉。
*   **提醒 UI**：有未處理三無結果時，floating icon 右上角顯示紅色 `!` 並閃爍；主選單會切換為「發現三無追蹤者」。沒有未處理結果時，同一列作為手動掃描入口，並放在設定上方。
*   **設定項目**：設定頁新增三無掃描備選門檻，預設 100，可調整；另新增「掃完後直接封鎖」開關。
*   **粉絲 / 追蹤中清理**：延續 2.6.7 的粉絲與追蹤中名單支援，profile 名單 checkbox 固定在「追蹤對方」按鈕左側，封鎖確認等非名單 dialog 不會誤顯示清理入口。
*   **更新說明與連結整理**：更新視窗重新整理主要功能介紹，贊助文字統一為「贊助我喝咖啡」，設定頁下方保留贊助、開發者網站與留友封觀測平台入口。
*   **平台統計與隱私**：平台 payload 新增 `threeNoFollowerScan` aggregate，只上傳檢查人數、符合三無人數、掃描狀態與工具版本等統計；不會上傳三無帳號、profile URL、頭像網址或自介內容。平台同步同意政策維持 `platform-sync-v2`。
*   **穩定性修正**：修正粉絲入口點擊、React dialog 重新渲染、短暫無新連結誤判到底、報告重複彈出、外部帳號續掃 target 遺失，以及 virtual list 到底判斷過早產生報告等問題。

## v2.6.7 — 粉絲 / 追蹤中清理名單與更新說明整理

*   **TL;DR：新增粉絲與追蹤中名單的清理支援，設定頁下方新增留友封觀測平台連結，並讓更新說明的贊助文字更醒目。**
*   **下方連結新增觀測平台**：設定頁底部連結列加入「留友封觀測平台」，指向 `https://threadsblocker.skiseiju.com/platform/`；連結列改為自適應欄位，窄視窗會換行避免擁擠。
*   **觀測平台入口命名修正**：入口文字統一為「留友封觀測平台」，並加上固定 id 方便測試確認。
*   **贊助文案強調**：更新說明中的「如果留友封有幫上你的忙，也歡迎贊助我喝咖啡。謝謝大家的支持。」改為 highlight 區塊。
*   **主要功能介紹重排**：新版摘要不再依版本流水帳介紹 v2.0-v2.6，而是整理成批次清理名單、背景自動執行、冷卻與重試保護、只檢舉流程、定點絕與貼文水庫、本機分析與觀測等功能區塊。
*   **最近更新整理**：最近更新本次先顯示 5 項；平台觀測、raw 保存、D1/R2 後端、文字指紋、時間桶與上傳同意延續整合成同一項，避免平台端細節拆得太碎。
*   **更新視窗加寬**：新版摘要視窗加寬並用更乾淨的雙欄功能區塊排版，降低文字擁擠感。
*   **更新說明贊助入口**：新版摘要底部加入「贊助我喝咖啡」按鈕，使用者主動點擊才會開啟 PAYUNI donate 連結；不在啟動時自動跳轉付款頁。
*   **帳號名單支援**：清理名單入口與整串掃描文案從互動名單擴充為帳號名單，支援 profile 粉絲 / 追蹤中 dialog 的批次選取、封鎖與只檢舉佇列。
*   **tab 式 modal 修復**：dialog 偵測不再只依賴 `h1/h2`，也會辨識上方「粉絲 / 追蹤中」tab 與新版 Threads 名單結構。
*   **profile 名單視覺修正**：粉絲 / 追蹤中 modal 不再顯示上方「清理名單」按鈕，逐列 checkbox 固定放在「追蹤對方」按鈕左側。
*   **確認視窗防誤注入**：清理名單入口現在必須偵測到可見帳號連結才會顯示，封鎖確認、刪除確認等非名單 dialog 會跳過。
*   **贊助入口更新**：設定頁「贊助」直接開啟 PAYUNI donate 連結，旁邊新增「開發者網站」按鈕指向 `skiseiju.com`。
*   **來源分類**：本機封鎖分析新增 `followers` / `following` 分類，避免粉絲清理被歸成手動或舊資料。
*   **隱私邊界維持**：粉絲 / 追蹤中清單沒有來源貼文時，不會把 profile 清單 URL 當成貼文來源證據寫入。

## v2.6.6 — 平台操作跡象 schema 增量

*   **TL;DR：平台上傳 payload 新增穩定文字指紋與時間桶，讓後端可分析短時間同步與話術相似度，不必依賴會裁切的 snippet 或原文 sample。**
*   **文字指紋**：`events` 與 `sourceEvidence` 新增 `textFingerprint` / `textFingerprintVersion`，由本機正規化文字後產生不可逆 hash；`sources`、`campaignCandidates`、`narrativeSeeds` 同步提供 `textFingerprintCounts` / `topTextFingerprints` 聚合。
*   **時間桶**：`events` 與 `sourceEvidence` 新增 `timeBucket10m` / `timeBucket1h`；`sources`、`analysisSeeds.temporalBuckets10m`、`analysisSeeds.temporalBuckets1h` 提供短時間同步判斷所需的聚合計數。
*   **隱私邊界維持**：未新增公開可回推個人的原文或 URL 欄位；payload optimizer 在裁切 snippet/sourceText 後仍保留 derived hash 與時間桶。

## v2.6.5 — 平台 D1 v2 / R2 raw 修復與新版 release guard

*   **TL;DR：平台上傳後端切到新 D1 + R2 raw pointer 架構，完成 358 筆 unique raw backlog 回補，並修復新版不應重問每日上傳偏好的 release guard。**
*   **平台後端容量修復**：`threadsblocker-bug-admin` Worker active D1 切到 `threadsblocker_bug_admin_v2`，完整 raw payload 改存 R2 bucket `threadsblocker-platform-raw-ingests`，D1 `platform_raw_ingests.raw_payload` 只保存 `r2://...` pointer，避免舊 D1 500MB 上限再次阻塞新上傳。
*   **raw backfill 完成**：5/31-6/03 舊 D1 raw backlog 共 358 筆 unique payload 已全部進入 active D1 analytics；live 平台頁驗證為 419 批次、193 來源、65,004 件，可分析趨勢範圍 2026-04-19 至 2026-06-07。
*   **SQL 寫入 guardrail**：新增 `cf_bug_admin/scripts/check-sql-placeholders.mjs`，部署前檢查 `platform_uploads` / `platform_raw_ingests` 的 `INSERT` columns、`VALUES` 與 bind 參數數量一致，避免 raw 已存但可分析表未入庫。
*   **上傳同意不再跟 app 版號重置**：平台同步同意改用 `PLATFORM_SYNC_CONSENT_POLICY_VERSION`，既有同意會 migration 到政策版本，單純升版不再重新要求每日上傳選擇。

## v2.6.4 — 2.6.3 上傳修復合回與提醒視窗防卡死

*   **TL;DR：合回 2.6.3 的平台上傳 raw 資料保全修正，duplicate 上傳仍會保存原始 payload，並修復大蟑螂回望提醒在長名單/小視窗下按不到確認或取消。**
*   **平台 raw 資料保全**：server 新增 `platform_raw_ingests`，每次平台上傳都先保存 raw payload；分析資料仍以 canonical hash 去重，避免 duplicate 直接跳過導致 raw / 後續趨勢資料缺口。
*   **一次性修復重傳**：已開啟自動上傳的使用者升版後會自動跑一次 `repair_reupload_v1`，把本機既有平台資料重新送到 server；duplicate 會保存 raw，但不會重算每日同步成功時間。
*   **上傳同意延續**：保留舊版已選擇的自動上傳同意狀態，升版後不會因 consent version 缺失而把已同意使用者卡在未確認狀態。
*   **大蟑螂提醒防卡死**：通用確認視窗改為 viewport 內可捲動、footer sticky；回望提醒摘要縮短為前 8 個帳號，確認動作仍只先開前 10 個主頁。
*   **正式版診斷入口關閉**：正式版設定頁不再顯示手動「匯出檢舉診斷」入口；內部自動診斷與 beta 測試入口維持分離。

## v2.6.2 — 定點絕互動名單定位修復

*   **TL;DR：2.6.2 正式版修復定點絕可能抓到錯誤互動名單的問題，現在掃描前會先鎖定目標貼文容器，找不到目標貼文時會停止而不是猜測封鎖。**
*   **定點絕名單定位修復**：開啟「查看動態 / 按讚內容」前，先以目前 `/@user/post/...` 路徑定位目標貼文，只在該貼文容器內搜尋互動入口，避免誤抓個人頁、其他貼文或錯誤區塊的按讚名單。
*   **錯誤目標保護**：若 Threads DOM 尚未載入出目標貼文連結，定點絕會提示並停止本次掃描，避免用第一個 article 或全頁搜尋造成誤封。
*   **正式版診斷邊界維持**：正式版仍關閉手動檢舉診斷匯出入口；內部自動診斷資料不影響商店版 UI。

## v2.6.1 — 大蟑螂提醒防卡死與名單資料相容修復

*   **TL;DR：2.6.1 正式版修復大蟑螂回望提醒在長名單時卡住畫面的問題，並強化封鎖資料庫讀取相容性，避免舊資料形狀讓名單判斷失準。**
*   **大蟑螂回望提醒防卡死**：通用確認視窗改為固定在視窗內，內容可捲動、底部按鈕保持可見；回望提醒改為摘要顯示，長名單只先列前 30 個。
*   **避免重載立即再彈**：按「開啟前 10 個」或「稍後提醒」都會延後本批提醒，避免使用者剛回到 Threads 就再次被提醒遮住畫面。
*   **大量回望保護**：超過 10 個逾期帳號時，確認動作只先開前 10 個主頁，避免一次開出大量分頁。
*   **封鎖資料庫相容性**：封鎖名單讀取改走 `Storage.getBlockDB()`，可容忍陣列或物件形狀的舊資料，減少舊版資料造成的重複選取、統計或驗證失準。
*   **正式版診斷邊界維持**：正式版仍關閉手動檢舉診斷匯出入口；內部自動診斷資料不影響商店版 UI。

## v2.6.0 — 只檢舉流程、平台分析與正式版釋出

*   **TL;DR：2.6.0 正式版把只檢舉流程、平台分析資料鏈路、觀測上傳同意與 bug/admin 基礎設施整合成一條完整產品線，並把已固定為預設的「完整互動名單收集」從設定介面移除。**
*   **只檢舉模式正式化**：新增獨立的 `REPORT_QUEUE` / `REPORT_CONTEXT` / `REPORT_HISTORY`、`WORKER_MODE=report` 分流、檢舉路徑樹與多步確認，支援 panel 與 worker 一致化執行。
*   **只檢舉流程穩定化**：檢舉對象選擇層改為最多等待 10 秒並記錄等待時間，避免 Meta 慢載入時過早判定失敗；一般視覺步驟仍維持較快節奏。
*   **檢舉診斷統計修正**：批次診斷匯出改用最終 worker stats，並在 storage 清空後重置 worker 記憶體統計，避免舊批次數字污染新匯出。
*   **平台分析資料鏈路上線**：新增來源證據索引、平台上傳 payload 與 overview API 所需欄位，讓 extension 匯出的聚合資料可進入平台統計頁與後台分析。
*   **觀測上傳同意流程**：新增每個版本都需重新確認的上傳同意紀錄；支援擴充功能的 Chrome / Firefox（含 Android）可每日自動同步，iOS / Safari 因背景限制改為手動上傳提醒，且不再於 Chrome userscript / 非 iOS 環境誤顯示 iOS 警告。
*   **商店審核與隱私揭露同步**：彈窗、README、網站隱私政策與 Firefox manifest 同步揭露資料類型、匿名來源 ID、非法律判定與禁止騷擾用途；Firefox manifest 新增資料收集類型宣告。
*   **Bug 回報與 Admin 後台整合**：回報從單一端點升級為多端點 fallback，並附帶 client 環境診斷資訊；Cloudflare Worker + D1 admin 平台同步支援查詢、統計與狀態更新。
*   **設定與產品說明整理**：封鎖設定移除已固定化的「完整互動名單收集」項目，移除「開始檢舉」前方圖示，放大觀測上傳同意彈窗，README 同步補上 `v2.6.0` 正式版資訊與 Chrome Web Store 安裝入口。

## v2.6.0-beta1 — 版本校正（承接 2.5.2 後新功能）

*   **版號校正**：原內部 beta 曾沿用 `2.5.4-betaXX`，因已加入跨模組新功能（非單純修補），版本軌調整為 `2.6.0-beta1`，後續依 `2.6.0-betaN` 遞增。
*   **只檢舉模式升級為完整流程**：新增獨立的 report queue / context / history、`WORKER_MODE=report` 分流、檢舉路徑樹與多步確認，支援 panel 與 worker 一致化執行。
*   **Bug 回報管道升級**：回報從單一 GAS 改為多端點 fallback（Worker 優先、GAS 備援），並附帶 client 環境診斷資訊（平台、script manager、hasGMXHR、online、endpoint）。
*   **Admin 平台上線（Cloudflare Worker + D1）**：新增 bug 回報查詢、統計、狀態更新 API 與管理頁；支援平台上傳資料寫入與總覽查詢（`/api/v1/platform/ingest`、`/api/v1/admin/platform/overview`）。
*   **平台分析資料層**：新增 `REPORT_HISTORY`、`SOURCE_EVIDENCE_INDEX` 等資料鍵，封鎖/檢舉來源與證據索引可做聚合分析，支援進階分析面板。
*   **站點入口統一到 app 子網域**：網站 metadata、sitemap、robots 與 UI 說明連結改為 `app.skiseiju.com`；Userscript `@connect` 補齊 `app.skiseiju.com` / `*.workers.dev`。

## v2.5.2 — 封鎖分析、結構化紀錄、20 國語系

*   **封鎖分析報告**：設定頁新增「封鎖分析」，可視化顯示封鎖原因分布、每日趨勢、來源貼文排行、最近封鎖紀錄。所有分析完全在本地運算，不上傳任何資料。
*   **結構化封鎖紀錄**：每筆封鎖自動記錄來源貼文 URL、貼文前 100 字摘要、封鎖原因（按讚/引用/轉發/手動）、發文者、同批次 ID。舊紀錄向下相容。
*   **20 國語系**：文字偵測從 6 國擴充至 20 國（新增簡中、葡、越、阿拉伯、印地、荷蘭、菲律賓），worker.js / core.js 硬寫選擇器全部改用 CONFIG 常數。
*   **設定頁重新整理**：左欄分為「資料管理」和「系統」兩區，右欄底部回報/說明/贊助並排，新增產品說明頁連結。
*   **行動裝置警告**：定點絕說明新增行動裝置限制提示（僅在手機/平板顯示）。
*   **冷卻倒數修復**：改用 `Date.now()` 時間戳計算剩餘時間，解決背景分頁節流導致倒數停擺的問題。
*   **產品網站上線**：[threadsblocker.skiseiju.com](https://threadsblocker.skiseiju.com) 含功能說明與隱私政策。

## v2.5.1 — 定點絕啟動修復

*   **修復定點絕無法啟動**：修正 `hege_endless_worker_standby` 旗標在瀏覽器重啟後殘留的問題，導致「開始執行定點絕」按鈕被隱藏。現在啟動時會自動清除過期旗標。

## v2.5.0 — 定點絕多貼文排程、冷卻倒數、停止鍵修復

*   **定點絕多貼文排程**：可將多篇貼文加入定點絕排程，依序自動執行。
*   **冷卻倒數計時器**：每批次完成後顯示 8 小時倒數，倒數結束自動載入下一批。
*   **停止鍵修復**：停止按鈕現在會正確清除 session 狀態，防止自動恢復。
*   **Worker 喚醒改進**：以 `replaceState+reload` 取代 `window.open()`，避免瀏覽器攔截彈出視窗。
*   **安全性修復**：修正憑證洩漏、XSS 與程式碼品質問題。

## v2.4.0 — 速度模式、Firefox 支援與勾選框修正

*   **速度模式 (Speed Mode)**：新增四種速度設定——🧠 智慧、🛡️ 穩定、⚡ 標準、🚀 加速，讓使用者依網路環境自行調整封鎖速度。加速模式支援批次驗證（20% 抽樣），整體效率比智慧模式快約 30%。
*   **智慧等待 (Smart Polling)**：以 `pollUntil` 取代固定 `sleep`，偵測到元素就立即繼續，不再傻等固定時間，加快每個操作步驟。
*   **Firefox 支援**：新增 Manifest V2 版本，提供 `.xpi` 安裝檔，相容 Firefox 109+。
*   **面板重構**：速度模式移至主面板一鍵切換；管理、匯入、匯出移入設定彈窗，主介面更簡潔。
*   **勾選框修正**：修正「查看動態」dialog 中勾選框與追蹤按鈕重疊、點選時跳動、以及在回文 dialog 中誤顯示「同列全封」的問題。新增 scroll 監聽器確保快速滑動時不漏注入。
*   **Bug 回報系統**：回報介面新增版號顯示與「🎉 我覺得很棒」選項，問題等級改用更易懂的中文說明。
*   **穩定性修正**：修正 `CONFIG.KEYS.DB_KEY` 未定義導致資料存入 `localStorage["undefined"]` 的遺留 bug；修正 turbo 模式 click 時機過快的問題；修正多個重複定義與競態條件。

---

## v2.3.0 — 批次解除封鎖與跨分頁同步強化
    
*   **批次解除封鎖 (Batch Unblock)**：支援從「管理已封鎖」面板選取多位使用者進行批次解封。由背景 Worker 模擬自動化操作，並具備自適應驗證機制。
*   **跨分頁狀態同步 (Cross-Tab Mutex)**：導入毫秒級的跨分頁同步與操作互斥 (Mutex) 機制。當背景正在解封或封鎖時，所有 Threads 分頁將同步禁用衝突功能（如 Grayed Out 封鎖按鈕），避免操作混亂。
*   **已消失帳號追蹤 (Vanished User Tracking)**：新增「🫥 已消失」統計欄位，自動偵測並標記名單中已不存在 (404) 的帳號。系統會自動將這些無效帳號從本地資料庫移除，確保名單乾淨且具備網軍識別能力。
*   **自適應驗證機制 (Adaptive Verification)**：解除封鎖流程導入三級（Level 0-2）取樣驗證與重新載入 (Reload) 確認邏輯，大幅提升自動化操作的真實性與準確率。
*   **穩定性優化**：修正了解除封鎖時的關鍵字誤判、多重分頁下的變數作用域錯誤，以及 404 帳號導致的無限迴圈等 Bug。

---


## v2.2.2 — 同列全封範圍擴張與穩定性優化

*   **同列全封範圍擴張**：將「同列全封」按鈕的支援範圍擴大到更多列表視窗（如搜尋結果、相關推薦等），提升批次封鎖的適用性。
*   **版本穩定性強化**：針對 `v2.2.1` 發現的邊界案例進行優化，並確保 iOS/iPadOS 環境下的相容性。

---

## v2.2.1 — 進階封鎖機制與雙重驗證強化

*   **進階封鎖 (Replies-First Navigation)**：大幅優化「進階封鎖」機制的導航策略。現在啟動時將直接跳轉至使用者的 `/@user/replies` 頁面，此舉能讓系統在同一次頁面載入中，同時享有 Profile 主頁選單與貼文選單兩種封鎖路徑，消除舊版需要兩次頁面跳轉的冗餘等待，大幅提升效能。
*   **雙重備案驗證 (Dual-Fallback Verification)**：針對 Meta 偶發的「選單假死（按鈕存在但點擊無反應）」問題，徹底重構驗證機制 `verifyBlock`。現在於驗證階段，若 Profile 主頁選單開啟失敗，系統會自動往下尋找該用戶的回覆貼文，利用貼文的「更多」按鈕作為備案入口進行最終確認，防護網滴水不漏。
*   **嚴格失敗判定 (Strict Failure Detection)**：驗證階段導入「無法判定即視為失敗」的嚴格標準。以往遇到無法確認狀態時會寬容視為成功，現在一旦遭遇選單異常，將強制回傳失敗。此舉能正確觸發 Worker 的「升級驗證頻率」與「連 5 敗強制進入 12 小時冷卻保護」的深度防禦機制，保護帳號安全。
*   **配置精煉 (Configuration Cleanup)**：移除 `config.js` 中過時且未使用的靜態時間變數，將所有延遲控制落實於業務邏輯中的「情境感知計時 (Context-aware Timing)」，提升程式碼可讀性與架構整潔度。

---

## v2.2.0 — 使用者回報系統與穩定性強化

*   **使用者錯誤回報系統**：面板新增「🐛 回報問題」按鈕（失敗時自動出現），一鍵收集完整診斷資訊並複製到剪貼簿，使用者可直接貼給開發者，大幅縮短除錯週期。
*   **強化失敗診斷**：Worker 失敗時自動記錄 SVG 結構、選單項目文字、Dialog 內容等 DOM 快照，持久化至 localStorage（最近 100 筆），供回報系統匯出。
*   **選單點擊重試**：偵測到「更多」按鈕點擊後選單未開啟時，自動重試 simClick，降低因 React 事件遺失導致的偶發失敗率。
*   **Meta 防護冷卻升級 (Action Limit Protection)**：新增「空選單」三振緩衝機制。當偵測到被 Meta 伺服器軟封鎖（連點 3 次皆等不到「封鎖」選單出現）時，自動觸發 30 分鐘強制冷卻，保護帳號免遭停權。同時放寬了基礎的運作延遲 (最低 3.5s起)。

---

## v2.1.1 — 冷卻機制精修與佇列保護

*   **Reload 驗證機制**：封鎖後驗證改為重新載入頁面再檢查，解決 React 狀態未同步導致的大量誤判，避免不必要的冷卻觸發。
*   **佇列完整保護**：冷卻觸發時，`BG_QUEUE` 剩餘用戶與 `FAILED_QUEUE` 全數保存至 `COOLDOWN_QUEUE`，冷卻結束後無損恢復，不再遺漏任何待處理名單。
*   **失敗重試修復**：修正 Controller 頁面未監聽 `FAILED_QUEUE` 變更，導致重試按鈕始終隱藏的問題。
*   **Safari / Desktop 相容性**：修正 Safari 勾選框點擊無反應、面板錨點判斷錯誤、強制取消冷卻等多項問題。

### beta7
*   **修正失敗重試按鈕不顯示**：`main.js` 的 `storage` 事件監聽與 polling 備份缺少 `FAILED_QUEUE`，導致 Controller 頁面無法偵測到失敗清單更新，重試按鈕始終隱藏。

### beta6
*   **驗證機制改為 Reload 驗證**：封鎖成功後不再於同頁面直接驗證（React 可能未同步更新導致誤判），改為存入待驗證 flag 後 `location.reload()` 重新載入頁面，在 fresh DOM 上重新開啟選單確認「解除封鎖」是否出現，大幅降低驗證誤判率。

### beta5
*   **修正 Cooldown 觸發時未處理佇列遺失**：觸發冷卻保護時，將 `BG_QUEUE` 剩餘用戶與 `FAILED_QUEUE` 一併合併至 `COOLDOWN_QUEUE` 保存，確保冷卻結束後所有待處理名單完整恢復，不再遺漏。

### beta4
*   **冷卻觸發條件調整**：提高 Level 2 驗證等待時間，減少因驗證機制過於嚴格導致的誤觸發。
*   **強制取消冷卻**：新增冷卻中點擊執行時的確認對話框，允許使用者判斷是否為系統誤判並強制解除冷卻，解除後自動恢復佇列繼續封鎖。

### beta3
*   **Desktop Safari 勾選框修復**：攔截 `pointer` / `mouse` 事件，修正 Desktop Safari 中勾選框點擊無反應的問題。

### beta2
*   **面板錨點修復**：修正 `ui.js` 中錨點標籤判斷的位元運算筆誤（bitwise OR → logical OR）。

### beta1
*   **建置腳本修正**：修正 `build.sh` beta 版本號擷取邏輯（`grep` → `sed`），確保打包時版本號正確。

---

## v2.1.0 — 背景面板升級、智慧冷卻回滾與驗證機制

*   **視覺與體驗升級 (Worker UI 2.0 & 即時同步)**：重新設計背景任務面板，新增進度條、動態 ETA 預估時間、以及三維度（成功/失敗/跳過）即時數據統計，並配有 Debug 終端機顯示。同時重寫首頁狀態同步邏輯，實現「零延遲」面板變色警告與勾選框狀態更新。
*   **安全與防護機制 (12H Rate-Limit & 智慧回滾)**：打造全新冷卻保護盾，一旦偵測到 Threads 官方流量限制，系統將中斷並進入 12 小時鎖定。並啟動「智慧回滾」技術，不僅退回排隊名單，更自動追溯拔除可能失效的近期 50 筆封鎖紀錄，確保名單 100% 留用。
*   **核心與穩定性優化 (自適應驗證 & 生命週期清淤)**：為對抗假性成功，導入依照成功率自適應調節（每 1/3/5 次）的驗證過濾系統；並加入版本升級強制清淤機制，自動掃除歷史髒數據與快取異常。

## v2.0.7 — iOS/iPadOS 同分頁封鎖 & 同列全封

*   **iOS/iPadOS 同分頁封鎖**：全新「Same-Tab Worker」機制，在 Safari 中以 `history.replaceState` + `reload` 方式執行背景封鎖，徹底避免 Universal Links 開啟原生 Threads App、彈出視窗被攔截、以及 iframe 無法注入 UserScript 等 iOS 限制。封鎖完成後自動返回原頁面。
*   **同列全封按鈕**：針對「按讚」或「轉發」等互動名單視窗，新增一鍵「同列全封」按鈕。可一鍵將彈出視窗內所有符合條件的使用者加入背景封鎖排隊。
*   **排除自我帳號**：掃描時自動略過使用者本人的帳號，不再顯示勾選框。透過 `Utils.getMyUsername()` 智能判斷，防止誤鎖自己。
*   **渲染效能提升**：在建立 DOM 勾選框之前提前進行過濾（Early-return），減少無效渲染。

## v2.0.6 — Shift 連鎖選取

*   **Shift 連鎖選取**：新增 `Shift + 點擊` 批次選取功能。按住 Shift 點擊可一次勾選或取消範圍內所有帳號。
*   **強制事件捕獲**：改用 `Capture Phase` 委派，解決 Safari Userscript 環境下點擊被 React 吞噬的問題。

## v2.0.5 — 全局同步修正

*   **修正背景封鎖完成後主選單數字凍結**：改以資料庫作全局比對，確保貼文滑出畫面後數字仍正確更新。
*   **對話框嚴格誤判防護**：嚴格要求必須點擊紅色按鈕或含「封鎖」字樣的按鈕，避免誤點警告視窗的「關閉」。
## v2.0.4 — 快取深拷貝修正

*   **記憶體快取深拷貝**：修正背景執行緒寫入歷史紀錄時意外修改快取本體，導致跨分頁同步失效的底層問題。

## v2.0.3 — DOM 查詢範圍還原

*   **修正「更多」按鈕搜尋範圍**：還原前版為效能而侷限在 `<header>` 內的搜尋範圍，解決部分個人檔案頁面封鎖失敗的問題。

## v2.0.2 — 快取強迫清除

*   **快取強迫清除機制**：修正主分頁接收到跨頁 Storage 事件後仍讀取舊快取的問題。

## v2.0.1 — 失敗重試機制

*   **真失敗重試機制**：區分「成功封鎖」、「已封鎖(跳過)」與「真失敗」，真失敗帳號進入專屬佇列可一鍵重試。
*   **失敗重試按鈕**：控制面板新增「重試失敗清單」按鈕，一鍵重新將失敗帳號送回背景排隊列。
*   **智慧名單匯入**：自動淨化 URL 追蹤參數，過濾正在排隊中的帳號。
*   **響應式佈局適配**：調整背景視窗尺寸上限 (800x600)，解決過小視窗導致「找不到更多按鈕」的問題。

## v2.0.0 — 模組化重構

*   **專案重構**：全面模組化，拆分為 config / utils / storage / ui / core / worker / main 七個模組。
*   **Chrome 擴充功能支援**：新增 `manifest.json`，支援以 Chrome Extension 形式安裝。
*   **自動化建置**：`build.sh` 一鍵產出 UserScript、Chrome Extension、Safari 部署。

### v2.0.0-alpha7
*   移除介面上的 Debug Log 區塊，所有除錯訊息改為僅輸出至瀏覽器 Console (`F12`)。

### v2.0.0-alpha6
*   修正 `manifest.json`，追加支援 `threads.com` 網域。
*   恢復匯入/匯出功能、模式切換狀態顯示、啟動環境日誌。

### v2.0.0-alpha5
*   修復 Chrome 擴充功能 UI 消失問題 (Trusted Types / DOMContentLoaded)。

### v2.0.0-alpha4
*   修復 iOS 前景封鎖失效問題 (完整移植 beta46 邏輯)。

### v2.0.0-alpha1 ~ alpha3
*   專案重構、自動化建置、Chrome 修正、UI 定位修復。

---

## v1.x Legacy

### v1.1.3 Beta Series
*   **beta46**: 修正 Android 裝置上點擊按鈕可能觸發 App 跳轉的問題。
*   **beta45**: 全面改用 `simClick` 模擬點擊，提升相容性。
*   **beta44**: 優化行動版裝置偵測，避免在手機上顯示桌面版 UI。
*   **beta38**: 加入 `BroadcastChannel` 讓背景執行緒的 Log 能同步顯示在 UI 上 (v2.0 已移除)。
*   **beta34**: 增強前景模式的「已封鎖」偵測，自動跳過並標記成功。
*   **beta33**: 修正 macOS 上因 `TouchEvent` 檢查導致的崩潰。
*   **beta32**: 加入桌面版的前景/背景模式切換開關。
*   **beta29**: 解鎖歷史紀錄限制，允許對已在清單中的用戶重新排程。
*   **beta25**: 新增介面 Debug Console (Console Log UI)。
*   **beta24**: 優化 iOS 裝置 (iPad) 的偵測邏輯。
*   **beta23**: 將 v1.1.2 的穩定前景封鎖邏輯移植回 Beta 版。
*   **beta18**: 重寫 UI 面板定位邏輯 (Anchor)，自動對齊 Threads 選單按鈕。
*   **beta17**: 改用 Native 風格的選單樣式。
*   **beta6**: 改用彈出視窗 (Popup Window) 執行背景任務，解決背景分頁休眠問題。

### v1.1.2
*   「持久化冷卻鎖定」加入誤判解決鎖定功能。

### v1.1.1
*   新增「持久化冷卻鎖定」：觸發限制後強制鎖定 12 小時，防止使用者透過重整網頁繞過警告。鎖定期間全面禁用匯入與執行功能。

### v1.1.0 (Major Update) - 2024.05
*   新增「封鎖失敗偵測」功能：監控 Rate Limit 訊息與確認視窗卡死，觸發風險時自動切換為「⛔ 限制暫停中」狀態。
*   微幅增加操作間隔延遲，提升模擬真人的真實度。

### v1.0.9
*   Chrome/Edge 兼容性修復：解決因 CSP (TrustedHTML) 安全政策導致腳本無法執行的問題。
*   排除「為你推薦」等直欄標題旁誤出現勾選框的問題。

### v1.0.8
*   強化 SVG 尺寸過濾機制（排除 < 16px 的小型系統按鈕）。排除「新增為直欄」按鈕誤判。

### v1.0.7
*   排除「新增為直欄」等小型系統按鈕的誤判。加入 SVG 尺寸過濾機制。

### v1.0.6
*   重大視覺升級：捨棄舊式 Checkbox，改用與 Threads 風格融合的原生 SVG 圓角選取鈕。新增 Hover 回饋效果。

### v1.0.5
*   精準圖示辨識：透過 SVG 內部標籤區分「設定」與「貼文」按鈕。加大按鈕推擠間距至 45px。

### v1.0.4
*   改用 CSS Transform 強制位移按鈕。增強 SVG `aria-label` 過濾邏輯。

### v1.0.3
*   修正含有文字的按鈕誤出現勾選框的問題。優化手機版邊緣顯示。

### v1.0.2
*   防誤觸優化：勾選框移至按鈕右側獨立懸浮區。封鎖後貼文改為 Opacity 淡化而非隱藏。

### v1.0.1
*   修正勾選框擠壓版面問題（改用 Absolute 定位）。改以 User ID 去重，解決數量虛胖問題。

### v1.0.0 (Initial Release)
*   正式命名為「留友封」。整合歷史資料庫、匯入/匯出功能。確立「時間延遲」機制確保執行穩定性。
## v2.7.4-beta58 — verified Likes clean-list row classification

* **TL;DR：** Live-derived Likes list 在成功通過 shared readiness 後，純 profile account row 只要具備安全單列 boundary 即可分類為 Likes，不再硬性要求列內 heart marker；未驗證、Quotes、Reposts 與未知 dialog 仍 fail-closed。
* **唯一證據與 atomicity：** clean-list 與 post-reservoir 共用 `verified_likes_context` contract；同一 username 跨虛擬化／重複 render 只計一次，unknown→valid 會以有效 row 覆蓋，最終仍 unresolved 才 rollback/`rows_unknown`。
* **Diagnostics/privacy：** rows diagnostics 改報 unique/valid/unknown counts 與 allowlisted `classificationStrategy` enum，不保存 username、href、DOM、class 或文字。
* **驗證邊界：** 本輪未操作瀏覽器、未宣稱 Threads live/installed PASS；未 deploy、上傳商店、push 或發布正式版。
