/**
 * ThreadsBlocker PAYUNi checkout and notification relay.
 * ADR: docs/adr/0015-payuni-dynamic-checkout-relay.md
 * ADR: docs/adr/0016-payuni-production-pages-and-manual-invoicing.md
 * SDD: docs/SDD_3.0_LICENSE_SERVICE.md
 */

import { renderCheckoutPage } from "./checkout-page.js";

const PAYUNI_API_ORIGINS = Object.freeze({
  sandbox: "https://sandbox-api.payuni.com.tw",
  production: "https://api.payuni.com.tw"
});
const MAX_BODY_BYTES = 32 * 1024;
const ORDER_PREFIX = "checkout:";
const PERIOD_PREFIX = "period:";
const PRODUCT_DESCRIPTION = "ThreadsBlocker Pro";
const VALID_PLANS = new Set(["month", "year", "early_year"]);
const PRICE_CATALOG = Object.freeze({
  month: Object.freeze({ cycle: "month", tier: "standard", amount: 129, kind: "period" }),
  year: Object.freeze({ cycle: "year", tier: "standard", amount: 990, kind: "single" }),
  early_year: Object.freeze({ cycle: "year", tier: "early", amount: 690, kind: "single" })
});

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ success: false, error: error.message }, error.status);
      }
      console.error(JSON.stringify({ event: "license_worker_error", kind: error instanceof Error ? error.name : "unknown" }));
      return json({ success: false, error: "INTERNAL_ERROR" }, 500);
    }
  }
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/pro")) {
    return new Response(renderCheckoutPage({ mode: "standard", sandbox: env.PAYUNI_ENV === "sandbox", paymentLinks: checkoutPaymentLinks(env, "standard") }), {
      headers: securityHeaders("text/html; charset=utf-8", PAYUNI_API_ORIGINS[env.PAYUNI_ENV])
    });
  }
  if (request.method === "GET" && url.pathname === "/pro/early") {
    if (!isEarlyBirdEnabled(env)) return new Response("Early-bird offer is not active", { status: 404, headers: securityHeaders("text/plain; charset=utf-8") });
    return new Response(renderCheckoutPage({ mode: "early", sandbox: env.PAYUNI_ENV === "sandbox", paymentLinks: checkoutPaymentLinks(env, "early") }), { headers: securityHeaders("text/html; charset=utf-8", PAYUNI_API_ORIGINS[env.PAYUNI_ENV]) });
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ success: true, service: "threadsblocker-license" });
  }
  if (request.method === "GET" && url.pathname === "/ready") {
    const missing = readinessProblems(env);
    return json({ success: missing.length === 0, environment: env.PAYUNI_ENV || "unknown", configured: missing.length === 0, missing }, missing.length === 0 ? 200 : 503);
  }
  if (request.method === "POST" && url.pathname === "/api/checkout") {
    return handleCheckout(request, env);
  }
  if (request.method === "POST" && url.pathname === "/payuni/notify") {
    return handlePayuniCallback(request, env, false);
  }
  if (request.method === "POST" && url.pathname === "/payuni/return") {
    return handlePayuniCallback(request, env, true);
  }
  return new Response("Not Found", { status: 404, headers: securityHeaders("text/plain; charset=utf-8") });
}

