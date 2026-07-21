# SDD：關聯帳號探索 V1（多種子重複追蹤者）

版本：0.1  
日期：2026-07-18  
狀態：Reviewed Draft（待產品決策確認）  
適用範圍：Chrome Extension beta

Review：2026-07-18，獨立 Sol high 唯讀複核；已回寫 follower-tab provenance、獨立 cursor、互動證據降級、coverage 語意、storage recovery、profile cursor 與 worker lease 等修正。

## 1. 結論

V1 將既有「掃描指定帳號粉絲」能力擴充為一個本機、人工啟動的關聯探索工具：使用者選定 2–5 個已知可疑帳號作為種子，留友封分別收集各種子的可見粉絲名單，找出同時追蹤多個種子的重複帳號，再疊加既有三無特徵與本機可回溯的 block／report provenance，產生待審清單。

V1 不判定誰是「網軍」，不自動封鎖，不從候選帳號無限往外擴張。產品只陳述可重現的關聯，例如：「共同出現在 3 個種子的粉絲名單；已觀察 4／指定 5；無頭像」。

## 2. 背景與問題

使用者觀察到數個明顯可疑帳號可能具有重複追蹤者；部分重複帳號同時會替可疑帳號按讚或留言，且常帶有三無、批次命名或相近活動模式。這表示可疑行為可能不是獨立帳號，而是具有發文、留言、按讚、追蹤養號或待命等分工的協同行為群。

留友封目前能處理單一列表：

- 收集一篇貼文的按讚名單並加入封鎖／檢舉清單。
- 收集粉絲或追蹤中 dialog 的帳號名單。
- 在 Chrome Extension 中掃描自己或指定帳號的粉絲，檢查三無 profile 特徵。
- 將三無結果留在本機，經使用者勾選後排入正常封鎖佇列。

缺少的是跨多個種子的集合比較，因此使用者目前無法直接看見「哪些帳號重複出現在多個可疑種子的粉絲名單」。

## 3. 目標與非目標

### 3.1 V1 目標

1. 讓使用者手動建立包含 2–5 個種子的探索工作。
2. 逐一收集各種子的可見粉絲 username，保存掃描完整度與失敗原因。
3. 找出至少共同追蹤 2 個種子的帳號。
4. 對交集候選重用既有三無 profile 檢查，而不是掃描每一位普通粉絲。
5. 若本機已有可回溯的 block／report source provenance，將其作為補充資訊；沒有資料時明確顯示「未觀察」，不得視為沒有互動。
6. 以可解釋證據分級顯示，讓使用者自行加入安全名單、忽略或封鎖清單。
7. 所有 username、種子與關聯明細只存本機；V1 不上傳帳號關聯圖。

### 3.2 V1 非目標

- 不宣稱辨識或證明網軍、機器人、幕後組織、政治立場或國籍。
- 不因單一三無、外語姓名、拼音方式或追蹤數接近 50 就列為強關聯。
- 不自動封鎖、自動檢舉或掃描完成後自動啟動 worker。
- 不把新候選自動升格為種子，也不做二層以上遞迴圖探索。
- 不主動遍歷種子的所有貼文、留言串或按讚名單。
- 不在 V1 支援 Userscript、Safari 或 Firefox。
- 不在 V1 建立平台端帳號圖譜或公開可搜尋的帳號資料庫。

## 4. 核心術語

- **種子（seed）**：使用者主動指定、用來展開關聯探索的帳號。種子是調查起點，不代表系統已證明其身分。
- **觀察邊（observed edge）**：本次掃描實際在種子粉絲列表看見 `candidate → follows → seed`。
- **交集候選（overlap candidate）**：在同一探索工作中，至少出現在 2 個成功取得的種子粉絲集合內的帳號。
- **佐證訊號（corroborating signal）**：已成功檢查的三無 profile 特徵或可疑命名提示。既有 block／report provenance 只作補充顯示，不參與 V1 分級。
- **掃描完整度（coverage）**：已觀察的名單數量、Threads 顯示總數（若可讀）、是否抵達列表底部，以及停止／失敗原因。

「粉絲」在本 SDD 中指追蹤該種子的帳號；不是種子主動追蹤的帳號。

## 5. User Review Required

> [!IMPORTANT]
> 實作前需確認以下產品決策；本 SDD 暫以建議值定義 V1。

### ADR-0001：只做一層探索

