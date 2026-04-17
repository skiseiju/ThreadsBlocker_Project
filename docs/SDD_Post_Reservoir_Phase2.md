# [Goal Description]
把「貼文水庫」Phase 1 的雙軌假整合，收斂成真正單一引擎、單一佇列。

目前 Phase 1 已經完成 `UI.showPostReservoir` 統一入口，但底層仍是：
- `src/features/deep-sweeper.js:10` 的深層清理引擎，讀寫 `POST_QUEUE`
- `src/features/endless-queue.js:10` 的定點絕引擎，讀寫 `ENDLESS_POST_QUEUE`
- `src/storage.js:125` 的 `Storage.postReservoir` adapter，同時讀寫兩條 queue

Phase 2 目標是刪掉雙引擎 / 雙佇列，改成單一 `SweepDriver`，只操作 canonical `POST_QUEUE`，用 entry 旗標決定「掃完要不要前進下一篇」與「8 小時後要不要回來巡邏」。

## User Review Required
> [!IMPORTANT]
> 這次不是 UI 改版，是貼文水庫的執行核心換軌。請確認以下三件事後再實作。

### 問題 1 真相：Phase 1 為什麼還不算真正合併？
**原因**：UI 已經合併，但資料仍被拆成兩份。
- `Storage.postReservoir.getAll()` 會把 `POST_QUEUE` + `ENDLESS_POST_QUEUE` 合成一份畫面資料。
- `Storage.postReservoir.addEntry()` 會依旗標分別寫入兩條底層 queue。
- `deep-sweeper.js` 與 `endless-queue.js` 仍各自持有生命週期、session state、完成判斷與跳轉邏輯。

**風險**：同一篇貼文同時打開「定點絕」與「深層清理」時，表面上是一筆，實際上是兩個引擎在不同時間讀不同資料。

### 問題 2 真相：Phase 2 的唯一資料來源是什麼？
**解法**：`CONFIG.KEYS.POST_QUEUE` (`src/config.js:75`) 變成唯一 canonical queue。每筆資料固定長這樣：

```js
{
  url,
  label,
  addedAt,
  advanceOnComplete: boolean,
  longTermLoop: boolean,
  lastSweptAt,
  sweepCount,
  batchCount,
  totalBlocked,
  status: 'pending' | 'sweeping' | 'cooldown' | 'done' | 'error'
}
```

### 問題 3 真相：舊使用者資料如何保命？
**解法**：版本檢查時做一次 migration。
1. 先把現有 `POST_QUEUE` 完整備份成 `POST_QUEUE_BACKUP_PHASE2`。
2. 再把 `ENDLESS_POST_QUEUE` 合併進 `POST_QUEUE`。
3. 合併成功後才清掉舊的 endless session flags。

**絕對不要**在 migration 前直接刪 `ENDLESS_POST_QUEUE`，也不要在 iOS 上用 `window.location.href` 導航。iOS 只能維持 `history.replaceState(...) + location.reload()`，原因見 `docs/BLOCKING_ARCHITECTURE.md`。

---

## Proposed Changes

### [UI]
#### [KEEP] src/ui.js / `UI.showPostReservoir`
- 保留 Phase 1 已完成的統一 modal：`src/ui.js:926`。
- 保留每筆 entry 的兩個旗標：
  - `advanceOnComplete` = 🎯 定點絕
  - `longTermLoop` = 💧 深層清理
- `src/ui.js:976` 之後的列表資料改成只讀 `Storage.postReservoir.getAll()` 回傳的 canonical `POST_QUEUE`。
- `src/ui.js:1126` 新增貼文時，不再分流寫兩條 queue，只新增 / 更新同一筆 canonical entry。
- `src/ui.js:1139` 的「清除已完成」改成清除 `status === 'done' && advanceOnComplete === true && longTermLoop !== true` 的單純定點絕完成項目。

