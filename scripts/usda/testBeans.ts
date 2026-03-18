import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('\n🔍 Checking Sutter Buttes Pickled Spicy Beans...\n');
  
  const { data, error } = await supabase
    .from('food_objects')
    .select('canonical_name, serving_size_g, calories, protein_g, carbs_g, fat_g')
    .ilike('canonical_name', '%Sutter Buttes%Pickled%Beans%')
    .single();
  
  if (error || !data) {
    console.error('Error:', error);
    return;
  }
  
  console.log(`Product: ${data.canonical_name}`);
  console.log(`Serving: ${data.serving_size_g}g`);
  console.log(`Calories: ${data.calories}`);
  console.log(`Carbs: ${data.carbs_g}g`);
  console.log(`\nExpected carbs for 17g: ~1g (5.88 * 0.17 = 1.0)`);
  console.log(`Status: ${data.carbs_g && data.carbs_g < 2 ? '✅ CORRECT' : '❌ WRONG'}`);
}

main().catch(console.error);
