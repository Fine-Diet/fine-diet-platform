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
  "lastRunAt": "2024-01-15T10:30:00Z"
}
```

**Important**: Checkpoints only advance after successful batches. If a batch fails, the checkpoint stays at the last successful position, allowing safe resume.

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

-- 3. Check Branded UPC coverage
SELECT 
  COUNT(*) AS total_branded,
  COUNT(upc) AS with_upc,
  ROUND(100.0 * COUNT(upc) / COUNT(*), 1) AS upc_percent
FROM food_objects 
WHERE source_provider = 'usda' AND source_type = 'branded';

-- 4. Sample search for "apple"
SELECT canonical_name, brand_name, calories, protein_g, source_type
FROM food_objects
WHERE source_provider = 'usda'
  AND canonical_name ILIKE '%apple%'
ORDER BY source_type, canonical_name
LIMIT 20;

-- 5. Sample UPC lookup (use any known UPC)
SELECT canonical_name, brand_name, calories, upc
FROM food_objects
WHERE upc IS NOT NULL
LIMIT 5;
```

### App Verification

1. **Search test**: Go to Journal → Log → Search for "apple", "broccoli", "chicken"
   - Should see USDA items with calories/macros
   - Foundation items should show in "Common" group
   - Branded items should show in "Branded" group

2. **UPC test** (after Branded ingestion): 
   - Use barcode scanner on a known product
   - Should find the item with nutrition data

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

### "duplicate key value violates unique constraint"

**Cause**: Trying to insert data that already exists.

**Fix**: 
- Use `--since <fdc_id>` to resume from where you left off
- Or delete existing USDA data first:

```sql
DELETE FROM food_objects WHERE source_provider = 'usda';
```

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

- All USDA nutrient values are per 100g by default
- Branded serving sizes vary; we store as provided
- Empty/null nutrient values are stored as null, not 0
- Description is stored in original case for `aliases`, normalized for `canonical_name`
