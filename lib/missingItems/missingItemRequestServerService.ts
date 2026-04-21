/**
 * Plans Phase 14 — Missing-item request server service (server-only)
 *
 * Two responsibilities:
 *
 *   (a) Runtime creation: `recordMissingItemRequest` and
 *       `recordMissingIngredientBatch` are called from Journal search
 *       and the Packet 6 ingredient matcher when a confident trusted
 *       match could not be produced. They MUST be conservative — the
 *       caller has already fallen back to a low-confidence estimate;
 *       this service only enqueues a review record and dedupes.
 *
 *   (b) Admin review: `listRequests`, `getRequestById`,
 *       `resolveRequest`, and `dismissRequest` power a lightweight
 *       ops console. These require `service_role` / admin auth at the
 *       route layer; the table has no public RLS policy.
 *
 * Runtime creation is best-effort: any failure here is logged and
 * swallowed so it can never break a user-facing flow.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';
import type {
  MissingItemRequest,
  MissingItemContext,
  MissingItemSourceKind,
  MissingItemStatus,
  RecordMissingItemInput,
  FoodObjectCandidate,
} from './types';

// ============================================================================
// Row adapters
// ============================================================================

interface RequestRow {
  id: string;
  person_id: string | null;
  context: MissingItemContext;
  source_kind: MissingItemSourceKind;
  source_ref: string | null;
  raw_input: string;
  normalized_input: string;
  suggested_category: string | null;
  fallback_metadata: unknown | null;
  status: MissingItemStatus;
  resolved_food_object_id: string | null;
  resolution_notes: string | null;
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  notes: string | null;
  occurrence_count: number;
  last_seen_at: string;
  alias_enrichment_applied: boolean;
  alias_enrichment_value: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRequest(r: RequestRow): MissingItemRequest {
  return { ...r };
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize raw user text for dedupe: lowercase, strip common noise,
 * collapse whitespace. Intentionally coarse — stricter normalization
 * would cause distinct review items to collapse (e.g. "ground beef"
 * vs "ground beef 80/20").
 */
