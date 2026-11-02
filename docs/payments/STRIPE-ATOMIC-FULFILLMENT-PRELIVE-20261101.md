# Stripe atomic fulfillment candidate

Status: pre-live draft. No production database installation or activation is authorized by this document.

## Scope

`stripeAtomicFulfillmentPrelive.sql` adds a service-role-only, SECURITY INVOKER RPC:
`public.fd_commit_stripe_fulfillment(jsonb)`. It changes the purchase instance,
source-specific entitlements, purchase-created program assignments, optional
checkout completion record, and event completion receipt in one transaction.

The route is integrated behind the server-only `STRIPE_ATOMIC_FULFILLMENT=1`
flag. A live-mode webhook fails closed if the flag is absent. A failed RPC never
falls back to the old separate-write path. No deployment flag was set during
source development. Legacy behavior remains available for sandbox staging only.

## Concurrency contract

1. The route reads the purchase and its revision BEFORE retrieving current
   Stripe objects. It does not reuse a provider snapshot after a conflict.
2. The RPC locks the receipt, verifies its token/expiry, serializes this path for
   the member, and locks the purchase. It checks the pre-read revision.
3. A trigger increments the revision on every purchase UPDATE, including legacy
   writers. This catches a status changing away and back, not just unequal status.
4. The account/mode/customer mapping, member, offer, and provider references must
   match. A locally ended purchase remains terminal.
5. All required database writes either commit together or roll back together.
   Lease expiry is checked after lock acquisition and again after business work.
6. A committed receipt records its instance/account/mode. Retrying after a lost
   response does not reapply fulfillment.

This is an atomic database fulfillment contract, not a distributed exactly-once
claim about Stripe, networking, emails, or all application writers. Stripe can
change after retrieval; subsequent events/reconciliation are still required.
Do not run old and new fulfillment writers concurrently on the same live data.

## Program and entitlement handling

Suspension targets only Stripe grants and auto-created purchase assignments with
the same source reference. `stripe_program_suspensions` tracks which assignments
this path suspended, so it does not blindly reactivate completed or independently
inactive assignments. Existing grant start/expiry bounds are preserved. Already
expired fixed-duration grants are not extended by payment recovery.

Existing member/entitlement uniqueness is retained. A conflicting other-source
grant raises an error and rolls back fulfillment; it does not transfer ownership
or pretend access was granted. Duplicate-subscription/upgrade policy must be
settled before exposing purchase offers.

## Validation

The workflow keeps existing unit/lifecycle tests and adds tests for the actual
route plus RPC adapter, read-before-provider ordering, activation fail-closed,
serialization rejection, malformed/lost responses, and unsupported billing.
Disposable PostgreSQL tests execute the actual RPC as service_role. They cover
competing events, stale revisions, lease expiry during work, rollback after grant,
program and checkout failures, recovery bounds, unrelated grants, and denied
client-role execution. A separate crash test terminates only its own loopback
fixture worker during program creation and checks that no partial grant remains.

These tests do not use production data, credentials, hosted PostgREST, or actual
Stripe payments. PostgreSQL fixture tables mirror the relevant inspected fields
and constraints, not the full production schema and triggers. Check the PR for
exact run IDs, source hashes and observed results; this document is not a pass receipt.

## Still required before deployment

- Validate renewal/draft/open-invoice timing and paid-period access. The existing
  conservative latest-invoice policy is unchanged by this concurrency patch.
- Complete isolated hosted application/PostgREST/Stripe sandbox journeys with the
  atomic flag on, including cancellation, recovery and actual program runtime.
- Initial atomic fulfillment supports normal subscription and one_time models.
  Installment/introductory models are rejected before fulfillment writes. This
  is NOT sufficient to prevent charges: gate unsupported models at checkout
  creation and in the offer catalog before any live activation.
- Finish refund/dispute and product/price-change rules; confirm program access
  semantics against actual runtime and ownership sources.
- Re-audit exact legacy customer rows before any backfill. The earlier proposed
  blanket sandbox backfill is not production-approved; never relabel new rows
  based on the prior four-customer audit.
- Formalize/review migrations, apply required schemas before dependent code,
  verify service-role privileges/RLS/advisors and schema cache, and verify
  account/key/signing-secret provenance. No SECURITY DEFINER bypass is needed.
- Drain old handlers, retain rollback/history, separate sandbox/live deployments,
  credentials, mappings and webhook destinations, and establish release controls.
- Confirm approved live offer terms and explicitly authorize a real-payment test.
  Brand copy, public pricing, marketing emails and Resend reinstatement stay separate.

## Dependency order (review only, not an execution instruction)

1. `stripeCustomerAccountsPrelive.sql` with separately reverified backfill scope.
2. `stripeWebhookProcessingLeasePrelive.sql`.
3. `stripeAtomicFulfillmentPrelive.sql`.
4. Matching source, environment invariants and isolated flag-on tests.
5. Independent review and controlled cutover; never enable live by swapping only a key.

Reference documentation consulted: Supabase Database Functions,
https://supabase.com/docs/guides/database/functions ; PostgreSQL 17 explicit locking,
https://www.postgresql.org/docs/17/explicit-locking.html ; Stripe subscription webhooks,
https://docs.stripe.com/billing/subscriptions/webhooks .
