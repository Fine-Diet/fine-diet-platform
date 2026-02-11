# FNDDS Ingestion Runbook

USDA FNDDS (Food and Nutrient Database for Dietary Studies) is ingested as **common foods** with `source_dataset='fndds'` and `source_id='fndds_<food_code>'` (the FNDDS food code, not fdc_id) so it does not conflict with existing survey/foundation/branded rows.

## Folder and Validation

**FNDDS files may be delivered inside the Survey ZIP/folder** (e.g. `FoodData_Central_survey_food_csv_2024-10-31`). Validation is based on the **presence of FNDDS CSVs**, not on the folder name:

- Required files: `input_food.csv`, `fndds_derivation.csv`, `survey_fndds_food.csv`
- The script will exit with a clear error if any required file is missing
- Using the survey folder is correct as long as it contains those files

Stats and ingest are driven by `survey_fndds_food.csv`, not `food.csv`, so Survey foods are **not** re-ingested.

## Representation in `food_objects`

| Field            | Value        | Notes |
|------------------|-------------|--------|
| `source_provider`| `'usda'`    | Same as other USDA datasets; keeps uniqueness and section logic simple. |
| `source_type`    | `'common'`  | FNDDS is prepared/restaurant-style common foods. |
| `source_dataset` | `'fndds'`   | Distinguishes from survey/foundation/sr_legacy. |
| `source_id`      | `fndds_<food_code>` | Uses FNDDS food code (e.g. `fndds_11000000`), not fdc_id. Avoids collision with Survey rows. |

Uniqueness: `(source_provider, source_id)` — e.g. `(usda, fndds_11000000)` is unique.

## Prerequisites

- Supabase env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- Run `scripts/sql/addSourceDataset.sql` if not already done (column exists; optional constraint includes `fndds`).
- **Folder under `data/usa_fdc/`** containing the required FNDDS CSVs (`input_food.csv`, `fndds_derivation.csv`, `survey_fndds_food.csv`). This is typically the Survey CSV folder (e.g. `FoodData_Central_survey_food_csv_2024-10-31`).

## Quick runbook (recommended sequence)

### 1. Print stats

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --print-stats
```

Check that the folder is resolved correctly and stats are printed from `survey_fndds_food.csv`:
- Row count and food_code range (FNDDS food codes like 11000000–95310200)
- fdc_id range (links to food.csv for descriptions)

### 2. Dry run (limit 20)

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --limit 20 --dry-run
```

### 3. Small ingest (limit 200)

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --limit 200 --batch 50
```

### 4. Verify in Supabase

Confirm `source_dataset='fndds'` count increased and `source_id` uses food codes:

```sql
-- FNDDS count and source_id range (food_code, not fdc_id)
SELECT
  count(*) AS fndds_count,
  min(CASE WHEN source_id ~ '^fndds_([0-9]+)$' THEN (regexp_match(source_id, '^fndds_([0-9]+)$'))[1]::bigint END) AS min_food_code,
  max(CASE WHEN source_id ~ '^fndds_([0-9]+)$' THEN (regexp_match(source_id, '^fndds_([0-9]+)$'))[1]::bigint END) AS max_food_code
FROM public.food_objects
WHERE is_deleted = false
  AND source_provider = 'usda'
  AND source_dataset = 'fndds';
```

Expected range: ~11000000–95310200 (FNDDS food codes), not 2705383–2710814 (fdc_ids).

Then run full ingest if everything looks correct.

## Commands (reference)

### Print stats

```bash
npx tsx scripts/usda/healthCheck.ts --dataset fndds
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --print-stats
```

### Ingest (dry run)

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --limit 50 --dry-run
```

### Ingest with limit (test)

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --limit 200 --batch 50
```

### Full ingest

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --batch 500
```

### Resume from checkpoint

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31
# Or explicit since (source_id with food_code)
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --since fndds_11100000
```

### Reset checkpoint and re-ingest

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_survey_food_csv_2024-10-31 --reset-checkpoint --limit 200
```

## Verify counts and search

### Health check (CLI)

```bash
npx tsx scripts/usda/healthCheck.ts --dataset all
```

Expect a row for `fndds` under DATABASE COUNTS and a CHECKPOINT: FNDDS section.

### SQL (Supabase)

Run `scripts/sql/usdaHealthChecks.sql`. Check:

- **Count breakdown:** `source_dataset = 'fndds'` count.
- **Dataset/type mismatches:** no rows for `fndds` with `source_type != 'common'`.
- **Quick summary:** `fndds_count` column.

### Sample search (API or app)

- Search for a prepared/restaurant-style item (e.g. "Big Mac", "chicken sandwich").
- FNDDS items should appear under **Common Foods** (with Foundation, SR Legacy, Survey), above Branded.
- Section order: My Foods → Common Foods → Branded Foods → Scanned → Other.

## Guardrails

- **No shared checkpoint with branded:** FNDDS uses `scripts/usda/.checkpoints/fndds.json`; branded uses `branded.json`. Safe to run in parallel.
- **No global deletes:** Script only upserts; it never deletes existing USDA rows.
- **Idempotent reruns:** Same CSV re-run will upsert same rows (same `source_provider, source_id`); no duplicate rows.
- **No corruption of existing rows:** `source_id` is always `fndds_<food_code>`, so no overlap with numeric `source_id` (fdc_id) from other datasets.

## Optional: Soft-delete mistaken FNDDS rows (Survey ingested as FNDDS)

If Survey was accidentally ingested as FNDDS with `source_id` like `fndds_2705383` (fdc_id instead of food_code), soft-delete those rows with:

```bash
# Run in Supabase SQL Editor: scripts/sql/softDeleteFnddsMistake.sql
```

See `scripts/sql/softDeleteFnddsMistake.sql` for the exact `UPDATE ... SET is_deleted = true` and verification queries.

## Optional: SQL migration

If you use the strict check constraint on `source_dataset`, uncomment and add `'fndds'` in `scripts/sql/addSourceDataset.sql`:

```sql
CHECK (source_dataset IS NULL OR source_dataset IN ('branded', 'foundation', 'sr_legacy', 'survey', 'fndds'));
```
