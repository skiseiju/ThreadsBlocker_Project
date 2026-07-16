import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

import {
  PUBLIC_SAMPLE_LEGAL_POLICY_VERSION,
  projectPublicPlatformOverview,
  resolveSamplePublicationMode
} from "../src/index.js";
import worker from "../src/index.js";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const source = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const localValues = new Map();
globalThis.localStorage = {
  getItem: (key) => localValues.has(key) ? localValues.get(key) : null,
  setItem: (key, value) => localValues.set(key, String(value)),
  removeItem: (key) => localValues.delete(key)
};
if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { platform: "test", userAgent: "privacy-release-test", onLine: true }
  });
}

const { CONFIG } = await import("../../src/config.js");
const { Storage } = await import("../../src/storage.js");
const { Reporter } = await import("../../src/reporter.js");

function resetStorage() {
  localValues.clear();
  Storage.cache = {};
}

test("platform consent migration never promotes old consent to platform-sync-v3", () => {
  resetStorage();
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_ENABLED, "true");
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_CONSENT_VERSION, "2.7.3");

  Storage.migratePlatformSyncConsent();
  assert.equal(Storage.getPlatformSyncConsentVersion(), "2.7.3");
  assert.equal(Storage.hasPlatformSyncConsentForCurrentVersion(), false);
  assert.equal(Storage.getPlatformSyncEnabled(), false);

  Storage.setPlatformSyncConsentDecision(true);
  assert.equal(Storage.getPlatformSyncConsentVersion(), "platform-sync-v3");
  assert.equal(Storage.hasPlatformSyncConsentForCurrentVersion(), true);
  assert.equal(Storage.getPlatformSyncEnabled(), true);
});

test("credentials consent is independently versioned and default-off", () => {
  resetStorage();
  localStorage.setItem(CONFIG.KEYS.CREDENTIALS_PROCESSING_CONSENT_DECISION, "true");
  localStorage.setItem(CONFIG.KEYS.CREDENTIALS_PROCESSING_CONSENT_VERSION, "2.7.3");
  localStorage.setItem(CONFIG.KEYS.THREE_NO_ACCELERATED_PROFILE_ENABLED, "true");

  assert.equal(Storage.hasCredentialsProcessingConsentForCurrentVersion(), false);
  assert.equal(Storage.getThreeNoAcceleratedProfileEnabled(), false);

  localStorage.removeItem(CONFIG.KEYS.THREE_NO_ACCELERATED_PROFILE_ENABLED);
  assert.equal(Storage.setCredentialsProcessingConsentDecision(true), true);
  assert.equal(Storage.hasCredentialsProcessingConsentForCurrentVersion(), true);
  assert.equal(Storage.getThreeNoAcceleratedProfileEnabled(), false);
  assert.equal(Storage.setThreeNoAcceleratedProfileEnabled(true), true);
  assert.equal(Storage.getThreeNoAcceleratedProfileEnabled(), true);
});

test("all platform upload paths retain the pending-version gate", async () => {
  resetStorage();
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_ENABLED, "true");
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_CONSENT_VERSION, "2.7.3");
  let fetchCalls = 0;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { text: async () => JSON.stringify({ code: 200 }) };
  };

  const result = await Reporter.submitPlatformPayload({ summary: { totalEventCount: 1 } });
  assert.deepEqual(result, { code: 204, skipped: "pending_version_consent" });
  assert.equal(fetchCalls, 0);
  globalThis.fetch = oldFetch;

  const uiSource = source("src/ui.js");
  assert.match(uiSource, /tryAutoSyncPlatformUpload[\s\S]{0,1200}pending_version_consent/);
  assert.match(uiSource, /tryRepairPlatformReupload[\s\S]{0,500}pending_version_consent/);
  assert.match(uiSource, /tryUploadThreeNoScanStats[\s\S]{0,500}pending_version_consent/);
  assert.match(source("src/reporter.js"), /submitPlatformPayload:[\s\S]{0,220}pending_version_consent/);
});

