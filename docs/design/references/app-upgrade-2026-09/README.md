# Fine Diet app upgrade visual references

Organized from the founder-supplied September 8 exports using Second Brain document **Fine Diet Signed-In App Build Upgrade — Visual Reference Packaging + Cursor Preflight v1 — 2026-09-08**, ID `08809956-9978-4bd9-984c-cf9f34d9b2d3`, version 1 (final).

Read [REFERENCE-MANIFEST.md](REFERENCE-MANIFEST.md) first: it contains all image priorities, visual targets, stale-prototype exclusions, original-name mapping, integrity hashes and optional-coverage dispositions.

- 38 unmodified PNGs: the original 33-image package plus five September 9 Plans convergence audit images.
- Folders: `00-shell-baseline`, `10-food`, `20-plans`, `30-log`, `40-programs`, and `plans-convergence-2026-09-09`. Shell-baseline has no screenshots because neither was supplied.
- Naming: `<domain>--<surface>--<state>--<device>.png`; filenames describe visible content rather than unverified behavior.
- PRIMARY images govern local visual composition; live signed-in Home governs shared shell metrics. Layouts are directional for shell geometry; measured raster sizes are not confirmed CSS viewport sizes.
- Supporting images only explain the local state in their manifest row. They cannot override PRIMARY composition or canonical decisions.
- Source exports remain untouched. No implementation or product behavior changes accompany this package.
- Before implementation, load the Second Brain packet and its linked decisions and inspect the live Home shell anchors: `components/layout/StackedPageSection.tsx`, `pages/journal/home.tsx`, `components/journal/home/TodayRhythm.tsx`, `components/journal/home/HomeTemplateCards.tsx`.
- Reference-package status: **READY FOR BUILD HANDOFF**. The founder confirms the original 33-image set is complete; integrity and classification are retained. Additional idealized pairs are not required before build. Dedicated Recipes-page visual design is intentionally deferred.
- Week Apply remains SUPPORTING and separate from reusable Week Plan duplication; no additional Copy screenshot is required. Programs start-permission states follow approved contracts and may use established Fine Diet modal styling for v1.
- Prototype conflict safeguards and source-of-truth precedence remain in the manifest. No unresolved reference conflict blocks this handoff under the documented dispositions. No application implementation accompanies this reference update.

## Plans Home + Plans Day convergence

Read `plans-convergence-2026-09-09/` before implementing shared Plans meal authoring. Its four PRIMARY images are the current visual authority for the compact Plans Home inline accordion and the aligned Plans Day meal-slot flow: in-slot search/scan/`+`, selected items with quantity/unit/remove, and conditional in-slot Draft/Save after an add or edit. Planned count is per occupied slot / meal container, not per component item, and removal requires a quick confirmation.

The fifth convergence image is explicitly SUPERSEDED because its `Planned 2 of 4` summary conflicts with the three occupied slots shown. It remains only to preserve the audit trail. Older Plans Home hover/menu and Plans Day slot-open/slot-selected images in `20-plans/` remain intact but no longer govern these authoring details. See the manifest for exact scope and SHA-256 provenance.
