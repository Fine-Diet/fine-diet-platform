/**
 * Server-side helpers for Plans metadata-backed state.
 *
 * Packet 55 keeps the MVP storage model (people.metadata) but gives each
 * feature an explicit validation, bounds, and merge-preservation boundary.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

export const PLAN_METADATA_LIMITS = {
  plan_day_templates: 50,
  plan_week_patterns: 25,
  grocery_ingredient_resolutions: 200,
  pantry_on_hand_items: 200,
} as const;

export type PlanMetadataKey = keyof typeof PLAN_METADATA_LIMITS;

const MAX_FEATURE_BYTES = 256_000;
const MAX_TOTAL_METADATA_BYTES = 768_000;

export async function readPersonMetadata(personId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('people')
    .select('metadata')
    .eq('id', personId)
    .single();
  if (error || !data) {
    throw new Error(`Failed to read person metadata: ${error?.message ?? 'not found'}`);
  }
  return ((data.metadata ?? {}) as Record<string, unknown>) || {};
}

function jsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function assertMetadataBounds<T>(key: PlanMetadataKey, items: T[], nextMetadata?: Record<string, unknown>) {
  const maxItems = PLAN_METADATA_LIMITS[key];
  if (items.length > maxItems) {
    throw new Error(
      `Too many ${key.replaceAll('_', ' ')} records (${items.length}/${maxItems}).`,
    );
  }

  const featureBytes = jsonByteSize(items);
  if (featureBytes > MAX_FEATURE_BYTES) {
    throw new Error(
      `${key.replaceAll('_', ' ')} metadata is too large (${featureBytes}/${MAX_FEATURE_BYTES} bytes).`,
    );
  }

  if (nextMetadata) {
    const totalBytes = jsonByteSize(nextMetadata);
    if (totalBytes > MAX_TOTAL_METADATA_BYTES) {
      throw new Error(
        `Person metadata is too large (${totalBytes}/${MAX_TOTAL_METADATA_BYTES} bytes).`,
      );
    }
  }
}

export function normalizeMetadataCollection<T>(
  key: PlanMetadataKey,
  value: unknown,
  isValid: (value: unknown) => value is T,
): T[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.filter(isValid);
  return normalized.slice(0, PLAN_METADATA_LIMITS[key]);
}

export async function writePersonMetadataCollection<T>(options: {
  personId: string;
  key: PlanMetadataKey;
  items: T[];
  isValid: (value: unknown) => value is T;
  errorLabel: string;
}): Promise<void> {
  const normalized = options.items.filter(options.isValid);
  if (normalized.length !== options.items.length) {
    throw new Error(`${options.errorLabel} contains malformed records.`);
  }

  const currentMeta = await readPersonMetadata(options.personId);
  const nextMeta = {
    ...currentMeta,
    [options.key]: normalized,
  };
  assertMetadataBounds(options.key, normalized, nextMeta);

  const { error } = await supabaseAdmin
    .from('people')
    .update({
      metadata: nextMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', options.personId);
  if (error) throw new Error(`Failed to save ${options.errorLabel}: ${error.message}`);
}
