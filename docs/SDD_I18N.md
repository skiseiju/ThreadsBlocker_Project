# SDD: Product Internationalization

更新日期：2026-06-24

## 1. 背景

ThreadsBlocker 目前已具備一部分「跨 Threads 介面語言的自動化辨識」能力，例如封鎖、解除封鎖、讚、粉絲與追蹤中等平台文字會列出多國候選字串；但產品本身的 UI 文案、設定、toast、modal、manifest 名稱與 Userscript metadata 仍主要是繁中硬編碼。

本 SDD 目標是把「使用者看到的產品語言」正式抽成 i18n 架構，首版至少支援：

- 繁體中文：`zh-TW`
- English：`en`
- 日本語：`ja`
- 한국어：`ko`
- Español：`es`
- Français：`fr`

重要分界：

- Product i18n：留友封自己的 UI 顯示語言。
- Threads automation lexicon：為了在不同語言的 Threads 介面上找到「封鎖」「檢舉」「粉絲」等按鈕的匹配字串。

這兩者不可混在一起。使用者把留友封 UI 設成英文時，仍必須能操作繁中、日文或韓文的 Threads 介面；反過來也一樣。

## 2. 目標

- 建立集中式 i18n 字典與翻譯函式，取代主要 UI 的硬編碼產品文案。
- 首版支援 `zh-TW`、`en`、`ja`、`ko`、`es`、`fr` 六種產品語言。
- 支援自動偵測瀏覽器語言，並允許使用者在設定中固定選擇語言。
- Chrome / Firefox extension 使用瀏覽器標準 `_locales/messages.json` 支援商店與 manifest localization。
- Userscript 保留單一檔案輸出，但在產品 UI 內套用同一套 i18n 字典。
- 保留現有 Threads automation lexicon 的多語匹配行為，不因產品 UI 語言切換而縮窄匹配範圍。
- 支援日期、時間、數字格式依產品語言呈現。
- 不因新增語言偏好而重置資料上傳同意、每日自動/手動上傳偏好、queue、history、failed queue 或 debug state。

## 3. 非目標

- 不翻譯 Threads 平台自身文字。
- 不以產品語言推斷 Threads 介面語言。
- 不在首版支援 RTL 語系。
- 不把完整 UI 一次重構成框架式 renderer。
- 不變更封鎖、檢舉、三無掃描或 worker 的核心流程。
- 不因 manifest localization 變更而宣稱正式發布；正式版仍需使用既有 release 規範。

## 4. Current State

### 4.1 Product UI hardcoded strings

目前硬編碼產品文案分散於：

- `src/ui.js`：面板、設定、來源分析、報告 picker、三無管理、toast / confirm helper。
- `src/main.js`：入口事件、confirm 文案、toast 文案。
- `src/core.js`：收集、匯入匯出、診斷、手動動作提示。
- `src/worker.js`：worker title、進度、統計、錯誤狀態。
- `src/announcements.js` / `site/announcements.json`：公告內容。
- `src/manifest.json` / `src/manifest.firefox.json` / `build.sh`：extension 與 Userscript metadata。

### 4.2 Automation lexicon

目前平台操作匹配字串分散於：

- `CONFIG.BLOCK_TEXTS`
- `CONFIG.UNBLOCK_TEXTS`
- `CONFIG.LIKES_TEXTS`
- `CONFIG.FOLLOWERS_TEXTS`
- `CONFIG.FOLLOWING_TEXTS`
- report flow 內的 `REPORT_TEXTS`、`REPORT_ACCOUNT_TEXTS`、`CONFIRM_TEXTS` 等

這些字串是操作 Threads 介面需要的偵測資料，不是產品 UI 翻譯資料。未來可整理命名，但不應被產品語言選項直接取代。

## 5. 核心設計

### 5.1 Locale resolution

新增產品語言解析順序：

1. 使用者設定：`CONFIG.KEYS.APP_LOCALE`
2. 瀏覽器語言：`navigator.languages` / `navigator.language`
3. 預設：`zh-TW`

