# Chrome Web Store Listing Draft

## Short Description

Threads 批次封鎖、只檢舉、三無待審清單與本機來源分析工具

## Overview

留友封讓你在 Threads 網頁版上整理互動名單，批次加入封鎖或檢舉流程，並用本機待審清單協助人工確認可疑帳號。

隱私權政策 URL：

https://threadsblocker.skiseiju.com/privacy/

醒目資料揭露：

留友封會在 Threads 網域上讀取使用者正在互動的公開網頁內容，以提供批次封鎖、只檢舉、三無待審清單與來源分析功能。封鎖名單、檢舉佇列、三無待審清單、安全名單與來源證據預設只儲存在使用者瀏覽器本機。平台上傳是使用者可選功能；若使用者手動上傳或明確同意每日自動上傳，資料可能包含公開 Threads 帳號識別、公開 profile 連結、來源貼文連結、公開文字片段、封鎖/檢舉分類、批次統計、工具版本與匿名來源 ID。留友封不收集 Credentials / 認證資訊，包括 Threads 密碼、登入憑證、雙因素驗證碼、session cookies、access tokens、refresh tokens 或 OAuth tokens；也不收集瀏覽器歷史、私人訊息、Email、Google 帳號、付款資訊或真實姓名，不出售資料或用於個人化廣告。

擴充功能也會讀取留友封公告/更新消息 JSON；該請求不包含帳號清單、來源分析 payload 或使用者輸入內容，但伺服器可能收到一般 HTTPS request metadata，例如 IP 位址、User-Agent、時間與請求路徑。

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
- 公告/更新消息檢查不傳送帳號清單或來源分析 payload，但伺服器可能收到一般 HTTPS request metadata
- 不要求或收集 Credentials / 認證資訊，包括 Threads 密碼、登入憑證、雙因素驗證碼、session cookies、access tokens、refresh tokens 或 OAuth tokens
- 不使用 Chrome cookies、history、tabs、webRequest、declarativeNetRequest 或 scripting 權限讀取跨站資料

留友封是獨立工具，非 Meta、Instagram 或 Threads 官方產品。
