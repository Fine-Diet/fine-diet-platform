# Journal V1 — Phase 0 + Phase 1 Implementation

End-to-end flow: **Journal Day View → Log Entry → Item Editor → Saved Meal create**. No external food providers yet (search/scan stubbed).

---

## Architecture

### Routing

This is a **hybrid App Router + Pages Router** setup:
- **App Router**: `/journal-waitlist`, `/auth/reset-password`, and API routes (`app/`)
- **Pages Router**: Main UI including `/journal`, `/journal/log`, `/journal/entry/[id]`, `/journal/meals/create`, `/login`, `/admin/*`, etc. (`pages/`)

### Host-based routing (journal.myfinediet.com)

For the journal subdomain (`journal.myfinediet.com`):

| Path | Behavior |
|------|----------|
| `/` | Gated: not authenticated → `/login?redirect=/`; no entitlement → `/journal-waitlist?redirect=/`; entitled → **rewrite** to `/journal` |
| `/journal/*` | Standard gating (same as main domain) |
| `/journal-waitlist` | Public waitlist page (App Router) |

### Gating

- **Middleware** (`middleware.ts`) gates `/journal` and `/journal/*` (excludes `/journal-waitlist`).
- Logged out → `/login?redirect=<original path + query>`
- Logged in, no person or no `journal_access` subscription → `/journal-waitlist?redirect=<original path + query>`
- Logged in with access → allow.
- Redirect targets are validated via `lib/redirectHelpers.ts` (`isSafeRedirectTarget`); only relative paths starting with `/` are accepted.

### Types and data layer

- **`lib/journal/types.ts`**
  - `TimeBlock`: `'morning' | 'midday' | 'evening'`
  - `deriveBlock(timestamp)`: morning 04:00–11:59, midday 12:00–16:59, evening 17:00–03:59
  - `TIME_BLOCK_DEFAULTS`: 08:00 / 12:00 / 18:00
  - `JournalEntry`, `JournalEntryPayload`, `MealTemplate`, `MealTemplateItem`
  - Helpers: `toDateKey(date)`, `setTimeOnDate(date, timeStr)`, `formatTime(date)`

- **`lib/journal/journalService.ts`**
  - In-memory store per user (Phase 1 uses `localStorage` key `journal_dev_user_id` or fallback `dev-user`).
  - `createEntry()`, `updateEntry()`, `deleteEntry()`, `getEntry()`
  - `listEntriesByDay(date)`, `listEntriesByDayAndBlock(date, block)`
  - `createMealTemplateFromEntries(entries, name)`, `listMealTemplates()`, `getMealTemplate(id)`
  - Swappable later for API/DB.

### Routes and UI

| Route | Purpose |
|-------|---------|
| `/journal` | Day view: header (Today + prev/next), Nutrition Density placeholder, Morning/Midday/Evening blocks. Add/Edit → `/journal/log?type=intake&block=&time=&date=&redirect=` |
| `/journal/log` | Log Entry: Food/Drinks (active), Water (disabled), search + Scan stub, “Quick add demo item”, logged list → Item Editor, “Create meal from logged” → `/journal/meals/create` |
| `/journal/entry/[id]` | Item Editor: quantity, unit, time, delete. Autosave on change; delete returns to `redirect`. |
| `/journal/meals/create` | Create saved meal: name, list of current day+block entries (checkboxes to remove), Save → redirect with `?meal_created=1`; Journal/Log show “Meal saved.” when that param is present. |

### File paths changed/added

| Path | Role |
|------|------|
| `lib/journal/types.ts` | TimeBlock, deriveBlock, JournalEntry, MealTemplate, date/time helpers |
| `lib/journal/journalService.ts` | In-memory CRUD and template APIs |
| `lib/journal/index.ts` | Re-exports types + journalService |
| `components/journal/JournalBlockSection.tsx` | Collapsible Morning/Midday/Evening block, empty/summary, Add/Edit → log URL |
| `pages/journal.tsx` | Day view using JournalDateSelector + blocks + meal_created banner |
| `pages/journal/log.tsx` | Log surface: segments, search, quick add, logged list, create-meal CTA |
| `pages/journal/entry/[id].tsx` | Item editor: quantity, unit, time, delete, autosave |
| `pages/journal/meals/create.tsx` | Create meal from day+block entries, redirect + confirmation |

Existing and reused:

- `middleware.ts` — journal gating and redirect safety (unchanged)
- `lib/redirectHelpers.ts` — `getSafeRedirectTarget` / `isSafeRedirectTarget`
- `components/journal/JournalDateSelector.tsx`, `JournalFooterNav.tsx` — Day view chrome

---

## QA Checklist

### Gating redirects

- [ ] **Logged out** → Visit `/journal` or `/journal/log?block=morning` → Redirect to `/login?redirect=...` with original path+query.
- [ ] **Logged in, no journal access** → Same URLs → Redirect to `/journal-waitlist?redirect=...`.
- [ ] **Logged in, with access** → Same URLs → Page loads (no redirect).

### URL and navigation

- [ ] **Back/forward** — From Journal → Log → back returns to Journal; from Log → Entry → back returns to Log. Browser back/forward matches stack.
- [ ] **Log URL** — `/journal/log?type=intake&block=morning&time=08:00&date=YYYY-MM-DD&redirect=/journal` is a real, bookmarkable URL.

### Autosave and flows

- [ ] **Quick add** — On Log, “Quick add demo item” adds an intake entry immediately; “Saved” appears briefly; no Save/Cancel.
- [ ] **Item editor** — Change quantity/unit/time; “Saved” appears; no explicit Save. Delete returns to redirect target (Log or Journal).
- [ ] **Time change re-slots block** — In Item Editor, change time so it falls in another block (e.g. morning → midday). Return to Journal Day View; entry appears in the new block only.

### Saved meal

- [ ] **Create from logged** — From Log with items, “Create meal from logged” → name + optional removals → Save → redirect to Journal (or Log if that was the redirect) with “Meal saved.” and `?meal_created=1` then stripped from URL.
- [ ] **Confirmation** — Journal and Log show “Meal saved.” when opened with `?meal_created=1`.

### Stubs / placeholders

- Scan button on Log does nothing (or opens placeholder).
- Water segment is disabled.
- Nutrition Density on Day View is display-only placeholder.
- Macro chips on blocks are placeholder (P/C/F —).
- No Favorites/History; no real food-provider search.

---

## Flow summary

1. **Journal** → pick day → open block (Morning/Midday/Evening) → Add/Edit → **Log**.
2. **Log** → “Quick add demo item” or (later) search → entry appears in “Logged” → tap row → **Item Editor**.
3. **Item Editor** → edit quantity/unit/time or delete → autosave or delete then return to Log/Journal.
4. **Log** → “Create meal from logged” → **Create meal** → name, toggle items → Save → return to Journal/Log with “Meal saved.”.

All journal routes are gated; redirects use safe relative targets only.
