# SDD Bugfix：全域問題修正紀錄

> 最後更新：2026-04-02 | 待修復

---

## Bug 1：`boolean false is not iterable`（無框框問題）

### 症狀
部分使用者反映「框框不出現」，Console 顯示：
```
Uncaught TypeError: boolean false is not iterable
(cannot read property Symbol(Symbol.iterator))
```

### 原因
`Storage.getJSON()` 的回傳邏輯（`storage.js` L37）：
```js
return Array.isArray(parsed) ? [...parsed] :
    (typeof parsed === 'object' && parsed !== null ? {...parsed} : parsed);
```
若 localStorage 中某個 key 存了非陣列、非物件的純量（例如 `false`、`0`、`""`），
最後的 `parsed` 直接原樣回傳。

以下四個呼叫點**沒有傳入預設值 `[]`**：
| 行號 | 位置 | 呼叫頻率 |
|---|---|---|
| L1029 | `scanAndInject()` | 每 500ms ← 最高頻率炸點 |
| L1110 | `injectDialogCheckboxes()` | Dialog 開啟時 |
| L1233 | `handleGlobalClick()` | 點 checkbox 時 |
| L1536 | `updateControllerUI()` | 每 500ms |

這四處都是 `new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY))` — 無第二參數，
若 `DB_KEY` 寫入了 `false`，`new Set(false)` 就炸出 TypeError，
checkbox 注入失敗 → 框框不出現。

### 修復方案
以上四處補上 `[]` 預設值：
```diff
- const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY));
+ const db = new Set(Storage.getJSON(CONFIG.KEYS.DB_KEY, []));
```

### 影響範圍
- `src/core.js`：4 處
- 偶發性（DB_KEY 通常是陣列，只有在特殊情況下才會是 false）

---

## Bug 2：問題回報功能失效

### 症狀
使用者點「回報問題」→ 填寫 → 送出後沒有任何反應，或顯示「發生例外錯誤」。

### 原因
`reporter.js` 的網路請求策略：
```js
if (typeof GM_xmlhttpRequest !== 'undefined') {
    GM_xmlhttpRequest({ ... });   // UserScript 環境（Tampermonkey 等）
} else {
    fetch(CONFIG.BUG_REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },  // ← 問題在這
        body: JSON.stringify(payload)
    });
}
```

**Safari Userscripts 不支援 `GM_xmlhttpRequest`**，走 `fetch()` 分支。
但 `Content-Type: application/json` 是非簡單請求，會觸發 CORS preflight (OPTIONS)。

Google Apps Script（GAS）預設**不接受** OPTIONS preflight，
導致所有請求被 CORS 攔截，靜默失敗或丟出 `Network Error`。

### 修復方案
`fetch()` 分支改用 `application/x-www-form-urlencoded` 格式傳輸，
這是簡單請求，不觸發 preflight，GAS 可以正常接收：

```js
const formBody = new URLSearchParams();
formBody.append('payload', JSON.stringify(payload));

fetch(CONFIG.BUG_REPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
    redirect: 'follow'
})
```

GAS 端改用 `e.parameter.payload` 取得資料（需同步修改 GAS 端若有欄位對應）。

**備選方案（若不想改 GAS）**：  
改用 `no-cors` mode，送出後視為「fire-and-forget」，
不驗證回應，但使用者就無法得到送出成功的確認。

### 影響範圍
- `src/reporter.js`：`submitReport()` 的 `fetch()` 分支
- GAS 端腳本（需確認接收欄位格式）
- 僅在 Safari Userscripts / 無 GM API 的環境下發生

---

## 狀態總覽

| Bug | 嚴重度 | 影響環境 | 狀態 |
|---|---|---|---|
| 1：false is not iterable | 🔴 高（無框框） | 全平台（偶發） | ⏳ 待修復 |
| 2：回報功能失效 | 🟡 中 | Safari Userscripts | ⏳ 待修復 |
