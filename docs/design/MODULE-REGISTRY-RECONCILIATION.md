# Module Registry Reconciliation

Cross-reference map for the **three intentionally-separate** module systems in the Fine
Diet platform. This is a **design / governance document only** — it does not merge the
registries, rename any id/slug/key, change runtime behavior, or alter style-guide rendering.
It exists so product, design, and building agents can see how a module's *visual taxonomy*,
*public-page runtime contract*, and *signed-in-app governance metadata* relate without
collapsing them into one system.

- **Status:** Living cross-reference. Documentation only.
- **Packet:** 2D (registry reconciliation map).
- **Date:** 2026-06.
- **Sibling docs:** [`MODULE-STYLE-GUIDE-AUDIT.md`](./MODULE-STYLE-GUIDE-AUDIT.md),
  [`../app/APP-MODULE-SYSTEM.md`](../app/APP-MODULE-SYSTEM.md),
  [`../app/APP-UI-FOUNDATION.md`](../app/APP-UI-FOUNDATION.md).

---

## 1. The three systems and their roles

| # | System | File(s) | Symbol | Role | Drives runtime? |
|---|---|---|---|---|---|
| 1 | **Style-guide catalog** | `lib/moduleRegistry.ts` | `MODULE_STYLE_CATALOG` | Visual / reference / reuse documentation. Powers the three `/style-guide/modules` pages (catalog, detail, embed). Taxonomy + reuse-contract metadata. | No — documentation + style-guide previews only. |
| 2 | **Public runtime module registry** | `lib/modules/registry.ts` (+ `schema.ts`, `types.ts`) | `MODULE_REGISTRY` | Public / marketing **page composition runtime**. Maps a `ModuleTypeKey` to a Zod schema + a React component for `ModuleRenderer`. | **Yes** — renders public/marketing pages from typed content. |
| 3 | **Signed-in app module registry** | `lib/modules/appModuleRegistry.ts` (+ `appModuleTypes.ts`) | `APP_MODULE_REGISTRY` | Signed-in app **governance metadata** and future CMS/config bridge: data dependencies, fallback states, visibility/trigger rules, CTA behavior, analytics, field ownership, safety. | No — code-owned inventory/governance; app pages are **not** wired to it yet. |

These systems share *vocabulary* ("hero", "grid", "cta", "nds") but not *implementation*:

- System 1 catalogs the **real components** that pages already use (`@/components/home/*`,
  `@/components/journal/*`, `@/components/ui/*`, etc.).
- System 2 renders a **separate component set** (`@/components/modules/*`, the `*V1`/`*V2`
  schema-driven modules) and is keyed by dotted `type.key.vN` strings.
- System 3 references **no components at all** — it carries `designTemplate` *strings* and
  governance fields, deliberately decoupled from any specific component file.

