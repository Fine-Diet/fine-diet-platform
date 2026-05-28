# Stripe Live Checkout Test Plan

Packet 26 defines the checklist for validating real live-mode Stripe checkout without switching production traffic automatically. This plan is intentionally operator-driven: it does not mutate Stripe configuration, delete sandbox/test setup, or route public production CTAs to live checkout by itself.

Use this after the live offer readiness gates in `docs/payments/STRIPE-LIVE-OFFER-READINESS.md` pass and before distributing live buy links.

## Scope And Guardrails

- Keep sandbox/test Stripe Products, Prices, webhooks, and environment variables intact for rollback and comparison.
- Do not switch public `/programs`, app runtime, Plans, or entitlement behavior as part of this test unless a separate documented bug is found.
- Do not activate typo, draft, or legacy offers as part of checkout testing.
- Do not expose broad production traffic to live checkout until the internal live buyer flow succeeds end to end.
- Treat Stripe Dashboard edits as manual operator actions; this repository only documents and audits readiness.

## Required Dashboard Checks

In Stripe live mode, verify:

- The account is in live mode and the operator understands that the test buyer will make a real payment.
- Live Products and Prices exist for each offer under test.
- Price IDs start with `price_`, match the intended live Product, currency, amount, tax behavior, and recurring interval.
- `journal-monthly` and `journal-annual` do not share the same active Price ID unless that is an explicit business decision.
- `integrative-care-3pay` has all required installment phase prices and each phase is recurring with the intended amount and interval.
- Customer emails, receipts, invoices, and payment method settings are acceptable for a low-risk internal test purchase.
- Refund and cancellation permissions are available to the operator who will run the test.

## Required Environment Checks

Before the test deployment is used, verify the target environment variables:

- `STRIPE_SECRET_KEY` is a live secret key only in the intended deployment environment.
- `STRIPE_WEBHOOK_SECRET` belongs to the live webhook endpoint for the same deployment.
- `NEXT_PUBLIC_SITE_URL` is the canonical production origin used for Checkout success and cancel redirects.
- No local, preview, or staging environment unintentionally points at live keys.
- Test/sandbox keys remain available in their existing environments.

Do not promote live keys just to preview a UI state. The effective Stripe mode is determined by the deployed secret key, webhook secret, and active offer Price IDs.

## Webhook Endpoint Checks

In Stripe live mode, verify the endpoint:

- URL is `https://finediet.co/api/webhooks/stripe` or the exact intended production deployment URL.
- Signing secret is copied into `STRIPE_WEBHOOK_SECRET` for the same deployment.
- Enabled events include `checkout.session.completed`, `customer.subscription.deleted`, and `invoice.payment_failed`.
- Recent delivery attempts show `2xx` responses during the test.
- Failed deliveries can be retried from Stripe Dashboard if needed.

## Product And Price Checks

Review these live offer rows before testing:

| Offer | Billing Model | Required Stripe Config | Expected Entitlements |
|---|---|---|---|
| `journal-monthly` | `subscription` | One active live recurring monthly `stripe_price_id` | `journal` |
| `journal-annual` | `subscription` | One active live recurring annual `stripe_price_id` | `journal`, `program:baseline` |
| `integrative-care-3pay` | `installment` | Live `stripe_phase_price_ids` and aligned positive `stripe_phase_iterations` | `care:integrative` |

`journal-monthly` and `journal-annual` currently share an active Stripe Price ID in the known catalog state. Resolve that manually in Stripe/admin unless shared pricing is intentional and documented for this live test.

The inactive typo offer `inegrative-care-3pay` must remain inactive. It can appear in audit output as a manual review item, but it must not be used for live checkout.

## Offer-To-Entitlement Checks

Run the read-only audit in `scripts/sql/auditStripeLiveOfferReadiness.sql` and confirm:

- All active offer mappings reference registered entitlement keys.
- `journal-annual` grants both `journal` and `program:baseline`.
- `integrative-care-3pay` grants `care:integrative`.
- No active offer lacks an active entitlement mapping.
- No unknown active entitlement keys appear.
- No duplicate active Stripe Price IDs appear unless explicitly approved.
- No active offer is missing the Stripe Price ID or phase Price IDs required for its billing model.

## Operator Checklist

### Before Live Test

- Pick one internal buyer account that does not already have the target entitlement, or record its current entitlement state.
- Choose a low-risk offer to test first, preferably `journal-annual` if validating Baseline access.
- Confirm the buyer can sign in before starting checkout.
- Run `npm run verify:entitlements`.
- Run `scripts/sql/auditStripeLiveOfferReadiness.sql` in Supabase SQL Editor and save the output for the test record.
- Verify the target offer is active, has the intended live Price IDs, and has the expected active entitlement mappings.
- Confirm the live webhook endpoint is enabled and points at the tested deployment.
- Confirm a rollback operator is available to restore previous environment values or unlink the test buy path.

