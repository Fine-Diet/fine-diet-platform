# Public Pathway Assembly QA — Programs + Integrative Care

## Context

This note captures the next assembly direction after the Programs scaffold, shared pathway modules, and module preview fixes landed.

The current phase is page assembly, content/template alignment, and QA. It is not more module-building by default.

## Programs direction

Keep the current `/programs` structure as the representative page template unless prototype QA exposes a specific mismatch. The page can stay nutrition-led and visually richer than a plain directory, as long as the editable/module-managed surfaces remain flexible.

For `/programs/[category-slug]`, prefer saved composition templates over a single hard-coded recommended default. The existing Programs composition template picker can preserve multiple variants while letting editors start from a known-good stack.

Do not scope `/programs/[category-slug]/[program-slug]` in this pass.

### Programs guardrails

- Program cards remain resolver-driven from the Programs catalogue.
- Do not move pricing, checkout, Stripe price IDs, trial enforcement, grants, or entitlement truth into modules.
- Public render should keep the product + composition publish gate intact.
- Modules are presentation surfaces, not billing, access, or program truth.

## Integrative Care direction

`/integrative-care` should replace the old waitlist-style placeholder with a public pathway index.

The route uses a reserved landing record:

```txt
product:integrative-care:integrative-care-landing
composition:integrative-care:integrative-care-landing
```

This keeps the page narrative module-managed through the existing Integrative Care composition editor while preventing the reserved landing record from becoming a public product detail page.

The product/card directory on `/integrative-care` resolves from published Integrative Care product records. Product/pathway truth stays in the current product source-of-truth layer.

Because `/integrative-care` is now a first-class route, the legacy category catch-all must not return it from `getStaticPaths`.

### Integrative Care guardrails

- Do not use module copy as clinical, diagnostic, practitioner, booking, pricing, checkout, grant, or entitlement truth.
- Keep care claims conservative until reviewed by the business/content owner.
- Public product routes should require a published product record and a published composition.
- Draft compositions are for admin preview only.

## QA checklist

### Public routes

- `/programs`
- `/programs/[category-slug]`
- `/integrative-care`
- `/integrative-care/[productSlug]`

### Admin routes

- `/admin/programs-marketing/[slug]/composition`
- `/admin/programs-marketing/[slug]/preview`
- `/admin/integrative-care/[productSlug]/composition`
- `/admin/integrative-care/[productSlug]/preview`

### Behavior checks

- Saved Programs templates remain available and do not auto-publish.
- Integrative Care landing composition can be edited through the reserved landing record.
- `/integrative-care` shows the managed composition plus published product cards.
- `/integrative-care/integrative-care-landing` returns 404.
- Draft Integrative Care product compositions do not render publicly.
- Mobile QA covers full-screen hero modules, horizontal card scrollers, product cards, FAQs, and CTA anchors.
