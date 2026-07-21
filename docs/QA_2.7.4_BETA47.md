# ThreadsBlocker 2.7.4-beta47 QA 計畫

## 範圍與測試分層

本計畫針對 beta47 的共用 More locator、封鎖／只檢舉失敗原因拆分、queue/cooldown 保全，以及 `debug_context_v2` 隱私邊界。測試證據分成：

1. **自動 DOM fixture**：Playwright headless Chromium 載入 `src/more-locator.js` 的實際實作，使用最小 Threads-like DOM；證明 locator 的 DOM scope、route guard 與延遲載入行為，不等同使用者已安裝版本。
2. **自動 source／unit gate**：既有 `beta47-safety-regression.test.mjs`、`report-flow-timing.test.mjs`、`three-no-watch-finish-scan.test.mjs`，以及 syntax/build/parity 檢查；用來鎖定 queue、cooldown、privacy schema 與報告流程的分支契約。
3. **人工 installed Chrome truth**：需在使用者目前 Chrome profile 的 Threads 分頁與 beta47 unpacked extension 實測；headless fixture、build 成功或 dist artifact 不可替代。

## 自動 DOM fixture 行為矩陣

| Case | Fixture／操作 | 預期 | 證據層級 |
|---|---|---|---|
| 正常 profile More | profile header、`Followers` 訊號、`aria-label="More"` | 命中 header More | DOM fixture |
| 正常 post More | article／pressable container、`/@user/post/...` link、More | `mode=post` 命中該 article More | DOM fixture |
| 正常 row More | listitem、profile link、三圓點 shape fallback | `mode=row` 命中 row More | DOM fixture |
| 興趣 tag/link | More 包在 search／interest `<a>` | link candidate 拒絕，不觸發導航 | DOM fixture + source gate |
| search route | `/search`、`serp_type=tags` | `search_tags` 且 unsafe，無候選 | DOM fixture |
| tags route | `/tags/...` | `tags` 且 unsafe，無候選 | DOM fixture |
| 全域 More | 無 profile／post／row scope 的全域按鈕 | 不可當作 profile target | DOM fixture |
| 慢載入 menu | 初始無 More，延遲 append More | polling 前為 null，append 後可命中 | DOM fixture |
| 空 menu | More 存在但無 `[role=menuitem]` | 保留 target；呼叫端應回 `menu_not_found`，不得推論 rate limit | DOM fixture + source gate |
| 私人帳號（正向 scoped state） | target profile 的 main/header scope 明確標示 `Private account`，且不是其他 dialog／sidebar／body 文案 | `private_manual_required` | source／分支 gate；需 Chrome truth |
| 私人字串誤植 | 只有 body 其他區域／dialog 出現 `Private account`，target profile 未進入 private state | 不得誤判 private；走正常 locator／menu 分支 | source／人工 Chrome truth |
| 明確限制訊息 1 次 | alert/dialog 具 Threads restriction phrase | 僅記錄一次限制訊號，不進 cooldown | source／state gate；需 Chrome truth |
| 明確限制訊息 2 次 | 連續第二筆 restriction | 累計 2/3，仍不進 cooldown | source／state gate；需 Chrome truth |
| 明確限制訊息 3 次 | 連續第三筆 restriction 且 protection enabled | 進 12h cooldown，完整名單搬到 cooldown queue | source／state gate；需 Chrome truth |
| 只檢舉明確限制 | report flow 收到 restriction signal | 顯示提示、跳過目前項目並讓 report queue 繼續；不共用封鎖 worker 三次 cooldown | source／人工 Chrome truth |
| 導航異常 | 點 More 後 route 變 search/tags 或不符 expected | `navigation_mismatch`，移出 active、進 failed、繼續下一筆 | DOM helper + source／state gate |

## Queue／cooldown 狀態轉移

以不會丟資料為 gate：

- `success`／already 狀態：只移除 active head、更新 block DB；不增加 failed/cooldown。
- `failed`、`menu_not_found`、`navigation_mismatch`、`private_manual_required`、`vanished`：active head 移至對應 failed／結果統計，後續 queue 順序保留。
- 單次 `rate_limited` 或 `cooldown` 訊號：累計計數並保留其餘 active queue，不得誤觸發 12h lock。
- 第三次明確限制（且 protection enabled）：`sessionQueue`、近期最多 50 筆 rollback、剩餘 `BG_QUEUE` 與 `FAILED_QUEUE` 去重後完整寫入 `COOLDOWN_QUEUE`；清空 operational queues，保存 `COOLDOWN` timestamp。
- 只檢舉流程的 restriction 是提示＋跳過／queue 繼續，不增加封鎖 worker 的三次 cooldown counter，也不搬移 `COOLDOWN_QUEUE`。
- cooldown 到期：`COOLDOWN_QUEUE` 合併回 `BG_QUEUE`，以 username 去重，資料不得遺失。
- stop／exception／private／timeout：不得留下永久 running lock；failed reason 要可重試或明確清除。

