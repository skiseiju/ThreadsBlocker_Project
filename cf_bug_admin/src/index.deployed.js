var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var DEFAULT_ALLOWED_DRIFT = 300;
var DEFAULT_RATE_WINDOW = 300;
var PLATFORM_MAX_PAYLOAD_BYTES = 1 * 1024 * 1024;
var PLATFORM_MAX_TOPICS = 200;
var PLATFORM_MAX_SOURCES = 400;
var PLATFORM_MAX_EVENTS = 12e4;
var PUBLIC_MIN_CATEGORY_EVENTS = 5;
var PUBLIC_MIN_NARRATIVE_SOURCES = 2;
var PUBLIC_MIN_NARRATIVE_EVENTS = 20;
var PUBLIC_HIGH_SIGNAL_THRESHOLD = 65;
var PUBLIC_MEDIUM_SIGNAL_THRESHOLD = 45;
var PUBLIC_CANDIDATE_SOURCE_LIMIT = 320;
var PUBLIC_CANDIDATE_TOPIC_LIMIT = 90;
var PUBLIC_CANDIDATE_GROUP_LIMITS = {
  external_anchor: 10,
  community_native: 6
};
var CURRENT_TAXONOMY_VERSION = "topic-taxonomy.v1";
var PUBLIC_SAMPLE_SCOPE = "trusted";
var LEGACY_TRUST_TIER = "trusted";
var PUBLIC_REPORT_CATEGORY_TREE = [
  {
    id: "spam",
    label: "\u9019\u662F\u5783\u573E\u8A0A\u606F / \u5783\u573E\u8A0A\u606F",
    sourceLabels: ["\u9019\u662F\u5783\u573E\u8A0A\u606F", "\u5783\u573E\u8A0A\u606F"],
    note: "\u540C\u7FA9\u6216\u4E0D\u540C\u6AA2\u8209\u8DEF\u5F91\u7684\u5783\u573E\u8A0A\u606F label \u5DF2\u5408\u4F75\u986F\u793A\u3002",
    children: []
  },
  {
    id: "violence-hate-exploitation",
    label: "\u66B4\u529B\u3001\u4EC7\u6068\u6216\u525D\u524A",
    children: [
      { id: "incites-violence", label: "\u717D\u52D5\u66B4\u529B", sourceLabels: ["\u717D\u52D5\u66B4\u529B"] },
      { id: "hate-speech-symbols", label: "\u4EC7\u6068\u8A00\u8AD6\u6216\u8C61\u5FB5\u7B26\u865F", sourceLabels: ["\u4EC7\u6068\u8A00\u8AD6\u6216\u8C61\u5FB5\u7B26\u865F"] },
      { id: "specific-safety-threat", label: "\u5C0D\u5B89\u5168\u69CB\u6210\u5177\u9AD4\u5A01\u8105", sourceLabels: ["\u5C0D\u5B89\u5168\u69CB\u6210\u5177\u9AD4\u5A01\u8105"] },
      { id: "terrorism-organized-crime", label: "\u7591\u4F3C\u70BA\u6050\u6016\u4E3B\u7FA9\u6216\u7D44\u7E54\u72AF\u7F6A", sourceLabels: ["\u7591\u4F3C\u70BA\u6050\u6016\u4E3B\u7FA9\u6216\u7D44\u7E54\u72AF\u7F6A"] }
    ]
  },
  {
    id: "scam-fraud",
    label: "\u8A50\u9A19\u6216\u8A50\u6B3A",
    children: [
      { id: "financial-investment-scam", label: "\u91D1\u878D\u6216\u6295\u8CC7\u8A50\u9A19", sourceLabels: ["\u91D1\u878D\u6216\u6295\u8CC7\u8A50\u9A19"] }
    ]
  },
  {
    id: "flow-answer",
    label: "\u672A\u5206\u985E / \u6D41\u7A0B\u56DE\u7B54",
    note: "\u9019\u4E0D\u662F Threads \u6AA2\u8209\u7236\u5C64\uFF0C\u800C\u662F\u6AA2\u8209\u6D41\u7A0B\u4E2D\u7684\u56DE\u7B54\u503C\u3002",
    children: [
      { id: "answer-no", label: "\u5426", sourceLabels: ["\u5426"] }
    ]
  }
];
var PUBLIC_CANDIDATE_TOPIC_DEFS = [
  {
    id: "external-eswatini",
    kind: "external_anchor",
    strength: "strong",
    title: "\u53F2\u74E6\u5E1D\u5C3C\u5916\u4EA4\u4E8B\u4EF6",
    dateHint: "2026-04-21",
    keywords: ["\u53F2\u74E6\u5E1D\u5C3C"],
    note: "\u5916\u4EA4\u65B0\u805E\u51FA\u73FE\u5F8C\uFF0C\u7AD9\u5167\u4E5F\u96C6\u4E2D\u51FA\u73FE\u53F2\u74E6\u5E1D\u5C3C\u76F8\u95DC\u8A0E\u8AD6\u3002"
  },
  {
    id: "external-defense-procurement",
    kind: "external_anchor",
    strength: "strong",
    title: "\u8ECD\u8CFC / \u570B\u9632\u7279\u5225\u689D\u4F8B",
    dateHint: "2026-05-23",
    keywords: ["\u8ECD\u8CFC", "\u570B\u9632", "\u8981\u8ECD\u8CFC\u8981\u570B\u9632", "\u570B\u9632\u7279\u5225\u689D\u4F8B"],
    note: "\u8ECD\u8CFC\u8207\u570B\u9632\u9810\u7B97\u653B\u9632\u671F\u9593\uFF0C\u7AD9\u5167\u76F8\u95DC\u5C01\u9396\u8207\u6AA2\u8209\u91CF\u4E5F\u660E\u986F\u589E\u52A0\u3002"
  },
  {
    id: "external-child-allowance",
    kind: "external_anchor",
    strength: "strong",
    title: "\u53F0\u7063\u672A\u4F86\u5E33\u6236 / \u5C11\u5B50\u5316\u6D25\u8CBC",
    dateHint: "2026-05-27",
    keywords: ["\u53F0\u7063\u672A\u4F86\u5E33\u6236", "\u5C11\u5B50\u5316", "0-18\u6B72", "0\u523018\u6B72", "\u6210\u9577\u6D25\u8CBC", "\u80B2\u5152\u88DC\u52A9"],
    note: "\u80B2\u5152\u88DC\u52A9\u8207\u5C11\u5B50\u5316\u653F\u7B56\u65B0\u805E\u51FA\u73FE\u5F8C\uFF0C\u7AD9\u5167\u4E5F\u6709\u4E00\u6CE2\u76F8\u95DC\u8A0E\u8AD6\u3002"
  },
  {
    id: "external-energy-taipei",
    kind: "external_anchor",
    strength: "strong",
    title: "\u6C88\u4F2F\u6D0B / \u8523\u842C\u5B89 / \u8F1D\u9054\u7528\u96FB\u8AD6\u6230",
    dateHint: "2026-05-26",
    keywords: ["\u6C88\u4F2F\u6D0B", "\u8523\u842C\u5B89", "\u8F1D\u9054", "Energy vs. Electricity", "electricity", "\u53F0\u96FB", "\u7528\u96FB"],
    note: "\u8F1D\u9054\u7528\u96FB\u8207\u53F0\u5317\u5E02\u653F\u653B\u9632\u540C\u6642\u5347\u6EAB\uFF0C\u7AD9\u5167\u4E5F\u51FA\u73FE\u76F8\u8FD1\u8A0E\u8AD6\u3002"
  },
  {
    id: "external-impeachment",
    kind: "external_anchor",
    strength: "strong",
    title: "\u7E3D\u7D71\u5F48\u52BE\u6848",
    dateHint: "2026-05-18",
    keywords: ["\u7E3D\u7D71\u5F48\u52BE\u6848", "\u5F48\u52BE\u6848"],
    note: "\u7E3D\u7D71\u5F48\u52BE\u6848\u8868\u6C7A\u524D\u5F8C\uFF0C\u7AD9\u5167\u51FA\u73FE\u76F8\u95DC\u653B\u9632\u5167\u5BB9\u3002"
  },
  {
    id: "external-su-family",
    kind: "external_anchor",
    strength: "candidate",
    title: "\u8607\u5DE7\u6167 / \u8607\u8C9E\u660C\u76F8\u95DC\u653B\u9632",
    dateHint: "2026-05-28",
    keywords: ["\u8607\u5DE7\u6167", "\u8607\u8C9E\u660C", "\u8607\u5DE7\u7D14", "\u66E0\u4E16", "\u6D89\u5ACC\u8A50\u9A19"],
    note: "\u8607\u5DE7\u6167\u8207\u8607\u8C9E\u660C\u76F8\u95DC\u5167\u5BB9\u5728\u7AD9\u5167\u88AB\u96C6\u4E2D\u8A0E\u8AD6\uFF0C\u53EF\u4F5C\u70BA\u4EBA\u5DE5\u8907\u6838\u9805\u76EE\u3002"
  },
  {
    id: "external-election-law",
    kind: "external_anchor",
    strength: "candidate",
    title: "\u9AD8\u8679\u5B89 / \u9078\u7F77\u6CD5",
    dateHint: "2026-05-23",
    keywords: ["\u9AD8\u8679\u5B89", "\u9078\u7F77\u6CD5"],
    note: "\u5916\u90E8\u6709\u76F8\u95DC\u653F\u6CBB\u4E8B\u4EF6\uFF0C\u7AD9\u5167\u8A0A\u865F\u76EE\u524D\u8F03\u5C11\uFF0C\u50C5\u5217\u70BA\u5019\u9078\u3002"
  },
  {
    id: "external-kuomintang-rocket",
    kind: "external_anchor",
    strength: "candidate",
    title: "\u570B\u6C11\u9EE8\u9752\u5E74\u90E8 / \u4E2D\u570B\u706B\u7BAD\u722D\u8B70",
    dateHint: "2026-05-26",
    keywords: ["\u570B\u6C11\u9EE8\u9752\u5E74\u90E8", "\u706B\u7BAD\u5347\u7A7A", "\u9023\u52DD\u6B66", "\u4E2D\u570B\u822A\u5929", "\u5C39\u4E43\u83C1", "\u6050\u5171\u75C7"],
    note: "\u5916\u90E8\u65B0\u805E\u63D0\u5230\u4E2D\u570B\u706B\u7BAD\u722D\u8B70\uFF0C\u7AD9\u5167\u4E5F\u6709\u5C11\u91CF\u76F8\u95DC\u8A0E\u8AD6\u3002"
  },
  {
    id: "external-huang-live-shanghai",
    kind: "external_anchor",
    strength: "candidate",
    title: "\u9EC3\u570B\u660C / \u9928\u9577\u76F4\u64AD\u4E0A\u6D77\u722D\u8B70",
    dateHint: "2026-05-26",
    keywords: ["\u9EC3\u570B\u660C", "\u9928\u9577", "\u4E0A\u6D77\u90A3\u500B", "\u9BF0\u9B5A\u6548\u61C9"],
    note: "\u76F4\u64AD\u7247\u6BB5\u8207\u653F\u6CBB\u4EBA\u7269\u653B\u9632\u5728\u5916\u90E8\u65B0\u805E\u548C\u7AD9\u5167\u8A0E\u8AD6\u540C\u6642\u51FA\u73FE\u3002"
  },
  {
    id: "external-cheng-us-visit",
    kind: "external_anchor",
    strength: "candidate",
    title: "\u912D\u9E97\u6587\u8A2A\u7F8E\u722D\u8B70",
    dateHint: "2026-05-27",
    keywords: ["\u912D\u9E97\u6587", "\u8A2A\u7F8E", "\u653E\u9CE5\u65E5\u672C\u81EA\u6C11\u9EE8", "\u5DDD\u666E\u8AAA\u53F0\u7063"],
    note: "\u912D\u9E97\u6587\u76F8\u95DC\u5916\u4EA4\u8207\u8A2A\u7F8E\u722D\u8B70\uFF0C\u5728\u7AD9\u5167\u6709\u96F6\u661F\u4F46\u53EF\u8FA8\u8B58\u7684\u8A0E\u8AD6\u3002"
  },
  {
    id: "external-yen-judicial",
    kind: "external_anchor",
    strength: "candidate",
    title: "\u984F\u5BEC\u6052\u53F8\u6CD5\u6848",
    dateHint: "2026-05-28",
    keywords: ["\u984F\u5BEC\u6052", "\u5883\u7BA1", "\u9003\u4EA1\u98A8\u96AA", "\u8CAA\u6C59", "\u6700\u9AD8\u6CD5\u9662"],
    note: "\u53F8\u6CD5\u65B0\u805E\u51FA\u73FE\u5F8C\uFF0C\u7AD9\u5167\u4E5F\u6709\u8207\u6848\u4EF6\u76F8\u95DC\u7684\u8A0E\u8AD6\u5167\u5BB9\u3002"
  },
  {
    id: "community-lee-tahui",
    kind: "community_native",
    strength: "strong",
    title: "\u674E\u591A\u6167 / \u5317\u4E00\u5973\u5236\u670D",
    dateHint: "2026-06-07",
    keywords: ["\u674E\u591A\u6167", "\u5317\u4E00\u5973", "\u5236\u670D", "my culture is not your costume", "\u6587\u5316\u632A\u7528"],
    note: "\u7AD9\u5167\u81EA\u884C\u5F62\u6210\u5927\u91CF\u8A0E\u8AD6\uFF0C\u7126\u9EDE\u96C6\u4E2D\u5728\u5236\u670D\u3001\u8868\u6F14\u8207\u6587\u5316\u632A\u7528\u722D\u8B70\u3002"
  },
  {
    id: "community-danjiang-bridge",
    kind: "community_native",
    strength: "strong",
    title: "\u6DE1\u6C5F\u5927\u6A4B",
    dateHint: "2026-05-12",
    keywords: ["\u6DE1\u6C5F\u5927\u6A4B", "\u6A5F\u8ECA\u9053", "\u9694\u97F3\u7246", "\u87BA\u6813"],
    note: "\u7AD9\u5167\u8A0E\u8AD6\u96C6\u4E2D\u5728\u901A\u8ECA\u5F8C\u7684\u6A5F\u8ECA\u9053\u3001\u65BD\u5DE5\u54C1\u8CEA\u8207\u4EA4\u901A\u8A2D\u8A08\u3002"
  },
  {
    id: "community-putai-student",
    kind: "community_native",
    strength: "strong",
    title: "\u666E\u53F0\u9AD8\u4E2D\u9678\u7C4D\u5B78\u751F / \u7E41\u661F / \u53F0\u5927",
    dateHint: "2026-06-07",
    keywords: ["\u666E\u53F0\u9AD8\u4E2D", "\u9678\u7C4D\u5B78\u751F", "\u7E41\u661F", "\u53F0\u7063\u5927\u5B78", "\u53F0\u5927"],
    note: "\u7AD9\u5167\u8A0E\u8AD6\u96C6\u4E2D\u5728\u9678\u7C4D\u5B78\u751F\u3001\u7E41\u661F\u9304\u53D6\u8207\u5C31\u5B78\u8CC7\u683C\u3002"
  },
  {
    id: "community-track-meet",
    kind: "community_native",
    strength: "candidate",
    title: "\u53F0\u7063 / \u65B0\u5317\u570B\u969B\u7530\u5F91\u516C\u958B\u8CFD",
    dateHint: "2026-05-30",
    keywords: ["\u53F0\u7063\u570B\u969B\u7530\u5F91\u516C\u958B\u8CFD", "\u65B0\u5317\u570B\u969B\u7530\u5F91\u516C\u958B\u8CFD", "\u7530\u5F91\u516C\u958B\u8CFD", "\u9810\u7B97\u6C92\u904E\u56E0\u6545\u505C\u8CFD"],
    note: "\u7AD9\u5167\u6709\u5C11\u91CF\u4F46\u660E\u78BA\u7684\u8CFD\u4E8B\u540D\u7A31\u8207\u9810\u7B97\u8A0E\u8AD6\u3002"
  },
  {
    id: "community-prenatal-seat",
    kind: "community_native",
    strength: "strong",
    title: "\u5A66\u7522\u79D1\u7522\u6AA2\u966A\u8A3A\u8B93\u5EA7\u8A0E\u8AD6",
    dateHint: "2026-06-07",
    keywords: ["\u5A66\u7522\u79D1", "\u7522\u6AA2", "\u6E96\u7238\u7238", "\u885B\u6559", "\u5B55\u5A66", "\u8B93\u4F4D"],
    note: "\u7AD9\u5167\u5927\u91CF\u8A0E\u8AD6\u966A\u7522\u6AA2\u6642\u662F\u5426\u61C9\u4E3B\u52D5\u8B93\u5EA7\u8207\u7167\u9867\u5B55\u5A66\u3002"
  },
  {
    id: "community-meta-ai",
    kind: "community_native",
    strength: "strong",
    title: "Meta AI \u76F8\u95DC\u5632\u8AF7\u8207\u6E2C\u8A66",
    dateHint: "2026-06-07",
    keywords: ["meta.ai", "Meta AI", "\u9752\u9CE5\u5766\u514B", "\u9B54\u93E1"],
    note: "\u7AD9\u5167\u51FA\u73FE\u5927\u91CF\u7528 Meta AI \u9020\u6897\u3001\u6E2C\u8A66\u6216\u4E92\u76F8\u5632\u8AF7\u7684\u5167\u5BB9\u3002"
  },
  {
    id: "community-kayci-trainee",
    kind: "community_native",
    strength: "candidate",
    title: "KAYCI \u7DF4\u7FD2\u751F\u8EAB\u5206\u8A0E\u8AD6",
    dateHint: "2026-06-07",
    keywords: ["KAYCI", "\u7DF4\u7FD2\u751F", "\u97D3\u570B\u7C4D", "\u6BCD\u8A9E\u662F\u4E2D\u6587"],
    note: "\u7AD9\u5167\u8A0E\u8AD6\u96C6\u4E2D\u5728\u7DF4\u7FD2\u751F\u80CC\u666F\u3001\u570B\u7C4D\u8207\u8A9E\u8A00\u8EAB\u5206\u3002"
  }
];
var PLATFORM_SCHEMA_STMTS = [
  `CREATE TABLE IF NOT EXISTS platform_uploads (
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
    client_source_id TEXT,
    client_platform TEXT,
    taxonomy_version TEXT NOT NULL DEFAULT 'topic-taxonomy.v1',
    trust_tier TEXT NOT NULL DEFAULT 'trusted',
    risk_score_band TEXT NOT NULL DEFAULT 'low',
    sync_enabled INTEGER,
    upload_trigger TEXT,
    note TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_uploads_created_at ON platform_uploads(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_platform_uploads_events ON platform_uploads(total_event_count DESC)",
  "CREATE INDEX IF NOT EXISTS idx_platform_uploads_trust_tier ON platform_uploads(trust_tier)",
  `CREATE TABLE IF NOT EXISTS platform_raw_ingests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    raw_payload_hash TEXT NOT NULL,
    analysis_payload_hash TEXT,
    payload_bytes INTEGER NOT NULL DEFAULT 0,
    schema TEXT,
    client_source_id TEXT,
    client_platform TEXT,
    exporter_version TEXT,
    upload_trigger TEXT,
    ingest_status TEXT NOT NULL DEFAULT 'received',
    accepted_upload_id INTEGER,
    duplicate_of_upload_id INTEGER,
    error_message TEXT,
    raw_payload TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_raw_ingests_created_at ON platform_raw_ingests(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_platform_raw_ingests_status ON platform_raw_ingests(ingest_status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_platform_raw_ingests_analysis_hash ON platform_raw_ingests(analysis_payload_hash)",
  "CREATE INDEX IF NOT EXISTS idx_platform_raw_ingests_source ON platform_raw_ingests(client_source_id, created_at DESC)",
  `CREATE TABLE IF NOT EXISTS platform_topic_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    topic_label TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    account_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_topic_upload ON platform_topic_metrics(upload_id)",
  "CREATE INDEX IF NOT EXISTS idx_platform_topic_event_count ON platform_topic_metrics(event_count DESC)",
  `CREATE TABLE IF NOT EXISTS platform_source_metrics (
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
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_source_upload ON platform_source_metrics(upload_id)",
  "CREATE INDEX IF NOT EXISTS idx_platform_source_total ON platform_source_metrics(total_event_count DESC)",
  `CREATE TABLE IF NOT EXISTS platform_daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    day_key TEXT NOT NULL,
    block_event_count INTEGER NOT NULL DEFAULT 0,
    report_event_count INTEGER NOT NULL DEFAULT 0,
    total_event_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_daily_upload ON platform_daily_metrics(upload_id)",
  "CREATE INDEX IF NOT EXISTS idx_platform_daily_day ON platform_daily_metrics(day_key DESC)",
  `CREATE TABLE IF NOT EXISTS platform_topic_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_key TEXT NOT NULL,
    topic_label TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    upload_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(day_key, topic_label)
  )`,
  `CREATE TABLE IF NOT EXISTS platform_topic_daily_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_key TEXT NOT NULL,
    topic_label TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL,
    sample_scope TEXT NOT NULL DEFAULT 'trusted',
    event_count INTEGER NOT NULL DEFAULT 0,
    upload_count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(day_key, topic_label, taxonomy_version, sample_scope)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_topic_daily_v2_day ON platform_topic_daily_v2(day_key DESC)",
  "CREATE INDEX IF NOT EXISTS idx_platform_topic_daily_v2_scope ON platform_topic_daily_v2(sample_scope, taxonomy_version)",
  `CREATE TABLE IF NOT EXISTS platform_category_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    category_label TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    account_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_category_upload ON platform_category_metrics(upload_id)",
  "CREATE INDEX IF NOT EXISTS idx_platform_category_event ON platform_category_metrics(event_count DESC)",
  `CREATE TABLE IF NOT EXISTS platform_source_registry (
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
  )`,
  "CREATE INDEX IF NOT EXISTS idx_platform_source_registry_tier ON platform_source_registry(trust_tier)",
  `CREATE TABLE IF NOT EXISTS political_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    source_name TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_political_events_date ON political_events(event_date DESC)"
];
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }
    try {
      if (url.pathname === "/" && request.method === "GET") {
        return withCors(json({
          code: 200,
          message: "ThreadsBlocker API",
          endpoints: {
            health: "/api/v1/health",
            bugIngest: "POST /api/v1/reports/bug",
            platformIngest: "POST /api/v1/platform/ingest",
            adminBugs: "GET /api/v1/admin/bugs (Bearer token)",
            adminStats: "GET /api/v1/admin/stats (Bearer token)",
            adminPlatformOverview: "GET /api/v1/admin/platform/overview (Bearer token)"
          }
        }, 200));
      }
      if (url.pathname === "/api/v1/reports/bug" && request.method === "POST") {
        return withCors(await handleBugIngest(request, env));
      }
      if (url.pathname === "/api/v1/platform/ingest" && request.method === "POST") {
        return withCors(await handlePlatformIngest(request, env));
      }
      if (url.pathname === "/api/v1/platform/ingest" && request.method === "GET") {
        return withCors(json({ code: 405, message: "Use POST with schema threadsblocker.platform_upload.v2 JSON payload" }, 405));
      }
      if (url.pathname === "/api/v1/platform/overview" && request.method === "GET") {
        return withCors(await handlePublicPlatformOverview(request, env));
      }
      if (url.pathname === "/api/v1/platform/topic/details" && request.method === "GET") {
        return withCors(await handlePublicTopicDetails(request, env));
      }
      if (url.pathname === "/api/v1/admin/political-events/ingest" && request.method === "POST") {
        return withCors(await handleAdminPoliticalEventsIngest(request, env));
      }
      if (url.pathname === "/api/v1/platform/political-events" && request.method === "GET") {
        return withCors(await handlePublicPoliticalEvents(request, env));
      }
      if (url.pathname === "/api/v1/admin/bugs" && request.method === "GET") {
        return withCors(await handleAdminList(request, env));
      }
      if (url.pathname === "/api/v1/admin/stats" && request.method === "GET") {
        return withCors(await handleAdminStats(request, env));
      }
      if (url.pathname === "/api/v1/admin/platform/overview" && request.method === "GET") {
        return withCors(await handleAdminPlatformOverview(request, env));
      }
      if (url.pathname.startsWith("/api/v1/admin/bugs/") && request.method === "PATCH") {
        return withCors(await handleAdminUpdateStatus(request, env, url.pathname));
      }
      if (url.pathname === "/api/v1/health" && request.method === "GET") {
        return withCors(json({ code: 200, message: "ok" }, 200));
      }
      return withCors(json({ code: 404, message: "Not found" }, 404));
    } catch (err) {
      if (err instanceof Response) return withCors(err);
      return withCors(json({ code: 500, message: err?.message || "Internal error" }, 500));
    }
  }
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
__name(json, "json");
function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, { status: response.status, headers });
}
__name(withCors, "withCors");
function getAdminToken(request) {
  const auth = request.headers.get("Authorization") || "";
  const prefix = "Bearer ";
  if (!auth.startsWith(prefix)) return "";
  return auth.slice(prefix.length).trim();
}
__name(getAdminToken, "getAdminToken");
function assertAdmin(request, env) {
  const adminToken = env.ADMIN_TOKEN || "";
  const token = getAdminToken(request);
  if (!adminToken || !token || token !== adminToken) {
    throw new Response(JSON.stringify({ code: 401, message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
__name(assertAdmin, "assertAdmin");
async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function handleBugIngest(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ code: 400, message: "Bad Request: invalid json" }, 400);
  }
  const requiredFields = ["timestamp", "hwid", "source_app", "message", "signature"];
  for (const field of requiredFields) {
    if (!body[field]) {
      return json({ code: 400, message: `Bad Request: missing ${field}` }, 400);
    }
  }
  const salt = env.BUG_REPORT_SALT || "";
  if (!salt) {
    return json({ code: 500, message: "Server misconfigured: missing BUG_REPORT_SALT" }, 500);
  }
  const allowedDrift = Number(env.ALLOWED_TIME_DRIFT_SEC || DEFAULT_ALLOWED_DRIFT);
  const rateWindow = Number(env.RATE_LIMIT_WINDOW_SEC || DEFAULT_RATE_WINDOW);
  const now = Math.floor(Date.now() / 1e3);
  const ts = Number.parseInt(String(body.timestamp), 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > allowedDrift) {
    return json({ code: 403, message: "Request expired: time drift too large" }, 403);
  }
  const expectedSig = await sha256Hex(`${body.timestamp}${body.hwid}${salt}`);
  if (expectedSig !== body.signature) {
    return json({ code: 401, message: "Unauthorized: invalid signature" }, 401);
  }
  const limitRow = await env.DB.prepare("SELECT last_report_unix FROM rate_limits WHERE hwid = ?").bind(body.hwid).first();
  if (limitRow && now - Number(limitRow.last_report_unix || 0) < rateWindow) {
    return json({ code: 429, message: "Rate limit exceeded" }, 429);
  }
  await env.DB.prepare(
    "INSERT INTO rate_limits(hwid, last_report_unix) VALUES (?, ?) ON CONFLICT(hwid) DO UPDATE SET last_report_unix = excluded.last_report_unix"
  ).bind(body.hwid, now).run();
  let metadataRaw = "";
  let metadataObj = null;
  if (typeof body.metadata === "string") {
    metadataRaw = body.metadata;
    try {
      metadataObj = JSON.parse(body.metadata);
    } catch {
      metadataObj = null;
    }
  } else if (body.metadata && typeof body.metadata === "object") {
    metadataObj = body.metadata;
    metadataRaw = JSON.stringify(body.metadata);
  }
  const clientEnv = metadataObj && typeof metadataObj.clientEnv === "object" ? metadataObj.clientEnv : {};
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = ip ? await sha256Hex(ip) : "";
  const insert = await env.DB.prepare(
    `INSERT INTO bug_reports (
      source_app, version, hwid, level, message, error_code, metadata, signature, status,
      ip_hash, user_agent, platform, script_manager, has_gm_xhr, online, endpoint, error_name, error_message, stack
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    String(body.source_app || ""),
    String(body.version || ""),
    String(body.hwid || ""),
    String(body.level || "ERROR"),
    String(body.message || ""),
    String(body.error_code || ""),
    metadataRaw,
    String(body.signature || ""),
    ipHash,
    request.headers.get("User-Agent") || "",
    String(clientEnv.platform || ""),
    String(clientEnv.scriptManager || ""),
    boolAsInt(clientEnv.hasGMXHR),
    boolAsInt(clientEnv.online),
    String(clientEnv.endpoint || ""),
    String(clientEnv.errorName || ""),
    String(clientEnv.errorMessage || ""),
    String(clientEnv.stack || "")
  ).run();
  return json({ code: 200, message: "Success", id: insert.meta?.last_row_id || null }, 200);
}
__name(handleBugIngest, "handleBugIngest");
async function handlePlatformIngest(request, env) {
  await ensurePlatformTables(env);
  const rawText = await request.text();
  if (!rawText || rawText.trim().length === 0) {
    return json({ code: 400, message: "Bad Request: empty payload" }, 400);
  }
  const rawPayloadBytes = utf8ByteLength(rawText);
  if (rawPayloadBytes > PLATFORM_MAX_PAYLOAD_BYTES) {
    return json({ code: 413, message: "Payload too large" }, 413);
  }
  const rawPayloadHash = await sha256Hex(rawText);
  const body = safeParseJSON(rawText);
  if (!body || typeof body !== "object") {
    const rawIngestId2 = await recordPlatformRawIngest(env, {
      rawPayloadHash,
      payloadBytes: rawPayloadBytes,
      ingestStatus: "invalid_json",
      errorMessage: "invalid json",
      rawPayload: rawText
    });
    return json({
      code: 400,
      message: "Bad Request: invalid json",
      rawStored: true,
      rawIngestId: rawIngestId2
    }, 400);
  }
  const summary = asObject(body.summary);
  const exporter = asObject(body.exporter);
  const sourceApp = safeString(exporter.tool || body.source_app || "ThreadsBlocker", 80);
  const exporterVersion = safeString(exporter.version || "", 80);
  const timezone = safeString(exporter.timezone || "", 64);
  const locale = safeString(exporter.locale || "", 64);
  const uploadMeta = asObject(body.uploadMeta);
  const clientSourceId = safeString(body.clientSourceId || uploadMeta.clientSourceId || "", 120);
  const clientPlatform = safeString(uploadMeta.clientPlatform || body.clientPlatform || "unknown", 40);
  const schemaName = safeString(body.schema, 80);
  const uploadTrigger = safeString(uploadMeta.uploadTrigger || "manual", 40);
  const rawIngestId = await recordPlatformRawIngest(env, {
    rawPayloadHash,
    payloadBytes: rawPayloadBytes,
    schema: schemaName,
    clientSourceId,
    clientPlatform,
    exporterVersion,
    uploadTrigger,
    ingestStatus: schemaName === "threadsblocker.platform_upload.v2" ? "received" : "invalid_schema",
    errorMessage: schemaName === "threadsblocker.platform_upload.v2" ? "" : "unsupported schema",
    rawPayload: rawText
  });
  if (schemaName !== "threadsblocker.platform_upload.v2") {
    return json({
      code: 400,
      message: "Bad Request: unsupported schema",
      rawStored: true,
      rawIngestId
    }, 400);
  }
  const payloadHash = await buildPlatformAnalysisPayloadHash(body, clientSourceId);
  await updatePlatformRawIngest(env, rawIngestId, {
    analysisPayloadHash: payloadHash,
    ingestStatus: "received"
  });
  const syncEnabled = boolAsInt(asObject(body.syncPreferences).autoSyncEnabled);
  const taxonomyVersion = CURRENT_TAXONOMY_VERSION;
  try {
    const blockEventCount = safeCount(summary.blockEventCount);
    const reportEventCount = safeCount(summary.reportEventCount);
    const totalEventCount = safeCount(summary.totalEventCount);
    const sourcePostCount = safeCount(summary.sourcePostCount);
    const topicSeedCount = safeCount(summary.topTopicSeedCount);
    const sourceCoveragePct = safePercent(summary.sourceCoveragePct);
    const reportSourceCoveragePct = safePercent(summary.reportSourceCoveragePct);
    const sourcesArr = asArray(body.sources).slice().sort((a, b) => safeCount(asObject(b).totalEventCount) - safeCount(asObject(a).totalEventCount));
    const top3EventCount = sourcesArr.slice(0, 3).reduce((sum, src) => sum + safeCount(asObject(src).totalEventCount), 0);
    const sourceConcentrationPct = totalEventCount > 0 ? Math.min(100, Math.round(top3EventCount / totalEventCount * 1e3) / 10) : 0;
    const analysisSeeds = asObject(body.analysisSeeds);
    const narrativeSeeds = asArray(analysisSeeds.narrativeSeeds);
    const narrativeEventCount = narrativeSeeds.reduce((sum, seed) => sum + safeCount(asObject(seed).eventCount), 0);
    const repeatedNarrativePct = totalEventCount > 0 ? Math.min(100, Math.round(narrativeEventCount / totalEventCount * 1e3) / 10) : 0;
    const campaignCandidates = asArray(analysisSeeds.campaignCandidates);
    const campaignEventCount = campaignCandidates.reduce((sum, candidate) => {
      const item = asObject(candidate);
      return sum + safeCount(item.blockEventCount) + safeCount(item.reportEventCount);
    }, 0);
    const shortTermDiffusionPct = totalEventCount > 0 ? Math.min(100, Math.round(campaignEventCount / totalEventCount * 1e3) / 10) : 0;
    const duplicateRow = await env.DB.prepare(
      "SELECT id, created_at FROM platform_uploads WHERE payload_hash = ?"
    ).bind(payloadHash).first();
    if (duplicateRow) {
      await touchSourceRegistrySeen(env, clientSourceId, clientPlatform, exporterVersion);
      await updatePlatformRawIngest(env, rawIngestId, {
        ingestStatus: "duplicate",
        duplicateOfUploadId: duplicateRow.id || null,
        errorMessage: ""
      });
      return json({
        code: 200,
        message: "Duplicate payload stored but skipped for analytics",
        duplicate: true,
        rawStored: true,
        rawIngestId,
        id: duplicateRow.id || null,
        createdAt: duplicateRow.created_at || null
      }, 200);
    }
    const trustMeta = await resolveTrustMeta(env, clientSourceId, clientPlatform, exporterVersion);
    let uploadId = 0;
    try {
      const insert = await env.DB.prepare(
        `INSERT INTO platform_uploads (
          schema, source_app, exporter_version, timezone, locale, upload_source, payload_hash,
          block_event_count, report_event_count, total_event_count, source_post_count, topic_seed_count,
          source_coverage_pct, report_source_coverage_pct, source_concentration_pct,
          repeated_narrative_pct, short_term_diffusion_pct, client_source_id, client_platform,
          taxonomy_version, trust_tier, risk_score_band, sync_enabled, upload_trigger
        ) VALUES (?, ?, ?, ?, ?, 'extension', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        "threadsblocker.platform_upload.v2",
        sourceApp,
        exporterVersion,
        timezone,
        locale,
        payloadHash,
        blockEventCount,
        reportEventCount,
        totalEventCount,
        sourcePostCount,
        topicSeedCount,
        sourceCoveragePct,
        reportSourceCoveragePct,
        sourceConcentrationPct,
        repeatedNarrativePct,
        shortTermDiffusionPct,
        clientSourceId,
        clientPlatform,
        taxonomyVersion,
        trustMeta.trustTier,
        trustMeta.riskScoreBand,
        syncEnabled,
        uploadTrigger
      ).run();
      uploadId = Number(insert.meta?.last_row_id || 0);
    } catch (err) {
      const msg = String(err?.message || err || "");
      if (msg.includes("UNIQUE constraint failed: platform_uploads.payload_hash")) {
        const row = await env.DB.prepare(
          "SELECT id, created_at FROM platform_uploads WHERE payload_hash = ?"
        ).bind(payloadHash).first();
        await touchSourceRegistrySeen(env, clientSourceId, clientPlatform, exporterVersion);
        await updatePlatformRawIngest(env, rawIngestId, {
          ingestStatus: "duplicate",
          duplicateOfUploadId: row?.id || null,
          errorMessage: ""
        });
        return json({
          code: 200,
          message: "Duplicate payload stored but skipped for analytics",
          duplicate: true,
          rawStored: true,
          rawIngestId,
          id: row?.id || null,
          createdAt: row?.created_at || null
        }, 200);
      }
      throw err;
    }
    if (!uploadId) {
      await updatePlatformRawIngest(env, rawIngestId, {
        ingestStatus: "error",
        errorMessage: "Failed to create upload record"
      });
      return json({
        code: 500,
        message: "Failed to create upload record",
        rawStored: true,
        rawIngestId
      }, 500);
    }
    const topicSeeds = asArray(asObject(body.analysisSeeds).topicSeeds).slice(0, PLATFORM_MAX_TOPICS);
    const sources = asArray(body.sources).slice(0, PLATFORM_MAX_SOURCES);
    const events = asArray(body.events).slice(0, PLATFORM_MAX_EVENTS);
    let topicInserted = 0;
    for (const item of topicSeeds) {
      const topic = asObject(item);
      const topicLabel = safeString(topic.topicLabel || topic.category, 140);
      const eventCount = safeCount(topic.eventCount);
      if (!topicLabel || eventCount <= 0) continue;
      await env.DB.prepare(
        `INSERT INTO platform_topic_metrics (upload_id, topic_label, event_count, account_count, source_count)
       VALUES (?, ?, ?, ?, ?)`
      ).bind(
        uploadId,
        topicLabel,
        eventCount,
        safeCount(topic.accountCount),
        safeCount(topic.sourceCount)
      ).run();
      topicInserted++;
    }
    let sourceInserted = 0;
    for (const item of sources) {
      const source = asObject(item);
      const sourceUrl = safeString(source.sourceUrl, 300);
      if (!sourceUrl) continue;
      const sourceOwners = asArray(source.sourceOwners).map((v) => safeString(v, 80)).filter(Boolean);
      const sourceTexts = asArray(source.sourceTextSamples).map((v) => safeString(v, 320)).filter(Boolean);
      const topTopicHints = asArray(source.topTopicHints).slice(0, 8).map((hint) => {
        const h = asObject(hint);
        return {
          topicHint: safeString(h.topicHint, 120),
          count: safeCount(h.count)
        };
      }).filter((h) => h.topicHint);
      await env.DB.prepare(
        `INSERT INTO platform_source_metrics (
        upload_id, source_url, source_owner, source_text_sample, block_event_count, report_event_count,
        total_event_count, unique_account_count, manipulation_signal_score, manipulation_risk_level, top_topic_hints_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        uploadId,
        sourceUrl,
        sourceOwners[0] || "",
        sourceTexts[0] || "",
        safeCount(source.blockEventCount),
        safeCount(source.reportEventCount),
        safeCount(source.totalEventCount),
        safeCount(source.uniqueAccountCount),
        safeCount(source.manipulationSignalScore),
        safeString(source.manipulationRiskLevel, 20),
        JSON.stringify(topTopicHints)
      ).run();
      sourceInserted++;
    }
    const categoryMap = /* @__PURE__ */ new Map();
    for (const item of events) {
      const event = asObject(item);
      const categoryLabel = safeString(event.reportLeafCategory || event.reportPrimaryCategory, 140);
      if (!categoryLabel) continue;
      if (!categoryMap.has(categoryLabel)) {
        categoryMap.set(categoryLabel, {
          eventCount: 0,
          accountIds: /* @__PURE__ */ new Set(),
          sourceUrls: /* @__PURE__ */ new Set()
        });
      }
      const bucket = categoryMap.get(categoryLabel);
      bucket.eventCount += 1;
      const accountId = safeString(event.accountId, 180);
      if (accountId) bucket.accountIds.add(accountId);
      const sourceUrl = safeString(event.sourceUrl, 300);
      if (sourceUrl) bucket.sourceUrls.add(sourceUrl);
    }
    let categoryInserted = 0;
    for (const [categoryLabel, bucket] of categoryMap.entries()) {
      const eventCount = safeCount(bucket.eventCount);
      if (!categoryLabel || eventCount <= 0) continue;
      await env.DB.prepare(
        `INSERT INTO platform_category_metrics (
        upload_id, category_label, event_count, account_count, source_count
      ) VALUES (?, ?, ?, ?, ?)`
      ).bind(
        uploadId,
        categoryLabel,
        eventCount,
        safeCount(bucket.accountIds.size),
        safeCount(bucket.sourceUrls.size)
      ).run();
      categoryInserted++;
    }
    const dailyAgg = {};
    for (const item of events) {
      const event = asObject(item);
      const dayKey = toDayKey(event.eventAt);
      if (!dayKey) continue;
      if (!dailyAgg[dayKey]) {
        dailyAgg[dayKey] = {
          block: 0,
          report: 0,
          total: 0,
          sourceSet: /* @__PURE__ */ new Set()
        };
      }
      const bucket = dailyAgg[dayKey];
      const eventType = safeString(event.eventType, 20);
      if (eventType === "block") bucket.block++;
      if (eventType === "report") bucket.report++;
      bucket.total++;
      const sourceUrl = safeString(event.sourceUrl, 300);
      if (sourceUrl) bucket.sourceSet.add(sourceUrl);
    }
    let dailyInserted = 0;
    for (const [dayKey, bucket] of Object.entries(dailyAgg)) {
      await env.DB.prepare(
        `INSERT INTO platform_daily_metrics (
        upload_id, day_key, block_event_count, report_event_count, total_event_count, source_count
      ) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        uploadId,
        dayKey,
        bucket.block,
        bucket.report,
        bucket.total,
        bucket.sourceSet.size
      ).run();
      dailyInserted++;
    }
    const topicDailyAgg = buildTopicDailyBuckets(events, sources, trustMeta.sampleScope, taxonomyVersion);
    let topicDailyInserted = 0;
    for (const bucket of topicDailyAgg.values()) {
      await env.DB.prepare(
        `INSERT INTO platform_topic_daily_v2 (
        day_key, topic_label, taxonomy_version, sample_scope, event_count, upload_count
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(day_key, topic_label, taxonomy_version, sample_scope) DO UPDATE SET
        event_count = event_count + excluded.event_count,
        upload_count = upload_count + excluded.upload_count`
      ).bind(
        bucket.dayKey,
        bucket.topicLabel,
        taxonomyVersion,
        trustMeta.sampleScope,
        bucket.eventCount,
        bucket.uploadCount
      ).run();
      topicDailyInserted++;
    }
    const storedInR2 = await storeEvidenceBundle(env, uploadId, {
      schema: "threadsblocker.platform_upload.bundle.v1",
      uploadId,
      taxonomyVersion,
      clientSourceId,
      clientPlatform,
      trustTier: trustMeta.trustTier,
      exportedAt: safeString(body.exportedAt, 40) || (/* @__PURE__ */ new Date()).toISOString(),
      events,
      sources,
      sourceEvidence: asArray(body.sourceEvidence)
    });
    await updatePlatformRawIngest(env, rawIngestId, {
      ingestStatus: "accepted",
      acceptedUploadId: uploadId,
      errorMessage: ""
    });
    return json({
      code: 200,
      message: "Platform payload ingested",
      id: uploadId,
      rawStored: true,
      rawIngestId,
      trustTier: trustMeta.trustTier,
      riskScoreBand: trustMeta.riskScoreBand,
      taxonomyVersion,
      sampleScope: trustMeta.sampleScope,
      storedInR2,
      reclassEligible: storedInR2,
      summary: {
        topicRows: topicInserted,
        sourceRows: sourceInserted,
        categoryRows: categoryInserted,
        dailyRows: dailyInserted,
        topicDailyRows: topicDailyInserted
      }
    }, 200);
  } catch (err) {
    await updatePlatformRawIngest(env, rawIngestId, {
      ingestStatus: "error",
      errorMessage: safeString(err?.message || err || "ingest error", 300)
    });
    throw err;
  }
}
__name(handlePlatformIngest, "handlePlatformIngest");
async function handleAdminList(request, env) {
  assertAdmin(request, env);
  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get("limit"), 1, 200, 50);
  const status = (url.searchParams.get("status") || "").trim();
  const version = (url.searchParams.get("version") || "").trim();
  const q = (url.searchParams.get("q") || "").trim();
  const where = [];
  const binds = [];
  if (status) {
    where.push("status = ?");
    binds.push(status);
  }
  if (version) {
    where.push("version = ?");
    binds.push(version);
  }
  if (q) {
    where.push("(message LIKE ? OR error_message LIKE ? OR hwid LIKE ?)");
    const likeQ = `%${q}%`;
    binds.push(likeQ, likeQ, likeQ);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const sql = `
    SELECT
      id, created_at, source_app, version, hwid, level, status,
      message, error_code, platform, script_manager,
      endpoint, error_name, error_message
    FROM bug_reports
    ${whereSql}
    ORDER BY id DESC
    LIMIT ?
  `;
  const rows = await env.DB.prepare(sql).bind(...binds, limit).all();
  return json({ code: 200, data: rows.results || [] }, 200);
}
__name(handleAdminList, "handleAdminList");
async function handleAdminStats(request, env) {
  assertAdmin(request, env);
  const url = new URL(request.url);
  const hours = clampInt(url.searchParams.get("hours"), 1, 24 * 30, 24);
  const levelRows = await env.DB.prepare(
    `SELECT level, COUNT(*) AS count
     FROM bug_reports
     WHERE datetime(created_at) >= datetime('now', ?)
     GROUP BY level
     ORDER BY count DESC`
  ).bind(`-${hours} hours`).all();
  const versionRows = await env.DB.prepare(
    `SELECT version, COUNT(*) AS count
     FROM bug_reports
     WHERE datetime(created_at) >= datetime('now', ?)
     GROUP BY version
     ORDER BY count DESC
     LIMIT 10`
  ).bind(`-${hours} hours`).all();
  const statusRows = await env.DB.prepare(
    `SELECT status, COUNT(*) AS count
     FROM bug_reports
     WHERE datetime(created_at) >= datetime('now', ?)
     GROUP BY status
     ORDER BY count DESC`
  ).bind(`-${hours} hours`).all();
  return json({
    code: 200,
    data: {
      hours,
      byLevel: levelRows.results || [],
      byVersion: versionRows.results || [],
      byStatus: statusRows.results || []
    }
  }, 200);
}
__name(handleAdminStats, "handleAdminStats");
async function handleAdminPlatformOverview(request, env) {
  assertAdmin(request, env);
  const url = new URL(request.url);
  const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
  const top = clampInt(url.searchParams.get("top"), 5, 50, 15);
  const data = await loadPlatformOverviewData(env, days, top);
  return json({ code: 200, data }, 200);
}
__name(handleAdminPlatformOverview, "handleAdminPlatformOverview");
async function handlePublicPlatformOverview(request, env) {
  const url = new URL(request.url);
  const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
  const top = clampInt(url.searchParams.get("top"), 5, 50, 15);
  const data = await loadPlatformOverviewData(env, days, top);
  return json({ code: 200, data: projectPublicPlatformOverview(data, top) }, 200);
}
__name(handlePublicPlatformOverview, "handlePublicPlatformOverview");
async function handlePublicTopicDetails(request, env) {
  return json({
    code: 410,
    message: "Public topic drill-down is disabled. Use aggregate overview endpoints only."
  }, 410);
}
__name(handlePublicTopicDetails, "handlePublicTopicDetails");
async function handleAdminPoliticalEventsIngest(request, env) {
  await ensurePlatformTables(env);
  const authHeader = request.headers.get("Authorization") || "";
  if (!env.ADMIN_TOKEN || authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ code: 401, message: "Unauthorized" }, 401);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ code: 400, message: "Bad Request: invalid JSON" }, 400);
  }
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (events.length === 0) {
    return json({ code: 400, message: "Bad Request: events array required" }, 400);
  }
  let inserted = 0;
  for (const ev of events) {
    const eventDate = String(ev.event_date || "").slice(0, 10);
    const category = String(ev.category || "").slice(0, 50);
    const title = String(ev.title || "").slice(0, 200);
    const sourceName = String(ev.source_name || "").slice(0, 100);
    if (!eventDate || !category || !title) continue;
    try {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO political_events (event_date, category, title, source_name) VALUES (?, ?, ?, ?)"
      ).bind(eventDate, category, title, sourceName).run();
      inserted++;
    } catch (_) {
    }
  }
  return json({ code: 200, message: "ok", inserted });
}
__name(handleAdminPoliticalEventsIngest, "handleAdminPoliticalEventsIngest");
async function handlePublicPoliticalEvents(request, env) {
  await ensurePlatformTables(env);
  const params = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, parseInt(params.get("days") || "30", 10)));
  const limit = Math.min(300, Math.max(1, parseInt(params.get("limit") || "120", 10)));
  const rows = await env.DB.prepare(
    `SELECT event_date, category, title, source_name FROM political_events
     WHERE date(event_date) >= date("now", ?)
     ORDER BY event_date DESC, id DESC LIMIT ?`
  ).bind(`-${days} days`, limit).all();
  return json({ code: 200, days, events: rows.results || [] });
}
__name(handlePublicPoliticalEvents, "handlePublicPoliticalEvents");
async function loadPlatformOverviewData(env, days, top) {
  await ensurePlatformTables(env);
  function detectSpikes(rows) {
    const WINDOW = 7;
    const THRESHOLD = 1.5;
    return rows.map((row, i) => {
      if (i < WINDOW) return { ...row, is_spike: false };
      const window = rows.slice(i - WINDOW, i);
      const avg = window.reduce((s, r) => s + (r.total_event_count || 0), 0) / WINDOW;
      return { ...row, is_spike: avg > 0 && (row.total_event_count || 0) > avg * THRESHOLD };
    });
  }
  __name(detectSpikes, "detectSpikes");
  const since = `-${days} days`;
  const analysisUploadIdsSql = `
    SELECT pu.id FROM platform_uploads pu
    WHERE datetime(pu.created_at) >= datetime('now', ?)
  `;
  const overviewRow = await env.DB.prepare(
    `SELECT
      COUNT(*) AS upload_count,
      COUNT(DISTINCT NULLIF(pu.client_source_id, '')) AS contributor_count,
      COALESCE(SUM(pu.block_event_count), 0) AS block_event_count,
      COALESCE(SUM(pu.report_event_count), 0) AS report_event_count,
      COALESCE(SUM(pu.total_event_count), 0) AS total_event_count,
      COALESCE(SUM(pu.source_post_count), 0) AS source_post_count,
      COALESCE(SUM(pu.topic_seed_count), 0) AS topic_seed_count,
      ROUND(AVG(pu.source_coverage_pct), 1) AS avg_source_coverage_pct,
      ROUND(AVG(pu.report_source_coverage_pct), 1) AS avg_report_source_coverage_pct,
      ROUND(AVG(pu.source_concentration_pct), 1) AS avg_source_concentration_pct,
      ROUND(AVG(pu.repeated_narrative_pct), 1) AS avg_repeated_narrative_pct,
      ROUND(AVG(pu.short_term_diffusion_pct), 1) AS avg_short_term_diffusion_pct
     FROM platform_uploads pu
     WHERE datetime(pu.created_at) >= datetime('now', ?)`
  ).bind(since).first();
  const allUploadsRow = await env.DB.prepare(
    `SELECT
      COUNT(*) AS upload_count,
      COUNT(DISTINCT NULLIF(client_source_id, '')) AS contributor_count,
      MIN(date(created_at)) AS first_upload_day,
      MAX(date(created_at)) AS last_upload_day
     FROM platform_uploads
     WHERE datetime(created_at) >= datetime('now', ?)`
  ).bind(since).first();
  const sourceRegistryRow = await env.DB.prepare(
    `SELECT
      COUNT(*) AS source_count,
      COALESCE(SUM(upload_count), 0) AS registry_upload_count,
      COALESCE(SUM(CASE WHEN trust_tier = 'trusted' THEN 1 ELSE 0 END), 0) AS trusted_source_count,
      COALESCE(SUM(CASE WHEN trust_tier = 'probation' THEN 1 ELSE 0 END), 0) AS probation_source_count,
      COALESCE(SUM(CASE WHEN trust_tier = 'flagged' THEN 1 ELSE 0 END), 0) AS flagged_source_count,
      COALESCE(SUM(CASE WHEN date(last_seen_at) >= date('now', '-1 day') THEN 1 ELSE 0 END), 0) AS active_last_1d,
      COALESCE(SUM(CASE WHEN date(last_seen_at) >= date('now', '-7 days') THEN 1 ELSE 0 END), 0) AS active_last_7d,
      MIN(date(first_seen_at)) AS first_seen_day,
      MAX(date(last_seen_at)) AS last_seen_day,
      MAX(last_seen_at) AS latest_seen_at
     FROM platform_source_registry`
  ).first();
  const recentUploadsRows = await env.DB.prepare(
    `SELECT
     pu.id, pu.created_at, pu.source_app, pu.exporter_version,
     pu.block_event_count, pu.report_event_count, pu.total_event_count, pu.source_post_count, pu.topic_seed_count
     FROM platform_uploads pu
     WHERE datetime(pu.created_at) >= datetime('now', ?)
     ORDER BY pu.id DESC
     LIMIT 30`
  ).bind(since).all();
  const dailyRows = await env.DB.prepare(
    `SELECT
      day_key,
      SUM(block_event_count) AS block_event_count,
      SUM(report_event_count) AS report_event_count,
      SUM(total_event_count) AS total_event_count,
      SUM(source_count) AS source_count
     FROM platform_daily_metrics
     WHERE upload_id IN (${analysisUploadIdsSql})
     GROUP BY day_key
     ORDER BY day_key DESC
     LIMIT 60`
  ).bind(since).all();
  const topicTimeSeriesRows = await env.DB.prepare(
    `SELECT
      day_key,
      topic_label,
      SUM(event_count) as event_count
     FROM platform_topic_daily_v2
     WHERE day_key >= date('now', ?)
       AND taxonomy_version = ?
       AND sample_scope IN ('trusted', 'probation')
     GROUP BY day_key, topic_label
     ORDER BY day_key ASC, event_count DESC`
  ).bind(since, CURRENT_TAXONOMY_VERSION).all();
  const topicRows = await env.DB.prepare(
    `SELECT
      topic_label,
      SUM(event_count) AS event_count,
      SUM(account_count) AS account_count,
      SUM(source_count) AS source_count
     FROM platform_topic_metrics
     WHERE upload_id IN (${analysisUploadIdsSql})
     GROUP BY topic_label
     ORDER BY event_count DESC
     LIMIT ?`
  ).bind(since, Math.max(top, PUBLIC_CANDIDATE_TOPIC_LIMIT)).all();
  const dailyTrend = detectSpikes((dailyRows.results || []).reverse());
  const topicByDay = {};
  for (const row of topicTimeSeriesRows.results || []) {
    if (!topicByDay[row.day_key]) topicByDay[row.day_key] = [];
    if (topicByDay[row.day_key].length < 5) {
      topicByDay[row.day_key].push({ label: row.topic_label, count: row.event_count });
    }
  }
  const topicTimeSeries = Object.entries(topicByDay).map(([date, topics]) => ({ date, topics }));
  const categoryRows = await env.DB.prepare(
    `SELECT
      category_label,
      SUM(event_count) AS event_count,
      SUM(account_count) AS account_count,
      SUM(source_count) AS source_count
     FROM platform_category_metrics
     WHERE upload_id IN (${analysisUploadIdsSql})
     GROUP BY category_label
     ORDER BY event_count DESC
     LIMIT 10`
  ).bind(since).all();
  const narrativeRows = await env.DB.prepare(
    `SELECT
      source_url,
      MAX(source_owner) AS source_owner,
      MAX(source_text_sample) AS source_text_sample,
      SUM(block_event_count) AS block_event_count,
      SUM(report_event_count) AS report_event_count,
      SUM(total_event_count) AS total_event_count,
      SUM(unique_account_count) AS unique_account_count,
      ROUND(AVG(manipulation_signal_score), 1) AS avg_signal_score
     FROM platform_source_metrics
     WHERE upload_id IN (${analysisUploadIdsSql})
     GROUP BY source_url
     ORDER BY total_event_count DESC
     LIMIT ?`
  ).bind(since, Math.max(top, PUBLIC_CANDIDATE_SOURCE_LIMIT)).all();
  const materializedTotals = dailyTrend.reduce((acc, row) => {
    acc.block += safeCount(row.block_event_count);
    acc.report += safeCount(row.report_event_count);
    acc.total += safeCount(row.total_event_count);
    return acc;
  }, { block: 0, report: 0, total: 0 });
  const hasMaterializedDaily = dailyTrend.length > 0;
  return {
    days,
    overview: {
      uploadCount: Number(overviewRow?.upload_count || 0),
      contributorCount: Number(overviewRow?.contributor_count || 0),
      blockEventCount: hasMaterializedDaily ? materializedTotals.block : Number(overviewRow?.block_event_count || 0),
      reportEventCount: hasMaterializedDaily ? materializedTotals.report : Number(overviewRow?.report_event_count || 0),
      totalEventCount: hasMaterializedDaily ? materializedTotals.total : Number(overviewRow?.total_event_count || 0),
      summaryTotalEventCount: Number(overviewRow?.total_event_count || 0),
      sourcePostCount: Number(overviewRow?.source_post_count || 0),
      topicSeedCount: Number(overviewRow?.topic_seed_count || 0),
      sourceCoveragePct: Number(overviewRow?.avg_source_coverage_pct || 0),
      reportSourceCoveragePct: Number(overviewRow?.avg_report_source_coverage_pct || 0),
      avgSourceConcentrationPct: Number(overviewRow?.avg_source_concentration_pct || 0),
      avgRepeatedNarrativePct: Number(overviewRow?.avg_repeated_narrative_pct || 0),
      avgShortTermDiffusionPct: Number(overviewRow?.avg_short_term_diffusion_pct || 0)
    },
    taxonomyVersion: CURRENT_TAXONOMY_VERSION,
    sampleScope: "analysis_ready",
    contribution: {
      uploadCount: Number(allUploadsRow?.upload_count || 0),
      contributorCount: Number(allUploadsRow?.contributor_count || 0),
      dateRange: {
        start: safeString(allUploadsRow?.first_upload_day || "", 20),
        end: safeString(allUploadsRow?.last_upload_day || "", 20)
      }
    },
    sourceRegistry: {
      sourceCount: Number(sourceRegistryRow?.source_count || 0),
      trustedSourceCount: Number(sourceRegistryRow?.trusted_source_count || 0),
      probationSourceCount: Number(sourceRegistryRow?.probation_source_count || 0),
      flaggedSourceCount: Number(sourceRegistryRow?.flagged_source_count || 0),
      activeLast1d: Number(sourceRegistryRow?.active_last_1d || 0),
      activeLast7d: Number(sourceRegistryRow?.active_last_7d || 0),
      registryUploadCount: Number(sourceRegistryRow?.registry_upload_count || 0),
      dateRange: {
        start: safeString(sourceRegistryRow?.first_seen_day || "", 20),
        end: safeString(sourceRegistryRow?.last_seen_day || "", 20)
      },
      latestSeenAt: safeString(sourceRegistryRow?.latest_seen_at || "", 40)
    },
    dailyTrend,
    topicTimeSeries,
    candidateTopicDaily: topicTimeSeriesRows.results || [],
    reportCategories: categoryRows.results || [],
    topTopics: topicRows.results || [],
    topNarratives: narrativeRows.results || [],
    recentUploads: recentUploadsRows.results || []
  };
}
__name(loadPlatformOverviewData, "loadPlatformOverviewData");
function projectPublicPlatformOverview(raw, top = 15) {
  const data = raw && typeof raw === "object" ? raw : {};
  const overview = data.overview && typeof data.overview === "object" ? data.overview : {};
  const dailyTrend = Array.isArray(data.dailyTrend) ? data.dailyTrend : [];
  const topicTimeSeries = Array.isArray(data.topicTimeSeries) ? data.topicTimeSeries : [];
  const candidateTopicDaily = Array.isArray(data.candidateTopicDaily) ? data.candidateTopicDaily : topicTimeSeries;
  const reportCategories = Array.isArray(data.reportCategories) ? data.reportCategories : [];
  const sourceRows = Array.isArray(data.topNarratives) ? data.topNarratives : [];
  const recentUploads = Array.isArray(data.recentUploads) ? data.recentUploads : [];
  const contribution = data.contribution && typeof data.contribution === "object" ? data.contribution : {};
  const sourceRegistry = data.sourceRegistry && typeof data.sourceRegistry === "object" ? data.sourceRegistry : {};
  const categories = buildPublicCategories(reportCategories, overview.totalEventCount);
  const categoryTree = buildPublicCategoryTree(categories, overview.totalEventCount);
  const narratives = buildPublicNarratives(sourceRows, top);
  const highSignalRows = sourceRows.filter((row) => safeCount(row.avg_signal_score) >= PUBLIC_HIGH_SIGNAL_THRESHOLD);
  const coordinatedAccountEstimate = highSignalRows.reduce((sum, row) => sum + safeCount(row.unique_account_count), 0);
  const coordinatedSourceCount = highSignalRows.length;
  const candidateTopics = buildPublicCandidateTopics({
    topicRows: Array.isArray(data.topTopics) ? data.topTopics : [],
    topicTimeSeries: candidateTopicDaily,
    sourceRows
  });
  const dateRange = {
    start: dailyTrend[0]?.day_key || "",
    end: dailyTrend[dailyTrend.length - 1]?.day_key || "",
    activeDays: dailyTrend.filter((row) => safeCount(row.total_event_count) > 0).length
  };
  return {
    schema: "threadsblocker.platform_public.v1",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    days: safeCount(data.days || 30),
    taxonomyVersion: safeString(data.taxonomyVersion || CURRENT_TAXONOMY_VERSION, 40),
    sampleScope: safeString(data.sampleScope || PUBLIC_SAMPLE_SCOPE, 20),
    overview: {
      uploadCount: safeCount(overview.uploadCount),
      contributorCount: safeCount(contribution.contributorCount) || safeCount(overview.contributorCount),
      blockEventCount: safeCount(overview.blockEventCount),
      reportEventCount: safeCount(overview.reportEventCount),
      totalEventCount: safeCount(overview.totalEventCount),
      summaryTotalEventCount: safeCount(overview.summaryTotalEventCount),
      sourcePostCount: safeCount(overview.sourcePostCount),
      topicSeedCount: safeCount(overview.topicSeedCount),
      sourceCoveragePct: safePercent(overview.sourceCoveragePct),
      reportSourceCoveragePct: safePercent(overview.reportSourceCoveragePct)
    },
    contribution: {
      uploadCount: safeCount(contribution.uploadCount),
      contributorCount: safeCount(contribution.contributorCount) || safeCount(overview.contributorCount),
      dateRange: {
        start: safeString(contribution.dateRange?.start || "", 20),
        end: safeString(contribution.dateRange?.end || "", 20)
      }
    },
    sourceRegistry: {
      sourceCount: safeCount(sourceRegistry.sourceCount),
      trustedSourceCount: safeCount(sourceRegistry.trustedSourceCount),
      probationSourceCount: safeCount(sourceRegistry.probationSourceCount),
      flaggedSourceCount: safeCount(sourceRegistry.flaggedSourceCount),
      activeLast1d: safeCount(sourceRegistry.activeLast1d),
      activeLast7d: safeCount(sourceRegistry.activeLast7d),
      registryUploadCount: safeCount(sourceRegistry.registryUploadCount),
      dateRange: {
        start: safeString(sourceRegistry.dateRange?.start || "", 20),
        end: safeString(sourceRegistry.dateRange?.end || "", 20)
      },
      latestSeenAt: safeString(sourceRegistry.latestSeenAt || "", 40)
    },
    dateRange,
    credibility: {
      effectiveUploadCount: safeCount(overview.uploadCount),
      contributorCount: safeCount(contribution.contributorCount) || safeCount(overview.contributorCount),
      trustedSourceCount: safeCount(sourceRegistry.trustedSourceCount),
      activeSourceCount: safeCount(sourceRegistry.activeLast1d),
      activeObservationDays: safeCount(dateRange.activeDays),
      sourceCoveragePct: safePercent(overview.sourceCoveragePct),
      reportSourceCoveragePct: safePercent(overview.reportSourceCoveragePct)
    },
    thresholds: {
      categoryMinEvents: PUBLIC_MIN_CATEGORY_EVENTS,
      narrativeMinSources: PUBLIC_MIN_NARRATIVE_SOURCES,
      narrativeMinEvents: PUBLIC_MIN_NARRATIVE_EVENTS,
      highSignalScore: PUBLIC_HIGH_SIGNAL_THRESHOLD,
      mediumSignalScore: PUBLIC_MEDIUM_SIGNAL_THRESHOLD
    },
    signals: {
      sourceConcentrationPct: round1(overview.avgSourceConcentrationPct),
      repeatedNarrativePct: round1(overview.avgRepeatedNarrativePct),
      shortTermDiffusionPct: round1(overview.avgShortTermDiffusionPct),
      coordinatedAccountEstimate,
      coordinatedSourceCount
    },
    dailyTrend: dailyTrend.map((row) => ({
      day_key: safeString(row.day_key, 20),
      block_event_count: safeCount(row.block_event_count),
      report_event_count: safeCount(row.report_event_count),
      total_event_count: safeCount(row.total_event_count),
      source_count: safeCount(row.source_count),
      is_spike: Boolean(row.is_spike)
    })),
    topicTimeSeries,
    reportCategories: categories,
    reportCategoryTree: categoryTree,
    topNarratives: narratives,
    candidateTopics,
    recentUploads: recentUploads.slice(0, 10).map((row) => ({
      id: safeCount(row.id),
      created_at: safeString(row.created_at, 40)
    })),
    methodology: {
      trustPolicy: "analysis-ready-uploads",
      scoreBands: {
        low: "0-44",
        medium: "45-64",
        high: "65+"
      },
      principles: [
        "\u516C\u958B\u9801\u53EA\u5448\u73FE\u533F\u540D\u6A23\u672C\u4E2D\u7684\u7D71\u8A08\u6A21\u5F0F\u8207\u4E2D\u6027\u8A0A\u865F\u3002",
        "\u9AD8\u98A8\u96AA\u5206\u7D1A\u662F\u7D71\u8A08\u6A19\u7C64\uFF0C\u4E0D\u662F\u5C0D\u500B\u4EBA\u3001\u8CBC\u6587\u3001\u52D5\u6A5F\u6216\u9055\u6CD5\u6027\u7684\u8A8D\u5B9A\u3002",
        "\u8CC7\u6599\u4F86\u81EA\u4F7F\u7528\u8005\u81EA\u9858\u4E0A\u50B3\uFF0C\u4E26\u975E\u5E73\u53F0\u5168\u91CF\u8CC7\u6599\u3002",
        "\u516C\u958B\u8DA8\u52E2\u7D0D\u5165\u5DF2\u6210\u529F\u5BEB\u5165\u53EF\u5206\u6790\u8868\u7684\u6279\u6B21\uFF1B\u4F86\u6E90\u6D3B\u8E8D\u72C0\u614B\u4E0D\u7B49\u65BC\u53EF\u5206\u6790\u4E8B\u4EF6\u3002",
        "\u5916\u90E8\u4E8B\u4EF6\u9328\u9EDE\u8207\u793E\u7FA4\u5167\u751F\u8B70\u984C\u5206\u958B\u6A19\u793A\uFF1B\u76F8\u95DC\u4E0D\u7B49\u65BC\u56E0\u679C\u3002"
      ]
    }
  };
}
__name(projectPublicPlatformOverview, "projectPublicPlatformOverview");
function buildPublicCandidateTopics({ topicRows, topicTimeSeries, sourceRows }) {
  const topicList = Array.isArray(topicRows) ? topicRows : [];
  const series = Array.isArray(topicTimeSeries) ? topicTimeSeries : [];
  const sources = Array.isArray(sourceRows) ? sourceRows : [];
  const candidateSortDate = /* @__PURE__ */ __name((item) => safeString(item?.displayDate || item?.dateRange?.start || item?.dateHint || "", 20), "candidateSortDate");
  const byTimeThenHeat = /* @__PURE__ */ __name((a, b) => {
    const aDate = candidateSortDate(a);
    const bDate = candidateSortDate(b);
    if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;
    return safeCount(b.eventCount) - safeCount(a.eventCount);
  }, "byTimeThenHeat");
  const candidates = PUBLIC_CANDIDATE_TOPIC_DEFS.map((def) => {
    const keywords = (Array.isArray(def.keywords) ? def.keywords : []).map((term) => safeString(term, 80)).filter(Boolean);
    const matches = /* @__PURE__ */ __name((text) => {
      const value = safeString(text || "", 2e3);
      return keywords.some((keyword) => value.includes(keyword));
    }, "matches");
    const matchedTopics = topicList.filter((row) => matches(row.topic_label));
    const matchedSourceRows = sources.filter((row) => matches(row.source_text_sample));
    const matchedDayCounts = /* @__PURE__ */ new Map();
    for (const entry of series) {
      const topics = Array.isArray(entry?.topics) ? entry.topics : [{ label: entry?.topic_label, count: entry?.event_count }];
      const count = topics.filter((topic) => matches(topic.label)).reduce((sum, topic) => sum + safeCount(topic.count), 0);
      if (count > 0) {
        const date = safeString(entry.date || entry?.day_key || "", 20);
        if (date) matchedDayCounts.set(date, (matchedDayCounts.get(date) || 0) + count);
      }
    }
    const matchedDays = Array.from(matchedDayCounts.entries()).map(([date, eventCount2]) => ({ date, eventCount: eventCount2 }));
    const topicSummaryEventCount = matchedTopics.reduce((sum, row) => sum + safeCount(row.event_count), 0);
    const topicDailyEventCount = matchedDays.reduce((sum, row) => sum + safeCount(row.eventCount), 0);
    const topicEventCount = Math.max(topicSummaryEventCount, topicDailyEventCount);
    const topicAccountCount = matchedTopics.reduce((sum, row) => sum + safeCount(row.account_count), 0);
    const topicSourceCount = matchedTopics.reduce((sum, row) => sum + safeCount(row.source_count), 0);
    const sourceEventCount = matchedSourceRows.reduce((sum, row) => sum + safeCount(row.total_event_count), 0);
    const accountCount = matchedSourceRows.reduce((sum, row) => sum + safeCount(row.unique_account_count), 0);
    const eventCount = Math.max(topicEventCount, sourceEventCount);
    const dayValues = matchedDays.map((row) => row.date).filter(Boolean).sort();
    const displayDate = dayValues[0] || safeString(def.dateHint || "", 20);
    return {
      id: safeString(def.id, 80),
      kind: safeString(def.kind, 40),
      strength: safeString(def.strength, 30),
      title: safeString(def.title, 120),
      note: safeString(def.note, 220),
      keywords: keywords.slice(0, 8),
      displayDate,
      eventCount,
      topicEventCount,
      sourceEventCount,
      accountCount: Math.max(topicAccountCount, accountCount),
      sourceCount: Math.max(topicSourceCount, matchedSourceRows.length),
      topicCount: matchedTopics.length,
      sampleCount: matchedSourceRows.length,
      dateRange: {
        start: dayValues[0] || "",
        end: dayValues[dayValues.length - 1] || ""
      },
      topDays: matchedDays.sort((a, b) => safeCount(b.eventCount) - safeCount(a.eventCount)).slice(0, 5)
    };
  }).filter((item) => item.eventCount > 0 || item.topicEventCount > 0 || item.sampleCount > 0).sort(byTimeThenHeat);
  const grouped = [];
  for (const kind of ["external_anchor", "community_native"]) {
    const limit = safeCount(PUBLIC_CANDIDATE_GROUP_LIMITS[kind]) || 6;
    grouped.push(...candidates.filter((item) => item.kind === kind).sort((a, b) => safeCount(b.eventCount) - safeCount(a.eventCount)).slice(0, limit).sort(byTimeThenHeat));
  }
  return grouped;
}
__name(buildPublicCandidateTopics, "buildPublicCandidateTopics");
function buildPublicCategories(rows, totalEventCount) {
  const list = Array.isArray(rows) ? rows : [];
  const total = safeCount(totalEventCount);
  const filtered = list.map((row) => ({
    label: safeString(row.category_label || row.topic_label, 120),
    eventCount: safeCount(row.event_count),
    accountCount: safeCount(row.account_count),
    sourceCount: safeCount(row.source_count)
  })).filter((row) => row.label && row.eventCount > 0).sort((a, b) => b.eventCount - a.eventCount);
  return filtered.map((row) => ({
    ...row,
    sharePct: total > 0 ? round1(row.eventCount / total * 100) : 0
  }));
}
__name(buildPublicCategories, "buildPublicCategories");
function buildPublicCategoryTree(categories, totalEventCount) {
  const source = Array.isArray(categories) ? categories : [];
  const total = safeCount(totalEventCount);
  const byLabel = /* @__PURE__ */ new Map();
  const usedLabels = /* @__PURE__ */ new Set();
  for (const item of source) {
    const row = item && typeof item === "object" ? item : {};
    const label = safeString(row.label || row.category_label || "", 120);
    if (!label) continue;
    const existing = byLabel.get(label) || {
      label,
      eventCount: 0,
      accountCount: 0,
      sourceCount: 0
    };
    existing.eventCount += safeCount(row.eventCount || row.event_count);
    existing.accountCount += safeCount(row.accountCount || row.account_count);
    existing.sourceCount += safeCount(row.sourceCount || row.source_count);
    byLabel.set(label, existing);
  }
  const collectBucket = /* @__PURE__ */ __name((sourceLabels = []) => {
    const bucket = {
      eventCount: 0,
      accountCount: 0,
      sourceCount: 0,
      sourceLabels: []
    };
    for (const label of sourceLabels) {
      const row = byLabel.get(label);
      if (!row) continue;
      usedLabels.add(label);
      bucket.eventCount += safeCount(row.eventCount);
      bucket.accountCount += safeCount(row.accountCount);
      bucket.sourceCount += safeCount(row.sourceCount);
      bucket.sourceLabels.push(label);
    }
    return bucket;
  }, "collectBucket");
  const nodes = [];
  for (const def of PUBLIC_REPORT_CATEGORY_TREE) {
    const children = Array.isArray(def.children) ? def.children : [];
    if (children.length > 0) {
      const childNodes = children.map((child) => {
        const bucket2 = collectBucket(child.sourceLabels || [child.label]);
        return {
          id: safeString(child.id || child.label, 80),
          label: safeString(child.label, 120),
          eventCount: safeCount(bucket2.eventCount),
          accountCount: safeCount(bucket2.accountCount),
          sourceCount: safeCount(bucket2.sourceCount),
          sharePct: total > 0 ? round1(bucket2.eventCount / total * 100) : 0,
          sourceLabels: bucket2.sourceLabels
        };
      }).filter((child) => child.eventCount > 0);
      const eventCount = childNodes.reduce((sum, child) => sum + safeCount(child.eventCount), 0);
      if (eventCount <= 0) continue;
      nodes.push({
        id: safeString(def.id || def.label, 80),
        label: safeString(def.label, 120),
        note: safeString(def.note || "", 180),
        eventCount,
        accountCount: childNodes.reduce((sum, child) => sum + safeCount(child.accountCount), 0),
        sourceCount: childNodes.reduce((sum, child) => sum + safeCount(child.sourceCount), 0),
        sharePct: total > 0 ? round1(eventCount / total * 100) : 0,
        children: childNodes.sort((a, b) => safeCount(b.eventCount) - safeCount(a.eventCount))
      });
      continue;
    }
    const bucket = collectBucket(def.sourceLabels || [def.label]);
    if (bucket.eventCount <= 0) continue;
    nodes.push({
      id: safeString(def.id || def.label, 80),
      label: safeString(def.label, 120),
      note: safeString(def.note || "", 180),
      eventCount: safeCount(bucket.eventCount),
      accountCount: safeCount(bucket.accountCount),
      sourceCount: safeCount(bucket.sourceCount),
      sharePct: total > 0 ? round1(bucket.eventCount / total * 100) : 0,
      sourceLabels: bucket.sourceLabels,
      children: []
    });
  }
  const unmatched = source.filter((item) => {
    const label = safeString(item?.label || item?.category_label || "", 120);
    return label && !usedLabels.has(label) && safeCount(item?.eventCount || item?.event_count) > 0;
  }).map((item) => ({
    id: `unmapped-${safeString(item.label || item.category_label, 60)}`,
    label: safeString(item.label || item.category_label, 120),
    eventCount: safeCount(item.eventCount || item.event_count),
    accountCount: safeCount(item.accountCount || item.account_count),
    sourceCount: safeCount(item.sourceCount || item.source_count),
    sharePct: total > 0 ? round1(safeCount(item.eventCount || item.event_count) / total * 100) : 0,
    sourceLabels: [safeString(item.label || item.category_label, 120)]
  }));
  if (unmatched.length > 0) {
    const eventCount = unmatched.reduce((sum, child) => sum + safeCount(child.eventCount), 0);
    nodes.push({
      id: "unmapped",
      label: "\u5176\u4ED6\u672A\u5C0D\u61C9\u5206\u985E",
      note: "\u76EE\u524D\u6AA2\u8209\u6A39\u5C1A\u672A\u5C0D\u61C9\u5230\u7684 label\uFF0C\u4FDD\u7559\u539F\u6A23\u986F\u793A\u3002",
      eventCount,
      accountCount: unmatched.reduce((sum, child) => sum + safeCount(child.accountCount), 0),
      sourceCount: unmatched.reduce((sum, child) => sum + safeCount(child.sourceCount), 0),
      sharePct: total > 0 ? round1(eventCount / total * 100) : 0,
      children: unmatched.sort((a, b) => safeCount(b.eventCount) - safeCount(a.eventCount))
    });
  }
  return nodes.sort((a, b) => safeCount(b.eventCount) - safeCount(a.eventCount));
}
__name(buildPublicCategoryTree, "buildPublicCategoryTree");
function buildPublicNarratives(rows, top) {
  const groups = /* @__PURE__ */ new Map();
  for (const item of Array.isArray(rows) ? rows : []) {
    const row = item && typeof item === "object" ? item : {};
    const signalScore = safeCount(row.avg_signal_score);
    const eventCount = safeCount(row.total_event_count);
    const accountCount = safeCount(row.unique_account_count);
    const hints = normalizeTopicHints(row.top_topic_hints_json);
    const narrative = summarizeNarrativePattern(row.source_text_sample || "", hints);
    const key = narrative.key;
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        title: narrative.title,
        summary: narrative.summary,
        eventCount: 0,
        sourceCount: 0,
        accountCount: 0,
        maxSignalScore: 0,
        hintCounts: /* @__PURE__ */ new Map()
      });
    }
    const group = groups.get(key);
    group.eventCount += eventCount;
    group.sourceCount += 1;
    group.accountCount += accountCount;
    group.maxSignalScore = Math.max(group.maxSignalScore, signalScore);
    for (const hint of hints) {
      group.hintCounts.set(hint, (group.hintCounts.get(hint) || 0) + 1);
    }
  }
  const sorted = Array.from(groups.values()).filter((group) => group.sourceCount >= PUBLIC_MIN_NARRATIVE_SOURCES && group.eventCount >= PUBLIC_MIN_NARRATIVE_EVENTS).sort((a, b) => b.eventCount - a.eventCount).slice(0, Math.max(1, top)).map((group) => ({
    title: group.title,
    summary: group.summary,
    whyNote: buildNarrativeWhyNote(group),
    eventCount: group.eventCount,
    sourceCount: group.sourceCount,
    accountCount: group.accountCount,
    signalBand: scoreToBand(group.maxSignalScore),
    hintLabels: Array.from(group.hintCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => label)
  }));
  return sorted;
}
__name(buildPublicNarratives, "buildPublicNarratives");
function buildNarrativeWhyNote(group) {
  const hints = Array.from(group?.hintCounts?.entries?.() || []).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([label]) => safeString(label, 60)).filter(Boolean);
  const hintText = hints.length ? hints.join("\u3001") : "\u76F8\u8FD1\u63AA\u8FAD";
  const signalBand = scoreToBand(group?.maxSignalScore);
  const signalText = signalBand === "high" ? "\u9AD8\u5EA6\u91CD\u8907" : signalBand === "medium" ? "\u4E2D\u5EA6\u91CD\u8907" : "\u4F4E\u5EA6\u91CD\u8907";
  const thresholdText = `\u81F3\u5C11 ${PUBLIC_MIN_NARRATIVE_SOURCES} \u500B\u4F86\u6E90\u8207 ${PUBLIC_MIN_NARRATIVE_EVENTS} \u6B21\u4E8B\u4EF6`;
  return `\u9019\u7D44\u8A0E\u8AD6\u76EE\u524D\u7D2F\u7A4D ${safeCount(group?.eventCount)} \u6B21\u5C01\u9396\u6216\u6AA2\u8209\uFF0C\u5206\u5E03\u5728 ${safeCount(group?.sourceCount)} \u500B\u4F86\u6E90\uFF1B\u5E38\u898B\u95DC\u9375\u5B57\u5305\u542B ${hintText}\u3002\u5B83\u6703\u51FA\u73FE\u5728\u516C\u958B\u9801\uFF0C\u662F\u56E0\u70BA\u540C\u6642\u9054\u5230 ${thresholdText}\uFF0C\u800C\u4E14\u5167\u5BB9\u5448\u73FE${signalText}\uFF0C\u4E0D\u662F\u55AE\u4E00\u5076\u767C\u7559\u8A00\u3002`;
}
__name(buildNarrativeWhyNote, "buildNarrativeWhyNote");
function normalizeTopicHints(rawJson) {
  const raw = safeParseJSON(rawJson || "[]");
  return (Array.isArray(raw) ? raw : []).map((item) => sanitizeHintLabel(asObject(item).topicHint || "")).filter(Boolean).slice(0, 6);
}
__name(normalizeTopicHints, "normalizeTopicHints");
function sanitizeHintLabel(raw) {
  const text = safeString(raw, 120);
  if (!text) return "";
  if (text.startsWith("report_leaf:")) return safeString(text.slice("report_leaf:".length), 100);
  if (text.startsWith("report:")) return safeString(text.slice("report:".length), 100);
  if (text.startsWith("hashtag:")) return safeString(text.slice("hashtag:".length), 100);
  return text;
}
__name(sanitizeHintLabel, "sanitizeHintLabel");
function summarizeNarrativePattern(text, hints = []) {
  const raw = compactWhitespace(String(text || ""));
  const hashtags = extractHashtags(raw);
  const clauses = raw.replace(/https?:\/\/\S+/g, "").split(/[。！？!?，,、；;:：\n]+/).map((part) => compactWhitespace(part)).filter(Boolean);
  const styleTags = [];
  if (clauses.length >= 3) styleTags.push("\u591A\u53E5\u77ED\u53E5");
  if (/[!！]/.test(raw)) styleTags.push("\u611F\u5606\u8A9E\u6C23");
  if (/[?？]/.test(raw)) styleTags.push("\u63D0\u554F\u5F0F\u8A9E\u6C23");
  if (!styleTags.length) styleTags.push("\u76F8\u8FD1\u63AA\u8FAD");
  const anchors = [...hints, ...hashtags].filter(Boolean).slice(0, 2);
  const anchorText = anchors.length ? anchors.join("\u3001") : "\u55AE\u4E00\u8B70\u984C\u6846\u67B6";
  const title = anchors.length ? `\u4EE5 ${anchorText} \u70BA\u6838\u5FC3\u7684\u91CD\u8907\u6558\u4E8B` : "\u9AD8\u76F8\u4F3C\u6587\u5B57\u6558\u4E8B";
  const summary = `\u8FD1\u671F\u6A23\u672C\u4E2D\uFF0C\u591A\u500B\u4F86\u6E90\u53CD\u8986\u4F7F\u7528 ${anchorText} \u7684\u76F8\u8FD1\u8868\u8FF0\uFF0C\u5E38\u898B\u5F62\u5F0F\u70BA ${styleTags.join("\u3001")}\u3002`;
  const key = [anchors.map((item) => item.toLowerCase()).join("|") || "generic", styleTags.join("|")].join("::");
  return { key, title, summary };
}
__name(summarizeNarrativePattern, "summarizeNarrativePattern");
function extractHashtags(text) {
  const matches = String(text || "").match(/#[^\s#.,，。!?！？:：;；、]+/g) || [];
  return matches.map((tag) => safeString(tag, 40).toLowerCase()).slice(0, 3);
}
__name(extractHashtags, "extractHashtags");
function compactWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
__name(compactWhitespace, "compactWhitespace");
function scoreToBand(score) {
  const n = safeCount(score);
  if (n >= PUBLIC_HIGH_SIGNAL_THRESHOLD) return "high";
  if (n >= PUBLIC_MEDIUM_SIGNAL_THRESHOLD) return "medium";
  return "low";
}
__name(scoreToBand, "scoreToBand");
function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}
__name(round1, "round1");
var platformSchemaReady = false;
async function ensurePlatformTables(env) {
  if (platformSchemaReady) return;
  for (const sql of PLATFORM_SCHEMA_STMTS) {
    await env.DB.prepare(sql).run();
  }
  for (const col of [
    "ALTER TABLE platform_uploads ADD COLUMN source_concentration_pct REAL DEFAULT 0",
    "ALTER TABLE platform_uploads ADD COLUMN repeated_narrative_pct REAL DEFAULT 0",
    "ALTER TABLE platform_uploads ADD COLUMN short_term_diffusion_pct REAL DEFAULT 0",
    `ALTER TABLE platform_uploads ADD COLUMN client_source_id TEXT`,
    `ALTER TABLE platform_uploads ADD COLUMN client_platform TEXT`,
    `ALTER TABLE platform_uploads ADD COLUMN taxonomy_version TEXT DEFAULT '${CURRENT_TAXONOMY_VERSION}'`,
    `ALTER TABLE platform_uploads ADD COLUMN trust_tier TEXT DEFAULT '${LEGACY_TRUST_TIER}'`,
    `ALTER TABLE platform_uploads ADD COLUMN risk_score_band TEXT DEFAULT 'low'`,
    `ALTER TABLE platform_uploads ADD COLUMN sync_enabled INTEGER`,
    `ALTER TABLE platform_uploads ADD COLUMN upload_trigger TEXT`
  ]) {
    try {
      await env.DB.exec(col);
    } catch (_) {
    }
  }
  platformSchemaReady = true;
}
__name(ensurePlatformTables, "ensurePlatformTables");
async function handleAdminUpdateStatus(request, env, pathname) {
  assertAdmin(request, env);
  const id = Number.parseInt(pathname.split("/").pop() || "", 10);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ code: 400, message: "Invalid id" }, 400);
  }
  const body = await request.json().catch(() => null);
  const status = (body?.status || "").trim();
  const allowed = /* @__PURE__ */ new Set(["PENDING", "ACK", "FIXED", "IGNORED"]);
  if (!allowed.has(status)) {
    return json({ code: 400, message: "Invalid status" }, 400);
  }
  const updated = await env.DB.prepare("UPDATE bug_reports SET status = ? WHERE id = ?").bind(status, id).run();
  if ((updated.meta?.changes || 0) === 0) {
    return json({ code: 404, message: "Not found" }, 404);
  }
  return json({ code: 200, message: "Updated" }, 200);
}
__name(handleAdminUpdateStatus, "handleAdminUpdateStatus");
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
__name(safeParseJSON, "safeParseJSON");
function asObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}
__name(asObject, "asObject");
function asArray(v) {
  return Array.isArray(v) ? v : [];
}
__name(asArray, "asArray");
function safeString(v, max = 200) {
  return String(v || "").trim().slice(0, max);
}
__name(safeString, "safeString");
function safeCount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(Math.min(n, 1e9));
}
__name(safeCount, "safeCount");
function safePercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
__name(safePercent, "safePercent");
function utf8ByteLength(text) {
  return new TextEncoder().encode(String(text || "")).length;
}
__name(utf8ByteLength, "utf8ByteLength");
function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
__name(stableStringify, "stableStringify");
async function buildPlatformAnalysisPayloadHash(body, clientSourceId) {
  const sourceKey = safeString(clientSourceId, 120) || "anonymous";
  const canonical = {
    schema: safeString(body?.schema, 80),
    source: sourceKey,
    accounts: asArray(body?.accounts),
    events: asArray(body?.events),
    sources: asArray(body?.sources),
    sourceEvidence: asArray(body?.sourceEvidence),
    analysisSeeds: asObject(body?.analysisSeeds),
    summary: asObject(body?.summary)
  };
  return sha256Hex(`${sourceKey}
${stableStringify(canonical)}`);
}
__name(buildPlatformAnalysisPayloadHash, "buildPlatformAnalysisPayloadHash");
async function recordPlatformRawIngest(env, fields) {
  const rawPayload = String(fields.rawPayload || "");
  const rawPayloadRef = await storePlatformRawPayload(env, {
    rawPayload,
    rawPayloadHash: fields.rawPayloadHash,
    clientSourceId: fields.clientSourceId,
    ingestStatus: fields.ingestStatus
  });
  const insert = await env.DB.prepare(
    `INSERT INTO platform_raw_ingests (
      raw_payload_hash, analysis_payload_hash, payload_bytes, schema, client_source_id,
      client_platform, exporter_version, upload_trigger, ingest_status, error_message, raw_payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    safeString(fields.rawPayloadHash, 128),
    safeString(fields.analysisPayloadHash, 128) || null,
    safeCount(fields.payloadBytes),
    safeString(fields.schema, 80) || null,
    safeString(fields.clientSourceId, 120) || null,
    safeString(fields.clientPlatform, 40) || null,
    safeString(fields.exporterVersion, 80) || null,
    safeString(fields.uploadTrigger, 40) || null,
    safeString(fields.ingestStatus || "received", 40),
    safeString(fields.errorMessage, 300) || null,
    rawPayloadRef
  ).run();
  return Number(insert.meta?.last_row_id || 0);
}
__name(recordPlatformRawIngest, "recordPlatformRawIngest");
async function storePlatformRawPayload(env, fields) {
  const rawPayload = String(fields.rawPayload || "");
  if (!rawPayload) return "";
  if (!env.RAW_INGEST_BUCKET || typeof env.RAW_INGEST_BUCKET.put !== "function") {
    return rawPayload;
  }
  const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const sourceId = safeString(fields.clientSourceId || "anonymous", 120).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "anonymous";
  const hash = safeString(fields.rawPayloadHash, 128) || await sha256Hex(rawPayload);
  const status = safeString(fields.ingestStatus || "received", 40).replace(/[^a-zA-Z0-9._-]+/g, "_") || "received";
  const key = `platform-raw-ingests/${day}/${status}/${sourceId}/${hash}.json`;
  await env.RAW_INGEST_BUCKET.put(key, rawPayload, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      rawPayloadHash: hash,
      clientSourceId: sourceId,
      ingestStatus: status
    }
  });
  return `r2://${key}`;
}
__name(storePlatformRawPayload, "storePlatformRawPayload");
async function updatePlatformRawIngest(env, rawIngestId, fields = {}) {
  const id = Number(rawIngestId || 0);
  if (!id) return;
  await env.DB.prepare(
    `UPDATE platform_raw_ingests
     SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         analysis_payload_hash = COALESCE(?, analysis_payload_hash),
         ingest_status = COALESCE(?, ingest_status),
         accepted_upload_id = COALESCE(?, accepted_upload_id),
         duplicate_of_upload_id = COALESCE(?, duplicate_of_upload_id),
         error_message = ?
     WHERE id = ?`
  ).bind(
    safeString(fields.analysisPayloadHash, 128) || null,
    fields.ingestStatus ? safeString(fields.ingestStatus, 40) : null,
    fields.acceptedUploadId ? safeCount(fields.acceptedUploadId) : null,
    fields.duplicateOfUploadId ? safeCount(fields.duplicateOfUploadId) : null,
    fields.errorMessage === void 0 ? null : safeString(fields.errorMessage, 300) || null,
    id
  ).run();
}
__name(updatePlatformRawIngest, "updatePlatformRawIngest");
function toDayKey(rawTs) {
  const ts = normalizeEpochMs(rawTs);
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
__name(toDayKey, "toDayKey");
function normalizeEpochMs(rawTs) {
  const n = Number(rawTs);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e11 ? Math.floor(n * 1e3) : Math.floor(n);
}
__name(normalizeEpochMs, "normalizeEpochMs");
function boolAsInt(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  return null;
}
__name(boolAsInt, "boolAsInt");
async function touchSourceRegistrySeen(env, clientSourceId, clientPlatform, exporterVersion) {
  const sourceId = safeString(clientSourceId, 120);
  if (!sourceId) return;
  await env.DB.prepare(
    `UPDATE platform_source_registry
     SET last_seen_at = ?,
         client_platform = ?,
         last_exporter_version = ?
     WHERE client_source_id = ?`
  ).bind(
    (/* @__PURE__ */ new Date()).toISOString(),
    safeString(clientPlatform, 40),
    safeString(exporterVersion, 80),
    sourceId
  ).run();
}
__name(touchSourceRegistrySeen, "touchSourceRegistrySeen");
async function resolveTrustMeta(env, clientSourceId, clientPlatform, exporterVersion) {
  const sourceId = safeString(clientSourceId, 120);
  if (!sourceId) {
    return { trustTier: LEGACY_TRUST_TIER, riskScoreBand: "low", sampleScope: PUBLIC_SAMPLE_SCOPE };
  }
  const now = /* @__PURE__ */ new Date();
  const nowIso = now.toISOString();
  const todayKey = nowIso.slice(0, 10);
  const existing = await env.DB.prepare(
    `SELECT upload_count, active_day_count, last_upload_day
     FROM platform_source_registry
     WHERE client_source_id = ?`
  ).bind(sourceId).first();
  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS upload_count
     FROM platform_uploads
     WHERE client_source_id = ?
       AND datetime(created_at) >= datetime('now', '-1 day')`
  ).bind(sourceId).first();
  const previousUploads = safeCount(existing?.upload_count);
  const recentUploads = safeCount(recent?.upload_count) + 1;
  const nextUploads = previousUploads + 1;
  let activeDayCount = safeCount(existing?.active_day_count);
  if (safeString(existing?.last_upload_day, 20) !== todayKey) activeDayCount += 1;
  let trustTier = "probation";
  let riskScoreBand = "low";
  if (recentUploads >= 8) {
    trustTier = "flagged";
    riskScoreBand = "high";
  } else if (nextUploads >= 3 && activeDayCount >= 2) {
    trustTier = "trusted";
  }
  await env.DB.prepare(
    `INSERT INTO platform_source_registry (
      client_source_id, first_seen_at, last_seen_at, last_upload_day, active_day_count,
      upload_count, client_platform, last_exporter_version, trust_tier, risk_score_band
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(client_source_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      last_upload_day = excluded.last_upload_day,
      active_day_count = excluded.active_day_count,
      upload_count = excluded.upload_count,
      client_platform = excluded.client_platform,
      last_exporter_version = excluded.last_exporter_version,
      trust_tier = excluded.trust_tier,
      risk_score_band = excluded.risk_score_band`
  ).bind(
    sourceId,
    nowIso,
    nowIso,
    todayKey,
    activeDayCount,
    nextUploads,
    safeString(clientPlatform, 40),
    safeString(exporterVersion, 80),
    trustTier,
    riskScoreBand
  ).run();
  return {
    trustTier,
    riskScoreBand,
    sampleScope: trustTier === "trusted" ? PUBLIC_SAMPLE_SCOPE : "probation"
  };
}
__name(resolveTrustMeta, "resolveTrustMeta");
function buildTopicDailyBuckets(events, sources, sampleScope, taxonomyVersion) {
  const sourceTopicMap = /* @__PURE__ */ new Map();
  for (const item of asArray(sources)) {
    const source = asObject(item);
    const sourceUrl = safeString(source.sourceUrl, 300);
    if (!sourceUrl) continue;
    const labels = [];
    for (const hintItem of asArray(source.topTopicHints)) {
      const hint = asObject(hintItem);
      const normalized = normalizeTopicLabel(hint.topicHint || hint.topicLabel || "");
      if (normalized && !labels.includes(normalized)) labels.push(normalized);
      if (labels.length >= 3) break;
    }
    if (labels.length > 0) sourceTopicMap.set(sourceUrl, labels);
  }
  const buckets = /* @__PURE__ */ new Map();
  const uploadSeen = /* @__PURE__ */ new Set();
  for (const item of asArray(events)) {
    const event = asObject(item);
    const dayKey = toDayKey(event.eventAt);
    if (!dayKey) continue;
    const sourceUrl = safeString(event.sourceUrl, 300);
    const labels = dedupeStrings([
      ...sourceTopicMap.get(sourceUrl) || [],
      normalizeTopicLabel(event.reportLeafCategory),
      normalizeTopicLabel(event.reportPrimaryCategory)
    ]).slice(0, 3);
    for (const topicLabel of labels) {
      const bucketKey = `${dayKey}::${topicLabel}::${taxonomyVersion}::${sampleScope}`;
      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, {
          dayKey,
          topicLabel,
          eventCount: 0,
          uploadCount: 0
        });
      }
      const bucket = buckets.get(bucketKey);
      bucket.eventCount += 1;
      if (!uploadSeen.has(bucketKey)) {
        bucket.uploadCount += 1;
        uploadSeen.add(bucketKey);
      }
    }
  }
  return buckets;
}
__name(buildTopicDailyBuckets, "buildTopicDailyBuckets");
function normalizeTopicLabel(raw) {
  let value = safeString(raw, 140);
  if (!value) return "";
  value = value.replace(/^hashtag:/i, "").replace(/^report_leaf:/i, "").replace(/^report:/i, "").replace(/^#/, "").trim();
  if (!value) return "";
  const blacklist = /* @__PURE__ */ new Set(["likes", "quotes", "reposts", "manual", "unknown"]);
  return blacklist.has(value.toLowerCase()) ? "" : value;
}
__name(normalizeTopicLabel, "normalizeTopicLabel");
function dedupeStrings(values) {
  const seen = /* @__PURE__ */ new Set();
  const picked = [];
  for (const value of values) {
    const item = safeString(value, 140);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    picked.push(item);
  }
  return picked;
}
__name(dedupeStrings, "dedupeStrings");
async function storeEvidenceBundle(env, uploadId, bundle) {
  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== "function") return false;
  const key = `platform-uploads/${String(uploadId).padStart(10, "0")}.json`;
  await env.EVIDENCE_BUCKET.put(key, JSON.stringify(bundle));
  return true;
}
__name(storeEvidenceBundle, "storeEvidenceBundle");
function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(String(raw || ""), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
__name(clampInt, "clampInt");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