test("page bridge is fail-closed before credentials consent", () => {
  const bridgeSource = source("src/page-bridge.js");
  const events = [];
  const handlers = new Map();
  const storageValues = new Map();
  const originalFetch = () => Promise.resolve({ clone: () => ({ text: async () => "" }) });
  const windowObject = {
    fetch: originalFetch,
    __hegeThreadsAboutPassiveBridge: false,
    addEventListener: (name, handler) => handlers.set(name, handler),
    dispatchEvent: (event) => {
      events.push(event);
      handlers.get(event.type)?.(event);
      return true;
    }
  };
  class FakeCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail || {};
    }
  }
  const context = {
    window: windowObject,
    CustomEvent: FakeCustomEvent,
    URL,
    URLSearchParams,
    Date,
    Math,
    crypto: { randomUUID: () => "test-uuid" },
    location: { href: "https://www.threads.net/@test", origin: "https://www.threads.net", pathname: "/@test" },
    document: { querySelectorAll: () => { throw new Error("document scan must not run before consent"); } },
    localStorage: { getItem: (key) => storageValues.get(key) || null },
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {}
  };

  vm.runInNewContext(bridgeSource, context, { filename: "page-bridge.js" });
  assert.equal(windowObject.fetch, originalFetch);
  assert.equal(events.at(-1)?.detail?.error, "credentials_consent_required");
  assert.equal(handlers.has("hege:threads-credentials-processing-consent"), true);
  assert.match(bridgeSource, /if \(!credentialsProcessingEnabled\) return;/);
  assert.match(bridgeSource, /const installNetworkPatches = \(\) =>/);

  handlers.get("hege:threads-credentials-processing-consent")({
    detail: {
      enabled: true,
      credentialsConsent: true,
      acceleratedProfileEnabled: true,
      policyVersion: "credentials-processing-v1"
    }
  });
  const consentedFetch = windowObject.fetch;
  assert.notEqual(consentedFetch, originalFetch);

  handlers.get("hege:threads-credentials-processing-consent")({
    detail: {
      enabled: true,
      credentialsConsent: true,
      acceleratedProfileEnabled: false,
      policyVersion: "credentials-processing-v1"
    }
  });
  assert.equal(windowObject.fetch, originalFetch);
  assert.equal(events.at(-1)?.detail?.error, "credentials_consent_required");
  assert.match(bridgeSource, /acceleratedProfileEnabled/);

  storageValues.set("hege_credentials_processing_consent", "true");
  storageValues.set("hege_credentials_processing_consent_version", "credentials-processing-v1");
  storageValues.set("hege_three_no_accelerated_profile_enabled", "true");
  handlers.get("storage")({ key: "hege_three_no_accelerated_profile_enabled" });
  assert.notEqual(windowObject.fetch, originalFetch);
  storageValues.set("hege_three_no_accelerated_profile_enabled", "false");
  handlers.get("storage")({ key: "hege_three_no_accelerated_profile_enabled" });
  assert.equal(windowObject.fetch, originalFetch);
  assert.match(bridgeSource, /BRIDGE_CONSENT_STORAGE_KEYS/);
  assert.match(bridgeSource, /setInterval\(\(\) =>/);
});

