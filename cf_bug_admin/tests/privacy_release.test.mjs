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

test("platform consent migration never promotes old consent to platform-sync-v4", () => {
  resetStorage();
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_ENABLED, "true");
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_CONSENT_VERSION, "2.7.3");

  Storage.migratePlatformSyncConsent();
  assert.equal(Storage.getPlatformSyncConsentVersion(), "2.7.3");
  assert.equal(Storage.hasPlatformSyncConsentForCurrentVersion(), false);
  assert.equal(Storage.getPlatformSyncEnabled(), false);

  Storage.setPlatformSyncConsentDecision(true);
  assert.equal(Storage.getPlatformSyncConsentVersion(), "platform-sync-v4");
  assert.equal(Storage.hasPlatformSyncConsentForCurrentVersion(), true);
  assert.equal(Storage.getPlatformSyncEnabled(), true);
});

test("stored platform-sync-v3 consent is not promoted to v4 and stays blocked", () => {
  resetStorage();
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_ENABLED, "true");
  localStorage.setItem(CONFIG.KEYS.PLATFORM_SYNC_CONSENT_VERSION, "platform-sync-v3");

  Storage.migratePlatformSyncConsent();
  assert.equal(Storage.getPlatformSyncConsentVersion(), "platform-sync-v3");
  assert.equal(Storage.hasPlatformSyncConsentForCurrentVersion(), false);
  assert.equal(Storage.getPlatformSyncEnabled(), false);
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

test("2.8 credentials paths are absent while the existing DOM fallback remains", () => {
  const manifest = JSON.parse(source("src/manifest.json"));
  assert.equal(manifest.content_scripts.some(entry => entry.world === "MAIN" || entry.js?.includes("page-bridge.js")), false);
  assert.equal(fs.existsSync(path.join(root, "src/page-bridge.js")), false);
  assert.equal(fs.existsSync(path.join(root, "src/interceptor.js")), false);
  assert.doesNotMatch(source("build.sh"), /page-bridge\.js/);

  const config = source("src/config.js");
  const storage = source("src/storage.js");
  const main = source("src/main.js");
  const feature = source("src/features/three-no-watch.js");
  const ui = source("src/ui.js");
  for (const marker of [
    "credentials-processing-v1",
    "hege:threads-credentials-processing-consent",
    "hege:threads-about-profile-fetch-request",
    "window.fetch =",
    "XMLHttpRequest.prototype",
  ]) {
    assert.doesNotMatch(`${config}\n${storage}\n${main}\n${feature}\n${ui}`, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(feature, /const findAboutMenuItem = \(\) =>/);
  assert.match(feature, /const findProfileMoreButton = \(\) =>/);
  assert.match(feature, /Utils\.simClick\(moreTarget\)/);
  assert.match(feature, /about_dialog_missing/);
  assert.doesNotMatch(feature, /window\.location\.(?:href|assign)\s*=/);
  assert.doesNotMatch(feature, /installAboutProfilePassiveBridge|readProfileMetadataCache|requestActiveAboutMetadata/);
  assert.doesNotMatch(ui, /showCredentialsConsentModal|hege-s-credentials-consent|加速三無檢查（進階）/);
});

test("legacy credentials purge is idempotent and preserves unrelated state", () => {
  const main = source("src/main.js");
  const keys = [
    "hege_three_no_accelerated_profile_enabled",
    "hege_credentials_processing_consent",
    "hege_credentials_processing_consent_version",
    "hege_three_no_profile_metadata_cache_v1",
    "hege_three_no_profile_user_id_cache_v1",
    "hege_three_no_about_request_template_v1",
  ];
  for (const key of keys) assert.match(main, new RegExp(`'${key}'`));
  assert.match(main, /forEach\(key => Storage\.remove\(key\)\)/);
  assert.doesNotMatch(main, /'hege_hwid'/);
});

test("bug reports are message-only by default and diagnostics remain opt-in with scrub canaries", async () => {
  resetStorage();
  let fetchCalls = 0;
  let sentPayload = null;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_endpoint, options) => {
    fetchCalls += 1;
    sentPayload = JSON.parse(options.body);
    return { text: async () => JSON.stringify({ code: 200 }) };
  };

  const messageOnly = await Reporter.submitReport("ERROR", "message only", "UI_REPORT", null);
  assert.equal(messageOnly.code, 200);
  assert.equal(fetchCalls, 1);
  assert.equal(sentPayload.metadata, "");

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
  assert.equal(fetchCalls, 2);
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
  const ui = source("src/ui.js");
  const readme = source("README.md");
  const changelog = source("CHANGELOG.md");
  const home = source("site/index.html");
  const privacy = source("site/privacy/index.html");
  const methodology = source("site/platform/methodology/index.html");
  const nextPage = source("site/platform/next/index.html");
  const listing = source("docs/CWS_LISTING_DRAFT.md");
  const cwsPractices = source("docs/CWS_PRIVACY_PRACTICES.md");
  const topicSdd = source("docs/SDD_Topic_Amplification.md");
  const adr = source("docs/adr/0009-deidentified-sample-publication.md");
  const combined = `${ui}\n${readme}\n${changelog}\n${home}\n${privacy}\n${methodology}\n${nextPage}\n${listing}\n${cwsPractices}\n${topicSdd}\n${adr}`;
  // 2.8.x 這條發布線的任何版本（含 beta）都要通過本檔的文案對齊檢查。
  // 舊寫法寫死 '2.8.0'，2.8.1 開發期間整個 test 在第一行就失敗，後面真正
  // 重要的隱私文案斷言全部沒跑到。
  assert.match(config, /VERSION: '2\.8\.\d+(?:-beta\d+)?'/);
  assert.match(config, /PLATFORM_SYNC_CONSENT_POLICY_VERSION: 'platform-sync-v4'/);
  assert.match(ui, /id="hege-report-diagnostic-consent" type="checkbox"/);
  assert.equal(ui.includes('id="hege-report-diagnostic-consent" type="checkbox" checked'), false);
  assert.match(combined, /platform-sync-v4/);
  assert.doesNotMatch(ui, /credentials-processing-v1|hege:threads-credentials-processing-consent/);
  for (const currentDisclosure of [readme, home, privacy, listing, cwsPractices]) {
    assert.doesNotMatch(currentDisclosure, /credentials-processing-v1|Chrome 加速三無|fb_dtsg|jazoest|__user/);
  }
  assert.match(cwsPractices, /Authentication information \| No/);
  assert.match(ui, /我或我授權的人也可能會實際讀到/);
  assert.match(ui, /公開文字片段可能由人工讀取/);
  assert.doesNotMatch(ui, /\?mock=1|示範觀測平台/);
  assert.match(privacy, /授權人員可能在必要範圍內讀取使用者已同意上傳的公開內容/);
  assert.match(cwsPractices, /Authorized personnel may review uploaded public content/);
  assert.doesNotMatch(privacy, /TODO（送審前完成）/);
  // 隱私頁宣告「套件不包含擷取 request token 的 page bridge」，runtime 必須沒有殘留字樣可供對撞。
  for (const runtimeFile of ["src/features/three-no-watch.js", "src/three-no.js", "src/reporter.js"]) {
    if (!fs.existsSync(path.join(root, runtimeFile))) continue;
    assert.doesNotMatch(source(runtimeFile), /page_?bridge/i, `${runtimeFile} 不得出現 page bridge 字樣`);
  }
  const manifest = JSON.parse(source("src/manifest.json"));
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(manifest.permissions, undefined);
  assert.match(combined, /pending_version_consent/);
  assert.match(combined, /description/);
  assert.match(combined, /reviewed_text/);
  assert.match(readme, /目前正式版：`v2\.8\.1`/);
  assert.match(changelog, /^## v2\.8\.1 —/m);
  assert.match(changelog, /^## v2\.8\.0 —/m);
  assert.match(changelog, /v2\.7\.4-beta44/);
  assert.match(changelog, /歷史口徑更正.*beta44/);
  assert.match(methodology, /samplePublicationMode/);
  assert.match(nextPage, /帳號觀測筆數/);
  assert.match(topicSdd, /來源貼文數/);
  assert.match(adr, /public overview GET[\s\S]*(?:唯讀|僅讀取)/);
  // ADR 0013：輕量診斷層必須在三處口徑一致——蒐集時點（回報視窗）、
  // 隱私政策頁、商店申報稿。少任何一處就是「文案寫得比程式做得少」。
  assert.match(ui, /送出時會一併附上技術資訊/);
  assert.match(privacy, /輕量技術資訊/);
  assert.match(privacy, /同一個安裝來源的多次失敗紀錄可以被關聯起來/);
  assert.match(cwsPractices, /lightweight technical layer ships on every channel/);
  assert.match(cwsPractices, /RuntimeDiagnostics\._safeFields/);
});
