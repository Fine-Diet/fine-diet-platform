# USDA FoodData Central Ingestion

This document describes how Fine Diet ingests USDA FoodData Central (FDC) CSV datasets into the `food_objects` table.

## Data Sources

Location: `data/usa_fdc/`

| Dataset | Folder | Rows | Description |
|---------|--------|------|-------------|
| Foundation | `FoodData_Central_foundation_food_csv_2025-12-18` | ~78K foods | Lab-analyzed whole foods (highest quality) |
| Branded | `FoodData_Central_branded_food_csv_2025-12-18` | ~2M foods | Commercial products with UPCs |
| SR Legacy | `FoodData_Central_sr_legacy_food_csv_2018-04` | ~7.8K foods | Historical USDA Standard Reference |
| Survey (FNDDS) | `FoodData_Central_survey_food_csv_2024-10-31` | ~5.4K foods | Foods as consumed in dietary surveys |

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
| `branded_food.csv` | Branded | UPC, brand, serving info | `fdc_id`, `gtin_upc`, `brand_owner`, `brand_name`, `serving_size`, `serving_size_unit`, `household_serving_fulltext` |
| `food_portion.csv` | Foundation, SR, Survey | Portion/serving info | `fdc_id`, `portion_description`, `gram_weight`, `modifier` |
| `food_category.csv` | Foundation, SR | Category lookup | `id`, `description` |
| `wweia_food_category.csv` | Survey | FNDDS category lookup | `wweia_food_category`, `wweia_food_category_description` |

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

### Priority Order for Energy

Some foods have multiple energy values. Use first available:
1. `1008` - Energy (most common)
2. `2047` - Energy (Atwater General Factors)
3. `2048` - Energy (Atwater Specific Factors)

## Column Mapping to food_objects

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
| `serving_size_g` | `branded_food.serving_size` (if unit is g/ml) | `food_portion.gram_weight` |
| `serving_unit` | `branded_food.serving_size_unit` | Derived from `portion_description` |
| `serving_description` | Built from serving_size + unit | `food_portion.portion_description` |
| `household_serving_text` | `branded_food.household_serving_fulltext` | `food_portion.modifier` |

### Nutrient Fields

All nutrients are stored per `serving_size_g`. For USDA data, values are typically per 100g.

| food_objects Column | Nutrient ID | Notes |
|---------------------|-------------|-------|
| `calories` | 1008/2047/2048 | Use first available |
| `protein_g` | 1003 | |
| `carbs_g` | 1005 | "by difference" |
| `fat_g` | 1004 | |
| `fiber_g` | 1079 | "total dietary" |
| `sugar_g` | 1063 | "Total" |
| `sodium_mg` | 1093 | |

### Provenance Fields

| food_objects Column | Value |
|---------------------|-------|
| `nutrient_provenance` | `'usda'` |
| `nutrient_confidence` | `'high'` for foundation, `'medium'` for others |
| `is_verified` | `true` |
| `is_deleted` | `false` |
| `person_id` | `null` |

### Category Mapping

| Dataset | Source | Notes |
|---------|--------|-------|
| Branded | `branded_food.branded_food_category` | Use as-is |
| Foundation/SR | `food_category.description` | Join via `food_category_id` |
| Survey | `wweia_food_category.wweia_food_category_description` | Join via category number |

### UPC/Barcode

| food_objects Column | Source |
|---------------------|--------|
| `upc` | `branded_food.gtin_upc` (branded only) |

## Ingestion Pipeline

### Scripts

- `scripts/usda/inspectFdcCsv.ts` - Schema discovery (read-only)
- `scripts/usda/ingestFdc.ts` - Main ingestion runner
- `scripts/usda/addUsdaIndexes.sql` - Database indexes

### CLI Usage

```bash
# Inspect CSV structure
npx tsx scripts/usda/inspectFdcCsv.ts

# Ingest specific dataset
npx tsx scripts/usda/ingestFdc.ts --dataset foundation --limit 100
npx tsx scripts/usda/ingestFdc.ts --dataset branded --limit 1000

# Dry run (no inserts)
npx tsx scripts/usda/ingestFdc.ts --dataset foundation --dry-run

# Resume from checkpoint
npx tsx scripts/usda/ingestFdc.ts --dataset branded --since 1500000

# Full ingestion
npx tsx scripts/usda/ingestFdc.ts --dataset all
```

### Checkpoints

Progress is saved to `scripts/usda/.checkpoints/<dataset>.json`:

```json
{
  "dataset": "branded",
  "lastFdcId": "1500000",
  "processed": 50000,
  "inserted": 49500,
  "updated": 500,
  "errors": 0,
  "lastRunAt": "2024-01-15T10:30:00Z"
}
```

### Upsert Strategy

Match on `(source_provider='usda', source_id=<fdc_id>)`:

- **Insert** if no match found
- **Update** nutrients, serving info, names if changed
- **Preserve** `image_url` if already set
- **Log** all changes for audit

## Search Ranking

After ingestion, search results prioritize:

1. User's own foods (`source_type='user'`, `person_id=current_user`)
2. User's favorites
3. Branded foods (USDA branded + commercial)
4. Common foods (USDA foundation/sr/survey)

## Verification Queries

```sql
-- Count by source
SELECT source_provider, source_type, COUNT(*) 
FROM food_objects 
WHERE source_provider = 'usda' 
GROUP BY source_provider, source_type;

-- Check UPC coverage
SELECT COUNT(*) AS total_branded,
       COUNT(upc) AS with_upc,
       COUNT(*) - COUNT(upc) AS missing_upc
FROM food_objects 
WHERE source_provider = 'usda' AND source_type = 'branded';

-- Sample search
SELECT canonical_name, brand_name, calories, protein_g, upc
FROM food_objects
WHERE source_provider = 'usda'
  AND canonical_name ILIKE '%apple%'
LIMIT 10;
```

## Notes

- All USDA nutrient values are per 100g by default
- Branded serving sizes vary; we store as provided
- Empty/null nutrient values are stored as null, not 0
- Description is stored in original case for `aliases`, normalized for `canonical_name`
