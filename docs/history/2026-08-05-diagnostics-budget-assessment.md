# 診斷紀錄該放多少東西：現況評估與建議

> 時點：2026-08-05。評估對象是 2.8.1／2.8.2 的 `RuntimeDiagnostics` 與問題回報附帶的兩層診斷。
> 證據來源：線上回報 #48（2026-08-04，2.8.1，MacIntel）與 #49（2026-08-04，2.8.1，Win32），皆為真實使用者。
> 本檔是時點快照，供計畫第 15 項動工時當輸入；實際行為以動工當下的程式碼為準。

## 一、先更正一個錯誤判斷

回報 #49 的使用者**有勾完整診斷**。`metadata.userMetadata.diagnosticsBundle` 存在，而該欄位只在 `consent.diagnosticConsent === true` 時才會附上（`core.js:5674-5678`）。

也就是說，這不是「使用者沒勾所以資料少」。使用者給了我們能給的全部，我們仍然查不出根因。問題在收集與挑選，不在同意。

## 二、實測數字

### 回報 #49（按下開始封鎖後 worker 沒動作）

| 項目 | 實測值 |
|---|---|
| `metadata` 全部 | 98,875 bytes |
| 自動附帶的輕量層 | 37,817 bytes（120 筆） |
| 勾選同意的完整層 | 60,802 bytes（199 筆） |
| 完整層中 ring 佔比 | 60,478 / 60,802 = **99.5%** |
| 單筆平均 | 311 bytes |
| 輕量層涵蓋時間 | **34 秒** |
| 輕量層中 `start`／`terminal`／`error` 類條目 | **0 筆** |

完整 ring 的 199 筆組成：`message_route` 98、`panel` 66、`selection` 24、`clean_list` 9、`runtime` 2、**`blocking` 0**。

雜訊（`message_route` ＋ `panel`）佔 164/199 = **82%**。

### 回報 #48（引用分頁勾選框位置錯誤）

輕量層 120 筆涵蓋 **44 秒**，`truncatedFrom` 400（ring 已滿）。

## 三、三個根因，彼此獨立

### 根因 A：穩態噪音無條件寫入

`updatePanelRouteVisibility`（`core.js:2364`、`core.js:2374`）每次呼叫固定寫 2 筆，狀態沒變也寫。`core.js:2459` 的備援 interval 每 1500ms 必定呼叫它。`record` 的去重窗是 1000ms（`core.js:207`），1500ms 剛好躲過。`core.js:2445` 的 MutationObserver 每批 DOM 變動再多寫一筆。

結果：閒置不動也以每分鐘約 80 筆的速度灌 ring。任何有價值的紀錄在一兩分鐘內就被沖掉。

### 根因 B：輕量層用位置切法，丟掉已被保護的關鍵筆

ring 的淘汰有 priority 分級（`core.js:220-228`）：`start` 給 2，`stop`／`finish`／`commit`／`rollback`／`error`／`close`／`terminal` 給 3，其餘 0；淘汰時優先砍 0。這個機制是對的。

但 `buildLightweightDiagnostics`（`core.js:5481`）只做 `allEntries.slice(-120)`，照陣列位置切尾巴。被 priority 保護留下來的關鍵筆位置靠前，正好被切掉。#49 的 120 筆裡 priority 類條目掛零，就是這個結果。

**ring 費心保護的東西，被送出前的最後一步親手丟掉。**

### 根因 C：worker 啟動階段的紀錄不落盤

worker 跑在另一個視窗，自己的 ring 隨視窗關閉消失，靠 `RuntimeDiagnostics.persist()` 寫進 storage 讓主視窗接得起來。全專案只有一處呼叫 persist：`worker.js:164`。

**更正（Fable 複核，2026-08-05）**：該處位於 `recordSafetyDiagnostic` 函式體內，而該函式每個帳號觸發 2 至 4 次，cooldown（`worker.js:395`）、stop（`worker.js:1248`）、retry／failure／breaker（`worker.js:1299-1301`）也都會觸發。所以 persist 不是「封鎖完一個帳號才跑一次」，實際上跑得很勤。本檔初稿的描述不精確，成本估算據此修正：新增呼叫點的邊際成本很小，因為成本大戶今天就在跑。

