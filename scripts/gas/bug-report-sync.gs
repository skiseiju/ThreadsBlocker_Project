/**
 * 留友封 問題回報 → Google 試算表 每日同步
 *
 * 設計文件：docs/SDD_Bug_Report_Sheet_Sync.md
 * 決策紀錄：docs/adr/0011-bug-report-sheet-sync.md
 *
 * ── 安裝步驟 ──────────────────────────────────────────────
 * 1. 開啟目標試算表 → 擴充功能 → Apps Script，把本檔內容整份貼上。
 * 2. 在 setupProperties() 頂端填入 TOKEN 與 NOTIFY_EMAIL，手動執行一次。
 *    若 GitHub repo 是 private，可另外暫時填入 GITHUB_TOKEN；公開 repo 會先匿名抓取。
 *    ENDPOINT、SHEET_NAME、CURSOR_ID、GITHUB_TOKEN 會自動使用安全預設值。
 *    執行成功後，把 TOKEN 變數清回空字串；token 最終只留在指令碼屬性。
 *
 * 3. 先手動執行一次 syncBugReports()，確認授權與寫入正常。
 * 4. 觸發條件 → 新增觸發條件 → syncBugReports / 時間driven / 每日 / 上午 9-10 點。
 * 5. （建議）再加一個觸發條件跑 syncWorkItems，每日 / 每 6 小時一次，
 *    讓「工作項」分頁跟著 PLAN markdown 更新。
 * 6. （可選）若要更頻繁更新 H，可另外掛 refreshBackendStatuses 觸發器。
 * 7. （建議）再加一個觸發條件跑 healthCheck，每日 18-19 點，
 *    用來抓「同步靜默失敗」——沒同步成功時會寄告警信。
 *
 * ── 設計約束 ──────────────────────────────────────────────
 * - 單向鏡像：D1 →「回報」、PLAN →「工作項」與「回報」K 欄；試算表的處理狀態不回寫後端。
 * - 回報內容只 append 新列；既有列只允許 H 欄依 D1 狀態更新，A-G、I、J 永不回頭修改；
 *   K 另由 syncWorkItems() 依 PLAN 對照重寫。
 * - I、J 欄是人工地盤，腳本不讀也不寫。H 欄是腳本維護的 D1 狀態活鏡像，
 *   與人工維護的 I 欄分工不變：H 看後端，I 看人工處理判斷。
 * - K 欄是腳本維護的 PLAN 對應工作項；syncWorkItems() 可整欄重寫 K，
 *   只讀「回報」A 欄做回報 ID 對照，找不到對應列就略過，不改 A-H、I、J。
 * - 去重靠 A 欄的回報 ID，因此重複執行不會產生重複列。
 * - 「工作項」分頁完全由腳本擁有，來源是 PLAN markdown；每次同步先清空再全量寫入。
 */

const COLUMNS = [
  '回報 ID',      // A  id，去重鍵
  '收到時間',     // B  created_at，台北時間
  '等級／代碼',   // C  level + error_code
  '版本／平台',   // D  version / platform
  '問題描述',     // E  message 全文
  '錯誤訊息',     // F  error_name / error_message
  '持續性 ID',    // G  hwid，刪除要求時用來比對
  '後端狀態',     // H  腳本維護的 D1 status 活鏡像（ACK/PENDING/IGNORED/FIXED）
  '處理狀態',     // I  ← 人工
  '備註',         // J  ← 人工
  '對應工作項',   // K  ← 腳本維護的 PLAN 對應工作項
];

const WORK_ITEM_COLUMNS = [
  '編號',
  '版本',
  '上線',   // 使用者手上有沒有：v2.8.2／v2.8.3＝已上線，待發＝已修但未發布，—＝尚未修
  '來源',
  '一句話',
  '規模',
  '狀態',   // 程式改好了沒。與「上線」是兩件事，盤點線上痛點要看「上線」欄
  '同步時間',
];

