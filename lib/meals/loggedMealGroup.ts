/**
 * Meal Object Foundation — Packet 9: Grouped Log Rendering helpers
 *
 * Defensive read-only helpers for detecting and projecting grouped meal log
 * entries (journal_entries intake rows whose payload carries `meal_group`).
 *
 * Product rule: a grouped meal log entry is still `entry_type = 'intake'`. The
 * presence of a non-null object `payload.meal_group` is what makes it render as
 * a grouped meal card instead of a flat food row. Flat intake entries (no
 * `meal_group`) are untouched and continue to render via LoggedItemCard.
 *
 * SCOPE / SAFETY (P9 is rendering-only):
 *   - PURE. No I/O, no DB, no network, no mutation of the source entry/payload.
 *   - Maximally defensive: every accessor tolerates malformed/partial payloads
 *     so a bad `meal_group` degrades gracefully (top-level row still renders)
 *     rather than crashing the log page.
 *   - Does NOT change the grouped write path, daily totals, Meal Library, or
 *     branded food search.
 *
 * Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§3.4 logged meal
 * instance) + lib/meals/types.ts (LoggedMealGroup / GroupedMealEntryPayload).
 */

import type {
  GroupedMealEntryPayload,
  LoggedMealGroup,
  MealComponent,
} from './types';

// ============================================================================
// Type guards
// ============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * True when a payload carries a usable `meal_group` (a non-null object, not an
 * array). Intentionally permissive about the group's INNER shape — projection
 * (below) handles partial/malformed groups field-by-field so rendering never
 * crashes. Narrows the payload so callers can read `meal_group` safely.
 */
export function hasMealGroupPayload(
  payload: unknown,
): payload is GroupedMealEntryPayload & { meal_group: LoggedMealGroup } {
  if (!isPlainObject(payload)) return false;
  return isPlainObject((payload as { meal_group?: unknown }).meal_group);
}

/**
 * True when an entry should render as a grouped meal card:
 *   - entry_type must be 'intake'
 *   - payload must carry a non-null object `meal_group`
 * Defensive against null/malformed entries (returns false, never throws).
 */
export function isGroupedMealEntry(
  entry: unknown,
): entry is { type: 'intake'; payload: GroupedMealEntryPayload & { meal_group: LoggedMealGroup } } {
  if (!isPlainObject(entry)) return false;
  if ((entry as { type?: unknown }).type !== 'intake') return false;
  return hasMealGroupPayload((entry as { payload?: unknown }).payload);
}

// ============================================================================
// View model — a safe, render-ready projection of a grouped meal entry
// ============================================================================

/** Read-only projection of one grouped meal component for display. */
export interface GroupedMealComponentView {
  key: string;
  /** Display name with raw/normalized fallback; never empty. */
  name: string;
  /** Amount string (e.g. "1 cup"), or null when unknown. */
  amount: string | null;
  /** Preparation note, or null. */
  prepNote: string | null;
  /** Component calories, or null when unknown. */
  calories: number | null;
  /** Match/grounding status when meaningful for the user. */
  matchStatus: 'matched' | 'partial' | 'guessed' | 'none' | null;
  /** Whether this component is flagged for review. */
  needsReview: boolean;
}

/** Read-only projection of one instruction step for display. */
export interface GroupedMealStepView {
  stepNumber: number;
  instruction: string;
}

