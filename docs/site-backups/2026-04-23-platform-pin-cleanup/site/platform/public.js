(function () {
  const API_BASE = 'https://threadsblocker-bug-admin.skiseiju.workers.dev';
  const DEFAULT_DAYS = 30;
  const MOCK_DAYS = 60;
  const DEFAULT_TOP = 24;
  const QUERY = new URLSearchParams(window.location.search);
  const FORCE_MOCK = QUERY.get('mock') === '1';

  const MOCK_TEMPLATE = {
    schema: 'threadsblocker.platform_public.v1',
    generatedAt: '2026-04-21T00:00:00Z',
    taxonomyVersion: 'topic-taxonomy.v1',
    sampleScope: 'trusted',
    days: 30,
    summary: {
      headline: 'Threads 台灣有 9,000 萬個帳號　你以為跟你對話的是真人嗎？',
      subtitle: '留友封觀測站試著用匿名聚合資料來回答這個問題'
    },
    overview: {
      uploadCount: 286,
      blockEventCount: 94108,
      reportEventCount: 54624,
      totalEventCount: 148732,
      sourcePostCount: 6924,
      topicSeedCount: 438,
      sourceCoveragePct: 72,
      reportSourceCoveragePct: 64
    },
    dateRange: {
      start: '2026-03-23',
      end: '2026-04-21',
      activeDays: 30
    },
    credibility: {
      effectiveUploadCount: 286,
      activeObservationDays: 30,
      sourceCoveragePct: 72,
      reportSourceCoveragePct: 64
    },
    thresholds: {
      categoryMinEvents: 5,
      narrativeMinSources: 2,
      narrativeMinEvents: 20,
      highSignalScore: 65,
      mediumSignalScore: 45
    },
    signals: {
      sourceConcentrationPct: 24.6,
      repeatedNarrativePct: 41.2,
      shortTermDiffusionPct: 37.8,
      coordinatedAccountEstimate: 928,
      coordinatedSourceCount: 17
    },
    dailyTrend: [
      { day_key: '2026-03-23', total_event_count: 42, block_event_count: 27, report_event_count: 15, source_count: 2 },
      { day_key: '2026-03-24', total_event_count: 38, block_event_count: 25, report_event_count: 13, source_count: 2 },
      { day_key: '2026-03-25', total_event_count: 97, block_event_count: 61, report_event_count: 36, source_count: 5 },
      { day_key: '2026-03-26', total_event_count: 44, block_event_count: 29, report_event_count: 15, source_count: 2 },
      { day_key: '2026-03-27', total_event_count: 47, block_event_count: 31, report_event_count: 16, source_count: 2 },
      { day_key: '2026-03-28', total_event_count: 114, block_event_count: 72, report_event_count: 42, source_count: 6 },
      { day_key: '2026-03-29', total_event_count: 36, block_event_count: 23, report_event_count: 13, source_count: 2 },
      { day_key: '2026-03-30', total_event_count: 55, block_event_count: 36, report_event_count: 19, source_count: 3 },
      { day_key: '2026-03-31', total_event_count: 218, block_event_count: 142, report_event_count: 76, source_count: 11 },
      { day_key: '2026-04-01', total_event_count: 167, block_event_count: 109, report_event_count: 58, source_count: 8 },
      { day_key: '2026-04-02', total_event_count: 89, block_event_count: 58, report_event_count: 31, source_count: 4 },
      { day_key: '2026-04-03', total_event_count: 89, block_event_count: 56, report_event_count: 33, source_count: 4 },
      { day_key: '2026-04-04', total_event_count: 48, block_event_count: 31, report_event_count: 17, source_count: 2 },
      { day_key: '2026-04-05', total_event_count: 46, block_event_count: 30, report_event_count: 16, source_count: 2 },
      { day_key: '2026-04-06', total_event_count: 213, block_event_count: 138, report_event_count: 75, source_count: 11 },
      { day_key: '2026-04-07', total_event_count: 149, block_event_count: 97, report_event_count: 52, source_count: 7 },
      { day_key: '2026-04-08', total_event_count: 71, block_event_count: 46, report_event_count: 25, source_count: 3 },
      { day_key: '2026-04-09', total_event_count: 106, block_event_count: 67, report_event_count: 39, source_count: 5 },
      { day_key: '2026-04-10', total_event_count: 54, block_event_count: 35, report_event_count: 19, source_count: 3 },
      { day_key: '2026-04-11', total_event_count: 43, block_event_count: 28, report_event_count: 15, source_count: 2 },
      { day_key: '2026-04-12', total_event_count: 49, block_event_count: 32, report_event_count: 17, source_count: 2 },
      { day_key: '2026-04-13', total_event_count: 93, block_event_count: 59, report_event_count: 34, source_count: 5 },
      { day_key: '2026-04-14', total_event_count: 58, block_event_count: 38, report_event_count: 20, source_count: 3 },
      { day_key: '2026-04-15', total_event_count: 247, block_event_count: 161, report_event_count: 86, source_count: 12 },
      { day_key: '2026-04-16', total_event_count: 289, block_event_count: 188, report_event_count: 101, source_count: 14 },
      { day_key: '2026-04-17', total_event_count: 157, block_event_count: 102, report_event_count: 55, source_count: 8 },
      { day_key: '2026-04-18', total_event_count: 73, block_event_count: 47, report_event_count: 26, source_count: 4 },
      { day_key: '2026-04-19', total_event_count: 88, block_event_count: 55, report_event_count: 33, source_count: 4 },
      { day_key: '2026-04-20', total_event_count: 47, block_event_count: 31, report_event_count: 16, source_count: 2 },
      { day_key: '2026-04-21', total_event_count: 52, block_event_count: 34, report_event_count: 18, source_count: 3 }
    ],
    reportCategories: [
      { label: '垃圾訊息', eventCount: 1820, accountCount: 923, sourceCount: 112, sharePct: 23.8 },
      { label: '霸凌或騷擾', eventCount: 1244, accountCount: 602, sourceCount: 88, sharePct: 16.3 },
      { label: '不實資訊', eventCount: 1012, accountCount: 511, sourceCount: 72, sharePct: 13.2 },
      { label: '暴力、仇恨或剝削', eventCount: 883, accountCount: 418, sourceCount: 60, sharePct: 11.5 },
      { label: '裸露或性行為', eventCount: 642, accountCount: 301, sourceCount: 44, sharePct: 8.4 },
      { label: '生理或心理威脅', eventCount: 498, accountCount: 236, sourceCount: 36, sharePct: 6.5 }
    ],
topNarratives: [
      {
        title: '圍繞罷免案投票資格爭議的同質性回覆',
        summary: '多個來源反覆轉發對罷免案投票門檻的質疑框架，使用相近句型與問句結構，集中出現在罷免案相關貼文下方。',
        whyNote: '罷免投票日前後，特定貼文下方出現大量使用相似問句的留言，質疑投票門檻的合法性。這些帳號的建立時間集中、互動模式雷同，且在短時間內從不同帳號發出結構相近的內容，符合協調傳播的觀察特徵。',
        eventCount: 2341,
        sourceCount: 8,
        accountCount: 714,
        signalBand: 'high',
        hintLabels: ['罷免', '投票資格']
      },
      {
        title: '批評特定媒體報導立場的重複框架',
        summary: '樣本中多次出現針對特定媒體報導的格式化批評，常見句型為「OO媒體又在...」，由不同帳號在短時間內集中貼出。',
        whyNote: '少數幾篇批評特定媒體的貼文在數小時內被大量帳號複製轉發，句型幾乎相同。這類模式常見於有人刻意放大特定敘事框架的情況——原始來源很少，但擴散速度和帳號數量不成比例。',
        eventCount: 1876,
        sourceCount: 6,
        accountCount: 531,
        signalBand: 'high',
        hintLabels: ['媒體批評', '假新聞']
      },
      {
        title: '利用兩岸議題製造對立情緒的樣本群',
        summary: '涉及兩岸關係的同質性貼文，使用煽動性標籤與固定句式，事件量在政治節點前後出現明顯峰值。',
        whyNote: '這批樣本使用的標籤與句式，與其他平台已記錄的跨平台協調模板高度吻合。事件量在政治敏感節點前後明顯上升，但帳號本身沒有其他互動紀錄，屬於典型的「單一目的帳號」特徵。',
        eventCount: 1423,
        sourceCount: 5,
        accountCount: 389,
        signalBand: 'medium',
        hintLabels: ['兩岸', '國際關係']
      },
      {
        title: '質疑政府政策執行效率的協調轉貼',
        summary: '多個來源反覆轉貼對政府特定政策的負面評價，句型高度相似，源自少數幾篇高流量貼文。',
        whyNote: '源頭只有兩三篇貼文，但被數百個帳號在短時間內轉發，且評論句型高度一致。這種「少來源、多傳播」的結構，是協調放大敘事的常見模式，而非自然的輿論擴散。',
        eventCount: 1187,
        sourceCount: 4,
        accountCount: 302,
        signalBand: 'medium',
        hintLabels: ['政府政策', '行政效率']
      },
      {
        title: '對立法院委員會表決爭議的放大敘事',
        summary: '圍繞立法院特定表決結果的重複評論群，帳號間協調特徵明顯，集中在事件發生後72小時內擴散。',
        whyNote: '表決結果公布後 72 小時內，相關貼文下方湧現大量結構相似的評論。這些帳號彼此間沒有互動歷史，但內容幾乎同步出現，符合「統一時間點啟動」的協調操作特徵。',
        eventCount: 934,
        sourceCount: 3,
        accountCount: 248,
        signalBand: 'medium',
        hintLabels: ['立法院', '表決爭議']
      }
    ],
    recentUploads: [
      { id: 518, created_at: '2026-04-19T17:04:00Z' },
      { id: 517, created_at: '2026-04-19T16:31:00Z' }
    ],
    methodology: {
      trustPolicy: 'public-trusted-only',
      scoreBands: { low: '0-44', medium: '45-64', high: '65+' },
      principles: [
        '公開頁只呈現匿名樣本中的統計模式與中性訊號。',
        '高風險分級是統計標籤，不是對個人、貼文、動機或違法性的認定。',
        '資料來自使用者自願上傳，並非平台全量資料。'
      ]
    }
  };

  function safeNum(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function formatNumber(value) {
    return safeNum(value).toLocaleString('zh-TW');
  }

  function formatPercent(value, digits = 1, signed = false) {
    const num = Number(value);
    if (!Number.isFinite(num)) return signed ? '+0.0%' : '0.0%';
    const abs = `${Math.abs(num).toFixed(digits)}%`;
    if (!signed) return abs;
    return `${num >= 0 ? '+' : '-'}${abs}`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function parseDateKey(dayKey) {
    return new Date(`${dayKey}T00:00:00+08:00`);
  }

  function formatDateLabel(dayKey) {
    if (!dayKey) return '--';
    return dayKey.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3');
  }

  function formatMonthLabel(dayKey) {
    if (!dayKey) return '--';
    return dayKey.slice(0, 7);
  }

  function bandLabel(band) {
    if (band === 'high') return '高信號';
    if (band === 'medium') return '中信號';
    return '低信號';
  }

  function cloneMockData() {
    return JSON.parse(JSON.stringify(MOCK_TEMPLATE));
  }

  function toDateKey(date) {
    const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function shiftDayKey(dayKey, offset) {
    const date = parseDateKey(dayKey);
    if (Number.isNaN(date.getTime())) return dayKey;
    date.setDate(date.getDate() + offset);
    return toDateKey(date);
  }

  function shortLabelFromTitle(title, fallback = '事件') {
    const text = String(title || '')
      .replace(/[「」『』《》〈〉（）()【】\[\]，、。：；！？·\s]/g, '')
      .trim();
    return (text || fallback).slice(0, 6);
  }

  function normalizePoliticalEvent(row) {
    const date = String(row?.date || row?.event_date || '').slice(0, 10);
    const title = String(row?.title || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return null;

    const sourceName = String(row?.sourceName || row?.source_name || '').trim();
    const note = String(row?.note || '').trim()
      || (sourceName ? `${sourceName}／外部公共事件節點` : '外部公共事件節點，僅作時序參考。');

    return {
      date,
      title,
      shortLabel: String(row?.shortLabel || row?.short_label || '').trim() || shortLabelFromTitle(title, date.slice(5)),
      category: String(row?.category || '').trim() || '政黨動態',
      note,
      sourceName,
      sourceUrl: String(row?.sourceUrl || row?.source_url || '').trim()
    };
  }

  function dedupePoliticalEvents(events) {
    const seen = new Map();
    (Array.isArray(events) ? events : []).forEach((row) => {
      const event = normalizePoliticalEvent(row);
      if (!event) return;
      const key = `${event.date}|${event.title}`;
      if (!seen.has(key)) seen.set(key, event);
    });
    return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  async function loadStaticPoliticalEvents() {
    try {
      const response = await fetch('/platform/data/political-events.json');
      if (!response.ok) return [];
      const body = await response.json().catch(() => ({}));
      return dedupePoliticalEvents(Array.isArray(body?.events) ? body.events : []);
    } catch (error) {
      return [];
    }
  }

  function buildMockDailyTrend(events, days = MOCK_DAYS) {
    const normalizedEvents = dedupePoliticalEvents(events);
    const endDay = normalizedEvents.length
      ? normalizedEvents[normalizedEvents.length - 1].date
      : toDateKey(new Date());
    const dayKeys = Array.from({ length: days }, (_, index) => shiftDayKey(endDay, -(days - 1 - index)));
    const eventCountByDay = normalizedEvents.reduce((map, event) => {
      map[event.date] = (map[event.date] || 0) + 1;
      return map;
    }, {});

    return dayKeys.map((dayKey, index) => {
      const sameDay = safeNum(eventCountByDay[dayKey]);
      const prevDay = safeNum(eventCountByDay[shiftDayKey(dayKey, -1)]);
      const nextDay = safeNum(eventCountByDay[shiftDayKey(dayKey, 1)]);
      const farPrev = safeNum(eventCountByDay[shiftDayKey(dayKey, -2)]);
      const farNext = safeNum(eventCountByDay[shiftDayKey(dayKey, 2)]);
      const intensity = sameDay + prevDay * 0.62 + nextDay * 0.48 + farPrev * 0.25 + farNext * 0.18;

      const baseTotal = 22 + (index % 7) * 3 + (index % 5) * 2;
      const total = baseTotal + Math.round(intensity * 52);
      const blockRatio = Math.min(0.74, 0.6 + Math.min(intensity, 2.5) * 0.035 + (index % 4) * 0.01);
      const block = Math.round(total * blockRatio);
      const report = Math.max(0, total - block);
      const sourceCount = Math.max(2, Math.round(total / 18) + sameDay * 2 + (prevDay ? 1 : 0));

      return {
        day_key: dayKey,
        total_event_count: total,
        block_event_count: block,
        report_event_count: report,
        source_count: sourceCount,
        is_spike: sameDay > 0 || total >= 95
      };
    });
  }

  function buildMockTopicTimeSeries(events) {
    const grouped = new Map();
    dedupePoliticalEvents(events).forEach((event) => {
      if (!grouped.has(event.date)) grouped.set(event.date, new Map());
      const dateGroup = grouped.get(event.date);
      const label = event.category || '政黨動態';
      dateGroup.set(label, (dateGroup.get(label) || 0) + 1);
    });

    return Array.from(grouped.entries()).map(([date, topics]) => ({
      date,
      topics: Array.from(topics.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label, count]) => ({ label, count }))
    }));
  }

  function buildMockReportCategories(totalReportEvents) {
    const templates = [
      ['垃圾訊息', 26],
      ['霸凌或騷擾', 18],
      ['不實資訊', 17],
      ['暴力、仇恨或剝削', 14],
      ['裸露或性行為', 13],
      ['生理或心理威脅', 12]
    ];
    let assigned = 0;
    return templates.map(([label, pct], index) => {
      const eventCount = index === templates.length - 1
        ? Math.max(0, totalReportEvents - assigned)
        : Math.round(totalReportEvents * (pct / 100));
      assigned += eventCount;
      return {
        label,
        eventCount,
        accountCount: Math.max(1, Math.round(eventCount * (0.48 + index * 0.03))),
        sourceCount: Math.max(1, Math.round(eventCount / (18 + index * 2))),
        sharePct: totalReportEvents > 0 ? Number(((eventCount / totalReportEvents) * 100).toFixed(1)) : 0
      };
    });
  }

  function buildMockNarratives(templateNarratives, totalEventCount) {
    const templates = Array.isArray(templateNarratives) ? templateNarratives : [];
    const baseline = templates.reduce((sum, item) => sum + safeNum(item.eventCount), 0) || 1;
    const target = Math.max(360, Math.round(totalEventCount * 0.34));
    const scale = target / baseline;
    return templates.map((item, index) => ({
      ...item,
      eventCount: Math.max(72, Math.round(safeNum(item.eventCount) * scale)),
      accountCount: Math.max(24, Math.round(safeNum(item.accountCount) * scale * 0.92)),
      sourceCount: Math.max(3, safeNum(item.sourceCount) + Math.floor(index / 2))
    }));
  }

  async function buildMockData() {
    const base = cloneMockData();
    const events = await loadStaticPoliticalEvents();
    const dailyTrend = buildMockDailyTrend(events, MOCK_DAYS);
    const topicTimeSeries = buildMockTopicTimeSeries(events);
    const start = dailyTrend[0]?.day_key || '';
    const end = dailyTrend[dailyTrend.length - 1]?.day_key || '';
    const totals = dailyTrend.reduce((acc, row) => {
      acc.total += safeNum(row.total_event_count);
      acc.block += safeNum(row.block_event_count);
      acc.report += safeNum(row.report_event_count);
      acc.sources += safeNum(row.source_count);
      return acc;
    }, { total: 0, block: 0, report: 0, sources: 0 });
    const last7 = dailyTrend.slice(-7).reduce((sum, row) => sum + safeNum(row.total_event_count), 0);
    const previous7 = dailyTrend.slice(-14, -7).reduce((sum, row) => sum + safeNum(row.total_event_count), 0);
    const uploadCount = Math.max(96, Math.round(totals.total / 20));
    const sourceCoveragePct = Math.min(88, 66 + events.length);
    const reportSourceCoveragePct = Math.max(42, sourceCoveragePct - 9);

    return normalizeOverviewData({
      ...base,
      generatedAt: new Date().toISOString(),
      days: MOCK_DAYS,
      summary: {
        headline: base.summary?.headline || '',
        subtitle: '政治事件為近 60 天真實公開事件；平台統計為依事件節點生成的示意資料。'
      },
      overview: {
        uploadCount,
        blockEventCount: totals.block,
        reportEventCount: totals.report,
        totalEventCount: totals.total,
        sourcePostCount: Math.max(events.length * 18, Math.round(totals.total * 0.1)),
        topicSeedCount: Math.max(events.length * 2, 24),
        sourceCoveragePct,
        reportSourceCoveragePct
      },
      dateRange: {
        start,
        end,
        activeDays: dailyTrend.length
      },
      credibility: {
        effectiveUploadCount: uploadCount,
        activeObservationDays: dailyTrend.length,
        sourceCoveragePct,
        reportSourceCoveragePct
      },
      signals: {
        sourceConcentrationPct: Number(Math.min(34.5, 18 + events.length * 0.45).toFixed(1)),
        repeatedNarrativePct: Number(Math.min(46.8, 25 + events.length * 0.7).toFixed(1)),
        shortTermDiffusionPct: previous7 > 0
          ? Number((((last7 - previous7) / previous7) * 100).toFixed(1))
          : 0,
        coordinatedAccountEstimate: Math.max(120, Math.round(totals.total * 0.27)),
        coordinatedSourceCount: Math.max(8, Math.round(events.length * 0.75))
      },
      dailyTrend,
      topicTimeSeries,
      reportCategories: buildMockReportCategories(totals.report),
      topNarratives: buildMockNarratives(base.topNarratives, totals.total),
      recentUploads: []
    });
  }

  function createEmptyOverview(days = DEFAULT_DAYS) {
    return {
      schema: 'threadsblocker.platform_public.v1',
      generatedAt: new Date().toISOString(),
      taxonomyVersion: 'topic-taxonomy.v1',
      sampleScope: 'trusted',
      days,
      summary: {
        headline: '',
        subtitle: '目前公開資料量仍在累積中。'
      },
      overview: {
        uploadCount: 0,
        blockEventCount: 0,
        reportEventCount: 0,
        totalEventCount: 0,
        sourcePostCount: 0,
        topicSeedCount: 0,
        sourceCoveragePct: 0,
        reportSourceCoveragePct: 0
      },
      dateRange: {
        start: '',
        end: '',
        activeDays: 0
      },
      credibility: {
        effectiveUploadCount: 0,
        activeObservationDays: 0,
        sourceCoveragePct: 0,
        reportSourceCoveragePct: 0
      },
      thresholds: {
        categoryMinEvents: 5,
        narrativeMinSources: 2,
        narrativeMinEvents: 20,
        highSignalScore: 65,
        mediumSignalScore: 45
      },
      signals: {
        sourceConcentrationPct: 0,
        repeatedNarrativePct: 0,
        shortTermDiffusionPct: 0,
        coordinatedAccountEstimate: 0,
        coordinatedSourceCount: 0
      },
      dailyTrend: [],
      topicTimeSeries: [],
      reportCategories: [],
      topNarratives: [],
      recentUploads: [],
      methodology: {
        trustPolicy: 'public-trusted-only',
        scoreBands: { low: '0-44', medium: '45-64', high: '65+' },
        principles: [
          '公開頁只呈現匿名樣本中的統計模式與中性訊號。',
          '高風險分級是統計標籤，不是對個人、貼文、動機或違法性的認定。',
          '資料來自使用者自願上傳，並非平台全量資料。'
        ]
      }
    };
  }

  function normalizeOverviewData(data) {
    const empty = createEmptyOverview(safeNum(data?.days) || DEFAULT_DAYS);
    return {
      ...empty,
      ...data,
      summary: { ...empty.summary, ...(data?.summary || {}) },
      overview: { ...empty.overview, ...(data?.overview || {}) },
      dateRange: { ...empty.dateRange, ...(data?.dateRange || {}) },
      credibility: { ...empty.credibility, ...(data?.credibility || {}) },
      thresholds: { ...empty.thresholds, ...(data?.thresholds || {}) },
      signals: { ...empty.signals, ...(data?.signals || {}) },
      methodology: { ...empty.methodology, ...(data?.methodology || {}) },
      dailyTrend: Array.isArray(data?.dailyTrend) ? data.dailyTrend : [],
      topicTimeSeries: Array.isArray(data?.topicTimeSeries) ? data.topicTimeSeries : [],
      reportCategories: Array.isArray(data?.reportCategories) ? data.reportCategories : [],
      topNarratives: Array.isArray(data?.topNarratives) ? data.topNarratives : [],
      recentUploads: Array.isArray(data?.recentUploads) ? data.recentUploads : []
    };
  }

  function summarizeSourceCoverage(data) {
    const coverage = safeNum(data.overview?.sourceCoveragePct);
    const reportCoverage = safeNum(data.overview?.reportSourceCoveragePct);
    return `封鎖來源覆蓋率 ${formatPercent(coverage, 0)} / 檢舉來源覆蓋率 ${formatPercent(reportCoverage, 0)}`;
  }

  async function api(path, options) {
    const response = await fetch(API_BASE.replace(/\/$/, '') + path, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || `HTTP ${response.status}`);
    return body;
  }

  async function fetchOverview() {
    if (FORCE_MOCK) {
      const data = await buildMockData();
      return {
        data,
        mockMode: true,
        emptyState: false,
        message: '目前顯示 demo mode：政治事件取近 60 天真實公開事件，封鎖與檢舉統計為合成示意資料。'
      };
    }

    try {
      const result = await api(`/api/v1/platform/overview?days=${DEFAULT_DAYS}&top=${DEFAULT_TOP}`);
      const data = normalizeOverviewData(result.data || {});
      if (hasLiveData(data)) {
        return { data, mockMode: false, emptyState: false, message: '' };
      }
      return {
        data,
        mockMode: false,
        emptyState: true,
        message: '目前公開資料量仍在累積中，以下先顯示真實空狀態與方法資訊，不再自動補示意資料。'
      };
    } catch (error) {
      return {
        data: createEmptyOverview(),
        mockMode: false,
        emptyState: true,
        message: '暫時無法讀取平台資料，請稍後再試。'
      };
    }
  }

  function hasLiveData(data) {
    return safeNum(data?.overview?.uploadCount) > 0
      || safeNum(data?.overview?.totalEventCount) > 0
      || (Array.isArray(data?.dailyTrend) && data.dailyTrend.length > 1)
      || (Array.isArray(data?.reportCategories) && data.reportCategories.length > 0)
      || (Array.isArray(data?.topNarratives) && data.topNarratives.length > 0);
  }

  async function loadPoliticalEvents() {
    const staticEvents = await loadStaticPoliticalEvents();
    if (FORCE_MOCK) return staticEvents;

    try {
      const response = await fetch(`${API_BASE}/api/v1/platform/political-events?days=${MOCK_DAYS}&limit=120`);
      if (!response.ok) return staticEvents;
      const body = await response.json().catch(() => ({}));
      const apiEvents = Array.isArray(body?.events) ? body.events : [];
      return dedupePoliticalEvents([...apiEvents, ...staticEvents]);
    } catch (error) {
      return staticEvents;
    }
  }

  function filterEventsForRange(events, dailyTrend) {
    if (!Array.isArray(events) || !dailyTrend.length) return [];
    const start = dailyTrend[0].day_key;
    const end = dailyTrend[dailyTrend.length - 1].day_key;
    return events.filter((event) => {
      const date = String(event.date || '');
      return date >= start && date <= end;
    });
  }

  function computeWindowMetrics(data) {
    const daily = Array.isArray(data.dailyTrend) ? data.dailyTrend : [];
    const last7 = daily.slice(-7);
    const previous7 = daily.slice(-14, -7);
    const last7Total = last7.reduce((sum, row) => sum + safeNum(row.total_event_count), 0);
    const last7Block = last7.reduce((sum, row) => sum + safeNum(row.block_event_count), 0);
    const last7Report = last7.reduce((sum, row) => sum + safeNum(row.report_event_count), 0);
    const previous7Total = previous7.reduce((sum, row) => sum + safeNum(row.total_event_count), 0);
    const activeDays = daily.filter((row) => safeNum(row.total_event_count) > 0).length;
    return {
      last7Total,
      last7Block,
      last7Report,
      previous7Total,
      avgDaily7: last7.length ? Math.round(last7Total / last7.length) : 0,
      activeDays
    };
  }

  function buildSignalBadges(data) {
    const signals = data.signals || {};
    const items = [];

    if (safeNum(signals.sourceConcentrationPct) >= 20) {
      items.push({
        tone: 'warn',
        label: '來源集中',
        detail: `最高單一來源占可回推來源事件 ${formatPercent(signals.sourceConcentrationPct)}`
      });
    }
    if (safeNum(signals.repeatedNarrativePct) >= 25) {
      items.push({
        tone: 'warn',
        label: '敘事重複',
        detail: `重複敘事事件占可回推來源事件 ${formatPercent(signals.repeatedNarrativePct)}`
      });
    }
    if (safeNum(signals.shortTermDiffusionPct) >= 25) {
      items.push({
        tone: 'warn',
        label: '短期升高',
        detail: `最近 7 日事件量較前 7 日增加 ${formatPercent(signals.shortTermDiffusionPct, 1, true)}`
      });
    }
    if (safeNum(signals.coordinatedAccountEstimate) >= 100) {
      items.push({
        tone: 'warn',
        label: '多帳號參與',
        detail: `高信號來源目前牽涉約 ${formatNumber(signals.coordinatedAccountEstimate)} 個帳號樣本`
      });
    }
    if (!items.length) {
      items.push({
        tone: 'steady',
        label: '樣本穩定累積',
        detail: '目前未觸發高強度公開訊號'
      });
    }
    return items;
  }

  function renderTrendChart(container, detailEl, dailyTrend, externalEvents, topicTimeSeries) {
    const daily = Array.isArray(dailyTrend) ? dailyTrend : [];
    const topicMap = {};
    (Array.isArray(topicTimeSeries) ? topicTimeSeries : []).forEach((entry) => {
      if (entry && entry.date) topicMap[entry.date] = Array.isArray(entry.topics) ? entry.topics : [];
    });
    if (!container) return;
    if (daily.length < 2) {
      container.innerHTML = '<div class="empty-state">資料不足，暫時無法繪製趨勢圖。</div>';
      return;
    }

    const scopedEvents = filterEventsForRange(externalEvents, daily);
    const valuesTotal = daily.map((row) => safeNum(row.total_event_count));
    const valuesBlock = daily.map((row) => safeNum(row.block_event_count));
    const valuesReport = daily.map((row) => safeNum(row.report_event_count));
    const valuesSource = daily.map((row) => safeNum(row.source_count));
    const maxValue = Math.max(...valuesTotal, ...valuesSource, 1);
    const width = 940;
    const height = 360;
    const padL = 58;
    const padR = 20;
    const padT = 90;
    const padB = 38;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;
    const xFor = (index) => padL + (index / (daily.length - 1)) * chartW;
    const yFor = (value) => padT + chartH - (value / maxValue) * chartH;
    const pathFor = (values) => values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index).toFixed(1)} ${yFor(value).toFixed(1)}`).join(' ');

    const grid = [0.25, 0.5, 0.75, 1].map((ratio) => {
      const value = Math.round(maxValue * ratio);
      const y = yFor(value);
      return `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${width - padR}" y2="${y.toFixed(1)}" stroke="#dbe3ef" stroke-width="1"></line>
        <text x="${padL - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="10" fill="#94a3b8">${value}</text>`;
    }).join('');

    const labels = daily.map((row, index) => {
      if (index !== daily.length - 1 && index % 3 !== 0) return '';
      return `<text x="${xFor(index).toFixed(1)}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#94a3b8">${escapeHtml(String(row.day_key || '').slice(5))}</text>`;
    }).join('');

    const POLITICAL_CATS = new Set(['國會事件', '罷免案', '政黨動態']);
    const GENDER_CATS = new Set(['性別爭議', '性騷擾指控']);
    const DRAMA_CATS = new Set(['娛樂八卦', '網路論戰', '直播爭議']);
    function pinColor(category) {
      if (POLITICAL_CATS.has(category)) return { line: '#f59e0b', text: '#b45309' };
      if (GENDER_CATS.has(category)) return { line: '#ec4899', text: '#be185d' };
      if (DRAMA_CATS.has(category)) return { line: '#14b8a6', text: '#0f766e' };
      return { line: '#7c3aed', text: '#6d28d9' };
    }

    // Flatten all events and sort by x position for tier assignment
    const flatPins = [];
    scopedEvents.forEach((event) => {
      const dayIndex = daily.findIndex((row) => row.day_key === event.date);
      if (dayIndex < 0) return;
      flatPins.push({ event, dayIndex, date: event.date });
    });
    flatPins.sort((a, b) => a.dayIndex - b.dayIndex);

    // Assign stagger tiers so nearby labels don't overlap
    const tierYs = [padT - 10, padT - 24, padT - 38, padT - 52, padT - 66];
    const tierLastX = tierYs.map(() => Number.NEGATIVE_INFINITY);
    const minGap = 52;
    flatPins.forEach((pin) => {
      const x = xFor(pin.dayIndex);
      let chosen = 0;
      for (let t = 0; t < tierYs.length; t++) {
        if (x - tierLastX[t] >= minGap) { chosen = t; break; }
        if (t === tierYs.length - 1) chosen = tierLastX.indexOf(Math.min(...tierLastX));
      }
      tierLastX[chosen] = x;
      pin.x = x;
      pin.labelY = tierYs[chosen];
    });

    const pins = flatPins.map(({ event, date, x, labelY }) => {
      const label = String(event.shortLabel || event.label || event.title || '').trim() || date.slice(5);
      const labelText = label.length > 6 ? `${label.slice(0, 6)}…` : label;
      const { line: lineColor, text: textColor } = pinColor(event.category || '');
      return `<g class="chart-event-pin" tabindex="0" data-title="${escapeHtml(event.title || '')}" data-date="${escapeHtml(date)}" data-note="${escapeHtml(event.note || '')}" data-category="${escapeHtml(event.category || '')}">
        <line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${padT + chartH}" stroke="${lineColor}" stroke-width="1.2" stroke-dasharray="4 5"></line>
        <circle cx="${x.toFixed(1)}" cy="${labelY.toFixed(1)}" r="4" fill="${lineColor}" opacity="0.85"></circle>
        <text x="${x.toFixed(1)}" y="${(labelY - 7).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="${textColor}">${escapeHtml(labelText)}</text>
        <title>${escapeHtml(`${date}｜${event.title || ''}`)}</title>
      </g>`;
    }).join('');

    const spikeDots = daily.map((row, index) => {
      if (!row.is_spike) return '';
      const x = xFor(index);
      return `<circle cx="${x.toFixed(1)}" cy="${(padT - 18).toFixed(1)}" r="5" fill="#f97316" opacity="0.9">
        <title>異常峰值：${escapeHtml(row.day_key)}</title>
      </circle>`;
    }).join('');

    const dayRects = daily.map((row, index) => {
      const x = xFor(index);
      const halfW = daily.length > 1 ? (chartW / (daily.length - 1)) / 2 : 10;
      return `<rect class="chart-day-rect" x="${(x - halfW).toFixed(1)}" y="${padT}" width="${(halfW * 2).toFixed(1)}" height="${chartH}" fill="transparent" data-day="${escapeHtml(row.day_key)}" data-spike="${row.is_spike ? '1' : '0'}"></rect>`;
    }).join('');

    container.innerHTML = `
      <div class="svg-host">
        <svg viewBox="0 0 ${width} ${height}" aria-label="匿名聚合趨勢圖">
          <text x="14" y="${padT + chartH / 2}" text-anchor="middle" font-size="10" fill="#94a3b8" transform="rotate(-90 14 ${padT + chartH / 2})">事件數</text>
          ${grid}
          <path id="chart-path-total" d="${pathFor(valuesTotal)}" fill="none" stroke="#2563eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
          <path id="chart-path-block" d="${pathFor(valuesBlock)}" fill="none" stroke="#10b981" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>
          <path id="chart-path-report" d="${pathFor(valuesReport)}" fill="none" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
          <path id="chart-path-source" d="${pathFor(valuesSource)}" fill="none" stroke="#9ca3af" stroke-width="1.8" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round"></path>
          ${pins}
          <g id="chart-spikes">${spikeDots}</g>
          ${dayRects}
          ${labels}
        </svg>
      </div>
      <div class="chart-legend">
        <button class="chart-legend-item" data-target="total"><span class="chart-legend-dot" style="background:#2563eb"></span>總事件</button>
        <button class="chart-legend-item" data-target="block"><span class="chart-legend-dot" style="background:#10b981"></span>封鎖</button>
        <button class="chart-legend-item" data-target="report"><span class="chart-legend-dot" style="background:#60a5fa"></span>檢舉</button>
        <button class="chart-legend-item" data-target="source"><span class="chart-legend-dot chart-legend-dot--dashed" style="background:#9ca3af"></span>來源數</button>
        <button class="chart-legend-item" data-target="spikes"><span class="chart-legend-dot chart-legend-dot--spike"></span>異常峰值</button>
      </div>
    `;

    if (detailEl) {
      detailEl.innerHTML = scopedEvents.length
        ? '<strong>外部重要事件參考</strong> 點擊圖上的事件標記，可查看日期與事件說明。這些標記只用來做時序對照，不代表因果認定。'
        : '<strong>外部重要事件參考</strong> 目前這段觀測區間沒有手動標記的公共事件，圖上只顯示平台匿名樣本趨勢。';

      container.querySelectorAll('.chart-event-pin').forEach((node) => {
        const renderDetail = () => {
          detailEl.innerHTML = `<strong>${node.dataset.date}</strong> ${escapeHtml(node.dataset.title)}`
            + `${node.dataset.category ? ` · ${escapeHtml(node.dataset.category)}` : ''}`
            + `${node.dataset.note ? `<br>${escapeHtml(node.dataset.note)}` : ''}`
            + '<br>政治事件為外部參考，不代表與平台樣本之間存在已證實的因果關係。';
        };
        node.addEventListener('mouseenter', renderDetail);
        node.addEventListener('focus', renderDetail);
        node.addEventListener('click', renderDetail);
      });

      container.querySelectorAll('.chart-day-rect').forEach((rect) => {
        rect.addEventListener('mouseenter', () => {
          const day = rect.dataset.day;
          const isSpike = rect.dataset.spike === '1';
          const topics = topicMap[day] || [];
          const spikeNote = isSpike ? '<span style="color:#f97316;font-weight:600">▲ 異常峰值</span> · ' : '';
          const topicText = topics.length
            ? '熱門話題：' + topics.map((t) => `${escapeHtml(t.label)} (${t.count})`).join('、')
            : '尚無話題資料';
          detailEl.innerHTML = `<strong>${escapeHtml(day)}</strong> · ${spikeNote}${topicText}`;
        });
      });

      container.querySelectorAll('.chart-legend-item[data-target]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = btn.dataset.target;
          const el = container.querySelector(
            target === 'spikes' ? '#chart-spikes' : `#chart-path-${target}`
          );
          if (!el) return;
          const isHidden = el.getAttribute('data-hidden') === '1';
          el.setAttribute('data-hidden', isHidden ? '0' : '1');
          el.style.opacity = isHidden ? '1' : '0';
          el.style.pointerEvents = isHidden ? '' : 'none';
          btn.classList.toggle('chart-legend-item--off', !isHidden);
        });
      });
    }
  }

  function renderNarratives(container, narratives) {
    if (!container) return;
    const items = Array.isArray(narratives) ? narratives : [];
    if (!items.length) {
      container.innerHTML = '<p class="empty-state">目前沒有達到公開門檻的協調敘事樣本。</p>';
      return;
    }
    container.innerHTML = items.map((item) => {
      const bandClass = item.signalBand === 'high' ? 'badge--high' : item.signalBand === 'medium' ? 'badge--medium' : 'badge--low';
      const bandText = item.signalBand === 'high' ? '高信號' : item.signalBand === 'medium' ? '中信號' : '低信號';
      const hints = Array.isArray(item.hintLabels)
        ? item.hintLabels.map((h) => `<span class="hint-tag">${escapeHtml(h)}</span>`).join('')
        : '';
      const hasWhy = item.whyNote && item.whyNote.trim();
      return `<article class="narrative-card${hasWhy ? ' narrative-card--expandable' : ''}">
        <header class="narrative-card__header">
          <span class="badge ${bandClass}">${bandText}</span>
          <h3 class="narrative-card__title">${escapeHtml(item.title || '')}</h3>
          ${hasWhy ? '<button class="narrative-card__toggle" aria-expanded="false" aria-label="展開說明">為什麼？<span class="toggle-icon">↓</span></button>' : ''}
        </header>
        <p class="narrative-card__summary">${escapeHtml(item.summary || '')}</p>
        ${hasWhy ? `<div class="narrative-card__why" hidden><p>${escapeHtml(item.whyNote)}</p></div>` : ''}
        <footer class="narrative-card__stats">
          <span>${formatNumber(item.eventCount)} 事件</span>
          <span>${formatNumber(item.accountCount)} 帳號樣本</span>
          <span>${item.sourceCount} 個來源</span>
          ${hints}
        </footer>
      </article>`;
    }).join('');

    container.querySelectorAll('.narrative-card--expandable').forEach((card) => {
      const btn = card.querySelector('.narrative-card__toggle');
      const why = card.querySelector('.narrative-card__why');
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        btn.querySelector('.toggle-icon').textContent = open ? '↓' : '↑';
        why.hidden = open;
      });
    });
  }

  function renderReportCategories(container, categories) {
    if (!container) return;
    const items = Array.isArray(categories) ? categories : [];
    if (!items.length) {
      container.innerHTML = '<p class="empty-state">目前沒有達到公開門檻的檢舉分類資料。</p>';
      return;
    }
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
    const cx = 100;
    const cy = 100;
    const r = 70;
    const strokeWidth = 28;
    const circumference = 2 * Math.PI * r;
    const totalEventCount = items.reduce((sum, cat) => sum + safeNum(cat.eventCount), 0);
    const normalized = items.map((cat, index) => {
      const eventCount = safeNum(cat.eventCount);
      const accountCount = safeNum(cat.accountCount);
      const pct = safeNum(cat.sharePct);
      return {
        color: colors[index % colors.length],
        label: escapeHtml(cat.label || ''),
        pct,
        eventCount,
        accountCount,
        arcLength: (Math.max(pct, 0) / 100) * circumference
      };
    });

    let cumulativeArc = 0;
    const segments = normalized.map((cat) => {
      const segment = `<circle
        cx="${cx}"
        cy="${cy}"
        r="${r}"
        fill="none"
        stroke="${cat.color}"
        stroke-width="${strokeWidth}"
        stroke-linecap="butt"
        stroke-dasharray="${cat.arcLength.toFixed(3)} ${(circumference - cat.arcLength).toFixed(3)}"
        stroke-dashoffset="${(-cumulativeArc).toFixed(3)}"
        transform="rotate(-90 100 100)"
      ></circle>`;
      cumulativeArc += cat.arcLength;
      return segment;
    }).join('');

    const legend = normalized.map((cat) => `<div class="donut-legend-row">
      <span class="donut-legend-dot" style="background:${cat.color}"></span>
      <span class="donut-legend-label">${cat.label}</span>
      <span class="donut-legend-pct">${formatPercent(cat.pct)}</span>
      <span class="donut-legend-count">${formatNumber(cat.eventCount)} 事件</span>
      <span class="donut-legend-count">${formatNumber(cat.accountCount)} 帳號</span>
    </div>`).join('');

    container.innerHTML = `<div class="donut-wrap">
      <div class="donut-svg-host">
        <svg viewBox="0 0 200 200" role="img" aria-label="檢舉分類分佈甜甜圈圖">
          <circle
            cx="${cx}"
            cy="${cy}"
            r="${r}"
            fill="none"
            stroke="#e2e8f0"
            stroke-width="${strokeWidth}"
          ></circle>
          ${segments}
          <text x="${cx}" y="96" text-anchor="middle" class="donut-center-label">總計</text>
          <text x="${cx}" y="114" text-anchor="middle" class="donut-center-value">${formatNumber(totalEventCount)}</text>
        </svg>
      </div>
      <div class="donut-legend">${legend}</div>
    </div>`;
  }

  function toggleMockMode(forceMock) {
    const url = new URL(window.location.href);
    if (forceMock) {
      url.searchParams.set('mock', '1');
    } else {
      url.searchParams.delete('mock');
    }
    window.location.href = url.toString();
  }

  async function uploadPlatformJson(file) {
    if (!file) throw new Error('請先選擇 JSON 檔案。');
    const text = await file.text();
    const result = await api('/api/v1/platform/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: text
    });
    return result;
  }

  window.PlatformPublic = {
    API_BASE,
    DEFAULT_DAYS,
    MOCK_DAYS,
    DEFAULT_TOP,
    FORCE_MOCK,
    formatNumber,
    formatPercent,
    formatDateLabel,
    formatMonthLabel,
    escapeHtml,
    bandLabel,
    summarizeSourceCoverage,
    fetchOverview,
    hasLiveData,
    loadPoliticalEvents,
    fetchPoliticalEvents: loadPoliticalEvents,
    computeWindowMetrics,
    buildSignalBadges,
    renderTrendChart,
    renderNarratives,
    renderReportCategories,
    toggleMockMode,
    uploadPlatformJson
  };
})();