候選帳號不會自動成為下一層種子。使用者若人工確認某候選值得繼續調查，必須另開新工作並主動加入種子。

理由：多層圖擴張會快速把一般同溫層使用者、記者、研究者與觀察者捲入，降低結果品質並大幅增加平台操作量。

### ADR-0002：交集是候選門檻，不是身分判定

V1 的最低候選條件為 `sharedSeedCount >= 2`。結果只顯示關聯強弱和證據，不顯示「網軍機率」或「AI 判定網軍」。

### ADR-0003：先交集，後查 profile

收集種子粉絲時保存所有本次可見 username，不沿用三無掃描的頭像候選預篩。只有完成集合交集後，才對交集候選執行三無 profile 檢查。

理由：若先用無頭像篩選，會漏掉有頭像的按讚組、留言組或養號帳，並使集合交集失真。

### ADR-0004：V1 不主動掃互動圖

補充資訊只讀取留友封本機已存在且具有正確 provenance 的 block／report 資料。V1 不自動打開種子的所有貼文去收集按讚者或留言者，也不從既有混合索引推導完整互動圖。

理由：主動遍歷貼文會把 V1 從有限集合比較擴張成高操作量 crawler，增加 Threads 限流、DOM 失效與錯誤歸因風險。

### ADR-0005：人工確認後才進封鎖佇列

探索完成只產生待審報告。使用者必須逐筆或批次勾選「加入封鎖清單」，再回主面板按「開始封鎖」；不得直接啟動背景 worker。

### ADR-0006：關聯邊必須證明來源是該種子的粉絲頁

collector 必須同時驗證目前 profile username、粉絲 tab／dialog label 與 relation type，才可建立 `candidate → follows → seed`。只找到一個含 profile link 的可見 dialog 不足以建立關聯邊；無法驗證時以 `followers_tab_unverified` 結束該種子，不保存本輪未驗證帳號。

### ADR-0007：關聯探索不得共用三無 cursor、結果或完成上傳流程

V1 可以抽取三無掃描中可重用的低階 DOM helper，但必須建立獨立的 raw collector、job/seed cursor、runtime state 與結果 keys。不得讀寫 `THREE_NO_SCAN_CURSOR`／`THREE_NO_SCAN_RESULTS`，也不得呼叫三無掃描的 `finishScan` 或統計上傳流程。

## 6. 使用者流程

```text
開啟「關聯帳號探索」
→ 輸入或從目前帳號加入 2–5 個種子
→ 顯示預估範圍與本機資料說明
→ 使用者按「開始掃描」
→ worker 逐一開啟種子 profile 與粉絲 dialog
→ 保存每個種子的可見粉絲集合與 coverage
→ 計算 sharedSeedCount >= 2 的交集候選
→ 逐一檢查交集候選的三無 profile 特徵
→ 合併本機既有 block／report provenance
→ 顯示分級報告與每筆理由
→ 使用者選擇安全名單／忽略／加入封鎖清單
```

掃描中必須能停止。停止後若至少有 2 個種子完成名單收集，可以產生「部分結果」；不得把部分結果標成完整掃描。

## 7. 演算法

### 7.1 輸入正規化

種子輸入接受 `@username`、username 或 Threads profile URL，透過新增的 URL-aware canonicalizer 統一正規化為不含 `@`、query 與 path suffix 的小寫 username。不得直接重用目前只處理簡單 username 的 `ThreeNoWatch.normalizeUsername()`。需去重並排除：

- 空值或無法解析的輸入。
- 使用者自己的帳號（可提示後允許保留，但預設排除）。
- 已在同一工作中的重複種子。

V1 最少 2 個、最多 5 個種子。

### 7.2 種子粉絲集合

對每個種子建立集合：

```js
followersBySeed[seedUsername] = Set<normalizedUsername>
```

收集時可抽取 `ThreeNoWatch` 已有的指定帳號 profile 導航、粉絲 dialog 開啟、虛擬列表捲動與防呆 helper，但必須新增獨立的「raw relationship collector」：

- 保存所有可見且可解析的粉絲 username。
- 不因有頭像或 username 正常而排除。
- 不在此階段逐一打開粉絲 profile。
- 建立邊前驗證目前 profile 與 seed 相符，且 active dialog/tab 明確代表 followers；保存 `relationType`、seed profile URL、tab label 與驗證版本。
- 每個 `jobId + seed` 使用獨立 `seenUsernames`、cursor revision 與 resume state，不覆寫任何三無掃描 cursor。
- 每個種子預設最多保存 1,000 個 username；達上限時標記 `limit_reached`，不是 `complete`。
- 使用者可停止；保留已完成種子與目前種子的 cursor 供續掃。

