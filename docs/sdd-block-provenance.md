# SDD：封鎖來源 Provenance 修正（以 v2.5.4-beta74 為基準）

版本：0.1  
日期：2026-04-20  
基線版本：`v2.5.4-beta74`

## 1. 目標

修正 `beta74` 目前封鎖資料寫入時的 provenance race condition：

- 背景 worker 正在處理 `BG_QUEUE`
- 使用者又從其他入口追加新的封鎖名單
- 全域 `BLOCK_CONTEXT` / `CURRENT_BATCH_ID` 被新的一批覆蓋
- 後續成功封鎖的帳號，可能被記到錯的：
  - 來源貼文 URL
  - 貼文作者
  - 貼文摘要
  - batch ID

這份 SDD 只處理 **封鎖 provenance 正確性**，不包含：

- bot detection
- 平台上傳 payload 擴充
- block event log
- admin / public platform UI

## 2. User Review Required

> [!IMPORTANT]
> 以下 4 個設計決策若確認，就依此實作。

### ADR-0001：以 `beta74` 行為為基線，不重寫封鎖主流程

本次修正不改：

- `runSameTabWorker()` 的 iOS same-tab 導航方式
- Desktop popup worker 的啟動與返回方式
- `worker.js` 的成功/失敗/驗證狀態機

只修資料來源，不重構流程控制。

### ADR-0002：全域 block context 改為 per-user map

`BLOCK_CONTEXT` / `CURRENT_BATCH_ID` 不再作為實際資料來源。  
改為 `BLOCK_CONTEXT_MAP[username]`，每個帳號各自保存：

- `src`
- `reason`
- `postText`
- `postOwner`
- `batch`
- `updatedAt`

### ADR-0003：worker 成功 call site 保持不動

目前 `worker.js` 的成功分支仍然呼叫 `Storage.addToBlockDBFromContext(targetUser)`。  
本次只改這個 helper 的讀取來源，不改 worker 成功分支結構。

### ADR-0004：context 清理採「逐筆清理」，不是全量清空

某個帳號成功寫入 DB 後，只刪掉該帳號的 block context。  
清除選取 / 清空排隊時，才清對應或全部的 block context map。

## 3. beta74 現況架構

### 3.1 現有 storage key

在 `beta74`，封鎖 provenance 依賴兩個全域 key：

- `BLOCK_CONTEXT = 'hege_block_context'`
- `CURRENT_BATCH_ID = 'hege_current_batch_id'`

### 3.2 目前寫入點

`beta74` 會在多個入口把來源資訊寫到同一組全域 key：

1. dialog block-all / 清理名單入口
2. 貼文水庫 `enqueueBatch()` 入口

### 3.3 目前讀取點

worker 成功後會呼叫：

```js
Storage.addToBlockDBFromContext(targetUser)
```

而這個 helper 目前讀的是：

```js
JSON.parse(Storage.get(CONFIG.KEYS.BLOCK_CONTEXT) || '{}')
Storage.get(CONFIG.KEYS.CURRENT_BATCH_ID)
```

也就是說，**成功寫入 DB 時讀到的是「現在最新的全域 context」**，不是該使用者入隊時的 context。

## 4. 問題描述

### 4.1 問題不是封鎖流程失敗，而是資料 attribution 錯誤

`beta74` 主流程可以很穩，因為：

- 帳號還是有被正常封鎖
- worker 還是會正常完成

但 provenance 有可能寫錯，這會直接污染：

- block history 顯示
- 來源貼文分析
- 後續 analytics/export

### 4.2 觸發情境

```text
批次 A 先進入 BG_QUEUE
→ 寫入全域 BLOCK_CONTEXT = A

worker 開始跑 A

使用者又從另一個 dialog 或貼文水庫加入批次 B
→ 寫入全域 BLOCK_CONTEXT = B

worker 接著成功完成 A 裡某個尚未寫入 DB 的帳號
→ addToBlockDBFromContext() 讀到的是 B，不是 A
```

### 4.3 影響範圍

- 來源貼文 URL 錯
- `postOwner` 錯
- `postText` 錯
- `batch` 錯
- evidence snapshot 也會跟著錯

## 5. 設計方案

## 5.1 新資料結構

新增 key：

```js
BLOCK_CONTEXT_MAP: 'hege_block_context_map'
```

格式：

```js
{
  "username_a": {
    src: "https://www.threads.net/@foo/post/abc",
    reason: "likes",
    postText: "來源貼文摘要",
    postOwner: "foo",
    batch: "b_1712345678901",
    updatedAt: 1712345678901
  },
  "username_b": {
    src: "...",
    reason: "quotes",
    postText: "...",
    postOwner: "...",
    batch: "b_1712345678901",
    updatedAt: 1712345678901
  }
}
```

## 5.2 寫入策略

當某個入口把帳號加入封鎖候選或直接加入 `BG_QUEUE` 時，**同時為每個帳號寫入自己的 provenance**。

需要覆蓋的入口：

1. dialog block-all
2. 進階完整收集（advancedBlockAll）
3. checkbox 勾選 / shift-click reset
4. 貼文水庫 `enqueueBatch()`
5. 其他會直接把 pending 名單送進 `BG_QUEUE` 的主面板入口

## 5.3 讀取策略

保留 worker 原本的成功分支：

```js
Storage.addToBlockDBFromContext(targetUser)
```

但其內部邏輯改成：

```js
const ctx = Storage.getBlockContext(targetUser)
```

而不是讀全域 `BLOCK_CONTEXT`。

## 5.4 清理策略

