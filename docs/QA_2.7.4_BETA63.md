# QA 2.7.4-beta63

## 目的與範圍

Beta63 只修 verified Likes 的 post-owner policy split：clean-list／清理名單不再把已經被 verified Likes context 識別出的 post owner 當 eligibility skip；post-reservoir／定點絕仍依 Phase 2 SDD 排除 post owner。trusted self 與 reply target 仍在 clean-list 排除；Quotes、unverified、follower 與 Likes readiness 失敗路徑維持 fail-closed。沒有新增 selector、門檻或 diagnostics 欄位。

## Policy contract

- `Core.buildSkipUsers(ctx, { skipPostOwner })` 與 `Core.getSkipUserBreakdown(ctx, usernames, { skipPostOwner })` 共用 owner flag，default 保留 owner skip。
- `Core.collectFullDialogUsers()` 在 verified Likes clean-list 且呼叫端未明確指定時使用 `skipPostOwner=false`；其 rows／settlement diagnostics 同一 policy，因此 owner-only Likes 會得到 eligible 1、owner skipped 0。
- `SweepDriver.collectBatch()` 的 collector、rows diagnostics 與 fallback `collectFullDialogUsers()` 都明確使用 `skipPostOwner=true`；owner-only reservoir batch 不 enqueue。
- self/reply skip 與 unverified／Quotes fail-closed contract 未改變。

## Test evidence

- Beta63 executable production-path fixture：`node --test tests/beta63-owner-policy.test.mjs` — **4/4 passed**：clean-list owner accepted (`complete=true`, `reason=end`, users includes owner, eligible=1/ownerSkipped=0 diagnostics); reservoir owner excluded with empty queue; clean-list self/reply remain skipped; Quotes and unverified remain fail-closed. The pre-fix red run showed only the clean-list owner case failing; reservoir/self-reply/Quotes-unverified remained green.
- Targeted regression（beta52 boundary、beta54 UI/route、beta55 diagnostics/follower、beta56 lifecycle、beta57 adversarial/diagnostics、beta58 verified Likes、beta59 live fix、beta60 fallback、beta61 raw-observed、beta62 aggregate diagnostics、beta63 owner policy）：**70/70 passed**。
- Privacy/stable gate（beta55、beta57、beta60、beta61、beta62、beta63）：**30/30 passed**；no account identifiers or new diagnostics fields were added。
- Full `node --test tests/*.test.mjs`：**144/144 passed**, 0 failed, 0 skipped。
- Syntax：`node --check` on all `src/*.js`, `src/features/*.js`, `dist/extension/content.js`, `dist/threads_block_tool.user.js` — passed。
- Build parity：`node --test tests/beta49-build-parity.test.mjs` — **1/1 passed**。
- `git diff --check` — passed。

## Build / artifact parity

Command: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` (runtime version `2.7.4-beta63`, Chrome store version `2.7.4.63`).

| Artifact | SHA-256 |
|---|---|
| `dist/extension/content.js` | `b21500316117cafd41e0471fcfcc79253e62790a28701162159142b4c463f5bd` |
| `dist/threads_block_tool.user.js` | `04002a2ab3598ee88f8dae2f2268a63f93b774bcfaf3e357ee22e7115aabb905` |
| `dist/extension/manifest.json` | `b22c676ad3176bba3dd0a2b74eb024ba39c511f51c1e80ba37efa30608ecb86b` |
| `dist/extension.zip` | `f222f3c82082524768c4b2d293250d863a5bf9f504c133bcce8f282d5ee42329` |
| `dist/threads_blocker_chrome.zip` | `f222f3c82082524768c4b2d293250d863a5bf9f504c133bcce8f282d5ee42329` |
| `dist/threads_blocker_chrome_v2.7.4.63.zip` | `f222f3c82082524768c4b2d293250d863a5bf9f504c133bcce8f282d5ee42329` |
| `dist/threads_blocker_firefox.xpi` | `4e322add7f425862ed38dd6663d23f4f843fe8b201e236b4e797c3171ac22ebf` |

Read-only parity checks passed: embedded `manifest.json` and `content.js` hashes match the direct files; all three Chrome ZIPs are byte-identical; manifest version is `2.7.4.63`; userscript metadata/runtime version is `2.7.4-beta63`. Firefox XPI is intentionally distinct from Chrome ZIPs; userscript and extension content files differ by the userscript metadata wrapper.

## Live / release boundary

本輪未操作使用者 live/installed browser；headless executable fixtures 只驗證本機 production module contract，不代替 Threads live truth，未宣稱 beta63 live PASS。未 deploy Worker/D1/R2、未上傳商店、未 push 發布分支、未發布正式版。下一步由使用者在 beta63 實機只重跑一次 verified Likes clean-list（post owner 在 Likes 中的案例），確認實機結果與 diagnostics，再決定後續 release review。
