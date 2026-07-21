# QA 2.7.4-beta58

## 目的與範圍

Beta58 修正 live diagnostics 揭露的 clean-list Likes 收集問題：Likes readiness 成功後，具備可信單列 boundary 的純 profile row 可分類為 Likes；heart marker 僅為輔助證據。未經 verified readiness 的 context、Quotes、Reposts、shared ancestor、header 與 profile header 仍 fail-closed。

clean-list 與 post-reservoir 都使用 `DialogCollector.waitForLikesContextReady()` 回傳的 `verified_likes_context` strategy。collector state 以 username 去重並保存最強證據：同一帳號重複 render 不膨脹；先 unknown 後取得有效 row 時清除 unresolved；結算時只有仍 unresolved 的 unique rows 才是 `rows_unknown`，完整結果才通過 atomic commit。

## Privacy / diagnostics

Rows diagnostics 只使用 allowlist 的 enum、布林值與 bounded unique counts，包括 `classificationStrategy: verified_likes_context`、`uniqueVisibleRows`、`uniqueUnknownRows`、`uniqueEligibleCount`、`validAccountRows`。不保存 username、href、DOM、class、text、HTML、完整 URL/path、UA、token 或 raw metadata。

## Final verification

- `node --test tests/beta58-clean-list.test.mjs`：**6/6 passed**。
- Targeted regression（beta49 dialog collector、beta50 Likes、beta52 row boundary、beta54 route/version、beta55 diagnostics、beta56 lifecycle、beta57 diagnostics、beta58 contract）：**42/42 passed**。
- Full `node --test tests/*.test.mjs`：**114/114 passed**, 0 failed, 0 skipped。
- `node --check`：19 source files + extension/userscript/firefox build outputs passed。
- Privacy allowlist/runtime parity/diff checks：passed；未輸出帳號、href、DOM、class 或 text。

## Build / parity

使用 `./build.sh --no-bump` 產生並驗證本次 `2.7.4-beta58` userscript、extension content、manifest 與 versioned Chrome zip；QA closeout 必須填入各 artifact SHA-256 與 manifest parity。

本次 build（`SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump`）結果：

| Artifact | SHA-256 |
|---|---|
| `dist/extension/content.js` | `89941b9c4282b1b6e2b9ff98e91361417814248a2c818c10cac05146d6a3e818` |
| `dist/threads_block_tool.user.js` | `5c8676138b73e4649bbbbac3da8d8c9df069124a429c62cec208d091569d5edf` |
| `dist/extension/manifest.json` | `ca94ae83e2ceec98a66d7af76ec752fbb8cabf59b7648c0d037957e9a3c3708b` |
| `dist/extension.zip` | `c99d369b35c73511b61606aec98af6b178e1c6edb863a1e89ea6f0d0ee39cea9` |
| `dist/threads_blocker_chrome.zip` | `c99d369b35c73511b61606aec98af6b178e1c6edb863a1e89ea6f0d0ee39cea9` |
| `dist/threads_blocker_chrome_v2.7.4.58.zip` | `c99d369b35c73511b61606aec98af6b178e1c6edb863a1e89ea6f0d0ee39cea9` |
| `dist/threads_blocker_firefox.xpi` | `ec3196fbf9bd27e88584e6678ff8782cbab0e8c53a1679b5a1ee64bfc1bcbbc8` |

Extension manifest is `2.7.4.58`; all three Chrome ZIPs contain the same manifest/content hashes, and the userscript runtime is byte-identical to extension `content.js`.

## Live / release boundary

本輪不操作使用者瀏覽器，不以 fixture、build 或測試代替 Threads live/installed truth；未 deploy Worker/D1/R2、未上傳商店、未 push 發布分支、未發布正式版。仍需使用者在 beta58 實機重跑 clean-list Likes 與 post-reservoir，確認 sanitized diagnostics 後再判讀 live 結果。
