# 2.8.2 修復計畫（一版一修一測一 commit）

> 建立：2026-08-03。第 1 項來自線上回報 #47（2026-08-01，2.8.1 正式版）；第 2–4 項是 2026-08-03 使用者改變決定納入的遺留項（原 2026-07-29 拍板暫緩，已推翻）；第 5 項起為結構債，順序依使用者 2026-07-29 拍板（handoff SESSION-2026-07-27-EVENING §C）。
> 結構債的完整位置清單與輸入差異對照以 `docs/handoff/ssot-inventory.done.md`（baseline `3cea5d0`）為準，本檔引用的行號同該 baseline，動工時需重新核對。
> 節奏：每個編號 = 一個 beta 版。修完 → build → 使用者實機測過 → commit → 下一個。任一版驗證失敗，不進下一個編號。
> 版號：從 `2.8.2-beta1` 起跳，依 `AGENTS.md` 規則，src/ 有動才 bump。

## 進度總表

| 編號 | 版本 | 來源 | 一句話 | 規模 | 狀態 |
|---:|---|---|---|---|---|
| 1 | 2.8.2-beta1 | 回報 #47 | worker 視窗撐大與暫停用兩套尺量，特定環境永遠暫停；補 resize 取證＋修量法錯位 | 中 | **Fixed**（使用者實測通過，`7ac4af1`） |
| 2 | 2.8.2-beta2 | 遺留 | 冷卻保護搬走失敗清單後 UI 顯示 0，未說明資料去向 | 小 | **已作廢**（`b88ced6` 落地，但第 4 項停用冷卻後該情境不再發生，說明列已於 `3e7405b` 移除） |
| 3 | 2.8.2-beta3 | 遺留 | 每日上限提醒出現後仍繼續執行 | 小 | **已落地**（`28fef19`）；需跑到上限才看得到，待自然遇到時驗 |
| 4 | 2.8.2-beta4 | 查證 | 自動冷卻保護停用，只留提醒；舊備份給併回入口 | 中 | **Fixed**（`3e7405b`；2026-08-04 實機診斷確認封鎖流程正常、無冷卻觸發） |
| 4.5 | 2.8.2-beta5〜10 | 回報 | 查看動態各分頁勾選框重複繪製、位置錯誤、清單無限延伸（2.7.4-beta73 回歸） | 大 | **Fixed**（`625a6e1`／`ea60cbc`／`2b40ff0`；2026-08-04 使用者實機＋診斷驗收通過） |
| 5 | 2.8.2-beta11 | 遺留 | 檢舉偶發 `submit_not_confirmed`，取證不足 | 中（先取證） | 未動工 |
| 6 | 2.8.2-beta12 | SSOT #4 | dialog context 兩套競爭取法混用（first-vs-last 斷層線） | 中 | 未動工 |
| 7 | 2.8.2-beta13 | SSOT #5 | username 從 href 解析有多套互相矛盾的 parser | 中 | 未動工 |
| 8 | 2.8.2-beta14 | SSOT #1 | 「是否執行中」判斷 14 處分叉，stopping 被當成沒在跑 | 大 | 未動工 |
| 9 | 2.8.2-beta15 | SSOT #6 | 貼文網址正規化有三套以上規則，同一貼文算成多則 | 中 | 未動工 |
| 10 | 2.8.2-beta16 | SSOT #7 | scroll root 三套選擇規則，錯 root 造成空清單或漏帳號 | 中 | 未動工 |
| 11 | 2.8.2-beta17 | SSOT #2 | 三個佇列集合在 core 散讀 53 處、各自組 Set | 大 | 未動工 |
| 12 | 2.8.2-beta18 | SSOT #3 | 平台上傳 payload 同一 UI 有兩份完整推導，欄位不一致 | 大 | 未動工 |
| 13 | 2.8.2-beta19 | SSOT #11 | skip-user 政策在過濾與 breakdown 各寫一份 | 中 | 未動工 |
| 14 | 2.8.2-beta20 | SSOT #12 | 48 小時保留窗硬寫 4 處 | 小 | 未動工 |
| 15 | 2.8.3-beta1 | 查證 | 正式版輕量診斷查不到根因：面板每 1.5 秒固定寫 2 筆洗掉 ring，且輕量層用 `slice(-120)` 位置切法丟掉 priority 保護過的關鍵筆 | 中 | **Fixed**（`5d9493d`，兩輪；2026-08-05 使用者實機 ring 驗收，失敗證據完整保留並據以查出第 19／20 項） |
| 16 | 2.8.3-beta2 | 回報（使用者實測 2026-08-05） | 三無掃描結束後 worker 停在白畫面很久才跳出勾選畫面，期間無任何訊息 | 中 | 未動工 |
| 17 | 2.8.3-beta3 | 回報（使用者實測 2026-08-05） | 三無掃描吐 `followers_dialog_not_found` 後整趟結束；失敗原因不外顯、無診斷、無重試 | 中 | 未動工（取證優先，可與第 15 項並行） |
| 18 | 2.8.3-beta4 | 回報（使用者實測 2026-08-05） | 找不到連結／找不到帳號的失敗帳號，封鎖跑完後不會從佇列清掉，永遠留在開始封鎖清單 | 中 | 未動工（先取證） |
| 19 | 2.8.3-beta5 | **beta1 診斷實測抓到**（2026-08-05） | 檢舉大量失敗實為 `missing_profile_root`，profile root 只查一次不等載入即放棄（4 至 9ms），且對外顯示成「找不到選單」誤導 | 中 | 未動工（優先，疑似線上 #42／#43／#44 同源） |
| 20 | 2.8.3-beta6 | beta1 診斷實測抓到（2026-08-05） | `panel/clamp` 仍每 1.5 秒寫一筆內容相同的紀錄，beta1 的穩態抑制沒覆蓋到這個呼叫點 | 小 | 未動工 |

