# ThreadsBlocker License Apps Script

Governed by [ADR 0014](../docs/adr/0014-license-ledger-and-email-issuance.md) and [SDD](../docs/SDD_3.0_LICENSE_SERVICE.md).

This directory contains the version-controlled Google Apps Script source for creating ThreadsBlocker Pro entitlements and sending the automatic activation email.

## Current state

- Source and local tests exist.
- Target workbook: `ThreadsBlocker License`.
- The workbook has `Licenses`, `Devices`, and `Payments` tabs; `Payments` is ready for idempotent PAYUNi callback records.
- The bound Apps Script project is named `ThreadsBlocker License Management Server`; its source is synchronized with `Code.gs` and the copied PlugnGO-only file has been removed.
- The bound project has zero installable triggers and one Sandbox Web App deployment (v1).
- Sandbox admin-secret and Reply-To Script Properties are configured; values are not stored in this repository.
- No production webhook or production-specific deployment has been configured.

## Required Script Properties

- `THREADSBLOCKER_ADMIN_SECRET`
- `THREADSBLOCKER_REPLY_TO`
- `THREADSBLOCKER_FROM_ALIAS` (optional Gmail alias)

Never commit property values.

## API payload

```json
{
  "action": "create_license",
  "admin_secret": "<Script Property value>",
  "email": "buyer@example.com",
  "plan": "Pro",
  "entitlement_type": "subscription",
  "sub_expiry": "2027-08-07",
  "max_devices": 3,
  "display_name": "",
  "payment_provider": "PAYUNi",
  "payment_id": "<PAYUNi transaction id>",
  "payment_amount": "990",
  "payment_currency": "TWD",
  "source": "payuni_subscription",
  "send_email": true
}
```

Founding supporters use `entitlement_type=founding_supporter`, `sub_expiry=never`, and `source=payuni_donate_import`. The same Email creates only one founding-supporter entitlement even when PAYUNi contains multiple donations.

The response includes the internal `license_key` for backend correlation. The email does not include that key; the user signs in with Email.

Verified PAYUNi callbacks use `action=apply_subscription_payment`. Monthly payments accept only TWD 129 and require a PAYUNi recurring-trade ID; annual payments accept TWD 990 or the server-gated early-bird TWD 690. Payment IDs are idempotent, so a repeated callback does not create a second payment or send another opening email.
