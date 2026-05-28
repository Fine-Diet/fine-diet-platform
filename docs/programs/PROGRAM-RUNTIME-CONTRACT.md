# Program Runtime Contract

For the Packets 1-21 architecture handoff, route map, ownership summary, QA status, and guardrails, see [Program Runtime Handoff](./PROGRAM-RUNTIME-HANDOFF.md).

Packet 1 adds the backend contract for Fine Diet programs as guided, versioned experiences. It does not build the `/app/programs` UI, the recommendation engine, or any Plans behavior.

## Why This Layer Exists

The runtime layer is separate from the existing program systems because each one answers a different question:

- `programs`, `program_modules`, and `program_content_items` answer: what content can be authored and delivered?
- `person_entitlements` with `program:<slug>` answers: what has this person acquired access to?
- `program_assignments` answers: what program assignment currently influences runtime inheritance and Plans eligibility?
- `program_content_progress` answers: what catalogue content items has this person viewed or completed?
- `program_plan_guidance` answers: what structured Plans guidance is active? This remains Plans-bound directive data, not user-facing content.
- `program_enrollments` answers: what guided version of a program is this person actually experiencing, when did they start, and what state is the journey in?

This separation keeps CMS content, commerce access, assignment provenance, Plans guidance, and guided runtime state from collapsing into one mutable table.

## Runtime Tables

`program_versions` is the version lock anchor. A person enrollment points to exactly one version so later edits can create a new version without silently changing an in-progress experience.

`program_enrollments` stores the person-specific runtime: source (`entitlement`, `assignment`, or `admin_grant`), purchase date, selected start date, started/completed timestamps, status, timezone, capacity, pause state, and snapshots.

`program_checkin_templates` stores versioned check-ins by `checkin_day`.

`program_checkin_responses` stores completed check-ins and explicitly skipped check-ins. Skips are first-class rows, not absence of data.

`program_recommendations` stores recommendation results tied to an enrollment. Baseline Recommendation Engine v1 writes a conservative Day 21 row after the Day 21 check-in is completed or explicitly skipped.

## Start Dates, Days, Unlocks, And Pauses

`selected_start_date` is a local calendar date selected for the enrolled person. Runtime helpers calculate `current_day` in the enrollment timezone:

- Before `selected_start_date`, `current_day = 0` and the resolved status is `pre_start`.
- On `selected_start_date`, `current_day = 1`.
- Future day math subtracts `paused_days_total` so pause rollups can freeze the program journey without rewriting the original start date.

`pause_until` marks a current pause window. The server helper resolves the enrollment as `paused` when the stored status is paused or when `pause_until` is still in effect.

Unlock days should be interpreted relative to the calculated program day. Packet 1 stores a simple `default_unlock_day` on `program_versions`; richer per-module or per-item unlock rules should be introduced in a later packet without changing the catalogue tables.

## Check-Ins

Check-in templates belong to a program version and a `checkin_day`. Enrollments answer which version applies. Responses belong to the enrollment and store either:

- `completed` with `responded_at` and response payload.
- `skipped` with `skipped_at` and optional skipped reason.

Both responses and recommendations include `input_snapshot_json` and `computed_metrics_snapshot_json` so future analytics and recommendation explanations can refer to what was known at the time.

## Baseline App Delivery

Baseline active delivery lives in the signed-in app route, not public `/programs`. Week 1 renders for active `current_day` 1-7 as a low-pressure Eating Rhythm experience: nourish, repeatable meals, timing, and consistency over correctness. Week 2 renders for active `current_day` 8-14 as Digestion & Recovery Support: pace, warmth, recovery, and rhythm. Week 3 renders for active `current_day` 15-21 as Real-Life Flexibility: returning to rhythm after disruption, observing patterns, and choosing maintenance anchors. Day 7, Day 14, and Day 21 keep the check-in panel directly after the active-week delivery modules when the matching check-in is due. Once Day 21 is handled, Week 3 points to the separate recommendation reveal section. Prep modules remain available as reference after the program starts.

Packet 15 moves the Baseline prep/week cards into generic delivery-module config instead of one-off React components. The generic contract is `ProgramDeliveryModuleDefinition` in `lib/programs/deliveryModuleTypes.ts`; Baseline’s first code-authored definitions live in `lib/programs/baselineDeliveryModules.ts`; and `/app/programs/[slug]` renders them through `ProgramDeliveryModules`. The renderer handles enrollment-status visibility, active day ranges, capacity-specific copy, grouped card sections, roadmap blocks, current-day copy tokens, anchor CTAs, CTA tone, disabled CTAs, and safety/no-claims notes. Specialized runtime interactions still remain separate: check-in submission stays in `BaselineCheckinPanel`, and recommendation display stays in the recommendation reveal section.

