# QA 2.7.4-beta62

## 目的與範圍

Beta62 只補 verified Likes exact-anchor 的 aggregate diagnostics，不改 collector 的收集、排除、skip、settlement、queue 或 atomic commit 決策。每個 exact `/@...` anchor batch 產生可平衡、無帳號值的數字證據，讓 readiness 的候選數、collector 的 accepted/duplicate/excluded 分類，以及 clean-list／post-reservoir 的 rows 與 `anchor_filter` stage 可以互相核對。

## Aggregate contract

- `exactLinkCount` 是本批 query 到的 exact-prefix anchor 數，包含 malformed href。
- `uniqueExactAccountCount` 是合法 exact href 的 normalized distinct account 數；invalid href 不會被算入此欄位。
- `duplicateExactLinkCount` 是在既有 accepted ordering 下被 normalized dedupe 的 link 數；`acceptedUniqueAccountCount` 是 collector 接受的 unique link 數。
- `excludedInvalidCount`、`excludedInvisibleCount`、`excludedOutOfBoundsCount`、`excludedHeadingHeaderCount`、`excludedNavigationCount`、`excludedNestedDialogCount` 是各排除 bucket。
- `classifiedLinkCount = acceptedUniqueAccountCount + duplicateExactLinkCount + sum(excluded*)`；`unclassifiedLinkCount = max(0, exactLinkCount - classifiedLinkCount)`。Beta62 fixtures 要求每個已知 matrix 都能平衡，且不把 username／href 寫入 diagnostics。
- Readiness 保留既有 `candidateCount`（合法 exact links 的 raw count）與 `rowCount`（inventory rows，無 rows 時 fallback 到 links），另加 `uniqueCandidateCount`；這些是 readiness snapshot 的觀測欄位，不改 readiness gate。

## Wiring / privacy boundary

Clean-list emits the numeric aggregate on both `anchor_filter` and `rows`; post-reservoir emits the same aggregate on `reservoir` `anchor_filter` and `rows`. RuntimeDiagnostics sanitizer allowlists only bounded integer fields and `classificationStrategy`; unknown fields are dropped. No username, href, URL/path/query, text, DOM/HTML/class, user-agent, IP, hwid, signature, or raw metadata is accepted.

## Test evidence

- Beta62 fixture：`node --test tests/beta62-anchor-diagnostics.test.mjs` — **7/7 passed**（same-account duplicate、per-reason exclusion matrix、two normal unique accounts、readiness uniqueness、sanitizer/privacy、executable Core clean-list wiring、executable production `SweepDriver.collectBatch` reservoir wiring）。
- Targeted regression（beta52 boundary、beta54 UI/route、beta55 diagnostics/follower、beta56 lifecycle、beta57 adversarial/diagnostics、beta58 verified Likes、beta59 live fix、beta60 fallback、beta61 raw-observed、beta62）：**66/66 passed**。
- Privacy/stable gate（beta55、beta57、beta60、beta61、beta62）：**26/26 passed**；aggregate fields remain allowlisted and sensitive values are removed.
- Full `node --test tests/*.test.mjs`：**140/140 passed**, 0 failed, 0 skipped。
- Syntax：`node --check` on all `src/*.js`, `src/features/*.js`, `dist/extension/content.js`, `dist/threads_block_tool.user.js` — passed。
- Build parity：`node --test tests/beta49-build-parity.test.mjs` — **1/1 passed**。
- `git diff --check` — passed。

## Build / artifact parity

Command: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` (runtime version `2.7.4-beta62`, Chrome store version `2.7.4.62`).

| Artifact | SHA-256 |
|---|---|
| `dist/extension/content.js` | `5566d8088e2c9f61eaf9a2f43300ad6a1d1e11b8e38f4df144fd390ff9547e1c` |
| `dist/threads_block_tool.user.js` | `ba098c24dd0c5357a3352128684cb38664032bac3dacfc3a99a4cd71deb38314` |
| `dist/extension/manifest.json` | `002af9d4149d38da03a3f6163e045278e4c9edefcabfe8139d2246e96143bf48` |
| `dist/extension.zip` | `05d99a862b9f273dc4f0bcde3d8829451a8a6f3200edc3475754efa60af64388` |
| `dist/threads_blocker_chrome.zip` | `05d99a862b9f273dc4f0bcde3d8829451a8a6f3200edc3475754efa60af64388` |
| `dist/threads_blocker_chrome_v2.7.4.62.zip` | `05d99a862b9f273dc4f0bcde3d8829451a8a6f3200edc3475754efa60af64388` |
| `dist/threads_blocker_firefox.xpi` | `a51ed5569fed09e7034742cbd8b078b6b4037858d01d9dd1508b34b1a0cab562` |

Read-only parity checks passed: embedded `manifest.json` and `content.js` hashes match the direct files; all three Chrome ZIPs are byte-identical; manifest version is `2.7.4.62`; userscript metadata/runtime version is `2.7.4-beta62`. Firefox XPI is intentionally distinct from Chrome ZIPs; userscript and extension content files differ by the userscript metadata wrapper. The executable reservoir fixture is test-only; no runtime source or artifact changed, and the hashes above were revalidated after the fixture correction.

## Live / release boundary

本輪未操作使用者瀏覽器；本地 headless module fixture 僅執行 production `SweepDriver.collectBatch` contract，不代替 Threads live/installed truth，未宣稱 beta62 live/installed PASS。未 deploy Worker/D1/R2、未上傳商店、未 push 發布分支、未發布正式版。下一步由使用者在 beta62 實機重跑一次 Likes clean-list（正常、duplicate、filtered/skip-only）及 post-reservoir，確認 `anchor_filter` 與 `rows` aggregate 可對應，再決定是否進行後續 release review。
