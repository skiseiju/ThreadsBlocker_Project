const DEFAULT_ALLOWED_DRIFT = 300;
const DEFAULT_RATE_WINDOW = 300;
const PLATFORM_MAX_PAYLOAD_BYTES = 1 * 1024 * 1024;
const PLATFORM_MAX_TOPICS = 200;
const PLATFORM_MAX_SOURCES = 400;
const PLATFORM_MAX_EVENTS = 120000;
const PUBLIC_MIN_CATEGORY_EVENTS = 5;
const PUBLIC_MIN_NARRATIVE_SOURCES = 2;
const PUBLIC_MIN_NARRATIVE_EVENTS = 20;
const PUBLIC_HIGH_SIGNAL_THRESHOLD = 65;
const PUBLIC_MEDIUM_SIGNAL_THRESHOLD = 45;
const CURRENT_TAXONOMY_VERSION = 'topic-taxonomy.v1';
const PUBLIC_SAMPLE_SCOPE = 'trusted';
const LEGACY_TRUST_TIER = 'trusted';
const PLATFORM_SCHEMA_STMTS = [
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
  'CREATE INDEX IF NOT EXISTS idx_platform_uploads_created_at ON platform_uploads(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_platform_uploads_events ON platform_uploads(total_event_count DESC)',
  'CREATE INDEX IF NOT EXISTS idx_platform_uploads_trust_tier ON platform_uploads(trust_tier)',
  `CREATE TABLE IF NOT EXISTS platform_topic_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    topic_label TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    account_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS idx_platform_topic_upload ON platform_topic_metrics(upload_id)',
  'CREATE INDEX IF NOT EXISTS idx_platform_topic_event_count ON platform_topic_metrics(event_count DESC)',
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
  'CREATE INDEX IF NOT EXISTS idx_platform_source_upload ON platform_source_metrics(upload_id)',
  'CREATE INDEX IF NOT EXISTS idx_platform_source_total ON platform_source_metrics(total_event_count DESC)',
  `CREATE TABLE IF NOT EXISTS platform_daily_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    day_key TEXT NOT NULL,
    block_event_count INTEGER NOT NULL DEFAULT 0,
    report_event_count INTEGER NOT NULL DEFAULT 0,
    total_event_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS idx_platform_daily_upload ON platform_daily_metrics(upload_id)',
  'CREATE INDEX IF NOT EXISTS idx_platform_daily_day ON platform_daily_metrics(day_key DESC)',
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
  'CREATE INDEX IF NOT EXISTS idx_platform_topic_daily_v2_day ON platform_topic_daily_v2(day_key DESC)',
  'CREATE INDEX IF NOT EXISTS idx_platform_topic_daily_v2_scope ON platform_topic_daily_v2(sample_scope, taxonomy_version)',
  `CREATE TABLE IF NOT EXISTS platform_category_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL,
    category_label TEXT NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    account_count INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0
  )`,
  'CREATE INDEX IF NOT EXISTS idx_platform_category_upload ON platform_category_metrics(upload_id)',
  'CREATE INDEX IF NOT EXISTS idx_platform_category_event ON platform_category_metrics(event_count DESC)',
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
  'CREATE INDEX IF NOT EXISTS idx_platform_source_registry_tier ON platform_source_registry(trust_tier)',
  `CREATE TABLE IF NOT EXISTS political_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    source_name TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_political_events_date ON political_events(event_date DESC)'
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      if (url.pathname === '/' && request.method === 'GET') {
        return withCors(json({
          code: 200,
          message: 'ThreadsBlocker API',
          endpoints: {
            health: '/api/v1/health',
            bugIngest: 'POST /api/v1/reports/bug',
            platformIngest: 'POST /api/v1/platform/ingest',
            adminBugs: 'GET /api/v1/admin/bugs (Bearer token)',
            adminStats: 'GET /api/v1/admin/stats (Bearer token)',
            adminPlatformOverview: 'GET /api/v1/admin/platform/overview (Bearer token)'
          }
        }, 200));
      }

      if (url.pathname === '/api/v1/reports/bug' && request.method === 'POST') {
        return withCors(await handleBugIngest(request, env));
      }

      if (url.pathname === '/api/v1/platform/ingest' && request.method === 'POST') {
        return withCors(await handlePlatformIngest(request, env));
      }
      if (url.pathname === '/api/v1/platform/ingest' && request.method === 'GET') {
        return withCors(json({ code: 405, message: 'Use POST with schema threadsblocker.platform_upload.v2 JSON payload' }, 405));
      }
      if (url.pathname === '/api/v1/platform/overview' && request.method === 'GET') {
        return withCors(await handlePublicPlatformOverview(request, env));
      }
      if (url.pathname === '/api/v1/platform/topic/details' && request.method === 'GET') {
        return withCors(await handlePublicTopicDetails(request, env));
      }
      if (url.pathname === '/api/v1/admin/political-events/ingest' && request.method === 'POST') {
        return withCors(await handleAdminPoliticalEventsIngest(request, env));
      }
      if (url.pathname === '/api/v1/platform/political-events' && request.method === 'GET') {
        return withCors(await handlePublicPoliticalEvents(request, env));
      }

      if (url.pathname === '/api/v1/admin/bugs' && request.method === 'GET') {
        return withCors(await handleAdminList(request, env));
      }

      if (url.pathname === '/api/v1/admin/stats' && request.method === 'GET') {
        return withCors(await handleAdminStats(request, env));
      }

      if (url.pathname === '/api/v1/admin/platform/overview' && request.method === 'GET') {
        return withCors(await handleAdminPlatformOverview(request, env));
      }

      if (url.pathname.startsWith('/api/v1/admin/bugs/') && request.method === 'PATCH') {
        return withCors(await handleAdminUpdateStatus(request, env, url.pathname));
      }

      if (url.pathname === '/api/v1/health' && request.method === 'GET') {
        return withCors(json({ code: 200, message: 'ok' }, 200));
      }

      return withCors(json({ code: 404, message: 'Not found' }, 404));
    } catch (err) {
      if (err instanceof Response) return withCors(err);
      return withCors(json({ code: 500, message: err?.message || 'Internal error' }, 500));
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return new Response(response.body, { status: response.status, headers });
}

function getAdminToken(request) {
  const auth = request.headers.get('Authorization') || '';
  const prefix = 'Bearer ';
  if (!auth.startsWith(prefix)) return '';
  return auth.slice(prefix.length).trim();
}

function assertAdmin(request, env) {
  const adminToken = env.ADMIN_TOKEN || '';
  const token = getAdminToken(request);
  if (!adminToken || !token || token !== adminToken) {
    throw new Response(JSON.stringify({ code: 401, message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleBugIngest(request, env) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return json({ code: 400, message: 'Bad Request: invalid json' }, 400);
  }

  const requiredFields = ['timestamp', 'hwid', 'source_app', 'message', 'signature'];
  for (const field of requiredFields) {
    if (!body[field]) {
      return json({ code: 400, message: `Bad Request: missing ${field}` }, 400);
    }
  }

  const salt = env.BUG_REPORT_SALT || '';
  if (!salt) {
    return json({ code: 500, message: 'Server misconfigured: missing BUG_REPORT_SALT' }, 500);
  }

  const allowedDrift = Number(env.ALLOWED_TIME_DRIFT_SEC || DEFAULT_ALLOWED_DRIFT);
  const rateWindow = Number(env.RATE_LIMIT_WINDOW_SEC || DEFAULT_RATE_WINDOW);

  const now = Math.floor(Date.now() / 1000);
  const ts = Number.parseInt(String(body.timestamp), 10);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > allowedDrift) {
    return json({ code: 403, message: 'Request expired: time drift too large' }, 403);
  }

  const expectedSig = await sha256Hex(`${body.timestamp}${body.hwid}${salt}`);
  if (expectedSig !== body.signature) {
    return json({ code: 401, message: 'Unauthorized: invalid signature' }, 401);
  }

  const limitRow = await env.DB.prepare('SELECT last_report_unix FROM rate_limits WHERE hwid = ?').bind(body.hwid).first();
  if (limitRow && (now - Number(limitRow.last_report_unix || 0) < rateWindow)) {
    return json({ code: 429, message: 'Rate limit exceeded' }, 429);
  }

  await env.DB.prepare(
    'INSERT INTO rate_limits(hwid, last_report_unix) VALUES (?, ?) ON CONFLICT(hwid) DO UPDATE SET last_report_unix = excluded.last_report_unix'
  ).bind(body.hwid, now).run();

  let metadataRaw = '';
  let metadataObj = null;
  if (typeof body.metadata === 'string') {
    metadataRaw = body.metadata;
    try {
      metadataObj = JSON.parse(body.metadata);
    } catch {
      metadataObj = null;
    }
  } else if (body.metadata && typeof body.metadata === 'object') {
    metadataObj = body.metadata;
    metadataRaw = JSON.stringify(body.metadata);
  }

  const clientEnv = metadataObj && typeof metadataObj.clientEnv === 'object' ? metadataObj.clientEnv : {};

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ipHash = ip ? await sha256Hex(ip) : '';

  const insert = await env.DB.prepare(
    `INSERT INTO bug_reports (
      source_app, version, hwid, level, message, error_code, metadata, signature, status,
      ip_hash, user_agent, platform, script_manager, has_gm_xhr, online, endpoint, error_name, error_message, stack
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    String(body.source_app || ''),
    String(body.version || ''),
    String(body.hwid || ''),
    String(body.level || 'ERROR'),
    String(body.message || ''),
    String(body.error_code || ''),
    metadataRaw,
    String(body.signature || ''),
    ipHash,
    request.headers.get('User-Agent') || '',
    String(clientEnv.platform || ''),
    String(clientEnv.scriptManager || ''),
    boolAsInt(clientEnv.hasGMXHR),
    boolAsInt(clientEnv.online),
    String(clientEnv.endpoint || ''),
    String(clientEnv.errorName || ''),
    String(clientEnv.errorMessage || ''),
    String(clientEnv.stack || '')
  ).run();

  return json({ code: 200, message: 'Success', id: insert.meta?.last_row_id || null }, 200);
}

