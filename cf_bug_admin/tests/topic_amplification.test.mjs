import assert from "node:assert/strict";
import test from "node:test";

import {
  isReportTaxonomyLabel,
  normalizeTopicHints,
  normalizeTopicLabel,
  normalizeTopicRows
} from "../src/topic_normalization.mjs";
import {
  calculatePerTopicCoordination,
  BANNED_COPY_TERMS,
  SAMPLE_MIN_ACCOUNTS,
  SAMPLE_MIN_OBSERVERS,
  buildDynamicEventCandidates,
  buildPublicCandidateTopics,
  deidentifySampleText,
  passesSampleGate,
  queueEligibleTopicSamples,
  projectPublicPlatformOverview
} from "../src/index.js";
import worker from "../src/index.js";

const reportTaxonomyLabels = [
  "這是垃圾訊息",
  "垃圾訊息",
  "暴力、仇恨或剝削",
  "煽動暴力",
  "仇恨言論或象徵符號",
  "對安全構成具體威脅",
  "疑似為恐怖主義或組織犯罪",
  "詐騙或詐欺",
  "金融或投資詐騙",
  "未分類 / 流程回答",
  "否",
  "report_leaf:這是垃圾訊息",
  "report:詐騙或詐欺",
  "likes",
  "quotes",
  "reposts",
  "manual",
  "unknown"
];

const currentTopicFixture = [
  ...reportTaxonomyLabels,
  "賴清德與川普早就見過面了",
  "竟然有人不知道2020年川普及彭斯都與賴清德同場",
  "軍購",
  "國防特別條例",
  "淡江大橋",
  "淡江大橋機車道",
  "李多慧北一女制服",
  "my culture is not your costume",
  "普台高中陸籍學生",
  "台大繁星資格",
  "婦產科產檢陪診讓座",
  "準爸爸應該讓位給孕婦",
  "Meta AI 青鳥坦克",
  "史瓦帝尼",
  "台灣未來帳戶",
  "少子化育兒補助",
  "沈伯洋蔣萬安輝達用電",
  "台電 electricity",
  "蘇巧慧蘇貞昌",
  "高虹安選罷法",
  "黃國昌館長上海",
  "鄭麗文訪美",
  "顏寬恒境管",
  "新北國際田徑公開賽",
  "KAYCI 練習生",
  "國民黨青年部火箭升空",
  "總統彈劾案",
  "訪中和平框架",
  "國會外交站隊",
  "總預算國防支出",
  "台灣國際田徑公開賽",
  "北一女制服文化挪用",
  "普台高中繁星台大",
  "婦產科產檢",
  "輝達用電論戰",
  "顏寬恒最高法院",
  "鄭麗文放鳥日本自民黨",
  "黃國昌鯰魚效應",
  "蘇巧慧曠世",
  "高虹安",
  "選罷法",
  "川普說台灣",
  "軍購國防預算",
  "淡江大橋隔音牆",
  "Meta AI 魔鏡"
];

test("B1 removes report taxonomy labels from current topic fixtures", () => {
  const normalized = currentTopicFixture.map((label) => normalizeTopicLabel(label)).filter(Boolean);
  const mixedTaxonomyLabels = normalized.filter((label) => reportTaxonomyLabels.some((bad) => normalizeTopicLabel(bad) === label || isReportTaxonomyLabel(label)));

  assert.equal(mixedTaxonomyLabels.length, 0);
});

test("B1 merges known topic fragments into canonical labels", () => {
  assert.equal(normalizeTopicLabel("賴清德與川普早就見過面了"), "賴清德/川普 會面爭議");
  assert.equal(normalizeTopicLabel("竟然有人不知道2020年川普及彭斯都與賴清德同場"), "賴清德/川普 會面爭議");
  assert.equal(normalizeTopicLabel("淡江大橋機車道"), "淡江大橋交通爭議");

  const rows = normalizeTopicRows([
    { topic_label: "賴清德與川普早就見過面了", event_count: 10, source_count: 1 },
    { topic_label: "竟然有人不知道2020年川普及彭斯都與賴清德同場", event_count: 15, source_count: 2 },
    { topic_label: "這是垃圾訊息", event_count: 999, source_count: 9 }
  ]);

  assert.deepEqual(rows, [
    {
      topic_label: "賴清德/川普 會面爭議",
      event_count: 25,
      account_count: 0,
      source_count: 3
    }
  ]);
});

