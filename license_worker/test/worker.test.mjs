// ADR: docs/adr/0015-payuni-dynamic-checkout-relay.md
import assert from "node:assert/strict";
import test from "node:test";
import worker, { __test, createHashInfo, decryptPayload, encryptPayload } from "../src/index.js";
import { renderCheckoutPage } from "../src/checkout-page.js";

const KEY = "12345678901234567890123456789012";
const IV = "1234567890123456";
const MER_ID = "U012070036";
const PAYMENT_LINKS = Object.freeze({
  month: "https://api.payuni.com.tw/api/period/U012070036/ThJq7toMSg9",
  year: "https://api.payuni.com.tw/api/uop/receive_info/2/1/U012070036/CA9tPkodFvyy7yKml2fK2",
  early_year: "https://api.payuni.com.tw/api/uop/receive_info/2/1/U012070036/M4J17naF4nDr2Zmki85sJ"
});

class MockKV {
  constructor() { this.values = new Map(); }
  async put(key, value) { this.values.set(key, value); }
  async get(key, type) {
    const value = this.values.get(key) ?? null;
    return type === "json" && value ? JSON.parse(value) : value;
  }
}

function env(overrides = {}) {
  return {
    PAYUNI_MER_ID: MER_ID,
    PAYUNI_ENV: "production",
    PAYUNI_HASH_KEY: KEY,
    PAYUNI_HASH_IV: IV,
    PUBLIC_BASE_URL: "https://license.example.test",
    PAYUNI_MONTHLY_URL: PAYMENT_LINKS.month,
    PAYUNI_ANNUAL_URL: PAYMENT_LINKS.year,
    PAYUNI_EARLY_ANNUAL_URL: PAYMENT_LINKS.early_year,
    EARLY_BIRD_END: "",
    LICENSE_APPS_SCRIPT_URL: "https://script.example.test/exec",
    LICENSE_APPS_SCRIPT_ADMIN_SECRET: "internal-secret",
    CHECKOUTS: new MockKV(),
    ...overrides
  };
}

test("matches PAYUNi official AES-256-GCM sample", async () => {
  const encrypted = await encryptPayload({ MerID: "AAA", MerTradeNo: "BBB" }, KEY, IV);
  assert.equal(encrypted, "47396636346f66735853533167396942344f587a3775696b34752b596e70452b3a3a3a4373354a5a5143306b7153467531354c6e6f554a69773d3d");
  assert.deepEqual(await decryptPayload(encrypted, KEY, IV), { MerID: "AAA", MerTradeNo: "BBB" });
});

test("renders standard monthly/annual page and a separate early annual page", () => {
  const standard = renderCheckoutPage();
  assert.match(standard, /name="plan" value="month"/);
  assert.match(standard, /name="plan" value="year"/);
  assert.match(standard, /NT\$129/);
  assert.match(standard, /NT\$990/);
  assert.doesNotMatch(standard, /NT\$690/);
  assert.doesNotMatch(standard, /PAYUNI_HASH_KEY/);

  const early = renderCheckoutPage({ mode: "early" });
  assert.match(early, /name="plan" value="early_year"/);
  assert.match(early, /NT\$690/);
  assert.match(early, /不會自動續扣/);
  assert.doesNotMatch(early, /月付由 PAYUNi/);
  assert.doesNotMatch(early, /NT\$69[^0]/);
});

