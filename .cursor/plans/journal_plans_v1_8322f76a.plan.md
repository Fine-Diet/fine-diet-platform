---
name: Journal Plans V1
overview: Build the V1 Plans page at `/journal/plans` by replacing the current placeholder with a mobile-first, single-surface page composed of sectional modules — following existing journal page patterns, reusing journalService APIs, SummaryRowModule contracts, and shared components.
todos:
  - id: replace-plans
    content: Replace pages/journal/plans.tsx placeholder with full V1 page (layout, data fetching, all 6 modules)
    status: completed
  - id: module-1
    content: "Module 1 — Today's Structure: daily targets (cal + macros) + structured time-block framing"
    status: completed
  - id: module-2
    content: "Module 2 — Current Protocol: static placeholder card with 'Explore programs' CTA (/programs verified)"
    status: completed
  - id: module-3
    content: "Module 3 — This Week: activity-based 7-day view (read-only, not an editable planner)"
    status: completed
  - id: module-4
    content: "Module 4 — Saved Meals: up to 3 templates inline + 'View all' link to /journal/meals"
    status: completed
  - id: module-5
    content: "Module 5 — Planned vs Logged: calorie + macro progress bars with fallback defaults"
    status: completed
  - id: module-6
    content: "Module 6 — Next Step: calm coaching-tone suggestion sentence + single CTA"
    status: completed
  - id: verify
    content: Lint check + production build verification
    status: completed
isProject: false
---

# Journal Plans V1

## Phase 1: What Already Exists

### Routes and shell

- `/journal/plans` exists as a placeholder ("Coming soon") in [pages/journal/plans.tsx](pages/journal/plans.tsx)
- `JournalFooterNav` already has the "Plans" tab wired to this route
- All `/journal/*` routes are auth-gated via middleware (session + person + journal access)

### Reusable data APIs (from `journalService`)

- `listEntriesByDay(date)` — fetch entries for any day (used for Planned vs Logged)
- `listMealTemplates()` — saved meals/templates (used for Module 4)
- `getGoals()` — daily calorie goal + macro goals (used for Module 1)
- `getTrackingSettings()` — enabled tracking keys
- `listHistoryFoods()` — recently logged foods (useful for suggestions)

### Reusable components

- `JournalFooterNav` — shared bottom nav
- `GridItemApp` / `GridSectionApp` — SummaryRowModule card pattern (image + title + metrics + chevron)
- `SavedMealCard` — existing saved meal display
- `SummaryRowModule` type contract — structured card data

### Existing data structures

- `MealTemplate` — saved meals with items, calories, NDS
- `UserGoals` — `dailyCalorieGoal`, `macroGoals` (protein/carbs/fat), `isDefault`
- `JournalEntry` — all entry types with payloads
- `people.metadata` — goals, tracking keys (profile preferences)

### What does NOT exist yet

- Program/protocol data model (no program assignments, no protocol steps, no recommended tasks)
- Eating window / time-block preferences (beyond the morning/midday/evening block convention)
- Adherence scoring or plan-vs-actual comparison logic
- Weekly schedule persistence

---

## Phase 2: Page Composition

### Layout

Same pattern as `pages/journal/home.tsx`:

```
min-h-screen bg-brand-900 text-white flex flex-col
  flex-1 overflow-y-auto pb-28
    Hero (title + date + status)
    Module 1: Today's Plan
    Module 2: Current Protocol
    Module 3: Weekly Schedule
    Module 4: Saved Meals / Templates
    Module 5: Planned vs Logged
    Module 6: Adherence / Next Best Action
  JournalFooterNav
```

Content width: `max-w-[650px] mx-auto px-5`

### Module breakdown

**Module 1 — Today's Structure**

- Framing: "Today's structure and targets" — presents the day as a structured plan, not raw goal numbers
- Data source: `getGoals()` + `listEntriesByDay(today)`
- Shows: calorie target, macro targets (protein / carbs / fat), time-block framing (morning / midday / evening as structural anchors)
- The underlying data is still goals-driven, but the UI reads as "here's your day" rather than "here are your numbers"
- Empty state cause: **missing setup** — user has not configured goals yet
  - Text: "Set up your daily targets to see today's structure"
  - CTA: "Set targets" → `/journal/profile`

**Module 2 — Current Protocol / Program Guidance**

- V1: placeholder shell with calm language ("Recommended approach", "Current focus")
- No program data model exists; render a static card
- Text: "Your protocol will appear here when enrolled in a program"
- CTA: "Explore programs" → `/programs` (verified: `pages/programs.tsx` exists and renders)
- Empty state cause: **missing setup** — user is not enrolled in a program
  - This is the only valid state in V1; the module is always in its placeholder form

**Module 3 — This Week (activity view)**

- V1: read-only activity-based weekly view — not an editable planner
- Reuse `ActivityBeads` pattern from home.tsx (7-day dot row, filled if active, today highlighted)
- Below beads: "X / 7 active days" stat
- This is explicitly a reflection tool ("here's what happened"), not a scheduling tool
- No editable schedule persistence in V1; that is a post-V1 deepening
- Empty state cause: **not enough usage** — no entries in the last 7 days
  - All beads render as inactive; stat reads "0 / 7 active days"
  - No special message needed; the visual itself communicates the state calmly

