import {
  runAITask,
  type RunAITaskContext,
} from '@/lib/ai/runtime/aiRuntimeServerService';
import type { AIResolvedRoute } from '@/lib/ai/runtime/types';
import { SocialImportExtractionPayloadSchema } from './schemas';
import { classifyContentFromText } from './classifier';
import { prepareEvidenceForExtraction } from './evidencePreparation';
import {
  SOCIAL_IMPORT_VERSION,
  type SocialImportContentType,
  type SocialImportEvidenceSource,
  type SocialImportExtractionPayload,
  type SocialImportPlatform,
  type SocialImportReviewItem,
} from './types';

export interface RunSocialExtractionResult {
  payload: SocialImportExtractionPayload;
  provider: string;
  model: string | null;
  warnings: string[];
  fallback_used: boolean;
}

interface SocialExtractionInput {
  platform: SocialImportPlatform;
  source_url: string | null;
  evidence_text: string;
  source_ids: string[];
}

type SocialExtractionRunOutput =
  | { kind: 'ai'; value: unknown }
  | { kind: 'deterministic'; value: SocialImportExtractionPayload };

type SocialExtractionFailureKind =
  | 'provider_timeout'
  | 'extraction_too_large'
  | 'provider_invalid_json'
  | 'model_unavailable'
  | 'extraction_validation_failed'
  | 'insufficient_evidence';

interface SocialExtractionFailure {
  kind: SocialExtractionFailureKind;
  message: string;
  warning: string;
  retryable: boolean;
}

export async function runSocialEvidenceExtraction(args: {
  ctx: RunAITaskContext;
  platform: SocialImportPlatform;
  sourceUrl: string | null;
  evidenceSources: SocialImportEvidenceSource[];
  preexistingReviewItems: SocialImportReviewItem[];
}): Promise<RunSocialExtractionResult> {
  const prepared = prepareEvidenceForExtraction(args.evidenceSources);
  const sourceIds = args.evidenceSources.map((source) => source.id);
  const deterministic = buildDeterministicExtraction({
    platform: args.platform,
    evidenceText: prepared.evidence_text,
    evidenceSources: args.evidenceSources,
    reviewItems: args.preexistingReviewItems,
  });

  if (!hasDraftableNarrativeEvidence(args.evidenceSources)) {
    return {
      payload: {
        ...deterministic,
        warnings: [],
      },
      provider: 'not_run',
      model: null,
      warnings: [],
      fallback_used: false,
    };
  }

  const input: SocialExtractionInput = {
    platform: args.platform,
    source_url: args.sourceUrl,
    evidence_text: prepared.evidence_text,
    source_ids: sourceIds,
  };

  const firstOutcome = await runSocialExtractionTask({
    input,
    ctx: args.ctx,
    deterministic,
  });
  const firstFailure = classifyRuntimeFailure(firstOutcome.errors);
  const shouldRetry =
    firstOutcome.output.kind === 'deterministic' &&
    firstOutcome.fallback_used &&
    Boolean(firstFailure?.retryable);
  const outcome = shouldRetry
    ? await runSocialExtractionTask({
        input,
        ctx: args.ctx,
        deterministic,
      })
    : firstOutcome;
  const runtimeFailure =
    outcome.output.kind === 'deterministic'
      ? classifyRuntimeFailure([...firstOutcome.errors, ...outcome.errors]) ??
        classifyDeterministicFallback(outcome)
      : null;

  if (outcome.output.kind === 'ai') {
    const parsed = SocialImportExtractionPayloadSchema.safeParse(
      normalizeAiValue(outcome.output.value),
    );
    if (parsed.success) {
      if (!allEvidenceRefsKnown(parsed.data, sourceIds)) {
        const failure: SocialExtractionFailure = {
          kind: 'extraction_validation_failed',
          message:
            'Recipe evidence was captured, but extraction output referenced unknown evidence sources. Try rerun extraction or add corrected assisted text.',
          warning:
            'AI extraction referenced unknown evidence source ids; deterministic fallback preserved evidence without inventing recipe facts.',
          retryable: false,
        };
        return {
          payload: withFailureReview(deterministic, deterministic, failure),
          provider: outcome.route.provider_key,
          model: outcome.route.model_key,
          warnings: withFailureWarning([], failure),
          fallback_used: true,
        };
      }
      const payloadWithConflictReviews = addDetectedConflictReviews(
        parsed.data,
        args.evidenceSources,
      );
      if (!draftableClaimsHaveSupportingEvidence(payloadWithConflictReviews, args.evidenceSources)) {
        const failure: SocialExtractionFailure = {
          kind: 'insufficient_evidence',
          message:
            'The model output relied only on hints or metadata for recipe claims. Add caption, transcript, or visible recipe text before creating a draft.',
          warning:
            'AI extraction relied only on user hints or metadata for draftable recipe claims; deterministic fallback preserved evidence without inventing recipe facts.',
          retryable: false,
        };
        return {
          payload: withFailureReview(deterministic, deterministic, failure),
          provider: outcome.route.provider_key,
          model: outcome.route.model_key,
          warnings: withFailureWarning([], failure),
          fallback_used: true,
        };
      }
      return {
        payload: payloadWithConflictReviews,
        provider: outcome.route.provider_key,
        model: outcome.route.model_key,
        warnings: payloadWithConflictReviews.warnings,
        fallback_used: outcome.fallback_used,
      };
    }
    const failure: SocialExtractionFailure = {
      kind: 'extraction_validation_failed',
      message:
        'Recipe evidence was captured, but the extraction output did not match the recipe schema. Try rerun extraction or add corrected assisted text.',
      warning:
        'AI extraction failed validation; deterministic fallback preserved evidence without inventing recipe facts.',
      retryable: false,
    };
    return {
      payload: withFailureReview(deterministic, deterministic, failure),
      provider: outcome.route.provider_key,
      model: outcome.route.model_key,
      warnings: withFailureWarning([], failure),
      fallback_used: true,
    };
  }

  return {
    payload: runtimeFailure
      ? withFailureReview(outcome.output.value, deterministic, runtimeFailure)
      : outcome.output.value,
    provider: outcome.route.provider_key,
    model: outcome.route.model_key,
    warnings: runtimeFailure
      ? withFailureWarning(outcome.output.value.warnings, runtimeFailure)
      : outcome.output.value.warnings,
    fallback_used: outcome.fallback_used,
  };
}

