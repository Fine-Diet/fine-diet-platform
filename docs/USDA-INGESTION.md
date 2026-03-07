# USDA FoodData Central Ingestion

This document describes how Fine Diet ingests USDA FoodData Central (FDC) CSV datasets into the `food_objects` table.

## Quick Start

### Prerequisites

1. **Download USDA data** to `data/usa_fdc/` (not tracked in git)
2. **Run the database setup** in Supabase SQL Editor:

```sql
-- CRITICAL: Run this BEFORE any ingestion!
-- File: scripts/usda/addUsdaIndexes.sql
```

### First Ingestion

```bash
# Test with Foundation (small dataset, ~78K foods)
npx tsx scripts/usda/ingestFdc.ts --dataset foundation --limit 100

# If successful, run full Foundation
npx tsx scripts/usda/ingestFdc.ts --dataset foundation

# Then Branded (large dataset, ~2M foods)
npx tsx scripts/usda/ingestFdc.ts --dataset branded
```

---

## Data Sources

Location: `data/usa_fdc/`

| Dataset | Folder | Rows | Memory Mode | Description |
|---------|--------|------|-------------|-------------|
| Foundation | `FoodData_Central_foundation_food_csv_2025-12-18` | ~78K foods | In-memory | Lab-analyzed whole foods (highest quality) |
| Branded | `FoodData_Central_branded_food_csv_2025-12-18` | ~2M foods | Streaming | Commercial products with UPCs |
| SR Legacy | `FoodData_Central_sr_legacy_food_csv_2018-04` | ~7.8K foods | In-memory | Historical USDA Standard Reference |
| Survey (FNDDS) | `FoodData_Central_survey_food_csv_2024-10-31` | ~5.4K foods | In-memory | Foods as consumed in dietary surveys |

---

## File Structure Per Dataset

### Core Files (Required)

| File | Purpose | Key Columns |
|------|---------|-------------|
| `food.csv` | Main food records | `fdc_id`, `description`, `data_type`, `food_category_id` |
| `nutrient.csv` | Nutrient definitions | `id`, `name`, `unit_name` |
| `food_nutrient.csv` | Nutrient values per food | `fdc_id`, `nutrient_id`, `amount` |

### Dataset-Specific Files

| File | Dataset | Purpose | Key Columns |
|------|---------|---------|-------------|
| `branded_food.csv` | Branded | UPC, brand, serving info | `fdc_id`, `gtin_upc`, `brand_owner`, `serving_size` |
| `food_portion.csv` | Foundation, SR, Survey | Portion/serving info | `fdc_id`, `portion_description`, `gram_weight` |
| `food_category.csv` | Foundation, SR | Category lookup | `id`, `description` |

---

## Nutrient ID Mapping

USDA uses numeric IDs for nutrients. Our mapping to `food_objects` columns:

| Our Field | Nutrient ID | USDA Name | Unit |
|-----------|-------------|-----------|------|
| `calories` | 1008 (primary), 2047, 2048 | Energy | KCAL |
| `protein_g` | 1003 | Protein | G |
| `carbs_g` | 1005 | Carbohydrate, by difference | G |
| `fat_g` | 1004 | Total lipid (fat) | G |
| `fiber_g` | 1079 | Fiber, total dietary | G |
| `sugar_g` | 1063 | Sugars, Total | G |
| `sodium_mg` | 1093 | Sodium, Na | MG |

---

## Ingestion Pipeline

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/usda/addUsdaIndexes.sql` | **Run FIRST** - Creates required DB constraint |
| `scripts/usda/inspectFdcCsv.ts` | Schema discovery (read-only) |
| `scripts/usda/ingestFdc.ts` | Main ingestion runner |

### CLI Usage

```bash
# Inspect CSV structure
npx tsx scripts/usda/inspectFdcCsv.ts

# Test ingestion (small sample)
npx tsx scripts/usda/ingestFdc.ts --dataset foundation --limit 100

# Full dataset ingestion
npx tsx scripts/usda/ingestFdc.ts --dataset foundation
npx tsx scripts/usda/ingestFdc.ts --dataset branded

# Dry run (preview without inserting)
npx tsx scripts/usda/ingestFdc.ts --dataset foundation --dry-run

# Resume from specific fdc_id
npx tsx scripts/usda/ingestFdc.ts --dataset branded --since 1500000

