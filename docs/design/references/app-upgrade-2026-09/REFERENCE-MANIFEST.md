# Fine Diet signed-in app — reference manifest

Packaging source: **Fine Diet Signed-In App Build Upgrade — Visual Reference Packaging + Cursor Preflight v1 — 2026-09-08**, Second Brain generated document `08809956-9978-4bd9-984c-cf9f34d9b2d3`, version 1, final, updated 2026-09-08T05:05:47.99+00:00.

Scope: reference curation only. No implementation, route migration, new behavior, or screenshot edits. The original September 8 exports remain in `/Users/rashadtyler/Desktop/SEP 8 - All Prints/`; the Plans convergence exports added on September 9 remain in `/Users/rashadtyler/Desktop/SEP 9 - All Prints/`. Each curated image is a byte-for-byte copy. PRIMARY/SUPPORTING/SUPERSEDED are packaging priorities, not new product approvals.

## Reference-package status: READY FOR BUILD HANDOFF

- Original founder-supplied reference set: complete, as confirmed by the founder.
- Organized references: 38 (33 original package images plus 5 Plans convergence audit images).
- Image integrity: verified; original SHA-256 provenance retained.
- PRIMARY/SUPPORTING classification: retained (17 PRIMARY / 16 SUPPORTING).
- Plans convergence overlay: 4 current-authority PRIMARY images plus 1 preserved SUPERSEDED candidate.
- Additional idealized desktop/mobile/state pairs: not required before build.
- Dedicated Recipes page visual design: intentionally deferred.
- Behavioral conflicts are resolved by approved Second Brain decisions, not prototype text.
- Existing signed-in Home surfaces remain the authority for shared sizing, spacing, gutters, radii, footer compensation, and responsive shell behavior.

This status concerns reference-package readiness for the upcoming Second Brain Bridge → Cursor execution packet. It does not claim implementation or runtime QA completion. The founder's clarification supersedes the earlier characterization of optional coverage as missing deliverables; the source-of-truth hierarchy below is unchanged.

## How to read the references

All layouts are **directional for shared shell geometry**, with the listed local composition/details the visual targets. None establishes exact CSS measurements. Existing signed-in Home components govern outer widths, gutters, radii, spacing and footer compensation. Raster dimensions below are measured PNG dimensions, **not confirmed CSS viewport dimensions**; browser zoom, device pixel ratio and capture viewport height are unknown. Preserve full exports; none is classified as a component crop.

Route/surface entries use descriptive surfaces where canonical URLs have not been verified. They do not create routes. `/app/log/new` is explicitly identified in the packaging source. Baseline is the visible example program, not a hardcoding instruction. Apply the source's precedence: founder decisions → build packet → PRIMARY visuals → live Home shell → current runtime facts → supporting prototypes. Consult the source and its decision IDs before implementation.

## Plans convergence authority — 2026-09-09

The files in `plans-convergence-2026-09-09/` are the newest visual authority for the shared Plans Home + Plans Day meal-authoring flow. Read them together: Plans Home defines the compact inline accordion treatment; Plans Day confirms the same authoring grammar in the fuller Day surface.

- A meal slot expands inline as an accordion on Plans Home and Plans Day.
- Search, scan, and `+` actions live inside the expanded slot. The actions-menu reference shows Photo, Describe, Paste, and Quick Add.
- Added items form an in-slot stream with quantity, unit, and an `x` remove affordance.
- Save and Draft live inside the expanded accordion and appear only after an item is added or edited. The clean Day selected-items reference governs item/count semantics; its legacy page-level Save position is superseded by the approved in-slot Home treatment.
- Planned count is per occupied slot / planned meal container, never per component item.
- Removing or deleting requires a quick confirmation before execution. The screenshots show the `x` affordance but do not depict the confirmation.
- Plans Home is visually more compact than Log Nutrition while remaining functionally aligned with the same add-meal/add-single-item authoring pattern.

The historical Plans Home hover/menu images in `20-plans/` remain useful for overview hierarchy and local row states, but they are superseded for expanded meal authoring, control placement, selected-item rendering, and Save/Draft behavior. The historical Plans Day slot-open/slot-selected images are likewise superseded for search controls, selected-item stream, and Save/Draft placement. The original files remain intact for audit history.