版號欄是預期值；若某編號實際跨多個 beta（修壞重來），總表如實更新，編號不變。

> **2.8.2 已於 2026-08-04 發布正式版**（CWS／AMO／GitHub 均已送出）。第 5 項起的剩餘項目改以 `2.8.3-betaN` 為版號基準，編號不變。第 15 項優先於第 5 項，因為第 5 項的取證結果會被同一個洗版問題吃掉。

**未排程**：回報 #47 的第二句「回報問題視窗訊息太長，送出按鈕被推到畫面外」（與舊 BUGLIST #7/#8 confirm modal 同家族，回報視窗未吃到該修正）。等使用者決定是否排入。

---

## 1. worker 視窗撐大與暫停用兩套尺量，特定環境永遠暫停（beta1，回報 #47）

**實際問題**：線上回報 #47（Windows 10、Chrome 150、2.8.1、主視窗 2048x937）：「可視化視窗一直重新跳太小沒到700x440無法自動執行」。程式內有兩套互不相通的尺量：

- `Worker.enforceWindowBounds()`（`worker.js:245-267`）用 **outerWidth/outerHeight**（含邊框）判定過小並 `resizeTo`，下界 `WORKER_MIN_WIDTH/HEIGHT = 700x520`。
- 暫停閘門 `Worker.isWindowTooSmall()`（`worker.js:222-226`）用 **innerWidth/innerHeight**（內容區）判定，下界 `WORKER_MIN_VIEWPORT_WIDTH/HEIGHT = 700x440`。

兩者中間隔著瀏覽器 UI（分頁列、工具列、書籤列，Windows 上常吃 80–130px 高）。外尺寸 700x520 減掉之後內容區可能只剩 390–440，剛好搆不到 440 門檻；若使用者在 threads 網域設了頁面縮放（zoom>100%，高解析螢幕常見），innerWidth/innerHeight 還會被縮放再除下去，外尺寸 700 的內容區可能只剩五六百。結果：enforce 認為「外尺寸已達標」不再撐大，暫停閘門認為「內容區不達標」永遠暫停；使用者手動縮小時 enforce 又把視窗彈回 700x520（「一直重新跳」），但那個尺寸的內容區依然不達標。開發者機器（macOS、無縮放）內容區剛好夠，因此測不出來。

**取證缺口**：#47 附的輕量診斷只有 `panel`／`message_route`，完全沒有 worker 視窗的 resize/clamp 紀錄——`enforceWindowBounds` 與 `noteWindowTooSmall` 雖有 `RuntimeDiagnostics.record`，但欄位只有 viewport 寬高，沒有 outer 尺寸、devicePixelRatio、zoom 比（outerWidth/innerWidth）；且使用者從主視窗按回報時，worker ring 的這些 entry 是否進得了輕量診斷需驗證。

**修法方向**（同版做兩件事）：

1. **取證**：resize/clamp/暫停事件記錄補上 `outerWidth`、`outerHeight`、`innerWidth`、`innerHeight`、`devicePixelRatio`、`sizeRatio`（outer/inner，可推 zoom）、`resizeToRequested` 與 `resizeToEffective`（呼叫後實際值，可抓 resizeTo 被瀏覽器拒絕），全部是數字，符合 `_safeFields` 白名單。確認 worker ring 的這批 entry 會併入主視窗回報的輕量診斷。
2. **修明確的量法錯位**：`enforceWindowBounds` 改為以**內容區缺口**撐大——當 inner 不達 700x440 時，`resizeBy(需求inner - 目前inner)` 補足邊框差，而非只看 outer 下界。zoom 造成的縮放屬環境因素，取證資料回來後再決定是否對 zoom 做補償或明確提示使用者。

**驗收**：本機把瀏覽器加上書籤列／模擬 Windows 邊框高度、或設頁面縮放 125% 重現「外尺寸達標但內容區不達標」，修正後視窗自動補足、流程繼續不卡暫停；診斷匯出看得到新欄位。發版後請 #47 回報者更新驗證（狀態改 RESOLVED 前需其回饋或診斷佐證）。

## 2. 冷卻備份搬移失敗清單後 UI 顯示 0（beta2）

