/**
 * Quick test to verify a specific food item before/after migration
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('\n🔍 Checking 365 Roasted & Unsalted Almonds after migration...\n');
  
  const { data, error } = await supabase
    .from('food_objects')
    .select('id, canonical_name, serving_size_g, serving_unit, calories, protein_g, carbs_g, fat_g, source_provider')
    .eq('canonical_name', '365 Everyday Value, Roasted & Unsalted Almonds')
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  if (!data) {
    console.log('❌ Product not found');
    return;
  }
  
  console.log(`Product: ${data.canonical_name}`);
  console.log(`Source: ${data.source_provider}`);
  console.log(`Serving: ${data.serving_size_g}g ${data.serving_unit || ''}`);
  console.log(`\n📊 Nutrition (should be per-serving now):`);
  console.log(`   Calories: ${data.calories}`);
  console.log(`   Protein: ${data.protein_g}g`);
  console.log(`   Carbs: ${data.carbs_g}g`);
  console.log(`   Fat: ${data.fat_g}g`);
  console.log(`\n✅ Expected for 28g serving: ~170 cal`);
  console.log(`   Status: ${data.calories && data.calories < 200 ? '✅ FIXED' : '❌ STILL WRONG'}`);
}

main().catch(console.error);