| Priority | File | Route/surface | State | Current authority | Do not copy literally | Raster dimensions |
|---|---|---|---|---|---|---|
| PRIMARY | [plans-convergence-2026-09-09/plans-home-week-accordion-empty-desktop.png](plans-convergence-2026-09-09/plans-home-week-accordion-empty-desktop.png) | Plans / Home week overview | Compact empty Dinner accordion | inline expansion; in-slot Create a meal label; search, scan and `+`; compact Home density; no Save/Draft before edits | displayed `Planned 2 of 4` is sample state, not component-count logic | 1920 × 1237 px |
| PRIMARY | [plans-convergence-2026-09-09/plans-home-week-accordion-actions-menu-desktop.png](plans-convergence-2026-09-09/plans-home-week-accordion-actions-menu-desktop.png) | Plans / Home week overview | Empty Dinner accordion with alternate-add menu | in-slot search/scan/`+`; Photo/Describe/Paste/Quick Add menu; anchoring and compact density | sample dates, nutrition and counts; opening the menu does not occupy the slot | 1920 × 1613 px |
| PRIMARY | [plans-convergence-2026-09-09/plans-day-meal-slot-empty-desktop.png](plans-convergence-2026-09-09/plans-day-meal-slot-empty-desktop.png) | Plans / Day | Empty Lunch meal slot expanded | shared accordion grammar; Create a meal; search, scan and `+` placement | historical page-level Save is superseded for this authoring flow; Save/Draft remain hidden until an edit | 1920 × 1298 px |
| PRIMARY | [plans-convergence-2026-09-09/plans-day-meal-slot-selected-items-desktop.png](plans-convergence-2026-09-09/plans-day-meal-slot-selected-items-desktop.png) | Plans / Day | Lunch slot with three selected component items | in-slot item stream; qty/unit; `x` removal; one occupied slot counts once; meal total treatment | component items do not each increase Planned count; historical page-level Save placement is superseded by in-slot Save/Draft | 1920 × 1565 px |
| SUPERSEDED | [plans-convergence-2026-09-09/plans-home-week-accordion-selected-items-superseded-desktop.png](plans-convergence-2026-09-09/plans-home-week-accordion-selected-items-superseded-desktop.png) | Plans / Home week overview | Selected-item candidate with in-slot Draft/Save | audit evidence for the intended in-slot Draft/Save and selected-item composition only | **Not active authority:** it shows `Planned 2 of 4` while Breakfast, Mini-Meal, and Dinner are occupied. Use per-occupied-slot semantics and the PRIMARY references above | 1920 × 1709 px |

## Curated images

