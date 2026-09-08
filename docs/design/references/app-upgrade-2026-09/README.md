# Fine Diet app upgrade visual references

Organized from the founder-supplied September 8 exports using Second Brain document **Fine Diet Signed-In App Build Upgrade — Visual Reference Packaging + Cursor Preflight v1 — 2026-09-08**, ID `08809956-9978-4bd9-984c-cf9f34d9b2d3`, version 1 (final).

Read [REFERENCE-MANIFEST.md](REFERENCE-MANIFEST.md) first: it contains all image priorities, visual targets, stale-prototype exclusions, original-name mapping, integrity hashes and optional-coverage dispositions.

- 33 unmodified PNGs: 17 PRIMARY and 16 SUPPORTING.
- Folders: `00-shell-baseline`, `10-food`, `20-plans`, `30-log`, `40-programs`. Shell-baseline has no screenshots because neither was supplied.
- Naming: `<domain>--<surface>--<state>--<device>.png`; filenames describe visible content rather than unverified behavior.
- PRIMARY images govern local visual composition; live signed-in Home governs shared shell metrics. Layouts are directional for shell geometry; measured raster sizes are not confirmed CSS viewport sizes.
- Supporting images only explain the local state in their manifest row. They cannot override PRIMARY composition or canonical decisions.
- Source exports remain untouched. No implementation or product behavior changes accompany this package.
- Before implementation, load the Second Brain packet and its linked decisions and inspect the live Home shell anchors: `components/layout/StackedPageSection.tsx`, `pages/journal/home.tsx`, `components/journal/home/TodayRhythm.tsx`, `components/journal/home/HomeTemplateCards.tsx`.
- Reference-package status: **READY FOR BUILD HANDOFF**. The founder confirms the original 33-image set is complete; integrity and classification are retained. Additional idealized pairs are not required before build. Dedicated Recipes-page visual design is intentionally deferred.
- Week Apply remains SUPPORTING and separate from reusable Week Plan duplication; no additional Copy screenshot is required. Programs start-permission states follow approved contracts and may use established Fine Diet modal styling for v1.
- Prototype conflict safeguards and source-of-truth precedence remain in the manifest. No unresolved reference conflict blocks this handoff under the documented dispositions. Nothing has been implemented or committed.
