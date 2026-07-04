# Start Page Module Builder

The Start Page module builder adds controlled runtime-module editing for `/start` and `/start/[slug]` pages without turning Start pages into unrestricted page compositions.

## Primary workflow

Editors should use:

```txt
/admin/start-pages/[slug]/modules
```

for normal Start module edits.

The legacy JSON field on:

```txt
/admin/start-pages/[slug]
```

remains an advanced fallback for inspection or emergency editing, but it should not be the primary authoring workflow.

## What the builder controls

The builder writes only:

```txt
config.runtimeModules
```

inside the Start Page draft config.

It can add, reorder, edit, and remove approved presentation modules inside these Start zones:

```txt
afterHero
afterSystemCards
beforePricing
afterPricing
beforeFinalCta
```

## What the builder must not control

The builder must not control or override:

```txt
billing models
Stripe price IDs
checkout routing
trial enforcement
offer grants
entitlement mappings
approved price option truth
primary offer truth
```

Those remain owned by the existing Start/Offers systems.

## Start-safe module allowlist

The Start builder intentionally supports only a subset of runtime modules:

```txt
process.timed-steps.v1
process.numbered-cards.v1
system.cards-scroller.v1
persuasion.simple-cta.v1
ambient.marquee-strip.v1
case-study.scroll-cards.v1
faq.accordion.v2
feature.reasons-split.v1
comparison.table.v1
feature.icon-tiles.v1
grid.program-cards.v1
lead.waitlist-capture.v1
access.code-gate.v1
```

`lead.waitlist-capture.v1` is a conversion-safe lead/waitlist form. It owns only
lead capture + SMS consent and submits to `POST /api/people/waitlist`. It must
not carry or alter billing, Stripe IDs, checkout routing, trial enforcement,
entitlement grants, price-option truth, or offer truth. Its `variant` field
maps 1:1 to the backend `captureMode` (`simple` / `priority` / `concierge`).

`access.code-gate.v1` is an Access Code Gate. It owns only the access-code
entry UX and submits to `POST /api/access-codes/verify`. It must not carry or
alter billing, Stripe IDs, checkout routing, entitlement grants, trial
enforcement, price-option truth, or offer truth. On success it reveals a
configured safe relative CTA (e.g. `#pricing`,
`/create-account?returnTo=...`) — it never calls checkout and never grants
access. Codes are stored and compared only as HMAC-SHA-256 hashes; plaintext
codes are never stored or returned. See
`docs/design/ACCESS-CODE-GATE-MODULE.md` for the full contract.

The following modules are intentionally excluded from Start runtime zones:

```txt
pricing.tiers.v1
hero.offer-blur.v1
cta.program-offer.v1
```

Reason: Start pages already have hardened hero, CTA, pricing, checkout, trial, and offer behavior. Runtime module config should not replace or compete with those systems.

## Shared pathway modules

The Start-safe modules also function as a shared public-pathway module bank for Programs and Integrative Care where their content contracts fit.

The Programs and Integrative Care builders may reuse the same starter content and taxonomy labels for those shared modules, but their page-level publishing rules remain separate.

## Hero / Final-CTA routing override

A Start Page’s hero and final-CTA buttons default to checkout / product-selection
behavior: “Start your free trial” → `#plans` (or “Open app” when the visitor
already has access). When a banded conversion module (Waitlist or Access Code)
is deployed on the page, editors can redirect the relevant CTA to scroll to that
module section instead — without touching checkout logic.

Configure on `/admin/start-pages/[slug]`:

- `hero.primaryCta` — `{ label, href }` overrides the hero primary CTA.
- `finalCta.primaryCta` — `{ label, href }` overrides the final-section CTA.

Examples:

```txt
hero.primaryCta.label    = Join the waitlist
hero.primaryCta.href     = #waitlist

finalCta.primaryCta.label = Enter access code
finalCta.primaryCta.href  = #access-code
```

Behavior and safety:

- Both `label` and `href` must be set; otherwise the default CTA is preserved.
- `href` accepts safe hash anchors (e.g. `#waitlist`, `#access-code`) and safe
  relative paths (`/...`, not `//`). Well-formed `http:`/`https:` URLs are also
  accepted. Unsafe values (e.g. `javascript:`) are rejected at render time and
  the default CTA is used.
- The hash anchor must match a deployed module’s `anchorId`. Banded
  `lead.waitlist-capture.v1` defaults to `anchorId: waitlist`; banded
  `access.code-gate.v1` defaults to `anchorId: access-code`.
- This is PRESENTATION ONLY. It never adds checkout logic to the conversion
  modules, never changes verify/claim/grant behavior, and never alters the
  waitlist payload. Default checkout/product-selection behavior is preserved
  whenever the override is omitted or unsafe.

## Promoted Start section modules

Two originally Start-owned visual sections are available as generic shared modules:

```txt
system.cards-scroller.v1
process.numbered-cards.v1
```

They are presentation-only. Start pages can use them with trial/system copy, while Programs and Integrative Care can use them for pathway education, capabilities, proof, or method/process copy.

They must not carry or define:

```txt
trial enforcement
pricing truth
checkout routing
Stripe price IDs
offer grants
entitlement mappings
```

## Starter content policy

New shared pathway modules should start with valid editable starter content instead of an empty object. This keeps editors from creating immediately-invalid modules and makes preview/publish testing faster.

Starter content lives in:

```txt
lib/startPages/startRuntimeModules.ts
```

The starter content should be generic, safe, and clearly editable. It should not contain billing promises, clinical claims, or offer-specific entitlement language.

## Testing checklist

Before merging Start builder changes:

1. Run Vercel/build on the branch.
2. Open `/admin/start-pages/[slug]/modules`.
3. Add one allowed module, such as `comparison.table.v1`, to `beforePricing`.
4. Add `system.cards-scroller.v1` and `process.numbered-cards.v1` to confirm both start valid.
5. Confirm each opens in `ModuleContentPanel`.
6. Save draft.
7. Preview the Start page.
8. Confirm pricing/checkout/offer behavior remains unchanged.
9. Confirm Programs and Integrative Care builders can still add shared pathway modules.
10. Publish only after preview is approved.