| Priority | File | Route/surface | State | Must match | Do not copy literally | Layout | Raster dimensions |
|---|---|---|---|---|---|---|---|
| SUPPORTING | [30-log/log--nutrition--logged--desktop.png](30-log/log--nutrition--logged--desktop.png) | Log / nutrition | Logged presentation; three top-level entries | entry grouping; muted Logged action; footer outline | Logged appearance does not prove persistence; old route brackets and sample data | Directional; shared shell per Home | 1920 × 1112 px |
| SUPPORTING | [30-log/log--nutrition--alternate-input--desktop.png](30-log/log--nutrition--alternate-input--desktop.png) | /app/log/new | Alternate capture menu open | menu position; rounded menu border; capture option spacing | Save footer is stale: draft commit is Log; capture must pass through review and draft | Directional; shared shell per Home | 1920 × 1112 px |
| PRIMARY | [30-log/log--nutrition--draft--desktop.png](30-log/log--nutrition--draft--desktop.png) | /app/log/new | Draft with selected editable row | search pill; selected-row background; quantity/unit alignment; entry count; footer action hierarchy | sample foods/nutrients; selection is not logging; Save as Meal does not log | Directional; shared shell per Home | 1920 × 1112 px |
| SUPPORTING | [30-log/log--nutrition--draft-hover--desktop.png](30-log/log--nutrition--draft-hover--desktop.png) | /app/log/new | Draft row hover | row highlight; remove affordance; row spacing | hover alone does not commit or edit canonical history | Directional; shared shell per Home | 1920 × 1112 px |
| SUPPORTING | [30-log/log--nutrition--search-results--desktop.png](30-log/log--nutrition--search-results--desktop.png) | /app/log/new | Search results shown | search/result container; result density; trailing add icons | duplicate sample results; Save footer is stale; result count is not draft-entry count | Directional; shared shell per Home | 1920 × 1112 px |
| PRIMARY | [30-log/log--nutrition--draft--mobile.png](30-log/log--nutrition--draft--mobile.png) | /app/log/new | Draft with three selected entries | compact top row; search pill; entry hierarchy; bottom count; footer action placement | sample foods/date; Save as Meal does not log; selection is not canonical intake | Directional; shared shell per Home | 430 × 833 px |
| SUPPORTING | [30-log/log--nutrition--planned-context--mobile.png](30-log/log--nutrition--planned-context--mobile.png) | /app/log/new | Planned Meal context plus search and selected editable result | planned-context block; search/result density; selected quantity/unit row | Save footer is stale; selected row still shows plus; do not infer a new add/edit transition | Directional; shared shell per Home | 430 × 833 px |
| PRIMARY | [40-programs/programs--baseline--day-0--desktop.png](40-programs/programs--baseline--day-0--desktop.png) | Programs / Baseline delivery, Day 0 | Day 0 setup composition; access/enrollment state not established | image-backed hero; headline hierarchy; audio player; bordered setup card; two-column meal options | sample user/content; old Meals & Recipes/Pantry navigation; fixed meal quota; no proof of locked or enrolled state | Directional; shared shell per Home | 1920 × 1768 px |
| PRIMARY | [40-programs/programs--baseline--day-0--mobile.png](40-programs/programs--baseline--day-0--mobile.png) | Programs / Baseline delivery, Day 0 | Day 0 setup composition; access/enrollment state not established | hero text wrapping; audio player; single-column meal options; card border; module spacing | sample user/content; fixed meal quota; overlaying footer is not target spacing; no proof of locked state | Directional; shared shell per Home | 430 × 1242 px |
| PRIMARY | [40-programs/programs--baseline--day-1-end--desktop.png](40-programs/programs--baseline--day-1-end--desktop.png) | Programs / Baseline delivery, Day 1 onward | Day 1 content example for day-1-end template | hero hierarchy; day rail; local tabs; alternating module surfaces; audio/response controls; completion button | sample day/content; hardcoded program rules; completion must not advance calendar; old navigation; footer overlap | Directional; shared shell per Home | 1920 × 3089 px |
| PRIMARY | [40-programs/programs--baseline--day-1-end--mobile.png](40-programs/programs--baseline--day-1-end--mobile.png) | Programs / Baseline delivery, Day 1 onward | Day 1 content example for day-1-end template | hero wrapping; horizontal day rail; local tabs; stacked modules; audio/response controls; completion button | sample content; hardcoded day count; completion must not advance calendar; footer overlap | Directional; shared shell per Home | 430 × 2421 px |
| PRIMARY | [10-food/food--hauls--builder--desktop.png](10-food/food--hauls--builder--desktop.png) | Food / Hauls / builder | Lists combined in haul builder | list/store toolbar; expandable list rows; quantity pills; store summary grouping; bottom action | sample stores/prices/date; invite behavior and calculations require canonical decisions; floating footer overlap | Directional; shared shell per Home | 1920 × 2413 px |
| PRIMARY | [10-food/food--hauls--library--desktop.png](10-food/food--hauls--library--desktop.png) | Food / Hauls / library | Recent hauls table | heading hierarchy; Create New/Recent tabs; search alignment; table columns; row density | sample stores/dates/spend; prototype Shopping/Haul route labels | Directional; shared shell per Home | 1920 × 1223 px |
| PRIMARY | [10-food/food--lists--default--desktop.png](10-food/food--lists--default--desktop.png) | Food / Lists | Essentials list with product and unresolved-need rows | list selector; New List tab; search input; quantity pills; Choose Product treatment; haul CTA card | sample products/prices; prototype Shopping/List IA; floating footer overlap | Directional; shared shell per Home | 1920 × 1793 px |
| PRIMARY | [10-food/food--pantry--default--desktop.png](10-food/food--pantry--default--desktop.png) | Food / Pantry | Inventory feed with expanded item | heading hierarchy; add/search toolbar; category labels; expanded item background; metadata density; overflow placement | sample inventory/price/perishability; do not derive stock or expiry rules from sample text | Directional; shared shell per Home | 1920 × 1544 px |
| PRIMARY | [10-food/food--home--default--desktop.png](10-food/food--home--default--desktop.png) | Food / Home | Summary cards and recipe capture section | centered hero; paired readiness/haul cards; pill CTAs; stacked Recipes section; capture input | Plans meal-window helper copy; prototype Shopping IA; sample readiness percentage/day; recipe panel is not a Recipes page | Directional; shared shell per Home | 1920 × 1401 px |
| PRIMARY | [20-plans/plans--day--default--desktop.png](20-plans/plans--day--default--desktop.png) | Plans / Day | Collapsed meal slots; one planned marker | breadcrumb/headline; plan title/action row; slot separators; binary markers; summary; Save placement | sample nutrition values; inconsistent title capitalization; marker does not mean consumed | Directional; shared shell per Home | 1920 × 1298 px |
| SUPPORTING | [20-plans/plans--day--slot-open--desktop.png](20-plans/plans--day--slot-open--desktop.png) | Plans / Day | Empty Lunch slot expanded | expanded background; Search Library input; create-meal affordance | source calls this hover; visual evidence shows expanded slot, not a defined hover-trigger contract | Directional; shared shell per Home | 1920 × 1298 px |
| SUPPORTING | [20-plans/plans--library--day-plans--desktop.png](20-plans/plans--library--day-plans--desktop.png) | Plans / Library / Day Plans (visible title) | Library overlay titled Day Plans Library | overlay composition; search alignment; two-column results | meal-like sample entries conflict with Day Plans heading; lorem ipsum; taxonomy needs reconciliation | Directional; shared shell per Home | 1920 × 1298 px |
| SUPPORTING | [20-plans/plans--day--save-modal--desktop.png](20-plans/plans--day--save-modal--desktop.png) | Plans / Day | Save dialog | name placement; description field; Save/Cancel hierarchy | Describe your meal is stale on Day Plan; 60-character limit unverified; not proof of copy flow | Directional; shared shell per Home | 1920 × 1298 px |
| SUPPORTING | [20-plans/plans--day--slot-selected--desktop.png](20-plans/plans--day--slot-selected--desktop.png) | Plans / Day | Expanded Lunch with selected items | selected-item columns; removal marks; slot total | sample macros; source meals-or-components distinction unresolved; no new entity types | Directional; shared shell per Home | 1920 × 1298 px |
| SUPPORTING | [20-plans/plans--home--active-plans-menu--desktop.png](20-plans/plans--home--active-plans-menu--desktop.png) | Plans / Home | Active plan row with action menu | expanded row; ellipsis menu; action alignment | Food-reporting helper sentence; sample values; menu shows Open/Edit and Quick Log, not an editor screen | Directional; shared shell per Home | 1920 × 1109 px |
| SUPPORTING | [20-plans/plans--home--active-plans-hover--desktop.png](20-plans/plans--home--active-plans-hover--desktop.png) | Plans / Home | Active plan row expanded on hover | row highlight; meal detail placement; summary spacing | sample nutrition and time errors; hover state cannot define mobile interaction | Directional; shared shell per Home | 1920 × 1109 px |
| PRIMARY | [20-plans/plans--home--default--desktop.png](20-plans/plans--home--default--desktop.png) | Plans / Home | Active plans overview | headline hierarchy; day tabs; month navigation; meal-time rows; planning summary; local navigation strip | Food-reporting helper sentence; sample time/date/nutrition; use planned/unplanned only | Directional; shared shell per Home | 1920 × 1109 px |
| SUPPORTING | [20-plans/plans--home--meal-rhythm-setup--desktop.png](20-plans/plans--home--meal-rhythm-setup--desktop.png) | Plans / Home | Meal rhythm setup prompt | headline hierarchy; helper placement; Set meal windows CTA | setup availability and destination require canonical Meal Rhythm decisions | Directional; shared shell per Home | 1920 × 1097 px |
| PRIMARY | [20-plans/plans--day--default--mobile.png](20-plans/plans--day--default--mobile.png) | Plans / Day | Collapsed meal slots; mislabeled Home source | wrapped headline; compact action row; slot separators; planning markers; summary; Save placement | source filename Home is wrong; sample nutrition/time; does not supply Plans Home mobile | Directional; shared shell per Home | 430 × 850 px |
| PRIMARY | [20-plans/plans--month--default--desktop.png](20-plans/plans--month--default--desktop.png) | Plans / Month | Calendar projection | breadcrumb/headline; month controls; seven-column grid; rounded grid corners; cell highlighting | Open/New must not create reusable Month object; sample dates and highlight meaning | Directional; shared shell per Home | 1920 × 1124 px |
| PRIMARY | [20-plans/plans--month--default--mobile.png](20-plans/plans--month--default--mobile.png) | Plans / Month | Compact calendar projection | wrapped heading; compact month controls; seven-column grid; cell borders; vertical spacing | Unnamed Day Plan and Make a copy are stale; missing day 30 sample cell; no reusable Month object | Directional; shared shell per Home | 430 × 845 px |
| SUPPORTING | [20-plans/plans--library--week-plans--desktop.png](20-plans/plans--library--week-plans--desktop.png) | Plans / Library / Week Plans (visible title) | Week Plans Library tab open | tab proportions; search row; two-column cards | source says select day plans but visible title and entries are Week Plans; intended invocation remains ambiguous | Directional; shared shell per Home | 1920 × 1353 px |
| SUPPORTING | [20-plans/plans--library--week-plans-create-new--desktop.png](20-plans/plans--library--week-plans-create-new--desktop.png) | Plans / Library / create-new overlay | Create New tab with seven weekday rows | selected tab treatment; weekday rows; Save/summary placement | source says add day plan; visible seven-day editor suggests week scope; Wee Plans typo; do not infer flow | Directional; shared shell per Home | 1920 × 1353 px |
| SUPPORTING | [20-plans/plans--week--day-row-hover--desktop.png](20-plans/plans--week--day-row-hover--desktop.png) | Plans / Week | Day row highlighted with Add Day Plan | row highlight; Add Day Plan alignment; separator spacing | footer overlaps row; hover does not establish responsive behavior | Directional; shared shell per Home | 1920 × 1353 px |
| SUPPORTING | [20-plans/plans--week--apply-modal--desktop.png](20-plans/plans--week--apply-modal--desktop.png) | Plans / Week / apply dialog | Choose new week and Apply to week; source says make a copy | name/description arrangement; date field; primary action; Cancel placement | source copy label conflates duplication and scheduling; retain canonical distinction; sample date/limit | Directional; shared shell per Home | 1920 × 1353 px |
| PRIMARY | [20-plans/plans--week--default--desktop.png](20-plans/plans--week--default--desktop.png) | Plans / Week | Seven dated day rows | breadcrumb/headline; title/action row; month controls; seven rows; planning markers; Save/summary | Unnamed day plan is stale on Week; reusable versus dated context needs decisions; sample dates; footer overlap | Directional; shared shell per Home | 1920 × 1353 px |