### 7.3 反向索引與交集

```js
seedsByCandidate[candidateUsername] = Set<seedUsername>
```

對所有成功觀察到的邊建立反向索引，再產生：

```js
sharedSeedCount = seedsByCandidate[username].size
configuredSeedCount = job.seeds.length
completedSeedCount = count(seed.status === "complete")
partialSeedCount = count(seed.status === "partial")
unavailableSeedCount = count(seed.status in ["private", "unavailable", "failed"])
observedEligibleSeedCount = count(seed has a verified usable follower set)
observedEligibleSeedRatio = sharedSeedCount / observedEligibleSeedCount
```

只有 `sharedSeedCount >= 2` 進入交集候選。種子自己若出現在另一種子的粉絲集合，保留為圖譜事實，但預設不列入待封鎖候選。

不得把 `observedEligibleSeedRatio` 當成機率或完整度；UI 必須同時顯示指定、完成、部分與不可用種子數，例如「共同出現在 2 個種子；已觀察 2／指定 5，另 3 個未完成」。部分集合可以參與交集，但候選必須繼承 `partial evidence` 警告。

### 7.4 佐證資料

交集候選才進入 profile 檢查，重用現有三無資料模型與 cache：

- 是否無預設以外的大頭照。
- 自介、發文、回文、轉貼是否缺少。
- 帳號是否 private。
- 加入時間、地區、粉絲數等是否成功讀取。
- 現有可疑 username／批次命名提示。

再合併本機已有、且能回溯來源的 block／report provenance 作為補充資訊：

- 該帳號曾因哪些可回溯的來源 URL 與 reason 進入既有 block／report 流程。
- provenance 的最後觀察時間（僅限現有資料真的保存此時間時）。

現有 `sourceEvidence` 是以來源為主的混合索引，不是完整的「帳號 × 互動種類 × 來源 × 時間」事件表。V1 不得從它推導「替幾個種子按讚／留言」或用 source count／reason 升級關聯分級。資料不存在或 provenance 不足時標記 `unknown`，不得寫成 `false`。若未來要把按讚／留言納入演算法，必須另立有版本的本機 observation schema，逐筆保存 candidate、interaction type、source／seed、observedAt 與 acquisition status。

### 7.5 分級規則

V1 使用透明規則，不產生不透明總分：

#### 強關聯

符合任一條：

1. `sharedSeedCount >= 3`，且至少有一項已成功檢查的 profile／命名佐證訊號。

#### 中關聯

- `sharedSeedCount >= 2`，且至少有一項已成功檢查的三無或命名佐證。

#### 僅交集

- `sharedSeedCount >= 2`，但沒有其他已觀察佐證。

「沒有其他已觀察佐證」只代表本機資料不足，不代表帳號正常或沒有互動。

外語文字、國籍推測、政治人物追蹤、單一拼音差異或單純追蹤數落在 45–55，不得單獨提升分級。

## 8. 資料模型

### 8.1 探索工作

Storage keys 建議：

- `hege_relationship_explorer_job_index_v1`：只保存 job 摘要與 active job pointer。
- `hege_relationship_explorer_job_v1:<jobId>`：逐工作保存完整 state，避免單一大陣列每次全量覆寫。
- `hege_relationship_explorer_runtime_backup_v1:<jobId>`：寫入新 revision 前的最後完整版本。

```js
{
  schemaVersion: 1,
  jobId: "re_...",
  createdAt: 0,
  updatedAt: 0,
  status: "draft|collecting|analyzing|partial|completed|stopped|failed",
  seeds: ["seed_a", "seed_b"],
  activeSeed: "seed_b",
  limits: {
    maxSeeds: 5,
    maxFollowersPerSeed: 1000
  },
  seedResults: {
    seed_a: {
      status: "complete|partial|private|unavailable|failed",
      relationType: "follower_of_seed",
      seedProfileUrl: "https://www.threads.com/@seed_a",
      verifiedTabLabel: "粉絲",
      relationProofVersion: 1,
      usernames: ["user_1", "user_2"],
      cursorRevision: 1,
      seenUsernames: ["user_1", "user_2"],
      resume: {
        status: "open|exhausted",
        lastVisibleUsername: "user_2"
      },
      observedCount: 2,
      reportedTotal: 50,
      reachedActualEnd: true,
      hasMore: false,
      endReason: "actual_end",
      scannedAt: 0,
      error: ""
    }
  },
  configuredSeedCount: 2,
  completedSeedCount: 1,
  partialSeedCount: 1,
  unavailableSeedCount: 0,
  candidateCount: 0,
  profileCursor: {
    revision: 1,
    nextIndex: 0
  },
  profileCheckedCount: 0
}
```

