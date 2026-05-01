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

  const input: SocialExtractionInput = {
    platform: args.platform,
    source_url: args.sourceUrl,
    evidence_text: prepared.evidence_text,
    source_ids: sourceIds,
  };

  const outcome = await runAITask<SocialExtractionInput, SocialExtractionRunOutput>({
    taskType: 'social_video_recipe_extract',
    input,
    ctx: args.ctx,
    execute: async (route: AIResolvedRoute) => {
      if (route.provider_key === 'stub') {
        return { kind: 'deterministic', value: deterministic };
      }
      throw new Error(
        `socialEvidenceExtraction: no execute branch for provider '${route.provider_key}'`,
      );
    },
    deterministicFallback: async () => ({ kind: 'deterministic', value: deterministic }),
  });

  if (outcome.output.kind === 'ai') {
    const parsed = SocialImportExtractionPayloadSchema.safeParse(
      normalizeAiValue(outcome.output.value),
    );
    if (parsed.success) {
      if (!allEvidenceRefsKnown(parsed.data, sourceIds)) {
        return {
          payload: {
            ...deterministic,
            warnings: [
              ...deterministic.warnings,
              'AI extraction referenced unknown evidence source ids; deterministic insufficient-evidence payload used.',
            ],
          },
          provider: outcome.route.provider_key,
          model: outcome.route.model_key,
          warnings: [
            'AI extraction referenced unknown evidence source ids; deterministic insufficient-evidence payload used.',
          ],
          fallback_used: true,
        };
      }
      return {
        payload: parsed.data,
        provider: outcome.route.provider_key,
        model: outcome.route.model_key,
        warnings: parsed.data.warnings,
        fallback_used: outcome.fallback_used,
      };
    }
    return {
      payload: {
        ...deterministic,
        warnings: [
          ...deterministic.warnings,
          'AI extraction failed validation; deterministic insufficient-evidence payload used.',
        ],
      },
      provider: outcome.route.provider_key,
      model: outcome.route.model_key,
      warnings: [
        'AI extraction failed validation; deterministic insufficient-evidence payload used.',
      ],
      fallback_used: true,
    };
  }

  return {
    payload: outcome.output.value,
    provider: outcome.route.provider_key,
    model: outcome.route.model_key,
    warnings: outcome.output.value.warnings,
    fallback_used: outcome.fallback_used,
  };
}

function normalizeAiValue(value: unknown): unknown {
  if (value && typeof value === 'object') {
    const maybe = value as { kind?: string; value?: unknown };
    if (maybe.kind === 'ai' && typeof maybe.value !== 'undefined') return maybe.value;
  }
  return value;
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

function excerpt(text: string): string | null {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > 240 ? `${cleaned.slice(0, 240)}...` : cleaned;
}
