import hashlib
import time
import requests
import json
import uuid

class UniversalBugReporter:
    """
    客製化 Bug Report 傳送工具範本。
    您可以將這個 Class 複製到任何新的 Python 專案 (例如剪輯後台) 中直接使用。
    """
    
    def __init__(self, gas_url: str, salt: str, source_app: str, version: str):
        """
        初始化 Bug Reporter。
        :param gas_url: 部署完成的 GAS 網頁應用程式 URL
        :param salt: 與 GAS 試算表腳本對齊的加密鹽 (BETA_SALT)
        :param source_app: 此專案的名稱 (大寫駝峰尤佳，例如 'VideoEditorPro')
        :param version: 此專案的版本號 (例如 '1.0.0')
        """
        self.gas_url = gas_url
        self.salt = salt
        self.source_app = source_app
        self.version = version

    def get_hardware_id(self) -> str:
        """
        [實作留白] 請根據您專案的需求，獲取設備的 HWID。
        如果您不想綁定設備，可以直接使用 UUID 或固定的字串 (但也將失去防洗頻的依據)。
        這裡示範產生一組 UUID。
        """
        return str(uuid.uuid4())

    def submit_report(self, level: str, message: str, error_code: str = "", metadata: dict = None) -> dict:
        """
        發送 Bug Report 到遠端中控台 (Google Sheets)。
        """
        hwid = self.get_hardware_id()
        timestamp = str(int(time.time()))
        
        # 產生 HMAC SHA-256 簽章
        raw_str = f"{timestamp}{hwid}{self.salt}"
        signature = hashlib.sha256(raw_str.encode()).hexdigest()
        
        payload = {
            "source_app": self.source_app,
            "version": self.version,
            "hwid": hwid,
            "timestamp": timestamp,
            "level": level,
            "message": message,
            "error_code": error_code,
            "metadata": json.dumps(metadata) if metadata else "",
            "signature": signature
        }
        
        try:
            # GAS 會在 POST 成功後回傳 302 Redirect 到另一個 URL
            # 必須發起 GET 請求才能取得真正的 JSON 回應
            res_post = requests.post(self.gas_url, json=payload, timeout=15, allow_redirects=False)
            
            if res_post.status_code == 302:
                redirect_url = res_post.headers.get('Location')
                if redirect_url:
                    res_get = requests.get(redirect_url, timeout=15)
                    return res_get.json()
            
            return res_post.json()
            
        except Exception as e:
            return {"code": 500, "message": f"連線或解析失敗: {str(e)}"}

# ==========================================
# 測試區塊 (可以直接執行這個檔案來測試)
# ==========================================
if __name__ == "__main__":
    # 將下方替換為您部署的真實 GAS URL
    # 這支程式碼不會依賴您原本專案的 config.py，非常容易攜帶複製。
    TEST_GAS_WEB_APP = "https://script.google.com/macros/s/AKfycbxZ1cdDUST_8x2gpsYcV6gCENLqpxnb53VTaXW6MaeGV8Mbh8rcrDz9rYJkqwlYWeY4/exec"
    TEST_SALT = "PGO_BETA_2026_SALT"

    reporter = UniversalBugReporter(
        gas_url=TEST_GAS_WEB_APP,
        salt=TEST_SALT,
        source_app="Demo_Tool", # 試算表中會自動新增名為 'Demo_Tool' 的頁籤
        version="0.1.0-alpha"
    )

    print(">>> 正在發送測試 Bug Report...")
    result = reporter.submit_report(
        level="WARNING",
        message="這是一筆來自 Template 的獨立測試！",
        error_code="WARN_101",
        metadata={"os": "Windows", "memory_usage": "2GB"}
    )
    
    print("\n--- 執行結果 ---")
    print(result)
