# QA 2.7.4-beta57

## 目的與範圍

Beta57 延續 beta56 的 live-derived Likes clean-list root-cause 修正：23→2 candidate refresh、selected=false、無 heart evidence 時仍以 bounded semantic readiness 判斷，post-reservoir 共用同一 helper，完整結果才 atomic commit。

本版把既有 `RuntimeDiagnostics` 擴成全流程 observability，沒有另造 logger：

| Feature | 主要 lifecycle coverage |
|---|---|
| blocking | queue start/dequeue/finish/stop、navigation category/strategy、menu/action/confirm、private/protected/not-found/already-blocked、retry/failure/breaker/cooldown/user stop |
| report | open/submit、menu/action/confirm、retry/failure、diagnostics attached/fallback、HTTP 2xx/4xx/5xx/network bucket |
| selection/panel | eligibility/rejection counts、snapshot/restore/commit/rollback、flicker latch、panel/chip create/hide/show/reposition/clamp、idle/active/stop visibility |
| three_no | launch/precondition、window/worker ready/attach/close、scroll/progress/candidate/filter/queue counts、request/ack/timeout/error/end |
| clean/follower/reservoir | beta55/56 semantic readiness、bounded follower scroll、three-no collection、clean-list and reservoir start/progress/stop/commit/rollback |
| runtime | config/version gate、sanitized global error、report HTTP status bucket |

每個 operation 共用 operationId；export 只有 allowlist-normalized fields、bounded timing/counts/geometry、boolean/category/strategy/reason，並附 feature summary。ring 上限 200；terminal entries 優先保留，clear 後可建立新 operation。

## Privacy / stable gate

禁止帳號、訊息／貼文／個資文字、href／完整 URL/path/ID/query、HTML/class dump、UA/IP/hwid/signature/raw metadata。`CONFIG.ENABLE_BETA_DIAGNOSTICS === true` 且版本為 beta 時才啟用；stable/release 為 0 entries、0 diagnostics observers/UI/payload attachment。

## Final verification

- `node --test tests/beta57-diagnostics.test.mjs`：4/4 passed。
- `node --test tests/beta57-operation-lifecycle.test.mjs`：2/2 passed（實際 selection/clean-list helper 與 Reporter 三 HTTP bucket）。
- `node --test tests/beta57-panel-lifecycle.test.mjs`：1/1 passed（實際 panel destroy terminal close）。
- targeted beta55/beta56/three-no/report timing：22/22 passed；修正後 diagnostics/lifecycle smoke：16/16 passed。
- full `node --test tests/*.test.mjs`：**108/108 passed**, 0 failed, 0 skipped；新增 `beta57-adversarial.test.mjs` 與 `beta57-final-blockers.test.mjs`，覆蓋 network reject、collector exception、stable consent/export、owner/legacy stop、retry/failure/breaker/cooldown terminal sequence。
- privacy allowlist/fuzz contracts：beta55/beta57 sanitizer、stable gate、copy/export 與 attachment fallback 全部 passed。
- `node --check`：所有 `src/*.js`、`src/features/*.js` 與產出 userscript/extension JS passed。
- `git diff --check`：passed。

## Reviewer blocker coverage matrix

| Feature | begin | state / branch evidence | terminal | operationId assertion |
|---|---|---|---|---|
| panel | `UI.createPanel` mount | hide/show, suppression, reposition, clamp, route | wrapped `remove` / `destroyPanel` close | shared panel dataset id |
| selection | checkbox injection / selection transaction | eligible/rejected, snapshot, restore, flicker latch, stop | commit / rollback | explicit `operationId` on records |
| clean-list | `handleCleanList` caller or collector fallback | wait/tab/dialog/rows/commit/rollback/stop/error | commit / rollback / terminal | caller id passed through options |
| blocking | `Worker.init` | navigation/menu/action/confirm/retry/cooldown/breaker/failure | finish / stop / error | Worker operation id |
| report | `ReportDriver.processNext` | root/navigation/menu/action/confirm/retry/failure | finish / terminal | ReportDriver operation id |
| three_no | launcher `startManualScan` | worker/window, progress/scroll/request, stop/ack, close | finish / stop / error | persisted non-sensitive state id |
| runtime | config / global error / HTTP | status and HTTP bucket | error / terminal | explicit or owned operation |

All new lifecycle fields remain allowlist-normalized; no handle, text, href/url/path/id/query, HTML/class, UA/IP/hwid/signature/raw metadata is written to runtime diagnostics.

## Direct fixes in final audit

- Report attachment 4xx fallback now emits a privacy-safe runtime HTTP entry with `diagnosticsFallback: true` and the fallback response status; message-only retry behavior is unchanged.
- Disabling the beta diagnostics flag now also clears any in-memory operation map, in addition to entries/coalesce state and observers.

## Build / parity

Command: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump` — completed; Safari deployment skipped as requested.

- Source/UserScript: `2.7.4-beta57`
- Extension manifest: `2.7.4.57`, beta background helper present
- `dist/extension/content.js`: `0672d10964266df165b5ec7350a2193ca8252773eb6723d18321fbdcc42ac713`
- `dist/threads_block_tool.user.js`: `9a4d55060c6c8a6671da7a80faf73d0bd80ff556b5eca35f060d5f44f57d24e2`
- `dist/extension/manifest.json`: `28a9d485ff7608aa441fee7c44db148d2f81eb8f8830abb35acded543c556158`
- `dist/extension.zip`: `eda3f0207eb1f208b3f0b915a1971bb28c94c4b1181e5d74298c0ad644fcd5df`
- `dist/threads_blocker_chrome.zip`: `eda3f0207eb1f208b3f0b915a1971bb28c94c4b1181e5d74298c0ad644fcd5df`
- `dist/threads_blocker_chrome_v2.7.4.57.zip`: `eda3f0207eb1f208b3f0b915a1971bb28c94c4b1181e5d74298c0ad644fcd5df`

All three Chrome ZIPs contain manifest `2.7.4.57`; their extracted `content.js` and `manifest.json` hashes match `dist/extension`, and the userscript runtime section is byte-identical to extension `content.js`.

## Live evidence boundary

本輪未操作 Chrome/Edge、未使用 temporary browser 冒充 installed truth；fixture/mock 只驗 contract，不能取代真實 Threads branch log。beta57 仍需使用者在實機跑 blocking/report、three-no、clean/follower/reservoir 與 bug report flow，複製 sanitized diagnostics 再判讀 root cause。

## Release boundary

本輪不 stage/commit、不 deploy Worker/D1/R2、不上傳商店、不 push 發布分支。Version/artifact parity 已由本次 build 驗證；storage migration、rollback reference 與 installed/live Threads truth 仍需人工／release gate，不能以本機測試或 build 宣稱 live PASS。