**真正的缺口**：`Worker.init` 的 `begin` 與 `precondition`（`worker.js:322-323`）發生在第一次 safety diagnostic 之前。worker 根本沒開始處理任何帳號時（#49 正是這個症狀），一次 safety diagnostic 都不會發生，persist 因此一次都不執行，主視窗送出的回報裡 worker 證據為零。

**最需要診斷的情境，正好是唯一產不出證據的情境。** 這個結論不變。

### 根因 D：失敗類 stage 的 priority 是 0（Fable 複核新增）

這一條是複核發現的，初稿完全漏掉，而且它會讓根因 B 的修法失效。

`core.js:226` 的分級只給 `start` 2 分，`stop`／`finish`／`commit`／`rollback`／`terminal`／`error`／`close` 3 分。worker 實際記錄失敗用的 `failure`、`breaker`、`retry`、`menu`、`confirm` 這些 stage 全部拿 0 分，且 `worker.js:1299-1301` 記 failure 與 breaker 時沒有設 `terminal: true`。

一趟封鎖 100 個帳號會產生約 300 至 600 筆條目（`worker.js:1246` 的 dequeue 加 `1556`／`1565`／`1601`／`1621`／`1647`／`1653`／`1672`／`1692` 的逐帳號結果，視窗過小時再加 `worker.js:269` 的 wait），遠超 ring 的 200 上限，而這些幾乎全是 priority 0。

**後果**：批次中段第 30 個帳號的失敗證據，會被後面 70 個帳號的正常條目從 ring 裡整個洗掉。priority 保護救不到它，改成 priority 挑選也救不到它，因為它本來就是 0 分。三無掃描同理，`three-no-watch.js:632`／`635` 的 scroll 與 request 進度條目因 fields 內數字遞增而繞過去重，長掃描一樣灌滿 ring。

**不修這條，根因 B 的修法做完仍然查不到 #49 那類案件。**

## 四、該放多少：建議

先分清楚現在被混在一起的三個數字：

| 用途 | 現值 | 建議 | 理由 |
|---|---|---|---|
| 記憶體 ring 上限 | 200（`LIMIT`） | 維持 200 | 噪音收斂後 200 筆足夠涵蓋數十分鐘 |
| 跨視窗落盤上限 | 400（`PERSIST_LIMIT`） | 維持 400 | 同上，且要改的是落盤時機不是筆數 |
| 自動附帶上限 | 120（`LIGHTWEIGHT_ENTRY_LIMIT`） | 維持 120，改挑法 | 120 × 311 bytes ≈ 37KB，體積合理 |

**結論：不要調大任何數字。** 82% 是噪音的前提下，把 400 調成 800 只是多帶 300 筆廢話，體積翻倍而查得到的東西不變。要改的是三件事：

1. **不要記穩態。** `updatePanelRouteVisibility` 的兩筆改成狀態變化才寫（`hidden` 翻轉、rect 位移超過閾值）。MutationObserver 那筆改成取樣或只在 pass 真的有注入時寫。同樣的 120 個位置，涵蓋時間會從 34 秒變成數小時。

2. **挑選照重要程度，不照時間。** 輕量層先全取 priority > 0 的條目，再用剩餘額度補最近的 priority 0，總數維持 120，順序仍照時間排。

   **複核補正的三條規則**（缺一則挑選法有未定義行為）：

   - **失敗類 stage 必須先納入 priority > 0**，否則挑什麼都挑不到失敗證據（見根因 D）。
   - **priority > 0 本身超額時，新到舊取**。`begin()` 每次呼叫都產生 priority 2 的 `start`，而 selection 這個 feature 每次勾選都走 begin／end（`core.js:771`／`809`／`1113`），一次操作固定產出兩筆 priority > 0。使用者手動勾選幾十列後就可能超過 120 筆。若照時間從頭取，最舊的 UI 骨架會把最新的 worker 失敗證據擠掉。
   - **補 priority 0 時，優先補與入選 terminal／error 同 `operationId` 的條目**，再輪到單純最近的。否則失敗發生在幾分鐘前時，補進來的是失敗之後的雜項，等於有結論無過程。

   ring 既有的 priority 分級直接沿用，不需另立一套。

