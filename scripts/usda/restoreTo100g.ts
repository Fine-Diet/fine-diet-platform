/**
 * Restore USDA nutrients to per-100g baseline
 * 
 * This reverses any previous scaling by multiplying by (100 / serving_size_g)
 * Run this before fixNutrientScaling.ts if you've accidentally run it multiple times
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

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

function unscaleNutrient(value: number | null, scaleFactor: number): number | null {
  if (value === null || value === undefined || value === 0) return value;
  return Number((value / scaleFactor).toFixed(2));
}

function unscaleNutrientInt(value: number | null, scaleFactor: number): number | null {
  if (value === null || value === undefined || value === 0) return value;
  return Math.round(value / scaleFactor);
}

async function main() {
  console.log('\n🔄 Restoring USDA nutrients to per-100g baseline\n');
  console.log('This will REVERSE any scaling and return values to per-100g\n');
  
  const { data: foods, error } = await supabase
    .from('food_objects')
    .select(`
      id,
      canonical_name,
      serving_size_g,
      calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g,
      sodium_mg, potassium_mg, magnesium_mg, iron_mg, calcium_mg, zinc_mg,
      folate_ug, vitamin_a_ug_rae, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug,
      nutrients_extended
    `)
    .eq('source_provider', 'usda')
    .eq('is_deleted', false);
  
  if (error || !foods || foods.length === 0) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Found ${foods.length} USDA foods\n`);
  console.log('Sample restorations:\n');
  
  for (let i = 0; i < Math.min(3, foods.length); i++) {
    const food = foods[i] as FoodRow;
    const scaleFactor = food.serving_size_g / 100;
    console.log(`${i + 1}. ${food.canonical_name}`);
    console.log(`   Serving: ${food.serving_size_g}g (reverse scale: ${(100 / food.serving_size_g).toFixed(3)})`);
    console.log(`   Calories: ${food.calories} → ${unscaleNutrientInt(food.calories, scaleFactor)}`);
    console.log('');
  }
  
  console.log('🔄 Restoring...\n');
  
  let updated = 0;
  const batchSize = 100;
  const startTime = Date.now();
  
  for (let i = 0; i < foods.length; i += batchSize) {
    const batch = foods.slice(i, i + batchSize);
    
    for (const food of batch) {
      const f = food as FoodRow;
      const scaleFactor = f.serving_size_g / 100;
      
      let restoredExtended: Record<string, number> | null = null;
      if (f.nutrients_extended && Object.keys(f.nutrients_extended).length > 0) {
        restoredExtended = {};
        for (const [key, value] of Object.entries(f.nutrients_extended)) {
          restoredExtended[key] = Number((value / scaleFactor).toFixed(2));
        }
      }
      
      const { error: updateError } = await supabase
        .from('food_objects')
        .update({
          calories: unscaleNutrientInt(f.calories, scaleFactor),
          protein_g: unscaleNutrient(f.protein_g, scaleFactor),
          carbs_g: unscaleNutrient(f.carbs_g, scaleFactor),
          fat_g: unscaleNutrient(f.fat_g, scaleFactor),
          fiber_g: unscaleNutrient(f.fiber_g, scaleFactor),
          sugar_g: unscaleNutrient(f.sugar_g, scaleFactor),
          sodium_mg: unscaleNutrientInt(f.sodium_mg, scaleFactor),
          potassium_mg: unscaleNutrientInt(f.potassium_mg, scaleFactor),
          magnesium_mg: unscaleNutrientInt(f.magnesium_mg, scaleFactor),
          iron_mg: unscaleNutrient(f.iron_mg, scaleFactor),
          calcium_mg: unscaleNutrientInt(f.calcium_mg, scaleFactor),
          zinc_mg: unscaleNutrient(f.zinc_mg, scaleFactor),
          folate_ug: unscaleNutrientInt(f.folate_ug, scaleFactor),
          vitamin_a_ug_rae: unscaleNutrientInt(f.vitamin_a_ug_rae, scaleFactor),
          vitamin_c_mg: unscaleNutrient(f.vitamin_c_mg, scaleFactor),
          vitamin_d_ug: unscaleNutrient(f.vitamin_d_ug, scaleFactor),
          vitamin_b12_ug: unscaleNutrient(f.vitamin_b12_ug, scaleFactor),
          nutrients_extended: restoredExtended,
        })
        .eq('id', f.id);
      
      if (updateError) {
        console.error(`Error updating ${f.canonical_name}:`, updateError);
      }
    }
    
    updated += batch.length;
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = Math.round(updated / elapsed);
    const progress = ((updated / foods.length) * 100).toFixed(1);
    console.log(`   ✓ ${updated}/${foods.length} (${progress}%) - ${rate} foods/sec`);
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Restored ${updated} foods to per-100g baseline in ${totalTime}s`);
  console.log('\nNow run: npx tsx scripts/usda/fixNutrientScaling.ts --execute');
}

main().catch(console.error);