async function runSocialExtractionTask(args: {
  input: SocialExtractionInput;
  ctx: RunAITaskContext;
  deterministic: SocialImportExtractionPayload;
}) {
  return await runAITask<SocialExtractionInput, SocialExtractionRunOutput>({
    taskType: 'social_video_recipe_extract',
    input: args.input,
    ctx: args.ctx,
    execute: async (route: AIResolvedRoute) => {
      if (route.provider_key === 'stub') {
        return { kind: 'deterministic', value: args.deterministic };
      }
      throw new Error(
        `socialEvidenceExtraction: no execute branch for provider '${route.provider_key}'`,
      );
    },
    deterministicFallback: async () => ({
      kind: 'deterministic',
      value: args.deterministic,
    }),
  });
}

const MIN_DRAFTABLE_NARRATIVE_CHARS = 20;

export function hasDraftableNarrativeEvidence(
  sources: SocialImportEvidenceSource[],
): boolean {
  return sources.some((source) => {
    if (
      source.source_kind === 'metadata' ||
      source.source_kind === 'user_hint' ||
      source.quality !== 'strong'
    ) {
      return false;
    }
    const text = (source.normalized_text ?? source.raw_text ?? '').trim();
    return text.length >= MIN_DRAFTABLE_NARRATIVE_CHARS;
  });
}

