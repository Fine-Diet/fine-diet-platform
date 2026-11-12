# Stripe lifecycle hardening: pre-live review

This is engineering behavior for PR #224, not a public price/offer decision and not permission to enable live checkout.

## Standard subscription behavior

- Stripe event snapshots route processing; retrieve the current Checkout Session or Subscription before determining access.
- `checkout.session.completed` alone is not proof of payment. An unpaid session does not receive a grant. Delayed confirmation is handled through the async-payment events.
- A trial grants access only while the retrieved subscription is `trialing` and `trial_end` is in the future; `trial_end` is persisted as its access cutoff.
- A recurring subscription grants/restores access only when bounded, identity-checked paid invoice-line evidence covers the present instant. The exact matching line end is persisted as `paid_through`; invoice headers and `current_period_end` are not coverage proof. Missing, unexpanded, truncated, or ambiguous provider evidence remains retryable and does not change access.
- The existing immediate-suspension policy is retained for current `past_due`, `unpaid`, `paused`, or `incomplete` state. The legacy purchase status `canceled` means suspended/recoverable in these paths; `ended` means terminal.
- A canceled or incomplete-expired Stripe subscription ends its purchase. A locally ended purchase is never reopened by a delayed invoice or checkout event.
- `cancel_at_period_end` alone does not end current paid access.
- Renewal reuses the same source-specific entitlement row and extends its verified cutoff. A fixed-duration entitlement remains capped at its original duration; an expired fixed-duration grant is not restored.
- Only grants tied to the affected purchase/source reference are revoked; unrelated access is not rewritten.

## Ownership and shared-account rules

A server-created `stripe_offer_instances` row is required for app fulfillment. Verify the current provider object's mode, customer, and any attribution metadata against that row. Conflicting or partial attribution fails closed. Entirely unrelated service events with neither app attribution nor an app purchase record are acknowledged without entitlement/purchase writes. Attributed invoice events arriving before the subscription is linked are retryable, not permanently discarded.

## Events implemented in the candidate

Checkout: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
Subscription: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.
Invoice: `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`.
Risk review: `charge.refunded`, `charge.dispute.created`, and `radar.early_fraud_warning.created` are retrieved and identity-checked, then stored as sanitized review records. No event automatically revokes or restores access. An open review blocks later active fulfillment for the exact account/mode/source while leaving current access unchanged pending an approved response policy.

These are code capabilities. No endpoint configuration has been changed. Review the pinned Stripe webhook API version and subscribe the isolated sandbox endpoint to the required set when testing the complete application. Do not enable more live events against older deployed code.

## Verified-scope boundaries

Recurring access is denied at member reads when its paid-through cutoff is missing or expired, even before the scheduled worker runs. `/api/cron/reconcile-entitlements` uses a required constant-time Bearer check and invokes a service-role RPC bounded to 100 purchases; the SQL hard cap is 500 and uses `SKIP LOCKED` with the same person lock as fulfillment. Vercel schedules it every five minutes. No event is required for a cutoff to take effect.

The SQL transaction fences the purchase revision and event lease while committing the purchase, grants, purchase-created assignment, checkout event, and receipt together. The risk-review RPC commits its sanitized queue row and event receipt together. Local PostgreSQL concurrency validation remains required for this new candidate.

Installment, introductory, phased, and renewal-price fields fail closed before a Stripe Price read, customer creation, or Checkout Session. Supported checkout is one-time or simple monthly/annual recurring only. Review records do not enact refund/dispute policy. Founder decisions remain required for full/partial refunds, open/lost/won disputes, early-fraud warnings, and who may resolve a queue item with what evidence. Independent/manual access and the three historic `subscriptions.journal_access` rows are not changed by these paths.

The new access predicate also excludes pre-existing Stripe-sourced entitlement rows whose recurrence classification is unknown. Do not blanket-backfill `stripe_is_recurring` or `paid_through`: first classify each purchase from its durable instance and verified Stripe account/mode/customer evidence. Existing rows without that evidence stay denied until reviewed. Non-Stripe/manual grants and legacy `subscriptions.journal_access` rows retain their existing rules.

## Before cutover

1. Review and apply, in order, `stripeCustomerAccountsPrelive.sql`, `stripeWebhookProcessingLeasePrelive.sql`, `stripeAtomicFulfillmentPrelive.sql`, and `stripeEntitlementExpiryPrelive.sql`; then run the isolated QA schema gate and reconciliation report. Historical recurring purchases without verified paid-through evidence must stay denied until audited against current Stripe invoice lines.
2. Re-audit the exact legacy customer rows; do not blindly backfill new/unverified rows under the old four-customer audit. Do not alter or relabel legacy Journal subscriptions.
3. Verify the key/account/mode and signing-secret provenance per environment. Keep sandbox/live endpoints, offer mappings, and customer identities separate. Do not simply replace a credential shared across preview and production.
4. Install reviewed GitHub merge/release controls. The prior read-only audit found unprotected main and no rulesets; that must be rechecked at release time. No permission changes are part of this patch.
5. Stage approved live prices separately from editable marketing copy, and only then run the specifically approved internal real-money transaction. Final public pricing, public links, Resend reinstatement, and marketing release remain separate decisions.

## Primary implementation references

- Stripe subscription events: https://docs.stripe.com/billing/subscriptions/webhooks
- Checkout fulfillment and delayed methods: https://docs.stripe.com/checkout/fulfillment
- Webhook delivery, signatures, duplicate and ordering behavior: https://docs.stripe.com/webhooks
