# Chrome Web Store Privacy Practices — 2.8.0 填寫稿

> 用途：CWS Developer Dashboard 的 Privacy practices / Data disclosure 逐欄填寫草稿。這不是已提交的商店表單；送審前仍需由發布者以最終 artifact 核對每一欄。
> 本檔是「留友封商店隱私申報」的唯一來源，版本寫在下方 Candidate 欄，不再用檔名綁版本（2026-07-29 由 `CWS_PRIVACY_PRACTICES_2.8.0.md` 改名）。

## Product and policy

- Product: 留友封 ThreadsBlocker
- Candidate: `2.8.1`（本輪尚未設定正式版號、build 或送審）
- 相對 2.8.0 的申報異動：問題回報新增「輕量技術資訊」層，所有版本一律附帶且不需勾選同意（ADR 0013）。資料類別沒有新增，變的是 User activity 的送出條件。
- Privacy policy URL: `https://threadsblocker.skiseiju.com/privacy/`
- Data controller / developer: `skiseiju`
- Chrome permissions intentionally not requested: `cookies`, `history`, `tabs`, `webRequest`, `declarativeNetRequest`, `scripting`
- Platform upload consent policy: `platform-sync-v4`
- Authentication information: `No`

## CWS data categories

| CWS category | Declare | What is processed | When / purpose | Sent off-device? |
|---|---:|---|---|---:|
| Authentication information | No | 留友封不要求或處理 Threads 密碼、雙因素驗證碼、request token、session cookie、OAuth code 或其他 authentication information。套件不包含擷取 token 的 page bridge，也不會 patch Threads 頁面的 fetch/XHR 來讀取 request body。 | Not applicable. | No. |
| Website content | Yes | 使用者正在互動的 Threads 公開頁面內容、公開帳號/profile 連結、來源貼文 URL、公開文字片段與本機來源證據。 | 提供封鎖、檢舉、三無待審、來源分析，以及使用者同意後的觀測平台統計。 | Optional: only after `platform-sync-v4`; a user-initiated problem report may include content only when the beta diagnostic checkbox is explicitly selected. |
| User activity | Yes | 封鎖/檢舉選擇、佇列與 worker 摘要、操作路徑、掃描狀態、時間與診斷事件。 | 執行與說明使用者要求的功能、重試失敗、診斷問題。 | Yes, in three tiers: (1) platform upload only after `platform-sync-v4`; (2) **a user-initiated problem report always carries a lightweight technical layer** — closed-allowlist counts, booleans and enumerated step/result codes, no account names, no menu or page text, no URLs, no console logs; (3) the full diagnostic attachment only after the per-report checkbox. |
| Personal information | Yes | 公開帳號識別/profile URL、來源貼文 URL/文字、使用者輸入的問題描述、持續性隨機問題回報 ID、匿名 `clientSourceId`，以及 HTTPS 基礎設施可能收到的 IP/User-Agent。 | 使用者可見功能、聚合觀測、去重、防濫用、問題支援與產品改善。 | Optional and trigger/consent-gated as described above. |
| Web history | Yes | 目前頁面 URL/標題與來源 URL 可存在本機來源資料；在提供 beta 診斷時，可由使用者勾選附於該次回報。留友封不使用 Chrome History API，也不讀取完整瀏覽歷史。 | 識別目前功能情境、重現使用者回報、整理使用者正在操作的 Threads 來源。 | Optional: beta diagnostic attachment only after the per-report checkbox; platform upload receives disclosed Threads source URLs, not browser history. |
| Location | Yes, if retained by infrastructure | 不收集 GPS 或精確裝置位置。HTTPS 請求可能向基礎設施揭露 IP 位址；平台或診斷 context 可能包含 timezone/locale。 | 安全、頻率限制、在地化、時間 bucket 解讀與服務維運。 | Yes, as ordinary request metadata when a network request is made. |

## Consent, review, and retention statements