test("credentials bridge sync combines consent and accelerated state across tabs", () => {
  resetStorage();
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  const bridgeEvents = [];
  class SyncCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail || {};
    }
  }
  globalThis.window = { dispatchEvent: (event) => bridgeEvents.push(event) };
  globalThis.CustomEvent = SyncCustomEvent;

  try {
    Storage.setCredentialsProcessingConsentDecision(true);
    Storage.setThreeNoAcceleratedProfileEnabled(true);
    assert.equal(Storage.syncCredentialsProcessingConsentToBridge(), true);
    assert.deepEqual(bridgeEvents.at(-1)?.detail, {
      enabled: true,
      credentialsConsent: true,
      acceleratedProfileEnabled: true,
      policyVersion: "credentials-processing-v1"
    });

    localStorage.setItem(CONFIG.KEYS.THREE_NO_ACCELERATED_PROFILE_ENABLED, "false");
    Storage.invalidate(CONFIG.KEYS.THREE_NO_ACCELERATED_PROFILE_ENABLED);
    assert.equal(Storage.syncCredentialsProcessingConsentToBridge(), false);
    assert.equal(bridgeEvents.at(-1)?.detail?.enabled, false);

    localStorage.setItem(CONFIG.KEYS.CREDENTIALS_PROCESSING_CONSENT_VERSION, "2.7.3");
    Storage.invalidate(CONFIG.KEYS.CREDENTIALS_PROCESSING_CONSENT_VERSION);
    assert.equal(Storage.syncCredentialsProcessingConsentToBridge(), false);
    assert.equal(bridgeEvents.at(-1)?.detail?.credentialsConsent, false);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
    else globalThis.CustomEvent = previousCustomEvent;
  }

  const config = source("src/config.js");
  const main = source("src/main.js");
  for (const keyName of [
    "CREDENTIALS_PROCESSING_CONSENT_DECISION",
    "CREDENTIALS_PROCESSING_CONSENT_VERSION",
    "THREE_NO_ACCELERATED_PROFILE_ENABLED"
  ]) {
    const keyValue = {
      CREDENTIALS_PROCESSING_CONSENT_DECISION: "hege_credentials_processing_consent",
      CREDENTIALS_PROCESSING_CONSENT_VERSION: "hege_credentials_processing_consent_version",
      THREE_NO_ACCELERATED_PROFILE_ENABLED: "hege_three_no_accelerated_profile_enabled"
    }[keyName];
    assert.match(config, new RegExp(`SYNC_KEYS:[\\s\\S]*${keyValue}`));
  }
  assert.match(main, /bridgeConsentKeySet\.has\(e\.key\)[\s\S]{0,220}syncCredentialsProcessingConsentToBridge/);
  assert.match(main, /Storage\.invalidateMulti\(CONFIG\.SYNC_KEYS\)[\s\S]{0,180}syncCredentialsProcessingConsentToBridge/);
});

test("legacy inline credential bridge is unreachable for Firefox and fallback runtimes", () => {
  const feature = source("src/features/three-no-watch.js");
  assert.match(feature, /const legacyInlineBridgeDisabled = true/);
  assert.match(feature, /legacyInlineBridgeDisabled \|\| Core\.ThreeNoWatch\.isChromeExtension\(\)/);
  assert.match(feature, /const bridgeSource =/);
  assert.match(feature, /inline_bridge_disabled/);
  assert.match(feature, /manifest_page_bridge_waiting/);
});

test("bug report requires one-time consent and scrubs sensitive canaries", async () => {
  resetStorage();
  let fetchCalls = 0;
  let sentPayload = null;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_endpoint, options) => {
    fetchCalls += 1;
    sentPayload = JSON.parse(options.body);
    return { text: async () => JSON.stringify({ code: 200 }) };
  };

  const blocked = await Reporter.submitReport("ERROR", "no consent", "UI_REPORT", null);
  assert.deepEqual(blocked, { code: 204, skipped: "diagnostic_consent_required" });
  assert.equal(fetchCalls, 0);

  const sent = await Reporter.submitReport(
    "ERROR",
    "Authorization: Bearer AUTH_CANARY",
    "UI_REPORT",
    {
      diagnosticConsent: true,
      authorization_canary: "AUTH_CANARY",
      cookie: "COOKIE_CANARY",
      requestBody: "fb_dtsg=TOKEN_CANARY&lsd=LSD_CANARY",
      userDescription: "TOKEN=GENERIC_TOKEN_CANARY token: GENERIC_TOKEN_CANARY",
      quotedDescription: "Access_Token = \"ACCESS_TOKEN_CANARY\" auth_token: 'AUTH_TOKEN_CANARY'"
    }
  );
  assert.equal(sent.code, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(JSON.stringify(sentPayload).includes("AUTH_CANARY"), false);
  assert.equal(JSON.stringify(sentPayload).includes("COOKIE_CANARY"), false);
  assert.equal(JSON.stringify(sentPayload).includes("TOKEN_CANARY"), false);
  assert.equal(JSON.stringify(sentPayload).includes("LSD_CANARY"), false);
  assert.equal(JSON.stringify(sentPayload).includes("GENERIC_TOKEN_CANARY"), false);
  assert.equal(JSON.stringify(sentPayload).includes("ACCESS_TOKEN_CANARY"), false);
  assert.equal(JSON.stringify(sentPayload).includes("AUTH_TOKEN_CANARY"), false);
  globalThis.fetch = oldFetch;
});