test("B1 normalizes dominantTopicHints fixtures without D1", () => {
  assert.deepEqual(
    normalizeTopicHints([
      { topicHint: "report_leaf:這是垃圾訊息" },
      { topicHint: "淡江大橋機車道" },
      { topicHint: "淡江大橋隔音牆" },
      { topicHint: "Meta AI 青鳥坦克" }
    ]),
    ["淡江大橋交通爭議", "Meta AI 嘲諷與測試"]
  );
});

test("B2 projects topKeywords and topicCards without changing old fields", () => {
  const projected = projectPublicPlatformOverview({
    days: 90,
    overview: {
      uploadCount: 3,
      contributorCount: 2,
      blockEventCount: 18,
      reportEventCount: 22,
      totalEventCount: 40,
      summaryTotalEventCount: 40
    },
    dailyTrend: [
      { day_key: "2026-07-01", total_event_count: 10 },
      { day_key: "2026-07-02", total_event_count: 30 }
    ],
    topicTimeSeries: [
      {
        date: "2026-07-01",
        topics: [
          { label: "這是垃圾訊息", count: 12 },
          { label: "淡江大橋機車道", count: 8 }
        ]
      },
      {
        date: "2026-07-02",
        topics: [
          { label: "淡江大橋隔音牆", count: 14 },
          { label: "Meta AI 青鳥坦克", count: 6 }
        ]
      }
    ],
    topTopics: [
      { topic_label: "這是垃圾訊息", event_count: 999, source_count: 9 },
      { topic_label: "淡江大橋機車道", event_count: 20, source_count: 3 },
      { topic_label: "淡江大橋隔音牆", event_count: 18, source_count: 2 },
      { topic_label: "Meta AI 青鳥坦克", event_count: 6, source_count: 2 }
    ],
    topNarratives: [
      {
        source_url: "https://threads.net/post/danjiang-a",
        source_text_sample: "淡江大橋機車道與隔音牆一直被重複討論！",
        top_topic_hints_json: JSON.stringify([{ topicHint: "淡江大橋機車道" }]),
        total_event_count: 20,
        unique_account_count: 4,
        avg_signal_score: 70,
        text_fingerprint: "fp-a"
      },
      {
        source_url: "https://threads.net/post/danjiang-b",
        source_text_sample: "淡江大橋機車道與隔音牆一直被重複討論！",
        top_topic_hints_json: JSON.stringify([{ topicHint: "淡江大橋隔音牆" }]),
        total_event_count: 22,
        unique_account_count: 5,
        avg_signal_score: 68,
        text_fingerprint: "fp-b"
      }
    ]
  }, 5);

  assert.equal(projected.topNarratives[0].title.includes("高相似文字敘事"), false);
  assert.deepEqual(projected.topNarratives[0].topKeywords, ["淡江大橋交通爭議"]);
  assert.deepEqual(projected.topNarratives[0].sampleFingerprints, ["fp-a", "fp-b"]);
  assert.deepEqual(projected.topNarratives[0].hintLabels, ["淡江大橋交通爭議"]);
  assert.equal(projected.topicTimeSeries.some((row) => row.topics.some((topic) => topic.label === "這是垃圾訊息")), false);
  assert.equal(projected.topicCards[0].canonical_label, "淡江大橋");
  assert.equal(projected.topicCards[0].verdict, "觀察中");
  assert.equal(projected.topicCards[0].coordinationScore, 69);
  assert.equal(projected.topicCards[0].crossObserverCount, 2);
  assert.equal(projected.topicCards[0].sourceConcentrationPct, 52.4);
  assert.equal(projected.topicCards[0].peakConcentration, 63.6);
  assert.ok(Array.isArray(projected.topicCards[0].evidence));
  assert.ok(Array.isArray(projected.topicCards[0].dailySeries));
  assert.deepEqual(projected.topicCards[0].window, { start: "2026-07-01", end: "2026-07-02" });
});

