# 留友封 (ThreadsBlocker) — SDD

**版本：** 2.3.1
**最後更新：** 2026-03-27

---

## §0 產品定位

| 項目 | 說明 |
|------|------|
| 名稱 | 留友封 (ThreadsBlocker) |
| Slogan | Threads 批量封鎖工具 |
| 核心功能 | 在 Threads 網頁版上批量勾選並封鎖/解除封鎖帳號 |
| 平台 | Chrome Extension (MV3) / Firefox Extension (MV2) / Safari Userscript |
| 目標用戶 | 遭受大量騷擾或需要批量管理封鎖名單的 Threads 使用者 |

---

## §1 系統架構

```
┌─────────────────────────────────────────────────────────┐
│  Controller Tab (主頁面)                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐  │
│  │  main.js  │  │  core.js  │  │   ui.js   │  │utils.js │  │
│  │  (入口)   │  │ (業務邏輯)│  │  (介面)   │  │ (工具)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘  │
│        │              │              │                     │
│        └──── localStorage (跨 tab 同步) ────┘            │
│                       │                                    │
├───────────────────────┼────────────────────────────────────┤
│  Worker Tab (背景封鎖)│                                    │
│  ┌──────────┐         │                                    │
│  │ worker.js │ ◄──────┘                                    │
│  │ (自動封鎖)│                                             │
│  └──────────┘                                              │
├────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌──────────┐                              │
│  │ storage.js  │  │config.js │                              │
│  │ (快取層)    │  │ (設定)   │                              │
│  └────────────┘  └──────────┘                              │
│  ┌────────────┐                                            │
│  │reporter.js  │ → Google Apps Script → Google Sheets      │
│  │ (bug 回報) │                                            │
│  └────────────┘                                            │
└────────────────────────────────────────────────────────────┘
```

---

## §2 模組職責

### config.js
- 版本號、功能開關、速度模式檔位定義
- `CONFIG.KEYS`：所有 localStorage/sessionStorage key 的唯一定義處
- `CONFIG.SELECTORS`：DOM 選擇器
- `CONFIG.SPEED_PROFILES`：四種速度模式（smart/stable/standard/turbo）

### storage.js
- localStorage / sessionStorage 的薄包裝層
- 記憶體 cache（`cache` / `sessionCache`）減少 DOM 存取
- `invalidate(key)`：清除 cache 強制下次從 storage 讀取
- `getJSON` 回傳 clone，避免跨模組引用汙染

### utils.js
- `sleep(ms)` / `speedSleep(ms)`：依速度模式倍率調整的等待
- `pollUntil(conditionFn, maxMs, intervalMs)`：智慧等待，條件成立立刻繼續
- `getSpeedProfile()` / `getSpeedMode()`：讀取速度模式（自動 invalidate cache）
- `simClick(element)`：模擬完整的 touch + mouse + click 事件鏈
- `isMobile()`：偵測 iOS / Android
- `getMyUsername()`：從導航列推測當前登入使用者
- `diagLog(msg)` / `getDiagLogs()`：checkbox 注入診斷紀錄
- `initConsoleInterceptor()`：攔截 console.log/warn/error 存入 buffer
- `setHTML(element, html)`：Trusted Types 安全的 innerHTML

### core.js
- **掃描與注入**
  - `startScanner()`：MutationObserver + 500ms setInterval 備援
  - `scanAndInject()`：在 feed/profile 頁面掃描「更多」SVG 按鈕，注入 checkbox（跳過 dialog 內的元素）
  - `injectDialogCheckboxes()`：在 dialog（查看動態、讚、引用等）中注入 checkbox
  - `injectDialogBlockAll()`：在 dialog 標題旁注入「同列全封」按鈕
- **選取與操作**
  - `handleGlobalClick()`：checkbox 點按處理（含 shift-click 範圍選取）
  - `pendingUsers`（Set）：當前 tab 的待封鎖名單（sessionStorage）
  - `handleBlockAll()`：一鍵選取 dialog 中所有可見帳號
- **管理**
  - `saveToDB()` / `openBlockManager()` / `startUnblock()`
  - `importList()` / `exportHistory()`
  - `retryFailedQueue()`
- **UI 同步**
  - `updateControllerUI()`：throttled（500ms），更新 checkbox 狀態、面板計數、佇列徽章
