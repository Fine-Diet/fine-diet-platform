# USDA Nutrient Scaling Fix

## Problem

**Discovered**: 2026-01-22  
**Impact**: All USDA foods in the database had incorrect (inflated) nutrition values

### Root Cause

The USDA FoodData Central CSV files provide nutrient values on a **per-100g basis**. However, the ingestion script (`scripts/usda/ingestFdc.ts`) was directly storing these per-100g values into the `food_objects` table as if they were per-serving values.

**Example of the bug:**
- Product: 365 Almonds, Roasted & Unsalted
- Actual serving: 30g (1/4 cup)
- Actual calories: 180 per serving
- **Bug**: App showed 607 calories (which is the per-100g value)
- **Issue**: Nutrients were ~3.33x too high (100g / 30g = 3.33)

### Why This Happened

In the original ingestion logic, the script would:
1. Read nutrient amounts from USDA CSV (e.g., 607 calories per 100g)
2. Store directly: `foodObject.calories = nutrients.calories` 
3. ❌ Missing step: Scale by `(serving_size_g / 100)`

## Solution

### 1. Fixed Ingestion Script

Updated `scripts/usda/ingestFdc.ts` at three locations where nutrients are assigned:

**Before:**
```typescript
foodObject.calories = nutrients.calories ?? null;
foodObject.protein_g = nutrients.protein_g ?? null;
// ... etc
```

**After:**
```typescript
// USDA nutrients are per 100g - scale to actual serving size
const scaleFactor = servingSizeG / 100;

foodObject.calories = nutrients.calories !== undefined 
  ? Math.round(nutrients.calories * scaleFactor) : null;
foodObject.protein_g = nutrients.protein_g !== undefined 
  ? Number((nutrients.protein_g * scaleFactor).toFixed(1)) : null;
// ... etc (applies to all nutrient fields)
```

**Locations fixed:**
- Line ~1673: Small datasets (in-memory nutrient map)
- Line ~1714: Large datasets (batch nutrient loading)
- Line ~1738: Second batch location

### 2. Created Migration Script

Created `scripts/usda/fixNutrientScaling.ts` to fix existing data in the database.

**Usage:**

```bash
# Preview changes (dry run)
npx tsx scripts/usda/fixNutrientScaling.ts --dry-run

# Apply fix to all USDA foods
npx tsx scripts/usda/fixNutrientScaling.ts --execute

# Test with limited foods
npx tsx scripts/usda/fixNutrientScaling.ts --execute --limit 100

# Custom batch size
npx tsx scripts/usda/fixNutrientScaling.ts --execute --batch 1000
```

**What the migration does:**
1. Queries all USDA foods from `food_objects` table
2. For each food, calculates: `scaleFactor = serving_size_g / 100`
3. Multiplies all nutrient values by the scale factor
4. Updates the database in batches

### 3. Updated Documentation

Updated `docs/USDA-INGESTION.md` to clarify:
- USDA source data is per 100g
- Ingestion script now scales to actual serving size
- Added bug fix notes with date and instructions

## Verification

**Before fix (365 Almonds, 30g serving):**
- Displayed: ~607 calories (incorrect, showing per-100g)
- Expected: 180 calories (per actual 30g serving)
- Error: 3.37x too high

**After fix:**
- Calculated: 607 * (30/100) = 182 calories ✓
- Rounding: 182 → 180 (close to label)
- All macros scale correctly

## Impact

- **Affects**: All USDA foods ingested before 2026-01-22
- **Severity**: High - all USDA nutrition data was inflated
- **Foods affected**: Varies by serving size
  - 30g serving → 3.33x too high
  - 50g serving → 2.0x too high
  - 100g serving → No error (coincidentally correct)

## Action Required

1. ✅ **Code fix**: Applied to `ingestFdc.ts`
2. ⏳ **Database fix**: Run migration script
   ```bash
   npx tsx scripts/usda/fixNutrientScaling.ts --execute
   ```
3. ⏳ **Re-ingest**: Optionally re-run USDA ingestion for fresh data
   ```bash
   npx tsx scripts/usda/ingestFdc.ts --config branded --execute
   ```

## Future Prevention

- Added inline comments explaining the scaling logic
- Updated documentation with explicit notes about per-100g source data
- Migration script serves as reference for data validation

## Files Changed

- `scripts/usda/ingestFdc.ts` - Added nutrient scaling
- `scripts/usda/fixNutrientScaling.ts` - New migration script
- `docs/USDA-INGESTION.md` - Updated with scaling notes
- `docs/NUTRIENT-SCALING-FIX.md` - This document
