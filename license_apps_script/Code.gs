/**
 * ThreadsBlocker 3.0 License Issuance (Google Apps Script)
 * ADR: docs/adr/0014-license-ledger-and-email-issuance.md
 * ADR: docs/adr/0015-payuni-dynamic-checkout-relay.md
 * ADR: docs/adr/0016-payuni-production-pages-and-manual-invoicing.md
 * SDD: docs/SDD_3.0_LICENSE_SERVICE.md
 *
 * LicenseKey is an internal entitlement identifier. Users sign in by Email;
 * the automatic email must never instruct users to enter the internal key.
 */

const SS_ID = "1NfgY3jmtu6sqwuE4Lt-onivBAYJU5tvD9645HnbFrFc";
const SHEET_LICENSES = "Licenses";
const SHEET_PAYMENTS = "Payments";
const ADMIN_SECRET_PROPERTY = "THREADSBLOCKER_ADMIN_SECRET";
const REPLY_TO_PROPERTY = "THREADSBLOCKER_REPLY_TO";
const FROM_ALIAS_PROPERTY = "THREADSBLOCKER_FROM_ALIAS";
const SENDER_NAME = "留友封 ThreadsBlocker";
const INSTALL_URL = "https://chromewebstore.google.com/detail/%E7%95%99%E5%8F%8B%E5%B0%81-threads-block-tool/goibhoemcnjojlejjlojpikfehmccbbj";

const VALID_PLANS = ["Pro"];
const VALID_ENTITLEMENT_TYPES = ["subscription", "founding_supporter", "complimentary"];
const VALID_SOURCES = ["payuni_subscription", "payuni_sandbox", "payuni_donate_import", "manual_grant"];

const HEADERS = [
  "LicenseKey",
  "Email",
  "Status",
  "Plan",
  "EntitlementType",
  "SubscriptionExpiry",
  "MaxDevices",
  "DisplayName",
  "CreatedAt",
  "PaymentProvider",
  "PaymentId",
  "PaymentAmount",
  "PaymentCurrency",
  "Source",
  "EmailSentAt",
  "Notes"
];

const COL_LICENSE_KEY = 0;
const COL_EMAIL = 1;
const COL_STATUS = 2;
const COL_PLAN = 3;
const COL_ENTITLEMENT_TYPE = 4;
const COL_SUB_EXPIRY = 5;
const COL_MAX_DEVICES = 6;
const COL_DISPLAY_NAME = 7;
const COL_CREATED_AT = 8;
const COL_PAYMENT_PROVIDER = 9;
const COL_PAYMENT_ID = 10;
const COL_PAYMENT_AMOUNT = 11;
const COL_PAYMENT_CURRENCY = 12;
const COL_SOURCE = 13;
const COL_EMAIL_SENT_AT = 14;
const COL_NOTES = 15;

const PAYMENT_HEADERS = [
  "PaymentProvider",
  "PaymentId",
  "PeriodTradeNo",
  "PeriodOrderNo",
  "Email",
  "BillingCycle",
  "Amount",
  "Currency",
  "Status",
  "PaidAt",
  "ProcessedAt",
  "LicenseKey"
];

const PAYMENT_COL_PROVIDER = 0;
const PAYMENT_COL_ID = 1;

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "";
  if (action === "ping") {
    return createJsonResponse({ success: true, server_time_utc: new Date().toISOString() }, 200);
  }
  return createJsonResponse({ success: true, service: "threadsblocker-license" }, 200);
}

function doPost(e) {
  try {
    let postData = {};
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      postData = e.parameter;
    }

    if ((postData.action || "") === "create_license") {
      return handleCreateLicense(postData);
    }
    if ((postData.action || "") === "apply_subscription_payment") {
      return handleApplySubscriptionPayment(postData);
    }
    return createJsonResponse({ success: false, error: "INVALID_ACTION" }, 400);
  } catch (err) {
    return createJsonResponse({ success: false, error: "INTERNAL_ERROR" }, 500);
  }
}

