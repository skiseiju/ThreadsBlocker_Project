# QA 2.7.4 Beta54

## Scope and contracts

- Follower confirmation uses plain-language coverage and failure messages. Normal UI does not expose `threads_partial`, bounded-cap wording, or internal reason codes; bounded diagnostics may retain those codes. A 175/96/16/80-style result explicitly says that only 96 are loaded, 16 were added, 80 were already listed, and about 79 remain unloaded; it is not reported as complete.
- Likes collection accepts an already-selected Likes context, waits for successful tab-switch evidence and delayed rendering, and commits once only after a complete result. Incomplete/partial results create zero new pending/checked side effects and preserve existing pending; actual failures rollback and use warning/error (non-green) copy.
- Idle status is shown as `待命中`; stop is hidden with no active queue/session and remains latched through active transitions. Existing stop-latch and running checkbox snapshot contracts are covered by beta52 regressions.
- Reviewer blocker fixed: message/chat hiding now requires `routeMatch && real message shell`; text-only `/messages` content is not enough, and ordinary profile/normal routes are not hidden. Pending selections are preserved. Returning to a normal SPA route reattaches/re-measures; only stale or out-of-bounds positions are clamped, and resize remains inside the viewport.

## Automated verification

- Targeted beta54: **9/9 passed** — `node --test tests/beta54-*.test.mjs`.
- Full beta47–54 suite: **77/77 passed**, 0 failed, 0 skipped — `node --test tests/*.test.mjs`.
- Syntax: `node --check` passed for every `src/**/*.js` file.
- `git diff --check`: passed.
- Build: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` completed; version/hash/archive parity checked for source, userscript, manifest, `dist/extension.zip`, and three Chrome zips. See artifact hashes below.

## Live/manual boundary

This run did not operate Chrome or Edge and does not claim live, installed-extension, CWS, Safari, Firefox, or other browser PASS. Manual verification remains required for real Threads follower dialogs (including 175/96/16/80 delayed loading), Likes delayed render and rollback, idle/stop/checkbox transitions, and message/chat SPA navigation/resize. No deploy, store upload, publish, stage, commit, or D1 action was performed.

## Artifacts

The final paths and SHA-256 values below are recorded from the beta54 build and its parity check:

- `dist/extension.zip`
- `dist/threads_blocker_chrome.zip`
- `dist/threads_blocker_chrome_v2.7.4.54.zip`
- `dist/threads_block_tool.user.js`
- `dist/extension/manifest.json` (`2.7.4.54`)

SHA-256 parity evidence:

- `dist/extension/content.js`: `38f651949ba99f657e3bd29dda3fdce6074f6c00886f2111863af20042d5b9b6`
- `dist/threads_block_tool.user.js`: `8aa488eb8e83bef0a607777e3d7925ed752f32edd01ca5ea99acf4769838996f`
- `dist/extension/manifest.json`: `73024b8ace74fff8e132a644bf7e83d47e0ce93c326d922553e6c32e1771218f`
- `dist/extension.zip`: `68820a8d43026e3b725489b9851dc85d87ccb1c6254f66a8a4b7af0ec4fd957c`
- `dist/threads_blocker_chrome.zip`: same archive hash as `dist/extension.zip`
- `dist/threads_blocker_chrome_v2.7.4.54.zip`: same archive hash as `dist/extension.zip`
- `content.js` extracted from all three Chrome zips: same hash as `dist/extension/content.js`
- `background.js`, `page-bridge.js`, and `content.js` pass `node --check` both in `dist/extension` and when extracted from all three archives.