function normalizeAiValue(value: unknown): unknown {
  const unwrapped =
    value && typeof value === 'object'
      ? (() => {
          const maybe = value as { kind?: string; value?: unknown };
          return maybe.kind === 'ai' && typeof maybe.value !== 'undefined'
            ? maybe.value
            : value;
        })()
      : value;
  if (!unwrapped || typeof unwrapped !== 'object') return unwrapped;

  const payload = unwrapped as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    ...payload,
    review_items: Array.isArray(payload.review_items) ? payload.review_items : [],
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    meal_plan_items: Array.isArray(payload.meal_plan_items) ? payload.meal_plan_items : [],
  };

  if (Array.isArray(payload.recipes)) {
    normalized.recipes = payload.recipes.map((recipe) => {
      if (!recipe || typeof recipe !== 'object') return recipe;
      const rec = recipe as Record<string, unknown>;
      return {
        ...rec,
        review_items: Array.isArray(rec.review_items) ? rec.review_items : [],
        servings: normalizeExtractedField(rec.servings),
        title: normalizeExtractedField(rec.title),
        description: normalizeExtractedField(rec.description),
      };
    });
  }

  normalized.title = normalizeExtractedField(normalized.title);
  return normalized;
}

function normalizeExtractedField(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const field = value as Record<string, unknown>;
  return {
    ...field,
    confidence: normalizeConfidence(field.confidence),
    evidence_refs: Array.isArray(field.evidence_refs) ? field.evidence_refs : [],
  };
}

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}

function buildDeterministicExtraction(args: {
  platform: SocialImportPlatform;
  evidenceText: string;
  evidenceSources: SocialImportEvidenceSource[];
  reviewItems: SocialImportReviewItem[];
}): SocialImportExtractionPayload {
  const contentType: SocialImportContentType = classifyContentFromText(args.evidenceText);
  const firstStrong = args.evidenceSources.find(
    (source) => source.quality === 'strong' && source.normalized_text,
  );
  const ref = firstStrong
    ? [
        {
          evidence_source_id: firstStrong.id,
          quote: excerpt(firstStrong.normalized_text ?? firstStrong.raw_text ?? ''),
        },
      ]
    : [];
  const review_items: SocialImportReviewItem[] =
    args.reviewItems.length > 0
      ? args.reviewItems
      : [
          {
            code: 'insufficient_evidence',
            severity: 'blocker',
            message:
              'A narrative extraction model is required to recover recipe details from this social evidence. No model output was available.',
            evidence_refs: ref,
          },
        ];

  return {
    version: SOCIAL_IMPORT_VERSION,
    content_type:
      contentType === 'single_recipe' && args.platform !== 'unknown'
        ? 'unknown_or_insufficient'
        : contentType,
    title: {
      value: null,
      confidence: 'low',
      evidence_refs: ref,
    },
    summary: null,
    recipes: [],
    meal_plan_items: [],
    review_items,
    warnings: [
      'Deterministic fallback used. No recipe facts were invented from narrative evidence.',
    ],
  };
}

function classifyRuntimeFailure(errors: string[]): SocialExtractionFailure | null {
  const joined = errors.join('\n').toLowerCase();
  if (!joined) return null;
  if (joined.includes('timed out') || joined.includes('abort')) {
    return {
      kind: 'provider_timeout',
      message:
        'Recipe evidence was captured, but the extraction model timed out. Try rerun extraction; the saved evidence will be reused.',
      warning: 'AI extraction timed out after evidence capture; deterministic fallback preserved evidence without inventing recipe facts.',
      retryable: true,
    };
  }
  if (
    joined.includes('max_tokens') ||
    joined.includes('finish_reason') ||
    joined.includes('response exceeded')
  ) {
    return {
      kind: 'extraction_too_large',
      message:
        'Recipe evidence was captured, but the extraction response was too large to complete. Try rerun extraction; if it repeats, add a shorter corrected caption or transcript.',
      warning: 'AI extraction exceeded the output budget; deterministic fallback preserved evidence without inventing recipe facts.',
      retryable: true,
    };
  }
  if (joined.includes('valid json') || joined.includes('invalid json')) {
    return {
      kind: 'provider_invalid_json',
      message:
        'Recipe evidence was captured, but the extraction model returned an unreadable response. Try rerun extraction; the saved evidence will be reused.',
      warning: 'AI extraction returned invalid JSON; deterministic fallback preserved evidence without inventing recipe facts.',
      retryable: true,
    };
  }
  if (
    joined.includes('no execute branch') ||
    joined.includes('no routable ai config') ||
    joined.includes('no deterministic fallback')
  ) {
    return {
      kind: 'model_unavailable',
      message:
        'Recipe evidence was captured, but the narrative extraction model is unavailable in this environment. Add assisted text or try again after model access is restored.',
      warning: 'AI extraction model was unavailable; deterministic fallback preserved evidence without inventing recipe facts.',
      retryable: false,
    };
  }
  return null;
}

