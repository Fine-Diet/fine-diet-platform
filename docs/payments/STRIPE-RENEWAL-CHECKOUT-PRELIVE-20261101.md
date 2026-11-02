# Stripe renewal coverage and pre-charge safety candidate

Status: source-only candidate on PR #224. Not approved for production activation.
No Stripe catalog, credentials, deployment flags, public links or production SQL changed.

## Renewal evidence (atomic path only)

The webhook captures the durable purchase revision before retrieving provider state,
then uses `resolveRenewalAccessState` before the fenced fulfillment RPC. The legacy
sandbox path retains its prior policy for staged migration; it must not be used live.

A new draft/open invoice does not erase a paid subscription-line period which still
covers the current instant. Conversely, a paid invoice header, event snapshot or
`current_period_end` alone does not prove current paid coverage. The resolver:

- Checks the current subscription, customer, mode, subscription item, price, currency,
  quantity, and non-proration line period; only one licensed subscription item is in scope.
- Accepts `active` or `past_due` only with a currently covering paid line and a settled,
  same-subscription invoice. Terminal subscriptions and locally ended purchases stay ended.
- Keeps valid trials independent of an initial charge; expired trials do not gain an extension.
- Checks the expanded latest invoice, then up to three pages of paid invoice history.
  Truncated lines are fetched separately, with bounded pagination and twelve additional
  provider reads at most. Failure, identity mismatch, malformed pages, repeating cursors,
  or exhausted bounds are retryable failures, not a license to revoke on incomplete evidence.
- Does not infer paid coverage from prorations, other prices/items, negative credits,
  mismatched quantities, or post-payment-credit-adjusted invoices. Refund/dispute and
  product/price-change policy remain separate release gates.
- Uses half-open periods: start <= now < end. It does NOT add a grace period beyond
  an expired paid period. An actual renewal may remain draft before payment; a commercial
  grace policy for that unpaid gap still requires an explicit decision and verification.

Evidence is evaluated when processing an event, not continuously. This change does not
install a scheduled expiry/reconciliation worker, persist a paid-through authorization
window, or claim that access expires precisely without a subsequent event. Monitoring,
reconciliation and paid-through enforcement must be addressed in hosted end-to-end QA.

Official references consulted:
- https://docs.stripe.com/billing/invoices/subscription
- https://docs.stripe.com/api/invoice-line-item/object
- https://docs.stripe.com/api/invoices/list
- https://docs.stripe.com/api/invoices/invoice_lines

## Pre-charge boundary

`/api/checkout/create` now requires confirmed entitlement mappings and server-resolved
billing truth. Only ordinary monthly/annual subscriptions and one-time prices are in
scope. Both legacy-offer and selected-price-option installment/introductory models
are rejected before customer/session creation, rather than charging and then failing
fulfillment. No browser-supplied price ID or billing model is accepted.

Read-only price/product verification rejects an inactive or deleted product, an
unexpanded product, wrong mode/type, missing price, tiered/metered/custom-amount or
quantity-transformed prices, unsupported intervals, and malformed trial settings.
Live-mode creation requires the atomic fulfillment flag. These checks do not replace
operational validation of actual key/account provenance, migrations, webhook secrets
and destinations, live offer mappings or the approved commercial price.

A URL is returned only after `stripe_offer_instances` confirms the pending row.
Failed or unconfirmed persistence causes a generic failure and best-effort expiry of
the newly created Checkout Session. A failed cleanup is logged without leaking its
URL. This does not solve a process crash/network ambiguity between remote session
creation and local persistence; idempotent checkout reservation/reconciliation remains
a distinct reliability gate. No real payment or session was created in these tests.

## Validation scope and remaining gates

The Jest tests exercise actual TypeScript helpers and API handlers with synthetic
Stripe/database transports. Existing disposable PostgreSQL RPC, concurrency and crash
checks remain in CI. Passing these is NOT hosted Stripe/PostgREST integration evidence.

Still required before release:
1. Full isolated application, PostgREST and real Stripe sandbox checkout/renewal journey,
   including provider API shape, trials, failed/recovered charges, cancellation and programs.
2. Paid-through expiry/reconciliation and approved grace policy; refund/dispute rules,
   price/product changes, duplicate checkout/subscription policy and upgrade ownership.
3. Reviewed migration/backfill and key/account provenance; sandbox/live separation and
   endpoints; source-grant conflicts and historical customer rows must not be overwritten.
4. Repository release protections, explicit controlled live test, and public activation.

Final marketing prices, Company Overview copy, website modules and Resend reinstatement
remain separate. The supported price shape does not choose or approve a retail amount.