const SCRIPT_WRITTEN_COLUMNS = 8; // syncBugReports 新列只寫 A–H；K 由 syncWorkItems() 維護。
const FETCH_LIMIT = 200;          // 後端 clampInt 上限即為 200
const TZ = 'Asia/Taipei';
const WORK_ITEMS_PLAN_URL = 'https://raw.githubusercontent.com/skiseiju/ThreadsBlocker_Project/main/docs/PLAN_2.8.2_STRUCT_DEBT.md';
const WORK_ITEM_HEADERS = ['編號', '版本', '上線', '來源', '一句話', '規模', '狀態'];
const REPORT_WORK_ITEM_COLUMN = 11; // K
const REPORT_WORK_ITEM_HEADER = '對應工作項';

function props_() {
  return PropertiesService.getScriptProperties();
}

/**
 * 一次性設定：只需填入下列 TOKEN 與 NOTIFY_EMAIL，手動執行一次。
 * repo 版本的 TOKEN 必須永遠維持空字串；不得提交真實 token。
 */
function setupProperties() {
  const TOKEN = '';
  const NOTIFY_EMAIL = '';
  const GITHUB_TOKEN = '';

  const token = TOKEN.trim();
  const notifyEmail = NOTIFY_EMAIL.trim();
  if (!token) throw new Error('請先在 setupProperties() 頂端填入 TOKEN。');
  if (!notifyEmail) throw new Error('請先在 setupProperties() 頂端填入 NOTIFY_EMAIL。');

  const properties = props_();
  const githubToken = GITHUB_TOKEN.trim() || (properties.getProperty('GITHUB_TOKEN') || '').trim();
  properties.setProperties({
    ENDPOINT: 'https://threadsblocker-bug-admin.skiseiju.workers.dev/api/v1/admin/bugs',
    TOKEN: token,
    SHEET_NAME: '回報',
    NOTIFY_EMAIL: notifyEmail,
    CURSOR_ID: properties.getProperty('CURSOR_ID') || '0',
    GITHUB_TOKEN: githubToken,
    WORK_ITEMS_SHEET_NAME: properties.getProperty('WORK_ITEMS_SHEET_NAME') || '工作項',
  }, false);

  console.log('已設定指令碼屬性：ENDPOINT、TOKEN、SHEET_NAME、NOTIFY_EMAIL、CURSOR_ID、GITHUB_TOKEN（未輸出任何屬性值）。');
}

function requireProp_(key) {
  const value = (props_().getProperty(key) || '').trim();
  if (!value) {
    throw new Error(`缺少指令碼屬性：${key}。請先在 setupProperties() 頂端填入 TOKEN 與 NOTIFY_EMAIL，並執行 setupProperties()。`);
  }
  return value;
}

/**
 * 取得（必要時建立）由腳本管理的工作表，並確保標題列存在。
 *
 * 以 gid 為主要依據：分頁一旦建立就把 gid 存進屬性，之後永遠認同一個分頁。
 * 只靠名稱查找不夠可靠——名稱被改、前後有空白、或 getSheetByName 沒對上，
 * 都會讓每次執行又插一個新分頁。
 */
function getManagedSheet_(nameKey, defaultName, gidKey, columns, configure) {
  const properties = props_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = (properties.getProperty(nameKey) || defaultName).trim();
  let sheet = null;

  const gid = properties.getProperty(gidKey);
  if (gid) {
    sheet = ss.getSheets().filter(s => String(s.getSheetId()) === String(gid))[0] || null;
  }
  if (!sheet) {
    sheet = ss.getSheets().filter(s => s.getName().trim() === name)[0] || null;
  }
  if (!sheet) {
    try {
      sheet = ss.insertSheet(name);
    } catch (err) {
      // 名稱已存在時 insertSheet 會丟例外，重新查一次比再插一個安全。
      sheet = ss.getSheets().filter(s => s.getName().trim() === name)[0] || null;
      if (!sheet) throw err;
    }
  }
  properties.setProperty(gidKey, String(sheet.getSheetId()));

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([columns]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold');
    if (configure) configure(sheet);
  }
  return sheet;
}

