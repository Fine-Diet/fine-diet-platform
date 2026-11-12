# Payments QA journey — 2026-11-02

Status: a real Stripe sandbox checkout, signed webhook fulfillment, renewal invoice, and cancellation ran through the application routes. This is not a production launch and not a production schema clone. No production SQL was applied, no production customer was copied, and the production webhook destination was not changed.

## What a member can do

Verified against the Payments QA database `ikvkqpbwlpevqlshdkdz` and claimable sandbox `acct_1UXS1WPXTq5u2TLw` (livemode false, expires 2026-11-10). The synthetic member is `payments-qa@example.com`. The catalog is one $1.00/month test price, `price_1UXVhgPXTq5u2TLwlRAgBbUj`, on offer `qa-payments-monthly`.

1. `POST /api/checkout/create` returned a Stripe Checkout URL. The session completed as a paid subscription. No live charge was created.
2. Signed delivery of `checkout.session.completed` committed the purchase: instance `active`, two active grants (`journal`, `program:qa-payments`), and an auto-created `qa-payments` assignment with source `purchase`.
3. Replaying the same four checkout events returned HTTP 200 and left the grant count at 2.
4. `POST /api/journal/programs/enroll` returned 201 with `qa-payments` active. `GET /api/journal/programs/runtime-summary` returned that enrollment.
5. A second $1.00 invoice on the same subscription was finalized and paid. `invoice.paid` and `customer.subscription.updated` committed. The purchase stayed `active`, both grants stayed active, and the assignment stayed active.
6. Deleting that subscription delivered `customer.subscription.deleted`. The purchase became `ended` (a canceled Stripe subscription is terminal), both grants became inactive, the assignment became inactive, and one `stripe_program_suspensions` row was written.

The legacy sandbox `acct_1T1s86ARcbgSDadA` was not used for any of this. Its only webhook is still `we_1T1w8FARcbgSDadAObxHqzfY`, enabled, API version `2026-01-28.clover`, events `checkout.session.completed`, `customer.subscription.deleted`, and `invoice.payment_failed`, URL `https://myfinediet.com/api/webhooks/stripe`. Re-read after the journey; unchanged.

## Limits of this proof

- The QA branch `fine-diet-payments-qa` is `MIGRATIONS_FAILED` and was empty. Direct SQL applied a 20-table journey schema plus the three candidate scripts. That is enough for these routes. It is not the 117-table production catalog and it is not a CI fixture.
- No second Supabase project was created. The only database cost is the branch compute already approved at US$0.01344/hour plus usage.
- Hosted preview credentials were not written. The Vercel token available here cannot list or create project environment variables, and the Vercel CLI has no local login. Shared Preview and Production settings were left untouched. Proof is from the local routes on `127.0.0.1:3010`, pointed only at the QA project and the new sandbox.
- The sandbox webhook is a Stripe CLI listener on that account, forwarding to the local route. The sandbox has no dashboard webhook, and none was created toward `myfinediet.com`. A durable preview destination waits on an isolated preview URL. The sandbox expires 2026-11-10 and must be claimed from the Stripe dashboard before then. The claim link is not stored in this public repository.
- Subscription and invoice events that arrived before `checkout.session.completed` linked the purchase returned HTTP 500 (`Attributed subscription has no linked purchase instance yet`) and then succeeded on retry. Stripe will retry; the route fails closed.
- The renewal `invoice.payment_succeeded` was claimed and then the delivery did not finish. Its lease stayed open for about 10 minutes while the paired `invoice.paid` had already committed. A retry of that one event is blocked until the lease expires. Access did not change.
- Ending the subscription does not close `program_enrollments`. The enrollment row stayed `active` after the grants and assignment were suspended. Program access after cancellation still needs a product decision before launch.
- Claimable sandbox secret keys use the `rkcs_test_` prefix. Checkout rejected them until account-context recognition accepted that prefix as test mode. Unknown key prefixes still fail closed.

## Production compatibility

Read-only catalog check on 2026-11-02. The candidate DDL is additive: `stripe_customer_accounts`, processing-lease columns, fulfillment columns, `fd_stripe_bump_fulfillment_revision`, trigger `fd_stripe_fulfillment_revision`, `stripe_program_suspensions`, and `fd_commit_stripe_fulfillment(jsonb)`. Existing purchase status, billing-model, entitlement, and assignment checks accept the values the route writes. `service_role` bypasses RLS and is the only role granted execute on the fulfillment function. Production has no duplicate Stripe grant groups. Current `set_updated_at` triggers call `now()` from `pg_catalog`, so the function `search_path` does not break them.

