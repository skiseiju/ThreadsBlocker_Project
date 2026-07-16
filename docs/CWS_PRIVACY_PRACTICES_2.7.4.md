# Chrome Web Store Privacy Practices — 2.7.4-beta44 填寫稿

> 用途：CWS Developer Dashboard 的 Privacy practices / Data disclosure 逐欄填寫草稿。這不是已提交的商店表單；送審前仍需由發布者確認實際商店欄位與目前 artifact。

## Product and policy

- Product: 留友封 ThreadsBlocker
- Candidate: `2.7.4-beta44`
- Privacy policy URL: `https://threadsblocker.skiseiju.com/privacy/`
- Data controller / developer: `skiseiju`
- Chrome permissions intentionally not requested: `cookies`, `history`, `tabs`, `webRequest`, `declarativeNetRequest`, `scripting`
- Credentials opt-in policy: `credentials-processing-v1` (independent from platform upload consent)
- Platform upload consent policy: `platform-sync-v3`

## CWS data categories

| CWS category | Declare | What is processed | When / purpose | Sent off-device? |
|---|---:|---|---|---:|
| Authentication information | Yes | After explicit `credentials-processing-v1` opt-in only: Threads same-site request token fields such as `fb_dtsg`, `lsd`, `jazoest`, `__user`; the browser may attach same-site session cookies to a request sent to Threads itself. Passwords and 2FA codes are not requested. | Local accelerated three-no profile metadata lookup on Threads. Without consent the page bridge is fail-closed and does not scan document state, patch fetch/XHR, or process request body/token data. | No, not to ThreadsBlocker, the observatory, bug reports, or diagnostics. |
| Website content | Yes | Public Threads page content used by the visible blocking/reporting UI, source post URLs, public text snippets, public profile links, and local source evidence. | Provide blocking, reporting, source analysis, and optional platform upload. | Optional: platform upload only after `platform-sync-v3`; bug report only after the per-report diagnostic checkbox. |
| User activity | Yes | Block/report selections, queue and worker summaries, operation paths, scan status, timestamps, and diagnostic logs attached to a user-initiated report. | Execute and explain user-requested blocking/reporting, retry failures, and diagnose problems. | Optional: bug report after one-time attachment consent; aggregate platform upload after `platform-sync-v3`. |
| Personal information | Yes | Public account identifiers/profile URLs, source post URLs/text, user-entered problem description, pseudonymous local `clientSourceId`, and request metadata such as IP/User-Agent may be processed by infrastructure. | User-visible blocking/reporting, aggregate observatory statistics, deduplication, abuse prevention, support, and product improvement. | Optional and scope-gated; authentication information is excluded from uploads and reports. |
| Web history | Yes | Current page URL/title and source URLs can appear in local diagnostics or a user-approved bug report. The extension does not use the Chrome History API or read browsing history. | Identify the page and reproduce a user-reported problem; source analysis uses the Threads pages the user is interacting with. | Optional: only with the per-report diagnostic consent for a bug report; platform upload is separately consented and does not receive browser history. |
| Location | Yes, if retained by infrastructure | No GPS or precise device location. A request may expose IP address to HTTPS infrastructure; timezone/locale may be included in client metadata or aggregate upload context. | Security, rate limiting, localization, time-bucket interpretation, and service operations. | Yes, to the relevant HTTPS infrastructure when a request is made. |

## Consent and safety statements

- Credentials processing is opt-in, versioned, independent, and default-off. Refusal keeps the general UI and three-dot fallback available.
- A platform upload is blocked until the stored consent version exactly equals `platform-sync-v3`; old `v2` or numeric consent is not migrated to `v3`.
- Bug report diagnostics are listed before submission. The checkbox is intentionally unchecked by default; no consent means no report request.
- Before a bug report payload is sent, request token, cookie, authorization, and authorization-canary values are scrubbed.
- Public overview GET is read-only. Candidate review queues are produced only by ingest/admin refresh paths, never by the public GET.
- Public sample publication defaults to `description`. `reviewed_text` requires exact legal policy-version matching plus threshold, de-identification, and human approval; pending and rejected rows never enter public JSON.

## Suggested CWS answers

- Does the extension collect or transmit user data? `Yes` — describe the optional categories above.
- Is authentication information collected? `Yes, local processing only after explicit opt-in; not transmitted to the developer.`
- Is data sold or used for advertising? `No.`
- Is data used for unrelated purposes? `No.`
- Is data transferred to a third party? `Yes, only optional user-requested uploads/reports to the disclosed service infrastructure; not credentials.`
- Is a privacy policy provided? `Yes` — use the URL above.

## Final pre-submission checks

- Confirm the CWS form category labels match the current dashboard wording.
- Confirm `dist/extension.zip` is the only package used for submission.
- Confirm the privacy page, listing draft, README, consent modal, and artifact all describe the same beta candidate.
- This candidate has not been published or submitted by this work session.