3. **worker 一有動靜就落盤。** persist 的呼叫點至少要補在 worker 啟動、佇列取件、以及任何 terminal／error 事件上，不能只掛在「封鎖完一個帳號」之後。

### priority 分級的 SSOT 走法（複核指定）

初稿給了兩個選項：`_sanitizeEntry` 保留 priority 欄位，或挑選時重算。複核指出兩者各有坑，並給出第三條路，**採用第三條**。

保留欄位的坑：persist 走 localStorage，`_loadPersisted`（`core.js:266` 起）讀回來的條目是使用者可改的外部輸入，直接信任存回來的 priority 就是第二份真相，還會遇到舊版寫入的條目沒有這個欄位的版本偏移。

**第三條路**：抽一個具名分級函式，`record()` 用它算，`_sanitizeEntry` 也一律用它重算並把結果放進輸出，永不信任輸入條目自帶的 priority。欄位存在、實作只有一份、外部輸入也污染不了分級。

### 更根本的兩個方向（複核提出）

**建議納入：`record()` 層的通用頻率上限。** 修法 A 是逐呼叫點修補，`updatePanelRouteVisibility` 修完後，下一個寫得太勤的呼叫者會原樣重現整個問題，這違反 `docs/PLANNING.md` 第 3 步的「只改一處」槓桿原則。在 `record()` 內對相同 feature 加 stage 的組合設每分鐘上限，超過就收斂成一筆帶 `repeatCount` 的摘要，是一次到位的防線。與修法 A 不衝突，狀態變化才記在語意上仍然更好，通用上限則保證未來不再回歸。

**列為後備：失敗觸發式事件快照。** 任何 priority 3 或 error 條目出現時，把它前面的 N 筆連同一起凍結到獨立的 incident 槽，回報時優先附 incident。這是唯一能結構性保證「失敗前的過程」不被洗掉的做法，priority 挑選法保證不了這件事。內容同樣走 `_sanitizeEntry`，隱私面不變。**這次不做**，等 2.8.3 上線後用真實回報驗證現方案是否已足夠，查不到再上。

### 額外建議：每個 feature 給配額

即使收斂了噪音，單一忙碌的 feature（例如三無掃描）仍可能塞滿整個 ring 而餓死其他證據。建議輕量層挑選時給每個 feature 一個上限（例如 `panel` 最多 10 筆），確保跨 feature 的證據都留得下來。這條可以放到第 15 項之後再做，不阻擋主修。

### 不建議的做法

- **請使用者多勾完整診斷**：#49 證明勾了也查不到，而且完整層含 log 與頁面資訊，隱私上本來就該是例外。
- **放寬 `_safeFields` 白名單**：本次三個根因沒有一個是欄位不夠造成的，放寬只增加隱私風險。

## 五、驗收方向

1. 造一份含 blocking `start`／`terminal` 與大量 panel 噪音的 ring fixture，改動前輕量層取不到 blocking 條目（red），改動後必定包含（green）。
2. 穩態閒置 60 秒，`panel` 與 `message_route` 的條目數比改動前下降一個數量級以上，兩邊數字寫進報告。
3. worker 啟動後立刻關閉（不封鎖任何帳號），主視窗仍能在 ring 中看到 worker 的 `start` 紀錄。**red 測試要確保情境不落入 cooldown 路徑**，否則 `worker.js:395` 會先 persist，量出來不是 0，red 立不起來。
4. `_safeFields` 白名單不放寬；輕量層體積維持在 40KB 以內。
5. 模擬一趟 100 帳號的封鎖，其中第 30 個失敗，改動前輕量層取不到該筆失敗證據（red），改動後必定包含（green）。這條驗收根因 D，是本次是否真的解決 #49 那類案件的唯一判準。
