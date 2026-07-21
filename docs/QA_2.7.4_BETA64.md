# QA 2.7.4-beta64

## 範圍

本 beta 只修 verified Likes clean-list 的 lazy-load 結算時序：移除初始 `atBottom` 早退，沿用 `unchangedCount >= 4` 的 bounded end。沒有改 selector、scroll-root、reservoir、owner/self/reply policy 或 enqueue。

## 驗證狀態

- `node --test tests/beta64-likes-lazyload.test.mjs`：**1/1 passed**；production-path fixture 延遲載入後完整收集 140/140。
- beta59–beta64 targeted regression：**31/31 passed**。
- full `node --test tests/*.test.mjs`：**145/145 passed**。
- syntax、`git diff --check`：**passed**。
- `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump`：**passed**；runtime `2.7.4-beta64`，Chrome artifact `2.7.4.64`，UserScript `2.7.4-beta64`。
- 使用者 Chrome 實機驗收：尚未執行；headless fixture 不代表 live fixed。

## 已知限制

beta63 實機證據是 Likes 約 140 人只收 1 人；beta64 headless fixture 已收 140/140，但仍必須由使用者重新安裝／載入後人工確認完整名單。未 deploy、未上傳商店、未 push、未發布正式版。
