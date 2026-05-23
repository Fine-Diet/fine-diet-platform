# App UI Foundation

Source of truth for the first signed-in app UI foundation pass. This document translates the prototype direction into the existing Fine Diet platform design system. It does not create a separate app-only design system.

## 1. App Shell Structure

- Canonical signed-in app routes live under `/app/*`; legacy `/journal/*` routes remain compatibility routes.
- `/app/*` and `/journal/*` must not render the public `NavBar` or public `Footer`.
- The signed-in shell uses the same dark platform base as the site: `bg-brand-900 text-white`.
- App pages should use a reusable fixed top nav plus page-owned content and the shared footer nav.
- Content should account for fixed chrome with top offset and bottom safe-area padding.
- Standard app content columns should use `max-w-[650px] mx-auto`.
- Wider app module groups can use `max-w-[1000px] mx-auto`.

## 2. Top Navigation Rules

- Position: fixed at the top, full viewport width.
- Visual treatment: dark translucent glass, `bg-black/50` or equivalent, with `backdrop-blur-md`.
- Height: compact and consistent across app pages, roughly the same perceived density as the footer.
- Left: `Fine Diet App`, set as a product mark using the core sans font.
- Right: a hamburger with exactly two horizontal lines.
- The hamburger is a visual affordance only in this packet unless a reusable menu is intentionally introduced later.
- Top nav must sit above content without covering page controls or date selectors.

## 3. Footer Navigation Rules

- Preserve the current primary footer order: `Home -> Programs -> Log -> Plans`.
- Footer left side remains the primary app nav pill.
- No Profile primary footer item.
- Profile and settings live through page/header/menu paths.
- Use canonical `/app/*` routes from `lib/routes/appRoutes.ts`.
- Visual treatment should stay aligned with the existing footer: dark translucent pill, backdrop blur, selected brand-50 pill, app icons at `w-6 h-6`.

## 4. Quick Entry Rules

- Quick Entry is a separate far-right footer control, not a fifth left-nav tab.
- It should be fixed at the bottom and visually aligned with the footer system.
- Shape: rounded capsule/squircle, not a perfect circle.
- Visual treatment: same dark translucent and blurred treatment as the left footer nav.
- Icon: centered plus sign.
- Opening the Quick Entry menu must not force a route change.
- Menu treatment: dark translucent glass panel, soft separators, stacked options, aligned to the Quick Entry control.
- Packet 1 menu options:
  - Meal / Nutrition
  - Hydration
  - Mood
  - Movement
  - More
- Selecting an option may route to `/app/log/new` with the existing log query params.

## 5. Typography Scale Mapping

Use `styles/theme.ts` and Tailwind’s configured `fontSize` scale. The app uses the same Eina03 sans font family as the public site.

| App role | Platform token/class guidance |
|---|---|
| App product mark | `text-xs` or `text-sm`, `font-semibold`, `font-sans` |
| App page hero headline | `text-4xl` to `text-6xl` depending viewport |
| App page subtitle | `text-sm` to `text-base`, `font-light`, `text-white/70` |
| Section label | `text-xs` or `text-sm`, `font-semibold`, uppercase only when it improves scanning |
| Image card headline | `text-3xl`, `font-semibold`, tight line height |
| Standard card title | `text-base` to `text-xl`, `font-semibold` |
| Module label | `text-sm`, `font-semibold` |
| Metric value | `text-lg` to `text-3xl`, `font-semibold` |
| Metric caption | `text-xs` to `text-sm`, `text-white/60` |
| CTA text | `text-base`, `font-semibold` |
| Microcopy | `text-xs` to `text-sm`, `font-light` or regular |

Do not introduce a new app-only type scale unless it maps back to `styles/theme.ts`.

## 6. Spacing Scale Mapping

Use `theme.spacing` first. Avoid one-off spacing values unless they are documented exceptions.

| App spacing role | Current rule |
|---|---|
| Mobile page horizontal padding | `px-4` or `px-5` |
| Desktop page max width | `max-w-[650px]` for core content, `max-w-[1000px]` for module groups |
| Section vertical gaps | `gap-3`, `mb-5`, `py-4`, `pt-6` |
| Card internal padding | `p-5 md:p-6` |
| Hero spacing | page-specific, but must account for fixed top nav |
| Footer safe-area padding | `pb-safe` plus bottom margin |
| Top-nav offset padding | shell-level top padding when content does not own a hero offset |
| Module grid gaps | `gap-3` |

## 7. Button Size And Variant Rules

Use `components/ui/Button.tsx` where practical.

Existing variants:

- `primary`: denim gradient, filled, strongest CTA.
- `secondary`: transparent border on light contexts.
- `tertiary`: transparent white border for dark/image contexts.
- `quaternary`: white fill on dark contexts.

Existing sizes:

- `sm`: compact pill, `px-5 py-1`.
- `md`: standard app/site CTA, `px-5 py-2`.
- `lg`: hero or primary action, `px-5 py-3`.

App-specific rules:

- Primary app CTA should generally map to `Button variant="primary"` or a token-aligned denim pill.
- Secondary/outline app CTA should map to `tertiary` on dark surfaces.
- Disabled/locked CTA uses the existing disabled opacity and pointer behavior.
- Card CTAs may remain whole-card links when using `GridItemApp`.
- Small pill CTAs should use the same rounded-full language and token colors.
- Icon-only footer controls should remain custom buttons but match the footer glass treatment.

## 8. Image-Backed Card Rules

Use `components/home/GridItemApp.tsx` and `components/journal/GridAppSectionHome.tsx` as current app references.

- Card height: currently `h-[140px]` for app summary/nav cards.
- Radius: currently `rounded-md` for app cards.
- Overlay: use a dark gradient such as `from-black/80 via-black/50 to-black/40`.
- Interior: `max-w-[650px]`, `p-5 md:p-6`, vertically centered.
- Text: white, antialiased, title at `text-3xl font-semibold`.
- Whole-card links are acceptable for summary/nav modules.

Note: `lib/moduleRegistry.ts` still contains older card language that does not fully match the current `GridItemApp` implementation. For app UI work, current component code is stronger than stale registry prose.

## 9. Tracking Module Card Rules

- Tracking cards on `/app/log` should be generated from enabled tracking preferences.
- Do not hardcode repeated rendered cards.
- Do not show disabled modules.
- Use `SummaryRowModule` from `lib/summaryRowTypes.ts` for app summary card data.
- Empty states must include useful CTAs to `/app/log/new`.
- Use real data when present; use safe fallback empty states when unsupported data is not yet available.
- `intake` remains the internal key. UI copy should be ready to say `Nutrition`.

Supported module keys for this packet:

- `intake`
- `water`
- `sleep`
- `supplement`
- `mood`
- `bowel`
- `cycle`
- `movement`
- `blood_pressure`
- `glucose`
- `weight`

## 10. Page And Module Translation Rules

### Home

- Greeting hero with time-aware copy.
- Today’s Rhythm and schedule preview modules should translate the website hero/card language into app modules.
- Nutrition Density So Far Today should use metric-card language.
- Quick Entry row belongs as a contextual action surface; footer Quick Entry remains persistent.
- Prep & Pantry, default path/program, and contextual insight cards should be image-backed modules or light cards on dark background.
- Mobile uses a single-column flow; desktop can widen modules while keeping readable content columns.

### Programs

- `/app/programs` is signed-in program management, distinct from public `/programs`.
- Baseline is the first Fine Diet Method step.
- Future locked programs, partner/lifestyle programs, and advanced programs are program modules, not top-level nav.
- Assessments are program-adjacent discovery and feedback tools.
- Integrative care upgrades can appear as contextual program pathways.
- Do not recreate a top-level Insights hub.

### Plans

- Plans should center on planning message/hero, Up Next, Weekly Rhythm, Meal Schedules, Meals & Recipes, Grocery Management, and Pantry readiness.
- Use canonical app routes: `/app/plans`, `/app/plans/today`, `/app/plans/grocery/[planId]`, and `/app/plans/imports/*`.
- Do not rewrite plan/grocery/import logic in this packet.
- Mobile remains stacked; desktop can use wider card sections.

### Log

- `/app/log` is the Daily Log / Journal truth surface.
- Required structure: fixed app top nav, date/day context, large Nutrition Density gauge, macro summary, daily intake progress, meals, tracking modules from preferences, footer nav, and Quick Entry.
- Preserve journal services, data merging, NDS logic, APIs, and Supabase schema.
- Packet 2 pattern: the Log hero owns date context, Nutrition Density, daily intake progress, and meal blocks. Preference-driven tracking modules live below the hero as dark translucent cards generated from `SummaryRowModule` data.
- Tracking module cards should keep `intake` as the internal key while displaying `Nutrition`; unsupported-but-enabled modules such as `glucose` and `weight` should render useful enabled empty states without changing data services.

### Profile

- Profile should cover basics, goals and food preferences, meal schedule, tracking preferences, health context, notifications, summary tiles, programs, account/billing, and logout.
- Summary tiles should reflect enabled tracking preferences.
- Programs section links to `/app/programs`.
- Profile remains outside primary footer navigation.

## 11. Mobile Vs Desktop Resizing Rules

- Mobile: single column, `px-4` or `px-5`, fixed top nav, bottom footer/Quick Entry with safe-area padding.
- Desktop: keep app chrome fixed; content may expand to `max-w-[1000px]` for module groups while text remains readable.
- Avoid creating separate mobile-only components unless behavior truly differs.
- Prototype images guide composition, but implementation should remain token-driven.

## 12. What Not To Build Or Change In This Packet

- Do not migrate to Next App Router.
- Do not rename `/api/journal/*`.
- Do not rename journal tables, services, or Supabase schema.
- Do not change NDS business logic.
- Do not rewrite plan, grocery, or import logic.
- Do not remove `/journal/*` compatibility.
- Do not collapse public `/programs` into signed-in `/app/programs`.
- Do not fully rebuild Home, Programs, Plans, or Profile.
- Do not create a separate unconnected app design system.
