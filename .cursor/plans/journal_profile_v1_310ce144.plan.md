---
name: Journal Profile V1
overview: Build the V1 Profile page at `/journal/profile` by replacing the current placeholder with a mobile-first, section-based profile surface that stores health and personalization data in `people.metadata`, clearly separated from Account Settings.
todos:
  - id: api-profile
    content: Create pages/api/journal/profile.ts (GET/POST for profile data in people columns + metadata)
    status: completed
  - id: api-goals-patch
    content: Add PATCH support to pages/api/journal/goals.ts (expose updateUserGoals)
    status: completed
  - id: page-layout
    content: Replace pages/journal/profile.tsx with full V1 page (layout, data fetching, section cards)
    status: completed
  - id: section-1
    content: "Section 1 — Profile Basics: first name, last name, date of birth, sex"
    status: completed
  - id: section-2
    content: "Section 2 — Goals & Food Preferences: primary goal, dietary style, eating window, calorie/macro goals"
    status: completed
  - id: section-3
    content: "Section 3 — Tracking Preferences: toggle cards for enabled tracking keys"
    status: completed
  - id: section-4
    content: "Section 4 — Health Context: allergies, symptom priorities, activity baseline, sleep, cycle"
    status: completed
  - id: section-5
    content: "Section 5 — Notifications: marketing consent (5a) + journal reminders (5b), conceptually separated"
    status: completed
  - id: section-6-7
    content: Sections 6-7 — Summary Tile Preferences (active pill display + link to tracking) + Program Context (warm placeholder)
    status: completed
  - id: section-8-9
    content: Section 8 — Profile Completion indicator + Section 9 — Account Settings link-out
    status: completed
  - id: verify
    content: Lint check + production build verification
    status: completed
isProject: false
---

# Journal Profile V1

## Phase 1: What Already Exists

### Routes and shell

- `/journal/profile` exists as a placeholder ("Coming soon") in [pages/journal/plans.tsx](pages/journal/profile.tsx)
- `JournalFooterNav` has the "Profile" tab wired to this route
- All `/journal/*` routes are auth-gated via middleware

### Data layer

- `**people` table**: `first_name`, `last_name`, `email`, `phone`, `metadata` (JSONB), marketing opt-ins
- `**people.metadata`** currently stores: `enabled_tracking_keys`, `dailyCalorieGoal`, `macroGoals`
- `**profiles` table**: only `role` — not useful for profile content
- **No existing fields for**: date of birth, sex, primary goal, dietary style, eating window, allergies, symptom priorities, activity baseline, sleep schedule, cycle details, onboarding timestamps, profile completion

### Existing APIs that can be reused

- `GET/PATCH /api/journal/tracking-settings` — tracking key preferences (Section 3)
- `GET /api/journal/goals` — calorie/macro goals (Section 2, read-only; `updateUserGoals` exists server-side but has no API route)

### What needs to be created

- **New API route**: `POST /api/journal/profile` — reads and writes profile fields in `people.metadata` and `people` columns
- **New API route**: `PATCH /api/journal/goals` — exposes the existing `updateUserGoals` server function
- **New fields in `people.metadata`**: all profile fields below that don't map to existing `people` columns

### Form patterns to reuse

- `useState` per field, controlled inputs (dominant pattern)
- Input styling from `LogEntryForms.tsx`: `inputClass`, `selectClass`, `labelClass`, `btnClass`
- Button-based selectors (like Bristol scale) for single-choice fields
- Custom toggle pattern from journal log (pill-style `w-10 h-6 rounded-full`)

---

## Phase 2: Page Composition

### Layout

Same shell as all journal pages:

```
min-h-screen bg-brand-900 text-white flex flex-col
  flex-1 overflow-y-auto pb-28
    Page header (title + completion indicator)
    Section 1: Profile Basics
    Section 2: Goals & Food Preferences
    Section 3: Tracking Preferences
    Section 4: Health Context
    Section 5: Notifications
    Section 6: Summary Tile Preferences
    Section 7: Program Context
    Section 8: Profile Completion
    Section 9: Account Settings link-out
  JournalFooterNav
```

Content width: `max-w-[650px] mx-auto px-5`

### Section-card pattern

Each section renders as a **collapsed card** by default showing a title + summary of current values. Tapping the card expands it into an inline edit form. Saving collapses it back. This keeps the page compact and mobile-friendly.

```
[collapsed] Section title · summary text · pencil icon
[expanded]  Section title
            Field 1: input
            Field 2: select
            [Save] [Cancel]
```

### Field mapping and data storage

**Section 1 — Profile Basics** (required fields marked with *)