export function normalizeMissingItemInput(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[`~!@#$%^&*()_+=[\]{};:'"\\|<>/?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// Runtime creation
// ============================================================================

/**
 * Enqueue a single missing-item request. If an `open` request already
 * exists with the same (context, person_id, normalized_input) we
 * increment its occurrence_count and bump last_seen_at instead of
 * inserting a duplicate.
 *
 * Best-effort: swallows and logs errors so runtime flows never break.
 */
export async function recordMissingItemRequest(
  input: RecordMissingItemInput,
): Promise<MissingItemRequest | null> {
  const raw = (input.rawInput ?? '').trim();
  if (!raw) return null;
  const normalized = normalizeMissingItemInput(raw);
  if (!normalized) return null;

  try {
    // Look for an existing open row matching the dedupe key.
    let existingQ = supabaseAdmin
      .from('missing_item_requests')
      .select('*')
      .eq('status', 'open')
      .eq('context', input.context)
      .eq('normalized_input', normalized);
    existingQ = input.personId
      ? existingQ.eq('person_id', input.personId)
      : existingQ.is('person_id', null);

    const { data: existing, error: exErr } = await existingQ
      .limit(1)
      .maybeSingle();
    if (exErr) {
      console.warn(
        '[missingItems] recordMissingItemRequest lookup warn:',
        exErr.message,
      );
    }

    if (existing) {
      const row = existing as RequestRow;
      const nowIso = new Date().toISOString();
      const { data: updated, error: updErr } = await supabaseAdmin
        .from('missing_item_requests')
        .update({
          occurrence_count: row.occurrence_count + 1,
          last_seen_at: nowIso,
          // Keep the freshest source_ref so ops sees the latest
          // occurrence, but never clobber with null.
          source_ref: input.sourceRef ?? row.source_ref,
          notes: input.notes ?? row.notes,
        })
        .eq('id', row.id)
        .select('*')
        .single();
      if (updErr) {
        console.warn(
          '[missingItems] recordMissingItemRequest update warn:',
          updErr.message,
        );
        return rowToRequest(row);
      }
      return rowToRequest(updated as RequestRow);
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('missing_item_requests')
      .insert({
        person_id: input.personId,
        context: input.context,
        source_kind: input.sourceKind,
        source_ref: input.sourceRef ?? null,
        raw_input: raw,
        normalized_input: normalized,
        suggested_category: input.suggestedCategory ?? null,
        fallback_metadata: input.fallbackMetadata ?? null,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (insErr) {
      // Unique-index race: another process inserted between our
      // SELECT and INSERT. Re-run the update path once.
      if (insErr.code === '23505') {
        return recordMissingItemRequest(input);
      }
      console.warn(
        '[missingItems] recordMissingItemRequest insert warn:',
        insErr.message,
      );
      return null;
    }
    return rowToRequest(inserted as RequestRow);
  } catch (err) {
    console.warn(
      '[missingItems] recordMissingItemRequest unexpected error:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Convenience helper: translate Packet 6 ingredient-match output rows
 * into Packet 14 batch inputs. Only `guessed` and `none` tiers are
 * considered "unresolved" and therefore eligible; `matched` and
 * `partial` carry a trusted food_object and must not enqueue.
 */
export function missingItemInputsFromIngredientMatches(args: {
  personId: string | null;
  sourceRef?: string | null;
  matches: Array<{
    raw_text: string;
    normalized_name: string | null;
    match_status: 'matched' | 'partial' | 'guessed' | 'none';
    source_kind?: string | null;
    source_label?: string | null;
    per_serving_estimate?: unknown;
    explanation?: string | null;
  }>;
}): RecordMissingItemInput[] {
  const out: RecordMissingItemInput[] = [];
  for (const m of args.matches ?? []) {
    if (m.match_status !== 'guessed' && m.match_status !== 'none') continue;
    const raw = (m.raw_text ?? m.normalized_name ?? '').trim();
    if (!raw) continue;
    out.push({
      personId: args.personId,
      context: 'recipe_import',
      sourceKind: 'import',
      sourceRef: args.sourceRef ?? null,
      rawInput: raw,
      fallbackMetadata: {
        match_status: m.match_status,
        source_kind: m.source_kind ?? null,
        source_label: m.source_label ?? null,
        per_serving_estimate: m.per_serving_estimate ?? null,
        explanation: m.explanation ?? null,
      },
    });
  }
  return out;
}

/**
 * Enqueue a batch of unresolved ingredient strings from a single
 * import flow. Dedupes within the batch by normalized_input before
 * hitting the DB so repeated ingredients in one recipe don't produce
 * multiple write attempts.
 *
 * Best-effort: individual failures are swallowed; the call always
 * returns the number of rows it tried to create.
 */
export async function recordMissingIngredientBatch(
  inputs: RecordMissingItemInput[],
): Promise<{ attempted: number; enqueued: number }> {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    return { attempted: 0, enqueued: 0 };
  }

  const seen = new Set<string>();
  const deduped: RecordMissingItemInput[] = [];
  for (const i of inputs) {
    const raw = (i.rawInput ?? '').trim();
    if (!raw) continue;
    const normalized = normalizeMissingItemInput(raw);
    if (!normalized) continue;
    const key = `${i.context}|${i.personId ?? ''}|${normalized}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(i);
  }

  let enqueued = 0;
  for (const entry of deduped) {
    const result = await recordMissingItemRequest(entry);
    if (result) enqueued += 1;
  }
  return { attempted: deduped.length, enqueued };
}

// ============================================================================
// Admin reads
// ============================================================================

