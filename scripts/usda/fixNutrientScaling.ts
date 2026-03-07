/**
 * Fix USDA Nutrient Scaling Bug
 * 
 * Problem: USDA nutrient data was ingested as per-100g values but stored
 * as if they were per-serving values. This caused all USDA foods to show
 * inflated nutrition numbers.
 * 
 * Solution: Scale all USDA nutrients by (serving_size_g / 100)
 * 
 * Usage:
 *   npx tsx scripts/usda/fixNutrientScaling.ts --dry-run
 *   npx tsx scripts/usda/fixNutrientScaling.ts --execute
 * 
 * Options:
 *   --dry-run     Preview changes without updating (default)
 *   --execute     Apply the fix to the database
 *   --batch N     Batch size (default: 500)
 *   --limit N     Max foods to process (for testing)
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface ParsedArgs {
  dryRun: boolean;
  batchSize: number;
  limit?: number;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let dryRun = true;
  let batchSize = 500;
  let limit: number | undefined;
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--execute') {
      dryRun = false;
    } else if (arg === '--batch' && args[i + 1]) {
      batchSize = parseInt(args[++i], 10);
    } else if (arg === '--limit' && args[i + 1]) {
      limit = parseInt(args[++i], 10);
    }
  }
  
  return { dryRun, batchSize, limit };
}

interface FoodRow {
  id: string;
  canonical_name: string;
  serving_size_g: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
  sodium_mg: number | null;
  potassium_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  folate_ug: number | null;
  vitamin_a_ug_rae: number | null;
  vitamin_c_mg: number | null;
  vitamin_d_ug: number | null;
  vitamin_b12_ug: number | null;
  nutrients_extended: Record<string, number> | null;
}

function scaleNutrient(value: number | null, scaleFactor: number): number | null {
  if (value === null || value === undefined) return null;
  return Number((value * scaleFactor).toFixed(2));
}

function scaleNutrientInt(value: number | null, scaleFactor: number): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(value * scaleFactor);
}

async function main() {
  const options = parseArgs();
  
  console.log('\n🔧 USDA Nutrient Scaling Fix\n');
  console.log(`Mode: ${options.dryRun ? '🔍 DRY RUN (preview only)' : '✅ EXECUTE (will update database)'}`);
  console.log(`Batch size: ${options.batchSize}`);
  if (options.limit) console.log(`Limit: ${options.limit} foods`);
  console.log('');
  
  if (options.dryRun) {
    console.log('⚠️  DRY RUN MODE: No changes will be made');
    console.log('   Run with --execute to apply fixes\n');
  }
  
  // Query all USDA foods
  console.log('📊 Querying USDA foods...');
  
  let query = supabase
    .from('food_objects')
    .select(`
      id,
      canonical_name,
      serving_size_g,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sugar_g,
      sodium_mg,
      potassium_mg,
      magnesium_mg,
      iron_mg,
      calcium_mg,
      zinc_mg,
      folate_ug,
      vitamin_a_ug_rae,
      vitamin_c_mg,
      vitamin_d_ug,
      vitamin_b12_ug,
      nutrients_extended
    `)
    .eq('source_provider', 'usda')
    .eq('is_deleted', false)
    .order('id');
  
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  const { data: foods, error } = await query;
  
  if (error) {
    console.error('❌ Query error:', error.message);
    process.exit(1);
  }
  
  if (!foods || foods.length === 0) {
    console.log('✓ No USDA foods found');
    return;
  }
  
  console.log(`✓ Found ${foods.length} USDA foods to fix\n`);
  
  // Show sample before/after for first 3 foods
  console.log('📋 Sample transformations:\n');
  for (let i = 0; i < Math.min(3, foods.length); i++) {
    const food = foods[i] as FoodRow;
    const scaleFactor = food.serving_size_g / 100;
    
    console.log(`${i + 1}. ${food.canonical_name}`);
    console.log(`   Serving: ${food.serving_size_g}g (scale factor: ${scaleFactor.toFixed(3)})`);
    console.log(`   Calories: ${food.calories} → ${scaleNutrientInt(food.calories, scaleFactor)}`);
    console.log(`   Protein: ${food.protein_g}g → ${scaleNutrient(food.protein_g, scaleFactor)}g`);
    console.log(`   Carbs: ${food.carbs_g}g → ${scaleNutrient(food.carbs_g, scaleFactor)}g`);
    console.log(`   Fat: ${food.fat_g}g → ${scaleNutrient(food.fat_g, scaleFactor)}g`);
    console.log('');
  }
  
  if (options.dryRun) {
    console.log(`\n✓ Dry run complete. ${foods.length} foods would be updated.`);
    console.log('\nRun with --execute to apply these changes.');
    return;
  }
  
  // Process in batches
  console.log('🔄 Updating foods...\n');
  
  let updated = 0;
  let errors = 0;
  const startTime = Date.now();
  
  for (let i = 0; i < foods.length; i += options.batchSize) {
    const batch = foods.slice(i, i + options.batchSize);
    const updates = batch.map((food) => {
      const f = food as FoodRow;
      const scaleFactor = f.serving_size_g / 100;
      
      // Scale extended nutrients
      let scaledExtended: Record<string, number> | null = null;
      if (f.nutrients_extended && Object.keys(f.nutrients_extended).length > 0) {
        scaledExtended = {};
        for (const [key, value] of Object.entries(f.nutrients_extended)) {
          scaledExtended[key] = Number((value * scaleFactor).toFixed(2));
        }
      }
      
      return {
        id: f.id,
        calories: scaleNutrientInt(f.calories, scaleFactor),
        protein_g: scaleNutrient(f.protein_g, scaleFactor),
        carbs_g: scaleNutrient(f.carbs_g, scaleFactor),
        fat_g: scaleNutrient(f.fat_g, scaleFactor),
        fiber_g: scaleNutrient(f.fiber_g, scaleFactor),
        sugar_g: scaleNutrient(f.sugar_g, scaleFactor),
        sodium_mg: scaleNutrientInt(f.sodium_mg, scaleFactor),
        potassium_mg: scaleNutrientInt(f.potassium_mg, scaleFactor),
        magnesium_mg: scaleNutrientInt(f.magnesium_mg, scaleFactor),
        iron_mg: scaleNutrient(f.iron_mg, scaleFactor),
        calcium_mg: scaleNutrientInt(f.calcium_mg, scaleFactor),
        zinc_mg: scaleNutrient(f.zinc_mg, scaleFactor),
        folate_ug: scaleNutrientInt(f.folate_ug, scaleFactor),
        vitamin_a_ug_rae: scaleNutrientInt(f.vitamin_a_ug_rae, scaleFactor),
        vitamin_c_mg: scaleNutrient(f.vitamin_c_mg, scaleFactor),
        vitamin_d_ug: scaleNutrient(f.vitamin_d_ug, scaleFactor),
        vitamin_b12_ug: scaleNutrient(f.vitamin_b12_ug, scaleFactor),
        nutrients_extended: scaledExtended,
      };
    });
    
    try {
      const { error: updateError } = await supabase
        .from('food_objects')
        .upsert(updates);
      
      if (updateError) throw updateError;
      
      updated += batch.length;
      
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round(updated / elapsed);
      const progress = ((updated / foods.length) * 100).toFixed(1);
      
      console.log(`   ✓ ${updated}/${foods.length} (${progress}%) - ${rate} foods/sec`);
    } catch (error) {
      console.error(`   ❌ Batch error:`, (error as Error).message);
      errors += batch.length;
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n✅ Complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Time: ${totalTime}s`);
}

main().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
