# 0004 Engagement List 開啟策略順序

## 背景

`openEngagementList` 需要可靠打開貼文的 likes dialog，才能取得按讚者並進行後續清理。beta22 曾嘗試優先走「直接點按讚數連結」的簡單路徑，但現代 Threads UI 已經把按讚數做成 icon-only，`aria-label` 也不一定包含「N 個讚」文字。

在 OTHER's post 上，直接尋找按讚連結常常找不到可靠入口。相較之下，v2.5.2 使用的 Activity 路徑雖然步驟較多，但能透過「查看動態」進入 Activity dialog，再切到按讚內容 tab，實測更穩定。

## 選項

- (a) 直接點按讚數連結，開啟 likes dialog。這個方案較簡單。
- (b) 點「查看動態」，等待 Activity dialog，再點按讚內容 tab 開啟 likes。這個方案步驟較多。

## 決定

採用 (b) 為主路徑，(a) 作為 fallback：`openEngagementList` 策略順序改成「Activity（查看動態）→ Likes tab」優先，只有主路徑失敗時才嘗試直接點按讚連結。

這個決定對齊 v2.5.2 行為，並適應現代 Threads UI 對按讚入口的變更。

## 後果

好處是 OTHER's post 上更容易可靠打開 likes dialog，不再依賴不穩定的按讚數文字或連結結構。

副作用是 Activity dialog 載入需要 polling 等待，最長可到 30 秒，比直接點連結慢。

實作上也必須小心處理跨多個 dialog 容器的情況。當 `getTopContext` 抓不到正確內容時，需要掃描所有 `[role='dialog']`，才能找到 Likes tab。