> **They should not be merged yet.** See [§5 Do Not Merge Yet](#5-do-not-merge-yet). This is
> reaffirmed in `APP-MODULE-SYSTEM.md` §2 and the audit doc's system map.

### Counts at time of writing

| System | Count |
|---|---|
| Style-guide catalog entries | **48** |
| Public runtime registry keys | **13** |
| App module registry IDs | **36** (home 7 · programs 7 · log 6 · plans 7 · profile 9) |

---

## 2. Relationship type legend

Used in the tables below. Because the three systems use **disjoint component sets** (and the
app registry references no components), there are currently **zero literal
`exact_component_match` rows** — every cross-link is a visual/design-family relationship or a
gap. This is called out honestly rather than overstated.

| Type | Meaning |
|---|---|
| `exact_component_match` | The *same* React component file is referenced/rendered by another registry. **None today** (systems use different component files; app registry has no component refs). |
| `same_visual_family` | A clear visual/design analog exists in another registry (different component or a `designTemplate` string), so the entry is cross-linked. |
| `app_governance_only` | Exists only as signed-in-app governance metadata (no style-guide entry). Used in [§4](#4-app-registry-ids-without-a-style-guide-entry). |
| `public_runtime_only` | Exists only as a public runtime composition key (no style-guide entry). Used in [§3](#3-public-runtime-keys-without-a-style-guide-entry). |
| `style_reference_only` | Documented in the style-guide catalog purely as a visual/reuse reference; no counterpart in the runtime or app registries is expected (primitives, chrome, decorative, one-off page UI). |
| `duplicate_or_collision` | A naming/slug/symbol overlap that could confuse builders (within or across systems). |
| `needs_future_mapping` | A plausible counterpart exists in another registry, but the link is informal/approximate and should be formalized later (Phase B crossReference). |
| `deprecated_or_stale` | Entry refers to something removed, renamed, or no longer rendered as documented. |

---

## 3. Reconciliation table — all 48 style-guide entries

Columns: **Style Guide Slug · Style Guide Component Path · Surface · Public Runtime Key (if
any) · App Module ID (if any) · Relationship · Notes**.

> Cross-links marked `~` are **approximate** visual-family mappings, not formal contracts.
> No id/slug/key is changed by recording them here.

### 3a. Public-site modules

| Slug | Component Path | Surface | Public Runtime Key | App Module ID | Relationship | Notes |
|---|---|---|---|---|---|---|
| `hero` | `@/components/home/HeroSection` | public_site | `~hero.standard.v1` | — | same_visual_family | Homepage hero. The runtime registry's `HeroStandardV1` is a *separate* schema-driven component; the homepage composes `HeroSection` directly, not via `ModuleRenderer`. |
| `hero-medium` | `@/components/home/HeroMediumSection` | public_site | `~hero.standard.v1` | — | same_visual_family | 66vh variant of `HeroSection`. Same visual family as the runtime standard hero. |
| `feature-card` | `@/components/home/FeatureSection` | public_site | `~feature.split-media.v1` / `~feature.reasons-split.v1` | — | same_visual_family | Carousel feature card. Runtime has split-media / reasons-split feature modules (different components). |
| `grid-2col` | `@/components/home/GridSection` (+ `GridItem`) | public_site | `~grid.cards.v1` | — | same_visual_family | 2-col image grid. Runtime `grid.cards.v1` is the schema-driven analog. |
| `grid-2col-medium` | `@/components/home/GridMediumSection` (+ `GridItemMedium`) | shared | `~grid.cards.v1` | — | same_visual_family | 215px height variant of `grid-2col`. |
| `cta-banner` | `@/components/home/CTASection` | public_site | `~cta.band.v1` / `~persuasion.simple-cta.v1` | — | same_visual_family | Full-width CTA. Runtime has `cta.band.v1` + `persuasion.simple-cta.v1` (different components). |
| `form-panel` | `@/app/journal-waitlist/WaitlistForm` | public_site | — | — | style_reference_only | Waitlist form; style-guide preview is a static no-submit recreation. No runtime/app registry counterpart. |

### 3b. Shared primitives / chrome / decorative

| Slug | Component Path | Surface | Public Runtime Key | App Module ID | Relationship | Notes |
|---|---|---|---|---|---|---|
| `button` | `@/components/ui/Button` | shared | — | — | style_reference_only | Design-system primitive used everywhere; not a composed "module" in either runtime system. |
| `buy-offer-button` | `@/components/checkout/BuyOfferButton` | shared | — | — | style_reference_only | Functional checkout CTA primitive. Behavior is code-owned; no runtime/app registry entry. |
| `stacked-page-section` | `@/components/layout/StackedPageSection` | shared | — | — | style_reference_only | Layout primitive (rule-backed). Composition shell, not a registry module. |
| `aurora-background` | `@/components/journal/AuroraBackground` | shared | `~ambient.marquee-strip.v1` | — | duplicate_or_collision | Decorative fixed `inset-0` layer (no children). **Export-symbol collision** with `components/ui/aurora-background` (both export `AuroraBackground`); resolved at catalog level in 2C-C via the distinct `aurora-page-wrapper` slug + aliased import. Loosely an "ambient" family member alongside the runtime marquee strip. |
| `aurora-page-wrapper` | `@/components/ui/aurora-background` | shared | `~ambient.marquee-strip.v1` | — | duplicate_or_collision | Generic `children`/`variant` wrapper. Same export symbol as `aurora-background` above — see that row. Collision is **resolved** (distinct slugs, aliased import), recorded here for honesty. |
| `section-label` | `pages/home.tsx` (inline `h2`) | signed_in_app | — | — | style_reference_only | A pattern, not an importable component; preview is a static recreation. Could become a `SectionLabel` primitive later. |

### 3c. Signed-in app — Home / Journal-home surface

| Slug | Component Path | Surface | Public Runtime Key | App Module ID | Relationship | Notes |
|---|---|---|---|---|---|---|
| `journal-hero` | `@/components/journal/JournalHeroSection` | signed_in_app | — | `~app.home.today-overview.v1` | needs_future_mapping | Log hero w/ score gauge + date nav. Loosely the `app_hero_summary` family; the app module is governance-only (no component). |
| `grid-section-app` | `@/components/home/GridSectionApp` (+ `GridItemApp`) | signed_in_app | — | `~app.log.daily-summary.v1` | needs_future_mapping | `SummaryRowModule` summary grid; visual family of the app daily-summary / tracking cards. |
| `grid-app-section-home` | `@/components/journal/GridAppSectionHome` | signed_in_app | — | `~app.home.program-focus.v1` | needs_future_mapping | Navigational tiles (Programs/Assessments/Shop/Upgrade). Spans several app-home governance modules; no single clean id. |
| `grid-item-app` | `@/components/home/GridItemApp` | signed_in_app | — | `~app.log.daily-summary.v1` | needs_future_mapping | Single-card building block of `grid-section-app`; sub-component, not a standalone app module. |
| `access-card` | `@/components/app/cards/AccessCard` | signed_in_app | — | `~app.profile.account-billing.v1` | needs_future_mapping | Dashboard access/entitlement status card. Closest governance analog is entitlement/account; mapping is loose. |
| `quick-action` | `@/components/app/actions/QuickActionButton` | signed_in_app | — | `~app.home.quick-entry-row.v1` | needs_future_mapping | `/home` action tiles. Related to the quick-entry action family but a distinct tile pattern. |
| `recommendation-card` | `@/components/app/cards/RecommendationCard` | signed_in_app | — | `~app.home.contextual-insight.v1` | same_visual_family | Dashboard recommendation/insight card → `insight_card` design template. |
| `today-rhythm` | `@/components/journal/home/TodayRhythm` | signed_in_app | — | `~app.home.todays-plan.v1` | same_visual_family | Schedule-preview readiness card → `readiness_card` family. |
| `nutrition-density-scroller` | `@/components/journal/home/NutritionDensityScroller` | signed_in_app | — | `~app.home.nds-so-far.v1` | same_visual_family | Home NDS metric strip → `metric_card` family. |
| `quick-entry-row` | `@/components/journal/home/QuickEntryRow` | signed_in_app | — | `app.home.quick-entry-row.v1` | same_visual_family | Strong match: same name + `quick_entry_row` design template. Still a cross-reference, not a wired link. |
| `prep-pantry-card` | `@/components/journal/home/PrepPantryCard` | signed_in_app | — | `app.home.prep-pantry.v1` / `~app.plans.pantry-readiness.v1` | same_visual_family | Strong match: `image_backed_card` readiness module; shares pantry-readiness truth with the Plans module. |
| `home-template-cards` | `@/components/journal/home/HomeTemplateCards` | signed_in_app | — | `~app.home.program-focus.v1` | same_visual_family | "Default Path" program card + insight card → program-focus family. |

### 3d. Signed-in app — Log surface

| Slug | Component Path | Surface | Public Runtime Key | App Module ID | Relationship | Notes |
|---|---|---|---|---|---|---|
| `nutrition-density-gauge` | `@/components/journal/NutritionDensityGauge` | signed_in_app | — | `app.log.nutrition-density.v1` | same_visual_family | d3 half-donut gauge → `nds_gauge` design template. |
| `nds-display` | `@/components/journal/NDSDisplay` | signed_in_app | — | `~app.log.nutrition-density.v1` / `~app.home.nds-so-far.v1` | same_visual_family | Feature-flagged NDS score + subscores; third NDS visualization (see collision note in §6). |
| `meal-section` | `@/components/journal/MealSection` | signed_in_app | — | `app.log.meals.v1` | same_visual_family | Time-block meal card → `meal_blocks` design template. |
| `journal-block-section` | `@/components/journal/JournalBlockSection` | signed_in_app | — | `app.log.meals.v1` | same_visual_family | Log meal-block summary → `meal_blocks` design template. |
| `daily-summary` | `@/components/journal/DailySummary` (`TrackingModuleCard`) | signed_in_app | — | `app.log.daily-summary.v1` / `~app.log.tracking-preference-cards.v1` | same_visual_family | Tracking tiles → `daily_summary_chips` + `tracking_card_grid` families. |
| `logged-item-card` | `@/components/journal/LoggedItemCard` | signed_in_app | — | `app.log.meals.v1` / `~app.log.macro-summary.v1` | same_visual_family | Intake row w/ macro bar → meals + macro-summary families. |
| `compact-logged-card` | `@/components/journal/CompactLoggedCard` | signed_in_app | — | `~app.log.daily-summary.v1` | same_visual_family | Non-intake entry card; tracking/daily-summary family. |
| `saved-meal-card` | `@/components/journal/SavedMealCard` | signed_in_app | — | — | needs_future_mapping | Saved-meals carousel button on the log surface; no app governance module declared for it yet. |
| `journal-date-selector` | `@/components/journal/JournalDateSelector` | signed_in_app | — | — | needs_future_mapping | Standalone date navigator (`status: experimental`, not currently mounted). Chrome-like; no app module. |

### 3e. Signed-in app — chrome / shell (Foundation)

| Slug | Component Path | Surface | Public Runtime Key | App Module ID | Relationship | Notes |
|---|---|---|---|---|---|---|
| `app-top-nav` | `@/components/journal/AppTopNav` | signed_in_app | — | — | style_reference_only | Shell chrome (APP-UI-FOUNDATION §2). Foundation, not a registry module. |
| `journal-footer-nav` | `@/components/journal/JournalFooterNav` | signed_in_app | — | `~app.log.quick-entry.v1` | needs_future_mapping | Footer nav + Quick Entry control. The Quick Entry portion maps to `footer_quick_entry`; the nav itself is Foundation chrome (APP-UI-FOUNDATION §3–4). |
| `app-shell` | `@/components/journal/AppShell` | signed_in_app | — | — | style_reference_only | Shell wrapper (top offset + dark base). Foundation, not a registry module. |

### 3f. Signed-in app — Plans surface

| Slug | Component Path | Surface | Public Runtime Key | App Module ID | Relationship | Notes |
|---|---|---|---|---|---|---|
| `slot-card` | `@/components/journal/plans/SlotCard` | signed_in_app | — | `app.plans.meal-slots.v1` | same_visual_family | Plan slot + meals → `meal_slot_list` design template. |
| `day-view` | `@/components/journal/plans/DayView` | signed_in_app | — | `app.plans.today-plan.v1` | same_visual_family | One plan day (orchestrates SlotCards) → `plan_today_card` family. |
| `week-view-panel` | `@/components/journal/plans/WeekViewPanel` | signed_in_app | — | `app.plans.weekly-rhythm.v1` | same_visual_family | Week workbench → `weekly_rhythm` family. |
| `projected-nds-strip` | `@/components/journal/plans/ProjectedNDSStrip` | signed_in_app | — | `~app.plans.weekly-rhythm.v1` / `~app.home.nds-so-far.v1` | needs_future_mapping | Projected NDS per day; spans plan-week + NDS families. |
| `schedule-conflict-banner` | `@/components/journal/plans/ScheduleConflictBanner` | signed_in_app | — | `~app.plans.meal-schedule.v1` | same_visual_family | Conflict resolver banner → `schedule_summary` family. |
| `profile-defaults-banner` | `@/components/journal/plans/ProfileDefaultsBanner` | signed_in_app | — | `~app.profile.basics.v1` / `~app.plans.today-plan.v1` | needs_future_mapping | Plans-surface banner reading profile defaults; spans profile + plans governance. |

### 3g. Signed-in app — Programs / Baseline surface

| Slug | Component Path | Surface | Public Runtime Key | App Module ID | Relationship | Notes |
|---|---|---|---|---|---|---|
| `program-delivery-modules` | `@/components/journal/programs/ProgramDeliveryModules` | signed_in_app | — | `app.programs.active-program.v1` | same_visual_family | Config-driven program cards → `program_progress_card` family. |
| `baseline-prep-modules` | `@/components/journal/programs/BaselinePrepModules` | signed_in_app | — | `app.programs.baseline-start.v1` | same_visual_family | Baseline Day-0 prep → `program_card` family. |
| `baseline-week-one-modules` | `@/components/journal/programs/BaselineWeekOneModules` | signed_in_app | — | `~app.programs.active-program.v1` | same_visual_family | In-program weekly guidance (days 1–7) → active-program family. |
| `baseline-week-two-modules` | `@/components/journal/programs/BaselineWeekTwoModules` | signed_in_app | — | `~app.programs.active-program.v1` | same_visual_family | Weekly guidance (days 8–14). |
| `baseline-week-three-modules` | `@/components/journal/programs/BaselineWeekThreeModules` | signed_in_app | — | `~app.programs.active-program.v1` | same_visual_family | Weekly guidance (days 15–21) + Day-21 recommendation branch. |

### 3h. Mapping summary

| Relationship | Count (of 48) |
|---|---|
| `exact_component_match` | 0 |
| `same_visual_family` | 28 |
| `style_reference_only` | 7 |
| `needs_future_mapping` | 11 |
| `duplicate_or_collision` | 2 (the aurora pair) |
| `deprecated_or_stale` | 0 |

All 48 entries are accounted for. No style-guide entry maps to a public runtime key by exact
component (the homepage composes `@/components/home/*` directly; the runtime registry renders
`@/components/modules/*`). App-module cross-links are **visual-family / design-template**
associations, not wired contracts.

---

## 4. Public runtime keys without a style-guide entry

All **13** `MODULE_REGISTRY` keys lack a *dedicated* style-guide catalog entry (no catalog
entry points at `@/components/modules/*`). Several have an approximate visual-family analog in
the catalog; the rest are genuine documentation gaps (consistent with audit §4c).

| Public Runtime Key | Component | Relationship | Style-guide visual analog | Notes |
|---|---|---|---|---|
| `hero.standard.v1` | `HeroStandardV1` | public_runtime_only | `~hero` / `~hero-medium` | Schema-driven standard hero. |
| `hero.offer-blur.v1` | `HeroOfferBlurV1` | public_runtime_only | `~hero` (blur) | Offer hero with blur treatment. |
| `feature.split-media.v1` | `FeatureSplitMediaV1` | public_runtime_only | `~feature-card` | Split media feature. |
| `feature.reasons-split.v1` | `FeatureReasonsSplitV1` | public_runtime_only | `~feature-card` | Reasons-split feature. |
| `grid.cards.v1` | `GridCardsV1` | public_runtime_only | `~grid-2col` | Schema-driven card grid. |
| `cta.band.v1` | `CtaBandV1` | public_runtime_only | `~cta-banner` | CTA band. |
| `persuasion.simple-cta.v1` | `PersuasionSimpleCtaV1` | public_runtime_only | `~cta-banner` | Simple persuasion CTA. |
| `ambient.marquee-strip.v1` | `AmbientMarqueeStripV1` | public_runtime_only | `~aurora-background` (ambient) | Ambient marquee strip. |
| `faq.accordion.v1` | `FaqAccordionV1` | public_runtime_only | — | **Gap:** no FAQ module cataloged. |
| `faq.accordion.v2` | `FaqAccordionV2` | public_runtime_only | — | **Gap:** v2 FAQ. |
| `pricing.tiers.v1` | `PricingTiersV1` | public_runtime_only | — | **Gap:** no pricing module cataloged. |
| `process.slide-stack.v1` | `ProcessSlideStackV1` | public_runtime_only | — | **Gap:** no process/slide-stack cataloged. |
| `case-study.scroll-cards.v1` | `CaseStudyScrollCardsV1` | public_runtime_only | — | **Gap:** no case-study scroller cataloged. |

> Recommended future catalog targets (no behavior change): `faq.accordion.*`, `pricing.tiers.v1`,
> `process.slide-stack.v1`, `case-study.scroll-cards.v1` — they already carry typed content
> contracts, so a style-guide entry would be reference-only. Tracked in audit §4c.

---

## 5. App registry IDs without a style-guide entry

Of the **36** `APP_MODULE_REGISTRY` IDs, the following have **no** style-guide catalog
counterpart (governance-only). The Home/Log/Plans/Programs IDs that *do* have a loose
visual-family analog are cross-linked in [§3](#3-reconciliation-table--all-48-style-guide-entries)
and omitted here; the Profile surface is almost entirely uncataloged because no Profile
settings components are in the style-guide catalog yet.

| App Module ID | Surface | Design Template | Relationship | Notes |
|---|---|---|---|---|
| `app.programs.assessments.v1` | programs | `assessment_card` | app_governance_only | No assessment card in the style-guide catalog. |
| `app.programs.library.v1` | programs | `program_grid` | app_governance_only | Program library grid not cataloged. |
| `app.programs.locked-future-programs.v1` | programs | `locked_module` | app_governance_only | Locked/coming-soon program module not cataloged. |
| `app.programs.integrative-care-upgrade.v1` | programs | `offer_card` | app_governance_only | Offer/upgrade card not cataloged. |
| `app.programs.partner-placeholder.v1` | programs | `partner_program_card` | app_governance_only | Phase 3 placeholder; not cataloged. |
| `app.log.macro-summary.v1` | log | `macro_summary` | app_governance_only | No standalone macro-summary in catalog (`logged-item-card` shows a macro bar but is not the summary module). |
| `app.plans.recipes-imports.v1` | plans | `recipe_import_card` | app_governance_only | Import card not cataloged (`SlotEditor` create mode is do-not-reuse). |
| `app.plans.grocery-list.v1` | plans | `grocery_summary` | app_governance_only | Grocery summary not cataloged. |
| `app.profile.basics.v1` | profile | `settings_card` | app_governance_only | Profile settings cards not cataloged (`profile-defaults-banner` is a Plans-surface reader, not the settings card). |
| `app.profile.goals.v1` | profile | `settings_card` | app_governance_only | Not cataloged. |
| `app.profile.food-preferences.v1` | profile | `settings_card` | app_governance_only | Not cataloged. |
| `app.profile.meal-schedule.v1` | profile | `settings_card` | app_governance_only | Not cataloged (see duplicate name note in §6). |
| `app.profile.tracking-preferences.v1` | profile | `tracking_toggle_list` | app_governance_only | Not cataloged. |
| `app.profile.health-context.v1` | profile | `settings_card` | app_governance_only | Safety-owned; not cataloged. |
| `app.profile.program-preferences.v1` | profile | `settings_card` | app_governance_only | Not cataloged. |
| `app.profile.notifications.v1` | profile | `settings_card` | app_governance_only | Phase 2; not cataloged. |
| `app.profile.account-billing.v1` | profile | `settings_card` | app_governance_only | Entitlement/account; `access-card` is a loose analog only. |

> The remaining ~19 app IDs (home, most of log, plans, and the two program-detail families)
> have at least an approximate style-guide analog and are recorded in §3. **No app ID is
> renamed or moved by this mapping.**

---

## 6. Duplicates, collisions, and stale findings

Honest accounting of overlaps (none block runtime; recorded for builder clarity):

1. **Aurora export-symbol collision (resolved).** `components/journal/AuroraBackground` and
   `components/ui/aurora-background` both export the symbol `AuroraBackground`. Resolved at the
   style-guide level in Packet 2C-C: distinct slugs (`aurora-background` vs `aurora-page-wrapper`)
   and an aliased import in the embed page. The *source export names* still collide — anything
   importing both must alias one. → `duplicate_or_collision` (resolved at catalog level).
2. **Three NDS visualizations.** `nutrition-density-gauge` (d3 half-donut), `nutrition-density-scroller`
   (snap strip), and `nds-display` (score + subscore bars) are distinct, intentional components,
   not duplicates — but they share the "NDS" name space and all map loosely to `app.log.nutrition-density.v1`
   / `app.home.nds-so-far.v1`. Builders should pick by surface/use. Not a defect.
3. **Duplicate names within the app registry (by design, different surfaces).**
   "Today's Plan" exists as both `app.home.todays-plan.v1` and `app.plans.today-plan.v1`;
   "Meal Schedule" as both `app.plans.meal-schedule.v1` and `app.profile.meal-schedule.v1`;
   "Quick Entry" appears as `app.home.quick-entry-row.v1` and `app.log.quick-entry.v1`. IDs are
   unique (surface-scoped); only the human `name` repeats. Documented so cross-references don't
   conflate them.
4. **No stale style-guide metadata found.** All 48 catalog `componentPath`s resolve to existing
   files (verified during 2A–2C-C). `section-label` and `form-panel` are intentionally
   "pattern / static recreation" entries, not stale. → no `deprecated_or_stale` rows.
5. **Surface vocabulary mismatch.** The style-guide uses `ModuleSurface`
   (`public_site` / `signed_in_app` / `admin` / `shared`); the app registry uses `AppSurface`
   (`home` / `programs` / `log` / `plans` / `profile` / …). These are different granularities, not
   conflicts — a `signed_in_app` style-guide entry can map to several `AppSurface` values. A future
   crossReference field (Phase B) should store the finer `AppSurface` alongside the catalog entry.

---

## 7. Do Not Merge Yet

The three systems must remain separate at this stage:

- **Style-guide catalog is documentation/reference.** It exists to help humans + agents find,
  preview, and safely reuse components. Merging it into a runtime system would couple
  documentation to rendering and risk making the catalog a runtime dependency (it is currently
  imported only by the three `/style-guide/modules` pages).
- **Public runtime registry drives public page composition.** `MODULE_REGISTRY` is a live
  rendering contract (Zod schema + component) for `ModuleRenderer`. Its keys are content-type
  identifiers, not documentation slugs; changing them is a breaking content-contract change.
- **App registry governs signed-in app modules.** `APP_MODULE_REGISTRY` owns data dependencies,
  fallback states, visibility/trigger rules, CTA behavior, analytics, field ownership, and safety
  notes. It is deliberately decoupled from components (it carries `designTemplate` strings) so the
  *governance contract* can stabilize before any component or CMS wiring. App pages are **not**
  wired to it yet (`APP-MODULE-SYSTEM.md` §2, §10).
- **CMS/config edits presentation only and must never invent user truth.** Per
  `APP-MODULE-SYSTEM.md` §1/§4: CMS-editable = copy, imagery, CTA labels, campaign framing,
  ordering within safe bounds, visibility windows. Code-owned = behavior, route contracts, design
  templates, analytics names. Data-owned = NDS, journal, plan/grocery/pantry truth, tracking
  prefs, program progress, entitlements. Safety-owned = guardrails/claims. A premature merge would
  blur these ownership boundaries and risk letting marketing/CMS override user truth — explicitly
  a non-goal (`APP-MODULE-SYSTEM.md` §12).

---

## 8. Future Convergence Path

A staged, additive path. Each phase is reversible and behavior-preserving until proven.

- **Phase A — Keep registries separate; improve mapping metadata.** *(this packet)* Maintain the
  three systems independently; keep this reconciliation doc current as the catalog grows.
- **Phase B — Optional cross-reference fields.** Add *optional, non-runtime* fields such as
  `crossReference?: { publicRuntimeKey?: string; appModuleId?: string; appSurface?: AppSurface }`
  to style-guide entries (and/or a `styleGuideSlug?` on app modules). Documentation-grade links;
  no rendering change. Lets the style-guide pages display the cross-links automatically.
- **Phase C — Shared `designTemplate` identifiers.** Introduce a shared vocabulary of
  `designTemplate` ids that both the app registry and the style-guide catalog reference, so a
  governance entry and a visual entry can point at the same template id without sharing a component.
- **Phase D — Selected CMS-editable content/config to admin storage.** Only the fields already
  marked `cmsEditableFields` (copy/imagery/labels/ordering/visibility windows) move to
  admin-managed storage, behind the ownership rules. Truth stays code/data/safety-owned.
- **Phase E — Unified manifest / generated index (only after stability).** Once the app module
  model and CMS surface are proven, consider a *generated* cross-index (not a hand-merged registry)
  that derives a read-only manifest from the three sources. Generation, not merge.

---

## 9. Risk Register

| Risk | Description | Mitigation |
|---|---|---|
| ID / slug drift | A renamed component or app id silently breaks an informal cross-link recorded here. | Keep cross-links `~`-marked + documentation-only until Phase B; re-verify on each packet. |
| Duplicate naming | Repeated human names across app surfaces ("Today's Plan", "Meal Schedule", "Quick Entry") and the aurora export symbol can confuse builders. | Documented in §6; rely on surface-scoped IDs + aliased imports; never key cross-links on `name`. |
| Stale style-guide metadata | A catalog `componentPath` could point at a moved/renamed file. | Verified clean this packet; add a preview/path guard in Packet 2F. |
| Runtime components without visual docs | 13 `MODULE_REGISTRY` modules + several app-only modules have no style-guide entry (§4–§5). | Track as catalog backlog (audit §4c); catalog reference-only entries when useful. |
| Visual modules without governance metadata | Several `signed_in_app` catalog entries have no app-module governance row (e.g. `saved-meal-card`, `journal-date-selector`). | Track as `needs_future_mapping`; add app modules when those surfaces are built. |
| CMS overreach into user truth | A future CMS could try to edit NDS/plan/journal/entitlement truth. | Enforce ownership split (`APP-MODULE-SYSTEM.md` §4); only `cmsEditableFields` ever become editable. |
| Preview fixtures diverging from real props | Style-guide fixtures can drift from a component's real prop contract over time. | Typecheck gates fixtures (they use the real types); add a fixture/prop snapshot check in 2F. |
| Router/auth-dependent components in previews | Some app components use `next/router` or expect auth/services. | Catalog only prop-driven/preview-safe variants with no-op callbacks + inert hrefs (established 2C-A/2C-B/2C-C pattern); keep self-fetching components in audit §6 "do-not-reuse". |

---

## 10. Recommended Next Packets

- **2E — Optional `crossReference` metadata.** If useful, add the Phase-B optional fields to the
  style-guide and/or app-module types and backfill the `~` links from §3 (documentation-only; no
  rendering change). Surfaces the cross-links in the style-guide UI.
- **2F — Style-guide QA snapshot / broken-preview guard.** Add a lightweight check that every
  `MODULE_STYLE_CATALOG` slug has a valid detail + embed route and a non-default render case (guards
  against stale `componentPath`s and missing previews; addresses risks in §9).
- **3A — CMS/admin editability planning (safe presentation fields only).** Begin planning admin
  storage for `cmsEditableFields` only, behind the ownership rules — no user-truth fields, no layout
  takeover, per `APP-MODULE-SYSTEM.md` §12.

---

## 11. Status update — reconciliation paused for curation (Packet 2E)

**Registry reconciliation is paused.** Packet 2D established that the three module systems are
intentionally disjoint and should not be merged yet, and Packet 2E shifted the effort from
expansion/cross-mapping to **curation**.

- **Current source of truth for builders:** the lifecycle curation in `lib/moduleRegistry.ts`
  (`ModuleLifecycle`) and the **default-approved** view at `/style-guide/modules`. Build new pages
  from the approved foundation set; everything ruled out for new builds is flagged in the UI. See
  audit doc §17 ([`MODULE-STYLE-GUIDE-AUDIT.md`](./MODULE-STYLE-GUIDE-AUDIT.md)).
- **Optional, not required now:** the Phase-B `crossReference` metadata proposed in §8 and the
  "2E — Optional crossReference metadata" recommendation above. The mapping tables in §3–§5 remain
  accurate as documentation; no code cross-links were added.
- This pause does not change any earlier finding here — the "Do Not Merge Yet" position (§7) and the
  Future Convergence Path (§8) still stand. Revisit cross-reference metadata only if a concrete need
  arises (e.g. surfacing app-module governance inside the style guide).
