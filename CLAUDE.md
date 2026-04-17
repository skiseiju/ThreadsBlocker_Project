# 留友封 (ThreadsBlocker)

Threads 批量封鎖 Chrome Extension（Manifest V3）。

## 技術棧
- JavaScript（原生，無框架）
- Chrome Extension Manifest V3
- Tampermonkey Userscript（雙版本）

## 專案結構
- `src/` — 原始碼（core.js, main.js, ui.js, utils.js, storage.js）
- `build.js` — 打包腳本
- `build.sh` — 完整 build 流程
- `push.sh` — 發布流程
- `CHANGELOG.md` — 版本記錄
- `docs/` — 說明文件

## 注意事項
- 修改後執行 `bash build.sh` 重新打包