**實際問題**：冷卻保護觸發時，`worker.js:1755-1768` 的 `triggerCooldown` 會把 `FAILED_QUEUE` 整份併進 `COOLDOWN_QUEUE` 後清空。資料沒有遺失，搬移本身是刻意設計（避免冷卻期間重試撞牆），但 UI 上失敗清單直接歸零，畫面沒有任何說明。使用者看到的效果等同「我的失敗清單被吃掉了」，曾被當成 BUGLIST #12 的成因之一回報（#12 的另一半 memory cache 問題已在 beta11 修掉，這一半當時判定為刻意行為而留下）。

**修法方向**：搬移當下在 UI 明示「N 筆已移入冷卻備份，冷卻結束後可重試」，冷卻備份的筆數要看得到；不改變搬移邏輯本身。

**驗收**：故意觸發冷卻保護，失敗清單搬走時畫面出現明確說明含筆數，不得只顯示 0；冷卻結束後備份仍可重試。

## 3. 每日上限 250/200 提醒出現後仍繼續執行（beta3）

**實際問題**：使用者 log 中出現「Meta 上限提醒 250/200」訊息後，批次封鎖沒有停，繼續往下跑。超過 Meta 的每日操作上限硬跑，帳號有被平台限制的風險。**根因尚未查**：不確定這個提醒本來就只是顯示用（設計如此、缺少閘門），還是有閘門但被繞過。handoff 記錄為「尚未確認是設計還是漏掉的閘門」。

**修法方向**：先讀計數與提醒的實作，確認上限計數器的來源與提醒觸發點；再決定閘門加在取號處還是批次迴圈。**動工前需使用者拍板**：提醒出現當下是立即停，還是跑完當筆再停。

**驗收**：實機跑到上限提醒出現，流程停止；重新整理頁面不得自動續跑；隔日計數重置後可正常執行。

## 4. 檢舉偶發 `submit_not_confirmed`（beta4，先取證）

**實際問題**：檢舉流程偶發以 `submit_not_confirmed` 收場，代表送出後等不到確認訊號，該筆檢舉成功與否不明。beta12 加了「路由變了就停手」的保險絲後，此 reason 只剩視窗過小時出現，正常尺寸未再重現；但保險絲是新加的，且現有 RuntimeDiagnostics 對「送出後的確認等待」記錄不足，真的再發生時查不到是送出失敗、確認 dialog 沒出現、還是確認文字比對失敗。

**修法方向**：本版只補取證，不改判定邏輯（依 handoff 教訓：只有症狀時不改判定）。在 report 流程的 submit→confirm 段補 RuntimeDiagnostics 欄位（confirm dialog 是否出現、等待毫秒、候選數），沿用 `_safeFields` 白名單，只記數量與布林，不含帳號名或選單文字。發版讓使用者正常尺寸跑一輪。

**驗收**：診斷匯出中看得到新欄位。有重現 → 依原因分佈開後續修復版；無重現 → 記錄後關閉此項。

## 5. dialog context 兩套競爭取法混用（beta5，SSOT #4）

**實際問題**：「現在活動中的彈出視窗是哪一個」全程式有兩套規則：`Core.getTopContext()`（`core.js:2292-2299`）取 DOM **最後一個** `[role="dialog"]`，不看可見性也不看內容；`DialogCollector.pickBestAccountDialog()`（`dialog-collector.js:84-104`）取**帳號連結最多的**。呼叫端混用：core 有 4 處（`2462`、`2524`、`2598`、`2721`）裸用 getTopContext；report flow 自己維護第三套 candidate priority（`report-flow.js:83-100`、`243-264`、`552-600`）；three-no follower flow 第四套「可見且有連結，否則取第一個」（`three-no-watch.js:1800-1808`）；post reservoir 兩種都用。當畫面出現堆疊 dialog、背景殘留 dialog 或空殼 dialog 時，不同流程會把不同 dialog 當成活動清單。這是 v2.5.2 first-vs-last dialog 慘案（連炸 20+ 個 beta）的同一條斷層線；BUGLIST #10 檢舉點到左側主導覽也屬同家族，beta12 只堵了「沒有 dialog 時退回 document」那一半，`getTopContext()` 取最後一個的錯誤退路仍在。

**修法方向**：提供按 feature 可驗證的單一 context resolver，或明確分離 report／activity／followers 三種 contract；禁止裸用 `getTopContext`。

**驗收**：按讚名單、粉絲名單、檢舉流程各跑一批，不得出現「視窗開了但抓不到人」、不得點到 dialog 外元素；堆疊 dialog 場景（清單上再開檢舉選單）不得抓錯層。

## 6. username 解析有多套互相矛盾的 parser（beta6，SSOT #5）

**實際問題**：從 `/@username` href 取出帳號名這件事，全程式至少有四種寫法且規則互相矛盾：`dialog-collector.js:13-17` 的 regex 沒有 end anchor，`/@foo/post/1`、`/@foo?x=1` 都會截出 `foo`；`utils.js:18-22` 的 local parser 只接受完整 `/@foo`；`worker.js:305-313` 先走 `URL.pathname` 再 decode；`three-no-watch.js` 有 4 處自寫 regex 且 normalize 後**不自動 lowercase**；core 另有 7 處 fallback split，對 query/hash、相對 URL、大小寫處理各不相同。同一個 href 在不同流程解出不同 username，會造成 skip 判斷、去重、名單比對不一致。之前只修過匯入路徑的小寫化，其他入口都還是各走各的。