- **回報**
  - `collectDiagnostics()`：收集完整診斷資訊（平台、佇列、DOM、worker 統計）
  - `showReportDialog()`：打開回報 modal 並附加診斷資訊

### worker.js
- **背景封鎖引擎**
  - `init()`：從 `BG_QUEUE` 讀取佇列，開始逐筆封鎖
  - `runStep()`：主循環 — 取出佇列首項 → 導航到目標頁 → 執行 autoBlock
  - `autoBlock(user, isUnblock)`：自動化封鎖/解除流程
    1. 智慧等待頁面載入
    2. 找到「更多」按鈕 → simClick
    3. 智慧等待選單出現 → 找到「封鎖」按鈕
    4. Post-level fallback（在 replies 頁面嘗試從貼文選單封鎖）
    5. 點擊封鎖 → 等待確認 dialog → 點擊確認
    6. 等待 dialog 關閉
  - `verifyBlock(user)`：Adaptive 驗證（Level 0: 每5次, Level 1: 每3次, Level 2: 每次）
- **狀態管理**
  - `stats`：成功/跳過/失敗/消失計數
  - `saveStats()` / `loadStats()`：持久化到 `CONFIG.KEYS.WORKER_STATS`
  - `updateStatus()`：寫入 `BG_STATUS`，Controller 透過 storage event 同步
- **保護機制**
  - `triggerCooldown()`：偵測 Meta 限制時啟動冷卻期
  - `consecutiveRateLimits`：連續 3 次選單異常 → 強制冷卻

### ui.js
- **CSS 注入**（`injectStyles`）
- **面板**（`createPanel`）：浮動控制面板
  - 開始封鎖 / 清除選取 / 速度模式 / 設定 / 回報問題 / 停止執行
- **Modal 彈窗**
  - `showSettingsModal()`：管理已封鎖、匯入、匯出、清除歷史
  - `showBugReportModal()`：問題類型選擇 + 描述 + 版號顯示
  - `showBlockManager()`：已封鎖帳號列表（排序、搜尋、批量解除）
  - `showDisclaimer()`：首次使用免責聲明
  - `showConfirm()` / `showToast()`
- **面板定位**（`anchorPanel`）：附著在 Threads 原生選單旁

### main.js
- 入口點：版本升級遷移、佇列清理、DB key 遷移
- 區分 Controller / Worker 模式（URL 參數 `hege_bg=true`）
- 跨 tab 同步：`storage` event + 2 秒 polling 備援
- 面板重注入：1.5 秒 interval 檢查面板是否被 React 移除

### reporter.js
- `submitReport(level, message, errorCode, metadata)`：送出 bug report
- HMAC-SHA256 簽章 + 5 分鐘時效
- 支援 `GM_xmlhttpRequest`（Userscript）和 `fetch`（Extension）雙通道

---

## §3 速度模式系統

| 模式 | key | multiplier | usePolling | 說明 |
|------|-----|-----------|-----------|------|
| 🧠 智慧 | `smart` | 1.0x | ✅ | 預設。pollUntil 偵測到就繼續 |
| 🛡️ 穩定 | `stable` | 1.5x | ❌ | 所有等待延長 50%，最安全 |
| ⚡ 標準 | `standard` | 1.0x | ❌ | 固定間隔，原始行為 |
| 🚀 加速 | `turbo` | 0.4x | ✅ | 等待縮短 60% + polling，切換時顯示警告 |

### 關鍵函式

- **`Utils.speedSleep(ms)`**：`sleep(ms * multiplier)`，最低 50ms
- **`Utils.pollUntil(fn, maxMs, intervalMs)`**：
  - timeout 也乘以 multiplier，但**下限 2 秒**（避免 turbo 模式在慢網路誤判）
  - 每 `intervalMs` 偵測一次，條件成立立刻回傳結果

### 影響範圍
- Worker 的所有等待（頁面載入、找按鈕、等選單、等確認、等 dialog 關閉）
- **不影響** Controller 端的掃描頻率（MutationObserver + 500ms interval）

---

## §4 Checkbox 注入系統

### 兩套注入邏輯

