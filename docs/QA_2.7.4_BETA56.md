# QA 2.7.4-beta56

## Live-derived root cause

Beta55 diagnostics showed a real Likes click followed by candidate count `23 → 2`, live context/list mutation, and two or more stable non-loading observations. Threads exposed neither selected-tab attributes nor per-row heart evidence. The old `waitForLikesRender` therefore returned `likes_tab_switch_failed` before collection. This is a live branch finding, not a fixture assumption; the same result remained after the third-party extension was disabled.

## Beta56 changes

- Likes readiness accepts selected/evidence markers when present, or a clicked Likes tab followed by changed context/root/list signature, identifiable account rows, non-loading state, and two stable observations.
- A no-op click (same context/root/list and no strict evidence) remains fail-closed.
- The post-reservoir path uses the same bounded helper, including live context refresh, non-loading/stability checks, selected-other-view rejection, and an explicit empty-list result for an already-Likes context.
- Existing staged selection, rollback, and atomic commit behavior is retained.
- Runtime diagnostics coalesce identical feature/stage/normalized-field events within one second, retain `repeatCount`, and keep clean-list start/wait/stop/state-change events visible despite message-route noise.

## QA

- Targeted Beta56 lifecycle, privacy/coalesce, Beta54 route, and Beta55 regressions.
- Targeted beta56: **7/7 passed** — `node --test tests/beta56-clean-list-lifecycle.test.mjs`.
- Privacy/diagnostics targeted: **11/11 passed** — closed-schema, data-flow, one-second coalesce, stable-disable, allowlist and attachment fallback contracts.
- Full repository regression: **95/95 passed**, 0 failed, 0 skipped — `node --test tests/*.test.mjs`.
- `node --check` passed for every `src/**/*.js`; `git diff --check` passed.

## Build/parity

- `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` completed for beta56.
- Source/UserScript: `2.7.4-beta56`; manifest: `2.7.4.56`.
- Rebuilt `dist/extension.zip`, `dist/threads_blocker_chrome.zip`, and `dist/threads_blocker_chrome_v2.7.4.56.zip`; final hashes are recorded below.

Artifact SHA-256 (this beta56 build):

- `dist/extension/content.js`: `960bc3a3df439408e19029c65c99444e104c19c09162c40f19bed781a6dde146`
- `dist/threads_block_tool.user.js`: `dd1317a68144ea2daee30125984a3bccee40bf553439abd947263998aa84a196`
- `dist/extension/manifest.json`: `992881487d55e5c1385f578eec12e56d9dc240c925414844b5d5ebdefe6c247c`
- `dist/extension.zip`: `9cc6e59267bdbc29e03445c29aa96b7cac6f5aa20d74a2864c79b6bf997db84f`
- `dist/threads_blocker_chrome.zip`: `9cc6e59267bdbc29e03445c29aa96b7cac6f5aa20d74a2864c79b6bf997db84f`
- `dist/threads_blocker_chrome_v2.7.4.56.zip`: `9cc6e59267bdbc29e03445c29aa96b7cac6f5aa20d74a2864c79b6bf997db84f`
- All three Chrome archives contain manifest `2.7.4.56` and byte-identical `content.js`/`manifest.json`; archived JS passed `node --check`.

Live browser verification is still required: rerun the actual clean-list Likes flow, including the 23→2 sequence, and copy sanitized diagnostics if it still fails. No live PASS is claimed.