function handleApplySubscriptionPayment(postData) {
  if (!verifyAdminSecret(postData)) {
    return createJsonResponse({ success: false, error: "UNAUTHORIZED" }, 403);
  }

  const email = normalizeEmail(postData.email);
  const billingCycle = normalizeText(postData.billing_cycle);
  const subExpiry = normalizeText(postData.sub_expiry);
  const paymentProvider = normalizeText(postData.payment_provider || "PAYUNi");
  const paymentId = normalizeIdentifier(postData.payment_id);
  const periodTradeNo = normalizeIdentifier(postData.period_trade_no);
  const periodOrderNo = normalizeIdentifier(postData.period_order_no);
  const paymentAmount = normalizeText(postData.payment_amount);
  const paymentCurrency = normalizeText(postData.payment_currency || "TWD");
  const paidAt = normalizeText(postData.paid_at);
  const source = normalizeAllowed(postData.source || "payuni_subscription", VALID_SOURCES);
  const shouldSendEmail = postData.send_email === undefined || postData.send_email === null
    ? true
    : String(postData.send_email).toLowerCase() !== "false";

  if (!email) return createJsonResponse({ success: false, error: "INVALID_EMAIL" }, 400);
  if (billingCycle !== "month" && billingCycle !== "year") {
    return createJsonResponse({ success: false, error: "INVALID_BILLING_CYCLE" }, 400);
  }
  if (!isValidExpiry(subExpiry) || subExpiry === "never") {
    return createJsonResponse({ success: false, error: "INVALID_EXPIRY" }, 400);
  }
  if ((paymentProvider !== "PAYUNi" && paymentProvider !== "PAYUNi Sandbox") || !paymentId || (billingCycle === "month" && !periodTradeNo)) {
    return createJsonResponse({ success: false, error: "INVALID_PAYMENT_IDENTITY" }, 400);
  }
  if (!isValidSubscriptionPrice(billingCycle, paymentAmount)) {
    return createJsonResponse({ success: false, error: "INVALID_PAYMENT_AMOUNT" }, 400);
  }
  if (paymentCurrency !== "TWD") return createJsonResponse({ success: false, error: "INVALID_CURRENCY" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return createJsonResponse({ success: false, error: "INVALID_PAID_AT" }, 400);
  if (!source) return createJsonResponse({ success: false, error: "INVALID_SOURCE" }, 400);

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const workbook = SpreadsheetApp.openById(SS_ID);
    const licenseSheet = workbook.getSheetByName(SHEET_LICENSES);
    const paymentSheet = workbook.getSheetByName(SHEET_PAYMENTS);
    if (!licenseSheet || !paymentSheet) return createJsonResponse({ success: false, error: "LICENSE_SHEET_NOT_FOUND" }, 500);
    assertLicenseSchema(licenseSheet);
    assertSheetSchema(paymentSheet, PAYMENT_HEADERS, "PAYMENT");

    const duplicatePayment = findPayment(paymentSheet, paymentProvider, paymentId);
    let existing = findLicenseByEmailAndType(licenseSheet, email, "subscription");
    if (duplicatePayment) {
      const emailSent = existing ? maybeSendLicenseEmail(licenseSheet, existing, shouldSendEmail) : false;
      return createJsonResponse({ success: true, payment_duplicate: true, email_sent: emailSent }, 200);
    }

    let created = false;
    if (!existing) {
      const licenseKey = generateLicenseKey(licenseSheet);
      licenseSheet.appendRow([
        licenseKey, email, "Active", "Pro", "subscription", subExpiry, 3, "",
        new Date().toISOString(), paymentProvider, paymentId, paymentAmount, paymentCurrency,
        source, "", "PeriodTradeNo=" + periodTradeNo
      ]);
      existing = licenseRecordFromRow(licenseSheet.getDataRange().getValues()[licenseSheet.getLastRow() - 1], licenseSheet.getLastRow());
      created = true;
    } else {
      const effectiveExpiry = laterExpiry(existing.subExpiry, subExpiry);
      licenseSheet.getRange(existing.rowNumber, COL_STATUS + 1).setValue("Active");
      licenseSheet.getRange(existing.rowNumber, COL_SUB_EXPIRY + 1).setValue(effectiveExpiry);
      licenseSheet.getRange(existing.rowNumber, COL_PAYMENT_PROVIDER + 1).setValue(paymentProvider);
      licenseSheet.getRange(existing.rowNumber, COL_PAYMENT_ID + 1).setValue(paymentId);
      licenseSheet.getRange(existing.rowNumber, COL_PAYMENT_AMOUNT + 1).setValue(paymentAmount);
      licenseSheet.getRange(existing.rowNumber, COL_PAYMENT_CURRENCY + 1).setValue(paymentCurrency);
      licenseSheet.getRange(existing.rowNumber, COL_SOURCE + 1).setValue(source);
      existing.subExpiry = effectiveExpiry;
    }

    paymentSheet.appendRow([
      paymentProvider, paymentId, periodTradeNo, periodOrderNo, email, billingCycle,
      paymentAmount, paymentCurrency, "SUCCESS", paidAt, new Date().toISOString(), existing.licenseKey
    ]);
    const emailSent = maybeSendLicenseEmail(licenseSheet, existing, shouldSendEmail);
    return createJsonResponse({
      success: true,
      created: created,
      renewed: !created,
      license_key: existing.licenseKey,
      entitlement_expiry: existing.subExpiry,
      email_sent: emailSent
    }, 200);
  } finally {
    lock.releaseLock();
  }
}

function handleCreateLicense(postData) {
  if (!verifyAdminSecret(postData)) {
    return createJsonResponse({ success: false, error: "UNAUTHORIZED" }, 403);
  }

  const email = normalizeEmail(postData.email);
  const plan = normalizeAllowed(postData.plan || "Pro", VALID_PLANS);
  const entitlementType = normalizeAllowed(postData.entitlement_type || "subscription", VALID_ENTITLEMENT_TYPES);
  const subExpiry = normalizeText(postData.sub_expiry || defaultExpiryFor(entitlementType));
  const maxDevices = normalizeMaxDevices(postData.max_devices || 3);
  const displayName = normalizeText(postData.display_name || postData.alias || "");
  const paymentProvider = normalizeText(postData.payment_provider || "");
  const paymentId = normalizeText(postData.payment_id || "");
  const paymentAmount = normalizeText(postData.payment_amount || "");
  const paymentCurrency = normalizeText(postData.payment_currency || "TWD");
  const source = normalizeAllowed(postData.source || defaultSourceFor(entitlementType), VALID_SOURCES);
  const notes = normalizeText(postData.notes || "");
  const shouldSendEmail = postData.send_email === undefined || postData.send_email === null
    ? true
    : String(postData.send_email).toLowerCase() !== "false";

  if (!email) return createJsonResponse({ success: false, error: "INVALID_EMAIL" }, 400);
  if (!plan) return createJsonResponse({ success: false, error: "INVALID_PLAN" }, 400);
  if (!entitlementType) return createJsonResponse({ success: false, error: "INVALID_ENTITLEMENT_TYPE" }, 400);
  if (!isValidExpiry(subExpiry)) return createJsonResponse({ success: false, error: "INVALID_EXPIRY" }, 400);
  if (!maxDevices) return createJsonResponse({ success: false, error: "INVALID_MAX_DEVICES" }, 400);
  if (!source) return createJsonResponse({ success: false, error: "INVALID_SOURCE" }, 400);
  if (entitlementType === "subscription" && (!paymentProvider || !paymentId)) {
    return createJsonResponse({ success: false, error: "MISSING_PAYMENT_IDENTITY" }, 400);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(SHEET_LICENSES);
    if (!sheet) return createJsonResponse({ success: false, error: "LICENSE_SHEET_NOT_FOUND" }, 500);
    assertLicenseSchema(sheet);

    const existing = entitlementType === "subscription"
      ? findLicenseByPayment(sheet, paymentProvider, paymentId)
      : findLicenseByEmailAndType(sheet, email, entitlementType);

    if (existing) {
      const emailSent = maybeSendLicenseEmail(sheet, existing, shouldSendEmail);
      return createJsonResponse({
        success: true,
        license_key: existing.licenseKey,
        email: existing.email,
        plan: existing.plan,
        entitlement_type: existing.entitlementType,
        payment_duplicate: entitlementType === "subscription",
        entitlement_duplicate: entitlementType !== "subscription",
        email_sent: emailSent
      }, 200);
    }

    const licenseKey = generateLicenseKey(sheet);
    const createdAt = new Date().toISOString();
    sheet.appendRow([
      licenseKey,
      email,
      "Active",
      plan,
      entitlementType,
      subExpiry,
      Number(maxDevices),
      displayName,
      createdAt,
      paymentProvider,
      paymentId,
      paymentAmount,
      paymentCurrency,
      source,
      "",
      notes
    ]);

    const rowNumber = sheet.getLastRow();
    const record = {
      rowNumber: rowNumber,
      licenseKey: licenseKey,
      email: email,
      plan: plan,
      entitlementType: entitlementType,
      subExpiry: subExpiry,
      maxDevices: String(maxDevices),
      displayName: displayName,
      emailSentAt: ""
    };
    const emailSent = maybeSendLicenseEmail(sheet, record, shouldSendEmail);

    return createJsonResponse({
      success: true,
      license_key: licenseKey,
      email: email,
      plan: plan,
      entitlement_type: entitlementType,
      created_at: createdAt,
      email_sent: emailSent
    }, 200);
  } finally {
    lock.releaseLock();
  }
}

function maybeSendLicenseEmail(sheet, record, shouldSendEmail) {
  if (!shouldSendEmail) return !!record.emailSentAt;
  if (record.emailSentAt) return true;
  sendLicenseEmail(record);
  sheet.getRange(record.rowNumber, COL_EMAIL_SENT_AT + 1).setValue(new Date().toISOString());
  return true;
}

function findLicenseByPayment(sheet, provider, paymentId) {
  if (!provider || !paymentId) return null;
  const rows = sheet.getDataRange().getValues();
  const wantedProvider = provider.toLowerCase();
  const wantedPaymentId = paymentId.toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (normalizeText(rows[i][COL_PAYMENT_PROVIDER]).toLowerCase() !== wantedProvider) continue;
    if (normalizeText(rows[i][COL_PAYMENT_ID]).toLowerCase() !== wantedPaymentId) continue;
    return licenseRecordFromRow(rows[i], i + 1);
  }
  return null;
}

