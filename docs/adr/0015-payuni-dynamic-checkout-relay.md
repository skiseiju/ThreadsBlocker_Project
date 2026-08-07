# ADR 0015：PAYUNi 採動態結帳頁與最小付款轉接層

- 日期：2026-08-07
- 狀態：已採納（Sandbox Worker 已部署，production 尚未部署）
- 相關：[ADR 0014](0014-license-ledger-and-email-issuance.md)（Google Sheet 授權台帳與寄信邊界）、`license_worker/src/index.js`、`license_apps_script/Code.gs`、`docs/SDD_3.0_LICENSE_SERVICE.md`

## 背景

PAYUNi 後台可直接建立固定「續期收款頁」，但該頁對所有付款人使用同一扣款日；每期付款完成 Notify 只提供商店訂單編號、續期單號與交易號，不提供付款 Email。若直接用後台固定頁，付款雖可成功，授權服務卻無法可靠把後續扣款對應回 Email 帳號。

PAYUNi 的續期收款支付頁 API 可由商店先指定 `MerTradeNo`、`PayerEmail`、扣款週期與 NotifyURL。每期 Notify 使用 AES-256-GCM 與 SHA-256 驗證，Google Apps Script 沒有適合此協定的原生 AES-GCM API。

## 決定

- 不使用 PAYUNi 後台固定續期頁作正式 Pro 結帳入口。
- 建立單一 ThreadsBlocker 結帳頁。使用者先輸入 Email 並選月繳／年繳，付款 Worker 先保存 `MerTradeNo → Email + 方案 + 金額`，再產生 PAYUNi 動態支付表單。
- Cloudflare Worker 只負責 PAYUNi 加解密、方案與金額驗證、訂單對應及轉送受信任付款事件；不取代 ADR 0014 的 Google Sheet 授權台帳與寄信服務。
- Apps Script 新增 `apply_subscription_payment`，以 `PaymentProvider + PaymentId` 冪等記錄每次扣款，建立或延長同一 Email 的 Pro entitlement。
- 月付使用 PAYUNi 續期收款；年付與早鳥年付使用 UNiPaypage 信用卡一次付清，不帶 `CreditInst`，也不自動續年。
- 正式付款入口只有月付 129、年付 990、早鳥年付 690 三種。早鳥由伺服器端截止日開關決定，瀏覽器不得自行指定價格；不提供早鳥月付。
- PAYUNi Hash Key、Hash IV、Apps Script URL 與管理密鑰只放 Worker secrets；不得寫入 repo、HTML、log 或試算表。
- 測試部署固定使用 `PAYUNI_ENV=sandbox` 與 `sandbox-api.payuni.com.tw`；測試付款記為 `PAYUNi Sandbox / payuni_sandbox`，不得混入正式付款來源。測試頁必須醒目標示不產生真實扣款或正式資格。

## 後果

- 付款 Email 在進入 PAYUNi 前即與訂單綁定，後續 Notify 不需要信任使用者輸入或查詢後台畫面。
- 需要一個小型 Worker 與 KV 對應表，但授權、裝置與寄信仍由既有 Apps Script／Google Sheet 管理，沒有把整套會員系統搬入 Cloudflare。
- 正式上線需要依序建立 KV、設定 secrets、部署 Worker、部署 Apps Script，再以 PAYUNi 測試交易驗證；任何正式部署與收款啟用仍需獨立 go/no-go。
