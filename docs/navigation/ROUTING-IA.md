# Routing & Information Architecture

Short reference for route layout and the signed-in app shell boundary. For access control and gating, see [Journal Gating](../../JOURNAL-GATING.md).

## Layout model

- **Public site:** `/`, `/[category]`, `/login`, `/account`, `/account/assessments`, `/programs`, `/shop`, `/gut-check`, `/results/[submissionId]`, etc. Use global NavBar + Footer (`_app.tsx`).
- **Signed-in app shell:** `/app` and `/app/*` are the canonical signed-in app namespace. These routes use the dark app layout and `JournalFooterNav` (no global NavBar/Footer). Gated by middleware with the same auth + journal entitlement behavior as legacy journal routes.
- **Legacy compatibility:** `/journal` and `/journal/*` remain functional for existing users, bookmarks, emails, and the journal subdomain. Straightforward legacy routes redirect to canonical `/app/*` destinations after access checks pass.

## Footer tab routes (app shell)

| Tab     | Route              |
|---------|--------------------|
| Home    | `/app`             |
| Programs| `/app/programs`    |
| Plans   | `/app/plans`       |
| Journal | `/app/log`         |

Source of truth in code: `components/journal/JournalFooterNav.tsx` → `ROUTE_MAP`.

Insights is not a primary MVP app tab or standalone `/app` hub. Insight cards, trends, NDS patterns, readiness notes, reflection prompts, and recommendations should appear contextually inside Home, Programs, Plans, and Journal/Log.

## Account drawer quick links

- My assessments → `/account/assessments`
- My programs → `/app/programs` for signed-in management; `/programs` remains public marketing/commerce.
- My journal → `/app/log`
- Shop → `/shop`
- Below divider: Account → `/account`; Log out.

## Canonical app route map

| Surface | Canonical route |
|---------|-----------------|
| Home | `/app` |
| Programs management | `/app/programs` |
| Plans workbench | `/app/plans` |
| Today's plan alias | `/app/plans/today` |
| Plan day | `/app/plans/day/[date]` |
| Grocery readiness | `/app/plans/grocery/[planId]` |
| Recipe/import flows | `/app/plans/imports/*` |
| Daily Log / Journal truth surface | `/app/log` |
| New log entry | `/app/log/new` |
| Logged entry detail | `/app/log/entry/[id]` |
| Profile | `/app/profile` |
| Settings compatibility | `/app/settings` |

## Legacy compatibility map

| Legacy route | Canonical route |
|--------------|-----------------|
| `/journal/home` | `/app` |
| `/journal/insights` | `/app/programs` |
| `/journal/programs` | `/app/programs` |
| `/journal/programs/[slug]` | `/app/programs/[slug]` |
| `/journal/plans` | `/app/plans` |
| `/journal/plans/day/[date]` | `/app/plans/day/[date]` |
| `/journal/plans/grocery/[planId]` | `/app/plans/grocery/[planId]` |
| `/journal/plans/imports/*` | `/app/plans/imports/*` |
| `/journal` | `/app/log` |
| `/journal/log` | `/app/log/new` |
| `/journal/entry/[id]` | `/app/log/entry/[id]` |
| `/journal/profile` | `/app/profile` |

Some deeper legacy subflows, such as meals and eat-out flows, remain under `/journal/*` during this staged migration.

## App shell boundary rule

Any native signed-in app screen that belongs to the app experience (home, programs, plans, journal/log, profile, grocery, imports, etc.) should use canonical `/app/*` routes. Billing, store, and account/subscription flows stay on the public site (e.g. `/account`, `/shop`, `/programs`).

Public `/programs` is the marketing, purchase, and offer discovery surface. Signed-in `/app/programs` is program management: active path, purchased or inherited programs, partner programs, assessments, and upgrade paths.

When adding **new top-level routes** that are linked from the app or nav:

1. Add a placeholder page (or real page) so the route does not 404.
2. Update the route registry (`lib/routes/appRoutes.ts`) and the navigation map that links to it (e.g. `JournalFooterNav` `ROUTE_MAP`, or `AccountView` quick links, or `data/navigation.json` as appropriate).

Do not add new links to routes that have no page.
