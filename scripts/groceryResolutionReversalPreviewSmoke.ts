/**
 * Preview-only resolution reversal smoke (zero SerpAPI calls).
 *
 * Usage:
 *   npx tsx scripts/groceryResolutionReversalPreviewSmoke.ts
 */

import { randomUUID } from 'crypto';
import { loadEnvConfig } from '@next/env';

const PERSON_ID = process.env.GROCERY_RESOLUTION_SMOKE_PERSON_ID ?? '893f480f-85d3-4332-9d08-605952f7cae1';
const RESOLVE_FOOD_A = process.env.GROCERY_RESOLUTION_SMOKE_FOOD_A ?? 'bd09fc58-38c3-47f4-96fd-40869cb6dda1';
const RESOLVE_FOOD_B = process.env.GROCERY_RESOLUTION_SMOKE_FOOD_B ?? '1432c6e3-45b7-4a8e-b3f1-46f343a376ed';

interface SmokeResult {
  name: string;
  status: 'pass' | 'fail';
  detail: string;
}

const results: SmokeResult[] = [];

function pass(name: string, detail: string): void {
  results.push({ name, status: 'pass', detail });
  console.log(`PASS  ${name}: ${detail}`);
}

function fail(name: string, detail: string): never {
  results.push({ name, status: 'fail', detail });
  console.error(`FAIL  ${name}: ${detail}`);
  throw new Error(`${name}: ${detail}`);
}

