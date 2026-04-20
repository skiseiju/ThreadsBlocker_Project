CREATE TABLE IF NOT EXISTS bug_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  source_app TEXT NOT NULL,
  version TEXT,
  hwid TEXT NOT NULL,
  level TEXT,
  message TEXT NOT NULL,
  error_code TEXT,
  metadata TEXT,
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  ip_hash TEXT,
  user_agent TEXT,
  platform TEXT,
  script_manager TEXT,
  has_gm_xhr INTEGER,
  online INTEGER,
  endpoint TEXT,
  error_name TEXT,
  error_message TEXT,
  stack TEXT
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_status_created ON bug_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bug_reports_version ON bug_reports(version);
CREATE INDEX IF NOT EXISTS idx_bug_reports_level ON bug_reports(level);

CREATE TABLE IF NOT EXISTS rate_limits (
  hwid TEXT PRIMARY KEY,
  last_report_unix INTEGER NOT NULL
);

-- ============================================================================
-- Platform Upload v2 (匿名聚合分析)
-- 目的：接收 extension 匯出的 v2 JSON，僅保存平台分析所需的聚合資料
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  schema TEXT NOT NULL,
  source_app TEXT NOT NULL,
  exporter_version TEXT,
  timezone TEXT,
  locale TEXT,
  upload_source TEXT NOT NULL DEFAULT 'extension',
  payload_hash TEXT NOT NULL UNIQUE,
  block_event_count INTEGER NOT NULL DEFAULT 0,
  report_event_count INTEGER NOT NULL DEFAULT 0,
  total_event_count INTEGER NOT NULL DEFAULT 0,
  source_post_count INTEGER NOT NULL DEFAULT 0,
  topic_seed_count INTEGER NOT NULL DEFAULT 0,
  source_coverage_pct INTEGER NOT NULL DEFAULT 0,
  report_source_coverage_pct INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_uploads_created_at ON platform_uploads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_uploads_events ON platform_uploads(total_event_count DESC);

CREATE TABLE IF NOT EXISTS platform_topic_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER NOT NULL,
  topic_label TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  account_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_platform_topic_upload ON platform_topic_metrics(upload_id);
CREATE INDEX IF NOT EXISTS idx_platform_topic_event_count ON platform_topic_metrics(event_count DESC);

CREATE TABLE IF NOT EXISTS platform_source_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  source_owner TEXT,
  source_text_sample TEXT,
  block_event_count INTEGER NOT NULL DEFAULT 0,
  report_event_count INTEGER NOT NULL DEFAULT 0,
  total_event_count INTEGER NOT NULL DEFAULT 0,
  unique_account_count INTEGER NOT NULL DEFAULT 0,
  manipulation_signal_score INTEGER NOT NULL DEFAULT 0,
  manipulation_risk_level TEXT,
  top_topic_hints_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_platform_source_upload ON platform_source_metrics(upload_id);
CREATE INDEX IF NOT EXISTS idx_platform_source_total ON platform_source_metrics(total_event_count DESC);

CREATE TABLE IF NOT EXISTS platform_daily_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id INTEGER NOT NULL,
  day_key TEXT NOT NULL,
  block_event_count INTEGER NOT NULL DEFAULT 0,
  report_event_count INTEGER NOT NULL DEFAULT 0,
  total_event_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_platform_daily_upload ON platform_daily_metrics(upload_id);
CREATE INDEX IF NOT EXISTS idx_platform_daily_day ON platform_daily_metrics(day_key DESC);