# Reset checkpoint and start fresh
npx tsx scripts/usda/ingestFdc.ts --dataset foundation --reset-checkpoint

# All datasets
npx tsx scripts/usda/ingestFdc.ts --dataset all
```

### CLI Options

| Option | Description |
|--------|-------------|
| `--dataset <name>` | Required: `foundation`, `branded`, `sr_legacy`, `survey`, or `all` |
| `--limit N` | Process only first N foods (for testing) |
| `--since <fdc_id>` | Resume from specific fdc_id |
| `--dry-run` | Preview without inserting |
| `--batch N` | Batch size (default: 500) |
| `--reset-checkpoint` | Delete checkpoint before starting |
| `--max-consecutive-errors N` | Stop after N consecutive hard failures (default: 3) |

### Recommended Batch Sizes

| Scenario | Batch Size | Notes |
|----------|------------|-------|
| Initial test | 100-200 | Verify setup works |
| Stable network | 500 | Default, good balance |
| Intermittent failures | 200-300 | Reduces retry overhead |
| High Supabase load | 100 | Avoid rate limiting |

### Checkpoints

Progress is saved to `scripts/usda/.checkpoints/<dataset>.json`:

```json
{
  "dataset": "branded",
  "lastFdcId": "1500000",
  "lastSuccessfulFdcId": "1499500",
  "processed": 50000,
  "inserted": 49500,
  "updated": 0,
  "errors": 500,
  "skipped": 100,
  "promoted": 25,
  "lastRunAt": "2024-01-15T10:30:00Z"
}
```

| Field | Description |
|-------|-------------|
| `lastFdcId` | Last attempted fdc_id |
| `lastSuccessfulFdcId` | Last successfully committed fdc_id (resume point) |
| `inserted` | New rows inserted |
| `updated` | Rows updated (via promotion) |
| `skipped` | Rows skipped (UPC duplicates) |
| `promoted` | Provisional records upgraded to USDA |
| `errors` | Failed rows |

**Important**: Checkpoints only advance after successful batches. If a batch fails, the checkpoint stays at the last successful position, allowing safe resume.

### Output Files

The ingestion script writes several output files for debugging and auditing:

| File | Purpose |
|------|---------|
| `scripts/usda/.checkpoints/<dataset>.json` | Resume checkpoint |
| `scripts/usda/output/duplicates.jsonl` | UPC collision log (skipped/promoted records) |
| `scripts/usda/output/errors.jsonl` | Hard error log (failed records) |

**Reviewing logs:**

```bash
# Count duplicates
wc -l scripts/usda/output/duplicates.jsonl

# View recent duplicates
tail -20 scripts/usda/output/duplicates.jsonl | jq

# View errors by type
cat scripts/usda/output/errors.jsonl | jq -r '.errorType' | sort | uniq -c

# Find specific UPC in duplicates
grep "014100041993" scripts/usda/output/duplicates.jsonl | jq
```

### Memory Usage

| Dataset | Approach | Memory Required |
|---------|----------|-----------------|
| Foundation | Load all nutrients into memory | ~2GB |
| SR Legacy | Load all nutrients into memory | ~500MB |
| Survey | Load all nutrients into memory | ~300MB |
| **Branded** | **Stream nutrients per-batch** | **~4GB** |

The Branded dataset uses a streaming approach to avoid loading 26M+ nutrient rows into memory. Nutrients are loaded on-demand for each batch of foods.

---

## Verification (Smoke Test)

After ingestion, run these checks to verify data:

### SQL Verification Queries

Run in Supabase SQL Editor:

```sql
-- 1. Count by source (should show USDA rows)
SELECT source_provider, source_type, COUNT(*) as count
FROM food_objects 
WHERE source_provider = 'usda' 
GROUP BY source_provider, source_type
ORDER BY count DESC;

-- 2. Check Foundation foods have nutrients
SELECT 
  COUNT(*) as total,
  COUNT(calories) as with_calories,
  COUNT(protein_g) as with_protein
FROM food_objects 
WHERE source_provider = 'usda' AND source_type = 'common';

-- 3. Branded rows with UPC (should be > 0 after branded ingestion)
SELECT COUNT(*) AS branded_with_upc
FROM food_objects
WHERE source_type = 'branded' 
  AND upc IS NOT NULL 
  AND is_deleted = false;

