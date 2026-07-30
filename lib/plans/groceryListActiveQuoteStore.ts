/**
 * Store for grocery_list_item_active_quotes (PR3.2a).
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type { GroceryListItemActiveQuote } from './types';

interface ActiveRow {
  id: string;
  person_id: string;
  grocery_list_id: string;
  grocery_item_id: string;
  observation_id: string;
  created_at: string;
  updated_at: string;
}

function rowToActive(row: ActiveRow): GroceryListItemActiveQuote {
  return {
    id: row.id,
    person_id: row.person_id,
    grocery_list_id: row.grocery_list_id,
    grocery_item_id: row.grocery_item_id,
    observation_id: row.observation_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listActiveQuotesForList(
  personId: string,
  listId: string,
): Promise<GroceryListItemActiveQuote[]> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_item_active_quotes')
    .select('*')
    .eq('person_id', personId)
    .eq('grocery_list_id', listId);
  if (error) {
    throw new Error(`Failed to list active list quotes: ${error.message}`);
  }
  return (data ?? []).map((row) => rowToActive(row as ActiveRow));
}

export async function upsertActiveQuote(options: {
  personId: string;
  listId: string;
  itemId: string;
  observationId: string;
}): Promise<GroceryListItemActiveQuote> {
  const { data, error } = await supabaseAdmin
    .from('grocery_list_item_active_quotes')
    .upsert(
      {
        person_id: options.personId,
        grocery_list_id: options.listId,
        grocery_item_id: options.itemId,
        observation_id: options.observationId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'grocery_list_id,grocery_item_id' },
    )
    .select('*')
    .single();
  if (error || !data) {
    throw new Error(`Failed to upsert active list quote: ${error?.message ?? 'unknown'}`);
  }
  return rowToActive(data as ActiveRow);
}

export async function clearActiveQuote(options: {
  personId: string;
  listId: string;
  itemId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin
    .from('grocery_list_item_active_quotes')
    .delete()
    .eq('person_id', options.personId)
    .eq('grocery_list_id', options.listId)
    .eq('grocery_item_id', options.itemId);
  if (error) {
    throw new Error(`Failed to clear active list quote: ${error.message}`);
  }
}