async function handlePlatformIngest(request, env) {
  await ensurePlatformTables(env);

  const rawText = await request.text();
  if (!rawText || rawText.trim().length === 0) {
    return json({ code: 400, message: 'Bad Request: empty payload' }, 400);
  }
  if (rawText.length > PLATFORM_MAX_PAYLOAD_BYTES) {
    return json({ code: 413, message: 'Payload too large' }, 413);
  }

  const body = safeParseJSON(rawText);
  if (!body || typeof body !== 'object') {
    return json({ code: 400, message: 'Bad Request: invalid json' }, 400);
  }
  if (safeString(body.schema, 80) !== 'threadsblocker.platform_upload.v2') {
    return json({ code: 400, message: 'Bad Request: unsupported schema' }, 400);
  }

  const payloadHash = await sha256Hex(rawText);
  const summary = asObject(body.summary);
  const exporter = asObject(body.exporter);

  const sourceApp = safeString(exporter.tool || body.source_app || 'ThreadsBlocker', 80);
  const exporterVersion = safeString(exporter.version || '', 80);
  const timezone = safeString(exporter.timezone || '', 64);
  const locale = safeString(exporter.locale || '', 64);
  const uploadMeta = asObject(body.uploadMeta);
  const clientSourceId = safeString(body.clientSourceId || uploadMeta.clientSourceId || '', 120);
  const clientPlatform = safeString(uploadMeta.clientPlatform || body.clientPlatform || 'unknown', 40);
  const syncEnabled = boolAsInt(asObject(body.syncPreferences).autoSyncEnabled);
  const uploadTrigger = safeString(uploadMeta.uploadTrigger || 'manual', 24);
  const taxonomyVersion = CURRENT_TAXONOMY_VERSION;

  const blockEventCount = safeCount(summary.blockEventCount);
  const reportEventCount = safeCount(summary.reportEventCount);
  const totalEventCount = safeCount(summary.totalEventCount);
  const sourcePostCount = safeCount(summary.sourcePostCount);
  const topicSeedCount = safeCount(summary.topTopicSeedCount);
  const sourceCoveragePct = safePercent(summary.sourceCoveragePct);
  const reportSourceCoveragePct = safePercent(summary.reportSourceCoveragePct);
  const sourcesArr = asArray(body.sources)
    .slice()
    .sort((a, b) => safeCount(asObject(b).totalEventCount) - safeCount(asObject(a).totalEventCount));
  const top3EventCount = sourcesArr
    .slice(0, 3)
    .reduce((sum, src) => sum + safeCount(asObject(src).totalEventCount), 0);
  const sourceConcentrationPct = totalEventCount > 0
    ? Math.min(100, Math.round((top3EventCount / totalEventCount) * 1000) / 10)
    : 0;

  const analysisSeeds = asObject(body.analysisSeeds);
  const narrativeSeeds = asArray(analysisSeeds.narrativeSeeds);
  const narrativeEventCount = narrativeSeeds.reduce((sum, seed) => (
    sum + safeCount(asObject(seed).eventCount)
  ), 0);
  const repeatedNarrativePct = totalEventCount > 0
    ? Math.min(100, Math.round((narrativeEventCount / totalEventCount) * 1000) / 10)
    : 0;

  const campaignCandidates = asArray(analysisSeeds.campaignCandidates);
  const campaignEventCount = campaignCandidates.reduce((sum, candidate) => {
    const item = asObject(candidate);
    return sum + safeCount(item.blockEventCount) + safeCount(item.reportEventCount);
  }, 0);
  const shortTermDiffusionPct = totalEventCount > 0
    ? Math.min(100, Math.round((campaignEventCount / totalEventCount) * 1000) / 10)
    : 0;
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
      ) VALUES (?, ?, ?, ?, ?, 'extension', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      'threadsblocker.platform_upload.v2',
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
    const msg = String(err?.message || err || '');
    if (msg.includes('UNIQUE constraint failed: platform_uploads.payload_hash')) {
      const row = await env.DB.prepare(
        'SELECT id, created_at FROM platform_uploads WHERE payload_hash = ?'
      ).bind(payloadHash).first();
      return json({
        code: 200,
        message: 'Duplicate payload skipped',
        duplicate: true,
        id: row?.id || null,
        createdAt: row?.created_at || null
      }, 200);
    }
    throw err;
  }

  if (!uploadId) {
    return json({ code: 500, message: 'Failed to create upload record' }, 500);
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

    const sourceOwners = asArray(source.sourceOwners).map(v => safeString(v, 80)).filter(Boolean);
    const sourceTexts = asArray(source.sourceTextSamples).map(v => safeString(v, 320)).filter(Boolean);
    const topTopicHints = asArray(source.topTopicHints).slice(0, 8).map((hint) => {
      const h = asObject(hint);
      return {
        topicHint: safeString(h.topicHint, 120),
        count: safeCount(h.count)
      };
    }).filter(h => h.topicHint);

    await env.DB.prepare(
      `INSERT INTO platform_source_metrics (
        upload_id, source_url, source_owner, source_text_sample, block_event_count, report_event_count,
        total_event_count, unique_account_count, manipulation_signal_score, manipulation_risk_level, top_topic_hints_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      uploadId,
      sourceUrl,
      sourceOwners[0] || '',
      sourceTexts[0] || '',
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

  const categoryMap = new Map();
  for (const item of events) {
    const event = asObject(item);
    const categoryLabel = safeString(event.reportLeafCategory || event.reportPrimaryCategory, 140);
    if (!categoryLabel) continue;

    if (!categoryMap.has(categoryLabel)) {
      categoryMap.set(categoryLabel, {
        eventCount: 0,
        accountIds: new Set(),
        sourceUrls: new Set()
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
        sourceSet: new Set()
      };
    }
    const bucket = dailyAgg[dayKey];
    const eventType = safeString(event.eventType, 20);
    if (eventType === 'block') bucket.block++;
    if (eventType === 'report') bucket.report++;
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
    schema: 'threadsblocker.platform_upload.bundle.v1',
    uploadId,
    taxonomyVersion,
    clientSourceId,
    clientPlatform,
    trustTier: trustMeta.trustTier,
    exportedAt: safeString(body.exportedAt, 40) || new Date().toISOString(),
    events,
    sources,
    sourceEvidence: asArray(body.sourceEvidence)
  });

  return json({
    code: 200,
    message: 'Platform payload ingested',
    id: uploadId,
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
}

async function handleAdminList(request, env) {
  assertAdmin(request, env);

  const url = new URL(request.url);
  const limit = clampInt(url.searchParams.get('limit'), 1, 200, 50);
  const status = (url.searchParams.get('status') || '').trim();
  const version = (url.searchParams.get('version') || '').trim();
  const q = (url.searchParams.get('q') || '').trim();

  const where = [];
  const binds = [];

  if (status) {
    where.push('status = ?');
    binds.push(status);
  }
  if (version) {
    where.push('version = ?');
    binds.push(version);
  }
  if (q) {
    where.push('(message LIKE ? OR error_message LIKE ? OR hwid LIKE ?)');
    const likeQ = `%${q}%`;
    binds.push(likeQ, likeQ, likeQ);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
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

async function handleAdminStats(request, env) {
  assertAdmin(request, env);

  const url = new URL(request.url);
  const hours = clampInt(url.searchParams.get('hours'), 1, 24 * 30, 24);

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

async function handleAdminPlatformOverview(request, env) {
  assertAdmin(request, env);
  const url = new URL(request.url);
  const days = clampInt(url.searchParams.get('days'), 1, 365, 30);
  const top = clampInt(url.searchParams.get('top'), 5, 50, 15);
  const data = await loadPlatformOverviewData(env, days, top);
  return json({ code: 200, data }, 200);
}

async function handlePublicPlatformOverview(request, env) {
  const url = new URL(request.url);
  const days = clampInt(url.searchParams.get('days'), 1, 365, 30);
  const top = clampInt(url.searchParams.get('top'), 5, 50, 15);
  const data = await loadPlatformOverviewData(env, days, top);
  return json({ code: 200, data: projectPublicPlatformOverview(data, top) }, 200);
}

async function handlePublicTopicDetails(request, env) {
  return json({
    code: 410,
    message: 'Public topic drill-down is disabled. Use aggregate overview endpoints only.'
  }, 410);
}

async function handleAdminPoliticalEventsIngest(request, env) {
  await ensurePlatformTables(env);

  const authHeader = request.headers.get('Authorization') || '';
  if (!env.ADMIN_TOKEN || authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
    return json({ code: 401, message: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ code: 400, message: 'Bad Request: invalid JSON' }, 400);
  }

  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (events.length === 0) {
    return json({ code: 400, message: 'Bad Request: events array required' }, 400);
  }

  let inserted = 0;
  for (const ev of events) {
    const eventDate = String(ev.event_date || '').slice(0, 10);
    const category = String(ev.category || '').slice(0, 50);
    const title = String(ev.title || '').slice(0, 200);
    const sourceName = String(ev.source_name || '').slice(0, 100);
    if (!eventDate || !category || !title) continue;

    try {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO political_events (event_date, category, title, source_name) VALUES (?, ?, ?, ?)'
      ).bind(eventDate, category, title, sourceName).run();
      inserted++;
    } catch (_) {}
  }

  return json({ code: 200, message: 'ok', inserted });
}

async function handlePublicPoliticalEvents(request, env) {
  await ensurePlatformTables(env);

  const params = new URL(request.url).searchParams;
  const days = Math.min(90, Math.max(1, parseInt(params.get('days') || '30', 10)));
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '60', 10)));
  const rows = await env.DB.prepare(
    `SELECT event_date, category, title, source_name FROM political_events
     WHERE date(event_date) >= date("now", ?)
     ORDER BY event_date DESC, id DESC LIMIT ?`
  ).bind(`-${days} days`, limit).all();

  return json({ code: 200, days, events: rows.results || [] });
}

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

  const since = `-${days} days`;

  const overviewRow = await env.DB.prepare(
    `SELECT
      COUNT(*) AS upload_count,
      COALESCE(SUM(block_event_count), 0) AS block_event_count,
      COALESCE(SUM(report_event_count), 0) AS report_event_count,
      COALESCE(SUM(total_event_count), 0) AS total_event_count,
      COALESCE(SUM(source_post_count), 0) AS source_post_count,
      COALESCE(SUM(topic_seed_count), 0) AS topic_seed_count,
      ROUND(AVG(source_coverage_pct), 1) AS avg_source_coverage_pct,
      ROUND(AVG(report_source_coverage_pct), 1) AS avg_report_source_coverage_pct,
     ROUND(AVG(source_concentration_pct), 1) AS avg_source_concentration_pct,
     ROUND(AVG(repeated_narrative_pct), 1) AS avg_repeated_narrative_pct,
     ROUND(AVG(short_term_diffusion_pct), 1) AS avg_short_term_diffusion_pct
     FROM platform_uploads
     WHERE datetime(created_at) >= datetime('now', ?)
       AND COALESCE(trust_tier, ?) = ?`
  ).bind(since, LEGACY_TRUST_TIER, PUBLIC_SAMPLE_SCOPE).first();

  const recentUploadsRows = await env.DB.prepare(
    `SELECT
     id, created_at, source_app, exporter_version,
     block_event_count, report_event_count, total_event_count, source_post_count, topic_seed_count
     FROM platform_uploads
     WHERE datetime(created_at) >= datetime('now', ?)
       AND COALESCE(trust_tier, ?) = ?
     ORDER BY id DESC
     LIMIT 30`
  ).bind(since, LEGACY_TRUST_TIER, PUBLIC_SAMPLE_SCOPE).all();

  const dailyRows = await env.DB.prepare(
    `SELECT
      day_key,
      SUM(block_event_count) AS block_event_count,
      SUM(report_event_count) AS report_event_count,
      SUM(total_event_count) AS total_event_count,
      SUM(source_count) AS source_count
     FROM platform_daily_metrics
     WHERE upload_id IN (
       SELECT id FROM platform_uploads
       WHERE datetime(created_at) >= datetime('now', ?)
         AND COALESCE(trust_tier, ?) = ?
     )
     GROUP BY day_key
     ORDER BY day_key DESC
     LIMIT 60`
  ).bind(since, LEGACY_TRUST_TIER, PUBLIC_SAMPLE_SCOPE).all();

  const topicTimeSeriesRows = await env.DB.prepare(
    `SELECT
      day_key,
      topic_label,
      SUM(event_count) as event_count
     FROM platform_topic_daily_v2
     WHERE day_key >= date('now', ?)
       AND taxonomy_version = ?
       AND sample_scope = ?
     GROUP BY day_key, topic_label
     ORDER BY day_key ASC, event_count DESC`
  ).bind(since, CURRENT_TAXONOMY_VERSION, PUBLIC_SAMPLE_SCOPE).all();

  const topicRows = await env.DB.prepare(
    `SELECT
      topic_label,
      SUM(event_count) AS event_count,
      SUM(account_count) AS account_count,
      SUM(source_count) AS source_count
     FROM platform_topic_metrics
     WHERE upload_id IN (
       SELECT id FROM platform_uploads
       WHERE datetime(created_at) >= datetime('now', ?)
         AND COALESCE(trust_tier, ?) = ?
     )
     GROUP BY topic_label
     ORDER BY event_count DESC
     LIMIT ?`
  ).bind(since, LEGACY_TRUST_TIER, PUBLIC_SAMPLE_SCOPE, top).all();

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
     WHERE upload_id IN (
       SELECT id FROM platform_uploads
       WHERE datetime(created_at) >= datetime("now", ?)
         AND COALESCE(trust_tier, ?) = ?
     )
     GROUP BY category_label
     ORDER BY event_count DESC
     LIMIT 10`
  ).bind(since, LEGACY_TRUST_TIER, PUBLIC_SAMPLE_SCOPE).all();

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
     WHERE upload_id IN (
       SELECT id FROM platform_uploads
       WHERE datetime(created_at) >= datetime('now', ?)
         AND COALESCE(trust_tier, ?) = ?
     )
     GROUP BY source_url
     ORDER BY total_event_count DESC
     LIMIT ?`
  ).bind(since, LEGACY_TRUST_TIER, PUBLIC_SAMPLE_SCOPE, top).all();

  return {
    days,
    overview: {
      uploadCount: Number(overviewRow?.upload_count || 0),
      blockEventCount: Number(overviewRow?.block_event_count || 0),
      reportEventCount: Number(overviewRow?.report_event_count || 0),
      totalEventCount: Number(overviewRow?.total_event_count || 0),
      sourcePostCount: Number(overviewRow?.source_post_count || 0),
      topicSeedCount: Number(overviewRow?.topic_seed_count || 0),
      sourceCoveragePct: Number(overviewRow?.avg_source_coverage_pct || 0),
      reportSourceCoveragePct: Number(overviewRow?.avg_report_source_coverage_pct || 0),
      avgSourceConcentrationPct: Number(overviewRow?.avg_source_concentration_pct || 0),
      avgRepeatedNarrativePct: Number(overviewRow?.avg_repeated_narrative_pct || 0),
      avgShortTermDiffusionPct: Number(overviewRow?.avg_short_term_diffusion_pct || 0)
    },
    taxonomyVersion: CURRENT_TAXONOMY_VERSION,
    sampleScope: PUBLIC_SAMPLE_SCOPE,
    dailyTrend,
    topicTimeSeries,
    reportCategories: categoryRows.results || [],
    topTopics: topicRows.results || [],
    topNarratives: narrativeRows.results || [],
    recentUploads: recentUploadsRows.results || []
  };
}

function projectPublicPlatformOverview(raw, top = 15) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const overview = data.overview && typeof data.overview === 'object' ? data.overview : {};
  const dailyTrend = Array.isArray(data.dailyTrend) ? data.dailyTrend : [];
  const topicTimeSeries = Array.isArray(data.topicTimeSeries) ? data.topicTimeSeries : [];
  const reportCategories = Array.isArray(data.reportCategories) ? data.reportCategories : [];
  const sourceRows = Array.isArray(data.topNarratives) ? data.topNarratives : [];
  const recentUploads = Array.isArray(data.recentUploads) ? data.recentUploads : [];

  const categories = buildPublicCategories(reportCategories, overview.totalEventCount);
  const narratives = buildPublicNarratives(sourceRows, top);
  const highSignalRows = sourceRows.filter((row) => safeCount(row.avg_signal_score) >= PUBLIC_HIGH_SIGNAL_THRESHOLD);
  const coordinatedAccountEstimate = highSignalRows.reduce((sum, row) => sum + safeCount(row.unique_account_count), 0);
  const coordinatedSourceCount = highSignalRows.length;

  const dateRange = {
    start: dailyTrend[0]?.day_key || '',
    end: dailyTrend[dailyTrend.length - 1]?.day_key || '',
    activeDays: dailyTrend.filter((row) => safeCount(row.total_event_count) > 0).length
  };

  return {
    schema: 'threadsblocker.platform_public.v1',
    generatedAt: new Date().toISOString(),
    days: safeCount(data.days || 30),
    taxonomyVersion: safeString(data.taxonomyVersion || CURRENT_TAXONOMY_VERSION, 40),
    sampleScope: safeString(data.sampleScope || PUBLIC_SAMPLE_SCOPE, 20),
    overview: {
      uploadCount: safeCount(overview.uploadCount),
      blockEventCount: safeCount(overview.blockEventCount),
      reportEventCount: safeCount(overview.reportEventCount),
      totalEventCount: safeCount(overview.totalEventCount),
      sourcePostCount: safeCount(overview.sourcePostCount),
      topicSeedCount: safeCount(overview.topicSeedCount),
      sourceCoveragePct: safePercent(overview.sourceCoveragePct),
      reportSourceCoveragePct: safePercent(overview.reportSourceCoveragePct)
    },
    dateRange,
    credibility: {
      effectiveUploadCount: safeCount(overview.uploadCount),
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
    topNarratives: narratives,
    recentUploads: recentUploads.slice(0, 10).map((row) => ({
      id: safeCount(row.id),
      created_at: safeString(row.created_at, 40)
    })),
    methodology: {
      trustPolicy: 'public-trusted-only',
      scoreBands: {
        low: '0-44',
        medium: '45-64',
        high: '65+'
      },
      principles: [
        '公開頁只呈現匿名樣本中的統計模式與中性訊號。',
        '高風險分級是統計標籤，不是對個人、貼文、動機或違法性的認定。',
        '資料來自使用者自願上傳，並非平台全量資料。',
        '公開頁預設只納入 trusted sample；相關不等於因果。'
      ]
    }
  };
}

function buildPublicCategories(rows, totalEventCount) {
  const list = Array.isArray(rows) ? rows : [];
  const total = safeCount(totalEventCount);
  const filtered = list
    .map((row) => ({
      label: safeString(row.category_label || row.topic_label, 120),
      eventCount: safeCount(row.event_count),
      accountCount: safeCount(row.account_count),
      sourceCount: safeCount(row.source_count)
    }))
    .filter((row) => row.label && row.eventCount > 0)
    .sort((a, b) => b.eventCount - a.eventCount);

  return filtered
    .map((row) => ({
      ...row,
      sharePct: total > 0 ? round1((row.eventCount / total) * 100) : 0
    }))
    .filter((row) => row.sharePct >= 1);
}

function buildPublicNarratives(rows, top) {
  const groups = new Map();

  for (const item of Array.isArray(rows) ? rows : []) {
    const row = item && typeof item === 'object' ? item : {};
    const signalScore = safeCount(row.avg_signal_score);
    const eventCount = safeCount(row.total_event_count);
    const accountCount = safeCount(row.unique_account_count);
    const hints = normalizeTopicHints(row.top_topic_hints_json);
    const narrative = summarizeNarrativePattern(row.source_text_sample || '', hints);
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
        hintCounts: new Map()
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

  const sorted = Array.from(groups.values())
    .filter((group) => group.sourceCount >= PUBLIC_MIN_NARRATIVE_SOURCES && group.eventCount >= PUBLIC_MIN_NARRATIVE_EVENTS)
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, Math.max(1, top))
    .map((group) => ({
      title: group.title,
      summary: group.summary,
      whyNote: buildNarrativeWhyNote(group),
      eventCount: group.eventCount,
      sourceCount: group.sourceCount,
      accountCount: group.accountCount,
      signalBand: scoreToBand(group.maxSignalScore),
      hintLabels: Array.from(group.hintCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label]) => label)
    }));

  return sorted;
}

function buildNarrativeWhyNote(group) {
  const hints = Array.from(group?.hintCounts?.entries?.() || [])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label]) => safeString(label, 60))
    .filter(Boolean);
  const hintText = hints.length ? hints.join('、') : '相近措辭';
  const signalBand = scoreToBand(group?.maxSignalScore);
  const signalText = signalBand === 'high' ? '高信號' : signalBand === 'medium' ? '中信號' : '低信號';
  const thresholdText = `至少 ${PUBLIC_MIN_NARRATIVE_SOURCES} 個來源與 ${PUBLIC_MIN_NARRATIVE_EVENTS} 次事件`;
  return `這組樣本目前累積 ${safeCount(group?.eventCount)} 次事件，分布在 ${safeCount(group?.sourceCount)} 個來源與約 ${safeCount(group?.accountCount)} 個帳號樣本；主題提示集中在 ${hintText}。它之所以會出現在公開頁，是因為同時達到 ${thresholdText} 與 ${signalText} 敘事門檻，代表這不是單一偶發留言，而是值得持續觀察的重複模式。`;
}

function normalizeTopicHints(rawJson) {
  const raw = safeParseJSON(rawJson || '[]');
  return (Array.isArray(raw) ? raw : [])
    .map((item) => sanitizeHintLabel(asObject(item).topicHint || ''))
    .filter(Boolean)
    .slice(0, 6);
}

function sanitizeHintLabel(raw) {
  const text = safeString(raw, 120);
  if (!text) return '';
  if (text.startsWith('report_leaf:')) return safeString(text.slice('report_leaf:'.length), 100);
  if (text.startsWith('report:')) return safeString(text.slice('report:'.length), 100);
  if (text.startsWith('hashtag:')) return safeString(text.slice('hashtag:'.length), 100);
  return text;
}

function summarizeNarrativePattern(text, hints = []) {
  const raw = compactWhitespace(String(text || ''));
  const hashtags = extractHashtags(raw);
  const clauses = raw
    .replace(/https?:\/\/\S+/g, '')
    .split(/[。！？!?，,、；;:：\n]+/)
    .map((part) => compactWhitespace(part))
    .filter(Boolean);
  const styleTags = [];
  if (clauses.length >= 3) styleTags.push('多句短句');
  if (/[!！]/.test(raw)) styleTags.push('感嘆語氣');
  if (/[?？]/.test(raw)) styleTags.push('提問式語氣');
  if (!styleTags.length) styleTags.push('相近措辭');

  const anchors = [...hints, ...hashtags].filter(Boolean).slice(0, 2);
  const anchorText = anchors.length ? anchors.join('、') : '單一議題框架';
  const title = anchors.length
    ? `以 ${anchorText} 為核心的重複敘事`
    : '高相似文字敘事';
  const summary = `近期樣本中，多個來源反覆使用 ${anchorText} 的相近表述，常見形式為 ${styleTags.join('、')}。`;
  const key = [anchors.map((item) => item.toLowerCase()).join('|') || 'generic', styleTags.join('|')].join('::');

  return { key, title, summary };
}

function extractHashtags(text) {
  const matches = String(text || '').match(/#[^\s#.,，。!?！？:：;；、]+/g) || [];
  return matches.map((tag) => safeString(tag, 40).toLowerCase()).slice(0, 3);
}

function compactWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function scoreToBand(score) {
  const n = safeCount(score);
  if (n >= PUBLIC_HIGH_SIGNAL_THRESHOLD) return 'high';
  if (n >= PUBLIC_MEDIUM_SIGNAL_THRESHOLD) return 'medium';
  return 'low';
}

function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

async function loadTopicDetailsData(env, topic, days, limit) {
  await ensurePlatformTables(env);

  const since = `-${days} days`;
  const rows = await env.DB.prepare(
    `SELECT
      source_url,
      source_owner,
      source_text_sample,
      total_event_count,
      block_event_count,
      report_event_count,
      unique_account_count,
      manipulation_signal_score,
      manipulation_risk_level,
      top_topic_hints_json
     FROM platform_source_metrics
     WHERE upload_id IN (
       SELECT id FROM platform_uploads
       WHERE datetime(created_at) >= datetime('now', ?)
     )
     ORDER BY total_event_count DESC
     LIMIT 800`
  ).bind(since).all();

  const topicLC = topic.toLowerCase();
  const candidates = (rows.results || []).map((row) => {
    const hints = safeParseJSON(row.top_topic_hints_json || '[]');
    const hintList = Array.isArray(hints) ? hints
      .map((h) => safeString((h && h.topicHint) || '', 120))
      .filter(Boolean) : [];
    const matchedHints = hintList.filter((h) => {
      const hc = h.toLowerCase();
      return hc.includes(topicLC) || topicLC.includes(hc);
    });
    const text = safeString(row.source_text_sample || '', 500);
    const textMatched = text.toLowerCase().includes(topicLC);
    const score = safeCount(row.manipulation_signal_score);
    const impact = safeCount(row.total_event_count);
    const uniqueAccounts = safeCount(row.unique_account_count);
    const repeatFactor = uniqueAccounts > 0 ? Math.round((impact / uniqueAccounts) * 20) : 0;
    const clusteringScore = Math.max(0, Math.min(100, repeatFactor));
    const spreadSpeedScore = Math.max(0, Math.min(100, Math.round(impact / 4)));
    const templateScore = Math.max(0, Math.min(100, matchedHints.length * 25 + (textMatched ? 25 : 10)));
    const signalScore = Math.max(0, Math.min(100, score));
    const overallScore = Math.round((signalScore * 0.4) + (templateScore * 0.25) + (clusteringScore * 0.2) + (spreadSpeedScore * 0.15));
    const confidenceScore = (matchedHints.length * 25) + (textMatched ? 15 : 0) + Math.min(40, Math.round(score / 3)) + Math.min(20, Math.round(impact / 30));

    const reasonParts = [];
    if (matchedHints.length > 0) reasonParts.push(`命中主題提示：${matchedHints.slice(0, 3).join(' / ')}`);
    if (textMatched) reasonParts.push('貼文文字直接命中主題關鍵詞');
    reasonParts.push(`影響規模：事件 ${safeCount(row.total_event_count)}、帳號 ${safeCount(row.unique_account_count)}`);
    reasonParts.push(`操作訊號：${score} 分（${safeString(row.manipulation_risk_level || 'unknown', 20)}）`);
    reasonParts.push(`口語解讀：像同一批人在推 ${clusteringScore}/100、像模板洗版 ${templateScore}/100、擴散速度 ${spreadSpeedScore}/100`);

    return {
      sourceUrl: safeString(row.source_url || '', 300),
      sourceOwner: safeString(row.source_owner || '', 80),
      title: text ? text.slice(0, 48) : '未命名來源文章',
      reason: reasonParts.join('；'),
      blockEventCount: safeCount(row.block_event_count),
      reportEventCount: safeCount(row.report_event_count),
      totalEventCount: impact,
      matchedHints,
      explain: {
        overallScore,
        signalScore,
        templateScore,
        clusteringScore,
        spreadSpeedScore,
        labels: {
          overall: '綜合可疑程度',
          signal: '像不像操作帳號',
          template: '像不像模板洗版',
          clustering: '像不像同一批人在推',
          spreadSpeed: '擴散速度有多快'
        }
      },
      confidenceScore
    };
  }).filter((item) => item.sourceUrl);

  candidates.sort((a, b) => b.confidenceScore - a.confidenceScore || b.totalEventCount - a.totalEventCount);

  const used = new Set();
  const picked = [];
  for (const item of candidates) {
    if (picked.length >= limit) break;
    if (used.has(item.sourceUrl)) continue;
    if (item.confidenceScore < 10) continue;
    used.add(item.sourceUrl);
    picked.push(item);
  }

  if (picked.length < limit) {
    for (const item of candidates) {
      if (picked.length >= limit) break;
      if (used.has(item.sourceUrl)) continue;
      used.add(item.sourceUrl);
      picked.push({
        ...item,
        reason: `${item.reason}；（關聯度較低，為補齊至少 ${limit} 篇）`
      });
    }
  }

  while (picked.length < limit) {
    const idx = picked.length + 1;
    picked.push({
      sourceUrl: '',
      sourceOwner: '',
      title: `樣本不足補位 #${idx}`,
      reason: `目前資料量不足，先保留占位。請持續上傳後會自動替換成真實文章。`,
      blockEventCount: 0,
      reportEventCount: 0,
      totalEventCount: 0,
      matchedHints: [],
      confidenceScore: 0
    });
  }

  return {
    topic,
    days,
    limit,
    totalCandidates: candidates.length,
    items: picked.slice(0, limit)
  };
}