function findLicenseByEmailAndType(sheet, email, entitlementType) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalizeEmail(rows[i][COL_EMAIL]) !== email) continue;
    if (normalizeText(rows[i][COL_ENTITLEMENT_TYPE]) !== entitlementType) continue;
    return licenseRecordFromRow(rows[i], i + 1);
  }
  return null;
}

function licenseRecordFromRow(row, rowNumber) {
  return {
    rowNumber: rowNumber,
    licenseKey: normalizeLicenseKey(row[COL_LICENSE_KEY]),
    email: normalizeEmail(row[COL_EMAIL]),
    plan: normalizeText(row[COL_PLAN]) || "Pro",
    entitlementType: normalizeText(row[COL_ENTITLEMENT_TYPE]) || "subscription",
    subExpiry: normalizeText(row[COL_SUB_EXPIRY]) || "never",
    maxDevices: normalizeText(row[COL_MAX_DEVICES]) || "3",
    displayName: normalizeText(row[COL_DISPLAY_NAME]),
    emailSentAt: normalizeText(row[COL_EMAIL_SENT_AT])
  };
}

function assertLicenseSchema(sheet) {
  assertSheetSchema(sheet, HEADERS, "LICENSE");
}

function assertSheetSchema(sheet, expected, label) {
  const actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  for (let i = 0; i < expected.length; i++) {
    if (String(actual[i] || "") !== expected[i]) throw new Error("INVALID_" + label + "_SCHEMA_AT_COLUMN_" + (i + 1));
  }
}