test("public sample projection defaults to description and legal gate only enables reviewed_text", () => {
  const raw = {
    days: 14,
    overview: { totalEventCount: 40 },
    dailyTrend: [{ day_key: "2026-07-12", total_event_count: 40 }],
    topicTimeSeries: [{ date: "2026-07-12", topics: [{ label: "淡江大橋", count: 40 }] }],
    topTopics: [{ topic_label: "淡江大橋", event_count: 40, source_count: 3 }],
    topNarratives: [{
      source_text_sample: "#RAW_TEXT_CANARY 私人原文",
      total_event_count: 40,
      unique_account_count: 10,
      avg_signal_score: 70,
      top_topic_hints_json: "[]"
    }],
    approvedSampleReviews: [
      { topic_id: "community-danjiang-bridge", deidentified_text: "APPROVED_CANARY", account_count: 24, observer_count: 3, status: "approved" },
      { topic_id: "community-danjiang-bridge", deidentified_text: "PENDING_CANARY", account_count: 30, observer_count: 4, status: "pending" },
      { topic_id: "community-danjiang-bridge", deidentified_text: "REJECTED_CANARY", account_count: 30, observer_count: 4, status: "rejected" }
    ]
  };

  assert.equal(resolveSamplePublicationMode({}), "description");
  assert.equal(resolveSamplePublicationMode({ PUBLIC_SAMPLE_LEGAL_POLICY_VERSION: "wrong" }), "description");
  assert.equal(resolveSamplePublicationMode({ PUBLIC_SAMPLE_LEGAL_POLICY_VERSION }), "reviewed_text");

  const description = projectPublicPlatformOverview(raw, 5);
  assert.equal(description.samplePublicationMode, "description");
  assert.deepEqual(description.repeatedPhrases, []);
  assert.equal(description.topicCards.every((card) => card.samples.length === 0), true);
  assert.equal(JSON.stringify(description).includes("APPROVED_CANARY"), false);
  assert.equal(JSON.stringify(description).includes("PENDING_CANARY"), false);
  assert.equal(JSON.stringify(description).includes("REJECTED_CANARY"), false);
  assert.equal(JSON.stringify(description).includes("RAW_TEXT_CANARY"), false);
  assert.match(description.topicCards[0].patternDescription, /不公開文字樣本/);

  const reviewed = projectPublicPlatformOverview(raw, 5, { samplePublicationMode: "reviewed_text" });
  assert.equal(reviewed.samplePublicationMode, "reviewed_text");
  assert.equal(reviewed.topicCards.some((card) => card.samples.some((sample) => sample.deidentified_text === "APPROVED_CANARY")), true);
  assert.equal(JSON.stringify(reviewed).includes("PENDING_CANARY"), false);
  assert.equal(JSON.stringify(reviewed).includes("REJECTED_CANARY"), false);
  assert.equal(PUBLIC_SAMPLE_LEGAL_POLICY_VERSION, "sample-publication-legal-v1");
});

