/**
 * Tracking settings: which log types are enabled per person.
 * Stored in people.metadata.enabled_tracking_keys: string[]
 *
 * Core types (enabled by default): intake, water, supplement, mood, bowel, cycle, movement
 * Add-ons (disabled by default): blood_pressure, glucose, temperature, weight
 *
 * Keys live in: CORE_TRACKING_KEYS, ADDON_TRACKING_KEYS (this file).
 *
 * To enable blood_pressure for a user (run in Supabase SQL Editor):
 *
 *   UPDATE people
 *   SET metadata = jsonb_set(
 *     COALESCE(metadata, '{}'::jsonb),
 *     '{enabled_tracking_keys}',
 *     '["intake","water","supplement","mood","bowel","cycle","movement","blood_pressure"]'::jsonb
 *   )
 *   WHERE id = '<person_id>';
 */

import { supabaseAdmin } from '../supabaseServerClient';

export const CORE_TRACKING_KEYS = [
  'intake',
  'water',
  'sleep',
  'supplement',
  'mood',
  'bowel',
  'cycle',
  'movement',
] as const;

export const ADDON_TRACKING_KEYS = [
  'blood_pressure',
  'glucose',
  'temperature',
  'weight',
] as const;

export const ALL_TRACKING_KEYS = [...CORE_TRACKING_KEYS, ...ADDON_TRACKING_KEYS] as const;

export type TrackingKey = (typeof ALL_TRACKING_KEYS)[number];

/**
 * Default enabled keys when user has no settings.
 * Core types enabled; add-ons disabled.
 */
export const DEFAULT_ENABLED_KEYS: string[] = [...CORE_TRACKING_KEYS];

/**
 * Get enabled tracking keys for a person.
 * Falls back to DEFAULT_ENABLED_KEYS if not set.
 */
export async function getEnabledTrackingKeys(personId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('metadata')
    .eq('id', personId)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_ENABLED_KEYS;
  }

  const metadata = (data.metadata || {}) as Record<string, unknown>;
  const keys = metadata.enabled_tracking_keys;
  if (!Array.isArray(keys) || keys.length === 0) {
    return DEFAULT_ENABLED_KEYS;
  }

  // Filter to only valid tracking keys
  const valid = keys.filter(
    (k): k is string => typeof k === 'string' && ALL_TRACKING_KEYS.includes(k as TrackingKey)
  );
  return valid.length > 0 ? valid : DEFAULT_ENABLED_KEYS;
}

/**
 * Update enabled tracking keys for a person.
 * Merges into people.metadata.
 */
export async function updateEnabledTrackingKeys(
  personId: string,
  keys: string[]
): Promise<string[]> {
  const { data: current } = await supabaseAdmin
    .from('people')
    .select('metadata')
    .eq('id', personId)
    .single();

  const currentMetadata = (current?.metadata || {}) as Record<string, unknown>;
  const validKeys = keys.filter(
    (k): k is string => typeof k === 'string' && ALL_TRACKING_KEYS.includes(k as TrackingKey)
  );

  const updatedMetadata = {
    ...currentMetadata,
    enabled_tracking_keys: validKeys,
  };

  const { error } = await supabaseAdmin
    .from('people')
    .update({ metadata: updatedMetadata })
    .eq('id', personId);

  if (error) {
    throw new Error(`Failed to update tracking settings: ${error.message}`);
  }

  return validKeys;
}