function findPayment(sheet, provider, paymentId) {
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (normalizeText(rows[i][PAYMENT_COL_PROVIDER]) !== provider) continue;
    if (normalizeIdentifier(rows[i][PAYMENT_COL_ID]) !== paymentId) continue;
    return true;
  }
  return false;
}

function generateLicenseKey(sheet) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const existing = sheet.getDataRange().getValues().map(function(row) {
    return normalizeLicenseKey(row[COL_LICENSE_KEY]);
  });
  let key = "";
  do {
    const segment = function() {
      let value = "";
      for (let i = 0; i < 4; i++) value += chars[Math.floor(Math.random() * chars.length)];
      return value;
    };
    key = "TBK-" + segment() + "-" + segment() + "-" + segment();
  } while (existing.indexOf(key) >= 0);
  return key;
}

function sendLicenseEmail(record) {
  const replyTo = getRequiredScriptProperty(REPLY_TO_PROPERTY);
  const fromAlias = getOptionalScriptProperty(FROM_ALIAS_PROPERTY);
  const greeting = record.displayName ? escapeHtml(record.displayName) : "你好";
  const expiryLabel = formatExpiryLabel(record.subExpiry);
  const isFounder = record.entitlementType === "founding_supporter";
  const subject = isFounder
    ? "你的留友封 Pro 已開通（創始支持者）"
    : "你的留友封 Pro 已開通";
  const opening = isFounder
    ? "謝謝你在留友封早期仍願意支持。你的帳號已升級為永久 Pro，並標記為創始支持者。"
    : "付款已完成，你的留友封 Pro 已開通。";

  const plainBody = `${record.displayName || "你好"}，

${isFounder ? "謝謝你在留友封早期仍願意支持。你的帳號已升級為永久 Pro，並標記為創始支持者。" : "付款已完成，你的留友封 Pro 已開通。"}

登入 Email：${record.email}
授權期限：${expiryLabel}
可使用裝置：最多 ${record.maxDevices} 台

啟用方式：
1. 安裝或更新留友封至 3.0
2. 開啟「Pro 會員」並輸入這次付款使用的 Email
3. 點開驗證信完成登入

安裝留友封：
${INSTALL_URL}

如果無法登入或沒有收到驗證信，直接回覆這封信即可。`;

  const htmlBody = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:32px 16px;background:#f5f5f5;color:#222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;">
    <div style="background:#111;padding:28px 30px;color:#fff;">
      <div style="font-size:22px;font-weight:800;">留友封 Pro</div>
      <div style="margin-top:6px;color:#aaa;font-size:13px;">ThreadsBlocker</div>
    </div>
    <div style="padding:32px 30px;">
      <p style="margin:0 0 20px;font-size:16px;line-height:1.7;">${greeting}，${opening}</p>
      <div style="padding:18px 20px;border:1px solid #e5e5e5;border-radius:10px;background:#fafafa;line-height:1.8;font-size:14px;">
        <div><strong>登入 Email：</strong>${escapeHtml(record.email)}</div>
        <div><strong>授權期限：</strong>${escapeHtml(expiryLabel)}</div>
        <div><strong>可使用裝置：</strong>最多 ${escapeHtml(record.maxDevices)} 台</div>
      </div>
      <div style="margin:26px 0;padding:18px 20px;border:1px solid #d9ead3;border-radius:10px;background:#f5fbf3;">
        <div style="font-size:14px;font-weight:800;margin-bottom:10px;">啟用方式</div>
        <ol style="margin:0;padding-left:1.3em;color:#444;font-size:14px;line-height:1.8;">
          <li>安裝或更新留友封至 3.0</li>
          <li>開啟「Pro 會員」並輸入這次付款使用的 Email</li>
          <li>點開驗證信完成登入</li>
        </ol>
      </div>
      <p style="margin:0 0 24px;"><a href="${INSTALL_URL}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#15803d;color:#fff;text-decoration:none;font-weight:800;font-size:14px;">安裝／更新留友封</a></p>
      <p style="margin:0;color:#777;font-size:13px;line-height:1.7;">如果無法登入或沒有收到驗證信，直接回覆這封信即可。</p>
    </div>
    <div style="border-top:1px solid #eee;padding:16px 30px;color:#999;font-size:12px;">這是自動寄出的授權通知。</div>
  </div>
</body>
</html>`;

  sendEmailWithPreferredAlias(record.email, subject, plainBody, htmlBody, replyTo, fromAlias);
}

function sendEmailWithPreferredAlias(email, subject, plainBody, htmlBody, replyTo, fromAlias) {
  const options = { htmlBody: htmlBody, name: SENDER_NAME, replyTo: replyTo };
  if (fromAlias) options.from = fromAlias;
  try {
    GmailApp.sendEmail(email, subject, plainBody, options);
  } catch (err) {
    const message = err && err.toString ? err.toString() : String(err);
    if (!fromAlias || message.indexOf("Invalid argument: " + fromAlias) === -1) throw err;
    GmailApp.sendEmail(email, subject, plainBody, {
      htmlBody: htmlBody,
      name: SENDER_NAME,
      replyTo: replyTo
    });
  }
}

function verifyAdminSecret(postData) {
  const expected = getOptionalScriptProperty(ADMIN_SECRET_PROPERTY);
  const provided = normalizeText(postData.admin_secret || postData.admin_token || "");
  return !!expected && !!provided && provided === expected;
}

function getRequiredScriptProperty(name) {
  const value = getOptionalScriptProperty(name);
  if (!value) throw new Error("Missing Script Property: " + name);
  return value;
}

function getOptionalScriptProperty(name) {
  return normalizeText(PropertiesService.getScriptProperties().getProperty(name) || "");
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeAllowed(value, allowed) {
  const normalized = normalizeText(value);
  return allowed.indexOf(normalized) >= 0 ? normalized : "";
}

function normalizeText(value) {
  return String(value || "").trim().replace(/[\r\n\t]+/g, " ");
}

function normalizeMaxDevices(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 3) return "";
  return String(parsed);
}

function normalizeLicenseKey(value) {
  return normalizeText(value).replace(/\s+/g, "").toUpperCase();
}

function normalizeIdentifier(value) {
  const normalized = normalizeText(value);
  return /^[A-Za-z0-9_-]{1,64}$/.test(normalized) ? normalized : "";
}

function isValidSubscriptionPrice(cycle, amount) {
  const value = normalizeText(amount);
  return cycle === "month" ? value === "129" : value === "690" || value === "990";
}

function laterExpiry(currentValue, incomingValue) {
  if (currentValue === "never") return "never";
  return currentValue && currentValue > incomingValue ? currentValue : incomingValue;
}

function defaultExpiryFor(entitlementType) {
  return entitlementType === "subscription" ? "" : "never";
}

function defaultSourceFor(entitlementType) {
  if (entitlementType === "founding_supporter") return "payuni_donate_import";
  if (entitlementType === "complimentary") return "manual_grant";
  return "payuni_subscription";
}

function isValidExpiry(value) {
  return value === "never" || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatExpiryLabel(value) {
  return value === "never" ? "永久" : value;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createJsonResponse(data, statusCode) {
  const payload = Object.assign({ status_code: statusCode }, data);
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
