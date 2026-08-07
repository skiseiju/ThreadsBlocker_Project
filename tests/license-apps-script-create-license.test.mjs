// ADR: docs/adr/0014-license-ledger-and-email-issuance.md
// ADR: docs/adr/0015-payuni-dynamic-checkout-relay.md
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const code = await readFile(join(here, '..', 'license_apps_script', 'Code.gs'), 'utf8');

function headers() {
    return [
        'LicenseKey', 'Email', 'Status', 'Plan', 'EntitlementType',
        'SubscriptionExpiry', 'MaxDevices', 'DisplayName', 'CreatedAt',
        'PaymentProvider', 'PaymentId', 'PaymentAmount', 'PaymentCurrency',
        'Source', 'EmailSentAt', 'Notes'
    ];
}

function paymentHeaders() {
    return [
        'PaymentProvider', 'PaymentId', 'PeriodTradeNo', 'PeriodOrderNo',
        'Email', 'BillingCycle', 'Amount', 'Currency', 'Status', 'PaidAt',
        'ProcessedAt', 'LicenseKey'
    ];
}

function payload(overrides = {}) {
    return {
        action: 'create_license',
        admin_secret: 'test-secret',
        email: 'buyer@example.com',
        plan: 'Pro',
        entitlement_type: 'subscription',
        sub_expiry: '2027-08-07',
        max_devices: 3,
        display_name: 'Test Buyer',
        payment_provider: 'PAYUNi',
        payment_id: 'PAYUNI-001',
        payment_amount: '990',
        payment_currency: 'TWD',
        source: 'payuni_subscription',
        send_email: true,
        ...overrides
    };
}

function parse(response) {
    assert.equal(response.mimeType, 'application/json');
    return JSON.parse(response.content);
}

