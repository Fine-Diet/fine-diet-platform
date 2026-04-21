/**
 * Plans — Eat-out / menu server service (Packet 5)
 *
 * Supabase persistence for:
 *
 *   - `imported_menus` — structured menu capture records (raw text or
 *     URL import).
 *   - `planned_eat_out_events` — eat-out event rows bound to a plan
 *     slot, carrying the best/better/fallback recommendation payload.
 *
 * Also contains the select-option promotion path that upserts the
 * chosen recommended option into the slot's `planned_meals` row, while
 * preserving the eat-out event so the user can see why the slot meal
 * came from restaurant planning.
 *
 * Server-only; never import from client.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import { NDS_VERSION, CLASSIFIER_VERSION } from '@/lib/nds/types';
import type {
  EatOutRecommendationPayload,
  EatOutVenueType,
  ImportedMenu,
  ImportedMenuParseStatus,
  ImportedMenuPayload,
  ImportedMenuSourceType,
  PlannedEatOutEvent,
  PlannedMeal,
} from './types';
import {
  getPlannedMeal,
  insertPlannedMeal,
  updatePlannedMeal,
} from './planServerService';

// ============================================================================
// Row shapes
// ============================================================================

interface ImportedMenuRow {
  id: string;
  person_id: string;
  restaurant_name: string;
  source_type: ImportedMenuSourceType;
  source_url: string | null;
  parse_status: ImportedMenuParseStatus;
  raw_input_text: string | null;
  raw_payload_json: Record<string, unknown> | null;
  parsed_payload_json: ImportedMenuPayload | null;
  created_at: string;
  updated_at: string;
}

interface PlannedEatOutEventRow {
  id: string;
  plan_day_id: string;
  plan_slot_id: string | null;
  person_id: string;
  venue_name: string;
  venue_type: EatOutVenueType;
  scheduled_at: string | null;
  menu_url: string | null;
  imported_menu_id: string | null;
  recommendation_payload_json: EatOutRecommendationPayload | null;
  nds_version: string;
  classifier_version: string;
  created_at: string;
  updated_at: string;
}

function rowToImportedMenu(row: ImportedMenuRow): ImportedMenu {
  return {
    id: row.id,
    person_id: row.person_id,
    restaurant_name: row.restaurant_name,
    source_type: row.source_type,
    source_url: row.source_url,
    parse_status: row.parse_status ?? 'pending',
    raw_input_text: row.raw_input_text,
    raw_payload_json: row.raw_payload_json,
    parsed_payload_json: row.parsed_payload_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToPlannedEatOutEvent(row: PlannedEatOutEventRow): PlannedEatOutEvent {
  return {
    id: row.id,
    plan_day_id: row.plan_day_id,
    plan_slot_id: row.plan_slot_id,
    person_id: row.person_id,
    venue_name: row.venue_name,
    venue_type: row.venue_type,
    scheduled_at: row.scheduled_at,
    menu_url: row.menu_url,
    imported_menu_id: row.imported_menu_id,
    recommendation_payload_json: row.recommendation_payload_json,
    nds_version: row.nds_version,
    classifier_version: row.classifier_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ============================================================================
// imported_menus — create / read / update
// ============================================================================

export interface CreateImportedMenuArgs {
  personId: string;
  restaurant_name: string;
  source_type: ImportedMenuSourceType;
  source_url: string | null;
  parse_status: ImportedMenuParseStatus;
  raw_input_text: string | null;
  parsed_payload_json: ImportedMenuPayload | null;
  raw_payload_json?: Record<string, unknown> | null;
}

export async function createImportedMenu(
  args: CreateImportedMenuArgs,
): Promise<ImportedMenu> {
  const { data, error } = await supabaseAdmin
    .from('imported_menus')
    .insert({
      person_id: args.personId,
      restaurant_name: args.restaurant_name,
      source_type: args.source_type,
      source_url: args.source_url,
      parse_status: args.parse_status,
      raw_input_text: args.raw_input_text,
      parsed_payload_json: args.parsed_payload_json,
      raw_payload_json: args.raw_payload_json ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to insert imported_menu: ${error.message}`);
  return rowToImportedMenu(data as ImportedMenuRow);
}

export async function getImportedMenu(
  personId: string,
  id: string,
): Promise<ImportedMenu | null> {
  const { data, error } = await supabaseAdmin
    .from('imported_menus')
    .select('*')
    .eq('id', id)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load imported_menu: ${error.message}`);
  return data ? rowToImportedMenu(data as ImportedMenuRow) : null;
}

export async function listImportedMenus(personId: string): Promise<ImportedMenu[]> {
  const { data, error } = await supabaseAdmin
    .from('imported_menus')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`Failed to list imported_menus: ${error.message}`);
  return (data as ImportedMenuRow[]).map(rowToImportedMenu);
}

export interface UpdateImportedMenuArgs {
  restaurant_name?: string;
  source_url?: string | null;
  parse_status?: ImportedMenuParseStatus;
  raw_input_text?: string | null;
  parsed_payload_json?: ImportedMenuPayload | null;
}

export async function updateImportedMenu(
  personId: string,
  id: string,
  patch: UpdateImportedMenuArgs,
): Promise<ImportedMenu | null> {
  const updates: Record<string, unknown> = {};
  if (patch.restaurant_name !== undefined) updates.restaurant_name = patch.restaurant_name;
  if (patch.source_url !== undefined) updates.source_url = patch.source_url;
  if (patch.parse_status !== undefined) updates.parse_status = patch.parse_status;
  if (patch.raw_input_text !== undefined) updates.raw_input_text = patch.raw_input_text;
  if (patch.parsed_payload_json !== undefined)
    updates.parsed_payload_json = patch.parsed_payload_json;

  if (Object.keys(updates).length === 0) return getImportedMenu(personId, id);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('imported_menus')
    .update(updates)
    .eq('id', id)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update imported_menu: ${error.message}`);
  return data ? rowToImportedMenu(data as ImportedMenuRow) : null;
}

// ============================================================================
// planned_eat_out_events — create / read / update
// ============================================================================

export interface CreatePlannedEatOutEventArgs {
  personId: string;
  plan_day_id: string;
  plan_slot_id: string | null;
  venue_name: string;
  venue_type?: EatOutVenueType;
  scheduled_at: string | null;
  menu_url: string | null;
  imported_menu_id: string | null;
  recommendation_payload_json: EatOutRecommendationPayload | null;
}

export async function createPlannedEatOutEvent(
  args: CreatePlannedEatOutEventArgs,
): Promise<PlannedEatOutEvent> {
  const { data, error } = await supabaseAdmin
    .from('planned_eat_out_events')
    .insert({
      person_id: args.personId,
      plan_day_id: args.plan_day_id,
      plan_slot_id: args.plan_slot_id,
      venue_name: args.venue_name,
      venue_type: args.venue_type ?? 'restaurant',
      scheduled_at: args.scheduled_at,
      menu_url: args.menu_url,
      imported_menu_id: args.imported_menu_id,
      recommendation_payload_json: args.recommendation_payload_json,
      nds_version: NDS_VERSION,
      classifier_version: CLASSIFIER_VERSION,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to insert planned_eat_out_event: ${error.message}`);
  return rowToPlannedEatOutEvent(data as PlannedEatOutEventRow);
}

export async function getPlannedEatOutEvent(
  personId: string,
  id: string,
): Promise<PlannedEatOutEvent | null> {
  const { data, error } = await supabaseAdmin
    .from('planned_eat_out_events')
    .select('*')
    .eq('id', id)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load planned_eat_out_event: ${error.message}`);
  return data ? rowToPlannedEatOutEvent(data as PlannedEatOutEventRow) : null;
}

export async function listPlannedEatOutEventsForSlot(
  personId: string,
  planSlotId: string,
): Promise<PlannedEatOutEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('planned_eat_out_events')
    .select('*')
    .eq('plan_slot_id', planSlotId)
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (error)
    throw new Error(`Failed to list planned_eat_out_events for slot: ${error.message}`);
  return (data as PlannedEatOutEventRow[]).map(rowToPlannedEatOutEvent);
}

export async function listPlannedEatOutEventsForDay(
  personId: string,
  planDayId: string,
): Promise<PlannedEatOutEvent[]> {
  const { data, error } = await supabaseAdmin
    .from('planned_eat_out_events')
    .select('*')
    .eq('plan_day_id', planDayId)
    .eq('person_id', personId);
  if (error)
    throw new Error(`Failed to list planned_eat_out_events for day: ${error.message}`);
  return (data as PlannedEatOutEventRow[]).map(rowToPlannedEatOutEvent);
}

export interface UpdatePlannedEatOutEventArgs {
  venue_name?: string;
  venue_type?: EatOutVenueType;
  scheduled_at?: string | null;
  menu_url?: string | null;
  imported_menu_id?: string | null;
  recommendation_payload_json?: EatOutRecommendationPayload | null;
}

export async function updatePlannedEatOutEvent(
  personId: string,
  id: string,
  patch: UpdatePlannedEatOutEventArgs,
): Promise<PlannedEatOutEvent | null> {
  const updates: Record<string, unknown> = {};
  if (patch.venue_name !== undefined) updates.venue_name = patch.venue_name;
  if (patch.venue_type !== undefined) updates.venue_type = patch.venue_type;
  if (patch.scheduled_at !== undefined) updates.scheduled_at = patch.scheduled_at;
  if (patch.menu_url !== undefined) updates.menu_url = patch.menu_url;
  if (patch.imported_menu_id !== undefined)
    updates.imported_menu_id = patch.imported_menu_id;
  if (patch.recommendation_payload_json !== undefined)
    updates.recommendation_payload_json = patch.recommendation_payload_json;

  if (Object.keys(updates).length === 0) return getPlannedEatOutEvent(personId, id);
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('planned_eat_out_events')
    .update(updates)
    .eq('id', id)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();
  if (error)
    throw new Error(`Failed to update planned_eat_out_event: ${error.message}`);
  return data ? rowToPlannedEatOutEvent(data as PlannedEatOutEventRow) : null;
}

// ============================================================================
// Select option → attach into plan slot
//
// INSTRUCTION / CONTEXT SEPARATION CONTRACT (Packet 5 parallel to Packet 4):
//   - `planned_meals.payload.items` receives ONLY the option's
//     `attachable_payload.items` — restaurant rationale, watchouts, and
//     modification suggestions stay on the eat-out event where they
//     remain reviewable but never enter nutrition / NDS scoring.
//   - The event row is preserved (not deleted) after selection, so the
//     user can revisit the recommendation context anytime before the
//     meal occurs. A back-pointer to the planned_meal is NOT stored on
//     the event row (kept minimal); instead, slot → planned_meal →
//     planned_meal.source_template_id = null + joined eat-out event by
//     plan_slot_id + plan_day_id is the lookup shape.
// ============================================================================

export interface SelectEatOutOptionArgs {
  personId: string;
  planId: string;
  planDayId: string;
  planSlotId: string;
  eventId: string;
  option_label: 'best' | 'better' | 'fallback';
  meal_name_override: string | null;
}

export interface SelectEatOutOptionResult {
  event: PlannedEatOutEvent;
  planned_meal: PlannedMeal;
}

export async function selectEatOutOption(
  args: SelectEatOutOptionArgs,
): Promise<SelectEatOutOptionResult> {
  const event = await getPlannedEatOutEvent(args.personId, args.eventId);
  if (!event) throw new Error('Eat-out event not found.');
  if (!event.recommendation_payload_json) {
    throw new Error(
      'This eat-out event has no recommendation payload yet. Generate recommendations first.',
    );
  }
  if (event.plan_slot_id !== args.planSlotId) {
    throw new Error(
      'Eat-out event is bound to a different plan slot than the one provided.',
    );
  }

  const rec = event.recommendation_payload_json;
  const option =
    args.option_label === 'best'
      ? rec.best
      : args.option_label === 'better'
        ? rec.better
        : rec.fallback;
  if (!option) {
    throw new Error(`Option "${args.option_label}" is not available for this event.`);
  }

  // Build the planned_meal payload. Only attachable_payload.items flow
  // into nutrition; rationale / watchouts / modifications stay on the
  // eat-out event.
  const attachable = option.attachable_payload;
  const mealPayload = {
    items: attachable.items,
    totals: attachable.totals,
    notes_md: `Eat-out — ${rec.restaurant_name}`,
  } as unknown as Record<string, unknown>;

  // If the slot already has a planned_meal, update it. Otherwise insert.
  const { data: existing, error: existErr } = await supabaseAdmin
    .from('planned_meals')
    .select('id')
    .eq('plan_slot_id', args.planSlotId)
    .eq('person_id', args.personId)
    .maybeSingle();
  if (existErr)
    throw new Error(`Failed to check existing planned_meal: ${existErr.message}`);

  const mealName =
    args.meal_name_override && args.meal_name_override.trim().length > 0
      ? args.meal_name_override.trim()
      : option.option_name;

  let planned_meal: PlannedMeal | null = null;

  if (existing && (existing as { id: string }).id) {
    const existingId = (existing as { id: string }).id;
    planned_meal = await updatePlannedMeal(args.personId, existingId, {
      name: mealName,
      meal_type: attachable.meal_type,
      payload: mealPayload,
      protein_score_10: option.nds_meal_snapshot.protein_score_10,
      is_main_meal: option.nds_meal_snapshot.is_main_meal ?? false,
      psq_multiplier: option.nds_meal_snapshot.psq_multiplier ?? 1,
      meal_derived_data: (option.nds_meal_snapshot.meal_derived_data ??
        {}) as unknown as Record<string, unknown>,
      nds_confidence: option.nds_meal_snapshot.nds_confidence,
      source_template_id: null,
      source_imported_meal_id: null,
    });
  } else {
    planned_meal = await insertPlannedMeal({
      personId: args.personId,
      planId: args.planId,
      planDayId: args.planDayId,
      planSlotId: args.planSlotId,
      name: mealName,
      meal_type: attachable.meal_type,
      payload: mealPayload,
      protein_score_10: option.nds_meal_snapshot.protein_score_10,
      is_main_meal: option.nds_meal_snapshot.is_main_meal ?? false,
      psq_multiplier: option.nds_meal_snapshot.psq_multiplier ?? 1,
      meal_derived_data: (option.nds_meal_snapshot.meal_derived_data ??
        {}) as unknown as Record<string, unknown>,
      nds_confidence: option.nds_meal_snapshot.nds_confidence,
      source_template_id: null,
      source_imported_meal_id: null,
    });
  }

  if (!planned_meal) throw new Error('Failed to attach option to slot.');

  // Re-read the event so we return a fresh timestamp after any potential
  // triggers (though we don't modify the event row on select — the
  // recommendation context stays preserved as §3b requires).
  const freshEvent = (await getPlannedEatOutEvent(args.personId, args.eventId)) ?? event;
  return { event: freshEvent, planned_meal };
}

// ============================================================================
// Helper: pull the bound planned_meal (if any) for an eat-out event's slot
// ============================================================================

export async function getSelectedPlannedMealForEvent(
  personId: string,
  event: PlannedEatOutEvent,
): Promise<PlannedMeal | null> {
  if (!event.plan_slot_id) return null;
  const { data, error } = await supabaseAdmin
    .from('planned_meals')
    .select('id')
    .eq('plan_slot_id', event.plan_slot_id)
    .eq('person_id', personId)
    .maybeSingle();
  if (error)
    throw new Error(`Failed to read planned_meal for event slot: ${error.message}`);
  if (!data) return null;
  return getPlannedMeal(personId, (data as { id: string }).id);
}
