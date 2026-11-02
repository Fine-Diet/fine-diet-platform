# Stripe lifecycle hardening: pre-live review

This is engineering behavior for PR #224, not a public price/offer decision and not permission to enable live checkout.

## Standard subscription behavior

- Stripe event snapshots route processing; retrieve the current Checkout Session or Subscription before determining access.
- `checkout.session.completed` alone is not proof of payment. An unpaid session does not receive a grant. Delayed confirmation is handled through the async-payment events.
- A trial grants access only while the retrieved subscription is `trialing` and `trial_end` is in the future.
- An `active` subscription grants/restores access only when its expanded latest invoice is `paid`. Missing, unexpanded, or unpaid invoice state must not be inferred as paid. This conservative gate still needs actual sandbox renewal/invoice-transition testing; paid-period/grace-policy behavior is not certified here.
- The existing immediate-suspension policy is retained for current `past_due`, `unpaid`, `paused`, or `incomplete` state. The legacy purchase status `canceled` means suspended/recoverable in these paths; `ended` means terminal.
- A canceled or incomplete-expired Stripe subscription ends its purchase. A locally ended purchase is never reopened by a delayed invoice or checkout event.
- `cancel_at_period_end` alone does not end current paid access.
- Recovery reuses the same source-specific entitlement row, preserves its original start/expiry, and does not reactivate an already expired fixed-duration grant.
- Only grants tied to the affected purchase/source reference are revoked; unrelated access is not rewritten.

## Ownership and shared-account rules

A server-created `stripe_offer_instances` row is required for app fulfillment. Verify the current provider object's mode, customer, and any attribution metadata against that row. Conflicting or partial attribution fails closed. Entirely unrelated service events with neither app attribution nor an app purchase record are acknowledged without entitlement/purchase writes. Attributed invoice events arriving before the subscription is linked are retryable, not permanently discarded.

## Events implemented in the candidate

Checkout: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
Subscription: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.
Invoice: `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `invoice.payment_action_required`.

These are code capabilities. No endpoint configuration has been changed. Review the pinned Stripe webhook API version and subscribe the isolated sandbox endpoint to the required set when testing the complete application. Do not enable more live events against older deployed code.

## Verified-scope boundaries

The focused route suites use synthetic Stripe/Supabase fixtures. PostgreSQL receipt tests exercise the real receipt store through a SQL adapter, not the hosted PostgREST network path. Neither suite is a live charge.

The optimistic purchase-state update detects a changed state before the write, but it does NOT make subsequent grants/program actions transactional. Different events for the same subscription, process death, and workers continuing after lease expiry still need a fenced transaction/outbox or an equivalent proven design. Do not describe this patch as exactly-once fulfillment.

Installment/introductory schedules are preserved from the prior implementation, including known recovery limitations. They are NOT certified for live rollout. Refund/dispute policy, subscription price/product changes, paid-period coverage during invoice transitions, and full program access revocation remain review gates. Ordinary subscription tests do not authorize these other models.

## Before cutover

1. Complete business-side concurrency/fencing and the selected launch-model boundaries. Test with actual isolated PostgREST and Stripe sandbox deliveries, including payment recovery and renewal transitions.
2. Re-audit the exact legacy customer rows; do not blindly backfill new/unverified rows under the old four-customer audit. Review and install the additive migrations before dependent code is deployed.
3. Verify the key/account/mode and signing-secret provenance per environment. Keep sandbox/live endpoints, offer mappings, and customer identities separate. Do not simply replace a credential shared across preview and production.
4. Install reviewed GitHub merge/release controls. The prior read-only audit found unprotected main and no rulesets; that must be rechecked at release time. No permission changes are part of this patch.
5. Stage approved live prices separately from editable marketing copy, and only then run the specifically approved internal real-money transaction. Final public pricing, public links, Resend reinstatement, and marketing release remain separate decisions.

## Primary implementation references

- Stripe subscription events: https://docs.stripe.com/billing/subscriptions/webhooks
- Checkout fulfillment and delayed methods: https://docs.stripe.com/checkout/fulfillment
- Webhook delivery, signatures, duplicate and ordering behavior: https://docs.stripe.com/webhooks
