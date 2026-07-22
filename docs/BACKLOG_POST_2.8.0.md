# 2.8.0 發版後待辦

來源：2026-07-22 對抗複核（原始報告 `docs/handoff/review-2.8.0.done.md`，未進版控）。
每項的嚴重度與決定都已由使用者拍板，**不要重新提案或自行升級優先順序**。

## 下一輪要修（已決定）

### F5 — 政治事件 ingest 在認證前先動 D1
`cf_bug_admin/src/index.js:1149-1151`

```js
await ensurePlatformTables(env);   // ← DDL 先跑
assertScope(request, env, "events:write");
```

未授權請求雖然回 401，但在此之前已對 D1 執行建表。**認證必須是 handler 的第一行。**

成因：把原本的內聯 `ADMIN_TOKEN` 比對換成 `assertScope` 時沿用了舊順序。

修法：把 `assertScope` 移到 `ensurePlatformTables` 之前。順手檢查其他 handler 有無同樣順序問題。

### F6 — scoped token 與 admin token 同值時靜默升權
`cf_bug_admin/src/index.js:498-519`

`assertScope()` 依 `TOKEN_SCOPES` 的物件順序比對，`ADMIN_TOKEN` 在最前。若部署時誤把 `REPORT_EXPORT_TOKEN` 或 `REVIEWER_TOKEN` 設成與 `ADMIN_TOKEN` 相同的值，會先命中 admin 並取得全部 scope，且沒有任何警告。

修法：偵測到多個 binding 使用相同 secret 時 fail-closed（拒絕並回 401），不要靜默取最寬鬆的那個。

### F1 — 正式版仍無條件蒐集 console log
`src/main.js:20`、`src/utils.js:179-253`

`Utils.initConsoleInterceptor()` 在正式版也會執行，把 console 內容持久化到 `hege_web_console_logs`，**不受 `/-beta\d+$/` 閘門管**。沒有自動上傳，但「正式版關閉診斷」目前只涵蓋 `RuntimeDiagnostics`。

**修之前要先定義邊界**：正式版禁止的是「診斷**上傳**」還是「診斷**蒐集**」？

- 定成「不上傳」→ 現況成立，只需把邊界寫進文件與隱私頁，不改程式
- 定成「不蒐集」→ F1 與 F8（只檢舉的 report-debug batch，`src/main.js:888`、`src/core.js:3914-3964`、`src/features/report-flow.js:151-164,317-338`）都要改成 beta-only，且要處理既有使用者本機已存的資料（boot 時 purge）

這個決定會連動隱私頁與 CWS practices 的措辭，不要只改程式。

## 暫緩（已決定）

### F3 — iOS 可繞過 v4 同意
`src/ui.js:1378-1405`、`src/storage.js:86-89`

iOS userscript 使用者按下「iOS 需要手動上傳」提醒的「知道了」，會呼叫 `setPlatformSyncConsentDecision(false)`，把同意版本蓋成 `platform-sync-v4`；而該提醒視窗完全沒有 v4 的資料欄位與人工讀取揭露。之後手動上傳的閘門只檢查同意版本、不檢查是否啟用，因此**該使用者全程沒看過 v4 同意視窗就能送出資料**。

**使用者決定暫緩**：目前幾乎不維護 iOS，等有餘裕再處理。

修的時候要記住的原則：**寫入同意版本的地方，必須和展示揭露的地方是同一個地方。** 只要有任何路徑會蓋章而不展示內容，version gate 就形同虛設。

## 留存記錄，不主動處理（已決定）

以下經評估後決定不排程，記在這裡避免下次重新發現又重新討論一輪。

| 項目 | 位置 | 內容 |
|---|---|---|
| F2 | `src/features/three-no-watch.js:311-318,378-405` | 舊 network-discovery writer 死碼仍在，正式版 no-op，無 production caller |
| F4 | `src/storage.js:8-16`、`src/ui.js:2671-2694` | 同意與偏好用永久記憶體 cache，不在跨分頁 `SYNC_KEYS`，另一分頁關閉同步後本頁可能沿用 stale `true` |
| F7 | `cf_bug_admin/src/index.js:1078-1084` 等 | `platform:read` 這個 scope 實際會做 DDL 並可能寫入 `topic_sample_reviews`，名稱與能力不符。目前只有全權 `ADMIN_TOKEN` 持有此 scope，尚未造成越權；**若日後要發唯讀 token 必須先拆 scope** |
| F9 | `cf_bug_admin/src/index.js:570-576`、`sql/schema.sql:13-14` | 一般問題回報永久保存 IP hash 與完整 User-Agent，但兩者未參與驗證、限流或查詢，屬保存了卻無用途 |

## 流程結論

這輪複核是**送審之後**才補的，等於已經發出去才找問題。下次順序應為 **功能凍結 → 對抗複核 → 修補 → 送審**；複核是送審的前置條件，不是發版後的收尾。

另一個觀察：9 項發現沒有一項是單純的程式錯誤，全部是**邊界定義不清**——同意在哪裡蓋章、診斷算蒐集還是算上傳、scope 名稱代表讀還是寫、保存的資料要幹嘛。這類問題測試抓不到。
