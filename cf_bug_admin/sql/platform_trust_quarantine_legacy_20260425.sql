-- Quarantine legacy uploads that predate trust_tier.
-- Run after backing up platform_uploads / platform_topic_daily_v2.
--
-- Rollback source:
--   Restore platform_uploads and platform_topic_daily_v2 from the pre-change D1 export.

UPDATE platform_uploads
SET
  trust_tier = 'probation',
  risk_score_band = CASE
    WHEN risk_score_band IS NULL OR risk_score_band = '' OR risk_score_band = 'low' THEN 'medium'
    ELSE risk_score_band
  END,
  note = CASE
    WHEN note IS NULL OR note = '' THEN '{"migration":"legacy_trust_quarantine_20260425"}'
    ELSE note
  END
WHERE trust_tier IS NULL OR trust_tier = '';

-- Future public topic trends should be rebuilt from trusted uploads only.
-- This clears the denormalized aggregate because it does not keep upload_id.
DELETE FROM platform_topic_daily_v2
WHERE sample_scope = 'trusted';

INSERT INTO platform_topic_daily_v2 (
  day_key, topic_label, taxonomy_version, sample_scope, event_count, upload_count
)
SELECT
  day_key,
  topic_label,
  taxonomy_version,
  'trusted' AS sample_scope,
  SUM(event_count) AS event_count,
  COUNT(*) AS upload_count
FROM platform_topic_daily
WHERE upload_id IN (
  SELECT id
  FROM platform_uploads
  WHERE trust_tier = 'trusted'
)
GROUP BY day_key, topic_label, taxonomy_version;