function classifyDeterministicFallback(outcome: {
  route: AIResolvedRoute;
  fallback_used: boolean;
}): SocialExtractionFailure | null {
  if (!outcome.fallback_used) return null;
  if (
    outcome.route.provider_key === 'deterministic' ||
    outcome.route.provider_key === 'stub'
  ) {
    return {
      kind: 'model_unavailable',
      message:
        'Recipe evidence was captured, but no narrative extraction model output was available. Add assisted text or try rerun extraction after model access is restored.',
      warning: 'Deterministic fallback used because no model output was available.',
      retryable: false,
    };
  }
  return null;
}

function withFailureReview(
  payload: SocialImportExtractionPayload,
  deterministic: SocialImportExtractionPayload,
  failure: SocialExtractionFailure,
): SocialImportExtractionPayload {
  const review: SocialImportReviewItem = {
    code: failure.kind,
    severity: 'blocker',
    message: failure.message,
    evidence_refs: deterministic.title.evidence_refs,
  };
  return {
    ...payload,
    review_items: mergeReviewItems(
      payload.review_items.filter(
        (item) =>
          !(
            item.code === 'insufficient_evidence' &&
            item.message.includes('No model output was available')
          ),
      ),
      [review],
    ),
    warnings: withFailureWarning(payload.warnings, failure),
  };
}

function withFailureWarning(
  warnings: string[],
  failure: SocialExtractionFailure,
): string[] {
  return Array.from(new Set([...warnings, failure.warning]));
}

function allEvidenceRefsKnown(
  payload: SocialImportExtractionPayload,
  sourceIds: string[],
): boolean {
  const known = new Set(sourceIds);
  const refs = [
    ...payload.title.evidence_refs,
    ...payload.review_items.flatMap((item) => item.evidence_refs),
    ...payload.recipes.flatMap((recipe) => [
      ...recipe.title.evidence_refs,
      ...recipe.description.evidence_refs,
      ...recipe.servings.evidence_refs,
      ...recipe.review_items.flatMap((item) => item.evidence_refs),
      ...recipe.ingredients.flatMap((ingredient) => ingredient.evidence_refs),
      ...recipe.steps.flatMap((step) => step.evidence_refs),
    ]),
    ...payload.meal_plan_items.flatMap((item) => item.evidence_refs),
  ];
  return refs.every((ref) => known.has(ref.evidence_source_id));
}

function draftableClaimsHaveSupportingEvidence(
  payload: SocialImportExtractionPayload,
  sources: SocialImportEvidenceSource[],
): boolean {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const draftableRefs = payload.recipes.flatMap((recipe) => [
    ...recipe.ingredients.flatMap((ingredient) => ingredient.evidence_refs),
    ...recipe.steps.flatMap((step) => step.evidence_refs),
    ...recipe.servings.evidence_refs,
  ]);
  if (draftableRefs.length === 0) return true;
  return draftableRefs.every((ref) => {
    const source = sourceById.get(ref.evidence_source_id);
    if (!source) return false;
    return (
      source.source_kind !== 'user_hint' &&
      source.source_kind !== 'metadata' &&
      source.quality !== 'unavailable'
    );
  });
}

