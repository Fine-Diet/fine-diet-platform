# PR #156 — Release gates (operational readiness)

Branch: `feat/programs-integration-contract-v1`  
Draft PR: https://github.com/Fine-Diet/fine-diet-platform/pull/156

## Lint gate decision

ESLint is **not currently configured** in this repository (no `.eslintrc*` / `eslint.config.*`).

`npm run lint` runs `next lint`, which prompts for interactive setup when no config is present. A temporary, non-committed `next/core-web-vitals` trial against this tree produced broad pre-existing findings across marketing pages, journal UI, admin components, and USDA scripts — not a manageable branch-scoped set.

Therefore:

- **Lint is not an executable release gate for PR #156.**
- Do **not** treat a missing or interactive `next lint` run as a pass or fail signal for this PR.
- Active release gates for this PR are:
  1. Full Jest suite (`npm test`)
  2. Targeted non-test TypeScript check (package/source files; Jest typedef noise excluded)
  3. Full `npx tsc --noEmit` (may still report pre-existing test-typedef-only issues — record separately)
  4. Production build (`npm run build`)
  5. Entitlement registry verification (`npm run verify:entitlements`)
  6. Targeted release evidence already recorded in package execution reports
- Standing up ESLint requires a **separate repository-wide package**, not a PR #156 scope expand.

This document does not introduce a fake passing lint script or no-op lint configuration.