export interface ListRequestsFilter {
  status?: MissingItemStatus;
  context?: MissingItemContext;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ListRequestsResult {
  rows: MissingItemRequest[];
  total: number;
  limit: number;
  offset: number;
}

export async function listRequests(
  filter: ListRequestsFilter = {},
): Promise<ListRequestsResult> {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const offset = Math.max(filter.offset ?? 0, 0);

  let q = supabaseAdmin
    .from('missing_item_requests')
    .select('*', { count: 'estimated' })
    .order('last_seen_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filter.status) q = q.eq('status', filter.status);
  if (filter.context) q = q.eq('context', filter.context);
  if (filter.q) {
    const safe = filter.q.replace(/[%_,]/g, ' ').trim();
    if (safe) {
      q = q.or(
        `raw_input.ilike.%${safe}%,normalized_input.ilike.%${safe}%`,
      );
    }
  }

  const { data, error, count } = await q;
  if (error) throw new Error(`listRequests failed: ${error.message}`);

  return {
    rows: ((data ?? []) as RequestRow[]).map(rowToRequest),
    total: count ?? 0,
    limit,
    offset,
  };
}

export async function getRequestById(
  id: string,
): Promise<MissingItemRequest | null> {
  const { data, error } = await supabaseAdmin
    .from('missing_item_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getRequestById failed: ${error.message}`);
  return data ? rowToRequest(data as RequestRow) : null;
}

// ============================================================================
// Admin mutations
// ============================================================================

export interface ResolveRequestInput {
  id: string;
  resolvedByUserId: string | null;
  resolvedFoodObjectId?: string | null;
  resolutionNotes?: string | null;
  /**
   * Phase 15 — when true AND `resolvedFoodObjectId` is provided, the
   * service appends `aliasValue` (or the request's `normalized_input`
   * if omitted) to the linked food_objects.aliases array. Idempotent:
   * the alias is only added if it isn't already present.
   */
  applyAliasEnrichment?: boolean;
  aliasValue?: string | null;
}

export interface ResolveRequestOutcome {
  request: MissingItemRequest;
  /**
   * Null when no alias enrichment was attempted or when the alias was
   * already present on the trusted food object. Set to the exact
   * lowercased string that was appended when enrichment took effect.
   */
  alias_added: string | null;
}

/**
 * Resolve a missing-item request, optionally appending a reviewed
 * alias to the linked trusted food object. Alias enrichment is a
 * separate best-effort step: if the alias write fails the request
 * itself is still resolved and the failure is surfaced via the
 * resolved request's resolution_notes.
 */
export async function resolveRequest(
  input: ResolveRequestInput,
): Promise<ResolveRequestOutcome> {
  const nowIso = new Date().toISOString();

  // Load the request first so we can pick the default alias value
  // from normalized_input when the caller didn't supply one.
  const existing = await getRequestById(input.id);
  if (!existing) throw new Error(`resolveRequest: request ${input.id} not found.`);

  let aliasAdded: string | null = null;
  let aliasEnrichmentApplied = false;
  let aliasEnrichmentValue: string | null = null;
  let aliasError: string | null = null;

  if (input.applyAliasEnrichment && input.resolvedFoodObjectId) {
    const aliasCandidate = (
      input.aliasValue ??
      existing.normalized_input ??
      ''
    )
      .toLowerCase()
      .trim();

    if (!aliasCandidate) {
      aliasError = 'alias value was empty after normalization.';
    } else {
      try {
        const outcome = await appendAliasToFoodObject(
          input.resolvedFoodObjectId,
          aliasCandidate,
        );
        aliasEnrichmentApplied = true;
        aliasEnrichmentValue = aliasCandidate;
        aliasAdded = outcome.added ? aliasCandidate : null;
      } catch (err) {
        aliasError = err instanceof Error ? err.message : 'alias write failed.';
      }
    }
  }

  const resolutionNotes = (() => {
    const base = input.resolutionNotes ?? null;
    if (!aliasError) return base;
    const annotation = `alias enrichment not applied: ${aliasError}`;
    return base ? `${base}\n\n${annotation}` : annotation;
  })();

  const { data, error } = await supabaseAdmin
    .from('missing_item_requests')
    .update({
      status: 'resolved',
      resolved_food_object_id: input.resolvedFoodObjectId ?? null,
      resolution_notes: resolutionNotes,
      resolved_by_user_id: input.resolvedByUserId,
      resolved_at: nowIso,
      alias_enrichment_applied: aliasEnrichmentApplied,
      alias_enrichment_value: aliasEnrichmentValue,
    })
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw new Error(`resolveRequest failed: ${error.message}`);
  return {
    request: rowToRequest(data as RequestRow),
    alias_added: aliasAdded,
  };
}

/**
 * Idempotently append `alias` to food_objects.aliases. Matches are
 * case-insensitive so "Dragonfruit" and "dragonfruit" collapse. Never
 * mutates canonical_name. Throws on DB failure.
 */
async function appendAliasToFoodObject(
  foodObjectId: string,
  alias: string,
): Promise<{ added: boolean }> {
  const normalized = alias.toLowerCase().trim();
  if (!normalized) return { added: false };

  const { data: current, error: fetchErr } = await supabaseAdmin
    .from('food_objects')
    .select('id, aliases, canonical_name, is_deleted')
    .eq('id', foodObjectId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!current) throw new Error(`food_object ${foodObjectId} not found.`);
  if ((current as { is_deleted?: boolean }).is_deleted) {
    throw new Error(`food_object ${foodObjectId} is deleted; refusing to enrich.`);
  }

  const existingAliases = Array.isArray(
    (current as { aliases?: string[] }).aliases,
  )
    ? ((current as { aliases: string[] }).aliases ?? [])
    : [];
  const existingCanonical = (current as { canonical_name?: string }).canonical_name ?? '';

  // Skip when the alias duplicates the canonical name or any existing
  // alias (case-insensitive). Returning `added: false` is correct —
  // the enrichment target already covers this string.
  if (existingCanonical.toLowerCase().trim() === normalized) {
    return { added: false };
  }
  const alreadyPresent = existingAliases.some(
    (a) => (a ?? '').toLowerCase().trim() === normalized,
  );
  if (alreadyPresent) return { added: false };

  const nextAliases = [...existingAliases, normalized];
  const { error: updErr } = await supabaseAdmin
    .from('food_objects')
    .update({ aliases: nextAliases })
    .eq('id', foodObjectId);
  if (updErr) throw new Error(updErr.message);
  return { added: true };
}

export interface DismissRequestInput {
  id: string;
  resolvedByUserId: string | null;
  resolutionNotes?: string | null;
}

export async function dismissRequest(
  input: DismissRequestInput,
): Promise<MissingItemRequest> {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('missing_item_requests')
    .update({
      status: 'dismissed',
      resolved_food_object_id: null,
      resolution_notes: input.resolutionNotes ?? null,
      resolved_by_user_id: input.resolvedByUserId,
      resolved_at: nowIso,
    })
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw new Error(`dismissRequest failed: ${error.message}`);
  return rowToRequest(data as RequestRow);
}

/**
 * Phase 15 — lightweight candidate lookup used by the admin resolve
 * flow. Reuses the Packet 6 candidate filter shape (canonical_name
 * ilike + aliases array-contains) so admins see the same set the
 * matcher would, plus a broader ilike fallback for partial matches.
 *
 * Not intended as a full food-object management console; this is just
 * "let the admin pick the right trusted object without leaving the
 * page".
 */
export async function searchFoodObjectCandidates(
  query: string,
  limit = 15,
): Promise<FoodObjectCandidate[]> {
  const trimmed = (query ?? '').trim();
  if (trimmed.length < 2) return [];
  const safeLike = trimmed.replace(/[%_]/g, '\\$&');
  // aliases.cs only supports exact array-element match; reserve it for
  // tokens without commas/braces which would break the literal syntax.
  const aliasSafe = trimmed.toLowerCase();
  const canUseAliasContains = !/[,{}]/.test(aliasSafe);

  const filterParts = [
    `canonical_name.ilike.%${safeLike}%`,
    `brand_name.ilike.%${safeLike}%`,
  ];
  if (canUseAliasContains) {
    filterParts.push(`aliases.cs.{${aliasSafe}}`);
  }

  const { data, error } = await supabaseAdmin
    .from('food_objects')
    .select(
      'id, canonical_name, brand_name, aliases, category, source_type, source_provider, is_verified, nutrient_confidence',
    )
    .eq('is_deleted', false)
    .or(filterParts.join(','))
    .order('is_verified', { ascending: false })
    .order('canonical_name', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 50));
  if (error) throw new Error(`searchFoodObjectCandidates failed: ${error.message}`);

  return (data ?? []).map((r) => {
    const row = r as Partial<FoodObjectCandidate> & {
      id: string;
      canonical_name: string;
    };
    return {
      id: row.id,
      canonical_name: row.canonical_name,
      brand_name: row.brand_name ?? null,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      category: row.category ?? null,
      source_type: row.source_type ?? 'common',
      source_provider: row.source_provider ?? null,
      is_verified: row.is_verified ?? false,
      nutrient_confidence: row.nutrient_confidence ?? null,
    };
  });
}

/**
 * Counters shown on the admin dashboard.
 */
export async function getStatusCounts(): Promise<
  Record<MissingItemStatus, number>
> {
  const counts: Record<MissingItemStatus, number> = {
    open: 0,
    resolved: 0,
    dismissed: 0,
  };
  const statuses: MissingItemStatus[] = ['open', 'resolved', 'dismissed'];
  await Promise.all(
    statuses.map(async (s) => {
      const { count, error } = await supabaseAdmin
        .from('missing_item_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', s);
      if (!error) counts[s] = count ?? 0;
    }),
  );
  return counts;
}
