# Bug Admin / Platform Analytics（Cloudflare Worker + D1）

## 1) 建立 D1

```bash
cd cf_bug_admin
npx wrangler d1 create threadsblocker_bug_admin
```

建立後把 `database_id` 填入 `cf_bug_admin/wrangler.toml`。

## 2) 套用資料表

```bash
cd cf_bug_admin
npx wrangler d1 execute threadsblocker_bug_admin --remote --file=sql/schema.sql
```

## 3) 設定 Worker Secret

```bash
cd cf_bug_admin
npx wrangler secret put BUG_REPORT_SALT
npx wrangler secret put ADMIN_TOKEN
```

- `BUG_REPORT_SALT` 必須和 `src/config.js` 一致
- `ADMIN_TOKEN` 是 admin 頁面登入 token

## 4) 部署 Worker

```bash
cd cf_bug_admin
npx wrangler deploy
```

部署後你會拿到 Worker URL，例如：
`https://threadsblocker-bug-admin.<your-subdomain>.workers.dev`

## 5) 更新 Extension / Userscript 端

更新 `src/config.js`：

- `BUG_REPORT_URL`: `https://app.skiseiju.com/api/v1/reports/bug`
- `BUG_REPORT_FALLBACK_URLS`: 保留 workers.dev / GAS 作備援
- `PLATFORM_UPLOAD_URL`: `https://app.skiseiju.com/api/v1/platform/ingest`

## 6) 使用 Admin 平台

開啟：`https://app.skiseiju.com/admin/`（本地開發仍可用 `/site/admin/index.html`）

需填：
- API Base：預設 `window.location.origin`（部署後就是 `https://app.skiseiju.com`）
- Admin Token：第 3 步設定的 `ADMIN_TOKEN`

## API 摘要

- `POST /api/v1/reports/bug`：公開寫入 bug
- `POST /api/v1/platform/ingest`：公開寫入平台分析上傳（schema: `threadsblocker.platform_upload.v2`）
- `GET /api/v1/admin/bugs`：查詢列表（需 Bearer token）
- `GET /api/v1/admin/stats`：統計（需 Bearer token）
- `GET /api/v1/admin/platform/overview`：平台議題分析總覽（需 Bearer token）
- `PATCH /api/v1/admin/bugs/:id`：更新狀態（需 Bearer token）

## 平台分析資料策略（法規風險控管）

- 平台端主要保存「聚合資料」：議題計數、來源貼文計數、每日趨勢。
- 平台儀表板只呈現「議題/敘事趨勢」，不直接標記某個帳號為「網軍」。
- 若要進一步做 AI 判讀，建議在平台端保持「人工複核流程」與「置信度」欄位，避免自動定罪式輸出。

## Bug 狀態

- `PENDING`
- `ACK`
- `FIXED`
- `IGNORED`
