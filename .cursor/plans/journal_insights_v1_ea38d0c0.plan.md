---
name: Journal Insights V1
overview: Build the V1 Insights page at `/journal/insights` by replacing the current placeholder with a mobile-first, calm learning surface that turns tracked journal behavior into soft-confidence observations across daily, 7-day, and 14-day rolling windows. No new API endpoints or DB changes — all computation happens client-side from existing data sources.
todos:
  - id: page-layout
    content: Replace insights placeholder with full V1 page layout + time window selector + data fetching (daily/7-day/14-day)
    status: pending
  - id: modules-1-7
    content: Module 1 (Top Takeaways) + Module 7 (Confidence note) — always-visible bookends
    status: pending
  - id: modules-2-3
    content: Module 2 (Progress Narrative) + Module 3 (Patterns) — text-based observation modules
    status: pending
  - id: modules-4-5
    content: Module 4 (Plan-Based Insights) + Module 5 (Success Practices) — goal-linked + streak modules
    status: pending
  - id: module-6
    content: Module 6 (Try This Next) — actionable coaching CTA
    status: pending
  - id: verify
    content: Lint check + production build verification
    status: pending
isProject: false
---

# Journal Insights V1

## Phase 1: What Already Exists

### Route and shell

- `/journal/insights` exists as a placeholder ("Coming soon") in [pages/journal/insights.tsx](pages/journal/insights.tsx)
- `JournalFooterNav` has the "Insights" tab wired to this route
- All `/journal/*` routes are auth-gated via middleware

### Data sources available (no new APIs needed)

- `journalService.listEntriesByDay(date)` — entries for a single day (call N times for multi-day)
- `journalService.getGoals()` — `UserGoals` with `dailyCalorieGoal`, `macroGoals`, `isDefault`
- `journalService.getTrackingSettings()` — `enabled_tracking_keys`
- `calculateDailyTotals(entries)` — calories + macros from intake entries
- NDS: `useNDS({ dateLocal })` — per-day NDS score (0-100) + 7 subscores; single-day only
- Profile data: `GET /api/journal/profile` — profile preferences (dietary style, eating window, primary goal)

### Reusable patterns

- **Home page analytics** (in `home.tsx`): `DayActivity`, `last7Days()`, `computeCheckinStreak`, `computeCompleteDayStreak`, `compute3DayMomentum`, `compute7DayDirection`, `ActivityBeads`, `relativeTimeSince`
- **Plans page layout**: `SectionHeader`, card pattern (`rounded-2xl bg-white/[0.04] p-5`), `max-w-[650px] mx-auto px-5`
- **D3 chart**: `TrendLineChart` component accepting `TrendPoint[]` (date, value) — available for trend visualization
- **Type system**: `SummaryRowModule` from `lib/summaryRowTypes.ts` for consistent module contracts

### What does NOT exist (V1 constraints)

- No multi-day entries API (must call `listEntriesByDay` per day)
- No multi-day NDS aggregation API
- No correlation engine or pattern detection backend
- No plan-adherence scoring system

---

## Phase 2: Page Composition

### Layout

Same shell as all journal pages:

```
min-h-screen bg-brand-900 text-white flex flex-col
  flex-1 overflow-y-auto pb-28
    Page header (title + time window selector)
    Module 1: Top Takeaways
    Module 2: Progress Narrative
    Module 3: Patterns
    Module 4: Plan-Based Insights
    Module 5: Success Practices
    Module 6: Try This Next
    Module 7: Confidence / Readiness Note
  JournalFooterNav
```

Content width: `max-w-[650px] mx-auto px-5`

### Time window selector

A horizontal pill row at the top (below title):

- **Daily** (default) | **7 days** | **14 days**
- Pill style: `rounded-full px-4 py-1.5 text-sm`; active: `bg-white/[0.08] text-white`; inactive: `text-white/40`
- Changing the window re-fetches data and recomputes all modules

### Data fetching strategy

Single `useEffect` on mount + window change:

1. Fetch entries for each day in the window (1, 7, or 14 calls to `listEntriesByDay`)
2. Fetch goals once: `journalService.getGoals()`
3. Fetch profile once: `GET /api/journal/profile` (for dietary style, primary goal context)
4. Fetch NDS for today (daily window only): `useNDS({ dateLocal })`
5. All fetches use `Promise.allSettled` for resilience

Derived from fetched entries:

- `dayActivities: DayActivity[]` — per-day entry count + active flag
- `allEntries: JournalEntry[]` — flattened for type-specific aggregation
- `dailyTotals: DailyTotals` per day — calories + macros
- Activity streaks, momentum, direction (reuse home.tsx helpers)

### Insight readiness model

Each module checks a readiness condition before rendering content. If not ready, it shows a specific empty state.

**Readiness tiers:**

- **No data**: 0 entries in window → "Start logging to see insights" (cause: not enough usage)
- **Minimal data**: 1-2 days with entries → show what's available with "Early observation" badge
- **Sufficient data**: 3+ days with entries → full insight rendering
- **Rich data**: 5+ days → all modules populated, confidence = "Observed" or "Likely"

### Confidence labels

Applied per-insight, not per-page:

- **Observed**: direct computation from data (e.g., "You logged 5 of 7 days")
- **Likely**: derived pattern that requires interpretation (e.g., "Your mood tends to be higher on days you log movement")
- **Try this next**: actionable suggestion based on observed gaps

---

## Module specifications

### Module 1 — Top Takeaways (always visible)

3 bullet-style takeaways, computed from available data. Rules (in priority order):

