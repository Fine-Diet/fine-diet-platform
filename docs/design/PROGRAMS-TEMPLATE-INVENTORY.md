# Programs Template Inventory

This decision record captures the current Programs marketing system before we build the next prototype-matching public pages.

Primary scope:

```txt
/programs
/programs/[category-slug]
```

Deferred scope:

```txt
/programs/[category-slug]/[program-slug]
```

The deferred program detail route should keep its current fallback behavior until the category prototype and module set are stable.

## Current route inventory

### `/programs`

A top-level index route is not yet represented as a composition-driven page in the current public Programs marketing system. Existing work is centered on category/collection and program-detail routes under:

```txt
pages/programs/[series]/index.tsx
pages/programs/[series]/[program].tsx
```

Recommendation: build `/programs` as a new collection-directory template instead of trying to stretch the existing category template into a top-level catalogue.

### `/programs/[category-slug]`

The category route is implemented as:

```txt
pages/programs/[series]/index.tsx
```

Important naming note: the route parameter is still called `series`, but the code comments state that this is the storage-boundary key and represents the Collection.

The route has two rendering modes:

1. Composition-driven mode, when both a published Programs marketing product record and a published composition exist.
2. Code-catalogue fallback mode, using `ProgramCategoryView`, when either published artifact is absent.

The publish gate is intentional. Published composition JSON alone must not flip the live page. The product record remains the explicit public switch.

### `/programs/[category-slug]/[program-slug]`

The program detail route is implemented as:

```txt
pages/programs/[series]/[program].tsx
```

It also has a composition-driven mode and a code-catalogue fallback mode.

This route should stay deferred until the top-level and category templates are approved, because it has different page jobs:

```txt
- explain one Program
- preserve previous/next pathway navigation
- resolve app/enrollment CTAs
- avoid competing with signed-in delivery in /app/programs
```

## Current category fallback template

The code fallback for category pages lives in:

```txt
components/programs/ProgramCategoryView.tsx
lib/programs/programCategoryContent.ts
```

`ProgramCategoryView` currently renders this ordered section stack:

```txt
1. CategoryHero
2. TimedProcessSteps
3. CategoryIntro
4. ProgramCardGrid
5. AmbientMarqueeStripV1
6. CategoryDifferentiators
7. CategoryAppIntegration
8. CategoryComparison
9. CategoryFaq
10. CategoryFinalCta
```

This is useful as a reference, but it is too section-heavy to treat as the final reusable prototype template without trimming.

## Current composition template inventory

Reusable starting templates live in:

```txt
lib/modules/compositionTemplates.ts
```

The current collection template includes:

```txt
hero.standard.v1
cta.program-offer.v1
process.slide-stack.v1
grid.program-cards.v1
feature.reasons-split.v1
ambient.marquee-strip.v1
feature.icon-tiles.v1
comparison.table.v1
faq.accordion.v2
cta.program-offer.v1
```

The recommended category baseline described in that file is:

```txt
hero -> how-it-works -> intro -> program-sequence -> marquee -> differentiators -> app-integration -> comparison -> faq -> final-cta
```

This matches the older comprehensive category landing direction. The prototype direction should now trim this into a smaller, clearer page system.

## Module scope for the next Programs build

### Keep for `/programs`

The top-level `/programs` page should be a directory/overview, not a long persuasion page.

Keep these module roles:

```txt
- compact hero / page intro
- collection/category card grid
- light method or pathway explainer
- short FAQ or support CTA only if needed
```

Best-fit existing runtime modules:

```txt
hero.standard.v1
feature.icon-tiles.v1
grid.program-cards.v1
process.timed-steps.v1
faq.accordion.v2
persuasion.simple-cta.v1
```

Gap: there is not yet a dedicated collection/category-card grid module for `/programs`. `grid.program-cards.v1` resolves Programs inside one Collection, not necessarily a top-level Collection directory. A new resolver-backed module may be needed if `/programs` should dynamically list Collections.

Potential new module:

```txt
grid.program-collections.v1
```

That module should read public Collection records and render cards linking to `/programs/[category-slug]`.

### Keep for `/programs/[category-slug]`

The category page should explain one Collection and route users into the Program sequence.

Keep these module roles:

```txt
- category hero
- short how-it-works/process strip
- Program sequence grid
- one proof/differentiator block
- one app/journal integration block
- FAQ
- final CTA
```

Best-fit existing runtime modules:

```txt
hero.standard.v1
process.timed-steps.v1
grid.program-cards.v1
feature.reasons-split.v1
feature.icon-tiles.v1
faq.accordion.v2
persuasion.simple-cta.v1
ambient.marquee-strip.v1
comparison.table.v1
```

Use `grid.program-cards.v1` as the structural anchor for the sequence. It should stay resolver-driven by `collectionSlug`, not hand-authored cards.

### Defer for `/programs/[category-slug]/[program-slug]`

Do not spend the next pass expanding the single Program detail template. It should remain available and composition-capable, but the public build priority is the catalogue and category path.