自動 gate 以 source regression 與可重現的 state model 檢查契約；實際第三次限制、reload、localStorage 合併需在 Chrome truth 腳本驗證。

## `debug_context_v2` 隱私測試

- 未勾選診斷同意：request 只送使用者 message／level 等必要欄位；不得附 `metadata` 診斷 bundle。
- 明確勾選且僅限本次：才附上診斷 context；送出前 scrub token、cookie、authorization、canary。
- schema 固定 `threadsblocker.debug_context_v2`；事件只含 enum `stage/result/routeType`、counts、timestamp。
- 事件最多保留最近 25 筆；寫入時清理超過 48 小時事件，snapshot `expiresAt` 為 48 小時後。
- `REPORT_FAILURE_SNAPSHOT` 與 `REPORT_DEBUG_CONTEXT_V2` 彼此隔離於一般 block/report queue；只有同一只檢舉流程成功或 bug report 成功送出才清除相應 snapshot；無關的封鎖／解鎖成功不得清除它。
- 禁止帳號 username、貼文文字、完整 URL、DOM、token/cookie/authorization 進入 snapshot 或 message-only payload。

## Build／order／parity／syntax

建議命令（只讀或產生本次 QA artifact；不發布）：

```sh
SKIP_SAFARI_DEPLOY=true ./build.sh --no-bump
node --test tests/beta47-dom-fixture.test.mjs \
  tests/beta47-debug-context.test.mjs \
  tests/beta47-report-context.test.mjs \
  tests/beta47-report-only-queue.test.mjs \
  tests/beta47-safety-regression.test.mjs \
  tests/report-flow-timing.test.mjs \
  tests/three-no-watch-finish-scan.test.mjs
node --check dist/extension/content.js
unzip -p dist/extension.zip content.js | node --check --input-type=commonjs
```

檢查 `src/config.js`、UserScript banner、extension manifest、`dist/extension/content.js`、zip 內 content 與 versioned zip 的版本／內容一致；beta build 應含 `background.js`，正式版不應含 beta-only background。確認 bundle order 為 config → utils/storage → more-locator → reporter/ui/core → features → worker → main，且沒有未驗證歷史 zip 混入。

## 人工 Chrome 實機腳本（需使用者提供）

1. 使用者提供目前 Chrome profile 中 Threads tab 的版本、URL、是否已載入 beta47 unpacked extension；不要提供 cookie、token 或回報敏感欄位。
2. 以本次 build 的 `dist/extension` 載入／reload unpacked extension，確認 manifest/content breadcrumb 為 `2.7.4-beta47`。
3. 在 profile、post、row More 各執行一次封鎖與只檢舉（可用測試帳號／可撤銷動作）；確認沒有點到全域 More、search/tags link 或貼文導航。
4. 測試 menu 延遲（等待 3 秒以上）、空 menu、私人帳號；確認 UI 顯示可重試／需手動，不顯示假 rate limit/cooldown。
5. 依序重現限制訊息 1、2、3 次；檢查 `BG_QUEUE`、`FAILED_QUEUE`、`COOLDOWN_QUEUE`、`COOLDOWN` 的數量與 username 不丟失。只回報 counts／enum，不貼出帳號或文字。
6. 開啟問題回報：不勾診斷仍可送 message；第二次明確勾選才附診斷；檢查 network payload 不含帳號、貼文文字、完整 URL、DOM、token/cookie。
7. 完成一筆成功只檢舉或 bug report 送出後確認相應 failure snapshot 清除；另完成一筆無關的成功封鎖／解鎖，確認 report snapshot 仍保留。重新載入頁面確認不重複處理、不留下永久 worker lock。

**需要使用者提供**：目前 Chrome／Threads tab 的版本與 URL 類型、beta47 unpacked loaded version、每個 case 的 pass/fail 與 queue counts；不要提供 cookies、authorization、request body、帳號名單或完整貼文內容。

## Pass／Fail gate 與 rollback reference

**PASS**：DOM fixture 全通過；既有 source/state/privacy/timing tests 全通過；build、order、parity、syntax 無錯；Chrome truth 完成上述腳本且無錯誤 console、無資料遺失、無 Universal Links／錯誤導航；message-only 與 opt-in diagnostics 邊界符合預期。

**FAIL／blocker**：任何 locator 誤點 link／全域 More、search/tags 未 fail-closed、單次限制誤觸 cooldown、queue 或 cooldown queue 丟失、未同意即送診斷、snapshot 含敏感內容、build/parity/syntax 失敗，或 installed Chrome 版本不是本次 beta47。

Rollback reference：回到本次 beta47 之前最後一個已驗證 artifact／source commit（beta46），先停用 beta47 unpacked extension，再重新載入該 artifact；確認 `BG_QUEUE`、`FAILED_QUEUE`、`COOLDOWN_QUEUE`、`COOLDOWN` 與 block/report DB 只讀備份後再重試。不得使用歷史未驗證 zip，不得在未取得批准時 deploy、publish、push 或執行 D1 mutation。
