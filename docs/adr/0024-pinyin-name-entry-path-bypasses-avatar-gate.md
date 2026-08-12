# ADR 0024：簡體拼音命名＋確認無內容可繞過頭像門檻進入三無待審名單

- 日期：2026-08-13
- 狀態：已採納
- 相關：[ADR 0022](0022-three-no-formula-requires-confirmed-empty-content.md)（三無判定公式須確認無內容，本 ADR 在其上新增一條入口路徑）、[ADR 0023](0023-three-no-storage-quota-resilience.md)（儲存配額防爆，不受本 ADR 影響）、`src/features/three-no-watch.js`、`src/three-no-name-pattern.js`

## 背景

實機案例 `chenyuxin8661`（顯示名「陳雨欣」、0 粉絲、零發文、掛 AI 風格頭像）完全符合網軍批次帳號特徵，卻進不了三無待審名單。原因有兩層：

1. **收名單 triage 門檻**：`prefilterHasVisibleAvatar && !suspiciousUsername` 的帳號在收追蹤者名單階段就被跳過（`skipped_visible_avatar`），從不進入個人頁探測。
2. **判定公式**：`isThreeNo = noAvatar && (…)`（ADR 0022），第一道就要求無頭像。

有頭像的網軍帳號只剩密度橫幅一條路能被看見，且要連排 5 個以上才觸發。

## 選項

1. **維持現狀**：靠密度橫幅補漏。誤判風險最低，但單獨出現的拼音空帳號完全不可見。
2. **拼音＋確認無內容繞過頭像門檻**（採納）：`matchesPinyinName` 命中的帳號在 triage 保留並探測；判定公式新增 OR 路徑「拼音命中 且 至少一項內容確認為空」。
3. **拼音直接進待審名單（不要求無內容）**：會把有頭像、活躍發文的拼音姓名真人（如馬來西亞、新加坡華人）撈進名單，誤判面太大，否決。

## 決定

公式改為兩條入口路徑：

```
isThreeNo =
    (noAvatar && (noPosts || noReplies || noReposts || suspiciousUsername))
 || (matchesPinyinName(username) && (noPosts || noReplies || noReposts))
```

- 拼音路徑**不含** `suspiciousUsername`（那是內容無關訊號，拼音＋命名可疑不足以判定，會誤中活躍真人）。
- `noPosts/noReplies/noReposts` 沿用 ADR 0022 語意：私密帳號一律強制 false，故私密帳號仍不會經拼音路徑進名單。
- triage 放行條件同步加上拼音命中：`prefilterHasVisibleAvatar && !suspiciousUsername && !matchesPinyinName → skip`。
- 拼音判定沿用 beta24 收窄後語意（至少一個對岸獨有聲母 x/q/z/c，Wade-Giles 共用音節不算），維持「台灣人不用漢語拼音」的區辨力。
- finding 增加 `pinyinNameMatch: true` 欄位，卡片上既有「疑似簡體拼音」標籤讓使用者知道它是走拼音路徑進來的。判斷仍留給使用者，不自動封鎖。

## 後果

- 有頭像的拼音空帳號現在會出現在待審名單，補上密度橫幅以外的個體級可見性。
- 名單中每個拼音命中帳號多三次頁面探測，掃描時間微增（實測乾淨名冊命中率低，可接受）。
- 拼音姓名但長期潛水（零發文）的真人華人帳號可能被撈進名單；標籤已標明訊號來源，由使用者人工判斷，不影響對方帳號。
