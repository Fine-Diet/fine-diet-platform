/**
 * Import → Meals & Recipes library handoff helpers.
 *
 * Staging `imported_meals` rows are not library truth. A successful import
 * product flow must promote through from-import and require a returned
 * meal_document.id before claiming success or navigating away.
 */

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type { ImportedMeal, ImportedMealDraftIngredient } from '@/lib/plans/types';

export type FromImportYieldBody = {
  yield: {
    servings: number;
    yield_label?: string | null;
    serving_label?: string | null;
  };
};

export type FromImportRequestBody = FromImportYieldBody | Record<string, never>;

/** Build POST body for /api/journal/meals/documents/from-import/:id */
export function buildFromImportRequestBody(args: {
  servings: number | null | undefined;
  yield_label?: string | null;
  serving_label?: string | null;
}): FromImportRequestBody {
  const servings = args.servings;
  if (typeof servings === 'number' && Number.isFinite(servings) && servings > 0) {
    return {
      yield: {
        servings,
        yield_label: args.yield_label ?? null,
        serving_label: args.serving_label ?? null,
      },
    };
  }
  return {};
}

export function primaryImportLibrarySaveLabel(args: {
  hasExplicitServings: boolean;
  isRecipeLike: boolean;
}): string {
  if (args.hasExplicitServings) return 'Confirm and save recipe';
  return args.isRecipeLike ? 'Save to Meals & Recipes' : 'Save to Meals & Recipes';
}

/**
 * Require a durable meal_document.id from the from-import response.
 * Never treat HTTP 201 alone as success.
 */
export function requireMealDocumentIdFromImportResponse(body: unknown): string {
  if (!body || typeof body !== 'object') {
    throw new Error('Library save did not return a meal document.');
  }
  const doc = (body as { meal_document?: unknown }).meal_document;
  if (!doc || typeof doc !== 'object') {
    throw new Error('Library save did not return a meal document.');
  }
  const id = (doc as { id?: unknown }).id;
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Library save did not return a meal document id.');
  }
  return id;
}

/** Canonical post-save destination in Meals & Recipes. */
export function buildMealLibraryHandoffHref(mealDocumentId: string): string {
  const params = new URLSearchParams({ document: mealDocumentId });
  return `${APP_ROUTES.foodMeals}?${params.toString()}`;
}

export function selectStagedImportsNeedingLibrarySave(args: {
  imports: ImportedMeal[];
  linkedImportedMealIds: Iterable<string>;
}): ImportedMeal[] {
  const linked = new Set(args.linkedImportedMealIds);
  return args.imports
    .filter((row) => {
      if (linked.has(row.id)) return false;
      return row.parse_status === 'parsed' || row.parse_status === 'manual_review';
    })
    .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
}

export type RawInputDivergence = {
  diverged: boolean;
  message: string | null;
};

/**
 * Visible warning when structured ingredients diverge materially from the
 * preserved raw paste. Does not mutate either side.
 */
export function detectImportRawIngredientDivergence(args: {
  raw_input_text: string | null | undefined;
  ingredients: ImportedMealDraftIngredient[];
}): RawInputDivergence {
  const raw = (args.raw_input_text ?? '').trim();
  if (!raw) return { diverged: false, message: null };

  const ingredients = args.ingredients ?? [];
  const rawLower = raw.toLowerCase();

  if (ingredients.length === 0) {
    const rawLines = raw
      .split(/\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (rawLines.length >= 2) {
      return {
        diverged: true,
        message:
          'The original paste still has ingredient lines, but none are in the structured draft. Review before saving to Meals & Recipes.',
      };
    }
    return { diverged: false, message: null };
  }

  const unmatched = ingredients.filter((ing) => {
    const needle = (ing.raw_text || ing.normalized_name || '').trim().toLowerCase();
    if (needle.length < 3) return false;
    const probe = needle.slice(0, Math.min(needle.length, 32));
    return !rawLower.includes(probe);
  });

  const unmatchedRatio = unmatched.length / ingredients.length;
  if (unmatched.length >= 2 && unmatchedRatio >= 0.3) {
    return {
      diverged: true,
      message:
        'Some edited ingredients no longer match the preserved original paste. Raw input was kept — review before saving so unrelated lines are not swapped or dropped.',
    };
  }

  return { diverged: false, message: null };
}
