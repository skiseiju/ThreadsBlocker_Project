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
