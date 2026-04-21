# Task 0: Backup Gate

## 背景

在 sync / trust / server-side 架構重構前，必須先保住現有 extension 功能線。

## 範圍

- 建立一個可回退的 backup commit。
- 記錄當前基線版本與目的。

## 不做什麼

- 不整理 unrelated changes。
- 不做功能調整。

## 實作步驟

1. 檢查 worktree 狀態。
2. 排除機器本地暫存檔案（如 `.wrangler`、`.ai`）。
3. 以當前狀態建立 backup commit。
4. 在 SDD / devlog 記錄 commit 與基線版本。

## 驗收條件

- git 可回退到 backup commit。
- commit message 明確標示為 pre-sync baseline。

## 相依關係

- 必須先於所有新文件與實作。
