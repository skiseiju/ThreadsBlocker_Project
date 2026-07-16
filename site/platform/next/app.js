(function () {
  const API_BASE = 'https://threadsblocker-bug-admin.skiseiju.workers.dev';
  const OVERVIEW_URL = `${API_BASE}/api/v1/platform/overview?days=90&top=24`;
  const EVENTS_URL = `${API_BASE}/api/v1/platform/political-events?days=90&limit=300`;

  const els = {
    dataRange: document.getElementById('dataRange'),
    judgementTitle: document.getElementById('judgementTitle'),
    judgementDetail: document.getElementById('judgementDetail'),
    judgementBadge: document.getElementById('judgementBadge'),
    kpiWeekEvents: document.getElementById('kpiWeekEvents'),
    kpiWeekDelta: document.getElementById('kpiWeekDelta'),
    kpiPeakEvents: document.getElementById('kpiPeakEvents'),
    kpiPeakDate: document.getElementById('kpiPeakDate'),
    kpiConcentration: document.getElementById('kpiConcentration'),
    kpiConcentrationNote: document.getElementById('kpiConcentrationNote'),
    kpiCrossBlocked: document.getElementById('kpiCrossBlocked'),
    sourceConcentrationText: document.getElementById('sourceConcentrationText'),
    sourceConcentrationBar: document.getElementById('sourceConcentrationBar'),
    shortDiffusionText: document.getElementById('shortDiffusionText'),
    shortDiffusionBar: document.getElementById('shortDiffusionBar'),
    pushExplanation: document.getElementById('pushExplanation'),
    spamShare: document.getElementById('spamShare'),
    categoryBars: document.getElementById('categoryBars'),
    topicCards: document.getElementById('topicCards')
  };

  function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function text(value, fallback = '') {
    const valueText = String(value ?? '').trim();
    return valueText || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function formatNumber(value) {
    return num(value).toLocaleString('zh-TW');
  }

  function formatPercent(value, digits = 1) {
    return `${num(value).toFixed(digits)}%`;
  }

  function formatDate(value) {
    const day = String(value ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.replaceAll('-', '/') : '--';
  }

  function eventCount(day) {
    return num(day?.total_event_count ?? day?.totalEventCount ?? day?.eventCount ?? day?.count);
  }

  function dayKey(day) {
    return String(day?.day_key ?? day?.dayKey ?? day?.date ?? '').slice(0, 10);
  }

  function setEmpty(el, message) {
    if (!el) return;
    el.innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  function normalizeEvent(row) {
    const date = String(row?.date ?? row?.event_date ?? '').slice(0, 10);
    const title = text(row?.title ?? row?.headline);
    if (!date || !title) return null;
    return { date, title };
  }

  function normalizeDailyTrend(data) {
    return (Array.isArray(data?.dailyTrend) ? data.dailyTrend : [])
      .map((day) => ({ date: dayKey(day), total: eventCount(day) }))
      .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day.date))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function getSignals(data) {
    return data?.signals || {};
  }

  function getSourceConcentration(data) {
    const signals = getSignals(data);
    return num(
      signals.sourceConcentrationPct
      ?? data?.sourceConcentrationPct
      ?? data?.credibility?.sourceConcentrationPct
    );
  }

  function getShortDiffusion(data) {
    const signals = getSignals(data);
    return num(signals.shortTermDiffusionPct ?? data?.shortTermDiffusionPct);
  }

  function getCrossBlocked(data) {
    const signals = getSignals(data);
    return num(
      signals.crossBlockedAccountCount
      ?? signals.multiObserverAccountCount
      ?? signals.coordinatedAccountEstimate
      ?? data?.overview?.crossBlockedAccountCount
      ?? data?.overview?.multiObserverAccountCount
      ?? data?.crossBlockedAccountCount
    );
  }

  function getDateRange(data, trend) {
    const start = data?.dateRange?.start || trend[0]?.date || '';
    const end = data?.dateRange?.end || trend[trend.length - 1]?.date || '';
    if (!start || !end) return '資料區間尚未形成。';
    return `資料區間：${formatDate(start)} 至 ${formatDate(end)}。`;
  }

  function sumDays(days) {
    return days.reduce((sum, day) => sum + day.total, 0);
  }

  function pctDelta(current, previous) {
    if (previous <= 0 && current > 0) return 100;
    if (previous <= 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  function strongestDay(days) {
    return days.reduce((peak, day) => (day.total > peak.total ? day : peak), { date: '', total: 0 });
  }

  function classifyWeek(delta) {
    if (delta > 5) return { label: '升溫', className: 'badge-up', verb: '上升' };
    if (delta < -5) return { label: '降溫', className: 'badge-down', verb: '下降' };
    return { label: '持平', className: 'badge-neutral', verb: '持平' };
  }

  function renderJudgement(trend, events) {
    if (trend.length < 7) {
      els.judgementTitle.textContent = '近 7 日資料不足，暫不產生週判讀。';
      els.judgementDetail.textContent = '需要至少 7 天趨勢資料才能比較本週與前週。';
      els.judgementBadge.textContent = '資料不足';
      els.judgementBadge.className = 'badge badge-neutral';
      return;
    }

    const last7 = trend.slice(-7);
    const prev7 = trend.slice(-14, -7);
    const current = sumDays(last7);
    const previous = sumDays(prev7);
    const delta = pctDelta(current, previous);
    const weekPeak = strongestDay(last7);
    const matchedEvent = events.find((event) => event.date === weekPeak.date);
    const state = classifyWeek(delta);
    const eventPhrase = matchedEvent ? `，同日政治事件為「${matchedEvent.title}」` : '';

    els.judgementTitle.textContent = `近 7 日事件量較前 7 日${state.verb} ${formatPercent(Math.abs(delta))}。`;
    els.judgementDetail.textContent = `本週峰值在 ${formatDate(weekPeak.date)}，共 ${formatNumber(weekPeak.total)} 件${eventPhrase}。`;
    els.judgementBadge.textContent = state.label;
    els.judgementBadge.className = `badge ${state.className}`;
  }

  function renderKpis(data, trend) {
    const last7 = trend.slice(-7);
    const prev7 = trend.slice(-14, -7);
    const current = sumDays(last7);
    const previous = sumDays(prev7);
    const delta = pctDelta(current, previous);
    const peak = strongestDay(trend);
    const concentration = getSourceConcentration(data);

    els.kpiWeekEvents.textContent = formatNumber(current);
    els.kpiWeekDelta.textContent = `${delta >= 0 ? '↑' : '↓'} ${formatPercent(Math.abs(delta))}，前 7 日 ${formatNumber(previous)} 件`;
    els.kpiPeakEvents.textContent = formatNumber(peak.total);
    els.kpiPeakDate.textContent = peak.date ? `${formatDate(peak.date)} 的總事件量` : '尚無日期資料';
    els.kpiConcentration.textContent = formatPercent(concentration);
    els.kpiConcentrationNote.textContent = concentration > 20
      ? '偏高：此值也反映樣本偏差。'
      : '未超過 20%；此值也反映樣本偏差。';
    els.kpiCrossBlocked.textContent = formatNumber(getCrossBlocked(data));
  }

  function renderPush(data) {
    const concentration = getSourceConcentration(data);
    const diffusion = getShortDiffusion(data);
    els.sourceConcentrationText.textContent = `${formatPercent(concentration)}${concentration > 20 ? '，偏高' : ''}`;
    els.shortDiffusionText.textContent = formatPercent(diffusion);
    els.sourceConcentrationBar.style.width = `${Math.min(100, Math.max(0, concentration))}%`;
    els.shortDiffusionBar.style.width = `${Math.min(100, Math.max(0, diffusion))}%`;
    els.pushExplanation.textContent = concentration > 20
      ? '來源集中度偏高，代表本期樣本容易受少數觀測來源影響；解讀話題放大時需要更保守。'
      : '來源集中度未達偏高門檻；短期擴散度可用來觀察同一類內容是否在短時間內快速增加。';
  }

  function categoryLabel(row) {
    return text(row?.label ?? row?.category ?? row?.name, '未分類');
  }

  function categoryCount(row) {
    return num(row?.eventCount ?? row?.event_count ?? row?.count);
  }

  function categoryShare(row, total) {
    return num(row?.sharePct ?? row?.share_pct) || (total > 0 ? (categoryCount(row) / total) * 100 : 0);
  }

  function renderCategories(data) {
    const categories = Array.isArray(data?.reportCategories) ? data.reportCategories : [];
    if (!categories.length) {
      els.spamShare.textContent = '垃圾訊息占比：目前沒有分類資料。';
      setEmpty(els.categoryBars, '目前沒有可呈現的檢舉分類資料。');
      return;
    }

    const total = categories.reduce((sum, row) => sum + categoryCount(row), 0);
    const spam = categories.find((row) => categoryLabel(row).includes('垃圾'));
    els.spamShare.textContent = spam
      ? `垃圾訊息占比 ${formatPercent(categoryShare(spam, total))}，單獨列出，不混入下方橫條圖。`
      : '垃圾訊息占比：本期分類資料未提供垃圾訊息類別。';

    const rows = categories
      .filter((row) => !categoryLabel(row).includes('垃圾'))
      .sort((a, b) => categoryCount(b) - categoryCount(a));
    const max = Math.max(...rows.map(categoryCount), 1);
    els.categoryBars.innerHTML = rows.map((row) => {
      const label = categoryLabel(row);
      const count = categoryCount(row);
      return `
        <div class="bar-row">
          <span class="bar-label">${escapeHtml(label)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, (count / max) * 100).toFixed(1)}%"></span></span>
          <span class="bar-value">${formatNumber(count)} 件</span>
        </div>`;
    }).join('') || '<div class="empty">扣除垃圾訊息後，沒有其他分類可呈現。</div>';
  }

  function getActivityThreshold(eventCount) {
    const thresholds = [100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    let matched = null;
    for (const threshold of thresholds) {
      if (eventCount >= threshold) {
        matched = threshold;
      }
    }
    return matched;
  }

  function buildTopicTimeSeries(data) {
    const dailyTrend = normalizeDailyTrend(data);
    const topicTimeSeries = data?.topicTimeSeries;
    if (Array.isArray(topicTimeSeries)) {
      return topicTimeSeries;
    }
    return [];
  }

  function getTopicActivity(keywords, topicTimeSeries) {
    if (!Array.isArray(topicTimeSeries) || !Array.isArray(keywords) || !keywords.length) {
      return [];
    }
    const activity = {};
    topicTimeSeries.forEach((entry) => {
      const date = entry?.date || '';
      if (!date) return;
      if (!Array.isArray(entry?.topics)) return;
      const count = entry.topics.reduce((sum, topic) => {
        const label = String(topic?.label ?? '').toLowerCase();
        const matchesKeyword = keywords.some((kw) => label.includes(String(kw ?? '').toLowerCase()));
        return sum + (matchesKeyword ? num(topic?.count) : 0);
      }, 0);
      if (count > 0) {
        activity[date] = (activity[date] || 0) + count;
      }
    });
    return Object.entries(activity)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function renderSparkline(activity) {
    if (!activity.length) return '';
    const width = 170;
    const height = 40;
    const padX = 8;
    const padY = 6;
    const max = Math.max(...activity.map((p) => p.count), 1);
    const points = activity.map((point, index) => {
      const x = padX + ((width - padX * 2) * index) / Math.max(1, activity.length - 1);
      const y = height - padY - ((height - padY * 2) * point.count) / max;
      return { ...point, x, y };
    });
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const peakPoint = points.reduce((peak, p) => (p.count > peak.count ? p : peak), points[0]);
    const circle = `<circle cx="${peakPoint.x.toFixed(1)}" cy="${peakPoint.y.toFixed(1)}" r="2.5" fill="#d14343"></circle>`;
    return `
      <svg class="topic-sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
        <path d="${path}" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        ${circle}
      </svg>`;
  }

  function classifySparklinePattern(activity) {
    if (!activity.length) return '每日分布資料不足';
    const activeDays = activity.length;
    if (activeDays >= 5) return '多日持續';
    if (activeDays >= 2) return '幾天集中';
    return '單日爆發';
  }

  function getTopicSeries(card, topicTimeSeries) {
    const keywords = Array.isArray(card?.keywords) ? card.keywords.slice(0, 8) : [];
    const fromSeries = getTopicActivity(keywords, topicTimeSeries);
    if (fromSeries.length) return fromSeries;
    const topDays = Array.isArray(card?.topDays) ? card.topDays : [];
    return topDays
      .map((d) => ({ date: d?.date || '', count: num(d?.eventCount ?? d?.count) }))
      .filter((d) => d.date && d.count > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function buildConclusion(verdict, stats, thresholds) {
    const high = num(thresholds?.highSignalScore) || 65;
    const minObservers = num(thresholds?.coordinationHighObserverMin) || 3;
    const maxConcentration = num(thresholds?.coordinationMaxConcentration) || 60;
    const { score, observers, concentration } = stats;
    if (/協調訊號偏高/.test(verdict)) {
      return `${formatNumber(observers)} 筆來源貼文回報同一話題的封鎖或檢舉；訊號強、來源較分散，行為模式呈現放大跡象。`;
    }
    if (/協調訊號低/.test(verdict)) {
      return '活動零星、訊號弱，看起來像自然討論。';
    }
    if (score >= high && concentration > maxConcentration) {
      return `重複跡象強，但 ${formatPercent(concentration)} 的活動集中在同一個來源——可能是個案，還不能算集體協調。`;
    }
    if (score >= high && observers < minObservers) {
      return `重複跡象強，但只有 ${formatNumber(observers)} 筆來源貼文回報，跨來源驗證還不夠。`;
    }
    if (score > 0) {
      return `重複跡象中等，證據還不足以下判斷，持續觀察。`;
    }
    return '資料還在累積，暫無足夠證據判讀。';
  }

  function describeSignalLevel(score, thresholds) {
    const high = num(thresholds?.coordinationHighScore) || num(thresholds?.highSignalScore) || 60;
    const medium = num(thresholds?.mediumSignalScore) || 45;
    if (score >= high) return '重複跡象強';
    if (score >= medium) return '重複跡象中等';
    return '重複跡象弱';
  }

  function buildStatChips(stats, thresholds) {
    const chips = [];
    if (stats.score > 0) chips.push(describeSignalLevel(stats.score, thresholds));
    if (stats.observers > 0) chips.push(`${formatNumber(stats.observers)} 筆來源貼文`);
    if (stats.concentration > 0) chips.push(`最大來源占 ${formatPercent(stats.concentration)}`);
    const threshold = getActivityThreshold(stats.eventCount);
    if (threshold) chips.push(`超過 ${formatNumber(threshold)} 次活動`);
    return chips;
  }

  function normalizeTopicCard(card, topicTimeSeries, thresholds, samplePublicationMode = 'description') {
    const verdict = text(card?.verdict ?? card?.coordinationBand ?? card?.signalBand ?? card?.band ?? card?.status, '觀察中');
    const title = text(card?.title ?? card?.canonical_label ?? card?.name ?? card?.topic, '未命名話題');
    const score = num(card?.coordinationScore);
    const observers = num(card?.crossObserverCount ?? card?.observerCount ?? card?.sourceCount ?? card?.source_count);
    const concentration = num(card?.sourceConcentrationPct);
    const eventCount = num(card?.eventCount ?? card?.event_count);
    const stats = { score, observers, concentration, eventCount };
    const activity = getTopicSeries(card, topicTimeSeries);
    const samples = samplePublicationMode === 'reviewed_text'
      ? (Array.isArray(card?.samples) ? card.samples.slice(0, 3) : []).map((s) => ({
          text: text(s?.text ?? s?.deidentified_text, ''),
          accountCount: num(s?.accountCount ?? s?.account_count),
          observerCount: num(s?.observerCount ?? s?.observer_count)
        })).filter((s) => s.text)
      : [];
    const patternDescription = samplePublicationMode === 'reviewed_text'
      ? text(card?.patternDescription ?? '', '')
      : '句型描述模式：目前僅公開聚合行為指標，不公開文字樣本。';
    return {
      title,
      summary: text(card?.summary ?? card?.note, ''),
      verdict,
      score,
      observers,
      concentration,
      conclusion: buildConclusion(verdict, stats, thresholds),
      chips: buildStatChips(stats, thresholds),
      signalLevel: describeSignalLevel(score, thresholds),
      start: card?.startDate ?? card?.start_date ?? card?.dateRange?.start ?? card?.windowStart ?? card?.window?.start ?? card?.displayDate ?? '',
      end: card?.endDate ?? card?.end_date ?? card?.dateRange?.end ?? card?.windowEnd ?? card?.window?.end ?? '',
      sparkline: renderSparkline(activity),
      pattern: classifySparklinePattern(activity),
      coordinationBand: verdict,
      samples,
      patternDescription
    };
  }

  function fallbackTopicCards(data) {
    const candidateTopics = Array.isArray(data?.candidateTopics) ? data.candidateTopics : [];
    const topNarratives = Array.isArray(data?.topNarratives) ? data.topNarratives : [];
    return [...candidateTopics, ...topNarratives].slice(0, 8).map((item) => {
      const title = item?.title ?? item?.name ?? item?.topic;
      const keywords = Array.isArray(item?.keywords) && item.keywords.length
        ? item.keywords
        : [title].filter(Boolean);
      return {
        title,
        verdict: '觀察中',
        narrativeCount: item?.narrativeCount,
        eventCount: item?.eventCount,
        sourceCount: item?.sourceCount,
        keywords,
        topDays: item?.topDays,
        note: item?.note ?? item?.summary,
        dateRange: item?.dateRange,
        displayDate: item?.displayDate,
        startDate: item?.startDate,
        endDate: item?.endDate
      };
    });
  }

  function badgeForVerdict(verdict) {
    if (/協調訊號偏高/i.test(verdict)) return { label: '協調訊號偏高', className: 'badge-high' };
    if (/協調訊號低/i.test(verdict)) return { label: '協調訊號低', className: 'badge-normal' };
    if (/異常高|high|高信號/i.test(verdict)) return { label: '異常高', className: 'badge-high' };
    if (/未見|normal|low|低信號/i.test(verdict)) return { label: '未見異常', className: 'badge-normal' };
    return { label: '觀察中', className: 'badge-watch' };
  }

  function getCoordinationPriority(verdict) {
    if (/協調訊號偏高/i.test(verdict)) return 0;
    if (/觀察中/i.test(verdict)) return 1;
    if (/協調訊號低/i.test(verdict)) return 2;
    return 1;
  }

  function renderTopics(data) {
    const topicTimeSeries = buildTopicTimeSeries(data);
    const rawCards = Array.isArray(data?.topicCards) && data.topicCards.length
      ? data.topicCards
      : fallbackTopicCards(data);
    if (!rawCards.length) {
      setEmpty(els.topicCards, '目前 API 尚未提供 topicCards、candidateTopics 或 topNarratives。');
      return;
    }

    const normalizedCards = rawCards.map((card) => normalizeTopicCard(card, topicTimeSeries, data?.thresholds, data?.samplePublicationMode));
    const sortedCards = normalizedCards.sort((a, b) => {
      const priorityA = getCoordinationPriority(a.verdict);
      const priorityB = getCoordinationPriority(b.verdict);
      return priorityA - priorityB;
    });
    const isSingleSourceDominated = (card) => /觀察中/.test(card.verdict)
      && (card.concentration > 60 || card.observers < 3);
    const fullCards = sortedCards.filter((card) => getCoordinationPriority(card.verdict) < 2 && !isSingleSourceDominated(card));
    const dominatedCards = sortedCards.filter(isSingleSourceDominated);
    const lowCards = sortedCards.filter((card) => getCoordinationPriority(card.verdict) === 2);

    const fullHtml = fullCards.map((card) => {
      const badge = badgeForVerdict(card.verdict);
      const start = card.start && card.start !== card.end ? formatDate(card.start) : '';
      const end = card.end ? formatDate(card.end) : '';
      const single = formatDate(card.start || card.end);
      const dateText = start && end ? `${start} - ${end}` : (single || '觀測時間累積中');
      return `
        <article class="topic-card">
          <div class="topic-top">
            <h3 class="topic-title">${escapeHtml(card.title)}</h3>
            <span class="badge ${badge.className}">${badge.label}</span>
          </div>
          <p class="topic-conclusion">${escapeHtml(card.conclusion)}</p>
          ${card.chips.length ? `<div class="stat-chips">${card.chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join('')}</div>` : ''}
          ${card.samples.length ? `
            <div class="samples-section">
              <p class="samples-title">重複出現的文字樣本</p>
              ${card.samples.map((sample) => {
                const text = sample?.text ?? '';
                const truncated = text.length > 160 ? text.slice(0, 160) + '…' : text;
                const accountCount = num(sample?.accountCount);
                const observerCount = num(sample?.observerCount);
                return `
                  <blockquote class="sample-item">
                    <p>${escapeHtml(truncated)}</p>
                    <p class="sample-meta">帳號觀測筆數 ${formatNumber(accountCount)} · 來源貼文數 ${formatNumber(observerCount)}</p>
                  </blockquote>`;
              }).join('')}
            </div>
          ` : (card.patternDescription ? `<p class="pattern-note">話術型態：${escapeHtml(card.patternDescription)}</p>` : '')}
          ${card.sparkline}
          ${card.sparkline ? `<p class="sparkline-label">${escapeHtml(card.pattern)}</p>` : ''}
          ${card.summary ? `<p class="topic-summary">${escapeHtml(card.summary)}</p>` : ''}
          <p class="topic-date">${escapeHtml(dateText)}</p>
        </article>`;
    }).join('');

    const dominatedHtml = dominatedCards.length ? `
      <div class="topic-lowlist">
        <p class="topic-lowlist__title">樣本由單一來源主導——暫不判讀</p>
        ${dominatedCards.map((card) => `
          <div class="topic-lowlist__row">
            <span>${escapeHtml(card.title)}</span>
            <span class="topic-lowlist__meta">${card.signalLevel} · 來源貼文數 ${formatNumber(card.observers)} · 集中 ${formatPercent(card.concentration)}</span>
          </div>`).join('')}
      </div>` : '';

    const lowHtml = lowCards.length ? `
      <div class="topic-lowlist">
        <p class="topic-lowlist__title">訊號低——看起來像自然討論</p>
        ${lowCards.map((card) => `
          <div class="topic-lowlist__row">
            <span>${escapeHtml(card.title)}</span>
            <span class="topic-lowlist__meta">${card.signalLevel} · 來源貼文數 ${formatNumber(card.observers)}</span>
          </div>`).join('')}
      </div>` : '';

    els.topicCards.innerHTML = fullHtml + dominatedHtml + lowHtml;
  }

  function renderRepeatedPhrases(data) {
    const host = document.getElementById('repeatedPhrases');
    if (!host) return;
    const rows = data?.samplePublicationMode === 'reviewed_text'
      ? (Array.isArray(data?.repeatedPhrases) ? data.repeatedPhrases : []).map((s) => ({
      text: text(s?.text ?? s?.deidentified_text, ''),
      accountCount: num(s?.accountCount ?? s?.account_count),
      observerCount: num(s?.observerCount ?? s?.observer_count)
      })).filter((s) => s.text)
      : [];
    const section = host.closest('section');
    if (!rows.length) {
      if (section) section.hidden = true;
      return;
    }
    if (section) section.hidden = false;
    host.innerHTML = rows.slice(0, 8).map((s) => {
      const truncated = s.text.length > 160 ? s.text.slice(0, 160) + '…' : s.text;
      return `
        <blockquote class="sample-item">
          <p>${escapeHtml(truncated)}</p>
          <p class="sample-meta">帳號觀測筆數 ${formatNumber(s.accountCount)} · 來源貼文數 ${formatNumber(s.observerCount)}</p>
        </blockquote>`;
    }).join('');
  }

  function renderAll(data, events) {
    const trend = normalizeDailyTrend(data);
    const normalizedEvents = events.map(normalizeEvent).filter(Boolean);
    els.dataRange.textContent = getDateRange(data, trend);
    renderJudgement(trend, normalizedEvents);
    renderKpis(data, trend);
    renderPush(data);
    renderCategories(data);
    renderTopics(data);
    renderRepeatedPhrases(data);
  }

  function renderFailure(error) {
    const message = `公開 API 暫時無法讀取：${error.message}`;
    els.dataRange.textContent = message;
    els.judgementTitle.textContent = '資料讀取失敗，暫不產生本週判讀。';
    els.judgementDetail.textContent = '請稍後再試；各區塊已改為空狀態。';
    els.judgementBadge.textContent = '無資料';
    els.judgementBadge.className = 'badge badge-neutral';
    ['categoryBars', 'topicCards'].forEach((key) => setEmpty(els[key], message));
    els.kpiWeekEvents.textContent = '--';
    els.kpiWeekDelta.textContent = '無可比較資料';
    els.kpiPeakEvents.textContent = '--';
    els.kpiPeakDate.textContent = '無峰值資料';
    els.kpiConcentration.textContent = '--';
    els.kpiConcentrationNote.textContent = '無來源集中度資料。';
    els.kpiCrossBlocked.textContent = '--';
    els.sourceConcentrationText.textContent = '--';
    els.shortDiffusionText.textContent = '--';
    els.sourceConcentrationBar.style.width = '0';
    els.shortDiffusionBar.style.width = '0';
    els.pushExplanation.textContent = '資料讀取失敗，暫不判讀來源集中與擴散。';
    els.spamShare.textContent = '垃圾訊息占比：資料讀取失敗。';
  }

  async function init() {
    try {
      const [overview, eventPayload] = await Promise.all([
        fetchJson(OVERVIEW_URL),
        fetchJson(EVENTS_URL).catch(() => [])
      ]);
      const overviewData = overview?.data || overview || {};
      const events = Array.isArray(eventPayload) ? eventPayload : (eventPayload.events || eventPayload.data || []);
      renderAll(overviewData, events);
    } catch (error) {
      renderFailure(error);
    }
  }

  init();
}());
