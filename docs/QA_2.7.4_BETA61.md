# QA 2.7.4-beta61

## 目的與範圍

Beta61 修正 verified Likes exact-anchor collector 先套 owner/self/reply skip、導致頁面只含被排除帳號時誤判 `rows_missing` 的 regression。Collector 現在先保存 readiness-gated、top live Likes context 內的 raw observed exact anchors 與 valid evidence；clean-list／post-reservoir 再以 normalized downstream skip 產生 eligible users。這讓 skip-only page 能正常走到 end/empty outcome，同時保留 observed、eligible 與 privacy-safe skip counts 的可區分診斷。Unverified、Quotes、follower、切換失敗與 unknown-row 路徑仍 fail closed／atomic。

## Regression boundary

- Exact `/@username` anchor fallback 仍只在 `waitForLikesContextReady()` 已確認的 verified Likes context 啟用。
- Collector 仍排除 header、navigation、tab、profile-header、nested/background dialog 與 normalized duplicate；owner、trusted self、reply target、queue 等 eligibility skip 不再在 collector 前置過濾。
- `sawVisibleRows` 以 raw observed `batch.visibleRows` 判斷；settlement diagnostics 同時記錄 `rowCandidates`／`validAccountRows`、`eligibleCount` 與 owner/self/reply skip breakdown。

## Test evidence

- Beta61 regression：`node --test tests/beta61-likes-raw-observed.test.mjs` — **4/4 passed**（skip-only raw evidence、normalized dedupe、unverified/Quotes/failure fail-closed、direct production `Core.collectFullDialogUsers` settlement）。
- Executable settlement fixture：verified Likes observed `Owner` with downstream owner skip returned `{ complete: true, ok: true, reason: "end", users: [], visibleRows: 1, validAccountRows: 1, ownerSkippedCount: 1 }`; its real `clean_list` rows diagnostics separated `rowCandidates=1`, `validAccountRows=1`, `eligibleCount=0` from the owner skip count. True zero observed rows returned `{ complete: false, ok: false, reason: "rows_missing", users: [], visibleRows: 0 }`.
- Targeted regression（beta52 boundary、beta54 UI/route、beta55 diagnostics/follower、beta56 lifecycle、beta57 adversarial/diagnostics、beta58 verified Likes、beta59 live fix、beta60 fallback、beta61 contract）：**59/59 passed**。
- Privacy/stable gate（beta55、beta57、beta60、beta61）：**19/19 passed**；敏感欄位仍被 sanitizer 移除。
- Full `node --test tests/*.test.mjs`：**133/133 passed**, 0 failed, 0 skipped。
- Syntax：`node --check` on all `src/*.js`, `src/features/*.js`, `dist/extension/content.js`, `dist/threads_block_tool.user.js` — passed。
- Build parity：`node --test tests/beta49-build-parity.test.mjs` — **1/1 passed**。
- `git diff --check` — passed。

## Build / artifact parity

Command: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` (version `2.7.4-beta61`, Chrome store version `2.7.4.61`).

| Artifact | SHA-256 |
|---|---|
| `dist/extension/content.js` | `18917a92530882a85e18d6db29f3b68be2336ae02788e4d75819f9b555ec0681` |
| `dist/threads_block_tool.user.js` | `0f5e62efe6eb98b3a27db6d7f37414f25e19c97fc9579dae7450133aa9e2b3b5` |
| `dist/extension/manifest.json` | `6d9fe70d121ef741403f6427a4d89665c151b60975916bfe9a39d2c5c9f0aa60` |
| `dist/extension.zip` | `cd5c1edb3038ac811daf3cc0486cba5348aa9f98b8271866e49cfb876c272f5a` |
| `dist/threads_blocker_chrome.zip` | `cd5c1edb3038ac811daf3cc0486cba5348aa9f98b8271866e49cfb876c272f5a` |
| `dist/threads_blocker_chrome_v2.7.4.61.zip` | `cd5c1edb3038ac811daf3cc0486cba5348aa9f98b8271866e49cfb876c272f5a` |
| `dist/threads_blocker_firefox.xpi` | `bb094b47678f2db47dca457fb12f0496d353b702d0e3d132de88ef32f5b8cef6` |

Read-only parity checks passed: embedded `manifest.json` and `content.js` hashes match the direct files; all three Chrome ZIPs are byte-identical; manifest version is `2.7.4.61`; userscript metadata/runtime version is `2.7.4-beta61`. Firefox XPI is intentionally distinct from Chrome ZIPs; userscript and extension content files differ by the userscript metadata wrapper.

The settlement correction changed tests/QA documentation only; no runtime source, version, or artifact rebuild was needed. Direct SHA-256 revalidation after the correction matched the hashes above.

## Live / release boundary

本輪未操作使用者瀏覽器，不以 Playwright fixture、build 或測試代替 Threads live/installed truth；未宣稱 beta61 live pass。未 deploy Worker/D1/R2、未上傳商店、未 push 發布分支、未發布正式版。下一步由使用者在 beta61 實機重跑一次 Likes clean-list（含 skip-only 與正常 eligible rows）及 post-reservoir，並複製 privacy-safe diagnostics 供 live verification。
