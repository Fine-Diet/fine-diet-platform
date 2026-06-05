# Stripe Payments Setup

## Overview

Fine Diet uses Stripe for payment processing with three billing models:

| Model | Use Case | Stripe Mode |
|-------|----------|-------------|
| `one_time` | Journal one-time, Programs one-time | `payment` |
| `subscription` | Journal subscription | `subscription` |
| `installment` | Integrative Care (3 payments), Program variant (2 payments) | `subscription` + schedule |

Payments flow: **Checkout -> Webhook -> Grant Entitlements -> Access**

Before promoting any live Stripe configuration, complete the live readiness checklist in `docs/payments/STRIPE-LIVE-OFFER-READINESS.md`. The checkout runtime follows whatever Stripe secret and offer price IDs are configured, so live promotion must be handled as an explicit deployment/configuration step.

## Environment Variables

Add these to `.env.local` (and Vercel environment settings):

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_SITE_URL=https://finediet.co  (or http://localhost:3000 for dev)
```

- `STRIPE_SECRET_KEY`: Found in Stripe Dashboard > Developers > API keys
- `STRIPE_WEBHOOK_SECRET`: Created when setting up the webhook endpoint (see below)
- `NEXT_PUBLIC_SITE_URL`: Used to build absolute success/cancel URLs for checkout

Keep sandbox/test and live values separate by environment. Do not replace test values with live values until the target deployment, webhook endpoint, offer price IDs, and buy links have all passed the readiness audit.

## Database Migrations

Run in order in Supabase SQL Editor:

1. `scripts/sql/createStripeTables.sql` - Creates `stripe_customers`, `stripe_events`, `stripe_offer_instances`
2. `scripts/sql/alterOffersForStripe.sql` - Adds Stripe billing columns to `offers`

## Creating Stripe Prices

### One-Time Price

1. Stripe Dashboard > Products > + Add Product
2. Name: e.g. "Journal - One Time Access"
3. Pricing: One time, set amount
4. Copy the Price ID (e.g. `price_1Abc...`)

### Subscription Price

1. Stripe Dashboard > Products > + Add Product
2. Name: e.g. "Journal - Monthly Subscription"
3. Pricing: Recurring, set amount and interval (monthly)
4. Copy the Price ID

### Installment Prices (multi-phase)

For installments (e.g. 3-payment Integrative Care at different amounts):

1. Create a recurring price for each phase:
   - Phase 1: e.g. $500/month, 1 cycle
   - Phase 2: e.g. $300/month, 1 cycle
   - Phase 3: e.g. $200/month, 1 cycle
2. Copy all Price IDs

In the admin offer config:
- `stripe_phase_price_ids`: `price_phase1, price_phase2, price_phase3`
- `stripe_phase_iterations`: `1, 1, 1`

For a 2-payment program variant ($400 then $200):
- `stripe_phase_price_ids`: `price_first, price_second`
- `stripe_phase_iterations`: `1, 1`

## Configuring Offers (Admin UI)

Go to `/admin/offers` and create/edit an offer:

| Field | one_time | subscription | installment |
|-------|----------|-------------|-------------|
| `billing_model` | `one_time` | `subscription` | `installment` |
| `stripe_price_id` | Required | Required | First phase price (required) |
| Phase Price IDs | N/A | N/A | All phase prices, comma-separated |
| Phase Iterations | N/A | N/A | Cycles per phase, comma-separated |
| `success_path` | e.g. `/app/onboarding` | e.g. `/app/onboarding` | e.g. `/app/onboarding` |
| `cancel_path` | e.g. `/start` | e.g. `/start` (or `/start/<offerSlug>`) | e.g. `/start` |

> App subscription offers must return into the onboarding/start surface. Do **not** use `/home` for success or `/shop` for cancel (`/shop` is reserved for the later physical-commerce track). The API defaults to `success_path=/app/onboarding` and `cancel_path=/start` when these fields are empty. Store bare paths (no `?checkout=...`); the API appends `?checkout=success` / `?checkout=canceled`.

Don't forget to add entitlement mappings to the offer (e.g. `journal` with duration or perpetual).

For live readiness, run `scripts/sql/auditStripeLiveOfferReadiness.sql` before distributing buy links. Active live offers should use Stripe `price_` IDs, have active entitlement mappings, and avoid unreviewed duplicate price reuse across different offer keys.

## Webhook Setup

### Production (Vercel)

1. Stripe Dashboard > Developers > Webhooks > + Add endpoint
2. Endpoint URL: `https://finediet.co/api/webhooks/stripe`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the Signing Secret -> set as `STRIPE_WEBHOOK_SECRET` in Vercel env vars

### Local Development (Stripe CLI)

```bash
# Install Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local dev server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# The CLI will output a webhook signing secret (whsec_...)
# Set it in your .env.local as STRIPE_WEBHOOK_SECRET
```

To trigger test events:

```bash
# Simulate a successful checkout
stripe trigger checkout.session.completed

# Simulate subscription cancellation
stripe trigger customer.subscription.deleted

# Simulate payment failure
stripe trigger invoice.payment_failed
```

## Architecture

```
User clicks "Buy"
  -> POST /api/checkout/create { offer_key }
  -> Resolves person, loads offer config, ensures Stripe customer
  -> Creates Stripe Checkout Session (payment/subscription)
  -> Returns { url } -> redirect to Stripe

Stripe Checkout completes
  -> POST /api/webhooks/stripe (checkout.session.completed)
  -> Verify signature (raw body + STRIPE_WEBHOOK_SECRET)
  -> Idempotency check (stripe_events table)
  -> Activate stripe_offer_instances
  -> Grant person_entitlements (source='stripe', source_ref=sub/pi ID)
  -> For installments: create subscription schedule with phases

Subscription canceled/payment failed
  -> POST /api/webhooks/stripe (customer.subscription.deleted / invoice.payment_failed)
  -> Revoke person_entitlements for that source_ref
  -> Update stripe_offer_instances status

User manages billing
  -> POST /api/billing/portal
  -> Creates Stripe Billing Portal session
  -> Redirect to Stripe hosted portal
```

## Events We Handle

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Grant entitlements, activate instance, create installment schedule if applicable |
| `customer.subscription.deleted` | Revoke entitlements, set instance status to `ended` |
| `invoice.payment_failed` | Revoke entitlements (v1 auto-revoke policy), set instance status to `canceled` |

## Idempotency

- Every webhook event is recorded in `stripe_events` by its unique `stripe_event_id`
- If a duplicate event arrives, it returns 200 immediately without reprocessing
- Entitlement granting checks for existing active entitlements with the same `source_ref` before inserting

## Access Flow After Payment

1. Webhook grants `person_entitlements` with `source='stripe'`
2. `hasJournalAccess()` compat shim checks: legacy subscriptions -> person_entitlements
3. Middleware checks journal access and allows/blocks accordingly
4. No changes to existing access flow needed

## TODOs (Future)

- [ ] `customer.subscription.updated` handler: re-activate entitlements if subscription resumes
- [ ] Grace period for payment failures (currently instant revoke)
- [ ] Proration support for plan changes
- [ ] Receipt/invoice emails via Stripe
- [ ] Webhook retry/failure alerting