| Field          | Type   | Storage                         | Notes                                                                                              |
| -------------- | ------ | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| First name*    | text   | `people.first_name`             | Existing column                                                                                    |
| Last name      | text   | `people.last_name`              | Existing column                                                                                    |
| Date of birth* | date   | `people.metadata.date_of_birth` | ISO string `YYYY-MM-DD`                                                                            |
| Sex*           | select | `people.metadata.sex`           | `female`, `male`, `prefer_not_to_say`; note: "Used for cycle tracking and related personalization" |


**Section 2 — Goals & Food Preferences**


| Field               | Type    | Storage                               | Notes                                                                                       |
| ------------------- | ------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Primary goal*       | select  | `people.metadata.primary_goal`        | `weight_loss`, `weight_gain`, `maintenance`, `gut_health`, `energy`, `general_wellness`     |
| Dietary style*      | select  | `people.metadata.dietary_style`       | `omnivore`, `vegetarian`, `vegan`, `pescatarian`, `keto`, `paleo`, `mediterranean`, `other` |
| Eating window*      | select  | `people.metadata.eating_window`       | `16_8`, `14_10`, `open`, `custom`                                                           |
| Custom window start | time    | `people.metadata.eating_window_start` | Only when `eating_window === 'custom'`                                                      |
| Custom window end   | time    | `people.metadata.eating_window_end`   | Only when `eating_window === 'custom'`                                                      |
| Daily calorie goal  | number  | `people.metadata.dailyCalorieGoal`    | Existing field; edit via goals API                                                          |
| Macro goals         | numbers | `people.metadata.macroGoals`          | Existing field; protein/carbs/fat                                                           |


**Section 3 — Tracking Preferences**


| Field                  | Type    | Storage                                 | Notes                                                 |
| ---------------------- | ------- | --------------------------------------- | ----------------------------------------------------- |
| Enabled tracking keys* | toggles | `people.metadata.enabled_tracking_keys` | Existing; uses `PATCH /api/journal/tracking-settings` |


**Section 4 — Health Context** (all optional)


| Field                    | Type        | Storage                              | Notes                                                                                       |
| ------------------------ | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Allergies / intolerances | chip input  | `people.metadata.allergies`          | Array of strings (see interaction pattern below)                                            |
| Symptom priorities       | chip picker | `people.metadata.symptom_priorities` | Array from preset list (see interaction pattern below)                                      |
| Activity baseline        | select      | `people.metadata.activity_baseline`  | `sedentary`, `lightly_active`, `moderately_active`, `very_active`                           |
| Sleep schedule           | selects     | `people.metadata.sleep_schedule`     | `{ bedtime: string, waketime: string }`                                                     |
| Cycle tracking details   | selects     | `people.metadata.cycle_details`      | `{ avg_cycle_length: number, last_period_start: string }` — only shown when sex is `female` |


**Chip/pill interaction patterns:**

- **Allergies (free-text chips)**: A text input with an "Add" button (or Enter key). Each entry renders as a removable pill/chip (`rounded-full bg-white/[0.06] px-3 py-1 text-sm`). Tapping the X on a chip removes it. The input clears after adding. Stored as `string[]`. No preset list — the user types whatever they need (e.g. "Dairy", "Shellfish", "Nightshades").
- **Symptom priorities (preset chips)**: A horizontal flex-wrap row of all available options rendered as tappable pills. Tapping a pill toggles it on/off. Selected state: `bg-dark_accent-500/20 border border-dark_accent-500/40 text-dark_accent-300`. Unselected state: `bg-white/[0.04] border border-white/[0.06] text-white/50`. Max selection: no hard limit in V1 but visually discouraged beyond 4-5 via layout density. Preset options: `bloating`, `fatigue`, `skin`, `digestion`, `headaches`, `joint_pain`, `brain_fog`.

**Section 5 — Notifications**

This section is split into two visually distinct subsections to separate consent from behavior:

**5a — Marketing Consent** (grouped under "Marketing" subheading)


| Field                   | Type   | Storage                         | Notes                                                              |
| ----------------------- | ------ | ------------------------------- | ------------------------------------------------------------------ |
| Email marketing opt-in* | toggle | `people.email_marketing_opt_in` | Existing column; label: "Receive emails about programs and offers" |
| SMS marketing opt-in    | toggle | `people.sms_marketing_opt_in`   | Existing column; label: "Receive SMS updates"                      |


**5b — Journal Reminders** (grouped under "Reminders" subheading)


| Field                | Type   | Storage                                        | Notes                                                                              |
| -------------------- | ------ | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Daily logging nudge  | toggle | `people.metadata.notifications.daily_nudge`    | V1 stores preference only, no delivery system yet; label: "Remind me to log daily" |
| Weekly summary email | toggle | `people.metadata.notifications.weekly_summary` | V1 stores preference only; label: "Send a weekly activity summary"                 |


