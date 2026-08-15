# 時點快照：SSOT 重複實作複盤（2026-08-15）

> 基準：`docs/handoff/ssot-inventory.done.md`（baseline `3cea5d0`，2026-07）的 12 項。本次複查該 12 項現況，並掃描 `src/` 找 baseline 之後新長出來的重複實作。
> 效力：新發現已收斂進 `docs/PLAN_2.8.2_STRUCT_DEBT.md` 第 40-43 項，該表為準。本檔保存完整位置清單與結案證據，修掉後不更新。

## A. 舊盤點 12 項的歸屬與現況

盤點 1-7、11、12 都已在 PLAN 總表（依序對應表 #8、#11、#12、#6、#7、#9、#10、#13、#14）。

**盤點第 8、9、10 三項從未進入 PLAN 總表**，但複查發現三項都已被後續版本實質修掉，因此直接結案，不補進表：

| 盤點 # | 標題 | 結案證據 |
|---|---|---|
| 8 | More locator 本地重寫 | `core.js:1688` 的 profile anchor 已把 More 分支委派給 `MoreLocator.findCandidates`，只留 Instagram/bell 等 profile 專屬 anchor；`report-flow.js:481-524` 的 legacy helper 全改薄包裝，內部一律呼叫 MoreLocator。殘留 `report-flow.js:485` 的 `getMoreButtonClickable` 與 `more-locator.js:34` 的 `clickableAncestor` 是兩套「向上找可點祖先」規則，已併入 PLAN #43 低優先處理 |
| 9 | beta diagnostics gate 複製 | `ENABLE_BETA_DIAGNOSTICS` 全 repo 只剩 `core.js:169`（canonical gate）與 `config.js:130`（定義），原三份逐字複本已消失；`ui.js:1476` 改呼叫 `__hegeRuntimeDiagnostics.enabled()`。`Utils.isBetaBuild()` 保留但已明確只用於 beta UI 文案，分工註記在 `three-no-watch.js:98` |
| 10 | checkbox SSOT helper 被繞過 | 全 repo 已無 `classList.remove('checked')` 裸操作；原繞過點 `main.js:915` 改用 `Core.applyCheckboxState(cb, 'none')` |

盤點第 12（48 小時保留窗）已於 beta30 修畢，複查 `storage.js:835`／`847` 均引用 `BLOCK_RING_RETENTION_MS`，無硬寫殘留。

## B. 新發現（完整位置清單）

### B1 → PLAN #40：元素可見性判斷 11 份、門檻互不相同（已分歧）

| 位置 | 判準 |
|---|---|
| `more-locator.js:58` | display/visibility/opacity ＋ 非零矩形，不看 viewport |
| `core.js:1860` | display/visibility ＋ 非零矩形，不看 opacity |
| `core.js:2053` | 只看矩形 > 5px，不查 computed style |
| `core.js:3272` | 只看非零矩形 |
| `three-no-watch.js:2088` | 非零 ＋ `top < innerHeight` |
| `three-no-watch.js:2374` | 純非零 |
| `three-no-watch.js:3200` | `top < 520` |
| `three-no-watch.js:3344` | `top < 620` |
| `three-no-watch.js:3416` | `top < 760` |
| `three-no-watch.js:3636` | `top >= 120` |
| `three-no-watch.js:3721` | 非零 ＋ 上界 |

後果：小視窗或版面改版時，同一顆按鈕在某些流程看得到、某些流程看不到，症狀是無錯誤訊息的靜默失敗。`more-locator.js:58` 的註解已記錄過同款事故（實測 197x327 全失敗）。

### B2 → PLAN #41：sweep sessionStorage 鍵散寫五個檔案，清除集合已分歧（已分歧）

SSOT 是 `post-reservoir-engine.js:9-18` 的 `SWEEP_KEYS`（8 個鍵），**無任何檔案 import 它**：

- `main.js:257-259`：清 8 個（完整）
- `ui.js:4598-4606`：清 8 個（完整）
- `worker.js:437-443`：只清 5 個（缺 `wait_started_at`、`lock`、`stopped`）
- `worker.js:1146-1149`：只清 4 個
- 字面值讀寫：`core.js:5445`、`main.js:278`、`main.js:540-541`、`main.js:1007-1008`
- 這些鍵不在 `CONFIG.KEYS`（config 只有 `hege_sweep_batch_size`、`worker_standby`、`stopped`）

後果：worker 側漏清會留下 `hege_sweep_lock` / `wait_started_at`，下一趟掃描被舊鎖擋住或跳過等待，症狀是「停止後再開就不動了」。

### B3 → PLAN #42：失敗原因代碼四份清單互不同步（已分歧）

- `core.js:57-67` `BETA_DIAGNOSTIC_REASONS`（診斷 ring 白名單，含 `followers_*`）
- `core.js:724-731` `FAILED_REASON_ENUM`（失敗名單列舉，含 `private_manual_required`、`legacy_string`，不含 `followers_*`）
- `worker.js:2028` 內聯陣列（決定可否重試）
- `report-debug-context.js:34-47` 另一份

後果：新增失敗代碼時會被診斷 ring 靜默丟棄、或被失敗名單降級成 `unknown`、或意外變成不可重試。同款事故見 PLAN #21。

### B4 → 併入 PLAN #7（username parser）：字串正規化又長出三份本地版

- `core.js:732` `normalizeFailureUsername`（canonical）
- `core.js:1450` 與 `core.js:1497`：兩段逐字相同的內聯 fallback，不做字元白名單、不截長度
- `core.js:4467`：只去 `@` 加 lowercase，不切路徑

後果：同一帳號在勾選框比對與失敗名單比對算出不同 key。與 #7 的 href 解析屬不同層，補在該項底下。

### B5 → 併入 PLAN #37(a)：三無執行期備份鍵未註冊

`three-no-watch.js:244` 定義 `runtimeBackupKey: 'hege_three_no_scan_runtime_backup'`，`core.js:5951` 用 `?? '同一字面值'` 再寫一次。該鍵不在 `CONFIG.KEYS` 也不在任何清除清單。後果與 #37(a) 同類：重置／遷移／配額清理掃不到它，殘留備份吃 localStorage 配額（ADR 0023 正為此而寫）。

### B6、B7 → PLAN #43（小型清理）

- `three-no-watch.js` 對 7 個 `CONFIG.THREE_NO_*` 寫了內聯 `|| 預設` fallback，其中 `three-no-watch.js:1815` 的 fallback 是 `1800`，`config.js:173` 是 `1400`，**兩者不一致**。目前 CONFIG 有值所以無症狀，但造成「改 config 不一定生效」的假象。
- `utils.js:152` 的 `Utils.sleep` 與 `:174` 的 `Utils.safeSleep` 實作完全相同，且 `Utils.sleep` 全 repo 零呼叫者，可直接刪除。
- `report-flow.js:485` `getMoreButtonClickable` 與 `more-locator.js:34` `clickableAncestor` 兩套向上找可點祖先的規則（舊盤點 #8 的殘留）。

## 處理中，不重複列

- checkbox 注入路徑統一（`core.js` 貼文注入段自建 DOM 而非用 `createCheckboxContainer`，SVG 與事件綁定為逐字複本）：beta34 進行中。
- PLAN #37(a)(b)（retry marker 三件組 `worker.js:24`／`240-290`、worker 啟動序列 `core.js:1342-1362`／`5578`／`5617`）：複查確認兩者都還在，行號如上。

## 共同特徵

新發現七項裡，前三項都是「SSOT 已經存在，但沒有任何呼叫端 import 它」。修法都是把字面值換成既有常數或既有 helper，不需要改架構。