test("M5 calculates per-topic coordination without D1", () => {
  const coordination = calculatePerTopicCoordination({
    matchedSourceRows: [
      { source_url: "https://threads.net/a", total_event_count: 60, avg_signal_score: 80 },
      { source_url: "https://threads.net/b", total_event_count: 30, avg_signal_score: 70 },
      { source_url: "https://threads.net/c", total_event_count: 10, avg_signal_score: 30 }
    ],
    matchedDays: [
      { date: "2026-07-01", eventCount: 20 },
      { date: "2026-07-02", eventCount: 80 }
    ],
    eventCount: 100
  });

  assert.equal(coordination.coordinationScore, 72);
  assert.deepEqual(coordination.coordinationSignal, { weightedAverage: 72, max: 80 });
  assert.equal(coordination.crossObserverCount, 3);
  assert.equal(coordination.sourceConcentrationPct, 60);
  assert.equal(coordination.peakConcentration, 80);
  assert.equal(coordination.activeDayCount, 2);
  assert.equal(coordination.coordinationBand, "協調訊號偏高");
});

test("M5 keeps high signal in watch band when independent observers are insufficient", () => {
  const coordination = calculatePerTopicCoordination({
    matchedSourceRows: [
      { source_url: "https://threads.net/a", total_event_count: 90, avg_signal_score: 90 },
      { source_url: "https://threads.net/a", total_event_count: 10, avg_signal_score: 90 }
    ],
    matchedDays: [{ date: "2026-07-01", eventCount: 100 }],
    eventCount: 100
  });

  assert.equal(coordination.coordinationScore, 90);
  assert.equal(coordination.crossObserverCount, 1);
  assert.equal(coordination.sourceConcentrationPct, 90);
  assert.equal(coordination.peakConcentration, 100);
  assert.equal(coordination.coordinationBand, "觀察中");
});

test("M5 labels low per-topic coordination signal", () => {
  const coordination = calculatePerTopicCoordination({
    matchedSourceRows: [
      { source_url: "https://threads.net/a", total_event_count: 50, avg_signal_score: 20 },
      { source_url: "https://threads.net/b", total_event_count: 50, avg_signal_score: 30 }
    ],
    matchedDays: [
      { date: "2026-07-01", eventCount: 50 },
      { date: "2026-07-02", eventCount: 50 }
    ],
    eventCount: 100
  });

  assert.equal(coordination.coordinationScore, 25);
  assert.equal(coordination.coordinationBand, "協調訊號低");
});

test("B8 applies the account and independent-observer sample gate", () => {
  assert.equal(SAMPLE_MIN_ACCOUNTS, 10);
  assert.equal(SAMPLE_MIN_OBSERVERS, 2);
  assert.equal(passesSampleGate({ accountCount: 9, observerCount: 2 }), false);
  assert.equal(passesSampleGate({ accountCount: 10, observerCount: 1 }), false);
  assert.equal(passesSampleGate({ accountCount: 20, observerCount: 3 }), true);
});

test("B8 deidentifies handles, URLs, and phone patterns but leaves names for review", () => {
  const result = deidentifySampleText(
    "王小明說 @alice 請看 https://example.com/post，聯絡 0912-345-678 或 02-1234-5678。"
  );

  assert.equal(result, "王小明說 [帳號] 請看 [連結]，聯絡 [電話] 或 [電話]。");
  assert.equal(result.includes("王小明"), true);
});