test("public overview GET performs no D1 writes", async () => {
  let writes = 0;
  let execCalls = 0;
  const statement = {
    bind() { return this; },
    async all() { return { results: [] }; },
    async first() { return null; },
    async run() { writes += 1; return { success: true }; }
  };
  const env = {
    PUBLIC_SAMPLE_LEGAL_POLICY_VERSION: "wrong",
    DB: {
      prepare() { return statement; },
      async exec() { execCalls += 1; }
    }
  };
  const response = await worker.fetch(new Request("https://example.test/api/v1/platform/overview?days=7&top=5"), env);
  assert.equal(response.status, 200);
  assert.equal(writes, 0);
  const body = await response.json();
  assert.equal(body.data.samplePublicationMode, "description");
  assert.deepEqual(body.data.repeatedPhrases, []);

  const politicalResponse = await worker.fetch(new Request("https://example.test/api/v1/platform/political-events?days=7&limit=5"), env);
  assert.equal(politicalResponse.status, 200);
  assert.equal(writes, 0);
  assert.equal(execCalls, 0);

  const workerSource = source("cf_bug_admin/src/index.js");
  assert.match(workerSource, /loadPlatformOverviewData\(env, days, top, \{ ensureSchema: false, queueSamples: false \}\)/);
  assert.doesNotMatch(workerSource, /async function handlePublicPoliticalEvents\(request, env\) \{[\\s\\S]{0,100}ensurePlatformTables/);
});

test("public count copy uses observable post and account-row units", () => {
  const reports = source("site/platform/reports/index.html");
  const methodology = source("site/platform/methodology/index.html");
  const nextApp = source("site/platform/next/app.js");
  const publicJs = source("site/platform/public.js");
  for (const page of [reports, methodology]) {
    assert.doesNotMatch(page, /來源樣本|協調帳號數|匿名帳號樣本/);
    assert.match(page, /來源貼文數/);
    assert.match(page, /帳號觀測筆數/);
    assert.match(page, /跨批次去重/);
  }
  assert.doesNotMatch(nextApp, /個來源貼文/);
  assert.match(nextApp, /筆來源貼文/);
  assert.doesNotMatch(publicJs, /(?:多個|個)來源貼文/);
});

test("consent and public copy stay aligned", () => {
  const config = source("src/config.js");
  const bridge = source("src/page-bridge.js");
  const ui = source("src/ui.js");
  const readme = source("README.md");
  const changelog = source("CHANGELOG.md");
  const home = source("site/index.html");
  const privacy = source("site/privacy/index.html");
  const methodology = source("site/platform/methodology/index.html");
  const nextPage = source("site/platform/next/index.html");
  const listing = source("docs/CWS_LISTING_DRAFT.md");
  const cwsPractices = source("docs/CWS_PRIVACY_PRACTICES_2.7.4.md");
  const topicSdd = source("docs/SDD_Topic_Amplification.md");
  const adr = source("docs/adr/0009-deidentified-sample-publication.md");
  const combined = `${ui}\n${readme}\n${changelog}\n${home}\n${privacy}\n${methodology}\n${nextPage}\n${listing}\n${cwsPractices}\n${topicSdd}\n${adr}`;
  assert.match(config, /VERSION: '2\.7\.4'/);
  assert.match(config, /PLATFORM_SYNC_CONSENT_POLICY_VERSION: 'platform-sync-v3'/);
  assert.match(config, /CREDENTIALS_PROCESSING_CONSENT_POLICY_VERSION: 'credentials-processing-v1'/);
  assert.match(bridge, /credentials_consent_required/);
  assert.match(ui, /id="hege-report-diagnostic-consent" type="checkbox"/);
  assert.equal(ui.includes('id="hege-report-diagnostic-consent" type="checkbox" checked'), false);
  assert.match(combined, /platform-sync-v3/);
  assert.match(combined, /credentials-processing-v1/);
  assert.match(combined, /pending_version_consent/);
  assert.match(combined, /description/);
  assert.match(combined, /reviewed_text/);
  assert.match(readme, /目前正式版：`v2\.7\.4`/);
  assert.match(changelog, /^## v2\.7\.4 —/m);
  assert.match(changelog, /v2\.7\.4-beta44/);
  assert.match(changelog, /歷史口徑更正.*beta44/);
  assert.match(methodology, /samplePublicationMode/);
  assert.match(nextPage, /帳號觀測筆數/);
  assert.match(topicSdd, /來源貼文數/);
  assert.match(adr, /public overview GET[\s\S]*(?:唯讀|僅讀取)/);
});