test("renders the three allowlisted PAYUNi production links without collecting Email twice", async () => {
  const standardResponse = await worker.fetch(new Request("https://license.example.test/pro"), env());
  const standard = await standardResponse.text();
  assert.match(standard, new RegExp(PAYMENT_LINKS.month.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(standard, new RegExp(PAYMENT_LINKS.year.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(standard, /每月 5 日扣款，共 12 期/);
  assert.doesNotMatch(standard, /id="email"/);
  assert.doesNotMatch(standard, /fetch\('\/api\/checkout'/);

  const earlyResponse = await worker.fetch(new Request("https://license.example.test/pro/early"), env({ EARLY_BIRD_END: "2099-12-31" }));
  const early = await earlyResponse.text();
  assert.match(early, new RegExp(PAYMENT_LINKS.early_year.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(early, /id="email"/);
  assert.equal((await worker.fetch(new Request("https://license.example.test/ready"), env())).status, 200);
});

test("labels sandbox pages and routes only to PAYUNi sandbox hosts", async () => {
  const html = renderCheckoutPage({ sandbox: true });
  assert.match(html, /SANDBOX 測試環境/);
  assert.match(html, /不會產生真實扣款/);
  assert.equal(__test.payuniEndpoint("sandbox", "period"), "https://sandbox-api.payuni.com.tw/api/period/Page");
  assert.equal(__test.payuniEndpoint("sandbox", "single"), "https://sandbox-api.payuni.com.tw/api/upp");

  const pageResponse = await worker.fetch(new Request("https://license.example.test/pro"), env({ PAYUNI_ENV: "sandbox" }));
  assert.match(pageResponse.headers.get("content-security-policy"), /form-action https:\/\/sandbox-api\.payuni\.com\.tw/);
  assert.doesNotMatch(pageResponse.headers.get("content-security-policy"), /form-action https:\/\/api\.payuni\.com\.tw/);

  const response = await worker.fetch(new Request("https://license.example.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "sandbox@example.com", plan: "year" })
  }), env({ PAYUNI_ENV: "sandbox", PAYUNI_MER_ID: "S003219190" }));
  assert.equal((await response.json()).endpoint, "https://sandbox-api.payuni.com.tw/api/upp");
});

test("reports sandbox readiness without exposing secret values", async () => {
  const incomplete = env({ PAYUNI_ENV: "sandbox", PAYUNI_MER_ID: "S003219190", PAYUNI_HASH_KEY: "", PAYUNI_HASH_IV: "" });
  const response = await worker.fetch(new Request("https://license.example.test/ready"), incomplete);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.environment, "sandbox");
  assert.deepEqual(body.missing.sort(), ["PAYUNI_HASH_IV", "PAYUNI_HASH_KEY"]);
  assert.equal(JSON.stringify(body).includes(KEY), false);

  const ready = await worker.fetch(new Request("https://license.example.test/ready"), env({ PAYUNI_ENV: "sandbox", PAYUNI_MER_ID: "S003219190" }));
  assert.equal(ready.status, 200);
  assert.equal((await ready.json()).configured, true);
});

test("creates a dynamic PAYUNi monthly form with server-selected price", async () => {
  const runtime = env();
  const response = await worker.fetch(new Request("https://license.example.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "Buyer@Example.com", plan: "month", amount: 1 })
  }), runtime);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.endpoint, "https://api.payuni.com.tw/api/period/Page");
  assert.equal(result.fields.MerID, MER_ID);
  assert.equal(result.fields.HashInfo, await createHashInfo(result.fields.EncryptInfo, KEY, IV));

  const inner = await decryptPayload(result.fields.EncryptInfo, KEY, IV);
  assert.equal(inner.PayerEmail, "buyer@example.com");
  assert.equal(inner.PayerFix, "3");
  assert.equal(inner.PeriodType, "month");
  assert.equal(inner.PeriodAmt, "129");
    assert.equal(inner.PeriodTimes, "12");
  assert.equal(inner.NotifyURL, "https://license.example.test/payuni/notify");
  assert.ok(await runtime.CHECKOUTS.get("checkout:" + inner.MerTradeNo));
});

test("verifies Notify, binds it to the pre-checkout Email, and forwards one payment", async () => {
  const runtime = env();
  const checkoutResponse = await worker.fetch(new Request("https://license.example.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.com", plan: "month" })
  }), runtime);
  const checkout = await checkoutResponse.json();
  const order = await decryptPayload(checkout.fields.EncryptInfo, KEY, IV);
  const notifyInner = {
    Status: "SUCCESS",
    MerchantId: MER_ID,
    AuthDay: "20260807",
    AuthTime: "120000",
    ProdDesc: "ThreadsBlocker Pro monthly",
    MerTradeNo: order.MerTradeNo,
    PeriodTradeNo: "PERIOD001",
    TradeNo: "UNI001",
    PeriodOrderNo: order.MerTradeNo + "_1",
    AuthAmt: "129",
    NextAuthDate: "20260907"
  };
  const encryptInfo = await encryptPayload(notifyInner, KEY, IV);
  const hashInfo = await createHashInfo(encryptInfo, KEY, IV);
  const forwarded = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    forwarded.push({ url, body: JSON.parse(options.body) });
    return Response.json({ success: true });
  };
  try {
    const body = new URLSearchParams({ Status: "SUCCESS", MerID: MER_ID, Version: "1.0", EncryptInfo: encryptInfo, HashInfo: hashInfo });
    const response = await __test.routeRequest(new Request("https://license.example.test/payuni/notify", { method: "POST", body }), runtime);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "SUCCESS");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].url, runtime.LICENSE_APPS_SCRIPT_URL);
  assert.deepEqual(forwarded[0].body, {
    action: "apply_subscription_payment",
    admin_secret: "internal-secret",
    email: "buyer@example.com",
    billing_cycle: "month",
    sub_expiry: "2026-09-07",
    payment_provider: "PAYUNi",
    payment_id: "UNI001",
    period_trade_no: "PERIOD001",
    period_order_no: order.MerTradeNo + "_1",
    payment_amount: "129",
    payment_currency: "TWD",
    paid_at: "2026-08-07",
    source: "payuni_subscription",
    send_email: true
  });
});

