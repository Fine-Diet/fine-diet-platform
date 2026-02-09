/**
 * NDS Server Service
 * 
 * Server-side service for NDS computation and storage.
 * Handles:
 * - Fetching daily meals with food data
 * - Running daily NDS calculation
 * - Storing results in daily_nds table
 * - Processing the recompute queue
 */

import { supabaseAdmin } from '../supabaseServerClient';
import type { DailyNDS, ProcessingClass } from './types';
import { NDS_VERSION, CLASSIFIER_VERSION } from './types';
import type { DailyMealData, DailyFoodData, DailyNDSResult } from './dailyCalculator';
import { calculateDailyNDS, getEmptyNDS } from './dailyCalculator';
import { computeMealDerivedFromPayload } from './mealDerived';
import { classifyProcessingLevel } from './processingClassifier';

// ============================================================================
// Types
// ============================================================================

interface JournalEntryRow {
  id: string;
  person_id: string;
  entry_type: string;
  occurred_at: string;
  payload: Record<string, unknown>;
  protein_score_10: number | null;
  is_main_meal: boolean | null;
  meal_derived_data: Record<string, unknown> | null;
}

interface FoodObjectRow {
  id: string;
  canonical_name: string;
  brand_name: string | null;
  category: string | null;
  tags: string[] | null;
  calories: number | null;
  protein_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
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
  sodium_mg: number | null;
  processing_class: ProcessingClass | null;
  processing_class_override: ProcessingClass | null;
  nutrients_extended: Record<string, number> | null;
  source_dataset: string | null;
  source_provider: string | null;
}

// ============================================================================
// Data Fetching
// ============================================================================

/**
 * Get day boundaries for a date string (YYYY-MM-DD).
 * Widens query window to cover all timezones.
 */
