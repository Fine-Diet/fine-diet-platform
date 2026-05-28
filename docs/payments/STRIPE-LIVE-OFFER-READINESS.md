# Stripe Live Offer Readiness

Packet 24 is an audit and preparation pass for moving Fine Diet from Stripe sandbox/test usage toward live products, prices, offers, bundles, and entitlement mapping.

This document is intentionally non-operational: it does not instruct anyone to switch production traffic to live Stripe, delete sandbox configuration, or mutate offer rows directly. Treat it as the checklist to satisfy before live keys or live buy links are promoted.

## Current Runtime Shape

The checkout path is already offer-driven:

1. Public CTAs and direct links send users to `/buy/<offer_key>` or call `/api/checkout/create`.
2. `/api/checkout/create` loads the `offers` row, checks `offer_entitlements`, creates a Stripe Checkout Session, and records a pending `stripe_offer_instances` row.
3. `/api/webhooks/stripe` verifies `STRIPE_WEBHOOK_SECRET`, records `stripe_events` for idempotency, grants `person_entitlements`, updates `stripe_offer_instances`, and optionally creates program assignments.
4. Access checks read `person_entitlements`; `journal-annual` also has a code-owned safety supplement that grants `journal` and `program:baseline` if database mappings are missing.

The runtime does not have a separate "test mode" switch. The effective Stripe mode is determined by:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `offers.stripe_price_id`
- `offers.stripe_phase_price_ids`
- External/public buy links that point at active offer keys

## Live Readiness Gates

Do not promote a live Stripe configuration until all of these are true:

- Each live candidate offer has a final `offer_key`, display name, `billing_model`, `success_path`, and `cancel_path`.
- Each active `one_time` or `subscription` offer has exactly one live Stripe Price ID in `stripe_price_id`.
- Each active `installment` offer has live Stripe Price IDs in `stripe_phase_price_ids`, positive integer `stripe_phase_iterations`, and both arrays have the same length.
- No active offer uses dollar amounts, product IDs, or placeholder strings in any Stripe price field.
- No active offer unintentionally shares a Stripe Price ID with another active offer.
- Every active offer has at least one active entitlement mapping after applying code-owned supplements.
- Every active entitlement key is listed in `docs/access/ENTITLEMENT-KEY-REGISTRY.md` and `lib/access/constants.ts`, unless it is intentionally being introduced in the same packet.
- New active offer mappings are rejected by the admin API unless their entitlement key is registered. Unknown historical keys can remain only as inactive legacy/unsupported mappings.
- Any offer that should create a program assignment has `offers.assigns_program_slug` set to a valid program slug.
- Stripe webhook endpoint is configured for the same mode as the secret key, and listens for `checkout.session.completed`, `customer.subscription.deleted`, and `invoice.payment_failed`.
- `NEXT_PUBLIC_SITE_URL` points to the canonical production domain used by checkout success and cancel redirects.
- A logged-in test user can complete a low-risk live checkout end to end before broader link distribution.

## Packet 24 Audit Findings

Observed in the current remote offer catalog:

- `journal-annual` and `journal-monthly` are both active subscriptions using the same Stripe Price ID. This is only live-ready if they intentionally sell the exact same recurring price and cadence.
- `integrative-care-3pay` is active and has installment phase config, but its `stripe_price_id` contains a dollar-like value. The checkout path ignores `stripe_price_id` for installments and uses `stripe_phase_price_ids`, but the admin surface should still be cleaned up before live use.
- `inegrative-care-3pay` is an inactive typo offer. It should remain inactive unless intentionally retained for historical/manual audit reasons.
- `inegrative-care-3pay` contains dollar-like values in Stripe fields and lacks phase iterations. It is not live-ready and should not be activated.
- Packet 25 establishes `care:integrative` as the canonical Integrative Care entitlement key. `integrative-care-3pay` should continue to map to `care:integrative`.
- `journal-onetime`, `journal-monthly`, and `journal-annual` have active `journal` mappings. `journal-annual` also maps to `program:baseline`, matching the code-owned supplement.
- Stripe tracking tables exist and already contain rows, so live migration planning needs to account for existing test/sandbox records instead of assuming a blank payment state.

## Bundle Mapping Model

Fine Diet offers are bundle-capable by design. A single `offers.offer_key` can grant one or more `offer_entitlements.entitlement_key` rows:

- `journal-monthly` -> `journal`
- `journal-annual` -> `journal` + `program:baseline`
- `integrative-care-3pay` -> `care:integrative`
- future Fine Diet Method bundle -> `program:baseline` + `program:digestive-foundations` + `program:protein-sufficiency`

The Stripe checkout and webhook paths resolve all active mappings for the offer and grant each key. Bundle expansion should add or update mappings, not create one-off grant logic.

## Read-Only Audit Script

Run `scripts/sql/auditStripeLiveOfferReadiness.sql` in Supabase SQL Editor before each live promotion review. The script is read-only and reports:

- active offers with missing or malformed Stripe price config
- installment array alignment issues
- duplicated active Stripe Price IDs
- offers with no active entitlement mapping
- active entitlement keys missing from the current registry
- typo-similar offer keys
- Stripe tracking table row counts
- recent webhook events and purchase instances

The script is a signal, not an approval gate by itself. Resolve business decisions such as shared annual/monthly pricing, active/inactive offer inventory, and test data retention explicitly.

## Live Promotion Sequence

1. Keep all sandbox/test keys and test offer rows available for rollback and comparison.
2. Create separate live Stripe Products and Prices in Stripe Dashboard for `journal-monthly` and `journal-annual` unless the shared price is a deliberate business decision.
3. Create live Stripe Products and Prices for `integrative-care-3pay`; clean up the non-authoritative dollar-like `stripe_price_id` value manually in admin if this offer remains active.
4. Update only selected live candidate offers with live `price_` IDs, keeping non-candidate offers inactive or unlinked from public CTAs.
5. Confirm entitlement mappings and program assignment mappings in admin.
6. Configure the live Stripe webhook endpoint and secret in the intended deployment environment.
7. Verify `NEXT_PUBLIC_SITE_URL` and public buy links use the production domain.
8. Complete one low-risk live checkout with an internal account.
9. Confirm `stripe_events`, `stripe_offer_instances`, `checkout_events`, `person_entitlements`, and downstream access behavior.
10. Only then distribute live buy links or route marketing CTAs to live candidate offers.

## Explicit Non-Goals

- Do not change production to live Stripe automatically.
- Do not delete sandbox/test config.
- Do not remove historical Stripe rows.
- Do not activate typo or draft offers as part of audit cleanup.
- Do not introduce new paid bundles until the live readiness gates above are satisfied.