#### [MODIFY] src/main.js
- `src/main.js:258` 與 `src/main.js:269` 的 `onStart` 不再呼叫 `Core.startEndlessQueue()`。
- 改呼叫新的 `Core.SweepDriver.startNow()` 或同等入口，從 canonical `POST_QUEUE` 找第一筆 `advanceOnComplete === true && status !== 'done'` 的 entry 執行。
- UI 不需要重做，只要把 start callback 從舊 endless engine 換到新 driver。

### [STORAGE]
#### [MODIFY] src/storage.js
- 移除 `src/storage.js:125` 起的 Phase 1 雙軌 adapter 行為。
- `Storage.postReservoir` 改成薄封裝：
  - `_norm(url)`：仍用 `split('?')[0]` 正規化，沿用目前比對規則。
  - `getAll()`：只讀 `CONFIG.KEYS.POST_QUEUE`。
  - `getByUrl(url)`：只查 `POST_QUEUE`。
  - `addEntry(url, opts)`：upsert canonical entry，保留既有 stats，不重置 `batchCount` / `totalBlocked`。
  - `setFlags(url, flags)`：只更新同一筆 entry 的 `advanceOnComplete` / `longTermLoop`。
  - `removeEntry(url)`：只從 `POST_QUEUE` 移除。
  - `clearDoneAdvance()`：只清單純定點絕完成項目，不能刪掉 `longTermLoop === true` 的常駐項目。

#### [MODIFY] src/config.js
- 保留：
  - `POST_QUEUE` (`src/config.js:75`)
  - `ENDLESS_POST_QUEUE` (`src/config.js:81`)：Phase 2 migration 讀取用，之後標為 deprecated。
  - `ENDLESS_HISTORY` (`src/config.js:84`)：歷史紀錄可先保留給 UI 顯示，不在本階段強制改資料格式。
  - `SWEEP_BATCH_SIZE` (`src/config.js:94`)：批次大小繼續由使用者設定控制。
- 新增：
  - `POST_QUEUE_BACKUP_PHASE2`: `hege_post_sweep_queue_backup_phase2`
- `SYNC_KEYS` 可暫時保留 `hege_endless_post_queue` 一版，以便 rollout 時跨分頁更新不漏接；確認穩定後再移除。

#### [MODIFY] src/main.js version check
- 在 `src/main.js:21` 的版本檢查區塊內，加入 `migratePostReservoirPhase2()`。
- migration 順序：
  1. 讀取現有 `POST_QUEUE` 與 `ENDLESS_POST_QUEUE`。
  2. 若 `POST_QUEUE_BACKUP_PHASE2` 不存在，先備份原始 `POST_QUEUE`。
  3. 以正規化 URL dedupe。
  4. 舊 `POST_QUEUE` entry → `longTermLoop: true`。
  5. 舊 `ENDLESS_POST_QUEUE` entry → `advanceOnComplete: true`。
  6. 同 URL 同時存在時，合併兩邊旗標與 stats。
  7. `done: true` 的 endless entry 轉成 `status: 'done'`；若同時 `longTermLoop: true`，仍保留在 queue，等待 8 小時 tick 復活。
  8. 寫回 canonical `POST_QUEUE`。
  9. 清掉舊 endless session flags：`hege_endless_state`, `hege_endless_target`, `hege_endless_last_first_user`, `hege_auto_triggered_once`, `ENDLESS_WORKER_STANDBY`。

### [CORE]
#### [DELETE] src/features/deep-sweeper.js
- 移除舊 `Core.executePostSweep()` (`src/features/deep-sweeper.js:10`)。
- 移除舊 `Core.removeCurrentPostFromQueue()` (`src/features/deep-sweeper.js:186`)。
- 移除舊 `Core.addPostTask()` (`src/features/deep-sweeper.js:213`)。
- 移除舊 `Core.checkPostQueueWakeup()` (`src/features/deep-sweeper.js:235`)。

#### [DELETE] src/features/endless-queue.js
- 移除舊 `Core.advanceToNextEndlessPost()` (`src/features/endless-queue.js:10`)。
- 移除舊 `Core.startEndlessMonitor()` (`src/features/endless-queue.js:48`)。
- 移除舊 `Core.startEndlessQueue()` (`src/features/endless-queue.js:240`)。
- 移除舊 `Core.resumeEndlessSweep()` (`src/features/endless-queue.js:260`)。

