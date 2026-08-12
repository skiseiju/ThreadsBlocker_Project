# 交接：三無誤判調查與網軍命名 pattern 研究

- 建立：2026-08-12
- 交接自：Claude Opus 5（主對話）
- 交接給：Fable（對抗複核角色接手調查）
- 專案 HEAD：`2add1ee`，版號 `2.8.4-beta19`
- 相關：`docs/PLAN_2.8.2_STRUCT_DEBT.md`、`AGENTS.md`

---

## 一句話

三無判定把真人標成三無，成因未定。**動手改判定邏輯之前必須先導出 53 筆既有 findings 逐筆看觸發旗標**，資料已在使用者本機 storage，不需要改任何程式。

---

## 0. 接手前必讀的三條紅線

1. **不要改 `Core.ThreeNoWatch` 的判定邏輯**，直到第 3 節的兩份證據到手。本輪主對話已因為證據不足猜錯三次。
2. **不要再用那份 53 人三無名單做任何統計**。名單同時有假陽性與假陰性，先前據此建的門檻全部失效。
3. **新增兩個檔案都要用的常數，一律定義在 `src/config.js` 並匯出**。原因見第 5 節，這條已經造成過一次整支腳本不執行。

---

## 1. 版本與事故現況

### 版本

| 項目 | 狀態 |
|---|---|
| 正式版 | `2.8.4`（commit `7454272`），**尚未上傳商店** |
| Chrome Web Store 現況 | `2.8.3`，已上架，無待審草稿 |
| 目前 HEAD | `2add1ee` = `2.8.4-beta19` |
| 全套測試 | `tests/` 99 檔，沙箱外全綠 |

`cf_bug_admin/tests/privacy_release.test.mjs` 自 2.8.2 發版起一直是紅的，斷言 README 為 `v2.8.1` 而現況是 `v2.8.4`。與本案無關，未處理。

### 已修的嚴重事故

`2.8.4-beta17` 與 `beta18` 在 `src/storage.js` 與 `src/features/three-no-watch.js` 各宣告了同名 top-level const `THREE_NO_FOLLOWER_ROSTER_PROCESSING_STATUSES`。

逐檔 import 合法，但 `build.sh` 把所有檔案串進同一個 IIFE，串好即 `Identifier has already been declared`，**整支腳本一行不執行**，使用者連面板都看不到，連帶無法匯出任何診斷。

98 個測試檔全綠沒擋住，因為測試逐檔 import，**從未檢查使用者實際拿到的打包產物**。

修復：

- `33f57d7`：`build.sh` 在串完之後、產出 artifact 之前跑 `node --check`，不通過 exit 1。已實驗驗證會擋。
- `447d9a4`：常數收斂到 `src/config.js` 唯一定義並匯出。

---

## 2. 三無誤判：事實與已知

### 實測事實

使用者掃 `inseptembers` 的 1,513 個追蹤者，程式判定 53 人為三無。主對話用未登入瀏覽器抽查七個公開頁：

| 帳號 | 未登入頁所見 | 判定 |
|---|---|---|
| shaoqil97 | 九篇貼文，2026-03 至 2026-07，戰錘模型主題 | 三無 |
| boltchang | 有貼文，最新 2026-07 | 三無 |
| qingzhec | 有貼文，最新 2026-07 | 三無 |
| jessicalee2066 | 私人帳號 | 三無 |
| joseph431689 | 無貼文 | 三無 |
| charlottwu | 無貼文 | 三無 |
| kao3179 | 無貼文 | 三無 |

**使用者已在登入狀態確認 `shaoqil97` 確實有貼文，是真人。** 其餘六個未經登入狀態交叉確認。

### 判定公式（`three-no-watch.js:3000` 附近）

```
noAvatar && (noBio || noPosts || noReplies || noReposts || suspiciousUsername || isPrivate)
```