/** Macros block in the journal's display spelling (already-consumed totals). */
export interface GroupedMealMacrosView {
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

/** Fully-projected, render-ready grouped meal view. Never throws to build. */
export interface GroupedMealView {
  /** Meal display name; never empty. */
  name: string;
  /** Servings actually consumed, or null when unknown. */
  consumedServings: number | null;
  /** Display unit for the servings line (defaults to 'serving'). */
  unit: string;
  /** Top-level consumed calories (drives the card display), or null. */
  calories: number | null;
  /** Top-level consumed macros (display spelling), or null when all unknown. */
  macros: GroupedMealMacrosView | null;
  /** True when the logged instance is flagged for review. */
  needsReview: boolean;
  /** Short provenance label (e.g. "Imported", "Planned meal"), or null. */
  sourceLabel: string | null;
  /** Snapshot components, defensively projected. */
  components: GroupedMealComponentView[];
  /** Snapshot instruction steps, sorted by step number. */
  steps: GroupedMealStepView[];
  /** Per-instance note, or null. */
  instanceNotes: string | null;
}

const VALID_MATCH_STATUS = new Set(['matched', 'partial', 'guessed', 'none']);

function projectComponent(raw: unknown, index: number): GroupedMealComponentView {
  const c = isPlainObject(raw) ? (raw as Partial<MealComponent>) : {};

  const name =
    nonEmptyString(c.name) ??
    nonEmptyString(c.raw_text) ??
    nonEmptyString(c.normalized_name) ??
    'Item';

  const qty = isFiniteNumber(c.quantity) ? c.quantity : null;
  const unit = nonEmptyString(c.unit);
  let amount: string | null = null;
  if (qty != null) {
    // Round to at most 2 decimals to avoid float noise from scaling.
    const qtyStr = String(Math.round(qty * 100) / 100);
    amount = unit ? `${qtyStr} ${unit}` : qtyStr;
  } else if (unit) {
    amount = unit;
  }

  const matchStatus =
    typeof c.match_status === 'string' && VALID_MATCH_STATUS.has(c.match_status)
      ? (c.match_status as GroupedMealComponentView['matchStatus'])
      : null;

  const componentKey = nonEmptyString(c.component_id) ?? `component-${index}`;

  return {
    key: componentKey,
    name,
    amount,
    prepNote: nonEmptyString(c.preparation_note),
    calories: isFiniteNumber(c.calories) ? c.calories : null,
    matchStatus,
    needsReview: c.needs_review === true,
  };
}

function projectSteps(raw: unknown): GroupedMealStepView[] {
  if (!Array.isArray(raw)) return [];
  const steps: GroupedMealStepView[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (!isPlainObject(s)) continue;
    const instruction = nonEmptyString(s.instruction);
    if (!instruction) continue;
    const stepNumber = isFiniteNumber(s.step_number) ? s.step_number : i + 1;
    steps.push({ stepNumber, instruction });
  }
  // Stable sort by the (possibly defaulted) step number.
  return steps.sort((a, b) => a.stepNumber - b.stepNumber);
}

/** Derive a short provenance label from the group's source pointers / type. */
function deriveSourceLabel(group: Record<string, unknown>): string | null {
  if (nonEmptyString(group.source_planned_meal_id)) return 'Planned meal';
  if (nonEmptyString(group.source_template_id)) return 'Saved meal';
  if (nonEmptyString(group.source_imported_meal_id)) return 'Imported';
  if (nonEmptyString(group.source_meal_document_id)) return 'Meal';
  return null;
}

/**
 * Build a render-ready view of a grouped meal entry payload. PURE and fully
 * defensive: any malformed/partial field degrades to a safe default so the
 * top-level row always renders. Returns null only when the payload does not
 * carry a `meal_group` at all (caller should then treat it as a flat entry).
 *
 * Top-level nutrition: the grouped write path stores ALREADY-CONSUMED totals on
 * `payload.calories`/`payload.macros` (NOT per-serving), so this view surfaces
 * them as-is and never re-multiplies by servings. Falls back to
 * `meal_group.totals` when the top-level mirror is absent.
 */
export function buildGroupedMealView(payload: unknown): GroupedMealView | null {
  if (!hasMealGroupPayload(payload)) return null;

  const p = payload as unknown as Record<string, unknown>;
  const group = p.meal_group as Record<string, unknown>;

  const name =
    nonEmptyString(p.name) ?? nonEmptyString(group.name) ?? 'Meal';

  const consumedServings = isFiniteNumber(group.consumed_servings)
    ? group.consumed_servings
    : isFiniteNumber(p.quantity)
      ? (p.quantity as number)
      : null;

  const unit = nonEmptyString(p.unit) ?? 'serving';

  // Totals fallback (canonical `_g` spelling) when top-level mirror is absent.
  const totals = isPlainObject(group.totals) ? (group.totals as Record<string, unknown>) : null;
  const totalsMacros =
    totals && isPlainObject(totals.macros) ? (totals.macros as Record<string, unknown>) : null;

  const calories = isFiniteNumber(p.calories)
    ? p.calories
    : totals && isFiniteNumber(totals.calories)
      ? (totals.calories as number)
      : null;

  const topMacros = isPlainObject(p.macros) ? (p.macros as Record<string, unknown>) : null;
  const protein = topMacros && isFiniteNumber(topMacros.protein)
    ? (topMacros.protein as number)
    : totalsMacros && isFiniteNumber(totalsMacros.protein_g)
      ? (totalsMacros.protein_g as number)
      : null;
  const carbs = topMacros && isFiniteNumber(topMacros.carbs)
    ? (topMacros.carbs as number)
    : totalsMacros && isFiniteNumber(totalsMacros.carbs_g)
      ? (totalsMacros.carbs_g as number)
      : null;
  const fat = topMacros && isFiniteNumber(topMacros.fat)
    ? (topMacros.fat as number)
    : totalsMacros && isFiniteNumber(totalsMacros.fat_g)
      ? (totalsMacros.fat_g as number)
      : null;

  const macros =
    protein != null || carbs != null || fat != null
      ? { protein, carbs, fat }
      : null;

  const rawComponents = Array.isArray(group.components) ? group.components : [];
  const components = rawComponents.map((c, i) => projectComponent(c, i));

  return {
    name,
    consumedServings,
    unit,
    calories,
    macros,
    needsReview: group.needs_review === true,
    sourceLabel: deriveSourceLabel(group),
    components,
    steps: projectSteps(group.steps),
    instanceNotes: nonEmptyString(group.instance_notes),
  };
}
