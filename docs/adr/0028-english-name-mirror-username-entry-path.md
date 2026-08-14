# ADR 0028：顯示名鏡像帳號名（英文全名＋亂碼＋5 碼數字）進待審清單

- 日期：2026-08-14
- 狀態：已採納（beta32 實作）
- 相關：[ADR 0022](0022-three-no-formula-requires-confirmed-empty-content.md)（三無公式須有確認過的無內容證據，本 ADR 不動該公式）、[ADR 0024](0024-pinyin-name-entry-path-bypasses-avatar-gate.md)（拼音入口路徑繞過頭像門檻，本 ADR 對稱擴充）、[ADR 0025](0025-pinyin-active-accounts-enter-review-list-with-badge.md)（活躍者掛標籤進待審清單，本 ADR 沿用同一定位）、`src/features/three-no-watch.js`、`src/config.js`

## 背景

2026-08-14 使用者提供四筆實機樣本，網軍批次註冊的命名結構已從「動物英文字＋數字」換成新形態：

| 顯示名 | 帳號名 | 拆解 |
|---|---|---|
| Kenneth Berry | `kennethberryaei31413` | kennethberry + aei + 31413 |
| Laura Reed | `laurareedbbb68029` | laurareed + bbb + 68029 |
| Timothy Hodge | `timothyhodgeyft36541` | timothyhodge + yft + 36541 |
| Ernest Lopez | `ernestlopezgei67416` | ernestlopez + gei + 67416 |

共同結構：**帳號名的開頭恰好等於顯示名去除空白與標點後的小寫形式**，其後緊接 2 至 4 個小寫字母亂碼與 5 碼以上數字。

四筆全部有頭像（盜用的年輕女性照片，與男性英文名不符），粉絲數 0 至 12，近期瀏覽 1,697 至 1.7 萬。既有的動物字典（`usernameMatchesSuspiciousThreeNoCandidate`）完全抓不到，且因為有頭像，三無公式的 `noAvatar` 第一關也過不了，個體層級完全不可見。

## 選項

1. **把常見英文名字加進既有字典**。代價：英文名字池是開放集合（數千個），永遠補不完；且 `johnsmith12345` 這類真人命名會被誤判。
2. **只看帳號名結構（小寫字母串＋5 碼數字）**。代價：無法區分真人的 `johnsmith12345`，誤判率不可接受。單看帳號名字串，找不到「哪裡是名字、哪裡是亂碼」的邊界。
3. **顯示名鏡像比對（採納）**：要求顯示名正規化後恰為帳號名前綴，餘下部分符合亂碼＋數字結構。代價：需要在掃描時抽取顯示名，有 DOM 成本；貼文內嵌情境拿不到顯示名時無法判定。

## 決定

採選項 3，比照 ADR 0024／0025 的拼音路徑做對稱擴充：

1. **判定**：新增 `matchesEnglishNameMirrorUsername(username, displayName)`。成立條件全部滿足：
   - 顯示名正規化（去空白、標點、轉小寫，僅保留 a-z）後長度至少 6
   - 該正規化字串為帳號名（去 `._-` 後小寫）的前綴
   - 餘下部分符合 `^[a-z]{2,4}\d{5,}$`
2. **兩段式求值**：先用純字串的便宜條件（帳號名為 `^[a-z]{6,}\d{5,}$`）篩選，僅對命中者才抽取顯示名做比對。避免在兩千人以上名單逐列付出 DOM 成本（PLAN #27 的教訓）。
3. **入口路徑**：命中者與拼音路徑同權，覆寫頭像預過濾的跳過，進入 triage 與待審清單。
4. **定位（使用者拍板：與拼音路徑對稱）**：`isThreeNo` 公式新增第三條路徑，與 ADR 0024 的拼音路徑同形：

   ```
   isThreeNo = (noAvatar && (noPosts || noReplies || noReposts || suspiciousUsername))
             || (pinyinNameMatch && (noPosts || noReplies || noReposts))
             || (englishNameMirrorMatch && (noPosts || noReplies || noReposts))
   ```

   命中且至少一項內容確認為空 → 計入三無（不要求 `noAvatar`）。命中但有活動 → 不計入三無，改進待審清單掛資訊標籤（沿用 ADR 0025 的琥珀標籤語意，文案「英文名鏡像・疑似批次註冊」）。私密帳號的內容旗標依 ADR 0022 強制為 false，因此不會經本路徑進入三無。維持人工逐筆確認，不自動封鎖。

   **本 ADR 初稿曾定為「只掛標籤、不進公式」，2026-08-14 使用者拍板改為對稱。** 理由：同屬「命名結構暴露批次註冊」的訊號沒有理由待遇不同，且本規則的證據力高於拼音（拼音只看帳號名長相，本規則要求顯示名與帳號名雙重吻合），保守待遇無正當性。
5. **貼文內嵌標籤**：該情境取不到可靠顯示名，本版不提供標記，不改 `getInlineFakeAccountBadgeInfo`。

## 後果

- 新形態網軍帳號在追蹤者掃描中變得可見，不再被頭像門檻整批吞掉。
- **三無數字會上升**：命中且無內容者現在計入統計。這是預期行為，不是回歸；驗收時應確認上升的部分都是真樣本。
- 誤判成本受控：不自動封鎖，人工逐筆確認後才動作，且雙重吻合條件讓真人幾乎不可能命中。
- 顯示名抽取只對少數結構命中者執行，掃描成本增加有界。
- 未來若網軍改用非英文顯示名或改變亂碼長度，本規則失效，需要新的樣本再議；動物字典（beta21／beta25）與拼音路徑（beta24）保留不動，三者並存。