**六選一。帳號有貼文與被判三無完全不衝突。** 主對話最初拿「有沒有貼文」單一維度去對這個多維度 OR，尺度錯位，這是本案最大的方法錯誤。

### Fable 複核推翻的三件事

1. **私人帳號被判三無是設計不是 bug。** git log 可證 2.7.1 的 commit 明確把 `|| isPrivate` 加進公式。`accountPrivate ? false : ...` 那些保護只負責把貼文與計數設成 unknown，公式最後一項直接把私人帳號當成立條件。要改是 ADR 層級的產品定義決定，不能當 bug 修。
2. **「誤判率約一半」站不住。** 4/7 的 95% 信賴區間約 25% 到 84%。且七個怎麼挑的沒交代，可能有選樣偏誤。
3. **未登入頁驗證方向不對稱。** 「看得到貼文」可信，「看不到貼文」不可信，Threads 未登入常擋內容。所以連判定為「正確」的三個也未被證實。

### 確實存在但未證實為本次主因的缺陷

**缺陷甲：空狀態第一眼即定案**

`waitForProfileContentSignal`（`three-no-watch.js:3393`）：

- 有內容必須實際找到貼文連結才成立
- 空狀態 `profileSectionHasExplicitEmpty` 第一次回 true 就 `break` 並寫 `known: true, hasContent: false`
- `emptyFirstSeenAt` 在同一輪設定後立刻算差值，**提前 break 路徑上 `emptyObservedMs` 結構性恆為 0，防抖是死碼**
- 內層 `readProfileContentSignal` 用 `allowExplicitEmpty: false` 並留有 `explicit_empty_waiting_for_stability` 字樣，可見原本有等穩定的意圖，被外層 break 抵銷

**缺陷乙：更早還有一個定案點**

`three-no-watch.js:2815` 的 `firstVisibleSignal` 用 `allowExplicitEmpty: true`，其前置等待（`:2804`）只要求 main 裡出現任何 `a`、`img`、`span`，**連頂部導覽列都滿足**。等於頁面剛開始畫就讀一次，當下若空字樣在畫面上直接定案，`waitForProfileContentSignal` 根本不會執行。

**只修甲修不完，必須連乙一起處理。**

**缺陷丙：比對範圍未限定區塊**

`readProfileExplicitEmptySignal`（`:3455`）掃整個 `main` 的 innerText，沒有限定分頁區塊。kind 有分流字串表（base 只比串文字樣、replies 只比回覆字樣），跨分頁互撞機率低，但**貼文本文剛好含有「尚無任何串文」這種句子也會中**。字串表只有中英兩語，其他介面語言會走 timeout，方向是漏判。

### Fable 認為更可能的主因

**`noReposts` 在 OR 裡。** 很多真人從不轉發，reposts 頁真的空，`known: true`、`noReposts: true`，配上預設頭像就中。

**這不是時序 bug，是條件設計太寬。** 對「真人被判三無」的解釋力可能比空狀態競態更強。

### 已排除的假說

| 假說 | 結論 |
|---|---|
| 速度模式倍率縮短探測預算 | **排除**。`waitForProfileContentSignal` 用自己的 while 迴圈配 `safeSleep`，不吃倍率。6/9/8 秒不會被 turbo 縮短 |
| 分頁切換沒切到 replies/reposts | **排除**。`:2784` 直接 `location.assign`，有 `isOnProfileProbePath` 守門，path 不符回 `known: false`，失敗方向安全 |
| `rect.top >= 120` 過濾漏掉第一篇貼文 | **非主嫌**。探測前 `:1693` 有 `scrollTo(0,0)`。且 `noPosts` 需要 `known: true`，content 偵測失敗只會走 timeout 不會判空 |

### 死碼警告

`profileTabHasContent` 整個函式**沒有任何呼叫點**。調查時會誤導，不要照它推論。

---

## 3. 接手後要做的第一件事

### 3.1 導出 53 筆 findings 逐筆看觸發旗標（不需改程式）

findings 每筆已持久化（`:4067` 確認）以下欄位：

