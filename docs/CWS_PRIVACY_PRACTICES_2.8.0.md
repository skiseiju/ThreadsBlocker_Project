# Chrome Web Store Privacy Practices — 2.8.0 填寫稿

> 用途：CWS Developer Dashboard 的 Privacy practices / Data disclosure 逐欄填寫草稿。這不是已提交的商店表單；送審前仍需由發布者以最終 2.8.0 artifact 核對每一欄。

## Product and policy

- Product: 留友封 ThreadsBlocker
- Candidate: `2.8.0`（本輪尚未設定正式版號、build 或送審）
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
| User activity | Yes | 封鎖/檢舉選擇、佇列與 worker 摘要、操作路徑、掃描狀態、時間與診斷事件。 | 執行與說明使用者要求的功能、重試失敗、診斷問題。 | Optional: platform upload after `platform-sync-v4`; beta diagnostics only after per-report checkbox consent. |
| Personal information | Yes | 公開帳號識別/profile URL、來源貼文 URL/文字、使用者輸入的問題描述、持續性隨機問題回報 ID、匿名 `clientSourceId`，以及 HTTPS 基礎設施可能收到的 IP/User-Agent。 | 使用者可見功能、聚合觀測、去重、防濫用、問題支援與產品改善。 | Optional and trigger/consent-gated as described above. |
| Web history | Yes | 目前頁面 URL/標題與來源 URL 可存在本機來源資料；在提供 beta 診斷時，可由使用者勾選附於該次回報。留友封不使用 Chrome History API，也不讀取完整瀏覽歷史。 | 識別目前功能情境、重現使用者回報、整理使用者正在操作的 Threads 來源。 | Optional: beta diagnostic attachment only after the per-report checkbox; platform upload receives disclosed Threads source URLs, not browser history. |
| Location | Yes, if retained by infrastructure | 不收集 GPS 或精確裝置位置。HTTPS 請求可能向基礎設施揭露 IP 位址；平台或診斷 context 可能包含 timezone/locale。 | 安全、頻率限制、在地化、時間 bucket 解讀與服務維運。 | Yes, as ordinary request metadata when a network request is made. |

## Consent, review, and retention statements

- Platform upload remains blocked until the stored consent version exactly equals `platform-sync-v4`; older `platform-sync-v3`, v2 or numeric consent is not migrated to v4, so previously consenting users must consent again.
- A problem report is sent only after the user presses submit. Without the beta diagnostic checkbox, the content portion is the user-entered description; service-required fields still include a persistent random report ID, version, timestamp, type, error code, signature, and ordinary HTTPS request metadata.
- The beta diagnostic checkbox is unchecked by default and applies once. Before an attachment is sent, request token, cookie, authorization, and authorization-canary values are scrubbed. The formal 2.8.0 artifact must have beta diagnostics disabled.
- Problem report content and its persistent random ID are retained until the issue is handled or the data is no longer needed, then manually deleted by an authorized operator. A user may request deletion earlier. There is no fixed-day automated purge. A non-content handling record may remain, but it must not contain the report content or report ID.
- Public overview GET is read-only. Candidate review queues are produced only by ingest/admin refresh paths, never by the public GET.
- Authorized personnel may review uploaded public content, including potentially identifiable raw text, when necessary for abuse detection, data-quality maintenance, or review of reported cases. This access is not described as anonymous or deidentified-only, and is not used for advertising or sale.
- Public sample publication defaults to `description`. `reviewed_text` requires exact legal policy-version matching plus threshold, de-identification, and human approval; pending and rejected rows never enter public JSON.

## Suggested CWS answers

- Does the extension collect or transmit user data? `Yes` — describe the optional and user-triggered categories above.
- Is authentication information collected? `No.`
- Is data sold or used for advertising? `No.`
- Is data used for unrelated purposes? `No.`
- Is data transferred to a third party? `Yes, only to disclosed service infrastructure for user-triggered reports, consented platform uploads, and ordinary announcement/update requests.`
- Is a privacy policy provided? `Yes` — use the URL above.

## Final pre-submission checks

- Confirm the CWS form category labels match the current dashboard wording.
- Confirm the final 2.8.0 artifact has no page bridge/interceptor for authentication information and has beta diagnostics disabled.
- Confirm `dist/extension.zip` is built from the reviewed source and is the only package used for submission.
- Confirm privacy page, listing, README, CWS answers, manifest, and artifact describe the same 2.8.0 behavior.
- This draft does not publish, submit, build, or set the 2.8.0 version.