When we return to it, likely modules are:

```txt
hero.standard.v1
cta.program-offer.v1
nav.program-pathway.v1
grid.cards.v1
process.timed-steps.v1
faq.accordion.v2
persuasion.simple-cta.v1
```

## Module fat to trim

The category fallback currently has ten sections. For the prototype-driven template, trim aggressively.

### Trim or make optional by default

```txt
ambient.marquee-strip.v1
comparison.table.v1
feature.icon-tiles.v1
```

These are useful but should not always render. They are good optional modules when a Collection needs extra persuasion, but they should not be required for every category page.

### Avoid on `/programs`

```txt
cta.program-offer.v1
pricing.tiers.v1
hero.offer-blur.v1
nav.program-pathway.v1
```

Reason: `/programs` is a discovery surface. It should not behave like an offer page, pricing page, or single-Program pathway page.

### Avoid on `/programs/[category-slug]` unless intentionally needed

```txt
pricing.tiers.v1
hero.offer-blur.v1
```

Reason: Programs pages can point toward the right app/start/purchase path, but pricing and checkout truth should remain in the Offers/Start/buy systems.

## Copy fallback expectations

Programs pages must render with safe copy even when middleware/admin content is incomplete.

### Existing fallback source

`lib/programs/programCategoryContent.ts` already provides a safe fallback derived from the Collection definition.

It derives:

```txt
hero headline/subhead
process steps
intro copy
card grid heading/subhead
differentiators
app integration reasons
comparison rows
FAQ
final CTA
```

### Next fallback policy

For the new `/programs` top-level page, copy should derive from available public Collection metadata first:

```txt
Collection title
Collection subtitle
Collection description
Collection hero image
Collection program count
first available Program title
```

If a field is absent, use generic Fine Diet language that does not make clinical, billing, or availability promises.

Safe fallback examples:

```txt
Explore Fine Diet Programs
Choose a structured pathway and start with the program that fits your next step.
Public pages are overviews. Delivery, enrollment, and check-ins happen in the signed-in app.
```

For `/programs/[category-slug]`, the current `ProgramCategoryContent` fallback should remain the baseline until the new middleware/admin-managed fields are defined.

## Programmatic dependencies and guardrails

### Public catalogue truth

The Programs catalogue remains the source of truth for Collection/Program order, slugs, public paths, and resolver-backed grids.

Do not hand-author Program sequence cards in middleware/admin when a resolver can read them.

### Publish gate

A Programs page should switch to composition mode only when both exist:

```txt
published product:programs:{slug}
published composition:programs:{slug}
```

This applies to both Collection and Program pages.

### Admin writes

Admin writes go through:

```txt
/api/admin/programs-marketing/*
```

Service-role writes remain isolated to the server API path. Client/admin editors should not write directly to Supabase.

### Runtime module validation

Public rendering uses strict composition validation and drops invalid modules. Authoring uses non-destructive inspection so invalid modules remain visible/editable in the builder.

This guardrail should remain unchanged.

### Resolver slug warnings

Resolver-driven modules should keep explicit warnings when placeholder slugs remain:

```txt
grid.program-cards.v1
nav.program-pathway.v1
cta.program-offer.v1
```

These modules are valid by schema with placeholder strings, but they are not production-ready until the slugs are real.

## Proposed next build order

### PR 1: `/programs` route scaffold

Add the top-level route and conservative fallback view.

```txt
pages/programs/index.tsx
components/programs/ProgramsIndexView.tsx
lib/programs/programsIndexContent.ts
```

This route should not require composition publishing on day one. It can render from catalogue data and later gain a composition override once the module shape is approved.

### PR 2: Collection directory module

Add a resolver-backed module for top-level Collection cards.

```txt
grid.program-collections.v1
```

Use this only if the prototype needs the `/programs` page to be composition-driven. Otherwise keep it as a code-owned view for now.

### PR 3: Category template slimming

Update the recommended Programs category template so it defaults to the smaller prototype stack:

```txt
hero.standard.v1
process.timed-steps.v1
grid.program-cards.v1
feature.reasons-split.v1
faq.accordion.v2
persuasion.simple-cta.v1
```

Keep marquee, comparison, and icon tiles available but optional.

### PR 4: Admin copy surfaces

Define middleware/admin fields for page-level copy and fallback behavior after the public shape is stable.

Do not add admin fields for billing, checkout, entitlement, grants, or clinical claims.

## Completion criteria for the Programs prototype phase

The Programs prototype phase is complete when:

```txt
- /programs renders a catalogue/directory page with safe fallbacks
- /programs/[category-slug] can render a slimmer prototype-aligned template
- Program sequence cards are resolver-driven, not hand-authored
- Missing copy falls back from catalogue metadata
- Composition publishing still requires both product and composition records
- Pricing, checkout, grants, and entitlement truth remain outside Programs modules
- /programs/[category-slug]/[program-slug] remains stable until separately scoped
```