語言 normalize 規則：

| Input examples | Product locale |
|---|---|
| `zh-TW`, `zh-Hant`, `zh-HK`, `zh-MO` | `zh-TW` |
| `en`, `en-US`, `en-GB` | `en` |
| `ja`, `ja-JP` | `ja` |
| `ko`, `ko-KR` | `ko` |
| `es`, `es-ES`, `es-MX`, `es-419` | `es` |
| `fr`, `fr-FR`, `fr-CA` | `fr` |
| unsupported | `zh-TW` |

### 5.2 Translation module

新增 `src/i18n.js`，提供單一 API：

```js
export const I18N = {
    SUPPORTED_LOCALES: ['zh-TW', 'en', 'ja', 'ko', 'es', 'fr'],
    DEFAULT_LOCALE: 'zh-TW',
    getLocale(),
    setLocale(locale),
    normalizeLocale(locale),
    t(key, params),
    formatNumber(value, options),
    formatDate(value, options),
    formatTime(value, options),
};
```

`t(key, params)` 規則：

- 找不到 key 時回退 `zh-TW`。
- `zh-TW` 也找不到時回傳 key，並在 debug log 記錄 missing translation。
- 支援 `{name}`、`{count}` 這類簡單 placeholder。
- 不使用 eval 或動態 template function。

### 5.3 Translation dictionary

首版使用 source-bundled dictionary，避免 build pipeline 先引入額外 JSON loader：

```js
const MESSAGES = {
    'zh-TW': {
        'panel.settings': '設定',
        'action.startBlock': '開始封鎖',
    },
    en: {
        'panel.settings': 'Settings',
        'action.startBlock': 'Start blocking',
    },
};
```

命名規則：

- `app.*`：產品名稱、版本、共用標籤。
- `panel.*`：主面板。
- `settings.*`：設定 modal。
- `actions.*`：按鈕與 command。
- `toast.*`：toast。
- `confirm.*`：confirm modal。
- `report.*`：只檢舉與 report picker。
- `worker.*`：worker title / progress / stats。
- `threeNo.*`：三無掃描與待審清單。
- `analytics.*`：來源分析、匯出、平台上傳。
- `diagnostics.*`：診斷與 debug UI。
- `errors.*`：錯誤與 fallback。
- `units.*`：人、筆、秒、分鐘、小時等單位。

### 5.4 Placeholder and grammar strategy

不同語言不應用字串拼接硬湊語序。所有含變數的文案必須以完整句子為單位：

```js
I18N.t('toast.blockQueueAdded', { count: 12 })
```

而不是：

```js
'已提交 ' + count + ' 筆至背景佇列'
```

首版 plural 規則先採兩段式：

- key 無變化：適合中日韓與可接受的簡化英文。
- key 有 `.one` / `.other`：英文、法文、西文需要自然呈現時使用。

```js
I18N.tCount('toast.userCount', count, { count })
```

若不想先增加 `tCount()`，可在 `t()` 內根據 `count === 1` 自動找 `.one` / `.other`。

### 5.5 UI language setting

設定 modal 新增「介面語言」：

- 自動：跟隨瀏覽器
- 繁體中文
- English
- 日本語
- 한국어
- Español
- Français

儲存值：

- `auto`
- `zh-TW`
- `en`
- `ja`
- `ko`
- `es`
- `fr`

Storage key：

- `hege_app_locale`

此 key 是純 UI preference，不是資料範圍或同意政策版本；不得觸發平台同步重新同意。

### 5.6 Manifest localization

Chrome / Firefox extension 應新增：

```text
src/_locales/
  zh_TW/messages.json
  en/messages.json
  ja/messages.json
  ko/messages.json
  es/messages.json
  fr/messages.json
```

Manifest 使用：

```json
{
  "default_locale": "zh_TW",
  "name": "__MSG_extName__",
  "description": "__MSG_extDescription__"
}
```

`build.sh` 必須把 `_locales` 複製到：

- `dist/extension/_locales`
- `dist/firefox/_locales`

