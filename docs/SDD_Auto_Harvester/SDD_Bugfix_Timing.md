# SDD Bugfix：無盡收割機觸發時序修正紀錄

> 最後更新：2026-04-02 | 版本覆蓋：beta53 → beta56+

## 問題概述

原始 SDD（`SDD.md`）設計了三個 State 的狀態機，但實作中存在以下**時序問題**，導致收割機在
「RELOADING → 自動接軌」的流程中異常中止。

---

## Bug A：死迴圈誤判（最高頻）

### 症狀
每次 reload 後自動觸發，幾乎必中「⚠️ 偵測到死迴圈」，收割機被強制終止。

### 原因
`last_first_user` 比對邏輯設計上是防止「手動連按無效」，
但 RELOADING 自動接軌時 Dialog 剛開、名單從頭渲染，
第一個用戶和上批相同機率極高，造成誤判。

### 修復方案（beta55）
加入 `hege_auto_triggered_once` 旗標：
- `startEndlessMonitor` 進入 RELOADING 前：`removeItem('hege_auto_triggered_once')`
- `handleEndlessSweep` 觸發時：讀取旗標，若為空（表示第一次接軌），**跳過**死迴圈比對
- 觸發成功後寫入 `hege_auto_triggered_once = 'true'`，下次手動觸發恢復比對

---

## Bug B：Action 3 過早觸發（名單未渲染）

### 症狀
Toast 顯示「畫面上無可收割帳號」。

### 原因
Action 3 輪詢找到「無盡收割」按鈕後立即 `simClick(endlessBtn)`，
此時 Dialog 名單可能剛出現、還沒渲染完（0 個 `a[href^="/@"]`）。

### 修復方案（beta55）
Action 3 改為雙重條件觸發：
```
按鈕存在 AND 有效帳號數（未封鎖、未在佇列）≥ 3
```
持續輪詢直到名單就緒。

---

## Bug C：`title` 屬性被 `updateControllerUI` 覆寫（高頻）

### 症狀
Action 3 完全沉默：沒有 "Found"，也沒有 "Waiting" 日誌。

### 原因
`updateControllerUI()` 每 500ms 執行，其中：
```js
document.querySelectorAll('.hege-block-all-btn').forEach(btn => {
    btn.title = isUnblocking ? '...' : '';  // 非解除封鎖時 title 清空
});
```
導致按鈕注入時設定的 `title="全自動：..."` 被清空，
Action 3 的 `[title*="全自動"]` 選取器永遠返回 `null`。

### 修復方案（beta56）
- `endlessSweepBtn` 加上 `dataset.hegeRole = 'endless-sweep'` 穩定識別碼
- Action 3 選取器改為 `[data-hege-role="endless-sweep"]`
- `updateControllerUI` 中跳過 `endless-sweep` 按鈕的 title 覆寫

---

## Bug D：`getTopContext()` vs `querySelector` 不一致（最新發現）

### 症狀
Action 3 日誌正常（"Found Action 3 with 120 valid users"），
`handleEndlessSweep` 也被觸發，但沒有任何封鎖執行，
後續沒有 "[Endless Harvester] Triggered." 日誌。

### 原因
Threads 在「查看動態（View Activity）」流程中會同時存在**兩個** `dialog`：
1. 第一個：查看動態面板
2. 第二個（最後）：按讚名單對話框

| 程式碼位置 | 選取方式 | 取到的 Dialog |
|---|---|---|
| Action 3 validation | `document.querySelector('div[role="dialog"]')` | **第一個**（查看動態） |
| `handleEndlessSweep` / `getTopContext()` | `dialogs[dialogs.length - 1]` | **最後一個**（按讚名單）|

Action 3 在第一個 dialog 計數到 120 人，認為名單就緒，觸發按鈕。
但 `handleEndlessSweep` 用 `getTopContext()` 取最後一個 dialog（可能是查看動態面板），
其中沒有 `a[href^="/@"]` 連結，`newEndlessUsers.length === 0`，靜默返回。

### 修復方案（beta57）
Action 3 的驗證邏輯改為使用 `getTopContext()` 一致的方式取 dialog：

```diff
- const finalCtx = document.querySelector('div[role="dialog"]') || document;
+ const allDialogs = document.querySelectorAll('div[role="dialog"]');
+ const finalCtx = allDialogs.length > 0 ? allDialogs[allDialogs.length - 1] : document;
```

確保 Action 3 validation 與 `handleEndlessSweep` 使用**同一個 dialog context**。

---

## 狀態總覽

| Bug | 嚴重度 | 修復版本 | 狀態 |
|---|---|---|---|
| A：死迴圈誤判 | 🔴 高 | beta55 | ✅ 已修復 |
| B：名單未就緒就觸發 | 🟡 中 | beta55 | ✅ 已修復 |
| C：title 屬性被覆寫 | 🔴 高 | beta56 | ✅ 已修復 |
| D：getTopContext 不一致 | 🔴 高 | beta57 | 🔄 待修復 |