## Duplicate and ambiguity review

- No byte-identical duplicates among the 33 source files (SHA-256). Visual inspection found distinct states in all near-duplicate families: Plans Home (4), Plans Day (5), Plans Week/library/apply (5), and desktop Log (5). Retain these only for the specific state details listed, not as competing full-page PRIMARY designs.
- Plans Home mobile source is actually **Plans Day**, confirmed by its breadcrumb, title, slots and Save button. Renamed to `plans--day--default--mobile.png`. A dedicated Plans Home mobile reference was not supplied and is not required before build; use the corresponding supplied reference, live Home/mobile shell, and approved contracts. Numeric export suffixes 3 and 5 were removed; they do not denote product states.
- Plans Home active overview is the PRIMARY desktop composition; meal-rhythm setup is a separate SUPPORTING state. Active hover/menu files only govern their local state. Their helper copy conflicts: use the planning-focused wording visible in the hover reference if choosing between these samples; the packet's rule that Plans must not re-own Food reporting wins over the Food-reporting helper in default/menu images. Final text remains subject to canonical decisions.
- For shared Plans Home/Day meal authoring, the September 9 convergence section now supersedes the older Plans Home hover/menu and Plans Day slot-open/slot-selected references. Those historical files remain available only for the narrower details retained in their original rows.
- `plans-home-week-accordion-selected-items-superseded-desktop.png` preserves the mistaken `Planned 2 of 4` candidate for audit history but is not active visual authority. Planned count is calculated per occupied slot / meal container, not per component item.
- Plans Day's source called “hover” visibly shows an open slot; named `slot-open` without asserting the trigger. The source called “editor” shows an action menu, not the editor itself.
- Day Plans Library has meal-like example names under a Day Plans heading. Week library sources say “add day plan,” while their contents show Week Plans and a seven-day create form. Filenames follow visible surfaces; these remain SUPPORTING and cannot resolve taxonomy or invocation. No inferred selection flow is approved.
- The source called Week “make a copy” displays **Choose new week / Apply to week**. Named `plans--week--apply-modal--desktop.png`; this is an Apply reference, not a reusable-object duplication reference. A separate reusable-object duplication screenshot is not required before implementation. The packet's duplication-versus-scheduling distinction wins over source naming. Day Save dialog is not a substitute for Day Copy.
- Month mobile shows “Unnamed Day Plan / Make a copy,” unlike desktop, and omits day 30. The packet's calendar-only Month rule wins over both prototypes. Neither screenshot authorizes a reusable Month object or altered calendar behavior.
- Log desktop draft/edit and mobile draft use **Log**; search, alternate-input and planned-context prototypes use **Save**. PRIMARY draft references and the packet's explicit Log boundary win. The mobile planned-context reference combines planned context, search and a selected editable result, so it is not a clean selected-row-only pair. Its plus icon does not settle the selected-row transition. Logged desktop is distinct from Draft; no logged mobile supplied.
- Programs Day 0 captures show setup content, but do not establish access-only, locked, future-start or enrolled state. Do not label them access-only solely because the manifest example used that term. No Get Started modal is shown. Day-1-end depicts Day 1 content and a rail with day 2 accented: it is a template example, not proof that all subsequent states are covered or that day 2 is current.
- Prototype app-navigation labels/icons, active selections and footer positions disagree between domains and devices. Live shared shell wins. Floating bars obscure content in several exports; preserve the images but do not reproduce the overlap. Program sample copy/module quotas are not runtime requirements.

