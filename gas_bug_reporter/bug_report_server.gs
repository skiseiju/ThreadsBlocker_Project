/**
 * Universal Bug Report Subsystem (Google Apps Script)
 * 
 * 部署說明：
 * 1. 建立一個全新的 Google 試算表，命名為 "Universal_Bug_Reports" (或自訂)。
 * 2. 點擊「擴充功能」>「Apps Script」。
 * 3. 將本程式碼貼上並存檔。
 * 4. 點擊「部署」>「新增部署作業」。
 * 5. 類型選擇「網頁應用程式 (Web App)」。
 * 6. 執行身分：「我」，誰可以存取：「所有人」。
 * 7. 部署後，將獲得的 Web App URL 替換到 PlugnGO 的 config.py 中的 `BUG_REPORT_URL`。
 * 
 * 注意事項：
 * - 請將 LINE_NOTIFY_TOKEN 替換為您的真實 Token。
 * - 此系統會自動根據 Payload 的 source_app 建立不同的獨立分頁 (Tabs)。
 */

var BETA_SALT = "PGO_BETA_2026_SALT"; // 必須與 Client 端 config.py 一致
var LINE_NOTIFY_TOKEN = "您的_LINE_NOTIFY_TOKEN"; // 務必替換

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    
    // 基本防呆：必填欄位檢查
    if (!data.timestamp || !data.hwid || !data.source_app || !data.message) {
      return createResponse("Bad Request: Missing required fields", 400);
    }
    
    // 1. 資安策略：驗證簽章
    var rawStr = data.timestamp + data.hwid + BETA_SALT;
    var expectedSig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, rawStr)
                      .map(function(b) {return ("0" + (b & 0xFF).toString(16)).slice(-2)}).join("");
    
    if (data.signature !== expectedSig) {
      return createResponse("Unauthorized: Invalid signature", 401);
    }

    // 2. 時效檢查 (5 分鐘 = 300 秒)
    var now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(data.timestamp)) > 300) {
      return createResponse("Request Expired: Time drift too large", 403);
    }

    // 3. 後端限流 (每個設備 5 分鐘一次)
    var limitKey = "LIMIT_" + data.hwid;
    var lastTime = props.getProperty(limitKey);
    if (lastTime && (now - parseInt(lastTime) < 300)) {
      return createResponse("Rate Limit Exceeded", 429);
    }

    // 更新限流時間
    props.setProperty(limitKey, now.toString());

    // 4. 動態寫入 Google Sheets 
    var appName = data.source_app.toString().trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "Unknown_App";
    var sheet = getOrCreateSheet(appName);
    var dateStr = new Date().toISOString();
    
    // [ Timestamp, HWID, Version, Level, Message, ErrorCode, Metadata, Status ]
    sheet.appendRow([
      dateStr,
      data.hwid,
      data.version || "Unknown",
      data.level || "ERROR",
      data.message,
      data.error_code || "",
      data.metadata || "",
      "PENDING"
    ]);
    
    // 5. LINE Notify 推播 (如果是嚴重等級才通知，或全通知)
    var notifyMsg = "🚨 [" + appName + "] 新異常回報\n" +
                    "等級: " + (data.level || "ERROR") + "\n" +
                    "裝置: " + data.hwid + "\n" +
                    "描述: " + data.message.substring(0, 50) + "...";
    sendLineNotify(notifyMsg);

    return createResponse("Success", 200);

  } catch (err) {
    return createResponse("Internal Server Error: " + err.toString(), 500);
  }
}

/**
 * 取得指定名稱的工作表，若不存在則動態建立並設定表頭
 */
function getOrCreateSheet(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // 寫入表頭
    var headers = ["Timestamp", "HWID", "Version", "Level", "Message", "Error Code", "Metadata / Stack Trace", "Status"];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sheet.setFrozenRows(1); // 凍結首行
  }
  return sheet;
}

/**
 * 建立標準化 JSON 回應
 */
function createResponse(msg, code) {
  return ContentService.createTextOutput(JSON.stringify({message: msg, code: code}))
                       .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 發送 LINE Notify 推播通知
 */
function sendLineNotify(message) {
  if (LINE_NOTIFY_TOKEN === "您的_LINE_NOTIFY_TOKEN" || !LINE_NOTIFY_TOKEN) {
    return; // 未設定 Token 則略過
  }
  try {
    var options = {
      "method" : "post",
      "payload" : {"message" : message},
      "headers" : {"Authorization" : "Bearer " + LINE_NOTIFY_TOKEN},
      "muteHttpExceptions": true
    };
    UrlFetchApp.fetch("https://notify-api.line.me/api/notify", options);
  } catch(e) {
    // 忽略推播錯誤以免影響主流程
  }
}