`reportedTotal` 只保存 Threads 當時畫面可讀值；不可用它覆蓋實際 `observedCount`。

### 8.2 候選結果

Storage key 建議：`hege_relationship_explorer_results_v1`

```js
{
  jobId: "re_...",
  generatedAt: 0,
  completeness: "complete|partial",
  candidates: [
    {
      username: "candidate_x",
      sharedSeeds: ["seed_a", "seed_b", "seed_c"],
      sharedSeedCount: 3,
      configuredSeedCount: 5,
      observedEligibleSeedCount: 4,
      observedEligibleSeedRatio: 0.75,
      relationshipLevel: "strong|medium|overlap_only",
      profileStatus: "pending|checked|unknown|failed",
      profileStatusReason: "",
      profileCheckedAt: 0,
      profileSignalsVersion: 0,
      profileSignals: [],
      profileSignalsKnown: false,
      provenanceEvidence: {
        status: "provenance_only|unknown",
        provenanceSources: []
      },
      evidenceText: [],
      reviewedState: "pending|safe|ignored|queued_for_block",
      reviewedAt: 0
    }
  ]
}
```

### 8.3 保存與隱私

- V1 明細只存同 origin `localStorage`，不加入平台 ingest payload。
- 不保存頭像圖片或 bio 全文；只保存判定所需結構化訊號。
- UI 提供刪除單一工作與清除全部關聯探索資料。
- 最多保存 3 個工作，工作建立滿 30 天後在下次進入功能時自動 prune；已加入安全名單或既有封鎖 DB 的狀態依各自現行保存規則處理。
- 寫入前先 prune 過期工作並估算 serialized size；每次 revision 先保留上一個完整版本，再寫新版本，成功後才更新 index pointer。`QuotaExceededError` 時保留舊 revision、解除 runtime lease，工作標記或 UI 顯示 `storage_full`，不得留下 completed 假狀態。
- 刪除單一／全部工作時，同步清除 job、runtime backup、cursor、結果與 index references；不得動到三無結果或封鎖 DB。
- 跨分頁同步只同步工作狀態摘要；實作前應在已有三無與 source evidence 資料的接近實際 profile 上驗證 3 個工作、每工作 5 × 1,000 username 的累積容量，不以空白 profile 為基線。

## 9. UI 規格

### 9.1 入口

Chrome floating menu 新增「關聯帳號探索」。在他人 profile 頁可提供「加入為探索種子」，但不立即開始掃描。

### 9.2 開始前

顯示：

- 種子清單，可刪除、調整順序。
- 「只分析本次掃描實際看見的公開列表」說明。
- 預設每種子最多 1,000 人與最多 5 個種子的安全上限。
- 「結果代表關聯，不代表帳號身分」提醒。

### 9.3 結果

預設依 `sharedSeedCount` 與已成功檢查的三無／命名訊號排序。每列至少顯示：

- username。
- `共同出現在 3 個種子的粉絲名單；已觀察 4／指定 5`。
- 可展開查看種子名稱。
- 三無／命名訊號，以及本機 block／report provenance 補充資訊。
- 完成／部分／不可用種子數與資料未知警告。
- 安全名單、忽略、加入封鎖清單操作。

批次勾選不得預設全選；「僅交集」候選預設摺疊或放在較低區段。

### 9.4 用語邊界

允許：

- 關聯帳號、交集候選、共同追蹤、已觀察來源、強／中關聯。

禁止：

- 已確認網軍、敵對帳號、特定國家帳號、DPP／KMT 網軍、百分比網軍機率。

## 10. Runtime 與架構邊界

