# Program Runtime Contract

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

`program_recommendations` stores recommendation results tied to an enrollment. Packet 1 only creates the storage contract; the engine comes later.

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

## Baseline Later

Baseline can become the first Fine Diet Method guided program by:

1. Creating a `programs` catalogue row for the Baseline slug.
2. Publishing a `program_versions` row for the first guided version.
3. Adding check-in templates for the Baseline rhythm.
4. Creating enrollments from `program:<slug>` entitlements, assignments, or staff grants.
5. Having `/app/programs` consume the runtime summary instead of treating Baseline as static CMS content.

Baseline-specific recommendations should write to `program_recommendations` only after Packet 2 defines the engine inputs and safety rules.

## Packet 2 Should Build Next

Packet 2 should add the first user-facing runtime API surface for `/app/programs`, including:

- Enrollment creation endpoint with start-date selection.
- Runtime summary endpoint scoped through the existing journal access and staff view-as-client pattern.
- Check-in response endpoint that can submit or explicitly skip a check-in.
- Admin tooling or seed scripts to create the first `program_versions` and `program_checkin_templates`.
- Tests around timezone day calculation, source validation, RLS assumptions, and open-enrollment uniqueness.

It should still avoid changing Plans logic, public `/programs`, or existing catalogue/progress tables.