| | scanAndInject | injectDialogCheckboxes |
|---|---|---|
| 觸發場景 | Feed / Profile / 搜尋結果 | Dialog（查看動態、讚、引用等） |
| 定位方式 | absolute（在「更多」按鈕左側：`right: 100%`） | flex inline（插在追蹤按鈕前面） |
| 去重策略 | `data-hege-checked` + parent 查詢 | `data-username` + flexRow 查詢 |
| 衝突避免 | **跳過 `div[role="dialog"]` 內的元素** | 只在 dialog context 中運作 |

### 診斷系統
- 每次注入失敗（SVG 太小、找不到 username 等）記錄到 `Utils.diagLog()`
- Bug report 時自動附加最近 30 筆診斷紀錄

---

## §5 Storage Key 管理

所有 key 定義在 `CONFIG.KEYS`，不允許硬寫字串。

| Key 常數 | 值 | Storage | 用途 |
|----------|-----|---------|------|
| `DB_KEY` | `hege_block_db_v1` | localStorage | 已封鎖帳號陣列 |
| `DB_TIMESTAMPS` | `hege_block_timestamps` | localStorage | 封鎖時間戳 |
| `PENDING` | `hege_pending_users` | **sessionStorage** | 當前 tab 選取（per-tab） |
| `BG_QUEUE` | `hege_active_queue` | localStorage | 背景封鎖佇列 |
| `BG_STATUS` | `hege_bg_status` | localStorage | Worker 狀態（state, total, lastUpdate） |
| `BG_CMD` | `hege_bg_command` | localStorage | Controller → Worker 指令（stop） |
| `FAILED_QUEUE` | `hege_failed_queue` | localStorage | 封鎖失敗名單 |
| `COOLDOWN_QUEUE` | `hege_cooldown_queue` | localStorage | 冷卻期備份佇列 |
| `COOLDOWN` | `hege_rate_limit_until` | localStorage | 冷卻期結束時間 |
| `SPEED_MODE` | `hege_speed_mode` | localStorage | 速度模式（smart/stable/standard/turbo） |
| `WORKER_STATS` | `hege_worker_stats` | localStorage | Worker 統計資料 |
| `VERIFY_PENDING` | `hege_verify_pending` | localStorage | 待驗證的目標帳號 |
| `POST_FALLBACK` | `hege_post_fallback` | localStorage | 貼文備案開關 |
| `VERSION_CHECK` | `hege_version_check` | localStorage | 版本升級偵測 |
| `STATE` | `hege_panel_state` | localStorage | 面板展開/收合 |
| `POS` | `hege_panel_pos` | localStorage | 面板位置 |
| `DISCLAIMER_AGREED` | `hege_disclaimer_agreed_v2_1` | localStorage | 免責聲明已同意 |
| `DIAG_LOG` | `hege_diag_log` | localStorage | Checkbox 診斷紀錄 |
| `CONSOLE_LOGS` | `hege_web_console_logs` | localStorage | Console 攔截 buffer |
| `DEBUG_LOG` | `hege_debug_log` | localStorage | Debug 紀錄 |

---

## §6 跨 Tab 同步機制

```
Controller Tab                    Worker Tab
     │                                │
     │◄── storage event ─────────────│  Worker 寫入 BG_STATUS, BG_QUEUE
     │     + Storage.invalidate()     │
     │                                │
     │── 2s polling backup ──────────►│  invalidate 所有關鍵 key
     │     Core.updateControllerUI()  │
     │                                │
     │── BG_CMD = 'stop' ───────────►│  Worker 每步檢查
     │                                │
```

- **`PENDING` 不同步**（sessionStorage，per-tab 設計）
- **Worker 速度模式讀取**：`getSpeedMode()` 每次呼叫自動 invalidate cache

---

## §7 Bug Report 系統

```
Client (reporter.js)          GAS Server                 Google Sheets
     │                            │                           │
     │── POST {payload + sig} ──►│                           │
     │                            │── 驗簽 ──►               │
     │                            │── 時效檢查（5min）──►     │
     │                            │── 限流（5min/裝置）──►    │
     │                            │── 寫入 ─────────────────►│ (分頁: ThreadsBlocker)
     │                            │── LINE Notify ──►         │
     │◄── {code, message} ───────│                           │
```

### 回報類型（使用者可選）
| value | 顯示 |
|-------|------|
| `PRAISE` | 🎉 我覺得很棒 |
| `INFO` | 💡 功能建議 |
| `WARNING` | ⚠️ 有點怪怪的 |
| `ERROR` | ❌ 功能壞了（預設） |
| `CRITICAL` | 💀 完全無法使用 |