async function handleCheckout(request, env) {
  assertConfigured(env, ["PAYUNI_ENV", "PAYUNI_MER_ID", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "PUBLIC_BASE_URL"]);
  const body = await readJsonBounded(request);
  const email = normalizeEmail(body.email);
  const planId = VALID_PLANS.has(body.plan) ? body.plan : "";
  if (!email) return json({ success: false, error: "INVALID_EMAIL" }, 400);
  if (!planId) return json({ success: false, error: "INVALID_PLAN" }, 400);
  if (planId === "early_year" && !isEarlyBirdEnabled(env)) return json({ success: false, error: "EARLY_BIRD_INACTIVE" }, 403);

  const selected = PRICE_CATALOG[planId];
  const { cycle, tier, amount, kind } = selected;
  const merTradeNo = createMerchantOrderId();
  const now = new Date();
  const taipeiDate = dateParts(now, "Asia/Taipei");
  const checkout = { merTradeNo, email, planId, cycle, tier, amount, kind, createdAt: now.toISOString() };
  await env.CHECKOUTS.put(ORDER_PREFIX + merTradeNo, JSON.stringify(checkout));

  const publicBase = new URL(env.PUBLIC_BASE_URL);
  const callbackFields = {
    NotifyURL: new URL("/payuni/notify", publicBase).toString(),
    ReturnURL: new URL("/payuni/return", publicBase).toString(),
    BackURL: new URL(planId === "early_year" ? "/pro/early" : "/pro", publicBase).toString()
  };
  const inner = kind === "period" ? {
    MerID: env.PAYUNI_MER_ID,
    MerTradeNo: merTradeNo,
    PeriodAmt: String(amount),
    ProdDesc: PRODUCT_DESCRIPTION + " monthly",
    PayerEmail: email,
    PayerFix: "3",
    PeriodType: "month",
    PeriodDate: String(taipeiDate.day),
    PeriodTimes: "12",
    FType: "build",
    API3D: "1",
    ...callbackFields,
    TradeLExpireSec: "600"
  } : {
    MerID: env.PAYUNI_MER_ID,
    MerTradeNo: merTradeNo,
    TradeAmt: String(amount),
    Timestamp: String(Math.floor(now.getTime() / 1000)),
    UsrMail: email,
    UsrMailFix: "1",
    ProdDesc: PRODUCT_DESCRIPTION + (tier === "early" ? " early annual" : " annual"),
    Credit: "1",
    API3D: "1",
    ...callbackFields,
    TradeLExpireSec: "600"
  };
  const encryptInfo = await encryptPayload(inner, env.PAYUNI_HASH_KEY, env.PAYUNI_HASH_IV);
  const hashInfo = await createHashInfo(encryptInfo, env.PAYUNI_HASH_KEY, env.PAYUNI_HASH_IV);
  return json({
    success: true,
    endpoint: payuniEndpoint(env.PAYUNI_ENV, kind),
    fields: { MerID: env.PAYUNI_MER_ID, Version: kind === "period" ? "1.0" : "2.0", EncryptInfo: encryptInfo, HashInfo: hashInfo }
  });
}

async function handlePayuniCallback(request, env, showHtml) {
  assertConfigured(env, ["PAYUNI_ENV", "PAYUNI_MER_ID", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "LICENSE_APPS_SCRIPT_URL", "LICENSE_APPS_SCRIPT_ADMIN_SECRET"]);
  const outer = await readFormBounded(request);
  if (outer.MerID && String(outer.MerID) !== env.PAYUNI_MER_ID) return callbackFailure(showHtml, "INVALID_MERCHANT", 400);
  if (!outer.EncryptInfo || !outer.HashInfo) return callbackFailure(showHtml, "INVALID_PAYLOAD", 400);
  const expectedHash = await createHashInfo(outer.EncryptInfo, env.PAYUNI_HASH_KEY, env.PAYUNI_HASH_IV);
  if (!constantTimeEqual(String(outer.HashInfo).toUpperCase(), expectedHash)) return callbackFailure(showHtml, "INVALID_HASH", 403);

  const inner = await decryptPayload(outer.EncryptInfo, env.PAYUNI_HASH_KEY, env.PAYUNI_HASH_IV);
  const merchantId = String(inner.MerchantId || inner.MerID || "");
  if (merchantId && merchantId !== env.PAYUNI_MER_ID) return callbackFailure(showHtml, "INVALID_MERCHANT", 400);
  if (!isSuccessfulPayment(inner.Status || outer.Status)) return callbackFailure(showHtml, "PAYMENT_NOT_SUCCESS", 422);

  const merTradeNo = safeIdentifier(inner.MerTradeNo);
  const paymentId = safeIdentifier(inner.TradeNo || inner.UOPTradeNo || inner.OrderNo);
  if (!paymentId) return callbackFailure(showHtml, "INVALID_TRANSACTION", 400);
  const storedOrder = merTradeNo ? await env.CHECKOUTS.get(ORDER_PREFIX + merTradeNo, "json") : null;
  let paymentContext = isCheckoutRecord(storedOrder) && storedOrder.merTradeNo === merTradeNo ? storedOrder : null;
  if (paymentContext && resolvePaymentEmail(inner) && resolvePaymentEmail(inner) !== paymentContext.email) return callbackFailure(showHtml, "EMAIL_MISMATCH", 409);
  if (!paymentContext) paymentContext = await staticPaymentContext(inner, env);
  if (!paymentContext) return callbackFailure(showHtml, "ORDER_NOT_FOUND", 404);
  const authAmount = parseMoney(paymentContext.kind === "period" ? (inner.AuthAmt || inner.PeriodAmt || inner.TradeAmt) : (inner.TradeAmt || inner.AuthAmt || inner.Amount));
  if (authAmount !== paymentContext.amount) return callbackFailure(showHtml, "AMOUNT_MISMATCH", 409);

  const paidDate = normalizePayuniDate(inner.AuthDay) || dateParts(new Date(), "Asia/Taipei").iso;
  const expiry = calculateExpiry(paidDate, paymentContext.cycle, normalizePayuniDate(inner.NextAuthDate));
  const appsScriptResponse = await fetch(env.LICENSE_APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "apply_subscription_payment",
      admin_secret: env.LICENSE_APPS_SCRIPT_ADMIN_SECRET,
      email: paymentContext.email,
      billing_cycle: paymentContext.cycle,
      sub_expiry: expiry,
      payment_provider: env.PAYUNI_ENV === "sandbox" ? "PAYUNi Sandbox" : "PAYUNi",
      payment_id: paymentId,
      period_trade_no: safeIdentifier(inner.PeriodTradeNo),
      period_order_no: safeIdentifier(inner.PeriodOrderNo),
      payment_amount: String(authAmount),
      payment_currency: "TWD",
      paid_at: paidDate,
      source: env.PAYUNI_ENV === "sandbox" ? "payuni_sandbox" : "payuni_subscription",
      send_email: true
    })
  });
  const appsResult = await readSmallJsonResponse(appsScriptResponse);
  if (!appsScriptResponse.ok || !appsResult.success) return callbackFailure(showHtml, "LICENSE_SYNC_FAILED", 503);

  if (showHtml) return paymentResultPage(true);
  return new Response("SUCCESS", { status: 200, headers: securityHeaders("text/plain; charset=utf-8") });
}

