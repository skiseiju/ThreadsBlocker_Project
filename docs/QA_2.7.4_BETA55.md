# QA 2.7.4-beta55

## 目的

Beta55 第一輪 live 的首要目的，是取得可重現的 stage-level branch log。沒有真實 branch log 前，不宣稱 Likes clean-list 或 message/chat route root cause 已修好；follower 的 premature-stall 修正也必須用 log 驗證。

## Beta-only diagnostics

- `CONFIG.ENABLE_BETA_DIAGNOSTICS` 與 beta channel 同時成立時才啟用；資料只留 session memory，ring 上限 200。
- 每筆只有 session id、時間／相對耗時、feature/stage 與 allowlist-normalized fields：計數、布林 detector、策略、scroll 數字、bounded rect、狀態／停止原因。
- 禁止帳號／handle、訊息／貼文／個人檔案文字、完整 URL/query/ID、HTML/class dump、hwid/signature/IP/user-agent。
- Beta UI failure/status panel 提供「複製診斷資料」及「清除診斷資料」；copy 前再次 schema sanitizer。
- Stable/release checklist：flag 關閉、ring 不建立／不累積、無 observer／copy UI、bug report 不附 runtime diagnostics。
- Attachment fallback：若現有 bug-report endpoint 以 4xx 拒絕 sanitized diagnostics，會在同 endpoint 重送 message-only payload；不修改 backend。

## Automated verification

- Beta55 targeted: **10/10 passed** — `node --test tests/beta55-*.test.mjs`.
- Full beta47–55 regression: **87/87 passed**, 0 failed, 0 skipped — `node --test tests/*.test.mjs`.
- Privacy tests include 200-entry ring cap/clear, injected sensitive-field rejection, stable disabled path, copy/export gating, and attachment 4xx downgrade.
- `node --check` passed for every `src/**/*.js`; `git diff --check` passed.

## Targeted checks

1. Follower: initial 0 rows 後延遲 render、nested scroll root、virtualized/recycled rows、lazy delay、bounce/retry、server stall、timeout/stop；檢查 totalHint、每輪 scroll 數值、unique delta、stop reason。
2. Clean Likes: operation/tab/context/row/commit/rollback logs；第三方 extension 關閉後仍相同 FAIL，故不得歸因 extension。尚無 live branch log 前保留為待定位。
3. Message route: split-view signal matrix、history/mutation trigger、hide/show/reposition/clamp logs；text-only `Messages` 不得成立。
   Route-unchanged overlay 只有在 visible conversation list + active pane、composer/action 同 active pane，且兩 pane 共享相鄰 layout ancestor 時才成立；detached/hidden/global signal 不得拼成 message context。
4. Privacy: ring cap/clear/new session、sensitive injection sanitizer、stable disabled、copy/export schema。

## Live evidence policy

Beta55 live 測試時先使用「複製診斷資料」提供 sanitized payload，再依 stage log 定位 selector/DOM branch。測試 fixture 只能驗 contract，不能替代 live root-cause 證據。

本輪未操作 Chrome/Edge，未宣稱 Likes、message route 或 follower live fixed；第三方 extension 關閉後的 clean-list reproduction 也未以本機 fixture 冒充 live PASS。使用者仍需實機跑一次並複製 diagnostics。

## Build/parity artifacts

Build command: `SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump`.

- Source: `2.7.4-beta55`; manifest: `2.7.4.55`.
- `dist/extension.zip`, `dist/threads_blocker_chrome.zip`, and `dist/threads_blocker_chrome_v2.7.4.55.zip` are rebuilt together; content hashes and archive hashes are recorded after build below.

SHA-256:

- `dist/extension/content.js`: `12de221298d987ebd83db2142ffa56c314fdd6829ec2fc12bd3741e37d2be264`
- `dist/threads_block_tool.user.js`: `72a67a0fe5053f4ad244871f8015dd03237a0f9236801ebdd6ffcaf149581dfa`
- `dist/extension/manifest.json`: `b8bf15094b23dc48b4422d6884fab879a3e847f8f9b2dc6a8b16ee097391d4c8`
- all three Chrome ZIPs: `78499d935456d4cfae1c287659615e4e9b3313c2036c93b914b243b974750a95`
- `content.js` extracted from all three Chrome ZIPs matches the dist content hash above; archive JS syntax passed for `content.js`, `background.js`, and `page-bridge.js`.
