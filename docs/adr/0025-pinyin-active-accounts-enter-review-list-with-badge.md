# ADR 0025：拼音命名帳號一律進待審名單，活躍者以標籤區分不判三無

- 日期：2026-08-13
- 狀態：已採納
- 相關：[ADR 0024](0024-pinyin-name-entry-path-bypasses-avatar-gate.md)（拼音＋確認無內容繞過頭像門檻，本 ADR 把入名單門檻再放寬到拼音本身）、[ADR 0022](0022-three-no-formula-requires-confirmed-empty-content.md)（三無判定公式，本 ADR 不動它）、`src/features/three-no-watch.js`、`src/ui.js`、`src/three-no-name-pattern.js`

## 背景

beta26（ADR 0024）後，拼音＋確認無內容的帳號會進待審名單，但拼音＋有發文的活躍帳號 `isThreeNo=false`，findings 推入閘門要求 `isThreeNo`，所以完全不可見。使用者判斷：台灣使用者不用漢語拼音命名（Wade-Giles 拼法無 x/q/z/c 聲母），拼音命名本身就是可疑訊號，活躍不能豁免；網軍養號期會正常發文。

## 選項

1. 拼音活躍帳號不進名單（beta26 現狀）：漏掉養號期網軍。
2. **拼音命中一律進待審名單，活躍者掛標籤、不判三無**（採納）：`isThreeNo` 語意不變，入名單閘門改為 `isThreeNo || pinyinNameMatch`。
3. 拼音直接判三無：把「可疑」與「證據確認」混為一談，且誤傷海外華人活躍真人，否決。

## 決定

- 判定公式維持 ADR 0024 版本不動。
- findings 推入閘門：`(result.isThreeNo || result.pinyinNameMatch) && !ignored`。
- 卡片標籤區分兩種拼音狀態：確認無內容者維持既有呈現；`pinyinNameMatch && !isThreeNo`（活躍）者掛「拼音命名・有活動」類琥珀色可疑標籤，並照常顯示內容證據。
- 名單維持人工逐筆確認（清除／安全名單／封鎖佇列），無批次自動封鎖，判斷留給使用者。
- 計分：拼音訊號維持 0 分資訊性，不動疑似假帳號分數公式。

## 後果

- 養號期（有發文）的拼音網軍帳號個體層級可見。
- 名單筆數增加，含活躍真人華人帳號的機率上升；靠標籤與內容證據讓使用者快速分辨，不自動封鎖故無不可逆風險。
- 依賴「findings 全是三無」假設的 UI 文案與統計需同步檢查。