function getDayBoundaries(dateKey: string): { start: string; end: string } {
  const [y, m, d] = dateKey.split('-').map(Number);
  const startDate = new Date(Date.UTC(y, m - 1, d - 1, 10, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m - 1, d + 1, 14, 0, 0, 0));
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

/**
 * Fetch all journal entries for a person on a specific date.
 */
async function fetchEntriesForDay(
  personId: string,
  dateLocal: string
): Promise<JournalEntryRow[]> {
  const { start, end } = getDayBoundaries(dateLocal);
  
  const { data, error } = await supabaseAdmin
    .from('journal_entries')
    .select('id, person_id, entry_type, occurred_at, payload, protein_score_10, is_main_meal, meal_derived_data')
    .eq('person_id', personId)
    .gte('occurred_at', start)
    .lte('occurred_at', end)
    .order('occurred_at', { ascending: true });
  
  if (error) {
    throw new Error(`Failed to fetch journal entries: ${error.message}`);
  }
  
  return (data || []) as JournalEntryRow[];
}

/**
 * Fetch food object by ID with NDS-relevant fields.
 */
async function fetchFoodObject(foodId: string): Promise<FoodObjectRow | null> {
  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select(`
      id, canonical_name, brand_name, category, tags,
      calories, protein_g, fiber_g, sugar_g,
      potassium_mg, magnesium_mg, iron_mg, calcium_mg, zinc_mg,
      folate_ug, vitamin_a_ug_rae, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug,
      sodium_mg, processing_class, processing_class_override, nutrients_extended,
      source_dataset, source_provider
    `)
    .eq('id', foodId)
    .single();
  
  if (error) {
    console.warn(`[NDS] Could not fetch food ${foodId}: ${error.message}`);
    return null;
  }
  
  return data as FoodObjectRow;
}

/**
 * Transform journal entries into DailyMealData for NDS calculation.
 */
async function transformEntriesToMeals(
  entries: JournalEntryRow[]
): Promise<DailyMealData[]> {
  const meals: DailyMealData[] = [];
  
  for (const entry of entries) {
    // Only process intake entries
    if (entry.entry_type !== 'intake') continue;
    
    const payload = entry.payload || {};
    
    // Get calories and macros from payload
    const calories = typeof payload.calories === 'number' ? payload.calories : 0;
    const macros = payload.macros as { protein?: number; carbs?: number; fat?: number } | undefined;
    const protein_g = macros?.protein ?? 0;
    
    // Estimate fiber (not tracked in current payload, use 0 for now)
    // In future, could get from linked food object
    let fiber_g = 0;
    
    // Get foods data
    const foods: DailyFoodData[] = [];
    
    // If entry has a linked food object, fetch it
    const foodObjectId = payload.foodObjectId as string | undefined;
    if (foodObjectId) {
      const foodData = await fetchFoodObject(foodObjectId);
      if (foodData) {
        // Get fiber from food object
        fiber_g = foodData.fiber_g ?? 0;
        
        // Run processing classifier on-the-fly if no classification exists
        let effectiveProcessingClass = foodData.processing_class;
        if (!effectiveProcessingClass && !foodData.processing_class_override) {
          const classified = classifyProcessingLevel({
            canonical_name: foodData.canonical_name,
            brand_name: foodData.brand_name,
            source_dataset: foodData.source_dataset,
            source_provider: foodData.source_provider,
            category: foodData.category,
            tags: foodData.tags || undefined,
          });
          effectiveProcessingClass = classified.processing_class;
        }
        
        // Create food data entry
        foods.push({
          id: foodData.id,
          canonicalName: foodData.canonical_name,
          brandName: foodData.brand_name,
          category: foodData.category,
          tags: foodData.tags || [],
          calories: foodData.calories ?? 0,
          processingClass: effectiveProcessingClass,
          processingClassOverride: foodData.processing_class_override,
          nutrients: {
            potassium_mg: foodData.potassium_mg,
            magnesium_mg: foodData.magnesium_mg,
            iron_mg: foodData.iron_mg,
            calcium_mg: foodData.calcium_mg,
            zinc_mg: foodData.zinc_mg,
            folate_ug: foodData.folate_ug,
            vitamin_a_ug_rae: foodData.vitamin_a_ug_rae,
            vitamin_c_mg: foodData.vitamin_c_mg,
            vitamin_d_ug: foodData.vitamin_d_ug,
            vitamin_b12_ug: foodData.vitamin_b12_ug,
            sodium_mg: foodData.sodium_mg,
          },
          // Omega data from nutrients_extended if available
          omega3_g: foodData.nutrients_extended?.omega3_g ?? null,
          omega6_g: foodData.nutrients_extended?.omega6_g ?? null,
        });
      }
    } else if (payload.name) {
      // Entry without linked food - create minimal food data from name
      foods.push({
        id: entry.id,
        canonicalName: payload.name as string,
        calories,
      });
    }
    
    // Use stored protein_score or compute from payload
    let proteinScore10 = entry.protein_score_10;
    let isMainMeal = entry.is_main_meal ?? false;
    
    if (proteinScore10 === null) {
      // Compute from payload (fallback)
      const derived = computeMealDerivedFromPayload({
        calories,
        macros,
        name: payload.name as string | undefined,
      });
      proteinScore10 = derived.protein_score_10;
      isMainMeal = derived.is_main_meal;
    }
    
    meals.push({
      id: entry.id,
      calories,
      protein_g,
      fiber_g,
      added_sugar_g: 0, // Not tracked separately yet
      is_main_meal: isMainMeal,
      protein_score_10: proteinScore10,
      foods,
    });
  }
  
  return meals;
}

// ============================================================================
// NDS Storage
// ============================================================================

/**
 * Upsert daily NDS record.
 * Uses ON CONFLICT to handle concurrent writes safely.
 */
async function upsertDailyNDS(
  personId: string,
  dateLocal: string,
  result: DailyNDSResult
): Promise<DailyNDS> {
  const { data, error } = await supabaseAdmin
    .from('daily_nds')
    .upsert(
      {
        person_id: personId,
        date_local: dateLocal,
        nds_score_100: result.nds_score_100,
        wfr_10: result.subscores.wfr_10,
        ps_10: result.subscores.ps_10,
        pnd_10: result.subscores.pnd_10,
        fp_10: result.subscores.fp_10,
        as_10: result.subscores.as_10,
        mnc_10: result.subscores.mnc_10,
        ob_10: result.subscores.ob_10,
        sodium_10: result.subscores.sodium_10,
        nds_version: result.nds_version,
        classifier_version: result.classifier_version,
        debug_data: result.debug_data || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'person_id,date_local',
      }
    )
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to upsert daily_nds: ${error.message}`);
  }
  
  return data as DailyNDS;
}

/**
 * Fetch stored daily NDS for a person and date.
 */
export async function getDailyNDS(
  personId: string,
  dateLocal: string
): Promise<DailyNDS | null> {
  const { data, error } = await supabaseAdmin
    .from('daily_nds')
    .select('*')
    .eq('person_id', personId)
    .eq('date_local', dateLocal)
    .maybeSingle();
  
  if (error) {
    console.error(`[NDS] Error fetching daily_nds: ${error.message}`);
    return null;
  }
  
  return data as DailyNDS | null;
}

// ============================================================================
// Main Recompute Function
// ============================================================================

/**
 * Recompute daily NDS for a person on a specific date.
 * 
 * This is the main entry point called by the recompute pipeline.
 * It's idempotent - can be called multiple times safely.
 */
export async function recomputeDailyNDS(
  personId: string,
  dateLocal: string,
  includeDebug = false
): Promise<DailyNDS> {
  console.log(`[NDS] Recomputing NDS for person=${personId} date=${dateLocal}`);
  
  // 1. Fetch journal entries for the day
  const entries = await fetchEntriesForDay(personId, dateLocal);
  console.log(`[NDS] Found ${entries.length} entries`);
  
  // 2. Transform to meal data
  const meals = await transformEntriesToMeals(entries);
  console.log(`[NDS] Transformed to ${meals.length} meals`);
  
  // 3. Calculate NDS
  const result = meals.length > 0 
    ? calculateDailyNDS(meals, includeDebug)
    : getEmptyNDS();
  
  console.log(`[NDS] Calculated NDS: ${result.nds_score_100}`);
  
  // 4. Store result
  const stored = await upsertDailyNDS(personId, dateLocal, result);
  console.log(`[NDS] Stored daily_nds id=${stored.id}`);
  
  return stored;
}

// ============================================================================
// Queue Processing
// ============================================================================

/**
 * Process pending items from the recompute queue.
 * Called by a cron job or background worker.
 * 
 * Pattern: "Claim then process" for race safety
 * 1. Select pending items that are ready (scheduled_for <= now)
 * 2. Claim by updating status to 'processing'
 * 3. Process each item
 * 4. Mark as completed or failed
 * 
 * Idempotency: Uses unique constraint on (person_id, date_local, status)
 * and monotonic updated_at for "last write wins" semantics.
 * 
 * @param limit - Maximum number of items to process
 * @returns Number of items processed
 */
export async function processNDSQueue(limit = 10): Promise<number> {
  const now = new Date().toISOString();
  
  // 1. First, fetch pending items that are ready to process
  const { data: pendingItems, error: fetchError } = await supabaseAdmin
    .from('nds_recompute_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(limit);
  
  if (fetchError) {
    console.error(`[NDS Queue] Error fetching queue items: ${fetchError.message}`);
    return 0;
  }
  
  if (!pendingItems || pendingItems.length === 0) {
    return 0;
  }
  
  console.log(`[NDS Queue] Found ${pendingItems.length} pending items`);
  
  let processed = 0;
  
  for (const item of pendingItems) {
    // 2. Claim this item by setting status to 'processing'
    // Use a WHERE clause to ensure we don't double-process
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('nds_recompute_queue')
      .update({ 
        status: 'processing', 
        started_at: now,
        attempts: (item.attempts || 0) + 1,
      })
      .eq('id', item.id)
      .eq('status', 'pending') // Only claim if still pending
      .select()
      .single();
    
    if (claimError || !claimed) {
      // Item was already claimed by another worker or no longer pending
      console.log(`[NDS Queue] Item ${item.id} already claimed or processed`);
      continue;
    }
    
    // 3. Process the item with guaranteed finalization
    let processingError: string | null = null;
    let success = false;
    
    try {
      // Recompute NDS
      await recomputeDailyNDS(claimed.person_id, claimed.date_local);
      success = true;
    } catch (error) {
      processingError = error instanceof Error ? error.message : String(error);
      console.error(`[NDS Queue] Error processing item ${claimed.id}: ${processingError}`);
    } finally {
      // GUARANTEED finalization - always mark job as completed or failed
      try {
        if (success) {
          // 4a. Mark as completed
          const { error: updateError } = await supabaseAdmin
            .from('nds_recompute_queue')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq('id', claimed.id);
          
          if (updateError) {
            console.error(`[NDS Queue] Failed to mark item ${claimed.id} as completed: ${updateError.message}`);
          } else {
            processed++;
          }
        } else {
          // 4b. Mark as failed or re-queue for retry
          const newAttempts = claimed.attempts || 1;
          const shouldRetry = newAttempts < 3;
          
          const { error: updateError } = await supabaseAdmin
            .from('nds_recompute_queue')
            .update({
              status: shouldRetry ? 'pending' : 'failed',
              last_error: processingError || 'Unknown error',
              scheduled_for: shouldRetry 
                ? new Date(Date.now() + 60000).toISOString() // Retry in 1 min
                : undefined,
            })
            .eq('id', claimed.id);
          
          if (updateError) {
            console.error(`[NDS Queue] Failed to mark item ${claimed.id} as failed: ${updateError.message}`);
          }
        }
      } catch (finalizeError) {
        // Last resort: log the finalization failure
        console.error(`[NDS Queue] CRITICAL: Failed to finalize item ${claimed.id}:`, finalizeError);
      }
    }
  }
  
  return processed;
}

/**
 * Manually enqueue an NDS recompute (for API endpoints).
 * Uses upsert to coalesce multiple requests.
 */
export async function enqueueNDSRecompute(
  personId: string,
  dateLocal: string
): Promise<void> {
  const scheduledFor = new Date(Date.now() + 5000).toISOString(); // 5 second debounce
  
  const { error } = await supabaseAdmin
    .from('nds_recompute_queue')
    .upsert(
      {
        person_id: personId,
        date_local: dateLocal,
        status: 'pending',
        scheduled_for: scheduledFor,
        enqueued_at: new Date().toISOString(),
      },
      {
        onConflict: 'person_id,date_local,status',
        ignoreDuplicates: false,
      }
    );
  
  if (error) {
    console.warn(`[NDS] Error enqueueing recompute: ${error.message}`);
  }
}

/**
 * Recover stuck jobs that have been in 'processing' for too long.
 * These jobs likely failed without proper finalization.
 * Re-queues them as 'pending' for retry.
 * 
 * @param stuckMinutes - Jobs older than this many minutes are considered stuck
 * @returns Number of jobs recovered
 */
export async function recoverStuckJobs(stuckMinutes = 10): Promise<number> {
  const cutoff = new Date(Date.now() - stuckMinutes * 60 * 1000).toISOString();
  
  const { data, error } = await supabaseAdmin
    .from('nds_recompute_queue')
    .update({
      status: 'pending',
      last_error: `Recovered: stuck in processing for >${stuckMinutes} minutes`,
      scheduled_for: new Date().toISOString(), // Process immediately
    })
    .eq('status', 'processing')
    .lt('started_at', cutoff)
    .select('id');
  
  if (error) {
    console.error(`[NDS Queue] Error recovering stuck jobs: ${error.message}`);
    return 0;
  }
  
  const count = data?.length || 0;
  if (count > 0) {
    console.log(`[NDS Queue] Recovered ${count} stuck jobs`);
  }
  
  return count;
}

/**
 * Cleanup old completed queue items.
 * Should be run periodically (e.g., daily).
 */
export async function cleanupNDSQueue(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  
  const { data, error } = await supabaseAdmin
    .from('nds_recompute_queue')
    .delete()
    .eq('status', 'completed')
    .lt('completed_at', cutoff)
    .select('id');
  
  if (error) {
    console.error(`[NDS Queue] Cleanup error: ${error.message}`);
    return 0;
  }
  
  return data?.length || 0;
}
