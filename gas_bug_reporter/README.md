# Universal Bug Report 微服務 (GAS) 系統手冊

此子系統負責接收來自 `PlugnGO` 以及未來其他各式工具的錯誤回報 (Bug Reports)。它被設計為一個獨立的 HTTP 微服務，並透過 Google Apps Script (GAS) 部署。

---

## 1. 系統特性與架構設計 (Design Philosophy)

*   **關注點分離 (Separation of Concerns)**：將 Bug 回報與序號驗證 (License Server) 徹底分離，防止異常格式的除錯 Logs 影響序號系統的穩定性。
*   **動態分潤 (Dynamic Sheets)**：API 支援多個 Client 端工具接入（如：PlugnGO、影片剪輯小幫手等）。腳本會根據傳入的 `source_app`，自動在試算表中建立對應的獨立分頁 (Tab)，無需人工介入。
*   **資安防護 (Security)**：具備防止重放攻擊 (Replay-Attack) 的時效驗證、HMAC-SHA256 簽章防偽造，以及基於硬體 HWID 的 Rate Limiting (限流) 機制以防止洗頻。
*   **即時推播 (Real-time Notification)**：整合 LINE Notify API，收到新的 Bug 時能即時推播給開發團隊。

---

## 2. 部署與設定指南 (Deployment & Setup)

### 步驟 1：建立試算表
1. 進入您的 Google 雲端硬碟，建立一個全新的 Google 試算表 (例如命名為 `Universal_Bug_Reports`)。
2. 此試算表不需要手動建立任何分頁或表頭，腳本會自動處理。

### 步驟 2：貼上與配置腳本
1. 點擊試算表上方的 **「擴充功能」 > 「Apps Script」**。
2. 將 `scripts/bug_report_server.gs` 的內容完全複製並貼上到編輯器中。
3. 修改腳本頂部的參數：
    *   `BETA_SALT`: 請確認與 Python 端 `config.py` 中的 `BETA_SALT` 完全一致 (目前為 `"PGO_BETA_2026_SALT"`)。
    *   `LINE_NOTIFY_TOKEN`: 填寫您申請的 LINE Notify 權杖。

### 步驟 3：發布為網頁應用程式 (Web App)
1. 點擊右上角 **「部署」 > 「新增部署作業」**。
2. 點擊左上角齒輪圖示，選擇 **「網頁應用程式」**。
3. 執行身分設定為：**「我 (您的信箱)」**。
4. 誰可以存取設定為：**「所有人 (Anyone)」**。 (⚠️ **極度重要**，否則 Python 無法呼叫)
5. 點擊「部署」，授權存取您的 Google 試算表與外部連線功能。
6. 將最終取得的「網頁應用程式網址」複製下來，更新到 Python 端 `config.py` 的 `BUG_REPORT_URL` 變數中。

> **💡 版本更新須知**：
> 日後如果修改了 GAS 腳本，**絕對不能只按儲存**！必須點選「部署」>「管理部署作業」，點右上角鉛筆圖示編輯，然後版本選擇「建立新版本」，接著按下「部署」，如此一來更新才會生效，且網址能保持不變。

---

## 3. API 規格與傳輸參數 (API Specification)

**Endpoint:** `POST /exec` (您部署產生的 GAS Web App 網址)
**Headers:** `Content-Type: application/json`

### 傳入參數 (Request Payload)

