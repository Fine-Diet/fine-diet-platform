# Package 3 — Narrow Founder Decision List

1. **Legacy saved meals (`journal_meal_templates`)**  
   Keep read/compat only, or freeze writes and redirect create to Meal Composer? Package 3 left the legacy API intact to avoid destructive migration.

2. **Archive UX for referenced planned meals**  
   When a library item attached to a plan is archived: warn in Plans UI, block new attaches only, or allow attach of archived with badge?

3. **URL re-import product behavior**  
   Package 3 returns the existing import (`duplicate: true`). Should the UI offer “open existing” vs “force new import” (escape hatch)?

4. **Schema proposal timing**  
   Apply `archived_at` + `normalized_source_url` columns in the next reviewed migration packet, or stay JSONB-only longer?

5. **Kind auto-correction**  
   Package 3 surfaces kind inconsistency but does not rewrite. Should confirmed library items auto-correct `meal`↔`recipe` when steps/yield appear?
