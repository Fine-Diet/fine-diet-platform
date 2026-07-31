# Package 2 — Return-to flow

```text
Protected /app or /journal destination
        ↓ (unauthenticated)
/login?redirect=<safe>&ctx=generic
        ↓ (auth success)
Effective access resolver
        ↓ unauthorized / missing person
/journal-waitlist?redirect=<safe>
        ↓ authorized + must onboard
/app/onboarding?returnTo=<safe>
        ↓ complete or skip
sanitized destination or /app
```

Checkout path:

```text
/api/checkout/create
        ↓ Stripe Checkout
/checkout/success?session_id={CHECKOUT_SESSION_ID}&returnTo=<safe>
        ↓ bounded /api/checkout/reconcile
ready → onboarding (if needed) or returnTo
pending → retry up to 8 attempts
failed/timeout → honest recovery UI (no false grant)
```

Safety:

- Only relative first-party paths
- Reject external, protocol-relative, backslash, and control-character targets
- Onboarding returnTo limited to `/app` and `/journal` surfaces
