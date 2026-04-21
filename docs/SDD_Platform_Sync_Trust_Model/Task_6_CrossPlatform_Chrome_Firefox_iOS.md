# Task 6: Cross-Platform Support

## 背景

Chrome / Firefox extension 與 iOS Userscript 能力不同，必須明確區分。

## 範圍

- 定義 Chrome、Firefox、iOS 三平台的同步與信任角色。
- 驗證既有封鎖功能不退化。

## 不做什麼

- 不要求三平台功能完全對齊。

## 平台能力矩陣

- Chrome：
  - 自動同步：有
  - 高信任主來源：是
- Firefox：
  - 自動同步：有
  - 高信任主來源：是
- iOS Userscript：
  - 自動同步：否 / 後續低頻補傳
  - 高信任主來源：否

## 驗收條件

- 平台說明與實際能力一致。
- iOS 既有封鎖功能與手動上傳不受新架構影響。

## 相依關係

- Task 1 sync UI
- Task 5 methodology 文案
