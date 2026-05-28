# Program Runtime Handoff

This handoff summarizes the Program Runtime and public marketing program system built across Packets 1-21. It is an architecture orientation for future implementation packets, not a new product spec.

For lower-level runtime semantics, see [Program Runtime Contract](./PROGRAM-RUNTIME-CONTRACT.md).

## Executive Summary

Fine Diet now has an end-to-end program system that separates public marketing, commerce access, admin management, and signed-in guided runtime state.

The system includes:

- A public program catalogue at `/programs`.
- Public series pages at `/programs/[series]`.
- Public individual program/product pages at `/programs/[series]/[program]`.
- Offer-to-entitlement access mapping through `offer_entitlements`.
- Admin program access grants through `/admin/entitlements`.
- App-side enrollment and start flow under `/app/programs`.
- App-side delivery modules under `/app/programs/[slug]`.
- Runtime check-ins for versioned guided programs.
- Baseline Recommendation Engine v1.
- A first admin-authored delivery module foundation.

The most important boundary is that public purchase creates access, while app enrollment creates runtime state. Public program pages are marketing and commerce surfaces; signed-in app program pages are management and delivery surfaces.

## Route Map

### Public Marketing

- `/programs` is the public catalogue and marketplace.
- `/programs/[series]` is a public series landing page.
- `/programs/[series]/[program]` is a public individual program/product page.

These routes do not require journal auth, do not read enrollment state, and do not render app delivery modules.

### Signed-In App

- `/app/programs` is the canonical signed-in program management surface.
- `/app/programs/[slug]` is the canonical signed-in program runtime/detail surface.

These routes handle entitlement-aware program availability, enrollment/start flow, active runtime state, delivery modules, check-ins, and recommendations.

### Legacy Compatibility

- `/journal/programs` remains a compatibility route for existing links and users.
- `/journal/programs/[slug]` remains a compatibility route for existing links and users.

New app-native program work should target `/app/programs` and `/app/programs/[slug]`.

### Admin

- `/admin/programs` lists and manages authored program records.
- `/admin/programs/[id]` edits program details, modules/content, and the first delivery module foundation.
- `/admin/entitlements` grants program access and other entitlements to people.
- `/admin/offers` manages offers and their entitlement mappings.

## Core Data Model

`programs` stores the program catalogue identity: slug, title, description, status, and other authored program metadata.

`program_versions` stores version locks for guided runtime experiences. Enrollments point to one version so later content edits do not silently change an in-progress user journey.

`program_modules` stores authored catalogue/runtime content grouping for a program.

`program_content_items` stores authored content items inside program modules.

`program_delivery_modules` stores admin-authored delivery cards for signed-in runtime presentation. Published rows are preferred when available.

`program_enrollments` stores person-specific runtime state: selected start date, status, capacity, timezone, pause fields, snapshots, source, and the locked `program_versions` row.

`program_checkin_templates` stores versioned check-in definitions by program version and program day.

`program_checkin_responses` stores completed or explicitly skipped check-ins for an enrollment.

`program_recommendations` stores recommendation outputs tied to an enrollment. Baseline v1 writes a conservative Day 21 recommendation after the Day 21 check-in is completed or skipped.

`program_content_progress` tracks person-level progress against catalogue content items.

`program_assignments` records assignment provenance that can influence runtime inheritance and Plans eligibility without becoming enrollment state.

`person_entitlements` records user access grants such as `journal` and `program:baseline`.

`offer_entitlements` maps an offer key to one or more entitlement keys, optionally with durations.

## Access vs Enrollment

Public purchase grants entitlement/access. Program-specific entitlement keys use the format `program:{slug}`, for example `program:baseline`.

Purchase does not auto-enroll the person into a guided runtime program. This is deliberate: access answers what the person has acquired, while enrollment answers what guided version they are actually experiencing.

App enrollment happens from `/app/programs`. The user opens an available program, chooses runtime start inputs such as start date and capacity, and starts the program there.

Enrollment locks the user to a `program_versions` row. Future edits can publish a new version without changing the enrolled user's active experience.

## Baseline Current Behavior

The `journal-annual` offer grants both `journal` and `program:baseline`. This is enforced through offer entitlement mapping plus the Packet 20 code-owned safety supplement for `journal-annual`.

Baseline can also be granted from `/admin/entitlements` through the Program Access panel.

After access exists, the user starts Baseline from `/app/programs`. They choose a start date and capacity. Prep modules render before the selected start date and remain available as reference after the program starts.

Baseline active delivery is organized by program day:

- Week 1 renders for days 1-7.
- Week 2 renders for days 8-14.
- Week 3 renders for days 15-21.

Check-ins appear on Day 7, Day 14, and Day 21. After the Day 21 check-in is completed or explicitly skipped, the Baseline Recommendation Engine generates and reveals a recommendation.