function addDetectedConflictReviews(
  payload: SocialImportExtractionPayload,
  sources: SocialImportEvidenceSource[],
): SocialImportExtractionPayload {
  const conflictItems: SocialImportReviewItem[] = [];
  for (const recipe of payload.recipes) {
    for (const ingredient of recipe.ingredients) {
      const conflicts = detectQuantityConflictsForIngredient(ingredient.name, sources);
      if (conflicts.length < 2) continue;
      conflictItems.push({
        code: 'conflicting_evidence',
        severity: 'warning',
        message: `Conflicting quantities were found for ${ingredient.name}; review the source evidence before trusting this draft.`,
        evidence_refs: conflicts,
      });
    }
  }

  if (conflictItems.length === 0) return payload;
  return {
    ...payload,
    review_items: mergeReviewItems(payload.review_items, conflictItems),
    recipes: payload.recipes.map((recipe) => ({
      ...recipe,
      review_items: mergeReviewItems(recipe.review_items, conflictItems),
    })),
  };
}

function detectQuantityConflictsForIngredient(
  ingredientName: string,
  sources: SocialImportEvidenceSource[],
): SocialImportReviewItem['evidence_refs'] {
  const ingredientTokens = ingredientName
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z0-9]/g, ''))
    .filter((part) => part.length > 2);
  if (ingredientTokens.length === 0) return [];

  const matches: Array<{
    key: string;
    evidence_source_id: string;
    quote: string;
  }> = [];

  for (const source of sources) {
    if (source.source_kind === 'metadata' || source.source_kind === 'user_hint') continue;
    const text = source.normalized_text ?? source.raw_text ?? '';
    const sentences = text.split(/(?<=[.!?\n])\s+/);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if (!ingredientTokens.every((token) => lower.includes(token))) continue;
      const quantity = extractQuantityKey(lower);
      if (!quantity) continue;
      matches.push({
        key: quantity,
        evidence_source_id: source.id,
        quote: excerpt(sentence) ?? sentence.trim(),
      });
    }
  }

  const distinct = new Set(matches.map((match) => match.key));
  if (distinct.size < 2) return [];
  return matches
    .filter(
      (match, idx, arr) =>
        arr.findIndex(
          (candidate) =>
            candidate.key === match.key &&
            candidate.evidence_source_id === match.evidence_source_id,
        ) === idx,
    )
    .slice(0, 6)
    .map((match) => ({
      evidence_source_id: match.evidence_source_id,
      quote: match.quote,
    }));
}

function extractQuantityKey(text: string): string | null {
  const match = text.match(
    /\b(\d+(?:\.\d+)?|\d+\/\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(tablespoons?|tbsp|teaspoons?|tsp|cups?|ounces?|oz|grams?|g|pounds?|lb|lbs)\b/,
  );
  if (!match) return null;
  return `${normalizeNumberWord(match[1])}:${normalizeUnit(match[2])}`;
}

function normalizeNumberWord(value: string): string {
  const words: Record<string, string> = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
  };
  return words[value] ?? value;
}

function normalizeUnit(unit: string): string {
  if (unit === 'tablespoon' || unit === 'tablespoons') return 'tbsp';
  if (unit === 'teaspoon' || unit === 'teaspoons') return 'tsp';
  if (unit === 'cup' || unit === 'cups') return 'cup';
  if (unit === 'ounce' || unit === 'ounces' || unit === 'oz') return 'oz';
  if (unit === 'gram' || unit === 'grams') return 'g';
  if (unit === 'pound' || unit === 'pounds' || unit === 'lb' || unit === 'lbs')
    return 'lb';
  return unit;
}

function mergeReviewItems(
  existing: SocialImportReviewItem[],
  additions: SocialImportReviewItem[],
): SocialImportReviewItem[] {
  const seen = new Set<string>();
  const merged: SocialImportReviewItem[] = [];
  for (const item of [...existing, ...additions]) {
    const key = `${item.code}:${item.severity}:${item.message.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function excerpt(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > 240 ? `${cleaned.slice(0, 240)}...` : cleaned;
}
