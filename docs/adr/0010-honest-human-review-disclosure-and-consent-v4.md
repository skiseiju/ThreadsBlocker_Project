# ADR 0010：誠實揭露人工原文覆核，並將平台同意升為 platform-sync-v4

- 日期：2026-07-22
- 狀態：已採納
- 相關：ADR 0009（去識別樣本公開）、`docs/CWS_PRIVACY_PRACTICES_2.8.0.md`、`site/privacy/index.html`

## 背景

2.8.0 送審前的合規盤點發現兩件事：

1. 隱私頁 §8 舊文寫「禁止無關人工讀取：不讓人員任意閱讀使用者資料……只有使用已彙整/去識別化資料做內部維運」。但 `cf_bug_admin` 的 `deidentifySampleText()` 只是 regex 遮罩（handle、URL、台灣電話），不處理中英文人名、地址、Email local-part、國際電話與獨特全文；輸出通常保留近乎逐字原文，反查風險高。
2. 所有 admin endpoint 共用同一個 `ADMIN_TOKEN`，admin platform overview 可直接取得 raw `source_url`、`source_owner`、`source_text_sample`。就算只把 sample-review endpoint 改成投影去識別版本，raw 仍可從另一條 API 取得，不構成真正的 access-control boundary。

也就是說，舊文案宣稱的保護程度高於程式實際做到的程度。CWS 這次退件（Purple Nickel，credentials 揭露不足）正是同一類問題：文案與程式不一致。

## 選項

- **A：把去識別做到真的匿名。** 需要多語 NER、Email／全球電話／地址／ID detector、高風險輸出拒絕與抽樣驗證，且獨特全文仍可能被搜尋引擎反查——無法保證匿名。成本高、承諾仍不可靠。
- **B：reviewer 只看遮罩版，拆 role/token。** 方向正確，但要同時改 reviewer role、raw endpoint、audit 與 admin overview 投影才有意義；範圍大，會擋住送審。
- **X（採用）：誠實揭露＋取得明確同意。** 不宣稱匿名，改為明載「授權人員可能在必要範圍內讀取使用者已同意上傳的公開內容，包括可能可識別的原文」，用途限濫用偵測、資料品質維護與被檢舉個案覆核，並在同意 UI 取得明確同意。

## 決定

1. 採 X。隱私頁 §5 新增「人工覆核」項、§8 將「禁止無關人工讀取」改為「必要人工讀取」，`docs/CWS_PRIVACY_PRACTICES_2.8.0.md` 同口徑；不再宣稱內容已匿名或人員只見去識別版本。
2. 同一句揭露加入 platform 同意視窗（`src/ui.js`）。
3. **`PLATFORM_SYNC_CONSENT_POLICY_VERSION` 由 `platform-sync-v3` 升為 `platform-sync-v4`。** 「授權人員可能讀取可識別原文」是人員存取範圍的實質揭露，不是文句潤飾；`hasPlatformSyncConsentForCurrentVersion()` 是字串完全相等比對，不升版的話既有 v3 使用者永遠看不到新增那句，等於沒有對這項人工讀取取得明確同意。
4. B 的 reviewer role 隔離、raw access 逐案 audit 與 admin overview 角色投影，列為**送審後 follow-up**，並在文件中如實記為未完成，不寫成已完成。

## 後果

- 既有已同意 v3 的使用者會再看到一次同意視窗；在重新同意前，auto、repair、manual 與三無統計上傳全部 blocked（fail-closed）。這是預期行為，不是 regression。
- 舊 v3／v2／數字版同意一律不 migration 成 v4，與既有 gate 行為一致，不需要新增 migration 程式碼。
- 使用者的自動／手動偏好（`PLATFORM_SYNC_ENABLED`）保留，但不能越過 policy gate。
- 對外文案的保護承諾下修到與程式一致；代價是揭露變得直白，可能降低部分使用者的上傳意願。這是刻意取捨：可驗證的誠實優先於好聽但做不到的承諾。
- `ADMIN_TOKEN` 單一 token 旁路仍存在，屬已知風險，送審後處理。

## 驗證

規則已寫進 `cf_bug_admin/tests/privacy_release.test.mjs`，非文件約定：

- `PLATFORM_SYNC_CONSENT_POLICY_VERSION: 'platform-sync-v4'` 斷言。
- 存有 `platform-sync-v3` 的使用者必須 `hasPlatformSyncConsentForCurrentVersion() === false` 且上傳 blocked。
- 同意 UI 與隱私頁必須含人工覆核揭露句；隱私頁不得殘留 `TODO（送審前完成）`。
- runtime 檔不得出現 `page_bridge` 字樣，`src/manifest.json` 不得有 `web_accessible_resources` / `permissions`（呼應隱私頁「不含擷取 token 的 page bridge」）。

`node --test cf_bug_admin/tests/*.test.mjs` 25/25 PASS；`node --test tests/*.test.mjs` 231/231 PASS。