#### [NEW] src/features/post-reservoir-engine.js
- 新增單一 `SweepDriver`，掛到 `Core`，負責所有貼文水庫 runtime。
- 建議入口：
  - `Core.SweepDriver.tick()`
  - `Core.SweepDriver.startNow()`
  - `Core.SweepDriver.runCurrentPage()`
  - `Core.SweepDriver.finalizeEntry(entry, reason)`
- `src/main.js:10` / `src/main.js:12` 的 feature imports 改成只載入 `post-reservoir-engine.js` 與 `cockroach.js`。
- `build.sh:53` 與 `build.js:8` 的檔案順序移除兩個舊 engine，加入新 engine。

#### [MODIFY] src/main.js tick
- `src/main.js:315` 的 60 秒巡檢保留，但呼叫目標改成：
  - 舊：`Core.checkPostQueueWakeup()`
  - 新：`Core.SweepDriver.tick()`
- `tick()` 選 entry 規則：
  1. `status === 'pending'` 的新項目優先。
  2. `status === 'cooldown'` 且 `now - lastSweptAt >= 8h` 可復活。
  3. `status === 'done' && longTermLoop === true` 且 `now - lastSweptAt >= 8h` 可復活。
  4. `status === 'error'` 不自動重試，留給 UI 或 debug 手動處理。
- 選到 entry 後，先把該 entry 標成 `sweeping`，寫入 `lastSweptAt = Date.now()`，再導航。

#### [MODIFY] URL param migration
- 新參數使用 `?hege_sweep=true`。
- 舊參數 `?hege_post_sweep=true` 在 transition 期間仍要接受。
- `main.js` 初始化時：
  - 偵測到 `hege_sweep=true` 或 `hege_post_sweep=true` → 呼叫 `Core.SweepDriver.runCurrentPage()`。
  - cleanup URL 時移除兩種參數。
- iOS / iPadOS 導航只能使用 `history.replaceState(null, '', targetPath); location.reload();`。
- Desktop 若要另開 worker 視窗，必須只在使用者手勢內做；60 秒 tick 不應假設 `window.open()` 一定成功。

#### [MODIFY] src/core.js endless batch setup
- `src/core.js:607` 的 batch size 讀取邏輯保留概念：優先讀 `CONFIG.KEYS.SWEEP_BATCH_SIZE`，無值才 fallback。
- `src/core.js:617` 到 `src/core.js:624` 不再更新 `ENDLESS_POST_QUEUE`。
- 新 driver 在 canonical entry 上更新：
  - `batchCount += 1`
  - `totalBlocked += batchUsers.length`
  - `sweepCount += 1`（每次進入 sweep 頁或每次成功批次，實作時需固定一種定義）

#### [CORE] SweepDriver state machine
- `tick()`：排程器，只負責挑 entry 與導航。
- `runCurrentPage()`：在貼文頁執行掃描流程。
- `collectBatch()`：沿用現有「查看動態 / 按讚內容 / likes link」偵測策略，收集未封鎖、未進 `BG_QUEUE`、非自己、非貼文作者的帳號。
- `enqueueBatch()`：把 batch users 寫入 `BG_QUEUE`，寫入 `BLOCK_CONTEXT` / `CURRENT_BATCH_ID`，啟動背景 worker。
- `waitForWorkerDrain()`：監看 `BG_QUEUE` 清空。清空後 reload 同一貼文，繼續抓下一批，直到判定貼文 exhausted。
- `finalizeEntry()`：貼文 exhausted 或防呆命中時，依 flags 決定下一步。

#### [CORE] Post-sweep routing logic
- `advanceOnComplete: false`, `longTermLoop: false`
  - 單次任務。
  - exhausted 後直接從 `POST_QUEUE` 移除。
- `advanceOnComplete: true`, `longTermLoop: false`
  - 定點絕。
  - exhausted 後目前 entry → `status: 'done'`，寫入完成歷史。
  - 立刻找下一筆 `advanceOnComplete === true && status !== 'done'` 的 pending entry，導航過去。
