# ThreadsBlocker License Worker

Governed by [ADR 0015](../docs/adr/0015-payuni-dynamic-checkout-relay.md) and the [license SDD](../docs/SDD_3.0_LICENSE_SERVICE.md).

This Worker renders the Pro checkout page, routes production buyers to allowlisted PAYUNi hosted payment pages, verifies PAYUNi callbacks, and forwards verified payments to the Apps Script ledger. The dynamic PAYUNi form path remains available as rollback. It does not store card data and does not issue extension credentials itself.

## Current state

- Sandbox Worker deployed at `https://threadsblocker-license-sandbox.skiseiju.workers.dev` with a dedicated KV namespace.
- Apps Script URL and admin secret are configured as Sandbox Worker secrets.
- PAYUNi Sandbox Hash Key and Hash IV are not configured yet; `/ready` intentionally returns 503 until they are set.
- Production Worker is deployed at `https://threadsblocker-license.skiseiju.workers.dev` with a dedicated KV namespace and all four required secrets.
- Three production PAYUNi hosted pages exist for monthly 129, annual 990, and early annual 690; the deployed standard and early checkout routes expose only the applicable allowlisted links.
- The early annual page expires on 2026-09-30; both page rendering and callback acceptance enforce that date.
- Paper uniform invoices are issued manually at launch; no electronic-invoice provider is configured.

## Secrets

Set only through `wrangler secret put` after production approval:

- `PAYUNI_HASH_KEY`
- `PAYUNI_HASH_IV`
- `LICENSE_APPS_SCRIPT_URL`
- `LICENSE_APPS_SCRIPT_ADMIN_SECRET`

Non-secret deployment values:

- `PAYUNI_ENV` (`sandbox` or `production`; controls a fixed allowlist of PAYUNi API hosts)
- `PAYUNI_MER_ID`
- `PUBLIC_BASE_URL`
- `EARLY_BIRD_END` (`YYYY-MM-DD`, blank disables early-bird pricing)
- `PAYUNI_MONTHLY_URL`, `PAYUNI_ANNUAL_URL`, `PAYUNI_EARLY_ANNUAL_URL` (allowlisted PAYUNi hosted pages; production only)

## Required setup order

1. Create a dedicated KV namespace and replace the placeholder ID.
2. Deploy and configure the Apps Script `Payments` tab and Script Properties.
3. Set Worker secrets.
4. Dry-run, then deploy the Worker to a final HTTPS URL.
5. Set `PUBLIC_BASE_URL` to that exact URL and deploy once more.
6. Run one PAYUNi sandbox transaction, verify Sheet + Email + callback retry.
7. Only then enable or share the production checkout URL.

Production deployment, secret changes and live payment activation require an explicit go/no-go.

The PAYUNi hosted-page callback does not include the original hosted-page token. Amounts 129, 690, and 990 are therefore reserved for ThreadsBlocker in merchant `U012070036`; the production PAYUNi page inventory was checked for collisions on 2026-08-07. Re-audit before creating or repricing any PAYUNi page.

Use `wrangler deploy --env sandbox` for PAYUNi Sandbox. The sandbox environment has its own Worker name, KV binding, Merchant ID, secrets, visible test banner, and `sandbox-api.payuni.com.tw` endpoint; it must never reuse the production API host.

`GET /ready` reports only the environment, readiness boolean, and missing binding names. It never returns secret values; require HTTP 200 and `configured=true` before opening a Sandbox checkout.
