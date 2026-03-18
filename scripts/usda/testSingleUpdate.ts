import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // First, get the current values
  console.log('\n🔍 Step 1: Get current almond data...\n');
  
  const { data: before, error: fetchError } = await supabase
    .from('food_objects')
    .select('id, canonical_name, serving_size_g, calories, protein_g, carbs_g, fat_g')
    .eq('canonical_name', '365 Everyday Value, Roasted & Unsalted Almonds')
    .single();
  
  if (fetchError || !before) {
    console.error('❌ Fetch error:', fetchError);
    return;
  }
  
  console.log(`Product: ${before.canonical_name}`);
  console.log(`ID: ${before.id}`);
  console.log(`Serving: ${before.serving_size_g}g`);
  console.log(`\nCurrent (WRONG - per 100g):`);
  console.log(`  Calories: ${before.calories}`);
  console.log(`  Protein: ${before.protein_g}g`);
  console.log(`  Carbs: ${before.carbs_g}g`);
  console.log(`  Fat: ${before.fat_g}g`);
  
  // Calculate correct values
  const scaleFactor = before.serving_size_g / 100;
  const correctCal = Math.round(before.calories! * scaleFactor);
  const correctProtein = Number((before.protein_g! * scaleFactor).toFixed(2));
  const correctCarbs = Number((before.carbs_g! * scaleFactor).toFixed(2));
  const correctFat = Number((before.fat_g! * scaleFactor).toFixed(2));
  
  console.log(`\nScale factor: ${before.serving_size_g}g / 100g = ${scaleFactor}`);
  console.log(`\nCalculated CORRECT (per ${before.serving_size_g}g serving):`);
  console.log(`  Calories: ${correctCal}`);
  console.log(`  Protein: ${correctProtein}g`);
  console.log(`  Carbs: ${correctCarbs}g`);
  console.log(`  Fat: ${correctFat}g`);
  
  // Now try to update
  console.log(`\n🔄 Step 2: Attempting update...`);
  
  const { error: updateError } = await supabase
    .from('food_objects')
    .update({
      calories: correctCal,
      protein_g: correctProtein,
      carbs_g: correctCarbs,
      fat_g: correctFat,
    })
    .eq('id', before.id);
  
  if (updateError) {
    console.error('❌ Update error:', updateError);
    return;
  }
  
  console.log('✓ Update successful');
  
  // Verify the update
  console.log(`\n✅ Step 3: Verify update...\n`);
  
  const { data: after, error: verifyError } = await supabase
    .from('food_objects')
    .select('calories, protein_g, carbs_g, fat_g')
    .eq('id', before.id)
    .single();
  
  if (verifyError || !after) {
    console.error('❌ Verify error:', verifyError);
    return;
  }
  
  console.log(`After update:`);
  console.log(`  Calories: ${after.calories}`);
  console.log(`  Protein: ${after.protein_g}g`);
  console.log(`  Carbs: ${after.carbs_g}g`);
  console.log(`  Fat: ${after.fat_g}g`);
  
  if (after.calories === correctCal) {
    console.log(`\n✅ SUCCESS! Values are now correct.`);
  } else {
    console.log(`\n❌ FAILED! Values did not update correctly.`);
    console.log(`   Expected ${correctCal}, got ${after.calories}`);
  }
}

main().catch(console.error);