test("B8 keeps reviewed public sample copy factual and describes sentence style", () => {
  const projected = projectPublicPlatformOverview({
    days: 14,
    overview: { totalEventCount: 40 },
    dailyTrend: [{ day_key: "2026-07-12", total_event_count: 40 }],
    topicTimeSeries: [{
      date: "2026-07-12",
      topics: [{ label: "淡江大橋", count: 40 }]
    }],
    topTopics: [{ topic_label: "淡江大橋", event_count: 40, source_count: 3 }],
    topNarratives: [],
    approvedSampleReviews: [{
      topic_id: "community-danjiang-bridge",
      deidentified_text: "淡江大橋要重視。第二句提醒大家！第三句請查證？",
      account_count: 24,
      observer_count: 3,
      status: "approved"
    }, {
      topic_id: "community-danjiang-bridge",
      deidentified_text: "pending text must stay private",
      account_count: 30,
      observer_count: 4,
      status: "pending"
    }]
  }, 5, { samplePublicationMode: "reviewed_text" });

  const card = projected.topicCards.find((item) => item.canonical_label === "淡江大橋");
  assert.ok(card);
  assert.deepEqual(card.samples, [{
    deidentified_text: "淡江大橋要重視。第二句提醒大家！第三句請查證？",
    account_count: 24,
    observer_count: 3
  }]);
  assert.match(card.patternDescription, /多句短句/);
  assert.equal(projected.thresholds.sampleMinAccounts, 10);
  assert.equal(projected.thresholds.sampleMinObservers, 2);

  const publicTemplate = JSON.stringify({
    patternDescription: card.patternDescription,
    coordinationNote: card.coordinationNote,
    note: card.note
  });
  for (const term of BANNED_COPY_TERMS) assert.equal(publicTemplate.includes(term), false);
});

test("B8 extracts recent event anchors, gives static keywords priority, and deduplicates keywords", () => {
  const candidates = buildDynamicEventCandidates([
    { event_date: "2026-07-13", title: "賴清德今天提出新方案" },
    { event_date: "2026-07-12", title: "賴清德今天提出新方案" },
    { event_date: "2026-06-28", title: "賴清德過期事件" },
    { event_date: "2026-07-12", title: "軍購政策再度引發討論" },
    { event_date: "2026-07-12", title: "地方活動公告" }
  ], undefined, "2026-07-13");

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "auto_event");
  assert.deepEqual(candidates[0].keywords, ["賴清德"]);
  assert.match(candidates[0].title, /賴清德/);
});

test("B8 projects an auto event anchor into candidateTopics and topicCards", () => {
  const projected = projectPublicPlatformOverview({
    referenceDate: "2026-07-13",
    recentPoliticalEvents: [{
      event_date: "2026-07-13",
      title: "賴清德今天提出新方案"
    }],
    overview: {},
    dailyTrend: [],
    topicTimeSeries: [],
    topTopics: [],
    topNarratives: []
  }, 5);

  const candidate = projected.candidateTopics.find((item) => item.kind === "auto_event");
  assert.ok(candidate);
  assert.equal(candidate.keywords[0], "賴清德");
  assert.ok(projected.topicCards.some((item) => item.title === candidate.title));
});

