/**
 * Meal Object Foundation — Packet 5: Grouped Meal Logging Write Path
 *
 * Logs a canonical MealDocument as EXACTLY ONE journal_entries intake row whose
 * payload carries a `meal_group`. This satisfies the core product rule:
 *
 *   When a meal is added to the log it appears as a first-level meal entry —
 *   NOT as a pile of individual ingredient entries.
 *
 * The grouped entry stays back-compatible: its top-level
 * `name`/`quantity`/`unit`/`calories`/`macros` mirror the logged amount so the
 * existing day view, LoggedItemCard, and daily NDS math keep reading them
 * unchanged, while the full component/instruction snapshot rides along under
 * `payload.meal_group` for a future (not-this-packet) grouped log renderer.
 *
 * SCOPE / SAFETY (P5):
 *   - Person scope is enforced: the MealDocument is loaded with
 *     `getMealDocumentForPerson(personId, id)` (filters person_id; non-owned /
 *     missing ⇒ MealDocumentNotFoundError → 404) and the journal entry is
 *     created with the SAME authenticated personId. Request bodies never supply
 *     person identity.
 *   - The source MealDocument is NEVER mutated: components/steps are snapshotted
 *     into fresh objects, the load is read-only, and the write only INSERTs a
 *     journal entry.
 *   - Nutrition is deterministic, no AI / no food search / no network. Top-level
 *     nutrition is scaled from the document's trusted per-serving nutrition (or
 *     a safe per-serving basis derived from confirmed yield). Needs-review or
 *     unknown nutrition is NEVER invented — top-level numbers are simply omitted.
 *   - Does NOT touch flat food logging, saved-meal apply, planned-meal
 *     execution, branded food search, or any log rendering.
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§3.4 logged meal
 * instance, §5 recompute policy) + the P5 packet brief.
 */

import {
  createEntry,
  type JournalEntry,
  type JournalEntryPayload,
} from '@/lib/journal/journalServerService';

import { macrosToJournal } from './adapters';
import { getMealDocumentForPerson } from './mealDocumentServerService';
import { scaleMealNutrition } from './recompute';
import {
  MEAL_SCHEMA_VERSION,
  type CanonicalMacros,
  type GroupedMealEntryPayload,
  type HouseholdMeasure,
  type LoggedMealGroup,
  type MealComponent,
  type MealDocument,
  type MealNutrition,
  type MealStep,
} from './types';

// ============================================================================
// Errors
// ============================================================================

/** Thrown when a MealDocument cannot be found for this person (caller → 404). */
export class MealDocumentNotFoundError extends Error {
  constructor(mealDocumentId: string) {
    super(`Meal document not found: ${mealDocumentId}`);
    this.name = 'MealDocumentNotFoundError';
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, MealDocumentNotFoundError.prototype);
  }
}

/** Thrown when the grouped-log request input is invalid (caller → 400). */
export class GroupedMealLogValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) {
    super(`Invalid grouped meal log input: ${errors.join('; ')}`);
    this.name = 'GroupedMealLogValidationError';
    this.errors = errors;
    // Preserve instanceof across the ES5 transpile target.
    Object.setPrototypeOf(this, GroupedMealLogValidationError.prototype);
  }
}

// ============================================================================
// Input + validation
// ============================================================================

/**
 * Raw request input for logging a meal document. Person identity is NEVER
 * accepted here — it is derived from the authenticated session by the caller.
 *
 * Date/time accepts either an explicit ISO `occurred_at` (consistent with the
 * existing /entries and /plans/meals/[id]/execute APIs) or a `date` (+ optional
 * `time`) pair matching the packet's suggested body. When neither is supplied
 * the server's current time is used.
 */
export interface GroupedMealLogInput {
  /** YYYY-MM-DD local date. Combined with `time` (default 12:00). */
  date?: string;
  /** HH:mm local time-of-day. Only used when `date` is supplied. */
  time?: string;
  /** ISO timestamp. Takes precedence over date/time when provided. */
  occurred_at?: string;
  /** Servings actually eaten. Finite > 0. Defaults to 1. */
  consumed_servings?: number;
  /** Optional per-instance note (stored on meal_group.instance_notes). */
  note?: string | null;
}

