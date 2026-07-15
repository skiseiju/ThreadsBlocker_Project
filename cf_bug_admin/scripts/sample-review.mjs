#!/usr/bin/env node

const API_BASE_URL = (
  process.env.SAMPLE_REVIEW_API_URL ||
  process.env.ADMIN_API_URL ||
  "https://threadsblocker-bug-admin.skiseiju.workers.dev"
).replace(/\/$/, "");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

function printUsage() {
  console.log(`Usage:
  ADMIN_TOKEN=... node scripts/sample-review.mjs list [pending|approved|rejected]
  ADMIN_TOKEN=... node scripts/sample-review.mjs approve <id>
  ADMIN_TOKEN=... node scripts/sample-review.mjs reject <id>

Optional endpoint override: SAMPLE_REVIEW_API_URL=https://worker.example`);
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  const [command = "list", value] = process.argv.slice(2);
  if (command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (!ADMIN_TOKEN) throw new Error("ADMIN_TOKEN environment variable is required");

  let url;
  let method = "GET";
  if (command === "list") {
    const status = value || "pending";
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    url = `${API_BASE_URL}/api/v1/admin/sample-reviews?status=${encodeURIComponent(status)}`;
  } else if (command === "approve" || command === "reject") {
    if (!/^\d+$/.test(value || "")) throw new Error(`${command} requires a numeric review id`);
    url = `${API_BASE_URL}/api/v1/admin/sample-reviews/${value}/${command}`;
    method = "POST";
  } else {
    printUsage();
    throw new Error(`Unknown command: ${command}`);
  }

  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }
  });
  const body = await response.json().catch(() => ({ code: response.status, message: response.statusText }));
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exitCode = 1;
}

main().catch((error) => fail(error?.message || String(error)));