- V1 沿用 Chrome-only、由使用者點擊觸發 `window.open` 的 worker 模型，但使用獨立 relationship runtime，不共用三無完成／上傳流程。
- 不新增 MV3 background service worker、`tabs` 或 `scripting` permission。
- 同一時間只允許一個三無／關聯探索工作或封鎖／檢舉 worker 執行。新增共用互斥 lease，至少保存 `ownerType`、`ownerId`、`acquiredAt`、`heartbeatAt` 與 revision；只有 heartbeat 過期且確認沒有 active queue／worker 時才可 stale takeover。所有完成、停止、錯誤與 storage failure 路徑都必須釋放 lease。
- relationship flow 不得呼叫 `tryUploadThreeNoScanStats`；開啟平台同步時也不得因關聯探索完成觸發任何含種子、候選或關聯數的 outbound payload。
- Desktop worker 維持同 origin，避免 `threads.com`／`threads.net` localStorage 分裂。
- 若未來擴充到 iOS，不得用 `window.location.href` 觸發 Threads Universal Links；必須另行設計並遵守 `docs/BLOCKING_ARCHITECTURE.md`。
- profile、粉絲 dialog 或虛擬列表解析失敗不得影響既有封鎖主流程。

## 11. 失敗與部分完成語意

每個種子必須有獨立狀態與 reason：

- `complete / actual_end`
- `partial / user_stopped`
- `partial / limit_reached`
- `partial / virtual_list_stalled`
- `private / followers_unavailable`
- `unavailable / profile_unavailable`
- `failed / trigger_not_found`
- `failed / dialog_not_opened`
- `failed / followers_tab_unverified`
- `failed / unexpected_dom`
- `failed / storage_full`

整體工作只有在所有可用種子都抵達 `actual_end`，且所有候選 profile 都進入 `checked|unknown|failed` 終態並保存 reason 時，才可標為 `completed`。任何種子部分收集或失敗，都應標為 `partial`，並允許針對未完成種子續掃。

若少於 2 個種子取得可用集合，不產生交集報告，工作標記 `failed` 或 `stopped` 並說明原因。

## 12. 安全上限與效能

V1 建議預設：

- 種子：2–5 個。
- 每種子可見粉絲：最多 1,000。
- 交集候選 profile：每批最多 200，使用獨立 job-scoped profile cursor；每位候選保存 `pending|checked|unknown|failed`、reason、checkedAt 與 signals version。
- 所有網頁操作序列執行，不並行開啟多個 Threads tab。
- 遇到 Threads 限流、登入挑戰或異常頁面立即停止，保留 cursor，不自動重試轟炸。

工作可有超過 200 個交集候選；200 是單批上限，不是整體截斷。停止或限流後必須由 profile cursor 接續，不能把未檢查候選默認為 unknown，也不能錯誤標記 completed。

在實作驗收中須量測：

- 5 × 1,000 username 的 localStorage 大小。
- 交集計算時間。
- 200 個候選 profile 的實際耗時與停止／續掃表現。

## 13. 已知限制

1. Threads 沒有供本功能使用的穩定公開關聯 API；目前依賴登入後畫面、dialog 與虛擬列表，DOM 改版或 A/B test 可能失效。
2. 私人、停權、刪除或限制存取的帳號可能無法取得粉絲列表。
3. `limit_reached`、虛擬列表卡住或平台只回傳部分名單時，交集會低估；不得推論未出現即不存在。
4. 重複追蹤可能來自共同興趣、政治同溫層、記者、研究者或觀察行為，不足以證明協同操作。
5. 本機 block／report provenance 取決於使用者過去曾處理哪些名單；它不是完整互動紀錄，不同使用者得到的補充資料量可能不同。
6. username 可以更改，V1 若無穩定 platform user ID，只能以掃描當時 username 比對，可能產生斷裂或錯配。
7. 大量 profile 操作可能觸發平台 rate limit；需要沿用冷卻與可恢復狀態，不保證單次完成。
8. V1 不分析留言文字相似度、行為時間同步性、建立時間群聚或真正的社群圖演算法。

## 14. 驗收條件

### 14.1 單元／純函式

