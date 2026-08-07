# ADR 0016：PAYUNi 正式收款頁與初期手開發票

- 日期：2026-08-07
- 狀態：已採納（正式 Worker、KV、Apps Script 與收款入口已部署；尚待真實付款自動開通 E2E）
- 相關：[ADR 0014](0014-license-ledger-and-email-issuance.md)（授權台帳、付款冪等與寄信邊界）、[ADR 0015](0015-payuni-dynamic-checkout-relay.md)（動態結帳、Email 綁定與 Notify 驗證）、`license_worker/src/index.js`、`license_worker/src/checkout-page.js`、`license_apps_script/Code.gs`、`docs/SDD_3.0_LICENSE_SERVICE.md`

## 背景

ThreadsBlocker 3.0 的正式定價調整為月付 NT$129、年付 NT$990、早鳥年付 NT$690。PAYUNi 正式商店 `U012070036` 已建立三個託管收款頁：

- 月付 NT$129：每月 5 日扣款，共 12 期，`https://api.payuni.com.tw/api/period/U012070036/ThJq7toMSg9`
- 年付 NT$990：一次付清，`https://api.payuni.com.tw/api/uop/receive_info/2/1/U012070036/CA9tPkodFvyy7yKml2fK2`
- 早鳥年付 NT$690：一次付清，`https://api.payuni.com.tw/api/uop/receive_info/2/1/U012070036/M4J17naF4nDr2Zmki85sJ`

年付與早鳥年付頁會收集付款 Email、統一編號與收據地址，並支援信用卡、ATM 轉帳及 7-ELEVEN 超商代碼。月付頁是 PAYUNi 後台固定續期頁，扣款日與期數已固定。

淬鍊影像工作室目前未申請電子發票加值中心。PAYUNi 只負責代收款，不會代商店開立 ThreadsBlocker 銷售發票；初期使用既有紙本統一發票可避免在尚未驗證付費需求前增加電子發票設定費與長期服務成本。

## 決定

- 正式價格固定為月付 NT$129、年付 NT$990、早鳥年付 NT$690；不提供早鳥月付。
- 早鳥有效期間依 PAYUNi 頁面設定至 2026-09-30 23:59（台北時間）。標準付款頁不得把早鳥 URL 送到瀏覽器；早鳥頁與付款回呼都必須通過同一個伺服器日期閘門，逾期的 NT$690 通知不得自動開通。
- 三個 PAYUNi 託管頁是正式付款入口；ThreadsBlocker 付款頁依使用者選擇直接導向對應連結，但「頁面可付款」不等於「授權服務已完成」。在 Notify、台帳與 Email 實際 E2E 通過前，不對外宣告正式收費已完成。
- 年付與早鳥年付可在驗證 PAYUNi 簽章、付款 Email、方案與金額後，轉送 ADR 0014 的 Apps Script 建立一年期 Pro entitlement。
- 本 ADR 修正 ADR 0015「固定續期頁不作正式入口」的決定：月付改用已建立的固定 12 期頁。Worker 只在首次簽章成功通知確實包含合法付款 Email 時，保存 `PeriodTradeNo → Email`；後續每期通知以相同 `PeriodTradeNo` 取回對應會員。不得僅依金額、姓名或共用連結推測身分。
- 若首次月付 Notify 不帶合法 Email，或後續通知找不到既有 `PeriodTradeNo` 映射，Worker 必須 fail closed，不建立或延長 entitlement；該筆列入人工對帳。ADR 0015 的動態月付程式保留為 rollback，不從正式託管頁呼叫。
- PAYUNi 固定託管頁的 Notify 不提供原始收款頁 token。2026-08-07 上線前已唯讀稽核正式商店全部續期頁與一頁收款：129、690、990 在各自收款類型中都只由 ThreadsBlocker 使用，因此三個金額列為此商店的保留產品識別，並與已驗證商店、簽章、付款 Email、交易 ID／續期單號共同判定。日後新增或改價任何 PAYUNi 收款頁前，必須先檢查不得重用這三個金額；若要重用，需先改成可驗證的動態訂單對應，不能只靠金額。
- rollback 的動態月付也固定為 12 期；不得退回 ADR 0015 原先的 900 期設定，避免與正式頁的一年期按月扣款承諾不一致。
- 初期付款成功後由淬鍊影像工作室手開紙本統一發票。月付每次扣款各開一張；年付與早鳥年付於一次付款成功後按實收總額各開一張。
- 本階段不申請或串接電子發票加值中心。日後若付費量使人工開票形成持續負擔，再另行比較成本、申請字軌並新增發票 API 決策；不得在未申請成功前宣稱會自動寄送電子發票。

## 完成閘門

- production Worker、KV、Apps Script Web App 與必要 secrets 已建立。Worker 首次部署 rollback version 為 `2df607c8-5507-4762-a867-bd76ace4d4d8`；Apps Script production deployment v2 為 `AKfycbyOQcmVBodJ9Nz2ofl6ijMJEwU_Kino0qrcbvyM1-iQRjppn3GxUG2FSSutej7f1lF1`。
- 年付與早鳥年付各以真實 PAYUNi Notify 驗證簽章、商店代號、金額、Email、付款冪等、台帳與開通信。
- 月付固定頁必須以真實首次扣款證明 Notify 含 Email 並成功建立 `PeriodTradeNo` 映射；另以簽章 fixture 證明後續無 Email Notify 可沿用映射，且錯誤 `PeriodTradeNo` 會 fail closed。
- 付款失敗、Notify 重送、Apps Script 暫時失敗與寄信失敗均不得產生重複 entitlement 或重複 Payment。
- 正式付款入口公開前，頁面文字需明示月付 NT$129、年付 NT$990、早鳥年付 NT$690，以及月付取消與年付不自動續訂規則。

## 後果

- 產品使用 PAYUNi 託管頁提供的信用卡、ATM 與超商代碼收款能力；月付映射是否成立仍以首次真實 Notify 為部署後硬門檻。
- 紙本發票不增加新的 SaaS 成本，但會產生人工開票、寄送、作廢與折讓作業；付費量成長後必須重新評估電子發票。
- 已建立的月付固定頁只有 12 期且固定每月 5 日，語意是「一年期、按月扣款」，不能對外描述為無限期自動續訂。
- 本 ADR 不構成 production deploy、付款啟用或公開連結的授權；這些仍遵守 repo 的正式發布閘門。