- `advanceOnComplete: false`, `longTermLoop: true`
  - 深層清理。
  - exhausted 後目前 entry 保留，`status: 'done'`，`lastSweptAt = Date.now()`。
  - 不前進下一篇；8 小時後由 `tick()` 復活成 `pending` / `sweeping`。
- `advanceOnComplete: true`, `longTermLoop: true`
  - 定點絕 + 常駐巡邏。
  - exhausted 後目前 entry 保留，`status: 'done'`，`lastSweptAt = Date.now()`。
  - 同時找下一筆定點絕 pending entry 前進。
  - 8 小時後目前 entry 仍會因 `longTermLoop` 被 `tick()` 復活。

#### [CORE] Loop protection / session state
- 舊 session keys：
  - `hege_endless_state`
  - `hege_endless_target`
  - `hege_endless_last_first_user`
  - `hege_auto_triggered_once`
  - `hege_post_sweep_lock`
- Phase 2 可以改成新 namespaced session keys，例如：
  - `hege_sweep_state`
  - `hege_sweep_target`
  - `hege_sweep_last_first_user`
  - `hege_sweep_lock`
- migration 時要清舊 key，避免舊狀態誤觸發已刪除的 endless engine。
- 防呆判斷要合併兩套舊邏輯：
  - Deep Sweeper 的 processed set / last batch overlap：`src/features/deep-sweeper.js:69`、`src/features/deep-sweeper.js:118`
  - Endless Queue 的 first user loop protection：`src/core.js:574`

### [BUILD]
#### [MODIFY] build.sh / build.js
- `build.sh:53` file list：
  - 刪除 `features/deep-sweeper.js`
  - 刪除 `features/endless-queue.js`
  - 新增 `features/post-reservoir-engine.js`
- `build.js:8` `ORDER` 同步更新。
- 建置仍使用 `./build.sh --no-bump`。
- 依專案規範，實作程式碼時仍要在 `src/config.js` 遞增 beta 版號；本 SDD 文件建立階段不改版號。

---

## Risks
1. **URL 參數相容性**：外部或舊 session 可能還帶 `hege_post_sweep=true`。Phase 2 必須同時接受舊參數與新 `hege_sweep=true`。
2. **舊 session state 殘留**：`hege_endless_state` 等 key 若未清乾淨，可能讓 main.js 走到已刪除的 engine 分支。
3. **dedupe 規則不一致**：舊 deep 用 `url.split('?')[0]`，endless 有時比 `window.location.href`。Phase 2 必須固定用 `_norm(url)`。
4. **兩種模式合併後的完成語意**：`done` 對單純定點絕代表結束；對 `longTermLoop` 代表「本輪完成，等 8 小時復活」。
5. **in-flight worker**：使用者更新腳本時 `BG_QUEUE` 可能還有正在跑的批次。Phase 2 不應嘗試跨版本接續舊 worker 狀態；保住 `POST_QUEUE`，清掉舊 session，讓下一次 tick 重跑。
6. **iOS Universal Links**：任何自動導航都不能用 `window.location.href` 指向 Threads URL；必須遵守 `docs/BLOCKING_ARCHITECTURE.md` 的 safe navigation。

## Rollback Plan
1. migration 前寫入 `POST_QUEUE_BACKUP_PHASE2`。
2. 若 Phase 2 出現資料合併錯誤，可用 debug / console 工具把 `POST_QUEUE_BACKUP_PHASE2` 還原回 `POST_QUEUE`。
3. 若需要退回 Phase 1 程式碼，`ENDLESS_POST_QUEUE` 不應在 migration 當下立即刪除；至少保留一個 beta 版本，確認 canonical queue 穩定後再清。
4. 若使用者正在封鎖中，rollback 只處理貼文水庫 queue，不還原 `BG_QUEUE`，避免重複封鎖同一批帳號。