async function readJsonBounded(request) {
  const text = await readBodyBounded(request);
  try { return JSON.parse(text); } catch { throw new HttpError(400, "INVALID_JSON"); }
}

async function readFormBounded(request) {
  return Object.fromEntries(new URLSearchParams(await readBodyBounded(request)).entries());
}

async function readBodyBounded(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw new HttpError(413, "PAYLOAD_TOO_LARGE");
  return text;
}

async function readSmallJsonResponse(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return { success: false };
  const text = await response.text();
  if (text.length > MAX_BODY_BYTES) return { success: false };
  try { return JSON.parse(text); } catch { return { success: false }; }
}

export async function encryptPayload(values, keyText, ivText) {
  const plaintext = new URLSearchParams(values).toString();
  const key = await importAesKey(keyText, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: encode(ivText), tagLength: 128 }, key, encode(plaintext)));
  const cipher = encrypted.slice(0, -16);
  const tag = encrypted.slice(-16);
  return asciiToHex(bytesToBase64(cipher) + ":::" + bytesToBase64(tag));
}

export async function decryptPayload(encryptInfo, keyText, ivText) {
  const packed = hexToAscii(encryptInfo);
  const separator = packed.indexOf(":::");
  if (separator < 1) throw new HttpError(400, "INVALID_ENCRYPT_INFO");
  const cipher = base64ToBytes(packed.slice(0, separator));
  const tag = base64ToBytes(packed.slice(separator + 3));
  const combined = new Uint8Array(cipher.length + tag.length);
  combined.set(cipher); combined.set(tag, cipher.length);
  const key = await importAesKey(keyText, ["decrypt"]);
  let plaintext;
  try { plaintext = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: encode(ivText), tagLength: 128 }, key, combined)); }
  catch { throw new HttpError(403, "DECRYPT_FAILED"); }
  return Object.fromEntries(new URLSearchParams(plaintext).entries());
}