### During Live Test

- Start from the intended buy path, such as `/buy/journal-annual`, while public traffic remains unchanged.
- Complete Stripe Checkout with a real internal payment method.
- Confirm the success redirect lands on the configured `success_path`.
- Watch Stripe Dashboard for the Checkout Session, Customer, Subscription or PaymentIntent, and webhook delivery.
- Do not change marketing CTAs or public `/programs` routing during the test.

### After Live Test

- Confirm `checkout_events` contains `checkout_started` and `checkout_completed` for the buyer and offer.
- Confirm `stripe_events` contains the processed `checkout.session.completed` event.
- Confirm `stripe_offer_instances` is active and references the Stripe Checkout Session plus subscription or payment intent.
- Confirm `person_entitlements` contains only the expected active entitlements.
- Confirm no unexpected `program_enrollments` row was created by purchase.
- Decide whether to keep the real purchase active, cancel the subscription, or refund the payment.
- Document Stripe event IDs, database row IDs, and any manual Stripe cleanup performed.

## What To Verify In Stripe

- Checkout Session completed successfully.
- PaymentIntent or Subscription is in the expected state.
- The correct live Price ID was used.
- The webhook delivery for `checkout.session.completed` returned `2xx`.
- For subscription offers, cancellation and invoice failure test paths are understood before broader launch.
- For `integrative-care-3pay`, the subscription schedule or phase behavior matches the intended installment plan.

## What To Verify In Supabase

- `checkout_events`: `checkout_started` and `checkout_completed` for the offer and buyer.
- `stripe_events`: one processed event per Stripe event ID, with no duplicate processing.
- `stripe_offer_instances`: status is `active`.
- `person_entitlements`: expected keys are active, source is `stripe`, and `source_ref` matches the subscription, payment intent, or checkout session fallback.
- `program_enrollments`: no row is created at purchase for Baseline or Integrative Care unless a future explicit enrollment flow is added.

## What To Verify In App

For Baseline via `journal-annual`:

- Buyer receives the `journal` entitlement.
- Buyer receives the `program:baseline` entitlement.
- No `program_enrollment` is created at purchase.
- `/app/programs` shows Baseline as startable.
- The user chooses start date and capacity in the app.

For Integrative Care via `integrative-care-3pay`:

- Buyer receives the `care:integrative` entitlement.
- No program enrollment is created unless a future program mapping is explicitly added.

## Refund, Cancel, And Retry Considerations

- Refunds are manual Stripe Dashboard actions unless a future admin refund tool is added.
- Subscription cancellation should trigger `customer.subscription.deleted`; current behavior revokes Stripe-sourced entitlements tied to that subscription.
- `invoice.payment_failed` is currently handled as an entitlement revoke path for the affected subscription.
- Webhook delivery failures should be retried from Stripe Dashboard after the deployment or secret issue is corrected.
- Re-running checkout with the same buyer may create additional Stripe objects; record which objects belong to the live test.

## Rollback Plan

If live checkout behaves unexpectedly:

1. Stop exposing the test buy path to operators and do not distribute it further.
2. Restore the previous deployment environment values if live keys were promoted only for the test window.
3. Keep sandbox/test Stripe configuration untouched.
4. Inactivate or unlink only the affected live offer Price IDs manually if the offer row is the source of risk.
5. Retry failed Stripe webhooks only after `STRIPE_WEBHOOK_SECRET` and endpoint mode are corrected.
6. Cancel or refund the internal test purchase if needed.
7. Preserve audit output, Stripe event IDs, and database rows for diagnosis.

## Success Criteria

Live checkout is ready for limited rollout only when:

- The live checkout round trip succeeds for an internal buyer.
- Stripe records the expected live Checkout Session and payment/subscription objects.
- Stripe webhook delivery returns `2xx` and is processed once.
- Supabase records `checkout_started`, `checkout_completed`, `stripe_events`, and an active `stripe_offer_instances` row.
- The buyer receives exactly the expected entitlements for the purchased offer.
- Baseline access is startable from `/app/programs` without creating a purchase-time `program_enrollment`.
- Integrative Care grants `care:integrative` without unexpected program enrollment.
- Known manual Stripe actions are resolved or explicitly accepted, including the `journal-monthly` / `journal-annual` duplicate Price ID decision.
