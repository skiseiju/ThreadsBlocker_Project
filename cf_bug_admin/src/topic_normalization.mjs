const REPORT_TAXONOMY_LABELS = new Set([
  "這是垃圾訊息",
  "垃圾訊息",
  "暴力、仇恨或剝削",
  "煽動暴力",
  "仇恨言論或象徵符號",
  "對安全構成具體威脅",
  "疑似為恐怖主義或組織犯罪",
  "詐騙或詐欺",
  "金融或投資詐騙",
  "可疑或擾人的聯繫",
  "霸凌或擾人的聯繫",
  "銷售虛假商品或服務",
  "身分盜用",
  "人口販運",
  "生理或心理威脅",
  "我想減少看到這類內容",
  "是",
  "未分類 / 流程回答",
  "否",
  "likes",
  "quotes",
  "reposts",
  "manual",
  "unknown"
]);

const CANONICAL_TOPIC_RULES = [
  {
    label: "賴清德/川普 會面爭議",
    terms: ["賴清德", "川普", "特朗普", "彭斯", "同場", "見過面", "會面"]
  },
  {
    label: "軍購/國防特別條例",
    terms: ["軍購", "國防特別條例", "國防預算", "要軍購要國防"]
  },
  {
    label: "淡江大橋交通爭議",
    terms: ["淡江大橋", "機車道", "隔音牆", "螺栓"]
  },
  {
    label: "李多慧/北一女制服爭議",
    terms: ["李多慧", "北一女", "制服", "文化挪用", "my culture is not your costume"]
  },
  {
    label: "普台高中陸籍學生/繁星爭議",
    terms: ["普台高中", "陸籍學生", "繁星", "台大", "臺大", "台灣大學"]
  },
  {
    label: "婦產科產檢陪診讓座討論",
    terms: ["婦產科", "產檢", "陪診", "讓座", "孕婦", "準爸爸"]
  },
  {
    label: "Meta AI 嘲諷與測試",
    terms: ["meta ai", "meta.ai", "青鳥坦克", "魔鏡"]
  },
  {
    label: "史瓦帝尼外交事件",
    terms: ["史瓦帝尼"]
  },
  {
    label: "台灣未來帳戶/少子化津貼",
    terms: ["台灣未來帳戶", "少子化", "0-18歲", "0到18歲", "成長津貼", "育兒補助"]
  },
  {
    label: "沈伯洋/蔣萬安/輝達用電論戰",
    terms: ["沈伯洋", "蔣萬安", "輝達", "nvidia", "台電", "用電", "electricity"]
  },
  {
    label: "蘇巧慧/蘇貞昌相關攻防",
    terms: ["蘇巧慧", "蘇貞昌", "蘇巧純", "曠世"]
  },
  {
    label: "高虹安/選罷法",
    terms: ["高虹安", "選罷法"]
  },
  {
    label: "黃國昌/館長直播上海爭議",
    terms: ["黃國昌", "館長", "上海", "鯰魚效應"]
  },
  {
    label: "鄭麗文訪美爭議",
    terms: ["鄭麗文", "訪美", "放鳥日本自民黨", "川普說台灣"]
  },
  {
    label: "顏寬恒司法案",
    terms: ["顏寬恒", "境管", "逃亡風險", "貪汙", "最高法院"]
  }
];

const PERSON_TERMS = [
  "賴清德",
  "川普",
  "特朗普",
  "彭斯",
  "沈伯洋",
  "蔣萬安",
  "蘇巧慧",
  "蘇貞昌",
  "高虹安",
  "黃國昌",
  "鄭麗文",
  "顏寬恒",
  "李多慧",
  "連勝武",
  "尹乃菁"
];

const ISSUE_TERMS = [
  "軍購",
  "國防特別條例",
  "國防預算",
  "淡江大橋",
  "北一女",
  "文化挪用",
  "普台高中",
  "陸籍學生",
  "繁星",
  "婦產科",
  "產檢",
  "讓座",
  "史瓦帝尼",
  "少子化",
  "台灣未來帳戶",
  "輝達",
  "台電",
  "用電",
  "選罷法",
  "訪美",
  "境管",
  "Meta AI"
];

export function stripTopicPrefix(raw) {
  return String(raw || "")
    .trim()
    .replace(/^hashtag:/i, "")
    .replace(/^report_leaf:/i, "")
    .replace(/^report:/i, "")
    .replace(/^#/, "")
    .trim();
}

export function isReportTaxonomyLabel(raw) {
  const value = stripTopicPrefix(raw);
  return !value || REPORT_TAXONOMY_LABELS.has(value) || REPORT_TAXONOMY_LABELS.has(value.toLowerCase());
}

export function extractTopicTerms(raw) {
  const text = stripTopicPrefix(raw);
  if (!text) return [];
  return dedupeStrings([...PERSON_TERMS, ...ISSUE_TERMS].filter((term) => includesFolded(text, term)));
}

export function normalizeTopicLabel(raw) {
  const text = stripTopicPrefix(raw);
  if (isReportTaxonomyLabel(text)) return "";
  const folded = foldText(text);
  for (const rule of CANONICAL_TOPIC_RULES) {
    if (rule.terms.some((term) => folded.includes(foldText(term)))) return rule.label;
  }
  const extracted = extractTopicTerms(text);
  if (extracted.length >= 2) return extracted.slice(0, 3).join("/");
  if (extracted.length === 1) return extracted[0];
  return text.slice(0, 140);
}

export function normalizeTopicHints(rawHints, limit = 6) {
  const list = Array.isArray(rawHints) ? rawHints : [];
  return dedupeStrings(
    list
      .map((item) => {
        if (typeof item === "string") return normalizeTopicLabel(item);
        if (item && typeof item === "object") return normalizeTopicLabel(item.topicHint || item.topicLabel || item.label || "");
        return "";
      })
      .filter(Boolean)
  ).slice(0, limit);
}

export function normalizeTopicRows(rows) {
  const merged = new Map();
  for (const item of Array.isArray(rows) ? rows : []) {
    const row = item && typeof item === "object" ? item : {};
    const label = normalizeTopicLabel(row.topic_label || row.category_label || row.label || "");
    if (!label) continue;
    const bucket = merged.get(label) || {
      topic_label: label,
      event_count: 0,
      account_count: 0,
      source_count: 0
    };
    bucket.event_count += safeCount(row.event_count || row.eventCount);
    bucket.account_count += safeCount(row.account_count || row.accountCount);
    bucket.source_count += safeCount(row.source_count || row.sourceCount);
    merged.set(label, bucket);
  }
  return Array.from(merged.values()).sort((a, b) => b.event_count - a.event_count);
}

function includesFolded(text, term) {
  return foldText(text).includes(foldText(term));
}

function foldText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function dedupeStrings(values) {
  const seen = new Set();
  const picked = [];
  for (const value of values) {
    const item = String(value || "").trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    picked.push(item);
  }
  return picked;
}

function safeCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(Math.min(n, 1e9));
}