function createRuntime(options = {}) {
    const sentEmails = [];
    const lockEvents = [];
    const licenses = new MockSheet(options.rows || [headers()]);
    const payments = new MockSheet(options.paymentRows || [paymentHeaders()]);
    const properties = {
        THREADSBLOCKER_ADMIN_SECRET: 'test-secret',
        THREADSBLOCKER_REPLY_TO: 'support@example.com',
        THREADSBLOCKER_FROM_ALIAS: 'sender@example.com',
        ...(options.properties || {})
    };
    const context = {
        Date,
        JSON,
        Math,
        Number,
        Object,
        String,
        parseInt,
        ContentService: {
            MimeType: { JSON: 'application/json' },
            createTextOutput(content) {
                return {
                    content,
                    mimeType: '',
                    setMimeType(mimeType) { this.mimeType = mimeType; return this; }
                };
            }
        },
        SpreadsheetApp: {
            openById(id) {
                assert.equal(id, '1NfgY3jmtu6sqwuE4Lt-onivBAYJU5tvD9645HnbFrFc');
                return { getSheetByName: (name) => name === 'Licenses' ? licenses : name === 'Payments' ? payments : null };
            }
        },
        LockService: {
            getScriptLock() {
                return {
                    waitLock(ms) { lockEvents.push(`wait:${ms}`); },
                    releaseLock() { lockEvents.push('release'); }
                };
            }
        },
        GmailApp: {
            sendEmail(email, subject, plainBody, emailOptions) {
                if (options.rejectAlias && emailOptions.from === properties.THREADSBLOCKER_FROM_ALIAS) {
                    throw new Error(`Invalid argument: ${properties.THREADSBLOCKER_FROM_ALIAS}`);
                }
                sentEmails.push({ email, subject, plainBody, options: emailOptions });
            }
        },
        PropertiesService: {
            getScriptProperties() {
                return { getProperty: (name) => properties[name] || '' };
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(`${code}\nglobalThis.__exports = { handleCreateLicense, handleApplySubscriptionPayment };`, context, { filename: 'Code.gs' });
    return {
        handleCreateLicense: context.__exports.handleCreateLicense,
        handleApplySubscriptionPayment: context.__exports.handleApplySubscriptionPayment,
        licenses, payments, sentEmails, lockEvents
    };
}

class MockSheet {
    constructor(rows) { this.rows = rows.map((row) => row.slice()); }
    getDataRange() { return { getValues: () => this.rows.map((row) => row.slice()) }; }
    getLastRow() { return this.rows.length; }
    appendRow(row) { this.rows.push(row.slice()); }
    getRange(row, col, numRows = 1, numCols = 1) { return new MockRange(this, row, col, numRows, numCols); }
}

class MockRange {
    constructor(sheet, row, col, numRows, numCols) {
        this.sheet = sheet; this.row = row; this.col = col; this.numRows = numRows; this.numCols = numCols;
    }
    getValues() {
        return Array.from({ length: this.numRows }, (_, r) =>
            Array.from({ length: this.numCols }, (_, c) => this.sheet.rows[this.row - 1 + r]?.[this.col - 1 + c] ?? '')
        );
    }
    setValue(value) {
        while (this.sheet.rows.length < this.row) this.sheet.rows.push([]);
        this.sheet.rows[this.row - 1][this.col - 1] = value;
    }
}

{
    const runtime = createRuntime();
    const body = parse(runtime.handleCreateLicense(payload()));
    assert.equal(body.success, true);
    assert.match(body.license_key, /^TBK-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(body.email_sent, true);
    assert.equal(runtime.licenses.rows.length, 2);
    assert.deepEqual(Array.from(runtime.licenses.rows[1].slice(1, 15)), [
        'buyer@example.com', 'Active', 'Pro', 'subscription', '2027-08-07', 3,
        'Test Buyer', runtime.licenses.rows[1][8], 'PAYUNi', 'PAYUNI-001', '990',
        'TWD', 'payuni_subscription', runtime.licenses.rows[1][14]
    ]);
    assert.deepEqual(runtime.lockEvents, ['wait:30000', 'release']);
    assert.equal(runtime.sentEmails.length, 1);
    assert.equal(runtime.sentEmails[0].subject, '你的留友封 Pro 已開通');
    assert.doesNotMatch(runtime.sentEmails[0].plainBody, /TBK-/);
    assert.match(runtime.sentEmails[0].plainBody, /輸入這次付款使用的 Email/);
}

{
    const runtime = createRuntime();
    const founder = payload({
        email: 'Founder@Example.com',
        entitlement_type: 'founding_supporter',
        sub_expiry: 'never',
        source: 'payuni_donate_import',
        payment_id: 'DONATE-001'
    });
    const first = parse(runtime.handleCreateLicense(founder));
    const second = parse(runtime.handleCreateLicense({ ...founder, payment_id: 'DONATE-002' }));
    assert.equal(first.success, true);
    assert.equal(second.entitlement_duplicate, true);
    assert.equal(runtime.licenses.rows.length, 2);
    assert.equal(runtime.sentEmails.length, 1);
    assert.equal(runtime.sentEmails[0].subject, '你的留友封 Pro 已開通（創始支持者）');
    assert.match(runtime.sentEmails[0].plainBody, /永久 Pro/);
}

{
    const existing = [
        'TBK-AAAA-BBBB-CCCC', 'buyer@example.com', 'Active', 'Pro', 'subscription',
        '2027-08-07', 3, 'Buyer', '2026-08-07T00:00:00.000Z', 'PAYUNi',
        'PAYUNI-RETRY', '990', 'TWD', 'payuni_subscription', '', ''
    ];
    const runtime = createRuntime({ rows: [headers(), existing] });
    const body = parse(runtime.handleCreateLicense(payload({ payment_id: 'PAYUNI-RETRY' })));
    assert.equal(body.payment_duplicate, true);
    assert.equal(runtime.licenses.rows.length, 2);
    assert.equal(runtime.sentEmails.length, 1);
    assert.match(runtime.licenses.rows[1][14], /^\d{4}-\d{2}-\d{2}T/);
}

{
    const runtime = createRuntime();
    const body = parse(runtime.handleCreateLicense(payload({ send_email: false })));
    assert.equal(body.success, true);
    assert.equal(body.email_sent, false);
    assert.equal(runtime.sentEmails.length, 0);
    assert.equal(runtime.licenses.rows[1][14], '');
}

{
    const runtime = createRuntime({ rejectAlias: true });
    const body = parse(runtime.handleCreateLicense(payload()));
    assert.equal(body.success, true);
    assert.equal(runtime.sentEmails.length, 1);
    assert.equal(runtime.sentEmails[0].options.from, undefined);
    assert.equal(runtime.sentEmails[0].options.replyTo, 'support@example.com');
}

{
    const runtime = createRuntime();
    const body = parse(runtime.handleCreateLicense(payload({ max_devices: 4 })));
    assert.equal(body.error, 'INVALID_MAX_DEVICES');
    assert.equal(runtime.licenses.rows.length, 1);
    assert.deepEqual(runtime.lockEvents, []);
}

{
    const runtime = createRuntime();
    const body = parse(runtime.handleCreateLicense(payload({ admin_secret: 'wrong' })));
    assert.equal(body.error, 'UNAUTHORIZED');
    assert.equal(runtime.licenses.rows.length, 1);
    assert.equal(runtime.sentEmails.length, 0);
}

{
    const runtime = createRuntime();
    parse(runtime.handleCreateLicense(payload({ display_name: '<img src=x onerror=alert(1)>' })));
    assert.doesNotMatch(runtime.sentEmails[0].options.htmlBody, /<img src=x/);
    assert.match(runtime.sentEmails[0].options.htmlBody, /&lt;img src=x/);
}

function subscriptionPayment(overrides = {}) {
    return {
        action: 'apply_subscription_payment',
        admin_secret: 'test-secret',
        email: 'buyer@example.com',
        billing_cycle: 'month',
        sub_expiry: '2026-09-07',
        payment_provider: 'PAYUNi',
        payment_id: 'UNIPAY-001',
        period_trade_no: 'PERIOD-001',
        period_order_no: 'ORDER-001_1',
        payment_amount: '129',
        payment_currency: 'TWD',
        paid_at: '2026-08-07',
        source: 'payuni_subscription',
        send_email: true,
        ...overrides
    };
}

{
    const runtime = createRuntime();
    const first = parse(runtime.handleApplySubscriptionPayment(subscriptionPayment()));
    assert.equal(first.success, true);
    assert.equal(first.created, true);
    assert.equal(first.entitlement_expiry, '2026-09-07');
    assert.equal(runtime.licenses.rows.length, 2);
    assert.equal(runtime.payments.rows.length, 2);
    assert.equal(runtime.sentEmails.length, 1);

    const renewed = parse(runtime.handleApplySubscriptionPayment(subscriptionPayment({
        payment_id: 'UNIPAY-002',
        period_order_no: 'ORDER-001_2',
        sub_expiry: '2026-10-07'
    })));
    assert.equal(renewed.renewed, true);
    assert.equal(renewed.entitlement_expiry, '2026-10-07');
    assert.equal(runtime.licenses.rows.length, 2);
    assert.equal(runtime.payments.rows.length, 3);
    assert.equal(runtime.licenses.rows[1][5], '2026-10-07');
    assert.equal(runtime.sentEmails.length, 1);
}

{
    const runtime = createRuntime();
    parse(runtime.handleApplySubscriptionPayment(subscriptionPayment()));
    const duplicate = parse(runtime.handleApplySubscriptionPayment(subscriptionPayment()));
    assert.equal(duplicate.payment_duplicate, true);
    assert.equal(runtime.licenses.rows.length, 2);
    assert.equal(runtime.payments.rows.length, 2);
    assert.equal(runtime.sentEmails.length, 1);
}

{
    const runtime = createRuntime();
    const invalid = parse(runtime.handleApplySubscriptionPayment(subscriptionPayment({ payment_amount: '98' })));
    assert.equal(invalid.error, 'INVALID_PAYMENT_AMOUNT');
    assert.equal(runtime.licenses.rows.length, 1);
    assert.equal(runtime.payments.rows.length, 1);
}

{
    const runtime = createRuntime();
    const invalid = parse(runtime.handleApplySubscriptionPayment(subscriptionPayment({ payment_amount: '69' })));
    assert.equal(invalid.error, 'INVALID_PAYMENT_AMOUNT');
    assert.equal(runtime.licenses.rows.length, 1);
    assert.equal(runtime.payments.rows.length, 1);
}

{
    const runtime = createRuntime();
    const sandbox = parse(runtime.handleApplySubscriptionPayment(subscriptionPayment({
        payment_provider: 'PAYUNi Sandbox',
        source: 'payuni_sandbox',
        payment_id: 'SANDBOX-001'
    })));
    assert.equal(sandbox.success, true);
    assert.equal(runtime.payments.rows[1][0], 'PAYUNi Sandbox');
}

console.log('license-apps-script-create-license.test.mjs: ok');
