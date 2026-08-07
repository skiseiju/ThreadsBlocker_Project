# SDD：ThreadsBlocker 3.0 授權台帳與寄信服務

**狀態：** production Worker、KV、Apps Script 與付款入口已部署；真實付款 E2E 待完成  
**決策：** [ADR 0014](adr/0014-license-ledger-and-email-issuance.md)、[ADR 0015](adr/0015-payuni-dynamic-checkout-relay.md)、[ADR 0016](adr/0016-payuni-production-pages-and-manual-invoicing.md)  
**程式：** `license_apps_script/Code.gs`

## 目的

接收受信任的付款／人工發證請求，建立 Pro entitlement，寫入 Google Sheet，並寄出 Email 登入說明。內部 LicenseKey 不作為使用者登入方式。

## 台帳

Google Sheet：`ThreadsBlocker License`

- `Licenses`：LicenseKey、Email、狀態、方案、授權類型、期限、裝置上限、付款來源與寄信狀態。
- `Devices`：一台裝置一列，供後續 Magic Link 授權 API 管理最多三台裝置。
- `Payments`：每次 PAYUNi 成功扣款一列，以 Provider + PaymentId 去重，並保留續期單號與對應 LicenseKey。

`Licenses` 的欄位順序是 Apps Script 的資料契約，變更時必須同步程式、測試與 Google Sheet。

## PAYUNi 正式託管結帳與回呼

- 正式結帳頁提供月付 129、年付 990、早鳥年付 690，並直接導向 ADR 0016 記錄的三個 PAYUNi 託管付款頁；PAYUNi 頁面收集付款 Email 與手開發票所需資料。
- 月付固定為每月 5 日扣款，共 12 期。首次簽章成功 Notify 必須帶合法付款 Email，Worker 才保存 `PeriodTradeNo → Email`；後續扣款以相同 `PeriodTradeNo` 續期。缺 Email 或映射時 fail closed，交人工對帳。
- ADR 0015 的動態結帳 API 保留作 rollback，但正式付款頁不呼叫它。
- 動態 rollback 的月付同樣固定 12 期。標準付款頁只接收月付／年付 URL；早鳥 URL 只在 2026-09-30 前的 `/pro/early` 回應中出現，逾期 callback 也 fail closed。
- Worker 驗證 PAYUNi AES-256-GCM payload、SHA-256 Hash、商店代號、訂單對應、方案與金額後，才以獨立管理密鑰呼叫 Apps Script。
- 固定託管頁不回傳原始頁 token；上線前已稽核正式商店全部收款頁，129／690／990 沒有同類型金額衝突，故暫以「簽章 + 商店 + 保留金額 + Email + 交易／續期識別」作訂單邊界。新增 PAYUNi 商品前不得重用這三個保留金額，否則先改回可驗證的動態訂單對應。
- 付款入口固定三種：月付 129（續期扣款）、年付 990（一次付清）、早鳥年付 690（一次付清、首年限定）。不提供早鳥月付或信用卡分期，年付不自動續年。

## `apply_subscription_payment`

必要欄位：

- `action=apply_subscription_payment`
- `admin_secret`
- `email`
- `payment_id`、`period_trade_no`、`period_order_no`
- `billing_cycle`：`month` 或 `year`
- `payment_amount`、`payment_currency=TWD`
- `sub_expiry`、`paid_at`

同一付款事件重送不得新增第二筆 Payment；同一 Email 的新一期付款更新既有 subscription entitlement，不建立第二組會員資格。

## `create_license`

必要欄位：

- `action=create_license`
- `admin_secret`
- `email`
- `entitlement_type`：`subscription`、`founding_supporter`、`complimentary`
- `sub_expiry`：`YYYY-MM-DD` 或 `never`
- `max_devices`：1–3，預設 3

付款訂閱另需 `payment_provider` 與 `payment_id`。創始支持者匯入建議使用 PAYUNi UNI 序號作 `payment_id`，但同一 Email 不論捐款幾次只建立一個永久 Pro entitlement。

## 寄信

- 訂閱：通知付款完成與 Pro 開通。
- 創始支持者：通知永久 Pro 資格與致謝。
- 啟用步驟固定為更新至 3.0、在 Pro 會員頁輸入付款 Email、用驗證信完成登入。
- 信件不包含內部 LicenseKey。
- 寄信成功才寫 `EmailSentAt`；失敗時相同請求可安全補寄。

## Script Properties

- `THREADSBLOCKER_ADMIN_SECRET`：發證 API 專用密鑰。
- `THREADSBLOCKER_REPLY_TO`：回覆地址，必填。
- `THREADSBLOCKER_FROM_ALIAS`：Gmail 已設定的寄件別名，可省略；無效時退回執行帳號寄送。

值不得寫入 repo。

## 部署閘門

- 綁定 Apps Script 已改名為 `ThreadsBlocker License Management Server`，程式已同步；Sandbox Web App v1 與必要 Script Properties 已建立。
- Sandbox Worker `threadsblocker-license-sandbox`、獨立 KV、Apps Script secrets、Sandbox Merchant 與測試警示頁已建立。
- 正式 PAYUNi 三個託管付款頁、Worker、獨立 KV、Hash Key／IV、Apps Script Web App 與管理密鑰已建立。`/health`、`/ready`、正式標準頁、早鳥頁與 Apps Script `doGet` 均已通過 production HTTP 檢查。
- 尚未完成實際 PAYUNi Sandbox UPP／續期付款、Notify、台帳與 Email E2E。
- 三個 PAYUNi 頁面的 NotifyURL 已核對為 production Worker；尚未用真實扣款證明 Notify、Sheet 與 Email 全鏈路。
- 尚未寄出正式使用者開通信；真實扣款仍需在確認方案與金額後執行。

## 完成條件

- 建立授權、續期延長、每筆付款去重、創始支持者 Email 去重、寄信 retry、`send_email=false`、alias fallback、未授權請求與三裝置上限均有本機測試。
- PAYUNi 官方加密向量、Hash 驗證、商店／金額／Email 綁定與重送均有 Worker 測試。
- 程式不記錄 Email、姓名、完整付款 ID 或 LicenseKey。
- Google Sheet 欄位順序與程式常數一致。