**修法方向**：先決定 canonical parser 的 decode 與 case policy，抽成單一 helper，再逐一替換所有手寫 split／regex。

**驗收**：大小寫混寫、帶 query/hash、encoded、帶 trailing path 的帳號連結，在匯入、封鎖、失敗清單、冷卻備份、三無掃描各流程解出同一 username；不得產生重複或漏判。

## 7. 「是否執行中」判斷 14 處分叉（beta7，SSOT #1）

**實際問題**：「背景 worker 是否還在跑」的正確 helper 是 `resolveControllerStatus`（`core.js:589-610`，可注入 freshness、先處理 `failed`／`stopping`／`stopped`），但只有主面板在用。core 另有 7 處硬寫 `Date.now() - lastUpdate < 10000 && state === 'running'`（`773`、`2100`、`2433`、`2562`、`3465`、`3765` 變體、`4601`）；`main.js:622`、`855`、`utils.js:301`、`post-reservoir-engine.js:158`、`three-no-watch.js:936` 又是 30 秒版本。**已造成實際行為分歧**：`stopping` 狀態在主面板顯示「停止中」，那 7 份 bypass 卻當成「沒在跑」，可能在停止過程中誤開新流程；30 秒版本在 10–30 秒 stale 區間仍當作 active。BUGLIST #4「執行狀態在不同 UI 判斷不一致、偶發誤判或回錯頁」就是這個家族在 2.5.4 的一次爆發，當時只收斂了 sweep runtime 那一塊。

**修法方向**：統一 freshness 門檻、終止狀態優先級與 session/queue precedence，全部呼叫點改走 `resolveControllerStatus`。**收斂會改變 stopping 期間的行為，動工前先列行為變化清單（各 UI 在 stopping 時的顯示與按鈕反應）交使用者確認。**

**驗收**：執行中、停止中、停止後、逾時 stale 四種狀態下，主面板、checkbox、選單狀態列、自動續跑判斷全部一致；停止中不得誤開新流程。

## 8. 貼文網址正規化有三套以上規則（beta8，SSOT #6）

**實際問題**：「兩個 URL 是不是同一則貼文」有至少三種真理：`core.js:1918-1925` 用 origin+pathname（相對 URL 會變絕對）；`utils.js:64-73` 只接受含 `/post/` 的路徑；`storage.js:662-663` 只做 `split('?')[0]`；另有 reservoir 的 `_norm`、sweep 的 `cleanCurrentUrl`、core 5 處與 UI 2 處的直接 split，對 hash、tracking 參數、sweep 參數處理全不一致。同一貼文以相對 href、帶 query、帶 hash 進入不同流程時，水庫 key、來源證據 key、分析來源、UI 比對會各算各的，同一貼文被算成多則。**使用者已拍板**：同一則貼文算一則，舊資料不回頭對齊（不做 migration）。

**修法方向**：定義 source URL／reservoir key／evidence key 是否同一 contract，抽成少數明確 helper 取代所有直接 split。

**驗收**：同一貼文帶不同 query/hash/相對路徑進來只算一則（水庫、來源證據、UI 各驗一處）；既有舊資料不動。

## 9. scroll root 三套選擇規則（beta9，SSOT #7）

**實際問題**：「dialog 裡真正可捲動的清單元素是哪個」有三套判斷：canonical 在 `dialog-collector.js:253-304`（檢查 overflow、排除巢狀 dialog、以帳號列證據評分）；legacy advanced block 在 `core.js:2305-2313`（只挑第一個非 hidden overflow 的 div）；three-no 在 `three-no-watch.js:2174-2180`（只取 scrollHeight 差 80 以上且最大的 div，不看列證據、不排除巢狀 dialog）。遇到巢狀可捲動元素、virtualized 列表、或外殼先有大 scrollHeight 時，三套會捲到不同元素；捲錯 root 的症狀就是名單捲不動、空清單或漏帳號。BUGLIST #14 清理名單秒退雖已修等待時序，收集器捲錯 root 的風險仍在這裡。

**修法方向**：legacy 與 three-no 改用 shared resolver，不同列 contract 用 feature options 表達。

**驗收**：按讚名單、粉絲名單、主 feed 三種捲動場景都能持續載入到底，不得停在半路或回空名單。

## 10. 三個佇列集合散讀 53 處（beta10，SSOT #2）

**實際問題**：`BG_QUEUE`（待封鎖，24 處）、`Storage.getBlockDB()`（已封鎖，16 處）、`COOLDOWN_QUEUE`（冷卻備份，13 處）在 `core.js` 各處被直接讀取、各自 `new Set`、各自決定要不要 lowercase（完整行號清單見 ssot-inventory.done.md 案例 2）。同一輪 DOM 掃描裡，checkbox、過濾、badge、統計可能拿到不同時間點、不同大小寫規則的快照；佇列在兩次讀取之間變動時，畫面各元件會不同步。checkbox 閃爍（六份推導互相覆蓋，checkbox-flicker-ssot 已修）與 BUGLIST #12 重試清單被覆蓋（跨 window memory cache）都是這個家族已經爆過的案例。