let platformSchemaReady = false;
async function ensurePlatformTables(env) {
  if (platformSchemaReady) return;
  for (const sql of PLATFORM_SCHEMA_STMTS) {
    await env.DB.prepare(sql).run();
  }
  for (const col of [
    'ALTER TABLE platform_uploads ADD COLUMN source_concentration_pct REAL DEFAULT 0',
    'ALTER TABLE platform_uploads ADD COLUMN repeated_narrative_pct REAL DEFAULT 0',
    'ALTER TABLE platform_uploads ADD COLUMN short_term_diffusion_pct REAL DEFAULT 0',
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
    } catch (_) {}
  }
  platformSchemaReady = true;
}

async function handleAdminUpdateStatus(request, env, pathname) {
  assertAdmin(request, env);

  const id = Number.parseInt(pathname.split('/').pop() || '', 10);
  if (!Number.isFinite(id) || id <= 0) {
    return json({ code: 400, message: 'Invalid id' }, 400);
  }

  const body = await request.json().catch(() => null);
  const status = (body?.status || '').trim();
  const allowed = new Set(['PENDING', 'ACK', 'FIXED', 'IGNORED']);
  if (!allowed.has(status)) {
    return json({ code: 400, message: 'Invalid status' }, 400);
  }

  const updated = await env.DB.prepare('UPDATE bug_reports SET status = ? WHERE id = ?').bind(status, id).run();
  if ((updated.meta?.changes || 0) === 0) {
    return json({ code: 404, message: 'Not found' }, 404);
  }

  return json({ code: 200, message: 'Updated' }, 200);
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function safeString(v, max = 200) {
  return String(v || '').trim().slice(0, max);
}

function safeCount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(Math.min(n, 1_000_000_000));
}

function safePercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toDayKey(rawTs) {
  const ts = normalizeEpochMs(rawTs);
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function normalizeEpochMs(rawTs) {
  const n = Number(rawTs);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e11 ? Math.floor(n * 1000) : Math.floor(n);
}

function boolAsInt(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  return null;
}

async function resolveTrustMeta(env, clientSourceId, clientPlatform, exporterVersion) {
  const sourceId = safeString(clientSourceId, 120);
  if (!sourceId) {
    return { trustTier: LEGACY_TRUST_TIER, riskScoreBand: 'low', sampleScope: PUBLIC_SAMPLE_SCOPE };
  }

  const now = new Date();
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

  let trustTier = 'probation';
  let riskScoreBand = 'low';
  if (recentUploads >= 8) {
    trustTier = 'flagged';
    riskScoreBand = 'high';
  } else if (nextUploads >= 3 && activeDayCount >= 2) {
    trustTier = 'trusted';
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
    sampleScope: trustTier === 'trusted' ? PUBLIC_SAMPLE_SCOPE : 'probation'
  };
}

function buildTopicDailyBuckets(events, sources, sampleScope, taxonomyVersion) {
  const sourceTopicMap = new Map();
  for (const item of asArray(sources)) {
    const source = asObject(item);
    const sourceUrl = safeString(source.sourceUrl, 300);
    if (!sourceUrl) continue;
    const labels = [];
    for (const hintItem of asArray(source.topTopicHints)) {
      const hint = asObject(hintItem);
      const normalized = normalizeTopicLabel(hint.topicHint || hint.topicLabel || '');
      if (normalized && !labels.includes(normalized)) labels.push(normalized);
      if (labels.length >= 3) break;
    }
    if (labels.length > 0) sourceTopicMap.set(sourceUrl, labels);
  }

  const buckets = new Map();
  const uploadSeen = new Set();
  for (const item of asArray(events)) {
    const event = asObject(item);
    const dayKey = toDayKey(event.eventAt);
    if (!dayKey) continue;
    const sourceUrl = safeString(event.sourceUrl, 300);
    const labels = dedupeStrings([
      ...(sourceTopicMap.get(sourceUrl) || []),
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

function normalizeTopicLabel(raw) {
  let value = safeString(raw, 140);
  if (!value) return '';
  value = value
    .replace(/^hashtag:/i, '')
    .replace(/^report_leaf:/i, '')
    .replace(/^report:/i, '')
    .replace(/^#/, '')
    .trim();
  if (!value) return '';
  const blacklist = new Set(['likes', 'quotes', 'reposts', 'manual', 'unknown']);
  return blacklist.has(value.toLowerCase()) ? '' : value;
}

function dedupeStrings(values) {
  const seen = new Set();
  const picked = [];
  for (const value of values) {
    const item = safeString(value, 140);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    picked.push(item);
  }
  return picked;
}

async function storeEvidenceBundle(env, uploadId, bundle) {
  if (!env.EVIDENCE_BUCKET || typeof env.EVIDENCE_BUCKET.put !== 'function') return false;
  const key = `platform-uploads/${String(uploadId).padStart(10, '0')}.json`;
  await env.EVIDENCE_BUCKET.put(key, JSON.stringify(bundle));
  return true;
}

function clampInt(raw, min, max, fallback) {
  const n = Number.parseInt(String(raw || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