- [ ] 種子輸入正規化、去重與 2–5 數量限制。
- [ ] 完整 Threads URL、`@username`、大小寫、query 與 path suffix 由 URL-aware canonicalizer 得到同一 username。
- [ ] 以 fixture 驗證 `followersBySeed → seedsByCandidate` 反向索引。
- [ ] `sharedSeedCount < 2` 不產生候選。
- [ ] 強／中／僅交集規則逐條有 boundary tests。
- [ ] `unknown` 不被當成 `false` 或零證據。
- [ ] 種子自身預設不進待封鎖候選。
- [ ] 停止、續掃與重算結果具 idempotency，不重複邊或候選。
- [ ] `2 complete + 3 unavailable` 顯示為已觀察 2／指定 5，不得顯示成無警告的 2/2。
- [ ] partial seed 集合參與交集時，候選繼承 partial evidence 警告。

### 14.2 整合

- [ ] 兩個小型測試種子可完成粉絲集合收集並產生正確交集。
- [ ] raw collection mode 不因有頭像或 username 正常而漏掉關聯邊。
- [ ] following tab、搜尋 dialog、其他含 profile link 的 dialog 與未驗證 A/B tab UI 不得產生 follower edge。
- [ ] 每一關聯邊都能回溯 seed、profile URL、`follower_of_seed`、已驗證 tab label 與 proof version。
- [ ] 部分種子失敗時仍可產生清楚標示的部分結果。
- [ ] 交集候選才進 profile 檢查，普通單一粉絲不被逐一開啟。
- [ ] 掃描期間按停止可保存 cursor，重新開始不重掃已完成種子。
- [ ] 5-seed 中斷／續掃使用各自 job/seed cursor，既有三無 cursor/results 前後完全不變。
- [ ] 超過 200 個候選時可分批續查；限流、停止與重啟後不重查已完成候選，未開始者仍為 pending。
- [ ] 加入封鎖清單只寫入正常 pending／queue 資料，不自動啟動 worker。
- [ ] 安全名單帳號不會被批次加入封鎖清單。
- [ ] 關聯明細不進 Reporter／platform ingest payload。
- [ ] 開啟平台同步並攔截 outbound request 時，關聯探索完成不觸發三無統計上傳，payload 不含 relationship keys／種子／候選。
- [ ] 三無掃描、封鎖與檢舉 worker 忙碌時，關聯探索不能同時啟動。
- [ ] 共用 lease 的 heartbeat、正常 release、錯誤 release 與安全 stale takeover 有測試。
- [ ] 累積 3 個最大工作、接近 quota、`QuotaExceededError`、半寫入後重開都保留上一個完整 revision 並顯示可恢復錯誤。
- [ ] 刪除單一／全部工作後沒有 relationship job、backup、cursor 或 index reference 殘留，也不影響三無與封鎖資料。

### 14.3 Real-browser beta QA

- [ ] 在使用者明確指定的 Chrome beta 測試環境確認版本、URL 與 extension 狀態後執行。
- [ ] 使用已知小型測試集合驗證 UI 顯示與人工計算交集一致。
- [ ] 驗證完整、部分、private、limit reached、使用者停止五種狀態。
- [ ] 在已有一般使用資料的 profile 驗證 3 個工作 × 5 種子 × 1,000 username 不超出可接受本機儲存與 UI 回應時間。
- [ ] 驗證 Threads 限流／challenge 出現時 fail closed 並可恢復。

## 15. 建議實作切分

### Phase A：集合探索 MVP

- 工作建立與種子管理。
- raw follower collection mode。
- follower-tab／seed provenance proof。
- 獨立 job/seed cursor 與共用互斥 lease。
- 本機集合保存、交集計算與 coverage。
- 僅顯示共同追蹤證據。

### Phase B：候選佐證

- 對交集候選重用三無 profile 檢查。
- 合併本機既有 block／report provenance（僅補充顯示，不參與關聯升級）。
- 分級、filter、安全名單與加入封鎖清單。

Phase A、B 都屬 V1，但可分兩個 beta 完成，避免集合收集與 profile 檢查同時改動造成難以定位的 regression。

## 16. Rollback

- 新 storage key 與既有三無結果、封鎖 DB 分離；停用功能時不刪除或改寫既有資料。
- 若 beta 發生問題，可先隱藏入口並停止建立新工作，保留 V1 工作資料供使用者匯出或清除。
- 不修改既有三無掃描結果 schema；共用程式需以新 mode／adapter 擴充，避免回滾時破壞現有掃描。
- 實作若進入 extension runtime，依專案規範遞增 `src/config.js` beta 版號並以 `./build.sh --no-bump` 建置；本次只建立 SDD，不跳版號。