The v1 recommendation behavior is conservative: safety or worsening signals route toward personalized care, insufficient completed check-ins route back to Baseline, and stable non-elimination-specific signals default to an inflammation regulation review path. It does not auto-enroll the user into another program and does not change Plans guidance.

## Admin-Managed vs Code-Owned

### Admin-Managed

- Program catalogue content in `programs`.
- Program modules and content items in `program_modules` and `program_content_items`.
- Program series foundation in `program_series` and `program_series_items`.
- Delivery module foundation in `program_delivery_modules`.
- Entitlement/program access grants in `person_entitlements`.
- Offer entitlement mappings in `offer_entitlements`.

### Code-Owned

- Code-owned program series catalogue fallback in `lib/programs/programSeriesCatalogue.ts`.
- Baseline fallback delivery config in `lib/programs/baselineDeliveryModules.ts`.
- Baseline Recommendation Engine rules in `lib/programs/baselineRecommendationEngine.ts`.
- Check-in form rendering.
- Recommendation reveal rendering.
- Stripe/offer linkage rules inside public CTA helper logic.
- Some helper logic for public program pages and app runtime presentation.

Packet 23 adds the admin-managed program series foundation. Published DB-authored series are preferred by public marketing routes; the existing code-owned catalogue remains the fallback when no published DB series exist or the additive tables are not present yet. Future packets may move more of the code-owned catalogue and delivery configuration into admin-managed storage, but should do so deliberately and without blurring runtime truth.

## Delivery Module Infrastructure

Delivery modules use a generic `ProgramDeliveryModuleDefinition` contract. The renderer can handle module identity, grouping, title/body content, blocks, safety notes, status visibility, day windows, capacity variants, anchor links, CTA metadata, and tone.

DB-authored published delivery modules are preferred. The app delivery service checks for published `program_delivery_modules` rows first and maps them into the generic renderer contract.

Baseline falls back to code-owned delivery config when no published DB delivery modules exist. This keeps Baseline functional before admin-authored delivery content is complete.

The admin Delivery Modules section on `/admin/programs/[id]` is the first foundation, not the final no-code builder. It supports listing, creating simple modules, editing core fields, archiving, and raw JSON for advanced fields. Drag-and-drop composition, richer block editing, preview tooling, and full Baseline config migration remain future work.

## Public Marketing Architecture

`/programs` is the public marketing and commerce surface. It is for offer discovery, product education, and acquisition paths.

`/app/programs` is the signed-in management surface. It is for available programs, current program state, start/enrollment flow, runtime delivery, check-ins, and recommendations.

Program series now have an admin-managed storage path through `/admin/program-series`. Public routes prefer published DB series and items, but preserve the code-owned catalogue fallback so current routes keep working before DB content is published.

Public program pages do not read runtime state. They should not show enrollment status, active day, check-in state, recommendation state, or delivery modules.

Public CTAs drive access or purchase. They may link to existing checkout entry points such as `/buy/[offerKey]`, sign-in/account-start routes, or disabled coming-soon states. They do not create runtime enrollment directly.

Stripe/offer linkage for admin-authored program series is still a future lane. Packet 23 manages series content and sequence, not checkout behavior.

## QA Status Through Packet 21

Packet 21 verified the integrated public marketing and runtime handoff path at the current implementation level:

- Public routes passed.
- Login redirect preserved placement, source, and UTM parameters.
- Checkout/webhook code paths store metadata.
- `journal-annual` grants both `journal` and `program:baseline`.
- Purchase/access does not auto-enroll users.
- App runtime tests passed.
- Remaining limitation: no real Stripe payment-provider round trip has been performed yet.

## Recommended Next Packet Lanes

- Public Program Page Design Polish.
- Admin Delivery Module Builder v2.
- Live Stripe Checkout QA.
- Next Program Template: Digestive Foundations.
- RLS advisory review for unrelated tables.
- Stripe/offer linkage for admin-authored program series and items.

## Guardrails

- Do not collapse public marketing and app runtime into one surface.
- Do not let CMS/admin-authored content invent user truth such as enrollment state, check-in completion, or recommendations.
- Do not auto-enroll from purchase unless that product decision is explicitly made later.
- Do not recommend multiple guided protocols at once.
- Keep Plans guidance separate from program content and program runtime.
- Keep checkout behavior, Plans logic, public routes, app runtime logic, and database schema stable unless a future packet explicitly scopes changes there.

## Handoff Assumptions

- Baseline is currently the only fully described guided runtime program.
- Program series have an admin-managed foundation, while the code-owned catalogue remains the fallback.
- Admin-authored delivery modules are additive and preferred only when published rows exist.
- The live Stripe payment-provider round trip still needs dedicated QA.
