import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";

// Minimal D1 stub. These tests only care about which requests survive auth,
// so every query returns an empty result set.
function makeDb() {
  const statement = {
    bind() { return statement; },
    async run() { return { meta: { changes: 1 } }; },
    async all() { return { results: [] }; },
    async first() { return { id: 1 }; }
  };
  return {
    prepare() { return statement; },
    async exec() {}
  };
}

const ENV = {
  DB: makeDb(),
  ADMIN_TOKEN: "admin-token",
  REPORT_EXPORT_TOKEN: "export-token",
  REVIEWER_TOKEN: "reviewer-token"
};

const ROUTES = {
  bugs: ["https://worker.test/api/v1/admin/bugs", "GET"],
  bugStatus: ["https://worker.test/api/v1/admin/bugs/1", "PATCH"],
  stats: ["https://worker.test/api/v1/admin/stats", "GET"],
  platformOverview: ["https://worker.test/api/v1/admin/platform/overview", "GET"],
  sampleReviews: ["https://worker.test/api/v1/admin/sample-reviews?status=pending", "GET"],
  eventsIngest: ["https://worker.test/api/v1/admin/political-events/ingest", "POST"]
};

async function call(route, token) {
  const [url, method] = ROUTES[route];
  const init = { method };
  if (token) init.headers = { Authorization: `Bearer ${token}` };
  if (method === "POST" || method === "PATCH") {
    init.headers = { ...(init.headers || {}), "Content-Type": "application/json" };
    init.body = JSON.stringify({ events: [], status: "open" });
  }
  return worker.fetch(new Request(url, init), { ...ENV, DB: makeDb() });
}

test("export token only reaches the bug report list", async () => {
  assert.notEqual((await call("bugs", "export-token")).status, 401);

  // The whole point of a separate token: a third-party script holding it must
  // not be able to reach raw platform content or review samples.
  for (const route of ["platformOverview", "sampleReviews", "eventsIngest", "bugStatus", "stats"]) {
    assert.equal((await call(route, "export-token")).status, 401, `${route} must reject export token`);
  }
});

test("reviewer token only reaches sample reviews", async () => {
  assert.notEqual((await call("sampleReviews", "reviewer-token")).status, 401);

  for (const route of ["platformOverview", "bugs", "eventsIngest"]) {
    assert.equal((await call(route, "reviewer-token")).status, 401, `${route} must reject reviewer token`);
  }
});

test("admin token keeps access to every admin route", async () => {
  for (const route of Object.keys(ROUTES)) {
    assert.notEqual((await call(route, "admin-token")).status, 401, `${route} must accept admin token`);
  }
});

test("missing, empty and unknown tokens are rejected", async () => {
  assert.equal((await call("bugs", null)).status, 401);
  assert.equal((await call("bugs", "")).status, 401);
  assert.equal((await call("bugs", "not-a-real-token")).status, 401);
});

test("an unset token variable never authorizes anything", async () => {
  // Regression guard: comparing an empty env var against an empty header must
  // not match. A missing binding has to fail closed, not open.
  const env = { DB: makeDb(), ADMIN_TOKEN: "admin-token", REPORT_EXPORT_TOKEN: "" };
  const response = await worker.fetch(
    new Request(ROUTES.bugs[0], { headers: { Authorization: "Bearer " } }),
    env
  );
  assert.equal(response.status, 401);
});