test("forwards an annual UPP payment without recurring identifiers", async () => {
  const runtime = env();
  const checkoutResponse = await worker.fetch(new Request("https://license.example.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "annual@example.com", plan: "year" })
  }), runtime);
  const checkout = await checkoutResponse.json();
  const order = await decryptPayload(checkout.fields.EncryptInfo, KEY, IV);
  const notifyInner = {
    Status: "SUCCESS",
    MerID: MER_ID,
    AuthDay: "20260807",
    MerTradeNo: order.MerTradeNo,
    TradeNo: "UNIYEAR1",
    TradeAmt: "990"
  };
  const encryptInfo = await encryptPayload(notifyInner, KEY, IV);
  const hashInfo = await createHashInfo(encryptInfo, KEY, IV);
  const forwarded = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    forwarded.push({ url, body: JSON.parse(options.body) });
    return Response.json({ success: true });
  };
  try {
    const body = new URLSearchParams({ Status: "SUCCESS", MerID: MER_ID, Version: "2.0", EncryptInfo: encryptInfo, HashInfo: hashInfo });
    const response = await __test.routeRequest(new Request("https://license.example.test/payuni/notify", { method: "POST", body }), runtime);
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(forwarded[0].body.billing_cycle, "year");
  assert.equal(forwarded[0].body.sub_expiry, "2027-08-07");
  assert.equal(forwarded[0].body.payment_amount, "990");
  assert.equal(forwarded[0].body.period_trade_no, "");
  assert.equal(forwarded[0].body.period_order_no, "");
});

test("accepts a signed hosted annual-page Notify and binds the PAYUNi Email", async () => {
  const runtime = env();
  const notifyInner = {
    Status: "SUCCESS",
    MerID: MER_ID,
    AuthDay: "20260807",
    TradeNo: "HOSTEDYEAR1",
    TradeAmt: "990",
    UsrMail: "Hosted@Example.com"
  };
  const encryptInfo = await encryptPayload(notifyInner, KEY, IV);
  const hashInfo = await createHashInfo(encryptInfo, KEY, IV);
  const forwarded = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    forwarded.push({ url, body: JSON.parse(options.body) });
    return Response.json({ success: true });
  };
  try {
    const body = new URLSearchParams({ Status: "SUCCESS", Version: "2.0", EncryptInfo: encryptInfo, HashInfo: hashInfo });
    const response = await __test.routeRequest(new Request("https://license.example.test/payuni/notify", { method: "POST", body }), runtime);
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(forwarded.length, 1);
  assert.equal(forwarded[0].body.email, "hosted@example.com");
  assert.equal(forwarded[0].body.billing_cycle, "year");
  assert.equal(forwarded[0].body.payment_amount, "990");
  assert.equal(forwarded[0].body.payment_id, "HOSTEDYEAR1");
});

test("rejects a signed hosted early annual Notify after the configured deadline", async () => {
  const runtime = env({ EARLY_BIRD_END: "2026-08-06" });
  const notifyInner = {
    Status: "SUCCESS", MerID: MER_ID, AuthDay: "20260807", TradeNo: "LATEEARLY1",
    TradeAmt: "690", UsrMail: "late@example.com"
  };
  const encryptInfo = await encryptPayload(notifyInner, KEY, IV);
  const hashInfo = await createHashInfo(encryptInfo, KEY, IV);
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({ success: true }); };
  try {
    const body = new URLSearchParams({ Status: "SUCCESS", Version: "2.0", EncryptInfo: encryptInfo, HashInfo: hashInfo });
    const response = await __test.routeRequest(new Request("https://license.example.test/payuni/notify", { method: "POST", body }), runtime);
    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(called, false);
});