**修法方向**：先定義唯一 snapshot/accessor 與統一的 membership／normalization contract，再讓所有讀取與寫回共用。工程大，必要時拆 10a（定義入口＋高風險呼叫點）／10b（其餘呼叫點）兩版。

**驗收**：全套測試通過；實機跑一批封鎖，checkbox、badge、統計數字全程同步無閃爍、無互相覆蓋。

## 11. 平台上傳 payload 兩份完整推導（beta11，SSOT #3）

**實際問題**：平台上傳 v2 的 payload（事件、帳號、來源、分析種子、summary）有兩份完整且各自維護的推導：canonical builder 在 `ui.js:2827-3253`；analytics overlay 又在 `ui.js:3355-3945` 重建一整份，於 `ui.js:4292-4294` 送出。兩份的差異已造成實際資料不一致：**overlay 版少帶 `threeNoFollowerScan`（三無粉絲證據）**，root 與 summary 都沒有此欄位；overlay 版另混入 cockroachDB／endless 統計。也就是手動從 overlay 上傳的資料，和自動上傳的資料，欄位與 coverage 不同，平台端收到的證據完整度取決於使用者從哪個入口按上傳。score、threshold、field spec 兩邊各一份，改一邊必漏另一邊。

**修法方向**：只保留一個 payload builder，overlay 改為純消費 builder 結果。**動工前需使用者拍板**：以哪份為準（canonical 含 three-no evidence vs overlay 含舊統計），先給兩份差異對照表再決定。

**驗收**：手動上傳與自動上傳送出的 payload 欄位一致（實際攔一筆比對）；平台端 ingest 正常。

## 12. skip-user 政策重複（beta12，SSOT #11）

**實際問題**：「哪些帳號要跳過」（自己、貼文作者、回覆對象）的政策寫了兩個近似 helper：`core.js:841-851` 的 `buildSkipUsers` 回傳實際用來排除的 Set，`core.js:854-871` 的 `getSkipUserBreakdown` 只回傳診斷分類；此外 core 4 處與 reservoir 2 處又各自做 strip-`@`／lowercase 的 local filter。目前規則剛好一致所以尚未出錯，但 `skipPostOwner` 的預設值兩邊來源不同（一邊看 `verifiedLikesContext`，reservoir 寫死 `true`），任何一邊改 option 或 normalization 就會出現「診斷說跳過了 A，實際跳過的是 B」的假訊息。

**修法方向**：拆成一個純函式同時輸出 skip Set 與分類，collector、reservoir、diagnostic 共用。

**驗收**：同一名單下，實際排除名單與診斷 breakdown 完全一致（含 postOwner 開關兩種設定）。

## 13. 48 小時保留窗硬寫 4 處（beta13，SSOT #12）

**實際問題**：block ring 與 report ring 的保留窗 `48 * 60 * 60 * 1000` 在 `storage.js:531`、`540`、`559`、`568` 各硬寫一次（讀與寫各兩處）。目前四處一致；風險是未來調整保留期時只改到其中幾處，兩個 ring 的清理與 24 小時計數邊界就會分家。注意 `report-debug-context.js:5` 的 48 小時是另一個獨立的 debug TTL，不屬於同一 contract，不要順手合併。

**修法方向**：抽成 storage 層 retention 常數（或進 CONFIG），四處改引用。

**驗收**：`grep -n "48 \* 60" src/storage.js` 不再命中硬寫數字；全套測試通過；ring 清理行為不變。

## 15. 正式版輕量診斷查不到根因（2.8.3-beta1，查證）

> 本節與下一節的編號對應總表編號。上面各節的標題編號是舊的一套，與總表有偏移，動工時以總表編號為準。

**實際問題**：ADR 0013 讓正式版不必勾同意就附帶輕量診斷，目的是查得到根因。2026-08-05 用回報 #48／#49 實測，這個目的沒有達成，兩份診斷都完全查不出封鎖流程發生什麼事。兩層原因疊加：

1. **ring 被面板噪音洗版**。`core.js:2364` 與 `core.js:2374` 的 `updatePanelRouteVisibility` 每次呼叫都無條件寫 2 筆（`message_route` 與 `panel`），不管狀態有沒有變化；而 `core.js:2459` 的備援 interval 每 1500ms 跑一次 `runScannerPass`，必定呼叫它。`record` 的去重窗只有 1000ms（`core.js:207`），1500ms 剛好躲過去，所以去重完全失效。`core.js:2445` 的 MutationObserver 每批變動再多寫一筆。實測 #49 的 120 筆全是 `panel` 48 筆＋`message_route` 72 筆，沒有任何 blocking／report／sweep 條目。

