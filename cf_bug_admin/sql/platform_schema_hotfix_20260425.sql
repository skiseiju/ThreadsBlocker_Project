ALTER TABLE platform_uploads ADD COLUMN client_source_id TEXT;
ALTER TABLE platform_uploads ADD COLUMN client_platform TEXT;
ALTER TABLE platform_uploads ADD COLUMN ip_hash TEXT;
ALTER TABLE platform_uploads ADD COLUMN taxonomy_version TEXT DEFAULT 'topic-taxonomy.v1';
ALTER TABLE platform_uploads ADD COLUMN trust_tier TEXT DEFAULT 'probation';
ALTER TABLE platform_uploads ADD COLUMN risk_score_band TEXT DEFAULT 'low';
ALTER TABLE platform_uploads ADD COLUMN sync_enabled INTEGER;
ALTER TABLE platform_uploads ADD COLUMN upload_trigger TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_uploads_trust_tier ON platform_uploads(trust_tier);
CREATE INDEX IF NOT EXISTS idx_platform_uploads_ip_hash ON platform_uploads(ip_hash);

CREATE TABLE IF NOT EXISTS platform_topic_daily_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_key TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  sample_scope TEXT NOT NULL DEFAULT 'trusted',
  event_count INTEGER NOT NULL DEFAULT 0,
  upload_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(day_key, topic_label, taxonomy_version, sample_scope)
);

CREATE INDEX IF NOT EXISTS idx_platform_topic_daily_v2_day ON platform_topic_daily_v2(day_key DESC);
CREATE INDEX IF NOT EXISTS idx_platform_topic_daily_v2_scope ON platform_topic_daily_v2(sample_scope, taxonomy_version);

CREATE TABLE IF NOT EXISTS platform_source_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_source_id TEXT NOT NULL UNIQUE,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_upload_day TEXT,
  active_day_count INTEGER NOT NULL DEFAULT 0,
  upload_count INTEGER NOT NULL DEFAULT 0,
  client_platform TEXT,
  last_exporter_version TEXT,
  trust_tier TEXT NOT NULL DEFAULT 'probation',
  risk_score_band TEXT NOT NULL DEFAULT 'low'
);

CREATE INDEX IF NOT EXISTS idx_platform_source_registry_tier ON platform_source_registry(trust_tier);