## Verification Plan
1. **Migration：只有深層清理**
   - 預先塞一筆舊 `POST_QUEUE`。
   - 升級後確認 canonical entry 為 `longTermLoop: true`, `advanceOnComplete: false`, `status: 'pending'`。
   - 確認 `POST_QUEUE_BACKUP_PHASE2` 存在。

2. **Migration：只有定點絕**
   - 預先塞一筆舊 `ENDLESS_POST_QUEUE`，`done: false`。
   - 升級後確認 canonical entry 為 `advanceOnComplete: true`, `longTermLoop: false`, `status: 'pending'`。
   - UI 貼文水庫只顯示一筆。

3. **Migration：同 URL 雙模式**
   - 同 URL 同時存在 `POST_QUEUE` 與 `ENDLESS_POST_QUEUE`。
   - 升級後確認只剩一筆 canonical entry，兩個 flags 都是 `true`，`batchCount` / `totalBlocked` 沒被清空。

4. **URL 相容**
   - 開啟貼文 `?hege_post_sweep=true`，應進入新 `SweepDriver.runCurrentPage()`。
   - 開啟貼文 `?hege_sweep=true`，也應進入同一流程。
   - 完成 cleanup 後 URL 不應殘留兩種參數。

5. **批次大小**
   - 設定 `CONFIG.KEYS.SWEEP_BATCH_SIZE = 50`。
   - 執行 sweep，確認每批最多送 50 人到 `BG_QUEUE`。
   - 改成 150，再執行一次，確認新批次即時讀新設定。

6. **四種旗標路由**
   - 雙 OFF：exhausted 後 entry 被移除。
   - advance ON / loop OFF：exhausted 後目前 entry 變 `done`，並自動前進下一篇 pending。
   - advance OFF / loop ON：exhausted 後 entry 保留 `done`，8 小時後 tick 可重新啟動。
   - 雙 ON：exhausted 後目前 entry 保留給 8 小時巡邏，同時前進下一篇定點絕。

7. **Worker drain**
   - sweep 產生 batch users 後，確認 `BG_QUEUE` 被填入、背景 worker 啟動。
   - `BG_QUEUE` 清空後，driver reload 同一篇繼續下一批。
   - 無新帳號時才進入 `finalizeEntry()`。

8. **iOS 導航**
   - 在 iOS / iPadOS Userscripts 測試 tick 導航。
   - 確認沒有打開 Threads 原生 App。
   - 確認使用的是 `history.replaceState + location.reload` 路徑。

9. **Build**
   - 實作完成後執行 `./build.sh --no-bump`。
   - 確認 build output 不再包含 `deep-sweeper.js` / `endless-queue.js`，並包含 `post-reservoir-engine.js`。

## Implementation Drift（beta28-42 實作偏離記錄）

Phase 2 主體交付後（beta27），實機測試暴露多處偏離：

### Polling 時序大改

原 SDD 假設 4-5 秒 polling 夠用。實機 Threads SPA 載入慢，需放寬到 v2.5.2 的 30s/30s/20s/20s 等級。詳見 ADR 0004。

### Activity-first 策略

原 SDD 沒指定策略順序，beta22 試過「likes link first」失敗（Threads 把讚數做成 icon-only）。改回 v2.5.2 的「Activity first」，詳見 ADR 0004。

### Dialog 多容器掃描

原 SDD 假設 Core.getTopContext 一定抓到對的 dialog。實機 Threads 把 Activity 內容塞在另一個 [role='dialog']。改成掃所有 [role='dialog'] 找 Likes tab。

### 大蟑螂自動標 → 手動 trigger

beta40 試過定點絕按鈕自動標頭目，beta41 改回 v2.5.2 的 shift+select 30+ confirm。詳見 ADR 0002。

### 統一 Meta 上限

原 SDD 沒涵蓋「延時水庫 + 批次大小」的整合。beta31 合併成 DAILY_BLOCK_LIMIT。詳見 ADR 0001。

### Dialog 兩按鈕合一

原 SDD 沒涵蓋 dialog UI 整合。beta41-42 殺螂囉合進定點絕。詳見 ADR 0003。