test("remembers a hosted monthly payer for later recurring Notify payloads without Email", async () => {
  const runtime = env();
  const forwarded = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    forwarded.push(JSON.parse(options.body));
    return Response.json({ success: true });
  };
  try {
    for (const notifyInner of [{
      Status: "SUCCESS", MerID: MER_ID, AuthDay: "20260807", TradeNo: "HOSTEDMONTH1",
      AuthAmt: "129", PeriodTradeNo: "HOSTEDPERIOD1", PayerEmail: "month@example.com", NextAuthDate: "20260905"
    }, {
      Status: "SUCCESS", MerID: MER_ID, AuthDay: "20260905", TradeNo: "HOSTEDMONTH2",
      AuthAmt: "129", PeriodTradeNo: "HOSTEDPERIOD1", NextAuthDate: "20261005"
    }]) {
      const encryptInfo = await encryptPayload(notifyInner, KEY, IV);
      const hashInfo = await createHashInfo(encryptInfo, KEY, IV);
      const body = new URLSearchParams({ Status: "SUCCESS", Version: "1.0", EncryptInfo: encryptInfo, HashInfo: hashInfo });
      const response = await __test.routeRequest(new Request("https://license.example.test/payuni/notify", { method: "POST", body }), runtime);
      assert.equal(response.status, 200);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(forwarded.length, 2);
  assert.equal(forwarded[0].email, "month@example.com");
  assert.equal(forwarded[1].email, "month@example.com");
  assert.equal(forwarded[1].payment_id, "HOSTEDMONTH2");
  assert.equal(forwarded[1].billing_cycle, "month");
});

test("rejects tampered callbacks before calling Apps Script", async () => {
  const runtime = env();
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({ success: true }); };
  try {
    const body = new URLSearchParams({ Status: "SUCCESS", MerID: MER_ID, Version: "1.0", EncryptInfo: "00", HashInfo: "BAD" });
    const response = await __test.routeRequest(new Request("https://license.example.test/payuni/notify", { method: "POST", body }), runtime);
    assert.equal(response.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(called, false);
});

test("uses early-bird prices only through the server date switch", async () => {
  assert.equal(__test.isEarlyBirdEnabled({ EARLY_BIRD_END: "" }, new Date("2026-08-07T00:00:00Z")), false);
  assert.equal(__test.isEarlyBirdEnabled({ EARLY_BIRD_END: "2026-08-31" }, new Date("2026-08-07T00:00:00Z")), true);
  assert.equal(__test.PRICE_CATALOG.month.amount, 129);
  assert.equal(__test.PRICE_CATALOG.year.amount, 990);
  assert.equal(__test.PRICE_CATALOG.early_year.amount, 690);
});

test("creates annual and early annual as one-time, non-installment UPP payments", async () => {
  for (const [plan, amount, earlyEnd] of [["year", "990", ""], ["early_year", "690", "2026-08-31"]]) {
    const runtime = env({ EARLY_BIRD_END: earlyEnd });
    const response = await worker.fetch(new Request("https://license.example.test/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "buyer@example.com", plan })
    }), runtime);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.endpoint, "https://api.payuni.com.tw/api/upp");
    assert.equal(result.fields.Version, "2.0");
    const inner = await decryptPayload(result.fields.EncryptInfo, KEY, IV);
    assert.equal(inner.TradeAmt, amount);
    assert.equal(inner.Credit, "1");
    assert.equal(inner.UsrMail, "buyer@example.com");
    assert.equal(inner.UsrMailFix, "1");
    assert.equal(inner.CreditInst, undefined);
    assert.equal(inner.PeriodType, undefined);
  }
});

test("does not expose early annual checkout outside the configured window", async () => {
  const response = await worker.fetch(new Request("https://license.example.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "buyer@example.com", plan: "early_year" })
  }), env());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, "EARLY_BIRD_INACTIVE");
});

test("returns bounded client errors instead of masking them as server failures", async () => {
  const response = await worker.fetch(new Request("https://license.example.test/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json"
  }), env());
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "INVALID_JSON");
});