export async function createHashInfo(encryptInfo, keyText, ivText) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encode(keyText + encryptInfo + ivText)));
  return Array.from(digest, value => value.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function importAesKey(keyText, usages) {
  const bytes = encode(keyText.trim());
  if (bytes.length !== 32) throw new Error("PAYUNI_HASH_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, usages);
}

function encode(value) { return new TextEncoder().encode(String(value).trim()); }
function bytesToBase64(bytes) { let value = ""; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); }
function base64ToBytes(value) { const decoded = atob(value); return Uint8Array.from(decoded, char => char.charCodeAt(0)); }
function asciiToHex(value) { return Array.from(encode(value), byte => byte.toString(16).padStart(2, "0")).join(""); }
function hexToAscii(value) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2) throw new HttpError(400, "INVALID_HEX");
  const bytes = Uint8Array.from(value.match(/../g), pair => Number.parseInt(pair, 16));
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(left, right) {
  const a = encode(left), b = encode(right);
  if (a.length !== b.length) return false;
  let diff = 0; for (let index = 0; index < a.length; index++) diff |= a[index] ^ b[index];
  return diff === 0;
}

function isEarlyBirdEnabled(env, now = new Date()) {
  const end = String(env.EARLY_BIRD_END || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(end) && dateParts(now, "Asia/Taipei").iso <= end;
}

function dateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), iso: `${values.year}-${values.month}-${values.day}` };
}

function calculateExpiry(paidDate, cycle, nextAuthDate) {
  if (nextAuthDate && nextAuthDate > paidDate) return nextAuthDate;
  const [year, month, day] = paidDate.split("-").map(Number);
  const next = cycle === "year" ? addCalendarMonths(year, month, day, 12) : addCalendarMonths(year, month, day, 1);
  return next;
}