Packet 16 adds the first admin-side authoring foundation for that same generic contract. The additive `program_delivery_modules` table can store published delivery cards for a program, optionally scoped to a `program_versions` row. The app delivery service now checks for published admin-authored rows first; if any exist for Baseline, those rows are mapped into `ProgramDeliveryModuleDefinition` and used by the renderer. If no published rows exist, Baseline falls back to the code-owned definitions in `lib/programs/baselineDeliveryModules.ts`, so existing Baseline delivery does not depend on admin-authored content.

The persisted shape mirrors the renderer without becoming a full no-code builder:

- `programSlug`, `id`, `moduleType`, `groupId`, and `groupTitle` map to program/module identity and ordering.
- `title`, `eyebrow`, `body`, `blocks`, `safetyNotes`, and `capacityVariants` map to authored display content.
- `dayStart`, `dayEnd`, `statusVisibility`, and `showWhen` map to runtime visibility rules.
- `cta`, `anchorKey`, `anchorId`, and `tone` map to app links, section anchors, disabled/non-routed actions, and existing app-native CTA styling.

The `/admin/programs/[id]` page includes a minimal “Delivery Modules” section for listing rows, creating a simple module, editing title/body/status and related fields, archiving rows, and using raw JSON for capacity variants, CTA, anchor, and metadata fields. This is intentionally not the final builder: complex block editing, drag-and-drop composition, richer version selection, preview tooling, and migration of the full Baseline config remain future work. The code-owned Baseline config remains the source of truth unless published DB modules exist.

## Public Program Series

Packet 17 adds the public marketing-side series structure. `/programs` is the public catalogue/marketplace, and `/programs/[series]` is a public series landing page for pathways such as The Fine Diet Method, Lifestyle, and Advanced. These pages are not runtime surfaces: they do not require journal auth, do not show active enrollment state, and do not read app delivery modules.

Packet 18 adds individual public program/product pages at `/programs/[series]/[program]`. Packet 19 connects those public CTAs to existing safe acquisition paths only: an existing `/buy/[offerKey]` checkout entry point when the code-owned catalogue names an offer, a sign-in/account-start route when no offer is configured, or a disabled coming-soon state for unavailable programs. Public CTA clicks can create access through the existing offer/checkout/account systems, but they do not directly create runtime enrollment.

Packet 20 hardens the Baseline acquisition path while Baseline does not have a standalone offer. The public Baseline CTA points at the existing `journal-annual` offer path. Effective entitlement resolution now treats `journal-annual` as granting both `journal` and `program:baseline`, merging those code-owned requirements with any active `offer_entitlements` database rows. This creates access only; the user still opens `/app/programs` to choose/start the runtime enrollment.

Packet 23 adds the first admin-managed series foundation with `program_series`, `program_series_items`, `/admin/program-series`, and server-side public delivery helpers. Published DB-authored series are preferred by `/programs`, `/programs/[series]`, and `/programs/[series]/[program]`; when no published DB series exist, the routes fall back to the code-owned catalogue in `lib/programs/programSeriesCatalogue.ts`. CTA behavior is still resolved by catalogue helpers so public pages do not scatter checkout, sign-in, or coming-soon decisions. Stripe/offer linkage for admin-authored series remains a later lane.

## Baseline Later

Baseline can become the first Fine Diet Method guided program by:

1. Creating a `programs` catalogue row for the Baseline slug.
2. Publishing a `program_versions` row for the first guided version.
3. Adding check-in templates for the Baseline rhythm.
4. Creating enrollments from `program:<slug>` entitlements, assignments, or staff grants only after the user starts from `/app/programs`.
5. Having `/app/programs` consume the runtime summary instead of treating Baseline as static CMS content.

Baseline-specific recommendations write to `program_recommendations` after the Day 21 Baseline check-in is handled. The v1 engine is conservative: safety flags or worsening signals route to personalized care, insufficient completed check-ins route back to Baseline, and stable non-elimination-specific signals default to an inflammation regulation review path. It does not auto-enroll users into another program or change Plans guidance.

## Admin Program Access Grants

Admins can grant access to any published program without public product pages or checkout through `/admin/entitlements`:

1. Search for the person.
2. Use the Program Access panel and select a published program.
3. Leave “Create enrollment now” unchecked for the normal test path.
4. The user opens `/app/programs`, opens the program, chooses a start date, and creates their own runtime enrollment.

The helper derives the entitlement key as `program:{program_slug}` from the selected published catalogue row, is admin-only, and is idempotent for an already-active program entitlement. Creating an enrollment from the admin panel is explicit opt-in only.

## Packet 2 Should Build Next

Packet 2 should add the first user-facing runtime API surface for `/app/programs`, including:

- Enrollment creation endpoint with start-date selection.
- Runtime summary endpoint scoped through the existing journal access and staff view-as-client pattern.
- Check-in response endpoint that can submit or explicitly skip a check-in.
- Admin tooling or seed scripts to create the first `program_versions` and `program_checkin_templates`.
- Tests around timezone day calculation, source validation, RLS assumptions, and open-enrollment uniqueness.

It should still avoid changing Plans logic, public `/programs`, or existing catalogue/progress tables.
