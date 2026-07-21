# QA 2.7.4-beta59

## 目的與範圍

Beta59 收口 beta58 live diagnostics 暗示的 clean-list regression：`getMyUsername()` 不再從 activity dialog／feed／一般 header 猜 self；clean-list 與 post-reservoir 共用 `DialogCollector.findScrollableRoot()`；真正 root 的 before/after scroll metrics 與 visible unique progress 用於 bounded end／stall 判斷。Likes row boundary、verified Likes classification、Quotes/Reposts 排除與 atomic rollback 保留。

## Privacy-safe diagnostics

Runtime diagnostics 只接受 bounded counts、geometry、booleans 與 closed enums。Beta59 新增 `selfSkippedCount`、`ownerSkippedCount`、`replySkippedCount`、`scrollAttempt`、`beforeScrollTop`、`afterScrollTop`、`beforeScrollHeight`、`afterScrollHeight`、`atBottom`、`progress`、`rootAdvanced` 與 `strategy`。不保存 username、href、URL/path/query、text、HTML/class、UA、token 或 raw metadata；UI 不顯示內部 reason code。

## Test evidence

- Red-first fixture：`node --test tests/beta59-clean-list-live-fix.test.mjs` 的 reviewer decoy5 raw-link 與 verified-row、readiness token forwarding 紅燈已修正；最終 **10/10 passed**（self scope、shared roots、nested decoy/outer overflow + scroll/new-row collection、verified/unverified row evidence、token forwarding、diagnostics/version、case-normalized skips）。
- Targeted regression（beta52 boundary、beta55 nested scroll/diagnostics、beta56 Likes lifecycle、beta57 adversarial/diagnostics、beta58 verified Likes、beta59 contract）：**35/35 passed**。
- Full `node --test tests/*.test.mjs`：**124/124 passed**, 0 failed, 0 skipped。
- Syntax: `node --check` on all `src/*.js`, `src/features/*.js`, `dist/extension/content.js`, `dist/threads_block_tool.user.js`：passed。
- Privacy/stable gate: beta55/beta57 diagnostics tests and beta59 privacy assertions **20/20 passed**; sensitive fields are dropped.
- `git diff --check`：passed。

## Build / artifact parity

Command: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` (version `2.7.4-beta59`, Chrome store version `2.7.4.59`).

| Artifact | SHA-256 |
|---|---|
| `dist/extension/content.js` | `67b9d3d83598c924bf2546f5f0c0813b30fd5ea7460952f8f3caeb8d90a483f1` |
| `dist/threads_block_tool.user.js` | `f941a36c089cee6c9ac5690dafee87be5163d92f873f23358654946d0ff1bd15` |
| `dist/extension/manifest.json` | `d0d9288c788753bd8c6d64646ecc300a8e3f364943d80dc09483e15aaa136d0f` |
| `dist/extension.zip` | `c2e03bb380c9b0f110c175d350e16934ffcf175f8c4dc01838ff7ace2e6cca91` |
| `dist/threads_blocker_chrome.zip` | `c2e03bb380c9b0f110c175d350e16934ffcf175f8c4dc01838ff7ace2e6cca91` |
| `dist/threads_blocker_chrome_v2.7.4.59.zip` | `c2e03bb380c9b0f110c175d350e16934ffcf175f8c4dc01838ff7ace2e6cca91` |
| `dist/threads_blocker_firefox.xpi` | `a215e22ed842b8b73779a54c6f8efe2e87f836cf2f8caf7c285494017a1913ce` |

Parity checks: all three Chrome ZIPs are byte-identical; each embedded manifest SHA-256 is `d0d9288c788753bd8c6d64646ecc300a8e3f364943d80dc09483e15aaa136d0f`; embedded `content.js` SHA-256 is `67b9d3d83598c924bf2546f5f0c0813b30fd5ea7460952f8f3caeb8d90a483f1`; manifest version is `2.7.4.59`; userscript metadata/runtime version is `2.7.4-beta59`. The userscript and extension content files intentionally differ by userscript metadata wrapper.

## Live / release boundary

本輪未操作使用者瀏覽器，不以 Playwright fixture、build 或測試代替 Threads live/installed truth；未宣稱 beta59 live pass。未 deploy Worker/D1/R2、未上傳商店、未 push 發布分支、未發布正式版。需使用者在 beta59 實機重跑 clean-list Likes 與 post-reservoir，收集 sanitized diagnostics 後再判讀 end／scroll_stall 是否改善。
