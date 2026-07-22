/**
 * 留友封 問題回報 → Google 試算表 每日同步
 *
 * 設計文件：docs/SDD_Bug_Report_Sheet_Sync.md
 * 決策紀錄：docs/adr/0011-bug-report-sheet-sync.md
 *
 * ── 安裝步驟 ──────────────────────────────────────────────
 * 1. 開啟目標試算表 → 擴充功能 → Apps Script，把本檔內容整份貼上。
 * 2. 在 setupProperties() 頂端填入 TOKEN 與 NOTIFY_EMAIL，手動執行一次。
 *    ENDPOINT、SHEET_NAME、CURSOR_ID 會自動使用安全預設值。
 *    執行成功後，把 TOKEN 變數清回空字串；token 最終只留在指令碼屬性。
 *
 * 3. 先手動執行一次 syncBugReports()，確認授權與寫入正常。
 * 4. 觸發條件 → 新增觸發條件 → syncBugReports / 時間driven / 每日 / 上午 9-10 點。
 * 5. （建議）再加一個觸發條件跑 healthCheck，每日 18-19 點，
 *    用來抓「同步靜默失敗」——沒同步成功時會寄告警信。
 *
 * ── 設計約束 ──────────────────────────────────────────────
 * - 單向：D1 → 試算表。試算表的處理狀態不回寫後端。
 * - 腳本只 append 新列，永遠不修改既有列的任何欄位。
 * - I、J 欄是人工地盤，腳本不讀也不寫。H 欄是 D1 狀態在匯入當下的快照，
 *   之後不會被更新，因此不會與人工維護的 I 欄打架。
 * - 去重靠 A 欄的回報 ID，因此重複執行不會產生重複列。
 */

const COLUMNS = [
  '回報 ID',      // A  id，去重鍵
  '收到時間',     // B  created_at，台北時間
  '等級／代碼',   // C  level + error_code
  '版本／平台',   // D  version / platform
  '問題描述',     // E  message 全文
  '錯誤訊息',     // F  error_name / error_message
  '持續性 ID',    // G  hwid，刪除要求時用來比對
  '後端狀態',     // H  D1 status 匯入當下的快照（ACK/PENDING/IGNORED/FIXED）
  '處理狀態',     // I  ← 人工
  '備註',         // J  ← 人工
];

const SCRIPT_WRITTEN_COLUMNS = 8; // A–H。I、J 不由腳本填寫。
const FETCH_LIMIT = 200;          // 後端 clampInt 上限即為 200
const TZ = 'Asia/Taipei';

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

  const token = TOKEN.trim();
  const notifyEmail = NOTIFY_EMAIL.trim();
  if (!token) throw new Error('請先在 setupProperties() 頂端填入 TOKEN。');
  if (!notifyEmail) throw new Error('請先在 setupProperties() 頂端填入 NOTIFY_EMAIL。');

  const properties = props_();
  properties.setProperties({
    ENDPOINT: 'https://threadsblocker-bug-admin.skiseiju.workers.dev/api/v1/admin/bugs',
    TOKEN: token,
    SHEET_NAME: '回報',
    NOTIFY_EMAIL: notifyEmail,
    CURSOR_ID: properties.getProperty('CURSOR_ID') || '0',
  }, false);

  console.log('已設定指令碼屬性：ENDPOINT、TOKEN、SHEET_NAME、NOTIFY_EMAIL、CURSOR_ID（未輸出任何屬性值）。');
}

function requireProp_(key) {
  const value = (props_().getProperty(key) || '').trim();
  if (!value) {
    throw new Error(`缺少指令碼屬性：${key}。請先在 setupProperties() 頂端填入 TOKEN 與 NOTIFY_EMAIL，並執行 setupProperties()。`);
  }
  return value;
}

/**
 * 取得（必要時建立）工作表，並確保標題列存在。
 *
 * 以 gid 為主要依據：分頁一旦建立就把 gid 存進屬性，之後永遠認同一個分頁。
 * 只靠名稱查找不夠可靠——名稱被改、前後有空白、或 getSheetByName 沒對上，
 * 都會讓每次執行又插一個新分頁。
 */
function getSheet_() {
  const properties = props_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = (properties.getProperty('SHEET_NAME') || '回報').trim();
  let sheet = null;

  const gid = properties.getProperty('SHEET_GID');
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
  properties.setProperty('SHEET_GID', String(sheet.getSheetId()));

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
    sheet.setColumnWidth(5, 420); // 問題描述給寬一點
  }
  return sheet;
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
    props_().setProperty('LAST_SYNC_AT', new Date().toISOString());
    console.log('沒有新回報，不寄信。');
    return;
  }

  const rows = fresh.map(toRow_);
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, SCRIPT_WRITTEN_COLUMNS).setValues(rows);

  // 全部寫入成功後才推進 cursor 與 last-sync。
  const maxId = Math.max(...fresh.map(r => Number(r.id)));
  props_().setProperty('CURSOR_ID', String(maxId));
  props_().setProperty('LAST_SYNC_AT', new Date().toISOString());

  sendDigest_(fresh);
  console.log(`新增 ${fresh.length} 筆，cursor=${maxId}`);
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

/**
 * 每日傍晚跑一次，抓「同步靜默失敗」。
 * 沒有同步 = 收不到信 = 容易誤以為今天沒回報，這比沒有同步更危險。
 */
function healthCheck() {
  const last = props_().getProperty('LAST_SYNC_AT');
  if (!last) {
    notifyFailure_('同步從未成功執行過', '請手動執行 syncBugReports() 檢查設定。');
    return;
  }
  const hours = (Date.now() - new Date(last).getTime()) / 36e5;
  if (hours > 26) {
    notifyFailure_(
      `同步已 ${Math.floor(hours)} 小時未成功`,
      `最後一次成功時間：${last}`
    );
  }
}
