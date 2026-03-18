/**
 * Soft-delete all USDA foods so re-ingestion can overwrite them cleanly.
 *
 * Instead of hard DELETE (which triggers slow CASCADE on user_food_preferences),
 * this sets is_deleted=true and clears upc=null so the re-ingestion upsert can:
 *   1. Match each record by source_provider + source_id (not UPC)
 *   2. Overwrite all fields including is_deleted=false and correct nutrients
 *
 * Usage:
 *   npx tsx scripts/usda/deleteUsdaFoods.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const BATCH_SIZE = 200;

async function main() {
  console.log('\n🗑️  Soft-deleting all USDA foods (is_deleted=true, upc=null)\n');
  console.log('   This avoids CASCADE timeouts. Re-ingestion will overwrite these records cleanly.\n');

  let totalUpdated = 0;
  let round = 0;
  const startTime = Date.now();

  while (true) {
    round++;

    // Fetch a batch of IDs
    const { data: rows, error: fetchError } = await supabase
      .from('food_objects')
      .select('id')
      .eq('source_provider', 'usda')
      .eq('is_deleted', false)
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error(`❌ Fetch error on round ${round}:`, fetchError.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) {
      break;
    }

    const ids = rows.map((r) => r.id);

    // UPDATE instead of DELETE — no cascade, much faster
    const { error: updateError } = await supabase
      .from('food_objects')
      .update({ is_deleted: true, upc: null })
      .in('id', ids);

    if (updateError) {
      console.error(`❌ Update error on round ${round}:`, updateError.message);
      process.exit(1);
    }

    totalUpdated += ids.length;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = Math.round(totalUpdated / parseFloat(elapsed));
    console.log(`   ✓ Round ${round}: marked ${ids.length} | total: ${totalUpdated.toLocaleString()} | ${rate}/sec`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Done! Soft-deleted ${totalUpdated.toLocaleString()} USDA foods in ${elapsed}s\n`);
  console.log('Next steps:');
  console.log('   1. rm scripts/usda/.checkpoints/branded.json');
  console.log('   2. npx tsx scripts/usda/ingestFdc.ts --dataset branded --execute\n');
}

main().catch((err) => {
  console.error('💥 Fatal:', err);
  process.exit(1);
});
