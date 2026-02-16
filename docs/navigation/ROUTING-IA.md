# Routing & Information Architecture

Short reference for route layout and the journal app shell boundary. For access control and gating, see [Journal Gating](../../JOURNAL-GATING.md).

## Layout model

- **Public site:** `/`, `/[category]`, `/login`, `/account`, `/account/assessments`, `/programs`, `/shop`, `/gut-check`, `/results/[submissionId]`, etc. Use global NavBar + Footer (`_app.tsx`).
- **Journal app shell:** All routes under `/journal/*` use the dark journal layout and `JournalFooterNav` (no global NavBar/Footer). Gated by middleware (auth + journal entitlement); see [Journal Gating](../../JOURNAL-GATING.md).

## Footer tab routes (journal shell)

| Tab     | Route              |
|---------|--------------------|
| Home    | `/journal/home`     |
| Insights| `/journal/insights` |
| Journal | `/journal`          |
| Plans   | `/journal/plans`    |
| Profile | `/journal/profile`  |

Source of truth in code: `components/journal/JournalFooterNav.tsx` → `ROUTE_MAP`.

## Account drawer quick links

- My assessments → `/account/assessments`
- My programs → `/programs`
- My journal → `/journal`
- Shop → `/shop`
- Below divider: Account → `/account`; Log out.

## /journal app shell boundary rule

Any native app screen that belongs to the "journal app" experience (day view, log, insights, plans, profile, etc.) **must live under `/journal/*`**. Billing, store, and account/subscription flows stay on the public site (e.g. `/account`, `/shop`, `/programs`).

When adding **new top-level routes** that are linked from the app or nav:

1. Add a placeholder page (or real page) so the route does not 404.
2. Update the navigation map that links to it (e.g. `JournalFooterNav` `ROUTE_MAP`, or `AccountView` quick links, or `data/navigation.json` as appropriate).

Do not add new links to routes that have no page.