2. **輕量層用位置切法，丟掉 priority 保護過的關鍵筆**。`core.js:221-228` 的 ring 淘汰有 priority 分級，`start`／`stop`／`commit`／`error` 這類會被保護不刪；但 `core.js:5481` 的 `buildLightweightDiagnostics` 只做 `allEntries.slice(-120)`，照陣列位置切尾巴。被保護的關鍵筆位置靠前，正好被切掉。實測 #49 的 120 筆只涵蓋 34 秒、#48 只涵蓋 44 秒（`truncatedFrom` 分別是 199 與 400），而那段時間使用者正在打字寫回報。

**影響**：正式版使用者不勾完整診斷時（多數情況），對「封鎖沒跑起來」「卡住不動」這類最需要查的問題，附帶的診斷提供不了任何線索。beta 版預設開完整診斷，所以自測時查得到，正式版查不到，這個落差至今沒被發現。不能靠請使用者勾完整診斷來解決，那份含 log 與頁面資訊，隱私上本來就該是例外。

3. **worker 的紀錄只在封鎖完一個帳號後才落盤**。全專案只有 `worker.js:164` 一處呼叫 `RuntimeDiagnostics.persist()`，位置在單一帳號封鎖流程結束之後。worker 根本沒開始跑時（#49 的症狀）一次都不會執行，主視窗送出的回報裡 worker 證據為零。最需要診斷的情境正好是唯一產不出證據的情境。

**更正**：#49 的使用者**有勾完整診斷**（`metadata.userMetadata.diagnosticsBundle` 存在，該欄位只在 `consent.diagnosticConsent === true` 時附上）。完整層 60,802 bytes、199 筆，其中 `message_route` 98 ＋ `panel` 66 佔 82%，`blocking` 掛零。所以這不是同意與否的問題，給了全部仍然查不出來。

**完整評估與數字**見 `docs/history/2026-08-05-diagnostics-budget-assessment.md`（含三層上限該不該調的結論：都不調，只改記法、挑法與落盤時機）。

**修法方向**：三件事一起做，缺一還是查不到。

- `updatePanelRouteVisibility` 的兩筆改成狀態有變化才寫（`hidden` 翻轉、rect 超過閾值位移），穩態不寫。MutationObserver 那筆同樣要收斂或取樣。
- 輕量層改成照 priority 挑：先取全部 priority > 0 的條目，再用剩餘額度補最近的 priority 0，總數維持 120 筆上限。順序仍照時間排。
- `persist()` 的呼叫點補在 worker 啟動、佇列取件與任何 terminal／error 事件，不能只掛在單一帳號封鎖完成之後。
- 三層上限（`LIMIT` 200、`PERSIST_LIMIT` 400、`LIGHTWEIGHT_ENTRY_LIMIT` 120）**都不調整**。噪音佔 82% 的前提下調大只是多帶廢話、體積翻倍而查得到的東西不變。

**驗收**：造一份含 blocking start／stop 與大量 panel 噪音的 ring fixture，改動前 `buildLightweightDiagnostics` 取不到 blocking 條目（red），改動後必定包含（green）；穩態閒置 60 秒的 `panel`／`message_route` 條目數比改動前下降一個數量級以上，兩邊數字寫進報告；`_safeFields` 白名單不放寬。

## 16. 三無掃描結束後 worker 卡白畫面（2.8.3-beta2，回報）

**實際問題**：使用者 2026-08-05 實測回報，三無掃描跑完後，worker 視窗會停在一片白畫面很久，最後才跳出要勾選執行的畫面。最終結果正確，但中間那段沒有任何訊息，使用者無從判斷是還在跑、當掉了、還是該關掉重來。

**動工前要先取證**（根因未查，以下是待驗證的方向，不得直接當結論）：白畫面是掃描結束到結果畫面渲染之間的空窗，需要先量出這段實際耗時、期間 worker 在做什麼（結果彙整、storage 寫入、profile 補抓），以及畫面為什麼是空的而非停在掃描進度上。

**修法方向**：取證後再定。最低限度是這段期間要有訊息，說明正在整理結果與大概還要多久；能縮短耗時更好，但不得為了縮短而讓結果不完整。

**驗收**：掃描結束到結果畫面出現之間，任何時間點畫面都有可讀的狀態文字，無空白期；掃描結果內容與修改前一致。

## 17. 三無掃描 `followers_dialog_not_found` 後整趟結束（2.8.3-beta3，回報）

**實際問題**：使用者 2026-08-05 實測回報，三無掃描過程中出現 `followers_dialog_not_found` 後直接退出三無。

程式中只有兩條路徑會拋出這個 error（`src/features/three-no-watch.js:1182`，來源是 `openFollowersDialog` 回傳 `null`）：

1. **找不到觸發元素**（`three-no-watch.js:1743-1754`）：`Utils.pollUntil(findTrigger, 10000, 250)` 十秒內找不到可點的粉絲入口。`findTrigger` 依序試四種取法：精確粉絲數文字節點（`isFollowerCountText` 要求文字完全符合 `N位粉絲`／`N粉絲`／`N followers`）、粉絲數按鈕、`/followers` 結尾的 href、以及 `CONFIG.FOLLOWERS_TEXTS` 文字比對。四種全落空回傳 `null`，debug step 記為 `followers_trigger_not_found`。
2. **點了但視窗沒開**（`three-no-watch.js:1771-1799`）：`Utils.simClick` 後等 8000ms，未開再派一次原生 click 事件並等 10000ms，合計 18 秒仍無 dialog，debug step 記為 `dialog_not_found_after_retry`。