test("B8 orders candidate topics by verdict, then recent seven-day activity", () => {
  const candidates = buildPublicCandidateTopics({
    topicRows: [
      { topic_label: "史瓦帝尼", event_count: 6, source_count: 3 },
      { topic_label: "軍購", event_count: 20, source_count: 1 },
      { topic_label: "少子化", event_count: 30, source_count: 1 }
    ],
    topicTimeSeries: [{
      date: "2026-07-12",
      topics: [
        { label: "史瓦帝尼", count: 6 },
        { label: "軍購", count: 20 },
        { label: "少子化", count: 30 }
      ]
    }],
    sourceRows: [
      { source_url: "https://threads.net/eswatini-a", source_text_sample: "史瓦帝尼", total_event_count: 2, avg_signal_score: 80 },
      { source_url: "https://threads.net/eswatini-b", source_text_sample: "史瓦帝尼", total_event_count: 2, avg_signal_score: 80 },
      { source_url: "https://threads.net/eswatini-c", source_text_sample: "史瓦帝尼", total_event_count: 2, avg_signal_score: 80 },
      { source_url: "https://threads.net/defense", source_text_sample: "軍購", total_event_count: 20, avg_signal_score: 10 },
      { source_url: "https://threads.net/child", source_text_sample: "少子化", total_event_count: 30, avg_signal_score: 10 }
    ],
    referenceDate: "2026-07-13"
  });

  const external = candidates.filter((item) => item.kind === "external_anchor");
  assert.equal(external[0].id, "external-eswatini");
  assert.equal(external[0].coordinationBand, "協調訊號偏高");
  assert.equal(external[1].id, "external-child-allowance");
  assert.equal(external[2].id, "external-defense-procurement");
  assert.equal(external[1].recent7DayEventCount, 30);
  assert.equal(external[2].recent7DayEventCount, 20);
});

test("B8 queues a deidentified sample once it passes the gate", async () => {
  const inserts = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          inserts.push({ sql, values });
          return { async run() { return { meta: { changes: 1 } }; } };
        }
      };
    }
  };

  const queued = await queueEligibleTopicSamples({ DB: db }, [
    { source_url: "observer-a", source_text_sample: "軍購需要查證 @alice", unique_account_count: 7 },
    { source_url: "observer-b", source_text_sample: "軍購需要查證 @bob", unique_account_count: 7 },
    { source_url: "observer-c", source_text_sample: "軍購需要查證 @carol", unique_account_count: 7 }
  ], [{ id: "topic-defense", keywords: ["軍購"] }]);

  assert.equal(queued, 1);
  assert.equal(inserts.length, 1);
  assert.match(inserts[0].sql, /INSERT OR IGNORE INTO topic_sample_reviews/);
  assert.deepEqual(inserts[0].values.slice(0, 5), [
    "topic-defense",
    "軍購需要查證 @alice",
    "軍購需要查證 [帳號]",
    21,
    3
  ]);
});

test("B8 admin review endpoints list pending samples and record approve/reject decisions", async () => {
  const calls = [];
  const db = {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ type: "run", sql, values: statement.values });
          return { meta: { changes: 1 } };
        },
        async all() {
          calls.push({ type: "all", sql, values: statement.values });
          if (sql.includes("FROM topic_sample_reviews") && sql.includes("WHERE status = ?")) {
            return { results: [{ id: 7, topic_id: "topic-defense", status: "pending" }] };
          }
          return { results: [] };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });
          return { id: 7 };
        }
      };
      return statement;
    },
    async exec(sql) {
      calls.push({ type: "exec", sql });
    }
  };
  const env = { DB: db, ADMIN_TOKEN: "test-token" };
  const headers = { Authorization: "Bearer test-token" };

  const listResponse = await worker.fetch(new Request(
    "https://worker.test/api/v1/admin/sample-reviews?status=pending",
    { headers }
  ), env);
  assert.equal(listResponse.status, 200);
  assert.deepEqual((await listResponse.json()).data, [{ id: 7, topic_id: "topic-defense", status: "pending" }]);

  const approveResponse = await worker.fetch(new Request(
    "https://worker.test/api/v1/admin/sample-reviews/7/approve",
    { method: "POST", headers }
  ), env);
  assert.equal(approveResponse.status, 200);
  assert.equal((await approveResponse.json()).data.status, "approved");

  const rejectResponse = await worker.fetch(new Request(
    "https://worker.test/api/v1/admin/sample-reviews/7/reject",
    { method: "POST", headers }
  ), env);
  assert.equal(rejectResponse.status, 200);
  assert.equal((await rejectResponse.json()).data.status, "rejected");
  assert.equal(calls.filter((call) => call.type === "first").length, 2);
  assert.equal(calls.filter((call) => call.type === "run" && call.sql.includes("UPDATE topic_sample_reviews")).length, 2);
});