Production-specific blockers, in launch order:

1. Do not run `stripeCustomerAccountsLegacySandboxBackfill.sql`. It would stamp all existing `stripe_customers` rows — four on this read — as test customers of `acct_1T1s86ARcbgSDadA`. The table DDL no longer contains that insert. Checkout creates the mapping.
2. No published offer currently sets `assigns_program_slug`. A production purchase grants the offer's entitlements and does not auto-create a program assignment until an offer is given a slug. `fine-diet-method` already carries `program:baseline`; enrollment in that program is a separate route.
3. The legacy sandbox webhook above still points at production. Cutover needs its own live endpoint and must not reuse or edit that destination as the QA hook.
4. Decide whether cancellation should also end `program_enrollments`. The verified behavior suspends the auto-created assignment and deactivates Stripe grants only.

## Reviewed apply and rollback

Apply only after review, in this order, and only after the backfill file is confirmed absent from the apply set:

1. `scripts/sql/stripeCustomerAccountsPrelive.sql`
2. `scripts/sql/stripeWebhookProcessingLeasePrelive.sql`
3. `scripts/sql/stripeAtomicFulfillmentPrelive.sql`

Rollback of those objects, leaving legacy payment tables in place:

1. `DROP FUNCTION public.fd_commit_stripe_fulfillment(jsonb);`
2. `DROP TRIGGER fd_stripe_fulfillment_revision ON public.stripe_offer_instances;`
3. `DROP FUNCTION public.fd_stripe_bump_fulfillment_revision();`
4. `DROP TABLE public.stripe_program_suspensions;`
5. Drop `fulfillment_instance_id`, `fulfillment_account_id`, and `fulfillment_livemode` from `stripe_events`.
6. Drop `fulfillment_revision`, `stripe_account_id`, and `stripe_livemode` from `stripe_offer_instances`.
7. Drop `processing_token` and `processing_lease_expires_at` from `stripe_events`.
8. `DROP TABLE public.stripe_customer_accounts;` only if it contains no mappings that must be kept. If the rejected backfill were ever applied, delete those rows before dropping the table.

Do not drop `stripe_customers`, `stripe_events`, `stripe_offer_instances`, entitlements, or program tables as part of this rollback.

## Access and webhook recovery — 2026-11-02

The stored `program_enrollments` row stayed `active` after cancellation. With the program entitlement and assignment inactive, member routes returned `Journal access required` because the journal grant was inactive too.

Restoring only the journal grant showed the enrollment itself was being treated as paid access: `GET /api/journal/programs/runtime-summary` returned `resolved_status: active` for `qa-payments`, and `POST /api/journal/programs/checkins/respond` accepted that day until it found no template. No check-in row was written. The journal grant was then set inactive again.

Member routes now require a current program entitlement or an in-window active assignment before an open enrollment can continue. Re-checked with journal restored and the program grant still inactive:

- Runtime summary keeps the stored enrollment `active` and resolves it as `cancelled`, with no next check-in.
- Delivery modules, day completion, and check-in each return 403 `Program access is not active`.
- Check-in rows remain 0.

The renewal `invoice.payment_succeeded` receipt was left unprocessed after the listener timed out. Its lease was set one minute in the past and the same event was resent to the local route. The route returned 200, the receipt is processed, grant rows stayed at 2 with none active, and the purchase stayed `ended`. Fulfillment revision moved from 7 to 8 because the ended state was committed again. That is not a second grant.

Hosted preview credentials are not set. The signed-in Vercel user is an Owner of team `team_xrqp6Fqr3hd6L9dsLbzYYibn`, and project reads succeed, but `GET` and `POST /v10/projects/prj_vYpQqPixU3IFA2ko9uR0HmVJI84I/env` both return 403. The local Vercel CLI has no credentials. Shared Preview and Production were not changed. No dashboard webhook was added on `acct_1UXS1WPXTq5u2TLw`. The legacy endpoint `we_1T1w8FARcbgSDadAObxHqzfY` is unchanged.

The next release gate is a branch-scoped Preview environment for `codex/stripe-webhook-reliability-prelive-20261101`, then one webhook on the QA sandbox aimed at that preview, then one hosted checkout that includes this cancellation access check. Production apply and live mode stay closed.
