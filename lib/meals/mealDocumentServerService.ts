/**
 * Meal Object Foundation — Packet 4: meal_documents Server Service
 *
 * Person-scoped Supabase persistence for the canonical MealDocument contract
 * (lib/meals/types.ts) backed by the meal_documents table codified in
 * scripts/sql/createMealDocuments.sql. Server-only; never import from client.
 *
 * SCOPE / SAFETY (P4):
 *   - Person scope is enforced server-side on EVERY read and write: reads add
 *     `.eq('person_id', personId)`; writes stamp `person_id` via
 *     `mealDocumentToStorageRow(doc, personId)` (which overrides any owner on
 *     the document) and validate ownership with `validateMealDocumentForStorage`.
 *   - The full canonical MealDocument lives in `document_json` (source of truth).
 *     The denormalized columns are search/filter projections of it.
 *   - No AI, no nutrition recompute here (recompute is the import service's job,
 *     and only the deterministic P3 service). No grouped-journal writes. No
 *     saved-meal / planned-meal / branded-search behavior is touched.
 */

import { supabaseAdmin } from '@/lib/supabaseServerClient';

import {
  mealDocumentToStorageRow,
  validateMealDocumentForStorage,
  type MealDocumentStorageRow,
} from './storage';
import type { MealDocument } from './types';

// ============================================================================
// Row shape
// ============================================================================

interface MealDocumentRow {
  id: string;
  person_id: string;
  schema_version: number;
  kind: MealDocument['kind'];
  title: string;
  description: string | null;
  review_state: MealDocument['review_state'];
  intents: string[] | null;
  source_type: string | null;
  source_id: string | null;
  source_url: string | null;
  document_json: MealDocument;
  created_at: string;
  updated_at: string;
}

/**
 * Reconstitute a canonical MealDocument from a row. `document_json` is the
 * source of truth; the row's id / owner / timestamps are authoritative and
 * overlaid so an unpersisted draft (document_json.id === null) is hydrated
 * with the real persisted identity.
 */
function rowToMealDocument(row: MealDocumentRow): MealDocument {
  return {
    ...row.document_json,
    id: row.id,
    person_id: row.person_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Build the INSERT/UPDATE column payload from a validated storage row.
 * `document_json.id` is normalized to the row owner; the DB owns the row id.
 */
function storageRowToColumns(
  row: MealDocumentStorageRow,
): Record<string, unknown> {
  return {
    person_id: row.person_id,
    schema_version: row.schema_version,
    kind: row.kind,
    title: row.title,
    description: row.description,
    review_state: row.review_state,
    intents: row.intents,
    source_type: row.source_type,
    source_id: row.source_id,
    source_url: row.source_url,
    document_json: row.document_json,
  };
}

// ============================================================================
// Errors
// ============================================================================

/** Thrown when a MealDocument fails storage validation (caller → 400). */
export class MealDocumentValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Invalid meal document: ${errors.join('; ')}`);
    this.name = 'MealDocumentValidationError';
    this.errors = errors;
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, MealDocumentValidationError.prototype);
  }
}

// ============================================================================
// Create
// ============================================================================

/**
 * Persist a canonical MealDocument for `personId`. Ownership is enforced:
 * the supplied personId becomes the row owner and is stamped into
 * document_json (any owner already on the document must match or be null).
 */
export async function createMealDocumentForPerson(
  personId: string,
  document: MealDocument,
): Promise<MealDocument> {
  const validated = validateMealDocumentForStorage(document, { personId });
  if (!validated.ok) throw new MealDocumentValidationError(validated.errors);

  const { data, error } = await supabaseAdmin
    .from('meal_documents')
    .insert(storageRowToColumns(validated.value))
    .select('*')
    .single();
  if (error) throw new Error(`Failed to insert meal_document: ${error.message}`);
  return rowToMealDocument(data as MealDocumentRow);
}

// ============================================================================
// Read
// ============================================================================

export async function getMealDocumentForPerson(
  personId: string,
  id: string,
): Promise<MealDocument | null> {
  const { data, error } = await supabaseAdmin
    .from('meal_documents')
    .select('*')
    .eq('id', id)
    .eq('person_id', personId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load meal_document: ${error.message}`);
  return data ? rowToMealDocument(data as MealDocumentRow) : null;
}

export interface ListMealDocumentsFilters {
  kind?: MealDocument['kind'];
  review_state?: MealDocument['review_state'];
  limit?: number;
}

export async function listMealDocumentsForPerson(
  personId: string,
  filters?: ListMealDocumentsFilters,
): Promise<MealDocument[]> {
  let query = supabaseAdmin
    .from('meal_documents')
    .select('*')
    .eq('person_id', personId)
    .order('updated_at', { ascending: false });
  if (filters?.kind) query = query.eq('kind', filters.kind);
  if (filters?.review_state) query = query.eq('review_state', filters.review_state);
  if (typeof filters?.limit === 'number') query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list meal_documents: ${error.message}`);
  return (data as MealDocumentRow[]).map(rowToMealDocument);
}

/**
 * Find the most-recent meal_document this person derived from a given imported
 * meal, if any. Used to keep import→document writes idempotent (a repeated
 * save/confirm updates the existing row rather than creating duplicates).
 */
export async function findMealDocumentBySourceImportedMeal(
  personId: string,
  importedMealId: string,
): Promise<MealDocument | null> {
  const { data, error } = await supabaseAdmin
    .from('meal_documents')
    .select('*')
    .eq('person_id', personId)
    .eq('source_type', 'imported')
    .eq('source_id', importedMealId)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) {
    throw new Error(`Failed to find meal_document by import: ${error.message}`);
  }
  const rows = (data as MealDocumentRow[]) ?? [];
  return rows.length > 0 ? rowToMealDocument(rows[0]) : null;
}

// ============================================================================
// Update
// ============================================================================

/**
 * Update a person's meal_document. The patch is merged onto the existing
 * canonical document_json, then re-validated and re-projected so the
 * denormalized columns stay in lockstep with the JSON. Person scope is
 * enforced both on the load (`.eq('person_id', personId)`) and on the
 * re-validation. Returns null when no row matches the owner+id.
 */
export async function updateMealDocumentForPerson(
  personId: string,
  id: string,
  patch: Partial<MealDocument>,
): Promise<MealDocument | null> {
  const current = await getMealDocumentForPerson(personId, id);
  if (!current) return null;

  const merged: MealDocument = {
    ...current,
    ...patch,
    // Identity is owned by the row, not the patch.
    id: current.id,
    person_id: personId,
  };

  const validated = validateMealDocumentForStorage(merged, { personId });
  if (!validated.ok) throw new MealDocumentValidationError(validated.errors);

  const { data, error } = await supabaseAdmin
    .from('meal_documents')
    .update(storageRowToColumns(validated.value))
    .eq('id', id)
    .eq('person_id', personId)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update meal_document: ${error.message}`);
  return data ? rowToMealDocument(data as MealDocumentRow) : null;
}