## Additional reference coverage not supplied / not required for build

The original founder-supplied 33-image package is complete. The additional desktop/mobile/state pairs in the later Second Brain preflight tree were an idealized checklist, not part of the original supplied prototype set. Their absence is not a Work packaging failure, an incomplete founder handoff, or a build blocker. Do not request extra screenshots solely to satisfy that tree or create placeholders.

Where a dedicated pair is not supplied, responsive/state implementation may use the corresponding approved desktop or mobile reference where available, the existing signed-in Home/mobile shell for shared sizing and spacing, and approved Second Brain product/state contracts.

### Governed by live shell / approved behavior and not required as new screenshots

All entries below are coverage not supplied and **not required before build**.

| Optional reference from the later checklist | Disposition |
|---|---|
| `00-shell-baseline/home--desktop--baseline.png` | Use the live signed-in Home/shared shell. |
| `00-shell-baseline/home--mobile--baseline.png` | Use the live signed-in Home/mobile shell. |
| `10-food/food--home--default--mobile.png` | Use supplied Food Home desktop composition, live mobile shell, and approved behavior. |
| `10-food/food--pantry--default--mobile.png` | Use supplied Pantry desktop composition, live mobile shell, and approved behavior. |
| `10-food/food--lists--default--mobile.png` | Use supplied Lists desktop composition, live mobile shell, and approved behavior. |
| `10-food/food--hauls--builder--mobile.png` | Use supplied Haul Builder desktop composition, live mobile shell, and approved behavior. |
| `20-plans/plans--home--default--mobile.png` | Use supplied Plans Home desktop composition, live mobile shell, and approved behavior. The source labeled Home mobile actually depicts Day. |
| `20-plans/plans--week--default--mobile.png` | Use supplied Week desktop composition, live mobile shell, and approved behavior. |
| `20-plans/plans--copy--day--desktop.png` | Use approved reusable-object copy contracts and established styling; Day Save is not evidence of Copy behavior. |
| `30-log/log--nutrition--empty--desktop.png` | Use supplied Log input/draft styling and approved empty/draft state contracts. |
| `30-log/log--nutrition--logged--mobile.png` | Use supplied logged desktop and draft mobile references, live mobile shell, and approved committed-state contracts. |