async function main() {
  loadEnvConfig(process.cwd());

  const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
  const {
    changeGroceryItemResolution,
    deriveItemsFromMeals,
    markGroceryItemUnresolved,
    resolveGroceryItemIngredient,
  } = await import('@/lib/plans/groceryServerService');
  const { listGroceryIngredientResolutions } = await import('@/lib/plans/groceryStateStore');

  const smokeName = `preview smoke herb ${randomUUID().slice(0, 8)}`;
  const resolutionKey = `${smokeName.toLowerCase()}::`;

  const planId = randomUUID();
  const listId = randomUUID();
  const itemId = randomUUID();

  console.log(`Preview resolution reversal smoke — person=${PERSON_ID}`);

  const { data: planRow, error: planErr } = await supabaseAdmin.from('plans').insert({
    id: planId,
    person_id: PERSON_ID,
    title: 'Preview resolution reversal smoke plan',
    plan_shape: 'week',
    source: 'ai_generated',
    status: 'active',
    start_date: '2026-07-15',
    end_date: '2026-07-21',
    input_snapshot_json: { smoke: true },
    nds_version: 'nds_daily_2026-01-26.v10',
    classifier_version: 'processing_classifier_2026-02-08.v2',
  }).select('id').single();
  if (planErr || !planRow) {
    fail('setup_plan', planErr?.message ?? 'plan insert failed');
  }

  const { error: listErr } = await supabaseAdmin.from('generated_grocery_lists').insert({
    id: listId,
    plan_id: planId,
    person_id: PERSON_ID,
    title: 'Preview resolution reversal smoke list',
    date_range_start: '2026-07-15',
    date_range_end: '2026-07-15',
    mode: 'manual',
    status: 'draft',
    export_payload_json: {},
  });
  if (listErr) {
    fail('setup_list', listErr.message);
  }

  const { error: itemErr } = await supabaseAdmin.from('grocery_items').insert({
    id: itemId,
    grocery_list_id: listId,
    person_id: PERSON_ID,
    name: smokeName,
    quantity: 1,
    unit: null,
    aisle_category: null,
    food_object_id: null,
    source_planned_meal_ids: [],
    status: 'pending',
    notes: null,
  });
  if (itemErr) {
    fail('setup_item', itemErr.message);
  }

  try {
    const resolved = await resolveGroceryItemIngredient({
      personId: PERSON_ID,
      itemId,
      foodObjectId: RESOLVE_FOOD_A,
    });
    if (resolved.item.food_object_id !== RESOLVE_FOOD_A) {
      fail('resolve_seed', `expected ${RESOLVE_FOOD_A}, got ${resolved.item.food_object_id}`);
    }
    pass('resolve_seed', `grounded item=${itemId} food=${RESOLVE_FOOD_A}`);

    const changed = await changeGroceryItemResolution({
      personId: PERSON_ID,
      itemId,
      foodObjectId: RESOLVE_FOOD_B,
    });
    if (changed.item.food_object_id !== RESOLVE_FOOD_B) {
      fail('change_resolution', `expected ${RESOLVE_FOOD_B}, got ${changed.item.food_object_id}`);
    }

    const { data: refreshedItem, error: refreshErr } = await supabaseAdmin
      .from('grocery_items')
      .select('*')
      .eq('id', itemId)
      .eq('person_id', PERSON_ID)
      .single();
    if (refreshErr || !refreshedItem) {
      fail('change_resolution_refresh', refreshErr?.message ?? 'missing item');
    }
    if (refreshedItem.food_object_id !== RESOLVE_FOOD_B) {
      fail('change_resolution_refresh', `persisted food=${refreshedItem.food_object_id}`);
    }

    const resolutionsAfterChange = await listGroceryIngredientResolutions(PERSON_ID);
    const learned = resolutionsAfterChange.find((row) => row.key === resolutionKey);
    if (!learned || learned.food_object_id !== RESOLVE_FOOD_B) {
      fail('change_resolution_mapping', `mapping missing or food=${learned?.food_object_id ?? 'none'}`);
    }
    pass('change_resolution_persistence', `refresh food=${RESOLVE_FOOD_B} key=${resolutionKey}`);

    const downgraded = await markGroceryItemUnresolved({ personId: PERSON_ID, itemId });
    if (downgraded.item.food_object_id !== null) {
      fail('mark_unresolved', `expected null food_object_id, got ${downgraded.item.food_object_id}`);
    }

    const { data: revokedRow, error: revokedErr } = await supabaseAdmin
      .from('grocery_ingredient_resolution_revocations')
      .select('key')
      .eq('person_id', PERSON_ID)
      .eq('key', resolutionKey)
      .maybeSingle();
    if (revokedErr || !revokedRow) {
      fail('mark_unresolved_tombstone', revokedErr?.message ?? 'revocation row missing');
    }

    const resolutionsAfterRevoke = await listGroceryIngredientResolutions(PERSON_ID);
    if (resolutionsAfterRevoke.some((row) => row.key === resolutionKey)) {
      fail('mark_unresolved_mapping_removed', 'learned mapping still present');
    }
    pass('mark_unresolved', `tombstone=${resolutionKey} mapping removed`);

    const derived = deriveItemsFromMeals(
      [
        {
          id: 'meal-smoke',
          plan_id: planId,
          plan_day_id: 'day-smoke',
          plan_slot_id: 'slot-smoke',
          person_id: PERSON_ID,
          name: 'Smoke meal',
          meal_type: 'dinner',
          payload: {
            items: [{ name: smokeName, quantity: 1, unit: null, food_object_id: null }],
          },
          source_template_id: null,
          source_imported_meal_id: null,
          reusable_provenance: null,
          execution_state: 'pending',
          journal_entry_id: null,
          protein_score_10: null,
          is_main_meal: false,
          psq_multiplier: 1,
          meal_derived_data: {
            protein_score_10: null,
            is_main_meal: false,
            meal_calories: 0,
            meal_protein_g: 0,
            psq_multiplier: 1,
          },
          nds_confidence: 'medium',
          nds_version: '1',
          classifier_version: '1',
          created_at: '',
          updated_at: '',
        },
      ],
      resolutionsAfterRevoke,
    );
    if (derived[0]?.food_object_id !== null) {
      fail('regeneration_stays_unresolved', `derived food=${derived[0]?.food_object_id ?? 'missing'}`);
    }
    pass('regeneration_stays_unresolved', 'deriveItemsFromMeals left row unresolved');

    console.log('\nSummary:');
    console.log(JSON.stringify({ paid_serpapi_calls: 0, results }, null, 2));
  } finally {
    await supabaseAdmin.from('grocery_ingredient_resolution_revocations').delete()
      .eq('person_id', PERSON_ID)
      .eq('key', resolutionKey);
    await supabaseAdmin.from('grocery_ingredient_resolutions').delete()
      .eq('person_id', PERSON_ID)
      .eq('key', resolutionKey);
    await supabaseAdmin.from('grocery_items').delete().eq('id', itemId);
    await supabaseAdmin.from('generated_grocery_lists').delete().eq('id', listId);
    await supabaseAdmin.from('plans').delete().eq('id', planId);
  }
}

main()
  .then(() => {
    if (results.some((row) => row.status === 'fail')) process.exit(1);
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nSmoke aborted:', error instanceof Error ? error.message : error);
    console.log(JSON.stringify({ paid_serpapi_calls: 0, results }, null, 2));
    process.exit(1);
  });