**Module 4 — Saved Meals / Templates**

- Data source: `listMealTemplates()`
- Shows up to 3 templates inline with name + item count + calories
- "View all" chevron → `/journal/meals`
- Reuse compact card style from existing patterns
- Empty state cause: **not enough usage** — user has not saved any meals yet
  - Text: "Save a meal from the log page to build your rotation"
  - CTA: "Log a meal" → `/journal/log`

**Module 5 — Planned vs Logged**

- Data source: `getGoals()` + `listEntriesByDay(today)` (sum intake calories + macros)
- Shows: simple progress — "X / Y cal logged" with a thin progress bar
- Macro breakdown: protein / carbs / fat individual progress bars
- Macro fallback rules (when user has not set custom goals):
  - If `goals.isDefault === true`, use system defaults (2500 cal, 150g protein, 250g carbs, 80g fat)
  - Progress bars still render against defaults — no "set up" gate for this module
  - Subtle note below: "Based on default targets" (only when `isDefault`)
- Empty state cause: **not enough usage** — no intake entries today
  - Shows targets with 0 logged, progress bars at 0%
  - No error state; the module just shows an empty day

**Module 6 — Next Step (coaching tone)**

- V1: deterministic, calm coaching-tone suggestion
- Language style: supportive, never urgent, never guilt-inducing
- Rules:
  - No entries today → "A good time to start — even one entry helps build the picture."
  - Some entries, under 50% of calorie goal → "You're building today's picture. Keep going when you're ready."
  - 50-99% of calorie goal → "Solid progress today. One more entry rounds things out."
  - Goal met or exceeded → "You've hit your target for today. Nice work."
- Single CTA button (always present):
  - If under goal: "Log an entry" → `/journal/log`
  - If at/over goal: "Review today" → `/journal`
- No heavy analytics, no scoring, no streaks in this module

### Data contract assumptions (V1)

- Goals come from `people.metadata` via `journalService.getGoals()`
- Goals include `isDefault: boolean` — true when user has not set custom targets
- "Active day" = any entries > 0 (same as home.tsx)
- Calorie progress = sum of `intake` entry calories vs `dailyCalorieGoal`
- Macro progress = sum of intake macros vs `macroGoals`
- Macro fallback defaults (from `journalService`): 2500 cal, 150g protein, 250g carbs, 80g fat
- When `isDefault`, progress modules still render (against defaults) with a subtle "Based on default targets" note
- Program data: hardcoded placeholder; no API calls
- Weekly schedule: derived from last-7-days entries (read-only)

### Empty states — cause framework

Every module distinguishes between two causes of emptiness:

- **Missing setup** — user has not configured something (goals, program enrollment). These show a setup-oriented CTA.
  - Module 1 (Today's Structure): no custom goals set → "Set up your daily targets"
  - Module 2 (Protocol): no program enrollment → "Explore programs" (always this state in V1)
- **Not enough usage** — user has the setup but no activity yet. These show a gentle usage-oriented CTA or simply render the empty visual.
  - Module 3 (This Week): no entries in 7 days → all beads inactive, no special message
  - Module 4 (Saved Meals): no templates → "Save a meal from the log page"
  - Module 5 (Planned vs Logged): no intake today → bars at 0%, no error
  - Module 6 (Next Step): no entries today → calm coaching sentence

No module uses "Coming soon" language. No scary error UI. No guilt.

---

## Phase 3: Implementation Plan

### File changes

- **Replace** [pages/journal/plans.tsx](pages/journal/plans.tsx) — full page implementation
- **No new files** — all modules inline in one file (same pattern as home.tsx)
- **No new API routes** — reuses existing journalService methods
- **No DB changes** — reads from existing tables/metadata

### Data fetching approach

Single `useEffect` on mount (same pattern as home.tsx):

1. `journalService.getGoals()` → goals
2. `journalService.listEntriesByDay(today)` → today's entries + calorie/macro sums
3. `journalService.listMealTemplates()` → saved meals (limit display to 3)
4. Last 7 days activity (same as home.tsx) → weekly strip

All parallel via `Promise.all`, with `fetchedRef` guard against double-fetch.

### Reuse from home.tsx

- `ActivityBeads` component — extract or duplicate for weekly strip
- `DayActivity` interface and `last7Days()` / `isSameLocalDate()` / `toDateKey()` helpers
- Layout wrapper and hero pattern

### Temporary assumptions (program logic not built)

- Module 2 (Protocol) is a static placeholder card
- Module 6 (Adherence) uses simple threshold rules, not analytics
- No program-fed recommendations or tasks
- No eating window configuration (uses morning/midday/evening convention)
- Weekly schedule is read-only (no plan persistence)

---

## Phase 4: Follow-on Tasks (post-V1)

- Program data model + protocol assignment → powers Module 2
- Editable weekly schedule with persistence → deepens Module 3
- Eating window / time-block preferences in profile → refines Module 1 suggestions
- Adherence scoring engine → replaces simple threshold rules in Module 6
- Saved meals as "planned meals" (assign templates to days/blocks) → deepens Module 4
- Extract shared helpers (`ActivityBeads`, `last7Days`, etc.) into shared module

