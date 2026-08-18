/**
 * Lightweight simple-meal capture → canonical MealDocument draft.
 * Title + named ungrounded components. No yield, steps, or invented nutrition.
 */

import { blankComponent } from '@/lib/meals/composer/componentOps';
import {
  createBlankMealDocument,
  createComposerState,
} from '@/lib/meals/composer/state';
import { buildDocumentForCreate } from '@/lib/meals/composer/submission';
import { validateComposerStateForSubmit } from '@/lib/meals/composer/validate';
import { normalizeMealDocumentContract } from '@/lib/meals/normalizeMealComponentContract';
import { recomputeMealDocumentNutrition } from '@/lib/meals/recompute';
import type { MealDocument, MealTypeHint } from '@/lib/meals/types';
import type { MealSlotKey } from '@/lib/plans/types';
import { mealTypeForSlotKey } from './candidatePolicy';

export function mealTypeHintForSlotKey(slot: MealSlotKey): MealTypeHint {
  const mealType = mealTypeForSlotKey(slot);
  if (mealType === 'other') return 'unknown';
  return mealType;
}

export function parseSimpleMealParts(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\s*(?:\+|,(?!\d))\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [trimmed];
}

export function buildSimpleMealDocument(args: {
  title: string;
  componentNames?: string[];
  slotKey: MealSlotKey;
}): { ok: true; document: MealDocument } | { ok: false; error: string } {
  const title = args.title.trim();
  const names = (args.componentNames && args.componentNames.length > 0
    ? args.componentNames
    : parseSimpleMealParts(title)
  )
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const hint = mealTypeHintForSlotKey(args.slotKey);
  const draft = normalizeMealDocumentContract({
    ...createBlankMealDocument(),
    title,
    kind: 'meal',
    meal_type_hint: hint === 'unknown' ? null : hint,
    intents: hint === 'unknown' ? [] : [hint],
    components: names.map((name, index) => blankComponent(`simple-${index + 1}`, name)),
    source: { source_type: 'manual' },
    nds: null,
    yield: null,
    recipe_yield_servings: null,
  });
  const recomputed = recomputeMealDocumentNutrition(draft).document;
  const state = createComposerState('create', recomputed);
  const validation = validateComposerStateForSubmit(state);
  if (!validation.ok) {
    return { ok: false, error: validation.errors[0] ?? 'Add a meal name and at least one item.' };
  }
  return { ok: true, document: buildDocumentForCreate(state) };
}
