# Release content

正式版的更新視窗只有 `release-intro.md` 需要每次手動編輯。最近更新會依 `src/config.js` 的版號，自動從 `CHANGELOG.md` 對應的正式版段落產生；不需要修改 JSON、`src/ui.js` 或 `src/release-notes.js`。

## 要改哪個檔案

- `release-intro.md`：唯一的日常手編檔。`#` 是開發者近況標題，下面寫段落與 `[文字](網址)`；`## 支持訊息` 下方是底部支持文案。
- `src/config.js`：Build 讀取 `CONFIG.VERSION`，beta 版會自動使用前面的正式版號，例如 `2.7.4-beta86` 對應 `2.7.4`。
- `CHANGELOG.md`：Build 讀取目前版與前三個正式版的 `TL;DR` 作為最近更新，並自動移除摘要開頭重複的版號。未先補正式版段落時，Build 會直接失敗提醒。
- `src/announcements.js` 與 `site/announcements.json`：獨立公告 feed，不是升版內容，普通 Build 不會改動。

## 發版流程

1. 編輯 `release-intro.md`；新正式版本另照原流程更新 `src/config.js` 與 `CHANGELOG.md`。
2. 執行 `node scripts/generate-release-content.mjs --check` 可檢查 intro、版號、CHANGELOG 與 generated file 是否同步。
3. 執行 `./build.sh --no-bump` 或正式版既有 build 命令。Build 會先自動產生：
   - `src/release-notes.js`
4. `src/release-notes.js` 應與內容檔一起納入該次 commit，讓直接 ESM 測試與 build 保持一致。

Intro Markdown 只使用一般標題、段落與 `[文字](網址)` 連結；不需要寫 HTML。若必要欄位、外部連結、版號或 CHANGELOG 正式版段落不合法，產生器會讓 build 直接失敗，不會默默沿用舊內容。