- `noPosts`、`noBio`、`noReplies`、`noReposts`、`suspiciousUsername`、`accountPrivate`
- 各自的 `*Known` 旗標
- `metadataDebug.postsSignalReason`、`repliesSignalReason`、`repostsSignalReason`，含 `explicit_empty:` 加匹配字樣

**要回答的問題**：

1. 這 53 筆各是被哪一個條件推過線的？分布長什麼樣？
2. `postsSignalReason` 是 `explicit_empty:` 開頭的有幾筆？**只有這些才可能是空狀態競態或誤匹配。**
3. 有貼文卻被判 `noPosts: true` 的，reason 是什麼？

**乾淨的檢驗**：`noPosts` 需要 `known: true`，而 known 只有 `content_found` 與 `explicit_empty` 兩種來源。content 偵測失敗本身只會走 timeout 不會判空。**所以 reason 不是 `explicit_empty:` 開頭的話，缺陷甲乙丙都不成立，要往 `noReposts` 或 `noBio` 找。**

### 3.2 對七個樣本在登入狀態重驗

補齊：實際有無貼文、有無回覆、有無轉發、有無頭像、有無簡介。這樣才能對上六選一的公式。

### 3.3 取證不足的部分

`waitedMs` 與 `emptyObservedMs` **沒有持久化**，而且如上述 `emptyObservedMs` 在提前 break 路徑恆為 0，存了也無鑑別力。

要實錘競態時序，需要加記輪詢過程的 reason 時間序列或空字樣首見時刻。**那是取證改動不是修復改動，可以先上**，但要先看 3.1 的結果決定值不值得。

---

## 4. 網軍命名 pattern 研究：已做完的部分

### 4.1 觀測平台資料存取

| 項目 | 現況 |
|---|---|
| 帳號名稱在哪 | **R2 的 raw payload，明文**。D1 只存指標 |
| D1 資料表 | 只有計數，**沒有任何帳號層級識別碼** |
| 撈取憑證 | `~/.codex/secrets/ThreadsBlocker/r2-platform-ingests.env`（唯讀、只綁該 bucket） |
| 資料量 | 50,073 筆原始上傳，5,572 筆 accepted，948 個觀測者，2026-06-07 起 |

**已知 bug**：D1 存的 R2 指標與實際 key 對不上。D1 寫 `r2://platform-raw-ingests/<日期>/received/<uuid>/<hash>.json`，實際 key 是 `platform-raw-ingests/<日期>/received/<uuid>/<hash>`，多一層前綴且沒有 `.json`。**照指標去撈一定失敗。** 尚未落盤成計畫項目。

**安全事故**：主對話曾把 R2 金鑰放進 shell 變數，指令失敗時 shell 把整串印進錯誤訊息，**Access Key ID 與 Secret 已明文出現在對話紀錄**。使用者已知悉並同意用完再刪。**該金鑰應視為已外洩，需輪替。** 之後改用 rclone 設定檔（`chmod 600`），憑證不進指令列。

### 4.2 已否證的假設

2026-08-10 單日，860 檔，12,803 個被封鎖帳號，對照組 2,326 個來源作者：

| 假設 | 結果 |
|---|---|
| 「動物.數字」是網軍特徵 | **相反**。被封鎖組 2.7%，對照組 5.2% |
| 中國拼音特徵（zh/x/q 等台灣拼法不用的組合） | 1.20x，p=0.04，約八成命中與對照組無異，**不可用** |
| 帳號名是中文姓名完整拼音接短數字 | 1.15x，p=0.31，命中樣本大量是真人的拼音加生日 |
| 從資料自己長出的十四種構詞模板 | **全部未通過顯著性檢定** |

**平台資料沒有答案卷**：`isLikelyBot` 全部 72,040 筆都是空的，機器人判定從未執行。`suspicionScore` 只有 17 種值、84% 集中在同一個數字，是條粗規則，不能當標籤。