function getSheet_() {
  const sheet = getManagedSheet_('SHEET_NAME', '回報', 'SHEET_GID', COLUMNS, sheet => {
    sheet.setColumnWidth(5, 420); // 問題描述給寬一點
  });
  // 舊版分頁只有 A–J；K 是新增的腳本欄，只補自己的表頭，不碰 A–J。
  const header = sheet.getRange(1, REPORT_WORK_ITEM_COLUMN).getValue();
  if (String(header == null ? '' : header).trim() !== REPORT_WORK_ITEM_HEADER) {
    sheet.getRange(1, REPORT_WORK_ITEM_COLUMN).setValue(REPORT_WORK_ITEM_HEADER);
    sheet.getRange(1, REPORT_WORK_ITEM_COLUMN).setFontWeight('bold');
  }
  return sheet;
}

function getWorkItemsSheet_() {
  return getManagedSheet_('WORK_ITEMS_SHEET_NAME', '工作項', 'WORK_ITEMS_SHEET_GID', WORK_ITEM_COLUMNS, sheet => {
    sheet.setColumnWidth(4, 420); // 一句話給寬一點
  });
}

/** 讀出 A 欄既有的回報 ID，用於去重。 */
function existingIds_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return new Set();
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const ids = new Set();
  for (const row of values) {
    const raw = row[0];
    if (raw !== '' && raw !== null && raw !== undefined) ids.add(String(raw));
  }
  return ids;
}