Userscript metadata 不支援同等的瀏覽器 localization。首版 Userscript header 可維持繁中 + English 混合名稱，但實際產品 UI 進入頁面後使用 `I18N`。

### 5.7 Date / number formatting

所有顯示用日期與數字格式改用：

- `I18N.formatDate(...)`
- `I18N.formatTime(...)`
- `I18N.formatNumber(...)`

避免在 UI 中固定：

```js
toLocaleString('zh-TW')
toLocaleDateString('zh-TW')
```

例外：

- payload schema、audit log 或後端 API 若要求固定格式，仍使用既有資料格式，不跟 UI locale 變動。
- 診斷原始資料可保留 ISO 或 machine-readable 格式。

## 6. ADR

### ADR 0001：產品語言與 Threads 操作語言分離

使用者 UI locale 只影響留友封自己的 UI，不影響 `BLOCK_TEXTS`、`REPORT_TEXTS` 等 Threads 操作匹配字串。自動化匹配必須盡量跨語言全量匹配，避免因 UI 切成英文就無法操作繁中 Threads。

### ADR 0002：首版 dictionary 直接 bundled in source

先用 `src/i18n.js` 內建 messages，降低 build 複雜度。等 key 穩定後，再考慮拆成 `src/locales/*.json`。

### ADR 0003：繁中是 canonical fallback

現有產品語氣、功能命名與使用者基礎以繁中為主。首版以 `zh-TW` 作為完整度最高的 canonical fallback。

### ADR 0004：先翻產品 UI，不翻歷史資料內容

歷史紀錄中已保存的使用者輸入、來源片段、report path、debug log 不做 retroactive 翻譯，只翻 UI label 與新產生的產品提示。

### ADR 0005：語言 preference 不屬於 consent policy

新增或修改 `hege_app_locale` 不得重置：

- `hege_platform_sync_consent_version`
- `hege_platform_sync_enabled`
- `hege_platform_sync_last_at`
- `hege_platform_source_id`
- queue / history / failed queue / debug state

## 7. Proposed Changes

### 7.1 [ADD] `src/i18n.js`

新增產品 i18n module，包含：

- supported locale registry
- locale normalize
- locale storage read/write
- translation lookup
- placeholder interpolation
- date/time/number formatting
- missing key debug logging

### 7.2 [MODIFY] `src/config.js`

新增：

- `CONFIG.DEFAULT_LOCALE = 'zh-TW'`
- `CONFIG.SUPPORTED_LOCALES`
- `CONFIG.KEYS.APP_LOCALE = 'hege_app_locale'`

保留 automation lexicon：

- `BLOCK_TEXTS`
- `UNBLOCK_TEXTS`
- `LIKES_TEXTS`
- `FOLLOWERS_TEXTS`
- `FOLLOWING_TEXTS`
- report flow matching constants

### 7.3 [MODIFY] `build.sh`

- bundle order 加入 `i18n.js`，位置建議在 `storage.js` 之後、`ui.js` 之前。
- Chrome build 複製 `src/_locales`。
- Firefox build 複製 `src/_locales`。
- artifact parity 檢查新增 `_locales` 存在檢查。

建議 bundle order：

```text
config.js
announcements.js
utils.js
storage.js
i18n.js
reporter.js
ui.js
core.js
...
```

### 7.4 [MODIFY] `src/manifest.json`

- 加入 `default_locale: "zh_TW"`。
- `name` 改為 `__MSG_extName__`。
- `description` 改為 `__MSG_extDescription__`。

### 7.5 [MODIFY] `src/manifest.firefox.json`

同 Chrome manifest。Firefox MV2 支援 `_locales`，但需實測 AMO package 是否接受目前欄位組合。

### 7.6 [ADD] `src/_locales/*/messages.json`

首版至少包含：

- `extName`
- `extDescription`

建議文案：

| Locale | extName |
|---|---|
| `zh_TW` | `留友封 (Threads Block Tool)` |
| `en` | `Threads Block Tool` |
| `ja` | `Threads ブロックツール` |
| `ko` | `Threads 차단 도구` |
| `es` | `Herramienta de bloqueo para Threads` |
| `fr` | `Outil de blocage pour Threads` |

