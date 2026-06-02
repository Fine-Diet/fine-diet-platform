# Module Style Guide Audit

Inventory and gap map for the Fine Diet Module Style Guide system. This document
compiles the reusable modules built for the **public site** and the **signed-in app**
into one reference so product, design, and building agents can find, preview, and
safely reuse them.

- **Status:** Living inventory. Additive only.
- **Scope of this pass:** Audit + metadata enrichment + reuse-contract panel + one
  missing live preview. No inline components were extracted (see
  [Inline components worth extracting](#5-inline-components-worth-extracting)).
- **Date:** 2026-06.

## Reference system map

| Surface | File | Role |
|---|---|---|
| Catalog page | `pages/style-guide/modules.tsx` | Grid of all cataloged modules with mini previews + property tables. |
| Detail page | `pages/style-guide/modules/[slug].tsx` | Full live (iframe) preview, viewport toggle, variant selector, property inspector, **Reuse Contract panel**. |
| Embed/live preview | `pages/style-guide/modules/embed/[slug].tsx` | Renders the real component (or a safe static recreation) with **mock data**. Loaded inside the detail iframe. |
| Style-guide registry | `lib/moduleRegistry.ts` | `MODULE_STYLE_CATALOG` — taxonomy + reuse metadata. Source of truth for the three pages above. |
| Runtime module system (public) | `lib/modules/registry.ts` | `MODULE_REGISTRY` — Zod schema + component map for `ModuleRenderer` marketing pages. **Not** in the style catalog. |
| Signed-in app registry | `lib/modules/appModuleRegistry.ts` | `APP_MODULE_REGISTRY` — governance/inventory metadata for app modules. **Not** in the style catalog. |
| App docs | `docs/app/APP-MODULE-SYSTEM.md`, `docs/app/APP-UI-FOUNDATION.md` | Layer model, ownership, surfaces, shell/footer/nav constraints. |

> **Do not merge** `lib/moduleRegistry.ts` (style catalog), `lib/modules/registry.ts`
> (runtime renderer), and `lib/modules/appModuleRegistry.ts` (app governance) yet.
> They serve different jobs. This audit treats them as three adjacent systems and
> proposes a future reconciliation step, not a merge.

## How "preview" works today

There are two kinds of catalog preview:

- **Live component preview** — the embed page imports and renders the *actual*
  component with mock data. Highest fidelity; changes to the component are reflected.
- **Static recreation preview** — the embed page hand-rebuilds the visual with the
  same Tailwind classes because the "component" only exists inline in a page file
  (no importable component yet). Lower fidelity; can drift from the source.

Distinguishing these is the main driver of the extraction recommendations below.

---

## 1. Cataloged + previewed

These have a `MODULE_STYLE_CATALOG` entry **and** a working live preview rendered from
the real component.

| Slug | Component | Surface | Notes |
|---|---|---|---|
| `hero` | `components/home/HeroSection` | public_site | Live, dual/single CTA variants. |
| `hero-medium` | `components/home/HeroMediumSection` | public_site | Live. |
| `feature-card` | `components/home/FeatureSection` | public_site | Live, carousel + single-slide. |
| `grid-2col` | `components/home/GridSection` (+ `GridItem`) | public_site | Live. |
| `grid-2col-medium` | `components/home/GridMediumSection` (+ `GridItemMedium`) | shared | Live. |
| `grid-section-app` | `components/home/GridSectionApp` (+ `GridItemApp`) | signed_in_app | Live, with-data + empty-state, `SummaryRowModule` mock. |
| `cta-banner` | `components/home/CTASection` | public_site | Live. |
| `button` | `components/ui/Button` | shared | Live, all variants + sizes + disabled. |
| `buy-offer-button` | `components/checkout/BuyOfferButton` | shared | Live in **preview-only** mode (`offerKey="preview-only"`); real clicks error. See safety note. |
| `meal-section` | `components/journal/MealSection` | signed_in_app | Live, empty/with-items/translucent. |
| `journal-hero` | `components/journal/JournalHeroSection` | signed_in_app | Live, composes `MealSection` children + `NutritionDensityGauge`. |
| `aurora-background` | `components/journal/AuroraBackground` | shared | Live, ambient layer. |

## 2. Cataloged + previewed via static recreation

Cataloged with a working preview, but the embed page **rebuilds the visual statically**
because the real "component" is inline in a page (or, for the form, deliberately
mocked to avoid network/state). Treat these previews as illustrative, not canonical.

| Slug | "Source" today | Why static | Action |
|---|---|---|---|
| `access-card` | `components/app/cards/AccessCard` | ~~No importable component~~ | **✅ Extracted + live (Packet 2B-A, §11).** |
| `quick-action` | `components/app/actions/QuickActionButton` | ~~No importable component~~ | **✅ Extracted + live (Packet 2B-A, §11).** |
| `recommendation-card` | `components/app/cards/RecommendationCard` | ~~No importable component~~ | **✅ Extracted + live (Packet 2B-A, §11).** |
| `section-label` | `pages/home.tsx` (inline `h2`) | Pattern, not a component | Optional: ship a tiny `SectionLabel` primitive. |
| `form-panel` | `@/app/journal-waitlist/WaitlistForm` | Real component exists; embed recreates it statically to avoid form subm/network in the iframe | Keep static, or wire the real component behind a `preview`/no-submit prop. |

## 3. Cataloged + missing live preview

Cataloged but with **no embed render case** (detail page shows "No live preview
available"). Lowest-effort wins.

| Slug | Component | Can preview with mock data? | Status |
|---|---|---|---|
| `grid-app-section-home` | `components/journal/GridAppSectionHome` | Yes — self-contained, hardcoded tiles, only needs `next/link` + `next/image` | **Added this pass.** |

## 4. Built + missing catalog entry

Reusable components that exist in code but are **not** in `MODULE_STYLE_CATALOG`.
Grouped by readiness for cataloging. (No new catalog entries were added in this pass
beyond the missing preview above; these are the backlog.)

### 4a. Drop-in, easy to catalog + preview (mock-friendly)

> Rows marked **✅ Packet 2A** were cataloged + previewed live in §10.

| Component | Surface | Description | Preview input |
|---|---|---|---|
| `components/journal/NutritionDensityGauge` | signed_in_app | d3 half-donut NDS gauge. **✅ Packet 2A.** | `value: number \| null`, `isLoading`, `label` |
| `components/layout/StackedPageSection` (`StackedPageHero` + `StackedPageSection`) | shared | Stacked-sheet page layout primitive (rule-backed: `.cursor/rules/stacked-page-sections.mdc`). **✅ Packet 2A.** | `layer`, `children` |
| `components/journal/AppTopNav` | signed_in_app | Fixed app top nav (product mark + hamburger). Shell constraint per APP-UI-FOUNDATION §2. **✅ Packet 2A.** | none |
| `components/journal/JournalFooterNav` | signed_in_app | Fixed footer nav pill + Quick Entry control. Shell constraint per APP-UI-FOUNDATION §3–4. **✅ Packet 2A.** | none (uses router for active tab) |
| `components/journal/AppShell` | signed_in_app | `AppTopNav` + dark base + top offset wrapper. **✅ Packet 2A.** | `children` |
| `components/journal/SavedMealCard` | signed_in_app | Carousel meal button (name + optional NDS). **✅ Packet 2C-A.** | `name`, `nutritionDensity?` |
| `components/journal/JournalDateSelector` | signed_in_app | Sticky day navigator. Overlaps date nav inside `JournalHeroSection`. **✅ Packet 2C-A.** | `initialDate?`, `onDateChange?` |
| `components/home/GridItemApp` | signed_in_app | `SummaryRowModule` image card (child of `grid-section-app`). **✅ Packet 2C-A.** | `module: SummaryRowModule` |
| `components/home/GridItemEmailCapture` | public_site | Grid card with inline newsletter capture form. | `title`, `image?` (submits to API on use) |
| `components/journal/plans/ProjectedNDSStrip` | signed_in_app | 7-day projected NDS strip. **✅ Packet 2C-B.** | `planId`, `days`, `mealCountByDay` |
| `components/journal/plans/ScheduleConflictBanner` | signed_in_app | Expandable conflict banner. **✅ Packet 2C-B.** | `conflicts`, `onApply?` |
| `components/journal/plans/ProfileDefaultsBanner` | signed_in_app | Planning defaults summary + missing-profile warning. **✅ Packet 2C-B.** | `snapshot`, `display`, `canGenerate`, `missingReasons` |

### 4b. Needs-data renderers (catalog with fixtures)

| Component | Surface | Notes |
|---|---|---|
| `components/journal/JournalBlockSection` | signed_in_app | Meal block w/ summary + flags. Takes pre-filtered `entries`; mockable. **✅ Packet 2A.** |
| `components/journal/DailySummary` (`TrackingModuleCard`) | signed_in_app | Tracking tiles from enabled prefs; mockable with `JournalEntry[]` + `enabledKeys`. **✅ Packet 2A.** |
| `components/journal/LoggedItemCard` | signed_in_app | Food row w/ macro bar + inline edit. Uses `next/router` — works live in the embed page (real router context). **✅ Packet 2C-B.** |
| `components/journal/CompactLoggedCard` | signed_in_app | Non-intake entry card. Uses `next/router` — works live in the embed page. **✅ Packet 2C-B.** |
| `components/journal/plans/SlotCard` | signed_in_app | Plan slot w/ planned meals. Prop + callback driven. **✅ Packet 2C-B.** |
| `components/journal/plans/DayView` | signed_in_app | Day orchestrator over `SlotCard`. **✅ Packet 2C-B.** |
| `components/journal/plans/WeekViewPanel` | signed_in_app | Week workbench shell; composes banners + `ProjectedNDSStrip`. **✅ Packet 2C-B.** |
| `components/journal/programs/ProgramDeliveryModules` | signed_in_app | Config-driven program module cards. **✅ Packet 2C-B.** |
| `components/journal/programs/BaselinePrepModules` | signed_in_app | Baseline Day-0 prep modules. **✅ Packet 2C-B.** |
| `components/journal/programs/BaselineWeekOneModules` (`…WeekTwo…`, `…WeekThree…`) | signed_in_app | Baseline weekly guidance. **✅ Packet 2C-C** (active `ProgramRuntimeSummary` fixture; renders null when inactive/out-of-window). |
| `components/journal/NDSDisplay` | signed_in_app | NDS score + subscore bars/chips (feature-flagged display variant). **✅ Packet 2C-A.** |
| `components/ui/aurora-background` | shared | Generic aurora wrapper. Name collided with `components/journal/AuroraBackground`. **✅ Packet 2C-C** — cataloged as `aurora-page-wrapper` (aliased import); existing `aurora-background` route unchanged. |

### 4c. Separate runtime module system (`lib/modules/registry.ts`)

A full, separate composable system used by `ModuleRenderer` for marketing pages, with
Zod schemas. **None are in the style catalog.** Cataloging these is a larger effort
(they are schema-driven and already have their own runtime). Candidates:
`HeroStandardV1`, `HeroOfferBlurV1`, `FeatureSplitMediaV1`, `FeatureReasonsSplitV1`,
`GridCardsV1`, `CtaBandV1`, `FaqAccordionV1`, `FaqAccordionV2`, `PricingTiersV1`,
`ProcessSlideStackV1`, `PersuasionSimpleCtaV1`, `AmbientMarqueeStripV1`,
`CaseStudyScrollCardsV1`.

> Recommendation: catalog these as a dedicated category once the style catalog and
> runtime registry are reconciled, since they already carry typed content contracts.

## 5. Inline components worth extracting

Defined inline inside page files. Extracting these makes their catalog previews
**live** (instead of static recreations) and lets app/site pages share them.

| Inline component | File | Suggested home | Cataloged? |
|---|---|---|---|
| ~~`AccessCard`~~ | ~~`pages/home.tsx`~~ → `components/app/cards/AccessCard.tsx` | done | **✅ Extracted + live (Packet 2B-A)** |
| ~~`QuickActionButton`~~ | ~~`pages/home.tsx`~~ → `components/app/actions/QuickActionButton.tsx` | done | **✅ Extracted + live (Packet 2B-A)** |
| ~~`RecommendationCard`~~ | ~~`pages/home.tsx`~~ → `components/app/cards/RecommendationCard.tsx` | done | **✅ Extracted + live (Packet 2B-A)** |
| Section label `h2` | `pages/home.tsx` | `components/ui/SectionLabel` | Yes (`section-label`, pattern) |
| ~~`TodayRhythmModule`~~ | ~~`pages/journal/home.tsx`~~ → `components/journal/home/TodayRhythm.tsx` | **✅ Extracted + live (Packet 2B-B, `today-rhythm`)** |
| ~~`NutritionDensityModule`~~ (horizontal scroller) | ~~`pages/journal/home.tsx`~~ → `components/journal/home/NutritionDensityScroller.tsx` | **✅ Extracted + live (Packet 2B-B, `nutrition-density-scroller`)** — distinct from `NutritionDensityGauge` |
| ~~`QuickEntryModule`~~ | ~~`pages/journal/home.tsx`~~ → `components/journal/home/QuickEntryRow.tsx` | **✅ Extracted + live (Packet 2B-B, `quick-entry-row`)** |
| ~~`PrepPantryModule`~~ | ~~`pages/journal/home.tsx`~~ → `components/journal/home/PrepPantryCard.tsx` (presentational split; hook stays on page) | **✅ Extracted + live (Packet 2B-B, `prep-pantry-card`)** |
| ~~`HomeTemplateCards`~~ | ~~`pages/journal/home.tsx`~~ → `components/journal/home/HomeTemplateCards.tsx` | **✅ Extracted + live (Packet 2B-B, `home-template-cards`)** |

> Per the project rules, **none of these were extracted in this pass.** Extraction is
> tracked here as a backlog and ordered in §7.

## 6. Do-not-reuse-directly modules

These render correctly but are **not safe to drop into a new page as-is** — they self-
fetch, require auth/services, take over the screen, or hit hardware. Wrap, gate, or use
the documented preview mode instead.

| Component | Why | Safe path |
|---|---|---|
| `components/checkout/BuyOfferButton` | Functional CTA: calls checkout API, redirects to Stripe, handles 401/entitlement. Cataloged but the live preview is **preview-only** (`offerKey="preview-only"`). | Always pass a real `offerKey` + `placement`; never reuse for non-purchase actions. |
| `components/journal/AddItemsPanel` | Full-screen modal; calls `foodService.search/listFavorites` + `journalService.listHistoryFoods` (auth). | Use only within the log flow with services available. |
| `components/journal/BarcodeScanner` | Camera permissions + dynamic `html5-qrcode` import. | Only behind a user gesture; provide manual-entry fallback. |
| `components/journal/programs/ActiveProgramCard` / `ActiveProgramChip` | Self-fetch `GET /api/journal/program-runtime/summary`; render `null` when no active program. | Reuse only on authed program surfaces. |
| `components/journal/plans/SlotEditor` (create mode) | Calls `journalService.listMealTemplates()` + `planService.listImports()`. | Edit mode is prop-only and mockable; create mode is page-specific. |
| `components/journal/programs/BaselineCheckinPanel` (live mode) | POSTs to `/api/journal/programs/checkins/respond`. | Use `previewMode` for non-functional rendering. |
| `pages/journal/home.tsx → PrepPantryModule` | Wraps `usePantryReadiness` hook (live plan/grocery/pantry truth). | **✅ Done (Packet 2B-B):** presentational `PrepPantryCard` extracted; `usePantryReadiness` + `derivePrepPantryView` stay page-side. |
| `pages/journal/home.tsx → NutritionDensityModule` | Driven by `useNDS` data shape. | **✅ Done (Packet 2B-B):** presentational `NutritionDensityScroller` extracted; `useNDS` stays page-side, data passed via props. |

## 7. Recommended next extraction order

Ordered for lowest effort / highest reference value first. Each step is additive and
behavior-preserving.

1. **`grid-app-section-home` live preview** — _done this pass_ (embed render case added).
2. **`NutritionDensityGauge` → catalog (drop-in).** Pure props (`value`, `isLoading`,
   `label`); trivial mock. High reuse value for app surfaces.
3. **`StackedPageSection` / `StackedPageHero` → catalog (layout primitive).** Already
   rule-backed; preview a 2–3 layer stack with placeholder blocks.
4. **App chrome → catalog.** `AppTopNav`, `JournalFooterNav`, `AppShell`. Encodes the
   APP-UI-FOUNDATION shell/footer/nav constraints so builders don't re-derive them.
5. **`JournalBlockSection` + `DailySummary` tracking card → catalog with fixtures.**
   Core log-surface modules; both accept mockable `JournalEntry[]`.
6. **Extract `pages/home.tsx` inline cards** (`AccessCard`, `QuickActionButton`,
   `RecommendationCard`) into `components/app/*`, then switch the existing catalog
   previews from static recreation to live component renders.
7. **Extract `pages/journal/home.tsx` modules** (`TodayRhythm`, `QuickEntryRow`,
   `PrepPantryCard` presentational split, `HomeTemplateCards`) and catalog them.
8. **Plans/Programs prop-driven renderers** (`SlotCard`, `WeekViewPanel`,
   `ProjectedNDSStrip`, `ScheduleConflictBanner`, `ProgramDeliveryModules`,
   `BaselinePrepModules`) → catalog with fixtures.
9. **Reconcile registries (design step, not a merge).** Map style-catalog slugs to
   `lib/modules/appModuleRegistry.ts` ids and `lib/modules/registry.ts` keys so a
   module's *visual taxonomy*, *governance metadata*, and *runtime contract* can be
   cross-referenced. Only after the app module model is stable.

## 8. Ownership reminder (from APP-MODULE-SYSTEM / APP-UI-FOUNDATION)

When adding catalog metadata or extracting components, preserve these boundaries:

- **CMS/config may edit presentation only:** copy, imagery, CTA labels, campaign
  framing, ordering within safe bounds, visibility windows.
- **Code-owned:** component behavior, route contracts, design templates, safe
  defaults, analytics event names.
- **Data/Truth-owned:** NDS score, journal entries, plan/grocery/pantry truth,
  tracking preferences, program progress, entitlements. CMS must never invent these.
- **Safety-owned:** nutrition/medical guardrails, entitlement rules, disclaimers.

The catalog `governance` / `editableFields` / `dataContract` metadata added in
`lib/moduleRegistry.ts` is the per-module expression of these rules.

---

## 9. Packet 1 QA Result

**Date:** 2026-06-01

### Routes checked

| Route | Result |
|---|---|
| `/style-guide/modules` | Pass — 18 modules, category filters work (verified Grids → 4 cards). |
| `/style-guide/modules/hero` | Pass — live preview, dual/single CTA variants, Builder Notes panel. |
| `/style-guide/modules/grid-app-section-home` | Pass — real `GridAppSectionHome` preview (4 tiles), iframe height 660px, no overflow. |
| `/style-guide/modules/button` | Pass — primary/secondary/tertiary/quaternary variants switch correctly. |
| `/style-guide/modules/journal-hero` | Pass — composable preview, iframe ~794px, safety notes render in Builder Notes. |
| `/style-guide/modules/form-panel` | Pass — static no-submit recreation loads; Builder Notes present. |

All 18 `MODULE_STYLE_CATALOG` detail routes and sampled embed routes returned HTTP 200.

### Issues found

1. **Iframe height under-reporting for `vh` modules** — Hero preview stuck at default 600px because `99vh` resolved against the iframe's own short height (circular measurement).
2. **Inspector sidebar clipping on narrow viewports** — Fixed `w-80` sidebar could push content off-screen when the browser panel is narrow.
3. **Long metadata paths** — Mock data paths and property values could overflow the inspector without word-break.
4. **`grid-section-app` variant selector missing** — Embed already supports `empty-state` but the detail page had no variant toggles.
5. **Embed `min-h-screen` wrapper** — Inflated iframe/document height for short modules (e.g. grid-app-section-home reporting 1080px instead of ~660px).

### Fixes made (QA polish pass)

- **`pages/style-guide/modules/embed/[slug].tsx`**
  - Removed `min-h-screen` wrapper (was inflating iframe height for short modules).
- **`pages/style-guide/modules/[slug].tsx`**
  - Improved `PreviewFrame` height sync: temporarily expand iframe to viewport height so `vh`-based modules (Hero) measure correctly; read content-root `scrollHeight` to avoid global body min-height inflation; apply capped height inline + state (short modules stay ~660px, heroes ~99vh).
  - Responsive inspector layout: stacks below preview below `xl`, sidebar at `xl+`.
  - Added `break-words` / `break-all` on inspector property values and mock-data paths.
  - Tightened governance Ownership row to render only when ownership flags are present.
  - Added `grid-section-app` to `VARIANT_OPTIONS` (`with-data`, `empty-state`).

### Remaining recommended Packet 2 targets

Priority order unchanged from §7 — start with drop-in catalog additions that need no extraction:

1. **`NutritionDensityGauge`** — pure props, high reuse on log surfaces.
2. **`StackedPageSection` / `StackedPageHero`** — layout primitive (rule-backed).
3. **App chrome** — `AppTopNav`, `JournalFooterNav`, `AppShell`.
4. **`JournalBlockSection` + `DailySummary` tracking card** — mockable with `JournalEntry[]` fixtures.
5. **Extract `pages/home.tsx` inline cards** — switch static previews to live component renders.
6. **Extract `pages/journal/home.tsx` modules** — TodayRhythm, QuickEntryRow, PrepPantry, HomeTemplateCards.
7. **Plans/Programs prop-driven renderers** — SlotCard, WeekViewPanel, ProjectedNDSStrip, etc.

Deferred (not blocking Packet 2):

- `grid-app-section-home` catalog variants (`with-image`, `upgrade-placeholder`) — embed renders one state today; add variant cases when cataloging expands.
- Hero iframe still approximates viewport height via parent `window.innerHeight`, not the iframe width toggle — acceptable for style-guide; document if agents need pixel-perfect breakpoint QA.
- ESLint not configured in repo (`next lint` prompts interactive setup) — typecheck is the reliable gate.

---

## 10. Packet 2A Result

**Date:** 2026-06-01

**Objective:** Add the first batch of high-value app-surface modules (NDS gauge, layout
primitive, app chrome, log/tracking modules) to the catalog and live preview system.
Additive only — no public/app runtime behavior changed; no live data/API/auth/Supabase
dependency introduced into any style-guide preview.

### Modules added to `MODULE_STYLE_CATALOG`

| Slug | Component | Category | Surface | Reusability | Live preview |
|---|---|---|---|---|---|
| `nutrition-density-gauge` | `components/journal/NutritionDensityGauge` | content | signed_in_app | drop_in | Yes — `default` / `loading` / `empty` |
| `stacked-page-section` | `components/layout/StackedPageSection` (`StackedPageHero` + `StackedPageSection`) | layout | shared | drop_in | Yes — hero + 2 stacked layers |
| `app-top-nav` | `components/journal/AppTopNav` | navigation | signed_in_app | drop_in | Yes — fixed bar in a relative spacer |
| `journal-footer-nav` | `components/journal/JournalFooterNav` | navigation | signed_in_app | drop_in | Yes — default (`log`-active, router-derived) + Quick Entry toggle |
| `app-shell` | `components/journal/AppShell` | layout | signed_in_app | drop_in | Yes — placeholder children below the `pt-9` offset |
| `journal-block-section` | `components/journal/JournalBlockSection` | content | signed_in_app | needs_data | Yes — `empty` / `with-items` (mock `JournalEntry[]`) |
| `daily-summary` | `components/journal/DailySummary` (`TrackingModuleCard`) | card | signed_in_app | needs_data | Yes — `ready` / `empty` (mock `JournalEntry[]` + `enabledKeys`) |

All seven primary + secondary targets were cataloged **and** previewed live from the real
components. No target was skipped or deferred — each renders safely with fixtures.

### Live previews added (`pages/style-guide/modules/embed/[slug].tsx`)

New render cases, all fixture-driven (no API/auth/Supabase, no mutation, no routing on click):

- `nutrition-density-gauge` — inline `value` (`72` / `null`) + `isLoading`; `animate={false}` for deterministic capture.
- `stacked-page-section` — `StackedPageHero` base + two `StackedPageSection` layers (z-10 / z-20) with placeholder blocks; demonstrates the `-mt-8` / `rounded-t-[2rem]` overlap.
- `app-top-nav` — rendered inside a `relative` spacer so the `position: fixed` bar is visible in the iframe.
- `journal-footer-nav` — rendered inside a `relative` spacer pinned to the iframe bottom; active tab is router-derived and resolves to `log`.
- `app-shell` — wraps placeholder `children`; shows the dark base + `pt-9` nav offset.
- `journal-block-section` — mock intake `JournalEntry[]` (`MOCK_BLOCK_ENTRIES`) for `with-items`, `[]` for `empty`.
- `daily-summary` — mock cross-type `JournalEntry[]` (`MOCK_SUMMARY_ENTRIES`) + `MOCK_SUMMARY_ENABLED` for `ready`, `[]` for `empty`.

New shared fixtures added to the embed page: `MOCK_JOURNAL_DATE` (fixed reference date),
a `mockEntry()` helper that stamps `JournalEntry` timestamps deterministically,
`MOCK_BLOCK_ENTRIES`, `MOCK_SUMMARY_ENABLED`, and `MOCK_SUMMARY_ENTRIES`.

### Variant options added (`pages/style-guide/modules/[slug].tsx`)

- `nutrition-density-gauge`: `default`, `loading`, `empty`
- `stacked-page-section`: `default`
- `app-top-nav`: `default`
- `journal-footer-nav`: `default` (active-tab states are router-derived, not prop-driven — a single honest variant; see note below)
- `app-shell`: `default`
- `journal-block-section`: `empty`, `with-items`
- `daily-summary`: `ready`, `empty`

### Category / type additions

Two minimal additive `ModuleCategory` values were introduced because app chrome and
layout primitives don't fit the content-oriented categories without making the catalog
misleading:

- **`layout`** — shell/stacking primitives (`stacked-page-section`, `app-shell`).
- **`navigation`** — app chrome nav bars (`app-top-nav`, `journal-footer-nav`).

Both were added to the `ModuleCategory` union, the `MODULE_CATEGORIES` filter list, and
the per-category color/height maps in `modules.tsx` and `[slug].tsx`. Existing categories
were unchanged.

### Components cataloged but **not** previewed live

None. Every Packet 2A target renders live from its real component with fixtures.

### Honest preview-fidelity notes

- **`journal-footer-nav`** — the active tab is derived from `router.pathname`, not a prop.
  Inside the style-guide route `deriveActiveTab()` resolves to `log`, so the catalog lists
  `home-active` / `programs-active` / `log-active` / `plans-active` as real visual states on
  app routes, but the live preview can only show the default (`log`-active) plus the Quick
  Entry menu toggle. Documented in the entry `notes` and the variant comment.
- **`app-top-nav` / `journal-footer-nav`** — both use `position: fixed`; the previews wrap
  them in a `relative` spacer so the pinned bars are visible inside the iframe rather than
  escaping to the document edges.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` (source files) | Pass — no errors in `lib/moduleRegistry.ts`, `pages/style-guide/modules.tsx`, `pages/style-guide/modules/[slug].tsx`, or `pages/style-guide/modules/embed/[slug].tsx`. Pre-existing errors remain only in `**/__tests__/**` (missing `@types/jest`) and are unrelated to this packet. |
| `npm run lint` | Not run — ESLint is still not configured (`next lint` prompts interactive setup). Typecheck is the gate, per Packet 1. |
| Component contract match | All seven target components' exports + prop signatures match the catalog metadata and embed usage (verified against source). |

### Recommended Packet 2B targets

Continuing the §7 order, now that the app-chrome/log batch is in:

1. **Extract `pages/home.tsx` inline cards** (`AccessCard`, `QuickActionButton`,
   `RecommendationCard`) into `components/app/*`, then switch their existing catalog
   previews from static recreation to live component renders.
2. **Extract `pages/journal/home.tsx` modules** (`TodayRhythm`, `QuickEntryRow`,
   `PrepPantryCard` presentational split, `HomeTemplateCards`) and catalog them.
3. **Plans/Programs prop-driven renderers** — `SlotCard`, `DayView`, `WeekViewPanel`,
   `ProjectedNDSStrip`, `ScheduleConflictBanner`, `ProfileDefaultsBanner`,
   `ProgramDeliveryModules`, `BaselinePrepModules` — catalog with fixtures.
4. **`SavedMealCard`, `JournalDateSelector`, `GridItemApp`, `NDSDisplay`** — remaining
   drop-in / prop-driven app components from §4a–4b.
5. **`grid-app-section-home` variants** (`with-image`, `upgrade-placeholder`) — expand the
   single-state preview into variant cases.
6. **Reconcile registries (design step, not a merge)** — map style-catalog slugs to
   `appModuleRegistry.ts` ids and `registry.ts` keys once the app module model is stable.

---

## 11. Packet 2B-A Result

**Date:** 2026-06-01

**Objective:** Extract the inline authenticated home-dashboard cards from `pages/home.tsx`
into reusable components, then switch their style-guide previews from static recreation to
live renders of the real components. Behavior-preserving extraction only — no redesign, no
copy/spacing/color/routing changes, no new business logic, no API/auth/Supabase dependency
added to previews.

### Components extracted

| Component | New file | Props (preserved verbatim) |
|---|---|---|
| `AccessCard` | `components/app/cards/AccessCard.tsx` | `title: string`, `status: string`, `statusColor: string`, `ctaLabel: string`, `ctaHref: string` |
| `QuickActionButton` | `components/app/actions/QuickActionButton.tsx` | `href: string`, `label: string`, `sub: string`, `accent?: boolean` |
| `RecommendationCard` | `components/app/cards/RecommendationCard.tsx` | `rec: { title; description; ctaLabel; ctaHref }` (exported `Recommendation` type) |

Each component's JSX, Tailwind classes, and prop shape were moved over byte-for-byte from
the inline definitions. Named + default exports are provided. `RecommendationCard` exports
its own `Recommendation` interface so it is self-contained (the page keeps its own copy for
the dashboard API row).

### Runtime page updated (`pages/home.tsx`)

> **Important behavioral note:** the three cards were **defined inline but not rendered** on
> `/home` today — the dashboard body renders `GridMediumSection` + `BuyOfferButton`, and the
> "Quick Actions" / "Recommended for You" sections are explicitly held back ("hidden for
> now"). They were effectively dead code awaiting re-enablement.

To preserve runtime behavior exactly, the extraction **moved** the inline definitions out and
**did not** wire newly-rendered cards into the page (rendering previously-hidden cards would
be a visible behavior change, which the rules forbid). Concretely:

- Removed the three inline `function` definitions from `pages/home.tsx`.
- Left a comment block pointing to the new component paths for when those sections are
  re-enabled.
- Removed the now-unused `import Link from 'next/link'` (the inline cards were its only
  consumers).
- Left the existing (already-unused) `journalStatusLabel` / `journalStatusColor` helpers and
  the `Recommendation` interface (still used by `DashboardData`) untouched.

Net effect: the rendered `/home` dashboard UI is **identical** to before. The cards are now
importable + live-previewable. Item 4 of the packet ("import and use") could not be honored
literally without changing the visible UI, so the behavior-preserving interpretation was
chosen and is documented here.

### Style-guide previews switched to live render (`pages/style-guide/modules/embed/[slug].tsx`)

The `access-card`, `quick-action`, and `recommendation-card` cases now import and render the
real extracted components with **fixture props only**; all hrefs are inert (`#`) so clicks are
harmless. Variants preserved exactly:

- `access-card`: `active` / `inactive` / `expiring-soon` (drives `title`, `status`, `statusColor`, `ctaLabel`).
- `quick-action`: `default` / `accent` (the accent tile pairs with a neutral "Shop" tile, as before).
- `recommendation-card`: `default`.

The old hand-built static markup for these three cases was deleted. `MODULE_STYLE_CATALOG`
entries updated: `componentPath` → new files; `reusability` `page_specific` → `drop_in`
(pure presentational, simple props); `notes` + `dataContract.mockDataPath` updated to reflect
the live render.

### Files changed

- **Added** `components/app/cards/AccessCard.tsx`
- **Added** `components/app/actions/QuickActionButton.tsx`
- **Added** `components/app/cards/RecommendationCard.tsx`
- **Modified** `pages/home.tsx` — removed inline defs + unused `Link` import (behavior-preserving).
- **Modified** `lib/moduleRegistry.ts` — `componentPath` / `reusability` / `notes` / `dataContract` for the three slugs.
- **Modified** `pages/style-guide/modules/embed/[slug].tsx` — live renders + component imports.
- **Modified** `docs/design/MODULE-STYLE-GUIDE-AUDIT.md` — this section + §2 / §5 status updates.

### Visual QA notes

- **`/home` dashboard** — not runnable headless here (SSR auth-gated: redirects to `/login`
  without a session, and the dashboard fetches `/api/account/dashboard`). Verified by
  inspection instead: the extracted JSX/classes are identical to the originals and the cards
  were not rendered before or after, so the dashboard output is unchanged. Typecheck passes.
- **`/style-guide/modules/access-card`** — live `AccessCard`; status color + CTA differ per
  variant. Matches the prior static recreation 1:1 (same classes), now with the real CTA
  `<Link href="#">`.
- **`/style-guide/modules/quick-action`** — live `QuickActionButton` ×2; accent tile uses
  `bg-denim-500/20 text-denim-300`. Live render additionally carries the `active:` states the
  static recreation omitted (higher fidelity).
- **`/style-guide/modules/recommendation-card`** — live `RecommendationCard` with fixture
  `rec`. Identical visual to the static version.
- **`/style-guide/modules`** — catalog still lists 25 modules across 9 categories; the three
  cards still appear under **Cards** and link to valid detail routes.

### Remaining inline extraction candidates

- `pages/home.tsx` — `journalStatusLabel` / `journalStatusColor` helpers (presentation logic
  for `AccessCard.statusColor`); ship alongside the cards when the dashboard re-enables them.
  Optional `SectionLabel` primitive for the inline `h2` (`section-label`).
- `pages/journal/home.tsx` — `TodayRhythmModule`, `NutritionDensityModule` scroller,
  `QuickEntryModule`, `PrepPantryModule` (presentational split), `HomeTemplateCards` (§5).

### Recommended next packet (2B-B)

1. Extract `pages/journal/home.tsx` presentational modules (`TodayRhythm`, `QuickEntryRow`,
   `HomeTemplateCards`, and the presentational split of `PrepPantryCard` /
   `NutritionDensityScroller`) and catalog them with fixtures.
2. Optionally ship the `SectionLabel` primitive and `journalStatusLabel/Color` helpers so the
   dashboard's held-back sections can be re-enabled from canonical components.

---

## 12. Packet 2B-B Result

**Date:** 2026-06-01

**Objective:** Extract the presentational modules from `pages/journal/home.tsx` into reusable
components under `components/journal/home/*` and catalog them with live, fixture-based
style-guide previews. Behavior-preserving extraction only — no redesign, no copy/spacing/
color/routing/data-behavior changes, no API/auth/Supabase dependency in previews, no
journal-truth changes, and no hidden/deferred UI enabled. Catalog count 25 → **30**.

### Components extracted

| Component | New file | Classification | Props (preserved) |
|---|---|---|---|
| `TodayRhythm` | `components/journal/home/TodayRhythm.tsx` | Safe (prop-driven; moved pure schedule helpers with it) | `slots: ResolvedScheduleSlot[]`, `todayEntries: JournalEntry[]`, `loading: boolean`, `dayPlanHref: string` |
| `NutritionDensityScroller` | `components/journal/home/NutritionDensityScroller.tsx` | Safe (already prop-driven; `useNDS` stays on page) | `data: NDSData \| null`, `isLoading: boolean` |
| `QuickEntryRow` | `components/journal/home/QuickEntryRow.tsx` | Safe (self-contained, no props) | — |
| `PrepPantryCard` | `components/journal/home/PrepPantryCard.tsx` | **Presentational split** (hook + `derivePrepPantryView` stay on page) | `view: PrepPantryView` (exported type) |
| `HomeTemplateCards` | `components/journal/home/HomeTemplateCards.tsx` | Safe (self-contained, no props) | — |

Moved with their components (verbatim): `TodayRhythm` ← `chooseActionableMeal`,
`isMealSlotLogged`, `buildLogMealHref`, `formatTime12h`, `TODAY_RHYTHM_BG`;
`NutritionDensityScroller` ← `getSubscoreStatus`, `NDSStatus`; `QuickEntryRow` ←
`quickEntryItems`; `HomeTemplateCards` ← `BASELINE_CARD_IMAGE`, `CASE_STUDY_CARD_IMAGE`;
`PrepPantryCard` ← `PrepPantryView` interface, `PREP_PANTRY_BG`.

### Components deferred (and why)

- **`SectionLabel` primitive** — deferred. `pages/journal/home.tsx` has no consistent
  repeated label primitive: the section labels vary (e.g. "Today's Rhythm" `text-base sm:text-xl`,
  "Quick Entry" `text-sm` with a pre-existing class-concat quirk `mb-[5px]font-semibold`, and
  per-module `h2`s). Extracting a single primitive would force a redesign/normalization, which
  the rules forbid. The existing `section-label` catalog entry already documents the `/home`
  uppercase pattern.
- **`journalStatusLabel` / `journalStatusColor`** — not present in `pages/journal/home.tsx`.
  They live in `pages/home.tsx` (dashboard) and are already unused dead code there (noted in
  Packet 2B-A §11). Out of scope for this file; not extracted.
- **`derivePrepPantryView` + `usePantryReadiness`** — intentionally **left on the page** (data
  shaping + live hook). Only the presentational card was extracted.

### Components cataloged (`MODULE_STYLE_CATALOG`, all new)

| Slug | Name | Category | Reusability | Variants (live) |
|---|---|---|---|---|
| `today-rhythm` | Today's Rhythm | content | needs_data | default / loading / empty |
| `nutrition-density-scroller` | Nutrition Density Scroller | content | needs_data | ready / loading / empty |
| `quick-entry-row` | Quick Entry Row | content | drop_in | default |
| `prep-pantry-card` | Prep & Pantry Card | card | needs_data | ready / missing-items / empty |
| `home-template-cards` | Home Template Cards | grid | drop_in | default |

No new `ModuleCategory` was needed — `content` / `card` / `grid` cover all five, so
`modules.tsx` category maps were left unchanged (per task item 9).

### Live previews added (`pages/style-guide/modules/embed/[slug].tsx`)

All five render the **real extracted components** with fixture props only — no API, auth,
Supabase data, or mutation; CTAs use inert `#` hrefs. New fixtures: `MOCK_RHYTHM_SLOTS`
(`ResolvedScheduleSlot[]`), `MOCK_NDS_DATA` (`NDSData`), `MOCK_PANTRY_VIEW_READY` /
`_MISSING` / `_EMPTY` (`PrepPantryView`). `quick-entry-row` and `home-template-cards` take no
props. Background images are public CDN assets (the same `next/image` URLs the live page uses)
— not data/auth dependencies.

### Runtime behavior notes (`pages/journal/home.tsx`)

The page now imports the five components and renders them exactly where the inline modules were
rendered before — same layers, same props, same order. The page **keeps**: all three data
effects (today entries, profile/meal schedule, plan context), `useNDS`, `usePantryReadiness`
(via the retained `PrepPantryModule` wrapper), `derivePrepPantryView`, the hero, the
`enabledMealSlots` / `dayPlanHref` / `groceryHref` memos, and routing. Pruned now-unused
imports after extraction: `Image`, `Link`, `useCallback`, `getMealSlotForEntry`,
`hhmmToMinutes`, `ResolvedScheduleSlot`, and the `NDSData` type alias. No hidden/deferred UI was
enabled; no journal data/truth behavior changed. Rendered `/journal/home` UI is identical.

### Files changed

- **Added** `components/journal/home/TodayRhythm.tsx`
- **Added** `components/journal/home/NutritionDensityScroller.tsx`
- **Added** `components/journal/home/QuickEntryRow.tsx`
- **Added** `components/journal/home/PrepPantryCard.tsx`
- **Added** `components/journal/home/HomeTemplateCards.tsx`
- **Modified** `pages/journal/home.tsx` — import + render extracted components; pruned unused imports; kept data logic.
- **Modified** `lib/moduleRegistry.ts` — 5 new catalog entries.
- **Modified** `pages/style-guide/modules/embed/[slug].tsx` — 5 live render cases + fixtures + imports.
- **Modified** `pages/style-guide/modules/[slug].tsx` — variant options for the 5 slugs.
- **Modified** `docs/design/MODULE-STYLE-GUIDE-AUDIT.md` — this section + §5 / §6 status updates.

### Visual QA notes

- **`/journal/home`** — not runnable headless (client-side data: `journalService`,
  `/api/journal/profile`, `planService`, `useNDS`, `usePantryReadiness` all require an authed
  session). Verified by inspection: extracted JSX/classes are byte-for-byte identical and the
  components render in the same layers with the same props, so the page output is unchanged.
  Typecheck passes.
- **`/style-guide/modules`** — catalog now lists 30 modules; the 5 new entries appear under
  Content / Cards / Grids and link to valid detail routes.
- **`/style-guide/modules/today-rhythm`** — live `TodayRhythm`; default shows the 3 meal slots
  (highlighted "Log Now" row depends on current time), `loading` shows pulse bars, `empty` shows
  the profile prompt.
- **`/style-guide/modules/nutrition-density-scroller`** — live scroller; `ready` shows Overall
  Score 72 + 7 status cells, `loading` shows "..."/"Pending", `empty` (null data) shows "n/a"/
  "Pending". Dot + arrow controls work.
- **`/style-guide/modules/quick-entry-row`** — live 5-up shortcut row.
- **`/style-guide/modules/prep-pantry-card`** — live card; `ready` shows the 3 coverage metrics
  + blocker note, `missing-items` and `empty` show the metric-less states.
- **`/style-guide/modules/home-template-cards`** — live 2-up light template cards.

### Typecheck / lint

- `npx tsc --noEmit`: **Pass for all source files** (5 new components, `journal/home.tsx`,
  registry, embed, detail). Remaining errors are only the pre-existing `**/__tests__/**` issues
  (missing `@types/jest` + one test fixture), unrelated to this packet.
- `npm run lint`: skipped — ESLint still unconfigured (`next lint` prompts interactive setup).
  Editor diagnostics on all changed/new files: clean.

### Recommended next packet (2C)

1. **Plans/Programs prop-driven renderers** — `SlotCard`, `DayView`, `WeekViewPanel`,
   `ProjectedNDSStrip`, `ScheduleConflictBanner`, `ProfileDefaultsBanner`,
   `ProgramDeliveryModules`, `BaselinePrepModules` — catalog with fixtures (§4b / §7).
2. **Remaining drop-in app components** — `SavedMealCard`, `JournalDateSelector`, `GridItemApp`,
   `NDSDisplay`; plus `grid-app-section-home` variants (`with-image`, `upgrade-placeholder`).
3. **Registry reconciliation (design step, not a merge)** — map style-catalog slugs to
   `appModuleRegistry.ts` ids and `registry.ts` keys once the app module model is stable.

---

## 13. Packet 2C-A Result

Cataloged + live-previewed the four remaining low-risk drop-in app components. All previews
render the **real components** with fixture props only — no API, auth, Supabase, or mutation;
all links/CTAs are inert. **Catalog count 30 → 34.** No new `ModuleCategory` was needed
(`card` / `navigation` / `grid` / `content` cover all four), so `modules.tsx` category maps were
left unchanged.

### Classification

| Target | Decision | Why |
|---|---|---|
| `SavedMealCard` | ✅ Catalog + live preview | Pure presentational button; `onClick` is the only behavior (harmless). |
| `JournalDateSelector` | ✅ Catalog + live preview | Manages its own date state; clicks only mutate local state — no routing/data. |
| `GridItemApp` | ✅ Catalog + live preview | Prop-driven `SummaryRowModule` card; fixture uses inert `#` drilldown hrefs. |
| `NDSDisplay` | ✅ Catalog + live preview | Pure presentational; renders from an `NDSData` fixture, no hook needed. |
| `grid-app-section-home` variants | ⏸ Deferred | Component is self-contained with **no props** (hardcoded `TILES` + upgrade placeholder). All "variants" already render in its single output; fixture-only variant switching is impossible without modifying the component (would be non-additive). Honest call: keep its single `default` preview. |

### Components cataloged (`MODULE_STYLE_CATALOG`, all new)

| Slug | Name | Category | Reusability | Variants (live) |
|---|---|---|---|---|
| `saved-meal-card` | Saved Meal Card | card | drop_in | default / minimal |
| `journal-date-selector` | Journal Date Selector | navigation | drop_in | today / past-day |
| `grid-item-app` | Grid Item App | grid | needs_data | image / solid / empty |
| `nds-display` | NDS Display | content | needs_data | score-high / score-mid / score-low / loading |

### Live previews added (`pages/style-guide/modules/embed/[slug].tsx`)

New fixtures: `MOCK_GRID_ITEM_SOLID` (`SummaryRowModule`, no image → solid fallback),
`MOCK_NDS_HIGH` / `MOCK_NDS_MID` / `MOCK_NDS_LOW` (`NDSData`). `saved-meal-card` and
`journal-date-selector` use inline literal props. `grid-item-app` reuses the existing
`MOCK_SUMMARY_MODULES[0]` (image), `MOCK_GRID_ITEM_SOLID` (solid), and `MOCK_SUMMARY_EMPTY[0]`
(empty). `nds-display` uses the three score fixtures plus a `data={null} isLoading` loading case.

### Variant coverage added (`pages/style-guide/modules/[slug].tsx`)

- `saved-meal-card`: `default` (name + NDS), `minimal` (name only — no selected/active state
  exists in the component, so it was not invented).
- `journal-date-selector`: `today` (next chevron disabled), `past-day` (initial date −3d → next
  enabled). Future navigation is blocked by design, so "future-disabled" ≡ the `today` state.
- `grid-item-app`: `image`, `solid` (neutral-700 fallback), `empty` (empty-state copy + CTA). No
  "locked/placeholder" state exists in the component.
- `nds-display`: `score-high` (88), `score-mid` (55), `score-low` (24), `loading`. `data=null`
  renders nothing by design, so no blank "empty" variant was added; `compact`/`headerStyle`
  modes exist but are not surfaced as variants.

### Runtime behavior notes

Additive only. No public/app page was modified — the four components were already standalone
files and were not edited. `pages/home.tsx`, `pages/journal/home.tsx`, `pages/journal/log.tsx`,
and `GridSectionApp` are untouched. The three registries remain separate. No API/auth/Supabase
dependency was introduced into any preview. Two cataloged components are **not currently mounted**
in the app and are flagged honestly: `journal-date-selector` (`status: experimental`, `usedOn: []`
— live date nav lives in `JournalHeroSection`) and `nds-display` (`status: experimental`,
`usedOn: []` — feature-flagged behind `ndsDailyBeta`; only its `MealProteinScore` export is
imported elsewhere).

### Files changed

- **Modified** `lib/moduleRegistry.ts` — 4 new catalog entries (count 30 → 34).
- **Modified** `pages/style-guide/modules/embed/[slug].tsx` — 4 live render cases + fixtures + imports.
- **Modified** `pages/style-guide/modules/[slug].tsx` — variant options for the 4 new slugs.
- **Modified** `docs/design/MODULE-STYLE-GUIDE-AUDIT.md` — this section + §4a / §4b status ticks.

### Visual QA notes

- **`/style-guide/modules`** — catalog now lists 34 modules; the 4 new entries appear under
  Cards / Navigation / Grids / Content and link to valid detail routes.
- **`/style-guide/modules/saved-meal-card`** — live button; `default` shows name + "Nutrition
  Density 82", `minimal` shows the name only.
- **`/style-guide/modules/journal-date-selector`** — live sticky header; `today` shows "Today"
  with a dimmed/disabled next chevron, `past-day` shows the dated label with both chevrons active;
  prev/next clicks update the label in-place (local state only).
- **`/style-guide/modules/grid-item-app`** — live card; `image` shows the photo + gradient +
  primary/metrics/status, `solid` shows the neutral fallback, `empty` shows the empty headline/
  body/CTA. Wrapped in an inert `#` link.
- **`/style-guide/modules/nds-display`** — live display; score variants show the score + label +
  7 colored subscore bars (colors shift high→low), `loading` shows the spinner.
- **`/style-guide/modules/grid-app-section-home`** — unchanged (single `default` preview); not
  expanded, see deferral above.
- Components requiring a live authed session were not run headless; verified by inspection +
  typecheck. The four files were not edited, so no app behavior could change.

### Typecheck / lint

- `npx tsc --noEmit`: **Pass for all source files** (registry, embed, detail, and the four
  unchanged components). Remaining errors are only the pre-existing `**/__tests__/**` issues,
  unrelated to this packet.
- `npm run lint`: skipped — ESLint still unconfigured (`next lint` prompts interactive setup).
  Editor diagnostics on all changed files: clean.

### Recommended next packet (2C-B / 2D)

1. **2C-B — Plans/Programs prop-driven renderers** (§4b): `SlotCard`, `DayView`, `WeekViewPanel`,
   `ProjectedNDSStrip`, `ScheduleConflictBanner`, `ProfileDefaultsBanner`,
   `ProgramDeliveryModules`, `BaselinePrepModules` — catalog with fixtures + callback no-ops.
2. **Smaller needs-`next/router` cards** (§4b): `LoggedItemCard`, `CompactLoggedCard` — preview
   with a router mock/shim.
3. **`grid-app-section-home` variants** — only viable if the component is refactored to accept a
   tiles prop (a behavior-preserving change, out of scope for an additive packet); otherwise keep
   deferred.
4. **2D — Registry reconciliation (design step, not a merge)** — map style-catalog slugs to
   `appModuleRegistry.ts` ids and `registry.ts` keys once the app module model is stable.

---

## 14. Packet 2C-B Result

Cataloged + live-previewed **all ten** Plans/Programs prop-driven renderer candidates (8 primary
+ 2 secondary). Every preview renders the **real component** with hand-authored fixtures only —
no API, auth, Supabase, mutation, or live services; all callbacks are no-ops and all links are
inert/real-builder-but-not-navigated. **Catalog count 34 → 44.** No new `ModuleCategory` was
needed (`card` / `content` / `cta` cover all ten), so `modules.tsx` was left unchanged.

### Components found / classification

| Target | File | Decision |
|---|---|---|
| `SlotCard` | `components/journal/plans/SlotCard.tsx` | ✅ Catalog + live |
| `DayView` | `components/journal/plans/DayView.tsx` | ✅ Catalog + live |
| `WeekViewPanel` | `components/journal/plans/WeekViewPanel.tsx` | ✅ Catalog + live |
| `ProjectedNDSStrip` | `components/journal/plans/ProjectedNDSStrip.tsx` | ✅ Catalog + live |
| `ScheduleConflictBanner` | `components/journal/plans/ScheduleConflictBanner.tsx` | ✅ Catalog + live |
| `ProfileDefaultsBanner` | `components/journal/plans/ProfileDefaultsBanner.tsx` | ✅ Catalog + live |
| `ProgramDeliveryModules` | `components/journal/programs/ProgramDeliveryModules.tsx` | ✅ Catalog + live |
| `BaselinePrepModules` | `components/journal/programs/BaselinePrepModules.tsx` | ✅ Catalog + live |
| `LoggedItemCard` | `components/journal/LoggedItemCard.tsx` | ✅ Catalog + live |
| `CompactLoggedCard` | `components/journal/CompactLoggedCard.tsx` | ✅ Catalog + live |

**Components not found / renamed:** none — all ten resolved to existing exports.

**Components deferred:** none. The two `next/router`-dependent cards (`LoggedItemCard`,
`CompactLoggedCard`) were initially flagged as router-risky, but the style-guide embed
(`pages/style-guide/modules/embed/[slug].tsx`) is itself a real Next.js page with live router
context, so they render live without a shim. `editHref` is inert (`#`) and `router.push` only
fires on click (harmless), so no deferral was required.

### Components cataloged (`MODULE_STYLE_CATALOG`, all new)

| Slug | Name | Category | Reusability | Variants (live) |
|---|---|---|---|---|
| `slot-card` | Plan Slot Card | card | needs_data | planned / multi-meal / logged / empty |
| `day-view` | Plan Day View | content | needs_data | ready / multi-meal / empty |
| `week-view-panel` | Plan Week View Panel | content | needs_data | ready / no-plan / incomplete |
| `projected-nds-strip` | Projected NDS Strip | content | needs_data | high / mid / low / empty |
| `schedule-conflict-banner` | Schedule Conflict Banner | cta | needs_data | conflict / expandable |
| `profile-defaults-banner` | Profile Defaults Banner | content | needs_data | complete / incomplete / loading |
| `program-delivery-modules` | Program Delivery Modules | content | needs_data | default |
| `baseline-prep-modules` | Baseline Prep Modules | content | needs_data | primary / reference |
| `logged-item-card` | Logged Item Card | card | drop_in | default / with-units |
| `compact-logged-card` | Compact Logged Card | card | drop_in | mood / water / sleep |

### Live previews added (`pages/style-guide/modules/embed/[slug].tsx`)

New fixtures + factory helpers (all flat, fixture-only): `mockMealDerived()`, `mockPlannedMeal()`,
`mockSlot()`, `mockPlanDay()`, `buildWeek()`; constants `MOCK_SLOT_*`, `MOCK_WEEK_HIGH/MID/LOW`,
`MOCK_WEEK_MEAL_COUNTS`, `MOCK_PLAN`, `MOCK_PLAN_SNAPSHOT`, `MOCK_PLAN_DISPLAY`, `MOCK_CONFLICTS`,
`MOCK_CONFLICTS_MANY`, `MOCK_DELIVERY_MODULES`, `MOCK_MEASURES`. `CompactLoggedCard` reuses the
existing `mockEntry()` helper. `ProgramDeliveryModules` renders with `runtimeSummary=null` (status
"not_started") and fixture modules whose `statusVisibility` includes `'not_started'` and which
omit day bounds, so they pass `filterVisibleDeliveryModules` without enrollment.
`BaselinePrepModules` renders with `access='primary'`/`'reference'` and null runtime/progress
summaries.

### Variant coverage added (`pages/style-guide/modules/[slug].tsx`)

- `slot-card`: `planned` (1 pending meal), `multi-meal` (2 stacked rows), `logged` (execution
  chip / handled), `empty` (Add-meal state). "locked" has no component state.
- `day-view`: `ready`, `multi-meal` (3 slots incl. a 2-meal slot + a logged meal), `empty` (no
  slots prompt).
- `week-view-panel`: `ready` (active plan + 7 days), `no-plan` (generate prompt), `incomplete`
  (cannot generate + conflict banner).
- `projected-nds-strip`: `high`/`mid`/`low` (color bands) + `empty` (no-days prompt) — "unavailable"
  ≡ empty.
- `schedule-conflict-banner`: `conflict` (2 issues + Apply), `expandable` (4 issues + "Show more").
  "resolved" (empty array) renders null, so not surfaced.
- `profile-defaults-banner`: `complete`, `incomplete` (missing-profile block), `loading` (null
  snapshot). No dismiss state exists.
- `program-delivery-modules`: `default` (overview + practice cards/notice/metrics). Other states
  depend on live enrollment/day, which is out of fixture scope.
- `baseline-prep-modules`: `primary` ("Set up your Baseline"), `reference` ("remain available").
  "hidden" renders null, so not a variant.
- `logged-item-card`: `default` (macro bar + read-only serving unit), `with-units` (serving size +
  USDA measures → unit dropdown).
- `compact-logged-card`: `mood`, `water`, `sleep` — exercise the per-type summary formatter.

### Runtime behavior notes

Additive only. **No app/public page file was edited** — all ten components were already standalone
and were rendered unchanged. No plan/program/grocery/pantry/journal/NDS truth logic, API, auth, or
Supabase behavior was touched. The three registries remain separate. All edit/delete/select/add/
generate/apply callbacks are no-ops in preview; `next/router`-based cards never navigate to a real
route (inert `#` href). `ScheduleConflictBanner.onApply` (which would PATCH `people.metadata.meal_schedule`
in production) and `WeekViewPanel.onGenerate` are never invoked.

### Files changed

- **Modified** `lib/moduleRegistry.ts` — 10 new catalog entries (count 34 → 44).
- **Modified** `pages/style-guide/modules/embed/[slug].tsx` — 10 live render cases, 14 component/
  type imports, and the 2C-B fixture/helper block.
- **Modified** `pages/style-guide/modules/[slug].tsx` — variant options for the 10 new slugs.
- **Modified** `docs/design/MODULE-STYLE-GUIDE-AUDIT.md` — this section + §4a / §4b status ticks.

### Visual QA notes

- **`/style-guide/modules`** — catalog now lists 44 modules; the 10 new entries appear under Cards
  / Content / CTAs and link to valid detail routes.
- **`/style-guide/modules/slot-card`** — live `SlotCard`; planned/multi-meal/logged/empty all
  render with correct badges + action bars.
- **`/style-guide/modules/day-view`** — live `DayView` ordering slots by time; empty shows the
  no-slots prompt.
- **`/style-guide/modules/week-view-panel`** — live `WeekViewPanel` composing the defaults banner,
  NDS strip, plan summary; `no-plan` shows the generate prompt; `incomplete` shows the conflict
  banner + disabled generate.
- **`/style-guide/modules/projected-nds-strip`** — live strip; confidence dots + score colors shift
  across high/mid/low; empty shows the prompt.
- **`/style-guide/modules/schedule-conflict-banner`** — live banner; Apply buttons + the
  "Show N more" toggle work.
- **`/style-guide/modules/profile-defaults-banner`** — live banner; incomplete shows the amber
  missing-profile block; loading shows the skeleton text.
- **`/style-guide/modules/program-delivery-modules`** — live grouped cards (metrics/list/cards/
  notice) with inert CTA.
- **`/style-guide/modules/baseline-prep-modules`** — live prep modules; primary vs reference framing.
- **`/style-guide/modules/logged-item-card`** — live card; `with-units` shows the unit dropdown.
- **`/style-guide/modules/compact-logged-card`** — live card; mood/water/sleep summaries differ.
- Components requiring a live authed session were not run headless; verified by inspection +
  typecheck. No component file was edited, so no app behavior could change.

### Typecheck / lint

- `npx tsc --noEmit`: **Pass for all source files** (registry, embed, detail, and the ten
  unchanged components). Fixed one issue during the pass — three new entries used a `'transparent'`
  `backgroundType` that isn't in the `BackgroundType` union; switched to `'glassmorphism'` (nearest
  descriptor for the transparent-with-glass-hover cards). Remaining errors are only the pre-existing
  `**/__tests__/**` issues, unrelated to this packet.
- `npm run lint`: skipped — ESLint still unconfigured (`next lint` prompts interactive setup).
  Editor diagnostics on all changed files: clean.

### Recommended next packet (2C-C / 2D)

1. **2C-C — Baseline weekly guidance** (§4b): `BaselineWeekOneModules` / `…WeekTwo…` / `…WeekThree…`
   — same fixture pattern (null runtime summary + capacity copy helpers). Plus the remaining
   plans sub-components (eat-out flow cards) if low-risk.
2. **Aurora disambiguation** — resolve the `components/ui/aurora-background` vs
   `components/journal/AuroraBackground` name collision before cataloging the generic wrapper.
3. **`grid-app-section-home` variants** — still deferred; only viable behind a behavior-preserving
   `tiles` prop refactor (out of scope for an additive packet).
4. **2D — Registry reconciliation (design step, not a merge)** — map style-catalog slugs to
   `appModuleRegistry.ts` ids and `registry.ts` keys once the app module model is stable.

---

## 15. Packet 2C-C Result

Cataloged + live-previewed the three Baseline weekly-guidance modules and resolved the
long-standing aurora naming collision by cataloging the generic UI wrapper under a distinct
slug. Every preview renders the **real component** with hand-authored fixtures only — no API,
auth, Supabase, mutation, or live services. **Catalog count 44 → 48.** No new `ModuleCategory`
was needed (`content` covers the three week modules; `ambient` covers the aurora wrapper), so
`modules.tsx` was left unchanged.

### Components found

| Target | File | Export |
|---|---|---|
| `BaselineWeekOneModules` | `components/journal/programs/BaselineWeekOneModules.tsx` | named |
| `BaselineWeekTwoModules` | `components/journal/programs/BaselineWeekTwoModules.tsx` | named |
| `BaselineWeekThreeModules` | `components/journal/programs/BaselineWeekThreeModules.tsx` | named |
| Generic aurora wrapper | `components/ui/aurora-background.tsx` | named `AuroraBackground` (collides with `components/journal/AuroraBackground`) |

**Not found / renamed:** none — all four resolved to existing exports.

### Classification

| Target | Decision | Why |
|---|---|---|
| `BaselineWeekOneModules` | ✅ Catalog + live preview | Prop-driven; renders from an active `ProgramRuntimeSummary` fixture. Capacity copy is a pure helper. |
| `BaselineWeekTwoModules` | ✅ Catalog + live preview | Same shape as week one (days 8–14). |
| `BaselineWeekThreeModules` | ✅ Catalog + live preview | Same shape (days 15–21) + a Day-21 recommendation branch driven by `latest_checkin_response`. |
| Generic aurora wrapper | ✅ Catalog + live preview (as `aurora-page-wrapper`) | Pure presentational wrapper; renders fixture children. Imported **aliased** to avoid the export-name collision. |

> **Important — null-by-design states (honest preview):** unlike the Packet 2C-B program
> modules, the three week modules call `shouldShowBaselineWeek{One,Two,Three}Modules()` and
> **render `null` unless `resolved_status === 'active'` and `current_day` is inside the week
> window** (1–7 / 8–14 / 15–21). A `null` `runtimeSummary` therefore renders nothing. So the
> safe fixture here is **not** a null summary — it is a minimal, type-complete *active*
> `ProgramRuntimeSummary` (`mockRuntimeSummary`). The hidden/out-of-window state is documented
> and **not** surfaced as a visible variant.

### Components cataloged (`MODULE_STYLE_CATALOG`, all new)

| Slug | Name | Category | Reusability | Variants (live) |
|---|---|---|---|---|
| `baseline-week-one-modules` | Baseline Week One Modules | content | needs_data | steady / low / high / checkin-due |
| `baseline-week-two-modules` | Baseline Week Two Modules | content | needs_data | steady / low / high / checkin-due |
| `baseline-week-three-modules` | Baseline Week Three Modules | content | needs_data | steady / low / high / checkin-due / recommendation |
| `aurora-page-wrapper` | Aurora Page Wrapper | ambient | drop_in | dark / light |

### Components live-previewed

All four. The three week modules render the real components from an active fixture summary;
the aurora wrapper renders the real `components/ui/aurora-background` with fixture children.

### Components deferred (and why)

None of the primary targets. Honest scoping notes:

- **Generic aurora wrapper `light`/`dark`** are the real `variant` prop values;
  `showRadialGradient` (mask on/off) was **not** surfaced as a separate variant to keep the
  set minimal — it is documented in the entry `notes` / optional props instead.
- **`primary` / `reference` variants** suggested in the task were **not** added to the week
  modules: those modules do not accept an access prop (primary/reference belongs to
  `BaselinePrepModules`). Inventing them would misrepresent the contract. Capacity + check-in
  states were used instead.

### Aurora naming collision resolution

- **Existing entry (unchanged):** `aurora-background` → `components/journal/AuroraBackground`
  — a fixed, decorative `inset-0` layer with **no children**. Route, slug, and embed case are
  untouched and still render ("Animated aurora gradient layer").
- **New entry:** `aurora-page-wrapper` → `components/ui/aurora-background` — a `min-h-screen`
  flex wrapper that takes `children` + a `light`/`dark` `variant`. Both files export the symbol
  `AuroraBackground`, so the embed imports the generic one **aliased**
  (`import { AuroraBackground as AuroraPageWrapper } from '@/components/ui/aurora-background'`)
  and registers it under the distinct slug/name. No route or symbol collision is introduced.
- The existing `aurora-background` catalog `notes` were updated to record the resolution.

### Variant coverage added (`pages/style-guide/modules/[slug].tsx`)

- `baseline-week-one-modules`: `steady` (day 3, steady copy), `low`, `high` (capacity copy
  swaps), `checkin-due` (day 7 + `checkinDue` → "Go to Day 7 check-in" anchor).
- `baseline-week-two-modules`: same set, day 10 / day 14.
- `baseline-week-three-modules`: same set (day 17 / day 21) plus `recommendation` (day 21,
  `checkinDue=false`, a completed day-21 `latest_checkin_response` so `isDay21Handled()` reveals
  the "Review recommendation" anchor).
- `aurora-page-wrapper`: `dark`, `light`.

### Runtime behavior notes

Additive only. **No app/public page file was edited** — all four components were already
standalone and were rendered unchanged. No baseline program truth, runtime summaries, capacity
logic, entitlement/journal/NDS logic, APIs, auth, or Supabase behavior was touched. The three
registries remain separate. The week-module check-in / recommendation CTAs are inert in-page
anchors (`#preview-checkin` / `#preview-recommendation`); `checkinDue` is supplied as a fixture
prop, never computed; no recommendation is generated, applied, or mutated. The aurora wrapper is
purely decorative (colors from `styles/theme` via `lib/utils` `cn`).

### Files changed

- **Modified** `lib/moduleRegistry.ts` — 4 new catalog entries (count 44 → 48) + updated the
  `aurora-background` `notes` to record the collision resolution.
- **Modified** `pages/style-guide/modules/embed/[slug].tsx` — 4 live render cases, the aliased
  aurora import + 3 week-module imports + runtime-type imports, and the 2C-C fixture helpers
  (`mockRuntimeSummary`, `mockCheckinResponse`, `baselineCapacityFromVariant`).
- **Modified** `pages/style-guide/modules/[slug].tsx` — variant options for the 4 new slugs.
- **Modified** `docs/design/MODULE-STYLE-GUIDE-AUDIT.md` — this section + §4b status ticks.

### Visual QA notes

- **`/style-guide/modules`** — loads; catalog now lists **48** unique module detail links; the
  4 new entries appear (Content × 3, Ambient × 1) and link to valid detail routes.
- **`/style-guide/modules/baseline-week-one-modules`** (+ two, + three) — detail routes load
  (HTTP 200); embed renders the **real** module live (e.g. "Week 1 in Baseline" + "Steady
  capacity", "Week 2 in Baseline", "Week 3 in Baseline" / "Real-Life Flexibility") rather than
  null, confirming the active fixture summary drives a real render.
- **`/style-guide/modules/aurora-page-wrapper`** — loads; embed renders the generic wrapper
  ("Aurora Page Wrapper" / "Animated teal aurora layer").
- **`/style-guide/modules/aurora-background`** — existing route still valid; embed still renders
  ("Animated aurora gradient layer"). No collision.
- Embed pages are statically generated and read `variant` from `router.query` **client-side**,
  so server HTML always shows the `default` (steady, no check-in) state; per-variant switching
  (low/high/checkin-due/recommendation, light/dark) is exercised in the browser after hydration —
  consistent with how prior packets were QA'd. All 17 sampled detail + embed routes returned 200.

### Typecheck / lint

- `npx tsc --noEmit`: **Pass for all source files** (registry, embed, detail, and the four
  unchanged components). Remaining errors are only the pre-existing `**/__tests__/**` +
  `*.test.ts` issues (missing `@types/jest`, one stale food-test fixture), unrelated to this
  packet.
- `npm run lint`: skipped — ESLint still unconfigured (`next lint` prompts interactive setup).
  Editor diagnostics on all changed files: clean.

### Recommended Packet 2D target

1. **Registry reconciliation (design step, not a merge)** — map style-catalog slugs to
   `appModuleRegistry.ts` ids and `registry.ts` keys once the app module model is stable. The
   per-surface app modules are now well-covered (Plans, Programs, Baseline prep + weekly), so the
   highest-leverage next step is cross-referencing the three registries rather than adding more
   leaf modules.
2. **Remaining low-risk leaf candidates** — eat-out flow cards / any remaining plans
   sub-components if they are prop-driven and mockable; `grid-app-section-home` variants only
   behind a behavior-preserving `tiles` prop refactor (still out of scope for an additive packet).
3. **Separate runtime module system (`lib/modules/registry.ts`)** — catalog the schema-driven
   marketing modules (`HeroStandardV1`, etc.) as a dedicated category, but only after (1).

---

## 16. Packet 2D Result

**Date:** 2026-06. **Docs-only** — no code, no runtime, no style-guide rendering change.

Packet 2D produced the registry reconciliation map: a design/governance cross-reference of the
three module systems **without merging them**. See the new doc:
[`MODULE-REGISTRY-RECONCILIATION.md`](./MODULE-REGISTRY-RECONCILIATION.md).

### What it covers

- Roles of all three systems (style-guide catalog · public runtime registry · app module
  registry) and an explicit **"Do Not Merge Yet"** section grounded in `APP-MODULE-SYSTEM.md`
  §1/§2/§4/§12.
- A reconciliation table mapping **all 48** `MODULE_STYLE_CATALOG` entries to public runtime
  keys / app module IDs with a relationship type (`exact_component_match`, `same_visual_family`,
  `app_governance_only`, `public_runtime_only`, `style_reference_only`, `duplicate_or_collision`,
  `needs_future_mapping`, `deprecated_or_stale`).
- A table of the **13** public runtime keys with no style-guide entry, and a table of the
  **17** app-module IDs (mostly Profile + several Programs/Plans) with no style-guide entry.
- Duplicates/collisions (the aurora export-symbol pair; three NDS visualizations; repeated app
  `name`s across surfaces), a Future Convergence Path (Phases A–E), a Risk Register, and
  recommended next packets (2E crossReference fields, 2F QA/preview guard, 3A CMS planning).

### Honest headline findings

- **Zero `exact_component_match`** rows — the three systems use disjoint component sets and the
  app registry references no components, so all cross-links are visual-family/design-template
  associations, not wired contracts.
- Mapping mix across the 48: 28 `same_visual_family`, 11 `needs_future_mapping`,
  7 `style_reference_only`, 2 `duplicate_or_collision` (aurora pair), 0 `deprecated_or_stale`.
- No stale catalog metadata found; all 48 `componentPath`s resolve to existing files.

### Files changed (Packet 2D)

- **Added** `docs/design/MODULE-REGISTRY-RECONCILIATION.md`.
- **Modified** `docs/design/MODULE-STYLE-GUIDE-AUDIT.md` — this section + cross-link.

No `npx tsc` run was required (documentation-only; no code files changed). ESLint remains
unconfigured and was not run.

---

## 17. Packet 2E Result

**Date:** 2026-06. Curation packet — additive type + UI, **no runtime/app/public behavior
change**, no modules deleted, no routes removed, no registries merged.

### Lifecycle buckets added

A new `ModuleLifecycle` curation axis was added to `lib/moduleRegistry.ts`, **separate from**
the existing `status` (engineering maturity) field. It answers a different question for
building agents: *should I use this module to build new pages?*

| Bucket | Meaning |
| --- | --- |
| `approved` | Current design direction; reusable; preview works; safe for building agents. |
| `experimental` | Likely useful but not final — feature-flagged or not currently mounted in production UI. |
| `legacy` | Old visual/system pattern retained for reference; not for new builds. |
| `deprecated` | Actively should not be used; replaced or off-standard. |
| `reference_only` | Useful for understanding the system (chrome/primitives/patterns); not a page-building module. |

Implementation is additive and default-safe: `lifecycle` is an optional field, and
`getModuleLifecycle(mod)` returns `'approved'` when omitted. Only the **9 non-approved** entries
carry an explicit `lifecycle`; the other 39 default to approved. Helpers exported:
`getModuleLifecycle`, `isLifecycleRuledOut`, `MODULE_LIFECYCLES`, `DEFAULT_MODULE_LIFECYCLE`.

### Counts (48 total)

- **Approved: 39** (default foundation set)
- **Experimental: 6** — `access-card`, `quick-action`, `recommendation-card` (extracted but the
  `/home` Quick Actions / Recommended sections are held back, so not currently mounted),
  `nds-display` (feature-flagged `ndsDailyBeta`), `journal-date-selector` (superseded by the
  `JournalHeroSection` date nav), `aurora-page-wrapper` (generic alternate aurora, only on the
  `/dev/backgrounds` showcase).
- **Legacy: 0**
- **Deprecated: 0**
- **Reference Only: 3** — `section-label` (inline-h2 pattern, not an importable component),
  `app-top-nav` and `journal-footer-nav` (shell chrome composed by the app shell, not placed by
  hand).

### Modules ruled out for new builds (9)

The 6 experimental + 3 reference-only modules above are flagged "Not recommended for new builds."
All remain fully accessible by direct URL and through the **All** / per-bucket filters — nothing
was hidden or removed. Legacy/deprecated buckets exist in the type and UI but currently hold zero
modules: the catalog was built additively from current components, so there is no honestly-stale
or replaced module to bucket there yet.

### UI changes

- `pages/style-guide/modules.tsx`:
  - **Default view shows approved foundations only.** Added a lifecycle filter row (All +
    Approved/Experimental/Legacy/Deprecated/Reference Only) that combines with the existing
    category filter; category counts respect the active lifecycle.
  - Header copy states it is showing approved foundations; a per-bucket count summary line was
    added; ruled-out cards show an inline "Not recommended for new builds." line.
  - Each module card now shows a **lifecycle badge** alongside the category badge.
- `pages/style-guide/modules/[slug].tsx`:
  - Lifecycle badge next to the title and as a pill in Builder Notes / Reuse Contract.
  - Ruled-out modules show a visible caution banner ("…— not recommended for new builds. This
    route stays live for reference."). Direct routes are **not** hidden.

### Final recommendation — how to use the style guide for new builds

1. **Default to the approved set.** Land on `/style-guide/modules` and build from what's shown
   (39 approved foundations). These are current, previewable, and safe to compose.
2. **Treat experimental as opt-in.** Usable, but confirm mounting/flag/validation status first
   (see each module's note). Several are ready the moment a held-back section is re-enabled.
3. **Never build new pages from reference-only modules.** They document chrome, primitives, and
   patterns — use the app shell / approved modules instead.
4. **Use direct URLs / the All filter** to inspect any of the 48 modules; curation hides nothing,
   it only changes the default and adds honest signposting.

### Visual QA

Verified via `next build` static generation + route render (see §below in QA notes): default
approved view renders 39 cards; lifecycle filters and combined lifecycle+category filtering
update counts and grid correctly; approved (`hero`), experimental (`nds-display`), and
reference-only (`section-label`) detail pages all load with the correct badge and caution
treatment. All 48 detail/embed routes still build.

### Typecheck / lint

- `npx tsc --noEmit`: edited files (`lib/moduleRegistry.ts`, both style-guide pages) are clean.
  The only remaining error is the pre-existing `lib/food/__tests__/sectionGrouping.test.ts`
  `measures` fixture issue, unrelated to this packet.
- `npm run lint`: skipped — ESLint still unconfigured.

### Is the Module Style Guide now satisfactory?

Yes for its purpose. It now has an honest, default-approved foundation set with clear
signposting for everything ruled out, while keeping all 48 modules reachable. Registry
reconciliation stays paused (Packet 2D); optional `crossReference` metadata is not required now.

---

## 18. Packet 2F Result — surface-gated app approval (correction)

**Date:** 2026-06. Correction packet — reclassification + copy only. No modules deleted, no
routes removed, no runtime/app/public behavior change, no registries merged, no new modules, no
preview render cases changed.

### Product rule added

**For app-side modules, only modules from the canonical main app pages may be `approved` for
potential new-page use.** Modules from deeper / unfinished / dev / detail / internal-renderer
surfaces are not default-approved even when technically clean and live-previewed; they remain
available as **spacing/taste/style references** (`reference_only`) and stay reachable by direct
URL and filters.

### Approved app surfaces (canonical main pages)

- `/app/home` (legacy `/journal/home`) — **Home**
- `/app/plans` (`/journal/plans`) — **Plans** (week overview)
- `/app/programs` — **Programs** (no catalog module maps to the main programs page yet)
- `/app/log` (`/journal`, `/journal/log`) — **Log**
- `/app/profile` — **Profile** (no catalog module maps to it yet)

Public-site and shared design-system modules (hero/grid/cta/buttons/aurora/app-shell/etc.)
remain approved as before. Approval gating was applied **by route**: modules that live only on
detail/deeper routes (`/journal/plans/[date]`, `/journal/programs/[slug]`,
`/journal/programs/baseline`, `/dev/*`) are not approved.

### Modules moved out of approved (7 → reference_only)

| Slug | Surface (route) | Reason |
| --- | --- | --- |
| `slot-card` | `/journal/plans/[date]` (via DayView) | Internal renderer on the Plans **detail** route |
| `day-view` | `/journal/plans/[date]` | Plans **detail** route (not the main `/plans` page) |
| `program-delivery-modules` | `/journal/programs/[slug]` | **program-detail** renderer |
| `baseline-prep-modules` | `/journal/programs/baseline` | **baseline-detail** |
| `baseline-week-one-modules` | `/journal/programs/baseline` | **baseline-detail** |
| `baseline-week-two-modules` | `/journal/programs/baseline` | **baseline-detail** |
| `baseline-week-three-modules` | `/journal/programs/baseline` | **baseline-detail** |

Each carries an updated note: *"Style reference only (Packet 2F)… Use for spacing/taste
guidance; not approved as a new-page foundation until this surface is designed and accepted."*

No modules were moved to `experimental` or `deprecated` in this packet; the existing
experimental set (Packet 2E) is unchanged.

### Final counts (48 total)

- **Approved: 32** (was 39) — public site + shared DS + canonical Home/Plans(main)/Log modules.
- **Experimental: 6** — unchanged (`access-card`, `quick-action`, `recommendation-card`,
  `nds-display`, `journal-date-selector`, `aurora-page-wrapper`).
- **Reference Only: 10** (was 3) — 3 chrome/pattern (`section-label`, `app-top-nav`,
  `journal-footer-nav`) + 7 deeper-surface style references (above).
- **Legacy: 0**
- **Deprecated: 0**

### Modules kept approved on canonical surfaces (app-side)

Home: `grid-app-section-home`, `grid-item-app`, `today-rhythm`, `nutrition-density-scroller`,
`quick-entry-row`, `prep-pantry-card`, `home-template-cards`. Log: `journal-hero`,
`meal-section`, `journal-block-section`, `daily-summary`, `grid-section-app`,
`nutrition-density-gauge`, `saved-meal-card`, `logged-item-card`, `compact-logged-card`. Plans
(main `/journal/plans`): `week-view-panel`, `projected-nds-strip`, `schedule-conflict-banner`,
`profile-defaults-banner`. Shared chrome/layout: `app-shell`, `stacked-page-section`.

### Uncertain — needs product review

- **`day-view`** — central, well-designed Plans-day pattern, but it lives on the
  `/journal/plans/[date]` **detail** route, so it was demoted to `reference_only`. If product
  accepts the Plans-day surface as canonical, re-approve it (flagged in its note).
- **Plans main-page sub-renderers** (`projected-nds-strip`, `schedule-conflict-banner`,
  `profile-defaults-banner`) — kept approved because they render on the main `/journal/plans`
  page, but they are internal/contextual renderers. If Plans itself is not yet design-accepted,
  these should also move to `reference_only`.
- **`week-view-panel`** — kept approved as the main Plans page view; same caveat as above.

### Guidance for building agents

1. Build new pages from the **approved default set** — public-site/shared design system plus the
   accepted main app-page patterns (Home, Plans main, Log).
2. **Do not** treat deeper app/detail modules (program/baseline detail, Plans `[date]` detail) as
   new-page foundations. Open them under **Reference Only** for spacing/taste guidance only.
3. When a deeper surface is formally designed and accepted, promote its modules back to
   `approved` (and, if helpful, record the surface explicitly).

### `approvedSurface` field

Evaluated per task #6. Skipped: populating it honestly across the ~32 approved entries is a broad
refactor, and surface intent is already carried by `usedOn` + the per-module notes + this table.
Can be added later (Phase B) if a surface filter is wanted.

### Typecheck / lint

- `npx tsc --noEmit`: edited files (`lib/moduleRegistry.ts`, both style-guide pages) clean; only
  the pre-existing `lib/food/__tests__/sectionGrouping.test.ts` error remains (unrelated).
- `npm run lint`: skipped — ESLint still unconfigured.