### Deferred visual design

| Reference not supplied | Disposition |
|---|---|
| `10-food/food--recipes--default--desktop.png` | Dedicated Recipes-page visual design is intentionally deferred. |
| `10-food/food--recipes--default--mobile.png` | Dedicated Recipes-page visual design is intentionally deferred. |

The supplied Food Home Recipes capture section is not a dedicated Recipes-page design. Do not synthesize that deferred page design from the Home capture panel. This deferral does not make the original reference package incomplete.

### Week Copy / Apply

Retain `20-plans/plans--week--apply-modal--desktop.png` as SUPPORTING for **Apply to week / Choose new week**. The original make-a-copy filename was misleading; do not rename this reference to Make a Copy.

- **Make a copy** duplicates the reusable Week Plan.
- **Copy/Apply to week** places the Week Plan onto another dated week.

Approved Second Brain behavior governs this distinction. A separate reusable-object duplication screenshot (`20-plans/plans--copy--week--desktop.png` in the idealized tree) is not required before implementation.

### Programs start permission and other optional states

No screenshot is currently supplied for the Get Started permission modal, dismissed/locked Day 0, future-start pre-start state, or start confirmation states. These are not visual blockers. Approved Second Brain contracts govern their behavior; modal v1 may use established Fine Diet modal styling until the founder supplies a more elevated custom design later. Existing Day 0 and Day 1 references remain unchanged and do not prove enrollment, locked, or current-day state.

Other dedicated variants not supplied—Hauls library mobile; Day open/selected/save mobile; Plans libraries/create/apply mobile; Plans Home setup/menu mobile; Log desktop planned context, mobile alternate capture, clean selected-row edit and empty mobile; Programs completion/response feedback—are optional coverage, not additional founder deliverables or prerequisites. Use supplied references, live shell/shared styling, and approved state contracts. Do not infer mobile hover behavior or synthesize screenshots.

### Reference-conflict disposition for Cursor

No genuine unresolved **reference conflict** blocks Cursor's build handoff under these dispositions. The prototype ambiguities above remain documented safeguards: resolve behavior through approved Second Brain decisions and the build packet, and shared layout through the live shell. Dedicated Recipes design remains explicitly deferred, not inferred. This review does not replace Cursor's required loading of those contracts before implementation.