- Platform upload remains blocked until the stored consent version exactly equals `platform-sync-v4`; older `platform-sync-v3`, v2 or numeric consent is not migrated to v4, so previously consenting users must consent again.
- A problem report is sent only after the user presses submit. Without the diagnostic checkbox, the content portion is the user-entered description plus the lightweight technical layer described below; service-required fields still include a persistent random report ID, version, timestamp, type, error code, signature, and ordinary HTTPS request metadata.
- The lightweight technical layer ships on every channel, including stable, and is not behind a checkbox. Its contents are produced by a fixed field allowlist (`RuntimeDiagnostics._safeFields`): bounded integers, booleans, and enumerated feature/stage/reason codes, plus tool version, browser environment and viewport size. It never contains Threads account names, menu or page text, page URLs, browsing history, or console logs. It is disclosed in the report dialog before submission and on the privacy page. Rationale: the 2.8.0 stable channel collected nothing, so a widespread blocking failure produced reports with no diagnosable content at all.
- Because the lightweight layer travels with the persistent random report ID, repeated failures from the same installation can be correlated. That ID is not a name or a Threads account, and the retention and deletion rules below apply to it unchanged.
- The full diagnostic checkbox is unchecked by default and applies once. Before either the lightweight layer or the full attachment is sent, request token, cookie, authorization, and authorization-canary values are scrubbed.
- Beta-only manual debug/export UI (copy diagnostics, clear diagnostics, verbose three-no logging) remains gated on a `-betaN` version and must be absent from the formal artifact. This is a separate gate (`RuntimeDiagnostics.betaDebugUI()`) from lightweight collection (`RuntimeDiagnostics.enabled()`); the two must not be merged back together.
- The fallback Apps Script endpoint stores only the user description and service-required fields plus a flag recording whether an attachment was present. It never stores the lightweight layer or the full attachment.
- Problem report content and its persistent random ID are retained until the issue is handled or the data is no longer needed, then manually deleted by an authorized operator. A user may request deletion earlier. There is no fixed-day automated purge. A non-content handling record may remain, but it must not contain the report content or report ID.
- Problem report content and its persistent random ID are also copied once per day into an internal Google Sheet used only for tracking issue handling. The sheet is restricted to authorized personnel, is never public, and is not used for advertising or sale. A deletion request removes both the D1 record and the sheet row; see `docs/BUG_REPORT_DELETION_RUNBOOK.md`.
- Public overview GET is read-only. Candidate review queues are produced only by ingest/admin refresh paths, never by the public GET.
- Authorized personnel may review uploaded public content, including potentially identifiable raw text, when necessary for abuse detection, data-quality maintenance, or review of reported cases. This access is not described as anonymous or deidentified-only, and is not used for advertising or sale.
- Public sample publication defaults to `description`. `reviewed_text` requires exact legal policy-version matching plus threshold, de-identification, and human approval; pending and rejected rows never enter public JSON.

## Suggested CWS answers

- Does the extension collect or transmit user data? `Yes` — describe the optional and user-triggered categories above.
- Is authentication information collected? `No.`
- Is data sold or used for advertising? `No.`
- Is data used for unrelated purposes? `No.`
- Is data transferred to a third party? `Yes, only to disclosed service infrastructure for user-triggered reports, consented platform uploads, ordinary announcement/update requests, and an internal Google Sheet used solely to track handling of user-submitted problem reports.`
- Is a privacy policy provided? `Yes` — use the URL above.

## Final pre-submission checks

- Confirm the CWS form category labels match the current dashboard wording.
- Confirm the final artifact has no page bridge/interceptor for authentication information, and that beta-only manual debug/export UI is absent (`RuntimeDiagnostics.betaDebugUI()` false on a non-beta version). Lightweight collection stays on by design — do not treat its presence as a defect.
- Confirm `dist/extension.zip` is built from the reviewed source and is the only package used for submission.
- Confirm privacy page, listing, README, CWS answers, manifest, and artifact describe the same behavior, including the three-tier problem-report disclosure.
- Confirm the privacy page discloses the internal problem-report tracking sheet and that the deletion runbook covers both D1 and the sheet.
- This draft does not publish, submit, build, or set the 2.8.0 version.