1. **Consistency**: "You logged X of Y days" (Observed)
2. **Calorie adherence**: If goals set and not default — "Averaging N cal/day vs M goal" (Observed)
3. **Best category**: Most-logged non-intake type — "You tracked [type] most consistently" (Observed)
4. **NDS highlight** (daily only): If NDS available — "Nutrition density score: N/100" (Observed)

Show max 3. If fewer than 2 available, show a warm "Keep logging to build your picture" prompt.

**Empty state** (cause: not enough usage): "Log a few days of activity and your top takeaways will appear here."

### Module 2 — Progress Narrative (text block)

A 1-2 sentence summary in calm, descriptive tone. Assembled from template rules:

- **Daily**: "Today you logged {N} entries. {calorie sentence if intake exists}. {NDS sentence if available}."
- **7-day**: "Over the past week you were active {X} of 7 days. {momentum sentence}. {calorie trend if enough data}."
- **14-day**: "Over the past two weeks you were active {X} of 14 days. {direction sentence}. {consistency note}."

If no entries: "Nothing logged yet for this period. Start with a quick entry to build your narrative."

**Empty state** (cause: not enough usage): "Your progress story builds as you log. Even one entry a day adds up."

### Module 3 — Patterns

Up to 3 pattern observations. V1 patterns (lightweight, no ML):

1. **Time-of-day pattern**: Which time block (morning/midday/evening) has the most entries — "Most of your logging happens in the {block}" (Observed)
2. **Active day pattern**: Which days of the week are most active — "You tend to log more on {weekday names}" (Likely, needs 7+ days)
3. **Entry type distribution**: Breakdown of entry types logged — "Your top tracked categories: {type1}, {type2}, {type3}" (Observed)

Each pattern shows a confidence badge (Observed / Likely).

**Empty state** (cause: not enough usage, needs 3+ active days): "Patterns emerge after a few days of consistent logging."

### Module 4 — Plan-Based Insights

Compares actual logged behavior against user goals/profile preferences:

1. **Calorie tracking**: If custom goals set — progress bar + "X% of calorie goal on average" (Observed)
2. **Macro balance**: If macro goals set — "Protein averaging N g/day vs M g goal" (Observed)
3. **Eating window adherence**: If eating window set in profile — "Most entries logged between {time} and {time}" (Likely)

**Empty state** (cause: missing setup): "Set your goals and preferences in Profile to unlock plan-based insights." CTA: "Go to Profile" -> `/journal/profile`

If goals exist but no intake logged: "Log some meals to see how your intake compares to your targets." (cause: not enough usage)

### Module 5 — Success Practices

Identifies what's working. V1 rules:

1. **Best streak**: If check-in streak >= 2 — "Your current logging streak is {N} days" (Observed)
2. **Complete day rate**: If any days with 2+ entries — "{N} days with multiple log types" (Observed)
3. **Consistency improvement**: If 7-day direction = "Improving" — "Your consistency is trending up" (Observed)

**Empty state** (cause: not enough usage, needs 3+ active days): "A few more days of logging and we can highlight what's working for you."

### Module 6 — Try This Next

One actionable, calm suggestion. Priority rules:

1. If no entries today: "Start with a quick log — even one entry counts." CTA: "Log now" -> `/journal/log`
2. If only intake logged: "Try tracking another category like hydration or mood for a fuller picture." CTA: "Log water" -> `/journal/log?type=water`
3. If streak is building: "Keep your {N}-day streak going with a check-in today." CTA: "Log now" -> `/journal/log`
4. If goals not set: "Setting personalized goals helps us shape better insights for you." CTA: "Set goals" -> `/journal/profile`
5. Fallback: "Consistency beats perfection. One entry today keeps your data building." CTA: "Log now" -> `/journal/log`

Tone: coaching, never clinical. No "you should" — use "try" or "consider".

**Empty state**: This module always shows something (it's the fallback CTA).

### Module 7 — Confidence / Readiness Note

Static footer note that adjusts based on data density:

- **Sparse** (< 3 active days): "These insights are based on limited data. The more you log, the more accurate they become."
- **Moderate** (3-6 active days): "Based on early observations. Keep logging for stronger patterns."
- **Strong** (7+ active days): "Based on {N} days of tracked activity."

Always present, subtle styling (`text-white/30 text-xs`).

---

## Phase 3: Implementation Plan

### Files to modify

- `pages/journal/insights.tsx` — replace placeholder with full V1 page

### No new files needed

- No new API routes (all data from existing endpoints)
- No new components (all modules built inline, same as plans.tsx and home.tsx)
- No DB changes

### Data helpers to reuse (copy from home.tsx)

- `DayActivity` interface
- `last7Days()` (extend to `lastNDays(n)`)
- `isSameLocalDate()`
- `computeCheckinStreak()`
- `computeCompleteDayStreak()`
- `compute3DayMomentum()`
- `compute7DayDirection()`

### Build order

1. Page layout + time window selector + data fetching
2. Module 1 (Top Takeaways) + Module 7 (Confidence note)
3. Module 2 (Progress Narrative) + Module 3 (Patterns)
4. Module 4 (Plan-Based Insights) + Module 5 (Success Practices)
5. Module 6 (Try This Next)
6. Lint check + production build verification

---

## Phase 4: Follow-on Tasks (post-V1)

- Multi-day entries API for efficient range queries
- Multi-day NDS aggregation (7/14-day average)
- Cross-type correlation detection (e.g., mood vs. movement)
- Trend micro-charts (using existing TrendLineChart component)
- Plan adherence scoring engine
- Insight caching to avoid recomputation on every visit
- Profile-linked dietary pattern analysis
- Time-series NDS trend visualization

