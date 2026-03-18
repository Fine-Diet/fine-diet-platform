import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('\n🔍 Full record inspection for 365 Roasted & Unsalted Almonds\n');

  const { data, error } = await supabase
    .from('food_objects')
    .select('*')
    .eq('canonical_name', '365 Everyday Value, Roasted & Unsalted Almonds')
    .single();

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (!data) {
    console.log('❌ Record not found at all');
    return;
  }

  console.log('id:              ', data.id);
  console.log('is_deleted:      ', data.is_deleted);
  console.log('source_provider: ', data.source_provider);
  console.log('source_id:       ', data.source_id);
  console.log('upc:             ', data.upc);
  console.log('serving_size_g:  ', data.serving_size_g);
  console.log('serving_unit:    ', data.serving_unit);
  console.log('calories:        ', data.calories);
  console.log('protein_g:       ', data.protein_g);
  console.log('carbs_g:         ', data.carbs_g);
  console.log('fat_g:           ', data.fat_g);
  console.log('nutrients_extended count:', data.nutrients_extended ? Object.keys(data.nutrients_extended).length : 0);

  if (data.is_deleted) {
    console.log('\n❌ RECORD IS SOFT-DELETED (is_deleted=true) — invisible to users');
  }
  if (data.calories === null) {
    console.log('\n❌ NUTRIENTS ARE NULL — ingestion did not load nutrients for this item');
  }
  if (data.upc === null) {
    console.log('\n⚠️  UPC is null — was cleared during soft-delete and not restored');
  }
}

main().catch(console.error);
