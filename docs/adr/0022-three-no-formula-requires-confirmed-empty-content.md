# ADR 0022：三無判定公式改為必須有「確認過的無內容」證據

- 日期：2026-08-12
- 狀態：已採納
- 相關：[ADR 0021](0021-daily-block-window-success-only.md)（封鎖窗口計數，不管判定公式）、`src/features/three-no-watch.js`（判定唯一站點 `:3000`）、`docs/handoff/2026-08-12-three-no-false-positive-and-pattern-research.md`（調查交接）、`docs/handoff/evidence/three-no-findings-2026-08-12.json`（62 筆實機取證）

## 背景

使用者掃 1,513 個追蹤者，62 筆被判三無（53 筆來自 inseptembers 掃描、9 筆來自 hellohanahsu 舊掃描）。人工抽查發現多個活躍發文的真人被判三無。

2026-08-12 導出全部 62 筆 findings 的觸發旗標逐筆統計（證據檔見上），結論：

- 內容偵測層零誤判：全部 `noPosts: true` 的 reason 都是 `explicit_empty:` 加實際匹配到的空狀態字樣（0 筆非標準 reason、0 筆 timeout 誤判）；先前懷疑的空狀態競態（缺陷甲乙丙）在本批資料中從未發作。
- 誤判全部來自公式：舊公式 `noAvatar && (noBio || noPosts || noReplies || noReposts || suspiciousUsername || isPrivate)` 是六選一 OR。62 筆中 60 筆 `noBio: true`，「無頭像＋無簡介」即成立；12 筆三個分頁全部 `content_found` 的活躍真人純因此中獎。另 17 筆為私密帳號，`isPrivate` 單獨成立（2.7.1 設計）。

## 選項

1. **無簡介與私密降級為輔助訊號，成立必須有至少一項確認過的無內容**（採納）。代價：私密帳號永不判三無（內容旗標對私密帳號強制 false），漏判方向。
2. 只把 `noReposts` 移出 OR（Fable 假說）。代價：無簡介仍單獨成立，12 個活躍真人誤判一個都修不掉，實測不成立。
3. 改計分制。代價：門檻要重新校準，而名冊統計已因母體偏誤全部作廢，現在沒有可靠資料定分數。

## 決定

公式改為：

```
isThreeNo = noAvatar && (noPosts || noReplies || noReposts || suspiciousUsername)
```

- `noBio` 與 `isPrivate` 不再是獨立成立條件，僅保留為報告畫面的顯示訊號（`src/ui.js` 計分顯示不動）。
- `noPosts / noReplies / noReposts` 語意不變：僅在 `known: true`（`content_found` 或 `explicit_empty`）時為 true，timeout 不算。

## 後果

- 用 62 筆實機資料重算：12 個三頁全有內容的真人全部排除、17 個私密帳號全部排除，剩 33 筆至少一頁確認為空的帳號維持三無。
- 私密帳號改走漏判方向。若之後要撈回私密帳號，需另立訊號（例如粉絲 0＋新帳號），屆時另開 ADR。
- 撤銷 ADR 之前 2.7.1 把 `|| isPrivate` 加入公式的決定。