### Metadata 自動附加
- 完整診斷報告（`collectDiagnostics`）
- 速度模式
- Checkbox 診斷紀錄

---

## §8 UI 結構

### 主面板
```
┌─────────────────────────┐
│ 留友封 ▲  (0選取)        │  ← 標題列，點按展開/收合
├─────────────────────────┤
│ 執行狀態...              │  ← BG_STATUS 同步
│ 開始封鎖     [0 選取]   │
│ 清除選取                 │
│ 速度模式     [🧠 智慧]  │  ← 點按循環切換
│ ⚙️ 設定                 │  ← 打開設定 modal
│ 🚩 回報問題             │
│ 停止執行                 │  ← 僅執行中顯示
└─────────────────────────┘
```

### 設定 Modal
```
┌─────────────────────────┐
│ ⚙️ 設定            ✕   │
├─────────────────────────┤
│ 管理已封鎖       [123]  │
│ 匯入名單                 │
│ 匯出紀錄                 │
│ 清除所有歷史             │
│                          │
│    版本 2.3.1-beta16     │
└─────────────────────────┘
```

---

## §9 Build 產物與平台支援

### build.sh 產出

| 產物 | 路徑 | 平台 | 說明 |
|------|------|------|------|
| UserScript | `dist/threads_block_tool.user.js` | Tampermonkey / Userscripts | 含 UserScript header |
| Chrome Extension | `dist/extension/` | Chrome / Edge / Brave (MV3) | `manifest_version: 3`，`host_permissions` |
| Firefox Extension | `dist/firefox/` | Firefox 109+ (MV2) | `manifest_version: 2`，`browser_specific_settings.gecko` |
| Firefox XPI | `dist/threads_blocker_firefox.xpi` | Firefox | zip 打包，可直接安裝 |
| Safari UserScript | iCloud `userscripts/threads-block.js` | Safari (macOS/iOS) | 自動部署到 Userscripts app 目錄 |

### 平台差異

| | Chrome MV3 | Firefox MV2 | UserScript |
|---|---|---|---|
| Manifest | `host_permissions` | `permissions` | N/A（`@match`） |
| 版本格式 | `2.3.1-beta17` | `2.3.1.17`（無 hyphen） | `2.3.1-beta17` |
| API | `chrome.*` | `browser.*` | `GM_xmlhttpRequest` |
| Bug Report 通道 | `fetch` | `fetch` | `GM_xmlhttpRequest` |
| Trusted Types | 需要 policy | 不需要 | 不需要 |

### 為什麼 Firefox 用 MV2？
Firefox MV3 仍有限制（content script 注入時機、`host_permissions` 處理差異）。MV2 在 Firefox 上是穩定且完整支援的。程式碼不依賴任何 `chrome.*` / `browser.*` API（純 DOM + localStorage），所以 MV2/MV3 差異僅在 manifest。

---

## §10 已知限制與設計決策

| 項目 | 決策 | 原因 |
|------|------|------|
| `PENDING` 用 sessionStorage | per-tab 選取，不跨 tab 同步 | 避免多 tab 同時選取衝突 |
| `BG_QUEUE` 無 lock 保護 | 接受 rare case 資料遺失 | `navigator.locks` 相容性考量 |
| Dialog 與 Feed checkbox 分開處理 | 兩套注入邏輯，各管各的 | DOM 結構差異大，統一反而更脆弱 |
| `pollUntil` timeout 下限 2 秒 | 即使 turbo 模式也不低於 2 秒 | 避免慢網路誤判 |
| 進階封鎖（POST_FALLBACK）移除 UI | 永遠啟用 replies 備案 | 簡化設定，備案不影響正常流程 |

---

## §11 版本歷程

| 版本 | 重點 |
|------|------|
| 2.3.0 | Batch Unblock & Cross-Tab Sync |
| 2.3.1-beta9 | Selective Unblock |
| 2.3.1-beta10~15 | Speed Mode、Smart Polling、Checkbox Fix、Bug Report 改版 |
| 2.3.1-beta16 | Opus 架構審查修復：DB_KEY 遷移、null reference、雙 checkbox 防護、死碼清理 |