## Original-file provenance and integrity

Every destination is a byte-for-byte copy. Full SHA-256 values allow verification against the untouched source folder.

| Original filename | Curated file | SHA-256 |
|---|---|---|
| `-app-log-new[dayID] - Items Logged.png` | `30-log/log--nutrition--logged--desktop.png` | `be04e6d84866b74f3dc8664102d8d12f9a8808ef9ce5a809a4e67668b4915b56` |
| `-app-log-new[dayID] - alternate input engaged.png` | `30-log/log--nutrition--alternate-input--desktop.png` | `8f8c9ee6dd916f0faf9d826df6533e52321eaf80c1db2070e6996af6f8dc5c80` |
| `-app-log-new[dayID] - item Edit.png` | `30-log/log--nutrition--draft--desktop.png` | `1512df42ec9e22c2f6c101f76ea7a57edee913fde8ab37c39505014dd71a9dbc` |
| `-app-log-new[dayID] - item hover.png` | `30-log/log--nutrition--draft-hover--desktop.png` | `625b93bc2c1f361e938f1ed3130a395da525b6f5bd79d83b729b169d7b36da88` |
| `-app-log-new[dayID] Input - Food Search.png` | `30-log/log--nutrition--search-results--desktop.png` | `74bea04c4a42060eaa38713079e2d84e7bf550907215903afc898786094c8884` |
| `-app-log-new[dayID] Input - Mobile.png` | `30-log/log--nutrition--draft--mobile.png` | `842995e44ce1bea65dc1080aa1e885c66551640b787207f66ed02b4ac0f3592a` |
| `-app-log-new[dayID] Input Search and Selected revealing editing - Mobile.png` | `30-log/log--nutrition--planned-context--mobile.png` | `367162dd131666bf26e1042be96568db59c3711baac9310fae88d4c8ddab6420` |
| `-app-programs-[program-name]-day-0  - Desktop.png` | `40-programs/programs--baseline--day-0--desktop.png` | `3977f162e6d7cdc5b82d38980a9348c6d0ad352747211bf6a9dcb27db7f2fc76` |
| `-app-programs-[program-name]-day-0  - Mobile.png` | `40-programs/programs--baseline--day-0--mobile.png` | `28c1e635eab501de7e2218c646a5f529741b4327bed4f41d1d8e69c027b188d2` |
| `-app-programs-[program-name]-day-1-end  - Desktop.png` | `40-programs/programs--baseline--day-1-end--desktop.png` | `50147bf1c523765e54a59773e90903945d6fb5b2028840b36266f5358fd97f77` |
| `-app-programs-[program-name]-day-1-end  - Mobile.png` | `40-programs/programs--baseline--day-1-end--mobile.png` | `8e2da6a8d9b48806643967cf437f7536b0019f1ccd4a92e670cbd5e1d8fba159` |
| `-food-haul-builder.png` | `10-food/food--hauls--builder--desktop.png` | `9719b378e97b47ecb431baaacf08595f6d04c826b6673c5fdb1dfc4f806ea046` |
| `-food-haul.png` | `10-food/food--hauls--library--desktop.png` | `89aa72049bb94bbc757915ab6ba60c512dff36b046d0b4d0705fc677d773133e` |
| `-food-list.png` | `10-food/food--lists--default--desktop.png` | `eb0663da097ee3b30dc7c04faf604729a957580562856100b386b84020c554e4` |
| `-food-pantry.png` | `10-food/food--pantry--default--desktop.png` | `f9b89253df8e714e997f26625834aedcb2a7dadcf06e33452749544b476ac695` |
| `-food.png` | `10-food/food--home--default--desktop.png` | `9af9ff47b522f509c817c0873a71535cccef5326e1c544834f413323bad12791` |
| `-plans - day - desktop – basic.png` | `20-plans/plans--day--default--desktop.png` | `b683ba7a3b99647c9e097193a3a22a69df2941bfb0fff166d9c9a7b4ec7cd121` |
| `-plans - day - desktop – hover.png` | `20-plans/plans--day--slot-open--desktop.png` | `daec86ec75ec63cf94c976df0da4458a5f28a9aa1b7fcfaec11d289a75fd536d` |
| `-plans - day - desktop – open library pop-up modal.png` | `20-plans/plans--library--day-plans--desktop.png` | `b742c1e7a211a14d56e98a09c1ae60793d8077954c057848bdfbc9a2fca480be` |
| `-plans - day - desktop – save modal.png` | `20-plans/plans--day--save-modal--desktop.png` | `cec0a900d80b9654cd0145df2f3ce21a00d31b3a6a38d5b4137a7af8e324ba2b` |
| `-plans - day - desktop – selected meals or components.png` | `20-plans/plans--day--slot-selected--desktop.png` | `31c86070666614930f6f8b1a0385f37471a8ac50aee9570c791046068ded945c` |
| `-plans - home - desktop – active plans with hover over + editor.png` | `20-plans/plans--home--active-plans-menu--desktop.png` | `300295c0aac15fcf02466d8a655c665ec21abcc1276a8f31edf88847a228fe90` |
| `-plans - home - desktop – active plans with hover over.png` | `20-plans/plans--home--active-plans-hover--desktop.png` | `e059d19d9baa8f302db2f473403c702e60eaef0b1627a94cf56007210087ec06` |
| `-plans - home - desktop – active plans.png` | `20-plans/plans--home--default--desktop.png` | `0a56af55192f9dad8c0f9f7179d8a4fb4b0366a50970e5a23d8383d1daa580a7` |
| `-plans - home - desktop.png` | `20-plans/plans--home--meal-rhythm-setup--desktop.png` | `e187e559629c4994c6a675ec4313b2747b56e12e128110675ca2620c7793def6` |
| `-plans - home - mobile – 3.png` | `20-plans/plans--day--default--mobile.png` | `e3ea382374f971028f8c646d15317ee0635adc78233f025da30976f62695a6b0` |
| `-plans - month - desktop.png` | `20-plans/plans--month--default--desktop.png` | `f40b4d94160c061e38acff8768a1938e579af94a859172c6f16cd97b458aaaea` |
| `-plans - month - mobile – 5.png` | `20-plans/plans--month--default--mobile.png` | `efd70736b26812bb6aa336e4d44158bf58c2faae60f38d5cc894c7057e36dca3` |
| `-plans - week - desktop - add day plan screen 1 - select day plans.png` | `20-plans/plans--library--week-plans--desktop.png` | `132ea8fd868dec00243d29ea93aff56a7c6af1310bbc02d1cbc08595a093f794` |
| `-plans - week - desktop - add day plan screen 2 - create new.png` | `20-plans/plans--library--week-plans-create-new--desktop.png` | `12df1ace26015eb6303c83f3621b4f0d385be1defd494c32b1a1e6464342887c` |
| `-plans - week - desktop - hover line.png` | `20-plans/plans--week--day-row-hover--desktop.png` | `da51db5d5db1bfd63b7d465e00e20e4a924b30e4cdeffefbd918dbbc4764d77c` |
| `-plans - week - desktop - make a copy.png` | `20-plans/plans--week--apply-modal--desktop.png` | `0650b34a599ea64b56adf77fdb8fa90094f6dfd1368d1a22a646365ff7b55a61` |
| `-plans - week - desktop.png` | `20-plans/plans--week--default--desktop.png` | `251526d27319100215e448024be5e9950f0fa9f164032817d3358dacfc69e34e` |