function fetchReports_() {
  const endpoint = requireProp_('ENDPOINT');
  const token = requireProp_('TOKEN');
  const url = `${endpoint}?limit=${FETCH_LIMIT}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true,
  });

  const status = response.getResponseCode();
  if (status === 401 || status === 403) {
    // 認證失敗必須主動告警，否則會靜默停擺、讓人誤以為「今天沒新回報」。
    notifyFailure_(`認證失敗（HTTP ${status}）`, '請確認指令碼屬性 TOKEN 是否仍有效。');
    throw new Error(`Unauthorized: HTTP ${status}`);
  }
  if (status !== 200) {
    throw new Error(`HTTP ${status}: ${response.getContentText().slice(0, 300)}`);
  }

  const body = JSON.parse(response.getContentText());
  const rows = (body && body.data) || [];
  if (!Array.isArray(rows)) throw new Error('回應格式非預期：data 不是陣列');
  return rows;
}

function formatTime_(value) {
  if (!value) return '';
  const raw = String(value).trim();
  let normalized = raw.replace(' ', 'T');
  const isIsoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(normalized);
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  // D1/SQLite 可能回傳無時區的 UTC datetime；只有這種 ISO-like 值才補 Z。
  if (isIsoLike && !hasTimeZone) normalized += 'Z';
  const date = new Date(normalized);
  if (isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, TZ, 'yyyy-MM-dd HH:mm');
}

function toRow_(report) {
  const level = [report.level, report.error_code].filter(Boolean).join(' / ');
  const build = [report.version, report.platform].filter(Boolean).join(' / ');
  const error = [report.error_name, report.error_message].filter(Boolean).join(': ');
  return [
    String(report.id),
    formatTime_(report.created_at),
    level,
    build,
    report.message || '',
    error,
    report.hwid || '',
    report.status || '',
  ];
}

/** 主流程：每日觸發器指向這支。 */
function syncBugReports() {
  const sheet = getSheet_();
  const seen = existingIds_(sheet);
  const reports = fetchReports_();

  // 後端是 ORDER BY id DESC，寫入時反轉成舊→新，讓試算表由上而下是時間順序。
  const fresh = reports
    .filter(r => r && r.id !== undefined && !seen.has(String(r.id)))
    .sort((a, b) => Number(a.id) - Number(b.id));

  if (fresh.length === 0) {
    refreshBackendStatuses();
    props_().setProperty('LAST_SYNC_AT', new Date().toISOString());
    console.log('沒有新回報，不寄信。');
    return;
  }

  const rows = fresh.map(toRow_);
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, SCRIPT_WRITTEN_COLUMNS).setValues(rows);

  // 全部新列寫入成功後才推進 cursor；後端狀態鏡像成功後才記 last-sync。
  const maxId = Math.max(...fresh.map(r => Number(r.id)));
  props_().setProperty('CURSOR_ID', String(maxId));
  refreshBackendStatuses();
  props_().setProperty('LAST_SYNC_AT', new Date().toISOString());
  sendDigest_(fresh);
  console.log(`新增 ${fresh.length} 筆，cursor=${maxId}`);
}

/**
 * 將 D1 的最新狀態同步回「回報」分頁 H 欄。
 * 只讀 A、H 兩欄；I、J 以及其他欄位完全不碰。
 */
function refreshBackendStatuses() {
  const reports = fetchReports_();
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    console.log('沒有既有回報列，略過後端狀態更新。');
    return;
  }

  const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const statusValues = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  const statusById = new Map();
  for (const report of reports) {
    if (!report || report.id === undefined || report.id === null) continue;
    statusById.set(String(report.id), report.status == null ? '' : String(report.status));
  }

  let changed = 0;
  let runStart = -1;
  let runValues = [];
  const flush = () => {
    if (runStart < 0) return;
    sheet.getRange(runStart + 2, 8, runValues.length, 1).setValues(runValues);
    runStart = -1;
    runValues = [];
  };

  for (let index = 0; index < idValues.length; index += 1) {
    const rawId = idValues[index][0];
    if (rawId === '' || rawId === null || rawId === undefined) {
      flush();
      continue;
    }

    const id = String(rawId);
    if (!statusById.has(id)) {
      flush();
      continue;
    }

    const nextStatus = statusById.get(id);
    const currentStatus = statusValues[index][0] == null ? '' : String(statusValues[index][0]);
    if (currentStatus === nextStatus) {
      flush();
      continue;
    }

    if (runStart < 0) runStart = index;
    runValues.push([nextStatus]);
    changed += 1;
  }
  flush();

  console.log(`後端狀態鏡像完成：${changed} 列更新。`);
}

function fetchWorkItemsPlan_() {
  const token = (props_().getProperty('GITHUB_TOKEN') || '').trim();
  const options = {
    method: 'get',
    muteHttpExceptions: true,
  };
  if (token) options.headers = { Authorization: `Bearer ${token}` };

  const response = UrlFetchApp.fetch(WORK_ITEMS_PLAN_URL, options);
  const status = response.getResponseCode();
  if (status === 401 || status === 404) {
    throw new Error(`GitHub PLAN 抓取失敗（HTTP ${status}）。若 repo 為 private，請在 Script Properties 設定 GITHUB_TOKEN。`);
  }
  if (status !== 200) {
    throw new Error(`GitHub PLAN 抓取失敗（HTTP ${status}）：${response.getContentText().slice(0, 300)}`);
  }
  return response.getContentText();
}

function splitMarkdownRow_(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map(cell => cell.trim());
}

function isMarkdownSeparator_(cells) {
  return cells.length === WORK_ITEM_HEADERS.length
    && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function parseWorkItems_(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  let headerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const cells = splitMarkdownRow_(lines[index]);
    if (cells && cells.length === WORK_ITEM_HEADERS.length
      && cells.every((cell, cellIndex) => cell === WORK_ITEM_HEADERS[cellIndex])) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) throw new Error('PLAN markdown 找不到第一個工作項總表。');

  const items = [];
  let foundSeparator = false;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      if (items.length > 0) break;
      continue;
    }

    const cells = splitMarkdownRow_(lines[index]);
    if (!cells) {
      if (items.length > 0) {
        if (trimmed.startsWith('|') || trimmed.endsWith('|')) {
          throw new Error(`PLAN 總表第 ${index + 1} 行不是完整 markdown 表格列。`);
        }
        break;
      }
      throw new Error(`PLAN 總表第 ${index + 1} 行不是 markdown 表格列。`);
    }
    if (isMarkdownSeparator_(cells)) {
      foundSeparator = true;
      continue;
    }
    if (!foundSeparator) throw new Error('PLAN 總表缺少分隔列。');
    if (cells.length !== WORK_ITEM_HEADERS.length) {
      throw new Error(`PLAN 總表第 ${index + 1} 行欄數錯誤：預期 ${WORK_ITEM_HEADERS.length} 欄，實際 ${cells.length} 欄。`);
    }

    // 索引對齊 WORK_ITEM_HEADERS；加欄時兩處必須一起改，否則整表錯位。
    items.push({
      id: cells[0],
      version: cells[1],
      shipped: cells[2].replace(/\*\*/g, '').trim(),
      source: cells[3],
      summary: cells[4],
      size: cells[5],
      status: cells[6].replace(/\*\*/g, '').trim(),
    });
  }

  if (!foundSeparator || items.length === 0) {
    throw new Error('PLAN 總表沒有可同步的工作項資料列。');
  }
  return items;
}

/**
 * 從 PLAN 每列的「來源」欄建立回報 ID → 工作項編號清單。
 * 同一工作項若重複提到同一回報，只保留一份，並維持 PLAN 總表順序。
 */
function buildReportWorkItemMap_(items) {
  const workItemsByReportId = new Map();
  for (const item of items) {
    const workItemId = String(item && item.id != null ? item.id : '').trim();
    if (!workItemId) continue;

    const source = String(item && item.source != null ? item.source : '');
    // 只有明確提到「回報」的來源才是回報對照；SSOT／診斷盤點編號不是回報 ID。
    if (!source.includes('回報')) continue;
    const reportIdPattern = /#(\d+)/g;
    let match;
    while ((match = reportIdPattern.exec(source)) !== null) {
      const reportId = match[1];
      if (!workItemsByReportId.has(reportId)) workItemsByReportId.set(reportId, []);
      const workItemIds = workItemsByReportId.get(reportId);
      if (!workItemIds.includes(workItemId)) workItemIds.push(workItemId);
    }
  }
  return workItemsByReportId;
}

/**
 * 以 PLAN 對照整欄重寫「回報」K；只讀 A 欄，絕不讀寫 I、J 或改動 A–H。
 * 回報列不存在時不報錯，只留下空白 K。
 */
function rewriteReportWorkItemLinks_(workItemsByReportId) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    console.log('沒有既有回報列，略過對應工作項更新。');
    return 0;
  }

  const idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const linkValues = idValues.map(row => {
    const rawId = row[0];
    if (rawId === '' || rawId === null || rawId === undefined) return [''];
    const workItemIds = workItemsByReportId.get(String(rawId).trim());
    return [workItemIds ? workItemIds.join(', ') : ''];
  });

  // K 完全由腳本擁有：一次覆寫所有既有資料列，沒有對應的列也明確清空。
  sheet.getRange(2, REPORT_WORK_ITEM_COLUMN, linkValues.length, 1).setValues(linkValues);
  const linkedRows = linkValues.reduce((count, row) => count + (row[0] ? 1 : 0), 0);
  console.log(`回報對應工作項更新完成：${linkedRows} 列有對應。`);
  return linkedRows;
}

function applyWorkItemColors_(sheet, items) {
  items.forEach((item, index) => {
    // 以「使用者手上有沒有」為上色主軸：待發＝已修但線上痛點還活著（琥珀），
    // 綠＝已上線的修正，紅＝還沒動工。只看狀態欄的 Fixed 會誤以為痛點已解。
    const color = item.shipped.includes('待發')
      ? '#fff2cc'
      : item.status.includes('Fixed') || item.status.includes('已落地')
        ? '#d9ead3'
        : item.status.includes('未動工')
          ? '#f4cccc'
          : '';
    if (color) sheet.getRange(index + 2, 1, 1, WORK_ITEM_COLUMNS.length).setBackground(color);
  });
}

/** 將 PLAN markdown 的第一個總表完整鏡像到「工作項」分頁。 */
function syncWorkItems() {
  try {
    const items = parseWorkItems_(fetchWorkItemsPlan_());
    const workItemsByReportId = buildReportWorkItemMap_(items);
    const syncedAt = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
    const values = [WORK_ITEM_COLUMNS].concat(items.map(item => [
      item.id,
      item.version,
      item.shipped,
      item.source,
      item.summary,
      item.size,
      item.status,
      syncedAt,
    ]));

    const sheet = getWorkItemsSheet_();
    sheet.clear();
    sheet.getRange(1, 1, values.length, WORK_ITEM_COLUMNS.length).setValues(values);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, WORK_ITEM_COLUMNS.length).setFontWeight('bold');
    sheet.setColumnWidth(4, 420);
    applyWorkItemColors_(sheet, items);
    rewriteReportWorkItemLinks_(workItemsByReportId);

    props_().setProperty('WORK_ITEMS_SYNC_AT', new Date().toISOString());
    console.log(`工作項同步完成：${items.length} 筆。`);
  } catch (err) {
    notifyFailure_('工作項同步失敗', err && err.message ? err.message : String(err));
    throw err;
  }
}

function sendDigest_(reports) {
  const to = requireProp_('NOTIFY_EMAIL');
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const url = SpreadsheetApp.getActiveSpreadsheet().getUrl();

  const lines = reports.map(r => {
    const excerpt = String(r.message || '').replace(/\s+/g, ' ').slice(0, 60);
    const level = [r.level, r.error_code].filter(Boolean).join('/');
    return `#${r.id}　[${level}]　${excerpt}`;
  });

  MailApp.sendEmail({
    to,
    subject: `留友封 問題回報 ${reports.length} 筆（${today}）`,
    body: [
      `今天有 ${reports.length} 筆新回報：`,
      '',
      lines.join('\n'),
      '',
      `試算表：${url}`,
    ].join('\n'),
  });
}