### 4.3 有訊號的（來自使用者實機名冊 1,513 筆）

| 訊號 | 正常名單佔比 | 判斷 |
|---|---:|---|
| 連續十個同結構的拼音姓名 | **1,513 人裡零次**，最長連續 1，任意連續十個裡最多 2 | 極強。**訊號在密度不在個體** |
| 顯示名結尾重複姓氏（王大明 王） | 0.13% | 極強，是對方工具的產生缺陷 |
| 中東文字命名 | 0.07% | 極強 |
| 顯示名為 2 至 3 字純中文 | 29.81% | **無鑑別力，已明確禁用** |

**但這份名冊的母體有偏誤**：候選人是追蹤者名單經頭像預過濾後留下的無頭像者（`:2389` 起）。這份統計描述的是「無頭像追蹤者」的分布，不是一般使用者。**據此建的門檻在三無誤判釐清前全部視為未定。**

### 4.4 拿不到的訊號

**追蹤中數量**：使用者長期觀察三無網軍追蹤數集中在 50 上下正負 5，且追蹤名單固定含同一組公眾人物（小英、沈伯洋、李多慧、目標本人），會依攻擊對象分批。**這是目前已知最強訊號。**

beta19 已驗證：Threads 個人頁只顯示粉絲數，追蹤中要從粉絲數入口再切到另一個列表。程式保留遇到已呈現文字時的擷取能力（fixture 證明抓得到），**但不主動開任何頁面**。要取得需額外開一頁，成本未評估，且計畫第 27 項兩千人卡死未解。

**+86 手機號**：使用者觀察只要註冊手機是 +86 幾乎可認定網軍。**但只在帳號救援流程看得到，取得等於對第三方帳號探測，商店會下架且法律站不住。已決定不做。**

### 4.5 一個已驗證有效的既有規則

使用者提供的實例 `dolph_in986363` 命中現有 `usernameMatchesSuspiciousThreeNoCandidate`（去掉底線後 `dolphin` + 六位數字）。**那條規則沒壞。** 先前統計顯示它在被封鎖名單佔比低，是因為多數被封鎖者是真人不是自動生成帳號。

已量出的改進方向（尚未實作）：

- 自動命名幾乎都是**七位數字**。動物開頭者七位數佔一半，非動物開頭者只有 3%。現行 `\d{4,}` 門檻放進了 36 個很可能是真人自取的四位數名字，**收緊到六至八位可減少約 16% 誤判**。
- 字典缺 11 個動物字：gecko、yak、raccoon、cricket、crow、lizard、pony、puma、robin、squid、starfish。只多抓 16 個帳號，幅度小。

---

## 5. 其他未處理項目

| 項目 | 狀態 |
|---|---|
| **檢舉大量失敗** | 一份 beta17 ring 顯示 16 次檢舉 15 次失敗。Fable 查出 `findClickableByText`（`report-flow.js:205-217`）是 **fail-open**：掃整份 document、含貼文內文、用 `includes` 比對、不排除看不見的元素。**「選單成功」不能證明選單有開。** `menu_not_found` 至少摺疊五種失敗。未落盤成計畫項目 |
| **勾選框震盪** | beta7 修掉又退版，現在仍在，每個 scanner pass 四次 storage 寫入 |
| 計畫第 18、25、27、30 項 | 未動工 |
| 計畫第 16、17、23 項 | 取證已落地，等實機資料 |
| 2.8.4 上架 | 尚未上傳 CWS／AMO／GitHub，等使用者批准 |

---

## 6. 交接對象的第一個動作

**請使用者匯出三無報告，導出 53 筆 findings，逐筆統計觸發旗標與 reason 字樣。**

在那份統計出來之前：

- 不要改判定邏輯
- 不要用那份名單做統計
- 不要根據推論提出修法

這一輪主對話已經因為證據不足猜錯三次：動物數字方向錯、拼音方向錯、三無誤判歸因錯。**先量再改。**
