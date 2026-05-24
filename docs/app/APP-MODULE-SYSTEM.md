# App Module System

Source of truth for the signed-in app module system. This document translates the published Second Brain spec "Fine Diet — App Module System Spec: Versioning, Triggers, Data Dependencies, and CMS Management" into implementation rules for this repository.

This packet creates an architecture and registry foundation only. It does not wire app pages to a CMS, move layout control to remote config, or change user-truth services.

## 1. Layer Model

Fine Diet app modules are managed across four layers:

- **App version:** what the shipped code can technically do.
- **Module version:** how a reusable app experience behaves, including design, data dependencies, triggers, fallbacks, CTA behavior, and analytics.
- **CMS / remote config / backend management:** what copy, imagery, offer framing, campaign labels, visibility windows, and priority rules are used within safe limits.
- **Truth/data layer:** what is true about the user based on journal entries, plans, pantry, grocery, programs, assessments, preferences, entitlements, and safety rules.

CMS/config must never invent user truth. It may package and present truths calculated by the app/backend.

## 2. Existing Module Systems

The repo currently has two adjacent module concepts:

- `lib/moduleRegistry.ts` is the public style-guide catalog used by `/style-guide/modules`.
- `lib/modules/*` is the public/marketing page composition runtime used by `ModuleRenderer`.

The signed-in app registry added in this packet is separate:

- `lib/modules/appModuleTypes.ts`
- `lib/modules/appModuleRegistry.ts`

Do not merge these systems until the signed-in app module model is stable. The app registry is code-owned inventory and governance metadata for now, not a runtime page renderer.

## 3. Module Definition

Every signed-in app module should eventually be describable by:

- `id`
- `name`
- `version`
- `surface`
- `type`
- `designTemplate`
- `priority`
- `contentFields`
- `dataDependencies`
- `triggerRules`
- `visibilityRules`
- `personalizationRules`
- `fallbackStates`
- `ctaBehavior`
- `analyticsEvents`
- `cmsEditableFields`
- `developerOwnedFields`
- `safetyNotes`
- `phase`

For MVP, this lives in a TypeScript registry. Later, selected content/config fields can move to admin-managed CMS storage.

## 4. Ownership Rules

Use this division:

- **CMS-editable:** copy, imagery, CTA labels, campaign framing, educational content, module ordering within safe bounds, visibility windows, partner merchandising.
- **Code-owned:** component behavior, route contracts, design templates, versioned module behavior, safe defaults, analytics event names.
- **Data-owned:** NDS score, journal truth, meal readiness, active plan, grocery/pantry truth, tracking preferences, program progress, assessment status.
- **Safety-owned:** nutrition/medical guardrails, entitlement rules, data validity constraints, claims and disclaimers.

CMS/config can modify presentation, but app/backend truth decides whether a state is ready, empty, locked, unavailable, or unsafe.

## 5. Taxonomy

Signed-in app modules use these module families:

- `static_education`: mostly CMS-managed education or orientation.
- `data_summary`: user-data-backed summaries where app/backend owns truth.
- `action`: workflow entry points such as Log Meal, Create Plan, or Start Assessment.
- `time_triggered`: modules that change by day rhythm, week rhythm, or contextual event.
- `program`: strategy/pathway modules such as active program, baseline, locked future program, partner program.
- `readiness`: modules backed by Plans + Grocery + Pantry truth.
- `tracking_preference`: modules generated from enabled user tracking preferences.

## 6. Surfaces

Allowed app surfaces:

- `home`
- `programs`
- `log`
- `plans`
- `profile`
- `quick_entry`
- `pantry_grocery`
- `program_detail`
- `assessment_detail`

Modules should not appear on a surface unless the registry declares that surface.

## 7. Trigger Bands

Time-triggered modules should use standardized bands instead of page-specific ad hoc timing:

- `early_morning`
- `morning`
- `midday`
- `afternoon`
- `evening`
- `night`
- `weekly_planning`
- `contextual`

Examples:

- Morning: day overview, first meal, hydration start, plan readiness, program focus.
- Midday: next meal, missed logs, pantry/grocery gaps, quick check-ins.
- Evening: closeout, dinner readiness, mood/bowel prompt, tomorrow prep.
- Weekly: planning rhythm, grocery review, program progress.
- Contextual: meal skipped, pantry missing, plan incomplete, assessment unfinished, program active, grocery list stale.

## 8. Data Dependencies And Fallbacks

Every module must declare its data dependencies and fallback states.

Example:

- Module: Nutrition Density Today
- Needs: journal entries + NDS result
- Loading: score pending
- Empty: log a meal to generate today’s score
- Error: score unavailable; logging remains available
- Ready: show score, context, and CTA

Required fallback states:

- `loading`
- `empty`
- `ready`
- `error`
- `locked` or `unavailable` when relevant

No module should fail silently.

## 9. Versioning

Fine Diet tracks three version types:

- **App version:** shipped code capability.
- **Module version:** reusable module behavior.
- **Content/config version:** copy, imagery, campaign, offer, and configuration version.

Module versions can include design version, data dependency version, trigger rule version, fallback state version, CTA behavior version, and analytics event version.

## 10. MVP Implementation

Module System Packet 1 adds:

- `docs/app/APP-MODULE-SYSTEM.md`
- `lib/modules/appModuleTypes.ts`
- `lib/modules/appModuleRegistry.ts`

The registry starts as documentation-backed TypeScript metadata. It should guide future page builds, beginning with Home, but it should not yet drive every app page layout.

## 11. Priority MVP Inventory

### Home

- Morning / Today Overview
- Today’s Plan
- Nutrition Density So Far
- Quick Entry Row
- Prep & Pantry
- Program Focus / Default Path
- Contextual Insight

### Programs

- Active Program
- Baseline / Fine Diet Method Starting Point
- Assessments
- Program Library
- Locked Future Programs
- Integrative Care Upgrade
- Partner Program Placeholder

### Log

- Nutrition Density
- Macro Summary
- Meals / Nutrition Entries
- Tracking Preference Cards
- Daily Summary
- Quick Entry

### Plans

- Today’s Plan
- Weekly Rhythm
- Meal Schedule
- Meal Slots
- Recipes / Imports
- Grocery List
- Pantry Readiness

### Profile

- Profile Basics
- Goals
- Diet Type / Food Preferences
- Meal Schedule
- Tracking Preferences
- Health Context
- Program Preferences
- Notifications
- Account / Billing

## 12. Non-Goals

Do not:

- Build a full CMS immediately.
- Make marketing able to override user truth.
- Change NDS, plans, pantry, grocery, journal, entitlement, or tracking truth logic.
- Rebuild every app page in one packet.
- Create remote config before the module schema is stable.
- Turn all page layout into CMS-driven layout before core UX is proven.

## 13. Next Build Order

Recommended after this packet:

1. Home as the first time-triggered module page.
2. Programs as the first program-management page.
3. Plans refinement.
4. Profile refinement.
5. CMS/admin management layer planning.