### 7.7 [MODIFY] `src/ui.js`

優先 i18n 化：

1. 主面板可見按鈕與 tab / section title。
2. 設定 modal。
3. report picker。
4. 來源分析與平台上傳區。
5. 三無管理清單。
6. toast / confirm helper 的 button labels。

注意：

- 不改版型結構。
- 不改按鈕數量與位置。
- 新增語言選擇器必須放在既有設定 modal 規則內。
- 新增第三顆按鈕或多語造成換行時，需固定 mobile / desktop 排列。

### 7.8 [MODIFY] `src/main.js`

把入口事件內的 toast / confirm 文案改為 `I18N.t(...)`。

若涉及 `src/main.js`，實作前必須先閱讀 `docs/BLOCKING_ARCHITECTURE.md`，並避免改動封鎖入口流程。

### 7.9 [MODIFY] `src/core.js`

把非 Threads 操作匹配用的 UI 文案改為 `I18N.t(...)`。

保留：

- Threads DOM matching
- automation lexicon
- block/report path behavior

若涉及 `src/core.js`，實作前必須先閱讀 `docs/BLOCKING_ARCHITECTURE.md`。

### 7.10 [MODIFY] `src/worker.js`

worker 頁面 title、progress、stats label、錯誤訊息套用 i18n。

若涉及 `src/worker.js`，實作前必須先閱讀 `docs/BLOCKING_ARCHITECTURE.md`，尤其不可改變 iOS navigation 安全限制。

### 7.11 [MODIFY] `src/features/report-flow.js`

只翻產品顯示文案與 debug UI。不要把 report option matching 改成只依目前 product locale。

### 7.12 [MODIFY] `src/announcements.js`

公告支援 locale map：

```js
{
    id: '...',
    title: { 'zh-TW': '...', en: '...' },
    body: { 'zh-TW': '...', en: '...' },
}
```

首版允許非繁中 locale fallback 到 `zh-TW`，但 UI 應有能力讀 locale map。

## 8. Translation Key Coverage Plan

### Phase 1：Foundation

- `src/i18n.js`
- `CONFIG.KEYS.APP_LOCALE`
- 設定 modal 語言選擇器
- manifest `_locales`
- 日期/數字 formatter helper

### Phase 2：Primary UI

- 主面板
- 設定 modal
- toast / confirm helper default labels
- report picker

### Phase 3：Advanced UI

- 來源分析
- 平台上傳同意與 disclosure
- 三無掃描與管理視窗
- worker 進度頁

### Phase 4：Docs / Store Surface

- Chrome / Firefox listing draft 對齊六語短描述。
- README 可維持繁中為主，但新增 English summary。
- Announcements 支援 locale map。

## 9. Storage / Migration Impact

新增 storage key：

| Key | Type | Default | Migration |
|---|---|---|---|
| `hege_app_locale` | string | `auto` | 不需要；缺省即自動 |

不得修改或重置：

- `hege_platform_sync_enabled`
- `hege_platform_sync_consent_version`
- `hege_platform_sync_last_at`
- `hege_platform_source_id`
- `hege_pending_users`
- `hege_active_queue`
- `hege_report_queue`
- `hege_failed_queue`
- `hege_report_failed_queue`
- `hege_block_db_v1`
- `hege_report_history`
- `hege_debug_log`

Preference regression check：

1. 舊版沒有 `hege_app_locale` 時，自動偵測語言。
2. 設成 `en` 後 reload 仍維持英文。
3. 切回 `auto` 後跟隨瀏覽器語言。
4. 升版不重問平台上傳同意。
5. 升版不清 queue/history/failed queue。

## 10. Privacy / Consent

產品 UI 語言可以存在本機 localStorage。若未來上傳 payload 想帶產品語言，必須先確認它是否屬於既有 exporter metadata 範圍。

首版建議：