The subsection split makes it clear that marketing consent is about what Fine Diet sends you, while reminders are about your own journaling habits. Both save via `POST /api/journal/profile`.

**Section 6 — Summary Tile Preferences**

Intentional V1 surface — not just a note. Renders as a card with:

- Title: "Summary Tiles"
- A read-only list of currently enabled tracking categories, shown as small pills/chips (matching the enabled tracking keys from Section 3)
- Each pill shows the tracking key label (e.g. "Hydration", "Sleep", "Mood")
- Below the pills: "These match your tracking preferences. Adjust them above." with an anchor-scroll link to Section 3
- Post-V1: drag-to-reorder, show/hide individual tiles independently of tracking, custom display density

This makes the section feel like a real dashboard control surface rather than a passthrough note.

**Section 7 — Program Context**

- V1: static placeholder with warm, future-facing tone
- Text: "When you join a program, your protocol and recommendations will show up here."
- Subtitle: "Programs connect your profile to structured guidance."
- CTA: "See available programs" → `/programs`
- The copy avoids clinical "enrolled" language and instead frames programs as something the user actively joins

**Section 8 — Profile Completion**

- Computed client-side from loaded profile data
- Shows completion percentage + list of missing required fields
- Required fields for "complete enough": `first_name`, `date_of_birth`, `sex`, `primary_goal`, `dietary_style`, `eating_window`, `enabled_tracking_keys` (length > 0)
- `first_name` is included in the completion check because it is needed for personalized UI (greetings, plan labels); without it the experience feels generic
- Stores: `people.metadata.onboarding_started_at` (set on first profile save), `people.metadata.onboarding_completed_at` (set when all required fields filled)
- `profile_completion_percent` and `required_profile_fields_missing[]` are computed at render time, not stored

**Section 9 — Account Settings Link-out**

- Not a form section — just a link card
- "Account & billing" → `/account`
- Subtitle: "Email, password, subscriptions"

### New API route: `POST /api/journal/profile`

Single endpoint that reads/writes the profile subset of `people` columns + `people.metadata`:

- **GET**: returns current profile data (first_name, last_name, metadata profile fields, opt-in flags)
- **POST**: accepts partial updates, merges into `people` columns and `people.metadata`
- Auth: `requireJournalAuth` (same as tracking-settings)
- Validation: type-checks on each field, rejects unknown keys

### New API route: `PATCH /api/journal/goals`

Exposes the existing `updateUserGoals(personId, goals)` from `journalServerService.ts`.

---

## Phase 3: Implementation Plan

### Files to create

- `pages/api/journal/profile.ts` — GET/POST for profile data
- `pages/api/journal/goals.ts` — add PATCH support to existing GET-only route

### Files to replace

- `pages/journal/profile.tsx` — full V1 page (replace placeholder)

### No new files needed for

- Components: all section cards built inline (same pattern as home.tsx, plans.tsx)
- DB: no migrations; all new fields go into `people.metadata` JSONB

### Data fetching

Single `useEffect` on mount:

1. `GET /api/journal/profile` → profile basics + health context + notifications + metadata
2. `GET /api/journal/tracking-settings` → tracking keys
3. `GET /api/journal/goals` → calorie/macro goals

### Save pattern

Each section saves independently via its own submit handler:

- Section 1, 4, 5: `POST /api/journal/profile`
- Section 3: `PATCH /api/journal/tracking-settings`

**Section 2 — coordinated save across two APIs:**

Section 2 spans two API endpoints because goals (calorie/macro) go through `/api/journal/goals` while preference fields (primary goal, dietary style, eating window) go through `/api/journal/profile`. The save handler uses `Promise.allSettled` to attempt both calls concurrently. Behavior:

- **Both succeed**: collapse card, show brief success indicator
- **One fails**: show an error message naming which part failed (e.g. "Goals saved but preferences failed to update — try again"), keep the card expanded so the user can retry
- **Both fail**: show general error, keep card expanded

This avoids a partial-save silent failure where the user thinks everything saved but one half didn't persist. The UI uses a single "Save" button; the coordination is internal.

---

## Phase 4: Follow-on Tasks (post-V1)

- Onboarding flow: guided first-time walkthrough using profile completion data
- Goal-setting API route for full CRUD (currently GET-only)
- Summary tile ordering/display preferences (Section 6)
- Program context population from program data model (Section 7)
- Notification delivery system (journal reminders, plan nudges)
- Profile image upload
- Extract section-card pattern into reusable component if used on other pages

