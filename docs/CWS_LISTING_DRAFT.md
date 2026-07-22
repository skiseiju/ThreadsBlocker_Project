# Chrome Web Store Listing Draft

## Short Description

Threads 批次封鎖、只檢舉、三無待審清單與本機來源分析工具

## Overview

留友封讓你在 Threads 網頁版上整理互動名單，批次加入封鎖或檢舉流程，並用本機待審清單協助人工確認可疑帳號。

隱私權政策 URL：

https://threadsblocker.skiseiju.com/privacy/

醒目資料揭露：

留友封會在 Threads 網域上讀取使用者正在互動的公開網頁內容，以提供批次封鎖、只檢舉、三無待審清單與來源分析功能。封鎖名單、檢舉佇列、三無待審清單、安全名單與來源證據預設儲存在使用者瀏覽器本機；以下是會離開裝置的完整例外。

1. 問題回報只在使用者主動按下送出時傳送。不勾選 beta 診斷附件時，內容層面只傳送使用者填寫的問題描述；服務仍會收到驗證與防濫用所需的持續性隨機回報 ID、版本、時間、問題類型、錯誤代碼與簽章，以及一般 HTTPS request metadata。只有使用者勾選該次未預勾的 checkbox 時才附上 beta 診斷，附件送出前會 scrub request token、cookie、authorization 與 canary。正式版不附加 beta 診斷。

2. 平台上傳是使用者可選功能；platform-sync-v4 未決定前 auto、repair、manual 與三無統計都不送。完成同意後，手動或每日上傳資料可能包含公開 Threads 帳號識別、公開 profile 連結、來源貼文連結、公開文字片段、封鎖/檢舉分類、批次統計、工具版本與匿名來源 ID。公開 reviewed_text 必須通過 legal policy、門檻、去識別與人工核准。

3. 擴充功能會讀取留友封公告/更新消息 JSON；該請求不包含帳號清單、來源分析 payload 或使用者輸入內容，但伺服器可能收到一般 HTTPS request metadata，例如 IP 位址、User-Agent、時間與請求路徑。

留友封不要求或處理 Threads 密碼、雙因素驗證碼、request token、session cookie、Email、Google 帳號、付款資訊或真實姓名。套件不包含擷取 token 的 page bridge，也不會 patch Threads 頁面的 fetch/XHR 來讀取 request body 或 authentication information。留友封不出售資料，也不用於個人化廣告。

主要功能：

- 勾選框注入：在貼文動態、讚、引用、粉絲與追蹤中列表直接勾選帳號
- 批次封鎖：將帳號加入封鎖清單後，由使用者手動啟動背景流程
- 只檢舉：可不封鎖，單獨把帳號加入檢舉佇列並選擇當次檢舉路徑
- 三無待審清單：掃描結果先進本機待審清單，不會自動封鎖
- 可解釋提示：每筆待審帳號顯示疑似假帳號分數、命中原因與資料完整度
- 安全名單：使用者可把熟人、創作者或正常帳號標為本機例外，避免之後重掃再次出現
- 來源分析：在本機整理封鎖 / 檢舉來源、批次、路徑與主要貼文線索
- 失敗重試：自動整理失敗清單，讓使用者稍後手動重試或清除

隱私與資料邊界：

- 待審清單與安全名單只保存在你的瀏覽器本機
- 不上傳三無待審帳號名單、安全名單或完整社交圖
- 平台同步只在使用者同意後上傳來源分析與匿名統計
- 問題回報只在使用者主動送出時傳送；不勾選 beta 診斷附件時，內容層面只送描述與服務必要欄位，勾選後才附上已 scrub 的診斷
- 公開觀測站預設只顯示 description mode；只有 legal policy version 完全匹配、門檻通過、去識別且人工 approved 才能顯示 reviewed_text，pending / rejected 永不公開
- 公告/更新消息檢查不傳送帳號清單或來源分析 payload，但伺服器可能收到一般 HTTPS request metadata
- 不要求或處理 Threads 密碼、雙因素驗證碼、request token 或 session cookie
- 不使用 Chrome cookies、history、tabs、webRequest、declarativeNetRequest 或 scripting 權限讀取跨站資料

留友封是獨立工具，非 Meta、Instagram 或 Threads 官方產品。
