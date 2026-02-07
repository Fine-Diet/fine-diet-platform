# FNDDS Ingestion Runbook

USDA FNDDS (Food and Nutrient Database for Dietary Studies) is ingested as **common foods** with `source_dataset='fndds'` and `source_id='fndds_<fdc_id>'` so it does not conflict with existing survey/foundation/branded rows.

## Representation in `food_objects`

| Field            | Value        | Notes |
|------------------|-------------|--------|
| `source_provider`| `'usda'`    | Same as other USDA datasets; keeps uniqueness and section logic simple. |
| `source_type`    | `'common'`  | FNDDS is prepared/restaurant-style common foods. |
| `source_dataset` | `'fndds'`   | Distinguishes from survey/foundation/sr_legacy. |
| `source_id`      | `fndds_<fdc_id>` | Avoids collision with numeric `(usda, fdc_id)` rows. |

Uniqueness: `(source_provider, source_id)` — e.g. `(usda, fndds_2710814)` is unique.

## Prerequisites

- Supabase env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- Run `scripts/sql/addSourceDataset.sql` if not already done (column exists; optional constraint includes `fndds`).
- FNDDS/Survey CSV folder under `data/usa_fdc/`. Default folder: `FoodData_Central_survey_food_csv_2024-10-31` (same as Survey Foods from FoodData Central). Or use `--folder <name>`.

## Commands

### 1. Print stats (no ingestion)

```bash
npx tsx scripts/usda/healthCheck.ts --dataset fndds
npx tsx scripts/usda/ingestFndds.ts --print-stats
```

### 2. Ingest (dry run)

```bash
npx tsx scripts/usda/ingestFndds.ts --limit 50 --dry-run
```

### 3. Ingest with limit (test)

```bash
npx tsx scripts/usda/ingestFndds.ts --limit 100 --batch 50
```

### 4. Full ingest

```bash
npx tsx scripts/usda/ingestFndds.ts --batch 500
```

### 5. Resume from checkpoint

```bash
# Uses .checkpoints/fndds.json automatically
npx tsx scripts/usda/ingestFndds.ts

# Or explicit since (source_id)
npx tsx scripts/usda/ingestFndds.ts --since fndds_2710000
```

### 6. Reset checkpoint and re-ingest

```bash
npx tsx scripts/usda/ingestFndds.ts --reset-checkpoint --limit 200
```

### 7. Custom data folder

```bash
npx tsx scripts/usda/ingestFndds.ts --folder FoodData_Central_fndds_food_csv_2024-10-31
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
- **No corruption of existing rows:** `source_id` is always `fndds_*`, so no overlap with numeric `source_id` from other datasets.

## Optional: SQL migration

If you use the strict check constraint on `source_dataset`, uncomment and add `'fndds'` in `scripts/sql/addSourceDataset.sql`:

```sql
CHECK (source_dataset IS NULL OR source_dataset IN ('branded', 'foundation', 'sr_legacy', 'survey', 'fndds'));
```