function notifyFailure_(reason, detail) {
  const to = (props_().getProperty('NOTIFY_EMAIL') || '').trim();
  if (!to) return;
  MailApp.sendEmail({
    to,
    subject: `[同步失敗] 留友封 問題回報同步`,
    body: `${reason}\n\n${detail || ''}\n\n請到 Apps Script 執行紀錄查看細節。`,
  });
}

function syncAgeHours_(value) {
  const timestamp = new Date(value).getTime();
  if (isNaN(timestamp)) return Infinity;
  return (Date.now() - timestamp) / 36e5;
}

/**
 * 每日傍晚跑一次，抓「同步靜默失敗」。
 * 沒有同步 = 收不到信 = 容易誤以為今天沒回報，這比沒有同步更危險。
 */
function healthCheck() {
  const last = props_().getProperty('LAST_SYNC_AT');
  const workItemsLast = props_().getProperty('WORK_ITEMS_SYNC_AT');
  const failures = [];

  if (!last) {
    failures.push('回報同步從未成功執行過；請手動執行 syncBugReports() 檢查設定。');
  } else {
    const hours = syncAgeHours_(last);
    if (hours > 26) failures.push(`回報同步已 ${Math.floor(hours)} 小時未成功；最後一次：${last}`);
  }

  if (!workItemsLast) {
    failures.push('工作項同步從未成功執行過；請手動執行 syncWorkItems() 檢查 GITHUB_TOKEN 與 PLAN URL。');
  } else {
    const workItemsHours = syncAgeHours_(workItemsLast);
    if (workItemsHours > 26) {
      failures.push(`工作項同步已 ${Math.floor(workItemsHours)} 小時未成功；最後一次：${workItemsLast}`);
    }
  }

  if (failures.length > 0) notifyFailure_('同步靜默失敗', failures.join('\n'));
}
