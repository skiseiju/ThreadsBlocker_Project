(function () {
  const PLATFORM_VERSION = '0.1.0-beta23';
  const API_BASE = 'https://threadsblocker-bug-admin.skiseiju.workers.dev';
  const DEFAULT_DAYS = 90;
  const MOCK_DAYS = 60;
  const DEFAULT_TOP = 24;
  const EVENT_DAYS = 90;
  const EVENT_LIMIT = 300;
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
        title: '圍繞國防特別條例程序攻防的同質性留言',
        summary: '多個來源反覆放大「黑箱付委」「程序偷渡」等相似框架，集中出現在國防特別條例與委員會審查相關貼文下方。',
        whyNote: '從 2 月底付委到 4 月中協商，這類留言長期使用固定詞彙批評國會程序，且大量帳號只在相關議題出現。句型、標籤與出現時點都高度集中，符合協調放大單一程序敘事的特徵。',
        eventCount: 2341,
        sourceCount: 8,
        accountCount: 714,
        signalBand: 'high',
        hintLabels: ['國防特別條例', '程序攻防']
      },
      {
        title: '把訪中行程包裝成「和平解方」的重複框架',
        summary: '鄭麗文訪中與後續 10 項涉台措施討論期間，樣本中反覆出現將訪中描述為唯一理性出路的相似貼文與留言。',
        whyNote: '這批內容常把訪中行程包裝成「務實交流」與「避戰唯一道路」，但多數帳號平時幾乎沒有其他公共議題互動。文本模板相近、推進節奏一致，顯示並非自然形成的輿論分布。',
        eventCount: 1876,
        sourceCount: 6,
        accountCount: 531,
        signalBand: 'high',
        hintLabels: ['訪中', '和平之旅']
      },
      {
        title: '借外交與兩岸議題放大「總統失能」敘事',
        summary: '圍繞史瓦帝尼出訪、外部施壓與「不存在中華民國總統」等節點，樣本中出現大量貶抑式固定句型，嘗試把外交事件導向領導失能框架。',
        whyNote: '這組內容在 4 月中下旬快速增溫，常把不同外交新聞剪接成單一負面結論。帳號之間雖少有互動，但用詞和情緒標籤高度同步，屬於典型的事件借題放大。',
        eventCount: 1423,
        sourceCount: 5,
        accountCount: 389,
        signalBand: 'medium',
        hintLabels: ['外交', '兩岸']
      },
      {
        title: '將總預算與國防支出綁成「政府失序」的轉貼群',
        summary: '總預算與國防支出討論期間，多個來源重複轉貼將朝野協商失靈歸咎於單一陣營的貼文，文案高度相似。',
        whyNote: '這些貼文常用簡化口號把預算爭議壓縮成單一責任敘事，並由少量原始貼文快速擴散。內容缺少細節，但複製速度快、帳號重疊度高，符合協調轉貼的常見型態。',
        eventCount: 1187,
        sourceCount: 4,
        accountCount: 302,
        signalBand: 'medium',
        hintLabels: ['總預算', '國防支出']
      },
      {
        title: '把對外國會互動解讀成陣營站隊的放大敘事',
        summary: '在台加國會互動、國際參與等新聞下方，樣本中可見把正常國會外交互動直接轉成陣營對決的重複評論群。',
        whyNote: '這些留言通常不討論事件本身，而是迅速把國會互動翻譯成政黨站隊與忠誠測驗。它們經常在事件發布後數小時內同步湧現，顯示是為了搶占解讀框架而非自然討論。',
        eventCount: 934,
        sourceCount: 3,
        accountCount: 248,
        signalBand: 'medium',
        hintLabels: ['國會外交', '陣營對決']
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

  function safeString(value, maxLength = 200) {
    return String(value ?? '').trim().slice(0, maxLength);
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
      || (sourceName ? `${sourceName}／外部事件錨點` : '外部事件錨點，僅作時序參考。');

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
        contributorCount: 0,
        blockEventCount: 0,
        reportEventCount: 0,
        totalEventCount: 0,
        summaryTotalEventCount: 0,
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
      reportCategoryTree: [],
      topNarratives: [],
      candidateTopics: [],
      recentUploads: [],
      sourceRegistry: {
        sourceCount: 0,
        trustedSourceCount: 0,
        probationSourceCount: 0,
        flaggedSourceCount: 0,
        activeLast1d: 0,
        activeLast7d: 0,
        registryUploadCount: 0,
        dateRange: { start: '', end: '' },
        latestSeenAt: ''
      },
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
      sourceRegistry: { ...empty.sourceRegistry, ...(data?.sourceRegistry || {}) },
      thresholds: { ...empty.thresholds, ...(data?.thresholds || {}) },
      signals: { ...empty.signals, ...(data?.signals || {}) },
      methodology: { ...empty.methodology, ...(data?.methodology || {}) },
      dailyTrend: Array.isArray(data?.dailyTrend) ? data.dailyTrend : [],
      topicTimeSeries: Array.isArray(data?.topicTimeSeries) ? data.topicTimeSeries : [],
      reportCategories: Array.isArray(data?.reportCategories) ? data.reportCategories : [],
      reportCategoryTree: Array.isArray(data?.reportCategoryTree) ? data.reportCategoryTree : [],
      topNarratives: Array.isArray(data?.topNarratives) ? data.topNarratives : [],
      candidateTopics: Array.isArray(data?.candidateTopics) ? data.candidateTopics : [],
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
        return { data, mockMode: false, emptyState: false, message: buildDataHealthMessage(data) };
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

  function buildDataHealthMessage(data) {
    const registry = data?.sourceRegistry || {};
    const active = safeNum(registry.activeLast1d);
    const trustedSources = safeNum(registry.trustedSourceCount);
    const uploadCount = safeNum(data?.overview?.uploadCount);
    const analysisEnd = data?.dateRange?.end || data?.contribution?.dateRange?.end || '';
    const latestSeen = registry.latestSeenAt ? String(registry.latestSeenAt).slice(0, 10) : '';
    const parts = [];

    if (active > 0 || trustedSources > 0) {
      parts.push(`資料管線最近 24 小時有 ${formatNumber(active)} 個來源回報，累計 ${formatNumber(trustedSources)} 個來源通過 trusted 門檻；這代表回報活躍，不代表已形成 5 月可分析趨勢。`);
    }
    if (uploadCount > 0) {
      parts.push(`目前公開趨勢只納入 ${formatNumber(uploadCount)} 筆已形成可分析列的批次。`);
    }
    if (latestSeen && analysisEnd && latestSeen > analysisEnd) {
      parts.push(`最新來源回報到 ${latestSeen}，可分析趨勢暫到 ${analysisEnd}。`);
    }

    return parts.join(' ');
  }

  async function loadPoliticalEvents() {
    try {
      const result = await api(`/api/v1/platform/political-events?days=${EVENT_DAYS}&limit=${EVENT_LIMIT}`);
      const events = dedupePoliticalEvents(Array.isArray(result.events) ? result.events : []);
      if (events.length) return events;
    } catch (error) {}
    return loadStaticPoliticalEvents();
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

  function normalizeDailyTrendRows(dailyTrend) {
    const rows = (Array.isArray(dailyTrend) ? dailyTrend : [])
      .map((row) => ({
        day_key: String(row?.day_key || '').slice(0, 10),
        block_event_count: safeNum(row?.block_event_count),
        report_event_count: safeNum(row?.report_event_count),
        total_event_count: safeNum(row?.total_event_count),
        source_count: safeNum(row?.source_count),
        is_spike: Boolean(row?.is_spike)
      }))
      .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day_key))
      .sort((a, b) => a.day_key.localeCompare(b.day_key));

    if (rows.length < 2) return rows;

    const byDay = new Map(rows.map((row) => [row.day_key, row]));
    const start = rows[0].day_key;
    const end = rows[rows.length - 1].day_key;
    const filled = [];
    let cursor = start;
    let guard = 0;

    while (cursor <= end && guard < 370) {
      filled.push(byDay.get(cursor) || {
        day_key: cursor,
        block_event_count: 0,
        report_event_count: 0,
        total_event_count: 0,
        source_count: 0,
        is_spike: false
      });
      cursor = shiftDayKey(cursor, 1);
      guard += 1;
    }

    return filled;
  }

  function groupEventsByDay(events) {
    const groups = new Map();
    (Array.isArray(events) ? events : []).forEach((event) => {
      const date = String(event?.date || '').slice(0, 10);
      if (!date) return;
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(event);
    });
    return Array.from(groups.entries()).map(([date, dayEvents]) => ({
      date,
      events: dayEvents,
      category: dayEvents[0]?.category || '',
      title: dayEvents.length === 1 ? dayEvents[0].title : `${dayEvents.length} 件外部事件`,
      label: `${dayEvents.length}件事件`
    }));
  }

  function findCandidateExternalMatches(topic, externalEvents) {
    const keywords = Array.isArray(topic?.keywords) ? topic.keywords.filter(Boolean) : [];
    if (!keywords.length || !Array.isArray(externalEvents)) return [];
    return externalEvents.filter((event) => {
      const haystack = `${event.title || ''} ${event.category || ''}`;
      return keywords.some((keyword) => haystack.includes(keyword));
    });
  }

  function buildCandidateAnchorGroups(candidateTopics, externalEvents, dailyTrend) {
    const daily = Array.isArray(dailyTrend) ? dailyTrend : [];
    if (!daily.length) return [];
    const start = daily[0]?.day_key || '';
    const end = daily[daily.length - 1]?.day_key || '';
    const anchors = (Array.isArray(candidateTopics) ? candidateTopics : [])
      .filter((topic) => topic?.kind === 'external_anchor')
      .slice(0, 8);

    return anchors.map((topic) => {
      const matches = findCandidateExternalMatches(topic, externalEvents)
        .filter((event) => event.date >= start && event.date <= end)
        .sort((a, b) => a.date.localeCompare(b.date));
      const topDay = Array.isArray(topic.topDays) && topic.topDays.length ? topic.topDays[0].date : '';
      const rangedDay = topic.dateRange?.start || '';
      const matchedDay = matches[0]?.date || '';
      const date = [topDay, rangedDay, matchedDay].find((day) => day >= start && day <= end);
      if (!date) return null;

      const fallbackEvent = {
        date,
        title: topic.title || '候選議題錨點',
        shortLabel: topic.title || '候選',
        category: topic.strength === 'strong' ? '候選強關聯' : '候選關聯',
        note: topic.note || '候選議題錨點',
        sourceName: candidateStrengthLabel(topic.strength, topic.kind),
        sourceUrl: ''
      };
      return {
        date,
        events: matches.length ? matches : [fallbackEvent],
        category: topic.strength === 'strong' ? '候選強關聯' : '候選關聯',
        title: topic.title || '候選議題錨點',
        label: topic.title || '候選',
        topic
      };
    }).filter(Boolean);
  }

  function renderTrendReadout(container, data, externalEvents) {
    if (!container) return;
    const daily = normalizeDailyTrendRows(data?.dailyTrend || []);
    if (!daily.length) {
      container.innerHTML = '<p class="chart-readout__empty">目前還沒有足夠資料形成可引用趨勢。</p>';
      return;
    }

    const start = daily[0]?.day_key || data?.dateRange?.start || '';
    const end = daily[daily.length - 1]?.day_key || data?.dateRange?.end || '';
    const activeDays = daily.filter((row) => safeNum(row.total_event_count) > 0).length;
    const peak = daily.reduce((max, row) => (
      safeNum(row.total_event_count) > safeNum(max.total_event_count) ? row : max
    ), daily[0] || {});
    const overview = data?.overview || {};
    const contributorCount = safeNum(overview.contributorCount);

    const items = [
      {
        label: '可分析趨勢',
        value: `${formatDateLabel(start)} - ${formatDateLabel(end)}`,
        note: `${formatNumber(activeDays)} 個有效日期；0 表示當日沒有進入可分析表的事件，不代表 Threads 完全沒有相關活動。`
      },
      {
        label: '可分析樣本',
        value: `${formatNumber(overview.uploadCount)} 批次${contributorCount ? ` / ${formatNumber(contributorCount)} 來源` : ''}`,
        note: '只計入已成功寫入可分析表、可形成趨勢與分類的批次。'
      },
      {
        label: '事件量',
        value: `${formatNumber(overview.totalEventCount)} 件`,
        note: `封鎖 ${formatNumber(overview.blockEventCount)}；檢舉 ${formatNumber(overview.reportEventCount)}。`
      },
      {
        label: '觀測窗高點',
        value: `${formatDateLabel(peak.day_key)} / ${formatNumber(peak.total_event_count)} 件`,
        note: `封鎖 ${formatNumber(peak.block_event_count)}；檢舉 ${formatNumber(peak.report_event_count)}；來源數 ${formatNumber(peak.source_count)}。`
      }
    ];

    container.innerHTML = items.map((item) => `<div class="chart-readout__item">
      <span class="chart-readout__label">${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.value)}</strong>
      <span>${escapeHtml(item.note)}</span>
    </div>`).join('');
  }

  function computeWindowMetrics(data) {
    const daily = normalizeDailyTrendRows(data?.dailyTrend || []);
    const last7 = daily.slice(-7);
    const previous7 = daily.slice(-14, -7);
    const last7Total = last7.reduce((sum, row) => sum + safeNum(row.total_event_count), 0);
    const last7Block = last7.reduce((sum, row) => sum + safeNum(row.block_event_count), 0);
    const last7Report = last7.reduce((sum, row) => sum + safeNum(row.report_event_count), 0);
    const last7Source = last7.reduce((sum, row) => sum + safeNum(row.source_count), 0);
    const previous7Total = previous7.reduce((sum, row) => sum + safeNum(row.total_event_count), 0);
    const previous7Block = previous7.reduce((sum, row) => sum + safeNum(row.block_event_count), 0);
    const previous7Report = previous7.reduce((sum, row) => sum + safeNum(row.report_event_count), 0);
    const previous7Source = previous7.reduce((sum, row) => sum + safeNum(row.source_count), 0);
    const activeDays = daily.filter((row) => safeNum(row.total_event_count) > 0).length;
    const peak = daily.reduce((max, row) => (
      safeNum(row.total_event_count) > safeNum(max.total_event_count) ? row : max
    ), daily[0] || {});
    const pctChange = (current, previous) => {
      if (previous <= 0) return current > 0 ? null : 0;
      return Number((((current - previous) / previous) * 100).toFixed(1));
    };
    return {
      daily,
      last7,
      previous7,
      last7Total,
      last7Block,
      last7Report,
      last7Source,
      previous7Total,
      previous7Block,
      previous7Report,
      previous7Source,
      totalDeltaPct: pctChange(last7Total, previous7Total),
      blockDeltaPct: pctChange(last7Block, previous7Block),
      reportDeltaPct: pctChange(last7Report, previous7Report),
      sourceDeltaPct: pctChange(last7Source, previous7Source),
      avgDaily7: last7.length ? Math.round(last7Total / last7.length) : 0,
      activeDays,
      hasComparison: last7.length === 7 && previous7.length === 7 && previous7Total > 0,
      peak
    };
  }

  function directionText(delta) {
    if (!Number.isFinite(delta)) return '無法比較';
    if (delta > 0) return `上升 ${formatPercent(delta)}`;
    if (delta < 0) return `下降 ${formatPercent(delta)}`;
    return '持平';
  }

  function deltaClass(delta) {
    if (!Number.isFinite(delta) || delta === 0) return 'stat-card__delta--flat';
    return delta > 0 ? 'stat-card__delta--up' : 'stat-card__delta--down';
  }

  function deltaSentence(delta, noun = '事件量') {
    if (!Number.isFinite(delta)) return `近 7 日${noun}已有資料，但前 7 日不足，暫時無法計算變化。`;
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    return `${arrow} 近 7 日較前 7 日${directionText(delta)}`;
  }

  function displayCategoryLabel(label) {
    return String(label || '未分類').replace(/^這是\s*/, '').trim() || '未分類';
  }

  function topReportCategory(data) {
    const categories = Array.isArray(data?.reportCategories) ? data.reportCategories : [];
    const reportEventCount = safeNum(data?.overview?.reportEventCount);
    if (!categories.length || reportEventCount <= 0) return null;
    const top = categories.reduce((max, cat) => (
      safeNum(cat.eventCount) > safeNum(max.eventCount) ? cat : max
    ), categories[0] || {});
    const eventCount = safeNum(top.eventCount);
    if (eventCount <= 0) return null;
    const totalEventCount = safeNum(data?.overview?.totalEventCount);
    return {
      label: displayCategoryLabel(top.label),
      eventCount,
      reportPct: (eventCount / reportEventCount) * 100,
      allPct: totalEventCount > 0 ? (eventCount / totalEventCount) * 100 : 0
    };
  }

  function findPeakEventOverlap(peak, externalEvents) {
    const day = String(peak?.day_key || '').slice(0, 10);
    if (!day || safeNum(peak?.total_event_count) <= 0) return null;
    const events = (Array.isArray(externalEvents) ? externalEvents : [])
      .filter((event) => String(event?.date || '').slice(0, 10) === day);
    return events[0] || null;
  }

  function hottestTopicText(data, peakDay = '') {
    const rows = Array.isArray(data?.topicTimeSeries) ? data.topicTimeSeries : [];
    const preferred = rows.find((row) => row.date === peakDay && Array.isArray(row.topics) && row.topics.length);
    const fallback = rows.find((row) => Array.isArray(row.topics) && row.topics.length);
    const topics = (preferred || fallback || {}).topics || [];
    if (!topics.length) return '';
    const top = topics[0];
    const label = top.label ? displayCategoryLabel(top.label) : '未命名話題';
    return `${label}${safeNum(top.count) ? `（${formatNumber(top.count)} 件）` : ''}`;
  }

  function renderHeroDataSentence(container, data) {
    if (!container) return;
    const metrics = computeWindowMetrics(data || {});
    const total = safeNum(data?.overview?.totalEventCount);
    if (total <= 0 && metrics.last7Total <= 0) {
      container.textContent = '本期資料量不足，暫時還不能判讀趨勢方向。';
      return;
    }
    const delta = Number.isFinite(metrics.totalDeltaPct)
      ? `，近 7 日較前 7 日${directionText(metrics.totalDeltaPct)}`
      : '，近 7 日已開始累積但前期基準不足';
    container.textContent = `本期共 ${formatNumber(total || metrics.last7Total)} 件可分析事件${delta}。`;
  }

  function renderStatCards(data) {
    const metrics = computeWindowMetrics(data || {});
    const setText = (id, text, className = '') => {
      const node = document.getElementById(id);
      if (!node) return;
      node.textContent = text;
      node.classList.remove('stat-card__delta--up', 'stat-card__delta--down', 'stat-card__delta--flat');
      if (className) node.classList.add(className);
    };

    setText('statEventsDelta', deltaSentence(metrics.totalDeltaPct, '事件量'), deltaClass(metrics.totalDeltaPct));
    setText('statEventsSub', '這是觀測窗內被封鎖或檢舉的總量，用來看使用者遇到問題的規模。');
    setText('statCoordinatedDelta', '這是累積估計值，沒有每日趨勢線可比較。', 'stat-card__delta--flat');
    setText('statCoordinatedSub', '數字越高，代表同一批高信號敘事牽涉的帳號樣本越多；不是身分或違法認定。');
    setText('statContributorsDelta', '這是觀測窗累積值，沒有每日趨勢線可比較。', 'stat-card__delta--flat');
    setText('statContributorsSub', '有多少匿名來源的資料已能進入分析，數字越高越能降低單一來源偏誤。');
    setText('statTrustedUploadsDelta', '這是觀測窗累積值，沒有每日趨勢線可比較。', 'stat-card__delta--flat');
    setText('statTrustedUploadsSub', '已通過整理、能用來產生趨勢和分類的匿名資料批次。');
  }

  function renderKeyInsights(container, data, externalEvents) {
    if (!container) return;
    const metrics = computeWindowMetrics(data || {});
    const items = [];

    if (metrics.last7.length && metrics.last7Total > 0) {
      const change = Number.isFinite(metrics.totalDeltaPct)
        ? `，較前 7 日${directionText(metrics.totalDeltaPct)}`
        : '，前 7 日資料不足，暫時無法比較升降';
      items.push({
        body: `近 7 日共 ${formatNumber(metrics.last7Total)} 件事件${change}。`
      });
    }

    const overlap = findPeakEventOverlap(metrics.peak, externalEvents);
    if (overlap) {
      items.push({
        body: `峰值出現在 ${formatDateLabel(metrics.peak.day_key)}（${formatNumber(metrics.peak.total_event_count)} 件），與外部事件「${overlap.title}」時間重疊。`
      });
    } else if (metrics.peak && safeNum(metrics.peak.total_event_count) > 0) {
      items.push({
        body: `本期最高點是 ${formatDateLabel(metrics.peak.day_key)}，當天有 ${formatNumber(metrics.peak.total_event_count)} 件可分析事件。`
      });
    }

    const topCategory = topReportCategory(data || {});
    if (topCategory) {
      items.push({
        body: `檢舉最集中的分類是「${topCategory.label}」，占檢舉事件 ${formatPercent(topCategory.reportPct)}。`
      });
    }

    const badges = buildSignalBadges(data || {}, metrics)
      .filter((badge) => badge.tone !== 'steady' || items.length > 0)
      .slice(0, Math.max(0, 5 - items.length));
    badges.forEach((badge) => {
      items.push({
        badge,
        body: badge.detail
      });
    });

    if (!items.length) {
      container.innerHTML = '<p class="empty-state empty-state--compact">本期資料量不足，暫無重點結論。</p>';
      return;
    }

    container.innerHTML = items.slice(0, 5).map((item) => `<article class="insight-card">
      ${item.badge ? `<span class="insight-badge insight-badge--${escapeHtml(item.badge.tone)}">${escapeHtml(item.badge.label)}</span>` : ''}
      <p>${escapeHtml(item.body)}</p>
    </article>`).join('');
  }

  function buildSignalBadges(data, windowMetrics) {
    const signals = data.signals || {};
    const metrics = windowMetrics || computeWindowMetrics(data || {});
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
    if (Number.isFinite(metrics.totalDeltaPct) && metrics.totalDeltaPct >= 25) {
      items.push({
        tone: 'warn',
        label: '短期升高',
        detail: `最近 7 日事件量較前 7 日增加 ${formatPercent(metrics.totalDeltaPct, 1, true)}`
      });
    }
    if (safeNum(signals.coordinatedAccountEstimate) >= 100) {
      items.push({
        tone: 'warn',
        label: '帳號集中出現',
        detail: `約 ${formatNumber(signals.coordinatedAccountEstimate)} 個帳號在熱門重複內容中被封鎖或檢舉`
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

  function renderTrendChart(container, detailEl, dailyTrend, externalEvents, topicTimeSeries, candidateTopics = []) {
    const daily = normalizeDailyTrendRows(dailyTrend);
    const topicMap = {};
    (Array.isArray(topicTimeSeries) ? topicTimeSeries : []).forEach((entry) => {
      if (entry && entry.date) topicMap[entry.date] = Array.isArray(entry.topics) ? entry.topics : [];
    });
    if (!container) return;
    if (daily.length < 2) {
      container.innerHTML = '<div class="empty-state">資料不足，暫時無法繪製趨勢圖。</div>';
      if (detailEl) {
        detailEl.innerHTML = '<strong>資料不足</strong> 目前可分析日期少於兩天，暫時不繪製趨勢線。';
      }
      return;
    }

    const groupedEvents = [];
    const valuesTotal = daily.map((row) => safeNum(row.total_event_count));
    const valuesBlock = daily.map((row) => safeNum(row.block_event_count));
    const valuesReport = daily.map((row) => safeNum(row.report_event_count));
    const valuesSource = daily.map((row) => safeNum(row.source_count));
    const maxValue = Math.max(...valuesTotal, 1);
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
    const SOCIAL_CATS = new Set(['公共社會事件', '重大司法事件']);
    const GENDER_CATS = new Set(['性別爭議', '性騷擾指控']);
    const DRAMA_CATS = new Set(['娛樂八卦', '網路論戰', '直播爭議']);
    function pinColor(category) {
      if (category === '候選強關聯') return { line: '#2563eb', text: '#1d4ed8' };
      if (category === '候選關聯') return { line: '#f59e0b', text: '#b45309' };
      if (POLITICAL_CATS.has(category)) return { line: '#f59e0b', text: '#b45309' };
      if (SOCIAL_CATS.has(category)) return { line: '#ef4444', text: '#b91c1c' };
      if (GENDER_CATS.has(category)) return { line: '#ec4899', text: '#be185d' };
      if (DRAMA_CATS.has(category)) return { line: '#14b8a6', text: '#0f766e' };
      return { line: '#7c3aed', text: '#6d28d9' };
    }

    const flatPins = [];
    groupedEvents.forEach((group) => {
      const dayIndex = daily.findIndex((row) => row.day_key === group.date);
      if (dayIndex < 0) return;
      flatPins.push({ group, dayIndex, date: group.date });
    });
    flatPins.sort((a, b) => a.dayIndex - b.dayIndex);

    const tierYs = [padT - 10, padT - 24, padT - 38, padT - 52, padT - 66];
    const tierLastX = tierYs.map(() => Number.NEGATIVE_INFINITY);
    const minGap = 52;
    flatPins.forEach((pin) => {
      const x = xFor(pin.dayIndex);
      const eventY = yFor(valuesTotal[pin.dayIndex]);
      let chosen = 0;
      for (let t = 0; t < tierYs.length; t++) {
        if (x - tierLastX[t] >= minGap) { chosen = t; break; }
        if (t === tierYs.length - 1) chosen = tierLastX.indexOf(Math.min(...tierLastX));
      }
      tierLastX[chosen] = x;
      pin.x = x;
      pin.eventY = eventY;
      pin.labelY = tierYs[chosen];
    });

    const pins = flatPins.map(({ group, date, x, eventY, labelY }) => {
      const label = String(group.label || '').trim() || date.slice(5);
      const labelText = label.length > 8 ? `${label.slice(0, 8)}…` : label;
      const { line: lineColor, text: textColor } = pinColor(group.category || '');
      const lineTop = Math.min(labelY + 8, eventY - 8);
      const hitY = Math.max(0, labelY - 24);
      const hitHeight = Math.max(32, eventY - hitY + 8);
      const payload = group.events.map((event) => ({
        title: event.title || '',
        category: event.category || '',
        note: event.note || '',
        sourceName: event.sourceName || '',
        sourceUrl: event.sourceUrl || ''
      }));
      return `<g class="chart-event-pin" tabindex="0" data-title="${escapeHtml(group.title || '')}" data-date="${escapeHtml(date)}" data-events="${escapeHtml(JSON.stringify(payload))}">
        <rect class="chart-event-pin-hit" x="${(x - 26).toFixed(1)}" y="${hitY.toFixed(1)}" width="52" height="${hitHeight.toFixed(1)}" fill="transparent"></rect>
        <line x1="${x.toFixed(1)}" y1="${lineTop.toFixed(1)}" x2="${x.toFixed(1)}" y2="${eventY.toFixed(1)}" stroke="${lineColor}" stroke-width="1.2" stroke-dasharray="4 5" opacity="0.9"></line>
        <text x="${x.toFixed(1)}" y="${(labelY - 7).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="600" fill="${textColor}">${escapeHtml(labelText)}</text>
        <title>${escapeHtml(`${date}｜${group.title || ''}`)}</title>
      </g>`;
    }).join('');

    const eventDayIndexSet = new Set(flatPins.map((pin) => pin.dayIndex));
    const spikeDots = daily.map((row, index) => {
      if (!row.is_spike) return '';
      const baseX = xFor(index);
      const baseY = yFor(valuesTotal[index]);
      const spikeOffsetY = eventDayIndexSet.has(index) ? 24 : 14;
      const spikeY = Math.max(padT + 8, baseY - spikeOffsetY);
      return `<circle cx="${baseX.toFixed(1)}" cy="${spikeY.toFixed(1)}" r="5" fill="#f97316" opacity="0.9">
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
          <path id="chart-path-source" d="${pathFor(valuesSource)}" fill="none" stroke="#9ca3af" stroke-width="1.8" stroke-dasharray="5 5" stroke-linecap="round" stroke-linejoin="round" opacity="0" data-hidden="1"></path>
          ${dayRects}
          ${pins}
          <g id="chart-spikes">${spikeDots}</g>
          ${labels}
        </svg>
      </div>
      <div class="chart-legend">
        <button class="chart-legend-item" data-target="total"><span class="chart-legend-dot" style="background:#2563eb"></span>總事件</button>
        <button class="chart-legend-item" data-target="block"><span class="chart-legend-dot" style="background:#10b981"></span>封鎖</button>
        <button class="chart-legend-item" data-target="report"><span class="chart-legend-dot" style="background:#60a5fa"></span>檢舉</button>
        <button class="chart-legend-item chart-legend-item--off" data-target="source"><span class="chart-legend-dot chart-legend-dot--dashed" style="background:#9ca3af"></span>來源數</button>
        <button class="chart-legend-item" data-target="spikes"><span class="chart-legend-dot chart-legend-dot--spike"></span>異常峰值</button>
      </div>
      <p class="chart-scale-note">讀圖：總事件 = 封鎖 + 檢舉；外部事件標記只作時序對照，不代表因果認定。來源數量級不同，預設不畫在主圖，可用圖例切換查看方向。</p>
    `;

    if (detailEl) {
      const metrics = computeWindowMetrics({ dailyTrend: daily });
      const peak = metrics.peak || {};
      const hotTopic = hottestTopicText({ topicTimeSeries }, peak.day_key);
      const direction = Number.isFinite(metrics.totalDeltaPct)
        ? `近 7 日較前 7 日${directionText(metrics.totalDeltaPct)}`
        : '近 7 日已有資料，但前 7 日不足，暫時無法比較方向';
      detailEl.innerHTML = `<strong>本期發現</strong> 峰值出現在 ${escapeHtml(formatDateLabel(peak.day_key))}，共 ${formatNumber(peak.total_event_count)} 件；${escapeHtml(direction)}；當期最熱話題：${escapeHtml(hotTopic || '暫無公開話題摘要')}。`;

      container.querySelectorAll('.chart-event-pin').forEach((node) => {
        const renderDetail = () => {
          let events = [];
          try {
            events = JSON.parse(node.dataset.events || '[]');
          } catch (error) {}
          const list = events.slice(0, 8).map((event) => (
            `<li>
              <span class="chart-detail-event-title">${escapeHtml(event.title || '')}</span>
              <span class="chart-detail-event-meta">${escapeHtml([event.category, event.sourceName].filter(Boolean).join(' · ') || '外部事件')}</span>
            </li>`
          )).join('');
          const more = events.length > 8 ? `<p class="chart-detail-more">另有 ${events.length - 8} 件事件。</p>` : '';
          detailEl.innerHTML = `<strong>${node.dataset.date}</strong> ${escapeHtml(node.dataset.title || '')}`
            + (list ? `<ul class="chart-detail-events">${list}</ul>` : '')
            + more
            + '<p class="chart-detail-note">外部事件只作時間參考；是否相關仍要看下方議題卡片。</p>';
        };
        node.addEventListener('mouseenter', renderDetail);
        node.addEventListener('focus', renderDetail);
        node.addEventListener('click', renderDetail);
      });

      container.querySelectorAll('.chart-day-rect').forEach((rect) => {
        rect.addEventListener('mouseenter', () => {
          const day = rect.dataset.day;
          const isSpike = rect.dataset.spike === '1';
          const row = daily.find((item) => item.day_key === day) || {};
          const topics = topicMap[day] || [];
          const spikeNote = isSpike ? '<span style="color:#f97316;font-weight:600">▲ 異常峰值</span> · ' : '';
          const countText = `總事件 ${formatNumber(row.total_event_count)}；封鎖 ${formatNumber(row.block_event_count)}；檢舉 ${formatNumber(row.report_event_count)}；來源數 ${formatNumber(row.source_count)}`;
          const topicText = topics.length
            ? '熱門話題：' + topics.map((t) => `${escapeHtml(t.label)} (${t.count})`).join('、')
            : '當日沒有可公開話題摘要';
          detailEl.innerHTML = `<strong>${escapeHtml(day)}</strong> · ${spikeNote}${escapeHtml(countText)}<br>${topicText}`;
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
      return `<article class="narrative-card">
        <header class="narrative-card__header">
          <span class="badge ${bandClass}">${bandText}</span>
          <h3 class="narrative-card__title">${escapeHtml(item.title || '')}</h3>
        </header>
        <p class="narrative-card__summary">${escapeHtml(item.summary || '')}</p>
        ${hasWhy ? `<div class="narrative-card__why"><p>${escapeHtml(item.whyNote)}</p></div>` : ''}
        <footer class="narrative-card__stats">
          <span>${formatNumber(item.eventCount)} 事件</span>
          <span>${formatNumber(item.accountCount)} 個帳號</span>
          <span>${item.sourceCount} 個來源</span>
          ${hints}
        </footer>
      </article>`;
    }).join('');
  }

  function candidateKindLabel(kind) {
    return kind === 'external_anchor' ? '新聞事件可對照' : '站內自行升溫';
  }

  function candidateStrengthLabel(strength, kind) {
    if (kind === 'external_anchor') return strength === 'strong' ? '時間與話題吻合' : '待人工確認';
    return strength === 'strong' ? '站內討論集中' : '站內小型熱點';
  }

  function candidateStrengthClass(strength) {
    return strength === 'strong' ? 'candidate-topic-card--strong' : 'candidate-topic-card--candidate';
  }

  function findExternalMatches(topic, externalEvents) {
    const keywords = Array.isArray(topic?.keywords) ? topic.keywords.filter(Boolean) : [];
    if (!keywords.length || !Array.isArray(externalEvents)) return [];
    return externalEvents.filter((event) => {
      const haystack = `${event.title || ''} ${event.category || ''}`;
      return keywords.some((keyword) => haystack.includes(keyword));
    });
  }

  function candidateOperationEvidenceText(item) {
    const sourceCount = safeNum(item?.sourceCount);
    const accountCount = safeNum(item?.accountCount);
    const eventCount = safeNum(item?.eventCount);

    if (item?.kind === 'external_anchor') {
      if (sourceCount >= 10 && accountCount >= 1000) {
        return '站內同時有大量帳號與多個來源參與，但還缺重複話術與短時間同步證據';
      }
      if (sourceCount >= 2 && eventCount >= 100) {
        return '多個來源出現相關討論，仍需比對重複話術與同步時間';
      }
      return '目前只有新聞時間與站內關鍵字可對照';
    }

    if (sourceCount >= 10 && accountCount >= 1000) {
      return '站內高熱且來源分散，待比對重複話術與同步時間';
    }
    if (sourceCount >= 2) {
      return '站內有多個來源參與，尚未判定操作來源';
    }
    return '站內熱點，尚未判定操作來源';
  }

  function renderCandidateTopics(container, topics, externalEvents = []) {
    if (!container) return;
    const candidateDate = (item) => {
      if (item?.displayDate) return item.displayDate;
      if (item?.dateRange?.start) return item.dateRange.start;
      if (Array.isArray(item?.topDays) && item.topDays.length) return item.topDays[0].date || '';
      return '';
    };
    const sortByDate = (a, b) => {
      const aDate = candidateDate(a);
      const bDate = candidateDate(b);
      if (aDate && bDate && aDate !== bDate) return aDate.localeCompare(bDate);
      if (aDate && !bDate) return -1;
      if (!aDate && bDate) return 1;
      return safeNum(b.eventCount) - safeNum(a.eventCount);
    };
    const items = (Array.isArray(topics) ? topics : [])
      .filter((item) => item && item.title)
      .sort(sortByDate);

    if (!items.length) {
      container.innerHTML = '<p class="empty-state">目前沒有達到公開門檻的候選議題。</p>';
      return;
    }

    const groups = [
      {
        kind: 'external_anchor',
        title: '新聞事件可對照的討論',
        note: '依日期列出最多 10 件。這些只表示新聞時間與站內關鍵字相近；是否有人刻意帶風向，還需要重複話術、短時間同步等證據。'
      },
      {
        kind: 'community_native',
        title: '站內自行升溫的討論',
        note: '依日期列出最多 6 件。這些話題主要是站內自己燒起來，不一定有對應新聞。'
      }
    ];

    container.innerHTML = groups.map((group) => {
      const limit = group.kind === 'external_anchor' ? 10 : 6;
      const groupItems = items
        .filter((item) => item.kind === group.kind)
        .sort((a, b) => safeNum(b.eventCount) - safeNum(a.eventCount))
        .slice(0, limit)
        .sort(sortByDate);
      if (!groupItems.length) return '';
      const cards = groupItems.map((item) => {
        const matches = findExternalMatches(item, externalEvents);
        const displayDate = candidateDate(item);
        const dateRange = item.dateRange && item.dateRange.start && item.dateRange.end && item.dateRange.start !== item.dateRange.end
          ? `${formatDateLabel(item.dateRange.start)} - ${formatDateLabel(item.dateRange.end || item.dateRange.start)}`
          : displayDate ? formatDateLabel(displayDate) : '日期不足';
        const keywords = Array.isArray(item.keywords)
          ? item.keywords.slice(0, 6).map((keyword) => `<span class="hint-tag">${escapeHtml(keyword)}</span>`).join('')
          : '';
        const externalText = item.kind === 'external_anchor'
          ? (matches.length ? `${formatNumber(matches.length)} 則新聞可對照` : '有新聞日期可參考')
          : '站內討論';
        const evidenceText = candidateOperationEvidenceText(item);
        const eventText = safeNum(item.eventCount) > 0
          ? `${formatNumber(item.eventCount)} 次封鎖/檢舉`
          : '已出現相關討論';

        return `<article class="candidate-topic-card ${candidateStrengthClass(item.strength)}">
          <header class="candidate-topic-card__header">
            <span class="candidate-topic-card__kind">${escapeHtml(candidateKindLabel(item.kind))}</span>
            <span class="candidate-topic-card__strength">${escapeHtml(candidateStrengthLabel(item.strength, item.kind))}</span>
          </header>
          <h3>${escapeHtml(item.title || '')}</h3>
          <p>${escapeHtml(item.note || '')}</p>
          <dl class="candidate-topic-card__metrics">
            <div><dt>站內熱度</dt><dd>${escapeHtml(eventText)}</dd></div>
            <div><dt>時間</dt><dd>${escapeHtml(dateRange)}</dd></div>
            <div><dt>對照方式</dt><dd>${escapeHtml(externalText)}</dd></div>
            <div><dt>操作跡象</dt><dd>${escapeHtml(evidenceText)}</dd></div>
          </dl>
          ${keywords ? `<div class="candidate-topic-card__keywords">${keywords}</div>` : ''}
        </article>`;
      }).join('');

      return `<div class="candidate-topic-group">
        <div class="candidate-topic-group__heading">
          <h3>${escapeHtml(group.title)}</h3>
          <p>${escapeHtml(group.note)}</p>
        </div>
        <div class="candidate-topic-grid">${cards}</div>
      </div>`;
    }).join('');
  }

  function renderReportCategoryTree(container, tree, overview = {}) {
    const nodes = Array.isArray(tree) ? tree : [];
    if (!nodes.length) return false;

    const colors = ['#2563eb', '#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#14b8a6'];
    const excludedIds = new Set(['spam', 'flow-answer']);
    const visibleNodes = nodes.filter((node) => !excludedIds.has(node.id));
    const excludedNodes = nodes.filter((node) => excludedIds.has(node.id) && safeNum(node.eventCount) > 0);
    const visibleSlices = visibleNodes.flatMap((node) => {
      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length) {
        return children
          .filter((child) => safeNum(child.eventCount) > 0)
          .map((child) => ({
            ...child,
            parentLabel: safeString(node.label || '', 120)
          }));
      }
      return [{
        ...node,
        parentLabel: ''
      }];
    });
    const visibleEventCount = visibleSlices.reduce((sum, node) => sum + safeNum(node.eventCount), 0);
    const rawEventCount = nodes.reduce((sum, node) => sum + safeNum(node.eventCount), 0);
    const reportEventCount = safeNum(overview.reportEventCount);
    const totalEventCount = safeNum(overview.totalEventCount);
    const reportDenominator = reportEventCount || visibleEventCount || 1;
    const totalDenominator = totalEventCount || visibleEventCount || 1;
    if (visibleEventCount <= 0) {
      container.innerHTML = '<p class="empty-state">扣除低資訊量分類後，目前沒有足夠的檢舉分類資料可呈現。</p>';
      return true;
    }
    const shareDenominator = visibleEventCount || 1;
    const pctOfShare = (count) => formatPercent((safeNum(count) / shareDenominator) * 100, 1);
    const pctOfTotal = (count) => formatPercent((safeNum(count) / totalDenominator) * 100, 1);
    const renderMeta = (node) => `${formatNumber(node.eventCount)} 件 · ${pctOfShare(node.eventCount)}`;
    const pointOnCircle = (cx, cy, r, angle) => {
      const rad = (angle - 90) * Math.PI / 180;
      return {
        x: cx + (r * Math.cos(rad)),
        y: cy + (r * Math.sin(rad))
      };
    };
    const piePath = (cx, cy, r, startAngle, endAngle) => {
      const start = pointOnCircle(cx, cy, r, endAngle);
      const end = pointOnCircle(cx, cy, r, startAngle);
      const largeArc = endAngle - startAngle > 180 ? 1 : 0;
      return [
        `M ${cx} ${cy}`,
        `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
        `A ${r} ${r} 0 ${largeArc} 0 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
        'Z'
      ].join(' ');
    };

    let currentAngle = 0;
    const slices = visibleSlices.map((node, index) => {
      const value = safeNum(node.eventCount);
      const angle = shareDenominator > 0 ? (value / shareDenominator) * 360 : 0;
      const startAngle = currentAngle;
      const endAngle = Math.min(360, currentAngle + angle);
      currentAngle = endAngle;
      const color = colors[index % colors.length];
      if (value <= 0) return '';
      if (angle >= 359.99) {
        return `<circle cx="100" cy="100" r="82" fill="${color}"></circle>`;
      }
      return `<path d="${piePath(100, 100, 82, startAngle, endAngle)}" fill="${color}">
        <title>${escapeHtml(displayCategoryLabel(node.label))} ${escapeHtml(renderMeta(node))}</title>
      </path>`;
    }).join('');


    const rows = visibleSlices.map((node, index) => {
      const color = colors[index % colors.length];
      const parentNote = node.parentLabel
        ? `<p class="category-pie__note">${escapeHtml(node.parentLabel)} · 占全部事件 ${escapeHtml(pctOfTotal(node.eventCount))}</p>`
        : `<p class="category-pie__note">占全部事件 ${escapeHtml(pctOfTotal(node.eventCount))}</p>`;
      return `<li class="category-pie__legend-row">
        <div class="category-pie__legend-main">
          <span class="category-pie__dot" style="background:${color}"></span>
          <span class="category-pie__label">${escapeHtml(displayCategoryLabel(node.label))}</span>
          <span class="category-pie__meta">${escapeHtml(renderMeta(node))}</span>
        </div>
        ${parentNote}
      </li>`;
    }).join('');
    const excludedNote = excludedNodes.length
      ? `<p class="category-pie-excluded">已排除低資訊量分類：${excludedNodes.map((node) => `${escapeHtml(node.label || '')} ${formatNumber(node.eventCount)} 件`).join('、')}。原始檢舉分類合計 ${formatNumber(rawEventCount)} 件。</p>`
      : '';

    container.innerHTML = `<div class="category-pie-wrap">
      <div class="category-pie-summary">
        <span>主要檢舉子分類合計</span>
        <strong>${formatNumber(visibleEventCount)}</strong>
        <span>件，占檢舉事件 ${formatPercent((visibleEventCount / reportDenominator) * 100, 1)}；占全部事件 ${formatPercent((visibleEventCount / totalDenominator) * 100, 1)}</span>
      </div>
      <div class="category-pie-layout">
        <div class="category-pie-chart">
          <svg viewBox="0 0 200 200" role="img" aria-label="檢舉分類圓餅圖">
            ${slices}
            <circle cx="100" cy="100" r="82" fill="none" stroke="#fff" stroke-width="1"></circle>
          </svg>
        </div>
        <ul class="category-pie__legend">${rows}</ul>
      </div>
      ${excludedNote}
    </div>`;
    return true;
  }

  function renderReportCategories(container, categories, overview = {}, categoryTree = []) {
    if (!container) return;
    if (renderReportCategoryTree(container, categoryTree, overview)) return;
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
    const categoryEventCount = items.reduce((sum, cat) => sum + safeNum(cat.eventCount), 0);
    const reportEventCount = safeNum(overview.reportEventCount);
    const totalEventCount = safeNum(overview.totalEventCount);
    const reportDenominator = reportEventCount || categoryEventCount || 1;
    const totalDenominator = totalEventCount || categoryEventCount || 1;
    const normalized = items.map((cat, index) => {
      const eventCount = safeNum(cat.eventCount);
      const accountCount = safeNum(cat.accountCount);
      const allEventPct = totalEventCount > 0
        ? Number(((eventCount / totalEventCount) * 100).toFixed(1))
        : safeNum(cat.sharePct);
      const reportPct = reportEventCount > 0
        ? Number(((eventCount / reportEventCount) * 100).toFixed(1))
        : safeNum(cat.sharePct);
      return {
        color: colors[index % colors.length],
        label: escapeHtml(displayCategoryLabel(cat.label)),
        pct: allEventPct,
        reportPct,
        eventCount,
        accountCount,
        arcLength: (Math.max(reportPct, 0) / 100) * circumference
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
      <span class="donut-legend-pct">${formatPercent(cat.reportPct)} 檢舉</span>
      <span class="donut-legend-count">${formatNumber(cat.eventCount)} 事件</span>
      <span class="donut-legend-count donut-legend-count--muted">${formatPercent(cat.pct)} 全部</span>
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
          <text x="${cx}" y="88" text-anchor="middle" class="donut-center-label">檢舉分類</text>
          <text x="${cx}" y="108" text-anchor="middle" class="donut-center-value">${formatNumber(categoryEventCount)}</text>
          <text x="${cx}" y="126" text-anchor="middle" class="donut-center-note">占檢舉 ${formatPercent((categoryEventCount / reportDenominator) * 100, 1)}</text>
          <text x="${cx}" y="140" text-anchor="middle" class="donut-center-note">占全部 ${formatPercent((categoryEventCount / totalDenominator) * 100, 1)}</text>
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
    PLATFORM_VERSION,
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
    renderHeroDataSentence,
    renderStatCards,
    renderKeyInsights,
    renderTrendChart,
    renderTrendReadout,
    renderCandidateTopics,
    renderNarratives,
    renderReportCategories,
    toggleMockMode,
    uploadPlatformJson
  };
})();