-- 4. UPC duplicates (SHOULD BE 0 - if not, there's a constraint issue)
SELECT upc, COUNT(*) AS count
FROM food_objects
WHERE upc IS NOT NULL AND is_deleted = false
GROUP BY upc
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 50;

-- 5. Sample search for "apple"
SELECT canonical_name, brand_name, calories, protein_g, source_type
FROM food_objects
WHERE source_provider = 'usda'
  AND canonical_name ILIKE '%apple%'
ORDER BY source_type, canonical_name
LIMIT 20;

-- 6. Sample UPC lookup (use any known UPC)
SELECT canonical_name, brand_name, calories, upc
FROM food_objects
WHERE upc IS NOT NULL
LIMIT 5;

-- 7. Check for provisional records that could be promoted
SELECT COUNT(*) AS promotable_provisionals
FROM food_objects
WHERE source_type = 'provisional'
  AND upc IS NOT NULL
  AND is_deleted = false;
```

### App Verification

1. **Search test**: Go to Journal → Log → Search for "apple", "broccoli", "chicken"
   - Should see USDA items with calories/macros
   - Foundation items should show in "Common" group
   - Branded items should show in "Branded" group
   - **IMPORTANT**: "Unknown Product" provisionals should NOT appear above real foods

2. **UPC test** (after Branded ingestion): 
   - Use barcode scanner on a known product
   - Should find the item with nutrition data

### UPC Lookup Verification (11/12/13/14 digit variants)

Test that UPC normalization works correctly:

```bash
# Test via curl (replace with your API URL)
# 12-digit UPC-A
curl "http://localhost:3000/api/foods/upc/014100041993"

# 11-digit (missing leading zero) - should still find 12-digit match
curl "http://localhost:3000/api/foods/upc/14100041993"

# 14-digit GTIN-14 
curl "http://localhost:3000/api/foods/upc/00014100041993"

# With dashes (should normalize)
curl "http://localhost:3000/api/foods/upc/0-14100-04199-3"
```

All should return the same food (or create a single provisional if not found).

### Search Result Quality Check

Verify provisionals don't pollute search results:

```sql
-- This query should return 0 rows (no provisionals in top results)
-- If it returns rows, there may be a scoring issue
SELECT canonical_name, source_type, source_provider
FROM food_objects
WHERE canonical_name ILIKE '%apple%'
  AND source_type = 'provisional'
  AND is_deleted = false
LIMIT 10;
```

In the app, searching "apple" should show:
1. User's logged/favorited items (if any)
2. Branded USDA items with real nutrition
3. Common USDA items
4. NOT "Unknown Product" items unless user has logged them

### Expected Counts

| Dataset | Expected Rows |
|---------|---------------|
| Foundation | ~78,000 |
| Branded | ~2,000,000 |
| SR Legacy | ~7,800 |
| Survey | ~5,400 |

---

## Troubleshooting

### "there is no unique or exclusion constraint matching the ON CONFLICT specification"

**Cause**: The required database constraint doesn't exist.

**Fix**: Run `scripts/usda/addUsdaIndexes.sql` in Supabase SQL Editor **before** any ingestion.

```sql
-- Run this in Supabase SQL Editor
-- Copy contents from scripts/usda/addUsdaIndexes.sql
```

### "duplicate key value violates unique constraint" (source_provider, source_id)

**Cause**: Trying to insert data that already exists.

**Fix**: 
- Use `--since <fdc_id>` to resume from where you left off
- Or delete existing USDA data first:

```sql
DELETE FROM food_objects WHERE source_provider = 'usda';
```

### "duplicate key value violates unique constraint idx_food_objects_upc_unique"

**Cause**: Multiple USDA rows have the same UPC barcode.

**How it's handled** (automatic):
1. **Intra-batch dedupe**: Before writing, duplicate UPCs within the same batch are deduplicated, keeping the "best" row (has brand name, most nutrients, longest name)
2. **Cross-batch collision**: If a UPC already exists in the database:
   - If existing is a **provisional/scan record**: Promoted to USDA data (updates in place)
   - If existing is a **real food**: New USDA row is skipped

**Duplicate log**: Check `scripts/usda/output/duplicates.jsonl` for details on all UPC collisions.

### "TypeError: fetch failed" or connection errors

**Cause**: Transient network issues with Supabase (ECONNRESET, ETIMEDOUT, 502/503/504).

**How it's handled** (automatic):
- The script retries transient errors up to 5 times with exponential backoff (500ms, 1s, 2s, 4s, 8s + jitter)
- UPC collisions do NOT count toward consecutive error limit
- Only persistent hard failures count toward the `--max-consecutive-errors` stop condition
- All errors are logged to `scripts/usda/output/errors.jsonl` for review

**If still failing**:
- Check Supabase dashboard for rate limiting or outages
- Try smaller batch size: `--batch 100` or `--batch 200`
- Increase max consecutive errors: `--max-consecutive-errors 5`
- Wait a few minutes and re-run (will resume from checkpoint)
- Review error log: `cat scripts/usda/output/errors.jsonl | tail -20`

**Error types in errors.jsonl**:
- `transient_final`: Network error that failed all retries
- `constraint`: Database constraint violation
- `unknown`: Other errors

### "JavaScript heap out of memory"

**Cause**: Trying to load too much data into memory (usually Branded dataset).

**Fix**: The script should automatically use streaming mode for Branded. If still failing:
- Reduce batch size: `--batch 200`
- Increase Node memory: `NODE_OPTIONS="--max-old-space-size=8192" npx tsx ...`

### Checkpoint shows "Skipped: X" with 0 inserts

**Cause**: The checkpoint advanced past data that failed to insert.

**Fix** (as of latest version): Checkpoints now only advance on successful batches. To retry:
1. Delete the checkpoint: `rm scripts/usda/.checkpoints/<dataset>.json`
2. Or use: `--reset-checkpoint`
3. Fix the underlying issue (usually missing constraint)
4. Re-run ingestion

### Ingestion is very slow

**Tips**:
- Foundation: ~1000 foods/sec expected
- Branded (streaming): ~100-200 foods/sec expected (slower due to nutrient lookups)
- Use `--batch 1000` for faster processing (more memory)
- Ensure Supabase isn't rate-limiting (check dashboard)

---

## Column Mapping Reference

### Identity Fields

| food_objects Column | Source |
|---------------------|--------|
| `canonical_name` | `food.description` (title case, trimmed) |
| `brand_name` | `branded_food.brand_owner` or `branded_food.brand_name` |
| `aliases` | Original description + brand combo |
| `source_provider` | `'usda'` |
| `source_id` | `food.fdc_id` (as string) |
| `source_type` | `'branded'` for branded dataset, `'common'` for others |

### Serving Fields

| food_objects Column | Branded Source | Other Datasets |
|---------------------|----------------|----------------|
| `serving_size_g` | `branded_food.serving_size` | `food_portion.gram_weight` |
| `serving_unit` | `branded_food.serving_size_unit` | Derived from `portion_description` |
| `serving_description` | Built from serving_size + unit | `food_portion.portion_description` |
| `household_serving_text` | `branded_food.household_serving_fulltext` | `food_portion.modifier` |

### Provenance Fields

| food_objects Column | Value |
|---------------------|-------|
| `nutrient_provenance` | `'usda'` |
| `nutrient_confidence` | `'high'` for foundation, `'medium'` for others |
| `is_verified` | `true` |
| `is_deleted` | `false` |
| `person_id` | `null` |

---

## Search Ranking

After ingestion, search results prioritize:

1. User's own foods (`source_type='user'`, `person_id=current_user`)
2. User's favorites
3. Branded foods (USDA branded + commercial)
4. Common foods (USDA foundation/sr/survey)

High-confidence USDA foundation foods get a small score boost.

---

## Notes

- **CRITICAL**: All USDA nutrient values in the source CSV files are **per 100g**
- The ingestion script **automatically scales** these values to match the actual `serving_size_g`
  - Example: If serving_size_g = 30g, nutrients are multiplied by (30/100) = 0.3
  - This ensures stored nutrients represent the actual serving, not per 100g
- Branded serving sizes vary; we store nutrients as provided by the label
- Empty/null nutrient values are stored as null, not 0
- Description is stored in original case for `aliases`, normalized for `canonical_name`

## Bug Fix (2026-03-06)

**Issue**: Prior to 2026-03-06, USDA nutrients were stored as per-100g values without scaling to serving size. This caused all USDA foods to show inflated nutrition numbers (e.g., 30g serving showing 100g worth of nutrients).

**Fix**: 
- Updated `ingestFdc.ts` to scale nutrients: `scaled = usda_value * (serving_size_g / 100)`
- Created `fixNutrientScaling.ts` migration script to fix existing data
- Run: `npx tsx scripts/usda/fixNutrientScaling.ts --execute` to correct database
