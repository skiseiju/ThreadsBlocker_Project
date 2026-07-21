# QA 2.7.4-beta60

## 目的與範圍

Beta60 修正 verified Likes tab live refresh（23→2）後，Threads 只渲染 exact `/@user` anchors、沒有 synthetic row／Follow／heart shape 時被 strict row gate 誤判 `rows_unknown` 的 regression。只有 `waitForLikesContextReady()` 已確認 Likes context 後，clean-list 與 post-reservoir 才可在該 top live dialog/context 收集 visible exact profile anchors；Quotes、unverified、follower 與切換失敗路徑維持 fail closed。

## Fallback boundary

Fallback 只接受 exact `/@username` profile anchors，並以 top live Likes context 為內容邊界；排除 header、navigation、tab、post owner、trusted self、reply target，並以 normalized username 去重。未經 readiness gate 不會啟用；不改 global/unverified/Quotes/follower collector。

## Test evidence

- Red-first beta60 fixture：`node --test tests/beta60-likes-anchor-fallback.test.mjs` initially failed the 23→2 recovery, exclusion path and shared-call contract; final **5/5 passed**（plain exact anchors without row markers, owner/self/reply exclusion + dedupe, Quotes/unverified fail-closed, failed-switch fail-closed, clean-list/reservoir shared behavior）。
- Targeted regression（beta52 boundary、beta54 UI/route、beta55 diagnostics/follower、beta56 Likes lifecycle、beta57 adversarial/diagnostics、beta58 verified Likes、beta59 live fix、beta60 contract）：**55/55 passed**。
- Full `node --test tests/*.test.mjs`：**129/129 passed**, 0 failed, 0 skipped。
- Privacy/stable gate（beta55、beta57、beta60）：**15/15 passed**；敏感欄位仍被 sanitizer 移除。
- Syntax：`node --check` on all `src/*.js`, `src/features/*.js`, `dist/extension/content.js`, `dist/threads_block_tool.user.js`：passed。
- `git diff --check`：passed。

## Build / artifact parity

Command: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` (version `2.7.4-beta60`, Chrome store version `2.7.4.60`).

| Artifact | SHA-256 |
|---|---|
| `dist/extension/content.js` | `b553b820f31f08eef747b0b52dfc1c5f8dc217a5df6d3124fdb5bf7730d19f6c` |
| `dist/threads_block_tool.user.js` | `b359f63bf0da082496e64336a9dfcdf2cb1f85efe6f759f2901b3c353494f3e0` |
| `dist/extension/manifest.json` | `a043cc407ea1b924f07468187912d342623d6b50338bc4c1a8e549830137a002` |
| `dist/extension.zip` | `51538213c19c5743e383d8275755bea56a7695470d778cf5c88617b5db34af9b` |
| `dist/threads_blocker_chrome.zip` | `51538213c19c5743e383d8275755bea56a7695470d778cf5c88617b5db34af9b` |
| `dist/threads_blocker_chrome_v2.7.4.60.zip` | `51538213c19c5743e383d8275755bea56a7695470d778cf5c88617b5db34af9b` |
| `dist/threads_blocker_firefox.xpi` | `f122518b4b8cd78b1f34b772289a4ae159e1c59dbf17c206b964805c16ee6709` |

Final read-only artifact revalidation: direct `dist/extension/manifest.json` and embedded manifest both hash to `a043cc407ea1b924f07468187912d342623d6b50338bc4c1a8e549830137a002`; direct `dist/extension/content.js` and embedded `content.js` both hash to `b553b820f31f08eef747b0b52dfc1c5f8dc217a5df6d3124fdb5bf7730d19f6c`; all three Chrome ZIPs are byte-identical; manifest version is `2.7.4.60`; userscript metadata/runtime version is `2.7.4-beta60`. Firefox XPI is intentionally distinct from Chrome ZIPs; userscript and extension content files differ by userscript metadata wrapper.

## Live / release boundary

本輪未操作使用者瀏覽器，不以 Playwright fixture、build 或測試代替 Threads live/installed truth；未宣稱 beta60 live pass。未 deploy Worker/D1/R2、未上傳商店、未 push 發布分支、未發布正式版。需使用者在 beta60 實機重跑 Likes clean-list 與 post-reservoir，確認真實 DOM 的 top live context、owner/self/reply 排除與 scroll/end 行為。
