# Stripe application / PostgREST HTTP validation

Status: pre-live candidate; no hosted payment or production activation.
Scope is additive to the existing lifecycle, atomic-fulfillment and renewal notes.
The exact tested head and run/job evidence are recorded in PR #224.

## What is real in this test

`scripts/payments/testStripeHttpBoundary.cjs` runs the checked-out webhook route
against Node HTTP requests, the installed `micro` body reader, the real Stripe
SDK and webhook signature verifier, the installed Supabase JavaScript client,
PostgREST v12.2.12 over HTTP, and a disposable PostgreSQL 17 database with the
proposed atomic fulfillment RPC. The route is loaded directly, not through a
built Next.js deployment. Database roles are selected with locally signed JWTs.

The test replaces service configuration to force both clients to loopback. It
creates only random synthetic people, offers and provider identities in the
throwaway database. It rejects pre-existing production credential/configuration
variables. The PostgREST database connection uses the disposable fixture's
postgres login, not a recommended deployment authenticator. No test JWT,
signing secret or fixture setup belongs in a deployed environment.

## What remains simulated or untested

Stripe's service responses come from a loopback HTTP server. The Stripe SDK is
real; the remote provider and event source are not. This does not demonstrate an
actual Stripe-hosted Checkout purchase, Stripe-originated webhook delivery,
hosted Supabase Auth, the full production schema/triggers, a Next.js build's
runtime routing, browser success/cancel redirects or program runtime access.
The fixture PostgREST version is pinned and is not a claim about the hosted
project's version. Passing CI must not be labeled the full hosted sandbox gate.

## Regression found by HTTP rather than the SQL adapter

Run 41380776420, head eb75a28c20b75f42a6ea8e6f3bd269c853edc1de, passed the prior
Jest/database checks and the first eleven HTTP scenario groups, then failed when
redelivering an event after a simulated Stripe service outage.

The claim store used a mutation `.or(...)` predicate for a NULL or expired lease
and selected only `stripe_event_id` from the update. The emitted PostgREST SQL
reapplied the logical predicate to its returned CTE, where the lease column was
not present, producing PostgreSQL 42703. Returning the new lease column would
not be a sound fix either: that predicate would evaluate the newly assigned
future lease, not the pre-update eligibility.

The correction reads the existing lease and chooses one scalar conditional
update: `IS NULL` for a released/legacy lease, or `<= captured_now` for an expired
lease. The unprocessed/event-ID predicates remain in the UPDATE. A competing
claim that installed a future lease makes the losing update return no row; the
loser must retry. Invalid or missing lease values fail closed. The SQL-adapter
test now transports timestamps as JSON strings to match the real HTTP client.

The failed HTTP regression is retained. Explicit concurrent NULL/expired claim
checks keep the winning claim pending until all competitors return and verify
that the old token cannot complete or release the new claim.

## HTTP scenario groups

- Anonymous/authenticated fixture roles cannot read billing/access tables or
  invoke the service-only fulfillment RPC.
- Missing, altered and expired signatures; mismatched account and event mode.
- Complete signed purchase, duplicate delivery, paid-period renewal, suspension,
  payment recovery preserving grant identity/start, terminal cancellation.
- Unpaid completion followed by asynchronous confirmation, and a valid trial.
- Provider HTTP outage/retry, SQL failure after grant work with full rollback,
  and a dropped HTTP response after a committed fulfillment.
- Eight concurrent signed deliveries, eight concurrent released-lease claims,
  eight concurrent expired-lease claims, and a full signed expired-lease replay.

The workflow also retains the existing 26 PostgreSQL scenarios, migration
repeatability, privilege assertions and focused Jest suite.

## Hosted sandbox isolation is still a prerequisite

The account inspection in this continuation found the original app sandbox
`acct_1T1s86ARcbgSDadA` still has an enabled webhook targeting the production
`myfinediet.com/api/webhooks/stripe` endpoint with only its original three events.
Creating a test subscription there could therefore drive the old production
handler. No external payment/subscription objects were created for this test,
and no existing endpoint was changed or disabled.

The Supabase branch inventory did not establish a ready payments QA project;
the existing food-log QA branch reported MIGRATIONS_FAILED. Do not repurpose it
or treat it as a verified billing environment without inspecting ownership and
schema compatibility.

Before a real sandbox purchase: select a dedicated, reviewed non-production
application/database target; prepare schema and scoped fixture offers; verify
account/key provenance and the atomic flag; and ensure the test Stripe context
has no webhook path into production. Preserve existing endpoints/history until
an explicit cutover plan accounts for their current consumers. Configure the
full lifecycle event set against that isolated target and verify delivery,
authenticated member access and program behavior there.

Time-based paid-through expiration, durable checkout reservation/idempotency,
refund/dispute and duplicate/upgrade policy, migration/backfill review, release
protections and explicitly authorized real-money validation remain separate
release gates. This test does not approve any price or commercial grace period.