### 成功寫入 DB 後

- 刪除該 `targetUser` 的 block context

### 使用者取消勾選 / 清除 pending / 清空排隊

- 若該使用者已不在 `pending` / `BG_QUEUE` / `COOLDOWN_QUEUE`
- 刪除該使用者的 block context

### 全部清空背景排隊

- 清空整個 `BLOCK_CONTEXT_MAP`

## 5.5 與既有 key 的相容策略

本次修正後：

- `BLOCK_CONTEXT`
- `CURRENT_BATCH_ID`

可以保留一段時間作為 legacy key，但 **不再作為 block DB 寫入來源**。

也就是：

- 舊 key 可存在
- 新邏輯不依賴它們

## 6. 實作邊界

### 6.1 本次不改 worker 導航

不改：

- `history.replaceState + location.reload`
- `hege_return_url`
- `hege_bg`
- popup / same-tab fallback

### 6.2 本次不改 block DB 模型

`DB_KEY` / `DB_TIMESTAMPS` 仍維持現況：

- block list state
- 每個帳號只保存第一筆 timestamp metadata

這份 SDD 不處理「event log」問題。

### 6.3 本次不改 report provenance

`REPORT_CONTEXT` 已經是 per-user map。  
本次只把 block path 對齊到同樣的模型。

## 7. Proposed Changes

### [CONFIG]
#### [MODIFY] `src/config.js`

- 新增 `CONFIG.KEYS.BLOCK_CONTEXT_MAP`
- 加入 `SYNC_KEYS`

### [STORAGE]
#### [MODIFY] `src/storage.js`

新增 helper：

- `getBlockContextMap()`
- `setBlockContext(usernames, context, options)`
- `getBlockContext(username)`
- `removeBlockContext(usernames)`
- `clearBlockContextMap()`

調整：

- `addToBlockDBFromContext(username)` 改讀 per-user context
- `captureFromBlockContext(accountId)` 改接受 per-user context

### [CORE]
#### [MODIFY] `src/core.js`

新增：

- `resolveBlockReasonFromTitle()`
- `resolveBlockReasonFromElement()`
- `setBlockContext()`
- `removeBlockContext()`

調整以下入口，在帳號進入封鎖候選時就寫 per-user provenance：

- dialog block-all
- advancedBlockAll
- checkbox check/reset/uncheck
- 清理 pending 時同步清除不用的 block context

### [POST RESERVOIR]
#### [MODIFY] `src/features/post-reservoir-engine.js`

`enqueueBatch()` 改為對 `batchUsers` 寫 per-user block context，不再寫全域 `BLOCK_CONTEXT`。

### [MAIN]
#### [MODIFY] `src/main.js`

在「清除目前選取 / 背景排隊」這類全量清空入口時，同步清空 `BLOCK_CONTEXT_MAP`。

### [WORKER]
#### [NO FLOW CHANGE] `src/worker.js`

worker 成功分支邏輯保持原樣，不改路徑控制。  
只透過 `Storage.addToBlockDBFromContext(targetUser)` 的內部實作吃到新資料來源。

## 8. 驗收條件

- [ ] `beta74` 的 block 主流程行為不變
- [ ] iOS same-tab worker 不受影響
- [ ] Desktop popup worker 不受影響
- [ ] worker 跑到一半再追加第二批 `BG_QUEUE`，前一批帳號的來源貼文不會被覆蓋
- [ ] 貼文水庫 `enqueueBatch()` 的來源貼文與 batch attribution 正確
- [ ] 清除 pending / 清空排隊後，不會殘留無用的 block context
- [ ] `Storage.addToBlockDBFromContext(targetUser)` 寫入 DB 後，會清掉該使用者的 context

## 9. 驗證計畫

### Case A：單批 dialog block-all

1. 從同一個 dialog 加入一批帳號
2. 啟動 worker
3. 確認 `DB_TIMESTAMPS[user].src/postOwner/postText/batch` 正確

### Case B：worker 跑到一半再加第二批

1. 先從貼文 A 加入一批帳號並開始 worker
2. worker 執行中，再從貼文 B 加入第二批
3. 確認：
   - 屬於 A 的帳號仍記錄到 A
   - 屬於 B 的帳號記錄到 B

### Case C：貼文水庫 enqueueBatch

1. 用貼文水庫啟動批次
2. 確認來源 URL / postOwner / batch 正確寫入

### Case D：清除選取/清空排隊

1. 加入候選但不執行
2. 清除目前選取與背景排隊
3. 確認 `BLOCK_CONTEXT_MAP` 被清掉或只留下仍有效的帳號

## 10. 風險

1. 某些入口只加了 `BG_QUEUE`，但沒同步寫 block context  
   結果會變成「部分帳號有 provenance、部分沒有」。

2. 清理策略太積極  
   可能把還在 `BG_QUEUE` / `COOLDOWN_QUEUE` 裡的帳號 context 提早刪掉。

3. checkbox / dialog / reservoir 三條入口沒有統一  
   會導致不同入口 provenance 格式不一致。

## 11. Rollback Plan

若實作後出現封鎖流程回歸問題：

1. 先回退到 `beta74` 的全域 `BLOCK_CONTEXT` 邏輯
2. 保留本 SDD，不直接延伸到 block event log
3. 重新拆成更小 patch：
   - 先只修貼文水庫
   - 再修 dialog block-all

## 12. 後續工作（不含在本次）

以下留到下一份 SDD：

1. block event log
2. analytics overlay 改吃 event-level 資料
3. platform upload payload trimming
4. bot detection
