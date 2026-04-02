# 定點絕 (Endless Harvester) DOM 與排程疑難雜症修復實錄

在實作「定點絕」(前稱：無盡收割機) 這個自動循環換頁並抓取名單的功能時，我們遇到了非常多與 React 虛擬 DOM、瀏覽器 BOM 安全限制相關的鬼畜問題。以下紀錄這些問題的根本原因以及我們最後使用的精準打擊解法以供未來參考。

## 1. Safari 彈出視窗阻擋 (Popup Blocker)
- **問題描述**：
  原本的流程是：名單收集完 -> 主畫面使用 `window.open()` 開啟 Worker -> Worker 執行完畢 -> 主畫面發現並重新 `location.reload()` -> 再次遇到新名單，再度使用 `window.open()`。
  但瀏覽器（特別是 Safari）的防禦機制嚴格規定：**所有彈出視窗必須是由「使用者實體操作動作 (User Gesture)」所觸發**。因此從第二輪開始，自動 reload 後由 setTimeout 發出的 `window.open()` 會被視為流氓彈窗而被瀏覽器拒絕。
- **解法設計（持續待命模型）**：
  我們放棄了不斷「關閉又重開」Worker 的做法。
  引入了全域標記 `hege_endless_worker_standby`。當定點絕啟動時：
  1. Worker 消化完現有佇列後，不會呼叫 `window.close()`，而是進入 `idle` 待命。
  2. 主畫面（Main UI）`reload()` 之後，判斷 `status.state === 'idle'` 依舊視為 Worker 存活。
  3. 主畫面單純將新的一批名單洗進 `BG_QUEUE`，背景已經在等待的 Worker 會立刻抓取並繼續執行，完美規避了不斷彈出視窗的限制。

## 2. 虛擬點擊與實體點擊的「死迴圈保護」衝突
- **問題描述**：
  為了防止 Threads 列表 API 卡單（一直撈到重複的第一個人），我們記錄了 `sessionStorage` 裡的 `hege_endless_last_first_user` 作為兩輪交接的對稱比較點。
  但當我們因為 Bug 或使用者主動「按下停止定點絕」後，下次使用者**親自手動點開**準備進行新的一輪時，往往會因為上一次的旗標停留在 sessionStorage 內，造成系統一開局就判定「第一人重複」，觸發了錯誤的死迴圈警告。
- **解法設計（事件注入分離）**：
  要如何精準在一套程式中區分「使用者的實體點擊」與「自動接軌發送的 simClick」？
  我們在自動換頁並打出 `simClick` 的前一行，注入了一個暫時的 Flag `window.__hege_is_auto_click = true;`。
  接收端 `handleEndlessSweep` 如果測不到這個 Flag，代表這是**貨真價實的使用者手動點擊（開局）**。我們就會放心大膽地把 `sessionStorage` 內的死迴圈歷史旗標清空！從此手動開啟永遠不會再跳卡單誤判。

## 3. 鬼影 DOM (Ghost DOM) 名單誤抓
- **問題描述**：
  在 Threads 的「查看動態」(第一層 Dialog) 點擊讚數進入「按讚的人」(第二層 Dialog) 時。非常反直覺地，**Threads 的 React Navigation Stack 竟然沒有將第一層 Dialog 銷毀或解除綁定 DOM**！
  它只是利用 CSS 平移去到了螢幕外或是被壓在底層。
  這導致我們的 `activeCtx.querySelectorAll('a[href^="/@"]')` 屬「盲抓」，它天真地搜尋到了隱藏的第一層表單，導致名單錯置與畫面上的 UI Checkbox 無法同步閃紅框。
- **解法設計（Visibility Check 視覺過濾）**：
  面對這種被藏在幕後但仍在 DOM Tree 的幽靈結點，唯一準確的切割器是 **瀏覽器的渲染盒子 (Layout Engine)**。
  我們對 `querySelectorAll` 找出的所有連結串接了過濾器：
  ```javascript
  const rect = a.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.right > 0;
  ```
  這強制規定程式只能信任「**當下肉眼切實看得到的畫面中的連結**」。這漂亮地把第一層那些寬度為 0 或者是座標偏出畫面的鬼影連結全部剃除，精準取得了第二層名單。同時，不管 Threads 後續怎麼亂蓋疊層，這個做法永遠免疫！

---
*文件編制時間：2026-04*