/** Normalized, validated grouped-log input. */
export interface ValidatedGroupedMealLog {
  consumed_servings: number;
  occurredAt: Date;
  note: string | null;
}

export type GroupedMealLogValidation =
  | { ok: true; value: ValidatedGroupedMealLog }
  | { ok: false; errors: string[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DEFAULT_TIME = '12:00';
const MAX_NOTE_LENGTH = 500;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Resolve the entry's `occurredAt` Date from the (already-format-checked) input.
 * Returns null when the resulting date is invalid.
 */
function resolveOccurredAt(input: GroupedMealLogInput): Date | null {
  if (typeof input.occurred_at === 'string' && input.occurred_at.trim() !== '') {
    const d = new Date(input.occurred_at);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof input.date === 'string' && input.date.trim() !== '') {
    const time =
      typeof input.time === 'string' && input.time.trim() !== ''
        ? input.time
        : DEFAULT_TIME;
    const d = new Date(`${input.date}T${time}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return new Date();
}

/**
 * Validate + normalize the grouped-log input. Never throws; returns a
 * discriminated result so the caller maps failures to a 400.
 */
export function validateGroupedMealLogInput(
  input: GroupedMealLogInput | null | undefined,
): GroupedMealLogValidation {
  const errors: string[] = [];
  const src = input ?? {};

  // consumed_servings — default 1, must be a finite number > 0 when supplied.
  let consumed = 1;
  if (src.consumed_servings !== undefined && src.consumed_servings !== null) {
    if (!isPositiveNumber(src.consumed_servings)) {
      errors.push('consumed_servings must be a finite number greater than 0');
    } else {
      consumed = src.consumed_servings;
    }
  }

  // date/time format checks (only when occurred_at is not used).
  const usingOccurredAt =
    typeof src.occurred_at === 'string' && src.occurred_at.trim() !== '';
  if (!usingOccurredAt && typeof src.date === 'string' && src.date.trim() !== '') {
    if (!DATE_RE.test(src.date)) {
      errors.push('date must be in YYYY-MM-DD format');
    }
    if (
      typeof src.time === 'string' &&
      src.time.trim() !== '' &&
      !TIME_RE.test(src.time)
    ) {
      errors.push('time must be in HH:mm format');
    }
  }

  // note — optional string, capped.
  let note: string | null = null;
  if (src.note !== undefined && src.note !== null) {
    if (typeof src.note !== 'string') {
      errors.push('note must be a string');
    } else {
      const trimmed = src.note.trim();
      if (trimmed.length > MAX_NOTE_LENGTH) {
        errors.push(`note must be ${MAX_NOTE_LENGTH} characters or fewer`);
      } else {
        note = trimmed.length > 0 ? trimmed : null;
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const occurredAt = resolveOccurredAt(src);
  if (!occurredAt) {
    return { ok: false, errors: ['occurred_at / date+time is not a valid date'] };
  }

  return { ok: true, value: { consumed_servings: consumed, occurredAt, note } };
}

// ============================================================================
// Nutrition (pure, deterministic — no AI / no DB / no network)
// ============================================================================

/** True when a nutrition block carries at least one non-null value. */
function hasNutritionValues(n: MealNutrition | null | undefined): n is MealNutrition {
  if (!n) return false;
  const m = n.macros;
  return (
    n.calories != null ||
    m.protein_g != null ||
    m.carbs_g != null ||
    m.fat_g != null ||
    m.fiber_g != null ||
    m.added_sugar_g != null
  );
}

/**
 * Whether the document's nutrition is trusted enough to scale to a top-level
 * number. A document flagged needs_review (or carrying any needs_review
 * component) is NOT trusted — its top-level nutrition is left unknown rather
 * than invented (packet rule: needs-review/unknown ⇒ do not invent).
 */
function isTrustedNutrition(doc: MealDocument): boolean {
  if (doc.review_state === 'needs_review') return false;
  return !doc.components.some((c) => c.needs_review);
}

/**
 * The document's effective per-serving yield, when a SAFE basis exists:
 *   - a confirmed yield with positive servings, else
 *   - a positive recipe_yield_servings mirror.
 * Returns null when no safe servings basis is known.
 */
function effectiveYieldServings(doc: MealDocument): number | null {
  if (doc.yield && doc.yield.confirmed && isPositiveNumber(doc.yield.servings)) {
    return doc.yield.servings;
  }
  if (isPositiveNumber(doc.recipe_yield_servings)) return doc.recipe_yield_servings;
  return null;
}

/**
 * Deterministically scale a MealDocument's top-level nutrition to the amount
 * actually consumed. Pure; never mutates `document`. Returns null whenever the
 * result cannot be derived SAFELY (so the caller omits top-level numbers rather
 * than inventing them).
 *
 * Priority:
 *   1. Trusted per-serving nutrition × consumed_servings (the primary path; a
 *      confirmed import may carry per-serving estimates with null totals — P4).
 *   2. Totals with a safe per-serving basis: totals ÷ confirmed yield × consumed.
 *   3. A single-serving document (no yield concept at all): totals describe one
 *      serving, so totals × consumed.
 *   4. Otherwise null — totals exist but there is no safe per-serving basis.
 */
export function scaleTopLevelMealNutrition(
  document: MealDocument,
  consumedServings: number,
): MealNutrition | null {
  if (!isTrustedNutrition(document)) return null;
  if (!isPositiveNumber(consumedServings)) return null;

  // (1) Trusted per-serving nutrition — scale directly.
  if (hasNutritionValues(document.per_serving)) {
    return scaleMealNutrition(document.per_serving, consumedServings);
  }

  // (2)/(3)/(4) Fall back to totals only where a safe basis exists.
  if (hasNutritionValues(document.totals)) {
    const yieldServings = effectiveYieldServings(document);
    if (yieldServings != null) {
      const perServing =
        yieldServings === 1
          ? document.totals
          : scaleMealNutrition(document.totals, 1 / yieldServings);
      return scaleMealNutrition(perServing, consumedServings);
    }
    // No yield concept at all ⇒ totals already describe a single serving.
    if (document.yield == null && document.recipe_yield_servings == null) {
      return scaleMealNutrition(document.totals, consumedServings);
    }
    // Totals exist but no safe per-serving basis — do not invent.
    return null;
  }

  return null;
}

// ============================================================================
// Snapshot helpers (defensive clones — source document is never mutated)
// ============================================================================

function cloneMacros(macros: CanonicalMacros): CanonicalMacros {
  const out: CanonicalMacros = {
    protein_g: macros.protein_g,
    carbs_g: macros.carbs_g,
    fat_g: macros.fat_g,
  };
  if (macros.fiber_g !== undefined) out.fiber_g = macros.fiber_g;
  if (macros.added_sugar_g !== undefined) out.added_sugar_g = macros.added_sugar_g;
  return out;
}

function cloneMeasures(
  measures: HouseholdMeasure[] | undefined,
): HouseholdMeasure[] | undefined {
  if (!measures || measures.length === 0) return undefined;
  return measures.map((m) => ({ ...m }));
}

function cloneComponent(c: MealComponent): MealComponent {
  const measures = cloneMeasures(c.measures);
  return {
    ...c,
    macros: cloneMacros(c.macros),
    ...(measures ? { measures } : {}),
  };
}

function cloneSteps(steps: MealStep[] | undefined): MealStep[] | undefined {
  if (!steps || steps.length === 0) return undefined;
  return steps.map((s) => ({ ...s }));
}

function emptyNutrition(): MealNutrition {
  return { calories: null, macros: { protein_g: null, carbs_g: null, fat_g: null } };
}

// ============================================================================
// buildGroupedMealIntakePayload
// ============================================================================

export interface BuildGroupedMealPayloadOptions {
  /** Servings actually eaten. Finite > 0. Defaults to 1. */
  consumed_servings?: number;
  /** Optional per-instance note (stored on meal_group.instance_notes). */
  instance_note?: string | null;
}

/**
 * Build the grouped intake payload for a MealDocument WITHOUT writing anything.
 * Pure: the source document is never mutated (components/steps are cloned).
 *
 *   - payload.name      = document title snapshot
 *   - payload.quantity  = consumed servings
 *   - payload.unit      = 'serving'
 *   - payload.calories/macros = scaled top-level nutrition (omitted when the
 *       document's nutrition is needs-review / unknown — never invented)
 *   - payload.meal_group = the canonical LoggedMealGroup snapshot (components,
 *       steps, source pointers, consumed_servings, detached_from_source=false)
 */
export function buildGroupedMealIntakePayload(
  document: MealDocument,
  options?: BuildGroupedMealPayloadOptions,
): GroupedMealEntryPayload {
  const consumed = isPositiveNumber(options?.consumed_servings)
    ? (options!.consumed_servings as number)
    : 1;

  const consumedNutrition = scaleTopLevelMealNutrition(document, consumed);
  const components = document.components.map(cloneComponent);
  const steps = cloneSteps(document.steps);

  const documentReviewFlagged =
    document.review_state === 'needs_review' ||
    document.components.some((c) => c.needs_review);

  const group: LoggedMealGroup = {
    schema_version: MEAL_SCHEMA_VERSION,
    name: document.title,
    source_meal_document_id: document.id ?? null,
    source_imported_meal_id: document.source.source_imported_meal_id ?? null,
    source_planned_meal_id: document.source.source_planned_meal_id ?? null,
    source_template_id: document.source.source_template_id ?? null,
    components,
    ...(steps ? { steps } : {}),
    totals: consumedNutrition ?? emptyNutrition(),
    planned_servings: document.recipe_yield_servings ?? null,
    consumed_servings: consumed,
    detached_from_source: false,
    instance_notes: options?.instance_note ?? null,
    // Flag review when the source is review-flagged OR no safe top-level
    // nutrition could be derived (unknown nutrition is surfaced, not invented).
    needs_review: documentReviewFlagged || consumedNutrition == null,
  };

  const payload: GroupedMealEntryPayload = {
    name: document.title,
    quantity: consumed,
    unit: 'serving',
    meal_group: group,
  };

  if (consumedNutrition) {
    if (consumedNutrition.calories != null) payload.calories = consumedNutrition.calories;
    const journalMacros = macrosToJournal(consumedNutrition.macros);
    if (Object.keys(journalMacros).length > 0) payload.macros = journalMacros;
  }

  if (group.source_planned_meal_id) {
    payload.source_planned_meal_id = group.source_planned_meal_id;
  }

  return payload;
}

// ============================================================================
// logMealDocumentForPerson — the write path
// ============================================================================

/**
 * Log a person's MealDocument as EXACTLY ONE grouped journal intake entry.
 *
 * Person scope: the document is loaded with `getMealDocumentForPerson(personId,
 * id)` (404 for non-owners/missing) and the journal entry is created with the
 * SAME personId. The source document is never mutated.
 *
 * Exactly-one guarantee: this function issues a SINGLE `createEntry` call. No
 * per-component / per-ingredient rows are ever created.
 *
 * @throws GroupedMealLogValidationError when the input is invalid.
 * @throws MealDocumentNotFoundError      when the document is not owned by personId.
 */
export async function logMealDocumentForPerson(
  personId: string,
  mealDocumentId: string,
  input?: GroupedMealLogInput,
): Promise<JournalEntry> {
  const validated = validateGroupedMealLogInput(input);
  if (!validated.ok) throw new GroupedMealLogValidationError(validated.errors);
  const { consumed_servings, occurredAt, note } = validated.value;

  const document = await getMealDocumentForPerson(personId, mealDocumentId);
  if (!document) throw new MealDocumentNotFoundError(mealDocumentId);

  const payload = buildGroupedMealIntakePayload(document, {
    consumed_servings,
    instance_note: note,
  });

  return createEntry({
    personId,
    entryType: 'intake',
    occurredAt,
    payload: payload as JournalEntryPayload,
  });
}
