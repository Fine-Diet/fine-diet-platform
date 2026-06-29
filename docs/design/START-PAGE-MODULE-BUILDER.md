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
persuasion.simple-cta.v1
ambient.marquee-strip.v1
case-study.scroll-cards.v1
faq.accordion.v2
feature.reasons-split.v1
comparison.table.v1
feature.icon-tiles.v1
grid.program-cards.v1
```

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
4. Confirm it starts valid and opens in `ModuleContentPanel`.
5. Save draft.
6. Preview the Start page.
7. Confirm pricing/checkout/offer behavior remains unchanged.
8. Confirm Programs and Integrative Care builders can still add shared pathway modules.
9. Publish only after preview is approved.
