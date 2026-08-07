# ADR 0014：授權台帳與自動寄信沿用 Apps Script

- 日期：2026-08-07
- 狀態：已採納（Sandbox 已部署，production 尚未部署）
- 相關：[ADR 0011](0011-bug-report-sheet-sync.md)（Google Apps Script、試算表與獨立 Script Property 的既有邊界）、`license_apps_script/Code.gs`、`docs/SDD_3.0_LICENSE_SERVICE.md`

## 背景

ThreadsBlocker 3.0 將導入 Pro 會員。既有產品決策是以 Email Magic Link／一次性驗證碼登入，每個帳號最多啟用三台裝置；3.0 上線前曾 Donate 的使用者則取得永久 Pro「創始支持者」資格。

PlugnGO 已有一套 Google Apps Script 授權建立流程，包含付款冪等、序號產生、寄送授權信、寄信失敗後重試與 Gmail alias fallback。ThreadsBlocker 需要相同的營運能力，但不能照搬 PlugnGO 的單一 HWID 與「使用者手動輸入序號」模型。

## 選項

- A：完全照搬 PlugnGO，讓使用者收到並輸入序號。
- B：沿用 Apps Script 的發證／寄信骨架，但 LicenseKey 只作後台識別，使用者仍以 Email 登入。
- C：立即把授權、寄信與付款資料全部改做 Cloudflare Worker＋D1。

## 決定

採用 B。

- Google Sheet 是初期營運台帳，`Licenses` 管授權與付款來源，`Devices` 一台裝置一列。
- `create_license` 只接受獨立的 `THREADSBLOCKER_ADMIN_SECRET`，不得共用問題回報或平台管理 token。
- 訂閱付款以 `PaymentProvider + PaymentId` 去重；創始支持者與贈送授權以 `Email + EntitlementType` 去重。
- 成功建立授權後自動寄信；若寄信失敗，保留空白 `EmailSentAt`，相同請求重送時只補寄、不建立第二筆授權。
- LicenseKey 使用 `TBK-XXXX-XXXX-XXXX`，只供後端與客服追蹤；Email 文案不揭露序號，也不要求使用者輸入序號。
- 裝置上限固定最多 3，不沿用 PlugnGO 單一 `BoundHWID` 欄位。
- 本次只交付版控原始碼與測試；Google Apps Script 部署、Script Properties、付款 webhook 與正式寄信需另行取得 production 授權。

## 後果

- 可以直接沿用 PlugnGO 已驗證的付款冪等與 Email retry 模式，縮短 3.0 前置時間。
- 台帳含 Email 與付款識別，必須限制存取並避免把資料輸出到 log、文件或測試 fixture。
- Google Sheets 適合初期少量會員營運，但不是長期高併發授權資料庫；正式啟用 Magic Link、裝置管理與憑證簽發前，仍需完成 Cloudflare 授權 API。
- Apps Script 每日寄信配額仍是營運上限；早鳥大量付款前必須驗證配額與失敗告警。