拋出後由 `three-no-watch.js:1058-1068` 的 catch 接住，`finishScan({ status: 'failed' })`，整趟掃描結束。

**三個問題疊加**：

- **原因不外顯**：程式其實把卡在哪一步寫進了 scan state 的 `debug.step`，但沒有顯示給使用者，也沒有進 `RuntimeDiagnostics`，所以線上回報查不到是哪一種。
- **沒有 runtime 診斷**：`openFollowersDialog` 全程沒有任何 `RuntimeDiagnostics.record` 呼叫，`followers` feature 在 ring 中對這一步是空白。
- **失敗即整趟放棄**：這一步只重試一次點擊，沒有退回重載頁面再試、沒有換取法重試、沒有從 cursor 斷點接續。相較封鎖流程有完整重試與 breaker，這裡是單點脆弱。Threads 頁面本來就會慢與改版面，一次沒開就作廢代價過高。

**動工順序**：**取證優先，先做診斷再談重試**。

**複核修正（Fable，2026-08-05）**：原本寫「必須等第 15 項修完才能動工」，這個依賴寫法過強。真正的依賴只指向根因 B。若第 17 項用 `error`／terminal stage 記錄，priority 3 在 ring 的 200 上限內不會被噪音淘汰（`core.js:228-233` 的淘汰順序先砍 0），會丟的環節只有輕量層的位置切法。另外 `openFollowersDialog` 的失敗原因已寫進 scan state 的 `debug.step`，而 `buildBugReportDiagnosticsBundle`（`core.js:5499` 起）已讀 `THREE_NO_SCAN_STATE`，只是只取 status 不取 debug；把 `debug.step` 的列舉代號放進 bundle 可以完全繞過 ring。

因此第一段的程式與測試**可與第 15 項並行開發**，驗收合併在 beta3 做。計畫本身一版一修串行出版，並行與否只影響開發不影響發布。

**修法方向**（分兩段，第一段先出）：

第一段（取證）：`openFollowersDialog` 的四種取法各自成敗、輪詢耗時、點擊後 dialog 出現與否、頁面上 `div[role="dialog"]` 的數量，都用 `RuntimeDiagnostics.record('followers', ...)` 記下來，欄位限數字與布林，取法用列舉代號（`count_text_node`／`count_button`／`href_path`／`text_match`），不得記入帳號、網址或選單文字。失敗時 UI 訊息要說明卡在哪一步，取代目前只吐一個代碼。

第二段（重試）：依第一段量到的實際失敗分布再定。可能方向包含重載頁面後重試、放寬 `isFollowerCountText` 的比對、以及失敗後從 cursor 斷點接續而非整趟作廢。**第一段的數字出來前不得直接改判定條件**，避免又是憑名字猜 selector。

**驗收**：第一段完成後，同一個失敗情境的回報中，`followers` feature 必定含有可分辨兩種成因的條目；UI 訊息能說出卡在哪一步。第二段驗收待第一段數字出爐後再定。

## 18. 失敗帳號留在佇列裡清不掉（2.8.3-beta4，回報）

**實際問題**：使用者 2026-08-05 實測回報，找不到連結或找不到帳號的失敗帳號，在封鎖跑完之後不會從清單消失。若最後剩 10 個這類帳號，這 10 個會一直留在開始封鎖的清單中。

**已查到的事實**（`src/worker.js` 的 `runStep` 各結果分支）：

每一個結果分支移出佇列都用同一個守衛，成功（`1621-1625`）、`failed`（`1651-1655`）、`menu_not_found`／`navigation_mismatch`／`private_manual_required`（`1667-1671`）、`vanished`（`1683-1687`）、驗證失敗與驗證通過（`1341-1344`／`1355-1358`）全部是這個形狀：

```
if (q.length > 0 && q[0] === rawTarget) { q.shift(); ... }
```

**只有佇列頭端嚴格等於 `rawTarget` 才會移除，不相等時整段靜默跳過**，沒有任何以值為準的後備移除，也沒有跑完之後的殘留清理。任何造成頭端與 `rawTarget` 不一致的情況，該筆就永久留在佇列裡。

**待驗證的假設，不得直接當結論**：不一致最可能來自正規化差異，本專案有大小寫造成重複封鎖的前例（2.8.2 release notes 已載）。也可能來自佇列在處理途中被其他路徑改動而換了頭端。**動工前必須先量出實際的不一致情形與成因**，不得憑推測直接改比對方式。

**修法方向**：取證後再定。可考慮的方向包含移除改成以正規化後的值為準而非頭端比對、以及每輪結束時做一次殘留對帳。**不得在沒有數字的情況下直接放寬比對條件**，那會把「清不掉」換成「清掉不該清的」。

**驗收**：造一份佇列頭端與 `rawTarget` 不一致的 fixture，改動前該筆在跑完後仍留在佇列（red），改動後必定被移除（green）；同時斷言正常情境下不會誤移除其他帳號。