| 欄位名稱 | 型態 | 必填 | 說明 |
| :--- | :--- | :--- | :--- |
| `source_app` | String | 是 | 來源 App 名稱。將用來命名 Google Sheet 分頁 (例如 `"PlugnGO"`)。 |
| `timestamp` | String | 是 | UTC Unix Timestamp (秒)。API 會拒絕超過 5 分鐘前 (300秒) 的請求。 |
| `hwid` | String | 是 | 設備硬體識別碼 (MAC 序號等)。用於鎖定防洗頻機制 (每 HWID 5 分鐘上限 1 次)。 |
| `signature` | String | 是 | 安全簽章 (Hex String)。產生公式：`SHA256(timestamp + hwid + BETA_SALT)`。 |
| `version` | String | 否 | 來源 App 的軟體版本 (例如 `"2.2.0-beta9"`)。 |
| `level` | String | 否 | 錯誤等級 (例如 `"INFO"`, `"WARNING"`, `"ERROR"`, `"CRITICAL"`)。預設為 `"ERROR"`。 |
| `message` | String | 是 | 詳細的錯誤描述 (Description) 或 Exception string。 |
| `error_code` | String | 否 | 錯誤代碼 (例如 `"SYNC_TIMEOUT"`, `"HTTP_500"`)，方便過濾。 |
| `metadata` | String | 否 | 額外的 JSON 格式字串，用來存放發生當下的 Context 變數或 Stack Trace。 |

**Payload 範例 (Python 建構)：**
```python
import time, hashlib, json

BETA_SALT = "PGO_BETA_2026_SALT"
timestamp = str(int(time.time()))
hwid = "MAC-12345ABCD"

raw_str = f"{timestamp}{hwid}{BETA_SALT}"
signature = hashlib.sha256(raw_str.encode()).hexdigest()

payload = {
    "source_app": "PlugnGO",
    "version": "2.2.0",
    "hwid": hwid,
    "timestamp": timestamp,
    "level": "ERROR",
    "error_code": "E001",
    "message": "RSYNC failed to sync files to NAS.",
    "metadata": json.dumps({"os": "macOS", "trigger": "auto_backup"}),
    "signature": signature
}
```

### 傳出回應 (Response Format)

系統保證不管成功或特定驗證失敗，都會回傳標準的 JSON 格式。
(請注意，如果出現 GAS 內部直譯器錯誤 或 Google Rate Limit，有可能會回傳 `HTML`，客戶端需自行用 `try-except` 或檢查 Status Code 處理 HTTP Retry)。

**成功回應 (HTTP 200 或 HTTP 302 Redirect 再 200)**:
```json
{
  "message": "Success",
  "code": 200
}
```

**拒絕回應範例 (HTTP 4xx/5xx)**:
```json
{
  "message": "Bad Request: Missing required fields",
  "code": 400
}
```
或
```json
{
  "message": "Rate Limit Exceeded",
  "code": 429
}
```

---

## 4. 行為動作清單 (Actions & Behaviors)

當 API 收到請求時，後端腳本的依序行為如下：

1. **防呆驗證 (`Required Fields Check`)**: 檢查 `timestamp`, `hwid`, `source_app`, `message` 是否存在。
2. **防偽造驗證 (`Signature Validation`)**: 重新計算本地的雜湊並與 `signature` 比對。若不符，攔截請求 (`401`)。
3. **時效驗證 (`Time Drift Validation`)**: 檢查 `timestamp` 是否與伺服器時間誤差超過 300 秒。若是，判定為重放攻擊 (`403`)。
4. **限流抽水馬達 (`Rate Limiting Validator`)**: 在 `PropertiesService` 尋找 `LIMIT_{hwid}` 鍵值。若上次發送時間小於 300 秒，攔截懇求 (`429`)。
5. **動態架構維護 (`Dynamic Sheet Builder`)**: 清理 `source_app` 的特殊字元，查找同名分頁。若無，動態建立分頁、凍結首行，並寫入粗體表頭。
6. **日誌落地 (`Log Appending`)**: 將解析完畢的陣列寫入該 `source_app` 分頁的最後一行，並將 Status 設為 `PENDING`。
7. **團隊推播 (`LINE Notifier`)**: 組裝簡短摘要，呼叫 `UrlFetchApp` 傳送至開發群組。若未設定 Token 或推播失敗，則忽略錯誤，避免影響主流程回傳 HTTP 200。