- 不新增上傳欄位。
- 既有 `exporter.locale` 若使用 `navigator.language`，保持不變。
- 不因產品 locale preference 改變平台 payload schema。

若未來把 `appLocale` 上傳到平台，需更新：

- disclosure 文案
- `CHANGELOG.md`
- payload schema / tests
- consent policy 是否需要升版的判斷

## 11. Testing Plan

### 11.1 Unit / static checks

- `I18N.normalizeLocale()` 覆蓋六語與 fallback。
- `I18N.t()` 覆蓋：
  - existing key
  - fallback key
  - missing key
  - placeholder interpolation
  - count one/other
- 檢查每個 locale 都有 `zh-TW` canonical key set。
- 檢查 `_locales/*/messages.json` JSON valid。

### 11.2 Build checks

每次程式碼修改後依專案規範：

- bump `src/config.js` beta version。
- 使用 `./build.sh --no-bump`。
- 確認 Userscript header version、`dist/extension/content.js` injected version、manifest version、zip 版本一致。
- 確認 `dist/extension/_locales` 與 `dist/firefox/_locales` 存在。

### 11.3 Manual smoke test matrix

至少測：

| Product locale | Browser / package | Must verify |
|---|---|---|
| `zh-TW` | Chrome extension | 現有繁中 UI 無退化 |
| `en` | Chrome extension | 主面板、設定、toast、report picker 可讀 |
| `ja` | Userscript / Safari iOS | UI 顯示日文，封鎖入口仍可用 |
| `ko` | Chrome extension | 設定語言保存 reload |
| `es` | Firefox extension | manifest name/description localization |
| `fr` | Chrome extension | 日期與數字不固定 zh-TW |

### 11.4 Automation regression

需驗證產品語言切換不影響 Threads 操作：

1. Product locale = `en`，Threads UI = 繁中：封鎖匹配仍成功。
2. Product locale = `zh-TW`，Threads UI = English：封鎖匹配仍成功。
3. Product locale = `ja`，Threads UI = 한국어：可找到既有多語 lexicon 覆蓋的主要入口。
4. Report flow 不因 product locale 限縮 `REPORT_TEXTS`。

若碰到檢舉/封鎖/worker/storage，仍需依專案規範驗證：

- Threads 畫面成功 -> worker/report stats 也記 success。
- 找不到介面不得吞掉已成功送出的結果。
- queue / history / failed queue 不污染。

## 12. Acceptance Criteria

- 使用者可在設定中選擇 `auto`、繁中、English、日本語、한국어、Español、Français。
- 選擇語言後，主面板、設定、toast/confirm、report picker 至少 90% user-facing strings 使用目標語言。
- Chrome / Firefox manifest name / description 支援 `_locales`。
- Userscript build 可正常輸出，且 UI 使用同一套 i18n 字典。
- 日期、時間、數字顯示不再在主要 UI 中固定 `zh-TW`。
- Product locale 切換不影響 Threads automation lexicon。
- 升版不重置平台上傳同意、自動/手動同步偏好、queue、history、failed queue。
- `./build.sh --no-bump` 成功，artifact parity 檢查通過。
- installed truth 檢查顯示實際載入版本為本次 beta。

## 13. Rollout Plan

1. 先做 beta，不做正式版。
2. 以 `zh-TW` 為 canonical key，逐步替換 UI strings。
3. 每替換一批高風險 UI，做一次 smoke test。
4. 完成六語 key coverage 後才整理 store listing / README。
5. 若正式版發布，需依專案正式版流程更新 README、CHANGELOG、release artifact 與 rollback reference。

## 14. Open Questions

- `zh-HK` / `zh-MO` 是否仍使用繁中台灣文案，或未來拆成 `zh-Hant`？
- `es` 首版採歐洲西文還是拉美中性西文？建議採中性西文。
- `fr` 首版採法國法文還是加拿大法文？建議採中性法文。
- 公告是否首版就全六語，或允許非繁中 fallback？
- Debug / diagnostics 是否完全翻譯，或保留部分繁中/英文以利開發者排查？