## 19. 檢舉大量失敗實為 profile root 沒等載入（2.8.3-beta5，beta1 診斷實測抓到）

**來源**：這是 2.8.3-beta1 診斷修正上機後第一份實測 ring 抓到的問題，證明修法達到目的。使用者 2026-08-05 跑檢舉佇列，主動貼出診斷。

**實測數字**（ring `58af9b6a0b90`，version `2.8.3-beta1`）：

第一批 20 筆檢舉中約 8 筆失敗，第二批續跑再見數筆。所有失敗形狀完全一致：

```
stage=navigation  reason=menu_not_found  candidateCount=0  menuItems=0  elapsedMs=0
stage=terminal    priority=3  ok=false  reason=failure  elapsedMs=4 至 9
```

成功案例作為對照：

```
stage=navigation  candidateCount=0  repeatCount=2
stage=navigation  candidateCount=1        <- 失敗案例從來沒有這一筆
stage=menu        menuItems=19 至 71      約 700ms
stage=action  x3
stage=confirm     confirmButtons=1 至 3
stage=finish      priority=3  elapsedMs=5,700 至 10,500
```

**成功要 6 至 10 秒，失敗只要 4 至 9 毫秒。**

**根因**（已由程式碼確認，非推測）：

`src/features/report-flow.js:831-834`

```
const profileRoot = mode === 'profile' ? Core.findProfileRoot?.(user) : null;
if (mode === 'profile' && !profileRoot) {
    return Core.ReportDriver.skipOrPauseForDebug(user, options, 'missing_profile_root', ...);
}
```

`findProfileRoot` 是**同步單次查詢，沒有輪詢也沒有等待**。頁面還沒 render 完就查，查不到立刻放棄，這就是 4 毫秒的來源。整條流程其他步驟都有輪詢預算，只有這一步沒有。

**第二個問題，對外標籤錯誤**：`report-flow.js:384` 把 `missing_profile_root` 一律映射成 `menu_not_found`，UI 顯示「找不到選單」（`src/ui.js:1123`）。使用者看到的訊息與實際成因無關，選單根本還沒走到。

**疑似同源的線上回報**：#42「一直出現封鎖失敗的訊息」、#43「進行封鎖時一直出現找不到選單」、#44「失敗顯示：封鎖 · 找不到選單，但可以手動封鎖，是否因為封鎖清單太長導致選單較慢」。#44 的使用者自己就猜到是「太慢」，方向正確而我們給了錯的標籤。**這三則是封鎖流程不是檢舉流程，動工前必須確認封鎖側是否有同樣的單次查詢，不得直接假設同源。**

**修法方向**：

- `findProfileRoot` 這一步比照流程其他步驟給輪詢預算，等到 root 出現或逾時，逾時才算失敗。預算值依實測 render 時間決定。
- 失敗標籤與實際成因對齊，`missing_profile_root` 不得再顯示成「找不到選單」。
- 檢查封鎖側 `MoreLocator` 相關路徑是否有同樣的單次查詢。

**驗收**：模擬 profile root 延遲 N 毫秒出現的 fixture，改動前立即失敗（red），改動後在預算內成功（green）；逾時情境仍正確失敗且標籤為 root 相關而非選單。實機重跑同一份檢舉佇列，失敗筆數顯著下降，數字寫進報告。

## 20. `panel/clamp` 穩態噪音未收斂（2.8.3-beta6，beta1 診斷實測抓到）

**實際問題**：同一份 beta1 實測 ring 顯示，`panel/clamp` 仍每約 1500ms 寫一筆，且內容重複。連續四筆 `rectLeft` 都是 `1147.125`、`rectWidth` 都是 `224.875`，換位置後又連續四筆相同值。21 秒內 `panel` 共 32 筆。

**成因**：beta1 的穩態抑制只改了 `Core.updatePanelRouteVisibility`（`core.js:2364`／`2374`），沒有覆蓋 `panel/clamp` 這個呼叫點（`src/ui.js:11` 的 `panelDiagnostics`，由 `anchorPanel` 觸發）。`record` 的去重窗 1000ms 對 1500ms 間隔無效，理由與根因 A 相同。

beta1 新增的 `record()` 每分鐘 22 筆通用上限會把它從約 40 筆壓到 22 筆，屬於防線生效，但那仍是每分鐘 22 個浪費掉的名額。

**修法方向**：`panel/clamp` 比照 `updatePanelRouteVisibility` 改成有變化才寫，rect 與 viewport 用整數比較避免浮點抖動。

**驗收**：面板位置不變的穩態 60 秒，`panel/clamp` 條目數降到個位數；面板真的被夾住或位移時仍必定記錄。

---

## 每版固定流程

1. 修（只動該編號範圍，一版一事）
2. `node --test` 全套（逐檔跑，目錄模式會 MODULE_NOT_FOUND）
3. bump `src/config.js` → `./build.sh --no-bump`
4. 使用者實機測（照該項驗收）
5. 過了才 commit，訊息寫「為什麼」；BUGLIST／本表同步更新狀態
