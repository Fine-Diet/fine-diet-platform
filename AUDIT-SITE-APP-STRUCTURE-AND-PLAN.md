# Fine Diet — Site/App Setup Audit & Pared-Down Implementation Plan

**Scope:** Discovery + plan only. No code changes.  
**Excluded from plan:** Log Entry UX, Units & Conversions, Validation/Rules.

---

## 1) Repo map (high-level)

### Framework and routing
- **Next.js 14.2** (Pages Router primary). Single app; no separate “site” vs “journal” codebases.
- **Pages Router** (`/pages`): almost all routes — home, category pages, journal, login, admin, account/assessments, gut-check, results, etc.
- **App Router** (`/app`): used only for a few routes:
  - `app/journal-waitlist/page.tsx` — journal waitlist (gate for unentitled users)
  - `app/auth/reset-password/page.tsx` — password reset
  - `app/api/*` — API routes under app (e.g. `app/api/account/link-person/route.ts`, `app/api/people/newsletter/route.ts`, `app/api/waitlist/route.ts`)
- **Middleware** (`middleware.ts`): host-based routing (journal subdomain → rewrite to `/journal`), journal gating (auth + entitlement), admin role protection. Does not run for `/api`, `_next/static`, etc.

### Directory map
| Path | Purpose |
|------|---------|
| `pages/` | Pages Router: index, [category], journal, journal/log, journal/entry/[id], journal/meals/*, login, account/assessments, gut-check, results/[submissionId], admin/*, dev/* |
| `app/` | App Router: journal-waitlist, auth/reset-password, app/api/* (account, people, waitlist) |
| `components/` | UI: nav, footer, home, category, journal, account, assessments, admin, d3, seo, ui |
| `lib/` | Business logic: journal, food, auth, nds, assessments, contentApi, config, access, redirectHelpers, etc. |
| `pages/api/` | API routes (journal, assessments, admin, account, config, debug, outbox, results-packs, question-sets, revalidate) |
| `data/` | Static JSON: navigation.json, homeContent.json, footerContent.json |
| `styles/` | globals.css, theme.ts |
| `scripts/` | SQL migrations, USDA ingest, backfill, dev/setup scripts |

### Routing structure (major groups)
- **Public site:** `/` (home), `/[category]` (e.g. `/the-fine-diet-method`, `/integrative-care`, `/resources`). Nav from `data/navigation.json`; layout: `NavBar` + `Footer` in `_app.tsx`.
- **Journal app:** `/journal`, `/journal/log`, `/journal/entry/[id]`, `/journal/day`, `/journal/meals`, `/journal/meals/create`, `/journal/meals/edit/[id]`. No global header/footer; uses `JournalFooterNav` and block-based UI. **Gated:** middleware requires auth + journal entitlement; else redirect to `/login` or `/journal-waitlist`.
- **Auth/account:** `/login` (standalone), Account drawer (no `/account` page — see below). `/account/assessments` exists (protected by getServerSideProps).
- **Assessments:** `/gut-check`, `/gut-pattern-breakdown`, `/results/[submissionId]`. No nav bar; assessment flow only.
- **Admin:** `/admin/*` (dashboard, site-settings, assessments, foods, offers, entitlements, people, etc.). Uses `AdminLayout`; role check in middleware.

**Navigation ownership:** Public: `NavBar` (DesktopNav, MobileNav, NavDrawer, AccountDrawer). Journal: `JournalFooterNav` (Home, Insights, Journal, Programs, Profile — **tabs only; no route changes**, see §3).

---

## 2) Page inventory (table)

| Route path | Source file | Purpose/summary | Key components | Auth | Where to add new pages |
|------------|-------------|-----------------|----------------|------|-------------------------|
| `/` | `pages/index.tsx` | Marketing home: hero, feature sections, grid from content | HeroSection, FeatureSection, GridSection, CTASection, SeoHead | Public | Add sections in content or new sections in index; category content via `[category]`. |
| `/[category]` | `pages/[category]/index.tsx` | Category page (Program, Integrative Care, Resources). Paths from `navigation.categories` (e.g. `the-fine-diet-method`, `integrative-care`, `resources`) | CategoryPageShell, CategoryHeroBand, CategoryGrid, CTASection, SeoHead | Public | Add category in `data/navigation.json`; paths from getStaticPaths. |
| `/journal` | `pages/journal.tsx` | **Journal home (day view):** date picker, NDS gauge, morning/midday/evening blocks, daily calorie bar | JournalFooterNav, JournalHeroSection, JournalBlockSection, NDSDisplay | Protected (journal) | N/A. Summary enhancements go here or in a child. |
| `/journal/day` | `pages/journal/day.tsx` | Re-export of `journal.tsx` (alias) | Same as `/journal` | Protected (journal) | N/A |
| `/journal/log` | `pages/journal/log.tsx` | Log entry: add food/water/etc., search, favorites, history, saved meals, block/date in URL | LoggedItemCard, SavedMealCard, AddItemsPanel, getSafeRedirectTarget | Protected (journal) | Do not plan log-entry UX work (per scope). |
| `/journal/entry/[id]` | `pages/journal/entry/[id].tsx` | Edit single journal entry (quantity, unit, time) | getValidUnits, convertBetweenUnits, formatFoodNameString | Protected (journal) | N/A |
| `/journal/meals` | `pages/journal/meals/index.tsx` | List saved meals (templates) | getSafeRedirectTarget | Protected (journal) | N/A |
| `/journal/meals/create` | `pages/journal/meals/create.tsx` | Create meal from current log selection | getSafeRedirectTarget | Protected (journal) | N/A |
| `/journal/meals/edit/[id]` | `pages/journal/meals/edit/[id].tsx` | Edit saved meal | getSafeRedirectTarget | Protected (journal) | N/A |
| `/login` | `pages/login.tsx` | Email/password login; redirect via `?redirect=`; default fallback **`/`** | Button, getSafeRedirectTarget | Public | Change default redirect in `getSafeRedirectTarget(..., '/')` if new landing route added. |
| **(no /account page)** | — | **Account is a drawer only.** Nav “Account” opens `AccountDrawer`; inside it `AccountView` shows “Quick Links” (My assessments, My programs, My journal, My orders). No `pages/account/index.tsx` — **`/account` would 404.** | AccountDrawer (NavBar), AccountView | Shown when logged in (drawer) | Add `pages/account/index.tsx` to make `/account` a real page (e.g. User Landing). |
| `/account/assessments` | `pages/account/assessments.tsx` | List user’s assessment submissions; links to results | getCurrentUserWithRoleFromSSR, Link | Protected (SSR redirect to login) | Add sibling pages under `pages/account/` (e.g. programs, orders) or keep as drawer targets. |
| `/programs` | **Does not exist** | — | — | — | **Create placeholder.** Quick Links and footer reference `/programs/*`; category pages use `/the-fine-diet-method` etc. |
| `/orders` | **Does not exist** | — | — | — | **Create placeholder.** Quick Links point to `/orders`. |
| `/store` | **Does not exist** | — | — | — | Optional; plan says “Orders (may become Store)”. |
| `/gut-check` | `pages/gut-check.tsx` | Gut Check assessment entry; version from `?v=` | AssessmentRoot, resolveQuestionSet, getAssessmentConfig | Public (assessment flow) | N/A |
| `/gut-pattern-breakdown` | `pages/gut-pattern-breakdown.tsx` | Assessment-related breakdown view | — | Public | N/A |
| `/results/[submissionId]` | `pages/results/[submissionId].tsx` | Assessment result for a submission | — | Public (or gated by result token) | N/A |
| `/journal-waitlist` | `app/journal-waitlist/page.tsx` | Waitlist for users without journal access (after login) | WaitlistForm | Protected (auth only) | N/A |
| `/admin` | `pages/admin/index.tsx` | Admin dashboard (cards to site-settings, assessments, foods, etc.) | AdminLayout | Protected (editor/admin) | Add admin cards or new admin pages under `pages/admin/`. |
| `/admin/*` | `pages/admin/*.tsx` | Many admin pages (site-settings, assessments, foods, offers, entitlements, people, etc.) | AdminLayout | Protected (role) | Same pattern. |

**Pattern for new site pages:** Add under `pages/` (e.g. `pages/programs.tsx`, `pages/orders.tsx`). Use same layout as public site (NavBar + Footer) unless you explicitly use a different layout in `_app.tsx`. For “app” pages under journal, add under `pages/journal/` and respect middleware gating.

---

## 3) Navigation + login redirect flow

### Login redirect (exact behavior)
- **File:** `pages/login.tsx`
- **Logic:** After successful sign-in, `redirectTo = getSafeRedirectTarget(rawRedirect, '/')` — so **default is `'/'`** (marketing home). Then `router.push(redirectTo)`.
- **Source of truth:** `lib/redirectHelpers.ts`: `getSafeRedirectTarget(value, fallback)` — only allows relative paths starting with `/`.

### Journal subdomain
- **Middleware** (`middleware.ts`): For `journal.myfinediet.com` with path `/`, if user is authenticated and has journal access, **rewrite** to `/journal` (no redirect). So “post-login” on subdomain is effectively `/journal` as the first view.

### Main-domain post-login
- If user hits `/login` on main domain with no `?redirect=`, they land on **`/`** (marketing home). There is **no dedicated “User Landing Page”**; the closest is the **Account drawer** (Quick Links) when they click “Account” in the nav.

### Nav structure
- **Public site:** `NavBar` (`components/nav/NavBar.tsx`): DesktopNav + MobileNav; category dropdowns from `navigation.categories`; top links from `navigation.topLinks` (Journal → journal.myfinediet.com, Account → opens AccountDrawer). **No “Quick Links” in the header** — Quick Links are **inside AccountDrawer** in `AccountView` (`components/account/AccountView.tsx`).
- **Journal app:** `JournalFooterNav` (`components/journal/JournalFooterNav.tsx`): fixed bottom pill nav with Home, Insights, Journal, Programs, Profile. **Currently these only call `onTabChange(tabId)`** — they **do not navigate**. `pages/journal.tsx` keeps `activeTab` state but does not route; all tabs show the same journal day view. So “Home” / “Programs” / “Profile” in the app are **placeholders** (no routes).

### Recommendation (post-login landing + wiring)
- **Option A (minimal):** Keep login default `'/'`. Add a **User Landing Page** at e.g. `/home` or `/dashboard` that shows: programs, journal highlights, assessments, product summaries/offers. Then set login default to that route (e.g. `getSafeRedirectTarget(rawRedirect, '/home')`) for authenticated users who came from a “app” context (could be inferred or always use `/home` when no redirect).
- **Option B (journal-first):** For users with journal access, default post-login to `/journal` (e.g. `getSafeRedirectTarget(rawRedirect, '/journal')`) so they land in the app; keep `/` for marketing. Then “User Landing” could be the **journal home** (`/journal`) with a future “Home” tab that becomes a summary/hub.
- **Wire Journal footer:** Either (1) make Home/Insights/Programs/Profile **navigate** to real routes (e.g. `/journal` for Home, `/journal/insights`, `/programs`, `/profile` or account), or (2) keep journal as single-page and use tabs only after those routes exist. Recommendation: add placeholder routes first, then in `JournalFooterNav` or a wrapper, map tab id to `router.push('/journal' | '/programs' | …)`.

---

## 4) Proposed implementation plan (pared down)

### A) Site placeholder pages + structure
- **User Landing Page (post-login hub)**  
  - **Create** a dedicated page, e.g. `pages/home.tsx` or `pages/dashboard.tsx`, with sections: programs (active first + suggestions), journal highlights (link/card to journal), assessments/reflections (link to `/account/assessments`), product summaries, product offers.  
  - **Auth:** Protect with getServerSideProps (redirect to login if no user).  
  - **Optional:** Set login default redirect to this route when no `?redirect=` (see §3).  
  - **File:** e.g. `pages/home.tsx` (or `pages/dashboard.tsx`). Use same layout as public site (NavBar + Footer) or a minimal “app” shell; recommend reusing NavBar + Footer for consistency.

- **Programs page**  
  - **Create** `pages/programs.tsx` as placeholder: “My programs” — show active program first, suggest useful programs, always access to results. Stub sections; link “Start journal” to `/journal` and “Assessments” to `/account/assessments`.  
  - **Auth:** Protected (require auth; optional: require journal or program entitlement).  
  - **Navigation:** Quick Links “My programs” already points to `/programs`; Journal footer “Programs” can route here.

- **Assessments page**  
  - **Current state:** `/account/assessments` exists and lists submissions. No single “Assessments” landing that combines “take new” + “my results”.  
  - **Action:** Confirm with product: either keep `/account/assessments` as the only assessments page and add a “Take assessment” CTA that goes to `/gut-check`, or add `pages/assessments.tsx` (or `pages/account/assessments.tsx` as the only one) with two sections: “Take an assessment” (link to gut-check) and “My assessments” (current list). **Recommend:** Keep existing `/account/assessments`; add optional `pages/assessments.tsx` as a redirect or thin wrapper to `/account/assessments` if you want a shorter URL. No new layout work in plan.

- **Orders page (may become Store)**  
  - **Create** `pages/orders.tsx` (or `pages/store.tsx`) as placeholder: home for products, purchasing system, purchase history. Stub sections.  
  - **Auth:** Protected.  
  - **Navigation:** Quick Links “My orders” already points to `/orders`. Later rename to `/store` if desired; update Quick Links and any footer links.

- **Optional: `/account` page**  
  - **Create** `pages/account/index.tsx` that renders the same content as **AccountView** (Quick Links + logout) so that “Account” in the nav can either open the drawer or link to `/account`. Reduces 404 when users or external links hit `/account`.

**Minimal placeholder content:** Each placeholder page: title (h1), 2–4 stub sections (e.g. “Programs”, “Journal”, “Assessments”, “Orders”) with short copy and primary CTA links (e.g. to `/journal`, `/account/assessments`, `/gut-check`). No complex logic.

---

### B) App (/journal) items to keep
- **Journal Summary (on journal home)**  
  - **Where:** `pages/journal.tsx` and `components/journal/JournalHeroSection.tsx` (and any block/summary components).  
  - **Add:** Item time slot in block UI (if not already present), macro day totals (protein/carbs/fat for the day), compare eating windows (e.g. first/last intake time), density insights (leverage NDS/NDSDisplay), edit-from-summary (e.g. link/button from summary to edit entry or open log).  
  - **Reference:** Daily totals already from `calculateDailyTotals(entries)` in `journal.tsx` (`lib/journal/types.ts`); NDS from `useNDS` and `NDSDisplay`. Add macro totals to hero or a small summary strip; add time-range/earliest-latest; add “Edit” from block section to `/journal/entry/[id]` or log.

- **Search quality (log page)**  
  - **Where:** `pages/journal/log.tsx` (calls `foodService.search`); backend `lib/food/foodServerService.ts` (search ranking, scoring).  
  - **Add:** Rank complete items higher (e.g. in `foodServerService` scoring: boost when nutrient data present or `is_verified`); add typo tolerance (e.g. fuzzy match or edit-distance in search); fix serving defaults and define default unit (in log flow or food display — **do not** change unit conversion logic per scope).  
  - **Defer:** Deeper “validation/rules” work.

---

### C) Goals & settings placement rule
- **Implement as:**  
  - **Settings section on the Home page of the app** — i.e. on the **journal home** (`/journal`) or on the new **User Landing** if that becomes the app “home” (e.g. a “Goals & Settings” card/section that links to a settings view or inline form).  
  - **Profile-triggered settings** — from the Journal footer “Profile” (or from Account drawer): link or route to a **settings page** (e.g. `/journal/settings` or `/account/settings`) for goals and preferences.  
- **Do not** put goals/settings on log-entry pages (e.g. not on `/journal/log` or `/journal/entry/[id]`).

**Concrete:**  
- Add a “Goals & Settings” section or link on `/journal` (e.g. in hero area or below blocks) → links to `/journal/settings` (or `/account/settings`).  
- Add `pages/journal/settings.tsx` (or `pages/account/settings.tsx`) with goals (calorie, macros) and any app settings.  
- In `JournalFooterNav`, when “Profile” is clicked, navigate to `/journal/settings` (or open a profile/settings drawer that contains the same content).  
- Keep **Account drawer** “Quick Links” as-is; optionally add “Goals & settings” link there that goes to the same settings page.

---

## 5) Checklist (grouped)

### Site placeholder pages
- [ ] Create User Landing Page (e.g. `pages/home.tsx`): sections for programs, journal highlights, assessments, product summaries/offers; protected.
- [ ] Create Programs placeholder (`pages/programs.tsx`): active program first, suggestions, access to results; protected.
- [ ] Confirm Assessments: keep `/account/assessments`; add optional `pages/assessments.tsx` redirect or wrapper if desired.
- [ ] Create Orders placeholder (`pages/orders.tsx` or `pages/store.tsx`): products, purchasing, purchase history stubs; protected.
- [ ] Optional: Create `pages/account/index.tsx` so `/account` resolves (content = AccountView Quick Links + logout).
- [ ] Optional: Set login default redirect to User Landing when no `?redirect=`.

### App /journal summary
- [ ] Add item time slot in journal block/summary UI (if missing).
- [ ] Show macro day totals (P/C/F) on journal home (e.g. in JournalHeroSection or summary strip).
- [ ] Add eating window comparison (e.g. first/last intake time).
- [ ] Add density insights (use NDS; may already be present via NDSDisplay).
- [ ] Add edit-from-summary (e.g. link/button to `/journal/entry/[id]` or log).

### Search quality
- [ ] Rank complete/verified items higher in `lib/food/foodServerService.ts` search scoring.
- [ ] Add typo tolerance (fuzzy/edit-distance) in search.
- [ ] Fix serving defaults and define default unit for log/search display (no unit conversion changes).

### Goals & settings placement
- [ ] Add Goals & Settings section or link on journal home (`/journal`) → target settings page.
- [ ] Create settings page: `pages/journal/settings.tsx` (or `pages/account/settings.tsx`) with goals + app settings.
- [ ] Wire Journal footer “Profile” to settings (navigate to settings page or open profile/settings drawer).
- [ ] Optional: Add “Goals & settings” to Account drawer Quick Links pointing to same settings page.
- [ ] Ensure no goals/settings UI on log or entry pages.

---

**Document version:** 1.0 — audit and plan only; no implementation in this pass.