function addCalendarMonths(year, month, day, amount) {
  const total = year * 12 + (month - 1) + amount;
  const targetYear = Math.floor(total / 12), targetMonth = total % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function normalizePayuniDate(value) {
  const compact = String(value || "").trim();
  if (/^\d{8}$/.test(compact)) return `${compact.slice(0,4)}-${compact.slice(4,6)}-${compact.slice(6,8)}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(compact) ? compact : "";
}

function createMerchantOrderId() {
  const date = dateParts(new Date(), "Asia/Taipei").iso.replaceAll("-", "");
  const random = Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `TBK${date}${random}`;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function resolvePaymentEmail(payment) {
  for (const value of [payment.UsrMail, payment.UserMail, payment.BuyerMail, payment.BuyerEmail, payment.CustomerEmail, payment.PayerEmail, payment.TradeMail, payment.EmailAddress, payment.Email]) {
    const email = normalizeEmail(value);
    if (email) return email;
  }
  return "";
}

async function staticPaymentContext(inner, env) {
  if (env.PAYUNI_ENV !== "production") return null;
  const amount = parseMoney(inner.TradeAmt || inner.AuthAmt || inner.PeriodAmt || inner.Amount || inner.Amt);
  const selected = Object.entries(PRICE_CATALOG).find(([, plan]) => plan.amount === amount);
  if (!selected) return null;
  const [planId, plan] = selected;
  if (planId === "early_year" && !isEarlyBirdEnabled(env)) return null;
  const periodTradeNo = safeIdentifier(inner.PeriodTradeNo);
  let email = resolvePaymentEmail(inner);
  if (plan.kind === "period" && periodTradeNo) {
    if (email) {
      await env.CHECKOUTS.put(PERIOD_PREFIX + periodTradeNo, JSON.stringify({ email }), { expirationTtl: 370 * 24 * 60 * 60 });
    } else {
      const mapping = await env.CHECKOUTS.get(PERIOD_PREFIX + periodTradeNo, "json");
      email = normalizeEmail(mapping && mapping.email);
    }
  }
  if (!email) return null;
  return { planId, cycle: plan.cycle, tier: plan.tier, amount: plan.amount, kind: plan.kind, email };
}

function isSuccessfulPayment(value) {
  return ["SUCCESS", "PAID", "1"].includes(String(value || "").trim().toUpperCase());
}

function hostedPaymentLinks(env) {
  if (env.PAYUNI_ENV !== "production") return null;
  const links = {
    month: String(env.PAYUNI_MONTHLY_URL || "").trim(),
    year: String(env.PAYUNI_ANNUAL_URL || "").trim(),
    early_year: String(env.PAYUNI_EARLY_ANNUAL_URL || "").trim()
  };
  return Object.values(links).every((value) => isAllowedHostedPaymentUrl(value, env.PAYUNI_MER_ID)) ? links : null;
}

function checkoutPaymentLinks(env, mode) {
  const links = hostedPaymentLinks(env);
  if (!links) return null;
  return mode === "early"
    ? { early_year: links.early_year }
    : { month: links.month, year: links.year };
}

function isAllowedHostedPaymentUrl(value, merchantId) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.payuni.com.tw" && url.pathname.split("/").includes(String(merchantId || ""));
  } catch { return false; }
}

function safeIdentifier(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(normalized) ? normalized : "";
}

function parseMoney(value) {
  return /^\d+$/.test(String(value || "")) ? Number(value) : Number.NaN;
}

function isCheckoutRecord(value) {
  return value && typeof value === "object" && normalizeEmail(value.email) === value.email && VALID_PLANS.has(value.planId) && (value.cycle === "month" || value.cycle === "year") && (value.kind === "period" || value.kind === "single") && Number.isInteger(value.amount);
}

function assertConfigured(env, names) {
  for (const name of names) if (!String(env[name] || "").trim()) throw new Error(`Missing binding: ${name}`);
  if (!PAYUNI_API_ORIGINS[env.PAYUNI_ENV]) throw new Error("PAYUNI_ENV must be sandbox or production");
  if (env.PAYUNI_ENV === "sandbox" && !String(env.PAYUNI_MER_ID || "").startsWith("S")) throw new Error("Sandbox requires a sandbox merchant");
  if (encode(env.PAYUNI_HASH_IV || "").length !== 16) throw new Error("PAYUNI_HASH_IV must be 16 bytes");
}

function readinessProblems(env) {
  const required = ["PAYUNI_ENV", "PAYUNI_MER_ID", "PAYUNI_HASH_KEY", "PAYUNI_HASH_IV", "PUBLIC_BASE_URL", "LICENSE_APPS_SCRIPT_URL", "LICENSE_APPS_SCRIPT_ADMIN_SECRET"];
  const missing = required.filter(name => !String(env[name] || "").trim());
  if (!env.CHECKOUTS) missing.push("CHECKOUTS");
  if (env.PAYUNI_HASH_KEY && encode(env.PAYUNI_HASH_KEY).length !== 32) missing.push("PAYUNI_HASH_KEY_LENGTH");
  if (env.PAYUNI_HASH_IV && encode(env.PAYUNI_HASH_IV).length !== 16) missing.push("PAYUNI_HASH_IV_LENGTH");
  if (env.PAYUNI_ENV === "sandbox" && env.PAYUNI_MER_ID && !String(env.PAYUNI_MER_ID).startsWith("S")) missing.push("PAYUNI_SANDBOX_MERCHANT");
  if (env.PAYUNI_ENV === "production" && !hostedPaymentLinks(env)) missing.push("PAYUNI_HOSTED_PAYMENT_LINKS");
  return Array.from(new Set(missing));
}

function payuniEndpoint(environment, kind) {
  const origin = PAYUNI_API_ORIGINS[environment];
  if (!origin) throw new Error("Invalid PAYUNi environment");
  return origin + (kind === "period" ? "/api/period/Page" : "/api/upp");
}

function paymentResultPage(success) {
  const title = success ? "付款完成" : "付款處理中";
  const detail = success ? "Pro 資格正在開通，請到信箱查看通知。" : "我們正在確認付款結果，請稍後查看信箱。";
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#11130f;color:#f3f1e9;font-family:sans-serif}.box{max-width:520px;padding:48px;border:1px solid #4d5348;border-radius:20px}h1{font:700 52px Georgia,serif;margin:0 0 16px;color:#b9f227}p{line-height:1.8;color:#c9cdc3}</style><main class="box"><h1>${title}</h1><p>${detail}</p><p>付款完成後，Pro 開通信會寄到付款時填寫的 Email。</p></main>`, { headers: securityHeaders("text/html; charset=utf-8") });
}

function callbackFailure(showHtml, code, status) {
  if (showHtml) return paymentResultPage(false);
  return new Response(code, { status, headers: securityHeaders("text/plain; charset=utf-8") });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: securityHeaders("application/json; charset=utf-8") });
}

function securityHeaders(contentType, formAction = PAYUNI_API_ORIGINS.production) {
  return {
    "content-type": contentType,
    "cache-control": "no-store",
    "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action ${formAction}; base-uri 'none'; frame-ancestors 'none'`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  };
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.name = "HttpError"; this.status = status; }
}

export const __test = { routeRequest, calculateExpiry, hostedPaymentLinks, isEarlyBirdEnabled, payuniEndpoint, readinessProblems, PRICE_CATALOG };