## Plans convergence provenance and integrity — 2026-09-09

These five files are byte-for-byte copies from the September 9 source folder. Four are current-authority PRIMARY references; the incorrect-count candidate is retained as SUPERSEDED and must not guide implementation.

| Original filename | Curated file | SHA-256 |
|---|---|---|
| `-plans - day - desktop – hover.png` | `plans-convergence-2026-09-09/plans-day-meal-slot-empty-desktop.png` | `e5afcfae96f9c3460579021406d903e7b7fd49ff57370c4acba944d2ee6415e8` |
| `-plans - day - desktop – selected meals or components.png` | `plans-convergence-2026-09-09/plans-day-meal-slot-selected-items-desktop.png` | `60d31c7158c275710f4f0fe3ad10a548462021c08c5f5c1e8b62b65214539cf2` |
| `-plans - home - desktop – active plans with hover over + editor – 1.png` | `plans-convergence-2026-09-09/plans-home-week-accordion-empty-desktop.png` | `b77b14061b49d834be6776634238a0fd85b52ce08bf85c9aa8443d0342d8336a` |
| `-plans - home - desktop – active plans with item open + add input dropdown open.png` | `plans-convergence-2026-09-09/plans-home-week-accordion-actions-menu-desktop.png` | `41ef87316cd7c6a6a1bc393b9ea784929635da0b361df05ce4fa9f49ef7b9ec4` |
| `-plans - home - desktop – active plans with item open.png` | `plans-convergence-2026-09-09/plans-home-week-accordion-selected-items-superseded-desktop.png` | `fed7c2ef054f4935a55754d29766b2e2c676e28356fcd234f4220bff7d6d7b00` |
